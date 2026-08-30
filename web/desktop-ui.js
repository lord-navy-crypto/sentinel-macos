// SPDX-License-Identifier: MPL-2.0
(() => {
  /*
   * Desktop App View V3
   *
   * This is not a rearrangement of the browser dashboard. The browser DOM is
   * retained only as a compatibility/event-binding layer for app.js. Desktop
   * builds a new product shell from first principles and adopts only functional
   * atoms (inputs, buttons, result containers, live status nodes) into it.
   *
   * Compatibility note: the old navigation label "More tools" remains in the
   * hidden browser layer because tests and app.js may still inspect that tree.
   */
  if (window.__sentinelDesktopV3) return;
  window.__sentinelDesktopV3 = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (tag, className = '', text = '') => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== '') n.textContent = text;
    return n;
  };
  const byId = id => document.getElementById(id);
  const move = id => byId(id);
  const moveSelector = selector => $(selector);

  const legacyApp = $('.app');
  if (!legacyApp) return;
  legacyApp.classList.add('desktop-compat-layer');
  document.body.classList.remove('easy-mode');

  const legacyAdvanced = $('.nav-group-label.advanced-nav');
  if (legacyAdvanced) {
    legacyAdvanced.textContent = 'More tools';
    legacyAdvanced.hidden = true;
  }

  const VIEWS = {
    overview:    {space:'pulse', label:'Status',     title:'System status',        sub:'A decision surface for what matters now.'},
    quickcheck:  {space:'pulse', label:'Snapshot',   title:'Evidence snapshot',    sub:'One bounded read-only observation, ranked for review.'},
    incidents:   {space:'examine', label:'Cases',    title:'Cases',                sub:'Related observations grouped into investigation stories.'},
    weakness:    {space:'examine', label:'Search',   title:'Search evidence',      sub:'Find an object first; expand scope only when current evidence is insufficient.'},
    intelligence:{space:'examine', label:'Relations',title:'Relationship view',    sub:'Connect startup, files, processes, network, time, and object context.'},
    security:    {space:'examine', label:'Audit',    title:'Evidence audit',       sub:'Review explainable signals without turning a score into a verdict.'},
    integrity:   {space:'examine', label:'Object',   title:'Object verification',  sub:'Inspect one exact file or app with hashes and macOS trust context.'},
    changes:     {space:'observe', label:'Changes',  title:'Change stream',        sub:'Watch a narrow scope and inspect only what actually changed.'},
    behavior:    {space:'observe', label:'Behavior', title:'Behavior comparison',  sub:'Compare bounded observations across time.'},
    trust:       {space:'observe', label:'Reference',title:'Reference comparison', sub:'Measure drift from a state you explicitly approved.'},
    hardware:    {space:'system', label:'Machine',   title:'Machine',              sub:'Hardware and runtime context for this investigation.'},
    processes:   {space:'system', label:'Running',   title:'Running software',     sub:'Processes as identities, executables, signatures, and connections.'},
    startup:     {space:'system', label:'Auto-start',title:'Automatic launch',     sub:'What is configured to start without a manual launch.'},
    persistence: {space:'system', label:'Persistence',title:'Persistence drift',   sub:'Session comparison of visible launch configuration.'},
    background:  {space:'system', label:'Background',title:'Background items',     sub:'Modern macOS background registrations.'},
    network:     {space:'system', label:'Network',   title:'Network activity',     sub:'Current TCP context connected back to local processes.'},
    storage:     {space:'system', label:'Storage',   title:'Storage',              sub:'Measure first; distinguish exact duplicates from naming heuristics.'},
    cleanup:     {space:'resolve', label:'Reclaim',  title:'Reclaim space',        sub:'Estimate reviewable storage without automatic deletion.'},
    actions:     {space:'resolve', label:'Change',   title:'Reversible change',    sub:'Preview impact, confirm explicitly, preserve recovery.'},
    guide:       {space:'guide', label:'Access',     title:'Access & interpretation',sub:'Visibility boundaries and the shortest safe operating path.'}
  };

  const SPACES = [
    {id:'pulse',   label:'Pulse',   hint:'What matters now',          views:['overview','quickcheck']},
    {id:'examine', label:'Examine', hint:'Build an explanation',      views:['incidents','weakness','intelligence','security','integrity']},
    {id:'observe', label:'Observe', hint:'Compare across time',       views:['changes','behavior','trust']},
    {id:'system',  label:'System',  hint:'Inspect the machine',       views:['hardware','processes','startup','persistence','background','network','storage']},
    {id:'resolve', label:'Resolve', hint:'Make reversible changes',   views:['cleanup','actions']},
    {id:'guide',   label:'Guide',   hint:'Limits and interpretation', views:['guide']}
  ];

  const shell = el('div','fp-shell');
  const rail = el('aside','fp-rail');
  const stage = el('section','fp-stage');
  const railHead = el('div','fp-brand');
  railHead.append(el('div','fp-brandmark','S'), (() => { const x=el('div'); x.append(el('b','','Sentinel'),el('span','','Local evidence system')); return x; })());
  const railNav = el('nav','fp-space-nav');
  const railFoot = el('div','fp-rail-foot');
  rail.append(railHead, railNav, railFoot);

  const top = el('header','fp-topbar');
  const identity = el('div','fp-view-identity');
  const spaceName = el('span','fp-breadcrumb');
  const viewTitle = el('h1','fp-view-title');
  const viewSub = el('p','fp-view-sub');
  identity.append(spaceName,viewTitle,viewSub);

  const searchHost = el('div','fp-search-host');
  const oldSearchWrap = moveSelector('.global-search-wrap');
  if (oldSearchWrap) {
    oldSearchWrap.className = 'fp-global-search';
    const input = byId('globalSearch');
    if (input) input.placeholder = 'Search evidence: process, path, endpoint, severity…';
    searchHost.appendChild(oldSearchWrap);
  }

  const topActions = el('div','fp-top-actions');
  topActions.append(el('span','fp-local-pill','LOCAL'));
  const refresh = move('refresh');
  const help = move('pageHelpToggle');
  if (help) { help.textContent='Context'; help.className='fp-button quiet'; topActions.appendChild(help); }
  if (refresh) { refresh.textContent='Refresh'; refresh.className='fp-button quiet'; topActions.appendChild(refresh); }
  top.append(identity,searchHost,topActions);

  const tabs = el('nav','fp-tabs');
  const messages = el('div','fp-messages');
  const pageHelp = move('pageHelp');
  const notice = move('notice');
  if (pageHelp) messages.appendChild(pageHelp);
  if (notice) messages.appendChild(notice);
  const screens = el('main','fp-screens');
  stage.append(top,tabs,messages,screens);
  shell.append(rail,stage);
  document.body.appendChild(shell);

  const exportReport = move('exportReport');
  if (exportReport) {
    exportReport.textContent='Export evidence';
    exportReport.className='fp-button rail-action';
    railFoot.appendChild(exportReport);
  }
  const localState = el('div','fp-local-state');
  localState.append(el('i'),(() => {const x=el('span');x.append(el('b','','Loopback session'),el('small','','127.0.0.1 · reversible actions only'));return x;})());
  railFoot.appendChild(localState);

  function legacyButton(view){ return $(`.desktop-compat-layer .nav[data-view="${view}"]`); }
  function currentLegacyView(){ return $('.desktop-compat-layer .view.active')?.id || 'overview'; }
  function selectView(view){
    const b=legacyButton(view);
    if (b) b.click();
    sync(view);
  }

  for (const space of SPACES) {
    const b=el('button','fp-space'); b.type='button'; b.dataset.space=space.id;
    b.append(el('strong','',space.label),el('small','',space.hint));
    b.addEventListener('click',()=>selectView(space.views[0]));
    railNav.appendChild(b);
  }

  function atom(id, className=''){
    const n=move(id); if(!n)return null;
    if(className)n.className=className;
    return n;
  }
  function selectorAtom(selector,className=''){
    const n=moveSelector(selector); if(!n)return null;
    if(className)n.className=className;
    return n;
  }
  function append(parent,...nodes){ for(const n of nodes.flat()){ if(n) parent.appendChild(n); } return parent; }
  function heading(kicker,title,body=''){
    const h=el('div','fp-section-head');
    if(kicker)h.append(el('span','fp-kicker',kicker));
    h.append(el('h2','',title));
    if(body)h.append(el('p','',body));
    return h;
  }
  function panel(title,body='',nodes=[],className=''){
    const p=el('section',`fp-panel ${className}`.trim());
    p.appendChild(heading('',title,body)); append(p,nodes); return p;
  }
  function toolbar(nodes=[]){ const t=el('div','fp-toolbar'); append(t,nodes); return t; }
  function screen(view, kicker, question, rule=''){
    const s=el('section','fp-screen'); s.dataset.view=view;
    const head=el('div','fp-screen-head');
    head.append(el('span','fp-kicker',kicker),el('h2','fp-question',question));
    if(rule)head.append(el('p','fp-rule',rule));
    s.appendChild(head); screens.appendChild(s); return s;
  }
  function note(text,tone=''){ const n=el('div',`fp-note ${tone}`.trim(),text); return n; }
  function two(left,right,cls=''){ const g=el('div',`fp-grid two ${cls}`.trim()); append(g,left,right); return g; }
  function three(a,b,c,cls=''){ const g=el('div',`fp-grid three ${cls}`.trim()); append(g,a,b,c); return g; }
  function retitle(id,text){ const n=byId(id); if(n)n.textContent=text; return n; }

  function rebuildMetrics(){
    const old=selectorAtom('.hero-grid'); if(!old)return null;
    old.className='fp-vitals';
    [...old.children].forEach((child,index)=>{
      child.className='fp-vital'; child.dataset.index=String(index+1);
      const action=$('.inline-action',child); if(action)action.className='fp-link';
    });
    return old;
  }
  function rebuildQuickMetrics(){ const n=atom('quickCheckMetrics','fp-snapshot-metrics hidden'); return n; }
  function normalizeForm(id,extra=''){ const f=atom(id,`fp-form ${extra}`.trim()); return f; }

  // PULSE — STATUS
  {
    const s=screen('overview','PULSE','What deserves attention now?','State first. Narrow the question before opening a deeper tool.');
    const lead=el('section','fp-hero');
    lead.append(heading('LOCAL EVIDENCE','Start with state, not alerts.','Sentinel is useful when it reduces uncertainty. Observe the machine, choose one question, then inspect the smallest evidence set that can answer it.'));
    const welcome=selectorAtom('.welcome-actions','fp-hero-actions'); if(welcome)lead.appendChild(welcome);
    const vitals=rebuildMetrics();
    const context=panel('Machine context','A small current snapshot, not a diagnosis.',[atom('systemKV','fp-kv')]);
    retitle('runReadiness','Verify Sentinel');
    const readiness=panel('Sentinel readiness','Checks the tool that is producing the evidence, not the Mac for malware.',[toolbar([atom('runReadiness','fp-button')]),atom('readinessBody','fp-result')]);
    retitle('loadCapabilities','Refresh sources'); retitle('exportDiagnostics','Export diagnostics');
    const sources=panel('Evidence boundary','Which local tools and permissions are actually contributing evidence.',[toolbar([atom('loadCapabilities','fp-button quiet'),atom('exportDiagnostics','fp-button quiet')]),atom('capabilityGrid','fp-list')]);
    retitle('loadSelfIntegrity','Verify engine');
    const self=panel('Engine identity','The exact Sentinel binary serving this local session.',[toolbar([atom('loadSelfIntegrity','fp-button quiet')]),atom('selfIntegrityBody','fp-result')]);
    append(s,lead,vitals,two(context,readiness),two(sources,self));
  }

  // PULSE — SNAPSHOT
  {
    const s=screen('quickcheck','OBSERVE','What should I review first?','One read-only capture. No baseline, reference, or file state is changed.');
    retitle('runQuickCheck','Take snapshot'); retitle('guidedSnapshot','Capture full evidence');
    const run=toolbar([atom('runQuickCheck','fp-button primary'),atom('guidedSnapshot','fp-button')]);
    const status=panel('Attention state','A prioritization surface, not a probability of compromise.',[run,atom('quickCheckStatus','fp-result spotlight'),rebuildQuickMetrics()],'fp-attention');
    retitle('loadReviewQueue','Refresh queue');
    const queue=panel('Review queue','Evidence that deserves inspection, ordered for attention.',[toolbar([atom('loadReviewQueue','fp-button quiet')]),atom('reviewQueue','fp-feed')]);
    const next=panel('Next paths','These routes only open evidence; they do not take action.',[atom('quickRecommendations','fp-feed')]);
    append(s,status,two(queue,next));
  }

  // EXAMINE — CASES
  {
    const s=screen('incidents','CORRELATE','Which observations belong to the same story?','Confidence means relationship strength between evidence, never malware probability.');
    retitle('rebuildIncidents','Rebuild cases'); retitle('loadIncidentHistory','History');
    const summary=panel('Case state','Correlate related filesystem, persistence, behavior, and reference observations.',[toolbar([atom('rebuildIncidents','fp-button primary'),atom('loadIncidentHistory','fp-button quiet')]),atom('incidentSummary','fp-result')]);
    const list=panel('Case queue','Read the strongest connected story before opening individual objects.',[atom('incidentList','fp-feed')],'fp-case-list');
    const deep=atom('incidentDeepReviewCard','fp-state-panel hidden');
    if(deep){ const h=$('h2',deep); if(h)h.textContent='Selected case'; const p=$('.section-head p',deep); if(p)p.textContent='Reinspect the primary object with current evidence.'; retitle('closeIncidentDeepReview','Close'); }
    const detail=panel('Case detail','A selected case can be re-inspected without changing files.',[deep || note('Choose a case to open its evidence.')]);
    append(s,summary,two(list,detail,'fp-case-grid'),note('READ: timeline + object identity + persistence + drift together. DO NOT INFER: a high case severity is not proof of malicious intent.','boundary'));
  }

  // EXAMINE — SEARCH
  {
    const s=screen('weakness','QUERY','What exact object or blind spot am I trying to understand?','Search current evidence first. Broaden to filename discovery only when necessary.');
    const deep=normalizeForm('deepSearchForm','fp-form-search');
    retitle('runDeepSearch','Search filenames');
    const query=panel('Target search','Filename discovery reads names and paths only; it does not index file contents.',[deep,atom('deepSearchMeta','fp-meta'),atom('deepSearchResults','fp-feed')]);
    retitle('runWeaknessAudit','Audit visibility'); retitle('loadCoverage','Refresh coverage'); retitle('loadAdvancedSensor','Check boundary');
    const coverage=panel('Can Sentinel answer this?','Visibility limits are part of the result. Missing evidence should lower confidence, not create guesses.',[toolbar([atom('runWeaknessAudit','fp-button'),atom('loadCoverage','fp-button quiet')]),atom('weaknessAudit','fp-result'),atom('coverageMap','fp-result')]);
    const sensor=panel('Advanced sensor boundary','Endpoint Security requires Apple entitlement and a System Extension. Sentinel must not pretend it is active.',[toolbar([atom('loadAdvancedSensor','fp-button quiet')]),atom('advancedSensorStatus','fp-result')]);
    append(s,two(query,coverage,'fp-search-grid'),sensor);
  }

  // EXAMINE — RELATIONS
  {
    const s=screen('intelligence','CONNECT','How do objects relate, and in what order?','Relationship, time, and object context are read together.');
    retitle('captureEvidence','Capture evidence'); retitle('loadEvidence','Refresh relations'); retitle('loadTimeline','Refresh timeline');
    const topLine=panel('Capture',[].join(''),[toolbar([atom('captureEvidence','fp-button primary'),atom('loadEvidence','fp-button quiet')]),atom('evidenceSummary','fp-evidence-summary'),atom('evidenceNote','fp-meta')]);
    const graph=panel('Relationship canvas','Startup → file → process → network. The graph is a map of observed relationships, not a threat diagram.',[atom('graphWrap','fp-graph'),atom('graphObjects','fp-object-index')],'fp-graph-panel');
    const objectStory=atom('objectStory','fp-state-panel'); if(objectStory){ const h=$('h2',objectStory); if(h)h.textContent='Selected object'; }
    const object=panel('Object inspector','All currently correlated evidence for one object.',[objectStory || atom('storyBody','fp-result')],'fp-inspector');
    const timeline=panel('Time','Changes observed in Sentinel captures.',[toolbar([atom('loadTimeline','fp-button quiet')]),atom('timelineList','fp-feed')]);
    append(s,topLine,two(graph,object,'fp-relation-grid'),timeline);
  }

  // EXAMINE — AUDIT
  {
    const s=screen('security','ASSESS','Which evidence deserves review, and why?','The score ranks attention. It is not a malware probability.');
    retitle('runAudit','Run audit');
    const summary=el('section','fp-audit-head');
    summary.append(toolbar([atom('runAudit','fp-button primary')]));
    const score=el('div','fp-score-pair');
    score.append((()=>{const x=el('div');x.append(el('span','','Priority'),atom('riskScore','fp-score'));return x;})(),(()=>{const x=el('div');x.append(el('span','','Assessment'),atom('riskLevel','fp-score-label'));return x;})());
    summary.append(score,atom('riskDisclaimer','fp-meta'));
    const findings=panel('Evidence findings','Each item should explain what was observed and why it is worth review.',[atom('findings','fp-feed')]);
    append(s,summary,findings,note('Signed code can still behave badly; unsigned code can still be legitimate. Treat signing, location, persistence, and network context as separate evidence.','boundary'));
  }

  // EXAMINE — OBJECT
  {
    const s=screen('integrity','VERIFY','What can I establish about this exact object?','Hash, signature, and Gatekeeper context identify and describe an object; they do not prove intent.');
    const form=normalizeForm('integrityForm','fp-object-form'); retitle('inspectIntegrity','Verify object');
    append(s,panel('Target','Inspect one path on demand.',[form]),panel('Verification result','Read identity evidence before interpretation.',[atom('integrityBody','fp-result detail')]));
  }

  // OBSERVE — CHANGES
  {
    const s=screen('changes','WATCH','What changed inside the scope I chose?','A narrow watch is more useful than pretending to monitor the whole system.');
    const controls=selectorAtom('.change-controls','fp-watch-controls');
    retitle('startChanges','Start'); retitle('stopChanges','Stop'); retitle('reviewChanges','Reinspect changed'); retitle('reconcileChanges','Reconcile'); retitle('clearChanges','Clear inbox'); retitle('loadChangeHistory','History'); retitle('refreshChanges','Refresh');
    const watch=panel('Watch scope','Choose where to observe. Native FSEvents is used when available; bounded polling is the fallback.',[controls,atom('changeStatus','fp-result')]);
    const inbox=panel('Change stream','Newest observations first.',[toolbar([atom('loadChangeHistory','fp-button quiet'),atom('refreshChanges','fp-button quiet')]),atom('changeEvents','fp-feed')],'fp-stream');
    const review=panel('Reinspection','Re-check only changed startup configuration and a bounded set of changed regular files.',[atom('changeReview','fp-result')]);
    append(s,two(watch,inbox,'fp-watch-grid'),review);
  }

  // OBSERVE — BEHAVIOR
  {
    const s=screen('behavior','COMPARE','What is different from the previous observation?','Change pressure measures difference, not danger.');
    retitle('captureBehavior','Capture & compare'); retitle('loadBehavior','Load'); retitle('loadBehaviorHistory','Trend'); retitle('loadBehaviorHealth','Verify history');
    const state=panel('Comparison state','Current bounded metadata against the previous capture.',[toolbar([atom('captureBehavior','fp-button primary'),atom('loadBehavior','fp-button quiet')]),atom('behaviorSummary','fp-compare-strip'),atom('behaviorBaseline','fp-meta')]);
    const changes=panel('Observed differences','Review changes as evidence, not verdicts.',[atom('behaviorChanges','fp-feed')]);
    const trend=panel('Change trend','A bounded history of evidence pressure.',[toolbar([atom('loadBehaviorHistory','fp-button quiet')]),atom('behaviorTrend','fp-result'),atom('behaviorHistoryList','fp-feed')]);
    const health=panel('History integrity','Can the stored comparison history be read reliably?',[toolbar([atom('loadBehaviorHealth','fp-button quiet')]),atom('baselineHealth','fp-result')]);
    append(s,state,two(changes,trend),health);
  }

  // OBSERVE — REFERENCE
  {
    const s=screen('trust','REFERENCE','What differs from the state I explicitly approved?','A reference is context, not a permanent safety certificate.');
    retitle('compareTrust','Compare'); retitle('captureTrust','Set reference'); retitle('loadTrustHealth','Verify reference'); retitle('exportTrust','Export'); retitle('restoreTrust','Restore previous'); retitle('loadTrustHistory','History');
    const state=panel('Reference state','Identity and bounded fingerprints compared with your chosen reference.',[toolbar([atom('compareTrust','fp-button primary'),atom('captureTrust','fp-button'),atom('exportTrust','fp-button quiet'),atom('restoreTrust','fp-button quiet')]),atom('trustSummary','fp-compare-strip'),atom('trustStatus','fp-meta')]);
    const drift=panel('Drift evidence','Differences from the reference, prioritized for review.',[atom('trustChanges','fp-feed')]);
    const history=panel('Comparison history','Recent comparisons against the reference active at that time.',[toolbar([atom('loadTrustHistory','fp-button quiet')]),atom('trustHistoryList','fp-feed')]);
    const health=panel('Reference integrity','Verify the current and previous reference stores.',[toolbar([atom('loadTrustHealth','fp-button quiet')]),atom('trustHealth','fp-result')]);
    append(s,state,two(drift,history),health);
  }

  // SYSTEM — MACHINE
  {
    const s=screen('hardware','CONTEXT','What machine is this evidence coming from?','Hardware explains capability and compatibility; unique device identifiers are unnecessary here.');
    retitle('loadSystemProfile','Read machine');
    const identityPanel=panel('Machine identity','Model, processor, architecture, and Sentinel engine context.',[toolbar([atom('loadSystemProfile','fp-button primary')]),atom('hardwareSummary','fp-result')]);
    const hw=panel('Hardware','Physical resources reported by macOS.',[atom('hardwareGrid','fp-kv')]);
    const sw=panel('Runtime','Operating system, kernel, architecture, and translation context.',[atom('softwareGrid','fp-kv')]);
    append(s,identityPanel,two(hw,sw));
  }

  // SYSTEM — RUNNING
  {
    const s=screen('processes','LIVE','What is running right now?','Inspect a process as an identity with executable and network context.');
    retitle('loadProcesses','Refresh');
    const filter=atom('processFilter','fp-input'); if(filter)filter.placeholder='Filter processes';
    const list=panel('Process list','Current snapshot, ordered by the underlying engine.',[toolbar([filter,atom('loadProcesses','fp-button quiet')]),atom('processTable','fp-table')]);
    const detail=atom('processDetail','fp-state-panel hidden'); if(detail){const h=$('h2',detail);if(h)h.textContent='Selected process';retitle('closeProcessDetail','Close');}
    append(s,two(list,panel('Process inspector','Select a process to correlate executable identity, signature, and TCP activity.',[detail || note('Select a process.')]),'fp-process-grid'));
  }

  // SYSTEM — AUTO-START
  {
    const s=screen('startup','DECLARE','What is configured to launch automatically?','Automatic launch is normal for many legitimate helpers; context matters.');
    retitle('loadStartup','Refresh');
    append(s,panel('Launch declarations','Review path, signature, and selected manifest behavior together.',[toolbar([atom('loadStartup','fp-button quiet')]),atom('startupTable','fp-table')]));
  }

  // SYSTEM — PERSISTENCE
  {
    const s=screen('persistence','COMPARE','Did launch configuration change during this session?','This is a session SHA-256 comparison of visible launch configuration, not continuous surveillance.');
    retitle('capturePersistence','Capture / compare'); retitle('loadPersistence','Refresh');
    append(s,panel('Persistence state','Additions, removals, and same-name content changes.',[toolbar([atom('capturePersistence','fp-button primary'),atom('loadPersistence','fp-button quiet')]),atom('persistenceSummary','fp-meta'),atom('persistenceChanges','fp-feed')]));
  }

  // SYSTEM — BACKGROUND
  {
    const s=screen('background','REGISTER','What background registrations exist beyond classic launch files?','Read-only view of macOS Background Task Management when available.');
    retitle('loadBackground','Refresh');
    append(s,panel('Background registrations','Modern registrations complement, rather than replace, classic startup evidence.',[toolbar([atom('loadBackground','fp-button quiet')]),atom('backgroundNote','fp-meta'),atom('backgroundTable','fp-table')]));
  }

  // SYSTEM — NETWORK
  {
    const s=screen('network','LIVE','Which local processes currently have TCP activity?','A connection is context. Public endpoints are common and are not suspicious by themselves.');
    retitle('loadNetwork','Refresh');
    append(s,panel('TCP snapshot','Read endpoints together with the local process that owns them.',[toolbar([atom('loadNetwork','fp-button quiet')]),atom('networkTable','fp-table')]));
  }

  // SYSTEM — STORAGE
  {
    const s=screen('storage','MEASURE','Where is storage pressure coming from?','Measure first. Exact duplicates and filename-version heuristics are different kinds of evidence.');
    const presets=selectorAtom('.preset-row','fp-presets');
    const form=normalizeForm('scanForm','fp-storage-form'); retitle('startScan','Measure'); retitle('cancelScan','Cancel');
    const control=panel('Measurement','Choose scope, minimum size, and result budget.',[presets,form,atom('scanProgress','fp-result hidden'),atom('scanSummary','fp-meta')]);
    const areas=panel('Largest areas','Measured categories in this scan.',[atom('categoryBars','fp-bars')]);
    const types=panel('File types','Measured footprint by type.',[atom('typeBars','fp-bars')]);
    const files=panel('Largest objects','Objects that crossed the selected threshold.',[atom('fileFilter','fp-input'),atom('filesTable','fp-table')]);
    const dup=panel('Exact duplicates','Size match followed by local SHA-256 comparison.',[atom('hashAmount','fp-chip'),atom('duplicates','fp-feed')]);
    const fam=panel('Possible versions','Filename-family heuristic only; not proof that an object is disposable.',[atom('families','fp-feed')]);
    append(s,control,two(areas,types),files,two(dup,fam));
  }

  // RESOLVE — RECLAIM
  {
    const s=screen('cleanup','REVIEW','What storage can be reviewed without deleting anything automatically?','Reclaim is an estimate and review surface. Eligible objects move to the reversible change workflow.');
    retitle('previewCleanup','Analyze');
    append(s,panel('Reclaimable estimate','Measure common reviewable storage categories first.',[toolbar([atom('previewCleanup','fp-button primary')]),atom('cleanupTotal','fp-result hidden'),atom('cleanupList','fp-feed')]));
  }

  // RESOLVE — CHANGE
  {
    const s=screen('actions','RESOLVE','What is the smallest reversible change supported by the evidence?','Changing the system is the last step. Preview impact, confirm explicitly, and preserve a recovery path.');
    retitle('loadActionHealth','Verify recovery'); retitle('previewAction','Preview impact'); retitle('revealActionPath','Reveal target'); retitle('executeAction','Confirm change'); retitle('loadVault','Refresh Vault'); retitle('loadActionJournal','Refresh journal');
    const safety=panel('1 · Recovery readiness','Before changing anything, verify the Vault, journal, and recovery state.',[toolbar([atom('loadActionHealth','fp-button quiet')]),atom('actionStatus','fp-result'),note('No permanent delete · no overwrite · regular user-home files only.','warning')]);
    const form=normalizeForm('actionForm','fp-action-form');
    const preview=atom('actionPreviewCard','fp-state-panel hidden'); if(preview){const h=$('h2',preview);if(h)h.textContent='Impact confirmation';}
    const target=panel('2 · Target and impact','Choose one object, then build a fresh dependency-aware preview.',[form,preview]);
    const vault=panel('3 · Recovery','Vaulted items remain locally recoverable. Restore refuses to overwrite an occupied original path.',[toolbar([atom('loadVault','fp-button quiet')]),atom('vaultList','fp-feed')]);
    const journal=panel('Operation history','Bounded local record of reversible changes and immediate post-action observations.',[toolbar([atom('loadActionJournal','fp-button quiet')]),atom('actionJournal','fp-feed')]);
    append(s,two(safety,target,'fp-resolve-grid'),two(vault,journal));
  }

  // GUIDE — rebuilt from scratch, no old browser content reused.
  {
    const s=screen('guide','MODEL','How should I use and interpret Sentinel?','Use the shortest path that can answer the question. Missing visibility is uncertainty, not evidence.');
    const path=el('div','fp-path');
    [['1','Observe','Start with Status or Snapshot.'],['2','Examine','Search, correlate, audit, or verify only as needed.'],['3','Compare','Use change, behavior, or reference views when time matters.'],['4','Resolve','Only after evidence review, use a reversible action.']].forEach(([n,t,d])=>{const x=el('div','fp-path-step');x.append(el('span','',n),el('b','',t),el('small','',d));path.appendChild(x);});
    const permissions=panel('Visibility','Normal access provides substantial local evidence. Full Disk Access can expand protected-path visibility. Endpoint Security requires Apple entitlement and a System Extension.',[note('Sentinel cannot grant itself macOS permissions and should never invent conclusions for evidence it cannot read.','boundary')]);
    const semantics=panel('Evidence semantics','Keep these concepts separate.',[]);
    const defs=el('dl','fp-defs');
    [['Priority','What deserves review first.'],['Confidence','How strongly observations belong together.'],['Signature','Whether signed code validates.'],['Gatekeeper','macOS distribution/trust context.'],['Reference match','Whether current identity matches a user-approved reference.'],['Change','A difference between bounded observations.']].forEach(([k,v])=>{defs.append(el('dt','',k),el('dd','',v));});
    semantics.appendChild(defs); append(s,path,two(permissions,semantics));
  }

  // Remove presentation semantics from the adopted browser atoms. Their IDs and
  // attached listeners stay intact; only the new shell defines visual structure.
  $$('.fp-shell .card').forEach(n=>n.classList.remove('card'));
  $$('.fp-shell .two-col').forEach(n=>n.classList.remove('two-col'));
  $$('.fp-shell .section-head').forEach(n=>n.classList.add('fp-legacy-head'));

  function renderTabs(spaceId, activeView){
    tabs.replaceChildren();
    const space=SPACES.find(x=>x.id===spaceId); if(!space)return;
    for(const view of space.views){
      const m=VIEWS[view],b=el('button',view===activeView?'active':'',m.label); b.type='button'; b.dataset.view=view;
      b.addEventListener('click',()=>selectView(view)); tabs.appendChild(b);
    }
  }
  function sync(view=currentLegacyView()){
    const meta=VIEWS[view]||VIEWS.overview;
    const space=SPACES.find(x=>x.id===meta.space)||SPACES[0];
    $$('.fp-screen').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
    $$('.fp-space').forEach(n=>n.classList.toggle('active',n.dataset.space===space.id));
    spaceName.textContent=space.label.toUpperCase(); viewTitle.textContent=meta.title; viewSub.textContent=meta.sub;
    renderTabs(space.id,view);
  }
  sync();

  // Follow navigation triggered by original app.js handlers (data-go buttons,
  // recommendation buttons, object-story links, etc.) without intercepting them.
  const legacyViews=$$('.desktop-compat-layer .view');
  const navObserver=new MutationObserver(()=>queueMicrotask(()=>sync(currentLegacyView())));
  legacyViews.forEach(v=>navObserver.observe(v,{attributes:true,attributeFilter:['class']}));

  // Per-request progress. Required desktop contract is preserved, but the panel
  // now lives in the new screen header rather than the browser dashboard.
  const endpointRules=[
    ['/api/system-profile','hardware','Reading machine'],['/api/quick-check','quickcheck','Building snapshot'],['/api/review-queue','quickcheck','Building queue'],['/api/guided-snapshot','quickcheck','Capturing evidence'],['/api/readiness','overview','Verifying Sentinel'],['/api/search/deep','weakness','Searching filenames'],['/api/weakness-audit','weakness','Auditing visibility'],['/api/coverage','weakness','Reading coverage'],['/api/advanced-sensor/status','weakness','Checking sensor boundary'],['/api/search','weakness','Searching evidence'],['/api/changes','changes','Updating watch'],['/api/incidents','incidents','Building cases'],['/api/storage','storage','Measuring storage'],['/api/security/audit','security','Running audit'],['/api/self/integrity','overview','Verifying engine'],['/api/integrity','integrity','Verifying object'],['/api/intelligence','intelligence','Building relations'],['/api/object/story','intelligence','Building object story'],['/api/behavior','behavior','Comparing behavior'],['/api/trust','trust','Comparing reference'],['/api/process/detail','processes','Inspecting process'],['/api/processes','processes','Loading processes'],['/api/startup','startup','Loading startup'],['/api/persistence','persistence','Comparing persistence'],['/api/background','background','Loading background'],['/api/network','network','Loading network'],['/api/cleanup/preview','cleanup','Analyzing space'],['/api/actions','actions','Preparing change'],['/api/report/export','overview','Building report'],['/api/diagnostics/export','overview','Building diagnostics'],['/api/capabilities','overview','Checking sources'],['/api/overview','overview','Refreshing status']
  ];
  const progressState=new WeakMap();
  function screenFor(view){ return $(`.fp-screen[data-view="${view}"]`) || $('.fp-screen.active'); }
  function progressPanel(view){
    const host=screenFor(view); if(!host)return null;
    let p=$('.sentinel-task-progress',host); if(p)return p;
    p=el('div','sentinel-task-progress'); p.dataset.state='idle';
    const head=el('div','sentinel-progress-head'); head.append(el('b','','Ready'),el('strong','','0%'));
    const bar=document.createElement('progress'); bar.className='sentinel-percent-bar'; bar.max=100; bar.value=0;
    p.append(head,bar,el('small','sentinel-progress-detail','Progress appears only after a real localhost request starts.'));
    $('.fp-screen-head',host)?.appendChild(p); return p;
  }
  function pstate(panel){let s=progressState.get(panel);if(!s){s={active:0,percent:0,timer:null};progressState.set(panel,s);}return s;}
  function setProgress(panel,percent,label,detail,state='running'){
    if(!panel)return;const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0))),s=pstate(panel);s.percent=value;panel.dataset.state=state;
    const b=$('.sentinel-progress-head b',panel),strong=$('.sentinel-progress-head strong',panel),bar=$('.sentinel-percent-bar',panel),small=$('.sentinel-progress-detail',panel);
    if(b)b.textContent=label;if(strong)strong.textContent=`${value}%`;if(bar)bar.value=value;if(small)small.textContent=detail||'';
  }
  function stopProgressTimer(panel){const s=pstate(panel);if(s.timer)clearInterval(s.timer);s.timer=null;}
  function requestInfo(input){
    try{const raw=typeof input==='string'?input:(input?.url||''),url=new URL(raw,location.origin),match=endpointRules.find(([prefix])=>url.pathname.startsWith(prefix));return{path:url.pathname,view:match?.[1]||currentLegacyView(),label:match?.[2]||'Working locally'};}catch{return{path:'',view:currentLegacyView(),label:'Working locally'};}
  }
  function beginRequest(info){
    const panel=progressPanel(info.view);if(!panel)return null;const s=pstate(panel);s.active+=1;
    if(s.active===1){setProgress(panel,Math.max(8,s.percent>=100?8:s.percent||8),info.label,`${info.path} · localhost request started.`,'running');s.timer=setInterval(()=>setProgress(panel,Math.min(92,s.percent+(s.percent<45?4:1)),info.label,'Waiting for the local Sentinel engine.','running'),450);}return panel;
  }
  const storagePhaseLabel=phase=>({walking:'Scanning files',grouping:'Preparing duplicate candidates',hashing:'Hashing duplicate candidates',finalizing:'Building storage report',complete:'Storage scan complete',cancelled:'Storage scan cancelled',failed:'Storage scan failed'}[phase]||'Scanning storage');
  const formatBytes=value=>{let n=Math.max(0,Number(value)||0);const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return`${n.toFixed(i===0||n>=10?1:2)} ${units[i]}`;};
  function handleStorageJob(job){
    if(!job||typeof job!=='object')return;const panel=progressPanel('storage');if(!panel)return;
    const phase=String(job.phase||job.status||'walking'),percent=Number(job.phase_percent||(job.status==='complete'?100:12)),files=Number(job.files_visited||0),dirs=Number(job.dirs_visited||0),slow=Number(job.slow_paths_skipped||0),hashFilesDone=Number(job.hash_files_done||0),hashFilesTotal=Number(job.hash_files_total||0),hashBytesDone=Number(job.hash_bytes_done||0),hashBytesTotal=Number(job.hash_bytes_total||0),currentHashPath=String(job.current_hash_path||''),bits=[`${files.toLocaleString()} files`,`${dirs.toLocaleString()} folders`,`${slow.toLocaleString()} slow paths skipped`];
    if(phase==='hashing'||hashFilesTotal>0||hashBytesTotal>0){bits.push(`${hashFilesDone.toLocaleString()}/${hashFilesTotal.toLocaleString()} hash files`);bits.push(`${formatBytes(hashBytesDone)} / ${formatBytes(hashBytesTotal)} hashed`);if(currentHashPath)bits.push(currentHashPath);}
    setProgress(panel,percent,storagePhaseLabel(phase),bits.join(' · '),job.status==='failed'?'error':job.status==='complete'?'complete':'running');
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch = async (...args)=>{
    const info=requestInfo(args[0]),panel=beginRequest(info);
    try{
      const response=await nativeFetch(...args);let payload=null;
      try{if((response.headers.get('content-type')||'').includes('application/json'))payload=await response.clone().json();}catch{payload=null;}
      if(payload&&info.path.startsWith('/api/storage'))handleStorageJob(payload);
      if(panel){const s=pstate(panel);s.active=Math.max(0,s.active-1);if(s.active===0){stopProgressTimer(panel);if(!payload||!info.path.startsWith('/api/storage')||payload.status!=='running')setProgress(panel,100,response.ok?`${info.label} complete`:`${info.label} failed`,response.ok?'Local engine returned successfully.':`Local request failed: HTTP ${response.status}`,response.ok?'complete':'error');}}
      return response;
    }catch(error){if(panel){stopProgressTimer(panel);const s=pstate(panel);s.active=0;setProgress(panel,100,`${info.label} failed`,`Local request failed: ${error?.message||error}`,'error');}throw error;}
  };
  window.addEventListener('error',event=>{const panel=progressPanel(currentLegacyView());if(panel)setProgress(panel,100,'Interface error',`Interface error: ${event.message||'Unknown desktop UI error'}`,'error');});
  window.addEventListener('unhandledrejection',event=>{const panel=progressPanel(currentLegacyView()),detail=event.reason?.message||String(event.reason||'Unknown rejection');if(panel)setProgress(panel,100,'Interface error',`Interface error: ${detail}`,'error');});
})();
