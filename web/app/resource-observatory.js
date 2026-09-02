// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.3 Resource Observatory Visual Native — measured resource state,
// trend-first presentation, retained history, and bounded explanations.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;
  const {$, api, esc, bytes, table, band, question, empty, activity, notice, registerLens} = S;
  const MARKER = 'Sentinel 3.3 Resource Observatory Visual Native';
  let sampling = false;

  function injectStyle() {
    if (document.querySelector('link[data-resource-observatory-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/app/resource-observatory.css';
    link.dataset.resourceObservatoryStyle = '1';
    document.head.appendChild(link);
  }

  function clamp(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }
  function fmtPct(v) { return Number.isFinite(Number(v)) && Number(v) >= 0 ? `${Number(v).toFixed(1)}%` : '—'; }
  function processName(command) {
    const parts = String(command || '').split('/');
    return parts[parts.length - 1] || command || 'Unknown';
  }
  function deltaRate(samples, key) {
    if (!samples || samples.length < 2) return null;
    const a = samples[samples.length - 2], b = samples[samples.length - 1];
    const dt = (Date.parse(b.captured_at) - Date.parse(a.captured_at)) / 1000;
    if (!(dt > 0)) return null;
    const diff = Number(b[key] || 0) - Number(a[key] || 0);
    return diff >= 0 ? diff / dt : null;
  }
  function rateText(value) { return value == null ? 'building history…' : `${bytes(value)}/s`; }

  function sparkline(samples, key, maxHint = null) {
    const rows = (samples || []).slice(-60);
    if (rows.length < 2) return '<div class="ro-spark-empty">Collect at least two samples for a trend.</div>';
    const values = rows.map(x => Math.max(0, Number(x[key] || 0)));
    const max = Math.max(maxHint || 0, ...values, 1);
    const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${34 - (v / max) * 30}`).join(' ');
    return `<svg class="ro-spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"></polyline></svg>`;
  }

  function metricCard(label, value, detail, samples, key, maxHint = null) {
    return `<article class="ro-metric"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail || '')}</small>${key ? sparkline(samples, key, maxHint) : ''}</article>`;
  }

  function processTable(rows, kind) {
    if (!rows?.length) return empty(`No ${kind} process rows were returned.`);
    return table(['PID', kind === 'CPU' ? 'CPU' : 'Memory', 'App / process', ''], rows.slice(0, 10).map(p => [
      `<b>${Number(p.pid || 0)}</b>`,
      kind === 'CPU' ? `${Number(p.cpu_percent || 0).toFixed(1)}%` : bytes(p.rss_bytes),
      esc(processName(p.command)),
      `<button data-story-pid="${Number(p.pid || 0)}">Explain</button>`,
    ]));
  }

  function batteryText(sample) {
    if (!sample.battery_available) return 'Not reported';
    if (sample.battery_charging) return `${sample.battery_percent}% · charging`;
    if (sample.battery_ac) return `${sample.battery_percent}% · AC power`;
    return `${sample.battery_percent}% · battery`;
  }

  function hero(sample) {
    const cpu = clamp(sample.cpu_percent);
    const mem = Number(sample.memory_free_percent);
    const battery = batteryText(sample);
    const headline = cpu >= 80 ? 'High CPU activity is visible right now.' : sample.swap_used_bytes > 0 ? 'Current resource state includes active swap.' : 'A live picture of this Mac, without a synthetic health score.';
    return `<section class="vn-hero ro-hero">
      <div class="vn-hero-copy">
        <div class="vn-eyebrow">LIVE RESOURCE PICTURE / 当前资源图像</div>
        <h2>Your Mac, right now.</h2>
        <p>${esc(headline)} Sentinel shows measured resource state first, then gives you process evidence and explanations. It does not turn one number into a hardware-health verdict.</p>
        <div class="vn-stat-grid">
          <div class="vn-stat"><span>CPU</span><b>${fmtPct(sample.cpu_percent)}</b><small>Normalized across logical CPUs</small></div>
          <div class="vn-stat"><span>Memory free</span><b>${mem >= 0 ? `${mem}%` : '—'}</b><small>${bytes(sample.compressed_bytes)} compressed</small></div>
          <div class="vn-stat"><span>Swap</span><b>${bytes(sample.swap_used_bytes)}</b><small>Observed swap in use</small></div>
          <div class="vn-stat"><span>Battery</span><b>${esc(battery)}</b><small>${esc(sample.battery_condition || 'No private Energy Impact metric')}</small></div>
        </div>
      </div>
      <div class="vn-hero-score">
        <span>Live CPU load</span>
        <strong>${fmtPct(sample.cpu_percent)}</strong>
        <small>${Number(sample.logical_cpus || 0) ? `${Number(sample.logical_cpus)} logical CPUs` : 'Current normalized load'}</small>
      </div>
    </section>`;
  }

  function chartPoints(rows, key) {
    const values = rows.map(x => Number(x[key]));
    return values.map((v, i) => {
      const x = 28 + (i / Math.max(1, values.length - 1)) * 744;
      const y = 166 - clamp(v) * 1.36;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function trendBoard(history, sample) {
    const rows = (history || []).slice(-60);
    if (rows.length < 2) {
      return `<div class="vn-trend-board"><div class="vn-trend-head"><div><div class="vn-kicker">TREND FIRST</div><h3>Build a real trend</h3><p>At least two measured observations are needed. Use Refresh or the 60-second sampler.</p></div></div>${empty('No trend line is drawn from a single point.')}</div>`;
    }
    const cpuPts = chartPoints(rows, 'cpu_percent');
    const memPts = chartPoints(rows, 'memory_free_percent');
    const batteryRows = rows.filter(x => x.battery_available && Number.isFinite(Number(x.battery_percent)));
    const batteryPts = batteryRows.length > 1 ? chartPoints(batteryRows, 'battery_percent') : '';
    return `<div class="vn-trend-board">
      <div class="vn-trend-head"><div><div class="vn-kicker">TREND FIRST</div><h3>Resource trend</h3><p>${rows.length} measured sample(s) in this view · percentage scale 0–100</p></div><small>${esc(sample.captured_at || '')}</small></div>
      <svg class="vn-chart" viewBox="0 0 800 190" preserveAspectRatio="none" role="img" aria-label="CPU, memory free and battery percentage trend">
        <defs><linearGradient id="vnAreaA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fdcff"/><stop offset="1" stop-color="#6fdcff" stop-opacity="0"/></linearGradient></defs>
        <line class="vn-grid-line" x1="28" y1="30" x2="772" y2="30"/><line class="vn-grid-line" x1="28" y1="98" x2="772" y2="98"/><line class="vn-grid-line" x1="28" y1="166" x2="772" y2="166"/>
        <text class="vn-axis-label" x="2" y="33">100</text><text class="vn-axis-label" x="8" y="101">50</text><text class="vn-axis-label" x="14" y="169">0</text>
        <polyline class="vn-line-a" points="${cpuPts}"/>
        <polyline class="vn-line-b" points="${memPts}"/>
        ${batteryPts ? `<polyline class="vn-line-c" points="${batteryPts}"/>` : ''}
      </svg>
      <div class="vn-chart-legend"><span class="a"><i></i>CPU</span><span class="b"><i></i>Memory free</span>${batteryPts ? '<span class="c"><i></i>Battery</span>' : ''}</div>
    </div>`;
  }

  function renderCurrent(sample, history) {
    const rx = deltaRate(history, 'network_rx_bytes');
    const tx = deltaRate(history, 'network_tx_bytes');
    const dr = deltaRate(history, 'disk_read_bytes');
    const dw = deltaRate(history, 'disk_write_bytes');
    const battery = batteryText(sample);
    return `<div class="ro-grid">
      ${metricCard('CPU', fmtPct(sample.cpu_percent), 'Normalized across logical CPUs', history, 'cpu_percent', 100)}
      ${metricCard('Memory free', sample.memory_free_percent >= 0 ? `${sample.memory_free_percent}%` : '—', `${bytes(sample.compressed_bytes)} compressed · ${bytes(sample.swap_used_bytes)} swap`, history, 'memory_free_percent', 100)}
      ${metricCard('Network', `↓ ${rateText(rx)} · ↑ ${rateText(tx)}`, 'Derived only from observed counter deltas', history, null)}
      ${metricCard('Disk I/O', `R ${rateText(dr)} · W ${rateText(dw)}`, 'Derived only from observed counter deltas', history, null)}
      ${metricCard('Battery', battery, sample.battery_condition ? `${sample.battery_condition}${sample.battery_cycle_count ? ` · ${sample.battery_cycle_count} cycles` : ''}` : 'No private Energy Impact metric is fabricated', history, 'battery_percent', 100)}
      ${metricCard('Sleep assertions', String((sample.preventing_sleep || []).length), 'Power assertions that may affect sleep behavior', history, null)}
    </div>`;
  }

  async function getHistory(windowName = '1h') {
    const data = await api(`/api/resource/history?window=${encodeURIComponent(windowName)}`);
    return data.samples || [];
  }

  async function refreshObservatory(windowName = '1h') {
    activity('Observing', 15, 'Collecting current CPU, memory, disk, network and battery evidence');
    const current = await api('/api/resource/current');
    const history = await getHistory(windowName);
    const sample = current.sample || {};
    const stage = $('#evidenceStage');
    if (!stage || S.state.lens !== 'observatory') return;
    stage.innerHTML = question(`<button class="s24-action primary" type="button" data-ro-sample>Sample 60s</button><button class="s24-action" type="button" data-ro-refresh>Refresh now</button>`)
      + hero(sample)
      + band(1, 'Trend / 趋势', `<div class="ro-history-head"><div><button data-ro-window="5m">5m</button><button data-ro-window="30m">30m</button><button data-ro-window="1h" class="active">1h</button><button data-ro-window="6h">6h</button></div><small>${history.length} retained session sample(s)</small></div>${trendBoard(history, sample)}`, 'Visual trend first. Complete process evidence follows below; Sentinel does not infer a long-term pattern from missing history.')
      + band(2, 'Key measurements / 关键数值', renderCurrent(sample, history), 'Measured local state. Rates require at least two observations; Sentinel does not invent missing throughput.')
      + band(3, 'Top resource processes', `<div class="ro-process-columns"><section><h3>Top CPU now</h3>${processTable(sample.top_cpu, 'CPU')}</section><section><h3>Top memory now</h3>${processTable(sample.top_memory, 'Memory')}</section></div>`, 'High usage is context, not suspicion. Open a process story before interpreting identity or intent.')
      + band(4, 'Explain with evidence', `<div class="ro-explain-actions"><button class="s24-action primary" type="button" data-ro-explain="slow">Why is my Mac slow?</button><button class="s24-action" type="button" data-ro-explain="battery">Why is my battery draining?</button></div><div id="roExplanation">${empty('Choose a question. Sentinel will separate observations, interpretation, contributors, and what is not established.')}</div>`, 'Explanations use current observed evidence and explicitly preserve uncertainty.')
      + band(5, 'Power and visibility notes', `<div class="ro-notes">${(sample.preventing_sleep || []).length ? `<div class="s24-note warn"><b>Sleep-related assertions observed</b><br>${(sample.preventing_sleep || []).map(esc).join('<br>')}</div>` : '<div class="s24-note good">No matching sleep-prevention assertion lines were observed in this sample.</div>'}${(sample.limited || []).length ? `<div class="s24-note warn"><b>Limited evidence</b><br>${sample.limited.map(esc).join(' · ')}</div>` : '<div class="s24-note good">The requested observatory sources responded for this sample.</div>'}</div>`, 'Unavailable evidence lowers confidence; it is never converted into a healthy verdict.');
    activity('Ready', 100, `Resource Observatory updated · ${history.length} history sample(s)`);
  }

  async function explain(mode) {
    const host = $('#roExplanation');
    if (!host) return;
    host.innerHTML = empty('Collecting a fresh evidence sample…');
    try {
      const data = await api(`/api/resource/explain?mode=${encodeURIComponent(mode)}`);
      const e = data.explanation || {};
      const contributors = e.contributors || [];
      host.innerHTML = `<div class="ro-explanation"><section><span>OBSERVED</span>${(e.observed || []).length ? `<ul>${e.observed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>No thresholded current signal was observed.</p>'}</section><section><span>INTERPRETATION</span><p>${esc(e.interpretation || '')}</p></section>${contributors.length ? `<section><span>RELEVANT CONTRIBUTORS</span>${processTable(contributors, 'CPU')}</section>` : ''}<section class="unknown"><span>NOT ESTABLISHED</span><p>${esc(e.not_established || '')}</p></section></div>`;
    } catch (error) {
      host.innerHTML = `<div class="s24-note warn">${esc(error?.message || String(error))}</div>`;
    }
  }

  async function sampleFor60Seconds() {
    if (sampling) return;
    sampling = true;
    const total = 12;
    const tc = S.TaskCenter;
    const task = tc?.create('Resource History · 60s', {kind:'resource-history', progress:0, detail:`0 / ${total} measured samples`});
    try {
      for (let i = 1; i <= total; i++) {
        activity('Sampling resources', Math.round((i - 1) / total * 100), `${i - 1}/${total} retained samples`);
        await api('/api/resource/current');
        tc?.update(task, {progress:i / total * 100, detail:`${i} / ${total} measured samples`});
        if (i < total) await new Promise(resolve => setTimeout(resolve, 5000));
      }
      tc?.finish(task, `${total} / ${total} measured samples retained for this session`);
      await refreshObservatory('5m');
    } catch (error) {
      tc?.fail(task, error?.message || String(error));
      notice(error?.message || String(error));
    } finally {
      sampling = false;
    }
  }

  async function renderObservatory() {
    injectStyle();
    await refreshObservatory('1h');
  }

  document.addEventListener('click', event => {
    const sample = event.target.closest('[data-ro-sample]');
    if (sample) { event.preventDefault(); void sampleFor60Seconds(); return; }
    const refresh = event.target.closest('[data-ro-refresh]');
    if (refresh) { event.preventDefault(); void refreshObservatory('1h'); return; }
    const explainButton = event.target.closest('[data-ro-explain]');
    if (explainButton) { event.preventDefault(); void explain(explainButton.dataset.roExplain); return; }
    const windowButton = event.target.closest('[data-ro-window]');
    if (windowButton) { event.preventDefault(); void refreshObservatory(windowButton.dataset.roWindow); }
  });

  registerLens('observatory', renderObservatory);
  S.ResourceObservatory = {marker:MARKER, render:renderObservatory, refresh:refreshObservatory, sampleFor60Seconds};
  injectStyle();
  const initial = new URLSearchParams(location.hash.slice(1)).get('lens');
  if (initial === 'observatory' && typeof S.navigate === 'function') void S.navigate('observatory', {push:false});
})();