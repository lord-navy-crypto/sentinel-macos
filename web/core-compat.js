// SPDX-License-Identifier: MPL-2.0
/*
 * Small compatibility bridge loaded before app.js.
 *
 * Keep critical compatibility functions and localhost job feedback here so a
 * presentation layer cannot break the core Sentinel event-binding chain.
 */

function readinessEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

async function loadReadiness() {
  const button = document.getElementById('runReadiness');
  const body = document.getElementById('readinessBody');
  const notice = document.getElementById('notice');
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';

  if (!body) return;

  const oldLabel = button?.textContent || 'Check Sentinel readiness';
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking readiness…';
  }

  try {
    const response = await fetch('/api/readiness', {
      headers: {'X-Sentinel-Token': token}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

    const checks = Array.isArray(data.checks) ? data.checks : [];
    const runtime = data.runtime || {};
    const checkRows = checks.length
      ? checks.map(check => {
          const status = String(check.status || 'info').toLowerCase();
          const badgeClass = status === 'high' ? 'bad' : status === 'review' ? 'warn' : status === 'pass' ? 'good' : '';
          return `<div class="history-row"><span class="badge ${badgeClass}">${readinessEscape(status)}</span><b>${readinessEscape(check.title || check.area || 'Check')}</b><small>${readinessEscape(check.detail || '')}</small></div>`;
        }).join('')
      : '<div class="empty">No readiness checks were returned.</div>';

    body.innerHTML = `
      <div class="baseline-grid">
        <div><span>Score</span><b>${Number(data.score || 0)} / 100</b></div>
        <div><span>Band</span><b>${readinessEscape(data.band || 'unknown')}</b></div>
        <div><span>Version</span><b>${readinessEscape(data.version || '—')}</b></div>
        <div><span>Session</span><b>${runtime.ephemeral ? 'Ephemeral' : 'Persistent local'}</b></div>
      </div>
      <div class="story-section"><h4>Readiness checks</h4>${checkRows}</div>
      <p class="muted">${readinessEscape(data.note || '')}</p>`;

    if (notice) {
      notice.textContent = `Sentinel readiness: ${Number(data.score || 0)}/100 · ${data.band || 'complete'}.`;
      notice.classList.remove('hidden');
    }
  } catch (error) {
    const message = `Readiness check failed: ${error?.message || 'unknown error'}`;
    body.innerHTML = `<div class="empty">${readinessEscape(message)}</div>`;
    if (notice) {
      notice.textContent = message;
      notice.classList.remove('hidden');
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }
}

window.loadReadiness = loadReadiness;

/*
 * Storage job phase bridge.
 *
 * The original app.js predates phase-aware storage jobs and only renders
 * current_path. During duplicate hashing that made a completed directory walk
 * appear frozen on its final path. Observe the real /api/storage/jobs payload
 * for every localhost UI (not only desktop=1) and render the engine's phase,
 * percentage, hash-byte progress, and current hash target.
 */
(() => {
  if (window.__sentinelCoreStorageProgressInstalled) return;
  window.__sentinelCoreStorageProgressInstalled = true;

  const formatBytes = value => {
    let n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(n >= 10 || i === 0 ? 1 : 2)} ${units[i]}`;
  };

  const phaseLabel = phase => ({
    walking: 'Scanning files',
    grouping: 'Preparing duplicate candidates',
    hashing: 'Hashing duplicate candidates',
    finalizing: 'Building storage report',
    complete: 'Storage scan complete',
    cancelled: 'Storage scan cancelled',
    failed: 'Storage scan failed'
  }[phase] || 'Scanning storage');

  const ensureProgressElements = () => {
    const panel = document.getElementById('scanProgress');
    if (!panel) return {};
    let bar = document.getElementById('storagePhaseProgress');
    let detail = document.getElementById('storagePhaseDetail');
    if (!bar) {
      bar = document.createElement('progress');
      bar.id = 'storagePhaseProgress';
      bar.className = 'mini-progress';
      bar.max = 100;
      bar.value = 0;
      panel.appendChild(bar);
    }
    if (!detail) {
      detail = document.createElement('small');
      detail.id = 'storagePhaseDetail';
      detail.className = 'muted';
      panel.appendChild(detail);
    }
    return {bar, detail};
  };

  const renderStorageJob = job => {
    if (!job || typeof job !== 'object' || !job.status) return;
    const phase = String(job.phase || (job.status === 'running' ? 'walking' : job.status));
    const percent = Math.max(0, Math.min(100, Number(job.phase_percent || (job.status === 'complete' ? 100 : 0))));
    const files = Number(job.files_visited || 0);
    const dirs = Number(job.dirs_visited || 0);
    const limits = Number(job.permission_errors || 0);
    const state = document.getElementById('scanState');
    const counts = document.getElementById('scanCounts');
    const path = document.getElementById('scanPath');
    const {bar, detail} = ensureProgressElements();
    const label = phaseLabel(phase);

    if (state) state.textContent = `${label} · ${Math.round(percent)}%`;
    if (bar) bar.value = percent;
    if (path) path.textContent = job.current_hash_path || job.current_path || '';

    let message = `${files.toLocaleString()} files · ${dirs.toLocaleString()} folders · ${limits.toLocaleString()} permission limits`;
    if (phase === 'walking') {
      message += ' · directory-phase percentage is estimated because the scope is not pre-counted.';
    } else if (phase === 'grouping') {
      message += ' · directory traversal is complete; selecting same-size duplicate candidates.';
    } else if (phase === 'hashing') {
      const done = Number(job.hash_files_done || 0);
      const total = Number(job.hash_files_total || 0);
      const bytesDone = Number(job.hash_bytes_done || 0);
      const bytesTotal = Number(job.hash_bytes_total || 0);
      message += total > 0
        ? ` · hash file ${Math.min(done + 1, total)}/${total} · ${formatBytes(bytesDone)} of ${formatBytes(bytesTotal)} planned SHA-256 work.`
        : ' · no comparable duplicate group fits the bounded hash budget; hashing will be skipped.';
    } else if (phase === 'finalizing') {
      message += ` · ${formatBytes(job.hash_bytes_done || 0)} duplicate-candidate data hashed; assembling the report.`;
    } else if (phase === 'complete') {
      message += ` · ${formatBytes(job.hash_bytes_done || job.result?.duplicate_hash_bytes || 0)} duplicate-candidate data hashed.`;
    } else if (phase === 'cancelled') {
      message += ' · cancelled safely.';
    } else if (phase === 'failed') {
      message += ` · ${job.error || 'storage job failed'}`;
    }

    if (counts) counts.textContent = message;
    if (detail) detail.textContent = message;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const raw = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const url = new URL(raw, location.origin);
      if (url.pathname === '/api/storage/jobs' && response.headers.get('content-type')?.includes('application/json')) {
        const job = await response.clone().json().catch(() => null);
        if (job) requestAnimationFrame(() => renderStorageJob(job));
      }
    } catch {
      // Never interfere with the core request if progress rendering fails.
    }
    return response;
  };
})();

/*
 * v2.3 System Console entry point.
 *
 * Keep this separate from SPA navigation so the new control-plane surface can
 * evolve without destabilizing the v2.2 view/router contract.
 */
(() => {
  if (document.getElementById('systemConsoleShortcut')) return;
  const actions = document.querySelector('.sidebar-actions');
  if (!actions) return;
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const button = document.createElement('button');
  button.id = 'systemConsoleShortcut';
  button.className = 'side-action';
  button.type = 'button';
  button.textContent = 'System Console';
  button.title = 'Open the v2.3 visual macOS System Console';
  button.addEventListener('click', () => {
    location.href = `/system-console.html#token=${encodeURIComponent(token)}`;
  });
  actions.appendChild(button);
})();