// SPDX-License-Identifier: MPL-2.0
// Sentinel Floating Task Center — global progress visibility for explicit user operations.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;

  const MARKER = 'Sentinel 2.9 Floating Task Center';
  const tasks = new Map();
  let sequence = 0;
  let foregroundTask = '';
  let panel = null;
  let list = null;
  let pressure = null;
  let collapsed = false;
  const MAX_VISIBLE = 8;
  const STALL_MS = 45000;

  function now() { return Date.now(); }
  function esc(value) { return S.esc ? S.esc(String(value ?? '')) : String(value ?? ''); }
  function clamp(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }
  function elapsed(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  function injectStyleSheet() {
    if (document.querySelector('link[data-sentinel-task-center-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/app/task-center.css';
    link.dataset.sentinelTaskCenterStyle = '1';
    document.head.appendChild(link);
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    injectStyleSheet();
    panel = document.createElement('aside');
    panel.id = 'sentinelTaskCenter';
    panel.className = 'sentinel-task-center';
    panel.setAttribute('aria-label', 'Sentinel task center');
    panel.innerHTML = `
      <header class="sentinel-task-head">
        <button type="button" class="sentinel-task-toggle" data-task-center-toggle aria-expanded="true">
          <span class="sentinel-task-pulse" aria-hidden="true"></span>
          <span><b>Task Center</b><small data-task-center-count>0 active</small></span>
        </button>
        <button type="button" class="sentinel-task-clear" data-task-center-clear title="Clear completed tasks">Clear</button>
      </header>
      <div class="sentinel-task-pressure" data-task-center-pressure hidden></div>
      <div class="sentinel-task-list" data-task-center-list></div>`;
    document.body.appendChild(panel);
    list = panel.querySelector('[data-task-center-list]');
    pressure = panel.querySelector('[data-task-center-pressure]');
    panel.addEventListener('click', event => {
      const toggle = event.target.closest('[data-task-center-toggle]');
      if (toggle) {
        collapsed = !collapsed;
        panel.classList.toggle('collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        return;
      }
      if (event.target.closest('[data-task-center-clear]')) {
        for (const [id, task] of tasks) if (task.status !== 'running') tasks.delete(id);
        render();
        return;
      }
      const cancel = event.target.closest('[data-task-cancel]');
      if (cancel) cancelTask(cancel.dataset.taskCancel);
    });
    render();
    return panel;
  }

  function statusLabel(task) {
    if (task.status === 'done') return 'Done';
    if (task.status === 'failed') return 'Failed';
    if (task.status === 'cancelled') return 'Cancelled';
    if (task.stalled) return 'Possibly stalled';
    return 'Running';
  }

  function render() {
    ensurePanel();
    const ordered = [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_VISIBLE);
    const active = ordered.filter(task => task.status === 'running');
    const count = panel.querySelector('[data-task-center-count]');
    if (count) count.textContent = `${active.length} active`;
    panel.classList.toggle('has-active', active.length > 0);
    pressure.hidden = active.length < 4;
    pressure.textContent = active.length >= 4 ? `${active.length} operations are active. Consider letting current work finish before starting more.` : '';
    list.innerHTML = ordered.length ? ordered.map(task => {
      const pct = clamp(task.progress);
      const detail = task.stalled && task.status === 'running'
        ? `No visible progress for ${elapsed(now() - task.lastChangeAt)} · ${task.detail || 'waiting for activity'}`
        : (task.detail || 'Working…');
      return `<article class="sentinel-task ${esc(task.status)} ${task.stalled ? 'stalled' : ''}" data-task-id="${esc(task.id)}">
        <div class="sentinel-task-row"><div><span>${esc(statusLabel(task))}</span><b>${esc(task.label)}</b></div><strong>${task.status === 'running' ? `${Math.round(pct)}%` : task.status === 'done' ? '100%' : `${Math.round(pct)}%`}</strong></div>
        <div class="sentinel-task-track"><i style="width:${pct}%"></i></div>
        <div class="sentinel-task-meta"><small>${esc(detail)}</small><small>${esc(elapsed((task.completedAt || now()) - task.startedAt))}</small></div>
        ${task.cancellable && task.status === 'running' ? `<button type="button" class="sentinel-task-cancel" data-task-cancel="${esc(task.id)}">Cancel</button>` : ''}
      </article>`;
    }).join('') : '<div class="sentinel-task-empty">No active tasks. Operations you start will appear here.</div>';
  }

  function create(label, options = {}) {
    ensurePanel();
    const id = `task-${++sequence}-${now()}`;
    const task = {
      id,
      label: label || 'Sentinel task',
      kind: options.kind || 'operation',
      status: 'running',
      progress: clamp(options.progress || 1),
      detail: options.detail || 'Starting…',
      cancellable: Boolean(options.cancellable),
      cancel: typeof options.cancel === 'function' ? options.cancel : null,
      startedAt: now(),
      completedAt: 0,
      lastChangeAt: now(),
      stalled: false,
    };
    tasks.set(id, task);
    foregroundTask = id;
    render();
    return id;
  }

  function update(id, patch = {}) {
    const task = tasks.get(id);
    if (!task) return;
    const before = `${task.progress}|${task.detail}|${task.status}`;
    if (patch.progress != null) task.progress = clamp(patch.progress);
    if (patch.detail != null) task.detail = String(patch.detail);
    if (patch.label != null) task.label = String(patch.label);
    if (patch.status) task.status = patch.status;
    const after = `${task.progress}|${task.detail}|${task.status}`;
    if (before !== after) {
      task.lastChangeAt = now();
      task.stalled = false;
    }
    if (task.status !== 'running' && !task.completedAt) task.completedAt = now();
    render();
  }

  function finish(id, detail = 'Completed') { update(id, {status: 'done', progress: 100, detail}); }
  function fail(id, detail = 'Task failed') { update(id, {status: 'failed', detail}); }
  function cancelTask(id) {
    const task = tasks.get(id);
    if (!task || task.status !== 'running') return;
    try { task.cancel?.(); } catch {}
    update(id, {status: 'cancelled', detail: 'Cancellation requested'});
  }

  function labelForControl(control) {
    const explicit = control.getAttribute('aria-label') || control.title;
    return (explicit || control.textContent || 'Sentinel operation').trim().replace(/\s+/g, ' ');
  }

  function actionable(control) {
    if (!control || control.disabled) return null;
    if (control.matches('[data-scan-center="cancel"],[data-task-cancel],[data-task-center-toggle],[data-task-center-clear]')) return null;
    if (control.matches('[data-scan-center="full"]')) return {kind:'full-scan', cancellable:true, label:'Full Scan'};
    if (control.matches('[data-scan-center="easy"]')) return {kind:'easy-scan', label:'Easy Scan'};
    if (control.matches('[data-do],[data-system-action],[data-advanced]')) return {kind:'operation', label:labelForControl(control)};
    if (control.id === 'refreshButton' || control.matches('[data-action-dock-refresh]')) return {kind:'refresh', label:'Refresh evidence'};
    if (control.id === 'exportButton') return {kind:'export', label:'Export report'};
    return null;
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('button');
    const meta = actionable(control);
    if (!meta) return;
    const id = create(meta.label, {
      kind: meta.kind,
      cancellable: Boolean(meta.cancellable),
      detail: 'Command accepted · waiting for progress',
      cancel: meta.kind === 'full-scan' ? () => document.querySelector('[data-scan-center="cancel"]')?.click() : null,
    });
    if (meta.kind === 'full-scan') control.dataset.taskCenterTaskId = id;
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    const name = form.dataset.form || 'operation';
    create(name.split('-').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' '), {kind:name, detail:'Submitted · waiting for progress'});
  }, true);

  function syncActivityBar() {
    const state = document.getElementById('activityState');
    const progress = document.getElementById('activityProgress');
    const detail = document.getElementById('activityDetail');
    if (!state || !progress || !detail) return;
    const stateText = (state.textContent || '').trim();
    const pct = clamp(progress.value);
    const detailText = (detail.textContent || '').trim();
    let task = tasks.get(foregroundTask);
    if (!task || task.status !== 'running') {
      if (!/^(ready|idle)$/i.test(stateText) && stateText) foregroundTask = create(stateText, {progress:pct, detail:detailText});
      task = tasks.get(foregroundTask);
    }
    if (!task || task.status !== 'running') return;
    if (/error|failed/i.test(stateText)) return fail(task.id, detailText || stateText);
    if (/^(ready|complete|completed|done)$/i.test(stateText) && pct >= 99) return finish(task.id, detailText || 'Completed');
    update(task.id, {progress:pct, detail:detailText || stateText || task.detail});
  }

  function syncFullScan() {
    const task = [...tasks.values()].reverse().find(item => item.kind === 'full-scan' && item.status === 'running');
    if (!task) return;
    const box = document.getElementById('fullScanProgress');
    const progress = box?.querySelector('progress');
    if (progress && Number(progress.max) > 0) {
      const pct = clamp((Number(progress.value) / Number(progress.max)) * 100);
      const text = box.querySelector('.full-scan-summary small')?.textContent?.trim() || 'Building retained evidence baseline';
      update(task.id, {progress:pct, detail:text});
    }
    const runningControl = document.querySelector('[data-scan-center="full"][aria-busy="true"]');
    if (!runningControl && task.progress >= 99) finish(task.id, 'Full Scan completed');
  }

  const activityNodes = ['activityState','activityProgress','activityDetail'].map(id => document.getElementById(id)).filter(Boolean);
  const activityObserver = new MutationObserver(syncActivityBar);
  activityNodes.forEach(node => activityObserver.observe(node, {attributes:true, childList:true, characterData:true, subtree:true}));
  const pageObserver = new MutationObserver(syncFullScan);
  pageObserver.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['value','aria-busy']});

  setInterval(() => {
    const t = now();
    for (const task of tasks.values()) {
      if (task.status === 'running' && t - task.lastChangeAt >= STALL_MS) task.stalled = true;
    }
    syncFullScan();
    render();
  }, 2000);

  S.TaskCenter = {marker:MARKER, create, update, finish, fail, cancel:cancelTask, tasks};
  ensurePanel();
})();
