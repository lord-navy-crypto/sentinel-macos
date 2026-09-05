// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;
  const {api,esc,bytes,question,band,empty,table,registerLens,notice,activity} = S;
  const MARKER = 'Sentinel 3.1 Maintenance Intelligence Ultra';
  const STORAGE_REVIEW_MARKER = 'Sentinel 3.2 Storage Review Intelligence';
  let persistentTimer = 0;
  let persistentSettings = {enabled:false,auto_interval_seconds:60};

  function task(label, detail='Working locally…', indeterminate=true) {
    if (S.TaskCenter?.create) return S.TaskCenter.create(label,{detail,indeterminate});
    activity(label, indeterminate ? 0 : 5, detail);
    return '';
  }
  function taskDone(id, detail='Completed') {
    if (id && S.TaskCenter?.finish) S.TaskCenter.finish(id, detail);
    else activity('Ready',100,detail);
  }
  function taskFail(id, err) {
    if (id && S.TaskCenter?.fail) S.TaskCenter.fail(id, err.message || String(err));
    else activity('Error',0,err.message || String(err));
  }
  function formPath(value='') { return esc(value || ''); }

  function heatmap(children=[]) {
    if (!children.length) return empty('No measurable child folders were returned for this level.');
    const max = Math.max(...children.map(x=>Number(x.bytes||0)),1);
    return `<div class="maintenance-heatmap">${children.map(node=>{
      const weight=Math.max(12,Math.round(Number(node.bytes||0)/max*100));
      return `<button type="button" class="maintenance-heat" style="--heat-weight:${weight}" data-maintenance-heat-path="${esc(node.path)}" title="${esc(node.path)}"><b>${esc(node.name)}</b><span>${bytes(node.bytes)}</span><small>${Number(node.percent||0).toFixed(1)}%</small></button>`;
    }).join('')}</div>`;
  }

  function reviewBoundary(d) {
    const definition=d?.definition?`<div class="maintenance-note"><b>Definition</b><br>${esc(d.definition)}</div>`:'';
    const unknown=d?.not_established?`<div class="maintenance-note"><b>Not established</b><br>${esc(d.not_established)}</div>`:'';
    return definition+unknown;
  }

  function aggregateTable(title,rows=[]) {
    if(!rows.length)return `<section><h3>${esc(title)}</h3>${empty('No completed rows in this bounded read.')}</section>`;
    return `<section><h3>${esc(title)}</h3>${table(['Group','Files','Observed bytes'],rows.map(x=>[esc(x.name),Number(x.count||0).toLocaleString(),bytes(x.bytes)]))}</section>`;
  }

  async function loadSettings() {
    try {
      const d=await api('/api/maintenance/history/settings');
      persistentSettings=d.settings||persistentSettings;
      syncPersistentTimer();
      return d;
    } catch { return {settings:persistentSettings}; }
  }

  function syncPersistentTimer() {
    if (persistentTimer) { clearInterval(persistentTimer); persistentTimer=0; }
    if (!persistentSettings.enabled) return;
    const seconds=Math.max(30,Math.min(3600,Number(persistentSettings.auto_interval_seconds||60)));
    persistentTimer=setInterval(async()=>{
      try { await api('/api/maintenance/history/sample',{method:'POST'}); }
      catch (err) { console.warn('Persistent resource history sample failed:',err); }
    },seconds*1000);
  }

  async function renderMaintenance() {
    const settings=await loadSettings();
    const enabled=Boolean(settings.settings?.enabled);
    const interval=Number(settings.settings?.auto_interval_seconds||60);
    document.getElementById('evidenceStage').innerHTML = question(`
      <button type="button" data-maintenance-refresh>Refresh maintenance intelligence</button>`) +
      band(1,'Storage intelligence',`
        <div class="maintenance-grid">
          <form class="maintenance-card" data-maintenance-form="heatmap"><h3>Storage Heatmap</h3><p>Reuses the bounded Lazy Storage Graph. Rectangle weight represents measured child size.</p><label>Folder<input name="path" placeholder="Defaults to Home"></label><label>Top children<input name="limit" type="number" min="6" max="60" value="24"></label><button>Generate Heatmap</button></form>
          <form class="maintenance-card" data-maintenance-form="large"><h3>Large File Explorer</h3><p>Read-only, bounded walk. Large does not mean safe to delete.</p><label>Folder<input name="path" placeholder="Defaults to Home"></label><label>Minimum MB<input name="min_mb" type="number" min="1" max="102400" value="500"></label><button>Find Large Files</button></form>
          <form class="maintenance-card" data-maintenance-form="aging"><h3>Existing Scan Aging</h3><p>Reuses the latest completed Storage Intelligence large-file evidence. This view starts no new filesystem scan.</p><button>Show Retained Aging</button></form>
          <form class="maintenance-card" data-maintenance-form="old"><h3>Old File Explorer</h3><p>Find regular files by modification age. Modified long ago does not mean unused or safe to delete.</p><label>Folder<input name="path" placeholder="Defaults to Home"></label><label>Modified at least (days)<input name="days" type="number" min="30" max="3650" value="180"></label><label>Minimum MB<input name="min_mb" type="number" min="0" max="102400" value="10"></label><button>Review Modified-Age Files</button></form>
          <form class="maintenance-card" data-maintenance-form="downloads"><h3>Downloads Intelligence</h3><p>Reviews ~/Downloads by modification age, size, and extension-derived type. No duplicate or cleanup claim is made.</p><button>Analyze Downloads</button></form>
          <form class="maintenance-card" data-maintenance-form="duplicates"><h3>Exact Duplicate Explorer</h3><p>Same size only creates candidates. Sentinel labels duplicate only after full-file SHA-256 equality.</p><label>Folder<input name="path" placeholder="Defaults to Home"></label><label>Minimum MB<input name="min_mb" type="number" min="1" max="102400" value="10"></label><button>Find Exact Duplicates</button></form>
          <form class="maintenance-card" data-maintenance-form="app"><h3>App Footprint</h3><p>Combines the .app bundle with user-Library locations linked by bundle ID or exact-name evidence.</p><label>Application path<input name="app" placeholder="/Applications/Example.app" required></label><button>Measure App Footprint</button></form>
        </div><div id="maintenanceStorageOutput" class="maintenance-output">${empty('Choose one storage analysis. No user files are modified.')}</div>`,
        'Bounded read-only storage evidence; no cleanup occurs here.') +
      band(2,'Persistent resource history',`
        <div class="maintenance-history-card"><div><h3>Opt-in recorder</h3><p>Disabled by default. When enabled, Sentinel stores its own resource samples in ~/Library/Application Support/Sentinel/resource-history.jsonl. The recorder runs while Sentinel is open and this frontend is loaded.</p></div>
        <form data-maintenance-form="history-settings" class="maintenance-history-controls"><label><input name="enabled" type="checkbox" ${enabled?'checked':''}> Enable persistent history</label><label>Interval seconds<input name="interval" type="number" min="30" max="3600" value="${interval}"></label><button>Save</button><button type="button" data-maintenance-sample ${enabled?'':'disabled'}>Record snapshot now</button></form></div>
        <div id="maintenanceHistoryOutput" class="maintenance-output"></div>`,
        'Persistence is explicit and opt-in. Disabling recording does not silently delete previously recorded Sentinel history.') +
      band(3,'Measured throughput',`
        <div class="maintenance-rate-row"><button type="button" data-maintenance-rates>Calculate from retained counters</button><span>Requires at least two retained observations. Counter resets are reported unavailable.</span></div><div id="maintenanceRatesOutput" class="maintenance-output"></div>`,
        'Rates are counter deltas divided by measured elapsed time, not estimates from one cumulative value.') +
      band(4,'Interpretation boundary',`<div class="maintenance-boundary"><b>No automatic cleanup.</b><span>Large/old/download files are review evidence, not deletion recommendations. Exact duplicates require hash equality, App Footprint reports its association evidence, and persistent history writes only Sentinel-owned telemetry after opt-in.</span></div>`,
        `${MARKER} · ${STORAGE_REVIEW_MARKER}`);
  }

  async function runHeatmap(form,pathOverride='') {
    const fd=new FormData(form), path=pathOverride||String(fd.get('path')||''), limit=Number(fd.get('limit')||24);
    const id=task('Storage Heatmap','Measuring one bounded directory level…',true);
    try {
      const d=await api(`/api/storage/graph?path=${encodeURIComponent(path)}&limit=${encodeURIComponent(limit)}`);
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${esc(d.path)}</b><span>${bytes(d.bytes)} measured · ${d.children?.length||0} shown${d.limited?' · limited visibility':''}</span></div>${heatmap(d.children||[])}`;
      taskDone(id,`Heatmap ready · ${d.children?.length||0} child nodes`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runLarge(form) {
    const fd=new FormData(form), path=String(fd.get('path')||''), min=Number(fd.get('min_mb')||500);
    const id=task('Large File Explorer','Bounded filesystem walk · total work is not knowable in advance',true);
    try {
      const d=await api(`/api/maintenance/large-files?path=${encodeURIComponent(path)}&min_mb=${encodeURIComponent(min)}`);
      const rows=d.files||[];
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${rows.length} large file(s)</b><span>${Number(d.visited_entries||0).toLocaleString()} entries visited${d.limited?' · scan bound reached':''}</span></div>${rows.length?table(['Size','Modified','File','Path'],rows.map(x=>[bytes(x.bytes),esc(new Date(x.modified_at).toLocaleString()),esc(x.name),`<code>${esc(x.path)}</code>`])):empty('No files above the selected threshold were found inside the bounded scan.')}`;
      taskDone(id,`Visited ${Number(d.visited_entries||0).toLocaleString()} entries · ${rows.length} results`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runAging() {
    const id=task('Existing Storage Aging','Reading retained large-file evidence; no new scan…',true);
    try {
      const d=await api('/api/storage/aging'), rows=d.oldest_large_files||[], buckets=d.buckets||[];
      const bucketView=buckets.length?table(['Age band','Files','Observed bytes'],buckets.map(x=>[esc(x.label),Number(x.files||0).toLocaleString(),bytes(x.bytes)])):empty('No retained age buckets are available.');
      const fileView=rows.length?table(['Age','Size','Modified','File','Path'],rows.map(x=>[`${Number(x.age_days||0)} days`,bytes(x.size),esc(new Date(Number(x.modified_at||0)*1000).toLocaleString()),esc(x.name),`<code>${esc(x.path)}</code>`])):empty('No retained large-file modification timestamps are available from the latest completed Storage Intelligence scan.');
      const limitations=(d.limitations||[]).map(x=>`<div class="maintenance-note">Limitation: ${esc(x)}</div>`).join('');
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>Existing scan aging</b><span>${Number(d.files_considered||0).toLocaleString()} retained large file(s) · ${bytes(d.bytes_considered)} observed</span></div><h3>Age distribution</h3>${bucketView}<h3>Oldest retained large files</h3>${fileView}${limitations}<div class="maintenance-note">${esc(d.note||'This view reuses the latest completed Storage Intelligence evidence and does not start a new scan.')}</div>`;
      taskDone(id,`Read ${Number(d.files_considered||0).toLocaleString()} retained large-file observations`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runOld(form) {
    const fd=new FormData(form), path=String(fd.get('path')||''), days=Number(fd.get('days')||180), min=Number(fd.get('min_mb')||10);
    const id=task('Old File Explorer','Bounded read-only walk · modification age is not last-used time',true);
    try {
      const d=await api(`/api/maintenance/old-files?path=${encodeURIComponent(path)}&days=${encodeURIComponent(days)}&min_mb=${encodeURIComponent(min)}`), rows=d.files||[];
      const result=rows.length?table(['Age','Size','Modified','File','Path'],rows.map(x=>[`${Number(x.age_days||0)} days`,bytes(x.bytes),esc(new Date(x.modified_at).toLocaleString()),esc(x.name),`<code>${esc(x.path)}</code>`])):empty('No files matched the selected modification-age and size thresholds inside this bounded scan.');
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${Number(d.matched_files||0).toLocaleString()} modified-age candidate(s)</b><span>${Number(d.visited_entries||0).toLocaleString()} entries visited${d.limited?' · bounded result':''}</span></div>${result}${reviewBoundary(d)}`;
      taskDone(id,`Visited ${Number(d.visited_entries||0).toLocaleString()} entries · ${Number(d.matched_files||0)} matched`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runDownloads() {
    const id=task('Downloads Intelligence','Bounded read-only review of ~/Downloads · no cleanup or duplicate hashing',true);
    try {
      const d=await api('/api/maintenance/downloads'), largest=d.largest_files||[], oldest=d.oldest_files||[];
      const largestView=largest.length?table(['Size','Age','Type','Modified','File'],largest.map(x=>[bytes(x.bytes),`${Number(x.age_days||0)} days`,esc(x.category),esc(new Date(x.modified_at).toLocaleString()),`<code>${esc(x.path)}</code>`])):empty('No regular files completed this bounded Downloads read.');
      const oldestView=oldest.length?table(['Age','Size','Type','File'],oldest.map(x=>[`${Number(x.age_days||0)} days`,bytes(x.bytes),esc(x.category),`<code>${esc(x.path)}</code>`])):empty('No oldest-file rows are available.');
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${Number(d.regular_files||0).toLocaleString()} Downloads file(s)</b><span>${bytes(d.visible_file_bytes)} observed · ${Number(d.visited_entries||0).toLocaleString()} entries visited${d.limited?' · bounded result':''}</span></div><div class="maintenance-grid">${aggregateTable('By type',d.by_category||[])}${aggregateTable('By modification age',d.by_age||[])}${aggregateTable('By file size',d.by_size||[])}</div><h3>Largest observed files</h3>${largestView}<h3>Oldest by modification time</h3>${oldestView}${reviewBoundary(d)}`;
      taskDone(id,`${Number(d.regular_files||0).toLocaleString()} regular Downloads files reviewed`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runDuplicates(form) {
    const fd=new FormData(form), path=String(fd.get('path')||''), min=Number(fd.get('min_mb')||10);
    const id=task('Exact Duplicate Explorer','Size grouping + bounded full-file SHA-256 hashing…',true);
    try {
      const d=await api(`/api/maintenance/duplicates?path=${encodeURIComponent(path)}&min_mb=${encodeURIComponent(min)}`);
      const groups=d.groups||[];
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${groups.length} exact duplicate group(s)</b><span>${Number(d.hashed_files||0)} files fully hashed · ${Number(d.visited_entries||0).toLocaleString()} entries visited${d.limited?' · bounded result':''}</span></div>${groups.length?groups.map(g=>`<article class="duplicate-group"><div><b>${bytes(g.bytes_per_file)} each</b><span>Reviewable duplicate bytes: ${bytes(g.reclaimable_if_reviewed_bytes)}</span><code>SHA-256 ${esc(g.sha256)}</code></div>${(g.paths||[]).map(p=>`<code>${esc(p)}</code>`).join('')}</article>`).join(''):empty('No full-file SHA-256 duplicate groups completed inside this bounded scan.')}`;
      taskDone(id,`${groups.length} exact groups · ${Number(d.hashed_files||0)} files hashed`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function runApp(form) {
    const app=String(new FormData(form).get('app')||'');
    const id=task('App Footprint','Measuring application bundle and evidence-linked user Library paths…',true);
    try {
      const d=await api(`/api/maintenance/app-footprint?app=${encodeURIComponent(app)}`), rows=d.items||[];
      document.getElementById('maintenanceStorageOutput').innerHTML=`<div class="maintenance-summary"><b>${esc(d.bundle_id||'Bundle ID unavailable')}</b><span>${bytes(d.total_bytes)} across ${rows.length} evidence-linked item(s)</span></div>${table(['Size','Confidence','Evidence','Path'],rows.map(x=>[bytes(x.bytes),esc(x.confidence),esc(x.evidence),`<code>${esc(x.path)}</code>`]))}<div class="maintenance-note">${esc(d.boundary||'')}</div>`;
      taskDone(id,`${bytes(d.total_bytes)} evidence-linked footprint`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function saveHistory(form) {
    const fd=new FormData(form), payload={enabled:fd.get('enabled')==='on',auto_interval_seconds:Number(fd.get('interval')||60)};
    const id=task('Persistent History Settings','Saving Sentinel-owned recording preference…',true);
    try {
      const d=await api('/api/maintenance/history/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      persistentSettings=d.settings||payload; syncPersistentTimer(); taskDone(id,persistentSettings.enabled?'Persistent history enabled':'Persistent history disabled'); await renderMaintenance();
    } catch(err){ taskFail(id,err); throw err; }
  }

  async function recordSample() {
    const id=task('Persistent Resource Snapshot','Capturing one resource observation…',true);
    try { await api('/api/maintenance/history/sample',{method:'POST'}); taskDone(id,'One resource sample persisted'); }
    catch(err){ taskFail(id,err); throw err; }
  }

  async function rates() {
    const id=task('Measured Throughput','Reading retained counter deltas…',true);
    try {
      const d=await api('/api/maintenance/rates?window=1h'), out=document.getElementById('maintenanceRatesOutput');
      if(!d.available){out.innerHTML=empty(d.reason||'Not enough retained counter evidence yet.');taskDone(id,'More samples required');return;}
      const rate=v=>`${bytes(Number(v||0))}/s`;
      out.innerHTML=table(['Signal','Measured rate','Available'],[
        ['Disk read',rate(d.disk_read_bytes_per_second),d.disk_read_available?'yes':'no'],['Disk write',rate(d.disk_write_bytes_per_second),d.disk_write_available?'yes':'no'],['Network receive',rate(d.network_rx_bytes_per_second),d.network_rx_available?'yes':'no'],['Network transmit',rate(d.network_tx_bytes_per_second),d.network_tx_available?'yes':'no']
      ].map(r=>r.map(esc)))+`<div class="maintenance-note">${esc(d.method||'')}</div>`;
      taskDone(id,`${Number(d.sample_count||0)} samples across ${Math.round(Number(d.elapsed_seconds||0))}s`);
    } catch(err){ taskFail(id,err); throw err; }
  }

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-maintenance-form]'); if(!form)return; event.preventDefault();
    try {
      if(form.dataset.maintenanceForm==='heatmap')await runHeatmap(form);
      if(form.dataset.maintenanceForm==='large')await runLarge(form);
      if(form.dataset.maintenanceForm==='aging')await runAging();
      if(form.dataset.maintenanceForm==='old')await runOld(form);
      if(form.dataset.maintenanceForm==='downloads')await runDownloads();
      if(form.dataset.maintenanceForm==='duplicates')await runDuplicates(form);
      if(form.dataset.maintenanceForm==='app')await runApp(form);
      if(form.dataset.maintenanceForm==='history-settings')await saveHistory(form);
    } catch(err){ notice(err.message); }
  });
  document.addEventListener('click',async event=>{
    try {
      const heat=event.target.closest('[data-maintenance-heat-path]');
      if(heat){const form=document.querySelector('[data-maintenance-form="heatmap"]');if(form)await runHeatmap(form,heat.dataset.maintenanceHeatPath);return;}
      if(event.target.closest('[data-maintenance-refresh]')){await renderMaintenance();return;}
      if(event.target.closest('[data-maintenance-sample]')){await recordSample();return;}
      if(event.target.closest('[data-maintenance-rates]')){await rates();return;}
    } catch(err){ notice(err.message); }
  });

  registerLens('maintenance',renderMaintenance);
  S.MaintenanceUltra={marker:MARKER,storageReviewMarker:STORAGE_REVIEW_MARKER,render:renderMaintenance};
})();
