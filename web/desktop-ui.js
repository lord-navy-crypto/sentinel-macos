// SPDX-License-Identifier: MPL-2.0
(() => {
  // Desktop mode is presentation/diagnostics only. app.js remains authoritative
  // for navigation, validation, actions, and API calls.
  if (window.__sentinelDesktopUIInstalled) return;
  window.__sentinelDesktopUIInstalled = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  // Keep the legacy mode nodes because app.js still references them; hide them
  // through the external desktop stylesheet instead of deleting DOM nodes.
  document.body.classList.remove('easy-mode');
  const group = document.querySelector('.nav-group-label.advanced-nav');
  if (group) group.textContent = 'More tools';

  const endpointRules = [
    ['/api/system-profile', 'hardware', 'Reading System Profile'],
    ['/api/quick-check', 'quickcheck', 'Running Quick Check'],
    ['/api/review-queue', 'quickcheck', 'Building Review Queue'],
    ['/api/guided-snapshot', 'quickcheck', 'Capturing Monitoring Snapshot'],
    ['/api/readiness', 'overview', 'Checking Sentinel Readiness'],
    ['/api/search/deep', 'weakness', 'Deep Filename Search'],
    ['/api/weakness-audit', 'weakness', 'Running Weakness Audit'],
    ['/api/coverage', 'weakness', 'Checking Visibility Coverage'],
    ['/api/advanced-sensor/status', 'weakness', 'Checking Advanced Sensor'],
    ['/api/search', 'weakness', 'Searching Current Evidence'],
    ['/api/changes', 'changes', 'Working on Change Monitor'],
    ['/api/incidents', 'incidents', 'Building Incident Evidence'],
    ['/api/storage', 'storage', 'Storage Scan'],
    ['/api/security/audit', 'security', 'Running Security Audit'],
    ['/api/self/integrity', 'overview', 'Inspecting Sentinel Integrity'],
    ['/api/integrity', 'integrity', 'Inspecting File Integrity'],
    ['/api/intelligence', 'intelligence', 'Building Intelligence Evidence'],
    ['/api/object/story', 'intelligence', 'Building Object Story'],
    ['/api/behavior', 'behavior', 'Checking Behavior Session'],
    ['/api/trust', 'trust', 'Checking Trust Profile'],
    ['/api/process/detail', 'processes', 'Inspecting Process'],
    ['/api/processes', 'processes', 'Loading Processes'],
    ['/api/startup', 'startup', 'Loading Startup Items'],
    ['/api/persistence', 'persistence', 'Checking Session Persistence'],
    ['/api/background', 'background', 'Loading Background Items'],
    ['/api/network', 'network', 'Loading Network Activity'],
    ['/api/cleanup/preview', 'cleanup', 'Analyzing Cleanup Candidates'],
    ['/api/actions', 'actions', 'Working on Safe Actions'],
    ['/api/report/export', 'overview', 'Building Local Report'],
    ['/api/diagnostics/export', 'overview', 'Building Diagnostics'],
    ['/api/capabilities', 'overview', 'Checking Evidence Sources'],
    ['/api/overview', 'overview', 'Refreshing Mac Health']
  ];

  const panelStates = new WeakMap();
  const lastPanelByView = new Map();
  let panelCounter = 0;

  const formatBytes = value => {
    let n = Math.max(0, Number(value) || 0);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    const digits = i === 0 || n >= 10 ? 1 : 2;
    return `${n.toFixed(digits)} ${units[i]}`;
  };

  const stateFor = panel => {
    let state = panelStates.get(panel);
    if (!state) {
      state = {active: 0, percent: 0, timer: null, storageRunning: false};
      panelStates.set(panel, state);
    }
    return state;
  };

  const makePanel = (viewId, card) => {
    const panel = document.createElement('div');
    panel.className = 'sentinel-task-progress';
    panel.dataset.state = 'idle';
    panel.dataset.view = viewId;
    panel.dataset.progressId = String(++panelCounter);
    panel.innerHTML = `
      <div class="sentinel-progress-head">
        <b>Ready</b>
        <strong>0%</strong>
      </div>
      <progress class="sentinel-percent-bar" max="100" value="0"></progress>
      <small class="sentinel-progress-detail">Progress appears only after a real localhost request starts.</small>`;
    card.appendChild(panel);
    return panel;
  };

  const panelForView = (viewId, preferredCard = null) => {
    const view = document.getElementById(viewId) || document.querySelector('.view.active');
    if (!view) return null;
    const previous = lastPanelByView.get(viewId);
    const card = preferredCard && view.contains(preferredCard)
      ? preferredCard
      : (previous?.closest('.card') || view.querySelector('.card') || view);
    let panel = [...card.querySelectorAll('.sentinel-task-progress')]
      .find(candidate => candidate.dataset.view === viewId) || null;
    if (!panel) panel = makePanel(viewId, card);
    lastPanelByView.set(viewId, panel);
    return panel;
  };

  const setPanel = (panel, percent, label, detail, stateName = 'running') => {
    if (!panel) return;
    const state = stateFor(panel);
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    state.percent = value;
    panel.dataset.state = stateName;
    panel.querySelector('.sentinel-progress-head b').textContent = label;
    panel.querySelector('.sentinel-progress-head strong').textContent = `${value}%`;
    panel.querySelector('.sentinel-percent-bar').value = value;
    panel.querySelector('.sentinel-progress-detail').textContent = detail || '';
  };

  const stopTimer = panel => {
    const state = stateFor(panel);
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  };

  const startEstimateTimer = panel => {
    const state = stateFor(panel);
    if (state.timer) return;
    state.timer = setInterval(() => {
      if (state.active <= 0 || state.storageRunning) return;
      const step = state.percent < 35 ? 4 : state.percent < 65 ? 2 : 1;
      const next = Math.min(92, Math.max(10, state.percent + step));
      setPanel(
        panel,
        next,
        panel.querySelector('.sentinel-progress-head b').textContent,
        'Estimated progress while waiting for the localhost engine. 100% is shown only after the request returns.',
        'running'
      );
    }, 420);
  };

  const requestInfo = input => {
    let raw = '';
    let method = 'GET';
    try {
      if (typeof input === 'string') raw = input;
      else if (input) {
        raw = input.url || '';
        method = input.method || method;
      }
      const url = new URL(raw, location.origin);
      const match = endpointRules.find(([prefix]) => url.pathname.startsWith(prefix));
      return {
        path: url.pathname,
        method: String(method || 'GET').toUpperCase(),
        view: match?.[1] || document.querySelector('.view.active')?.id || 'overview',
        label: match?.[2] || 'Working locally'
      };
    } catch {
      return {path: raw, method, view: document.querySelector('.view.active')?.id || 'overview', label: 'Working locally'};
    }
  };

  const beginRequest = info => {
    const panel = panelForView(info.view);
    if (!panel) return null;
    const state = stateFor(panel);
    state.active += 1;
    if (!state.storageRunning) {
      const start = state.percent <= 0 || state.percent >= 100 ? 10 : Math.max(10, Math.min(90, state.percent));
      setPanel(panel, start, info.label, `${info.method} ${info.path} · localhost request started.`, 'running');
      startEstimateTimer(panel);
    }
    return panel;
  };

  const finishRequest = (panel, info, ok, detail = '', deferCompletion = false) => {
    if (!panel) return;
    const state = stateFor(panel);
    state.active = Math.max(0, state.active - 1);
    if (state.active > 0) return;
    stopTimer(panel);
    if (deferCompletion && ok) return;
    state.storageRunning = false;
    setPanel(
      panel,
      100,
      ok ? `${info.label} complete` : `${info.label} failed`,
      detail || (ok ? 'The local engine returned successfully.' : 'The local engine returned an error.'),
      ok ? 'complete' : 'error'
    );
  };

  const storagePhaseLabel = phase => ({
    walking: 'Scanning files',
    grouping: 'Preparing duplicate candidates',
    hashing: 'Hashing duplicate candidates',
    finalizing: 'Building storage report',
    complete: 'Storage scan complete',
    cancelled: 'Storage scan cancelled',
    failed: 'Storage scan failed'
  }[phase] || 'Scanning storage');

  const updateCoreStoragePanel = (job, label, detail) => {
    const scanState = document.getElementById('scanState');
    const scanCounts = document.getElementById('scanCounts');
    const scanPath = document.getElementById('scanPath');
    if (scanState) scanState.textContent = label;
    if (scanCounts) scanCounts.textContent = detail;
    if (scanPath) scanPath.textContent = job.current_hash_path || job.current_path || '';
  };

  const handleStorageJob = job => {
    if (!job || typeof job !== 'object') return;
    const panel = panelForView('storage');
    if (!panel) return;
    const state = stateFor(panel);
    const files = Number(job.files_visited || 0);
    const dirs = Number(job.dirs_visited || 0);
    const limits = Number(job.permission_errors || 0);
    const phase = String(job.phase || (job.status === 'running' ? 'walking' : job.status || 'walking'));
    const percent = Number.isFinite(Number(job.phase_percent)) && Number(job.phase_percent) > 0
      ? Number(job.phase_percent)
      : (job.status === 'complete' ? 100 : Math.min(72, Math.max(4, Math.round((files + dirs) / 1000) + 10)));
    const label = storagePhaseLabel(phase);

    if (job.status === 'running') {
      state.storageRunning = true;
      stopTimer(panel);
      let detail = `${files.toLocaleString()} files · ${dirs.toLocaleString()} folders · ${limits.toLocaleString()} permission limits`;
      if (phase === 'walking') {
        detail += ' · directory percentage is estimated because the scope is not pre-counted.';
      } else if (phase === 'grouping') {
        detail += ' · directory traversal is complete; Sentinel is selecting same-size candidates that can actually be compared.';
      } else if (phase === 'hashing') {
        const done = Number(job.hash_files_done || 0);
        const total = Number(job.hash_files_total || 0);
        const bytesDone = Number(job.hash_bytes_done || 0);
        const bytesTotal = Number(job.hash_bytes_total || 0);
        detail += total > 0
          ? ` · hash file ${Math.min(done + 1, total)}/${total} · ${formatBytes(bytesDone)} of ${formatBytes(bytesTotal)} planned SHA-256 work`
          : ' · no duplicate group fits the bounded comparison plan; hash work will be skipped.';
        if (job.current_hash_path) detail += ` · ${job.current_hash_path}`;
      } else if (phase === 'finalizing') {
        detail += ` · ${formatBytes(job.hash_bytes_done || 0)} duplicate-candidate data hashed; assembling results.`;
      }
      setPanel(panel, percent, label, detail, 'running');
      updateCoreStoragePanel(job, label, detail);
      return;
    }

    state.storageRunning = false;
    if (job.status === 'complete') {
      const detail = `${files.toLocaleString()} files · ${dirs.toLocaleString()} folders scanned · ${formatBytes(job.hash_bytes_done || job.result?.duplicate_hash_bytes || 0)} duplicate-candidate data hashed.`;
      setPanel(panel, 100, label, detail, 'complete');
      updateCoreStoragePanel(job, label, detail);
    } else if (job.status === 'cancelled') {
      const detail = `Stopped safely after ${files.toLocaleString()} files and ${dirs.toLocaleString()} folders. Cancellation also applies during SHA-256 verification.`;
      setPanel(panel, Math.min(99, Math.max(0, percent)), label, detail, 'idle');
      updateCoreStoragePanel(job, label, detail);
    } else if (job.status === 'failed') {
      const detail = job.error || 'The storage job reported a failure.';
      setPanel(panel, 100, label, detail, 'error');
      updateCoreStoragePanel(job, label, detail);
    }
  };

  const completionDetail = (info, payload, response) => {
    if (!response.ok) return payload?.error ? `HTTP ${response.status} · ${payload.error}` : `HTTP ${response.status}`;
    const p = payload || {};
    switch (info.path) {
      case '/api/search/deep':
        return `Deep search complete · ${Number(p.visited || 0).toLocaleString()} entries visited · ${p.results?.length || 0} result(s) · ${Number(p.elapsed_ms || 0).toLocaleString()} ms${p.truncated ? ' · safety limit reached' : ''}`;
      case '/api/system-profile':
        return `${p.model_name || 'Mac'} · ${p.chip || p.processor || p.architecture || 'hardware read'} · ${p.os_version || 'macOS'}`;
      case '/api/quick-check':
        return `Attention Index ${Number(p.attention_index || 0)} · ${p.band || 'complete'} · ${p.recommendations?.length || 0} recommendation(s)`;
      case '/api/guided-snapshot':
        return `Monitoring Snapshot captured · ${Number(p.graph_nodes || 0)} graph nodes · Behavior ${Number(p.behavior?.risk_index || 0)}${p.trust_ran ? ` · Trust ${Number(p.trust?.drift_index || 0)}` : ' · no Trust comparison'}`;
      case '/api/security/audit':
        return `Security audit ${p.level || 'complete'} · score ${Number(p.score || 0)} · ${p.findings?.length || 0} finding(s)`;
      case '/api/intelligence/graph':
        return `Evidence graph ${p.nodes?.length || 0} nodes · ${p.edges?.length || 0} relationships`;
      case '/api/intelligence/timeline':
        return `${p.events?.length || 0} session observation(s) loaded`;
      case '/api/behavior':
        return info.method === 'POST'
          ? (p.first_baseline ? 'Behavior baseline established.' : `Behavior comparison complete · index ${Number(p.risk_index || 0)} · ${p.changes?.length || 0} change(s)`)
          : (p.has_baseline ? 'Behavior baseline available.' : 'No Behavior baseline yet.');
      case '/api/trust/capture':
        return `Trusted Profile captured · ${p.objects?.length || 0} bounded object(s)`;
      case '/api/trust/compare':
        return p.profile_at ? `Trust comparison complete · drift ${Number(p.drift_index || 0)} · ${p.changes?.length || 0} change(s)` : (p.note || 'No Trusted Profile exists yet.');
      case '/api/persistence':
        return info.method === 'POST'
          ? `${p.initialized ? 'Persistence session baseline ready' : 'Persistence not initialized'} · ${Number(p.files || 0)} plist file(s) · ${p.changes?.length || 0} change(s)`
          : `${p.initialized ? 'Persistence baseline available' : 'No persistence baseline yet'} · ${Number(p.files || 0)} plist file(s)`;
      case '/api/processes':
        return `${p.processes?.length || 0} process(es) loaded`;
      case '/api/startup':
        return `${p.items?.length || 0} startup item(s) loaded`;
      case '/api/network':
        return `${p.items?.length || 0} TCP activity item(s) loaded`;
      default:
        return `HTTP ${response.status} returned successfully from the local Sentinel engine.`;
    }
  };

  const inspectJSON = new Set([
    '/api/system-profile', '/api/quick-check', '/api/guided-snapshot', '/api/search/deep', '/api/security/audit',
    '/api/intelligence/graph', '/api/intelligence/timeline', '/api/behavior', '/api/trust/capture', '/api/trust/compare',
    '/api/persistence', '/api/processes', '/api/startup', '/api/network'
  ]);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const info = requestInfo(args[0]);
    if (args[1]?.method) info.method = String(args[1].method).toUpperCase();
    const panel = beginRequest(info);
    const isStorageJob = info.path === '/api/storage/jobs';
    try {
      const response = await originalFetch(...args);
      let payload = null;
      const isJSON = response.headers.get('content-type')?.includes('application/json');
      if (isJSON && (isStorageJob || inspectJSON.has(info.path) || !response.ok)) {
        payload = await response.clone().json().catch(() => null);
      }
      if (isStorageJob && response.ok && payload) handleStorageJob(payload);
      const detail = completionDetail(info, payload, response);
      finishRequest(panel, info, response.ok, detail, isStorageJob && response.ok && payload?.status === 'running');
      return response;
    } catch (error) {
      finishRequest(panel, info, false, `Local request failed: ${error?.message || 'unknown network error'}`);
      throw error;
    }
  };

  const reportInterfaceError = detail => {
    const message = `Interface error: ${detail || 'unknown error'}`;
    console.error(message);
    const viewId = document.querySelector('.view.active')?.id || 'overview';
    const panel = panelForView(viewId);
    if (panel) {
      stopTimer(panel);
      setPanel(panel, 100, 'Interface error', message, 'error');
    }
    const notice = document.getElementById('notice');
    if (notice) {
      notice.textContent = message;
      notice.classList.remove('hidden');
    }
  };

  css.onerror = () => reportInterfaceError('desktop layout stylesheet could not be loaded');
  window.addEventListener('error', event => reportInterfaceError(event.message || event.error?.message));
  window.addEventListener('unhandledrejection', event => reportInterfaceError(event.reason?.message || String(event.reason || 'unhandled promise rejection')));
})();
