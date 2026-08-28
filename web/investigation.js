// SPDX-License-Identifier: MPL-2.0
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('token') || '';
  const initialPath = params.get('path') || '';
  const history = [];
  let historyIndex = -1;

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

  function showNotice(message = '') {
    $('#notice').textContent = message;
  }

  function formatBytes(value) {
    let n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    while (n >= 1024 && index < units.length - 1) {
      n /= 1024;
      index += 1;
    }
    return `${n.toFixed(n >= 10 || index === 0 ? 1 : 2)} ${units[index]}`;
  }

  function formatTime(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
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

  function setBusy(busy) {
    const button = $('#startInvestigation');
    button.disabled = busy;
    button.textContent = busy ? 'Investigating…' : 'Investigate';
  }

  function badgeClass(priority) {
    const n = Number(priority || 0);
    return n >= 70 ? 'badge bad' : n >= 35 ? 'badge warn' : 'badge good';
  }

  function addKV(grid, label, value) {
    if (value === undefined || value === null || String(value) === '') return;
    const cell = el('div');
    cell.append(el('span', '', label), el('b', '', value));
    grid.append(cell);
  }

  function renderSummary(report) {
    const panel = $('#branchSummary');
    clear(panel);
    panel.classList.remove('hidden');
    const grid = el('div', 'summary-grid');
    addKV(grid, 'Branch root', report.path || '—');
    addKV(grid, 'Kind', report.kind || 'unknown');
    addKV(grid, 'Files visited', Number(report.files_visited || 0).toLocaleString());
    addKV(grid, 'Folders visited', Number(report.dirs_visited || 0).toLocaleString());
    addKV(grid, 'Candidates seen', Number(report.candidates_seen || 0).toLocaleString());
    addKV(grid, 'Traversal', report.truncated ? 'Bound reached' : 'Within bound');
    panel.append(grid);
    panel.append(el('p', 'meaning', report.meaning || 'This branch is read-only local evidence.'));
  }

  function renderIntegrity(inspection) {
    const panel = $('#rootInspectionPanel');
    const body = $('#rootInspectionBody');
    clear(body);
    if (!inspection || !inspection.path) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const grid = el('div', 'kv-grid');
    addKV(grid, 'Path', inspection.path);
    addKV(grid, 'Type', inspection.file_type || (inspection.is_directory ? 'Directory' : 'Unknown'));
    addKV(grid, 'Size', inspection.is_directory ? 'Directory' : formatBytes(inspection.size));
    addKV(grid, 'SHA-256', inspection.sha256 || inspection.hash_status || '—');
    addKV(grid, 'Architecture', (inspection.architectures || []).join(', ') || '—');
    addKV(grid, 'Signature', inspection.identity?.verification || '—');
    addKV(grid, 'Identifier', inspection.identity?.identifier || '—');
    addKV(grid, 'Team ID', inspection.identity?.team_id || '—');
    addKV(grid, 'Gatekeeper', inspection.identity?.gatekeeper || '—');
    addKV(grid, 'Quarantine', inspection.quarantine ? 'Present' : 'Not observed');
    addKV(grid, 'Modified', inspection.modified_at ? formatTime(inspection.modified_at) : '—');
    addKV(grid, 'Native validation', inspection.native_validation?.available ? (inspection.native_validation.valid ? 'Valid' : 'Review') : 'Unavailable');
    body.append(grid);

    if ((inspection.where_from || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Download / transfer provenance'));
      for (const source of inspection.where_from) block.append(el('div', 'fact', source));
      body.append(block);
    }
    if ((inspection.notes || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Interpretation notes'));
      for (const note of inspection.notes) {
        const item = el('div', 'fact');
        item.append(el('span', '', note));
        block.append(item);
      }
      body.append(block);
    }
  }

  function renderStory(story, storyError) {
    const panel = $('#objectStoryPanel');
    const body = $('#objectStoryBody');
    clear(body);
    panel.classList.remove('hidden');
    if (!story) {
      const empty = el('div', 'fact');
      empty.append(el('b', '', 'Object Story unavailable for this branch'), el('span', '', storyError || 'The current object could not be correlated with the existing Object Story model.'));
      body.append(empty);
      return;
    }

    const grid = el('div', 'kv-grid');
    addKV(grid, 'Object', story.title || story.object_type || '—');
    addKV(grid, 'Type', story.object_type || '—');
    addKV(grid, 'Review context', story.risk !== undefined ? `${story.risk}/100` : '—');
    addKV(grid, 'Object ID', story.object_id || '—');
    body.append(grid);
    if (story.summary) body.append(el('p', 'meaning', story.summary));

    if ((story.facts || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Observed facts'));
      for (const fact of story.facts.slice(0, 24)) {
        const row = el('div', 'fact');
        row.append(el('b', '', `${fact.label || fact.category || 'Fact'}: ${fact.value || '—'}`));
        row.append(el('span', '', fact.source ? `Source: ${fact.source}` : 'Source not specified'));
        block.append(row);
      }
      body.append(block);
    }

    if ((story.relations || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Relationships'));
      for (const relation of story.relations.slice(0, 30)) {
        const row = el('div', 'relation');
        row.append(el('b', '', `${relation.kind || 'related'} → ${relation.target || '—'}`));
        if (relation.detail) row.append(el('span', '', relation.detail));
        block.append(row);
      }
      body.append(block);
    }

    if ((story.timeline || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Recent object timeline'));
      for (const event of story.timeline.slice(0, 16)) {
        const row = el('div', 'timeline-row');
        row.append(el('b', '', event.kind || event.event || 'Observed event'));
        row.append(el('span', '', `${formatTime(event.at || event.time)}${event.detail ? ` · ${event.detail}` : ''}`));
        block.append(row);
      }
      body.append(block);
    }

    if (story.disclaimer) body.append(el('p', 'meaning', story.disclaimer));
  }

  function branchTo(path, parentID) {
    runInvestigation(path, parentID, true);
  }

  function renderRuntimeContext(context, contextError, report) {
    const panel = $('#runtimeContextPanel');
    const body = $('#runtimeContextBody');
    clear(body);
    panel.classList.remove('hidden');
    if (!context) {
      const empty = el('div', 'fact');
      empty.append(el('b', '', 'Runtime correlation unavailable'), el('span', '', contextError || 'Current process/network/persistence context could not be collected.'));
      body.append(empty);
      return;
    }

    const grid = el('div', 'summary-grid');
    addKV(grid, 'Running matches', (context.processes || []).length);
    addKV(grid, 'Startup references', (context.persistence || []).length);
    addKV(grid, 'Background references', (context.background || []).length);
    addKV(grid, 'App bundle', context.bundle_path || 'Not resolved');
    addKV(grid, 'Runtime targets', (context.next_targets || []).length);
    addKV(grid, 'Snapshot', formatTime(context.generated_at));
    body.append(grid);
    if (context.meaning) body.append(el('p', 'meaning', context.meaning));

    if ((context.processes || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Running processes'));
      for (const process of context.processes) {
        const card = el('article', 'candidate');
        const head = el('div', 'candidate-head');
        const copy = el('div');
        copy.append(el('h3', '', `PID ${process.pid} · ${process.user || 'unknown user'}`));
        copy.append(el('code', '', process.target || process.command || '—'));
        head.append(copy, el('span', 'badge', process.match === 'exact_path' ? 'exact path' : 'same app bundle'));
        card.append(head);

        const mini = el('div', 'inspection-mini');
        addKV(mini, 'PPID', process.ppid || '—');
        addKV(mini, 'CPU', `${Number(process.cpu || 0).toFixed(1)}%`);
        addKV(mini, 'Memory', `${Number(process.memory || 0).toFixed(1)}%`);
        addKV(mini, 'TCP rows', (process.network || []).length);
        addKV(mini, 'Open-file rows', (process.open_files || []).length);
        card.append(mini);

        if ((process.network || []).length) {
          const netBlock = el('div', 'section-block');
          netBlock.append(el('h3', '', 'Current TCP evidence'));
          for (const network of process.network.slice(0, 16)) {
            const row = el('div', 'relation');
            row.append(el('b', '', `${network.state || 'TCP'} · ${network.endpoint_class || 'endpoint'}`));
            row.append(el('span', '', network.address || network.remote || network.local || '—'));
            netBlock.append(row);
          }
          card.append(netBlock);
        }

        if ((process.open_files || []).length) {
          const fileBlock = el('div', 'section-block');
          fileBlock.append(el('h3', '', 'Open files / loaded objects'));
          for (const opened of process.open_files.slice(0, 30)) {
            const row = el('div', 'relation');
            row.append(el('b', '', `${opened.fd || 'FD'} · ${opened.type || 'object'}`));
            row.append(el('span', '', opened.name || '—'));
            fileBlock.append(row);
          }
          if (process.open_files.length > 30) {
            fileBlock.append(el('p', 'meaning', `Showing 30 of ${process.open_files.length} structured open-file rows. Investigation continuation targets remain separately bounded.`));
          }
          card.append(fileBlock);
        }

        if ((process.ancestors || []).length) {
          const parentBlock = el('div', 'section-block');
          parentBlock.append(el('h3', '', 'Parent chain'));
          for (const ancestor of process.ancestors) {
            const row = el('div', 'relation');
            row.append(el('b', '', `PID ${ancestor.pid} → parent context`));
            row.append(el('span', '', ancestor.command || ancestor.target || '—'));
            parentBlock.append(row);
          }
          card.append(parentBlock);
        }

        if (process.target && process.target !== report.path) {
          const actions = el('div', 'candidate-actions');
          const button = el('button', '', 'Investigate running executable');
          button.type = 'button';
          button.addEventListener('click', () => branchTo(process.target, report.id));
          actions.append(button);
          card.append(actions);
        }
        block.append(card);
      }
      body.append(block);
    }

    if ((context.persistence || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'LaunchAgent / LaunchDaemon references'));
      for (const ref of context.persistence) {
        const row = el('article', 'next-target');
        const copy = el('div', 'next-target-copy');
        copy.append(el('b', '', `${ref.name || 'Launch item'} · ${ref.scope || 'persistence'}`));
        copy.append(el('span', 'target-path', ref.plist_path || '—'));
        if (ref.executable) copy.append(el('p', '', `Executable: ${ref.executable}`));
        const button = el('button', '', 'Investigate plist');
        button.type = 'button';
        button.addEventListener('click', () => branchTo(ref.plist_path, report.id));
        row.append(copy, button);
        block.append(row);
      }
      body.append(block);
    }

    if ((context.background || []).length) {
      const block = el('div', 'section-block');
      block.append(el('h3', '', 'Background Task Management references'));
      for (const ref of context.background) {
        const row = el('div', 'relation');
        row.append(el('b', '', ref.name || ref.identifier || 'Background item'));
        row.append(el('span', '', ref.executable || ref.url || 'No executable path exposed'));
        block.append(row);
      }
      body.append(block);
    }

    if (!(context.processes || []).length && !(context.persistence || []).length && !(context.background || []).length) {
      const empty = el('div', 'fact');
      empty.append(el('b', '', 'No current runtime or persistence correlation found'), el('span', '', 'This does not establish safety. It only means the bounded current snapshot did not connect this path to the supported runtime/persistence sources.'));
      body.append(empty);
    }
  }

  function inspectionMini(inspection) {
    if (!inspection) return null;
    const mini = el('div', 'inspection-mini');
    addKV(mini, 'Hash', inspection.sha256 ? `${inspection.sha256.slice(0, 16)}…` : inspection.hash_status || '—');
    addKV(mini, 'Signature', inspection.identity?.verification || '—');
    addKV(mini, 'Team', inspection.identity?.team_id || '—');
    addKV(mini, 'Gatekeeper', inspection.identity?.gatekeeper || '—');
    return mini;
  }

  function renderCandidates(report) {
    const panel = $('#candidatesPanel');
    const list = $('#candidateList');
    clear(list);
    const candidates = Array.isArray(report.candidates) ? report.candidates : [];
    $('#candidateCount').textContent = String(candidates.length);
    if (!candidates.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    for (const candidate of candidates) {
      const card = el('article', 'candidate');
      const head = el('div', 'candidate-head');
      const copy = el('div');
      copy.append(el('h3', '', candidate.kind || 'candidate'), el('code', '', candidate.path || '—'));
      head.append(copy, el('span', badgeClass(candidate.review_priority), `Priority ${Number(candidate.review_priority || 0)}`));
      card.append(head);

      if ((candidate.signals || []).length) {
        const signals = el('ul', 'signals');
        for (const signal of candidate.signals.slice(0, 8)) signals.append(el('li', '', signal));
        card.append(signals);
      }
      const mini = inspectionMini(candidate.inspection);
      if (mini) card.append(mini);

      const actions = el('div', 'candidate-actions');
      const continueButton = el('button', '', 'Continue from here');
      continueButton.type = 'button';
      continueButton.disabled = !candidate.can_continue || !candidate.path;
      continueButton.addEventListener('click', () => branchTo(candidate.path, report.id));
      actions.append(continueButton);
      card.append(actions);
      list.append(card);
    }
  }

  function combinedNextTargets(report, runtimeContext) {
    const result = [];
    const seen = new Set();
    for (const target of [...(report.next_targets || []), ...(runtimeContext?.next_targets || [])]) {
      const key = `${target.kind || ''}|${target.path || ''}`;
      if (!target.path || seen.has(key)) continue;
      seen.add(key);
      result.push(target);
    }
    return result.slice(0, 100);
  }

  function renderNextTargets(report, runtimeContext) {
    const panel = $('#nextTargetsPanel');
    const list = $('#nextTargetList');
    clear(list);
    const targets = combinedNextTargets(report, runtimeContext);
    if (!targets.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    for (const target of targets) {
      const row = el('article', 'next-target');
      const copy = el('div', 'next-target-copy');
      copy.append(el('b', '', target.kind || 'related object'));
      copy.append(el('span', 'target-path', target.path || '—'));
      if (target.why) copy.append(el('p', '', target.why));
      const button = el('button', '', 'Continue');
      button.type = 'button';
      button.disabled = !target.path;
      button.addEventListener('click', () => branchTo(target.path, report.id));
      row.append(copy, button);
      list.append(row);
    }
  }

  function renderLimitations(report, storyError, runtimeContext, contextError) {
    const panel = $('#limitationsPanel');
    const list = $('#limitationsList');
    clear(list);
    const limitations = [...(report.limitations || []), ...(runtimeContext?.limitations || [])];
    if (storyError) limitations.push(`Object Story: ${storyError}`);
    if (contextError) limitations.push(`Runtime context: ${contextError}`);
    if (report.truncated) limitations.push('This branch reached a traversal/candidate bound. Continue from a narrower candidate to investigate further.');
    const unique = [...new Set(limitations.filter(Boolean))];
    if (!unique.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    for (const item of unique) list.append(el('div', '', `• ${item}`));
  }

  function updateBranchControls() {
    $('#branchBack').disabled = historyIndex <= 0;
    $('#branchForward').disabled = historyIndex < 0 || historyIndex >= history.length - 1;
    $('#branchPosition').textContent = historyIndex >= 0 ? `Branch ${historyIndex + 1} of ${history.length}` : 'No branch yet';
  }

  function renderEntry(entry) {
    const {report, story, storyError, runtimeContext, contextError} = entry;
    $('#investigationPath').value = report.path || '';
    renderSummary(report);
    renderIntegrity(report.root_inspection);
    renderStory(story, storyError);
    renderRuntimeContext(runtimeContext, contextError, report);
    renderCandidates(report);
    renderNextTargets(report, runtimeContext);
    renderLimitations(report, storyError, runtimeContext, contextError);
    updateBranchControls();
    history.replaceState(null, '', `/investigation.html#${new URLSearchParams({token, path: report.path || ''}).toString()}`);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  async function runInvestigation(path, parentID = '', pushHistory = true) {
    path = String(path || '').trim();
    if (!path.startsWith('/')) {
      showNotice('Choose an absolute macOS path beginning with /.');
      return;
    }
    if (!token) {
      showNotice('Missing Sentinel session token. Open this workspace from the running Sentinel session.');
      return;
    }
    setBusy(true);
    showNotice('');
    try {
      const investigationPromise = api('/api/security/investigate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, parent_id: parentID || ''}),
      });
      const storyPromise = api(`/api/object/story?path=${encodeURIComponent(path)}`);
      const contextPromise = api(`/api/security/context?path=${encodeURIComponent(path)}`);
      const [investigationResult, storyResult, contextResult] = await Promise.allSettled([investigationPromise, storyPromise, contextPromise]);
      if (investigationResult.status !== 'fulfilled') throw investigationResult.reason;

      const entry = {
        report: investigationResult.value,
        story: storyResult.status === 'fulfilled' ? storyResult.value : null,
        storyError: storyResult.status === 'rejected' ? String(storyResult.reason?.message || storyResult.reason || 'unavailable') : '',
        runtimeContext: contextResult.status === 'fulfilled' ? contextResult.value : null,
        contextError: contextResult.status === 'rejected' ? String(contextResult.reason?.message || contextResult.reason || 'unavailable') : '',
      };
      if (pushHistory) {
        history.splice(historyIndex + 1);
        history.push(entry);
        historyIndex = history.length - 1;
      } else if (historyIndex >= 0) {
        history[historyIndex] = entry;
      }
      renderEntry(entry);
    } catch (error) {
      showNotice(error?.message || 'Investigation failed.');
    } finally {
      setBusy(false);
    }
  }

  $('#investigationForm').addEventListener('submit', event => {
    event.preventDefault();
    const parentID = historyIndex >= 0 ? history[historyIndex]?.report?.id || '' : '';
    runInvestigation($('#investigationPath').value, parentID, true);
  });

  $('#branchBack').addEventListener('click', () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    renderEntry(history[historyIndex]);
  });

  $('#branchForward').addEventListener('click', () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return;
    historyIndex += 1;
    renderEntry(history[historyIndex]);
  });

  $('#backToSentinel').href = `/#token=${encodeURIComponent(token)}`;
  $('#investigationPath').value = initialPath;
  updateBranchControls();

  if (!token) {
    showNotice('Missing Sentinel session token. Open Continue Investigation from the running local Sentinel session.');
  } else if (initialPath) {
    runInvestigation(initialPath, '', true);
  }
})();
