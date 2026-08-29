// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = selector => document.querySelector(selector);
  let snapshot = null;

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (node) node.replaceChildren();
  }

  function showNotice(message = '') {
    $('#notice').textContent = message;
  }

  async function api(url, options = {}) {
    options.headers = {...(options.headers || {}), 'X-Sentinel-Token': token};
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json')
      ? await response.json().catch(() => ({error: `HTTP ${response.status}`}))
      : null;
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function formatTime(unix) {
    const n = Number(unix || 0);
    if (!n) return '—';
    try { return new Date(n * 1000).toLocaleString(); } catch { return '—'; }
  }

  function shortHash(value) {
    const s = String(value || '');
    return s.length > 18 ? `${s.slice(0, 18)}…` : (s || '—');
  }

  function investigationURL(path) {
    return `/investigation.html#${new URLSearchParams({token, path}).toString()}`;
  }

  function addSummaryCell(grid, label, value) {
    const cell = el('div');
    cell.append(el('span', '', label), el('b', '', value));
    grid.append(cell);
  }

  function renderSummary(data) {
    const grid = $('#summaryGrid');
    clear(grid);
    addSummaryCell(grid, 'Visible jobs', Number(data.total || 0));
    addSummaryCell(grid, 'User agents', Number(data.user_agents || 0));
    addSummaryCell(grid, 'System agents', Number(data.system_agents || 0));
    addSummaryCell(grid, 'System daemons', Number(data.system_daemons || 0));
    addSummaryCell(grid, 'Running matches', Number(data.running || 0));
    addSummaryCell(grid, 'Missing targets', Number(data.missing_target || 0));
    $('#summaryNote').textContent = data.note || '';
  }

  function runtimeState(item) {
    if (item.executable && !item.target_exists) return 'missing';
    return item.running ? 'running' : 'stopped';
  }

  function filteredItems() {
    const query = ($('#serviceSearch').value || '').trim().toLowerCase();
    const scope = $('#scopeFilter').value;
    const runtime = $('#runtimeFilter').value;
    return (snapshot?.items || []).filter(item => {
      if (scope && item.scope !== scope) return false;
      if (runtime && runtimeState(item) !== runtime) return false;
      if (!query) return true;
      const haystack = [item.label, item.scope, item.plist_path, item.executable, ...(item.explanation || [])].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function statusBadge(item) {
    if (item.executable && !item.target_exists) return el('span', 'badge bad', 'target missing');
    if (item.running) return el('span', 'badge good', 'running');
    return el('span', 'badge', 'not currently matched');
  }

  function addServiceMeta(grid, label, value) {
    const cell = el('div');
    cell.append(el('span', '', label), el('b', '', value));
    grid.append(cell);
  }

  function openInvestigation(path) {
    if (!path || !String(path).startsWith('/')) {
      showNotice('This relationship does not expose an absolute path that can be investigated.');
      return;
    }
    location.href = investigationURL(path);
  }

  async function openDetail(item, button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Inspecting…';
    showNotice('');
    try {
      const detail = await api('/api/launch-services/detail', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({plist_path: item.plist_path}),
      });
      renderDetail(detail);
    } catch (error) {
      showNotice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function renderServices() {
    const list = $('#serviceList');
    clear(list);
    const items = filteredItems();
    $('#visibleCount').textContent = `${items.length} visible`;
    if (!items.length) {
      list.append(el('div', 'empty', 'No visible launch relationship matches these filters.'));
      return;
    }

    for (const item of items) {
      const card = el('article', 'service');
      const head = el('div', 'service-head');
      const copy = el('div');
      copy.append(el('h3', '', item.label || item.plist_path || 'Launch item'));
      copy.append(el('div', 'mono', item.plist_path || '—'));
      head.append(copy, statusBadge(item));
      card.append(head);

      const meta = el('div', 'service-meta');
      meta.append(el('span', 'badge', item.scope || 'unknown scope'));
      if (item.run_at_load) meta.append(el('span', 'badge warn', 'RunAtLoad'));
      if (item.keep_alive) meta.append(el('span', 'badge warn', 'KeepAlive'));
      if (item.running_pids?.length) meta.append(el('span', 'badge good', `PID ${item.running_pids.join(', ')}`));
      card.append(meta);

      const grid = el('div', 'service-grid');
      addServiceMeta(grid, 'Executable', item.executable || 'Not resolved');
      addServiceMeta(grid, 'Target', item.executable ? (item.target_exists ? 'Present' : 'Missing') : 'Unresolved');
      addServiceMeta(grid, 'Modified', formatTime(item.modified_at));
      addServiceMeta(grid, 'Plist SHA-256', shortHash(item.sha256 || item.hash_status));
      card.append(grid);

      if ((item.explanation || []).length) {
        const ul = el('ul', 'explain-list');
        for (const line of item.explanation.slice(0, 6)) ul.append(el('li', '', line));
        card.append(ul);
      }

      const actions = el('div', 'service-actions');
      const details = el('button', '', 'Explain launch');
      details.type = 'button';
      details.addEventListener('click', () => openDetail(item, details));
      actions.append(details);

      const plist = el('button', '', 'Investigate plist');
      plist.type = 'button';
      plist.addEventListener('click', () => openInvestigation(item.plist_path));
      actions.append(plist);

      if (item.executable) {
        const target = el('button', '', 'Investigate executable');
        target.type = 'button';
        target.addEventListener('click', () => openInvestigation(item.executable));
        actions.append(target);
      }
      card.append(actions);

      for (const limitation of item.limitations || []) {
        card.append(el('p', 'note', `Limitation: ${limitation}`));
      }
      list.append(card);
    }
  }

  function renderObjectInspection(title, inspection) {
    const section = el('section', 'detail-section');
    section.append(el('h3', '', title));
    if (!inspection) {
      section.append(el('div', 'empty', 'No object inspection returned.'));
      return section;
    }
    const grid = el('div', 'kv-grid');
    addServiceMeta(grid, 'Path', inspection.path || '—');
    addServiceMeta(grid, 'Kind', inspection.kind || '—');
    addServiceMeta(grid, 'Mode', inspection.mode || '—');
    addServiceMeta(grid, 'Modified', inspection.modified_at || '—');
    section.append(grid);

    for (const query of inspection.queries || []) {
      const block = el('div', 'query-block');
      block.append(el('h4', '', `${query.tool_name || query.tool_id || 'Evidence'} · ${query.status || 'unknown'}`));
      const pre = el('pre');
      pre.textContent = query.output || '(no output)';
      block.append(pre);
      section.append(block);
    }
    return section;
  }

  function renderDetail(detail) {
    const panel = $('#detailPanel');
    const body = $('#detailBody');
    clear(body);
    panel.classList.remove('hidden');
    const item = detail.item || {};
    $('#detailTitle').textContent = item.label || 'Launch service detail';

    const grid = el('div', 'kv-grid');
    addServiceMeta(grid, 'Scope', item.scope || '—');
    addServiceMeta(grid, 'RunAtLoad', item.run_at_load ? 'Yes' : 'No');
    addServiceMeta(grid, 'KeepAlive', item.keep_alive || 'Not observed');
    addServiceMeta(grid, 'Running', item.running ? `Yes · PID ${(item.running_pids || []).join(', ')}` : 'No exact current match');
    addServiceMeta(grid, 'Plist', item.plist_path || '—');
    addServiceMeta(grid, 'Executable', item.executable || 'Not resolved');
    body.append(grid);

    if ((item.explanation || []).length) {
      const section = el('section', 'detail-section');
      section.append(el('h3', '', 'Why this starts automatically'));
      for (const line of item.explanation) {
        const block = el('div', 'evidence-block');
        block.append(el('span', '', line));
        section.append(block);
      }
      body.append(section);
    }

    const actions = el('div', 'service-actions');
    if (item.plist_path) {
      const button = el('button', '', 'Continue from plist');
      button.type = 'button';
      button.addEventListener('click', () => openInvestigation(item.plist_path));
      actions.append(button);
    }
    if (item.executable) {
      const button = el('button', '', 'Continue from executable');
      button.type = 'button';
      button.addEventListener('click', () => openInvestigation(item.executable));
      actions.append(button);
    }
    body.append(actions);
    body.append(renderObjectInspection('Configuration evidence', detail.plist));
    if (item.executable) body.append(renderObjectInspection('Target evidence', detail.target));
    if (detail.note) body.append(el('p', 'note', detail.note));
    panel.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function renderLimitations(data) {
    const panel = $('#limitationsPanel');
    const list = $('#limitationsList');
    clear(list);
    const limitations = data.limitations || [];
    if (!limitations.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    for (const item of limitations) list.append(el('div', '', `• ${item}`));
  }

  async function loadLaunchServices() {
    const button = $('#refreshLaunchServices');
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Refreshing…';
    showNotice('');
    try {
      snapshot = await api('/api/launch-services');
      renderSummary(snapshot);
      renderServices();
      renderLimitations(snapshot);
    } catch (error) {
      showNotice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  for (const selector of ['#serviceSearch', '#scopeFilter', '#runtimeFilter']) {
    $(selector).addEventListener('input', renderServices);
    $(selector).addEventListener('change', renderServices);
  }
  $('#refreshLaunchServices').addEventListener('click', loadLaunchServices);
  $('#closeDetail').addEventListener('click', () => $('#detailPanel').classList.add('hidden'));
  $('#backLink').href = `/#token=${encodeURIComponent(token)}`;
  $('#systemConsoleLink').href = `/system-console.html#token=${encodeURIComponent(token)}`;

  if (!token) {
    showNotice('Missing Sentinel session token. Open Launch & Service Explorer from the running Sentinel session.');
  } else {
    loadLaunchServices();
  }
})();
