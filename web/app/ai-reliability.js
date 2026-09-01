// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.6 Local AI Reliability — fail visible, recover cleanly,
// keep one Assistant entry point, and retain evidence-only fallback.
(() => {
  'use strict';
  const S=window.SentinelApp, AI=S?.localAI;
  if(!S||!AI)return;
  const ai=AI.state, esc=S.esc||((v)=>String(v??''));
  const RELIABILITY_MARKER='Sentinel 2.6 Local AI Reliability';
  const STALL_MS=90000, ABSOLUTE_MS=600000, UNLOAD_MS=1500, GENERATION_STALL_MS=90000, GENERATION_RESET_GRACE_MS=5000;
  const reliability={lastError:'',lastFailureAt:0,lastSuccessAt:0,attempt:0,phase:'idle',generationStartedAt:0,lastTokenAt:0};
  AI.reliability=reliability;AI.reliabilityMarker=RELIABILITY_MARKER;

  function capabilities(){
    return {
      webgpu:Boolean(navigator.gpu),worker:Boolean(window.Worker),indexeddb:Boolean(window.indexedDB),
      secureContext:Boolean(window.isSecureContext||location.hostname==='127.0.0.1'||location.hostname==='localhost')
    };
  }
  function modelName(){return AI.models?.find(x=>x.id===ai.model)?.name||ai.model||'—';}
  function diagnosticRows(){const c=capabilities();return [
    ['WebGPU',c.webgpu?'Available':'Unavailable'],['Worker',c.worker?'Available':'Unavailable'],
    ['IndexedDB',c.indexeddb?'Available':'Unavailable'],['Loopback / secure context',c.secureContext?'OK':'Review'],
    ['Selected model',modelName()],['Loaded model',ai.loadedModel||'Not loaded'],
    ['Worker state',ai.worker?'Created':'Not created'],['Engine state',ai.engine?'Created':'Not created'],
    ['Load / generation phase',reliability.phase],['Progress',`${Math.round(Number(ai.progress||0)*100)}% · ${ai.progressText||'—'}`],
    ['Last error',reliability.lastError||'None']
  ];}
  function diagnosticSignature(){return JSON.stringify(diagnosticRows());}
  function diagnosticsHTML(signature=diagnosticSignature()){return `<section id="aiReliabilityPanel" data-ai-reliability-signature="${esc(signature)}" class="wb-section"><div class="wb-section-head"><div><h3>Local AI diagnostics</h3><p>Runtime → model download/cache → WebGPU initialization → generation. A stalled stage fails visibly instead of waiting forever.</p></div></div><div class="s24-ledger">${diagnosticRows().map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="wb-actions"><button type="button" class="s24-action primary" data-ai-reliable="retry">Retry model load</button><button type="button" class="s24-action" data-ai-reliable="small">Use Qwen 0.5B</button><button type="button" class="s24-action" data-ai-reliable="refresh">Refresh diagnostics</button></div>${reliability.lastError?`<div class="s24-note warn"><b>Last Local AI failure:</b> ${esc(reliability.lastError)}. Sentinel evidence features remain available; use the evidence-only fallback below while troubleshooting the model.</div>`:''}<form id="aiEvidenceFallbackForm" class="wb-form"><label class="wb-field"><span>Evidence-only fallback</span><textarea name="prompt" rows="2" placeholder="What changed since my last checkpoint?"></textarea></label><button class="s24-action" type="submit">Analyze without model</button></form><div id="aiEvidenceFallbackResult"></div></section>`;}
  function ensureDiagnostics(){
    const stage=document.querySelector('#evidenceStage');if(!stage||S.state?.lens!=='assistant')return;
    const signature=diagnosticSignature();let panel=stage.querySelector('#aiReliabilityPanel');
    if(!panel){const host=document.createElement('div');host.innerHTML=diagnosticsHTML(signature);panel=host.firstElementChild;const q=stage.querySelector('.s24-question');if(q)q.insertAdjacentElement('afterend',panel);else stage.prepend(panel);return;}
    if(panel.dataset.aiReliabilitySignature===signature)return;
    const fresh=document.createElement('div');fresh.innerHTML=diagnosticsHTML(signature);panel.replaceWith(fresh.firstElementChild);
  }
  function rebrandLegacyAssistant(){
    const tray=document.querySelector('#contextTray');if(!tray||tray.hidden||document.querySelector('#contextTitle')?.textContent!=='Investigation Workbench')return;
    for(const b of tray.querySelectorAll('[data-wb-tab="assistant"]')){if(b.textContent!=='Evidence fallback')b.textContent='Evidence fallback';b.title='Deterministic Sentinel API fallback; the model-backed assistant is the main Assistant Lens.';}
  }
  function queueUI(){queueMicrotask(()=>{ensureDiagnostics();rebrandLegacyAssistant();});}
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function boundedUnload(engine){
    if(!engine?.unload)return;
    try{await Promise.race([engine.unload(),delay(UNLOAD_MS)]);}catch{}
  }

  async function resetFailedLoad(message){
    reliability.lastError=String(message||'Unknown Local AI initialization error');reliability.lastFailureAt=Date.now();reliability.phase='failed';
    reliability.attempt++;
    const oldEngine=ai.engine,oldWorker=ai.worker;
    // Detach state first so the UI can recover even if WebLLM cleanup itself is unhealthy.
    ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.loading=false;ai.generating=false;
    await boundedUnload(oldEngine);
    try{oldWorker?.terminate();}catch{}
    ai.progressText='Local AI load failed · '+reliability.lastError;
    S.notice?.(ai.progressText);S.activity?.('Error',0,reliability.lastError);queueUI();
  }

  async function reliableLoad(){
    if(ai.loading)return;
    const c=capabilities();
    if(!c.worker||!c.indexeddb||!c.webgpu){await resetFailedLoad(`Prerequisite unavailable: ${!c.webgpu?'WebGPU ':''}${!c.worker?'Worker ':''}${!c.indexeddb?'IndexedDB ':''}`.trim());return;}
    const attempt=++reliability.attempt;reliability.lastError='';reliability.phase='runtime / model initialization';
    let lastProgress=Number(ai.progress||0),lastText=String(ai.progressText||''),lastChange=Date.now(),workerSeen=null,rejectWatchdog;
    const watchdog=new Promise((_,reject)=>{rejectWatchdog=reject;});
    const monitor=setInterval(()=>{
      if(attempt!==reliability.attempt)return;
      const p=Number(ai.progress||0),t=String(ai.progressText||'');
      if(p!==lastProgress||t!==lastText){lastProgress=p;lastText=t;lastChange=Date.now();reliability.phase=t||'model initialization';queueUI();}
      if(ai.worker&&ai.worker!==workerSeen){workerSeen=ai.worker;workerSeen.addEventListener('error',event=>rejectWatchdog(new Error(event.message||'Local AI worker bootstrap failed.')),{once:true});}
      if(Date.now()-lastChange>STALL_MS)rejectWatchdog(new Error(`Local AI initialization stalled for ${Math.round(STALL_MS/1000)} seconds at: ${t||'unknown stage'}`));
    },1000);
    const absolute=setTimeout(()=>rejectWatchdog(new Error('Local AI initialization exceeded the 10-minute safety limit.')),ABSOLUTE_MS);
    try{
      await Promise.race([AI.loadAI(),watchdog]);
      if(ai.engine&&ai.loadedModel){reliability.phase='ready';reliability.lastSuccessAt=Date.now();reliability.lastError='';S.activity?.('Ready',100,`Local AI ready · ${modelName()}`);}
      else throw new Error('Local AI loader returned without a ready engine.');
    }catch(error){await resetFailedLoad(error?.message||String(error));}
    finally{clearInterval(monitor);clearTimeout(absolute);queueUI();}
  }

  function latestAssistantText(){
    const message=[...(ai.conversation||[])].reverse().find(x=>x?.role==='assistant');
    return String(message?.content||'');
  }
  let generationSeen=false,generationText='',generationResetPending=false;

  async function forceResetStalledGeneration(){
    if(!ai.generating)return;
    const oldEngine=ai.engine,oldWorker=ai.worker;
    ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.generating=false;ai.loading=false;
    reliability.lastError='Local AI generation did not stop after interrupt; the WebLLM engine and worker were reset.';
    reliability.lastFailureAt=Date.now();reliability.phase='generation reset';
    ai.progress=0;ai.progressText='Local AI generation failed · reload the selected model to continue.';
    await boundedUnload(oldEngine);
    try{oldWorker?.terminate();}catch{}
    S.notice?.(reliability.lastError);S.activity?.('Error',0,reliability.lastError);queueUI();
  }

  function requestGenerationRecovery(now){
    if(generationResetPending)return;
    generationResetPending=true;
    reliability.lastError='Local AI generation stalled for 90 seconds without a new token. Interrupt requested.';
    reliability.lastFailureAt=now;reliability.phase='generation interrupt requested';
    try{ai.engine?.interruptGenerate?.();}catch{}
    S.notice?.(reliability.lastError);S.activity?.('Error',0,reliability.lastError);queueUI();
    setTimeout(()=>{
      if(!ai.generating){generationResetPending=false;return;}
      void forceResetStalledGeneration().finally(()=>{generationResetPending=false;});
    },GENERATION_RESET_GRACE_MS);
  }

  setInterval(()=>{
    if(!ai.generating){
      if(generationSeen){generationSeen=false;generationText='';generationResetPending=false;reliability.generationStartedAt=0;reliability.lastTokenAt=0;if(ai.engine&&ai.loadedModel)reliability.phase='ready';queueUI();}
      return;
    }
    const now=Date.now(),text=latestAssistantText();
    if(!generationSeen){generationSeen=true;generationText=text;reliability.generationStartedAt=now;reliability.lastTokenAt=now;reliability.phase='generation';queueUI();return;}
    if(text!==generationText){generationText=text;reliability.lastTokenAt=now;reliability.phase='generation · streaming';queueUI();return;}
    if(now-(reliability.lastTokenAt||reliability.generationStartedAt||now)>GENERATION_STALL_MS)requestGenerationRecovery(now);
  },2000);

  function renderFallback(answer){
    const out=document.querySelector('#aiEvidenceFallbackResult');if(!out)return;
    const section=(title,items)=>`<div class="s24-note"><b>${esc(title)}</b>${(items||[]).map(x=>`<p>${esc(x)}</p>`).join('')||'<p>None.</p>'}</div>`;
    out.innerHTML=section('Observed',answer?.observed)+section('Derived',answer?.derived)+section('Unknown',answer?.unknown)+section('Next',answer?.next);
  }
  async function fallback(question){
    if(!S.Workbench?.assistantAnswer)throw new Error('Evidence-only fallback is unavailable.');
    const answer=await S.Workbench.assistantAnswer(question);renderFallback(answer);return answer;
  }

  // Capture-phase routing prevents the original bubble handler from starting a
  // second model load. All model loads pass through the reliability watchdog.
  document.addEventListener('click',event=>{
    const load=event.target.closest('[data-ai="load"]');
    if(load){event.preventDefault();event.stopImmediatePropagation();void reliableLoad();return;}
    const control=event.target.closest('[data-ai-reliable]');if(!control)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(control.dataset.aiReliable==='small'){ai.model='Qwen2.5-0.5B-Instruct-q4f16_1-MLC';localStorage.setItem('sentinel.ai.model',ai.model);ai.progressText='Qwen 2.5 0.5B selected for recovery testing.';queueUI();return;}
    if(control.dataset.aiReliable==='retry'){void reliableLoad();return;}
    queueUI();
  },true);

  document.addEventListener('submit',event=>{
    if(event.target?.id==='aiEvidenceFallbackForm'){event.preventDefault();event.stopImmediatePropagation();const q=String(new FormData(event.target).get('prompt')||'').trim();if(q)fallback(q).catch(e=>{reliability.lastError=e.message;queueUI();});return;}
    // If the user asks before a model is ready, keep the single Assistant UX
    // useful by routing the question through bounded deterministic evidence.
    if(event.target?.id==='aiAskForm'&&!AI.isReady()){event.preventDefault();event.stopImmediatePropagation();const q=String(document.querySelector('#aiQuestion')?.value||'').trim();if(q){document.querySelector('#aiQuestion').value='';fallback(q).catch(e=>{reliability.lastError=e.message;queueUI();});}return;}
  },true);

  const stage=document.querySelector('#evidenceStage');if(stage)new MutationObserver(queueUI).observe(stage,{childList:true});
  const tray=document.querySelector('#contextTray');if(tray)new MutationObserver(queueUI).observe(tray,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  AI.reliableLoad=reliableLoad;AI.capabilityDiagnostics=capabilities;AI.evidenceFallback=fallback;AI.boundedUnload=boundedUnload;AI.forceResetStalledGeneration=forceResetStalledGeneration;
  queueUI();
})();
