// SPDX-License-Identifier: MPL-2.0
(() => {
  // Desktop mode is a presentation/diagnostic layer only. app.js remains the
  // authority for every Sentinel action and API call.
  if (window.__sentinelDesktopUIInstalled) return;
  window.__sentinelDesktopUIInstalled = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  // Keep compatibility nodes for app.js. Only hide them with external CSS.
  document.body.classList.remove('easy-mode');
  const group = document.querySelector('.nav-group-label.advanced-nav');
  if (group) group.textContent = 'More tools';

  // Remove artifacts from the older top-of-window progress implementation if a
  // browser restores a page from history.
  document.getElementById('sentinelGlobalActivity')?.remove();
  document.getElementById('sentinelGlobalActivityText')?.remove();

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

  function reportInterfaceError(detail) {
    const message = `Interface error: ${detail || 'unknown error'}`;
    console.error(message);
    const viewId = document.querySelector('.view.active')?.id || 'overview';
    const panel = panelForView(viewId);
    if (panel) {
      stopTimer(panel);
      const state = stateFor(panel);
      state.active = 0;
      state.storageRunning = false;
      setPanel(panel, 100, 'Interface error', message, 'error');
    }
    const notice = document.getElementById('notice');
    if (notice) {
      notice.textContent = message;
      notice.classList.remove('hidden');
    }
  }

  css.onerror = () => reportInterfaceError('desktop layout stylesheet could not be loaded');

  const requestInfo = input => {
    let raw = '';
    let method = 'GET';
    try {
      if (typeof input === 'string') raw = input;
      else if (input) {
        raw = input.url || '';
        method = input.method || method;
      }
      const u = new URL(raw, location.origin);
      const match = endpointRules.find(([prefix]) => u.pathname.startsWith(prefix));
      return {
        raw,
        path: u.pathname,
        search: u.search,
        method: String(method || 'GET').toUpperCase(),
        view: match?.[1] || document.querySelector('.view.active')?.id || 'overview',
        label: match?.[2] || 'Working locally'
      };
    } catch {
      return {raw, path: raw, search: '', method, view: document.querySelector('.view.active')?.id || 'overview', label: 'Working locally'};
    }
  };

  const stateFor = panel => {
    let state = panelStates.get(panel);
    if (!state) {
      state = {active: 0, percent: 0, timer: null, requestSerial: 0, storageRunning: false};
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
    let panel = null;
    for (const candidate of card.querySelectorAll('.sentinel-task-progress')) {
      if (candidate.dataset.view === viewId) {
        panel = candidate;
        break;
      }
    }
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
      setPanel(panel, next, panel.querySelector('.sentinel-progress-head b').textContent,
        'Estimated progress while waiting for the local engine to return. 100% is shown only after the request finishes.', 'running');
    }, 420);
  };

  const beginRequest = info => {
    const panel = panelForView(info.view);
    if (!panel) return null;
    const state = stateFor(panel);
    state.requestSerial += 1;
    state.active += 1;
    if (!state.storageRunning) {
      const start = state.percent >= 100 || state.percent <= 0 ? 10 : Math.max(10, Math.min(90, state.percent));
      setPanel(panel, start, info.label,
        `${info.method} ${info.path} · localhost request started. Progress is estimated until the engine returns.`, 'running');
      startEstimateTimer(panel);
    }
    return panel;
  };

  const finishRequest = (panel, info, ok, statusText = '', deferCompletion = false) => {
    if (!panel) return;
    const state = stateFor(panel);
    state.active = Math.max(0, state.active - 1);
    if (state.active > 0) return;
    stopTimer(panel);
    if (deferCompletion && ok) return;
    state.storageRunning = false;
    if (ok) {
      setPanel(panel, 100, `${info.label} complete`, statusText || 'The local engine returned successfully.', 'complete');
    } else {
      setPanel(panel, 100, `${info.label} failed`, statusText || 'The local engine returned an error.', 'error');
    }
  };

  const storageEstimate = entries => {
    // The storage API deliberately does not pre-count the whole tree because a
    // second traversal would double I/O. This is therefore explicitly an
    // estimate based on observed traversal activity, never an exact scope total.
    const n = Math.max(0, Number(entries) || 0);
    return Math.min(94, Math.max(8, Math.round(8 + 86 * (1 - Math.exp(-n / 18000)))));
  };

  const handleStorageJob = job => {
    if (!job || typeof job !== 'object') return;
    const panel = panelForView('storage');
    if (!panel) return;
    const state = stateFor(panel);
    const files = Number(job.files_visited || 0);
    const dirs = Number(job.dirs_visited || 0);
    const entries = files + dirs;
    const limits = Number(job.permission_errors || 0);
    if (job.status === 'running') {
      state.storageRunning = true;
      stopTimer(panel);
      setPanel(panel, storageEstimate(entries), 'Scanning storage',
        `${files.toLocaleString()} files · ${dirs.toLocaleString()} folders · ${limits.toLocaleString()} permission limits · percentage is an estimate because the filesystem is not pre-counted.`, 'running');
      return;
    }
    state.storageRunning = false;
    if (job.status === 'complete') {
      setPanel(panel, 100, 'Storage scan complete',
        `${files.toLocaleString()} files · ${dirs.toLocaleString()} folders scanned.`, 'complete');
    } else if (job.status === 'cancelled') {
      setPanel(panel, 100, 'Storage scan cancelled',
        `Stopped safely after ${files.toLocaleString()} files and ${dirs.toLocaleString()} folders.`, 'idle');
    } else if (job.status === 'failed') {
      setPanel(panel, 100, 'Storage scan failed', job.error || 'The storage job reported a failure.', 'error');
    }
  };

  const inspectPayloadPaths = new Set([
    '/api/system-profile', '/api/quick-check', '/api/review-queue', '/api/guided-snapshot', '/api/readiness',
    '/api/search/deep', '/api/weakness-audit', '/api/coverage', '/api/advanced-sensor/status', '/api/security/audit',
    '/api/intelligence/graph', '/api/intelligence/timeline', '/api/behavior', '/api/behavior/history', '/api/behavior/health',
    '/api/trust/status', '/api/trust/capture', '/api/trust/compare', '/api/trust/health', '/api/trust/history',
    '/api/processes', '/api/startup', '/api/persistence', '/api/background', '/api/network',
    '/api/changes/status', '/api/changes/events', '/api/changes/start', '/api/changes/stop', '/api/changes/history',
    '/api/incidents', '/api/actions/status', '/api/actions/health', '/api/actions/vault', '/api/actions/journal',
    '/api/cleanup/preview', '/api/capabilities'
  ]);

  const completionDetail = (info, payload, response) => {
    if (!response.ok) {
      const err = payload?.error ? ` · ${payload.error}` : '';
      return `HTTP ${response.status}${err}`;
    }
    const p = payload || {};
    switch (info.path) {
      case '/api/system-profile':
        return `${p.model_name || 'Mac'} · ${p.chip || p.processor || p.architecture || 'hardware read'} · ${p.os_version || 'macOS'}`;
      case '/api/quick-check':
        return `Attention Index ${Number(p.attention_index || 0)} · ${p.band || 'complete'} · ${p.recommendations?.length || 0} recommendation(s)`;
      case '/api/review-queue':
        return `${p.items?.length || 0} review item(s) · ${Number(p.counts?.high || 0)} high · ${Number(p.counts?.review || 0)} review`;
      case '/api/guided-snapshot':
        return `Monitoring Snapshot captured · ${Number(p.graph_nodes || 0)} graph nodes · Behavior ${Number(p.behavior?.risk_index || 0)} · Persistence ${p.persistence?.initialized ? 'baseline ready' : 'not initialized'}${p.trust_ran ? ` · Trust ${Number(p.trust?.drift_index || 0)}` : ' · Trust not run (no profile)'}`;
      case '/api/search/deep':
        return `Deep search complete · ${Number(p.visited || 0).toLocaleString()} entries visited · ${p.results?.length || 0} result(s) · ${Number(p.elapsed_ms || 0).toLocaleString()} ms${p.truncated ? ' · safety limit reached' : ''}`;
      case '/api/weakness-audit':
        return `Sentinel posture ${Number(p.score || 0)}/100 · ${p.findings?.length || 0} finding(s)`;
      case '/api/coverage':
        return `${Number(p.available || 0)} available · ${Number(p.limited || 0)} limited · ${Number(p.unavailable || 0)} unavailable`;
      case '/api/advanced-sensor/status':
        return `${p.mode || 'sensor status'} · ${p.enabled ? 'enabled' : 'not enabled'}${p.entitlement_needed ? ' · Apple entitlement required' : ''}`;
      case '/api/security/audit':
        return `Security audit ${p.level || 'complete'} · score ${Number(p.score || 0)} · ${p.findings?.length || 0} finding(s)`;
      case '/api/intelligence/graph':
        return `Evidence graph ${p.nodes?.length || 0} nodes · ${p.edges?.length || 0} relationships${info.method === 'POST' ? ' · session observation captured' : ''}`;
      case '/api/intelligence/timeline':
        return `${p.events?.length || 0} session observation(s) loaded`;
      case '/api/behavior':
        if (info.method === 'POST') {
          return p.first_baseline
            ? 'Behavior baseline established · future captures can compare against this session/reference state'
            : `Behavior comparison complete · index ${Number(p.risk_index || 0)} · ${p.changes?.length || 0} change(s) · history depth ${Number(p.history_depth || 0)}`;
        }
        return `${p.has_baseline ? 'Behavior baseline available' : 'No Behavior baseline yet'} · ${Number(p.history_entries || 0)} history entr${Number(p.history_entries || 0) === 1 ? 'y' : 'ies'}`;
      case '/api/behavior/history':
        return `${p.entries?.length || 0} Behavior history entr${p.entries?.length === 1 ? 'y' : 'ies'} loaded`;
      case '/api/behavior/health':
        return `${p.healthy ? 'Behavior baseline storage healthy' : 'Behavior baseline storage needs review'} · ${p.mode || 'unknown mode'}`;
      case '/api/trust/status':
        return `${p.has_profile ? `Trusted Profile available · ${Number(p.objects || 0)} objects` : 'No Trusted Profile established yet'}`;
      case '/api/trust/capture':
        return `Trusted Profile captured · ${p.objects?.length || 0} object(s) in the bounded reference`;
      case '/api/trust/compare':
        return p.profile_at ? `Trust comparison complete · drift ${Number(p.drift_index || 0)} · ${p.changes?.length || 0} change(s)` : (p.note || 'No Trusted Profile exists yet');
      case '/api/trust/health':
        return `${p.healthy ? 'Trust profile storage healthy' : 'Trust profile storage needs review'} · ${Number(p.objects || 0)} object(s)`;
      case '/api/trust/history':
        return `${p.entries?.length || 0} Trust comparison histor${p.entries?.length === 1 ? 'y' : 'ies'} loaded`;
      case '/api/persistence':
        if (info.method === 'POST') {
          return `${p.initialized ? 'Persistence session baseline ready' : 'Persistence not initialized'} · ${Number(p.files || 0)} visible plist file(s) · ${p.changes?.length || 0} change(s)`;
        }
        return `${p.initialized ? 'Persistence session baseline available' : 'No persistence session baseline yet'} · ${Number(p.files || 0)} plist file(s)`;
      case '/api/changes/start':
      case '/api/changes/stop':
      case '/api/changes/status':
        return `${p.running ? 'Change Monitor running' : 'Change Monitor stopped'} · ${p.mode || 'stopped'} · ${p.roots?.length || 0} watched root(s)`;
      case '/api/changes/events':
      case '/api/changes/history':
        return `${p.events?.length || 0} change event(s) loaded · ${p.status?.mode || 'stopped'}`;
      case '/api/incidents':
        return `${Number(p.count || p.incidents?.length || 0)} incident(s) · ${Number(p.high || 0)} high · ${Number(p.review || 0)} review`;
      case '/api/processes':
        return `${p.processes?.length || 0} process(es) loaded`;
      case '/api/startup':
        return `${p.items?.length || 0} startup item(s) loaded`;
      case '/api/background':
        return `${p.available ? `${p.items?.length || 0} background item(s) loaded` : 'Background Task Management unavailable on this host'}`;
      case '/api/network':
        return `${p.items?.length || 0} TCP activity item(s) loaded${p.warning ? ` · ${p.warning}` : ''}`;
      case '/api/actions/status':
        return `${p.enabled ? 'Safe Actions enabled with recovery guards' : 'Safe Actions read-only/disabled'} · ${p.mode || 'unknown mode'}`;
      case '/api/actions/health':
        return `${p.healthy ? 'Safe Actions recovery state healthy' : 'Safe Actions recovery state needs review'} · ${Number(p.active_vault_items || 0)} Vault item(s)`;
      case '/api/actions/vault':
        return `${p.items?.length || 0} Vault item(s) loaded`;
      case '/api/actions/journal':
        return `${p.entries?.length || 0} reversible action journal entr${p.entries?.length === 1 ? 'y' : 'ies'} loaded`;
      case '/api/cleanup/preview':
        return `${p.items?.length || 0} cleanup candidate(s) measured · no files modified`;
      case '/api/capabilities':
        return `${p.items?.filter?.(x => x.available)?.length || 0}/${p.items?.length || 0} local evidence source(s) available`;
      default:
        return `HTTP ${response.status} returned successfully from the local Sentinel engine.`;
    }
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = args[0];
    const optionMethod = args[1]?.method;
    const info = requestInfo(input);
    if (optionMethod) info.method = String(optionMethod).toUpperCase();
    const panel = beginRequest(info);
    const isStorageJob = info.path === '/api/storage/jobs';

    try {
      const response = await originalFetch(...args);
      let payload = null;
      if (response.headers.get('content-type')?.includes('application/json') && (isStorageJob || inspectPayloadPaths.has(info.path) || !response.ok)) {
        payload = await response.clone().json().catch(() => null);
      }
      if (isStorageJob && response.ok && payload) handleStorageJob(payload);
      const detail = completionDetail(info, payload, response);
      finishRequest(panel, info, response.ok, detail, isStorageJob && response.ok);
      return response;
    } catch (error) {
      finishRequest(panel, info, false, `Local request failed: ${error?.message || 'unknown network error'}`);
      throw error;
    }
  };

  // Important: do not infer a backend task from a click. Some controls perform
  // client-side validation, open navigation, or ask for confirmation before any
  // request exists. Progress is therefore created only by the fetch wrapper
  // above, which means every visible percentage corresponds to a real localhost
  // request rather than a guessed action.

  window.addEventListener('error', event => {
    reportInterfaceError(event.message || event.error?.message);
  });
  window.addEventListener('unhandledrejection', event => {
    reportInterfaceError(event.reason?.message || String(event.reason || 'unhandled promise rejection'));
  });
})();
