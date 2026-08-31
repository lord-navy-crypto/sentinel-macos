// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.5 Local AI — explicit, read-only WebLLM assistant over Sentinel evidence.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Local AI.');
  const {$, state, api, esc, question, registerLens, activity, notice} = S;

  const AI_MARKER = 'Sentinel 2.5 WebLLM Local AI';
  const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.82';
  const DEFAULT_MODEL = 'Qwen3-0.6B-q4f16_1-MLC';
  const MODELS = [
    {id:'Qwen3-0.6B-q4f16_1-MLC', label:'Qwen3 0.6B · light', note:'Recommended first model for 8 GB Macs.'},
    {id:'Llama-3.2-1B-Instruct-q4f16_1-MLC', label:'Llama 3.2 1B · balanced', note:'Small general-purpose alternative.'},
    {id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label:'Qwen 2.5 1.5B · larger', note:'More capable but uses more unified memory.'},
  ];

  const ai = {
    module:null,
    worker:null,
    engine:null,
    loading:false,
    generating:false,
    model:localStorage.getItem('sentinel.ai.model') || DEFAULT_MODEL,
    progress:0,
    progressText:'Model not loaded.',
    conversation:[],
    lastPacket:null,
  };

  const SYSTEM_PROMPT = `You are Sentinel Local Evidence Assistant. You run locally in the user's browser/WebView. Use only the Sentinel evidence packet and the user's question. Always separate: OBSERVED, INTERPRETATION, UNKNOWN, NEXT STEP. Never turn Attention, Risk, Confidence, Drift, startup presence, public network access, or novelty into malware probability. If evidence is insufficient, say so. Never invent paths, PIDs, hashes, signatures, endpoints, timestamps, causes, or intent. You may explain terminal commands, but do not execute them and do not claim they were run. Prefer read-only inspection commands; file changes must remain in Sentinel Safe Change. Keep answers concise and practical.`;

  function supportsLocalAI(){
    return Boolean(window.Worker && window.indexedDB && navigator.gpu);
  }

  function statusLabel(){
    if (!supportsLocalAI()) return 'Unavailable · WebGPU not exposed';
    if (ai.generating) return 'Generating locally…';
    if (ai.loading) return 'Loading model…';
    if (ai.engine) return 'Ready · local WebGPU';
    return 'Available · model not loaded';
  }

  function currentModel(){return MODELS.find(x=>x.id===ai.model) || MODELS[0];}

  function trimJSON(value, limit=9000){
    let text='';
    try{text=JSON.stringify(value,null,2);}catch{text=String(value ?? '');}
    return text.length>limit ? text.slice(0,limit)+'\n…[truncated by Sentinel before Local AI]' : text;
  }

  async function safeRead(url){
    try{return await api(url);}catch(error){return {unavailable:true,error:error?.message||String(error)};}
  }

  async function collectEvidencePacket(){
    const lens = state.lens || 'status';
    const packet = {
      generated_at:new Date().toISOString(),
      lens,
      boundary:'Sentinel evidence only. Missing data must remain unknown.',
      coverage:await safeRead('/api/coverage'),
      evidence:{},
    };
    const reads = {
      status:[['overview','/api/overview'],['readiness','/api/readiness']],
      snapshot:[['quick_check','/api/quick-check'],['review_queue','/api/review-queue']],
      cases:[['cases','/api/incidents/v2?history=1']],
      search:[['review_queue','/api/review-queue']],
      relations:[['graph','/api/intelligence/graph/v2'],['timeline','/api/intelligence/timeline/grouped']],
      audit:[['audit','/api/security/audit']],
      changes:[['changes','/api/changes/events'],['history','/api/changes/history']],
      behavior:[['behavior_history','/api/behavior/history'],['behavior_health','/api/behavior/health']],
      reference:[['reference_status','/api/trust/status'],['reference_history','/api/trust/history']],
      machine:[['system_profile','/api/system-profile']],
      processes:[['processes','/api/processes']],
      startup:[['startup','/api/startup'],['launch_services','/api/launch-services']],
      persistence:[['persistence','/api/persistence']],
      background:[['background','/api/background']],
      network:[['network','/api/network'],['network_history','/api/network/history']],
      storage:[['storage_aging','/api/storage/aging']],
      reclaim:[['cleanup_preview','/api/cleanup/preview']],
      change:[['action_status','/api/actions/status'],['action_health','/api/actions/health']],
      visibility:[['capabilities','/api/capabilities'],['visibility','/api/visibility']],
    };
    const jobs = reads[lens] || reads.status;
    await Promise.all(jobs.map(async ([name,url])=>{packet.evidence[name]=await safeRead(url);}));
    const stage = $('#evidenceStage');
    const visible = stage?.innerText?.trim().replace(/\n{3,}/g,'\n\n') || '';
    packet.visible_ui_excerpt = visible.slice(0,5000);
    ai.lastPacket = packet;
    return packet;
  }

  function renderMessages(){
    const log=$('#aiChatLog');
    if(!log)return;
    if(!ai.conversation.length){
      log.innerHTML='<div class="ai-message"><span>LOCAL ASSISTANT</span><pre>Load a model, then ask about the current Sentinel page. The assistant receives a bounded evidence packet, not unrestricted access to your Mac.</pre></div>';
      return;
    }
    log.innerHTML=ai.conversation.map(m=>`<div class="ai-message ${m.role==='user'?'user':''}"><span>${m.role==='user'?'YOU':'LOCAL AI'}</span><pre>${esc(m.content)}</pre></div>`).join('');
    log.scrollTop=log.scrollHeight;
  }

  function renderAI(){
    const available=supportsLocalAI();
    const selected=currentModel();
    $('#evidenceStage').innerHTML=question()+`<section class="s24-band"><div class="s24-band-index">01</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Local AI runtime</h2><p>WebLLM runs in a Web Worker over WebGPU. Model loading is explicit; Sentinel never starts AI during application startup.</p></div></div>
      <div class="ai-shell">
        <aside class="ai-panel"><header><span>WEBLLM · LOCAL</span><h2>${esc(statusLabel())}</h2><p>Browser and Native App View use the same assistant design.</p></header><div class="ai-body">
          ${available?`<select id="aiModelSelect" class="ai-model-select">${MODELS.map(m=>`<option value="${esc(m.id)}" ${m.id===ai.model?'selected':''}>${esc(m.label)}</option>`).join('')}</select>
          <div class="ai-status"><div class="ai-status-row"><span>Model</span><b>${esc(selected.id)}</b></div><div class="ai-status-row"><span>Inference</span><b>WebGPU · Web Worker</b></div><div class="ai-status-row"><span>Model cache</span><b>IndexedDB · local persistent storage</b></div><div class="ai-status-row"><span>Authority</span><b>Evidence explanation only · no shell execution</b></div></div>
          <div class="ai-progress"><progress id="aiLoadProgress" max="1" value="${Math.max(0,Math.min(1,ai.progress))}"></progress><small id="aiProgressText">${esc(ai.progressText)}</small></div>
          <div class="ai-controls"><button class="s24-action primary" type="button" data-ai="load" ${ai.loading?'disabled':''}>${ai.engine?'Reload model':'Load Local AI'}</button><button class="s24-action" type="button" data-ai="unload" ${!ai.engine?'disabled':''}>Unload memory</button><button class="s24-action" type="button" data-ai="forget">Forget chat</button></div>
          <div class="ai-boundary">The first model load downloads model artifacts from the WebLLM model hosts. After that, WebLLM uses the local IndexedDB cache. Sentinel evidence stays local and is only passed to this in-browser model.</div>`:`<div class="ai-unavailable"><b>WebGPU is not available in this WebView/browser.</b><br>Sentinel itself still works normally. Local AI remains disabled instead of falling back to a cloud model.</div>`}
        </div></aside>
        <div class="ai-panel"><header><span>ASK SENTINEL</span><h2>Explain the current evidence</h2><p>Answers are generated locally from a bounded packet from the current Lens.</p></header><div class="ai-body ai-chat"><div id="aiChatLog" class="ai-chat-log"></div><div class="ai-suggestions"><button type="button" data-ai-prompt="Explain what matters most on this page in plain language.">Explain this page</button><button type="button" data-ai-prompt="What should I inspect next, and why?">Next step</button><button type="button" data-ai-prompt="Separate the strongest observed facts from interpretation and unknowns.">Facts vs interpretation</button><button type="button" data-ai-prompt="Explain any terminal or command-line concepts visible here, without executing anything.">Terminal help</button></div><form id="aiAskForm" class="ai-compose"><textarea id="aiQuestion" required placeholder="Ask about this page, a case, process, network relationship, Full Scan result, or terminal command…"></textarea><button class="s24-action primary" type="submit" ${!ai.engine||ai.generating?'disabled':''}>Ask locally</button></form></div></div>
      </div>
    </div></section>`;
    renderMessages();
    activity('Ready',100,available?'Local AI is opt-in; model loading has not been started automatically.':'Local AI unavailable · Sentinel evidence features remain active');
  }

  function updateProgress(report){
    ai.progress=Number(report?.progress||0);
    ai.progressText=report?.text||'Loading model…';
    const p=$('#aiLoadProgress'), t=$('#aiProgressText');
    if(p)p.value=Math.max(0,Math.min(1,ai.progress));
    if(t)t.textContent=ai.progressText;
    activity('Local AI',Math.round(ai.progress*100),ai.progressText);
  }

  async function loadAI(){
    if(!supportsLocalAI())throw new Error('WebGPU is not available in this browser/WebView.');
    if(ai.loading)return;
    ai.loading=true;ai.progress=0;ai.progressText='Loading WebLLM runtime…';renderAI();
    try{
      if(ai.engine){try{await ai.engine.unload();}catch{} ai.engine=null;}
      if(ai.worker){ai.worker.terminate();ai.worker=null;}
      ai.module=ai.module||await import(WEBLLM_URL);
      const appConfig={...ai.module.prebuiltAppConfig,cacheBackend:'indexeddb'};
      ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
      ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      ai.progress=1;ai.progressText='Model ready in local WebGPU memory.';
      notice('Local AI model ready.');
    }finally{ai.loading=false;renderAI();}
  }

  async function unloadAI(){
    if(ai.engine)await ai.engine.unload().catch(()=>{});
    if(ai.worker)ai.worker.terminate();
    ai.engine=null;ai.worker=null;ai.generating=false;ai.progress=0;ai.progressText='Model unloaded from memory. Cached model files remain local.';renderAI();
  }

  async function askAI(question){
    if(!ai.engine)throw new Error('Load Local AI first.');
    if(ai.generating)return;
    ai.generating=true;
    ai.conversation.push({role:'user',content:question});
    ai.conversation.push({role:'assistant',content:'…'});
    renderAI();
    try{
      activity('Local AI',15,'Building bounded Sentinel evidence packet…');
      const packet=await collectEvidencePacket();
      const history=ai.conversation.slice(0,-1).slice(-8).map(m=>({role:m.role,content:m.content}));
      const messages=[{role:'system',content:SYSTEM_PROMPT+'\n\nCURRENT SENTINEL EVIDENCE PACKET:\n'+trimJSON(packet)},...history];
      const stream=await ai.engine.chat.completions.create({messages,stream:true,temperature:0.2,max_tokens:700});
      let text='';
      for await(const chunk of stream){
        text+=chunk?.choices?.[0]?.delta?.content||'';
        ai.conversation[ai.conversation.length-1].content=text||'…';
        const log=$('#aiChatLog');
        if(log){const last=log.querySelector('.ai-message:last-child pre');if(last)last.textContent=text||'…';log.scrollTop=log.scrollHeight;}
      }
      if(!text)ai.conversation[ai.conversation.length-1].content='The local model returned no text.';
      activity('Ready',100,'Local answer generated from Sentinel evidence');
    }catch(error){
      ai.conversation[ai.conversation.length-1].content='Local AI error: '+(error?.message||String(error));
      notice(error?.message||String(error));
      activity('Error',0,error?.message||String(error));
    }finally{ai.generating=false;renderAI();}
  }

  const limits=S.MISSIONS.find(m=>m.id==='limits');
  if(limits&&!limits.lenses.includes('assistant')){
    const manualIndex=limits.lenses.indexOf('manual');
    if(manualIndex>=0)limits.lenses.splice(manualIndex,0,'assistant');else limits.lenses.push('assistant');
  }
  S.LENSES.assistant={label:'Assistant',verb:'EXPLAIN',title:'What does the collected evidence mean?',rule:'Use a local model to explain Sentinel evidence; facts remain sourced by Sentinel, not invented by AI.'};
  registerLens('assistant',async()=>renderAI());

  if(S.actionDock?.actions){
    S.actionDock.actions.assistant=[{label:'Status',lens:'status',primary:true},{label:'Cases',lens:'cases'},{label:'Visibility',lens:'visibility'},{label:'Manual',lens:'manual'}];
  }

  function installHeaderButton(){
    const actions=$('.s24-command-actions'), manual=$('#manualButton');
    if(!actions||$('#assistantButton'))return;
    const button=document.createElement('button');button.id='assistantButton';button.className='s24-quiet';button.type='button';button.textContent='Assistant';button.title='Open the local WebLLM evidence assistant';
    actions.insertBefore(button,manual||$('#refreshButton'));
  }

  document.addEventListener('click',event=>{
    if(event.target.closest('#assistantButton')){event.preventDefault();if(typeof S.navigate==='function')S.navigate('assistant');return;}
    const control=event.target.closest('[data-ai]');
    if(control){event.preventDefault();const action=control.dataset.ai;if(action==='load')loadAI().catch(e=>{ai.loading=false;notice(e.message);renderAI();});else if(action==='unload')unloadAI();else if(action==='forget'){ai.conversation=[];renderMessages();}return;}
    const prompt=event.target.closest('[data-ai-prompt]');if(prompt){const box=$('#aiQuestion');if(box){box.value=prompt.dataset.aiPrompt;box.focus();}}
  });
  document.addEventListener('change',event=>{if(event.target?.id==='aiModelSelect'){ai.model=event.target.value;localStorage.setItem('sentinel.ai.model',ai.model);ai.progressText='Model selection changed. Load it when ready.';}});
  document.addEventListener('submit',event=>{if(event.target?.id!=='aiAskForm')return;event.preventDefault();const q=$('#aiQuestion')?.value?.trim();if(q){$('#aiQuestion').value='';askAI(q);}});

  installHeaderButton();
  S.localAI={marker:AI_MARKER,models:MODELS,state:ai,supportsLocalAI,collectEvidencePacket,loadAI,unloadAI,askAI};
})();
