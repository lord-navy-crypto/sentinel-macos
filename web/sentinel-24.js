// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';

  // Sentinel 2.4 Native Frontend — direct localhost API client.
  // This controller does not depend on the retired dashboard DOM or web/app.js.
  const PRODUCT_MARKER = 'Sentinel 2.4 Native Frontend';
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = {
    mission: 'orient', lens: 'status', scanJob: '', scanTimer: null,
    actionPreview: null, searchTimer: null, processRows: [], currentGraph: null,
  };

  const MISSIONS = [
    {id:'orient',mark:'●',label:'Orient',hint:'What matters?',lenses:['status','snapshot']},
    {id:'investigate',mark:'⌁',label:'Investigate',hint:'Build an explanation',lenses:['cases','search','relations','audit','object']},
    {id:'compare',mark:'Δ',label:'Compare',hint:'What changed?',lenses:['changes','behavior','reference']},
    {id:'system',mark:'▦',label:'System',hint:'What exists?',lenses:['machine','processes','startup','persistence','background','network','storage']},
    {id:'act',mark:'↺',label:'Act',hint:'Reversible only',lenses:['reclaim','change']},
    {id:'limits',mark:'?',label:'Limits',hint:'What can be known?',lenses:['visibility','guide']},
  ];

  const LENSES = {
    status:{label:'Status',verb:'ORIENT',title:'What deserves attention now?',rule:'Read current state before interpreting isolated signals.'},
    snapshot:{label:'Snapshot',verb:'OBSERVE',title:'What should I inspect next?',rule:'One bounded read-only observation should produce a review queue, not a verdict.'},
    cases:{label:'Cases',verb:'CORRELATE',title:'Which observations belong together?',rule:'Use relationship strength and time to compress evidence into cases.'},
    search:{label:'Search',verb:'QUERY',title:'What exact object am I trying to understand?',rule:'Search known evidence first, then broaden scope deliberately.'},
    relations:{label:'Relations',verb:'CONNECT',title:'How are the objects connected?',rule:'Read edges together with object identity and time; an edge alone is not causality.'},
    audit:{label:'Audit',verb:'ASSESS',title:'Which evidence deserves review, and why?',rule:'Priority is an attention ranking, never malware probability.'},
    object:{label:'Object',verb:'VERIFY',title:'What can I establish about one exact path?',rule:'Identity evidence comes before interpretation.'},
    changes:{label:'Changes',verb:'WATCH',title:'What changed inside the scope I chose?',rule:'A bounded watch is better than pretending to observe the whole machine.'},
    behavior:{label:'Behavior',verb:'COMPARE',title:'What differs from the previous observation?',rule:'Difference is evidence pressure, not danger.'},
    reference:{label:'Reference',verb:'REFERENCE',title:'What differs from my approved reference?',rule:'Reference membership is context, not a permanent safety certificate.'},
    machine:{label:'Machine',verb:'CONTEXT',title:'What machine is producing this evidence?',rule:'Hardware and runtime explain capability and compatibility.'},
    processes:{label:'Processes',verb:'LIVE',title:'What is running right now?',rule:'Treat a process as an identity connected to an executable and current activity.'},
    startup:{label:'Auto-start',verb:'DECLARE',title:'What is configured to launch automatically?',rule:'Persistence is common in legitimate software; configuration needs context.'},
    persistence:{label:'Persistence',verb:'COMPARE',title:'Did launch configuration change?',rule:'This compares bounded captures; it is not continuous surveillance.'},
    background:{label:'Background',verb:'REGISTER',title:'What background registrations exist?',rule:'Modern registrations complement classic LaunchAgent and LaunchDaemon evidence.'},
    network:{label:'Network',verb:'LIVE',title:'Which processes have TCP activity now?',rule:'A public endpoint is ordinary context, not suspicion by itself.'},
    storage:{label:'Storage',verb:'MEASURE',title:'Where is storage pressure coming from?',rule:'Measure first. Exact duplicates and filename heuristics must remain separate.'},
    reclaim:{label:'Reclaim',verb:'REVIEW',title:'What space is worth reviewing?',rule:'Estimate first. Nothing is deleted automatically.'},
    change:{label:'Safe Change',verb:'RESOLVE',title:'What is the smallest reversible change supported by evidence?',rule:'Preview impact, confirm explicitly, preserve recovery.'},
    visibility:{label:'Visibility',verb:'BOUND',title:'What can Sentinel actually see?',rule:'Missing visibility lowers confidence; it must never be converted into invented evidence.'},
    guide:{label:'Model',verb:'MODEL',title:'How should I use Sentinel?',rule:'Observe → connect → compare → verify → change only when evidence supports it.'},
  };

  function esc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function bytes(n){n=Number(n||0);if(!Number.isFinite(n)||n<=0)return '0 B';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return `${n.toFixed(n>=10||i===0?1:2)} ${u[i]}`;}
  function pct(a,b){return Number(b)>0?Math.round(Number(a||0)/Number(b)*100):0;}
  function fmt(v){if(!v)return '—';const d=typeof v==='number'?new Date(v*1000):new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();}
  function sev(v){v=String(v||'').toLowerCase();return v==='high'||v==='critical'||v==='elevated'?'bad':v==='review'||v==='warn'||v==='warning'?'warn':v==='good'||v==='healthy'||v==='ready'?'good':'focus';}
  function badge(text, cls=''){return `<span class="s24-badge ${cls}">${esc(text)}</span>`;}
  function notice(message){const n=$('#systemNotice');n.textContent=message||'';n.hidden=!message;if(message)setTimeout(()=>{if(n.textContent===message)n.hidden=true;},7000);}
  function activity(label='Ready',percent=0,detail='Local engine · no cloud dependency'){ $('#activityState').textContent=label;$('#activityProgress').value=Math.max(0,Math.min(100,Number(percent||0)));$('#activityDetail').textContent=detail; }
  function busy(label,detail='Working locally…'){activity(label,8,detail);}

  async function api(url, options={}){
    const headers={...(options.headers||{}),'X-Sentinel-Token':token};
    const res=await fetch(url,{...options,headers});
    const type=res.headers.get('content-type')||'';
    const data=type.includes('application/json')?await res.json().catch(()=>({error:`HTTP ${res.status}`})):null;
    if(!res.ok)throw new Error(data?.error||`HTTP ${res.status}`);
    return data;
  }
  async function download(url,name){
    const res=await fetch(url,{headers:{'X-Sentinel-Token':token}});if(!res.ok){let m=`HTTP ${res.status}`;try{m=(await res.json()).error||m}catch{}throw new Error(m)}
    const blob=await res.blob(), href=URL.createObjectURL(blob), a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1200);
  }

  function missionForLens(lens){return MISSIONS.find(m=>m.lenses.includes(lens))?.id||'orient';}
  function renderNavigation(){
    $('#missionRibbon').innerHTML=MISSIONS.map(m=>`<button class="s24-mission ${m.id===state.mission?'active':''}" type="button" data-mission="${m.id}"><span class="mark">${m.mark}</span><b>${m.label}</b><small>${m.hint}</small></button>`).join('');
    const mission=MISSIONS.find(m=>m.id===state.mission)||MISSIONS[0];
    $('#lensRail').innerHTML=mission.lenses.map(id=>`<button class="s24-lens ${id===state.lens?'active':''}" type="button" data-lens="${id}">${esc(LENSES[id].label)}</button>`).join('');
  }
  function question(extra=''){
    const l=LENSES[state.lens];
    return `<section class="s24-question"><span class="verb">${esc(l.verb)}</span><h1>${esc(l.title)}</h1><p>${esc(l.rule)}</p>${extra?`<div class="question-actions">${extra}</div>`:''}</section>`;
  }
  function band(index,title,body,description='',tools=''){
    return `<section class="s24-band"><div class="s24-band-index">${String(index).padStart(2,'0')}</div><div class="s24-band-body"><div class="s24-band-head"><div><h2>${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div>${tools?`<div class="s24-band-tools">${tools}</div>`:''}</div>${body}</div></section>`;
  }
  function empty(text){return `<div class="s24-empty">${esc(text)}</div>`;}
  function ledger(rows){return `<div class="s24-ledger">${rows.map(([k,v,m=''])=>`<div class="s24-ledger-row"><span>${esc(k)}</span><b>${esc(v??'—')}</b><small>${esc(m)}</small></div>`).join('')}</div>`;}
  function table(headers, rows){return `<div class="s24-table-wrap"><table class="s24-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function primitiveRows(obj,limit=18){return Object.entries(obj||{}).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,limit).map(([k,v])=>[k.replaceAll('_',' '),String(v)]);}
  function jsonContext(title,data,can='Observed local evidence from the selected Sentinel source.',cannot='Intent or safety beyond what the evidence establishes.'){
    $('#contextTitle').textContent=title;$('#contextBody').innerHTML=`<section class="s24-context-section"><h3>Can establish</h3><p>${esc(can)}</p></section><section class="s24-context-section"><h3>Do not infer</h3><p>${esc(cannot)}</p></section><section class="s24-context-section"><h3>Evidence</h3><pre>${esc(JSON.stringify(data,null,2))}</pre></section>`;$('#contextTray').hidden=false;
  }
  function closeContext(){$('#contextTray').hidden=true;}

  async function openStory({pid=0,path=''}){
    try{busy('Correlating','Object Story');const q=pid?`pid=${encodeURIComponent(pid)}`:`path=${encodeURIComponent(path)}`;const d=await api('/api/object/story?'+q);const facts=d.facts||[], rel=d.relations||[], timeline=d.timeline||[];$('#contextTitle').textContent=d.title||'Object Story';$('#contextBody').innerHTML=`<section class="s24-context-section"><h3>Summary</h3><p>${esc(d.summary||'No summary returned.')}</p></section><section class="s24-context-section"><h3>Facts</h3>${ledger(facts.slice(0,16).map(f=>[f.label,f.value,f.source||'']))}</section><section class="s24-context-section"><h3>Relationships</h3>${rel.length?rel.slice(0,20).map(r=>`<p><b>${esc(r.kind||'relation')}</b> · ${esc(r.target||r.detail||'')}</p>`).join(''):empty('No relationships in this bounded story.')}</section><section class="s24-context-section"><h3>Observed time</h3>${timeline.length?timeline.slice(-15).map(e=>`<p>${esc(fmt(e.at))} · ${esc(e.title||e.kind||'event')}</p>`).join(''):empty('No session timeline entries for this object.')}</section><section class="s24-context-section"><h3>Boundary</h3><p>${esc(d.disclaimer||'Observed relationships do not by themselves establish intent.')}</p></section>`;$('#contextTray').hidden=false;activity('Ready',100,'Object Story updated');}catch(e){notice(e.message);activity('Error',0,e.message)}
  }

  async function renderStatus(){
    busy('Reading state','Overview + readiness');
    const [o,r]=await Promise.all([api('/api/overview'),api('/api/readiness').catch(()=>null)]);
    const dp=pct(o.disk_used,o.disk_total),mp=pct(o.memory_used,o.memory_total);
    const instruments=[
      ['Disk',`${dp}%`,dp,`${bytes(o.disk_used)} / ${bytes(o.disk_total)}`],
      ['Memory',o.memory_total?`${mp}%`:'—',mp,o.memory_total?`${bytes(o.memory_used)} / ${bytes(o.memory_total)}`:'Not reported'],
      ['Processes',String(o.process_count??'—'),Math.min(100,Number(o.process_count||0)/8),'Current process snapshot'],
      ['Runtime',String(o.arch||'—'),100,`${o.os||'macOS'} · ${o.hostname||'local host'}`],
    ];
    const readiness=r?primitiveRows(r,10):[['Readiness','Not loaded']];
    $('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="quickcheck">Run Snapshot</button>`) +
      band(1,'Current instruments',`<div class="s24-instruments">${instruments.map(x=>`<div class="s24-instrument"><label>${esc(x[0])}</label><strong>${esc(x[1])}</strong><progress max="100" value="${Number(x[2]||0)}"></progress><small>${esc(x[3])}</small></div>`).join('')}</div>`,'Direct measurements and runtime context; not a security verdict.')+
      band(2,'Sentinel readiness',ledger(readiness),'Whether Sentinel can support the investigation workflow reliably.')+
      band(3,'Evidence boundary',`<div class="s24-note">The server is bound to 127.0.0.1. Missing permissions or unavailable macOS tools reduce visibility; Sentinel does not fill those gaps with guesses.</div>`);
    activity('Ready',100,'Current state loaded');
  }

  async function renderSnapshot(){
    busy('Observing','Quick Check + review queue');
    const [d,q]=await Promise.all([api('/api/quick-check'),api('/api/review-queue').catch(()=>({items:[]}))]);
    const idx=Number(d.attention_index||0), rows=q.items||[];
    const score=`<div class="s24-instruments"><div class="s24-instrument"><label>Attention index</label><strong>${idx}</strong><progress max="100" value="${idx}"></progress><small>${esc(d.band||'')} · not malware probability</small></div><div class="s24-instrument"><label>Disk</label><strong>${Number(d.disk_percent||0)}%</strong><progress max="100" value="${Number(d.disk_percent||0)}"></progress><small>Current storage pressure</small></div></div>`;
    const queue=rows.length?`<div class="s24-feed">${rows.slice(0,30).map((x,i)=>`<div class="s24-feed-item"><span>${esc(x.source||'evidence')}</span><div><h3>${esc(x.title||'Review item')}</h3><p>${esc(x.detail||'')}</p>${x.path?`<code>${esc(x.path)}</code>`:''}</div><div class="meta">${badge(x.severity||'info',sev(x.severity))}${x.path?`<button class="s24-action" data-story-path="${esc(encodeURIComponent(x.path))}">Explain</button>`:''}</div></div>`).join('')}</div>`:empty('No high/review queue items in the current bounded evidence. This is not a malware-free guarantee.');
    $('#evidenceStage').innerHTML=question(`<button class="s24-action" data-do="guided-snapshot">Capture monitoring snapshot</button>`) + band(1,'Attention',score,d.meaning||'Prioritize where to inspect next.') + band(2,'Review queue',queue,'One queue across current evidence sources.');
    activity('Ready',100,'Snapshot complete');
  }

  async function renderCases(){
    busy('Correlating','Incident stories');const d=await api('/api/incidents');const rows=d.incidents||[];
    const summary=ledger([['High',d.high||0],['Review',d.review||0],['Info',d.info||0],['Total',d.count??rows.length]]);
    const feed=rows.length?`<div class="s24-feed">${rows.slice().reverse().map(x=>`<div class="s24-feed-item"><time>${esc(fmt(x.updated_at||x.at))}</time><div><h3>${esc(x.title||'Case')}</h3><p>${esc(x.note||'')}</p>${x.primary_path?`<code>${esc(x.primary_path)}</code>`:''}</div><div class="meta">${badge(x.severity||'info',sev(x.severity))}${badge(`confidence ${Number(x.confidence||0)}%`)}${x.primary_path?`<button class="s24-action" data-story-path="${esc(encodeURIComponent(x.primary_path))}">Context</button>`:''}</div></div>`).join('')}</div>`:empty('No correlated cases are currently available.');
    $('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="rebuild-cases">Rebuild cases</button>`) + band(1,'Case pressure',summary,'Counts describe review priority, not maliciousness.') + band(2,'Case stories',feed,'Evidence confidence means relationship strength between observations.');activity('Ready',100,'Cases loaded');
  }

  function searchForm(){return `<form class="s24-form" data-form="deep-search"><label class="s24-field"><span>Filename / path</span><input name="q" minlength="2" required placeholder="example: launchagent"></label><label class="s24-field"><span>Scope</span><select name="scope"><option value="home">Home</option><option value="downloads">Downloads</option><option value="workspace">Desktop + Documents + Downloads</option></select></label><label class="s24-field"><span>Result limit</span><select name="limit"><option>40</option><option selected>80</option><option>120</option></select></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Deep search</button></div></form><div id="deepSearchOutput"></div>`;}
  async function renderSearch(){
    const [c,w]=await Promise.all([api('/api/coverage').catch(()=>null),api('/api/weakness-audit').catch(()=>null)]);const boundary=c?ledger([['Available',c.available||0],['Limited',c.limited||0],['Unavailable',c.unavailable||0]]):empty('Coverage not available.');const posture=w?ledger([['Posture score',`${w.score??'—'}/100`],['Band',w.band||'—'],['Findings',(w.findings||[]).length]]):empty('Weakness audit not available.');
    $('#evidenceStage').innerHTML=question()+band(1,'Query',searchForm(),'Search bounded filesystem names only when current indexed evidence is insufficient.')+band(2,'Visibility before inference',`<div class="s24-split">${boundary}${posture}</div>`,'A missing result is meaningful only inside known coverage.');activity('Ready',100,'Search workspace ready');
  }

  function graphSVG(d){
    const types=['startup','file','process','network'], labels={startup:'STARTUP',file:'FILE',process:'PROCESS',network:'ENDPOINT'}, x={startup:40,file:300,process:560,network:820}, width=205,row=62;const selected={},pos=new Map();types.forEach(t=>selected[t]=(d.nodes||[]).filter(n=>n.type===t).sort((a,b)=>(b.risk||0)-(a.risk||0)).slice(0,8));types.forEach(t=>selected[t].forEach((n,i)=>pos.set(n.id,{x:x[t],y:55+i*row})));let s='<svg viewBox="0 0 1070 560" role="img" aria-label="Observed evidence relationships">';types.forEach(t=>s+=`<text class="s24-graph-title" x="${x[t]}" y="25">${labels[t]}</text>`);for(const e of d.edges||[]){const a=pos.get(e.from),b=pos.get(e.to);if(a&&b)s+=`<line class="edge" x1="${a.x+width}" y1="${a.y+20}" x2="${b.x}" y2="${b.y+20}"></line>`;}types.forEach(t=>selected[t].forEach(n=>{const p=pos.get(n.id),cls=(n.risk||0)>=70?'high':(n.risk||0)>=35?'review':'';s+=`<g class="node ${cls}" data-graph-type="${esc(n.type)}" data-graph-ref="${esc(encodeURIComponent(n.ref||''))}" tabindex="0"><rect x="${p.x}" y="${p.y}" width="${width}" height="42" rx="7"></rect><text x="${p.x+9}" y="${p.y+17}">${esc((n.label||n.type).slice(0,27))}</text><text class="detail" x="${p.x+9}" y="${p.y+32}">${esc((n.detail||'').slice(0,31))}</text></g>`;}));return s+'</svg>';
  }
  async function renderRelations(record=false){
    busy(record?'Capturing':'Connecting','Evidence graph + timeline');const [g,t]=await Promise.all([api('/api/intelligence/graph',{method:record?'POST':'GET'}),api('/api/intelligence/timeline?limit=60')]);state.currentGraph=g;const sum=g.summary||{};const graph=`<div class="s24-graph">${graphSVG(g)}</div>`;const timeline=(t.events||[]).length?`<div class="s24-feed">${t.events.slice().reverse().map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at))}</time><div><h3>${esc(e.title||e.kind||'Observation')}</h3><p>${esc(e.detail||'')}</p></div><div class="meta">${badge(e.severity||'info',sev(e.severity))}</div></div>`).join('')}</div>`:empty('No session timeline observations yet.');
    $('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="capture-relations">Capture evidence</button>`) + band(1,'Relationship field',graph,`${sum.nodes||((g.nodes||[]).length)} observed objects · ${sum.edges||((g.edges||[]).length)} links. Select an object for context.`)+band(2,'Time',timeline,'Sequence constrains interpretation; it does not automatically establish causality.');activity('Ready',100,'Relationship field updated');
  }

  async function renderAudit(){busy('Assessing','Security audit');const d=await api('/api/security/audit');const findings=d.findings||[];const score=Number(d.score||0);const meter=`<div class="s24-instruments"><div class="s24-instrument"><label>Review score</label><strong>${score}/100</strong><progress max="100" value="${score}"></progress><small>${esc(d.level||'')} · attention ranking only</small></div></div>`;const rows=findings.length?`<div class="s24-feed">${findings.map(f=>`<div class="s24-feed-item"><span>${esc(f.kind||'finding')}</span><div><h3>${esc(f.name||f.kind||'Finding')}</h3><p>${esc(f.detail||'')}</p>${(f.signals||[]).length?`<code>${esc((f.signals||[]).join(' · '))}</code>`:''}</div><div class="meta">${badge(`risk ${Number(f.risk||0)}`,f.risk>=70?'bad':'warn')}</div></div>`).join('')}</div>`:empty('No heuristic anomalies were returned. This is not proof that the system is malware-free.');$('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="rerun-audit">Run audit</button>`)+band(1,'Priority',meter,d.disclaimer||'')+band(2,'Evidence findings',rows,'Read the reason and evidence before deciding whether anything needs further inspection.');activity('Ready',100,'Audit complete');}

  async function inspectObject(path){if(!path)return;busy('Verifying',path);try{const d=await api('/api/integrity/inspect?path='+encodeURIComponent(path));jsonContext(path,d,'Hash, file metadata, signing and Gatekeeper context that macOS/Sentinel returned.','Good intent or malicious intent from identity evidence alone.');activity('Ready',100,'Object evidence loaded');}catch(e){notice(e.message);activity('Error',0,e.message)}}
  async function renderObject(){ $('#evidenceStage').innerHTML=question()+band(1,'Target',`<form class="s24-form two" data-form="object"><label class="s24-field"><span>Exact local path</span><input name="path" required placeholder="/Applications/Example.app"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Verify object</button></div></form>`,'Sentinel will inspect only the path you provide.')+band(2,'Interpretation boundary',`<div class="s24-note">A valid signature, accepted Gatekeeper assessment, or stable hash can establish identity context. None of them alone establish good intent.</div>`);activity('Ready',100,'Enter a target path');}

  async function renderChanges(){
    busy('Reading watch','Change Monitor');const d=await api('/api/changes/events');const s=d.status||{},events=d.events||[];const status=ledger([['Status',s.running?'Running':'Stopped'],['Mode',s.mode||'stopped'],['Events',s.event_count??events.length],['History',s.history_entries||0],['Needs rescan',s.needs_rescan?'YES':'No'],['Dropped signals',s.dropped_signals||0]]);const controls=`<form class="s24-form" data-form="change-watch"><label class="s24-field"><span>Watch scope</span><select name="preset"><option value="persistence">Persistence</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Fallback interval</span><select name="interval"><option value="1500">1.5 s</option><option value="2500" selected>2.5 s</option><option value="5000">5 s</option></select></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Start watch</button><button class="s24-action" type="button" data-do="stop-watch">Stop</button><button class="s24-action" type="button" data-do="review-watch">Reinspect</button></div></form>`;const feed=events.length?`<div class="s24-feed">${events.slice().reverse().map(e=>`<div class="s24-feed-item"><time>${esc(fmt(e.at))}</time><div><h3>${esc((e.path||'').split('/').pop()||e.kind||'Change')}</h3><p>${esc(e.why||e.kind||'')}</p><code>${esc(e.path||'')}</code></div><div class="meta">${badge(e.severity||'info',sev(e.severity))}${e.needs_rescan?badge('RESCAN','bad'):''}</div></div>`).join('')}</div>`:empty('No change events in this session.');$('#evidenceStage').innerHTML=question()+band(1,'Watch',controls)+band(2,'Continuity',status,'Dropped/root-changed conditions must create rescan-required state rather than false confidence.')+band(3,'Observed changes',feed);activity('Ready',100,'Change state loaded');
  }

  async function renderBehavior(){busy('Comparing','Behavior baseline');const [d,h]=await Promise.all([api('/api/behavior'),api('/api/behavior/health').catch(()=>null)]);const last=d.last_diff||{},changes=last.changes||[];const summary=ledger([['Baseline',d.has_baseline?'Available':'Not captured'],['Captured',d.baseline_at||'—'],['History',`${d.history_entries||0} / 40`],['Mode',d.persistence_mode||'persistent-local'],['Evidence index',last.risk_index??'—'],['Band',last.risk_band||'—']]);const feed=changes.length?`<div class="s24-feed">${changes.map(c=>`<div class="s24-feed-item"><span>${esc((c.kind||'change').replaceAll('_',' '))}</span><div><h3>${esc(c.title||'Change')}</h3><p>${esc((c.evidence||[]).join(' · '))}</p></div><div class="meta">${badge(c.severity||'info',sev(c.severity))}</div></div>`).join('')}</div>`:empty('No latest behavior difference is available.');$('#evidenceStage').innerHTML=question(`<button class="s24-action primary" data-do="capture-behavior">Capture & compare</button>`)+band(1,'Reference state',summary)+band(2,'Differences',feed,'Repeated behavior is not automatically learned as safe.')+(h?band(3,'Baseline health',ledger(primitiveRows(h,10))):'');activity('Ready',100,'Behavior state loaded');}

  async function renderReference(){busy('Reading reference','Trust profile');const [d,h]=await Promise.all([api('/api/trust/status'),api('/api/trust/health').catch(()=>null)]);const last=d.last_drift||{},changes=last.changes||[];const summary=ledger([['Profile',d.has_profile?'Available':'Not established'],['Updated',fmt(d.updated_at)],['Objects',d.objects||0],['Mode',d.persistence_mode||'persistent-local'],['Drift index',last.drift_index??'—'],['Coverage',last.profile_coverage!=null?`${last.profile_coverage}%`:'—']]);const feed=changes.length?`<div class="s24-feed">${changes.map(c=>`<div class="s24-feed-item"><span>${esc(c.kind||'drift')}</span><div><h3>${esc(c.title||'Reference difference')}</h3><p>${esc((c.evidence||[]).join(' · '))}</p>${c.object_key?`<code>${esc(c.object_key)}</code>`:''}</div><div class="meta">${badge(c.severity||'info',sev(c.severity))}${c.object_key?`<button class="s24-action" data-story-path="${esc(encodeURIComponent(c.object_key))}">Explain</button>`:''}</div></div>`).join('')}</div>`:empty('No current drift evidence is available.');$('#evidenceStage').innerHTML=question(`<button class="s24-action" data-do="capture-reference">Establish reference</button><button class="s24-action primary" data-do="compare-reference">Compare now</button>`)+band(1,'Approved reference',summary)+band(2,'Drift',feed,'Novelty or fingerprint change deserves context; it is not automatically malicious.')+(h?band(3,'Reference health',ledger(primitiveRows(h,10))):'');activity('Ready',100,'Reference state loaded');}

  async function renderMachine(){busy('Reading machine','System Profile');const d=await api('/api/system-profile');const rows=[['Model',d.model_name,d.model_identifier],['Chip',d.chip||d.processor,d.platform_family],['Architecture',d.architecture,d.engine_explanation],['Physical cores',d.physical_cores],['Logical cores',d.logical_cores],['Memory',bytes(d.memory_bytes)],['macOS',d.os_version,d.os_build],['Kernel',d.kernel_version],['Rosetta',d.rosetta_translated?'Yes':'No'],['Root storage',bytes(d.disk_total),`${bytes(d.disk_available)} available`]];$('#evidenceStage').innerHTML=question()+band(1,'Machine identity',ledger(rows),'Unique serial number and Hardware UUID are intentionally unnecessary for this view.')+band(2,'Runtime implication',`<div class="s24-note good">${esc(d.engine_explanation||'Sentinel uses the architecture-matched local engine packaged in the Universal app.')}</div>`);activity('Ready',100,'Machine profile loaded');}

  async function renderProcesses(){busy('Reading processes','Current process snapshot');const d=await api('/api/processes');state.processRows=d.processes||[];const rows=state.processRows.slice(0,260).map(p=>[`<b>${esc(p.pid)}</b>`,`${Number(p.cpu||0).toFixed(1)}%`,`${Number(p.memory||0).toFixed(1)}%`,esc(p.user||''),`<code>${esc(p.command||'')}</code>`,`<button data-story-pid="${Number(p.pid)}">Explain</button>`]);$('#evidenceStage').innerHTML=question()+band(1,'Running software',rows.length?table(['PID','CPU','Memory','User','Command',''],rows):empty('No process rows returned.'),'Current state only; historical process activity requires prior capture.');activity('Ready',100,`${state.processRows.length} processes returned`);}

  async function renderStartup(){busy('Reading startup','Launch configuration');const d=await api('/api/startup');const items=d.items||[];const rows=items.slice(0,260).map(x=>[badge(x.risk??0,Number(x.risk||0)>=70?'bad':Number(x.risk||0)>=35?'warn':''),esc(x.scope||''),esc(x.manifest?.label||x.name||''),`<code>${esc(x.executable||x.target||'')}</code>`,`<code>${esc(x.path||x.manifest_path||'')}</code>`]);$('#evidenceStage').innerHTML=question()+band(1,'Launch declarations',items.length?table(['Risk','Scope','Item','Executable','Manifest'],rows):empty('No visible startup items returned.'),'Launch persistence is common; path, identity and behavior determine whether it deserves review.');activity('Ready',100,`${items.length} startup items`);}

  async function renderGenericLens(endpoint,title,description,method='GET'){
    busy('Reading evidence',title);const d=await api(endpoint,{method});const rows=primitiveRows(d,18);const arrays=Object.entries(d||{}).filter(([,v])=>Array.isArray(v)).sort((a,b)=>b[1].length-a[1].length);let body=ledger(rows);if(arrays.length){const [name,list]=arrays[0];if(list.length&&typeof list[0]==='object'){const keys=[...new Set(list.slice(0,8).flatMap(x=>Object.keys(x).filter(k=>['string','number','boolean'].includes(typeof x[k]))))].slice(0,6);body+=`<div style="height:16px"></div>`+table(keys.map(k=>k.replaceAll('_',' ')),list.slice(0,200).map(x=>keys.map(k=>`<span class="${k.includes('path')?'mono':''}">${esc(x[k]??'')}</span>`)));}else if(list.length)body+=`<div class="s24-note">${esc(name)}: ${esc(list.slice(0,20).join(' · '))}</div>`;}$('#evidenceStage').innerHTML=question()+band(1,title,body,description);activity('Ready',100,title+' loaded');
  }

  async function renderStorage(){
    $('#evidenceStage').innerHTML=question()+band(1,'Acquisition',`<form class="s24-form" data-form="storage"><label class="s24-field"><span>Scope</span><select name="scope"><option value="home">Home</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Minimum file MB</span><input name="min" type="number" min="1" max="10240" value="100"></label><label class="s24-field"><span>Large-file limit</span><input name="limit" type="number" min="10" max="2000" value="200"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Measure storage</button><button class="s24-action" type="button" data-do="cancel-storage">Cancel</button></div></form><div id="storagePipeline" class="s24-pipeline"><div class="s24-step"><span>01</span><b>Traverse</b></div><div class="s24-step"><span>02</span><b>Measure</b></div><div class="s24-step"><span>03</span><b>Hash candidates</b></div><div class="s24-step"><span>04</span><b>Report</b></div></div>`,'Scanning is bounded and cancellable. Progress appears only after a real localhost request starts.')+band(2,'Measured footprint',`<div id="storageSummary">${empty('Run a measurement to populate observed numbers.')}</div>`)+band(3,'Objects',`<div id="storageObjects">${empty('No storage result yet.')}</div>`);activity('Ready',0,'Storage measurement idle');
  }
  async function startStorage(form){
    if(state.scanTimer)clearTimeout(state.scanTimer);const fd=new FormData(form);busy('Starting scan','Bounded localhost request');const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:fd.get('scope'),min_mb:Number(fd.get('min')),limit:Number(fd.get('limit'))})});state.scanJob=job.id;pollStorage();
  }
  async function pollStorage(){
    if(!state.scanJob)return;try{const j=await api('/api/storage/jobs?id='+encodeURIComponent(state.scanJob));const phase=String(j.phase||'scan'),phasePct=Number(j.phase_percent||0);let detail=`${Number(j.files_visited||0).toLocaleString()} files · ${Number(j.dirs_visited||0).toLocaleString()} folders`;if(j.hash_files_total)detail+=` · hashes ${Number(j.hash_files_done||0)}/${Number(j.hash_files_total||0)}`;if(j.hash_bytes_total)detail+=` · ${bytes(j.hash_bytes_done||0)} / ${bytes(j.hash_bytes_total||0)}`;if(j.current_hash_path)detail+=` · ${j.current_hash_path}`;activity(phase.replaceAll('_',' '),phasePct,detail);const steps=$$('#storagePipeline .s24-step');const idx=phase.includes('hash')?2:phase.includes('report')?3:phase.includes('measure')?1:0;steps.forEach((x,i)=>{x.classList.toggle('active',i===idx);x.classList.toggle('done',i<idx);});if(j.status==='running'){state.scanTimer=setTimeout(pollStorage,500);return;}if(j.status==='failed')throw new Error(j.error||'Storage scan failed');if(j.result)renderStorageResult(j.result,j.status);activity(j.status==='cancelled'?'Cancelled':'Complete',100,j.status==='cancelled'?'Partial measured result preserved when available.':'Building storage report complete.');}catch(e){notice(e.message);activity('Error',0,e.message)}
  }
  function renderStorageResult(d,status){
    const summary=$('#storageSummary'),objects=$('#storageObjects');if(!summary||!objects)return;summary.innerHTML=ledger([['Status',status||'complete'],['Files visited',Number(d.files_visited||0).toLocaleString()],['Folders visited',Number(d.dirs_visited||0).toLocaleString()],['Visible bytes',bytes(d.visible_bytes)],['Permission limits',d.permission_errors||0],['Duplicate hash bytes',bytes(d.duplicate_hash_bytes||0)]]);const files=d.large_files||[],dups=d.duplicates||[],families=d.families||[];let body=files.length?table(['Size','Modified','File','Path',''],files.slice(0,300).map(f=>[`<b>${bytes(f.size)}</b>`,esc(fmt(f.modified_unix)),esc(f.name),`<code>${esc(f.path)}</code>`,`<button data-story-path="${esc(encodeURIComponent(f.path))}">Explain</button>`])):empty('No large files matched the scan threshold.');if(dups.length)body+=`<div class="s24-note good">${dups.length} exact duplicate group(s) use hash agreement. Filename families remain separate heuristics.</div>`;if(families.length)body+=`<div class="s24-note warn">${families.length} possible version family/families are naming heuristics only.</div>`;objects.innerHTML=body;
  }

  async function renderReclaim(){busy('Estimating','Cleanup Preview');const d=await api('/api/cleanup/preview');const items=d.items||d.candidates||[];let body=ledger(primitiveRows(d,12));if(items.length){const keys=['name','path','size','reason'].filter(k=>items.some(x=>x[k]!=null));body+=table(keys.map(k=>k),items.slice(0,200).map(x=>keys.map(k=>k==='size'?bytes(x[k]):`<span class="${k==='path'?'mono':''}">${esc(x[k]??'')}</span>`)));}$('#evidenceStage').innerHTML=question()+band(1,'Reviewable estimate',body,'Large, old, cached, or duplicated-looking does not mean disposable.')+band(2,'Safety boundary',`<div class="s24-note good">Cleanup Preview does not automatically delete files. Eligible files must move through the separate Safe Change preview and recovery workflow.</div>`);activity('Ready',100,'Cleanup estimate loaded');}

  async function renderSafeChange(){
    const status=await api('/api/actions/status').catch(()=>null);$('#evidenceStage').innerHTML=question()+band(1,'Target & intent',`<form class="s24-form" data-form="safe-action"><label class="s24-field"><span>Action</span><select name="action"><option value="rename">Rename</option><option value="vault">Vault</option><option value="reveal">Reveal in Finder</option></select></label><label class="s24-field"><span>Exact file path</span><input name="path" required placeholder="/Users/…/file"></label><label class="s24-field"><span>New name (rename only)</span><input name="new_name" placeholder="new-name.ext"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Preview impact</button></div></form>`,'The server revalidates target scope and state before any reversible mutation.')+band(2,'Safety gate',`<div id="actionPreview">${empty('A fresh preview will show dependencies, consequences, exact confirmation phrase, and one-time code.')}</div>`)+(status?band(3,'Recovery state',ledger(primitiveRows(status,12))):'');activity('Ready',100,'Safe Actions ready');
  }
  async function previewSafeAction(form){
    const fd=new FormData(form),action=fd.get('action'),path=String(fd.get('path')||'').trim();if(action==='reveal'){await api('/api/actions/reveal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})});notice('Reveal request sent to Finder.');return;}const req={action,path};if(action==='rename')req.new_name=String(fd.get('new_name')||'').trim();busy('Previewing impact',path);const p=await api('/api/actions/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});state.actionPreview=p;const deps=p.dependencies||[],cons=p.consequences||[],signals=p.signals||[];$('#actionPreview').innerHTML=`${ledger([['Action',p.display_action||p.action],['Object',p.object_name],['Source',p.source],['Destination',p.destination||'—'],['Size',bytes(p.size)],['Risk',p.risk??0],['Reversible',p.reversible?'Yes':'No']])}${deps.length?`<div class="s24-note warn"><b>Dependencies</b><br>${deps.map(x=>esc(`${x.title}: ${x.detail}`)).join('<br>')}</div>`:''}${signals.length?`<div class="s24-note"><b>Review signals</b><br>${signals.map(esc).join('<br>')}</div>`:''}${cons.length?`<div class="s24-note warn"><b>Consequences</b><br>${cons.map(esc).join('<br>')}</div>`:''}<form class="s24-form" data-form="execute-action"><label class="s24-field"><span>Exact phrase</span><input name="phrase" required placeholder="${esc(p.confirm_phrase||'')}"></label><label class="s24-field"><span>One-time code</span><input name="code" required placeholder="${esc(p.confirm_code||'')}"></label><label class="s24-field"><span>Acknowledge</span><select name="ack"><option value="no">No</option><option value="yes">I reviewed the consequences</option></select></label><div class="s24-form-actions"><button class="s24-action danger" type="submit">Execute reversible change</button></div></form>`;activity('Preview ready',100,'No change executed yet');
  }
  async function executeSafeAction(form){if(!state.actionPreview)throw new Error('Create a fresh preview first.');const fd=new FormData(form);if(fd.get('ack')!=='yes')throw new Error('Review and acknowledge the consequences first.');busy('Revalidating & executing','Safe Action');const d=await api('/api/actions/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action_id:state.actionPreview.action_id,phrase:fd.get('phrase'),code:fd.get('code'),acknowledge:true})});state.actionPreview=null;jsonContext(`${d.action||'Action'} · ${d.status||'complete'}`,d,'The exact reversible operation and post-action observation returned by Sentinel.','A broader security verdict about the target.');notice(d.message||'Safe Action completed and recorded.');activity('Complete',100,'Recovery journal updated');}

  async function renderVisibility(){busy('Checking visibility','Coverage + capabilities');const [c,p,s]=await Promise.all([api('/api/coverage'),api('/api/capabilities'),api('/api/advanced-sensor/status').catch(()=>null)]);const items=c.items||[],caps=p.items||[];const coverage=items.length?`<div class="s24-feed">${items.map(x=>`<div class="s24-feed-item"><span>${esc(x.area||'area')}</span><div><h3>${esc(x.status||'unknown')}</h3><p>${esc(x.detail||'')}</p></div><div class="meta">${badge(x.status||'unknown',sev(x.status))}</div></div>`).join('')}</div>`:empty('No coverage metadata.');const capability=caps.length?table(['Source','Available','Purpose'],caps.map(x=>[esc(x.name),badge(x.available?'yes':'no',x.available?'good':'warn'),esc(x.purpose||'')])):empty('No capability metadata.');$('#evidenceStage').innerHTML=question()+band(1,'Coverage',coverage,`Available ${c.available||0} · limited ${c.limited||0} · unavailable ${c.unavailable||0}`)+band(2,'Evidence sources',capability,'Built-in macOS/Unix tools currently available to Sentinel.')+(s?band(3,'Advanced sensor',ledger(primitiveRows(s,12))):'');activity('Ready',100,'Visibility map loaded');}

  async function renderGuide(){
    $('#evidenceStage').innerHTML=question()+band(1,'Investigation model',`<div class="s24-pipeline"><div class="s24-step done"><span>01</span><b>Observe</b></div><div class="s24-step done"><span>02</span><b>Connect</b></div><div class="s24-step active"><span>03</span><b>Compare</b></div><div class="s24-step"><span>04</span><b>Verify / Change</b></div></div>`,'Start with the smallest evidence path capable of answering the question.')+band(2,'What scores mean',ledger([['Attention','Where to look next','Not malware probability'],['Risk','Why an object was prioritized','Not proof of intent'],['Confidence','How strongly observations relate','Not maliciousness'],['Drift','Difference from an approved reference','Not automatic danger']]))+band(3,'Safety model',`<div class="s24-note good">Sentinel is local-first, bounded, and evidence-oriented. File-changing actions are separate from observation and require a fresh server preview, explicit confirmation, revalidation, and recovery metadata.</div>`);activity('Ready',100,'Model loaded');
  }

  const RENDERERS={
    status:renderStatus,snapshot:renderSnapshot,cases:renderCases,search:renderSearch,relations:()=>renderRelations(false),audit:renderAudit,object:renderObject,
    changes:renderChanges,behavior:renderBehavior,reference:renderReference,machine:renderMachine,processes:renderProcesses,startup:renderStartup,
    persistence:()=>renderGenericLens('/api/persistence','Persistence comparison','Visible LaunchAgent/LaunchDaemon configuration state and bounded comparison.'),
    background:()=>renderGenericLens('/api/background','Background registrations','Background Task Management registrations macOS exposes to this process.'),
    network:()=>renderGenericLens('/api/network','Current TCP evidence','Current network snapshot only; encrypted content and unobserved history are outside this evidence.'),
    storage:renderStorage,reclaim:renderReclaim,change:renderSafeChange,visibility:renderVisibility,guide:renderGuide,
  };

  async function navigate(lens,{push=true}={}){
    if(!LENSES[lens])lens='status';state.lens=lens;state.mission=missionForLens(lens);renderNavigation();closeContext();if(push)history.replaceState(null,'','#'+new URLSearchParams({token,lens}).toString());try{await RENDERERS[lens]();$('#evidenceStage').focus({preventScroll:true});}catch(e){notice(e.message);activity('Error',0,e.message);$('#evidenceStage').innerHTML=question()+band(1,'Request failed',`<div class="s24-note warn">${esc(e.message)}</div>`,'The interface did not invent replacement evidence.');}
  }

  async function runDeepSearch(form){const fd=new FormData(form),q=String(fd.get('q')||'').trim();busy('Searching',q);const d=await api(`/api/search/deep?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(fd.get('scope'))}&limit=${encodeURIComponent(fd.get('limit'))}`);const rows=d.results||[];$('#deepSearchOutput').innerHTML=rows.length?table(['Kind','Score','Name','Path',''],rows.map(r=>[esc(r.kind),esc(r.score??''),esc(r.name),`<code>${esc(r.path)}</code>`,r.kind==='file'?`<button data-story-path="${esc(encodeURIComponent(r.path))}">Explain</button>`:''])):empty('No filename/path matches were found inside the bounded search budget.');activity('Ready',100,`Visited ${Number(d.visited||0).toLocaleString()} entries · ${rows.length} results`);}

  async function handleAction(name){
    if(name==='quickcheck')return navigate('snapshot');
    if(name==='guided-snapshot'){if(!confirm('Monitoring Snapshot updates local Behavior/Persistence state and may compare an existing Trusted Profile. It does not modify user files. Continue?'))return;busy('Capturing snapshot');await api('/api/guided-snapshot',{method:'POST'});notice('Monitoring snapshot captured.');return navigate('snapshot');}
    if(name==='rebuild-cases'){busy('Correlating');await api('/api/incidents',{method:'POST'});return renderCases();}
    if(name==='capture-relations')return renderRelations(true);
    if(name==='rerun-audit')return renderAudit();
    if(name==='stop-watch'){await api('/api/changes/stop',{method:'POST'});return renderChanges();}
    if(name==='review-watch'){busy('Reinspecting');await api('/api/changes/review',{method:'POST'});return renderChanges();}
    if(name==='capture-behavior'){busy('Capturing behavior');await api('/api/behavior',{method:'POST'});return renderBehavior();}
    if(name==='capture-reference'){if(!confirm('Establish or refresh the Trusted Profile from the current reviewed Mac state? The profile is a reference, not a safety certificate.'))return;busy('Fingerprinting reference');await api('/api/trust/capture',{method:'POST'});return renderReference();}
    if(name==='compare-reference'){busy('Comparing reference');await api('/api/trust/compare',{method:'POST'});return renderReference();}
    if(name==='cancel-storage'){if(state.scanJob)await api('/api/storage/cancel?id='+encodeURIComponent(state.scanJob),{method:'POST'});return;}
  }

  document.addEventListener('click',async e=>{
    const mission=e.target.closest('[data-mission]');if(mission){const m=MISSIONS.find(x=>x.id===mission.dataset.mission);if(m)return navigate(m.lenses[0]);}
    const lens=e.target.closest('[data-lens]');if(lens)return navigate(lens.dataset.lens);
    const storyPid=e.target.closest('[data-story-pid]');if(storyPid)return openStory({pid:Number(storyPid.dataset.storyPid)});
    const storyPath=e.target.closest('[data-story-path]');if(storyPath)return openStory({path:decodeURIComponent(storyPath.dataset.storyPath)});
    const graph=e.target.closest('[data-graph-ref]');if(graph){const ref=decodeURIComponent(graph.dataset.graphRef||'');return graph.dataset.graphType==='process'?openStory({pid:Number(ref)}):openStory({path:ref});}
    const action=e.target.closest('[data-do]');if(action){try{await handleAction(action.dataset.do)}catch(err){notice(err.message);activity('Error',0,err.message)}return;}
    const hit=e.target.closest('[data-search-index]');if(hit){const rows=$('#searchResults')._rows||[],r=rows[Number(hit.dataset.searchIndex)];$('#searchResults').hidden=true;if(r?.pid)return openStory({pid:Number(r.pid)});if(r?.path)return openStory({path:r.path});if(r?.kind==='incident')return navigate('cases');return;}
    if(!e.target.closest('.s24-search'))$('#searchResults').hidden=true;
  });

  document.addEventListener('submit',async e=>{
    const f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();try{
      if(f.dataset.form==='deep-search')await runDeepSearch(f);
      else if(f.dataset.form==='object')await inspectObject(new FormData(f).get('path'));
      else if(f.dataset.form==='storage')await startStorage(f);
      else if(f.dataset.form==='change-watch'){const fd=new FormData(f);await api('/api/changes/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:fd.get('preset'),roots:[],interval_ms:Number(fd.get('interval')||2500)})});await renderChanges();}
      else if(f.dataset.form==='safe-action')await previewSafeAction(f);
      else if(f.dataset.form==='execute-action')await executeSafeAction(f);
    }catch(err){notice(err.message);activity('Error',0,err.message)}
  });

  $('#contextClose').addEventListener('click',closeContext);
  $('#refreshButton').addEventListener('click',()=>navigate(state.lens,{push:false}));
  $('#exportButton').addEventListener('click',async()=>{try{busy('Exporting report');await download('/api/report/export','sentinel-report.json');activity('Ready',100,'Local report exported')}catch(e){notice(e.message);activity('Error',0,e.message)}});
  $('#globalSearch').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(async()=>{const q=$('#globalSearch').value.trim(),panel=$('#searchResults');if(q.length<2){panel.hidden=true;return;}try{const d=await api('/api/search?q='+encodeURIComponent(q)),rows=d.results||[];panel._rows=rows;panel.innerHTML=`<div class="s24-search-intro">Current bounded evidence · ${rows.length} result(s)</div>${rows.length?rows.slice(0,30).map((r,i)=>`<button class="s24-search-hit" type="button" data-search-index="${i}"><span>${esc(r.kind||'evidence')}</span><div><b>${esc(r.title||'Untitled')}</b><small>${esc(r.subtitle||r.why_matched||'')}</small></div></button>`).join(''):empty(`No current evidence matched “${q}”.`)}`;panel.hidden=false;}catch(e){notice(e.message)}},170);});
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus();$('#globalSearch').select();}if(e.key==='Escape'){closeContext();$('#searchResults').hidden=true;}});

  // Make runtime identity obvious in DOM and developer tools.
  window.__SENTINEL_24__={marker:PRODUCT_MARKER,version:'2.4.0'};
  const initial=new URLSearchParams(location.hash.slice(1)).get('lens');
  renderNavigation();navigate(LENSES[initial]?initial:'status',{push:false});
})();
