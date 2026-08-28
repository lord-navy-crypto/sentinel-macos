// SPDX-License-Identifier: MPL-2.0
(() => {
  if (window.__sentinelInvestigationBridgeInstalled) return;
  window.__sentinelInvestigationBridgeInstalled = true;

  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  let lastFindings = [];
  let lastIncidents = [];

  function cleanAbsolutePath(value) {
    const raw = String(value || '').trim();
    if (!raw.startsWith('/')) return '';
    if (raw.includes('\n') || raw.includes('\r') || raw.length > 4096) return '';
    return raw;
  }

  function findingStartingPath(finding) {
    const detail = cleanAbsolutePath(finding?.detail);
    if (detail) return detail;
    for (const item of finding?.evidence || []) {
      const path = cleanAbsolutePath(item);
      if (path) return path;
    }
    return '';
  }

  function incidentStartingPath(incident) {
    const primary = cleanAbsolutePath(incident?.primary_path);
    if (primary) return primary;
    for (const evidence of incident?.evidence || []) {
      for (const value of [evidence?.path, evidence?.object_key, evidence?.target]) {
        const path = cleanAbsolutePath(value);
        if (path) return path;
      }
    }
    return '';
  }

  function investigationURL(path) {
    const params = new URLSearchParams({token, path});
    return `/investigation.html#${params.toString()}`;
  }

  function makeContinueButton(path, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tiny continue-investigation';
    button.textContent = 'Continue Investigation';
    button.title = title;
    button.addEventListener('click', () => {
      location.href = investigationURL(path);
    });
    return button;
  }

  function attachSecurityButtons() {
    const container = document.getElementById('findings');
    if (!container || !lastFindings.length) return;
    const cards = [...container.querySelectorAll('article.finding')];
    cards.forEach((card, index) => {
      if (card.querySelector('.continue-investigation')) return;
      const finding = lastFindings[index];
      const path = findingStartingPath(finding);
      if (!path) return;

      const row = document.createElement('div');
      row.className = 'row-actions investigation-actions';
      row.append(
        makeContinueButton(path, 'Branch from this finding into deeper local evidence without modifying files.')
      );

      const hint = document.createElement('small');
      hint.className = 'muted';
      hint.textContent = 'Report → object → deeper evidence';
      row.append(hint);
      card.append(row);
    });
  }

  function attachIncidentButtons() {
    const container = document.getElementById('incidentList');
    if (!container || !lastIncidents.length) return;
    const cards = [...container.querySelectorAll('.behavior-change')];
    const rendered = lastIncidents.slice().reverse();
    cards.forEach((card, index) => {
      if (card.querySelector('.continue-investigation')) return;
      const incident = rendered[index];
      const path = incidentStartingPath(incident);
      if (!path) return;
      let row = card.querySelector('.row-actions');
      if (!row) {
        row = document.createElement('div');
        row.className = 'row-actions investigation-actions';
        card.append(row);
      }
      row.append(
        makeContinueButton(path, 'Continue from this incident primary object into file, runtime, persistence, network, and Object Story evidence.')
      );
    });
  }

  function scheduleAttach() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      attachSecurityButtons();
      attachIncidentButtons();
    }));
    setTimeout(() => {
      attachSecurityButtons();
      attachIncidentButtons();
    }, 120);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const raw = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const url = new URL(raw, location.origin);
      const isJSON = response.ok && response.headers.get('content-type')?.includes('application/json');
      if (url.pathname === '/api/security/audit' && isJSON) {
        response.clone().json().then(data => {
          lastFindings = Array.isArray(data?.findings) ? data.findings : [];
          scheduleAttach();
        }).catch(() => {});
      }
      if (url.pathname === '/api/incidents' && isJSON) {
        response.clone().json().then(data => {
          lastIncidents = Array.isArray(data?.incidents) ? data.incidents : [];
          scheduleAttach();
        }).catch(() => {});
      }
    } catch {
      // Never interfere with the underlying Sentinel request.
    }
    return response;
  };

  const observer = new MutationObserver(() => scheduleAttach());
  const findings = document.getElementById('findings');
  if (findings) observer.observe(findings, {childList: true, subtree: true});
  const incidents = document.getElementById('incidentList');
  if (incidents) observer.observe(incidents, {childList: true, subtree: true});
})();
