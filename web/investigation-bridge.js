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

  function incidentEvidencePaths(incident) {
    const paths = [];
    const seen = new Set();
    const add = value => {
      const path = cleanAbsolutePath(value);
      if (!path || seen.has(path)) return;
      seen.add(path);
      paths.push(path);
    };
    add(incident?.primary_path);
    for (const evidence of incident?.evidence || []) {
      // Only accept fields that are already explicit absolute paths. Sentinel does
      // not guess a path out of arbitrary prose because that would create false
      // investigation branches from human-readable evidence text.
      for (const value of [evidence?.path, evidence?.object_key, evidence?.target, evidence?.detail]) add(value);
      if (paths.length >= 6) break;
    }
    return paths.slice(0, 6);
  }

  function incidentStartingPath(incident) {
    return incidentEvidencePaths(incident)[0] || '';
  }

  function investigationURL(path) {
    const params = new URLSearchParams({token, path});
    return `/investigation.html#${params.toString()}`;
  }

  function shortPathLabel(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    const leaf = parts[parts.length - 1] || path;
    return leaf.length > 34 ? `${leaf.slice(0, 31)}…` : leaf;
  }

  function makeContinueButton(path, title, label = 'Continue Investigation') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tiny continue-investigation';
    button.textContent = label;
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
      if (card.dataset.sentinelIncidentBranches === '1') return;
      const incident = rendered[index];
      const paths = incidentEvidencePaths(incident);
      if (!paths.length) return;
      card.dataset.sentinelIncidentBranches = '1';

      let row = card.querySelector('.row-actions');
      if (!row) {
        row = document.createElement('div');
        row.className = 'row-actions investigation-actions';
        card.append(row);
      }
      paths.forEach((path, pathIndex) => {
        const label = pathIndex === 0
          ? 'Continue Investigation'
          : `Evidence: ${shortPathLabel(path)}`;
        row.append(
          makeContinueButton(
            path,
            pathIndex === 0
              ? 'Continue from this incident object into file, runtime, persistence, network, and Object Story evidence.'
              : `Continue directly from this explicit local evidence node: ${path}`,
            label,
          )
        );
      });

      if (paths.length > 1) {
        const hint = document.createElement('small');
        hint.className = 'muted';
        hint.textContent = `${paths.length} explicit local evidence branches available`;
        row.append(hint);
      }
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
