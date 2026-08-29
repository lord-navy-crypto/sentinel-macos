// SPDX-License-Identifier: MPL-2.0
(() => {
  // Desktop App View is a first-principles workbench layered over the same
  // trusted feature IDs and app.js event handlers. We move existing nodes
  // instead of cloning or replacing them, so every backend capability remains wired.
  if (window.__sentinelDesktopUIInstalled) return;
  window.__sentinelDesktopUIInstalled = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  document.body.classList.remove('easy-mode');
  const legacyGroup = document.querySelector('.nav-group-label.advanced-nav');
  if (legacyGroup) {
    legacyGroup.textContent = 'More tools';
    legacyGroup.hidden = true;
  }

  const IA = {
    overview: {group:'NOW',nav:'Command',title:'Command',sub:'See the current state, decide what deserves attention, then move directly to evidence.',stage:'Orient',question:'What needs attention now?'},
    quickcheck: {group:'NOW',nav:'Snapshot',title:'Snapshot',sub:'Take one bounded read-only observation and turn it into a prioritized review queue.',stage:'Observe',question:'What changed or looks unusual enough to inspect?'},
    incidents: {group:'INVESTIGATE',nav:'Cases',title:'Cases',sub:'Group related observations into coherent investigation stories instead of chasing isolated alerts.',stage:'Correlate',question:'Which observations belong to the same story?'},
    weakness: {group:'INVESTIGATE',nav:'Investigate',title:'Investigate',sub:'Start from a target or question, search evidence, then check whether Sentinel can actually see enough to answer it.',stage:'Query',question:'What object, path, process, or blind spot am I trying to understand?'},
    intelligence: {group:'INVESTIGATE',nav:'Evidence',title:'Evidence',sub:'Read relationships, time, and object context together so one observation is never mistaken for the whole story.',stage:'Connect',question:'How are the objects related, and in what order did events occur?'},
    behavior: {group:'INVESTIGATE',nav:'Behavior',title:'Behavior',sub:'Compare bounded captures to distinguish stable state from meaningful change.',stage:'Compare',question:'What is different from the previous observation?'},
    trust: {group:'INVESTIGATE',nav:'Reference',title:'Reference',sub:'Compare current identity and fingerprints with a state you explicitly approved.',stage:'Compare',question:'What differs from my approved reference state?'},
    hardware: {group:'SYSTEM',nav:'Machine',title:'Machine',sub:'Read the physical and runtime context that explains what this Sentinel session can observe and execute.',stage:'Context',question:'What machine and runtime am I actually investigating?'},
    processes: {group:'SYSTEM',nav:'Processes',title:'Processes',sub:'Inspect running software as identities with executable, signature, and connection context.',stage:'Inspect',question:'What is running, and what does this process connect to?'},
    startup: {group:'SYSTEM',nav:'Startup',title:'Startup',sub:'Review declarations that cause software to launch automatically.',stage:'Inspect',question:'What is configured to launch automatically?'},
    persistence: {group:'SYSTEM',nav:'Persistence',title:'Persistence',sub:'Compare visible launch configuration against a session baseline.',stage:'Compare',question:'Did startup configuration change during this session?'},
    background: {group:'SYSTEM',nav:'Background',title:'Background',sub:'Inspect modern macOS background registrations alongside classic launch configuration.',stage:'Inspect',question:'What background registrations exist beyond LaunchAgents?'},
    network: {group:'SYSTEM',nav:'Network',title:'Network',sub:'Read a bounded TCP snapshot and connect endpoints back to local processes.',stage:'Inspect',question:'Which processes currently have TCP activity?'},
    storage: {group:'SYSTEM',nav:'Storage',title:'Storage',sub:'Measure where space is going, then separate exact duplicates from heuristic version families.',stage:'Measure',question:'Where is storage pressure coming from?'},
    security: {group:'VERIFY & RESOLVE',nav:'Audit',title:'Audit',sub:'Correlate explainable review signals without turning a score into a malware verdict.',stage:'Assess',question:'Which evidence deserves review, and why?'},
    integrity: {group:'VERIFY & RESOLVE',nav:'Verify File',title:'Verify File',sub:'Inspect one local object with hashes, signing evidence, and Gatekeeper context.',stage:'Verify',question:'What can I establish about this exact file or app?'},
    actions: {group:'VERIFY & RESOLVE',nav:'Resolve',title:'Resolve',sub:'Move from evidence to a reversible action only after impact preview and explicit confirmation.',stage:'Resolve',question:'What is the safest reversible change I can make?'},
    cleanup: {group:'VERIFY & RESOLVE',nav:'Reclaim',title:'Reclaim',sub:'Estimate reviewable storage first; hand eligible objects to the reversible action gate only after review.',stage:'Review',question:'What space can be reviewed without auto-deleting anything?'},
    guide: {group:'SUPPORT',nav:'Help & Access',title:'Help & Access',sub:'Understand visibility boundaries, evidence semantics, and the safe operating path.',stage:'Understand',question:'What can Sentinel see, and how should I interpret what it shows?'}
  };

  const GROUPS = [
    ['NOW',['overview','quickcheck']],
    ['INVESTIGATE',['incidents','weakness','intelligence','behavior','trust']],
    ['SYSTEM',['hardware','processes','startup','persistence','background','network','storage']],
    ['VERIFY & RESOLVE',['security','integrity','actions','cleanup']],
    ['SUPPORT',['guide']]
  ];

  const q = (root,selector) => (root || document).querySelector(selector);
  const qa = (root,selector) => [...(root || document).querySelectorAll(selector)];
  const make = (tag,className,text) => { const n=document.createElement(tag); if(className)n.className=className; if(text!==undefined)n.textContent=text; return n; };
  const setText = (selector,text,root=document) => { const n=q(root,selector); if(n&&typeof text==='string')n.textContent=text; return n; };

  function relabelButtons(){
    const labels={exportReport:'Export evidence report',pageHelpToggle:'Explain view',refresh:'Refresh view',runReadiness:'Verify Sentinel',exportDiagnostics:'Export diagnostics',loadCapabilities:'Refresh sources',loadSelfIntegrity:'Verify Sentinel binary',runQuickCheck:'Take snapshot',guidedSnapshot:'Capture full evidence',loadReviewQueue:'Refresh queue',loadSystemProfile:'Read machine',rebuildIncidents:'Rebuild cases',loadIncidentHistory:'Case history',closeIncidentDeepReview:'Close review',startChanges:'Start watch',stopChanges:'Stop watch',reviewChanges:'Review changed objects',reconcileChanges:'Reconcile',clearChanges:'Clear inbox',loadChangeHistory:'Watch history',refreshChanges:'Refresh inbox',startScan:'Measure storage',cancelScan:'Cancel',runAudit:'Run evidence audit',inspectIntegrity:'Verify object',captureEvidence:'Capture evidence',loadEvidence:'Refresh relationships',loadTimeline:'Refresh timeline',captureBehavior:'Capture & compare',loadBehavior:'Load comparison',loadBehaviorHistory:'Refresh trend',loadBehaviorHealth:'Verify history',compareTrust:'Compare to reference',captureTrust:'Set reference',loadTrustHealth:'Verify reference',exportTrust:'Export reference',restoreTrust:'Restore previous',loadTrustHistory:'Refresh comparisons',loadProcesses:'Refresh processes',closeProcessDetail:'Close detail',loadStartup:'Refresh startup',capturePersistence:'Capture / compare',loadPersistence:'Refresh state',loadBackground:'Refresh background',loadNetwork:'Refresh network',previewCleanup:'Analyze reclaimable space',loadActionHealth:'Verify recovery',previewAction:'Preview reversible action',revealActionPath:'Reveal target',executeAction:'Confirm reversible action',loadVault:'Refresh Vault',loadActionJournal:'Refresh journal',runDeepSearch:'Search filenames',runWeaknessAudit:'Audit visibility',loadCoverage:'Refresh coverage',loadAdvancedSensor:'Check sensor boundary'};
    for(const [id,label] of Object.entries(labels))setText(`#${id}`,label);
    qa(document,'[data-go="quickcheck"]').forEach(n=>n.textContent='Take snapshot');
    qa(document,'[data-go="storage"]').forEach(n=>n.textContent='Measure storage');
    qa(document,'[data-go="weakness"]').forEach(n=>n.textContent='Investigate evidence');
    qa(document,'[data-go="changes"]').forEach(n=>n.textContent='Watch changes');
    qa(document,'[data-go="processes"]').forEach(n=>n.textContent='Inspect processes');
    qa(document,'[data-go="security"]').forEach(n=>n.textContent='Run audit');
    qa(document,'[data-go="behavior"]').forEach(n=>n.textContent='Compare behavior');
    qa(document,'[data-go="trust"]').forEach(n=>n.textContent='Open reference');
  }

  function installNavigation(){
    const nav=q(document,'.sidebar nav');
    if(!nav||nav.dataset.desktopRebuilt==='1')return;
    nav.dataset.desktopRebuilt='1';
    const old=q(nav,'.nav-group-label'); if(old)old.hidden=true;
    for(const [groupName,views] of GROUPS){
      const group=make('section','desktop-nav-group');
      group.appendChild(make('div','desktop-nav-label',groupName));
      for(const view of views){
        const button=q(nav,`.nav[data-view="${view}"]`);
        if(!button)continue;
        button.textContent=IA[view].nav;
        button.dataset.desktopGroup=groupName;
        group.appendChild(button);
      }
      nav.appendChild(group);
    }
  }

  function rewriteStaticCopy(){
    setText('.brand small','Local system intelligence');
    setText('.privacy b','Local session');
    setText('.privacy small','Loopback only · reversible changes');
    const h2Copy={
      overview:['Start from evidence, not fear','Sentinel readiness','Machine context','Operating boundaries','Evidence sources','Sentinel binary identity'],
      quickcheck:['Decision snapshot','Recommended paths','Review queue'],
      hardware:['Machine identity','Hardware','Runtime','Field notes','Privacy boundary'],
      incidents:['Case builder','Case queue','Deep review','Confidence model','Investigation path'],
      changes:['Watch control','Monitoring model','Targeted review','Change inbox'],
      storage:['Storage scan','Largest areas','File-type footprint','Exact duplicates','Version families','Largest objects'],
      security:['Audit summary'],integrity:['Verify one object'],
      intelligence:['Evidence capture','Relationship graph','Timeline','Object narrative'],
      behavior:['Behavior comparison','Evidence trend','Baseline health','Observed changes','Persistence boundary'],
      trust:['Reference comparison','Reference health','Reference controls','Comparison history','Drift evidence'],
      processes:['Running processes','Process detail'],startup:['Startup declarations'],persistence:['Persistence comparison'],
      background:['Background registrations','Interpretation'],network:['TCP snapshot'],cleanup:['Reclaim preview'],
      actions:['Resolve safely','Recovery health','Action semantics','Prepare action','Confirmation gate','Vault','Recovery journal'],
      weakness:['Evidence query','Visibility audit','Coverage map','Sensor boundary'],
      guide:['Operating path','Permissions','Interpretation','Design basis','Glossary']
    };
    for(const [view,titles] of Object.entries(h2Copy)){
      const section=document.getElementById(view); if(!section)continue;
      qa(section,'h2').forEach((node,index)=>{if(titles[index])node.textContent=titles[index];});
    }
    const descriptions={
      overview:'Observe first, then choose the narrowest investigation that can answer the question. Sentinel should not turn uncertainty into automatic action.',
      quickcheck:'Combine current local evidence into one attention state. This observation does not change Behavior, Reference, or file state.',
      hardware:'Read model, processor, architecture, memory, operating system, and runtime without collecting unique hardware identifiers.',
      incidents:'Rebuild related observations into cases so timing, identity, persistence, and reference drift can be reviewed together.',
      changes:'Choose a narrow scope, observe changes, then re-inspect only the objects that moved.',
      storage:'Choose scope and threshold, measure locally, then separate measured facts from heuristics before deciding what deserves review.',
      security:'Correlate location, persistence, signing, and current network evidence. The score is review priority, not malware probability.',
      integrity:'Verify one exact path with a content fingerprint and macOS trust context. Useful evidence is not the same thing as proof of intent.',
      intelligence:'Capture a bounded relationship snapshot so startup declarations, files, processes, and network endpoints can be read together.',
      behavior:'Compare current bounded metadata with the previous capture. The result measures change pressure, not danger.',
      trust:'Compare the current state with a reference you explicitly chose. Matching the reference is context, not a security certificate.',
      processes:'Start with what is running now. Select a process to connect executable identity, signature context, and current TCP activity.',
      startup:'Read launch declarations together with executable path and configuration meaning. Persistence is common in legitimate software.',
      persistence:'Capture visible launch configuration, then compare later state for additions, removals, and same-name content changes.',
      background:'Read modern macOS background registrations when the system exposes them.',
      network:'Read current TCP activity as context. A public endpoint is common and is not suspicious by itself.',
      cleanup:'Estimate reviewable space without deleting anything. Send only reviewed eligible files into the reversible Resolve workflow.',
      actions:'A reversible action is the last step, not the first. Review evidence and dependency impact before changing a path.',
      weakness:'Start from a concrete query. Search current evidence first; use bounded filename discovery only when the object is not already represented.',
      guide:'Use the shortest path that answers the question: observe, investigate, verify, then resolve only when evidence supports action.'
    };
    for(const [view,text] of Object.entries(descriptions)){
      const section=document.getElementById(view); if(!section)continue;
      const p=q(section,'.section-head > div > p') || q(section,'article.card p');
      if(p)p.textContent=text;
    }
    setText('.welcome-card > div > p',descriptions.overview,document.getElementById('overview'));
    setText('.action-warning > p','Use Resolve only after evidence review. Every mutation remains reversible, scoped, dependency-previewed, and explicitly confirmed.',document.getElementById('actions'));
    setText('.welcome-card .eyebrow','LOCAL EVIDENCE WORKBENCH',document.getElementById('overview'));
    setText('.quick-hero .eyebrow','READ-ONLY OBSERVATION',document.getElementById('quickcheck'));
    setText('.hardware-hero .eyebrow','LOCAL MACHINE CONTEXT',document.getElementById('hardware'));
    setText('#incidents .eyebrow','CORRELATED EVIDENCE');
    setText('.change-hero .eyebrow','BOUNDED CHANGE WATCH',document.getElementById('changes'));
    const search=document.getElementById('globalSearch'); if(search)search.placeholder='Search current evidence… process, path, endpoint, severity';
    const deep=document.getElementById('deepSearchQ'); if(deep)deep.placeholder='Filename or path fragment';
    const fileFilter=document.getElementById('fileFilter'); if(fileFilter)fileFilter.placeholder='Filter measured objects';
    const processFilter=document.getElementById('processFilter'); if(processFilter)processFilter.placeholder='Filter running processes';
  }

  function addWorkspaceIntro(section,meta){
    if(!section||q(section,':scope > .workspace-intro'))return;
    const intro=make('div','workspace-intro');
    intro.append(make('span','workspace-stage',meta.stage),make('h2','workspace-question',meta.question),make('p','workspace-intent',meta.sub));
    section.prepend(intro);
  }
  function zone(className,label){const outer=make('div',`workspace-zone ${className}`);if(label)outer.appendChild(make('div','workspace-zone-label',label));const body=make('div','workspace-zone-body');outer.appendChild(body);outer.body=body;return outer;}

  function composeOverview(){
    const section=document.getElementById('overview'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const welcome=q(section,'.welcome-card'),ready=q(section,'.readiness-card'),metrics=q(section,'.hero-grid'),context=q(section,'.two-col');
    const cards=qa(section,':scope > article.card').filter(n=>n!==welcome&&n!==ready),evidenceSources=cards[0],selfIntegrity=cards[1];
    const layout=make('div','command-workbench'),main=zone('command-primary','DECIDE'),side=zone('command-side','READINESS'),wide=zone('command-wide','EVIDENCE BOUNDARY');
    if(welcome)main.body.appendChild(welcome); if(metrics)main.body.appendChild(metrics); if(context)main.body.appendChild(context);
    if(ready)side.body.appendChild(ready); if(selfIntegrity)side.body.appendChild(selfIntegrity); if(evidenceSources)wide.body.appendChild(evidenceSources);
    layout.append(main,side,wide); section.appendChild(layout);
  }

  function composeTwoLane(view,mainSelectors,sideSelectors,wideSelectors=[]){
    const section=document.getElementById(view); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const layout=make('div','two-lane-workbench'),main=zone('lane-main','PRIMARY'),side=zone('lane-side','CONTEXT'),wide=zone('lane-wide','DETAIL');
    const claim=(selector,target)=>qa(section,`:scope > ${selector}`).forEach(node=>target.body.appendChild(node));
    mainSelectors.forEach(s=>claim(s,main)); sideSelectors.forEach(s=>claim(s,side)); wideSelectors.forEach(s=>claim(s,wide));
    [...section.children].filter(node=>!node.classList.contains('workspace-intro')&&!node.classList.contains('two-lane-workbench')&&!node.classList.contains('workspace-zone')).forEach(node=>wide.body.appendChild(node));
    layout.append(main,side); if(wide.body.children.length)layout.appendChild(wide); section.appendChild(layout);
  }

  function composeQuickCheck(){
    const section=document.getElementById('quickcheck'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const hero=q(section,'.quick-hero'),metrics=document.getElementById('quickCheckMetrics'),cards=qa(section,':scope > article.card').filter(n=>n!==hero),recommended=cards[0],queue=cards[1];
    const layout=make('div','decision-workbench'),observe=zone('decision-observe','OBSERVE'),review=zone('decision-review','REVIEW'),next=zone('decision-next','NEXT');
    if(hero)observe.body.appendChild(hero); if(metrics)observe.body.appendChild(metrics); if(queue)review.body.appendChild(queue); if(recommended)next.body.appendChild(recommended);
    layout.append(observe,review,next); section.appendChild(layout);
  }

  function composeIncidents(){
    const section=document.getElementById('incidents'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const articles=qa(section,':scope > article.card'),summary=articles[0],list=articles[1],deep=document.getElementById('incidentDeepReviewCard'),guide=q(section,':scope > .two-col');
    const layout=make('div','case-workbench'),queueZone=zone('case-queue','CASES'),detailZone=zone('case-detail','SELECTED CASE'),modelZone=zone('case-model','HOW TO READ IT');
    if(summary)queueZone.body.appendChild(summary); if(list)queueZone.body.appendChild(list); if(deep)detailZone.body.appendChild(deep); if(guide)modelZone.body.appendChild(guide);
    layout.append(queueZone,detailZone,modelZone); section.appendChild(layout);
  }

  function composeChanges(){
    const section=document.getElementById('changes'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const hero=q(section,'.change-hero'),pair=q(section,':scope > .two-col'),inbox=qa(section,':scope > article.card').find(n=>n!==hero);
    const layout=make('div','watch-workbench'),control=zone('watch-control','WATCH'),events=zone('watch-events','INBOX'),review=zone('watch-review','REINSPECT'),model=zone('watch-model','CONFIDENCE');
    if(hero)control.body.appendChild(hero); if(inbox)events.body.appendChild(inbox);
    if(pair){const parts=[...pair.children];if(parts[1])review.body.appendChild(parts[1]);if(parts[0])model.body.appendChild(parts[0]);pair.remove();}
    layout.append(control,events,review,model); section.appendChild(layout);
  }

  function composeWeakness(){
    const section=document.getElementById('weakness'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const queryCard=q(section,'.power-search-card'),pair=q(section,':scope > .two-col'),sensor=qa(section,':scope > article.card').find(n=>n!==queryCard);
    const layout=make('div','investigate-workbench'),queryZone=zone('investigate-query','QUERY'),visibility=zone('investigate-visibility','VISIBILITY'),boundary=zone('investigate-boundary','SENSOR BOUNDARY');
    if(queryCard)queryZone.body.appendChild(queryCard); if(pair){[...pair.children].forEach(n=>visibility.body.appendChild(n));pair.remove();} if(sensor)boundary.body.appendChild(sensor);
    layout.append(queryZone,visibility,boundary); section.appendChild(layout);
  }

  function composeStorage(){
    const section=document.getElementById('storage'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const scan=q(section,':scope > article.card'),insights=document.getElementById('storageInsights'),duplicates=document.getElementById('duplicatesPanel'),families=document.getElementById('familiesPanel'),files=qa(section,':scope > article.card').find(n=>n!==scan);
    const layout=make('div','storage-workbench'),control=zone('storage-control','MEASURE'),footprint=zone('storage-footprint','FOOTPRINT'),objects=zone('storage-objects','OBJECTS'),candidates=zone('storage-candidates','COMPARE');
    if(scan)control.body.appendChild(scan); if(insights)footprint.body.appendChild(insights); if(files)objects.body.appendChild(files); if(duplicates)candidates.body.appendChild(duplicates); if(families)candidates.body.appendChild(families);
    layout.append(control,footprint,objects,candidates); section.appendChild(layout);
  }

  function composeEvidence(){
    const section=document.getElementById('intelligence'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const hero=q(section,'.intelligence-hero'),graph=qa(section,':scope > article.card').find(n=>n!==hero),bottom=q(section,'.intelligence-bottom');
    const layout=make('div','evidence-workbench'),capture=zone('evidence-capture','CAPTURE'),graphZone=zone('evidence-graph-zone','RELATIONSHIPS'),time=zone('evidence-time','TIME'),object=zone('evidence-object','OBJECT');
    if(hero)capture.body.appendChild(hero); if(graph)graphZone.body.appendChild(graph);
    if(bottom){const parts=[...bottom.children];if(parts[0])time.body.appendChild(parts[0]);if(parts[1])object.body.appendChild(parts[1]);bottom.remove();}
    layout.append(capture,graphZone,time,object); section.appendChild(layout);
  }

  function composeActions(){
    const section=document.getElementById('actions'); if(!section||section.dataset.desktopComposed)return; section.dataset.desktopComposed='1';
    const warning=q(section,'.action-warning'),pair=q(section,':scope > .two-col'),formCard=qa(section,':scope > article.card').find(n=>q(n,'#actionForm')),preview=document.getElementById('actionPreviewCard'),vault=qa(section,':scope > article.card').find(n=>q(n,'#vaultList')),journal=qa(section,':scope > article.card').find(n=>q(n,'#actionJournal'));
    const layout=make('div','resolve-workbench'),guard=zone('resolve-guard','SAFETY GATE'),act=zone('resolve-action','TARGET & PREVIEW'),recover=zone('resolve-recover','RECOVERY');
    if(warning)guard.body.appendChild(warning); if(pair){[...pair.children].forEach(n=>guard.body.appendChild(n));pair.remove();}
    if(formCard)act.body.appendChild(formCard); if(preview)act.body.appendChild(preview); if(vault)recover.body.appendChild(vault); if(journal)recover.body.appendChild(journal);
    layout.append(guard,act,recover); section.appendChild(layout);
  }

  function composeGenericViews(){
    composeTwoLane('hardware',['.hardware-hero','.two-col'],['.privacy-hardware'],['article.card:not(.hardware-hero):not(.privacy-hardware)']);
    composeTwoLane('security',['article.card'],['#findings']);
    composeTwoLane('integrity',['article.card'],[]);
    composeTwoLane('behavior',['.behavior-hero'],['.behavior-history-grid'],['article.card']);
    composeTwoLane('trust',['.trust-hero','article.card:last-of-type'],['.two-col'],['article.card']);
    composeTwoLane('processes',['article.card:first-of-type'],['#processDetail']);
    composeTwoLane('startup',['article.card'],[]); composeTwoLane('persistence',['article.card'],[]);
    composeTwoLane('background',['article.card:first-of-type'],['article.card:last-of-type']);
    composeTwoLane('network',['article.card'],[]); composeTwoLane('cleanup',['article.card'],[]);
    composeTwoLane('guide',['article.card:first-of-type'],['.two-col'],['article.card']);
  }

  function composeAllViews(){
    for(const [view,meta] of Object.entries(IA))addWorkspaceIntro(document.getElementById(view),meta);
    composeOverview();composeQuickCheck();composeIncidents();composeChanges();composeWeakness();composeStorage();composeEvidence();composeActions();composeGenericViews();
  }

  function applyDesktopNames(){
    for(const [view,meta] of Object.entries(IA)){const button=q(document,`.nav[data-view="${view}"]`);if(button&&button.textContent!==meta.nav)button.textContent=meta.nav;}
    const active=q(document,'.view.active')?.id||'overview',meta=IA[active]; if(!meta)return;
    setText('#pageTitle',meta.title);setText('#pageSub',meta.sub);
    const stage=q(document.getElementById(active),':scope > .workspace-intro .workspace-stage'),question=q(document.getElementById(active),':scope > .workspace-intro .workspace-question');
    if(stage)stage.textContent=meta.stage;if(question)question.textContent=meta.question;
  }

  installNavigation();rewriteStaticCopy();relabelButtons();composeAllViews();applyDesktopNames();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installNavigation();rewriteStaticCopy();relabelButtons();composeAllViews();applyDesktopNames();},{once:true});
  const app=q(document,'.app');
  if(app){const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&r.attributeName==='class'))queueMicrotask(applyDesktopNames);});observer.observe(app,{subtree:true,attributes:true,attributeFilter:['class']});}

  const endpointRules=[['/api/system-profile','hardware','Reading machine'],['/api/quick-check','quickcheck','Building snapshot'],['/api/review-queue','quickcheck','Building review queue'],['/api/guided-snapshot','quickcheck','Capturing evidence'],['/api/readiness','overview','Verifying Sentinel'],['/api/search/deep','weakness','Searching filenames'],['/api/weakness-audit','weakness','Auditing visibility'],['/api/coverage','weakness','Reading coverage'],['/api/advanced-sensor/status','weakness','Checking sensor boundary'],['/api/search','weakness','Searching evidence'],['/api/changes','changes','Updating watch'],['/api/incidents','incidents','Building cases'],['/api/storage','storage','Measuring storage'],['/api/security/audit','security','Running evidence audit'],['/api/self/integrity','overview','Verifying Sentinel binary'],['/api/integrity','integrity','Verifying object'],['/api/intelligence','intelligence','Building relationships'],['/api/object/story','intelligence','Building object narrative'],['/api/behavior','behavior','Comparing behavior'],['/api/trust','trust','Comparing reference'],['/api/process/detail','processes','Inspecting process'],['/api/processes','processes','Loading processes'],['/api/startup','startup','Loading startup'],['/api/persistence','persistence','Comparing persistence'],['/api/background','background','Loading background'],['/api/network','network','Loading network'],['/api/cleanup/preview','cleanup','Analyzing reclaimable space'],['/api/actions','actions','Preparing reversible action'],['/api/report/export','overview','Building evidence report'],['/api/diagnostics/export','overview','Building diagnostics'],['/api/capabilities','overview','Checking evidence sources'],['/api/overview','overview','Refreshing command view']];
  const panelState=new WeakMap();
  function stateFor(panel){let state=panelState.get(panel);if(!state){state={active:0,percent:0,timer:null};panelState.set(panel,state);}return state;}
  function panelForView(viewId){const view=document.getElementById(viewId)||q(document,'.view.active');if(!view)return null;let panel=q(view,'.sentinel-task-progress');if(panel)return panel;const host=q(view,'.workspace-intro')||q(view,'.card')||view;panel=make('div','sentinel-task-progress');panel.dataset.state='idle';const head=make('div','sentinel-progress-head');head.append(make('b','','Ready'),make('strong','','0%'));const bar=document.createElement('progress');bar.className='sentinel-percent-bar';bar.max=100;bar.value=0;panel.append(head,bar,make('small','sentinel-progress-detail','Progress appears only after a real localhost request starts.'));host.appendChild(panel);return panel;}
  function setPanel(panel,percent,label,detail,stateName='running'){if(!panel)return;const value=Math.max(0,Math.min(100,Math.round(Number(percent)||0))),state=stateFor(panel);state.percent=value;panel.dataset.state=stateName;const head=q(panel,'.sentinel-progress-head'),b=q(head,'b'),strong=q(head,'strong'),bar=q(panel,'.sentinel-percent-bar'),small=q(panel,'.sentinel-progress-detail');if(b)b.textContent=label;if(strong)strong.textContent=`${value}%`;if(bar)bar.value=value;if(small)small.textContent=detail||'';}
  function stopTimer(panel){const state=stateFor(panel);if(state.timer)clearInterval(state.timer);state.timer=null;}
  function requestInfo(input){try{const raw=typeof input==='string'?input:(input?.url||''),url=new URL(raw,location.origin),match=endpointRules.find(([prefix])=>url.pathname.startsWith(prefix));return{path:url.pathname,view:match?.[1]||q(document,'.view.active')?.id||'overview',label:match?.[2]||'Working locally'};}catch{return{path:'',view:q(document,'.view.active')?.id||'overview',label:'Working locally'};}}
  function beginRequest(info){const panel=panelForView(info.view);if(!panel)return null;const state=stateFor(panel);state.active+=1;if(state.active===1){const start=state.percent>=100?8:Math.max(8,state.percent||8);setPanel(panel,start,info.label,`${info.path} · localhost request started.`,'running');state.timer=setInterval(()=>{const next=Math.min(92,state.percent+(state.percent<45?4:1));setPanel(panel,next,info.label,'Waiting for the local Sentinel engine.','running');},450);}return panel;}
  const storagePhaseLabel=phase=>({walking:'Scanning files',grouping:'Preparing duplicate candidates',hashing:'Hashing duplicate candidates',finalizing:'Building storage report',complete:'Storage scan complete',cancelled:'Storage scan cancelled',failed:'Storage scan failed'}[phase]||'Scanning storage');
  const formatBytes=value=>{let n=Math.max(0,Number(value)||0);const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i+=1;}return`${n.toFixed(i===0||n>=10?1:2)} ${units[i]}`;};
  function handleStorageJob(job){if(!job||typeof job!=='object')return;const panel=panelForView('storage');if(!panel)return;const phase=String(job.phase||job.status||'walking'),percent=Number(job.phase_percent||(job.status==='complete'?100:12)),files=Number(job.files_visited||0),dirs=Number(job.dirs_visited||0),hashFilesDone=Number(job.hash_files_done||0),hashFilesTotal=Number(job.hash_files_total||0),hashBytesDone=Number(job.hash_bytes_done||0),hashBytesTotal=Number(job.hash_bytes_total||0),bits=[`${files.toLocaleString()} files`,`${dirs.toLocaleString()} folders`];if(phase==='hashing'||hashFilesTotal>0||hashBytesTotal>0){bits.push(`${hashFilesDone.toLocaleString()}/${hashFilesTotal.toLocaleString()} hash files`);bits.push(`${formatBytes(hashBytesDone)} / ${formatBytes(hashBytesTotal)} hashed`);}const stateName=job.status==='failed'?'error':job.status==='complete'?'complete':'running';setPanel(panel,percent,storagePhaseLabel(phase),bits.join(' · '),stateName);}

  const nativeFetch=window.fetch.bind(window);
  window.fetch = async (...args)=>{
    const info=requestInfo(args[0]),panel=beginRequest(info);
    try{
      const response=await nativeFetch(...args);let payload=null;
      try{const type=response.headers.get('content-type')||'';if(type.includes('application/json'))payload=await response.clone().json();}catch{payload=null;}
      if(payload&&info.path.startsWith('/api/storage'))handleStorageJob(payload);
      if(panel){const state=stateFor(panel);state.active=Math.max(0,state.active-1);if(state.active===0){stopTimer(panel);if(!payload||!info.path.startsWith('/api/storage')||payload.status!=='running'){setPanel(panel,100,response.ok?`${info.label} complete`:`${info.label} failed`,response.ok?'The local engine returned successfully.':`Local request failed: HTTP ${response.status}`,response.ok?'complete':'error');}}}
      return response;
    }catch(error){if(panel){stopTimer(panel);const state=stateFor(panel);state.active=0;setPanel(panel,100,`${info.label} failed`,`Local request failed: ${error?.message||error}`,'error');}throw error;}
  };
  window.addEventListener('error',event=>{const panel=panelForView(q(document,'.view.active')?.id||'overview');if(panel)setPanel(panel,100,'Interface error',`Interface error: ${event.message||'Unknown desktop UI error'}`,'error');});
  window.addEventListener('unhandledrejection',event=>{const panel=panelForView(q(document,'.view.active')?.id||'overview'),detail=event.reason?.message||String(event.reason||'Unknown rejection');if(panel)setPanel(panel,100,'Interface error',`Interface error: ${detail}`,'error');});
})();
