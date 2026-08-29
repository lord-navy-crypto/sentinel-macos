// SPDX-License-Identifier: MPL-2.0
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('token') || '';
  const initialPID = params.get('pid') || '';
  const $ = selector => document.querySelector(selector);

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== '') node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (node) node.replaceChildren();
  }

  function addKV(grid, label, value) {
    if (value === undefined || value === null || String(value) === '') return;
    const cell = el('div');
    cell.append(el('span', '', label), el('b', '', value));
    grid.append(cell);
  }

  function showNotice(message = '') {
    $('#notice').textContent = message;
  }

  function validPID(value) {
    const raw = String(value || '').trim();
    if (!/^\d{1,10}$/.test(raw)) return 0;
    const pid = Number(raw);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : 0;
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

  async function structuredTool(toolID, target = '') {
    return api('/api/system/query/structured', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tool_id: toolID, target}),
    });
  }

  function investigateURL(path) {
    return `/investigation.html#${new URLSearchParams({token, path}).toString()}`;
  }

  function setPIDLocation(pid) {
    window.history.replaceState(null, '', `/process-relations.html#${new URLSearchParams({token, pid: String(pid)}).toString()}`);
  }

  function processRow(title, subtitle, path = '', onInspect = null) {
    const row = el('article', 'row');
    const head = el('div', 'row-head');
    const copy = el('div');
    copy.append(el('b', '', title));
    if (subtitle) copy.append(el('span', '', subtitle));
    if (path) copy.append(el('code', '', path));
    head.append(copy);
    row.append(head);
    if (onInspect) {
      const actions = el('div', 'row-actions');
      const button = el('button', '', 'Inspect PID');
      button.type = 'button';
      button.addEventListener('click', onInspect);
      actions.append(button);
      row.append(actions);
    }
    return row;
  }

  function renderSummary(detail) {
    const panel = $('#summaryPanel');
    clear(panel);
    panel.classList.remove('hidden');
    const process = detail.process || {};
    const identity = detail.identity || {};
    const grid = el('div', 'summary-grid');
    addKV(grid, 'PID', process.pid || '—');
    addKV(grid, 'PPID', process.ppid || '—');
    addKV(grid, 'User', process.user || '—');
    addKV(grid, 'CPU', `${Number(process.cpu || 0).toFixed(1)}%`);
    addKV(grid, 'Memory', `${Number(process.memory || 0).toFixed(1)}%`);
    addKV(grid, 'Review context', `${Number(detail.path_risk || 0)}/100`);
    addKV(grid, 'Signature', identity.verification || detail.signature || '—');
    addKV(grid, 'Team ID', identity.team_id || '—');
    addKV(grid, 'Gatekeeper', identity.gatekeeper || '—');
    addKV(grid, 'Identifier', identity.identifier || '—');
    panel.append(grid);

    const copy = el('div', 'summary-copy');
    copy.append(el('b', '', 'Command'));
    copy.append(el('code', '', process.command || '—'));
    copy.append(el('b', '', 'Resolved executable'));
    copy.append(el('code', '', detail.executable || '—'));
    panel.append(copy);

    const signals = [...(detail.signals || []), ...(detail.trust_signals || [])];
    if (signals.length) {
      const block = el('div', 'story-section');
      block.append(el('h3', '', 'Review / trust signals'));
      for (const signal of signals.slice(0, 16)) block.append(el('div', 'row', signal));
      panel.append(block);
    }

    if (detail.executable?.startsWith('/')) {
      const actions = el('div', 'summary-actions');
      const investigate = el('button', '', 'Continue Investigation on Executable');
      investigate.type = 'button';
      investigate.addEventListener('click', () => { location.href = investigateURL(detail.executable); });
      actions.append(investigate);
      panel.append(actions);
    }
  }

  function renderLineage(pid, detail, processEvidence) {
    $('#lineagePanel').classList.remove('hidden');
    const parents = $('#parentList');
    const children = $('#childList');
    clear(parents);
    clear(children);

    const chain = detail.parent_chain || [];
    if (!chain.length) parents.append(processRow('No parent-chain rows available', 'The process may have exited or parent visibility may be limited.'));
    for (const ancestor of chain) {
      const ancestorPID = validPID(ancestor.pid);
      parents.append(processRow(
        ancestorPID ? `PID ${ancestorPID}` : 'Parent process',
        ancestor.ppid ? `PPID ${ancestor.ppid}` : '',
        ancestor.target || ancestor.command || '',
        ancestorPID ? () => inspectProcess(ancestorPID) : null,
      ));
    }

    const rows = processEvidence?.structured?.processes || [];
    const childRows = rows.filter(row => Number(row.ppid) === pid).sort((a, b) => Number(b.cpu_percent || 0) - Number(a.cpu_percent || 0));
    if (!childRows.length) children.append(processRow('No visible child process in this snapshot', 'The structured process table did not show a current row whose PPID equals this PID.'));
    for (const child of childRows.slice(0, 40)) {
      children.append(processRow(
        `PID ${child.pid} · ${child.user || 'unknown user'}`,
        `CPU ${Number(child.cpu_percent || 0).toFixed(1)}% · Memory ${Number(child.memory_percent || 0).toFixed(1)}%`,
        child.command || '',
        () => inspectProcess(Number(child.pid)),
      ));
    }
  }

  function renderResources(detail, openEvidence) {
    $('#resourcePanel').classList.remove('hidden');
    const files = $('#openFileList');
    const network = $('#networkList');
    clear(files);
    clear(network);

    const openRows = openEvidence?.structured?.open_files || [];
    if (!openRows.length) files.append(processRow('No structured open-object rows', 'lsof evidence may be unavailable, empty, or limited for this process.'));
    for (const opened of openRows.slice(0, 100)) {
      const row = processRow(
        `${opened.fd || 'FD'} · ${opened.type || 'object'}`,
        [opened.device, opened.node].filter(Boolean).join(' · '),
        opened.name || '',
      );
      if (String(opened.name || '').startsWith('/')) {
        const actions = el('div', 'row-actions');
        const investigate = el('button', '', 'Investigate Object');
        investigate.type = 'button';
        investigate.addEventListener('click', () => { location.href = investigateURL(opened.name); });
        actions.append(investigate);
        row.append(actions);
      }
      files.append(row);
    }

    const nets = detail.network || [];
    if (!nets.length) network.append(processRow('No current TCP rows', 'No supported TCP evidence was correlated for this PID in the current snapshot.'));
    for (const item of nets.slice(0, 80)) {
      network.append(processRow(
        `${item.state || 'TCP'} · ${item.endpoint_class || 'endpoint'}`,
        item.command ? `${item.command} · PID ${item.pid || '—'}` : '',
        item.address || item.remote || item.local || '',
      ));
    }
  }

  function renderPersistence(context, executable) {
    const panel = $('#persistencePanel');
    const list = $('#persistenceList');
    clear(list);
    panel.classList.remove('hidden');
    const refs = context?.persistence || [];
    const background = context?.background || [];
    if (!refs.length && !background.length) {
      list.append(processRow('No visible startup reference matched this executable', 'This does not prove the process has no persistence path; it only reflects supported current evidence.'));
      return;
    }

    for (const ref of refs) {
      const row = processRow(
        `${ref.name || 'Launch item'} · ${ref.scope || 'persistence'}`,
        ref.executable ? `Executable: ${ref.executable}` : '',
        ref.plist_path || '',
      );
      const actions = el('div', 'row-actions');
      if (ref.plist_path?.startsWith('/')) {
        const investigatePlist = el('button', '', 'Investigate plist');
        investigatePlist.type = 'button';
        investigatePlist.addEventListener('click', () => { location.href = investigateURL(ref.plist_path); });
        actions.append(investigatePlist);
      }
      if (ref.executable?.startsWith('/') && ref.executable !== executable) {
        const investigateTarget = el('button', '', 'Investigate target');
        investigateTarget.type = 'button';
        investigateTarget.addEventListener('click', () => { location.href = investigateURL(ref.executable); });
        actions.append(investigateTarget);
      }
      row.append(actions);
      list.append(row);
    }

    for (const ref of background) {
      list.append(processRow(
        ref.name || ref.identifier || 'Background item',
        ref.identifier || 'Background Task Management',
        ref.executable || ref.url || '',
      ));
    }
  }

  function renderStory(story) {
    const panel = $('#storyPanel');
    const body = $('#storyBody');
    clear(body);
    panel.classList.remove('hidden');
    if (!story) {
      body.append(processRow('Object Story unavailable', 'The process could not be correlated with the Object Story model at this moment.'));
      return;
    }
    const grid = el('div', 'kv-grid');
    addKV(grid, 'Object', story.title || 'process');
    addKV(grid, 'Type', story.object_type || 'process');
    addKV(grid, 'Risk context', story.risk !== undefined ? `${story.risk}/100` : '—');
    addKV(grid, 'Relations', (story.relations || []).length);
    addKV(grid, 'Timeline rows', (story.timeline || []).length);
    addKV(grid, 'Object ID', story.object_id || '—');
    body.append(grid);
    if (story.summary) body.append(el('p', 'summary-copy', story.summary));

    if ((story.relations || []).length) {
      const block = el('div', 'story-section');
      block.append(el('h3', '', 'Object relationships'));
      for (const relation of story.relations.slice(0, 30)) {
        block.append(processRow(`${relation.kind || 'related'} → ${relation.target || '—'}`, relation.detail || ''));
      }
      body.append(block);
    }
    if ((story.timeline || []).length) {
      const block = el('div', 'story-section');
      block.append(el('h3', '', 'Recent timeline'));
      for (const event of story.timeline.slice(0, 20)) {
        block.append(processRow(event.kind || event.event || 'event', `${event.at || event.time || ''}${event.detail ? ` · ${event.detail}` : ''}`));
      }
      body.append(block);
    }
  }

  function renderLimitations(parts) {
    const panel = $('#limitationsPanel');
    const list = $('#limitationsList');
    clear(list);
    const values = [...new Set(parts.flat().filter(Boolean))];
    if (!values.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    for (const value of values) list.append(el('div', '', `• ${value}`));
  }

  function setBusy(busy) {
    $('#inspectPID').disabled = busy;
    $('#inspectPID').textContent = busy ? 'Inspecting…' : 'Inspect Process';
  }

  async function inspectProcess(rawPID) {
    const pid = validPID(rawPID);
    if (!pid) {
      showNotice('Enter a positive numeric PID.');
      return;
    }
    if (!token) {
      showNotice('Missing Sentinel session token. Open this explorer from the running Sentinel session.');
      return;
    }
    $('#pidInput').value = String(pid);
    setBusy(true);
    showNotice('');
    try {
      const detailPromise = api(`/api/process/detail?pid=${encodeURIComponent(pid)}`);
      const storyPromise = api(`/api/object/story?pid=${encodeURIComponent(pid)}`);
      const tablePromise = structuredTool('process-table');
      const openPromise = structuredTool('process-open-files', String(pid));
      const [detailResult, storyResult, tableResult, openResult] = await Promise.allSettled([detailPromise, storyPromise, tablePromise, openPromise]);
      if (detailResult.status !== 'fulfilled') throw detailResult.reason;

      const detail = detailResult.value;
      const executable = detail.executable || '';
      let context = null;
      let contextError = '';
      if (executable.startsWith('/')) {
        try {
          context = await api(`/api/security/context?path=${encodeURIComponent(executable)}`);
        } catch (error) {
          contextError = error?.message || 'runtime context unavailable';
        }
      } else {
        contextError = 'resolved executable is not an absolute path';
      }

      renderSummary(detail);
      renderLineage(pid, detail, tableResult.status === 'fulfilled' ? tableResult.value : null);
      renderResources(detail, openResult.status === 'fulfilled' ? openResult.value : null);
      renderPersistence(context, executable);
      renderStory(storyResult.status === 'fulfilled' ? storyResult.value : null);
      renderLimitations([
        tableResult.status === 'fulfilled' ? (tableResult.value.structured?.limitations || []) : [`Process table: ${tableResult.reason?.message || 'unavailable'}`],
        tableResult.status === 'fulfilled' ? (tableResult.value.result?.limitations || []) : [],
        openResult.status === 'fulfilled' ? (openResult.value.structured?.limitations || []) : [`Open files: ${openResult.reason?.message || 'unavailable'}`],
        openResult.status === 'fulfilled' ? (openResult.value.result?.limitations || []) : [],
        context?.limitations || [],
        contextError ? [`Runtime/persistence context: ${contextError}`] : [],
        ['Child-process correlation is a current bounded process-table snapshot; processes can start or exit immediately after collection.'],
      ]);
      setPIDLocation(pid);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (error) {
      showNotice(error?.message || 'Process relationship inspection failed.');
    } finally {
      setBusy(false);
    }
  }

  $('#pidForm').addEventListener('submit', event => {
    event.preventDefault();
    inspectProcess($('#pidInput').value);
  });

  $('#backLink').href = `/#token=${encodeURIComponent(token)}`;
  $('#pidInput').value = initialPID;
  if (!token) {
    showNotice('Missing Sentinel session token. Open Process Relationship Explorer from the running local Sentinel session.');
  } else if (validPID(initialPID)) {
    inspectProcess(initialPID);
  }
})();
