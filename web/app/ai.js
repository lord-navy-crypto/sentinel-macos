// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.6 Local AI — deeply integrated, read-only WebLLM analyst over Sentinel evidence.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Local AI.');
  const {$, state, api, esc, question, registerLens, activity, notice} = S;

  const AI_MARKER = 'Sentinel 2.7 WebLLM Local AI';
  const AI_FUSION_MARKER = 'Sentinel 2.6 Integrated Local AI';
  const WEBLLM_URL = '/vendor/webllm-0.2.82.mjs';
  const DEFAULT_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
  const MODELS = [
    {id:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 0.5B',tier:'small',vramMB:944.62,memory:'8 GB+',focus:'Fast bilingual explanations',note:'Smallest general model in the library; best when responsiveness matters more than depth.'},
    {id:'Llama-3.2-1B-Instruct-q4f16_1-MLC',name:'Llama 3.2 1B',tier:'small',vramMB:879.04,memory:'8 GB+',focus:'General English reasoning',note:'Very light general-purpose model with a low WebGPU memory requirement.'},
    {id:'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 1.5B',tier:'small',vramMB:1629.75,memory:'8 GB+',focus:'Recommended bilingual assistant',note:'Default Sentinel model: a good balance of Chinese/English ability, speed, and memory use.',recommended:true},
    {id:'Llama-3.2-3B-Instruct-q4f16_1-MLC',name:'Llama 3.2 3B',tier:'medium',vramMB:2263.69,memory:'8–16 GB',focus:'Stronger general explanations',note:'More capable than the 1B variant while still practical on many Macs.'},
    {id:'Qwen2.5-3B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 3B',tier:'medium',vramMB:2504.76,memory:'8–16 GB',focus:'Bilingual technical analysis',note:'Good choice for longer evidence explanations and mixed Chinese/English questions.'},
    {id:'Phi-3.5-mini-instruct-q4f16_1-MLC-1k',name:'Phi 3.5 Mini · 1K',tier:'medium',vramMB:2520.07,memory:'8–16 GB',focus:'Compact technical reasoning',note:'Technical alternative with a shorter 1K context window; useful for bounded evidence packets.'},
    {id:'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 Coder 1.5B',tier:'specialist',vramMB:1629.75,memory:'8 GB+',focus:'Terminal and code explanation',note:'Specialist option for shell commands, code, configuration, and technical troubleshooting.'},
    {id:'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 Math 1.5B',tier:'specialist',vramMB:1629.75,memory:'8 GB+',focus:'Math and scientific reasoning',note:'Specialist option for numerical, mathematical, and scientific explanations.'},
    {id:'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',name:'Mistral 7B Instruct',tier:'large',vramMB:4573.39,memory:'16 GB+',focus:'Strong general assistant',note:'Large model with stronger responses; requires shader-f16 support.',requires:'shader-f16'},
    {id:'Qwen2.5-7B-Instruct-q4f16_1-MLC',name:'Qwen 2.5 7B',tier:'large',vramMB:5106.67,memory:'16 GB+',focus:'Strong bilingual analysis',note:'High-quality Chinese/English option for deeper evidence interpretation.'},
    {id:'Llama-3.1-8B-Instruct-q4f16_1-MLC',name:'Llama 3.1 8B',tier:'large',vramMB:5001.0,memory:'16 GB+',focus:'Strong general reasoning',note:'Large general-purpose model; expect slower loading and generation than the smaller tiers.'},
    {id:'gemma-2-9b-it-q4f16_1-MLC',name:'Gemma 2 9B',tier:'large',vramMB:6422.01,memory:'24 GB recommended',focus:'Largest curated option',note:'Highest-memory curated model in Sentinel 2.6; requires shader-f16 and is intended for well-equipped Macs.',requires:'shader-f16'},
  ];
  const TIER_META = {
    small:{label:'SMALL',title:'Fast & light',description:'Best starting point for 8 GB Macs and quick evidence explanations.'},
    medium:{label:'MEDIUM',title:'Balanced',description:'More capable general models for deeper explanations without jumping to 7B–9B.'},
    specialist:{label:'SPECIALIST',title:'Technical / scientific',description:'Purpose-built choices for terminal, coding, math, and scientific interpretation.'},
    large:{label:'LARGE',title:'Strong models',description:'Higher quality, slower loading, and substantially more unified-memory pressure.'},
  };
  const LEVELS = {
    beginner:{label:'Beginner',instruction:'Explain in plain language. Define technical terms briefly and avoid assuming macOS internals knowledge.'},
    technical:{label:'Technical',instruction:'Use precise technical language, but explain why each observation matters and keep causal claims bounded.'},
    expert:{label:'Expert',instruction:'Be concise and evidence-dense. Preserve exact distinctions among identity, relationship, time, visibility, and uncertainty.'},
  };
  const GUIDES = [
    {id:'network',title:'Unknown network activity',summary:'Trace an unfamiliar connection back to process identity and retained relationships.',steps:[
      {lens:'network',label:'Inspect current network',prompt:'Explain the unfamiliar network relationships on this page and identify which process evidence deserves follow-up.'},
      {lens:'processes',label:'Resolve process identity',prompt:'Explain the selected/running process identity and what current evidence does and does not establish.'},
      {lens:'relations',label:'Connect the evidence',prompt:'Explain the graph and timeline relationships relevant to the selected process without treating correlation as causality.'},
      {lens:'cases',label:'Review correlated cases',prompt:'Explain whether retained case evidence groups these observations and what remains unknown.'},
    ]},
    {id:'startup',title:'Strange startup item',summary:'Understand an auto-start declaration before deciding whether any action is justified.',steps:[
      {lens:'startup',label:'Read declaration',prompt:'Explain the visible auto-start declaration, target identity, and running relationship in plain evidence terms.'},
      {lens:'persistence',label:'Check persistence drift',prompt:'Explain whether launch configuration changed across retained captures and how strong that evidence is.'},
      {lens:'changes',label:'Place it in time',prompt:'Explain nearby retained changes and whether the startup item appears to be part of a broader change window.'},
      {lens:'object',label:'Verify exact object',prompt:'Explain how to verify the exact executable or plist before considering any Safe Change.'},
    ]},
    {id:'application',title:'Investigate an application',summary:'Go from name/path to exact object identity, audit context, and relationships.',steps:[
      {lens:'search',label:'Find exact object',prompt:'Help narrow this application to an exact path or process using Sentinel evidence.'},
      {lens:'object',label:'Verify identity',prompt:'Explain the exact object identity, signature/integrity context, and unknowns.'},
      {lens:'audit',label:'Read audit context',prompt:'Explain the audit findings for this object without converting priority into malware probability.'},
      {lens:'relations',label:'Inspect relationships',prompt:'Explain the object’s retained relationships and timeline context.'},
    ]},
    {id:'changes',title:'What changed?',summary:'Compare retained state and separate meaningful differences from ordinary churn.',steps:[
      {lens:'changes',label:'Review change events',prompt:'Summarize the strongest retained changes and separate routine churn from items that deserve review.'},
      {lens:'behavior',label:'Compare behavior',prompt:'Explain behavior differences between observations without treating difference as danger.'},
      {lens:'reference',label:'Compare reference',prompt:'Explain reference drift and distinguish approved reference context from a safety certificate.'},
      {lens:'cases',label:'Correlate changes',prompt:'Explain whether the changed evidence appears together in retained Cases.'},
    ]},
    {id:'storage',title:'Storage suddenly increased',summary:'Measure pressure, inspect aging/history, and only then review reclaim candidates.',steps:[
      {lens:'storage',label:'Measure storage',prompt:'Explain the largest storage pressure and aging/history evidence on this page.'},
      {lens:'changes',label:'Check timing',prompt:'Explain retained changes that may help place storage growth in time, without inventing a cause.'},
      {lens:'reclaim',label:'Review candidates',prompt:'Explain reclaim candidates and distinguish exact duplicates from filename-family heuristics.'},
    ]},
    {id:'performance',title:'Mac feels slow',summary:'Start from live processes, then correlate network/background state without guessing cause.',steps:[
      {lens:'processes',label:'Inspect live processes',prompt:'Explain which current process observations deserve performance follow-up and why.'},
      {lens:'background',label:'Review background registrations',prompt:'Explain background registrations that could be relevant context, without claiming they caused slowness.'},
      {lens:'network',label:'Check current network',prompt:'Explain whether current TCP activity adds useful context to the performance question.'},
    ]},
  ];

  function readJSON(key, fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback;}catch{return fallback;}}
  const ai = {
    module:null,worker:null,engine:null,loading:false,generating:false,
    model:localStorage.getItem('sentinel.ai.model') || DEFAULT_MODEL,
    loadedModel:null,progress:0,progressText:'Model not loaded.',conversation:[],lastPacket:null,
    pinnedPacket:null,pinnedLabel:'',pendingPrompt:'',pendingMode:'evidence',pendingAutoRun:false,
    level:localStorage.getItem('sentinel.ai.level') || 'beginner',
    guided:readJSON('sentinel.ai.guided', null),
  };
  if (!MODELS.some(model => model.id === ai.model)) ai.model = DEFAULT_MODEL;
  if (!LEVELS[ai.level]) ai.level = 'beginner';
  if (ai.guided && !GUIDES.some(g=>g.id===ai.guided.id)) ai.guided = null;

  const SYSTEM_PROMPT = `You are Sentinel Local Evidence Assistant. You run locally in the user's browser/WebView. Use only the Sentinel evidence packet, Sentinel Manual excerpts supplied in the packet, and the user's question. Always separate: OBSERVED, INTERPRETATION, UNKNOWN, NEXT STEP. Never turn Attention, Risk, Confidence, Drift, startup presence, public network access, novelty, missing data, or a public endpoint into malware probability. Never call an item malicious or safe unless supplied evidence explicitly establishes that narrow fact. If evidence is insufficient, say so. Never invent paths, PIDs, hashes, signatures, endpoints, timestamps, causes, intent, commands that were run, or scan results. User investigation notes are USER CONTEXT, not observed system evidence. Manual text is PRODUCT GUIDANCE, not machine evidence. You may explain terminal commands, but do not execute them and do not claim they were run. Prefer read-only inspection. File/system changes must remain in Sentinel Safe Change. You have no unrestricted shell authority.`;

  function supportsLocalAI(){return Boolean(window.Worker && window.indexedDB && navigator.gpu);}
  function isReady(){return Boolean(ai.engine && ai.loadedModel);}
  function statusLabel(){
    if(!supportsLocalAI())return 'Unavailable · WebGPU not exposed';
    if(ai.generating)return 'Generating locally…';
    if(ai.loading)return 'Loading model…';
    if(isReady())return `Ready · ${loadedModel()?.name||'local model'}`;
    return 'Available · model not loaded';
  }
  function currentModel(){return MODELS.find(x=>x.id===ai.model)||MODELS[0];}
  function loadedModel(){return MODELS.find(x=>x.id===ai.loadedModel)||null;}
  function formatGB(mb){return (Number(mb||0)/1024).toFixed(Number(mb||0)>=4096?1:2)+' GB';}
  function selection(){return S.Workbench?.store?.selected||null;}
  function selectionLabel(value=selection()){
    if(!value)return 'No selected evidence';
    return value.path||value.label||(value.pid?`PID ${value.pid}`:value.type||'Evidence');
  }
  function currentGuide(){return ai.guided?GUIDES.find(g=>g.id===ai.guided.id)||null:null;}
  function currentGuideStep(){const guide=currentGuide();if(!guide)return null;return guide.steps[Math.max(0,Math.min(guide.steps.length-1,Number(ai.guided.step||0)))];}
  function persistGuide(){try{if(ai.guided)localStorage.setItem('sentinel.ai.guided',JSON.stringify(ai.guided));else localStorage.removeItem('sentinel.ai.guided');}catch{}}

  function boundValue(value,depth=0){
    if(depth>5)return '[depth bounded]';
    if(Array.isArray(value))return value.slice(0,40).map(v=>boundValue(v,depth+1));
    if(value&&typeof value==='object'){
      const out={};
      for(const [k,v] of Object.entries(value).slice(0,80))out[k]=boundValue(v,depth+1);
      return out;
    }
    if(typeof value==='string'&&value.length>2400)return value.slice(0,2400)+'…[bounded]';
    return value;
  }
  function trimJSON(value,limit=18000){let text='';try{text=JSON.stringify(boundValue(value),null,2);}catch{text=String(value??'');}return text.length>limit?text.slice(0,limit)+'\n…[truncated by Sentinel before Local AI]':text;}
  async function safeRead(url){try{return await api(url);}catch(error){return {unavailable:true,error:error?.message||String(error)};}}

  function manualTokens(query){
    const q=String(query||'').trim().toLowerCase();
    const tokens=(q.match(/[\p{L}\p{N}_./-]{2,}/gu)||[]).slice(0,20);
    const cjk=[...q.replace(/[^\p{Script=Han}]/gu,'')];
    for(let i=0;i<cjk.length-1&&i<18;i++)tokens.push(cjk[i]+cjk[i+1]);
    return [...new Set(tokens)];
  }
  function findManualTopics(query,limit=4){
    const topics=S.userManual?.topics||[];
    if(!topics.length)return [];
    const q=String(query||'').trim().toLowerCase();
    const tokens=manualTokens(q);
    return topics.map(topic=>{
      const hay=[topic.title,topic.kicker,topic.summary,...(topic.paragraphs||[]),...(topic.steps||[]),...(topic.lookFor||[]),topic.caution].join(' ').toLowerCase();
      let score=q&&hay.includes(q)?12:0;
      for(const token of tokens)if(hay.includes(token))score+=token.length>4?3:1;
      return {topic,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(({topic})=>({
      title:topic.title,summary:topic.summary,steps:(topic.steps||[]).slice(0,6),caution:topic.caution,lens:topic.lens||'',source:'Sentinel User Manual'
    }));
  }

  async function selectedEvidence(subject=selection()){
    if(!subject)return null;
    if(subject.path){
      const story=await safeRead('/api/object/story/v2?path='+encodeURIComponent(subject.path));
      return {selection:boundValue(subject),object_story:boundValue(story)};
    }
    if(subject.pid){
      const pid=Number(subject.pid);
      const [detail,network,launch]=await Promise.all([
        safeRead('/api/process/detail?pid='+encodeURIComponent(pid)),safeRead('/api/network'),safeRead('/api/launch-services')
      ]);
      const net=(network.items||[]).filter(x=>Number(x.pid)===pid).slice(0,40);
      const cmd=String(detail.command||detail.executable||detail.path||'');
      const launches=(launch.items||[]).filter(x=>(x.running_pids||[]).map(Number).includes(pid)||(cmd&&x.executable&&cmd.includes(x.executable))).slice(0,30);
      return {selection:boundValue(subject),process_detail:boundValue(detail),network_relationships:boundValue(net),launch_relationships:boundValue(launches)};
    }
    return {selection:boundValue(subject)};
  }

  function activeInvestigationContext(){
    const store=S.Workbench?.store;
    if(!store?.activeInvestigation)return null;
    const inv=(store.investigations||[]).find(x=>x.id===store.activeInvestigation);
    if(!inv)return null;
    return {source:'USER CONTEXT · Workbench investigation',title:inv.title||'',hypothesis:String(inv.hypothesis||'').slice(0,2000),notes:String(inv.notes||'').slice(0,3500),bookmarks:(inv.bookmarks||[]).slice(-12)};
  }
  function contextTrayExcerpt(){
    const tray=$('#contextTray'),body=$('#contextBody');
    if(!tray||tray.hidden||!body)return '';
    const clone=body.cloneNode(true);clone.querySelectorAll('.ai-context-tray-bridge').forEach(x=>x.remove());
    return clone.innerText.trim().slice(0,5000);
  }

  const READS = {
    status:[['overview','/api/overview'],['readiness','/api/readiness']],
    snapshot:[['quick_check','/api/quick-check'],['review_queue','/api/review-queue']],
    cases:[['cases','/api/incidents/v2?history=1']],
    search:[['review_queue','/api/review-queue']],
    relations:[['graph','/api/intelligence/graph/v2'],['timeline','/api/intelligence/timeline/grouped']],
    audit:[['audit','/api/security/audit']],
    object:[['review_queue','/api/review-queue']],
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
    guide:[['coverage','/api/coverage']],
    manual:[['coverage','/api/coverage']],
  };

  async function collectEvidencePacket(options={}){
    const sourceLens=options.lens||(state.lens==='assistant'&&ai.pinnedPacket?.lens?ai.pinnedPacket.lens:state.lens)||'status';
    const userQuestion=String(options.question||'');
    const packet={
      kind:options.kind||'lens_evidence',generated_at:new Date().toISOString(),lens:sourceLens,
      boundary:'Sentinel evidence only. Missing data must remain unknown.',
      coverage:await safeRead('/api/coverage'),evidence:{},
      selection:boundValue(selection()),user_investigation_context:activeInvestigationContext(),guided_investigation:boundValue(ai.guided),
    };
    const jobs=READS[sourceLens]||READS.status;
    await Promise.all(jobs.map(async([name,url])=>{packet.evidence[name]=boundValue(await safeRead(url));}));
    if(selection())packet.selected_evidence=await selectedEvidence(selection());
    const stage=$('#evidenceStage');
    const visible=sourceLens===state.lens?stage?.innerText?.trim().replace(/\n{3,}/g,'\n\n')||'':'';
    packet.visible_ui_excerpt=visible.slice(0,6000);
    packet.context_tray_excerpt=contextTrayExcerpt();
    packet.manual_context=findManualTopics(userQuestion||`${S.LENSES[sourceLens]?.label||sourceLens} ${S.LENSES[sourceLens]?.title||''}`,4);
    if(options.includeBaseline&&typeof S.scanCenter?.readBaselineState==='function')packet.retained_baseline=boundValue(await S.scanCenter.readBaselineState(true).catch?.(()=>null)||null);
    ai.lastPacket=packet;
    return packet;
  }

  async function buildFullScanPacket(){
    activity('Local AI',8,'Reading retained Full Scan evidence…');
    const [baseline,review,audit,changes,persistence,trust,behavior,visibility]=await Promise.all([
      typeof S.scanCenter?.readBaselineState==='function'?S.scanCenter.readBaselineState(true).catch(()=>null):Promise.resolve(null),
      safeRead('/api/review-queue'),safeRead('/api/security/audit'),safeRead('/api/changes/events'),safeRead('/api/persistence'),safeRead('/api/trust/status'),safeRead('/api/behavior/history'),safeRead('/api/visibility')
    ]);
    const packet={kind:'full_scan_brief',generated_at:new Date().toISOString(),lens:'status',boundary:'Summarize retained evidence; do not invent scan stages or causes.',
      retained_baseline:boundValue(baseline),review_queue:boundValue(review),audit:boundValue(audit),changes:boundValue(changes),persistence:boundValue(persistence),reference:boundValue(trust),behavior:boundValue(behavior),visibility:boundValue(visibility),
      selection:boundValue(selection()),user_investigation_context:activeInvestigationContext(),manual_context:findManualTopics('Full Scan retained baseline changes cases visibility',4)};
    ai.lastPacket=packet;return packet;
  }

  async function buildComparePacket(){
    const store=S.Workbench?.store;if(!store?.compareA||!store?.compareB)throw new Error('Set Compare A and Compare B in Workbench first.');
    const [a,b]=await Promise.all([selectedEvidence(store.compareA),selectedEvidence(store.compareB)]);
    return {kind:'compare_two_objects',generated_at:new Date().toISOString(),lens:state.lens,boundary:'Compare supplied evidence only; difference is not danger.',compare_a:a,compare_b:b,manual_context:findManualTopics('compare two objects evidence reference',3)};
  }

  function modeInstruction(mode){
    if(mode==='manual')return 'Answer primarily from PRODUCT GUIDANCE in manual_context. If the question is about this Mac, distinguish Manual guidance from observed machine evidence.';
    if(mode==='terminal')return 'TERMINAL COPILOT MODE: explain what the supplied command would do, inputs/outputs, read-only vs mutating behavior, and safer read-only alternatives when useful. Do not execute, simulate execution, or claim output.';
    if(mode==='full-scan')return 'FULL SCAN AI BRIEF MODE: produce a short executive summary, strongest observed changes, routine/ambiguous items, visibility limits, and prioritized next investigation steps. Do not call anything malicious or safe from scoring alone.';
    if(mode==='notes')return 'DRAFT NOTES MODE: draft editable investigation notes with Scope, Observed, Interpretation, Unknowns, and Follow-up. Clearly label this as a draft; never rewrite machine evidence.';
    if(mode==='compare')return 'COMPARE MODE: compare identity, time, relationships, reference/history, and unknowns. Highlight the largest evidence differences without turning them into a verdict.';
    return 'EVIDENCE EXPLANATION MODE: explain what the supplied Sentinel evidence means and suggest bounded next steps.';
  }

  function modelLibraryHTML(){
    return Object.entries(TIER_META).map(([tier,meta])=>{
      const models=MODELS.filter(model=>model.tier===tier);
      return `<section class="ai-model-group"><div class="ai-model-group-head"><span>${esc(meta.label)}</span><div><h3>${esc(meta.title)}</h3><p>${esc(meta.description)}</p></div></div><div class="ai-model-grid">${models.map(model=>{
        const selected=model.id===ai.model,loaded=model.id===ai.loadedModel;
        return `<button class="ai-model-card ${selected?'selected':''} ${loaded?'loaded':''}" type="button" data-ai-model="${esc(model.id)}" aria-pressed="${selected?'true':'false'}"><div class="ai-model-card-top"><strong>${esc(model.name)}</strong><span>${model.recommended?'RECOMMENDED':loaded?'LOADED':esc(model.memory)}</span></div><p>${esc(model.focus)}</p><dl><div><dt>WebLLM memory</dt><dd>${esc(formatGB(model.vramMB))}</dd></div><div><dt>Suggested Mac</dt><dd>${esc(model.memory)}</dd></div>${model.requires?`<div><dt>GPU feature</dt><dd>${esc(model.requires)}</dd></div>`:''}</dl><small>${esc(model.note)}</small></button>`;
      }).join('')}</div></section>`;
    }).join('');
  }

  function renderMessages(){
    const log=$('#aiChatLog');if(!log)return;
    if(!ai.conversation.length){log.innerHTML='<div class="ai-message"><span>LOCAL ASSISTANT</span><pre>Select and load a model, then ask about any Sentinel Lens. “Explain with AI” elsewhere in the app pins that Lens evidence here. The assistant receives bounded Sentinel evidence, not unrestricted access to your Mac.</pre></div>';return;}
    log.innerHTML=ai.conversation.map(m=>`<div class="ai-message ${m.role==='user'?'user':''}"><span>${m.role==='user'?'YOU':'LOCAL AI'}</span><pre>${esc(m.content)}</pre></div>`).join('');log.scrollTop=log.scrollHeight;
  }
  function guideHTML(){
    const active=currentGuide();
    return `<div class="ai-guide-grid">${GUIDES.map(g=>`<article class="ai-guide-card ${active?.id===g.id?'active':''}"><span>GUIDED INVESTIGATION</span><h3>${esc(g.title)}</h3><p>${esc(g.summary)}</p><small>${g.steps.length} bounded steps · no automatic system changes</small><button type="button" class="s24-action ${active?.id===g.id?'':'primary'}" data-ai-guide-start="${esc(g.id)}">${active?.id===g.id?'Restart guide':'Start guide'}</button></article>`).join('')}</div>${active?`<div class="ai-guide-active"><div><span>ACTIVE GUIDE</span><b>${esc(active.title)}</b><small>Step ${Number(ai.guided.step||0)+1}/${active.steps.length}</small></div><div class="ai-guide-steps">${active.steps.map((step,i)=>`<button type="button" class="${i===Number(ai.guided.step||0)?'active':''}" data-ai-guide-step="${i}"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(step.label)}</b><small>${esc(S.LENSES[step.lens]?.label||step.lens)}</small></button>`).join('')}</div><div class="ai-controls"><button class="s24-action primary" type="button" data-ai-tool="explain-guide-step">Explain current step</button><button class="s24-action" type="button" data-ai-tool="next-guide-step">Next step</button><button class="s24-action" type="button" data-ai-tool="stop-guide">Stop guide</button></div></div>`:''}`;
  }
  function integratedToolsHTML(){
    const hasSelection=!!selection(),store=S.Workbench?.store,canCompare=!!(store?.compareA&&store?.compareB);
    return `<div class="ai-tool-grid">
      <button type="button" data-ai-tool="full-scan"><span>ANALYZE</span><b>Full Scan AI Brief</b><small>Summarize retained baseline, changes, cases, limits, and next steps.</small></button>
      <button type="button" data-ai-tool="selection" ${hasSelection?'':'disabled'}><span>CONTEXT</span><b>Explain selected evidence</b><small>${hasSelection?esc(selectionLabel()):'Select an object/process in Sentinel first.'}</small></button>
      <button type="button" data-ai-tool="compare" ${canCompare?'':'disabled'}><span>COMPARE</span><b>Compare A / B with AI</b><small>${canCompare?'Use Workbench Compare A/B evidence.':'Set Compare A and B in Workbench first.'}</small></button>
      <button type="button" data-ai-tool="manual"><span>LEARN</span><b>Manual Copilot</b><small>Answer from the in-app Sentinel User Manual before relying on general model knowledge.</small></button>
      <button type="button" data-ai-tool="notes"><span>DRAFT</span><b>Draft Investigation Notes</b><small>Turn the pinned evidence into an editable, clearly labeled investigation draft.</small></button>
      <button type="button" data-ai-tool="copy"><span>OUTPUT</span><b>Copy last AI answer</b><small>Copy generated text; it remains interpretation, not Sentinel evidence.</small></button>
    </div>`;
  }

  function renderAI(){
    const available=supportsLocalAI(),selected=currentModel(),loaded=loadedModel(),pinned=ai.pinnedLabel||ai.pinnedPacket?.lens||'No pinned context';
    const pending=ai.pendingPrompt?`<div class="ai-pending"><span>QUEUED FROM SENTINEL</span><b>${esc(ai.pendingPrompt)}</b><small>Context: ${esc(pinned)} · ${isReady()?'ready to run locally':'load a model to run this request'}</small><button class="s24-action primary" type="button" data-ai="run-pending" ${isReady()?'':'disabled'}>Run queued prompt</button></div>`:'';
    $('#evidenceStage').innerHTML=question('<button type="button" class="s24-action" data-ai-tool="full-scan">Full Scan AI Brief</button><button type="button" class="s24-action" data-ai-tool="manual">Manual Copilot</button>')+`<section class="s24-band"><div class="s24-band-index">01</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Local AI runtime & context</h2><p>Model loading is explicit. WebLLM runs in a Web Worker over WebGPU; Sentinel evidence remains the source of facts.</p></div></div><div class="ai-shell">
      <aside class="ai-panel"><header><span>WEBLLM · LOCAL</span><h2>${esc(statusLabel())}</h2><p>Browser and Native App View share the same persistent local model cache.</p></header><div class="ai-body">${available?`<div class="ai-selected-model"><span>SELECTED MODEL</span><strong>${esc(selected.name)}</strong><small>${esc(selected.focus)} · official WebLLM runtime estimate ${esc(formatGB(selected.vramMB))}</small></div><div class="ai-status"><div class="ai-status-row"><span>Selected</span><b>${esc(selected.id)}</b></div><div class="ai-status-row"><span>Loaded</span><b>${loaded?esc(loaded.name):'None'}</b></div><div class="ai-status-row"><span>Pinned context</span><b>${esc(pinned)}</b></div><div class="ai-status-row"><span>Inference</span><b>WebGPU · Web Worker</b></div><div class="ai-status-row"><span>Model cache</span><b>IndexedDB · local persistent storage</b></div><div class="ai-status-row"><span>Authority</span><b>Evidence explanation only · no shell execution</b></div></div><label class="ai-level"><span>Explanation level</span><select id="aiLevelSelect">${Object.entries(LEVELS).map(([id,v])=>`<option value="${id}" ${id===ai.level?'selected':''}>${esc(v.label)}</option>`).join('')}</select><small>Changes wording depth, never the evidence boundary.</small></label><div class="ai-progress"><progress id="aiLoadProgress" max="1" value="${Math.max(0,Math.min(1,ai.progress))}"></progress><small id="aiProgressText">${esc(ai.progressText)}</small></div><div class="ai-controls"><button class="s24-action primary" type="button" data-ai="load" ${ai.loading?'disabled':''}>${ai.engine&&ai.loadedModel===ai.model?'Reload selected model':'Load / Download selected'}</button><button class="s24-action" type="button" data-ai="unload" ${!ai.engine?'disabled':''}>Unload memory</button><button class="s24-action" type="button" data-ai="clear-context" ${!ai.pinnedPacket?'disabled':''}>Clear pinned context</button><button class="s24-action" type="button" data-ai="forget">Forget chat</button></div><div class="ai-boundary">Choose any model in Model Library. The first load downloads that model; later loads reuse WebLLM's persistent IndexedDB cache. You may cache several models over time, but Sentinel loads only one into GPU memory at a time.</div>`:`<div class="ai-unavailable"><b>WebGPU is not available in this WebView/browser.</b><br>Sentinel itself still works normally. Local AI remains disabled instead of falling back to a cloud model.</div>`}</div></aside>
      <div class="ai-panel"><header><span>ASK SENTINEL</span><h2>Explain evidence, not guesses</h2><p>Current Lens, Cross-Lens Selection, Manual excerpts, and optional Workbench user context are assembled into one bounded Evidence Packet.</p></header><div class="ai-body ai-chat">${pending}<div id="aiChatLog" class="ai-chat-log"></div><div class="ai-suggestions"><button type="button" data-ai-prompt="Explain what matters most in the pinned/current evidence in plain language.">Explain this</button><button type="button" data-ai-prompt="What should I inspect next, and why? Keep the recommendation bounded to Sentinel evidence.">Next step</button><button type="button" data-ai-prompt="Separate the strongest observed facts from interpretation, user context, manual guidance, and unknowns.">Facts vs interpretation</button><button type="button" data-ai-prompt="Explain the relevant timeline and relationship evidence without claiming causality.">Graph + timeline</button></div><form id="aiAskForm" class="ai-compose"><textarea id="aiQuestion" required placeholder="Ask about this page, selected process, case, relationship, Full Scan, Manual, or terminal concept…"></textarea><button class="s24-action primary" type="submit" ${!ai.engine||ai.generating?'disabled':''}>Ask locally</button></form></div></div></div></div></section>
      <section class="s24-band"><div class="s24-band-index">02</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Integrated AI tools</h2><p>AI is wired into retained Full Scan evidence, Cross-Lens Selection, Workbench context, and the in-app Manual.</p></div></div>${integratedToolsHTML()}</div></section>
      <section class="s24-band"><div class="s24-band-index">03</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Guided Investigation</h2><p>Choose a goal. Sentinel keeps the steps deterministic; Local AI explains the evidence at each step.</p></div></div>${guideHTML()}</div></section>
      <section class="s24-band"><div class="s24-band-index">04</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Terminal Copilot</h2><p>Paste a command for explanation. Local AI has no shell execution authority and cannot bypass Safe Change.</p></div><button type="button" class="s24-action" data-ai-tool="select-coder">Select Qwen Coder</button></div><form id="aiTerminalForm" class="ai-terminal-form"><textarea name="command" required placeholder="Example: codesign -dv --verbose=4 /Applications/Example.app"></textarea><button type="submit" class="s24-action primary">Explain command locally</button></form><div class="s24-note">Terminal Copilot explains intent, flags mutating behavior, and can suggest read-only inspection alternatives. It never executes the command.</div></div></section>
      ${available?`<section class="s24-band ai-library-band"><div class="s24-band-index">05</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Model Library</h2><p>Curated WebLLM 0.2.82 prebuilt models. Pick a model first, then use “Load / Download selected”. Memory numbers are WebLLM's runtime estimates, not download sizes.</p></div></div><div class="ai-model-library">${modelLibraryHTML()}</div></div></section>`:''}`;
    renderMessages();
    activity('Ready',100,available?`Local AI · ${isReady()?'model ready':'model loading is opt-in'} · context ${pinned}`:'Local AI unavailable · Sentinel evidence features remain active');
  }

  function updateProgress(report){ai.progress=Number(report?.progress||0);ai.progressText=report?.text||'Loading model…';const p=$('#aiLoadProgress'),t=$('#aiProgressText');if(p)p.value=Math.max(0,Math.min(1,ai.progress));if(t)t.textContent=ai.progressText;activity('Local AI',Math.round(ai.progress*100),ai.progressText);}
  async function loadAI(){
    if(!supportsLocalAI())throw new Error('WebGPU is not available in this browser/WebView.');
    if(ai.loading)return;
    ai.loading=true;ai.progress=0;ai.progressText='Loading WebLLM runtime…';renderAI();
    try{
      if(ai.engine){try{await ai.engine.unload();}catch{}ai.engine=null;ai.loadedModel=null;}
      if(ai.worker){ai.worker.terminate();ai.worker=null;}
      ai.module=ai.module||await import(WEBLLM_URL);
      const appConfig={...ai.module.prebuiltAppConfig,useIndexedDBCache:true};
      if(!appConfig.model_list?.some(record=>record.model_id===ai.model))throw new Error('Selected model is not present in WebLLM 0.2.82 prebuiltAppConfig.');
      ai.worker=new Worker('/app/ai-worker.js',{type:'module'});
      ai.engine=await ai.module.CreateWebWorkerMLCEngine(ai.worker,ai.model,{appConfig,initProgressCallback:updateProgress,logLevel:'WARN'});
      ai.loadedModel=ai.model;ai.progress=1;ai.progressText='Model ready in local WebGPU memory.';notice('Local AI model ready: '+currentModel().name+'.');
    }finally{ai.loading=false;renderAI();}
    if(ai.pendingPrompt&&ai.pendingAutoRun)setTimeout(()=>runPendingPrompt(),0);
  }
  async function unloadAI(){if(ai.engine)await ai.engine.unload().catch(()=>{});if(ai.worker)ai.worker.terminate();ai.engine=null;ai.worker=null;ai.loadedModel=null;ai.generating=false;ai.progress=0;ai.progressText='Model unloaded from memory. Cached model files remain local.';renderAI();}

  async function askAI(userQuestion,options={}){
    if(!ai.engine)throw new Error('Load Local AI first.');if(ai.generating)return;
    const mode=options.mode||ai.pendingMode||'evidence';
    const packet=options.packet||ai.pinnedPacket||await collectEvidencePacket({question:userQuestion});
    if(!packet.manual_context?.length)packet.manual_context=findManualTopics(userQuestion,4);
    ai.generating=true;ai.pendingPrompt='';ai.pendingAutoRun=false;
    ai.conversation.push({role:'user',content:userQuestion});ai.conversation.push({role:'assistant',content:'…'});renderAI();
    try{
      activity('Local AI',15,'Building bounded Sentinel Evidence Packet…');
      const history=ai.conversation.slice(0,-1).slice(-8).map(m=>({role:m.role,content:m.content}));
      const level=LEVELS[ai.level]||LEVELS.beginner;
      const messages=[{role:'system',content:`${SYSTEM_PROMPT}\n\nEXPLANATION LEVEL: ${level.label}. ${level.instruction}\n\n${modeInstruction(mode)}\n\nCURRENT SENTINEL EVIDENCE PACKET:\n${trimJSON(packet)}`},...history];
      const stream=await ai.engine.chat.completions.create({messages,stream:true,temperature:0.18,max_tokens:950});let text='';
      for await(const chunk of stream){text+=chunk?.choices?.[0]?.delta?.content||'';ai.conversation[ai.conversation.length-1].content=text||'…';const log=$('#aiChatLog');if(log){const last=log.querySelector('.ai-message:last-child pre');if(last)last.textContent=text||'…';log.scrollTop=log.scrollHeight;}}
      if(!text)ai.conversation[ai.conversation.length-1].content='The local model returned no text.';activity('Ready',100,'Local answer generated from bounded Sentinel evidence');
    }catch(error){ai.conversation[ai.conversation.length-1].content='Local AI error: '+(error?.message||String(error));notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}
    finally{ai.generating=false;renderAI();}
  }

  async function runPendingPrompt(){if(!ai.pendingPrompt)return;const prompt=ai.pendingPrompt,mode=ai.pendingMode,packet=ai.pinnedPacket;ai.pendingAutoRun=false;return askAI(prompt,{mode,packet});}
  async function prepareContextPrompt(prompt,options={}){
    activity('Local AI',6,'Pinning current Sentinel context…');
    const packet=options.packet||await collectEvidencePacket({question:prompt,lens:options.lens||state.lens,kind:options.kind||'contextual_request',includeBaseline:!!options.includeBaseline});
    ai.pinnedPacket=packet;ai.pinnedLabel=options.label||selectionLabel()||(S.LENSES[packet.lens]?.label||packet.lens);ai.pendingPrompt=prompt;ai.pendingMode=options.mode||'evidence';ai.pendingAutoRun=options.autoRun!==false;
    if(typeof S.navigate==='function')await S.navigate('assistant');else renderAI();
    if(isReady()&&ai.pendingAutoRun)setTimeout(()=>runPendingPrompt(),0);
  }
  async function prepareFullScanBrief(){const packet=await buildFullScanPacket();return prepareContextPrompt('Create a Full Scan AI Brief. Summarize the strongest observed evidence, important changes, likely routine or ambiguous items, visibility limits, and the most useful next investigation steps. Do not convert scores or novelty into a malware verdict.',{packet,label:'Full Scan retained baseline',mode:'full-scan',kind:'full_scan_brief'});}
  async function prepareSelectionExplanation(){if(!selection())throw new Error('Select evidence in Sentinel first.');return prepareContextPrompt('Explain the currently selected evidence. Start with exact identity and observed facts, then relationships/time context, interpretation, unknowns, and the safest useful next step.',{label:`Selection · ${selectionLabel()}`});}
  async function prepareCompare(){const packet=await buildComparePacket();return prepareContextPrompt('Compare Workbench Compare A and Compare B. Highlight exact identity, timing, relationships, reference/history, visibility gaps, and the largest evidence differences. Difference is not danger.',{packet,label:'Workbench Compare A / B',mode:'compare'});}
  async function prepareNotes(){const packet=ai.pinnedPacket||await collectEvidencePacket({question:'draft investigation notes'});return prepareContextPrompt('Draft editable investigation notes for the current evidence. Use sections: Scope, Observed, Interpretation, Unknowns, Follow-up. Clearly mark this as an AI draft and do not invent facts.',{packet,label:ai.pinnedLabel||'Current Sentinel context',mode:'notes'});}

  function installHeaderButton(){const actions=$('.s24-command-actions'),manual=$('#manualButton');if(!actions||$('#assistantButton'))return;const button=document.createElement('button');button.id='assistantButton';button.className='s24-quiet';button.type='button';button.textContent='Assistant';button.title='Open the integrated local WebLLM evidence assistant';actions.insertBefore(button,manual||$('#refreshButton'));}

  function contextBarHTML(){
    const lens=state.lens,selected=selection(),guide=currentGuide(),step=currentGuideStep();
    return `<section id="aiContextBar" class="ai-context-bar" aria-label="Local AI contextual tools"><div><span>LOCAL AI · ${isReady()?'READY':'OPT-IN'}</span><b>${esc(S.LENSES[lens]?.label||lens)} intelligence</b><small>${selected?`Cross-Lens Selection · ${esc(selectionLabel(selected))}`:`Current Lens context · ${esc(S.LENSES[lens]?.title||'')}`}${guide&&step?` · Guide: ${esc(guide.title)} (${Number(ai.guided.step||0)+1}/${guide.steps.length})`:''}</small></div><div><button type="button" class="s24-action primary" data-ai-context="explain-page">Explain with AI</button>${selected?'<button type="button" class="s24-action" data-ai-context="selection">Explain selection</button>':''}<button type="button" class="s24-action" data-ai-context="next-step">AI next step</button>${lens==='manual'?'<button type="button" class="s24-action" data-ai-context="manual">Ask Manual</button>':'<button type="button" class="s24-action" data-ai-context="ask">Ask AI</button>'}${guide&&step?'<button type="button" class="s24-action" data-ai-context="guide-explain">Explain guide step</button>':''}</div></section>`;
  }
  let surfaceQueued=false;
  function contextBarSignature(){
    const selected=selection(),guide=currentGuide();
    return [state.lens,isReady()?'ready':'opt-in',selected?.path||'',selected?.pid||'',selected?.label||'',guide?.id||'',ai.guided?.step??''].join('|');
  }
  function installContextBar(){
    const stage=$('#evidenceStage');if(!stage)return;
    if(state.lens==='assistant'){stage.querySelector('#aiContextBar')?.remove();return;}
    const q=stage.querySelector('.s24-question');if(!q)return;
    const anchor=stage.querySelector('.s24-action-dock')||q;
    const signature=contextBarSignature();
    let bar=stage.querySelector('#aiContextBar');
    if(!bar){anchor.insertAdjacentHTML('afterend',contextBarHTML());bar=stage.querySelector('#aiContextBar');if(bar)bar.dataset.aiSignature=signature;}
    else if(bar.dataset.aiSignature!==signature){const fresh=document.createElement('div');fresh.innerHTML=contextBarHTML();const replacement=fresh.firstElementChild;replacement.dataset.aiSignature=signature;bar.replaceWith(replacement);bar=replacement;}
    if(bar&&bar.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',bar);
  }
  function installScanAIBridge(){
    const panel=$('#scanFollowupPanel');if(panel&&!panel.querySelector('[data-ai-context="full-scan"]')){const button=document.createElement('button');button.type='button';button.className='s24-action primary ai-scan-brief';button.dataset.aiContext='full-scan';button.textContent='AI Full Scan Brief';button.title='Explain retained Full Scan evidence with the local model';panel.lastElementChild?.prepend(button);}
    const actions=$('#scanCenterBand .scan-card.full .scan-card-actions');if(actions&&!actions.querySelector('[data-ai-context="full-scan"]')){const b=document.createElement('button');b.type='button';b.className='s24-action';b.dataset.aiContext='full-scan';b.textContent='Explain retained baseline';actions.append(b);}
  }
  function installContextTrayBridge(){
    const tray=$('#contextTray'),body=$('#contextBody');if(!tray||tray.hidden||!body||body.querySelector('.ai-context-tray-bridge'))return;
    const section=document.createElement('section');section.className='s24-context-section ai-context-tray-bridge';section.innerHTML=`<h3>Local AI</h3><p>Pin this selected context into the read-only local assistant. AI interpretation stays separate from the raw evidence above.</p><div><button type="button" class="s24-action primary" data-ai-context="tray">Explain this context</button><button type="button" class="s24-action" data-ai-context="ask">Ask about it</button></div>`;body.append(section);
  }
  function installWorkbenchBridge(){
    const tray=$('#contextTray'),body=$('#contextBody');if(!tray||tray.hidden||!body||$('#contextTitle')?.textContent!=='Investigation Workbench'||body.querySelector('.ai-workbench-bridge'))return;
    const bridge=document.createElement('div');bridge.className='ai-workbench-bridge';bridge.innerHTML='<span>MODEL-BACKED LOCAL AI</span><b>Workbench selection, Compare A/B, investigation notes, and retained evidence can be pinned into WebLLM.</b><button type="button" class="s24-action primary" data-ai-context="workbench">Open integrated AI</button>';body.prepend(bridge);
  }
  function installSearchBridge(){
    const panel=$('#searchResults'),input=$('#globalSearch');if(!panel||!input)return;
    const q=input.value.trim(),existing=panel.querySelector('.ai-search-bridge');
    if(q.length<2||panel.hidden){existing?.remove();return;}
    if(existing?.dataset.aiQuery===q)return;
    existing?.remove();
    const wrap=document.createElement('div');wrap.className='ai-search-bridge';wrap.dataset.aiQuery=q;const button=document.createElement('button');button.type='button';button.dataset.aiSearchQuery=q;button.innerHTML=`<span>ASK LOCAL AI</span><div><b>${esc(q)}</b><small>Pin current Lens + selected evidence + matching Manual sections</small></div>`;wrap.append(button);panel.prepend(wrap);
  }
  function queueSurfaces(){if(surfaceQueued)return;surfaceQueued=true;queueMicrotask(()=>{surfaceQueued=false;installContextBar();installScanAIBridge();installContextTrayBridge();installWorkbenchBridge();installSearchBridge();});}

  function looksLikeQuestion(value){const q=String(value||'').trim();return /[?？]$/.test(q)||/^(why|what|how|explain|summari[sz]e|help|compare|should|can you|为什么|什么|如何|怎么|解释|总结|帮我|应该|分析)/i.test(q);}
  async function askFromSearch(query){return prepareContextPrompt(query,{label:`Search question · ${query.slice(0,60)}`,mode:/manual|how to|怎么用|如何使用|手册/i.test(query)?'manual':'evidence'});}

  function startGuide(id){const guide=GUIDES.find(g=>g.id===id);if(!guide)return;ai.guided={id,step:0,startedAt:Date.now()};persistGuide();renderAI();}
  async function openGuideStep(index){const guide=currentGuide();if(!guide)return;const i=Math.max(0,Math.min(guide.steps.length-1,Number(index||0)));ai.guided.step=i;persistGuide();const step=guide.steps[i];if(typeof S.navigate==='function')await S.navigate(step.lens);}
  async function explainGuideStep(){const guide=currentGuide(),step=currentGuideStep();if(!guide||!step)throw new Error('Start a Guided Investigation first.');return prepareContextPrompt(`${step.prompt} This is step ${Number(ai.guided.step||0)+1} of ${guide.steps.length} in the “${guide.title}” guided investigation.`,{label:`Guide · ${guide.title} · ${step.label}`});}
  async function nextGuideStep(){const guide=currentGuide();if(!guide)return;const next=Math.min(guide.steps.length-1,Number(ai.guided.step||0)+1);return openGuideStep(next);}

  const limits=S.MISSIONS.find(m=>m.id==='limits');if(limits&&!limits.lenses.includes('assistant')){const manualIndex=limits.lenses.indexOf('manual');if(manualIndex>=0)limits.lenses.splice(manualIndex,0,'assistant');else limits.lenses.push('assistant');}
  S.LENSES.assistant={label:'Assistant',verb:'EXPLAIN',title:'What does the collected evidence mean?',rule:'Use local AI to interpret Sentinel evidence; facts remain sourced by Sentinel, not invented by the model.'};
  registerLens('assistant',async()=>renderAI());
  if(S.actionDock?.actions)S.actionDock.actions.assistant=[{label:'Status',lens:'status',primary:true},{label:'Cases',lens:'cases'},{label:'Visibility',lens:'visibility'},{label:'Manual',lens:'manual'}];

  document.addEventListener('click',async event=>{
    if(event.target.closest('#assistantButton')){event.preventDefault();if(typeof S.navigate==='function')S.navigate('assistant');return;}
    const modelButton=event.target.closest('[data-ai-model]');if(modelButton){event.preventDefault();ai.model=modelButton.dataset.aiModel;localStorage.setItem('sentinel.ai.model',ai.model);ai.progressText=ai.engine&&ai.loadedModel!==ai.model?'Model selected. Load it to switch from the currently loaded model.':'Model selected. Load / Download when ready.';renderAI();return;}
    const context=event.target.closest('[data-ai-context]');if(context){event.preventDefault();try{
      const action=context.dataset.aiContext;
      if(action==='full-scan')return await prepareFullScanBrief();
      if(action==='selection')return await prepareSelectionExplanation();
      if(action==='manual')return await prepareContextPrompt('Using the Sentinel User Manual, explain how to use the current feature, what its results mean, and the most important cautions for a normal user.',{label:`Manual · ${S.LENSES[state.lens]?.label||state.lens}`,mode:'manual'});
      if(action==='tray')return await prepareContextPrompt('Explain the currently open Context Tray evidence. Separate what Sentinel can establish from what must not be inferred.',{label:`Context Tray · ${$('#contextTitle')?.textContent||'Selected evidence'}`});
      if(action==='workbench'){const packet=await collectEvidencePacket({question:'Explain my Workbench investigation context and selected evidence.'});return await prepareContextPrompt('Explain the active Workbench investigation context, selected evidence, and the strongest bounded next step.',{packet,label:'Investigation Workbench'});}
      if(action==='guide-explain')return await explainGuideStep();
      if(action==='next-step')return await prepareContextPrompt('What should I inspect next in Sentinel, and why? Base the recommendation only on the current evidence, selection, retained history, and visibility limits.',{label:`${S.LENSES[state.lens]?.label||state.lens} · next step`});
      if(action==='ask'){const packet=await collectEvidencePacket({question:'Ask about current context'});ai.pinnedPacket=packet;ai.pinnedLabel=`${S.LENSES[state.lens]?.label||state.lens} · current context`;ai.pendingPrompt='';if(typeof S.navigate==='function')await S.navigate('assistant');setTimeout(()=>$('#aiQuestion')?.focus(),0);return;}
      return await prepareContextPrompt('Explain what matters most on this Sentinel page. Separate observed facts, interpretation, unknowns, and the most useful next step.',{label:`Lens · ${S.LENSES[state.lens]?.label||state.lens}`});
    }catch(error){notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}return;}
    const search=event.target.closest('[data-ai-search-query]');if(search){event.preventDefault();$('#searchResults').hidden=true;return askFromSearch(search.dataset.aiSearchQuery||'');}
    const guideStart=event.target.closest('[data-ai-guide-start]');if(guideStart){event.preventDefault();startGuide(guideStart.dataset.aiGuideStart);return;}
    const guideStep=event.target.closest('[data-ai-guide-step]');if(guideStep){event.preventDefault();return openGuideStep(Number(guideStep.dataset.aiGuideStep||0));}
    const tool=event.target.closest('[data-ai-tool]');if(tool){event.preventDefault();try{
      const action=tool.dataset.aiTool;
      if(action==='full-scan')return await prepareFullScanBrief();
      if(action==='selection')return await prepareSelectionExplanation();
      if(action==='compare')return await prepareCompare();
      if(action==='manual'){const box=$('#aiQuestion');if(box){box.value='How do I use the Sentinel feature I am asking about? Answer from the in-app Manual and point out important cautions.';box.focus();}return;}
      if(action==='notes')return await prepareNotes();
      if(action==='copy'){const answer=[...ai.conversation].reverse().find(x=>x.role==='assistant'&&x.content&&x.content!=='…')?.content;if(!answer)throw new Error('No completed AI answer to copy.');await navigator.clipboard.writeText(answer);notice('Last Local AI answer copied.');return;}
      if(action==='select-coder'){ai.model='Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';localStorage.setItem('sentinel.ai.model',ai.model);ai.progressText='Qwen Coder selected. Load / Download when ready.';renderAI();return;}
      if(action==='explain-guide-step')return await explainGuideStep();
      if(action==='next-guide-step')return await nextGuideStep();
      if(action==='stop-guide'){ai.guided=null;persistGuide();renderAI();return;}
    }catch(error){notice(error?.message||String(error));activity('Error',0,error?.message||String(error));}return;}
    const control=event.target.closest('[data-ai]');if(control){event.preventDefault();const action=control.dataset.ai;try{if(action==='load')await loadAI();else if(action==='unload')await unloadAI();else if(action==='forget'){ai.conversation=[];renderMessages();}else if(action==='run-pending')await runPendingPrompt();else if(action==='clear-context'){ai.pinnedPacket=null;ai.pinnedLabel='';ai.pendingPrompt='';ai.pendingAutoRun=false;renderAI();}}catch(e){ai.loading=false;notice(e.message);renderAI();}return;}
    const prompt=event.target.closest('[data-ai-prompt]');if(prompt){const box=$('#aiQuestion');if(box){box.value=prompt.dataset.aiPrompt;box.focus();}}
  });

  document.addEventListener('change',event=>{if(event.target?.id==='aiLevelSelect'){ai.level=event.target.value;localStorage.setItem('sentinel.ai.level',ai.level);notice('AI explanation level: '+(LEVELS[ai.level]?.label||ai.level)+'.');}});
  document.addEventListener('submit',async event=>{
    if(event.target?.id==='aiAskForm'){event.preventDefault();const q=$('#aiQuestion')?.value?.trim();if(q){$('#aiQuestion').value='';try{await askAI(q,{packet:ai.pinnedPacket||null,mode:/manual|how to|怎么用|如何使用|手册/i.test(q)?'manual':'evidence'});}catch(e){notice(e.message);}}return;}
    if(event.target?.id==='aiTerminalForm'){event.preventDefault();const command=String(new FormData(event.target).get('command')||'').trim();if(!command)return;const packet=ai.pinnedPacket||await collectEvidencePacket({question:command,kind:'terminal_help'});const prompt=`Explain this terminal command without executing it:\n\n${command}\n\nDescribe purpose, important flags/arguments, whether it is read-only or mutating, what output a user should expect in general, and safer read-only alternatives if relevant.`;ai.pinnedPacket={...packet,terminal_command:command};ai.pinnedLabel='Terminal Copilot';ai.pendingMode='terminal';if(isReady())await askAI(prompt,{packet:ai.pinnedPacket,mode:'terminal'});else{ai.pendingPrompt=prompt;ai.pendingAutoRun=true;renderAI();}return;}
  });

  document.addEventListener('keydown',event=>{
    if(event.target?.id!=='globalSearch'||event.key!=='Enter'||event.defaultPrevented)return;
    const q=event.target.value.trim();if(q.length<2||!looksLikeQuestion(q))return;
    event.preventDefault();event.stopPropagation();askFromSearch(q).catch(e=>notice(e.message));
  });

  const stage=$('#evidenceStage');if(stage)new MutationObserver(queueSurfaces).observe(stage,{childList:true});
  const tray=$('#contextTray');if(tray)new MutationObserver(queueSurfaces).observe(tray,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  const searchPanel=$('#searchResults');if(searchPanel)new MutationObserver(queueSurfaces).observe(searchPanel,{childList:true});
  $('#globalSearch')?.addEventListener('input',()=>setTimeout(queueSurfaces,0));

  installHeaderButton();queueSurfaces();
  S.localAI={
    marker:AI_MARKER,fusionMarker:AI_FUSION_MARKER,models:MODELS,tiers:TIER_META,levels:LEVELS,guides:GUIDES,state:ai,
    supportsLocalAI,isReady,collectEvidencePacket,selectedEvidence,findManualTopics,buildFullScanPacket,buildComparePacket,
    loadAI,unloadAI,askAI,prepareContextPrompt,prepareFullScanBrief,prepareSelectionExplanation,prepareCompare,
    installContextBar,installContextTrayBridge,installSearchBridge,startGuide,openGuideStep,
  };
})();
