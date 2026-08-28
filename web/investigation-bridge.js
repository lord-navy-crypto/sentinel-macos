// SPDX-License-Identifier: MPL-2.0
(() => {
  if (window.__sentinelInvestigationBridgeInstalled) return;
  window.__sentinelInvestigationBridgeInstalled = true;

  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  let lastFindings = [];

  function cleanAbsolutePath(value) {
    const raw = String(value || '').trim();
    if (!raw.startsWith('/')) return '';
    if (raw.includes('\n') || raw.includes('\r') || raw.length > 4096) return '';
    return raw;
  }

  function startingPath(finding) {
    const detail = cleanAbsolutePath(finding?.detail);
    if (detail) return detail;
    for (const item of finding?.evidence || []) {
      const path = cleanAbsolutePath(item);
      if (path) return path;
    }
    return '';
  }

  function investigationURL(path) {
    const params = new URLSearchParams({token, path});
    return `/investigation.html#${params.toString()}`;
  }

  function attachButtons() {
    const container = document.getElementById('findings');
    if (!container || !lastFindings.length) return;
    const cards = [...container.querySelectorAll('article.finding')];
    cards.forEach((card, index) => {
      if (card.querySelector('.continue-investigation')) return;
      const finding = lastFindings[index];
      const path = startingPath(finding);
      if (!path) return;

      const row = document.createElement('div');
      row.className = 'row-actions investigation-actions';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary continue-investigation';
      button.textContent = 'Continue Investigation';
      button.title = 'Branch from this finding into deeper local evidence without modifying files.';
      button.addEventListener('click', () => {
        location.href = investigationURL(path);
      });

      const hint = document.createElement('small');
      hint.className = 'muted';
      hint.textContent = 'Report → object → deeper evidence';

      row.append(button, hint);
      card.append(row);
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const raw = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const url = new URL(raw, location.origin);
      if (url.pathname === '/api/security/audit' && response.ok && response.headers.get('content-type')?.includes('application/json')) {
        response.clone().json().then(data => {
          lastFindings = Array.isArray(data?.findings) ? data.findings : [];
          requestAnimationFrame(() => requestAnimationFrame(attachButtons));
          setTimeout(attachButtons, 120);
        }).catch(() => {});
      }
    } catch {
      // Never interfere with the underlying Sentinel request.
    }
    return response;
  };

  const observer = new MutationObserver(() => {
    if (lastFindings.length) attachButtons();
  });
  const findings = document.getElementById('findings');
  if (findings) observer.observe(findings, {childList: true, subtree: true});
})();
