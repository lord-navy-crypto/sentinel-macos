// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = id => document.getElementById(id);
  const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== '') n.textContent = String(text); return n; };
  const clear = n => n && n.replaceChildren();
  const tokenHash = () => token ? `#token=${encodeURIComponent(token)}` : '';
  $('controlLink').href = `/control-plane.html${tokenHash()}`;
  $('homeLink').href = `/${tokenHash()}`;

  async function api(path) {
    const response = await fetch(path, {headers: {'X-Sentinel-Token': token}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function fmtBytes(value) {
    let n = Number(value || 0); const units = ['B','KB','MB','GB','TB']; let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  }
  function fmtTime(value) { if (!value) return '—'; try { return new Date(value).toLocaleString(); } catch { return String(value); } }
  function fact(label, value) { const n = el('div','fact'); n.append(el('span','',label), el('b','',value)); return n; }
  function absolutePath(value) { value = String(value || '').trim(); return value.startsWith('/') ? value : ''; }
  function investigateLink(path, label = 'Investigate object') {
    path = absolutePath(path); if (!path) return null;
    const a = el('a','action-link',label); const h = new URLSearchParams({token, path}); a.href = `/investigation.html#${h.toString()}`; return a;
  }
  function stateLabel(value) {
    if (value === 'fully_contained') return 'Fully Contained';
    if (value === 'isolation_failed') return 'Isolation Failed';
    return 'Partially Contained';
  }
  function stateClass(value) { return value === 'fully_contained' ? 'pill good' : value === 'isolation_failed' ? 'pill bad' : 'pill warn'; }

  function renderHealth(h, isolation) {
    const summary = $('healthSummary'); clear(summary);
    const total = Number(isolation?.fully_contained || 0) + Number(isolation?.partially_contained || 0) + Number(isolation?.isolation_failed || 0);
    const isolationText = Number(isolation?.isolation_failed || 0) ? `${isolation.isolation_failed} failed` : Number(isolation?.partially_contained || 0) ? `${isolation.partially_contained} partial` : total ? `${isolation.fully_contained} fully contained` : 'No active items';
    summary.append(
      fact('Mode', h.mode || 'unknown'),
      fact('Health', h.healthy ? 'Healthy' : 'Needs review'),
      fact('Active Vault items', Number(h.active_vault_items || 0).toLocaleString()),
      fact('Live isolation', isolationText),
      fact('Vault size', fmtBytes(h.vault_bytes)),
      fact('Journal', h.journal_valid ? `${Number(h.journal_entries || 0)} valid entries` : (h.journal_exists ? 'Needs review' : 'Not created yet')),
      fact('State directory mode', h.state_dir_mode || '—'),
      fact('Vault directory mode', h.vault_dir_mode || '—'),
      fact('Manifest issues', Number(h.manifest_issues || 0).toLocaleString())
    );
    const issues = $('healthIssues'); clear(issues);
    for (const issue of [...(h.issues || []), ...(h.advisories || [])]) {
      const n = el('div','item'); n.append(el('b','', 'Recovery advisory'), el('span','',issue)); issues.append(n);
    }
    if (Number(isolation?.isolation_failed || 0)) {
      const n=el('div','item'); n.append(el('b','', 'Isolation failure'),el('span','',`${isolation.isolation_failed} active Vault item(s) failed at least one critical live containment check.`)); issues.append(n);
    } else if (Number(isolation?.partially_contained || 0)) {
      const n=el('div','item'); n.append(el('b','', 'Partial containment'),el('span','',`${isolation.partially_contained} active Vault item(s) still have a running/startup/filesystem reference or an isolation property that could not be verified.`)); issues.append(n);
    }
    if (!issues.childNodes.length) issues.append(el('div','empty','No Vault/journal health or isolation issue is currently reported.'));
  }

  function renderIsolation(card, status) {
    if (!status) return;
    const block=el('div','isolation-block');
    const head=el('div','item-head');
    head.append(el('b','', 'Live isolation verification'),el('span',stateClass(status.state),stateLabel(status.state)));
    block.append(head);
    const facts=el('div','isolation-facts');
    facts.append(
      el('span','',status.link_count_known ? `Hard links: ${Number(status.link_count || 0)}` : 'Hard links: unknown'),
      el('span','',`Running PIDs: ${(status.running_pids || []).length ? status.running_pids.join(', ') : 'none observed'}`),
      el('span','',`Startup refs: ${(status.startup_refs || []).length}`),
      el('span','',`Hash: ${status.hash_match || 'not checked'}`)
    );
    block.append(facts);
    const checks=el('div','isolation-checks');
    for (const check of status.checks || []) {
      const row=el('div','isolation-check');
      const cls=check.status==='pass'?'pill good':check.status==='fail'?'pill bad':'pill warn';
      const label=check.status==='pass'?'Pass':check.status==='fail'?'Fail':check.status==='unknown'?'Unknown':'Review';
      const top=el('div','isolation-check-head'); top.append(el('b','',check.title || check.id || 'Check'),el('span',cls,label));
      row.append(top,el('p','',check.detail || ''));
      checks.append(row);
    }
    block.append(checks);
    card.append(block);
  }

  function renderVault(payload, isolationPayload) {
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    const isolationRows = Array.isArray(isolationPayload?.items) ? isolationPayload.items : [];
    const isolationByID = new Map(isolationRows.map(x => [String(x.vault_id || ''), x]));
    $('vaultCount').textContent = String(rows.length);
    const root = $('vaultItems'); clear(root);
    if (!rows.length) { root.append(el('div','empty','No active Vault items.')); return; }
    for (const v of rows.slice(0, 100)) {
      const card = el('article','item'); const head = el('div','item-head');
      const isolation=isolationByID.get(String(v.id || ''));
      head.append(el('b','',v.original_name || v.id || 'Vault item'), el('span',isolation ? stateClass(isolation.state) : 'pill warn',isolation ? stateLabel(isolation.state) : 'Isolation unknown')); card.append(head);
      const kv = el('div','kv');
      for (const [label,value] of [['Moved',fmtTime(v.moved_at)],['Size',fmtBytes(v.size)],['SHA-256',v.sha256 || '—'],['Original',v.original_path || '—'],['Vault path',v.vault_path || '—'],['Vault ID',v.id || '—']]) { const d=el('div'); d.append(el('span','',label),el('code','',value)); kv.append(d); }
      card.append(kv);
      renderIsolation(card,isolation);
      const actions = el('div','actions'); const original = investigateLink(v.original_path,'Investigate original path'); const current = investigateLink(v.vault_path,'Investigate Vault object'); if (original) actions.append(original); if (current) actions.append(current); if (actions.childNodes.length) card.append(actions);
      root.append(card);
    }
  }

  function renderObservation(card, obs) {
    if (!obs || typeof obs !== 'object') return;
    const block = el('div','observation'); block.append(el('b','', 'Post-action observation'));
    const details = [];
    if ('source_exists' in obs) details.push(`source ${obs.source_exists ? 'still exists' : 'not observed'}`);
    if ('destination_exists' in obs) details.push(`destination ${obs.destination_exists ? 'exists' : 'not observed'}`);
    if (Array.isArray(obs.running_pids) && obs.running_pids.length) details.push(`running PIDs ${obs.running_pids.join(', ')}`);
    if (Array.isArray(obs.startup_refs) && obs.startup_refs.length) details.push(`${obs.startup_refs.length} startup reference(s)`);
    if (obs.trust_match) details.push(`trust ${obs.trust_match}`);
    block.append(el('span','',details.length ? details.join(' · ') : (obs.note || 'No additional bounded post-action observation fields were exposed.')));
    if (obs.note && details.length) block.append(el('p','',obs.note));
    card.append(block);
  }

  function renderJournal(payload) {
    const rows = Array.isArray(payload?.entries) ? payload.entries : [];
    $('journalCount').textContent = String(rows.length);
    const root = $('journalItems'); clear(root);
    if (!rows.length) { root.append(el('div','empty','No Safe Action journal entries.')); return; }
    for (const j of rows.slice(0, 100)) {
      const card = el('article','item'); const head=el('div','item-head');
      const cls = j.status === 'success' ? 'pill good' : 'pill warn';
      head.append(el('b','',`${j.action || 'Safe Action'} · ${j.object_name || 'object'}`),el('span',cls,j.status || 'unknown')); card.append(head);
      card.append(el('span','',`${fmtTime(j.at)} · ${j.reversible ? 'reversible' : 'not marked reversible'}`));
      if (j.message) card.append(el('p','',j.message));
      const kv=el('div','kv'); for (const [label,value] of [['From',j.from || '—'],['To',j.to || '—'],['SHA-256',j.sha256 || '—']]) { const d=el('div'); d.append(el('span','',label),el('code','',value)); kv.append(d); } card.append(kv);
      renderObservation(card,j.observation);
      const actions=el('div','actions'); const from=investigateLink(j.from,'Investigate source'); const to=investigateLink(j.to,'Investigate destination'); if(from)actions.append(from);if(to)actions.append(to);if(actions.childNodes.length)card.append(actions);
      root.append(card);
    }
  }

  async function load() {
    if (!token) { $('notice').textContent = 'Missing Sentinel session token. Open Vault Health from the running local Sentinel session.'; return; }
    $('notice').textContent = '';
    try {
      const [health,vault,journal,isolation] = await Promise.all([api('/api/actions/health'),api('/api/actions/vault'),api('/api/actions/journal'),api('/api/actions/vault/isolation')]);
      renderHealth(health,isolation); renderVault(vault,isolation); renderJournal(journal);
    } catch (error) { $('notice').textContent = `Vault Health unavailable: ${error.message}`; }
  }
  $('refresh').addEventListener('click',load);
  load();
})();
