// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const titles = {
    overview:['Mac Health','See what your Mac is storing, running, connecting to, and starting.'],
    quickcheck:['Quick Check','Run one read-only check and get prioritized next steps without changing baselines or files.'],
    hardware:['System Profile','Understand this Mac model, chip, architecture, cores, memory, macOS build, and storage.'],
    weakness:['Search & Weakness','Search current evidence more precisely, run bounded filename discovery, and see Sentinel blind spots.'],
    changes:['Change Monitor','Watch selected directory hierarchies, preserve bounded history/checkpoints, and re-inspect only what changed.'],
    incidents:['Incident Intelligence','Correlate related changes into evidence stories with explicit confidence semantics.'],
    storage:['Storage Intelligence','Understand space consumption instead of only listing large files.'],
    security:['Security Audit','Evidence-based review signals, not panic-driven malware claims.'],
    integrity:['Integrity Lab','Deep read-only inspection of one local file or app path.'],
    intelligence:['Intelligence','Correlate files, processes, startup persistence, and network activity into object stories.'],
    behavior:['Behavior History','See what changed, how evidence pressure is trending, and whether the local baseline is healthy.'],
    trust:['Trust & Drift','Compare the current Mac against an explicit user-approved reference profile.'],
    processes:['Processes','Inspect running software, executable paths, signatures, and network activity.'],
    startup:['Startup Items','Review LaunchAgents and LaunchDaemons and selected manifest behavior.'],
    persistence:['Persistence Integrity','Detect session-level changes to LaunchAgent and LaunchDaemon configuration files.'],
    background:['Login & Background','Inspect modern macOS background registrations alongside classic startup items.'],
    network:['Network Activity','Inspect a local snapshot of TCP activity.'],
    cleanup:['Cleanup Preview','Estimate reviewable storage and hand eligible files to reversible Safe Actions.'],
    actions:['Safe Actions','Preview dependencies, then rename, Vault, restore, reveal, and review the local recovery journal.'],
    guide:['Guide & Permissions','What each module does, how to interpret evidence, and where macOS permissions limit visibility.']
  };
  const pageHelp = {
    overview:'Home summarizes the Mac and Sentinel itself. Nothing on this page changes your files or security baselines.',
    quickcheck:'Quick Check is read-only. It combines current security evidence with existing Behavior, Trust, Persistence, and recovery-health state. Its Attention Index is not a malware probability.',
    hardware:'System Profile is a read-only local hardware summary. Sentinel deliberately omits the full serial number and Hardware UUID because they are not needed for compatibility explanations.',
    weakness:'Power Search ranks current bounded evidence and supports filters. Deep filename search is explicit and bounded. Weakness Audit scores Sentinel visibility/defensive posture, not malware likelihood.',
    changes:'Change Monitor stops when Sentinel exits, but V2.2 can keep bounded compressed history and a native FSEvents checkpoint. Dropped/root-changed conditions trigger rescan-required semantics instead of false confidence.',
    incidents:'Incidents correlate multiple Sentinel evidence sources. Evidence Confidence measures relationship strength, never malware probability.',
    storage:'Storage scans are bounded and cancellable. Exact duplicates use SHA-256; version families are filename heuristics only. Nothing is removed automatically.',
    security:'Security Audit correlates local evidence. A high score means review the evidence; it does not prove malware.',
    integrity:'Integrity Lab deeply inspects one path using hashing and macOS signing/Gatekeeper evidence when available.',
    intelligence:'Intelligence correlates startup items, files, processes, and network activity into Object Stories.',
    behavior:'Behavior compares adjacent Sentinel captures. It detects change; it does not learn that repeated behavior is automatically safe.',
    trust:'Trust & Drift compares against a reference that you explicitly approve. Profile membership is context, not a safety certificate.',
    processes:'Processes shows the current process snapshot and lets you inspect executable identity and related network evidence.',
    startup:'Startup reviews LaunchAgents and LaunchDaemons. A startup item may be legitimate; use its path, signature, and context together.',
    persistence:'Persistence Integrity fingerprints visible launch configuration files for this session and reports later configuration changes.',
    background:'Login & Background displays modern macOS background registrations when the system tool is available.',
    network:'Network shows a bounded TCP snapshot. Public connections are common and are not suspicious by themselves.',
    cleanup:'Cleanup Preview estimates common reviewable storage. It never deletes; eligible files can be handed to Safe Actions.',
    actions:'Safe Actions are intentionally reversible: Reveal, Rename, Vault, Restore. There is no permanent-delete API.',
    guide:'Guide explains each module, privacy limits, Full Disk Access, and why missing evidence reduces visibility rather than creating invented conclusions.'
  };
  const advancedViews = new Set(['integrity','intelligence','behavior','trust','processes','startup','persistence','background','network','cleanup']);
  let navMode = 'easy';
  let searchTimer = null;
  let current = 'overview';
  let scanJob = '';
  let scanPoll = null;
  let lastFiles = [];
  let processRows = [];
  let evidenceGraph = null;

  function setNavMode(mode){
    navMode=mode==='advanced'?'advanced':'easy';
    document.body.classList.toggle('easy-mode',navMode==='easy');
    $('#easyMode')?.classList.toggle('active',navMode==='easy');
    $('#advancedMode')?.classList.toggle('active',navMode==='advanced');
  }
  function updatePageHelp(){ const box=$('#pageHelp'); if(!box)return; box.innerHTML=`<b>${esc(titles[current]?.[0]||'Sentinel')}</b><span>${esc(pageHelp[current]||'This module uses local evidence and preserves Sentinel safety boundaries.')}</span>`; }
  function togglePageHelp(){ const box=$('#pageHelp'); updatePageHelp(); box?.classList.toggle('hidden'); }
  function showNotice(msg){ const n=$('#notice'); n.textContent=msg; n.classList.toggle('hidden',!msg); }
  async function api(url, options={}){
    options.headers = {...(options.headers||{}), 'X-Sentinel-Token':token};
    const res = await fetch(url, options);
    const ct = res.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await res.json().catch(()=>({error:`HTTP ${res.status}`})) : null;
    if(!res.ok) throw new Error(data?.error||`HTTP ${res.status}`);
    return data;
  }
  function bytes(n){ if(!Number.isFinite(n)||n<=0)return '0 B'; const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n.toFixed(n>=10||i===0?1:2)} ${u[i]}`; }
  function esc(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function pct(a,b){ return b>0?Math.round(a/b*100):0; }
  function fmtTime(unix){ if(!unix)return '—'; try{return new Date(unix*1000).toLocaleString()}catch{return '—'} }
  function fmtISO(v){ if(!v)return '—'; try{return new Date(v).toLocaleString()}catch{return String(v)} }
  function setBusy(btn,busy,label='Working…'){ if(!btn)return; if(busy){btn.dataset.old=btn.textContent;btn.textContent=label;btn.disabled=true}else{btn.textContent=btn.dataset.old||btn.textContent;btn.disabled=false} }
  function riskBadge(v){ const cls=v>=70?'bad':v>=35?'warn':'good'; return `<span class="badge ${cls}">${v}</span>`; }

  async function loadOverview(){
    try{
      const o=await api('/api/overview');
      const dp=pct(o.disk_used,o.disk_total), mp=pct(o.memory_used,o.memory_total);
      $('#diskPct').textContent=dp+'%'; $('#diskBar').value=Math.min(100,dp); $('#diskText').textContent=`${bytes(o.disk_used)} of ${bytes(o.disk_total)} · ${bytes(o.disk_available)} free`;
      $('#memPct').textContent=o.memory_total?mp+'%':'—'; $('#memBar').value=Math.min(100,mp); $('#memText').textContent=o.memory_total?`${bytes(o.memory_used)} of ${bytes(o.memory_total)}`:'Memory detail available on macOS build';
      $('#systemKV').innerHTML=[['Host',o.hostname],['Platform',`${o.os} · ${o.arch}`],['CPU cores',o.cpu_count],['Processes',o.process_count],['1 min load',o.load_1||'—'],['Mode','Read-only analysis + opt-in reversible file actions'],['Server','127.0.0.1 only'],['Uptime',o.uptime]].map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');
      loadCapabilities(); loadBehavior(); loadTrust();
    }catch(e){showNotice(e.message)}
  }
  function hardwareCell(label,value,detail=''){
    return `<div><span>${esc(label)}</span><b>${esc(value||'—')}</b>${detail?`<small>${esc(detail)}</small>`:''}</div>`;
  }
  async function loadSystemProfile(){
    const btn=$('#loadSystemProfile');setBusy(btn,true,'Reading hardware…');
    try{
      const d=await api('/api/system-profile');
      const coreSplit=(Number(d.performance_cores||0)||Number(d.efficiency_cores||0))?`${Number(d.performance_cores||0)} performance · ${Number(d.efficiency_cores||0)} efficiency`:'Not separately reported';
      $('#hardwareSummary').innerHTML=`<div class="hardware-summary"><div><span class="eyebrow">${esc(d.platform_family||'Mac')}</span><h3>${esc(d.model_name||'Mac')}</h3><p>${esc(d.chip||d.processor||'Processor not reported')}</p></div><div><span>Sentinel engine</span><b>${esc(d.engine_architecture||d.architecture||'—')}</b><small>${esc(d.engine_explanation||'')}</small></div></div>`;
      $('#hardwareGrid').innerHTML=[
        hardwareCell('Model',d.model_name,'Human-readable Mac family'),
        hardwareCell('Model identifier',d.model_identifier,'Technical Apple model family'),
        hardwareCell('Chip',d.chip,'Apple Silicon SoC or processor family'),
        hardwareCell('Processor',d.processor,'Processor description reported by macOS'),
        hardwareCell('Architecture',d.architecture,d.platform_family||''),
        hardwareCell('Physical cores',d.physical_cores,'Actual CPU cores'),
        hardwareCell('Logical cores',d.logical_cores,'Execution threads exposed to macOS'),
        hardwareCell('Core layout',coreSplit,'Apple Silicon split when macOS reports it'),
        hardwareCell('Memory',bytes(Number(d.memory_bytes||0)),'Total memory visible to macOS'),
        hardwareCell('Root storage',bytes(Number(d.disk_total||0)),`${bytes(Number(d.disk_available||0))} available`)
      ].join('');
      $('#softwareGrid').innerHTML=[
        hardwareCell('Operating system',d.os_name||'macOS',d.os_version||''),
        hardwareCell('macOS version',d.os_version,'User-facing OS version'),
        hardwareCell('macOS build',d.os_build,'Exact Apple build identifier'),
        hardwareCell('Kernel',d.kernel_version,'Darwin kernel version'),
        hardwareCell('Rosetta translation',d.rosetta_translated?'Yes':'No',d.rosetta_translated?'Current process is translated; native arm64 is preferable.':'Current engine is not reporting Rosetta translation.'),
        hardwareCell('Sentinel engine',d.engine_architecture,d.engine_explanation||'')
      ].join('');
    }catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  async function loadCapabilities(){try{const d=await api('/api/capabilities');const rows=d.items||[];$('#capabilityGrid').innerHTML=rows.map(x=>`<div class="capability ${x.available?'available':'missing'}"><div><b>${esc(x.name)}</b><span>${x.available?'available':'unavailable'}</span></div><p>${esc(x.purpose)}</p><code>${esc(x.example)}</code></div>`).join('')||'<div class="empty">No capability metadata.</div>';}catch(e){$('#capabilityGrid').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  async function exportDiagnostics(){const btn=$('#exportDiagnostics');setBusy(btn,true,'Exporting…');try{const res=await fetch('/api/diagnostics/export',{headers:{'X-Sentinel-Token':token}});if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||`HTTP ${res.status}`)}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sentinel-diagnostics.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}

  function severityClass(v){v=String(v||'info').toLowerCase();return v==='high'||v==='elevated'?'bad':v==='review'||v==='warn'?'warn':v==='good'?'good':'info'}
  async function runQuickCheck(){
    const btn=$('#runQuickCheck'); setBusy(btn,true,'Checking locally…'); showNotice('');
    try{
      const d=await api('/api/quick-check');
      const cls=d.attention_index>=75?'bad':d.attention_index>=45?'warn':d.attention_index>=20?'info':'good';
      $('#quickCheckStatus').innerHTML=`<div class="quick-score ${cls}"><div><span>Attention Index</span><strong>${esc(d.attention_index)}</strong><b>${esc(d.band)}</b></div><p>${esc(d.meaning)}</p><small>Generated ${esc(fmtISO(d.generated_at))}</small></div>`;
      $('#quickCheckMetrics').classList.remove('hidden');
      $('#quickCheckMetrics').innerHTML=[['Security',`${d.security?.score??0} · ${d.security?.level||'—'}`],['Disk used',`${d.disk_percent??0}%`],['Behavior',d.behavior_baseline?`${d.behavior_index??0} · ${d.behavior_band||'—'}`:'No baseline'],['Trust',d.trust_profile?`${d.trust_index??0} · ${d.trust_band||'—'}`:'No profile'],['Persistence',d.persistence_baseline?(d.persistence_high?`${d.persistence_high} high-priority change(s)`:'Baseline ready'):'No session baseline'],['Incidents',d.incident_count?`${d.incident_count} current · ${d.incident_high||0} high`:'None built'],['Recovery',d.action_health?.healthy?'Healthy':'Needs review']].map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
      const recs=d.recommendations||[];
      $('#quickRecommendations').innerHTML=recs.length?recs.map((r,i)=>`<div class="recommendation ${severityClass(r.severity)}"><div><span class="eyebrow">${esc(r.severity||'info')}</span><h3>${esc(r.title)}</h3><p>${esc(r.reason)}</p></div><button class="secondary quick-next" data-view="${esc(r.view)}">${esc(r.cta||'Open')}</button></div>`).join(''):'<div class="empty">No next steps were generated.</div>';
      $$('.quick-next').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
      $('#securityLevel').textContent=d.security?.level||'Not scanned'; $('#securityHint').textContent=`Quick Check score ${d.security?.score??0}. Open Security Audit for evidence.`; loadReviewQueue();
    }catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  async function loadReviewQueue(){
    const btn=$('#loadReviewQueue');setBusy(btn,true,'Building queue…');
    try{const d=await api('/api/review-queue');const rows=d.items||[];$('#reviewQueue').innerHTML=rows.length?`<div class="queue-summary"><span>${Number(d.counts?.high||0)} high</span><span>${Number(d.counts?.review||0)} review</span><span>${Number(d.counts?.info||0)} info</span></div>${rows.map((r,i)=>`<div class="review-item ${severityClass(r.severity)}"><div><span class="eyebrow">${esc(r.source)} · ${esc(r.severity)}</span><h3>${esc(r.title)}</h3><p>${esc(r.detail||'')}</p>${r.path?`<code>${esc(r.path)}</code>`:''}</div><button class="secondary queue-open" data-index="${i}">Open</button></div>`).join('')}`:`<div class="good-note">The current bounded evidence produced no high/review queue items. This is not a malware-free guarantee.</div>`;$$('.queue-open').forEach(b=>b.addEventListener('click',()=>{const r=rows[Number(b.dataset.index)];if(r.source==='incident')switchView('incidents');else if(r.path)openFileStory(r.path);else switchView(r.view||'overview')}));}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  async function captureGuidedSnapshot(){
    const btn=$('#guidedSnapshot');if(!confirm('Monitoring Snapshot updates the local Behavior and Persistence baseline/history. If a Trusted Profile already exists, it also performs a Trust comparison. It does not modify user files. Continue?'))return;setBusy(btn,true,'Capturing…');
    try{const d=await api('/api/guided-snapshot',{method:'POST'});showNotice(`Monitoring snapshot captured: ${d.graph_nodes||0} evidence nodes · Behavior ${d.behavior?.risk_index??0} · Persistence changes ${(d.persistence?.changes||[]).length}${d.trust_ran?` · Trust ${d.trust?.drift_index??0}`:' · no Trusted Profile comparison'}.`);await runQuickCheck();await loadReviewQueue();}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  function renderSearchResults(d){
    const panel=$('#globalSearchPanel'), rows=d.results||[], q=d.query||'';
    if(!q){panel.classList.add('hidden');panel.innerHTML='';return;}
    panel.classList.remove('hidden');
    const help=(d.help||[]).slice(0,4).map(x=>`<code>${esc(x)}</code>`).join('');
    panel.innerHTML=`<div class="search-note"><b>Power Search</b><span>${esc(d.note||'')}</span>${help?`<div class="search-help">${help}</div>`:''}</div>${rows.length?rows.map((r,i)=>`<button class="search-result" data-index="${i}"><span class="search-kind">${esc(r.kind)}<small>${Number(r.score||0)}</small></span><div><b>${esc(r.title||'Untitled')}</b><small>${esc(r.subtitle||'')}</small><em>${esc(r.why_matched||'')}</em></div></button>`).join(''):`<div class="empty">No current bounded evidence matched “${esc(q)}”.</div>`}<button id="searchDeepFromGlobal" class="deep-search-link" type="button">Deep filename search for “${esc(q)}” →</button>`;
    $$('.search-result').forEach(b=>b.addEventListener('click',()=>openSearchResult(rows[Number(b.dataset.index)])));
    $('#searchDeepFromGlobal')?.addEventListener('click',()=>{switchView('weakness');$('#deepSearchQ').value=q;$('#deepSearchQ').focus();$('#globalSearchPanel').classList.add('hidden')});
  }
  async function runGlobalSearch(){
    const q=$('#globalSearch').value.trim(); if(q.length<2){renderSearchResults({query:q,results:[]});return;}
    try{renderSearchResults(await api('/api/search?q='+encodeURIComponent(q)))}catch(e){showNotice(e.message)}
  }
  function scheduleGlobalSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(runGlobalSearch,180)}
  async function openSearchResult(r){
    $('#globalSearchPanel').classList.add('hidden');
    if(r.kind==='process'&&r.pid){await openProcessStory(r.pid);return;}
    if(r.kind==='network'&&r.pid){await openProcessStory(r.pid);return;}
    if(r.kind==='incident'){switchView('incidents');await loadIncidents(false);return;}
    if(r.kind==='vault'){switchView('actions');await loadVault();return;}
    if(r.kind==='path'){switchView('integrity');$('#integrityPath').value=r.path||'';$('#integrityPath').focus();return;}
    if(r.path){await openFileStory(r.path);return;}
    switchView(r.view||'overview');
  }
  async function runDeepSearch(ev){
    ev?.preventDefault(); const btn=$('#runDeepSearch'); const q=$('#deepSearchQ').value.trim(); if(q.length<2){showNotice('Deep filename search requires at least 2 characters.');return;} setBusy(btn,true,'Searching…');
    try{const scope=$('#deepSearchScope').value, limit=Number($('#deepSearchLimit').value||80);const d=await api(`/api/search/deep?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}&limit=${encodeURIComponent(limit)}`);$('#deepSearchMeta').textContent=`Visited ${Number(d.visited||0).toLocaleString()} entries in ${Number(d.elapsed_ms||0).toLocaleString()} ms · ${d.results?.length||0} result(s)${d.truncated?' · safety limit reached':''}. ${d.note||''}`;const rows=d.results||[];$('#deepSearchResults').innerHTML=rows.length?rows.map((r,i)=>`<div class="deep-result"><div><span class="eyebrow">${esc(r.kind)} · score ${Number(r.score||0)}</span><h3>${esc(r.name)}</h3><code>${esc(r.path)}</code><small>${r.kind==='file'?bytes(r.size||0):'Directory'} · ${esc(r.why_matched||'')}</small></div><button class="secondary deep-open" data-index="${i}">Inspect</button></div>`).join(''):'<div class="empty">No filename/path matches were found within the bounded search budget.</div>';$$('.deep-open').forEach(b=>b.addEventListener('click',()=>{const r=rows[Number(b.dataset.index)];if(r.kind==='file')openFileStory(r.path);else{switchView('integrity');$('#integrityPath').value=r.path;}}));}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  function renderCoverage(d){const rows=d.items||[];$('#coverageMap').innerHTML=`<div class="coverage-summary"><span>${Number(d.available||0)} available</span><span>${Number(d.limited||0)} limited</span><span>${Number(d.unavailable||0)} unavailable</span></div>${rows.map(r=>`<div class="coverage-row ${esc(r.status)}"><div><b>${esc(r.area)}</b><p>${esc(r.detail)}</p>${r.requires?`<small>Needs: ${esc(r.requires)}</small>`:''}</div><span class="badge">${esc(r.status)}</span></div>`).join('')}<p class="muted">${esc(d.note||'')}</p>`}
  async function loadAdvancedSensor(){try{const d=await api('/api/advanced-sensor/status');$('#advancedSensorStatus').innerHTML=`<div class="integrity-grid"><div><span>Platform</span><b>${esc(d.platform)}</b></div><div><span>Sensor source/payload</span><b>${d.sensor_present?'Present near app':'Not installed'}</b></div><div><span>Enabled</span><b>${d.enabled?'YES':'No'}</b></div><div><span>Apple entitlement</span><b>${d.entitlement_needed?'Required':'—'}</b></div><div><span>Full Disk Access</span><b>${d.full_disk_access_required?'Required for ES client':'—'}</b></div><div><span>Mode</span><b>${esc(d.mode)}</b></div></div><p class="muted">${esc(d.note||'')}</p>`}catch(e){showNotice(e.message)}}
  async function loadCoverage(){const btn=$('#loadCoverage');setBusy(btn,true,'Checking…');try{renderCoverage(await api('/api/coverage'))}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function runWeaknessAudit(){const btn=$('#runWeaknessAudit');setBusy(btn,true,'Auditing…');try{const d=await api('/api/weakness-audit');const rows=d.findings||[];$('#weaknessAudit').innerHTML=`<div class="weakness-score ${severityClass(d.score>=80?'good':d.score>=60?'info':d.score>=40?'review':'high')}"><span>Sentinel posture</span><strong>${Number(d.score||0)}/100</strong><b>${esc(d.band||'')}</b></div>${rows.map(r=>`<div class="weakness-finding ${severityClass(r.severity)}"><span class="eyebrow">${esc(r.severity)} · ${esc(r.area)}</span><h3>${esc(r.title)}</h3><p>${esc(r.evidence)}</p><small><b>Improve:</b> ${esc(r.improve)}</small></div>`).join('')}<p class="muted">${esc(d.note||'')}</p>`;renderCoverage(d.coverage||{});}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  function applyScanPreset(btn){$('#scope').value=btn.dataset.scope;$('#minMB').value=btn.dataset.min;$('#limit').value=btn.dataset.limit;startStorage();}

  async function startStorage(ev){
    ev?.preventDefault();
    if(scanPoll) clearTimeout(scanPoll);
    const btn=$('#startScan'); setBusy(btn,true,'Starting…'); showNotice('');
    try{
      const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:$('#scope').value,min_mb:Number($('#minMB').value),limit:Number($('#limit').value)})});
      scanJob=job.id; $('#scanProgress').classList.remove('hidden'); $('#cancelScan').classList.remove('hidden'); $('#scanState').textContent='Scanning locally…'; $('#scanSummary').textContent='Scan running. Results will appear when the bounded scan completes.';
      pollStorage();
    }catch(e){showNotice(e.message);setBusy(btn,false)}
  }
  async function pollStorage(){
    if(!scanJob)return;
    try{
      const j=await api('/api/storage/jobs?id='+encodeURIComponent(scanJob));
      $('#scanCounts').textContent=`${Number(j.files_visited||0).toLocaleString()} files · ${Number(j.dirs_visited||0).toLocaleString()} folders · ${Number(j.permission_errors||0).toLocaleString()} permission limits`;
      $('#scanPath').textContent=j.current_path||'';
      if(j.status==='running'){ scanPoll=setTimeout(pollStorage,450); return; }
      $('#cancelScan').classList.add('hidden'); $('#scanProgress').classList.add('hidden'); setBusy($('#startScan'),false);
      if(j.status==='failed'){ showNotice(j.error||'Scan failed'); return; }
      if(j.result) renderStorage(j.result,j.status);
    }catch(e){ showNotice(e.message); $('#scanProgress').classList.add('hidden'); $('#cancelScan').classList.add('hidden'); setBusy($('#startScan'),false); }
  }
  async function cancelStorage(){
    if(!scanJob)return;
    const btn=$('#cancelScan'); setBusy(btn,true,'Cancelling…');
    try{ await api('/api/storage/cancel?id='+encodeURIComponent(scanJob),{method:'POST'}); $('#scanState').textContent='Cancelling safely…'; }
    catch(e){showNotice(e.message);setBusy(btn,false)}
  }
  function renderStorage(d,status){
    lastFiles=d.large_files||[];
    const cancelled=status==='cancelled'||d.cancelled;
    $('#scanSummary').textContent=`${cancelled?'Cancelled after':'Scanned'} ${Number(d.files_visited).toLocaleString()} files and ${Number(d.dirs_visited).toLocaleString()} folders in ${(d.duration_ms/1000).toFixed(1)}s. Accounted for ${bytes(d.visible_bytes)} of visible file data. ${d.permission_errors} permission-limited entries.${d.truncated?' Safety entry limit reached.':''}`;
    renderFileTable(lastFiles);
    const hasInsights=(d.categories?.length||d.file_types?.length); $('#storageInsights').classList.toggle('hidden',!hasInsights);
    $('#categoryBars').innerHTML=categoryBars(d.categories||[]); $('#typeBars').innerHTML=categoryBars(d.file_types||[]);
    if(d.families?.length){ $('#familiesPanel').classList.remove('hidden'); $('#families').innerHTML=d.families.map(f=>`<div class="family"><div class="family-head"><b>${esc(f.key)}</b><span>${bytes(f.total_size)} across ${f.files.length} files</span></div><div class="family-files">${f.files.map(x=>esc(x.name)).join(' · ')}</div></div>`).join(''); } else $('#familiesPanel').classList.add('hidden');
    if(d.duplicates?.length){ $('#duplicatesPanel').classList.remove('hidden'); $('#hashAmount').textContent=`Hashed ${bytes(d.duplicate_hash_bytes)}`; $('#duplicates').innerHTML=d.duplicates.map(g=>`<div class="duplicate"><div class="duplicate-head"><div><b>${g.files.length} exact copies</b><span>${bytes(g.size)} each · up to ${bytes(g.waste)} duplicate bytes</span></div><span class="hash mono">${esc((g.sha256||'').slice(0,16))}…</span></div>${g.files.map(f=>`<div class="duplicate-file"><span>${esc(f.name)}</span><span class="mono muted">${esc(f.path)}</span></div>`).join('')}</div>`).join(''); } else $('#duplicatesPanel').classList.add('hidden');
  }
  function categoryBars(rows){ if(!rows?.length)return '<div class="empty">No category data.</div>'; const max=Math.max(...rows.map(x=>x.size),1); return rows.map(x=>`<div class="category-row"><div class="category-label"><span>${esc(x.name)}</span><b>${bytes(x.size)}</b></div><progress class="mini-progress" max="100" value="${Math.max(2,Math.round(x.size/max*100))}"></progress><small>${Number(x.files).toLocaleString()} files</small></div>`).join(''); }
  function renderFileTable(files){ const q=($('#fileFilter').value||'').toLowerCase(); const rows=files.filter(f=>!q||(f.name+' '+f.path).toLowerCase().includes(q)); $('#filesTable').innerHTML=rows.length?`<table><thead><tr><th>Size</th><th>Modified</th><th>File</th><th>Path</th><th></th></tr></thead><tbody>${rows.map(f=>`<tr><td><b>${bytes(f.size)}</b></td><td>${esc(fmtTime(f.modified_unix))}</td><td>${esc(f.name)}</td><td class="mono">${esc(f.path)}</td><td><div class="row-actions"><button class="tiny explain-file" data-path="${esc(encodeURIComponent(f.path))}">Explain</button><button class="tiny action-file" data-path="${esc(encodeURIComponent(f.path))}">Actions</button></div></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No matching files.</div>'; $$('.explain-file').forEach(b=>b.addEventListener('click',()=>openFileStory(decodeURIComponent(b.dataset.path)))); $$('.action-file').forEach(b=>b.addEventListener('click',()=>openActionsForPath(decodeURIComponent(b.dataset.path)))); }

  async function runAudit(){
    const btn=$('#runAudit'); setBusy(btn,true,'Auditing…');showNotice('');
    try{
      const d=await api('/api/security/audit');
      $('#riskScore').textContent=d.score+'/100'; $('#riskLevel').textContent=d.level; $('#riskDisclaimer').textContent=d.disclaimer;
      $('#securityLevel').textContent=d.level; $('#securityHint').textContent=d.findings.length?`${d.findings.length} item(s) deserve review.`:'No heuristic anomalies were found in this scan.';
      $('#findings').innerHTML=d.findings.length?d.findings.map(f=>`<article class="finding ${f.risk>=70?'high':''}"><div class="finding-head"><div><div class="eyebrow">${esc(f.kind)}${f.trust_reference?` · ${esc(f.trust_reference.replaceAll('_',' '))}`:''}</div><h3>${esc(f.name||f.kind)}</h3><div class="mono muted">${esc(f.detail)}</div></div><span class="badge ${f.risk>=70?'bad':'warn'}">Risk ${f.risk}</span></div><div class="finding-grid"><div><b>Why flagged</b><ul>${(f.signals||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>${f.evidence?.length?`<div><b>Evidence</b><ul>${f.evidence.map(s=>`<li class="mono">${esc(s)}</li>`).join('')}</ul></div>`:''}</div></article>`).join(''):'<article class="card"><div class="empty">No heuristic anomalies found. This is not a guarantee that the system is malware-free.</div></article>';
    }catch(e){showNotice(e.message)} finally{setBusy(btn,false)}
  }

  async function loadEvidence(record=false){
    const btn=record?$('#captureEvidence'):$('#loadEvidence'); setBusy(btn,true,record?'Capturing…':'Refreshing…'); showNotice('');
    try{
      const d=await api('/api/intelligence/graph',{method:record?'POST':'GET'}); evidenceGraph=d; renderEvidence(d); await loadTimeline();
    }catch(e){showNotice(e.message)} finally{setBusy(btn,false)}
  }
  function renderEvidence(d){
    const s=d.summary||{}; const vals=[s.startup||0,s.files||0,s.processes||0,s.network||0,s.edges||0]; $$('#evidenceSummary b').forEach((b,i)=>b.textContent=vals[i]); $('#evidenceNote').textContent=d.note||'';
    const types=['startup','file','process','network']; const labels={startup:'STARTUP',file:'FILE / SCRIPT',process:'PROCESS',network:'NETWORK'}; const selected={};
    types.forEach(t=>{selected[t]=(d.nodes||[]).filter(n=>n.type===t).sort((a,b)=>(b.risk||0)-(a.risk||0)).slice(0,9)});
    const nodeById=new Map(); const pos=new Map(); const x={startup:35,file:275,process:515,network:755}; const width=195, rowH=66;
    types.forEach(t=>selected[t].forEach((n,i)=>{nodeById.set(n.id,n);pos.set(n.id,{x:x[t],y:54+i*rowH});}));
    const maxRows=Math.max(1,...types.map(t=>selected[t].length)); const height=Math.max(210,88+maxRows*rowH);
    let svg=`<svg class="evidence-svg" viewBox="0 0 990 ${height}" role="img" aria-label="Evidence relationship graph">`;
    types.forEach(t=>{svg+=`<text x="${x[t]}" y="24" class="graph-col-title">${labels[t]}</text>`});
    for(const e of d.edges||[]){const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)continue;svg+=`<line x1="${a.x+width}" y1="${a.y+22}" x2="${b.x}" y2="${b.y+22}" class="graph-edge"/>`;}
    types.forEach(t=>selected[t].forEach(n=>{const p=pos.get(n.id);const cls=(n.risk||0)>=70?'high':(n.risk||0)>=35?'review':'';svg+=`<g class="graph-node ${cls}" data-node="${esc(n.id)}"><rect x="${p.x}" y="${p.y}" width="${width}" height="46" rx="9"></rect><text x="${p.x+10}" y="${p.y+18}" class="graph-label">${esc((n.label||n.type).slice(0,26))}</text><text x="${p.x+10}" y="${p.y+35}" class="graph-detail">${esc((n.detail||'').slice(0,31))}</text>${n.risk?`<text x="${p.x+width-10}" y="${p.y+18}" text-anchor="end" class="graph-risk">${n.risk}</text>`:''}</g>`;}));
    svg+='</svg>'; $('#graphWrap').innerHTML=svg;
    const explainable=(d.nodes||[]).filter(n=>n.type==='process'||n.type==='file').sort((a,b)=>(b.risk||0)-(a.risk||0)).slice(0,16);
    $('#graphObjects').innerHTML=explainable.length?explainable.map(n=>`<button class="object-chip" data-type="${esc(n.type)}" data-ref="${esc(encodeURIComponent(n.ref||''))}"><span>${esc(n.type)}</span><b>${esc(n.label)}</b>${n.risk?`<em>${n.risk}</em>`:''}</button>`).join(''):'';
    $$('.object-chip').forEach(b=>b.addEventListener('click',()=>{const ref=decodeURIComponent(b.dataset.ref||''); if(b.dataset.type==='process')openProcessStory(Number(ref)); else openFileStory(ref);}));
  }
  async function loadTimeline(){
    try{const d=await api('/api/intelligence/timeline?limit=80'); const ev=d.events||[]; $('#timelineList').innerHTML=ev.length?ev.map(e=>`<div class="timeline-event ${esc(e.severity)}"><time>${esc(fmtTime(e.at))}</time><div><b>${esc(e.title)}</b><p>${esc(e.detail)}</p></div></div>`).join(''):'<div class="empty">No session observations yet.</div>'; }catch(e){showNotice(e.message)}
  }
  async function openProcessStory(pid){ if(!pid)return; switchView('intelligence'); $('#storyBody').innerHTML='<div class="empty">Correlating process evidence…</div>'; try{const d=await api('/api/object/story?pid='+encodeURIComponent(pid));renderStory(d)}catch(e){$('#storyBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`} }
  async function openFileStory(path){ if(!path)return; switchView('intelligence'); $('#storyBody').innerHTML='<div class="empty">Correlating file evidence…</div>'; try{const d=await api('/api/object/story?path='+encodeURIComponent(path));renderStory(d)}catch(e){$('#storyBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`} }
  function renderStory(d){
    const facts=(d.facts||[]).map(f=>`<div class="story-fact"><span>${esc(f.label)}</span><b class="${f.label==='Path'||f.label==='Audit target'?'mono':''}">${esc(f.value)}</b><small>Source: ${esc(f.source)}${f.weight?` · +${f.weight}`:''}</small></div>`).join('');
    const rel=(d.relations||[]).map(r=>`<div class="story-rel"><span>${esc(r.kind.replaceAll('_',' '))}</span><b>${esc(r.target)}</b><small class="mono">${esc(r.detail)}</small></div>`).join('');
    const tl=(d.timeline||[]).map(e=>`<li>${esc(fmtTime(e.at))} · ${esc(e.title)}</li>`).join('');
    const bh=(d.behavior_history||[]).slice().reverse().map(h=>{const changes=h.changes||[];const sev=changes.some(c=>c.severity==='high')?'high':changes.some(c=>c.severity==='review')?'review':'info';return `<div class="story-history-entry ${sev}"><b>${esc(fmtISO(h.captured_at))} · index ${h.risk_index} (${esc(h.risk_band)})</b><small>${changes.map(c=>esc(c.title)).join(' · ')||'Object present in behavior history'}</small></div>`}).join('');
    const tc=d.trust_context||{}; const trustBlock=tc.profiled?`<div class="story-section"><h4>Trusted Profile context</h4><div class="trust-context ${tc.match==='fingerprint_changed'?'changed':'matched'}"><div><span>Profile state</span><b>${esc(tc.match||'profiled')}</b></div><div><span>Profile time</span><b>${esc(fmtISO(tc.profile_at))}</b></div>${tc.profile_sha256?`<div><span>Profile SHA-256</span><code>${esc(tc.profile_sha256)}</code></div>`:''}${tc.current_sha256?`<div><span>Current SHA-256</span><code>${esc(tc.current_sha256)}</code></div>`:''}${tc.signals?.length?`<ul>${tc.signals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<small>${esc(tc.note||'')}</small></div></div>`:`<div class="story-section"><h4>Trusted Profile context</h4><div class="muted">This object is not in the current user-approved Trusted Profile. That is a novelty signal, not a malware verdict.</div></div>`;
    const actionable=(d.facts||[]).find(f=>f.label==='Path'||f.label==='Audit target')?.value || (String(d.subtitle||'').startsWith('/')?d.subtitle:'');
    $('#storyBody').innerHTML=`<div class="story-head"><div><span class="eyebrow">${esc(d.object_type)}</span><h3>${esc(d.title||'Object')}</h3><p class="mono muted">${esc(d.subtitle||'')}</p></div>${riskBadge(d.risk||0)}</div><div class="story-summary">${esc(d.summary)}</div><div class="story-grid">${facts||'<div class="empty">No facts.</div>'}</div>${trustBlock}${rel?`<div class="story-section"><h4>Relationships</h4>${rel}</div>`:''}${tl?`<div class="story-section"><h4>Observed in this session</h4><ul>${tl}</ul></div>`:''}${bh?`<div class="story-section"><h4>Cross-session behavior history</h4>${bh}</div>`:''}${actionable?`<div class="detail-actions"><button id="storyActions" class="primary">Open Safe Actions</button><button id="storyReveal" class="secondary">Reveal in Finder</button></div>`:''}<p class="muted">${esc(d.disclaimer||'')}</p>`;
    if(actionable){$('#storyActions').addEventListener('click',()=>openActionsForPath(actionable));$('#storyReveal').addEventListener('click',()=>revealPath(actionable));}
  }

  function renderBehaviorDiff(d){
    const sum=d.summary||{}; const delta=Number(d.risk_delta||0);
    const vals=[d.risk_index??0,`${delta>0?'+':''}${delta}`,sum.high||0,sum.review||0,sum.info||0,sum.identity_changes||0,sum.persistence_changes||0,sum.network_changes||0];
    $$('#behaviorSummary b').forEach((b,i)=>b.textContent=vals[i]??'—');
    const changes=d.changes||[];
    $('#behaviorChanges').innerHTML=changes.length?changes.map(c=>`<div class="behavior-change ${esc(c.severity)}"><div class="behavior-change-head"><div><span class="eyebrow">${esc((c.kind||'change').replaceAll('_',' '))}</span><h3>${esc(c.title)}</h3></div><span class="badge ${c.severity==='high'?'bad':c.severity==='review'?'warn':'good'}">${esc(c.severity)}</span></div>${c.before?`<div class="change-pair"><span>Before</span><code>${esc(c.before)}</code></div>`:''}${c.after?`<div class="change-pair"><span>After</span><code>${esc(c.after)}</code></div>`:''}${c.evidence?.length?`<ul>${c.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${c.object_key?`<button class="tiny behavior-explain" data-path="${esc(encodeURIComponent(c.object_key))}">Open Object Story</button>`:''}</div>`).join(''):'<div class="good-note">No behavior differences were detected against the previous baseline.</div>';
    $$('.behavior-explain').forEach(b=>b.addEventListener('click',()=>openFileStory(decodeURIComponent(b.dataset.path||''))));
    $('#behaviorLevel').textContent=d.first_baseline?'Baseline saved':`Index ${d.risk_index??0} · ${d.risk_band||'quiet'}`;
    $('#behaviorHint').textContent=d.first_baseline?'Future captures can compare against this local baseline.':`${sum.high||0} high · ${sum.review||0} review · evidence index ${d.risk_index??0}/100`;
  }
  function renderBehaviorTrend(d){
    const entries=d.entries||[];
    if(!entries.length){$('#behaviorTrend').innerHTML='<div class="empty">Capture Behavior Diff to build a bounded local trend.</div>';$('#behaviorHistoryList').innerHTML='';return}
    const w=720,h=185,padX=34,padY=20,usableW=w-padX*2,usableH=h-padY*2;
    const x=i=>entries.length===1?w/2:padX+(i/(entries.length-1))*usableW; const y=v=>padY+((100-Math.max(0,Math.min(100,v)))/100)*usableH;
    const pts=entries.map((e,i)=>`${x(i).toFixed(1)},${y(e.risk_index||0).toFixed(1)}`).join(' ');
    let svg=`<div class="trend-wrap"><svg class="trend-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Behavior evidence pressure trend">`;
    [0,25,50,75,100].forEach(v=>{svg+=`<line class="trend-grid" x1="${padX}" x2="${w-padX}" y1="${y(v)}" y2="${y(v)}"></line><text class="trend-label" x="4" y="${y(v)+3}">${v}</text>`});
    if(entries.length>1)svg+=`<polyline class="trend-line" points="${pts}"></polyline>`;
    entries.forEach((e,i)=>{svg+=`<circle class="trend-dot" cx="${x(i)}" cy="${y(e.risk_index||0)}" r="4"></circle><text class="trend-value" text-anchor="middle" x="${x(i)}" y="${Math.max(12,y(e.risk_index||0)-8)}">${e.risk_index||0}</text>`});
    svg+='</svg></div>'; $('#behaviorTrend').innerHTML=svg;
    $('#behaviorHistoryList').innerHTML=entries.slice().reverse().slice(0,10).map(e=>`<div class="history-row"><time>${esc(fmtISO(e.captured_at))}</time><span class="badge ${e.risk_index>=60?'bad':e.risk_index>=30?'warn':'good'}">${esc(e.risk_band)} ${e.risk_index}</span><b>${e.risk_delta>0?'+':''}${e.risk_delta}</b><small>${e.summary?.total||0} changes · ${e.summary?.high||0} high · ${e.summary?.review||0} review</small></div>`).join('');
  }
  function renderBehaviorHealth(h){
    const issues=h.issues||[]; const status=h.healthy?'Healthy':'Needs review';
    $('#baselineHealth').innerHTML=`<div class="health-status ${h.healthy?'good':'warn'}"><b>${esc(status)}</b>${issues.length?`<ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:' · local metadata storage passed the available checks.'}</div><div class="health-grid"><div class="health-item"><span>Mode</span><b>${esc(h.mode)}</b><small>${h.history_entries||0} history entries</small></div><div class="health-item"><span>Baseline</span><b>${h.baseline_exists?esc(h.baseline_mode||'present'):'Not written yet'}</b><small class="mono">${esc(h.baseline_path||'memory only')}</small></div><div class="health-item"><span>History</span><b>${h.history_exists?esc(h.history_mode||'present'):(h.mode==='ephemeral'?'Memory only':'Not written yet')}</b><small class="mono">${esc(h.history_path||'')}</small></div><div class="health-item"><span>Integrity</span><b>${h.mode==='ephemeral'?'Not persisted':(h.baseline_exists?(h.baseline_valid?'Baseline valid':'Baseline invalid'):'Awaiting baseline')}</b><small>${esc(h.privacy||'')}</small></div></div>`;
  }
  async function loadBehaviorHistory(){const btn=$('#loadBehaviorHistory');setBusy(btn,true,'Loading…');try{renderBehaviorTrend(await api('/api/behavior/history?limit=40'))}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function loadBehaviorHealth(){const btn=$('#loadBehaviorHealth');setBusy(btn,true,'Checking…');try{renderBehaviorHealth(await api('/api/behavior/health'))}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function loadBehavior(){
    const btn=$('#loadBehavior');setBusy(btn,true,'Loading…');
    try{
      const d=await api('/api/behavior'); const last=d.last_diff||{};
      $('#behaviorBaseline').innerHTML=`<div class="baseline-grid"><div><span>Baseline</span><b>${esc(d.has_baseline?'Available':'Not captured')}</b></div><div><span>Captured</span><b>${esc(d.baseline_at||'—')}</b></div><div><span>History</span><b>${Number(d.history_entries||0).toLocaleString()} / 40</b></div><div><span>Mode</span><b>${esc(d.persistence_mode||'persistent-local')}</b></div></div><p class="mono muted">${esc(d.baseline_path||'')}</p><p class="muted">${esc(d.privacy||'')}</p>`;
      if(last.current_at) renderBehaviorDiff(last);
      await Promise.all([loadBehaviorHistory(),loadBehaviorHealth()]);
    }catch(e){showNotice(e.message)} finally{setBusy(btn,false)}
  }
  async function captureBehavior(){
    const btn=$('#captureBehavior');setBusy(btn,true,'Comparing…');showNotice('');
    try{
      const d=await api('/api/behavior',{method:'POST'}); renderBehaviorDiff(d);
      $('#behaviorBaseline').innerHTML=`<div class="baseline-grid"><div><span>Compared against</span><b>${esc(d.first_baseline?'No prior baseline':d.baseline_source||'previous baseline')}</b></div><div><span>Baseline time</span><b>${esc(d.baseline_at||'—')}</b></div><div><span>Evidence index</span><b>${d.risk_index??0} / 100</b></div><div><span>History depth</span><b>${d.history_depth||0} / 40</b></div></div><p class="muted">${esc(d.note||'')}</p>`;
      await Promise.all([loadTimeline(),loadBehaviorHistory(),loadBehaviorHealth()]);
    }catch(e){showNotice(e.message)} finally{setBusy(btn,false)}
  }


  function renderTrustStatus(d){
    const has=!!d.has_profile;
    $('#trustLevel').textContent=has?`${Number(d.objects||0).toLocaleString()} objects`:'Not established';
    $('#trustHint').textContent=has?`User-approved profile updated ${fmtISO(d.updated_at)}.`:'No object is automatically trusted. Establish a profile only after reviewing the Mac.';
    $('#trustStatus').innerHTML=`<div class="baseline-grid"><div><span>Profile</span><b>${has?'Available':'Not established'}</b></div><div><span>Updated</span><b>${esc(fmtISO(d.updated_at))}</b></div><div><span>Objects</span><b>${Number(d.objects||0).toLocaleString()}</b></div><div><span>Mode</span><b>${esc(d.persistence_mode||'persistent-local')}</b></div></div><p class="mono muted">${esc(d.profile_path||'memory only')}</p><p class="muted">${esc(d.meaning||'')}</p>`;
    $('#exportTrust').disabled=!has;if(d.last_drift?.compared_at) renderTrustDrift(d.last_drift);else $$('#trustSummary b').forEach(b=>b.textContent='—');
  }
  function renderTrustDrift(d){
    const sum=d.summary||{}; const vals=[d.drift_index??0,`${d.profile_coverage??0}%`,sum.high||0,sum.review||0,sum.novel_objects||0,sum.fingerprint_changes||0];
    $$('#trustSummary b').forEach((b,i)=>b.textContent=vals[i]??'—');
    const changes=d.changes||[];
    $('#trustChanges').innerHTML=changes.length?changes.map(c=>`<div class="behavior-change ${esc(c.severity)}"><div class="behavior-change-head"><div><span class="eyebrow">${esc((c.kind||'change').replaceAll('_',' '))}</span><h3>${esc(c.title)}</h3></div><span class="badge ${c.severity==='high'?'bad':c.severity==='review'?'warn':'good'}">${esc(c.severity)}</span></div>${c.before?`<div class="change-pair"><span>Profile</span><code>${esc(c.before)}</code></div>`:''}${c.after?`<div class="change-pair"><span>Current</span><code>${esc(c.after)}</code></div>`:''}${c.evidence?.length?`<ul>${c.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${c.object_key?`<button class="tiny trust-explain" data-path="${esc(encodeURIComponent(c.object_key))}">Open Object Story</button>`:''}</div>`).join(''):'<div class="good-note">No drift evidence was detected against the user-approved profile.</div>';
    $$('.trust-explain').forEach(b=>b.addEventListener('click',()=>openFileStory(decodeURIComponent(b.dataset.path||''))));
    $('#trustLevel').textContent=d.profile_at?`Drift ${d.drift_index??0}`:'Not established';
    $('#trustHint').textContent=d.profile_at?`${sum.high||0} high · ${sum.review||0} review · ${d.profile_coverage??0}% current-profile coverage.`:'Establish a Trusted Profile before comparing.';
  }
  function renderTrustHealth(h){
    const issues=h.issues||[];$('#restoreTrust').disabled=!h.backup_exists||h.mode==='ephemeral';
    $('#trustHealth').innerHTML=`<div class="health-status ${h.healthy?'good':'warn'}"><b>${h.healthy?'Healthy':'Needs review'}</b>${issues.length?`<ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:' · profile storage passed available checks.'}</div><div class="health-grid"><div class="health-item"><span>Mode</span><b>${esc(h.mode||'')}</b><small>${Number(h.objects||0)} objects</small></div><div class="health-item"><span>Profile</span><b>${h.profile_exists?esc(h.profile_mode||'present'):(h.mode==='ephemeral'?'Memory only':'Not written')}</b><small class="mono">${esc(h.profile_path||'')}</small></div><div class="health-item"><span>Previous backup</span><b>${h.backup_exists?esc(h.backup_mode||'present'):'None yet'}</b><small class="mono">${esc(h.backup_path||'')}</small></div><div class="health-item"><span>Drift history</span><b>${h.mode==='ephemeral'?'Memory only':(h.history_exists?esc(h.history_mode||'present'):'Not written yet')}</b><small>${Number(h.history_entries||0)} / 20 comparisons</small></div><div class="health-item"><span>Integrity</span><b>${h.mode==='ephemeral'?'Memory only':(h.profile_exists?(h.profile_valid?'Profile valid':'Profile invalid'):'Awaiting profile')}</b><small>${esc(h.privacy||'')}</small></div></div>`;
  }
  async function loadTrust(){
    try{const d=await api('/api/trust/status');renderTrustStatus(d);await Promise.all([loadTrustHealth(),loadTrustHistory()]);}catch(e){if(current==='trust')showNotice(e.message)}
  }
  async function loadTrustHealth(){const btn=$('#loadTrustHealth');setBusy(btn,true,'Checking…');try{renderTrustHealth(await api('/api/trust/health'))}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function loadTrustHistory(){const btn=$('#loadTrustHistory');setBusy(btn,true,'Loading…');try{const d=await api('/api/trust/history?limit=20');const rows=d.entries||[];$('#trustHistoryList').innerHTML=rows.length?rows.slice().reverse().map(e=>`<div class="history-row trust-history-row"><time>${esc(fmtISO(e.compared_at))}</time><span class="badge ${e.drift_index>=70?'bad':e.drift_index>=15?'warn':'good'}">${esc(e.drift_band)} ${e.drift_index}</span><b>${e.profile_coverage}%</b><small>${e.summary?.total||0} drift items · ${e.summary?.high||0} high · ${e.summary?.review||0} review · profile ${esc(fmtISO(e.profile_at))}</small></div>`).join(''):'<div class="empty">No Trust Drift comparisons recorded yet.</div>';}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function captureTrust(){
    if(!confirm('Establish or refresh the Trusted Profile from the current Mac? Do this only after you have reviewed the current state. The profile is a reference, not a safety certificate.'))return;
    const btn=$('#captureTrust');setBusy(btn,true,'Fingerprinting…');showNotice('');
    try{const p=await api('/api/trust/capture',{method:'POST'});showNotice(`Trusted Profile saved in this ${p.objects?.length||0}-object bounded snapshot. Profile membership is not proof of safety.`);await loadTrust();$('#trustChanges').innerHTML='<div class="empty">Profile refreshed. Run Compare to profile when you want to measure drift.</div>';}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  async function compareTrust(){const btn=$('#compareTrust');setBusy(btn,true,'Comparing…');showNotice('');try{const d=await api('/api/trust/compare',{method:'POST'});renderTrustDrift(d);if(!d.profile_at)showNotice(d.note||'No Trusted Profile exists yet.');else await loadTrustHistory();}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function exportTrust(){const btn=$('#exportTrust');setBusy(btn,true,'Exporting…');try{const res=await fetch('/api/trust/export',{headers:{'X-Sentinel-Token':token}});if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||`HTTP ${res.status}`)}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='sentinel-trust-profile.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function restoreTrust(){const btn=$('#restoreTrust');if(!confirm('Restore the previous Trusted Profile? The current profile will become the one-step backup so this can be reversed once.'))return;setBusy(btn,true,'Restoring…');try{await api('/api/trust/restore',{method:'POST'});showNotice('Previous Trusted Profile restored. Run Compare to profile to measure current drift.');await loadTrust();}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}

  async function loadProcesses(){ const btn=$('#loadProcesses');setBusy(btn,true);try{const d=await api('/api/processes');processRows=d.processes||[];renderProcesses();}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  function renderProcesses(){ const q=($('#processFilter').value||'').toLowerCase(); const rows=processRows.filter(p=>!q||(p.user+' '+p.command+' '+p.pid).toLowerCase().includes(q)); $('#processTable').innerHTML=table(['PID','CPU','Memory','User','Command',''],rows.map(p=>[p.pid,p.cpu.toFixed(1)+'%',p.memory.toFixed(1)+'%',esc(p.user),`<span class="mono">${esc(p.command)}</span>`,`<button class="tiny inspect-process" data-pid="${p.pid}">Inspect</button>`])); $$('.inspect-process').forEach(b=>b.addEventListener('click',()=>inspectProcess(Number(b.dataset.pid)))); }
  async function inspectProcess(pid){ const panel=$('#processDetail'); panel.classList.remove('hidden'); $('#processDetailTitle').textContent=`PID ${pid}`; $('#processDetailBody').innerHTML='<div class="empty">Inspecting local evidence…</div>'; panel.scrollIntoView({behavior:'smooth',block:'nearest'}); try{const d=await api('/api/process/detail?pid='+encodeURIComponent(pid)); $('#processDetailTitle').textContent=`PID ${d.process.pid} · ${d.process.user}`; const id=d.identity||{};const identityFacts=[['Identifier',id.identifier],['Team ID',id.team_id],['Gatekeeper',id.gatekeeper],['App bundle',id.bundle_path]].filter(x=>x[1]);const parents=d.parent_chain||[];$('#processDetailBody').innerHTML=`<div class="detail-grid"><div><span>Executable</span><b class="mono">${esc(d.executable||'Unknown')}</b></div><div><span>Code signature</span><b>${esc(d.signature)}</b></div><div><span>Path risk</span><b>${riskBadge(d.path_risk)}</b></div><div><span>TCP sockets</span><b>${d.network?.length||0}</b></div></div>${identityFacts.length?`<div class="identity-strip">${identityFacts.map(([k,v])=>`<div><span>${esc(k)}</span><b class="${k==='App bundle'?'mono':''}">${esc(v)}</b></div>`).join('')}</div>`:''}${id.authorities?.length?`<div class="evidence-block"><b>Signing chain</b><ul>${id.authorities.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${d.signals?.length?`<div class="evidence-block"><b>Review signals</b><ul>${d.signals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'<div class="good-note">No path-based review signals were produced for this process.</div>'}${d.trust_signals?.length?`<div class="good-note"><b>Trust context</b><ul>${d.trust_signals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${parents.length?`<div class="evidence-block"><b>Parent process chain</b><div class="chain-list">${parents.map((x,i)=>`<div><span>${i?'↑':'parent'}</span><b>PID ${x.pid}</b><code>${esc(x.command)}</code></div>`).join('')}</div></div>`:''}${d.network?.length?`<div class="table-wrap">${table(['State','Class','Local','Remote'],d.network.map(n=>[esc(n.state),esc(n.endpoint_class||'unknown'),`<span class="mono">${esc(n.local||n.address)}</span>`,`<span class="mono">${esc(n.remote||'—')}</span>`]))}</div>`:''}<div class="detail-actions"><button class="primary" id="storyFromProcess">Open Object Story</button></div>`; $('#storyFromProcess').addEventListener('click',()=>openProcessStory(pid));}catch(e){$('#processDetailBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`} }
  async function loadStartup(){ const btn=$('#loadStartup');setBusy(btn,true);try{const d=await api('/api/startup');$('#startupTable').innerHTML=table(['Risk','Scope','Item','Executable','Manifest','Signals'],d.items.map(x=>{const m=x.manifest||{};const bits=[];if(m.run_at_load)bits.push('RunAtLoad');if(m.keep_alive)bits.push('KeepAlive '+m.keep_alive);if(m.argument_count)bits.push(m.argument_count+' args');if(m.mach_services_count)bits.push(m.mach_services_count+' Mach service(s)');if(m.process_type)bits.push('ProcessType '+m.process_type);return [riskBadge(x.risk),esc(x.scope),esc(m.label||x.name),`<span class="mono">${esc(x.executable||'Unknown')}</span>`,esc(bits.join(' · ')||'No highlighted keys'),esc((x.signals||[]).join(' · '))]}));}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  async function loadNetwork(){ const btn=$('#loadNetwork');setBusy(btn,true);try{const d=await api('/api/network');if(d.warning)showNotice(d.warning);$('#networkTable').innerHTML=table(['Process','PID','State','Class','Local','Remote'],(d.items||[]).map(x=>[esc(x.command),x.pid,`<span class="badge">${esc(x.state)}</span>`,`<span class="badge ${x.endpoint_class==='public'?'warn':x.endpoint_class==='loopback'?'good':''}">${esc(x.endpoint_class||'unknown')}</span>`,`<span class="mono">${esc(x.local||x.address)}</span>`,`<span class="mono">${esc(x.remote||'—')}</span>`]));}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  async function loadBackground(){ const btn=$('#loadBackground');setBusy(btn,true);try{const d=await api('/api/background');$('#backgroundNote').textContent=d.note||'';const rows=d.items||[];$('#backgroundTable').innerHTML=d.available?table(['Name','Identifier','Executable','Disposition'],rows.map(x=>[esc(x.name||'—'),`<span class="mono">${esc(x.identifier||'—')}</span>`,`<span class="mono">${esc(x.executable||x.url||'—')}</span>`,esc(x.disposition||'—')])):'<div class="empty">Background Task Management inspection is unavailable on this host.</div>';}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  function renderIntegrity(d,target='#integrityBody'){
    const id=d.identity||{},nv=d.native_validation||{};const facts=[['Path',d.path],['Exists',d.exists?'Yes':'No'],['Type',d.file_type|| (d.is_directory?'Directory':'Unknown')],['Size',d.is_directory?'—':bytes(d.size||0)],['Modified',d.modified_at?fmtISO(d.modified_at):'—'],['Permissions',d.mode||'—'],['SHA-256',d.sha256||d.hash_status||'—'],['Signature',id.verification||'—'],['Native static validation',nv.available?(nv.valid?'VALID':'INVALID'):(nv.status||'Not compiled')],['All architectures',nv.available?(nv.all_architectures?'Requested':'No'):'—'],['Identifier',id.identifier||'—'],['Team ID',id.team_id||'—'],['Gatekeeper',id.gatekeeper||'—'],['Gatekeeper source',id.gatekeeper_source||'—'],['Gatekeeper origin',id.gatekeeper_origin||'—'],['Architectures',(d.architectures||[]).join(', ')||'—'],['Quarantine',d.quarantine?'Recorded':'Not observed']];
    const origins=(d.where_from||[]).length?`<div class="evidence-block"><b>Recorded origin metadata</b><ul>${d.where_from.map(x=>`<li class="mono">${esc(x)}</li>`).join('')}</ul></div>`:'';
    const auth=id.authorities?.length?`<div class="evidence-block"><b>Signing authorities</b><ul>${id.authorities.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
    const notes=d.notes?.length?`<div class="good-note"><b>Interpretation notes</b><ul>${d.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
    const sources=d.sources?.length?`<div class="source-list"><b>Evidence sources:</b> ${d.sources.map(esc).join(' · ')}</div>`:'';
    $(target).innerHTML=`<div class="integrity-grid">${facts.map(([k,v])=>`<div><span>${esc(k)}</span><${k==='Path'||k==='SHA-256'?'code':'b'}>${esc(v)}</${k==='Path'||k==='SHA-256'?'code':'b'}></div>`).join('')}</div>${origins}${auth}${notes}${sources}`;
  }
  async function inspectIntegrity(ev){ev?.preventDefault();const btn=$('#inspectIntegrity');setBusy(btn,true,'Inspecting…');showNotice('');try{const path=$('#integrityPath').value.trim();if(!path)throw new Error('Enter a local path first.');const d=await api('/api/integrity/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});renderIntegrity(d);}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}
  async function loadSelfIntegrity(){const btn=$('#loadSelfIntegrity');setBusy(btn,true,'Inspecting…');try{const d=await api('/api/self/integrity');renderIntegrity(d,'#selfIntegrityBody')}catch(e){$('#selfIntegrityBody').innerHTML=`<div class="empty">${esc(e.message)}</div>`}finally{setBusy(btn,false)}}
  function renderPersistence(d){$('#persistenceSummary').textContent=d.initialized?`${d.files||0} visible plist file(s) · baseline ${fmtISO(d.baseline_at)} · current ${fmtISO(d.current_at)}`:'No session baseline yet.';const rows=d.changes||[];$('#persistenceChanges').innerHTML=rows.length?rows.map(x=>`<div class="persistence-change ${esc(x.severity)}"><b>${esc(x.title)}</b><code>${esc(x.path)}</code>${x.before?`<small>Before: ${esc(x.before)}</small>`:''}${x.after?`<small>After: ${esc(x.after)}</small>`:''}<small>${esc(x.detail)}</small></div>`).join(''):`<div class="empty">${esc(d.note||'No persistence changes observed.')}</div>`}
  async function loadPersistence(){try{renderPersistence(await api('/api/persistence'))}catch(e){showNotice(e.message)}}
  async function capturePersistence(){const btn=$('#capturePersistence');setBusy(btn,true,'Capturing…');try{renderPersistence(await api('/api/persistence',{method:'POST'}))}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}}


  let currentActionPreview = null;

  function actionSeverityBadge(v){ return `<span class="badge ${v==='high'?'bad':v==='review'?'warn':'good'}">${esc(v||'info')}</span>`; }
  function setActionFormEnabled(enabled){ ['#actionPath','#actionType','#actionNewName','#previewAction','#revealActionPath'].forEach(sel=>{const el=$(sel);if(el)el.disabled=!enabled;}); }
  function updateActionTypeUI(){ const rename=$('#actionType').value==='rename'; $('#renameLabel').classList.toggle('hidden',!rename); }
  async function loadActionCenter(){
    try{
      const [status,health,vault,journal]=await Promise.all([api('/api/actions/status'),api('/api/actions/health'),api('/api/actions/vault'),api('/api/actions/journal')]);
      renderActionStatus(status,health); renderVault(vault); renderActionJournal(journal); setActionFormEnabled(!!status.enabled); updateActionTypeUI();
    }catch(e){showNotice(e.message)}
  }
  function renderActionStatus(status,health){
    const enabled=!!status.enabled; const healthy=health?.healthy!==false;
    $('#actionStatus').innerHTML=`<div class="action-health ${enabled&&healthy?'healthy':'review'}"><div><span>Mode</span><b>${esc(status.mode||health?.mode||'unknown')}</b></div><div><span>Mutations</span><b>${enabled?'Enabled with recovery guards':'Disabled'}</b></div><div><span>Permanent delete</span><b>${status.permanent_delete?'Unexpectedly enabled':'Not implemented'}</b></div><div><span>Vault items</span><b>${health?.active_vault_items??0}</b><small>${bytes(Number(health?.vault_bytes||0))}</small></div><div><span>Journal entries</span><b>${health?.journal_entries??0}</b></div><div><span>Recovery health</span><b>${healthy?'Healthy':'Review'}</b></div></div>${(health?.issues||[]).length?`<div class="evidence-block"><b>Health issues</b><ul>${health.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${(health?.advisories||[]).length?`<div class="guidance-note"><b>Vault advisory</b><span>${health.advisories.map(esc).join(' · ')}</span></div>`:''}<p class="muted">${esc(status.scope||health?.privacy||'')}</p>`;
  }
  async function loadActionHealth(){try{const [s,h]=await Promise.all([api('/api/actions/status'),api('/api/actions/health')]);renderActionStatus(s,h);setActionFormEnabled(!!s.enabled);}catch(e){showNotice(e.message)}}
  function openActionsForPath(path,action='vault'){
    switchView('actions'); $('#actionPath').value=path||''; $('#actionType').value=action; updateActionTypeUI(); $('#actionNewName').value=''; $('#actionPreviewCard').classList.add('hidden'); currentActionPreview=null; setTimeout(()=>$('#actionPath').focus(),0);
  }
  async function revealPath(path,vaultID=''){
    try{await api('/api/actions/reveal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,vault_id:vaultID})});showNotice('Requested Finder reveal on this Mac.');}catch(e){showNotice(e.message)}
  }
  async function previewActionRequest(req){
    showNotice(''); const btn=$('#previewAction'); setBusy(btn,true,'Building preview…');
    try{const p=await api('/api/actions/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});renderActionPreview(p);return p;}catch(e){showNotice(e.message);throw e}finally{setBusy(btn,false)}
  }
  async function previewAction(ev){
    ev?.preventDefault(); const path=$('#actionPath').value.trim(); const action=$('#actionType').value; if(!path){showNotice('Enter an eligible file path first.');return;} const req={action,path}; if(action==='rename')req.new_name=$('#actionNewName').value.trim(); try{await previewActionRequest(req)}catch{}
  }
  function renderActionPreview(p){
    currentActionPreview=p; $('#actionPreviewCard').classList.remove('hidden'); $('#actionExpiry').textContent=`Expires ${fmtISO(p.expires_at)}`; $('#actionAcknowledge').checked=false; $('#actionPhrase').value=''; $('#actionCode').value=''; $('#actionResult').innerHTML='';
    const deps=p.dependencies||[]; const cons=p.consequences||[]; const sig=p.signals||[];
    $('#actionPreviewBody').innerHTML=`<div class="action-preview-head"><div><span>${esc(p.display_action||p.action)}</span><strong>${esc(p.object_name)}</strong></div>${riskBadge(p.risk||0)}</div><div class="integrity-grid"><div><span>Source</span><code>${esc(p.source)}</code></div>${p.destination?`<div><span>Destination</span><code>${esc(p.destination)}</code></div>`:''}<div><span>Size</span><b>${bytes(p.size||0)}</b></div><div><span>Fingerprint guard</span><code>${esc(p.sha256||p.hash_status||'metadata only')}</code></div><div><span>Trust context</span><b>${esc(p.trust?.match||'unprofiled')}</b></div><div><span>Reversible</span><b>${p.reversible?'Yes':'No'}</b></div></div>${deps.length?`<div class="story-section"><h4>Dependency Guard</h4>${deps.map(d=>`<div class="dependency-row">${actionSeverityBadge(d.severity)}<div><b>${esc(d.title)}</b><small>${esc(d.detail)}</small></div></div>`).join('')}</div>`:'<div class="good-note">No startup/running-process/Trusted-Profile dependency was correlated for this target in the current snapshot.</div>'}${sig.length?`<div class="evidence-block"><b>Review signals</b><ul>${sig.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}<div class="consequence-box"><b>Consequences to review</b><ul>${cons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${esc(p.disclaimer)}</p></div><div class="confirm-values"><div><span>Exact phrase</span><code>${esc(p.confirm_phrase)}</code></div><div><span>One-time code</span><code>${esc(p.confirm_code)}</code></div></div>`;
    $('#actionPhrase').placeholder=p.confirm_phrase; $('#actionCode').placeholder=p.confirm_code; $('#actionPreviewCard').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function executeAction(){
    if(!currentActionPreview){showNotice('Create a fresh action preview first.');return;} const btn=$('#executeAction');setBusy(btn,true,'Revalidating & executing…');
    try{const e=await api('/api/actions/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action_id:currentActionPreview.action_id,phrase:$('#actionPhrase').value,code:$('#actionCode').value,acknowledge:$('#actionAcknowledge').checked})});$('#actionResult').innerHTML=renderActionResult(e);currentActionPreview=null;await loadActionCenter();showNotice(`${e.action} completed and recorded in the local journal.`);}catch(e){showNotice(e.message)}finally{setBusy(btn,false)}
  }
  function renderActionResult(e){const o=e.observation||{};return `<div class="action-result"><b>${esc(e.action)} · ${esc(e.status)}</b><p>${esc(e.message)}</p><div class="detail-grid"><div><span>From</span><code>${esc(e.from||'—')}</code></div><div><span>To</span><code>${esc(e.to||'—')}</code></div><div><span>Source exists after</span><b>${o.source_exists?'Yes':'No'}</b></div><div><span>Destination exists after</span><b>${o.destination_exists?'Yes':'No'}</b></div><div><span>Observed running PIDs</span><b>${esc((o.running_pids||[]).join(', ')||'None')}</b></div><div><span>Trust context</span><b>${esc(o.trust_match||'unprofiled')}</b></div></div><p class="muted">${esc(o.note||'')}</p></div>`}
  function renderVault(d){const items=d.items||[];$('#vaultList').innerHTML=items.length?items.map(v=>`<div class="vault-item"><div><span class="eyebrow">${esc(v.id)}</span><h3>${esc(v.original_name)}</h3><code>${esc(v.original_path)}</code><small>Vaulted ${esc(fmtISO(v.moved_at))} · ${bytes(v.size)} · risk ${v.risk??0}</small><p>${esc(v.note||'')}</p></div><div class="vault-actions"><button class="primary restore-vault" data-id="${esc(v.id)}">Restore</button><button class="secondary reveal-vault" data-id="${esc(v.id)}">Reveal</button></div></div>`).join(''):'<div class="empty">Sentinel Vault is empty.</div>';$$('.restore-vault').forEach(b=>b.addEventListener('click',()=>previewRestore(b.dataset.id)));$$('.reveal-vault').forEach(b=>b.addEventListener('click',()=>revealPath('',b.dataset.id)));}
  async function loadVault(){try{renderVault(await api('/api/actions/vault'))}catch(e){showNotice(e.message)}}
  async function previewRestore(id){switchView('actions');try{await previewActionRequest({action:'restore',vault_id:id})}catch{}}
  function renderActionJournal(d){const rows=d.entries||[];$('#actionJournal').innerHTML=rows.length?rows.map(e=>`<div class="journal-entry"><div><span class="eyebrow">${esc(e.at)}</span><h3>${esc(e.action)} · ${esc(e.status)}</h3><code>${esc(e.from||'—')} → ${esc(e.to||'—')}</code><p>${esc(e.message)}</p></div><div class="journal-actions">${e.status==='success'&&(e.action==='rename'||e.action==='vault')?`<button class="secondary undo-action" data-id="${esc(e.id)}">Undo</button>`:''}</div></div>`).join(''):'<div class="empty">No Safe Action journal entries yet.</div>';$$('.undo-action').forEach(b=>b.addEventListener('click',()=>previewUndo(b.dataset.id)));}
  async function loadActionJournal(){try{renderActionJournal(await api('/api/actions/journal'))}catch(e){showNotice(e.message)}}
  async function previewUndo(id){switchView('actions');try{await previewActionRequest({action:'undo',journal_id:id})}catch{}}

  function changeClass(sev){return sev==='high'?'bad':sev==='review'?'warn':'info'}
  function renderIncidents(d){
    const rows=d.incidents||[];$('#incidentSummary').innerHTML=`<div class="queue-summary"><span>${Number(d.high||0)} high</span><span>${Number(d.review||0)} review</span><span>${Number(d.info||0)} info</span><span>${Number(d.count||0)} total</span></div><p class="muted">${esc(d.note||'')}</p>`;
    $('#incidentList').innerHTML=rows.length?rows.slice().reverse().map((x,i)=>`<div class="behavior-change ${esc(x.severity)}"><div class="behavior-change-head"><div><span class="eyebrow">${esc((x.sources||[]).join(' + '))} · ${esc(x.state||'active')}</span><h3>${esc(x.title)}</h3></div><div><span class="badge ${severityClass(x.severity)}">${esc(x.severity)}</span><span class="badge">confidence ${Number(x.confidence||0)}%</span><span class="badge">${Number(x.occurrence_count||((x.evidence||[]).length)||1)} evidence</span></div></div>${x.primary_path?`<code>${esc(x.primary_path)}</code>`:''}<p>${esc(x.note||'')}</p><div class="evidence-block"><b>Timeline</b><ul>${(x.evidence||[]).map(e=>`<li>${esc(fmtTime(e.at))} · ${esc(e.source)} · ${esc(e.kind)} · ${esc(e.detail)}</li>`).join('')}</ul></div><div class="evidence-block"><b>Recommended</b><ul>${(x.recommended||[]).map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div><div class="row-actions"><button class="tiny incident-deep" data-id="${esc(encodeURIComponent(x.id))}">Deep Review</button>${x.primary_path?`<button class="tiny incident-story" data-path="${esc(encodeURIComponent(x.primary_path))}">Object Story</button><button class="tiny incident-integrity" data-path="${esc(encodeURIComponent(x.primary_path))}">Integrity</button>`:''}</div></div>`).join(''):'<div class="empty">No correlated incidents are currently available.</div>';
    $$('.incident-story').forEach(b=>b.addEventListener('click',()=>openFileStory(decodeURIComponent(b.dataset.path))));
    $$('.incident-integrity').forEach(b=>b.addEventListener('click',()=>{switchView('integrity');$('#integrityPath').value=decodeURIComponent(b.dataset.path);inspectIntegrity(new Event('submit'))}));
    $$('.incident-deep').forEach(b=>b.addEventListener('click',()=>deepReviewIncident(decodeURIComponent(b.dataset.id))));
  }
  async function deepReviewIncident(id){const card=$('#incidentDeepReviewCard'),body=$('#incidentDeepReviewBody');card.classList.remove('hidden');body.innerHTML='<div class="empty">Re-inspecting current local evidence…</div>';try{const d=await api('/api/incidents/detail?id='+encodeURIComponent(id)),i=d.integrity||{},o=d.object_story||{};body.innerHTML=`<div class="deep-review-grid"><div><span class="eyebrow">Incident</span><h3>${esc(d.incident?.title||'Incident')}</h3><p>${esc(d.note||'')}</p><code>${esc(d.incident?.primary_path||'No primary path')}</code></div><div><span class="eyebrow">Integrity now</span><h3>${esc(i.hash_status||'not available')}</h3><p>SHA-256: ${esc(i.sha256?i.sha256.slice(0,24)+'…':'—')}</p><p>Signature: ${esc(i.identity?.verification||'unknown')} · Gatekeeper: ${esc(i.identity?.gatekeeper||'unknown')}</p></div></div>${o.title?`<div class="deep-review-story"><b>Object Story now</b><p>${esc(o.summary||'')}</p><div class="queue-summary"><span>Risk ${Number(o.risk||0)}</span><span>${Number((o.relations||[]).length)} relations</span><span>${Number((o.timeline||[]).length)} session events</span></div></div>`:''}`;card.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){body.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

  async function loadIncidents(history=false){try{renderIncidents(await api('/api/incidents'+(history?'?history=1':'')))}catch(e){showNotice(e.message)}}
  async function rebuildIncidents(){const b=$('#rebuildIncidents');setBusy(b,true,'Correlating…');try{renderIncidents(await api('/api/incidents',{method:'POST'}));await loadReviewQueue()}catch(e){showNotice(e.message)}finally{setBusy(b,false)}}

  function renderChangeStatus(s){const mode=s.mode||'stopped';$('#changeModeBadge').textContent=mode.replaceAll('-',' ');$('#changeModeBadge').className='badge '+(s.running?(mode==='native-fsevents'?'good':'warn'):'');$('#changeStatus').innerHTML=`<div class="change-status-grid"><div><span>Status</span><b>${s.running?'Running':'Stopped'}</b></div><div><span>Mode</span><b>${esc(mode)}</b></div><div><span>Native bridge</span><b>${s.native_available?'Available':'Not in this binary'}</b></div><div><span>Events</span><b>${Number(s.event_count||0)}</b></div><div><span>History</span><b>${Number(s.history_entries||0)}</b></div><div><span>Checkpoint</span><b>${s.resume_checkpoint?'Resumed':(s.last_native_event_id?'Saved':'None')}</b></div><div><span>Needs rescan</span><b>${s.needs_rescan?'YES':'No'}</b></div><div><span>Dropped signals</span><b>${Number(s.dropped_signals||0)}</b></div></div><p class="muted">${esc(s.note||'')}</p>${s.roots?.length?`<div class="watch-roots">${s.roots.map(x=>`<code>${esc(x)}</code>`).join('')}</div>`:''}`}
  function renderChangeEvents(rows){$('#changeEvents').innerHTML=rows?.length?rows.map(e=>`<div class="change-event ${changeClass(e.severity)}"><div><span class="eyebrow">${esc(e.source)} · ${esc(e.kind.replaceAll('_',' '))}</span><h3>${esc(e.path.split('/').pop()||e.path)}</h3><code>${esc(e.path)}</code><p>${esc(e.why)}</p>${e.flags?.length?`<small>${e.flags.map(esc).join(' · ')}</small>`:''}</div><div><span class="badge ${changeClass(e.severity)}">${esc(e.severity)}</span>${e.needs_rescan?'<span class="badge bad">RESCAN</span>':''}<time>${esc(fmtTime(e.at))}</time></div></div>`).join(''):'<div class="empty">No change events in this Sentinel session.</div>'}
  async function loadChanges(){try{const d=await api('/api/changes/events');renderChangeStatus(d.status||{});renderChangeEvents(d.events||[])}catch(e){showNotice(e.message)}}
  async function loadChangeHistory(){try{const d=await api('/api/changes/history');renderChangeStatus(d.status||{});renderChangeEvents(d.events||[]);showNotice('Showing bounded cross-session Change History. File contents are not stored.')}catch(e){showNotice(e.message)}}
  async function startChanges(){const b=$('#startChanges');setBusy(b,true,'Starting…');try{const preset=$('#changePreset').value;const roots=preset==='custom'?$('#changeRoots').value.split(/\n+/).map(x=>x.trim()).filter(Boolean):[];renderChangeStatus(await api('/api/changes/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset,roots,interval_ms:Number($('#changeInterval').value)||2500})}));await loadChanges()}catch(e){showNotice(e.message)}finally{setBusy(b,false)}}
  async function stopChanges(){try{renderChangeStatus(await api('/api/changes/stop',{method:'POST'}));await loadChanges()}catch(e){showNotice(e.message)}}
  async function reconcileChanges(){const b=$('#reconcileChanges');setBusy(b,true,'Reconciling…');try{const d=await api('/api/changes/reconcile',{method:'POST'});showNotice(d.complete?'Hierarchy reconciliation completed; rescan-required state cleared.':`Reconciliation incomplete. Truncated roots: ${(d.truncated_roots||[]).join(', ')}`);await loadChanges()}catch(e){showNotice(e.message)}finally{setBusy(b,false)}}
  async function clearChanges(){try{await api('/api/changes/clear',{method:'POST'});await loadChanges();$('#changeReview').innerHTML='<div class="empty">Change event buffer cleared.</div>'}catch(e){showNotice(e.message)}}
  async function reviewChanges(){const b=$('#reviewChanges');setBusy(b,true,'Reviewing…');try{const d=await api('/api/changes/review',{method:'POST'}),ins=d.integrity_inspections||[];$('#changeReview').innerHTML=`<div class="scan-summary"><b>${Number(d.events_reviewed||0)} events reviewed</b><span>${esc(d.note||'')}</span></div>${ins.length?ins.map(x=>`<div class="change-review-item"><b>${esc(x.path.split('/').pop())}</b><code>${esc(x.path)}</code><span>SHA-256: ${esc(x.sha256?x.sha256.slice(0,18)+'…':x.hash_status)}</span><small>Signature: ${esc(x.identity?.verification||'unknown')} · Gatekeeper: ${esc(x.identity?.gatekeeper||'unknown')}</small></div>`).join(''):'<div class="empty">No bounded file-integrity reinspection was needed.</div>'}`;await loadChanges();await rebuildIncidents();await loadReviewQueue()}catch(e){showNotice(e.message)}finally{setBusy(b,false)}}
  function updateChangePreset(){$('#changeCustomLabel').classList.toggle('hidden',$('#changePreset').value!=='custom')}

  async function cleanup(){ const btn=$('#previewCleanup');setBusy(btn,true,'Analyzing…');try{const d=await api('/api/cleanup/preview');const total=(d.items||[]).reduce((s,x)=>s+(x.size||0),0);$('#cleanupTotal').classList.toggle('hidden',!d.items?.length);$('#cleanupTotal').innerHTML=d.items?.length?`<span>Reviewable footprint found</span><strong>${bytes(total)}</strong><small>Sentinel never permanently deletes. Safe Actions are reversible and still require review.</small>`:'';$('#cleanupList').innerHTML=d.items.length?d.items.map(x=>`<div class="cleanup-item"><div><b>${esc(x.label)}</b><div class="mono muted">${esc(x.path)}</div><p>${esc(x.reason)}</p></div><div><b>${bytes(x.size)}</b><div class="badge">${esc(x.confidence)}</div><button class="tiny cleanup-action" data-path="${esc(encodeURIComponent(x.path))}">Review actions</button></div></div>`).join(''):'<div class="empty">No common cleanup candidates were measurable.</div>';$$('.cleanup-action').forEach(b=>b.addEventListener('click',()=>openActionsForPath(decodeURIComponent(b.dataset.path))));}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  async function exportReport(){ const btn=$('#exportReport'); setBusy(btn,true,'Building report…'); try{const res=await fetch('/api/report/export',{headers:{'X-Sentinel-Token':token}}); if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||`HTTP ${res.status}`)} const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='sentinel-report.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){showNotice(e.message)}finally{setBusy(btn,false)} }
  function table(headers,rows){ if(!rows?.length)return '<div class="empty">No results.</div>'; return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }

  async function switchView(v){
    if(!titles[v])v='overview';
    if(advancedViews.has(v)&&navMode==='easy')setNavMode('advanced');
    current=v;$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===v));$$('.view').forEach(x=>x.classList.toggle('active',x.id===v));$('#pageTitle').textContent=titles[v][0];$('#pageSub').textContent=titles[v][1];showNotice('');$('#pageHelp')?.classList.add('hidden');updatePageHelp();
    if(v==='hardware')loadSystemProfile();if(v==='weakness')loadCoverage();if(v==='changes')loadChanges();if(v==='incidents')loadIncidents(false);if(v==='processes'&&!processRows.length)loadProcesses();if(v==='startup')loadStartup();if(v==='persistence')loadPersistence();if(v==='background')loadBackground();if(v==='network')loadNetwork();if(v==='intelligence'&&!evidenceGraph)loadEvidence(false);if(v==='behavior')loadBehavior();if(v==='trust')loadTrust();if(v==='actions')loadActionCenter();
  }
  $$('.nav').forEach(n=>n.addEventListener('click',()=>switchView(n.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
  $('#loadSystemProfile').addEventListener('click',loadSystemProfile);$('#runReadiness').addEventListener('click',loadReadiness);$('#closeIncidentDeepReview').addEventListener('click',()=>$('#incidentDeepReviewCard').classList.add('hidden'));$('#easyMode').addEventListener('click',()=>setNavMode('easy'));$('#rebuildIncidents').addEventListener('click',rebuildIncidents);$('#loadIncidentHistory').addEventListener('click',()=>loadIncidents(true));$('#loadChangeHistory').addEventListener('click',loadChangeHistory);$('#changePreset').addEventListener('change',updateChangePreset);$('#startChanges').addEventListener('click',startChanges);$('#stopChanges').addEventListener('click',stopChanges);$('#refreshChanges').addEventListener('click',loadChanges);$('#reviewChanges').addEventListener('click',reviewChanges);$('#reconcileChanges').addEventListener('click',reconcileChanges);$('#clearChanges').addEventListener('click',clearChanges);$('#deepSearchForm').addEventListener('submit',runDeepSearch);$('#runWeaknessAudit').addEventListener('click',runWeaknessAudit);$('#loadAdvancedSensor').addEventListener('click',loadAdvancedSensor);$('#loadCoverage').addEventListener('click',loadCoverage);$('#advancedMode').addEventListener('click',()=>setNavMode('advanced'));$('#pageHelpToggle').addEventListener('click',togglePageHelp);$('#runQuickCheck').addEventListener('click',runQuickCheck);$('#guidedSnapshot').addEventListener('click',captureGuidedSnapshot);$('#loadReviewQueue').addEventListener('click',loadReviewQueue);$('#globalSearch').addEventListener('input',scheduleGlobalSearch);$('#globalSearch').addEventListener('focus',scheduleGlobalSearch);$$('.preset-scan').forEach(b=>b.addEventListener('click',()=>applyScanPreset(b)));document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();$('#globalSearch').select()}if(e.key==='Escape')$('#globalSearchPanel').classList.add('hidden')});document.addEventListener('click',e=>{if(!e.target.closest('.global-search-wrap'))$('#globalSearchPanel').classList.add('hidden')});
  $('#integrityForm').addEventListener('submit',inspectIntegrity);$('#loadSelfIntegrity').addEventListener('click',loadSelfIntegrity);$('#capturePersistence').addEventListener('click',capturePersistence);$('#loadPersistence').addEventListener('click',loadPersistence);$('#scanForm').addEventListener('submit',startStorage);$('#cancelScan').addEventListener('click',cancelStorage);$('#fileFilter').addEventListener('input',()=>renderFileTable(lastFiles));$('#runAudit').addEventListener('click',runAudit);$('#loadProcesses').addEventListener('click',loadProcesses);$('#processFilter').addEventListener('input',renderProcesses);$('#closeProcessDetail').addEventListener('click',()=>$('#processDetail').classList.add('hidden'));$('#loadStartup').addEventListener('click',loadStartup);$('#loadBackground').addEventListener('click',loadBackground);$('#loadNetwork').addEventListener('click',loadNetwork);$('#previewCleanup').addEventListener('click',cleanup);$('#captureEvidence').addEventListener('click',()=>loadEvidence(true));$('#loadEvidence').addEventListener('click',()=>loadEvidence(false));$('#loadTimeline').addEventListener('click',loadTimeline);$('#exportReport').addEventListener('click',exportReport);$('#loadCapabilities').addEventListener('click',loadCapabilities);$('#exportDiagnostics').addEventListener('click',exportDiagnostics);$('#captureBehavior').addEventListener('click',captureBehavior);$('#loadBehavior').addEventListener('click',loadBehavior);$('#loadBehaviorHistory').addEventListener('click',loadBehaviorHistory);$('#loadBehaviorHealth').addEventListener('click',loadBehaviorHealth);$('#compareTrust').addEventListener('click',compareTrust);$('#captureTrust').addEventListener('click',captureTrust);$('#loadTrustHealth').addEventListener('click',loadTrustHealth);$('#loadTrustHistory').addEventListener('click',loadTrustHistory);$('#exportTrust').addEventListener('click',exportTrust);$('#restoreTrust').addEventListener('click',restoreTrust);$('#actionForm').addEventListener('submit',previewAction);$('#actionType').addEventListener('change',updateActionTypeUI);$('#revealActionPath').addEventListener('click',()=>revealPath($('#actionPath').value.trim()));$('#executeAction').addEventListener('click',executeAction);$('#loadActionHealth').addEventListener('click',loadActionHealth);$('#loadVault').addEventListener('click',loadVault);$('#loadActionJournal').addEventListener('click',loadActionJournal);$('#refresh').addEventListener('click',()=>{if(current==='overview')loadOverview();else if(current==='quickcheck')runQuickCheck();else if(current==='hardware')loadSystemProfile();else if(current==='weakness'){runWeaknessAudit();loadCoverage();}else if(current==='changes')loadChanges();else if(current==='incidents')loadIncidents(false);else if(current==='processes')loadProcesses();else if(current==='intelligence')loadEvidence(false);else if(current==='behavior')loadBehavior();else if(current==='trust')loadTrust();else if(current==='persistence')loadPersistence();else if(current==='actions')loadActionCenter();else switchView(current)});
  setNavMode('easy');updatePageHelp();if(!token) showNotice('Missing local session token. Restart Sentinel from the binary.'); else loadOverview();
})();
