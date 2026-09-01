// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.6 Full Scan Center — visual capability atlas + retained-evidence orchestration.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Full Scan Center.');
  const {$, api, activity, notice, esc, badge, registerLens} = S;
  const SCAN_MARKER = 'Sentinel 2.6 Full Scan Center';

  const fullScan = {
    running: false,
    cancelRequested: false,
    storageJob: '',
    stages: [],
    startedAt: 0,
    completedAt: 0,
    outcome: 'IDLE',
  };

  async function structured(mode, params = {}) {
    const q = new URLSearchParams({mode, ...params});
    return api('/api/system/query/structured?' + q.toString(), {method: 'POST'});
  }

  function ageText(value) {
    if (!value) return 'not captured';
    const raw = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
    if (!Number.isFinite(raw)) return String(value);
    const delta = Math.max(0, Date.now() - raw);
    const mins = Math.floor(delta / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
  }

  function freshness(value) {
    if (!value) return {label: 'missing', cls: 'warn'};
    const raw = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
    if (!Number.isFinite(raw)) return {label: 'retained', cls: 'focus'};
    const hours = (Date.now() - raw) / 3600000;
    if (hours <= 1) return {label: 'fresh', cls: 'good'};
    if (hours <= 24) return {label: 'recent', cls: 'focus'};
    return {label: 'older', cls: 'warn'};
  }

  function latestTime(rows, keys) {
    let best = 0;
    for (const row of rows || []) {
      for (const key of keys) {
        const value = row?.[key];
        if (!value) continue;
        const raw = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
        if (Number.isFinite(raw) && raw > best) best = raw;
      }
    }
    return best || 0;
  }

  async function readBaselineState(includeAnalysis = true) {
    // Startup reads only retained-history metadata. Quick Check, timeline, and
    // incident history are deferred unless a caller explicitly needs the richer
    // post-scan analysis state.
    const [system, network, storage, coverage] = await Promise.all([
      structured('system-snapshots').catch(() => ({snapshots: []})),
      api('/api/network/history').catch(() => ({snapshots: []})),
      structured('storage-history').catch(() => ({snapshots: []})),
      api('/api/coverage').catch(() => ({items: []})),
    ]);
    let quick = {}, timeline = {groups: []}, cases = {incidents: []};
    if (includeAnalysis) {
      [quick, timeline, cases] = await Promise.all([
        api('/api/quick-check').catch(() => ({})),
        api('/api/intelligence/timeline/grouped').catch(() => ({groups: []})),
        api('/api/incidents/v2?history=1').catch(() => ({incidents: []})),
      ]);
    }
    const systemRows = system.snapshots || [];
    const networkRows = network.snapshots || [];
    const storageRows = storage.snapshots || [];
    const systemAt = latestTime(systemRows, ['captured_at', 'created_at']);
    const networkAt = latestTime(networkRows, ['captured_at', 'created_at']);
    const storageAt = latestTime(storageRows, ['captured_at', 'created_at']);
    const retained = [systemRows.length > 0, networkRows.length > 0, storageRows.length > 0];
    if (includeAnalysis) retained.push(Boolean(quick.behavior_baseline), Boolean(quick.persistence_baseline));
    return {
      system, network, storage, quick, timeline, cases, coverage,
      systemAt, networkAt, storageAt,
      analysisLoaded: includeAnalysis,
      readyCount: retained.filter(Boolean).length,
      readyTotal: retained.length,
    };
  }

  const CAPABILITY_GROUPS = [
    {
      id: 'orient', label: 'ORIENT', question: 'What matters now?',
      items: [
        ['Status', 'status', 'Live instruments · readiness'],
        ['Easy Scan', 'snapshot', 'Fast read-only review queue'],
        ['Full Scan', 'status', 'Comprehensive retained baseline'],
        ['Evidence Completeness', 'visibility', 'Coverage before inference'],
        ['Product Onboarding', 'guide', 'Guided investigation model'],
      ],
    },
    {
      id: 'investigate', label: 'INVESTIGATE', question: 'Why is this happening?',
      items: [
        ['Case Stories 3.0', 'cases', 'Story / episode / evidence'],
        ['Search + Saved Queries', 'search', 'Known evidence + bounded deep search'],
        ['Graph 3.0', 'relations', 'Filters · matrix · topology'],
        ['Timeline 3.0', 'relations', 'Range · density · heatmap'],
        ['Security Audit', 'audit', 'Explainable review priority'],
        ['Object Story 3.0', 'object', 'Exact identity + relations'],
        ['Explain This', 'object', 'Observed / derived / unknown'],
        ['Smart Next Step', 'cases', 'Evidence-guided continuation'],
      ],
    },
    {
      id: 'compare', label: 'COMPARE', question: 'What changed?',
      items: [
        ['Change Evidence Flow', 'changes', 'Bounded events · continuity'],
        ['System Checkpoint 2.0', 'changes', 'Retained before / after state'],
        ['Behavior History', 'behavior', 'Adjacent observation differences'],
        ['Reference Profiles 2.0', 'reference', 'Approved state + drift history'],
        ['Compare Any Two Objects', 'object', 'Cross-lens A / B evidence'],
        ['Historical Heatmaps', 'relations', 'Retained time concentration'],
      ],
    },
    {
      id: 'system', label: 'SYSTEM', question: 'What exists on this Mac?',
      items: [
        ['Machine', 'machine', 'Hardware · OS · runtime'],
        ['Processes + Story 2.0', 'processes', 'Live process identity'],
        ['Auto-start', 'startup', 'Launch declaration → target → PID'],
        ['Launch & Persistence Drift', 'persistence', 'Configuration evolution'],
        ['Background', 'background', 'Background registrations'],
        ['Network Intelligence 2.0', 'network', 'Current + retained relationships'],
        ['Storage Intelligence 2.0', 'storage', 'Traverse · measure · hash · history'],
        ['Storage Forecast', 'storage', 'Explicit retained trend estimate'],
      ],
    },
    {
      id: 'act', label: 'ACT', question: 'What reversible action is justified?',
      items: [
        ['Reclaim Review', 'reclaim', 'Review candidates only'],
        ['Safe Change', 'change', 'Preview → confirm → execute'],
        ['Safe Change Simulation', 'change', 'Server preview without execution'],
        ['Recovery Center 2.0', 'change', 'Vault · journal · recovery readiness'],
        ['Evidence Bundle', 'cases', 'Portable local investigation evidence'],
      ],
    },
    {
      id: 'limits', label: 'LIMITS', question: 'What can Sentinel establish?',
      items: [
        ['Permission & Visibility Assistant', 'visibility', 'Available / limited / unavailable'],
        ['Local Evidence Assistant', 'guide', 'Deterministic local analysis'],
        ['Natural-language Command Bar', 'search', 'Route questions to evidence'],
        ['Watch Rules', 'changes', 'Session-bounded evidence checks'],
        ['Unified Investigation Workspace', 'cases', 'Notes · hypotheses · bookmarks'],
        ['Workspace Persistence', 'cases', 'Retained investigation metadata'],
        ['Cross-Lens Selection', 'relations', 'One selected object across views'],
        ['Keyboard Workflow', 'guide', '⌘K + evidence navigation'],
      ],
    },
  ];

  function baselineStrip(model) {
    const sources = [
      ['System checkpoint', model.systemAt, (model.system.snapshots || []).length],
      ['Network history', model.networkAt, (model.network.snapshots || []).length],
      ['Storage history', model.storageAt, (model.storage.snapshots || []).length],
    ];
    return `<div class="scan-baseline-strip">${sources.map(([label, at, count]) => {
      const f = freshness(at);
      return `<div><span>${esc(label)}</span><b>${esc(ageText(at))}</b><small>${badge(`${count} retained`, f.cls)} ${badge(f.label, f.cls)}</small></div>`;
    }).join('')}</div>`;
  }

  function scanCenterHTML(model) {
    const coverageCount = (model.coverage.items || []).length;
    const timelineCount = Number(model.timeline.group_count ?? (model.timeline.groups || []).length);
    const caseCount = Number(model.cases.count ?? (model.cases.incidents || []).length);
    const baselineReady = model.readyCount >= Math.max(2, model.readyTotal - 1);
    const currentEvidence = model.analysisLoaded
      ? `${caseCount} case(s) · ${timelineCount} timeline group(s)`
      : 'Lightweight startup · open Easy Scan for the current review queue';
    return `<div class="scan-center-grid">
      <article class="scan-card easy">
        <div class="scan-card-head"><span>01</span>${badge('FAST', 'focus')}</div>
        <h3>Easy Scan</h3>
        <p>Fast, read-only current-state review. It does not rewrite Behavior, Trust, Persistence, or user files.</p>
        <div class="scan-metrics"><span>Current evidence</span><b>${esc(currentEvidence)}</b></div>
        <button type="button" class="s24-action primary" data-scan-center="easy">Run Easy Scan</button>
      </article>
      <article class="scan-card full ${baselineReady ? 'ready' : ''}">
        <div class="scan-card-head"><span>02</span>${badge(baselineReady ? 'BASELINE READY' : 'COMPREHENSIVE', baselineReady ? 'good' : 'warn')}</div>
        <h3>Full Scan</h3>
        <p>Build the broad retained evidence baseline: system, security, behavior, graph, cases, network, checkpoints, home-storage traversal, history, and recovery state.</p>
        <div class="scan-metrics"><span>Retained coverage</span><b>${model.readyCount}/${model.readyTotal} startup baseline families · ${coverageCount} visibility source(s)</b></div>
        <div class="scan-card-actions"><button type="button" class="s24-action primary" data-scan-center="full" ${fullScan.running ? 'disabled' : ''}>${fullScan.running ? 'Full Scan running…' : 'Run Full Scan'}</button>${fullScan.running ? '<button type="button" class="s24-action" data-scan-center="cancel">Cancel</button>' : ''}</div>
      </article>
    </div>
    ${baselineStrip(model)}
    <div class="s24-note scan-retained-note">Full Scan never starts automatically. After an explicit Full Scan, Sentinel reuses retained System / Network / Storage / Behavior / Case evidence for later analysis. Re-run only when you want newer evidence, the system materially changes, or continuity reports that a rescan is required.</div>
    <div id="fullScanProgress">${fullScan.running ? renderFullScanProgress() : ''}</div>`;
  }

  function capabilityAtlasHTML() {
    return `<div class="capability-atlas">${CAPABILITY_GROUPS.map(group => `<section class="capability-group ${group.id}"><header><span>${esc(group.label)}</span><p>${esc(group.question)}</p></header><div>${group.items.map(([name, lens, detail]) => `<button type="button" class="capability-tile" data-scan-lens="${esc(lens)}"><b>${esc(name)}</b><small>${esc(detail)}</small><i>OPEN ${esc(String(lens).toUpperCase())}</i></button>`).join('')}</div></section>`).join('')}</div><div class="capability-crosscut"><button type="button" data-scan-center="workbench"><b>Investigation Workbench</b><small>30 integrated upgrades · selection · queries · watches · evolution · recovery · assistant</small></button><button type="button" data-scan-lens="visibility"><b>Evidence boundary first</b><small>Missing permission lowers confidence; it never proves absence.</small></button></div>`;
  }

  function renderFullScanProgress() {
    if (!fullScan.stages.length) return '';
    const terminal = fullScan.stages.filter(s => ['done', 'limited', 'failed', 'cancelled'].includes(s.status)).length;
    return `<div class="full-scan-progress"><div class="full-scan-summary"><div><span>FULL SCAN · ${esc(fullScan.outcome)}</span><b>${fullScan.running ? 'Building retained evidence baseline' : 'Scan finished'}</b><small>${terminal}/${fullScan.stages.length} stage(s) reached a terminal state</small></div><progress max="${fullScan.stages.length}" value="${terminal}"></progress></div><div class="full-scan-stages">${fullScan.stages.map((s, i) => `<div class="full-scan-stage ${esc(s.status)}"><span>${String(i + 1).padStart(2, '0')}</span><div><b>${esc(s.label)}</b><small>${esc(s.detail || stageStatusText(s.status))}</small></div>${badge(s.status.toUpperCase(), s.status === 'done' ? 'good' : s.status === 'limited' ? 'warn' : s.status === 'failed' ? 'bad' : s.status === 'running' ? 'focus' : '')}</div>`).join('')}</div></div>`;
  }

  function stageStatusText(status) {
    return ({pending: 'Waiting', running: 'Collecting local evidence…', done: 'Captured', limited: 'Completed with an unavailable / bounded source', failed: 'Sentinel could not complete this stage', cancelled: 'Cancelled'})[status] || status;
  }

  function classifyStageError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '');
    if ([403, 408, 429, 501, 503].includes(status)) return 'limited';
    if (/permission|unavailable|unsupported|not available|timed out|bounded|visibility/i.test(message)) return 'limited';
    return 'failed';
  }

  function refreshProgress() {
    const node = $('#fullScanProgress');
    if (node) node.innerHTML = renderFullScanProgress();
    const terminal = fullScan.stages.filter(s => ['done', 'limited', 'failed', 'cancelled'].includes(s.status)).length;
    const pct = Math.round(terminal / Math.max(1, fullScan.stages.length) * 100);
    const active = fullScan.stages.find(s => s.status === 'running');
    activity(fullScan.running ? 'Full Scan' : fullScan.outcome === 'FAILED' ? 'Error' : 'Ready', pct, active ? active.label : `${terminal}/${fullScan.stages.length} Full Scan stages`);
  }

  async function pollStorageJob(id) {
    while (!fullScan.cancelRequested) {
      const j = await api('/api/storage/jobs?id=' + encodeURIComponent(id));
      const stage = fullScan.stages.find(s => s.id === 'storage');
      if (stage) {
        const phase = String(j.phase || 'scan').replaceAll('_', ' ');
        stage.detail = `${phase} · ${Number(j.files_visited || 0).toLocaleString()} files · ${Number(j.dirs_visited || 0).toLocaleString()} folders`;
        if (j.hash_files_total) stage.detail += ` · hashes ${Number(j.hash_files_done || 0)}/${Number(j.hash_files_total || 0)}`;
        if (j.slow_paths_skipped) stage.detail += ` · ${Number(j.slow_paths_skipped).toLocaleString()} slow path(s) skipped`;
        refreshProgress();
      }
      if (j.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 650));
        continue;
      }
      if (j.status === 'failed') throw new Error(j.error || 'Storage traversal failed');
      if (j.status === 'cancelled') throw new Error('Storage traversal cancelled');
      return j.result || null;
    }
    throw new Error('Full Scan cancelled');
  }

  function scanStages() {
    return [
      {id: 'visibility', label: 'Visibility & capability map', run: async () => Promise.all([api('/api/visibility'), api('/api/coverage'), api('/api/capabilities')])},
      {id: 'system', label: 'Current system, process, launch & network state', run: async () => Promise.all([api('/api/overview'), api('/api/system-profile'), api('/api/processes'), api('/api/startup'), api('/api/background'), api('/api/network'), api('/api/launch-services')])},
      {id: 'security', label: 'Security posture & explainable audit', run: async () => Promise.all([api('/api/security/audit'), api('/api/quick-check')])},
      {id: 'behavior', label: 'Monitoring / Behavior / Persistence baseline', run: async () => api('/api/guided-snapshot', {method: 'POST'})},
      {id: 'graph', label: 'Evidence Graph & Timeline capture', run: async () => { await api('/api/intelligence/graph', {method: 'POST'}); return Promise.all([api('/api/intelligence/graph/v2'), api('/api/intelligence/timeline/grouped')]); }},
      {id: 'cases', label: 'Case correlation & story history', run: async () => { await api('/api/incidents', {method: 'POST'}); return api('/api/incidents/v2?history=1'); }},
      {id: 'checkpoint', label: 'System Checkpoint 2.0', run: async () => structured('system-snapshot-capture')},
      {id: 'network-history', label: 'Network Intelligence history snapshot', run: async () => api('/api/network/history', {method: 'POST'})},
      {id: 'storage', label: 'Deep home-storage traversal & hash analysis', run: async () => {
        const job = await api('/api/storage/jobs', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({scope: 'home', min_mb: 20, limit: 1000}),
        });
        fullScan.storageJob = job.id;
        return pollStorageJob(job.id);
      }},
      {id: 'storage-history', label: 'Storage History retained snapshot', run: async () => structured('storage-snapshot-capture')},
      {id: 'recovery', label: 'Recovery, Safe Action health & readiness', run: async () => Promise.all([api('/api/readiness'), api('/api/actions/health'), structured('recovery')])},
      {id: 'analysis', label: 'Final review queue & retained analysis refresh', run: async () => Promise.all([api('/api/review-queue'), api('/api/behavior/history'), api('/api/trust/status'), api('/api/persistence'), api('/api/intelligence/timeline/grouped')])},
    ];
  }

  async function startFullScan() {
    if (fullScan.running) return;
    fullScan.running = true;
    fullScan.cancelRequested = false;
    fullScan.storageJob = '';
    fullScan.startedAt = Date.now();
    fullScan.completedAt = 0;
    fullScan.outcome = 'RUNNING';
    fullScan.stages = scanStages().map(stage => ({...stage, status: 'pending', detail: ''}));
    const host = $('#fullScanProgress');
    if (host) host.innerHTML = renderFullScanProgress();
    notice('Full Scan started by explicit user action. It creates local comparison/history state but does not modify user files.');

    for (const stage of fullScan.stages) {
      if (fullScan.cancelRequested) {
        stage.status = 'cancelled';
        break;
      }
      stage.status = 'running';
      stage.detail = 'Collecting bounded local evidence…';
      refreshProgress();
      // Yield one turn so WebKit can paint the stage before the next request.
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        await stage.run();
        stage.status = 'done';
        stage.detail = 'Captured successfully';
      } catch (error) {
        if (fullScan.cancelRequested) {
          stage.status = 'cancelled';
          stage.detail = 'Cancelled by user';
          break;
        }
        stage.status = classifyStageError(error);
        stage.detail = error?.message || (stage.status === 'limited' ? 'Source unavailable or bounded' : 'Stage failed');
      }
      refreshProgress();
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    fullScan.running = false;
    fullScan.completedAt = Date.now();
    fullScan.storageJob = '';
    refreshProgress();
    if (fullScan.cancelRequested) {
      for (const stage of fullScan.stages) if (stage.status === 'pending') stage.status = 'cancelled';
      fullScan.outcome = 'CANCELLED';
      refreshProgress();
      notice('Full Scan cancelled. Evidence already captured by completed stages remains retained; no fabricated completion state was created.');
      return;
    }
    const failed = fullScan.stages.filter(stage => stage.status === 'failed').length;
    const limited = fullScan.stages.filter(stage => stage.status === 'limited').length;
    if (failed > 0) {
      fullScan.outcome = 'FAILED';
      refreshProgress();
      notice(`Full Scan incomplete: ${failed} stage(s) failed. Completed evidence remains available, but Sentinel will not label this run a complete retained baseline.`);
      return;
    }
    fullScan.outcome = limited > 0 ? 'LIMITED' : 'DONE';
    refreshProgress();
    notice(limited ? `Full Scan completed in LIMITED state with ${limited} bounded/unavailable stage(s). Retained evidence is usable with those limitations.` : 'Full Scan DONE. Retained evidence baseline is ready for analysis.');
    setTimeout(() => S.navigate('status', {push: false}), 250);
  }

  async function cancelFullScan() {
    if (!fullScan.running) return;
    fullScan.cancelRequested = true;
    if (fullScan.storageJob) {
      try { await api('/api/storage/cancel?id=' + encodeURIComponent(fullScan.storageJob), {method: 'POST'}); } catch {}
    }
    notice('Cancelling Full Scan after the current bounded request. Completed evidence remains retained.');
  }

  async function injectScanCenter() {
    const stage = $('#evidenceStage');
    if (!stage) return;
    const quick = stage.querySelector('[data-do="quickcheck"]');
    if (quick) {
      quick.textContent = 'Easy Scan';
      quick.title = 'Fast read-only current-state review';
    }
    const model = await readBaselineState(false);
    if ($('#scanCenterBand') || S.state?.lens !== 'status') return;
    const question = stage.querySelector('.s24-question');
    const scanBand = document.createElement('section');
    scanBand.id = 'scanCenterBand';
    scanBand.className = 's24-band scan-center-band';
    scanBand.innerHTML = `<div class="s24-band-index">SCAN</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Scan Center</h2><p>Choose the smallest useful observation, or explicitly build a comprehensive retained baseline.</p></div></div>${scanCenterHTML(model)}</div>`;
    if (question?.nextSibling) stage.insertBefore(scanBand, question.nextSibling); else stage.prepend(scanBand);

    const mapBand = document.createElement('section');
    mapBand.id = 'capabilityAtlasBand';
    mapBand.className = 's24-band capability-atlas-band';
    mapBand.innerHTML = `<div class="s24-band-index">MAP</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>Complete Capability Atlas</h2><p>Every primary Sentinel function and major upgrade, arranged by investigation intent. Open any tile directly.</p></div></div>${capabilityAtlasHTML()}</div>`;
    stage.append(mapBand);
  }

  const baseStatusRenderer = S.renderers.status;
  if (typeof baseStatusRenderer === 'function') {
    registerLens('status', async () => {
      await baseStatusRenderer();
      // Never block first paint on Scan Center metadata, and never start Full Scan here.
      setTimeout(() => { injectScanCenter().catch(() => {}); }, 0);
    });
  }

  document.addEventListener('click', async event => {
    const lens = event.target.closest('[data-scan-lens]');
    if (lens) {
      await S.navigate(lens.dataset.scanLens);
      return;
    }
    const control = event.target.closest('[data-scan-center]');
    if (!control) return;
    try {
      const action = control.dataset.scanCenter;
      if (action === 'easy') return S.navigate('snapshot');
      if (action === 'full') return startFullScan();
      if (action === 'cancel') return cancelFullScan();
      if (action === 'workbench') {
        const button = $('#workbenchButton');
        if (button) button.click();
        else notice('Investigation Workbench is unavailable in this product build.');
      }
    } catch (error) {
      notice(error?.message || String(error));
      activity('Error', 0, error?.message || String(error));
    }
  });

  S.scanCenter = {
    marker: SCAN_MARKER,
    startFullScan,
    cancelFullScan,
    readBaselineState,
    capabilityGroups: CAPABILITY_GROUPS,
    state: fullScan,
  };
})();