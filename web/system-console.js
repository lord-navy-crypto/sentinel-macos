// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = (s) => document.querySelector(s);
  const toolIndex = new Map();

  function el(tag, attrs = {}, text = '') {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'type') node.type = value;
      else if (key === 'placeholder') node.placeholder = value;
      else if (key === 'name') node.name = value;
      else if (key === 'required') node.required = Boolean(value);
      else if (key === 'disabled') node.disabled = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }

  function setNotice(message = '') {
    $('#notice').textContent = message;
  }

  async function api(url, options = {}) {
    options.headers = {
      ...(options.headers || {}),
      'X-Sentinel-Token': token,
    };
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json')
      ? await response.json().catch(() => ({error: `HTTP ${response.status}`}))
      : null;
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function statusClass(status) {
    return ['ok', 'reported', 'timeout', 'unavailable'].includes(status)
      ? `status-${status}`
      : '';
  }

  function renderKeyValueGrid(title, rows) {
    const section = el('section', {class: 'structured-section'});
    section.append(el('h3', {}, title));
    const grid = el('div', {class: 'structured-kv'});
    for (const [label, value] of rows) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const cell = el('div');
      cell.append(el('span', {}, label), el('b', {}, String(value)));
      grid.append(cell);
    }
    if (!grid.childElementCount) return null;
    section.append(grid);
    return section;
  }

  function renderTable(title, columns, rows, limit = 100) {
    const section = el('section', {class: 'structured-section'});
    const heading = el('div', {class: 'structured-heading'});
    heading.append(el('h3', {}, title));
    const shown = Math.min(rows.length, limit);
    heading.append(el('span', {class: 'badge'}, `${shown} of ${rows.length} rows`));
    section.append(heading);

    const wrap = el('div', {class: 'table-wrap'});
    const table = el('table', {class: 'evidence-table'});
    const thead = el('thead');
    const headRow = el('tr');
    for (const column of columns) headRow.append(el('th', {}, column.label));
    thead.append(headRow);
    table.append(thead);

    const tbody = el('tbody');
    for (const row of rows.slice(0, limit)) {
      const tr = el('tr');
      for (const column of columns) {
        const value = typeof column.value === 'function' ? column.value(row) : row[column.value];
        tr.append(el('td', {}, value === undefined || value === null || value === '' ? '—' : String(value)));
      }
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    section.append(wrap);
    if (rows.length > limit) {
      section.append(el('p', {class: 'managed-note'}, `Structured view is bounded to the first ${limit} rows. Raw evidence remains available below.`));
    }
    return section;
  }

  function renderStructuredEvidence(structured) {
    const box = $('#structuredOutput');
    box.replaceChildren();
    if (!structured || structured.kind === 'raw') {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.append(el('p', {class: 'structured-intro'}, 'Structured Sentinel view · raw evidence remains available below for provenance.'));

    if (Array.isArray(structured.processes) && structured.processes.length) {
      box.append(renderTable('Processes', [
        {label: 'PID', value: 'pid'},
        {label: 'PPID', value: 'ppid'},
        {label: 'User', value: 'user'},
        {label: 'CPU %', value: row => Number(row.cpu_percent || 0).toFixed(1)},
        {label: 'Memory %', value: row => Number(row.memory_percent || 0).toFixed(1)},
        {label: 'Elapsed', value: 'elapsed'},
        {label: 'Command', value: 'command'},
      ], structured.processes));
    }

    if (Array.isArray(structured.open_files) && structured.open_files.length) {
      box.append(renderTable('Process open files & objects', [
        {label: 'PID', value: 'pid'},
        {label: 'FD', value: 'fd'},
        {label: 'Type', value: 'type'},
        {label: 'Device', value: 'device'},
        {label: 'Size / offset', value: 'size_offset'},
        {label: 'Node', value: 'node'},
        {label: 'Name / path', value: 'name'},
      ], structured.open_files, 120));
    }

    if (Array.isArray(structured.filesystems) && structured.filesystems.length) {
      box.append(renderTable('Filesystems', [
        {label: 'Filesystem', value: 'filesystem'},
        {label: 'Size', value: 'size'},
        {label: 'Used', value: 'used'},
        {label: 'Available', value: 'available'},
        {label: 'Capacity', value: 'capacity'},
        {label: 'Mounted on', value: 'mounted_on'},
      ], structured.filesystems, 50));
    }

    if (Array.isArray(structured.mounts) && structured.mounts.length) {
      box.append(renderTable('Mounted volumes', [
        {label: 'Device', value: 'device'},
        {label: 'Mounted on', value: 'mounted_on'},
        {label: 'Options', value: row => (row.options || []).join(', ')},
      ], structured.mounts, 60));
    }

    if (structured.signing) {
      const signing = structured.signing;
      const grid = renderKeyValueGrid('Code-signing identity', [
        ['Identifier', signing.identifier],
        ['Team identifier', signing.team_identifier],
        ['Signature', signing.signature],
        ['Runtime version', signing.runtime_version],
        ['Executable', signing.executable],
        ['Authorities', (signing.authorities || []).join(' → ')],
      ]);
      if (grid) box.append(grid);
    }

    if (structured.gatekeeper) {
      const gatekeeper = structured.gatekeeper;
      const grid = renderKeyValueGrid('Gatekeeper assessment', [
        ['Assessment', gatekeeper.assessment],
        ['Source', gatekeeper.source],
        ['Origin', gatekeeper.origin],
      ]);
      if (grid) box.append(grid);
    }

    if (!box.querySelector('.structured-section')) {
      box.append(el('p', {class: 'managed-note'}, 'A parser exists for this evidence type, but no structured rows were recognized. Review raw evidence below.'));
    }
    for (const limitation of structured.limitations || []) {
      box.append(el('p', {class: 'managed-note'}, `Parser limitation: ${limitation}`));
    }
  }

  function showQueryResult(result, structured = null) {
    const section = $('#queryOutputSection');
    section.classList.remove('hidden');
    $('#queryTitle').textContent = result.tool_name || 'Query result';
    const status = String(result.status || 'unknown');
    $('#queryMeta').textContent = `${status} · exit ${result.exit_code} · ${result.duration_ms || 0} ms · ${result.display_command || ''}`;
    $('#queryMeta').className = statusClass(status);
    renderStructuredEvidence(structured);
    $('#queryOutput').textContent = result.output || '(no output)';
    const limitations = $('#queryLimitations');
    limitations.replaceChildren();
    for (const item of result.limitations || []) {
      limitations.append(el('div', {}, `• ${item}`));
    }
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  async function runTool(tool, target, button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Running…';
    setNotice('');
    try {
      const payload = await api('/api/system/query/structured', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tool_id: tool.id, target: target || ''}),
      });
      showQueryResult(payload.result, payload.structured);
    } catch (error) {
      setNotice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function renderTool(tool) {
    const card = el('article', {class: 'tool-card'});
    card.dataset.toolId = tool.id;
    const header = el('header');
    const title = el('h4', {}, tool.name || tool.id);
    const availability = el(
      'span',
      {class: `badge ${tool.available ? 'ok' : 'warn'}`},
      tool.available ? 'Available' : 'Unavailable'
    );
    header.append(title, availability);
    card.append(header);
    card.append(el('p', {}, tool.summary || ''));

    const meta = el('div', {class: 'meta'});
    meta.append(
      el('span', {class: 'badge'}, tool.domain || 'system'),
      el('span', {class: 'badge'}, tool.mode === 'read_only' ? 'read-only' : 'managed action')
    );
    card.append(meta);

    if (tool.mode === 'read_only') {
      const form = el('form');
      let input = null;
      if (tool.target_kind) {
        input = el('input', {
          type: 'text',
          name: 'target',
          placeholder: tool.target_kind === 'pid' ? 'PID, e.g. 1234' : '/absolute/path',
          required: true,
          disabled: !tool.available,
        });
        input.autocomplete = 'off';
        input.spellcheck = false;
        form.append(input);
      }
      const button = el('button', {type: 'submit', disabled: !tool.available}, tool.available ? 'Run query' : 'Unavailable');
      form.append(button);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        runTool(tool, input ? input.value.trim() : '', button);
      });
      card.append(form);
    } else {
      const managed = el('p', {class: 'managed-note'}, tool.safety || 'Use the main Sentinel workflow for this action.');
      card.append(managed);
      const button = el('button', {type: 'button'}, 'Open main Sentinel');
      button.addEventListener('click', () => {
        location.href = `/#token=${encodeURIComponent(token)}`;
      });
      card.append(button);
    }
    return card;
  }

  function renderCatalog(catalog) {
    const groups = $('#toolGroups');
    groups.replaceChildren();
    toolIndex.clear();
    const byIntent = new Map();
    for (const tool of catalog.tools || []) {
      toolIndex.set(tool.id, tool);
      const intent = tool.intent || 'other';
      if (!byIntent.has(intent)) byIntent.set(intent, []);
      byIntent.get(intent).push(tool);
    }
    const order = ['understand', 'investigate', 'control', 'recover'];
    for (const intent of order) {
      const tools = byIntent.get(intent) || [];
      if (!tools.length) continue;
      const group = el('section', {class: 'tool-group'});
      group.append(el('h3', {}, intent));
      const grid = el('div', {class: 'tool-grid'});
      for (const tool of tools) grid.append(renderTool(tool));
      group.append(grid);
      groups.append(group);
    }
  }

  function focusTool(tool) {
    const card = document.querySelector(`[data-tool-id="${CSS.escape(tool.id)}"]`);
    if (!card) {
      setNotice('System tool is not available in the current catalog.');
      return;
    }
    card.scrollIntoView({behavior: 'smooth', block: 'center'});
    const input = card.querySelector('input');
    if (input) {
      input.focus();
      setNotice(tool.target_kind === 'pid' ? 'Enter the PID to continue.' : 'Enter an absolute path to continue.');
    }
  }

  function installRecipes() {
    for (const button of document.querySelectorAll('[data-recipe-focus="object"]')) {
      button.addEventListener('click', () => {
        const input = $('#objectPath');
        input.scrollIntoView({behavior: 'smooth', block: 'center'});
        input.focus();
        setNotice('Enter an absolute app or file path. Sentinel will combine multiple local evidence sources.');
      });
    }
    for (const button of document.querySelectorAll('[data-recipe-tool]')) {
      button.addEventListener('click', () => {
        const tool = toolIndex.get(button.dataset.recipeTool || '');
        if (!tool) {
          setNotice('System tool catalog is still loading.');
          return;
        }
        if (!tool.available) {
          setNotice(`${tool.name} is unavailable on this Mac.`);
          focusTool(tool);
          return;
        }
        if (tool.target_kind) {
          focusTool(tool);
          return;
        }
        runTool(tool, '', button);
      });
    }
  }

  function renderObjectInspection(result) {
    const box = $('#objectResult');
    box.replaceChildren();
    box.classList.remove('hidden');

    const summary = el('div', {class: 'result-summary'});
    const cells = [
      ['Path', result.path || '—'],
      ['Kind', result.kind || (result.exists ? 'unknown' : 'not found')],
      ['Mode', result.mode || '—'],
      ['Modified', result.modified_at || '—'],
    ];
    for (const [label, value] of cells) {
      const cell = el('div');
      cell.append(el('span', {}, label), el('b', {}, value));
      summary.append(cell);
    }
    box.append(summary);

    for (const line of result.summary || []) box.append(el('p', {}, line));

    for (const query of result.queries || []) {
      const block = el('section', {class: 'query-block'});
      const state = query.status || 'unknown';
      block.append(el('h4', {class: statusClass(state)}, `${query.tool_name || query.tool_id} · ${state}`));
      const pre = el('pre');
      pre.textContent = query.output || '(no output)';
      block.append(pre);
      for (const limitation of query.limitations || []) {
        block.append(el('p', {class: 'managed-note'}, `Limitation: ${limitation}`));
      }
      box.append(block);
    }

    for (const limitation of result.limitations || []) {
      box.append(el('p', {class: 'managed-note'}, `Limitation: ${limitation}`));
    }
  }

  async function inspectObject(path, button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Inspecting…';
    setNotice('');
    try {
      const result = await api('/api/system/object/inspect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path}),
      });
      renderObjectInspection(result);
    } catch (error) {
      setNotice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  $('#objectForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#objectPath');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    inspectObject(input.value.trim(), button);
  });

  $('#backLink').href = `/#token=${encodeURIComponent(token)}`;
  installRecipes();

  if (!token) {
    setNotice('Missing Sentinel session token. Open System Console from the running local Sentinel session.');
    return;
  }

  api('/api/system/console')
    .then(renderCatalog)
    .catch((error) => setNotice(error.message));
})();
