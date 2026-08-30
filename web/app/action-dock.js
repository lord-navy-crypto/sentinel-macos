// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.4 Action Dock — contextual controls over existing product operations.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Action Dock.');
  const {$, state, esc, notice, activity} = S;
  const ACTION_DOCK_MARKER = 'Sentinel 2.4 Contextual Action Dock';

  let scanRunning = false;
  let scanCancelled = false;

  const ACTIONS = {
    status: [
      {label:'Easy Scan', lens:'snapshot'},
      {label:'Full Scan', scan:'full', primary:true},
      {label:'Cases', lens:'cases'},
      {label:'Visibility', lens:'visibility'},
    ],
    snapshot: [
      {label:'Refresh', refresh:true},
      {label:'Monitoring Snapshot', do:'guided-snapshot', primary:true},
      {label:'Cases', lens:'cases'},
      {label:'Relations', lens:'relations'},
    ],
    cases: [
      {label:'Refresh', refresh:true},
      {label:'Rebuild Cases', do:'rebuild-cases', primary:true},
      {label:'Relations', lens:'relations'},
      {label:'Search', lens:'search'},
    ],
    search: [
      {label:'Refresh', refresh:true},
      {label:'Object Verify', lens:'object', primary:true},
      {label:'Cases', lens:'cases'},
      {label:'Visibility', lens:'visibility'},
    ],
    relations: [
      {label:'Refresh', refresh:true},
      {label:'Capture Evidence', do:'capture-relations', primary:true},
      {label:'Cases', lens:'cases'},
      {label:'Changes', lens:'changes'},
    ],
    audit: [
      {label:'Refresh', refresh:true},
      {label:'Run Audit', do:'rerun-audit', primary:true},
      {label:'Cases', lens:'cases'},
      {label:'Object Verify', lens:'object'},
    ],
    object: [
      {label:'Refresh', refresh:true},
      {label:'Relations', lens:'relations'},
      {label:'Reference', lens:'reference'},
      {label:'Safe Change', lens:'change'},
    ],
    changes: [
      {label:'Refresh', refresh:true},
      {label:'Capture Checkpoint', advanced:'capture-checkpoint', primary:true},
      {label:'Behavior', lens:'behavior'},
      {label:'Reference', lens:'reference'},
    ],
    behavior: [
      {label:'Refresh', refresh:true},
      {label:'Capture & Compare', do:'capture-behavior', primary:true},
      {label:'Changes', lens:'changes'},
      {label:'Reference', lens:'reference'},
    ],
    reference: [
      {label:'Refresh', refresh:true},
      {label:'Compare Now', do:'compare-reference', primary:true},
      {label:'Behavior', lens:'behavior'},
      {label:'Changes', lens:'changes'},
    ],
    machine: [
      {label:'Refresh', refresh:true},
      {label:'Processes', lens:'processes', primary:true},
      {label:'Auto-start', lens:'startup'},
      {label:'Visibility', lens:'visibility'},
    ],
    processes: [
      {label:'Refresh', refresh:true},
      {label:'Network', lens:'network', primary:true},
      {label:'Auto-start', lens:'startup'},
      {label:'Cases', lens:'cases'},
    ],
    startup: [
      {label:'Refresh', system:'refresh-startup'},
      {label:'Persistence', lens:'persistence', primary:true},
      {label:'Processes', lens:'processes'},
      {label:'Changes', lens:'changes'},
    ],
    persistence: [
      {label:'Refresh', refresh:true},
      {label:'Auto-start', lens:'startup', primary:true},
      {label:'Changes', lens:'changes'},
      {label:'Reference', lens:'reference'},
    ],
    background: [
      {label:'Refresh', refresh:true},
      {label:'Processes', lens:'processes', primary:true},
      {label:'Auto-start', lens:'startup'},
      {label:'Visibility', lens:'visibility'},
    ],
    network: [
      {label:'Refresh Current', system:'refresh-network'},
      {label:'Capture History', system:'capture-network', primary:true},
      {label:'Relations', lens:'relations'},
      {label:'Processes', lens:'processes'},
    ],
    storage: [
      {label:'Refresh', refresh:true},
      {label:'Reclaim Review', lens:'reclaim', primary:true},
      {label:'Changes', lens:'changes'},
      {label:'Safe Change', lens:'change'},
    ],
    reclaim: [
      {label:'Refresh', refresh:true},
      {label:'Storage', lens:'storage', primary:true},
      {label:'Safe Change', lens:'change'},
      {label:'Cases', lens:'cases'},
    ],
    change: [
      {label:'Refresh', refresh:true},
      {label:'Storage', lens:'storage'},
      {label:'Changes', lens:'changes'},
      {label:'Workbench', workbench:true, primary:true},
    ],
    visibility: [
      {label:'Refresh', refresh:true},
      {label:'Full Scan', scan:'full', primary:true},
      {label:'Status', lens:'status'},
      {label:'Model', lens:'guide'},
    ],
    guide: [
      {label:'Status', lens:'status', primary:true},
      {label:'Visibility', lens:'visibility'},
      {label:'Search', lens:'search'},
      {label:'Workbench', workbench:true},
    ],
  };

  const POST_SCAN_ACTIONS = [
    {label:'Open Cases', lens:'cases', primary:true},
    {label:'Review Changes', lens:'changes'},
    {label:'Inspect Storage', lens:'storage'},
    {label:'Compare Reference', lens:'reference'},
    {label:'Workbench', workbench:true},
  ];

  function button(action) {
    const attrs = [];
    if (action.lens) attrs.push(`data-action-dock-lens="${esc(action.lens)}"`);
    if (action.refresh) attrs.push('data-action-dock-refresh="1"');
    if (action.do) attrs.push(`data-do="${esc(action.do)}"`);
    if (action.scan) attrs.push(`data-scan-center="${esc(action.scan)}"`);
    if (action.system) attrs.push(`data-system-action="${esc(action.system)}"`);
    if (action.advanced) attrs.push(`data-advanced="${esc(action.advanced)}"`);
    if (action.workbench) attrs.push('data-workbench="open"');
    return `<button type="button" class="s24-action ${action.primary?'primary':''}" ${attrs.join(' ')}>${esc(action.label)}</button>`;
  }

  function dockHTML(lens) {
    const actions = ACTIONS[lens] || [{label:'Refresh', refresh:true}];
    const hasWorkbench = actions.some(x => x.workbench);
    const all = hasWorkbench ? actions : [...actions, {label:'Workbench', workbench:true}];
    return `<section class="s24-action-dock" aria-label="Quick actions"><span>QUICK ACTIONS</span><div>${all.slice(0,5).map(button).join('')}</div></section>`;
  }

  function syncFullScanButtons() {
    document.querySelectorAll('[data-scan-center="full"]').forEach(control => {
      if (!control.dataset.actionDockIdleLabel) control.dataset.actionDockIdleLabel = control.textContent.trim() || 'Full Scan';
      control.disabled = scanRunning;
      control.setAttribute('aria-busy', scanRunning ? 'true' : 'false');
      if (control.id === 'fullScanHeader' || control.closest('.s24-action-dock')) {
        control.textContent = scanRunning ? 'Scanning…' : control.dataset.actionDockIdleLabel;
      }
    });
  }

  function installDock() {
    const stage = $('#evidenceStage');
    if (!stage) return;
    const question = stage.querySelector('.s24-question');
    if (!question) return;
    const anchor = state.lens === 'status' ? (stage.querySelector('#scanCenterBand') || question) : question;
    let dock = stage.querySelector('.s24-action-dock');
    if (!dock) {
      anchor.insertAdjacentHTML('afterend', dockHTML(state.lens));
      dock = stage.querySelector('.s24-action-dock');
    } else if (dock.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', dock);
    }
    syncFullScanButtons();
  }

  function installHeaderButtons() {
    const actions = $('.s24-command-actions');
    const refresh = $('#refreshButton');
    if (!actions || !refresh) return;
    if (!$('#easyScanHeader')) {
      const easy = document.createElement('button');
      easy.id = 'easyScanHeader';
      easy.className = 's24-quiet s24-header-scan';
      easy.type = 'button';
      easy.textContent = 'Easy Scan';
      easy.dataset.actionDockLens = 'snapshot';
      easy.title = 'Open the fast read-only Easy Scan';
      actions.insertBefore(easy, refresh);
    }
    if (!$('#fullScanHeader')) {
      const full = document.createElement('button');
      full.id = 'fullScanHeader';
      full.className = 's24-quiet s24-header-scan full';
      full.type = 'button';
      full.textContent = 'Full Scan';
      full.dataset.scanCenter = 'full';
      full.title = 'Build or refresh the retained Full Scan baseline';
      actions.insertBefore(full, refresh);
    }
    syncFullScanButtons();
  }

  function removeScanFollowup() {
    $('#scanFollowupPanel')?.remove();
  }

  async function installScanFollowup() {
    if (scanRunning || scanCancelled || state.lens !== 'status') return;
    const stage = $('#evidenceStage');
    if (!stage) return;
    removeScanFollowup();
    let model = null;
    try {
      if (typeof S.scanCenter?.readBaselineState === 'function') model = await S.scanCenter.readBaselineState();
    } catch {}
    if (state.lens !== 'status' || scanCancelled) return;
    const retained = model ? `${model.readyCount}/${model.readyTotal} retained baseline families ready` : 'Retained evidence refresh completed';
    const panel = document.createElement('section');
    panel.id = 'scanFollowupPanel';
    panel.className = 's24-scan-followup';
    panel.innerHTML = `<div><span>FULL SCAN READY</span><b>Continue with the retained evidence</b><small>${esc(retained)}. Choose the next analysis without repeating the scan.</small></div><div>${POST_SCAN_ACTIONS.map(button).join('')}</div>`;
    const dock = stage.querySelector('.s24-action-dock');
    const anchor = dock || stage.querySelector('#scanCenterBand') || stage.querySelector('.s24-question');
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
  }

  async function startFullScanRefined() {
    if (scanRunning || typeof S.scanCenter?.startFullScan !== 'function') return;
    scanRunning = true;
    scanCancelled = false;
    removeScanFollowup();
    syncFullScanButtons();
    try {
      await S.scanCenter.startFullScan();
    } catch (error) {
      notice(error?.message || String(error));
      activity('Error', 0, error?.message || String(error));
    } finally {
      scanRunning = false;
      syncFullScanButtons();
    }
    if (!scanCancelled) setTimeout(() => installScanFollowup(), 450);
  }

  async function cancelFullScanRefined() {
    if (!scanRunning || typeof S.scanCenter?.cancelFullScan !== 'function') return;
    scanCancelled = true;
    removeScanFollowup();
    try { await S.scanCenter.cancelFullScan(); }
    catch (error) { notice(error?.message || String(error)); }
  }

  // Capture Full Scan controls before the original Full Scan bubble listener so
  // one click has exactly one orchestrator. Easy Scan and Workbench still flow
  // through their original handlers unchanged.
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-scan-center]');
    if (!control) return;
    const action = control.dataset.scanCenter;
    if (action === 'full' && typeof S.scanCenter?.startFullScan === 'function') {
      event.preventDefault();
      event.stopImmediatePropagation();
      startFullScanRefined();
      return;
    }
    if (action === 'cancel' && scanRunning && typeof S.scanCenter?.cancelFullScan === 'function') {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelFullScanRefined();
    }
  }, true);

  document.addEventListener('click', event => {
    const lens = event.target.closest('[data-action-dock-lens]');
    if (lens) {
      event.preventDefault();
      if (typeof S.navigate === 'function') S.navigate(lens.dataset.actionDockLens);
      return;
    }
    const refresh = event.target.closest('[data-action-dock-refresh]');
    if (refresh) {
      event.preventDefault();
      if (typeof S.navigate === 'function') S.navigate(state.lens, {push:false});
    }
  });

  const stage = $('#evidenceStage');
  if (stage) {
    const observer = new MutationObserver(() => queueMicrotask(() => {
      installDock();
      syncFullScanButtons();
    }));
    observer.observe(stage, {childList:true, subtree:true});
  }
  installHeaderButtons();
  queueMicrotask(installDock);

  S.actionDock = {
    marker:ACTION_DOCK_MARKER,
    actions:ACTIONS,
    postScanActions:POST_SCAN_ACTIONS,
    installDock,
    installHeaderButtons,
    syncFullScanButtons,
    installScanFollowup,
  };
})();
