// SPDX-License-Identifier: MPL-2.0
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, text = '') => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'href') n.href = v;
      else if (k === 'type') n.type = v;
      else n.setAttribute(k, String(v));
    }
    if (text) n.textContent = text;
    return n;
  };
  const notice = (m='') => { $('#notice').textContent = m; };
  const withToken = (href) => {
    const u = new URL(href, location.origin);
    const section = u.hash ? u.hash.slice(1) : '';
    u.hash = `token=${encodeURIComponent(token)}`;
    if (section && !u.searchParams.has('section')) u.searchParams.set('section', section);
    return u.pathname + u.search + u.hash;
  };
  async function api(url, opts={}) {
    opts.headers = {...(opts.headers||{}), 'X-Sentinel-Token': token};
    const r = await fetch(url, opts); const data = await r.json().catch(() => ({error:`HTTP ${r.status}`}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`); return data;
  }
  function metric(label, value) { return el('span',{class:'metric'},`${label}: ${value}`); }
  function clear(node) { node.replaceChildren(); }
  function statusClass(v='') { return `status-${String(v).toLowerCase().replace(/[^a-z0-9_]/g,'_')}`; }
  function fmtTime(sec) { return sec ? new Date(Number(sec)*1000).toLocaleString() : '—'; }
  function link(label, href) { return el('a',{class:'action-link',href:withToken(href)},label); }

  async function loadGraph() {
    const f = new FormData($('#graphFilters')); const q = new URLSearchParams();
    for (const [k,v] of f) if (String(v).trim()) q.set(k,String(v).trim());
    const data = await api('/api/intelligence/graph/v2?' + q);
    const meta=$('#graphMeta'); clear(meta); meta.append(metric('Nodes',data.nodes?.length||0),metric('Edges',data.edges?.length||0),metric('Budget',`${data.node_budget}/${data.edge_budget}`),metric('Truncated',data.truncated?'yes':'no'));
    const nodes=$('#graphNodes'); clear(nodes);
    for (const n of (data.nodes||[]).slice(0,90)) {
      const c=el('article',{class:'card'}); c.append(el('h3',{class:statusClass(n.severity)},`${n.type} · ${n.label}`));
      if(n.ref)c.append(el('p',{class:'line'},n.ref)); if(n.detail)c.append(el('p',{},n.detail));
      c.append(el('p',{},`Sources: ${(n.sources||[]).join(', ')||'—'} · Review priority ${n.review_priority||0}`));
      if(n.type==='file'&&n.ref?.startsWith('/'))c.append(link('Continue Investigation',`/investigation.html?path=${encodeURIComponent(n.ref)}`));
      if(n.type==='incident')c.append(link('Open incidents','/intelligence-center.html?section=incidents'));
      nodes.append(c);
    }
    if(!nodes.childElementCount)nodes.append(el('p',{class:'empty'},'No graph nodes match the current filters.'));
    const edges=$('#graphEdges'); clear(edges); for(const e of(data.edges||[]).slice(0,140))edges.append(el('div',{class:'row'},`${e.type} · ${e.from} → ${e.to}${e.detail?' · '+e.detail:''}`));
  }

  function listText(title, values) {
    const box=el('div',{class:'list'}); box.append(el('h4',{},title));
    for(const v of values||[]) box.append(el('div',{class:'row'},typeof v==='string'?v:(v.summary||v.code||JSON.stringify(v))));
    if(!(values||[]).length)box.append(el('p',{class:'muted'},'None in retained evidence.')); return box;
  }
  async function loadIncidents(method='GET') {
    const data=await api('/api/incidents/v2?history=1',{method}); const root=$('#incidentList'); clear(root);
    for(const row of(data.incidents||[]).slice(0,80)) {
      const v=row.view||{}, incident=v.incident||{}, exp=v.explanation||{}; const c=el('article',{class:'card'});
      c.append(el('h3',{class:statusClass(incident.severity)},incident.title||row.stable_id));
      c.append(el('p',{class:'line'},incident.primary_path||'No primary path'));
      c.append(el('p',{},`Stable ${row.stable_id} · Episode ${row.episode_id} · ${row.state||'active'}`));
      c.append(el('p',{},`First ${fmtTime(row.first_seen)} · Last ${fmtTime(row.last_seen)} · occurrences ${row.occurrence_count||0}`));
      c.append(el('p',{},`Relationship confidence ${incident.confidence||0} (${incident.confidence_band||'—'}) · ${(incident.sources||[]).join(' + ')}`));
      const details=el('details'); details.append(el('summary',{},'Explain Why / Evidence'));
      const split=el('div',{class:'split'}); split.append(listText('Observed facts',exp.observed_facts),listText('Derived relationships',exp.derived_relationships),listText('Interpretation',exp.interpretation),listText('Unknowns',exp.unknowns)); details.append(split); c.append(details);
      if(incident.primary_path?.startsWith('/')) c.append(link('Continue Investigation',`/investigation.html?path=${encodeURIComponent(incident.primary_path)}`));
      root.append(c);
    }
    if(!root.childElementCount)root.append(el('p',{class:'empty'},'No retained incidents.'));
  }

  async function loadTimeline() {
    const f=new FormData($('#timelineFilters')); const q=new URLSearchParams(); for(const[k,v]of f)if(String(v).trim())q.set(k,String(v).trim());
    const data=await api('/api/intelligence/timeline/global?'+q); const meta=$('#timelineMeta');clear(meta);meta.append(metric('Events',data.count||0),metric('Sources',(data.sources||[]).length),metric('Limit',500));
    const root=$('#timelineRows');clear(root); const events=(data.events||[]).slice().reverse().slice(0,260);
    for(const e of events){const row=el('article',{class:'timeline-item'});row.append(el('time',{},fmtTime(e.at)),el('div',{class:`source ${statusClass(e.severity)}`},`${e.source} · ${e.kind}`),el('div',{},`${e.detail||''}${e.path?' · '+e.path:''}`));root.append(row)}
    if(!root.childElementCount)root.append(el('p',{class:'empty'},'No timeline events match the filters.'));
  }

  function kv(rows){const root=el('div',{class:'kv'});for(const[label,value]of rows){const c=el('div');c.append(el('span',{},label),el('b',{},String(value??'—')));root.append(c)}return root}
  async function loadObject(path) {
    const data=await api('/api/object/story/v2?path='+encodeURIComponent(path)); const root=$('#objectResult');clear(root); const b=data.base||{};
    root.append(kv([['Object',b.title||path],['Risk / review',b.risk||0],['First seen',fmtTime(data.first_seen)],['Last seen',fmtTime(data.last_seen)]]));
    root.append(el('p',{class:'muted'},b.summary||data.note||''));
    const split=el('div',{class:'split'}); const facts=el('div',{class:'list'});facts.append(el('h4',{},'Facts'));for(const f of(b.facts||[]))facts.append(el('div',{class:'row'},`${f.category} · ${f.label}: ${f.value} · ${f.source}`));
    const rel=el('div',{class:'list'});rel.append(el('h4',{},'Relationships'));for(const x of(b.relations||[]))rel.append(el('div',{class:'row'},`${x.kind} → ${x.target}${x.detail?' · '+x.detail:''}`));split.append(facts,rel);root.append(split);
    const runtime=data.runtime||{}; root.append(el('h3',{},'Runtime context'));root.append(kv([['Processes',(runtime.processes||[]).length],['Persistence',(runtime.persistence||[]).length],['Background',(runtime.background||[]).length],['Incidents',(data.incidents||[]).length]]));
    const inc=el('div',{class:'cards'});for(const i of(data.incidents||[])){const c=el('article',{class:'card'});c.append(el('h4',{class:statusClass(i.severity)},i.title),el('p',{},`confidence ${i.confidence} · ${fmtTime(i.first_seen)} → ${fmtTime(i.last_seen)}`));inc.append(c)}root.append(inc);
    const unknown=listText('Unknowns',data.unknowns);root.append(unknown);
    const targets=el('div',{class:'cards'});for(const t of(data.next_targets||[]).slice(0,30)){const c=el('article',{class:'card'});c.append(el('h4',{},t.kind||'related object'),el('p',{class:'line'},t.path),el('p',{},t.why||''),link('Continue',`/investigation.html?path=${encodeURIComponent(t.path)}`));targets.append(c)}if(targets.childElementCount){root.append(el('h3',{},'Continue from related evidence'),targets)}
  }

  async function loadVisibility(){const data=await api('/api/visibility');const m=$('#visibilityMetrics');clear(m);m.append(metric('Available',data.available||0),metric('Limited / controlled',data.limited||0),metric('Unavailable',data.unavailable||0));const root=$('#visibilityList');clear(root);for(const s of data.sources||[]){const c=el('article',{class:'card'});c.append(el('h3',{class:statusClass(s.status)},`${s.name} · ${s.status}`),el('p',{},s.category),el('p',{class:'line'},s.detail));if(s.impact)c.append(el('p',{},s.impact));root.append(c)}}

  async function guarded(fn){try{notice('');await fn()}catch(e){notice(e.message||String(e))}}
  $('#graphFilters').addEventListener('submit',e=>{e.preventDefault();guarded(loadGraph)});
  $('#timelineFilters').addEventListener('submit',e=>{e.preventDefault();guarded(loadTimeline)});
  $('#objectForm').addEventListener('submit',e=>{e.preventDefault();guarded(()=>loadObject($('#objectPath').value.trim()))});
  $('#rebuildIncidents').addEventListener('click',()=>guarded(()=>loadIncidents('POST')));
  $('#refreshVisibility').addEventListener('click',()=>guarded(loadVisibility));
  $('#cmdButton').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('sentinel-open-command-palette')));
  for(const b of document.querySelectorAll('[data-jump]'))b.addEventListener('click',()=>document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth'}));
  $('#backLink').href=withToken('/');
  if(!token){notice('Missing Sentinel session token. Open this workspace from the running Sentinel session.');return}
  const section=new URLSearchParams(location.search).get('section'); if(section)setTimeout(()=>document.getElementById(section)?.scrollIntoView(),60);
  guarded(async()=>{await Promise.all([loadGraph(),loadIncidents(),loadTimeline(),loadVisibility()])});
})();