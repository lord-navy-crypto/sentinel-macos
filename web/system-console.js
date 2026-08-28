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

  function showQueryResult(result) {
    const section = $('#queryOutputSection');
    section.classList.remove('hidden');
    $('#queryTitle').textContent = result.tool_name || 'Query result';
    const status = String(result.status || 'unknown');
    $('#queryMeta').textContent = `${status} · exit ${result.exit_code} · ${result.duration_ms || 0} ms · ${result.display_command || ''}`;
    $('#queryMeta').className = statusClass(status);
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
      const result = await api('/api/system/query', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tool_id: tool.id, target: target || ''}),
      });
      showQueryResult(result);
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
