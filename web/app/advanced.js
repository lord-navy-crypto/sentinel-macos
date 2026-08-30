// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load before advanced evidence module.');
  const {$,state,api,busy,activity,notice,esc,bytes,fmt,sev,badge,question,band,empty,ledger,table,primitiveRows,registerLens}=S;

  async function structured(mode,params={}){
    const q=new URLSearchParams({mode,...params});
    return api('/api/system/query/structured?'+q.toString(),{method:'POST'});
  }

  function metricLines(rows){
    return `<div class="s24-map-legend">${rows.map(([k,v])=>`<div class="metric-line"><span>${esc(k)}</span><b>${esc(v??'—')}</b></div>`).join('')}</div>`;
  }

  function laneFor(type){
    const t=String(type||'').toLowerCase();
    if(t.includes('startup')||t.includes('launch')||t.includes('persistence')||t.includes('background'))return 'startup';
    if(t.includes('file')||t.includes('path')||t.includes('object'))return 'file';
    if(t.includes('process'))return 'process';
    if(t.includes('network')||t.includes('endpoint')||t.includes('socket'))return 'network';
    if(t.includes('incident')||t.includes('case'))return 'incident';
    return 'other';
  }

  function evidenceTopology(graph){
    const order=['startup','file','process','network','incident','other'];
    const labels={startup:'STARTUP',file:'FILE / OBJECT',process:'PROCESS',network:'NETWORK',incident:'CASE',other:'OTHER'};
    const x={startup:30,file:245,process:460,network:675,incident:890,other:1105};
    const width=184,row=58;
    const groups={};order.forEach(k=>groups[k]=[]);
    for(const n of graph.nodes||[])groups[laneFor(n.type)].push(n);
    for(const key of order)groups[key].sort((a,b)=>Number(b.review_priority||b.risk||0)-Number(a.review_priority||a.risk||0));
    const selected=[];const pos=new Map();
    for(const key of order){for(const [i,n] of groups[key].slice(0,8).entries()){selected.push(n);pos.set(n.id,{x:x[key],y:45+i*row,lane:key});}}
    state.advancedGraphNodes=new Map(selected.map(n=>[String(n.id),n]));
    let svg='<svg viewBox="0 0 1320 540" role="img" aria-label="Correlated evidence topology">';
    for(const key of order){if(!groups[key].length)continue;svg+=`<text class="lane" x="${x[key]}" y="20">${labels[key]}</text>`;}
    for(const e of graph.edges||[]){const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)continue;const review=String(e.severity||'').toLowerCase()==='review'||Number(e.review_priority||0)>=50?' review':'';svg+=`<line class="edge${review}" x1="${a.x+width}" y1="${a.y+18}" x2="${b.x}" y2="${b.y+18}"></line>`;}
    for(const n of selected){const p=pos.get(n.id),priority=Number(n.review_priority||n.risk||0),klass=priority>=70?' high':priority>=35?' review':'';const title=(n.label||n.ref||n.type||'evidence').slice(0,25),sub=(n.detail||n.ref||'').slice(0,30);svg+=`<g class="node${klass}" tabindex="0" data-advanced-node="${esc(encodeURIComponent(String(n.id)))}"><rect x="${p.x}" y="${p.y}" width="${width}" height="38" rx="7"></rect><text x="${p.x+8}" y="${p.y+15}">${esc(title)}</text><text class="sub" x="${p.x+8}" y="${p.y+29}">${esc(sub)}</text></g>`;}
    return svg+'</svg>';
  }

  function timelineDensity(groups){
    const rows=groups||[];if(!rows.length)return empty('No retained timeline groups.');
    const points=rows.map(g=>({at:Number(g.last_at||g.first_at||0),count:Number(g.count||1),review:['review','high','critical'].includes(String(g.severity||'').toLowerCase())})).filter(x=>x.at>0);
    if(!points.length)return empty('Timeline groups have no usable observation times.');
    const min=Math.min(...points.map(x=>x.at)),max=Math.max(...points.map(x=>x.at)),span=Math.max(1,max-min),bins=24,bucket=Array.from({length:bins},()=>({count:0,review:false}));
    for(const p of points){const i=Math.min(bins-1,Math.max(0,Math.floor((p.at-min)/span*bins)));bucket[i].count+=p.count;bucket[i].review=bucket[i].review||p.review;}
    const peak=Math.max(1,...bucket.map(x=>x.count));let svg='<div class="s24-density"><svg viewBox="0 0 720 92" role="img" aria-label="Timeline evidence density"><line class="axis" x1="0" y1="82" x2="720" y2="82"></line>';
    bucket.forEach((b,i)=>{const h=Math.max(2,Math.round(b.count/peak*70)),x=i*30+3,y=82-h;svg+=`<rect class="bar${b.review?' review':''}" x="${x}" y="${y}" width="22" height="${h}" rx="2"></rect>`;});
    svg+='</svg></div>';return svg;
  }

  function groupedTimelineFeed(data){
    const groups=data.groups||[];
    if(!groups.length)return empty('No grouped timeline evidence is retained for the current scope.');
    return `<div class="s24-feed">${groups.slice().reverse().slice(0,80).map(g=>`<div class="s24-feed-item"><time>${esc(fmt(g.last_at||g.first_at))}</time><div><h3>${esc(g.source||'evidence')} · ${esc(g.kind||'observation')} · ×${Number(g.count||1)}</h3><p>${esc(g.detail||'')}</p>${g.path?`<code>${esc(g.path)}</code>`:''}</div><div class="meta">${badge(g.severity||'info',sev(g.severity))}</div></div>`).join('')}</div>`;
  }

  async function openStoryAdvanced({pid=0,path=''}){
    try{
      busy('Building object context',path||`PID ${pid}`);
      let d;
      if(path){
        try{d=await api('/api/object/story/v2?path='+encodeURIComponent(path));}
        catch{d=await api('/api/object/story?path='+encodeURIComponent(path));}
      }else d=await api('/api/object/story?pid='+encodeURIComponent(pid));
      const base=d.base||d,facts=base.facts||[],relations=base.relations||[],runtime=d.runtime||{},incidents=d.incidents||[],unknowns=d.unknowns||[],targets=d.next_targets||[];
      $('#contextTitle').textContent=base.title||path||`PID ${pid}`;
      const factBody=facts.length?ledger(facts.slice(0,20).map(f=>[f.label||f.category,f.value,f.source||''])):empty('No bounded identity facts returned.');
      const relBody=relations.length?relations.slice(0,24).map(r=>`<p><b>${esc(r.kind||'relation')}</b> · ${esc(r.target||r.detail||'')}</p>`).join(''):empty('No retained relationships.');
      const next=targets.length?`<div class="s24-related">${targets.slice(0,14).map(t=>`<button type="button" data-advanced="related-object" data-path="${esc(encodeURIComponent(t.path||''))}"><span>${esc(t.kind||'related')}</span><b>${esc(t.path||t.label||'')}</b></button>`).join('')}</div>`:empty('No next related targets in retained evidence.');
      $('#contextBody').innerHTML=`<section class="s24-context-section"><h3>Observed identity</h3><p>${esc(base.summary||d.note||'Bounded object evidence.')}</p>${factBody}</section><section class="s24-context-section"><h3>Relationships</h3>${relBody}</section><section class="s24-context-section"><h3>Runtime context</h3>${ledger([['Processes',(runtime.processes||[]).length],['Persistence',(runtime.persistence||[]).length],['Background',(runtime.background||[]).length],['Incidents',incidents.length],['First seen',fmt(d.first_seen)],['Last seen',fmt(d.last_seen)]])}</section><section class="s24-context-section"><h3>Unknowns</h3>${unknowns.length?unknowns.map(x=>`<p>${esc(typeof x==='string'?x:(x.summary||x.code||JSON.stringify(x)))}</p>`).join(''):empty('No explicit unknowns were returned.')}</section><section class="s24-context-section"><h3>Continue from related evidence</h3>${next}</section>`;
      $('#contextTray').hidden=false;activity('Ready',100,'Object Story 2.0 loaded');
    }catch(e){notice(e.message);activity('Error',0,e.message);}
  }

  async function renderStatusAdvanced(){
    busy('Reading current evidence','Overview + posture + retained system signals');
    const [o,r,p,e]=await Promise.all([api('/api/overview'),api('/api/readiness').catch(()=>null),structured('security-posture').catch(()=>null),structured('system-evidence').catch(()=>({rows:[]}))]);
    const dp=S.pct(o.disk_used,o.disk_total),mp=S.pct(o.memory_used,o.memory_total),review=(p?.review_signals||[]).length;
    const instruments=[['Disk',`${dp}%`,dp,`${bytes(o.disk_used)} / ${bytes(o.disk_total)}`],['Memory',o.memory_total?`${mp}%`:'—',mp,o.memory_total?`${bytes(o.memory_used)} / ${bytes(o.memory_total)}`:'Not reported'],['Typed review',String(review),Math.min(100,review*16),'Retained typed posture signals'],['Cases',String(p?.active_incidents??'—'),Math.min(100,Number(p?.active_incidents||0)*12),'Correlated evidence stories']];
    const typed=(e.rows||[]).slice(0,12);
    const feed=typed.length?`<div class="s24-feed">${typed.map(x=>`<div class="s24-feed-item"><time>${esc(fmt(x.at))}</time><div><h3>${esc(x.tool_name||x.tool_id||'System evidence')}</h3><p>${esc(x.summary||x.status||'')}</p>${x.target?`<code>${esc(x.target)}</code>`:''}</div><div class="meta">${(x.signals||[]).slice(0,3).map(s=>badge(s.severity||s.code||'signal',sev(s.severity))).join('')}</div></div>`).join('')}</div>`:empty('No retained typed System Console evidence yet.');
    $('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="quickcheck">Run Snapshot</button><button class="s24-action" data-advanced="refresh-posture">Refresh posture</button>`)+band(1,'Current instruments',`<div class="s24-instruments">${instruments.map(x=>`<div class="s24-instrument"><label>${esc(x[0])}</label><strong>${esc(x[1])}</strong><progress max="100" value="${Number(x[2]||0)}"></progress><small>${esc(x[3])}</small></div>`).join('')}</div>`,'Direct measurements and typed evidence pressure; never a malware verdict.')+band(2,'Security posture',p?ledger([['Review signals',review],['Incident eligible',p.incident_eligible||0],['Active cases',p.active_incidents||0],['Safe Actions',p.safe_actions?.healthy?'Healthy':'Review'],['Change monitor',p.change_monitor?.running?'Running':'Stopped']]):empty('Security posture unavailable.'))+band(3,'Retained typed evidence',feed,'Structured local evidence from bounded macOS tools.')+(r?band(4,'Sentinel readiness',ledger(primitiveRows(r,10))):'');
    activity('Ready',100,'Current evidence workspace loaded');
  }

  async function renderRelationsAdvanced(record=false){
    busy(record?'Capturing evidence':'Connecting evidence','Graph 2.0 + grouped global timeline');
    if(record)await api('/api/intelligence/graph',{method:'POST'});
    const [g,t]=await Promise.all([api('/api/intelligence/graph/v2'),api('/api/intelligence/timeline/grouped')]);
    const nodes=g.nodes||[],edges=g.edges||[],groups=t.groups||[];
    const map=`<div class="s24-map-shell"><div class="s24-map-canvas">${evidenceTopology(g)}</div>${metricLines([['Nodes',nodes.length],['Edges',edges.length],['Node budget',g.node_budget||'—'],['Edge budget',g.edge_budget||'—'],['Truncated',g.truncated?'Yes':'No'],['Sources',(g.sources||[]).length||'—']])}</div>`;
    const timeline=`<div class="s24-timeline-viz"><div>${timelineDensity(groups)}${groupedTimelineFeed(t)}</div><div class="s24-timeline-meta">${metricLines([['Groups',t.group_count??groups.length],['Raw events',t.event_count||0],['Sources',(t.sources||[]).length],['Mode','Grouped global']])}</div></div>`;
    $('#evidenceStage').innerHTML=question('<button class="s24-action primary" data-do="capture-relations">Capture evidence</button><button class="s24-action" data-advanced="refresh-relations">Refresh</button>')+band(1,'Evidence topology',map,'Graph 2.0 keeps review priority, source provenance, observation windows, and explicit budgets visible.')+band(2,'Global time density',timeline,'Repeated observations are grouped without deleting raw provenance.');
    activity('Ready',100,'Graph 2.0 and grouped timeline loaded');
  }

  function checkpointList(rows){
    if(!rows.length)return empty('No retained System Snapshots.');
    return `<div class="s24-checkpoint-list">${rows.slice(0,12).map(s=>`<div class="s24-checkpoint"><time>${esc(fmt(s.captured_at))}</time><div><b>${esc(s.partial?'Partial checkpoint':'Bounded checkpoint')}</b><small>${Number((s.processes||[]).length)} processes · ${Number((s.startup||[]).length)} startup · ${Number((s.network||[]).length)} TCP</small></div>${badge(s.partial?'partial':'captured',s.partial?'warn':'good')}</div>`).join('')}</div>`;
  }

  function snapshotDiffHTML(d){
    if(!d)return empty('Capture at least two checkpoints to compare.');
    const cats=d.categories||[],security=Object.entries(d.security_changed||{});
    const blocks=cats.map(c=>`<div class="s24-diff-block ${((c.added||[]).length+(c.removed||[]).length)>0?'review':''}"><h3>${esc(c.category)}</h3><div class="delta"><span>Added</span><b>+${(c.added||[]).length}</b></div><div class="delta"><span>Removed</span><b>−${(c.removed||[]).length}</b></div></div>`).join('')+`<div class="s24-diff-block ${security.length?'review':''}"><h3>Security</h3><div class="delta"><span>Changed</span><b>${security.length}</b></div><div class="delta"><span>Total</span><b>${d.change_count||0}</b></div></div>`;
    const details=[];for(const c of cats){for(const x of c.added||[])details.push(`<p class="added">+ ${esc(c.category)} · ${esc(x)}</p>`);for(const x of c.removed||[])details.push(`<p class="removed">− ${esc(c.category)} · ${esc(x)}</p>`);}for(const [k,v] of security)details.push(`<p>${esc(k)} · ${esc(v?.[0]||'—')} → ${esc(v?.[1]||'—')}</p>`);
    return `<div class="s24-diff-grid">${blocks}</div>${details.length?`<div class="s24-diff-detail">${details.slice(0,160).join('')}</div>`:''}<div class="s24-note">${esc(d.note||'Checkpoint differences are bounded observations, not causal conclusions.')}</div>`;
  }

  async function renderChangesAdvanced(){
    busy('Reading change evidence','Live watch + retained system checkpoints');
    const [d,snaps]=await Promise.all([api('/api/changes/events'),structured('system-snapshots').catch(()=>({snapshots:[]}))]);
    const s=d.status||{},events=d.events||[],rows=snaps.snapshots||[];
    let diff=null;if(rows.length>=2){try{diff=await structured('system-snapshot-diff',{from:rows[1].id,to:rows[0].id});}catch{}}
    const status=ledger([['Watch',s.running?'Running':'Stopped'],['Mode',s.mode||'stopped'],['Events',s.event_count??events.length],['Needs rescan',s.needs_rescan?'YES':'No'],['Dropped signals',s.dropped_signals||0],['Checkpoints',rows.length]]);
    const controls=`<form class="s24-form" data-form="change-watch"><label class="s24-field"><span>Watch scope</span><select name="preset"><option value="persistence">Persistence</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Fallback interval</span><select name="interval"><option value="1500">1.5 s</option><option value="2500" selected>2.5 s</option><option value="5000">5 s</option></select></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Start watch</button><button class="s24-action" type="button" data-do="stop-watch">Stop</button><button class="s24-action" type="button" data-do="review-watch">Reinspect</button></div></form>`;
    const selectors=rows.length>=2?`<div class="s24-form two"><label class="s24-field"><span>From</span><select id="checkpointFrom">${rows.map((x,i)=>`<option value="${esc(x.id)}" ${i===1?'selected':''}>${esc(fmt(x.captured_at))}</option>`).join('')}</select></label><label class="s24-field"><span>To</span><select id="checkpointTo">${rows.map((x,i)=>`<option value="${esc(x.id)}" ${i===0?'selected':''}>${esc(fmt(x.captured_at))}</option>`).join('')}</select></label><div class="s24-form-actions"><button class="s24-action" type="button" data-advanced="compare-checkpoints">Compare</button></div></div>`:'';
    const checkpoint=`<div class="s24-checkpoints"><div>${checkpointList(rows)}<div style="height:10px"></div><button class="s24-action primary" type="button" data-advanced="capture-checkpoint">Capture checkpoint</button></div><div>${selectors}<div id="systemCheckpointDiff">${snapshotDiffHTML(diff)}</div></div></div>`;
    const feed=events.length?`<div class="s24-feed">${events.slice().reverse().map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at))}</time><div><h3>${esc((e.path||'').split('/').pop()||e.kind||'Change')}</h3><p>${esc(e.why||e.kind||'')}</p><code>${esc(e.path||'')}</code></div><div class="meta">${badge(e.severity||'info',sev(e.severity))}${e.needs_rescan?badge('RESCAN','bad'):''}</div></div>`).join('')}</div>`:empty('No live change events in this session.');
    $('#evidenceStage').innerHTML=question()+band(1,'Live watch',controls)+band(2,'Continuity',status,'Dropped/root-changed conditions create rescan-required state rather than false confidence.')+band(3,'System checkpoints',checkpoint,'Explicit retained snapshots provide before/after evidence across process, startup, TCP, mounts, filesystems, and selected security posture.')+band(4,'Observed event stream',feed);
    activity('Ready',100,'Change evidence and system checkpoints loaded');
  }

  function trendSVG(snaps){
    const rows=(snaps||[]).slice().sort((a,b)=>Number(a.created_at||0)-Number(b.created_at||0));if(rows.length<2)return empty('Capture at least two Storage History points to visualize a trend.');
    const vals=rows.map(x=>Number(x.visible_bytes||0)),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1,max-min),w=760,h=150,p=18;const pts=rows.map((x,i)=>{const px=p+i*(w-2*p)/Math.max(1,rows.length-1),py=h-p-(Number(x.visible_bytes||0)-min)/range*(h-2*p);return [px,py,x]});
    let svg=`<div class="s24-trend"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Retained visible storage trend"><line class="grid" x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"></line><line class="grid" x1="${p}" y1="${p}" x2="${w-p}" y2="${p}"></line><polyline class="line" points="${pts.map(x=>`${x[0]},${x[1]}`).join(' ')}"></polyline>`;for(const x of pts)svg+=`<circle class="dot" cx="${x[0]}" cy="${x[1]}" r="4"></circle>`;svg+=`<text x="${p}" y="12">${esc(bytes(max))}</text><text x="${p}" y="${h-2}">${esc(bytes(min))}</text></svg></div>`;return svg;
  }

  function ageBuckets(report){
    const b=report?.buckets||[];if(!b.length)return empty('No large-file aging evidence is available from the latest bounded scan.');
    return `<div class="s24-age-grid">${b.map(x=>`<div class="s24-age-cell"><b>${Number(x.files||0).toLocaleString()}</b><span>${esc(x.label||x.id)}</span><small>${esc(bytes(x.bytes||0))}</small></div>`).join('')}</div>`;
  }

  async function renderStorageAdvanced(){
    busy('Reading storage intelligence','Measurement + history + aging');
    const [history,aging]=await Promise.all([structured('storage-history').catch(()=>({snapshots:[]})),api('/api/storage/aging').catch(()=>null)]);
    const snaps=history.snapshots||[],cmp=history.latest_comparison||{};
    const acquisition=`<form class="s24-form" data-form="storage"><label class="s24-field"><span>Scope</span><select name="scope"><option value="home">Home</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Minimum file MB</span><input name="min" type="number" min="1" max="10240" value="100"></label><label class="s24-field"><span>Large-file limit</span><input name="limit" type="number" min="10" max="2000" value="200"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Measure storage</button><button class="s24-action" type="button" data-do="cancel-storage">Cancel</button><button class="s24-action" type="button" data-advanced="capture-storage-history">Capture completed result</button></div></form><div id="storagePipeline" class="s24-pipeline"><div class="s24-step"><span>01</span><b>Traverse</b></div><div class="s24-step"><span>02</span><b>Measure</b></div><div class="s24-step"><span>03</span><b>Hash candidates</b></div><div class="s24-step"><span>04</span><b>Report</b></div></div>`;
    const historySummary=ledger([['Retained snapshots',snaps.length],['Retention',history.retention||24],['Mode',history.persistent?'Persistent local':'Memory only'],['Latest delta',history.has_comparison?bytes(cmp.delta_bytes):'—'],['Latest root',cmp.root||snaps[0]?.root||'—'],['Aging files',aging?.files_considered||0]]);
    const oldest=aging?.oldest_large_files||[];
    $('#evidenceStage').innerHTML=question('<button class="s24-action" data-advanced="refresh-storage">Refresh intelligence</button>')+band(1,'Acquisition',acquisition,'Bounded, cancellable measurement. Exact duplicate confirmation uses SHA-256; filename families remain heuristic.')+band(2,'Measured footprint',`<div id="storageSummary">${empty('Run a measurement to populate the current measured result.')}</div>`)+band(3,'History & trend',`<div class="s24-split">${historySummary}${trendSVG(snaps)}</div>`,'Storage History is explicit retained evidence; it is not a continuous filesystem inventory.')+band(4,'Large-file aging',ageBuckets(aging),'Aging uses modification timestamps only from the latest bounded large-file result.')+band(5,'Oldest measured objects',oldest.length?table(['Age','Size','Object','Path'],oldest.slice(0,30).map(x=>[`${Number(x.age_days||0)} d`,bytes(x.size),esc(x.name),`<code>${esc(x.path)}</code>`])):empty('No measured aging objects.'))+band(6,'Current objects',`<div id="storageObjects">${empty('No current storage result yet.')}</div>`);
    activity('Ready',100,'Storage history and aging loaded');
  }

  function recoveryPlan(data){
    const analysis=data?.analysis||{},plan=analysis.plan||[],readiness=analysis.readiness||data.mode||'ready';
    const steps=plan.length?`<div class="s24-recovery-plan">${plan.slice(0,18).map(x=>`<div class="s24-recovery-step"><span>${esc(x.priority||'P3')}</span><div><h3>${esc(x.title||x.category||'Review')}</h3><p>${esc(x.detail||'')}</p></div>${x.blocking?badge('blocking','bad'):badge(x.category||'review','focus')}</div>`).join('')}</div>`:empty('No recovery planning advisory is currently returned.');
    return `<div class="s24-recovery-hero"><div class="s24-recovery-score"><div><strong>${esc(String(readiness).toUpperCase())}</strong><span>recovery readiness</span></div></div>${steps}</div>`;
  }

  async function renderSafeChangeAdvanced(){
    busy('Reading recovery state','Safe Actions + Vault + journal');
    const [status,recovery]=await Promise.all([api('/api/actions/status').catch(()=>null),structured('recovery').catch(()=>null)]);
    const journal=recovery?.journal||[],advisories=recovery?.advisories||[];
    const target='<form class="s24-form" data-form="safe-action"><label class="s24-field"><span>Action</span><select name="action"><option value="rename">Rename</option><option value="vault">Vault</option><option value="reveal">Reveal in Finder</option></select></label><label class="s24-field"><span>Exact file path</span><input name="path" required placeholder="/Users/…/file"></label><label class="s24-field"><span>New name (rename only)</span><input name="new_name" placeholder="new-name.ext"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Preview impact</button><button class="s24-action" type="button" data-advanced="refresh-recovery">Refresh recovery</button></div></form>';
    const jr=journal.length?`<div class="s24-feed">${journal.slice(0,30).map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at))}</time><div><h3>${esc(e.action||'action')} · ${esc(e.status||'recorded')}</h3><p>${esc(e.message||e.object_name||'')}</p>${e.to||e.from?`<code>${esc(e.to||e.from)}</code>`:''}</div><div class="meta">${e.reversible?badge('reversible','good'):badge('record','focus')}</div></div>`).join('')}</div>`:empty('No retained action journal entries.');
    $('#evidenceStage').innerHTML=question()+band(1,'Recovery readiness',recovery?recoveryPlan(recovery):empty('Recovery Center unavailable.'),advisories.join(' · '))+band(2,'Target & intent',target,'The server revalidates target scope and state before any reversible mutation.')+band(3,'Safety gate',`<div id="actionPreview">${empty('A fresh preview will show dependencies, consequences, exact confirmation phrase, and one-time code.')}</div>`)+(status?band(4,'Safe Action state',ledger(primitiveRows(status,12))):'')+band(5,'Recovery journal',jr,'Successful reversible operations remain visible with recovery metadata.');
    activity('Ready',100,'Recovery and Safe Actions loaded');
  }

  document.addEventListener('click',async event=>{
    const hit=event.target.closest('[data-advanced]');if(!hit)return;
    try{
      const action=hit.dataset.advanced;
      if(action==='refresh-posture'){
        busy('Refreshing posture');
        await Promise.all(['gatekeeper-status','filevault-status','sip-status','system-extensions'].map(tool_id=>api('/api/system/query/structured',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool_id})}).catch(()=>null)));
        return S.navigate('status',{push:false});
      }
      if(action==='refresh-relations')return S.navigate('relations',{push:false});
      if(action==='open-cases')return S.navigate('cases');
      if(action==='related-object')return openStoryAdvanced({path:decodeURIComponent(hit.dataset.path||'')});
      if(action==='capture-checkpoint'){busy('Capturing checkpoint','Selected current macOS evidence');await structured('system-snapshot-capture');notice('System checkpoint captured.');return S.navigate('changes',{push:false});}
      if(action==='compare-checkpoints'){
        const from=$('#checkpointFrom')?.value,to=$('#checkpointTo')?.value;if(!from||!to)throw new Error('Choose two retained checkpoints.');busy('Comparing checkpoints');const d=await structured('system-snapshot-diff',{from,to});const out=$('#systemCheckpointDiff');if(out)out.innerHTML=snapshotDiffHTML(d);activity('Ready',100,`${d.change_count||0} bounded differences`);return;
      }
      if(action==='capture-storage-history'){busy('Capturing storage history');await structured('storage-snapshot-capture');notice('Latest completed Storage Intelligence result captured.');return S.navigate('storage',{push:false});}
      if(action==='refresh-storage')return S.navigate('storage',{push:false});
      if(action==='refresh-recovery')return S.navigate('change',{push:false});
      if(action==='graph-node')return;
    }catch(e){notice(e.message);activity('Error',0,e.message);}
  });

  document.addEventListener('click',event=>{
    const node=event.target.closest('[data-advanced-node]');if(!node)return;
    const id=decodeURIComponent(node.dataset.advancedNode||''),n=state.advancedGraphNodes?.get(id);if(!n)return;
    const lane=laneFor(n.type),ref=String(n.ref||'');
    if(lane==='incident')return S.navigate('cases');
    if(lane==='process'&&/^\d+$/.test(ref))return openStoryAdvanced({pid:Number(ref)});
    if(ref.startsWith('/'))return openStoryAdvanced({path:ref});
    S.jsonContext(n.label||n.type,n,'Graph 2.0 node metadata, provenance, observation window, and review priority.','Causality or malicious intent from graph membership alone.');
  });

  registerLens('status',renderStatusAdvanced);
  registerLens('relations',()=>renderRelationsAdvanced(false));
  registerLens('changes',renderChangesAdvanced);
  registerLens('storage',renderStorageAdvanced);
  registerLens('change',renderSafeChangeAdvanced);
  S.openStory=openStoryAdvanced;
  S.renderRelations=renderRelationsAdvanced;
  S.renderChanges=renderChangesAdvanced;
  S.renderStorage=renderStorageAdvanced;
  S.renderSafeChange=renderSafeChangeAdvanced;
  S.advancedEvidence={structured,renderStatusAdvanced,renderRelationsAdvanced,renderChangesAdvanced,renderStorageAdvanced,renderSafeChangeAdvanced};
})();
