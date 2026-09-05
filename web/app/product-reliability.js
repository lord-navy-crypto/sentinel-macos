// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.8 Product Reliability — Machine-page update intelligence and self-observation.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;

  const MARKER = 'Sentinel 2.8 Product Reliability';
  const baseMachine = S.renderers?.machine;
  if (typeof baseMachine !== 'function') {
    console.warn('Sentinel Product Reliability could not find the Machine renderer.');
    return;
  }

  let channel = 'stable';

  function injectStyle() {
    if (document.querySelector('link[data-sentinel-product-reliability-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/app/product-reliability.css';
    link.dataset.sentinelProductReliabilityStyle = '1';
    document.head.appendChild(link);
  }

  function uptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function metric(label, value, detail = '') {
    return `<div class="pr-metric"><span>${S.esc(label)}</span><b>${S.esc(value)}</b>${detail ? `<small>${S.esc(detail)}</small>` : ''}</div>`;
  }

  function shell() {
    return `<div class="pr-grid">
      <section class="pr-panel">
        <div class="pr-panel-head"><div><div class="pr-kicker">SELF HEALTH / 自身开销</div><h3>Is Sentinel itself staying lightweight?</h3><p>Current local process evidence only. One sample is not a sustained performance verdict.</p></div><button type="button" class="s24-action" data-pr-self-refresh>Refresh</button></div>
        <div id="prSelfHealth"><div class="pr-update-empty">Reading Sentinel's current process overhead…</div></div>
      </section>
      <section class="pr-panel">
        <div class="pr-panel-head"><div><div class="pr-kicker">UPDATE INTELLIGENCE / 更新信息</div><h3>Check releases without installing anything.</h3><p>Manual, read-only GitHub Release discovery. Automatic download and installation remain disabled.</p></div>
          <div class="pr-channel" aria-label="Update channel"><button type="button" class="active" data-pr-channel="stable">Stable</button><button type="button" data-pr-channel="beta">Beta</button></div>
        </div>
        <div id="prUpdateStatus"><div class="pr-update-empty">No network request has been made. Choose “Check for updates” when you want Sentinel to read public release metadata.</div></div>
        <div class="pr-actions"><button type="button" class="s24-action primary" data-pr-update>Check for updates</button></div>
        <div class="pr-boundary">Checking is not updating. This feature does not download, replace, execute, or install application code. A release page or checksum is metadata; production trust still depends on Developer ID signing, notarization, stapling, Gatekeeper verification, and the release trust manifest.</div>
      </section>
    </div>`;
  }

  function selfHealthView(d) {
    const cpu = Number(d.process_cpu_percent || 0);
    const budgetClass = d.above_monitoring_target ? 'bad' : d.above_idle_target ? 'warn' : '';
    const budgetText = d.above_monitoring_target ? 'Above monitoring budget' : d.above_idle_target ? 'Above idle budget' : 'Within idle budget';
    const limits = Array.isArray(d.limited) && d.limited.length ? `<div class="pr-update-note"><strong>Limited:</strong> ${S.esc(d.limited.join(' · '))}</div>` : '';
    return `<div class="pr-metrics">
      ${metric('Process CPU', `${cpu.toFixed(1)}%`, 'current ps sample')}
      ${metric('Process RSS', S.bytes(d.process_rss_bytes), 'resident memory')}
      ${metric('Go heap', S.bytes(d.go_heap_alloc_bytes), `${S.bytes(d.go_heap_sys_bytes)} reserved`)}
      ${metric('Goroutines', String(Number(d.goroutines || 0)), `${Number(d.completed_gc || 0)} completed GC cycles`)}
      ${metric('Sentinel uptime', uptime(d.uptime_seconds), `PID ${Number(d.pid || 0)}`)}
      ${metric('Sample cost', `${Number(d.sample_duration_ms || 0).toFixed(1)} ms`, 'self-health collection')}
    </div>
    <div class="pr-budget"><div><b>Engineering CPU budget</b><small>Idle target ≤ ${Number(d.idle_cpu_target_percent || 1).toFixed(1)}% · normal monitoring target ≤ ${Number(d.monitoring_cpu_target_percent || 3).toFixed(1)}%. These are Sentinel engineering budgets, not Mac health thresholds.</small></div><span class="pr-status ${budgetClass}">${S.esc(budgetText)}</span></div>
    ${limits}`;
  }

  function safeReleaseURL(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') return '';
      if (!url.pathname.startsWith('/lord-navy-crypto/sentinel-macos/')) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function updateView(d) {
    if (!d.latest_version) {
      return `<div class="pr-update-card"><div class="pr-update-note"><strong>No matching release version was established.</strong> Sentinel received release metadata but did not find a parseable ${S.esc(d.channel)} release.</div></div>`;
    }
    const releaseURL = safeReleaseURL(d.release_url);
    const available = Boolean(d.update_available);
    const status = available ? '<span class="pr-status warn">Newer release metadata found</span>' : '<span class="pr-status">No newer version established</span>';
    const asset = d.dmg_name ? `${S.esc(d.dmg_name)}${d.checksum_url ? ' · checksum listed' : ' · checksum asset not listed'}` : 'No DMG asset was listed for this release.';
    return `<div class="pr-update-card">
      <div class="pr-version-row"><div class="pr-version"><span>Current</span><b>${S.esc(d.current_version || '—')}</b></div><div class="pr-version-arrow">→</div><div class="pr-version"><span>Latest ${S.esc(d.channel || channel)}</span><b>${S.esc(d.latest_version)}</b></div></div>
      <div class="pr-budget"><div><b>${S.esc(d.release_name || d.tag_name || 'Release')}</b><small>${S.esc(asset)}${d.published_at ? ` · published ${S.esc(S.fmt(d.published_at))}` : ''}</small></div>${status}</div>
      <div class="pr-update-note"><strong>Trust boundary:</strong> ${S.esc(d.trust_boundary || 'Read-only release discovery.')}</div>
      ${releaseURL ? `<div class="pr-actions"><a class="s24-action" href="${S.esc(releaseURL)}" target="_blank" rel="noopener noreferrer">Open GitHub release page</a></div>` : ''}
    </div>`;
  }

  async function refreshSelfHealth() {
    const host = document.getElementById('prSelfHealth');
    if (!host) return;
    try {
      const data = await S.api('/api/self/health');
      if (!host.isConnected) return;
      host.innerHTML = selfHealthView(data || {});
    } catch (error) {
      if (host.isConnected) host.innerHTML = `<div class="s24-note warn">${S.esc(error?.message || String(error))}</div>`;
    }
  }

  async function checkUpdates() {
    const host = document.getElementById('prUpdateStatus');
    if (!host) return;
    const tc = S.TaskCenter;
    const task = tc?.create(`Check updates · ${channel === 'stable' ? 'Stable' : 'Beta'}`, {
      kind: 'update-check', indeterminate: true, detail: 'Reading public GitHub Release metadata',
    });
    host.innerHTML = '<div class="pr-update-empty">Reading public release metadata…</div>';
    try {
      const data = await S.api(`/api/update/status?channel=${encodeURIComponent(channel)}`);
      if (host.isConnected) host.innerHTML = updateView(data || {});
      tc?.finish(task, `Release metadata checked · ${channel}`);
    } catch (error) {
      const message = error?.message || String(error);
      if (host.isConnected) host.innerHTML = `<div class="s24-note warn">${S.esc(message)}</div>`;
      tc?.fail(task, message);
    }
  }

  async function renderMachineReliability() {
    await baseMachine();
    if (S.state.lens !== 'machine') return;
    const stage = document.getElementById('evidenceStage');
    if (!stage) return;
    stage.insertAdjacentHTML('beforeend', S.band(4, 'Sentinel reliability / Sentinel 自身可靠性', shell(), 'Self-observation and update discovery are kept separate from Mac health evidence. Update checks are manual and read-only.'));
    await refreshSelfHealth();
  }

  document.addEventListener('click', event => {
    const refresh = event.target.closest('[data-pr-self-refresh]');
    if (refresh) { event.preventDefault(); void refreshSelfHealth(); return; }
    const selector = event.target.closest('[data-pr-channel]');
    if (selector) {
      event.preventDefault();
      channel = selector.dataset.prChannel === 'beta' ? 'beta' : 'stable';
      document.querySelectorAll('[data-pr-channel]').forEach(button => button.classList.toggle('active', button.dataset.prChannel === channel));
      const host = document.getElementById('prUpdateStatus');
      if (host) host.innerHTML = `<div class="pr-update-empty">${channel === 'stable' ? 'Stable' : 'Beta'} selected. No network request has been made yet.</div>`;
      return;
    }
    const check = event.target.closest('[data-pr-update]');
    if (check) { event.preventDefault(); void checkUpdates(); }
  });

  injectStyle();
  S.registerLens('machine', renderMachineReliability);
  S.ProductReliability = {marker: MARKER, refreshSelfHealth, checkUpdates};

  if (S.state.lens === 'machine' && typeof S.navigate === 'function') {
    void S.navigate('machine', {push:false});
  }
})();
