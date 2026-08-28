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
      <small class="sentinel-progress-detail">This panel reports local task activity for this feature.</small>`;
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

  const primePanel = (button, label) => {
    const view = button.closest('.view') || document.querySelector('.view.active');
    if (!view) return;
    const viewId = view.id || 'overview';
    const card = button.closest('.card') || view.querySelector('.card') || view;
    const panel = panelForView(viewId, card);
    const state = stateFor(panel);
    const serial = state.requestSerial;
    setPanel(panel, 4, label, 'Button accepted. Waiting for the feature to start a localhost request…', 'running');
    setTimeout(() => {
      const current = stateFor(panel);
      if (current.requestSerial === serial && current.active === 0 && !current.storageRunning) {
        setPanel(panel, 0, 'No local request started',
          'The action was cancelled, blocked by validation, or its front-end handler did not reach the local engine.', 'idle');
      }
    }, 1100);
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
        `${info.method} ${info.path} · estimated until this localhost request returns.`, 'running');
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
      if (isStorageJob && response.ok) {
        response.clone().json().then(handleStorageJob).catch(() => {});
      }
      const detail = `HTTP ${response.status} returned from the local Sentinel engine.`;
      finishRequest(panel, info, response.ok, detail, isStorageJob && response.ok);
      return response;
    } catch (error) {
      finishRequest(panel, info, false, `Local request failed: ${error?.message || 'unknown network error'}`);
      throw error;
    }
  };

  // Immediate acknowledgement for every action button. Navigation-only and
  // purely local close/help controls are excluded so they do not show a fake
  // backend task.
  const clientOnlyButtons = new Set(['pageHelpToggle', 'closeIncidentDeepReview', 'closeProcessDetail']);
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.classList.contains('nav') || button.hasAttribute('data-go') || clientOnlyButtons.has(button.id)) return;
    const name = (button.textContent || 'Action').trim().replace(/\s+/g, ' ');
    button.dataset.sentinelPending = '1';
    primePanel(button, `Starting ${name}`);
    setTimeout(() => button.removeAttribute('data-sentinel-pending'), 1400);
  }, true);

  window.addEventListener('error', event => {
    reportInterfaceError(event.message || event.error?.message);
  });
  window.addEventListener('unhandledrejection', event => {
    reportInterfaceError(event.reason?.message || String(event.reason || 'unhandled promise rejection'));
  });
})();
