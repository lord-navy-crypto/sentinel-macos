// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const groups = document.getElementById('toolGroups');
  if (!groups || !token) return;

  const domainOrder = ['system','security','processes','startup','network','storage','filesystem','integrity','search','backup','power','logs','persistence','changes','trust'];
  const domainInfo = {
    system: ['System & Hardware', 'macOS version, hardware, uptime, updates, profiles, and system extensions.'],
    security: ['Security Posture', 'Gatekeeper, FileVault, SIP, and other security-state evidence.'],
    processes: ['Processes & Resources', 'Running processes, process state, open objects, listeners, and PID-centered evidence.'],
    startup: ['Startup & Services', 'launchd services and links into Sentinel startup investigation/control workflows.'],
    network: ['Network', 'Interfaces, routes, DNS, proxies, neighbors, TCP sockets, quality, and relationship analysis.'],
    storage: ['Storage & Disks', 'Filesystems, disks, APFS layout, storage profile, mount state, and path sizing.'],
    filesystem: ['Files & Metadata', 'Metadata, extended attributes, and Sentinel-managed reversible file actions.'],
    integrity: ['App Integrity', 'Code signing and Gatekeeper assessment for selected apps/files.'],
    search: ['Search & Spotlight', 'Spotlight index visibility and search-related system state.'],
    backup: ['Backup & Recovery Sources', 'Time Machine state and configured destination evidence.'],
    power: ['Power & Battery', 'Battery, power-source policy, assertions, and sleep-related evidence.'],
    logs: ['Bounded System Logs', 'Predefined short log windows for specific macOS subsystems; no unrestricted log query input.'],
    persistence: ['Persistence Configuration', 'Property-list inspection and persistence evidence.'],
    changes: ['Change Intelligence', 'Sentinel change monitoring and reconciliation entry points.'],
    trust: ['Trust & Recovery', 'Trusted-profile recovery and trust-state workflows.'],
  };

  const create = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function withToken(route) {
    if (!route || !route.endsWith('.html')) return `/#token=${encodeURIComponent(token)}`;
    return `${route}#token=${encodeURIComponent(token)}`;
  }

  function enhanceManagedButtons(catalog) {
    const byID = new Map((catalog.tools || []).map(tool => [tool.id, tool]));
    for (const card of groups.querySelectorAll('.tool-card')) {
      const tool = byID.get(card.dataset.toolId || '');
      if (!tool || tool.mode !== 'sentinel_action') continue;
      const old = card.querySelector('button');
      if (!old) continue;
      const replacement = old.cloneNode(true);
      const directWorkspace = String(tool.route || '').endsWith('.html');
      replacement.textContent = directWorkspace ? 'Open workspace' : 'Open Sentinel control';
      replacement.addEventListener('click', () => { location.href = withToken(tool.route || ''); });
      old.replaceWith(replacement);
    }
  }

  function reorganize(catalog) {
    const cards = Array.from(groups.querySelectorAll('.tool-card'));
    if (!cards.length || groups.dataset.domainLayout === '1') return;
    groups.dataset.domainLayout = '1';

    const toolsByID = new Map((catalog.tools || []).map(tool => [tool.id, tool]));
    const byDomain = new Map();
    for (const card of cards) {
      const tool = toolsByID.get(card.dataset.toolId || '');
      const domain = tool?.domain || card.querySelector('.meta .badge')?.textContent?.trim() || 'other';
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push({card, tool});
    }

    groups.replaceChildren();
    const toolbar = create('section', 'terminal-toolbar');
    const title = create('div', 'terminal-toolbar-title');
    title.append(create('b', '', 'Terminal Toolbox'), create('span', '', `${cards.length} typed buttons · fixed commands · bounded execution`));
    const search = create('input', 'terminal-tool-search');
    search.type = 'search'; search.placeholder = 'Filter tools, e.g. network, FileVault, battery, APFS'; search.autocomplete = 'off';
    toolbar.append(title, search);
    groups.append(toolbar);

    const sectionRoot = create('div', 'domain-box-grid');
    groups.append(sectionRoot);

    const domains = Array.from(byDomain.keys()).sort((a,b) => {
      const ai = domainOrder.indexOf(a), bi = domainOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
    });

    for (const domain of domains) {
      const entries = byDomain.get(domain) || [];
      const [label, description] = domainInfo[domain] || [domain, 'Typed macOS system operations and Sentinel workflows.'];
      const box = create('section', 'domain-box'); box.dataset.domain = domain;
      const head = create('header', 'domain-box-header');
      const text = create('div'); text.append(create('p', 'eyebrow', domain), create('h3', '', label), create('p', 'domain-description', description));
      const count = create('span', 'domain-count', `${entries.length} tools`);
      head.append(text, count); box.append(head);
      const grid = create('div', 'domain-tool-grid');
      for (const entry of entries) {
        entry.card.dataset.searchText = `${entry.tool?.name || ''} ${entry.tool?.summary || ''} ${domain} ${entry.tool?.intent || ''}`.toLowerCase();
        grid.append(entry.card);
      }
      box.append(grid); sectionRoot.append(box);
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const box of sectionRoot.querySelectorAll('.domain-box')) {
        let shown = 0;
        for (const card of box.querySelectorAll('.tool-card')) {
          const visible = !q || (card.dataset.searchText || '').includes(q);
          card.hidden = !visible;
          if (visible) shown++;
        }
        box.hidden = shown === 0;
        const badge = box.querySelector('.domain-count');
        if (badge) badge.textContent = q ? `${shown} matching` : `${box.querySelectorAll('.tool-card').length} tools`;
      }
    });

    enhanceManagedButtons(catalog);
  }

  async function loadCatalog() {
    const response = await fetch('/api/system/console', {headers: {'X-Sentinel-Token': token}});
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  let started = false;
  const observer = new MutationObserver(async () => {
    if (started || !groups.querySelector('.tool-card')) return;
    started = true;
    observer.disconnect();
    const catalog = await loadCatalog();
    if (catalog) reorganize(catalog);
  });
  observer.observe(groups, {childList: true, subtree: true});
  if (groups.querySelector('.tool-card')) {
    started = true; observer.disconnect(); loadCatalog().then(catalog => { if (catalog) reorganize(catalog); });
  }
})();
