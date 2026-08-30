// SPDX-License-Identifier: MPL-2.0
(() => {
  /*
   * Sentinel Desktop App View V5 — Evidence Notebook
   *
   * First principles:
   * 1. The visible product is built around questions, not backend modules.
   * 2. Evidence owns the window; navigation and explanation stay compact.
   * 3. Details appear progressively in a drawer only when selected or requested.
   * 4. Lists/tables are preferred for dense facts; surfaces exist only when they encode meaning.
   * 5. The browser dashboard survives only as a hidden compatibility/event layer for app.js.
   */
  if (window.__sentinelDesktopV5) return;
  window.__sentinelDesktopV5 = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = text;
    return node;
  };
  const byId = id => document.getElementById(id);
  const take = id => byId(id);
  const takeOne = selector => $(selector);
  const add = (parent, ...nodes) => {
    for (const node of nodes.flat()) if (node) parent.appendChild(node);
    return parent;
  };
  const rename = (id, text) => {
    const node = byId(id);
    if (node) node.textContent = text;
    return node;
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
    overview:{mission:'now',label:'Status',title:'What matters now?',verb:'ORIENT',rule:'Start with current state and evidence quality before opening a deeper investigation.',can:'Current state, tool readiness, machine context, and evidence coverage.',cannot:'Whether the Mac is safe or compromised.'},
    quickcheck:{mission:'now',label:'Snapshot',title:'What should I review first?',verb:'OBSERVE',rule:'Take one bounded read-only observation and rank what deserves attention.',can:'A current prioritized review queue.',cannot:'Intent, causality, or future behavior.'},
    incidents:{mission:'explain',label:'Cases',title:'Which observations belong together?',verb:'CORRELATE',rule:'Build a story from connected evidence instead of chasing isolated signals.',can:'Observed relationships and a bounded case narrative.',cannot:'Malicious intent from severity alone.'},
    weakness:{mission:'explain',label:'Search',title:'What exact object am I trying to understand?',verb:'QUERY',rule:'Search existing evidence first; broaden scope only when visibility is insufficient.',can:'Whether the target is represented and what Sentinel can currently see.',cannot:'Facts from paths or sensors Sentinel cannot read.'},
    intelligence:{mission:'explain',label:'Relations',title:'How are the objects connected?',verb:'CONNECT',rule:'Read relationship, time, and object identity together.',can:'Observed links among startup, files, processes, endpoints, and captures.',cannot:'Causality from a graph edge alone.'},
    security:{mission:'explain',label:'Audit',title:'Which evidence deserves review, and why?',verb:'ASSESS',rule:'Priority is an attention ranking, not a malware probability.',can:'Why an observed item was prioritized.',cannot:'A verdict from a score, signature, path, or endpoint by itself.'},
    integrity:{mission:'explain',label:'Object',title:'What can I establish about this exact object?',verb:'VERIFY',rule:'Identity evidence comes before interpretation.',can:'Hash, signing, and Gatekeeper context for one path.',cannot:'Benign or malicious intent from identity evidence alone.'},
    changes:{mission:'change',label:'Stream',title:'What changed inside the scope I chose?',verb:'WATCH',rule:'A narrow watch is more useful than pretending to monitor the whole machine.',can:'Changes Sentinel observed inside the selected scope.',cannot:'Events outside the scope or while the watch was inactive.'},
    behavior:{mission:'change',label:'Behavior',title:'What differs from the previous observation?',verb:'COMPARE',rule:'Difference is evidence pressure, not danger.',can:'Bounded metadata differences between captures.',cannot:'Why a difference happened.'},
    trust:{mission:'change',label:'Reference',title:'What differs from my approved reference?',verb:'REFERENCE',rule:'A reference is context, not a permanent safety certificate.',can:'Drift from the reference you explicitly chose.',cannot:'Safety because the current state matches the reference.'},
    hardware:{mission:'system',label:'Machine',title:'What machine is producing this evidence?',verb:'CONTEXT',rule:'Hardware and runtime explain capability and compatibility.',can:'Model, architecture, memory, OS, kernel, and runtime context.',cannot:'A security judgment from hardware identity.'},
    processes:{mission:'system',label:'Running',title:'What is running right now?',verb:'LIVE',rule:'Treat a process as an identity connected to an executable and current activity.',can:'Current process identity plus available executable, signature, and network context.',cannot:'Past activity that was not captured.'},
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
    {id:'now',mark:'●',label:'Now',hint:'Current state',views:['overview','quickcheck']},
    {id:'explain',mark:'⌁',label:'Explain',hint:'Build a story',views:['incidents','weakness','intelligence','security','integrity']},
    {id:'change',mark:'Δ',label:'Change',hint:'Compare time',views:['changes','behavior','trust']},
    {id:'system',mark:'▦',label:'System',hint:'Inspect Mac',views:['hardware','processes','startup','persistence','background','network','storage']},
    {id:'act',mark:'↺',label:'Act',hint:'Reversible only',views:['cleanup','actions']},
    {id:'guide',mark:'?',label:'Guide',hint:'Limits',views:['guide']}
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

  const shell = el('div','v5-shell');
  const dock = el('aside','v5-dock');
  const workspace = el('section','v5-workspace');
  const command = el('header','v5-command');
  const notebook = el('main','v5-notebook');
  const activity = el('footer','v5-activity');
  const drawer = el('aside','v5-drawer closed');
  shell.append(dock,workspace,drawer);
  workspace.append(command,notebook,activity);
  document.body.appendChild(shell);

  const brand = el('div','v5-brand','S');
  brand.title = 'Sentinel · local evidence';
  const missionNav = el('nav','v5-missions');
  const dockFoot = el('div','v5-dock-foot');
  dock.append(brand,missionNav,dockFoot);

  for (const mission of MISSIONS) {
    const button = el('button','v5-mission');
    button.type = 'button';
    button.dataset.mission = mission.id;
    button.title = `${mission.label} — ${mission.hint}`;
    button.append(el('span','v5-mission-mark',mission.mark),el('span','v5-mission-label',mission.label));
    button.addEventListener('click',()=>selectView(mission.views[0]));
    missionNav.appendChild(button);
  }
  const local = el('div','v5-local');
  local.title = 'Loopback-only local session';
  local.append(el('i'),el('span','','Local'));
  dockFoot.appendChild(local);

  const lensWrap = el('label','v5-lens-wrap');
  lensWrap.append(el('span','','Lens'));
  const lensSelect = document.createElement('select');
  lensSelect.className = 'v5-lens-select';
  lensWrap.appendChild(lensSelect);
  lensSelect.addEventListener('change',()=>selectView(lensSelect.value));

  const oldSearch = takeOne('.global-search-wrap');
  if (oldSearch) {
    oldSearch.className = 'global-search-wrap v5-search';
    const input = byId('globalSearch');
    if (input) input.placeholder = 'Search evidence…';
  }

  const commandActions = el('div','v5-command-actions');
  const refresh = take('refresh');
  const help = take('pageHelpToggle');
  const exportReport = take('exportReport');
  const contextButton = el('button','v5-command-button','Context');
  contextButton.type = 'button';
  contextButton.addEventListener('click',()=>toggleDrawer());
  if (refresh) { refresh.textContent='Refresh'; refresh.className='v5-command-button'; commandActions.appendChild(refresh); }
  if (help) {
    help.textContent='Explain'; help.className='v5-command-button';
    help.addEventListener('click',()=>openDrawer());
    commandActions.appendChild(help);
  }
  if (exportReport) { exportReport.textContent='Export'; exportReport.className='v5-command-button'; commandActions.appendChild(exportReport); }
  commandActions.appendChild(contextButton);
  add(command,lensWrap,oldSearch,commandActions);

  const screens = el('div','v5-screens');
  notebook.appendChild(screens);

  const drawerHead = el('div','v5-drawer-head');
  const drawerTitle = el('div','v5-drawer-title');
  const drawerClose = el('button','v5-drawer-close','×');
  drawerClose.type = 'button'; drawerClose.setAttribute('aria-label','Close context');
  drawerClose.addEventListener('click',closeDrawer);
  drawerHead.append(drawerTitle,drawerClose);
  const truth = el('section','v5-truth');
  const canBox = el('div','v5-truth-row can');
  const cannotBox = el('div','v5-truth-row cannot');
  truth.append(canBox,cannotBox);
  const selectedLabel = el('div','v5-drawer-label','Selected context');
  const selectedHost = el('section','v5-selected-host');
  const nextLabel = el('div','v5-drawer-label','Next useful step');
  const nextHost = el('section','v5-next');
  const messages = el('section','v5-messages');
  const pageHelp = take('pageHelp');
  const notice = take('notice');
  if (pageHelp) messages.appendChild(pageHelp);
  if (notice) messages.appendChild(notice);
  drawer.append(drawerHead,truth,selectedLabel,selectedHost,nextLabel,nextHost,messages);

  const progressHost = el('div','v5-progress-host');
  activity.appendChild(progressHost);

  function legacyButton(view){ return $(`.desktop-compat-layer .nav[data-view="${view}"]`); }
  function currentLegacyView(){ return $('.desktop-compat-layer .view.active')?.id || 'overview'; }
  function selectView(view){ const button=legacyButton(view); if(button)button.click(); sync(view); }
  function openDrawer(){ drawer.classList.remove('closed'); }
  function closeDrawer(){ drawer.classList.add('closed'); }
  function toggleDrawer(){ drawer.classList.toggle('closed'); }
  function atom(id,className=''){ const node=take(id); if(!node)return null; if(className)node.className=className; return node; }
  function selectorAtom(selector,className=''){ const node=takeOne(selector); if(!node)return null; if(className)node.className=className; return node; }
  function tools(nodes=[]){ return add(el('div','v5-tools'),nodes); }
  function chapter(index,title,description='',nodes=[],className=''){
    const section=el('section',`v5-chapter ${className}`.trim());
    const head=el('header','v5-chapter-head');
    head.append(el('span','v5-index',index),add(el('div'),el('h2','',title),description?el('p','',description):null));
    section.appendChild(head); add(section,nodes); return section;
  }
  function pair(...nodes){ const group=el('div','v5-pair'); add(group,nodes); return group; }
  function note(text,tone=''){ return el('div',`v5-note ${tone}`.trim(),text); }
  function form(id,className=''){ return atom(id,`v5-form ${className}`.trim()); }
  function screen(view){
    const meta=VIEWS[view];
    const section=el('section','v5-screen'); section.dataset.view=view;
    const question=el('header','v5-question');
    question.append(el('span','v5-verb',meta.verb),el('h1','',meta.title),el('p','',meta.rule));
    section.appendChild(question); screens.appendChild(section); return section;
  }

  const drawerNodes = {};

  {
    const s=screen('overview');
    const actions=selectorAtom('.welcome-actions','v5-actions');
    const metrics=selectorAtom('.hero-grid','v5-instrument');
    if(metrics)[...metrics.children].forEach(n=>{n.className='v5-instrument-row'; const a=$('.inline-action',n);if(a)a.className='v5-text-action';});
    rename('runReadiness','Verify Sentinel');rename('loadCapabilities','Refresh sources');rename('loadSelfIntegrity','Verify engine');rename('exportDiagnostics','Export diagnostics');
    add(s,
      chapter('01','Current signals','Read state as a set of measurements, not a collection of alerts.',[actions,metrics],'lead'),
      chapter('02','Machine context','Runtime context for every later interpretation.',[atom('systemKV','v5-kv')]),
      pair(
        chapter('03','Tool readiness','Verify the instrument producing the evidence.',[tools([atom('runReadiness','v5-button primary')]),atom('readinessBody','v5-output')]),
        chapter('04','Evidence boundary','See which local tools and permissions are contributing.',[tools([atom('loadCapabilities','v5-button'),atom('exportDiagnostics','v5-button')]),atom('capabilityGrid','v5-kv')])
      ),
      chapter('05','Engine identity','Identify the exact Sentinel binary serving this session.',[tools([atom('loadSelfIntegrity','v5-button')]),atom('selfIntegrityBody','v5-output')])
    );
  }
  {
    const s=screen('quickcheck');rename('runQuickCheck','Take snapshot');rename('guidedSnapshot','Capture full evidence');rename('loadReviewQueue','Refresh queue');
    add(s,
      chapter('01','Observe once','One read-only capture. Behavior, Reference, and file state are not modified.',[tools([atom('runQuickCheck','v5-button primary'),atom('guidedSnapshot','v5-button')]),atom('quickCheckStatus','v5-output emphasis'),atom('quickCheckMetrics','v5-mini-instrument hidden')],'lead'),
      chapter('02','Review queue','Evidence ranked for attention.',[tools([atom('loadReviewQueue','v5-button')]),atom('reviewQueue','v5-feed')]),
      chapter('03','Routes','Open the narrowest tool that can answer the next question.',[atom('quickRecommendations','v5-feed')])
    );
  }
  {
    const s=screen('incidents');rename('rebuildIncidents','Rebuild cases');rename('loadIncidentHistory','History');rename('closeIncidentDeepReview','Close');
    add(s,chapter('01','Build case state','Correlate related filesystem, persistence, behavior, and reference observations.',[tools([atom('rebuildIncidents','v5-button primary'),atom('loadIncidentHistory','v5-button')]),atom('incidentSummary','v5-output')],'lead'),chapter('02','Case stream','Open the strongest connected story before individual objects.',[atom('incidentList','v5-feed')]),note('Case severity is review priority. It is not proof of malicious intent.','boundary'));
    const deep=atom('incidentDeepReviewCard','v5-selected hidden');if(deep){const h=$('h2',deep);if(h)h.textContent='Selected case';}drawerNodes.incidents=deep;
  }
  {
    const s=screen('weakness');rename('runDeepSearch','Search filenames');rename('runWeaknessAudit','Audit visibility');rename('loadCoverage','Refresh coverage');rename('loadAdvancedSensor','Check sensor boundary');
    add(s,chapter('01','Name the target','Filename discovery reads names and paths only; it does not index file contents.',[form('deepSearchForm','search'),atom('deepSearchMeta','v5-meta'),atom('deepSearchResults','v5-feed')],'lead'),chapter('02','Visibility','Missing evidence lowers confidence; it does not justify guessing.',[tools([atom('runWeaknessAudit','v5-button primary'),atom('loadCoverage','v5-button')]),atom('weaknessAudit','v5-output'),atom('coverageMap','v5-output')]),chapter('03','Sensor boundary','Endpoint Security must not appear active unless the required entitlement and System Extension really exist.',[tools([atom('loadAdvancedSensor','v5-button')]),atom('advancedSensorStatus','v5-output')]));
  }
  {
    const s=screen('intelligence');rename('captureEvidence','Capture evidence');rename('loadEvidence','Refresh relations');rename('loadTimeline','Refresh timeline');
    add(s,chapter('01','Capture','Take a bounded relationship snapshot before interpreting it.',[tools([atom('captureEvidence','v5-button primary'),atom('loadEvidence','v5-button')]),atom('evidenceSummary','v5-mini-instrument'),atom('evidenceNote','v5-meta')],'lead'),chapter('02','Relationship map','Startup → file → process → endpoint. Edges are observed links, not causal claims.',[atom('graphWrap','v5-graph'),atom('graphObjects','v5-object-index')],'visual'),chapter('03','Time','Order captured changes without turning sequence into causality.',[tools([atom('loadTimeline','v5-button')]),atom('timelineList','v5-feed timeline')]));
    const story=atom('objectStory','v5-selected');if(story){const h=$('h2',story);if(h)h.textContent='Selected object';}drawerNodes.intelligence=story||atom('storyBody','v5-output');
  }
  {
    const s=screen('security');rename('runAudit','Run audit');
    const score=el('div','v5-scoreline');
    score.append(add(el('div'),el('span','','Priority'),atom('riskScore','v5-score')),add(el('div'),el('span','','Assessment'),atom('riskLevel','v5-assessment')));
    add(s,chapter('01','Prioritize','Rank explainable evidence for review.',[tools([atom('runAudit','v5-button primary')]),score,atom('riskDisclaimer','v5-meta')],'lead'),chapter('02','Evidence findings','Each finding should state what was observed and why it deserves attention.',[atom('findings','v5-feed')]),note('Signing, location, persistence, and network context are separate evidence. None is a verdict by itself.','boundary'));
  }
  {
    const s=screen('integrity');rename('inspectIntegrity','Verify object');
    add(s,chapter('01','Choose one object','Verification is deliberately narrow and on demand.',[form('integrityForm','object')],'lead'),chapter('02','Identity evidence','Read hash, signature, and Gatekeeper context before interpretation.',[atom('integrityBody','v5-output detail')]));
  }
  {
    const s=screen('changes');rename('startChanges','Start watch');rename('stopChanges','Stop');rename('reviewChanges','Reinspect changed');rename('reconcileChanges','Reconcile');rename('clearChanges','Clear');rename('loadChangeHistory','History');rename('refreshChanges','Refresh');
    add(s,chapter('01','Scope the watch','Choose where to observe. Native FSEvents is used when available; bounded polling is the fallback.',[selectorAtom('.change-controls','v5-watch-controls'),atom('changeStatus','v5-output')],'lead'),chapter('02','Change stream','Newest observations first.',[tools([atom('loadChangeHistory','v5-button'),atom('refreshChanges','v5-button')]),atom('changeEvents','v5-feed stream')]),chapter('03','Reinspect','Re-check only changed objects that warrant deeper evidence.',[atom('changeReview','v5-output')]));
  }
  {
    const s=screen('behavior');rename('captureBehavior','Capture & compare');rename('loadBehavior','Load');rename('loadBehaviorHistory','Trend');rename('loadBehaviorHealth','Verify history');
    add(s,chapter('01','Comparison state','Current bounded metadata against the previous capture.',[tools([atom('captureBehavior','v5-button primary'),atom('loadBehavior','v5-button')]),atom('behaviorSummary','v5-mini-instrument'),atom('behaviorBaseline','v5-meta')],'lead'),chapter('02','Observed differences','Treat change as evidence, not danger.',[atom('behaviorChanges','v5-feed')]),pair(chapter('03','Trend','Bounded history of change pressure.',[tools([atom('loadBehaviorHistory','v5-button')]),atom('behaviorTrend','v5-output'),atom('behaviorHistoryList','v5-feed')]),chapter('04','History integrity','Verify that stored comparison history remains readable.',[tools([atom('loadBehaviorHealth','v5-button')]),atom('baselineHealth','v5-output')])));
  }
  {
    const s=screen('trust');rename('compareTrust','Compare');rename('captureTrust','Set reference');rename('loadTrustHealth','Verify reference');rename('exportTrust','Export');rename('restoreTrust','Restore previous');rename('loadTrustHistory','History');
    add(s,chapter('01','Reference state','Compare current bounded identity against the state you explicitly approved.',[tools([atom('compareTrust','v5-button primary'),atom('captureTrust','v5-button'),atom('exportTrust','v5-button'),atom('restoreTrust','v5-button')]),atom('trustSummary','v5-mini-instrument'),atom('trustStatus','v5-meta')],'lead'),chapter('02','Drift evidence','Differences from the active reference.',[atom('trustChanges','v5-feed')]),pair(chapter('03','History','Recent comparisons against the reference active at that time.',[tools([atom('loadTrustHistory','v5-button')]),atom('trustHistoryList','v5-feed')]),chapter('04','Reference integrity','Verify current and previous reference stores.',[tools([atom('loadTrustHealth','v5-button')]),atom('trustHealth','v5-output')])));
  }
  {
    const s=screen('hardware');rename('loadSystemProfile','Read machine');
    add(s,chapter('01','Machine identity','Model, processor, architecture, and Sentinel runtime context.',[tools([atom('loadSystemProfile','v5-button primary')]),atom('hardwareSummary','v5-output')],'lead'),pair(chapter('02','Hardware','Physical resources reported by macOS.',[atom('hardwareGrid','v5-kv')]),chapter('03','Runtime','Operating system, kernel, architecture, and translation context.',[atom('softwareGrid','v5-kv')])));
  }
  {
    const s=screen('processes');rename('loadProcesses','Refresh');rename('closeProcessDetail','Close');const filter=atom('processFilter','v5-input');if(filter)filter.placeholder='Filter running software';
    add(s,chapter('01','Running software','Current process snapshot. Select a row to inspect identity and activity.',[tools([filter,atom('loadProcesses','v5-button primary')]),atom('processTable','v5-table')],'lead'));
    const detail=atom('processDetail','v5-selected hidden');if(detail){const h=$('h2',detail);if(h)h.textContent='Selected process';}drawerNodes.processes=detail;
  }
  {
    const s=screen('startup');rename('loadStartup','Refresh');add(s,chapter('01','Automatic launch declarations','Read path, signature, and manifest behavior together.',[tools([atom('loadStartup','v5-button primary')]),atom('startupTable','v5-table')],'lead'));
  }
  {
    const s=screen('persistence');rename('capturePersistence','Capture / compare');rename('loadPersistence','Refresh');add(s,chapter('01','Persistence drift','Additions, removals, and same-name content changes between bounded captures.',[tools([atom('capturePersistence','v5-button primary'),atom('loadPersistence','v5-button')]),atom('persistenceSummary','v5-meta'),atom('persistenceChanges','v5-feed')],'lead'));
  }
  {
    const s=screen('background');rename('loadBackground','Refresh');add(s,chapter('01','Background registrations','Modern macOS registrations complement classic startup evidence.',[tools([atom('loadBackground','v5-button primary')]),atom('backgroundNote','v5-meta'),atom('backgroundTable','v5-table')],'lead'));
  }
  {
    const s=screen('network');rename('loadNetwork','Refresh');add(s,chapter('01','TCP activity','Read endpoints together with the local process that owns them.',[tools([atom('loadNetwork','v5-button primary')]),atom('networkTable','v5-table')],'lead'));
  }
  {
    const s=screen('storage');rename('startScan','Measure');rename('cancelScan','Cancel');
    add(s,chapter('01','Measurement','Choose scope, minimum size, and result budget.',[selectorAtom('.preset-row','v5-presets'),form('scanForm','storage'),atom('scanProgress','v5-output hidden'),atom('scanSummary','v5-meta')],'lead'),pair(chapter('02','Largest areas','Measured categories in this scan.',[atom('categoryBars','v5-bars')]),chapter('03','File types','Measured footprint by type.',[atom('typeBars','v5-bars')])),chapter('04','Largest objects','Objects that crossed the selected threshold.',[atom('fileFilter','v5-input'),atom('filesTable','v5-table')]),pair(chapter('05','Exact duplicates','Size match followed by local SHA-256 comparison.',[atom('hashAmount','v5-chip'),atom('duplicates','v5-feed')]),chapter('06','Possible versions','Filename-family heuristic only.',[atom('families','v5-feed')])));
  }
  {
    const s=screen('cleanup');rename('previewCleanup','Analyze');add(s,chapter('01','Estimate first','Measure common reviewable storage categories without deleting anything.',[tools([atom('previewCleanup','v5-button primary')]),atom('cleanupTotal','v5-output hidden'),atom('cleanupList','v5-feed')],'lead'));
  }
  {
    const s=screen('actions');rename('loadActionHealth','Verify recovery');rename('previewAction','Preview impact');rename('revealActionPath','Reveal target');rename('executeAction','Confirm change');rename('loadVault','Refresh Vault');rename('loadActionJournal','Refresh journal');
    add(s,chapter('01','Recovery readiness','Verify Vault, journal, and recovery state before touching a path.',[tools([atom('loadActionHealth','v5-button primary')]),atom('actionStatus','v5-output'),note('No permanent delete · no overwrite · regular user-home files only.','warning')],'lead'),chapter('02','Target','Choose one object and build a fresh dependency-aware preview.',[form('actionForm','action')]),pair(chapter('03','Vault','Locally recoverable items. Restore refuses to overwrite an occupied original path.',[tools([atom('loadVault','v5-button')]),atom('vaultList','v5-feed')]),chapter('04','Operation history','Bounded record of reversible changes and immediate post-action observations.',[tools([atom('loadActionJournal','v5-button')]),atom('actionJournal','v5-feed')])));
    const preview=atom('actionPreviewCard','v5-selected hidden');drawerNodes.actions=preview;
  }
  {
    const s=screen('guide');const flow=el('div','v5-flow');
    [['01','Observe','Start with current state.'],['02','Explain','Correlate only the evidence needed.'],['03','Compare','Use time when the question is about change.'],['04','Act','Change only after a reversible preview.']].forEach(([n,t,d])=>{const step=el('div','v5-flow-step');step.append(el('span','',n),el('b','',t),el('small','',d));flow.appendChild(step);});
    const defs=el('dl','v5-defs');[['Priority','What deserves review first.'],['Confidence','How strongly observations belong together.'],['Signature','Whether signed code validates.'],['Gatekeeper','macOS distribution and trust context.'],['Reference match','Whether current identity matches a user-approved reference.'],['Change','A difference between bounded observations.']].forEach(([k,v])=>defs.append(el('dt','',k),el('dd','',v)));
    add(s,chapter('01','Operating model','Use the shortest path that can answer the question.',[flow],'lead'),chapter('02','Visibility','Sentinel cannot grant itself macOS permissions and should never invent conclusions for evidence it cannot read.',[note('Normal access provides substantial local evidence. Full Disk Access can expand protected-path visibility. Endpoint Security requires Apple entitlement and a System Extension.','boundary')]),chapter('03','Evidence semantics','Keep concepts separate so labels do not become verdicts.',[defs]));
  }

  $$('.v5-shell .card').forEach(n=>n.classList.remove('card'));
  $$('.v5-shell .two-col').forEach(n=>n.classList.remove('two-col'));
  $$('.v5-shell .section-head').forEach(n=>n.classList.add('v5-legacy-head'));

  function renderLens(view){
    const meta=VIEWS[view];const mission=MISSIONS.find(m=>m.id===meta.mission);if(!mission)return;
    lensSelect.replaceChildren();
    for(const candidate of mission.views){const option=document.createElement('option');option.value=candidate;option.textContent=VIEWS[candidate].label;lensSelect.appendChild(option);}
    lensSelect.value=view;
  }
  function renderDrawer(view){
    const meta=VIEWS[view];
    drawerTitle.replaceChildren(el('span','',meta.verb),el('b','',meta.title),el('small','',meta.rule));
    canBox.replaceChildren(el('span','','Can establish'),el('p','',meta.can));
    cannotBox.replaceChildren(el('span','','Do not infer'),el('p','',meta.cannot));
    selectedHost.replaceChildren();
    const selected=drawerNodes[view];
    if(selected){selectedHost.appendChild(selected);selectedLabel.hidden=false;selectedHost.hidden=false;}else{selectedLabel.hidden=true;selectedHost.hidden=true;}
    nextHost.replaceChildren();
    for(const next of NEXT[view]||[]){const b=el('button','v5-next-action');b.type='button';b.append(el('b','',VIEWS[next].label),el('small','',VIEWS[next].title));b.addEventListener('click',()=>selectView(next));nextHost.appendChild(b);}
  }
  function sync(view=currentLegacyView()){
    const meta=VIEWS[view]||VIEWS.overview;
    $$('.v5-screen').forEach(s=>s.classList.toggle('active',s.dataset.view===view));
    $$('.v5-mission').forEach(b=>b.classList.toggle('active',b.dataset.mission===meta.mission));
    renderLens(view);renderDrawer(view);
  }
  sync();

  const legacyViews=$$('.desktop-compat-layer .view');
  const navObserver=new MutationObserver(()=>queueMicrotask(()=>sync(currentLegacyView())));
  legacyViews.forEach(v=>navObserver.observe(v,{attributes:true,attributeFilter:['class']}));

  function watchSelected(node,view,{content=false}={}){
    if(!node)return;
    const observer=new MutationObserver(()=>{
      if(currentLegacyView()!==view)return;
      const visible=!node.classList.contains('hidden');
      if(content || visible) openDrawer();
    });
    observer.observe(node,{attributes:true,attributeFilter:['class'],childList:true,subtree:content});
  }
  watchSelected(drawerNodes.incidents,'incidents');
  watchSelected(drawerNodes.processes,'processes');
  watchSelected(drawerNodes.actions,'actions');
  watchSelected(byId('storyBody'),'intelligence',{content:true});

  const endpointRules=[
    ['/api/system-profile','hardware','Reading machine'],['/api/quick-check','quickcheck','Building snapshot'],['/api/review-queue','quickcheck','Building queue'],['/api/guided-snapshot','quickcheck','Capturing evidence'],['/api/readiness','overview','Verifying Sentinel'],['/api/search/deep','weakness','Searching filenames'],['/api/weakness-audit','weakness','Auditing visibility'],['/api/coverage','weakness','Reading coverage'],['/api/advanced-sensor/status','weakness','Checking sensor boundary'],['/api/search','weakness','Searching evidence'],['/api/changes','changes','Updating watch'],['/api/incidents','incidents','Building cases'],['/api/storage','storage','Measuring storage'],['/api/security/audit','security','Running audit'],['/api/self/integrity','overview','Verifying engine'],['/api/integrity','integrity','Verifying object'],['/api/intelligence','intelligence','Building relations'],['/api/object/story','intelligence','Building object story'],['/api/behavior','behavior','Comparing behavior'],['/api/trust','trust','Comparing reference'],['/api/process/detail','processes','Inspecting process'],['/api/processes','processes','Loading processes'],['/api/startup','startup','Loading startup'],['/api/persistence','persistence','Comparing persistence'],['/api/background','background','Loading background'],['/api/network','network','Loading network'],['/api/cleanup/preview','cleanup','Analyzing space'],['/api/actions','actions','Preparing change'],['/api/report/export','overview','Building report'],['/api/diagnostics/export','overview','Building diagnostics'],['/api/capabilities','overview','Checking sources'],['/api/overview','overview','Refreshing status']
  ];
  const progressState=new WeakMap();
  function progressPanel(){
    let panel=$('.sentinel-task-progress',progressHost);if(panel)return panel;
    panel=el('div','sentinel-task-progress');panel.dataset.state='idle';
    const head=el('div','sentinel-progress-head');head.append(el('b','','Ready'),el('strong','','0%'));
    const bar=document.createElement('progress');bar.className='sentinel-percent-bar';bar.max=100;bar.value=0;
    panel.append(head,bar,el('small','sentinel-progress-detail','Progress appears only after a real localhost request starts.'));
    progressHost.appendChild(panel);return panel;
  }
  function pstate(panel){let state=progressState.get(panel);if(!state){state={active:0,percent:0,timer:null};progressState.set(panel,state);}return state;}
  function setProgress(panel,percent,label,detail,state='running'){
    if(!panel)return;const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0))),ps=pstate(panel);ps.percent=value;panel.dataset.state=state;
    const b=$('.sentinel-progress-head b',panel),strong=$('.sentinel-progress-head strong',panel),bar=$('.sentinel-percent-bar',panel),small=$('.sentinel-progress-detail',panel);
    if(b)b.textContent=label;if(strong)strong.textContent=`${value}%`;if(bar)bar.value=value;if(small)small.textContent=detail||'';
  }
  function stopProgressTimer(panel){const state=pstate(panel);if(state.timer)clearInterval(state.timer);state.timer=null;}
  function requestInfo(input){
    try{const raw=typeof input==='string'?input:(input?.url||''),url=new URL(raw,location.origin),match=endpointRules.find(([prefix])=>url.pathname.startsWith(prefix));return{path:url.pathname,view:match?.[1]||currentLegacyView(),label:match?.[2]||'Working locally'};}catch{return{path:'',view:currentLegacyView(),label:'Working locally'};}
  }
  function beginRequest(info){
    const panel=progressPanel(),state=pstate(panel);state.active+=1;
    if(state.active===1){setProgress(panel,Math.max(8,state.percent>=100?8:state.percent||8),info.label,`${info.path} · localhost request started.`,'running');state.timer=setInterval(()=>setProgress(panel,Math.min(92,state.percent+(state.percent<45?4:1)),info.label,'Waiting for the local Sentinel engine.','running'),450);}return panel;
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
      if(panel){const state=pstate(panel);state.active=Math.max(0,state.active-1);if(state.active===0){stopProgressTimer(panel);if(!payload||!info.path.startsWith('/api/storage')||payload.status!=='running')setProgress(panel,100,response.ok?`${info.label} complete`:`${info.label} failed`,response.ok?'Local engine returned successfully.':`Local request failed: HTTP ${response.status}`,response.ok?'complete':'error');}}
      return response;
    }catch(error){if(panel){stopProgressTimer(panel);const state=pstate(panel);state.active=0;setProgress(panel,100,`${info.label} failed`,`Local request failed: ${error?.message||error}`,'error');}throw error;}
  };
  window.addEventListener('error',event=>{const panel=progressPanel();setProgress(panel,100,'Interface error',`Interface error: ${event.message||'Unknown desktop UI error'}`,'error');});
  window.addEventListener('unhandledrejection',event=>{const panel=progressPanel(),detail=event.reason?.message||String(event.reason||'Unknown rejection');setProgress(panel,100,'Interface error',`Interface error: ${detail}`,'error');});
})();
