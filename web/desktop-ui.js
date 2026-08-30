// SPDX-License-Identifier: MPL-2.0
(() => {
  /*
   * Sentinel Desktop App View V4
   *
   * First-principles rule: the visible UI is not a styled browser dashboard.
   * The browser tree survives only as a compatibility/event-binding layer for
   * app.js. V4 creates a separate three-zone product: intent rail, evidence
   * canvas, and contextual inspector. Only functional atoms are adopted.
   */
  if (window.__sentinelDesktopV4) return;
  window.__sentinelDesktopV4 = true;

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
  const take = id => byId(id);
  const takeOne = selector => $(selector);
  const add = (parent, ...nodes) => {
    for (const node of nodes.flat()) if (node) parent.appendChild(node);
    return parent;
  };
  const rename = (id, text) => {
    const n = byId(id);
    if (n) n.textContent = text;
    return n;
  };

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
    overview:{mission:'now',label:'Status',title:'What matters now?',verb:'ORIENT',rule:'Start with state and evidence quality. Do not turn uncertainty into an alert.',can:'Current state, tool readiness, machine context, and evidence coverage.',cannot:'Whether the Mac is safe or compromised.'},
    quickcheck:{mission:'now',label:'Snapshot',title:'What should I review first?',verb:'OBSERVE',rule:'Take one bounded read-only observation and rank what deserves attention.',can:'A current prioritized review queue.',cannot:'Intent, causality, or future behavior.'},
    incidents:{mission:'explain',label:'Cases',title:'Which observations belong together?',verb:'CORRELATE',rule:'Build a story from connected evidence instead of chasing isolated signals.',can:'Observed relationships and a bounded case narrative.',cannot:'Malicious intent from severity alone.'},
    weakness:{mission:'explain',label:'Search',title:'What exact object am I trying to understand?',verb:'QUERY',rule:'Search existing evidence first; broaden scope only when visibility is insufficient.',can:'Whether the target is represented and what Sentinel can currently see.',cannot:'Facts from paths or sensors Sentinel cannot read.'},
    intelligence:{mission:'explain',label:'Relations',title:'How are the objects connected?',verb:'CONNECT',rule:'Read relationship, time, and object identity together.',can:'Observed links among startup, files, processes, endpoints, and captures.',cannot:'Causality from a graph edge alone.'},
    security:{mission:'explain',label:'Audit',title:'Which evidence deserves review, and why?',verb:'ASSESS',rule:'Priority is an attention ranking, not a malware probability.',can:'Why an observed item was prioritized.',cannot:'A verdict from a score, signature, path, or endpoint by itself.'},
    integrity:{mission:'explain',label:'Object',title:'What can I establish about this exact object?',verb:'VERIFY',rule:'Identity evidence comes before interpretation.',can:'Hash, signing, and Gatekeeper context for one path.',cannot:'Benign or malicious intent from identity evidence alone.'},
    changes:{mission:'change',label:'Stream',title:'What changed inside the scope I chose?',verb:'WATCH',rule:'Narrow observation beats pretending to monitor the whole machine.',can:'Changes Sentinel observed inside the selected scope.',cannot:'Events outside the scope or while the watch was inactive.'},
    behavior:{mission:'change',label:'Behavior',title:'What differs from the previous observation?',verb:'COMPARE',rule:'Difference is evidence pressure, not danger.',can:'Bounded metadata differences between captures.',cannot:'Why a difference happened.'},
    trust:{mission:'change',label:'Reference',title:'What differs from my approved reference?',verb:'REFERENCE',rule:'A reference is context, not a permanent safety certificate.',can:'Drift from the reference you explicitly chose.',cannot:'Safety because the current state matches the reference.'},
    hardware:{mission:'system',label:'Machine',title:'What machine is producing this evidence?',verb:'CONTEXT',rule:'Hardware and runtime explain capability and compatibility.',can:'Model, architecture, memory, OS, kernel, and runtime context.',cannot:'A security judgment from hardware identity.'},
    processes:{mission:'system',label:'Running',title:'What is running right now?',verb:'LIVE',rule:'Treat each process as an identity connected to an executable and current activity.',can:'Current process identity plus available executable/signature/network context.',cannot:'Past activity that was not captured.'},
    startup:{mission:'system',label:'Auto-start',title:'What is configured to launch automatically?',verb:'DECLARE',rule:'Persistence is common in legitimate software; configuration needs context.',can:'Visible automatic-launch declarations.',cannot:'That an auto-start item is unwanted merely because it persists.'},
    persistence:{mission:'system',label:'Persistence',title:'Did launch configuration change?',verb:'COMPARE',rule:'This is a bounded configuration comparison, not continuous surveillance.',can:'Added, removed, or content-changed launch configuration between captures.',cannot:'Changes that occurred outside available captures.'},
    background:{mission:'system',label:'Background',title:'What background registrations exist?',verb:'REGISTER',rule:'Modern registrations complement classic launch evidence.',can:'Background Task Management data macOS exposes.',cannot:'Registrations unavailable to the current process.'},
    network:{mission:'system',label:'Network',title:'Which processes have TCP activity now?',verb:'LIVE',rule:'A public endpoint is ordinary context, not suspicion by itself.',can:'Current TCP endpoints tied to visible local processes.',cannot:'Encrypted content, intent, or historical activity not captured.'},
    storage:{mission:'system',label:'Storage',title:'Where is storage pressure coming from?',verb:'MEASURE',rule:'Measure first. Keep exact duplicates separate from filename heuristics.',can:'Measured footprint, large objects, exact duplicate candidates, and heuristic families.',cannot:'That a file is safe to remove merely because it is large or similarly named.'},
    cleanup:{mission:'act',label:'Reclaim',title:'What space is worth reviewing?',verb:'REVIEW',rule:'Estimate first. Nothing is deleted automatically.',can:'Reviewable storage candidates and estimated space.',cannot:'That every candidate should be removed.'},
    actions:{mission:'act',label:'Change',title:'What is the smallest reversible change supported by evidence?',verb:'RESOLVE',rule:'System change is the last step: preview impact, confirm explicitly, preserve recovery.',can:'A scoped reversible action with a fresh impact preview.',cannot:'Permission to make unrelated or irreversible changes.'},
    guide:{mission:'guide',label:'Model',title:'How should I use Sentinel?',verb:'MODEL',rule:'Use the shortest evidence path that can answer the question.',can:'Visibility boundaries and evidence semantics.',cannot:'Conclusions for evidence Sentinel cannot access.'}
  };

  const MISSIONS = [
    {id:'now',number:'01',label:'NOW',question:'What matters?',views:['overview','quickcheck']},
    {id:'explain',number:'02',label:'EXPLAIN',question:'Why does it look this way?',views:['incidents','weakness','intelligence','security','integrity']},
    {id:'change',number:'03',label:'CHANGE',question:'What moved over time?',views:['changes','behavior','trust']},
    {id:'system',number:'04',label:'SYSTEM',question:'What exists on this Mac?',views:['hardware','processes','startup','persistence','background','network','storage']},
    {id:'act',number:'05',label:'ACT',question:'What can I safely change?',views:['cleanup','actions']},
    {id:'guide',number:'06',label:'GUIDE',question:'What are the limits?',views:['guide']}
  ];

  const NEXT = {
    overview:['quickcheck','processes','intelligence'], quickcheck:['incidents','intelligence','security'],
    incidents:['intelligence','integrity','security'], weakness:['intelligence','integrity','processes'],
    intelligence:['integrity','security','changes'], security:['intelligence','integrity','actions'], integrity:['intelligence','actions'],
    changes:['intelligence','behavior','incidents'], behavior:['changes','trust','intelligence'], trust:['behavior','intelligence'],
    hardware:['processes','startup','storage'], processes:['network','intelligence','integrity'], startup:['persistence','intelligence'],
    persistence:['changes','intelligence'], background:['processes','startup'], network:['processes','intelligence'], storage:['cleanup','actions'],
    cleanup:['actions','storage'], actions:['overview','incidents'], guide:['overview','quickcheck']
  };

  const shell = el('div','v4-shell');
  const rail = el('aside','v4-rail');
  const canvas = el('main','v4-canvas');
  const inspector = el('aside','v4-inspector');
  shell.append(rail,canvas,inspector);
  document.body.appendChild(shell);

  const brand = el('div','v4-brand');
  brand.append(el('div','v4-mark','S'),add(el('div'),el('b','','Sentinel'),el('small','','LOCAL EVIDENCE')));
  const missionNav = el('nav','v4-missions');
  const lensNav = el('nav','v4-lenses');
  const railBottom = el('div','v4-rail-bottom');
  rail.append(brand,missionNav,lensNav,railBottom);

  const exportReport = take('exportReport');
  if (exportReport) {
    exportReport.textContent = 'Export evidence';
    exportReport.className = 'v4-control rail-export';
    railBottom.appendChild(exportReport);
  }
  const local = el('div','v4-local');
  local.append(el('i'),add(el('span'),el('b','','LOCAL ONLY'),el('small','','Loopback · reversible change path')));
  railBottom.appendChild(local);

  const command = el('div','v4-command');
  const oldSearch = takeOne('.global-search-wrap');
  if (oldSearch) {
    oldSearch.className = 'v4-search';
    const input = byId('globalSearch');
    if (input) input.placeholder = 'Find evidence by process, path, endpoint, or severity…';
    command.appendChild(oldSearch);
  }
  const commandActions = el('div','v4-command-actions');
  const refresh = take('refresh');
  const help = take('pageHelpToggle');
  if (refresh) { refresh.textContent='Refresh current'; refresh.className='v4-control'; commandActions.appendChild(refresh); }
  if (help) { help.textContent='Explain this view'; help.className='v4-control'; commandActions.appendChild(help); }
  command.appendChild(commandActions);

  const context = el('section','v4-context');
  const contextVerb = el('span','v4-eyebrow');
  const contextTitle = el('h2','v4-context-title');
  const contextRule = el('p','v4-context-rule');
  const canBox = el('div','v4-infer can');
  const cannotBox = el('div','v4-infer cannot');
  context.append(contextVerb,contextTitle,contextRule,canBox,cannotBox);

  const dynamicTitle = el('div','v4-side-label','SELECTED CONTEXT');
  const dynamic = el('section','v4-dynamic');
  const progressHost = el('section','v4-progress-host');
  const nextTitle = el('div','v4-side-label','NEXT USEFUL STEP');
  const nextHost = el('section','v4-next');
  const messages = el('section','v4-side-messages');
  const pageHelp = take('pageHelp');
  const notice = take('notice');
  if (pageHelp) messages.appendChild(pageHelp);
  if (notice) messages.appendChild(notice);
  inspector.append(command,context,progressHost,dynamicTitle,dynamic,nextTitle,nextHost,messages);

  const screens = el('div','v4-screens');
  canvas.appendChild(screens);

  function legacyButton(view){ return $(`.desktop-compat-layer .nav[data-view="${view}"]`); }
  function currentLegacyView(){ return $('.desktop-compat-layer .view.active')?.id || 'overview'; }
  function selectView(view){ const b=legacyButton(view); if(b)b.click(); sync(view); }

  for (const mission of MISSIONS) {
    const b=el('button','v4-mission'); b.type='button'; b.dataset.mission=mission.id;
    b.append(el('span','v4-mission-num',mission.number),add(el('span','v4-mission-copy'),el('b','',mission.label),el('small','',mission.question)));
    b.addEventListener('click',()=>selectView(mission.views[0]));
    missionNav.appendChild(b);
  }

  function atom(id,className='') { const n=take(id); if(!n)return null; if(className)n.className=className; return n; }
  function selectorAtom(selector,className='') { const n=takeOne(selector); if(!n)return null; if(className)n.className=className; return n; }
  function toolbar(nodes=[]){ return add(el('div','v4-tools'),nodes); }
  function band(label,title,description='',nodes=[],className=''){
    const s=el('section',`v4-band ${className}`.trim());
    const h=el('header','v4-band-head'); h.append(el('span','v4-band-index',label),add(el('div'),el('h3','',title),description?el('p','',description):null));
    s.appendChild(h); add(s,nodes); return s;
  }
  function mast(view){
    const meta=VIEWS[view]; const s=el('section','v4-screen'); s.dataset.view=view;
    const m=el('header','v4-mast');
    m.append(el('span','v4-eyebrow',meta.verb),el('h1','',meta.title),el('p','',meta.rule));
    s.appendChild(m); screens.appendChild(s); return s;
  }
  function split(...nodes){ const g=el('div','v4-split'); add(g,nodes); return g; }
  function well(node,className=''){ if(!node)return null; const w=el('div',`v4-well ${className}`.trim()); w.appendChild(node); return w; }
  function info(text,tone=''){ return el('div',`v4-info ${tone}`.trim(),text); }
  function form(id,className=''){ return atom(id,`v4-form ${className}`.trim()); }

  const inspectorNodes = {};

  // NOW · STATUS
  {
    const s=mast('overview');
    const actions=selectorAtom('.welcome-actions','v4-inline-actions');
    const metrics=selectorAtom('.hero-grid','v4-signals');
    if (metrics) [...metrics.children].forEach(n=>{n.className='v4-signal'; const a=$('.inline-action',n); if(a)a.className='v4-text-action';});
    rename('runReadiness','Verify Sentinel'); rename('loadCapabilities','Refresh sources'); rename('loadSelfIntegrity','Verify engine'); rename('exportDiagnostics','Export diagnostics');
    add(s,
      band('01','Immediate state','Start with what is observable before opening a deeper investigation.',[actions,metrics],'primary'),
      band('02','Machine context','A compact runtime snapshot, not a diagnosis.',[atom('systemKV','v4-kv')]),
      split(
        band('03','Tool readiness','Verify the instrument producing the evidence.',[toolbar([atom('runReadiness','v4-control primary')]),atom('readinessBody','v4-output')]),
        band('04','Evidence boundary','See which local tools and permissions are contributing.',[toolbar([atom('loadCapabilities','v4-control'),atom('exportDiagnostics','v4-control')]),atom('capabilityGrid','v4-kv')])
      ),
      band('05','Engine identity','Identify the exact Sentinel binary serving this session.',[toolbar([atom('loadSelfIntegrity','v4-control')]),atom('selfIntegrityBody','v4-output')])
    );
  }

  // NOW · SNAPSHOT
  {
    const s=mast('quickcheck'); rename('runQuickCheck','Take snapshot'); rename('guidedSnapshot','Capture full evidence'); rename('loadReviewQueue','Refresh queue');
    const metrics=atom('quickCheckMetrics','v4-mini-signals hidden');
    add(s,
      band('01','Observe','One read-only capture. Behavior, Reference, and file state are not modified.',[toolbar([atom('runQuickCheck','v4-control primary'),atom('guidedSnapshot','v4-control')]),atom('quickCheckStatus','v4-output focus'),metrics],'primary'),
      band('02','Review queue','Evidence ranked for attention.',[toolbar([atom('loadReviewQueue','v4-control')]),atom('reviewQueue','v4-feed')]),
      band('03','Useful routes','Open the narrowest tool that can answer the next question.',[atom('quickRecommendations','v4-feed')])
    );
  }

  // EXPLAIN · CASES
  {
    const s=mast('incidents'); rename('rebuildIncidents','Rebuild cases'); rename('loadIncidentHistory','History'); rename('closeIncidentDeepReview','Close');
    add(s,
      band('01','Build case state','Correlate related filesystem, persistence, behavior, and reference observations.',[toolbar([atom('rebuildIncidents','v4-control primary'),atom('loadIncidentHistory','v4-control')]),atom('incidentSummary','v4-output')],'primary'),
      band('02','Case stream','Open the strongest connected story before individual objects.',[atom('incidentList','v4-feed')]),
      info('Case severity is review priority. It is not proof of malicious intent.','boundary')
    );
    const deep=atom('incidentDeepReviewCard','v4-selected hidden');
    if(deep){const h=$('h2',deep);if(h)h.textContent='Selected case';}
    inspectorNodes.incidents=deep;
  }

  // EXPLAIN · SEARCH
  {
    const s=mast('weakness'); rename('runDeepSearch','Search filenames'); rename('runWeaknessAudit','Audit visibility'); rename('loadCoverage','Refresh coverage'); rename('loadAdvancedSensor','Check sensor boundary');
    add(s,
      band('01','Name the target','Filename discovery reads names and paths only; it does not index file contents.',[form('deepSearchForm','search'),atom('deepSearchMeta','v4-meta'),atom('deepSearchResults','v4-feed')],'primary'),
      split(
        band('02','Visibility','Missing evidence lowers confidence; it does not justify guessing.',[toolbar([atom('runWeaknessAudit','v4-control primary'),atom('loadCoverage','v4-control')]),atom('weaknessAudit','v4-output'),atom('coverageMap','v4-output')]),
        band('03','Sensor boundary','Endpoint Security must not appear active unless the required entitlement and System Extension really exist.',[toolbar([atom('loadAdvancedSensor','v4-control')]),atom('advancedSensorStatus','v4-output')])
      )
    );
  }

  // EXPLAIN · RELATIONS
  {
    const s=mast('intelligence'); rename('captureEvidence','Capture evidence'); rename('loadEvidence','Refresh relations'); rename('loadTimeline','Refresh timeline');
    add(s,
      band('01','Capture',[].join(''),'',[toolbar([atom('captureEvidence','v4-control primary'),atom('loadEvidence','v4-control')]),atom('evidenceSummary','v4-mini-signals'),atom('evidenceNote','v4-meta')],'primary'),
      band('02','Relationship canvas','Startup → file → process → endpoint. Edges show observed relationships, not threat causality.',[atom('graphWrap','v4-graph'),atom('graphObjects','v4-object-index')],'graph'),
      band('03','Time','Order captured changes without turning sequence into causality.',[toolbar([atom('loadTimeline','v4-control')]),atom('timelineList','v4-feed timeline')])
    );
    const story=atom('objectStory','v4-selected'); if(story){const h=$('h2',story);if(h)h.textContent='Selected object';}
    inspectorNodes.intelligence=story || atom('storyBody','v4-output');
  }

  // EXPLAIN · AUDIT
  {
    const s=mast('security'); rename('runAudit','Run audit');
    const score=el('div','v4-scoreboard');
    score.append(add(el('div'),el('span','','PRIORITY'),atom('riskScore','v4-score')),add(el('div'),el('span','','ASSESSMENT'),atom('riskLevel','v4-assessment')));
    add(s,
      band('01','Prioritize','Rank explainable evidence for review.',[toolbar([atom('runAudit','v4-control primary')]),score,atom('riskDisclaimer','v4-meta')],'primary'),
      band('02','Evidence findings','Each finding should state what was observed and why it deserves attention.',[atom('findings','v4-feed')]),
      info('Signing, location, persistence, and network context are separate pieces of evidence. None is a verdict by itself.','boundary')
    );
  }

  // EXPLAIN · OBJECT
  {
    const s=mast('integrity'); rename('inspectIntegrity','Verify object');
    add(s,
      band('01','Choose one object','Verification is deliberately narrow and on demand.',[form('integrityForm','object')],'primary'),
      band('02','Identity evidence','Read hash, signature, and Gatekeeper context before interpretation.',[atom('integrityBody','v4-output detail')])
    );
  }

  // CHANGE · STREAM
  {
    const s=mast('changes'); rename('startChanges','Start watch'); rename('stopChanges','Stop'); rename('reviewChanges','Reinspect changed'); rename('reconcileChanges','Reconcile'); rename('clearChanges','Clear'); rename('loadChangeHistory','History'); rename('refreshChanges','Refresh');
    add(s,
      band('01','Scope the watch','Choose where to observe. Native FSEvents is used when available; bounded polling is the fallback.',[selectorAtom('.change-controls','v4-watch-controls'),atom('changeStatus','v4-output')],'primary'),
      band('02','Change stream','Newest observations first.',[toolbar([atom('loadChangeHistory','v4-control'),atom('refreshChanges','v4-control')]),atom('changeEvents','v4-feed stream')]),
      band('03','Reinspect','Re-check only the changed objects that warrant deeper evidence.',[atom('changeReview','v4-output')])
    );
  }

  // CHANGE · BEHAVIOR
  {
    const s=mast('behavior'); rename('captureBehavior','Capture & compare'); rename('loadBehavior','Load'); rename('loadBehaviorHistory','Trend'); rename('loadBehaviorHealth','Verify history');
    add(s,
      band('01','Comparison state','Current bounded metadata against the previous capture.',[toolbar([atom('captureBehavior','v4-control primary'),atom('loadBehavior','v4-control')]),atom('behaviorSummary','v4-mini-signals'),atom('behaviorBaseline','v4-meta')],'primary'),
      band('02','Observed differences','Treat change as evidence, not danger.',[atom('behaviorChanges','v4-feed')]),
      split(
        band('03','Trend','Bounded history of change pressure.',[toolbar([atom('loadBehaviorHistory','v4-control')]),atom('behaviorTrend','v4-output'),atom('behaviorHistoryList','v4-feed')]),
        band('04','History integrity','Verify that stored comparison history remains readable.',[toolbar([atom('loadBehaviorHealth','v4-control')]),atom('baselineHealth','v4-output')])
      )
    );
  }

  // CHANGE · REFERENCE
  {
    const s=mast('trust'); rename('compareTrust','Compare'); rename('captureTrust','Set reference'); rename('loadTrustHealth','Verify reference'); rename('exportTrust','Export'); rename('restoreTrust','Restore previous'); rename('loadTrustHistory','History');
    add(s,
      band('01','Reference state','Compare current bounded identity against the state you explicitly approved.',[toolbar([atom('compareTrust','v4-control primary'),atom('captureTrust','v4-control'),atom('exportTrust','v4-control'),atom('restoreTrust','v4-control')]),atom('trustSummary','v4-mini-signals'),atom('trustStatus','v4-meta')],'primary'),
      band('02','Drift evidence','Differences from the active reference.',[atom('trustChanges','v4-feed')]),
      split(
        band('03','History','Recent comparisons against the reference active at that time.',[toolbar([atom('loadTrustHistory','v4-control')]),atom('trustHistoryList','v4-feed')]),
        band('04','Reference integrity','Verify current and previous reference stores.',[toolbar([atom('loadTrustHealth','v4-control')]),atom('trustHealth','v4-output')])
      )
    );
  }

  // SYSTEM · MACHINE
  {
    const s=mast('hardware'); rename('loadSystemProfile','Read machine');
    add(s,
      band('01','Machine identity','Model, processor, architecture, and Sentinel runtime context.',[toolbar([atom('loadSystemProfile','v4-control primary')]),atom('hardwareSummary','v4-output')],'primary'),
      split(
        band('02','Hardware','Physical resources reported by macOS.',[atom('hardwareGrid','v4-kv')]),
        band('03','Runtime','Operating system, kernel, architecture, and translation context.',[atom('softwareGrid','v4-kv')])
      )
    );
  }

  // SYSTEM · RUNNING
  {
    const s=mast('processes'); rename('loadProcesses','Refresh'); rename('closeProcessDetail','Close');
    const filter=atom('processFilter','v4-input'); if(filter)filter.placeholder='Filter running software';
    add(s,band('01','Running software','Current process snapshot. Select a row to inspect identity and activity.',[toolbar([filter,atom('loadProcesses','v4-control primary')]),atom('processTable','v4-table')],'primary'));
    const detail=atom('processDetail','v4-selected hidden'); if(detail){const h=$('h2',detail);if(h)h.textContent='Selected process';}
    inspectorNodes.processes=detail;
  }

  // SYSTEM · AUTO-START
  {
    const s=mast('startup'); rename('loadStartup','Refresh');
    add(s,band('01','Automatic launch declarations','Read path, signature, and manifest behavior together.',[toolbar([atom('loadStartup','v4-control primary')]),atom('startupTable','v4-table')],'primary'));
  }

  // SYSTEM · PERSISTENCE
  {
    const s=mast('persistence'); rename('capturePersistence','Capture / compare'); rename('loadPersistence','Refresh');
    add(s,band('01','Persistence drift','Additions, removals, and same-name content changes between bounded captures.',[toolbar([atom('capturePersistence','v4-control primary'),atom('loadPersistence','v4-control')]),atom('persistenceSummary','v4-meta'),atom('persistenceChanges','v4-feed')],'primary'));
  }

  // SYSTEM · BACKGROUND
  {
    const s=mast('background'); rename('loadBackground','Refresh');
    add(s,band('01','Background registrations','Modern macOS registrations complement classic startup evidence.',[toolbar([atom('loadBackground','v4-control primary')]),atom('backgroundNote','v4-meta'),atom('backgroundTable','v4-table')],'primary'));
  }

  // SYSTEM · NETWORK
  {
    const s=mast('network'); rename('loadNetwork','Refresh');
    add(s,band('01','TCP activity','Read endpoints together with the local process that owns them.',[toolbar([atom('loadNetwork','v4-control primary')]),atom('networkTable','v4-table')],'primary'));
  }

  // SYSTEM · STORAGE
  {
    const s=mast('storage'); rename('startScan','Measure'); rename('cancelScan','Cancel');
    add(s,
      band('01','Measurement','Choose scope, minimum size, and result budget.',[selectorAtom('.preset-row','v4-presets'),form('scanForm','storage'),atom('scanProgress','v4-output hidden'),atom('scanSummary','v4-meta')],'primary'),
      split(
        band('02','Largest areas','Measured categories in this scan.',[atom('categoryBars','v4-bars')]),
        band('03','File types','Measured footprint by type.',[atom('typeBars','v4-bars')])
      ),
      band('04','Largest objects','Objects that crossed the selected threshold.',[atom('fileFilter','v4-input'),atom('filesTable','v4-table')]),
      split(
        band('05','Exact duplicates','Size match followed by local SHA-256 comparison.',[atom('hashAmount','v4-chip'),atom('duplicates','v4-feed')]),
        band('06','Possible versions','Filename-family heuristic only.',[atom('families','v4-feed')])
      )
    );
  }

  // ACT · RECLAIM
  {
    const s=mast('cleanup'); rename('previewCleanup','Analyze');
    add(s,band('01','Estimate first','Measure common reviewable storage categories without deleting anything.',[toolbar([atom('previewCleanup','v4-control primary')]),atom('cleanupTotal','v4-output hidden'),atom('cleanupList','v4-feed')],'primary'));
  }

  // ACT · CHANGE
  {
    const s=mast('actions'); rename('loadActionHealth','Verify recovery'); rename('previewAction','Preview impact'); rename('revealActionPath','Reveal target'); rename('executeAction','Confirm change'); rename('loadVault','Refresh Vault'); rename('loadActionJournal','Refresh journal');
    add(s,
      band('01','Recovery readiness','Verify Vault, journal, and recovery state before touching a path.',[toolbar([atom('loadActionHealth','v4-control primary')]),atom('actionStatus','v4-output'),info('No permanent delete · no overwrite · regular user-home files only.','warning')],'primary'),
      band('02','Target and impact','Choose one object and build a fresh dependency-aware preview.',[form('actionForm','action'),atom('actionPreviewCard','v4-selected hidden')]),
      split(
        band('03','Vault','Locally recoverable items. Restore refuses to overwrite an occupied original path.',[toolbar([atom('loadVault','v4-control')]),atom('vaultList','v4-feed')]),
        band('04','Operation history','Bounded record of reversible changes and immediate post-action observations.',[toolbar([atom('loadActionJournal','v4-control')]),atom('actionJournal','v4-feed')])
      )
    );
  }

  // GUIDE · MODEL — created from scratch.
  {
    const s=mast('guide');
    const flow=el('div','v4-flow');
    [['01','Observe','Start with current state.'],['02','Explain','Correlate only the evidence needed.'],['03','Compare','Use time when the question is about change.'],['04','Act','Change only after a reversible preview.']].forEach(([n,t,d])=>{
      const step=el('div','v4-flow-step'); step.append(el('span','',n),el('b','',t),el('small','',d)); flow.appendChild(step);
    });
    const defs=el('dl','v4-defs');
    [['Priority','What deserves review first.'],['Confidence','How strongly observations belong together.'],['Signature','Whether signed code validates.'],['Gatekeeper','macOS distribution and trust context.'],['Reference match','Whether current identity matches a user-approved reference.'],['Change','A difference between bounded observations.']].forEach(([k,v])=>defs.append(el('dt','',k),el('dd','',v)));
    add(s,band('01','Operating model','Use the shortest path that can answer the question.',[flow],'primary'),band('02','Visibility','Sentinel cannot grant itself macOS permissions and should never invent conclusions for evidence it cannot read.',[info('Normal access provides substantial local evidence. Full Disk Access can expand protected-path visibility. Endpoint Security requires Apple entitlement and a System Extension.','boundary')]),band('03','Evidence semantics','Keep concepts separate so labels do not become verdicts.',[defs]));
  }

  // Adopted nodes keep IDs and listeners but lose browser-dashboard presentation semantics.
  $$('.v4-shell .card').forEach(n=>n.classList.remove('card'));
  $$('.v4-shell .two-col').forEach(n=>n.classList.remove('two-col'));
  $$('.v4-shell .section-head').forEach(n=>n.classList.add('v4-legacy-head'));

  function renderLenses(missionId,activeView){
    lensNav.replaceChildren();
    const mission=MISSIONS.find(m=>m.id===missionId); if(!mission)return;
    lensNav.appendChild(el('div','v4-lens-label','LENSES'));
    for(const view of mission.views){
      const b=el('button',view===activeView?'v4-lens active':'v4-lens',VIEWS[view].label); b.type='button'; b.dataset.view=view;
      b.addEventListener('click',()=>selectView(view)); lensNav.appendChild(b);
    }
  }

  function renderContext(view){
    const meta=VIEWS[view];
    contextVerb.textContent=meta.verb; contextTitle.textContent=meta.title; contextRule.textContent=meta.rule;
    canBox.replaceChildren(el('span','','CAN ESTABLISH'),el('p','',meta.can));
    cannotBox.replaceChildren(el('span','','DO NOT INFER'),el('p','',meta.cannot));

    dynamic.replaceChildren();
    const selected=inspectorNodes[view];
    if(selected){ dynamic.appendChild(selected); dynamicTitle.hidden=false; dynamic.hidden=false; }
    else { dynamicTitle.hidden=true; dynamic.hidden=true; }

    nextHost.replaceChildren();
    for(const next of NEXT[view]||[]){
      const b=el('button','v4-next-action'); b.type='button'; b.append(el('b','',VIEWS[next].label),el('small','',VIEWS[next].title));
      b.addEventListener('click',()=>selectView(next)); nextHost.appendChild(b);
    }
  }

  function sync(view=currentLegacyView()){
    const meta=VIEWS[view]||VIEWS.overview;
    $$('.v4-screen').forEach(s=>s.classList.toggle('active',s.dataset.view===view));
    $$('.v4-mission').forEach(b=>b.classList.toggle('active',b.dataset.mission===meta.mission));
    renderLenses(meta.mission,view); renderContext(view);
  }
  sync();

  const legacyViews=$$('.desktop-compat-layer .view');
  const navObserver=new MutationObserver(()=>queueMicrotask(()=>sync(currentLegacyView())));
  legacyViews.forEach(v=>navObserver.observe(v,{attributes:true,attributeFilter:['class']}));

  // Request progress remains a contract, but V4 places it in the contextual inspector.
  const endpointRules=[
    ['/api/system-profile','hardware','Reading machine'],['/api/quick-check','quickcheck','Building snapshot'],['/api/review-queue','quickcheck','Building queue'],['/api/guided-snapshot','quickcheck','Capturing evidence'],['/api/readiness','overview','Verifying Sentinel'],['/api/search/deep','weakness','Searching filenames'],['/api/weakness-audit','weakness','Auditing visibility'],['/api/coverage','weakness','Reading coverage'],['/api/advanced-sensor/status','weakness','Checking sensor boundary'],['/api/search','weakness','Searching evidence'],['/api/changes','changes','Updating watch'],['/api/incidents','incidents','Building cases'],['/api/storage','storage','Measuring storage'],['/api/security/audit','security','Running audit'],['/api/self/integrity','overview','Verifying engine'],['/api/integrity','integrity','Verifying object'],['/api/intelligence','intelligence','Building relations'],['/api/object/story','intelligence','Building object story'],['/api/behavior','behavior','Comparing behavior'],['/api/trust','trust','Comparing reference'],['/api/process/detail','processes','Inspecting process'],['/api/processes','processes','Loading processes'],['/api/startup','startup','Loading startup'],['/api/persistence','persistence','Comparing persistence'],['/api/background','background','Loading background'],['/api/network','network','Loading network'],['/api/cleanup/preview','cleanup','Analyzing space'],['/api/actions','actions','Preparing change'],['/api/report/export','overview','Building report'],['/api/diagnostics/export','overview','Building diagnostics'],['/api/capabilities','overview','Checking sources'],['/api/overview','overview','Refreshing status']
  ];
  const progressState=new WeakMap();
  function progressPanel(){
    let p=$('.sentinel-task-progress',progressHost); if(p)return p;
    p=el('div','sentinel-task-progress'); p.dataset.state='idle';
    const head=el('div','sentinel-progress-head'); head.append(el('b','','Ready'),el('strong','','0%'));
    const bar=document.createElement('progress'); bar.className='sentinel-percent-bar'; bar.max=100; bar.value=0;
    p.append(head,bar,el('small','sentinel-progress-detail','Progress appears only after a real localhost request starts.'));
    progressHost.appendChild(p); return p;
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
    const panel=progressPanel();const s=pstate(panel);s.active+=1;
    if(s.active===1){setProgress(panel,Math.max(8,s.percent>=100?8:s.percent||8),info.label,`${info.path} · localhost request started.`,'running');s.timer=setInterval(()=>setProgress(panel,Math.min(92,s.percent+(s.percent<45?4:1)),info.label,'Waiting for the local Sentinel engine.','running'),450);}return panel;
  }
  const storagePhaseLabel=phase=>({walking:'Scanning files',grouping:'Preparing duplicate candidates',hashing:'Hashing duplicate candidates',finalizing:'Building storage report',complete:'Storage scan complete',cancelled:'Storage scan cancelled',failed:'Storage scan failed'}[phase]||'Scanning storage');
  const formatBytes=value=>{let n=Math.max(0,Number(value)||0);const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i+=1;}return`${n.toFixed(i===0||n>=10?1:2)} ${units[i]}`;};
  function handleStorageJob(job){
    if(!job||typeof job!=='object')return;const panel=progressPanel();
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
  window.addEventListener('error',event=>{const panel=progressPanel();setProgress(panel,100,'Interface error',`Interface error: ${event.message||'Unknown desktop UI error'}`,'error');});
  window.addEventListener('unhandledrejection',event=>{const panel=progressPanel(),detail=event.reason?.message||String(event.reason||'Unknown rejection');setProgress(panel,100,'Interface error',`Interface error: ${detail}`,'error');});
})();
