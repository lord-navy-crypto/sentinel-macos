// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const nativeFetch = window.fetch.bind(window);

  function el(tag, className = '', text = '') {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== '') n.textContent = String(text);
    return n;
  }

  function targetHref(target) {
    if (target.kind === 'pid' && Number(target.pid) > 0) {
      return `/process-relations.html#token=${encodeURIComponent(token)}&pid=${encodeURIComponent(target.pid)}`;
    }
    if (target.kind === 'path' && String(target.path || '').startsWith('/')) {
      return `/investigation.html#token=${encodeURIComponent(token)}&path=${encodeURIComponent(target.path)}`;
    }
    return '';
  }

  function renderAugmentation(payload) {
    const root = document.getElementById('structuredOutput');
    if (!root || !payload?.structured) return;
    const old = document.getElementById('structuredV23Augmentation');
    if (old) old.remove();
    const wrap = el('section', 'structured-section');
    wrap.id = 'structuredV23Augmentation';

    const facts = payload.structured.facts || [];
    if (facts.length) {
      const section = el('section', 'structured-section');
      section.append(el('h3', '', 'Structured facts'));
      const grid = el('div', 'structured-kv');
      for (const fact of facts.slice(0, 100)) {
        const cell = el('div'); cell.append(el('span', '', fact.label || 'Fact'), el('b', '', fact.value || '—'));
        if (fact.state) cell.append(el('small', '', fact.state));
        grid.append(cell);
      }
      section.append(grid); wrap.append(section);
    }

    const records = payload.structured.records || [];
    if (records.length) {
      const section = el('section', 'structured-section');
      const head = el('div', 'structured-heading'); head.append(el('h3', '', 'Structured objects / records'), el('span', 'badge', `${Math.min(records.length, 80)} of ${records.length}`)); section.append(head);
      const list = el('div', 'v23-record-list');
      for (const record of records.slice(0, 80)) {
        const row = el('div', 'v23-record'); const text = el('div');
        text.append(el('b', '', record.label || record.kind || 'record'));
        if (record.group || record.detail) text.append(el('small', '', [record.group, record.detail].filter(Boolean).join(' · ')));
        row.append(text);
        const buttons = el('div', 'v23-continuations');
        if (String(record.path || '').startsWith('/')) {
          const a = el('a', '', 'Continue Investigation'); a.href = `/investigation.html#token=${encodeURIComponent(token)}&path=${encodeURIComponent(record.path)}`; buttons.append(a);
        }
        if (Number(record.pid) > 0) {
          const a = el('a', '', `Open PID ${record.pid}`); a.href = `/process-relations.html#token=${encodeURIComponent(token)}&pid=${encodeURIComponent(record.pid)}`; buttons.append(a);
        }
        if (buttons.childElementCount) row.append(buttons);
        list.append(row);
      }
      section.append(list); wrap.append(section);
    }

    const signals = payload.signals || [];
    if (signals.length) {
      const section = el('section', 'structured-section'); section.append(el('h3', '', 'Sentinel interpretation layer'));
      const list = el('div', 'v23-signal-list');
      for (const signal of signals) {
        const row = el('div', `v23-signal signal-${signal.severity || 'info'}`);
        row.append(el('b', '', signal.summary || signal.code || 'Signal'), el('small', '', `${signal.code || 'typed_signal'} · ${signal.category || 'system'}${signal.incident_eligible ? ' · incident-eligible object evidence' : ''}`));
        if (signal.detail) row.append(el('p', '', signal.detail));
        list.append(row);
      }
      section.append(list); wrap.append(section);
    }

    const targets = payload.continuation_targets || [];
    if (targets.length) {
      const section = el('section', 'structured-section'); section.append(el('h3', '', 'Continue Investigation'));
      const list = el('div', 'v23-continuations');
      for (const target of targets.slice(0, 24)) {
        const href = targetHref(target); if (!href) continue;
        const a = el('a', '', target.label || (target.kind === 'pid' ? `Open PID ${target.pid}` : 'Investigate object')); a.href = href; list.append(a);
      }
      const cp = el('a', '', 'Open Control Plane Center'); cp.href = `/control-plane.html#token=${encodeURIComponent(token)}`; list.append(cp);
      section.append(list); wrap.append(section);
    }

    if (wrap.childElementCount) {
      root.classList.remove('hidden'); root.append(wrap);
    }
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(args[1]?.method || input?.method || 'GET').toUpperCase();
      if (method === 'POST' && url.startsWith('/api/system/query/structured') && !url.includes('mode=')) {
        response.clone().json().then((payload) => window.setTimeout(() => renderAugmentation(payload), 0)).catch(() => {});
      }
    } catch (_) {}
    return response;
  };
})();
