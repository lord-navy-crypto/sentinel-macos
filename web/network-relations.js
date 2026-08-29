// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = selector => document.querySelector(selector);
  let snapshot = [];

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

  function processURL(pid) {
    return `/process-relations.html#${new URLSearchParams({token, pid: String(pid)}).toString()}`;
  }

  function endpointKey(item) {
    const state = String(item.state || 'OTHER').toUpperCase();
    const endpoint = state === 'LISTEN'
      ? (item.local || item.address || 'unknown')
      : (item.remote || item.address || item.local || 'unknown');
    return `${state}|${item.endpoint_class || 'unclassified'}|${endpoint}`;
  }

  function endpointLabel(item) {
    const state = String(item.state || 'OTHER').toUpperCase();
    if (state === 'LISTEN') return item.local || item.address || 'unknown endpoint';
    return item.remote || item.address || item.local || 'unknown endpoint';
  }

  function matchesFilters(item) {
    const state = $('#stateFilter').value;
    const endpointClass = $('#classFilter').value;
    const query = $('#searchInput').value.trim().toLowerCase();
    if (state !== 'all' && String(item.state || 'OTHER').toUpperCase() !== state) return false;
    if (endpointClass !== 'all' && String(item.endpoint_class || 'unclassified') !== endpointClass) return false;
    if (!query) return true;
    const haystack = [
      item.command, item.pid, item.user, item.state, item.address,
      item.local, item.remote, item.endpoint_class,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return haystack.includes(query);
  }

  function groupByProcess(items) {
    const map = new Map();
    for (const item of items) {
      const pid = Number(item.pid || 0);
      const key = Number.isSafeInteger(pid) && pid > 0 ? String(pid) : `unknown:${item.command || ''}:${item.user || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          pid,
          command: item.command || 'unknown process',
          user: item.user || 'unknown user',
          sockets: [],
        });
      }
      map.get(key).sockets.push(item);
    }
    return [...map.values()].sort((a, b) => b.sockets.length - a.sockets.length || a.command.localeCompare(b.command));
  }

  function groupByEndpoint(items) {
    const map = new Map();
    for (const item of items) {
      const key = endpointKey(item);
      if (!map.has(key)) {
        map.set(key, {
          state: String(item.state || 'OTHER').toUpperCase(),
          endpointClass: item.endpoint_class || 'unclassified',
          endpoint: endpointLabel(item),
          processes: new Map(),
          rows: 0,
        });
      }
      const group = map.get(key);
      group.rows += 1;
      const pid = Number(item.pid || 0);
      group.processes.set(`${pid}:${item.command || ''}`, {pid, command: item.command || 'unknown process'});
    }
    return [...map.values()].sort((a, b) => b.rows - a.rows || a.endpoint.localeCompare(b.endpoint));
  }

  function socketRow(item) {
    const row = el('div', 'socket');
    row.append(el('strong', '', `${item.state || 'OTHER'} · ${item.endpoint_class || 'unclassified'}`));
    if (item.local) row.append(el('span', '', `Local: ${item.local}`));
    if (item.remote) row.append(el('span', '', `Remote: ${item.remote}`));
    row.append(el('code', '', item.address || '—'));
    return row;
  }

  function renderSummary(items) {
    const panel = $('#summaryPanel');
    clear(panel);
    panel.classList.remove('hidden');
    const processes = new Set(items.map(item => Number(item.pid || 0)).filter(pid => pid > 0));
    const established = items.filter(item => String(item.state || '').toUpperCase() === 'ESTABLISHED').length;
    const listen = items.filter(item => String(item.state || '').toUpperCase() === 'LISTEN').length;
    const remote = items.filter(item => item.remote).length;
    const classes = new Set(items.map(item => item.endpoint_class || 'unclassified'));
    const grid = el('div', 'summary-grid');
    const add = (label, value) => {
      const cell = el('div');
      cell.append(el('span', '', label), el('b', '', value));
      grid.append(cell);
    };
    add('Visible TCP rows', items.length);
    add('Processes', processes.size);
    add('Established', established);
    add('Listening', listen);
    add('Rows with remote', remote);
    add('Endpoint classes', classes.size);
    panel.append(grid);
    panel.append(el('p', 'summary-copy', 'Counts describe the currently visible bounded TCP evidence only. They are not connection-health or malware scores.'));
  }

  function renderProcesses(items) {
    const panel = $('#processPanel');
    const list = $('#processList');
    clear(list);
    panel.classList.remove('hidden');
    const groups = groupByProcess(items);
    $('#processCount').textContent = String(groups.length);
    if (!groups.length) {
      list.append(el('article', 'row', 'No process/socket rows match the current filters.'));
      return;
    }
    for (const group of groups.slice(0, 100)) {
      const card = el('article', 'row');
      const head = el('div', 'row-head');
      const copy = el('div');
      copy.append(el('b', '', group.pid > 0 ? `PID ${group.pid} · ${group.command}` : group.command));
      copy.append(el('span', '', `${group.user} · ${group.sockets.length} TCP row(s)`));
      head.append(copy, el('span', 'badge', `${group.sockets.filter(row => row.state === 'ESTABLISHED').length} established`));
      card.append(head);
      const sockets = el('div', 'socket-list');
      for (const item of group.sockets.slice(0, 20)) sockets.append(socketRow(item));
      if (group.sockets.length > 20) sockets.append(el('span', '', `Showing 20 of ${group.sockets.length} socket rows for this process.`));
      card.append(sockets);
      if (group.pid > 0) {
        const actions = el('div', 'row-actions');
        const open = el('button', '', 'Open Process Explorer');
        open.type = 'button';
        open.addEventListener('click', () => { location.href = processURL(group.pid); });
        actions.append(open);
        card.append(actions);
      }
      list.append(card);
    }
  }

  function renderEndpoints(items) {
    const panel = $('#endpointPanel');
    const list = $('#endpointList');
    clear(list);
    panel.classList.remove('hidden');
    const groups = groupByEndpoint(items);
    $('#endpointCount').textContent = String(groups.length);
    if (!groups.length) {
      list.append(el('article', 'row', 'No endpoint rows match the current filters.'));
      return;
    }
    for (const group of groups.slice(0, 120)) {
      const card = el('article', 'row');
      const head = el('div', 'row-head');
      const copy = el('div');
      copy.append(el('b', '', `${group.state} · ${group.endpointClass}`));
      copy.append(el('code', '', group.endpoint));
      head.append(copy, el('span', 'badge', `${group.rows} row(s)`));
      card.append(head);
      const processNames = [...group.processes.values()].slice(0, 12).map(process => process.pid > 0 ? `PID ${process.pid} ${process.command}` : process.command);
      card.append(el('span', '', processNames.join(' · ') || 'No visible owning process'));
      list.append(card);
    }
  }

  function updateClassFilter(items) {
    const current = $('#classFilter').value;
    const values = [...new Set(items.map(item => item.endpoint_class || 'unclassified'))].sort();
    const select = $('#classFilter');
    clear(select);
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All endpoint classes';
    select.append(all);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = values.includes(current) ? current : 'all';
  }

  function renderFiltered() {
    const items = snapshot.filter(matchesFilters);
    renderSummary(items);
    renderProcesses(items);
    renderEndpoints(items);
  }

  async function loadNetwork() {
    if (!token) {
      showNotice('Missing Sentinel session token. Open Network Relationship Explorer from the running local Sentinel session.');
      return;
    }
    const button = $('#refreshNetwork');
    button.disabled = true;
    button.textContent = 'Refreshing…';
    showNotice('');
    try {
      const data = await api('/api/network');
      snapshot = Array.isArray(data?.items) ? data.items : [];
      updateClassFilter(snapshot);
      renderFiltered();
      if (data?.warning) showNotice(data.warning);
    } catch (error) {
      showNotice(error?.message || 'Network snapshot failed.');
    } finally {
      button.disabled = false;
      button.textContent = 'Refresh Snapshot';
    }
  }

  $('#searchInput').addEventListener('input', renderFiltered);
  $('#stateFilter').addEventListener('change', renderFiltered);
  $('#classFilter').addEventListener('change', renderFiltered);
  $('#refreshNetwork').addEventListener('click', loadNetwork);
  $('#backLink').href = `/#token=${encodeURIComponent(token)}`;
  loadNetwork();
})();
