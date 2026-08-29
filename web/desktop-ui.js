// SPDX-License-Identifier: MPL-2.0
(() => {
  // Desktop-only information architecture. app.js remains authoritative for
  // navigation, validation, actions, and every API-backed feature.
  if (window.__sentinelDesktopUIInstalled) return;
  window.__sentinelDesktopUIInstalled = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/desktop-ui.css';
  css.id = 'sentinel-desktop-ui-css';
  document.head.appendChild(css);

  document.body.classList.remove('easy-mode');
  const group = document.querySelector('.nav-group-label.advanced-nav');
  if (group) group.textContent = 'More tools';

  const desktopIA = {
    overview: {
      nav: 'Command',
      title: 'Command',
      sub: 'Current state, immediate decisions, and the shortest path to evidence.'
    },
    quickcheck: {
      nav: 'Snapshot',
      title: 'Snapshot',
      sub: 'Take one bounded read-only view of the Mac and decide what deserves attention.'
    },
    incidents: {
      nav: 'Cases',
      title: 'Cases',
      sub: 'Review correlated evidence stories instead of isolated alerts.'
    },
    changes: {
      nav: 'Watch',
      title: 'Watch',
      sub: 'Observe selected filesystem changes and re-inspect only what moved.'
    },
    weakness: {
      nav: 'Investigate',
      title: 'Investigate',
      sub: 'Search current evidence, inspect blind spots, and run bounded discovery.'
    },
    intelligence: {
      nav: 'Evidence',
      title: 'Evidence',
      sub: 'Connect files, processes, startup state, network activity, and object history.'
    },
    behavior: {
      nav: 'Behavior',
      title: 'Behavior',
      sub: 'Compare captures and understand what changed across Sentinel sessions.'
    },
    trust: {
      nav: 'Trust',
      title: 'Trust',
      sub: 'Compare current identity and fingerprints against an explicit approved reference.'
    },
    hardware: {
      nav: 'Machine',
      title: 'Machine',
      sub: 'Read the hardware, architecture, memory, storage, and macOS runtime context.'
    },
    processes: {
      nav: 'Processes',
      title: 'Processes',
      sub: 'Inspect running software, executable identity, signatures, and related connections.'
    },
    startup: {
      nav: 'Startup',
      title: 'Startup',
      sub: 'Review what macOS is configured to launch automatically.'
    },
    persistence: {
      nav: 'Persistence',
      title: 'Persistence',
      sub: 'Detect changes in visible LaunchAgent and LaunchDaemon configuration.'
    },
    background: {
      nav: 'Background',
      title: 'Background',
      sub: 'Inspect modern macOS background registrations and login activity.'
    },
    network: {
      nav: 'Network',
      title: 'Network',
      sub: 'Review the current bounded TCP activity snapshot.'
    },
    storage: {
      nav: 'Storage',
      title: 'Storage',
      sub: 'Understand space pressure, large objects, duplicates, and reviewable storage.'
    },
    security: {
      nav: 'Audit',
      title: 'Audit',
      sub: 'Review explainable security evidence without turning scores into verdicts.'
    },
    integrity: {
      nav: 'Verify File',
      title: 'Verify File',
      sub: 'Inspect one local file or app with hashes, signatures, and Gatekeeper evidence.'
    },
    actions: {
      nav: 'Resolve',
      title: 'Resolve',
      sub: 'Use reversible actions only after reviewing dependencies and evidence.'
    },
    cleanup: {
      nav: 'Reclaim',
      title: 'Reclaim',
      sub: 'Preview storage candidates before handing eligible items to reversible actions.'
    },
    guide: {
      nav: 'Help & Access',
      title: 'Help & Access',
      sub: 'Understand permissions, visibility limits, evidence semantics, and safe workflows.'
    }
  };

  const applyDesktopNames = () => {
    for (const [view, copy] of Object.entries(desktopIA)) {
      const button = document.querySelector(`.nav[data-view="${view}"]`);
      if (button && button.textContent !== copy.nav) button.textContent = copy.nav;
    }
    const active = document.querySelector('.view.active')?.id || 'overview';
    const copy = desktopIA[active];
    if (!copy) return;
    const title = document.getElementById('pageTitle');
    const sub = document.getElementById('pageSub');
    if (title && title.textContent !== copy.title) title.textContent = copy.title;
    if (sub && sub.textContent !== copy.sub) sub.textContent = copy.sub;
  };

  applyDesktopNames();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDesktopNames, {once: true});
  }

  const app = document.querySelector('.app');
  if (app) {
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' && record.attributeName === 'class')) {
        queueMicrotask(applyDesktopNames);
      }
    });
    observer.observe(app, {subtree: true, attributes: true, attributeFilter: ['class']});
  }

  const endpointRules = [
    ['/api/system-profile', 'hardware', 'Reading Machine'],
    ['/api/quick-check', 'quickcheck', 'Building Snapshot'],
    ['/api/review-queue', 'quickcheck', 'Building Review Queue'],
    ['/api/guided-snapshot', 'quickcheck', 'Capturing Monitoring Snapshot'],
    ['/api/readiness', 'overview', 'Checking Readiness'],
    ['/api/search/deep', 'weakness', 'Deep Search'],
    ['/api/weakness-audit', 'weakness', 'Checking Visibility'],
    ['/api/coverage', 'weakness', 'Checking Coverage'],
    ['/api/advanced-sensor/status', 'weakness', 'Checking Sensor'],
    ['/api/search', 'weakness', 'Searching Evidence'],
    ['/api/changes', 'changes', 'Updating Watch'],
    ['/api/incidents', 'incidents', 'Building Cases'],
    ['/api/storage', 'storage', 'Scanning Storage'],
    ['/api/security/audit', 'security', 'Running Audit'],
    ['/api/self/integrity', 'overview', 'Verifying Sentinel'],
    ['/api/integrity', 'integrity', 'Verifying File'],
    ['/api/intelligence', 'intelligence', 'Building Evidence'],
    ['/api/object/story', 'intelligence', 'Building Object Story'],
    ['/api/behavior', 'behavior', 'Comparing Behavior'],
    ['/api/trust', 'trust', 'Comparing Trust'],
    ['/api/process/detail', 'processes', 'Inspecting Process'],
    ['/api/processes', 'processes', 'Loading Processes'],
    ['/api/startup', 'startup', 'Loading Startup'],
    ['/api/persistence', 'persistence', 'Checking Persistence'],
    ['/api/background', 'background', 'Loading Background'],
    ['/api/network', 'network', 'Loading Network'],
    ['/api/cleanup/preview', 'cleanup', 'Preparing Reclaim Preview'],
    ['/api/actions', 'actions', 'Preparing Resolution'],
    ['/api/report/export', 'overview', 'Building Local Report'],
    ['/api/diagnostics/export', 'overview', 'Building Diagnostics'],
    ['/api/capabilities', 'overview', 'Checking Evidence Sources'],
    ['/api/overview', 'overview', 'Refreshing Command']
  ];

  const panelState = new WeakMap();

  const stateFor = panel => {
    let state = panelState.get(panel);
    if (!state) {
      state = {active: 0, percent: 0, timer: null};
      panelState.set(panel, state);
    }
    return state;
  };

  const panelForView = viewId => {
    const view = document.getElementById(viewId) || document.querySelector('.view.active');
    if (!view) return null;
    let panel = view.querySelector('.sentinel-task-progress');
    if (panel) return panel;
    const host = view.querySelector('.card') || view;
    panel = document.createElement('div');
    panel.className = 'sentinel-task-progress';
    panel.dataset.state = 'idle';
    panel.innerHTML = `
      <div class="sentinel-progress-head"><b>Ready</b><strong>0%</strong></div>
      <progress class="sentinel-percent-bar" max="100" value="0"></progress>
      <small class="sentinel-progress-detail">Progress appears only after a real localhost request starts.</small>`;
    host.appendChild(panel);
    return panel;
  };

  const setPanel = (panel, percent, label, detail, stateName = 'running') => {
    if (!panel) return;
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const state = stateFor(panel);
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

  const requestInfo = input => {
    try {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const url = new URL(raw, location.origin);
      const match = endpointRules.find(([prefix]) => url.pathname.startsWith(prefix));
      return {
        path: url.pathname,
        view: match?.[1] || document.querySelector('.view.active')?.id || 'overview',
        label: match?.[2] || 'Working locally'
      };
    } catch {
      return {path: '', view: document.querySelector('.view.active')?.id || 'overview', label: 'Working locally'};
    }
  };

  const beginRequest = info => {
    const panel = panelForView(info.view);
    if (!panel) return null;
    const state = stateFor(panel);
    state.active += 1;
    if (state.active === 1) {
      const start = state.percent >= 100 ? 8 : Math.max(8, state.percent || 8);
      setPanel(panel, start, info.label, `${info.path} · localhost request started.`, 'running');
      state.timer = setInterval(() => {
        const next = Math.min(92, state.percent + (state.percent < 45 ? 4 : 1));
        setPanel(panel, next, info.label, 'Waiting for the local Sentinel engine.', 'running');
      }, 450);
    }
    return panel;
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

  const handleStorageJob = job => {
    if (!job || typeof job !== 'object') return;
    const panel = panelForView('storage');
    if (!panel) return;
    const phase = String(job.phase || job.status || 'walking');
    const percent = Number(job.phase_percent || (job.status === 'complete' ? 100 : 12));
    const hashFilesDone = Number(job.hash_files_done || 0);
    const hashFilesTotal = Number(job.hash_files_total || 0);
    const hashBytesDone = Number(job.hash_bytes_done || 0);
    const hashBytesTotal = Number(job.hash_bytes_total || 0);
    let detail = `${Number(job.files_visited || 0).toLocaleString()} files · ${Number(job.dirs_visited || 0).toLocaleString()} folders`;
    if (hashFilesTotal > 0) detail += ` · hash ${Math.min(hashFilesDone + 1, hashFilesTotal)}/${hashFilesTotal}`;
    if (hashBytesTotal > 0) detail += ` · ${hashBytesDone.toLocaleString()} / ${hashBytesTotal.toLocaleString()} hash bytes`;
    const stateName = job.status === 'failed' ? 'error' : job.status === 'complete' ? 'complete' : 'running';
    setPanel(panel, percent, storagePhaseLabel(phase), detail, stateName);
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const info = requestInfo(args[0]);
    const panel = beginRequest(info);
    try {
      const response = await nativeFetch(...args);
      let payload = null;
      try {
        const type = response.headers.get('content-type') || '';
        if (type.includes('application/json')) payload = await response.clone().json();
      } catch {
        payload = null;
      }
      if (payload && info.path.startsWith('/api/storage')) handleStorageJob(payload);
      if (panel) {
        const state = stateFor(panel);
        state.active = Math.max(0, state.active - 1);
        if (state.active === 0) {
          stopTimer(panel);
          if (!payload || !info.path.startsWith('/api/storage') || payload.status !== 'running') {
            setPanel(
              panel,
              100,
              response.ok ? `${info.label} complete` : `${info.label} failed`,
              response.ok ? 'The local engine returned successfully.' : `Local request failed: HTTP ${response.status}`,
              response.ok ? 'complete' : 'error'
            );
          }
        }
      }
      return response;
    } catch (error) {
      if (panel) {
        stopTimer(panel);
        const state = stateFor(panel);
        state.active = 0;
        setPanel(panel, 100, `${info.label} failed`, `Local request failed: ${error?.message || error}`, 'error');
      }
      throw error;
    }
  };

  window.addEventListener('error', event => {
    const panel = panelForView(document.querySelector('.view.active')?.id || 'overview');
    if (panel) setPanel(panel, 100, 'Interface error', `Interface error: ${event.message || 'Unknown desktop UI error'}`, 'error');
  });

  window.addEventListener('unhandledrejection', event => {
    const panel = panelForView(document.querySelector('.view.active')?.id || 'overview');
    const detail = event.reason?.message || String(event.reason || 'Unknown rejection');
    if (panel) setPanel(panel, 100, 'Interface error', `Interface error: ${detail}`, 'error');
  });
})();
