// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.3 Visual Native — high-frequency lens presentation overrides.
// Backend endpoints, evidence meaning, and safety boundaries remain unchanged.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;
  const {$, state, api, busy, activity, esc, bytes, fmt, question, band, empty, table, registerLens} = S;
  const MARKER = 'Sentinel 3.3 Visual Native';

  function stat(label, value, detail='') {
    return `<div class="vn-stat"><span>${esc(label)}</span><b>${esc(value)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  }

  function machineHero(d, h) {
    const cpu = h?.cpu || {}, mem = h?.memory || {}, bat = h?.battery || {};
    const battery = bat.available ? `${bat.charge_percent}%${bat.charging ? ' · charging' : bat.ac_power ? ' · AC' : ' · battery'}` : 'Not reported';
    return `<section class="vn-hero">
      <div class="vn-hero-copy">
        <div class="vn-eyebrow">THIS MAC / 这台 Mac</div>
        <h2>${esc(d.model_name || d.model_identifier || 'Mac')}</h2>
        <p>${esc(d.chip || d.processor || d.architecture || '')} · macOS ${esc(d.os_version || '')}. Hardware identity and live resource state are shown separately so a momentary load is never confused with a hardware verdict.</p>
        <div class="vn-stat-grid">
          ${stat('CPU load', cpu.normalized_percent != null ? `${Number(cpu.normalized_percent).toFixed(1)}%` : '—', 'current normalized load')}
          ${stat('Memory', bytes(d.memory_bytes), h?.memory_free_percent != null ? `${h.memory_free_percent}% free now` : 'installed')}
          ${stat('Battery', battery, bat.condition || 'current power state')}
          ${stat('Storage available', bytes(d.disk_available), `${bytes(d.disk_total)} total`)}
        </div>
      </div>
      <div class="vn-hero-score">
        <span>Architecture</span>
        <strong style="font-size:32px">${esc(d.architecture || '—')}</strong>
        <small>${Number(d.logical_cores || 0)} logical · ${Number(d.physical_cores || 0)} physical cores</small>
      </div>
    </section>`;
  }

  function healthPanel(h) {
    if (!h) return empty('Live health data was not available.');
    const cpu=h.cpu||{},mem=h.memory||{},bat=h.battery||{};
    return `<div class="vn-two">
      <div class="vn-panel"><div class="vn-kicker">LIVE STATE</div><h3>Resource snapshot</h3><div class="vn-stat-grid">
        ${stat('CPU',cpu.normalized_percent!=null?`${Number(cpu.normalized_percent).toFixed(1)}%`:'—','normalized across logical CPUs')}
        ${stat('Memory free',h.memory_free_percent!=null?`${h.memory_free_percent}%`:'—',`${bytes(mem.compressed_bytes||0)} compressed`)}
        ${stat('Wired',bytes(mem.wired_bytes||0),'wired memory')}
        ${stat('Uptime',h.uptime||'—','current boot session')}
      </div></div>
      <div class="vn-panel"><div class="vn-kicker">POWER</div><h3>Battery & sleep context</h3><div class="vn-ring" style="--p:${bat.available?Math.max(0,Math.min(100,Number(bat.charge_percent||0))):0}"><div><b>${bat.available?`${bat.charge_percent}%`:'—'}</b><span>${bat.available?(bat.charging?'charging':bat.ac_power?'AC power':'battery'):'not reported'}</span></div></div><p class="fine">${esc(bat.condition || 'Battery condition is not exposed on every Mac.')} Sentinel does not fabricate Apple Energy Impact.</p></div>
    </div>`;
  }

  async function renderMachineVisual() {
    busy('Reading machine','System Profile + live health');
    const [d,h]=await Promise.all([api('/api/system-profile'),api('/api/health/live').catch(()=>null)]);
    const identity = `<div class="vn-stat-grid">
      ${stat('Model identifier',d.model_identifier||'—')}${stat('Chip',d.chip||d.processor||'—',d.platform_family||'')}${stat('macOS',d.os_version||'—',d.os_build||'')}${stat('Kernel',d.kernel_version||'—')}${stat('Rosetta',d.rosetta_translated?'Yes':'No')}${stat('Root storage',bytes(d.disk_total),`${bytes(d.disk_available)} available`)}
    </div>`;
    $('#evidenceStage').innerHTML=question('<button type="button" class="s24-action" data-do="refresh-machine-health">Refresh health</button>')+
      machineHero(d,h)+
      band(1,'Live Mac state / 当前状态',healthPanel(h),'Current convenience measurements. They are not a benchmark or a hardware-health certificate.')+
      band(2,'Machine identity / 硬件身份',identity,'Serial number and Hardware UUID are intentionally unnecessary for this product view.')+
      band(3,'Runtime implication',`<div class="s24-note good">${esc(d.engine_explanation||'Sentinel uses the architecture-matched local engine packaged in the Universal app.')}</div>`);
    activity('Ready',100,'Machine profile + health loaded');
  }

  function processBars(rows, key, label) {
    const top=(rows||[]).slice(0,8);
    const max=Math.max(1,...top.map(p=>Number(p[key]||0)));
    return `<div class="vn-panel"><div class="vn-kicker">${esc(label)}</div><h3>Top processes now</h3><div class="vn-process-bars">${top.map(p=>{
      const value=Number(p[key]||0),pct=Math.max(2,Math.min(100,value/max*100));
      const name=String(p.command||'').split('/').pop()||p.command||`PID ${p.pid}`;
      return `<button type="button" class="vn-process-row" data-story-pid="${Number(p.pid||0)}"><span><b>${esc(name)}</b><small>PID ${Number(p.pid||0)}</small></span><i><em style="width:${pct.toFixed(1)}%"></em></i><strong>${value.toFixed(1)}%</strong></button>`;
    }).join('')||empty('No process rows returned.')}</div></div>`;
  }

  async function renderProcessesVisual() {
    busy('Reading processes','Current process snapshot');
    const d=await api('/api/processes');
    state.processRows=d.processes||[];
    const byCpu=[...state.processRows].sort((a,b)=>Number(b.cpu||0)-Number(a.cpu||0));
    const byMem=[...state.processRows].sort((a,b)=>Number(b.memory||0)-Number(a.memory||0));
    const rows=state.processRows.slice(0,260).map(p=>[`<b>${esc(p.pid)}</b>`,`${Number(p.cpu||0).toFixed(1)}%`,`${Number(p.memory||0).toFixed(1)}%`,esc(p.user||''),`<code>${esc(p.command||'')}</code>`,`<button data-story-pid="${Number(p.pid)}">Explain</button>`]);
    $('#evidenceStage').innerHTML=question()+
      `<div class="vn-two">${processBars(byCpu,'cpu','CPU VISUAL')}${processBars(byMem,'memory','MEMORY VISUAL')}</div>`+
      band(1,'Complete process snapshot / 完整进程快照',rows.length?table(['PID','CPU','Memory','User','Command',''],rows):empty('No process rows returned.'),'The visual summary comes first. The full current table remains available below; historical activity requires prior capture.');
    activity('Ready',100,`${state.processRows.length} processes returned`);
  }

  function storageIntro() {
    return `<section class="vn-hero">
      <div class="vn-hero-copy"><div class="vn-eyebrow">STORAGE EXPLORER / 存储空间</div><h2>See space before reading file lists.</h2><p>Start with a bounded measurement or a lazy folder graph. Sentinel shows visual footprint first, then large-file and duplicate evidence. Nothing is deleted here.</p></div>
      <div class="vn-hero-score"><span>Safety mode</span><strong style="font-size:30px;color:var(--vn-green)">READ ONLY</strong><small>Measure → explore → review</small></div>
    </section>`;
  }

  async function renderStorageVisual() {
    $('#evidenceStage').innerHTML=question()+storageIntro()+
      band(1,'Measure / 测量',`<form class="s24-form" data-form="storage"><label class="s24-field"><span>Scope</span><select name="scope"><option value="home">Home</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Minimum file MB</span><input name="min" type="number" min="1" max="10240" value="100"></label><label class="s24-field"><span>Large-file limit</span><input name="limit" type="number" min="10" max="2000" value="200"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Measure storage</button><button class="s24-action" type="button" data-do="cancel-storage">Cancel</button></div></form><div id="storagePipeline" class="vn-flow"><div class="s24-step vn-flow-step"><span>01</span><b>Traverse</b></div><div class="s24-step vn-flow-step"><span>02</span><b>Measure</b></div><div class="s24-step vn-flow-step"><span>03</span><b>Hash candidates</b></div><div class="s24-step vn-flow-step"><span>04</span><b>Report</b></div></div>`,'The scan is bounded and cancellable. Progress is reported only from real backend work.')+
      band(2,'Measured footprint / 测量结果',`<div id="storageSummary">${empty('Run a measurement to populate observed numbers.')}</div>`)+
      band(3,'Large objects / 大文件',`<div id="storageObjects">${empty('No storage result yet.')}</div>`,'Complete object rows stay below the visual summary rather than leading the page.')+
      band(4,'Explore folders visually / 可视化目录',`<form class="s24-form" data-form="storage-graph"><label class="s24-field"><span>Folder</span><input name="path" value="" placeholder="Leave blank for Home"></label><label class="s24-field"><span>Top children per level</span><input name="limit" type="number" min="6" max="60" value="24"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Generate Storage Graph</button></div></form><div id="storageGraph">${empty('Generate a graph, then expand only the folders you want to inspect.')}</div>`,'Lazy bounded expansion keeps the graph responsive.');
    activity('Ready',0,'Storage measurement idle');
  }

  registerLens('machine',renderMachineVisual);
  registerLens('processes',renderProcessesVisual);
  registerLens('storage',renderStorageVisual);

  S.VisualNative={marker:MARKER,renderMachine:renderMachineVisual,renderProcesses:renderProcessesVisual,renderStorage:renderStorageVisual};

  const initial=new URLSearchParams(location.hash.slice(1)).get('lens');
  if(['machine','processes','storage'].includes(initial) && typeof S.navigate==='function') void S.navigate(initial,{push:false});
})();