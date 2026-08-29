// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = (s) => document.querySelector(s);

  function node(tag, className = '', text = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== '') el.textContent = String(text);
    return el;
  }

  function setNotice(text = '') { $('#notice').textContent = text; }

  async function api(url, options = {}) {
    options.headers = {...(options.headers || {}), 'X-Sentinel-Token': token};
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({error: `HTTP ${response.status}`}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function modeURL(mode, params = {}) {
    const q = new URLSearchParams({mode, ...params});
    return `/api/system/query/structured?${q.toString()}`;
  }

  const postMode = (mode, params = {}) => api(modeURL(mode, params), {method: 'POST'});
  const runTool = (tool_id, target = '') => api('/api/system/query/structured', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tool_id, target}),
  });

  function metric(label, value) {
    const box = node('div', 'metric'); box.append(node('span', '', label), node('b', '', value)); return box;
  }

  function badge(text, kind = '') { return node('span', `badge ${kind}`, text); }
  function fmtBytes(n) {
    const value = Number(n || 0); const abs = Math.abs(value); const units = ['B','KB','MB','GB','TB'];
    let x = abs, i = 0; while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
    return `${value < 0 ? '-' : ''}${x.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
  }
  function fmtTime(s) {
    if (!s) return '—'; const d = typeof s === 'number' ? new Date(s * 1000) : new Date(s); return Number.isNaN(d.valueOf()) ? String(s) : d.toLocaleString();
  }

  function investigateLink(path, label = 'Continue Investigation') {
    const a = node('a', '', label); a.href = `/investigation.html#token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`; return a;
  }
  function intelligenceLink(label = 'Open Intelligence') {
    const a = node('a', '', label); a.href = `/intelligence-center.html#token=${encodeURIComponent(token)}`; return a;
  }

  function renderPosture(data) {
    const summary = $('#postureSummary'); summary.replaceChildren(
      metric('Typed sources', (data.latest_evidence || []).length),
      metric('Review signals', (data.review_signals || []).length),
      metric('Incident eligible', data.incident_eligible || 0),
      metric('Active incidents', data.active_incidents || 0),
      metric('Safe Actions', data.safe_actions?.healthy ? 'healthy' : 'review')
    );
    const evidence = $('#postureEvidence'); evidence.replaceChildren();
    for (const row of data.latest_evidence || []) {
      const card = node('article', 'card'); card.append(node('h3', '', row.tool_name || row.tool_id));
      card.append(node('p', '', row.summary || row.status || 'Observed'));
      card.append(node('small', '', `${fmtTime(row.at)}${row.target ? ` · ${row.target}` : ''}`));
      for (const s of row.signals || []) card.append(badge(s.summary || s.code, s.severity || ''));
      if (row.target?.startsWith('/')) { const actions = node('div', 'row-actions'); actions.append(investigateLink(row.target)); card.append(actions); }
      evidence.append(card);
    }
    const signals = $('#postureSignals'); signals.replaceChildren();
    for (const s of data.review_signals || []) {
      const row = node('div', 'row'); const main = node('div', 'row-main');
      main.append(badge(s.severity || 'review', s.severity || 'review'), node('b', '', s.summary || s.code), node('p', '', s.detail || 'Typed review signal.'));
      const actions = node('div', 'row-actions'); actions.append(intelligenceLink('Incidents / Explain Why'));
      row.append(main, actions); signals.append(row);
    }
    if (!(data.review_signals || []).length) signals.append(node('p', 'help', 'No retained typed review signal is currently present. Missing evidence is not treated as proof of safety.'));
  }

  async function refreshPosture() {
    const button = $('#refreshPosture'); button.disabled = true; setNotice('Refreshing bounded security evidence…');
    try {
      await Promise.all(['gatekeeper-status','filevault-status','sip-status','system-extensions'].map(id => runTool(id).catch(() => null)));
      renderPosture(await postMode('security-posture')); setNotice('Security Posture refreshed from typed local evidence.');
    } catch (e) { setNotice(e.message); } finally { button.disabled = false; }
  }

  function fillSnapshotSelects(rows) {
    for (const select of [$('#snapshotFrom'), $('#snapshotTo')]) select.replaceChildren();
    rows.forEach((s, i) => {
      for (const select of [$('#snapshotFrom'), $('#snapshotTo')]) {
        const option = node('option', '', `${fmtTime(s.captured_at)}${s.partial ? ' · partial' : ''}`); option.value = s.id; select.append(option);
      }
      if (i === 0) $('#snapshotTo').value = s.id;
      if (i === 1) $('#snapshotFrom').value = s.id;
    });
  }

  function renderSnapshotList(data) {
    const rows = data.snapshots || []; fillSnapshotSelects(rows);
    const box = $('#snapshotList'); box.replaceChildren();
    for (const s of rows) {
      const row = node('div', 'row'); const main = node('div', 'row-main');
      main.append(node('b', '', fmtTime(s.captured_at)), node('p', '', `${(s.processes||[]).length} processes · ${(s.startup||[]).length} launch services · ${(s.network||[]).length} TCP relationships · ${(s.mounts||[]).length} mounts`));
      main.append(badge(s.partial ? 'partial evidence' : 'complete within selected sources', s.partial ? 'review' : 'ok'));
      for (const l of s.limitations || []) main.append(node('small', '', `Limitation: ${l}`));
      row.append(main); box.append(row);
    }
    if (!rows.length) box.append(node('p', 'help', 'No retained System Snapshot yet. Capture is explicit and bounded to 16 snapshots.'));
  }

  async function loadSnapshots() { renderSnapshotList(await postMode('system-snapshots')); }
  async function captureSnapshot() {
    const b=$('#captureSnapshot'); b.disabled=true; setNotice('Capturing selected current macOS evidence…');
    try { await postMode('system-snapshot-capture'); await loadSnapshots(); setNotice('System Snapshot captured.'); } catch(e){setNotice(e.message)} finally { b.disabled=false; }
  }

  function renderSnapshotDiff(diff) {
    const box=$('#snapshotDiff'); box.replaceChildren();
    const top=node('div','row'); const main=node('div','row-main'); main.append(node('b','',`${fmtTime(diff.from_at)} → ${fmtTime(diff.to_at)}`),node('p','',`${diff.change_count || 0} observed differences across retained snapshots.`)); top.append(main); box.append(top);
    for(const c of diff.categories || []){
      const group=node('div','card diff-group'); group.append(node('h3','',c.category));
      for(const x of c.added || []) group.append(node('p','delta-positive',`+ ${x}`));
      for(const x of c.removed || []) group.append(node('p','delta-negative',`− ${x}`));
      box.append(group);
    }
    for(const [key,pair] of Object.entries(diff.security_changed || {})){
      const group=node('div','card diff-group'); group.append(node('h3','',`Security · ${key}`),node('p','',`${pair?.[0] || '—'} → ${pair?.[1] || '—'}`)); box.append(group);
    }
    box.append(node('p','help',diff.note || 'Snapshot differences are observations, not causal conclusions.'));
  }
  async function compareSnapshots(){
    const from=$('#snapshotFrom').value,to=$('#snapshotTo').value;if(!from||!to){setNotice('Capture at least two snapshots to compare.');return}
    try{renderSnapshotDiff(await postMode('system-snapshot-diff',{from,to}));setNotice('Snapshot comparison updated.')}catch(e){setNotice(e.message)}
  }

  function renderStorage(data){
    const snaps=data.snapshots||[], cmp=data.latest_comparison||{}; const summary=$('#storageSummary'); summary.replaceChildren(metric('Retained snapshots',snaps.length),metric('Retention',data.retention||24),metric('Mode',data.persistent?'persistent':'memory-only'),metric('Latest delta',data.has_comparison?fmtBytes(cmp.delta_bytes):'—'),metric('Latest root',cmp.root||snaps.at(-1)?.root||'—'));
    const box=$('#storageHistory');box.replaceChildren();
    if(data.has_comparison){const c=node('div','card');c.append(node('h3','',`Latest growth · ${fmtBytes(cmp.delta_bytes)}`),node('p','',`${fmtTime(cmp.before_at)} → ${fmtTime(cmp.after_at)}`));for(const d of (cmp.directory_changes||[]).slice(0,12)) c.append(node('p',d.delta_bytes>=0?'delta-positive':'delta-negative',`${d.delta_bytes>=0?'+':''}${fmtBytes(d.delta_bytes)} · ${d.name}`));if(cmp.partial)c.append(badge('partial comparison','review'));box.append(c)}
    for(const s of [...snaps].reverse().slice(0,12)){const row=node('div','row');const main=node('div','row-main');main.append(node('b','',fmtTime(s.created_at)),node('p','',`${s.root||'unknown root'} · ${fmtBytes(s.visible_bytes)} · ${s.files_visited||0} files`),badge(s.partial?'partial':'captured',s.partial?'review':'ok'));const actions=node('div','row-actions');if(s.root?.startsWith('/'))actions.append(investigateLink(s.root,'Investigate root'));row.append(main,actions);box.append(row)}
    if(!snaps.length)box.append(node('p','help','No Storage History snapshot yet. Run a Storage Intelligence scan, then capture its completed result here.'));
  }
  async function loadStorage(){renderStorage(await postMode('storage-history'))}
  async function captureStorage(){const b=$('#captureStorage');b.disabled=true;try{await postMode('storage-snapshot-capture');await loadStorage();setNotice('Latest completed Storage Intelligence result captured.')}catch(e){setNotice(e.message)}finally{b.disabled=false}}

  function renderRecovery(data){
    $('#recoverySummary').replaceChildren(metric('Mode',data.mode||'—'),metric('Vault items',(data.vault||[]).length),metric('Recoverable actions',data.recoverable_actions||0),metric('System snapshots',data.system_snapshots||0),metric('Network snapshots',data.network_snapshots||0),metric('Storage snapshots',data.storage_snapshots||0));
    const adv=$('#recoveryAdvisories');adv.replaceChildren();for(const x of data.advisories||[]){const r=node('div','row');const m=node('div','row-main');m.append(badge('review','review'),node('b','',x));r.append(m);adv.append(r)}if(!(data.advisories||[]).length)adv.append(node('p','help','No aggregated Recovery Center advisory is currently reported.'));
    const journal=$('#recoveryJournal');journal.replaceChildren();for(const e of (data.journal||[]).slice(0,30)){const row=node('div','row');const main=node('div','row-main');main.append(node('b','',`${e.action||'action'} · ${e.status||'unknown'}`),node('p','',e.message||''),node('small','',`${fmtTime(e.at)}${e.from?` · ${e.from}`:''}${e.to?` → ${e.to}`:''}`));if(e.reversible)main.append(badge('reversible','ok'));const actions=node('div','row-actions');if(e.to?.startsWith('/'))actions.append(investigateLink(e.to));else if(e.from?.startsWith('/'))actions.append(investigateLink(e.from));const open=node('a','','Open Safe Actions');open.href=`/#token=${encodeURIComponent(token)}`;actions.append(open);row.append(main,actions);journal.append(row)}
  }
  async function loadRecovery(){renderRecovery(await postMode('recovery'))}

  function renderEvidence(data){const box=$('#systemEvidence');box.replaceChildren();for(const e of data.rows||[]){const row=node('div','row');const main=node('div','row-main');main.append(node('b','',e.tool_name||e.tool_id),node('p','',e.summary||e.status||''),node('small','',`${fmtTime(e.at)}${e.target?` · ${e.target}`:''}`));for(const s of e.signals||[])main.append(badge(s.code||s.summary,s.severity||''));const actions=node('div','row-actions');if(e.target?.startsWith('/'))actions.append(investigateLink(e.target));row.append(main,actions);box.append(row)}if(!(data.rows||[]).length)box.append(node('p','help','No retained typed System Console evidence yet. Running Toolbox queries will populate bounded summaries here.'));}
  async function loadEvidence(){renderEvidence(await postMode('system-evidence'))}

  function tokenLink(id,path){const a=$(id);if(a)a.href=`${path}#token=${encodeURIComponent(token)}`}
  tokenLink('#systemConsoleLink','/system-console.html');tokenLink('#intelligenceLink','/intelligence-center.html');tokenLink('#backLink','/');
  $('#refreshPosture').addEventListener('click',refreshPosture);$('#captureSnapshot').addEventListener('click',captureSnapshot);$('#compareSnapshots').addEventListener('click',compareSnapshots);$('#captureStorage').addEventListener('click',captureStorage);$('#refreshRecovery').addEventListener('click',()=>loadRecovery().catch(e=>setNotice(e.message)));$('#refreshEvidence').addEventListener('click',()=>loadEvidence().catch(e=>setNotice(e.message)));

  if(!token){setNotice('Missing Sentinel session token. Open Control Plane Center from the running Sentinel session.');return}
  Promise.all([postMode('security-posture').then(renderPosture),loadSnapshots(),loadStorage(),loadRecovery(),loadEvidence()]).catch(e=>setNotice(e.message));
})();
