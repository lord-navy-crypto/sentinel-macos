// SPDX-License-Identifier: MPL-2.0
/*
 * Small compatibility bridge loaded before app.js.
 *
 * app.js binds the Final Readiness button by the global name loadReadiness.
 * Keep this function global so a missing readiness renderer can never abort the
 * rest of the core event-binding chain.
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
