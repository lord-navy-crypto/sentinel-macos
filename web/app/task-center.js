// SPDX-License-Identifier: MPL-2.0
// Sentinel Floating Task Center — global progress visibility for explicit user operations.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;

  const MARKER = 'Sentinel 3.4 Task Center Reliability';
  const tasks = new Map();
  let sequence = 0;
  let foregroundTask = '';
  let panel = null;
  let list = null;
  let pressure = null;
  let collapsed = false;
  const MAX_VISIBLE = 8;
  const MAX_RETAINED = 40;
  const STALL_MS = 45000;
  const DEDUPE_WINDOW_MS = 1200;

  function now() { return Date.now(); }
  function esc(value) { return S.esc ? S.esc(String(value ?? '')) : String(value ?? ''); }
  function clamp(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }
  function normalizeKey(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase(); }
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
      if (cancel) {
        cancelTask(cancel.dataset.taskCancel);
        return;
      }
      const result = event.target.closest('[data-task-result]');
      if (result) {
        invokeTaskAction(result.dataset.taskResult, 'result');
        return;
      }
      const retry = event.target.closest('[data-task-retry]');
      if (retry) invokeTaskAction(retry.dataset.taskRetry, 'retry');
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

  function pruneHistory() {
    if (tasks.size <= MAX_RETAINED) return;
    const removable = [...tasks.values()]
      .filter(task => task.status !== 'running')
      .sort((a, b) => (a.completedAt || a.startedAt) - (b.completedAt || b.startedAt));
    for (const task of removable) {
      if (tasks.size <= MAX_RETAINED) break;
      tasks.delete(task.id);
    }
  }

  function taskSource(task) {
    const parts = [];
    if (task.source) parts.push(task.source);
    if (task.kind && task.kind !== 'operation') parts.push(task.kind);
    return parts.join(' · ');
  }

  function actionMarkup(task) {
    const controls = [];
    if (task.cancellable && task.status === 'running') {
      controls.push(`<button type="button" class="sentinel-task-cancel" data-task-cancel="${esc(task.id)}">Cancel</button>`);
    }
    if (task.status !== 'running' && task.resultAction && task.resultLabel) {
      controls.push(`<button type="button" class="sentinel-task-result" data-task-result="${esc(task.id)}">${esc(task.resultLabel)}</button>`);
    }
    if ((task.status === 'failed' || task.status === 'cancelled') && task.retryAction && task.retryLabel) {
      controls.push(`<button type="button" class="sentinel-task-retry" data-task-retry="${esc(task.id)}">${esc(task.retryLabel)}</button>`);
    }
    return controls.length ? `<div class="sentinel-task-actions">${controls.join('')}</div>` : '';
  }

  function render() {
    ensurePanel();
    pruneHistory();
    const all = [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
    const ordered = all.slice(0, MAX_VISIBLE);
    const activeCount = all.filter(task => task.status === 'running').length;
    const count = panel.querySelector('[data-task-center-count]');
    if (count) count.textContent = `${activeCount} active`;
    panel.classList.toggle('has-active', activeCount > 0);
    pressure.hidden = activeCount < 4;
    pressure.textContent = activeCount >= 4 ? `${activeCount} operations are active. Consider letting current work finish before starting more.` : '';
    list.innerHTML = ordered.length ? ordered.map(task => {
      const pct = clamp(task.progress);
      const detailBase = task.stalled && task.status === 'running'
        ? `No visible progress for ${elapsed(now() - task.lastChangeAt)} · ${task.detail || 'waiting for activity'}`
        : (task.detail || 'Working…');
      const grouped = task.signalCount > 1 ? ` · ${task.signalCount} task signals grouped` : '';
      const source = taskSource(task);
      return `<article class="sentinel-task ${esc(task.status)} ${task.stalled ? 'stalled' : ''} ${task.indeterminate && task.status === 'running' ? 'indeterminate' : ''}" data-task-id="${esc(task.id)}">
        <div class="sentinel-task-row"><div><span>${esc(statusLabel(task))}</span><b>${esc(task.label)}</b>${source ? `<small class="sentinel-task-source">${esc(source)}</small>` : ''}</div><strong>${task.status === 'running' && task.indeterminate ? '…' : task.status === 'running' ? `${Math.round(pct)}%` : task.status === 'done' ? '100%' : `${Math.round(pct)}%`}</strong></div>
        <div class="sentinel-task-track"><i style="width:${pct}%"></i></div>
        <div class="sentinel-task-meta"><small>${esc(detailBase + grouped)}</small><small>${esc(elapsed((task.completedAt || now()) - task.startedAt))}</small></div>
        ${actionMarkup(task)}
      </article>`;
    }).join('') : '<div class="sentinel-task-empty">No active tasks. Operations you start will appear here.</div>';
  }

  function findRecentSignal(dedupeKey) {
    if (!dedupeKey) return null;
    const t = now();
    return [...tasks.values()].reverse().find(task =>
      task.status === 'running' &&
      task.dedupeKey === dedupeKey &&
      t - task.lastSignalAt <= DEDUPE_WINDOW_MS
    ) || null;
  }

  function create(label, options = {}) {
    ensurePanel();
    const dedupeKey = options.coalesce === false ? '' : normalizeKey(options.dedupeKey || '');
    const existing = findRecentSignal(dedupeKey);
    if (existing) {
      existing.signalCount += 1;
      existing.lastSignalAt = now();
      if (options.detail) existing.detail = String(options.detail);
      foregroundTask = existing.id;
      render();
      return existing.id;
    }

    const id = `task-${++sequence}-${now()}`;
    const task = {
      id,
      label: label || 'Sentinel task',
      kind: options.kind || 'operation',
      source: options.source || '',
      status: 'running',
      progress: clamp(options.progress || 1),
      indeterminate: Boolean(options.indeterminate),
      detail: options.detail || 'Starting…',
      cancellable: Boolean(options.cancellable),
      cancel: typeof options.cancel === 'function' ? options.cancel : null,
      resultLabel: options.resultLabel || '',
      resultAction: typeof options.resultAction === 'function' ? options.resultAction : null,
      retryLabel: options.retryLabel || 'Retry',
      retryAction: typeof options.retryAction === 'function' ? options.retryAction : null,
      dedupeKey,
      signalCount: 1,
      lastSignalAt: now(),
      startedAt: now(),
      completedAt: 0,
      lastChangeAt: now(),
      stalled: false,
    };
    tasks.set(id, task);
    foregroundTask = id;
    pruneHistory();
    render();
    return id;
  }

  function update(id, patch = {}) {
    const task = tasks.get(id);
    if (!task) return;
    const before = `${task.progress}|${task.detail}|${task.status}|${task.label}|${task.source}`;
    if (patch.progress != null) task.progress = clamp(patch.progress);
    if (patch.indeterminate != null) task.indeterminate = Boolean(patch.indeterminate);
    if (patch.detail != null) task.detail = String(patch.detail);
    if (patch.label != null) task.label = String(patch.label);
    if (patch.source != null) task.source = String(patch.source);
    if (patch.kind != null) task.kind = String(patch.kind);
    if (patch.status) task.status = patch.status;
    if (patch.resultLabel != null) task.resultLabel = String(patch.resultLabel);
    if (patch.resultAction != null) task.resultAction = typeof patch.resultAction === 'function' ? patch.resultAction : null;
    if (patch.retryLabel != null) task.retryLabel = String(patch.retryLabel);
    if (patch.retryAction != null) task.retryAction = typeof patch.retryAction === 'function' ? patch.retryAction : null;
    const after = `${task.progress}|${task.detail}|${task.status}|${task.label}|${task.source}`;
    if (before !== after) {
      task.lastChangeAt = now();
      task.stalled = false;
    }
    if (task.status !== 'running' && !task.completedAt) task.completedAt = now();
    pruneHistory();
    render();
  }

  function setResult(id, label, action) { update(id, {resultLabel: label || 'Open result', resultAction: action}); }
  function setRetry(id, label, action) { update(id, {retryLabel: label || 'Retry', retryAction: action}); }
  function finish(id, detail = 'Completed') { update(id, {status: 'done', progress: 100, indeterminate:false, detail}); }
  function fail(id, detail = 'Task failed') { update(id, {status: 'failed', detail}); }

  function cancelTask(id) {
    const task = tasks.get(id);
    if (!task || task.status !== 'running') return;
    try { task.cancel?.(); } catch {}
    update(id, {status: 'cancelled', detail: 'Cancellation requested'});
  }

  function invokeTaskAction(id, type) {
    const task = tasks.get(id);
    if (!task) return;
    const action = type === 'result' ? task.resultAction : task.retryAction;
    if (typeof action !== 'function') return;
    try { action(); }
    catch (error) { if (S.notice) S.notice(error?.message || String(error)); }
  }

  function labelForControl(control) {
    const explicit = control.getAttribute('aria-label') || control.title;
    return (explicit || control.textContent || 'Sentinel operation').trim().replace(/\s+/g, ' ');
  }

  function actionable(control) {
    if (!control || control.disabled) return null;
    if (control.matches('[data-scan-center="cancel"],[data-task-cancel],[data-task-result],[data-task-retry],[data-task-center-toggle],[data-task-center-clear]')) return null;
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
    pruneHistory();
    render();
  }, 2000);

  S.TaskCenter = {
    marker:MARKER,
    create,
    update,
    finish,
    fail,
    cancel:cancelTask,
    setResult,
    setRetry,
    prune:pruneHistory,
    tasks,
    limits:{visible:MAX_VISIBLE,retained:MAX_RETAINED,dedupeWindowMs:DEDUPE_WINDOW_MS}
  };
  ensurePanel();
})();
