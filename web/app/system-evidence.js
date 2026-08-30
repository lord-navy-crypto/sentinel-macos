// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  if(!S)throw new Error('Sentinel application core did not load before deep System evidence.');
  const {$,api,busy,activity,notice,esc,fmt,sev,badge,question,band,empty,ledger,table,registerLens}=S;

  function endpoint(item){
    const state=String(item.state||'OTHER').toUpperCase();
    return state==='LISTEN'?(item.local||item.address||'unknown'):(item.remote||item.address||item.local||'unknown');
  }
  function processGroups(items){
    const map=new Map();
    for(const item of items||[]){const pid=Number(item.pid||0),key=pid>0?String(pid):`unknown:${item.command||''}`;if(!map.has(key))map.set(key,{pid,command:item.command||'unknown process',user:item.user||'',rows:[],established:0,listening:0});const g=map.get(key);g.rows.push(item);if(String(item.state||'').toUpperCase()==='ESTABLISHED')g.established++;if(String(item.state||'').toUpperCase()==='LISTEN')g.listening++;}
    return [...map.values()].sort((a,b)=>b.rows.length-a.rows.length||a.command.localeCompare(b.command));
  }
  function endpointGroups(items){
    const map=new Map();
    for(const item of items||[]){const state=String(item.state||'OTHER').toUpperCase(),ep=endpoint(item),klass=item.endpoint_class||'unclassified',key=`${state}|${klass}|${ep}`;if(!map.has(key))map.set(key,{state,klass,endpoint:ep,rows:0,processes:new Set()});const g=map.get(key);g.rows++;g.processes.add(item.command||String(item.pid||'unknown'));}
    return [...map.values()].sort((a,b)=>b.rows-a.rows||a.endpoint.localeCompare(b.endpoint));
  }

  function networkDiff(diff){
    if(!diff)return empty('Capture at least two explicit network-history snapshots to compare relationships.');
    const added=diff.added||[],ended=diff.ended||[];
    const rows=[];for(const x of added.slice(0,40))rows.push(`<p class="added">+ ${esc(x.process||'process')} → ${esc(x.endpoint||'endpoint')} · ${esc(x.state||'')}</p>`);for(const x of ended.slice(0,40))rows.push(`<p class="removed">− ${esc(x.process||'process')} → ${esc(x.endpoint||'endpoint')} · ${esc(x.state||'')}</p>`);
    return `<div class="s24-diff-grid"><div class="s24-diff-block ${added.length?'review':''}"><h3>Added relationships</h3><div class="delta"><span>Observed in target</span><b>+${added.length}</b></div></div><div class="s24-diff-block ${ended.length?'review':''}"><h3>Absent in target</h3><div class="delta"><span>No longer observed</span><b>−${ended.length}</b></div></div></div><div class="s24-diff-detail">${rows.join('')||'<p>No normalized relationship difference.</p>'}</div><div class="s24-note">${esc(diff.note||'Historical PIDs are context only because macOS can reuse process identifiers.')}</div>`;
  }

  function historyCheckpoints(rows){
    if(!rows.length)return empty('No explicit Network History snapshots. Refreshing current TCP evidence does not create history.');
    return `<div class="s24-checkpoint-list">${rows.slice(0,14).map(x=>`<div class="s24-checkpoint"><time>${esc(fmt(x.captured_at))}</time><div><b>${Number(x.rows_stored||0)} normalized relationships</b><small>${Number(x.rows_seen||0)} visible TCP row(s)${x.truncated?' · bounded/truncated':''}</small></div>${badge(x.truncated?'bounded':'captured',x.truncated?'warn':'good')}</div>`).join('')}</div>`;
  }

  async function renderNetworkDeep(){
    busy('Reading TCP evidence','Current ownership + endpoint classes + explicit history');
    const [current,history]=await Promise.all([api('/api/network'),api('/api/network/history').catch(()=>({snapshots:[]}))]);
    const items=current.items||[],processes=processGroups(items),endpoints=endpointGroups(items),snaps=history.snapshots||[];
    const established=items.filter(x=>String(x.state||'').toUpperCase()==='ESTABLISHED').length,listening=items.filter(x=>String(x.state||'').toUpperCase()==='LISTEN').length;
    const summary=ledger([['Visible TCP rows',items.length],['Owning processes',processes.filter(x=>x.pid>0).length],['Established',established],['Listening',listening],['Endpoint classes',new Set(items.map(x=>x.endpoint_class||'unclassified')).size],['Retained snapshots',snaps.length],['History mode',history.persistent?'Persistent local':'Memory only']]);
    const procRows=processes.slice(0,160).map(g=>[`<b>${g.pid||'—'}</b>`,esc(g.command),esc(g.user),String(g.rows.length),String(g.established),String(g.listening),g.pid>0?`<button type="button" data-system-pid="${g.pid}">Explain</button>`:'']);
    const epRows=endpoints.slice(0,160).map(g=>[badge(g.state,g.state==='ESTABLISHED'?'good':'focus'),esc(g.klass),`<code>${esc(g.endpoint)}</code>`,String(g.rows),esc([...g.processes].slice(0,5).join(' · '))]);
    const selectors=snaps.length>=2?`<div class="s24-form two"><label class="s24-field"><span>From network snapshot</span><select id="networkHistoryFrom">${snaps.map((x,i)=>`<option value="${esc(x.id)}" ${i===1?'selected':''}>${esc(fmt(x.captured_at))} · ${Number(x.rows_stored||0)} relations</option>`).join('')}</select></label><label class="s24-field"><span>To network snapshot</span><select id="networkHistoryTo">${snaps.map((x,i)=>`<option value="${esc(x.id)}" ${i===0?'selected':''}>${esc(fmt(x.captured_at))} · ${Number(x.rows_stored||0)} relations</option>`).join('')}</select></label><div class="s24-form-actions"><button type="button" class="s24-action" data-system-action="compare-network">Compare</button></div></div>`:'';
    $('#evidenceStage').innerHTML=question('<button class="s24-action primary" type="button" data-system-action="capture-network">Capture history snapshot</button><button class="s24-action" type="button" data-system-action="refresh-network">Refresh current</button>')+band(1,'Current TCP instrument',summary,'Current TCP rows describe visible process/endpoint relationships only; packet contents are not captured.')+band(2,'Process → network',procRows.length?table(['PID','Process','User','Rows','Established','Listen',''],procRows):empty('No visible TCP-owning processes.'))+band(3,'Endpoint view',epRows.length?table(['State','Class','Endpoint','Rows','Visible processes'],epRows):empty('No visible endpoints.'))+band(4,'Explicit Network History',`<div class="s24-checkpoints"><div>${historyCheckpoints(snaps)}</div><div>${selectors}<div id="networkHistoryDiff">${networkDiff(history.latest_diff)}</div></div></div>`,'History exists only when explicitly captured; a missing snapshot is not reconstructed from current state.');
    activity('Ready',100,`${items.length} current TCP rows · ${snaps.length} retained network snapshots`);
  }

  function launchRows(items){
    return (items||[]).slice(0,220).map(x=>[
      x.executable&&!x.target_exists?badge('target missing','bad'):x.running?badge('running','good'):badge('configured','focus'),
      esc(x.scope||''),esc(x.label||''),x.run_at_load?'Yes':'No',x.keep_alive?'Yes':'No',
      x.running_pids?.length?esc(x.running_pids.join(', ')):'—',
      `<code>${esc(x.executable||'unresolved')}</code>`,
      `<button type="button" data-launch-detail="${esc(encodeURIComponent(x.plist_path||''))}">Explain</button>`
    ]);
  }

  async function renderStartupDeep(){
    busy('Connecting launch evidence','plist → executable → runtime');
    const [legacy,d]=await Promise.all([api('/api/startup').catch(()=>({items:[]})),api('/api/launch-services')]);
    const items=d.items||[];
    const summary=ledger([['Visible launch jobs',d.total??items.length],['User agents',d.user_agents||0],['System agents',d.system_agents||0],['System daemons',d.system_daemons||0],['Running matches',d.running||0],['Missing targets',d.missing_target||0],['Legacy startup observations',(legacy.items||[]).length]]);
    const limitations=(d.limitations||[]).length?`<div class="s24-feed">${d.limitations.map(x=>`<div class="s24-feed-item"><time>LIMIT</time><div><p>${esc(x)}</p></div></div>`).join('')}</div>`:empty('No additional Launch Services limitation was returned.');
    $('#evidenceStage').innerHTML=question('<button class="s24-action" type="button" data-system-action="refresh-startup">Refresh launch evidence</button>')+band(1,'Launch relationship summary',summary,'Launch declarations are ordinary macOS configuration; review identity, target existence and runtime relation together.')+band(2,'plist → target → running process',items.length?table(['State','Scope','Label','RunAtLoad','KeepAlive','PID','Executable',''],launchRows(items)):empty('No launch relationships returned.'))+band(3,'Visibility boundaries',limitations,d.note||'Launch Service evidence is bounded to declarations and current process matches visible to Sentinel.');
    activity('Ready',100,`${items.length} launch relationships`);
  }

  async function launchDetail(path){
    if(!path)return notice('This launch row has no plist path.');
    busy('Inspecting launch relationship',path);
    const d=await api('/api/launch-services/detail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plist_path:path})});
    const item=d.item||{},plist=d.plist||{},target=d.target||{};
    $('#contextTitle').textContent=item.label||'Launch relationship';
    $('#contextBody').innerHTML=`<section class="s24-context-section"><h3>Launch declaration</h3>${ledger([['Scope',item.scope||'—'],['Plist',item.plist_path||'—'],['Executable',item.executable||'—'],['RunAtLoad',item.run_at_load?'Yes':'No'],['KeepAlive',item.keep_alive?'Yes':'No'],['Running',item.running?`PID ${(item.running_pids||[]).join(', ')}`:'No exact current match'],['Target',item.executable?(item.target_exists?'Present':'Missing'):'Unresolved']])}</section><section class="s24-context-section"><h3>Why it starts</h3>${(item.explanation||[]).map(x=>`<p>${esc(x)}</p>`).join('')||empty('No explanation lines returned.')}</section><section class="s24-context-section"><h3>Configuration evidence</h3><pre>${esc(JSON.stringify(plist,null,2))}</pre></section><section class="s24-context-section"><h3>Target evidence</h3><pre>${esc(JSON.stringify(target,null,2))}</pre></section>`;
    $('#contextTray').hidden=false;activity('Ready',100,'Launch relationship explained');
  }

  document.addEventListener('click',async event=>{
    const action=event.target.closest('[data-system-action]');
    try{
      if(action){
        const id=action.dataset.systemAction;
        if(id==='refresh-network')return S.navigate('network',{push:false});
        if(id==='refresh-startup')return S.navigate('startup',{push:false});
        if(id==='capture-network'){busy('Capturing network history','Normalized relationship metadata only');const d=await api('/api/network/history',{method:'POST'});notice(`Captured ${Number(d?.snapshot?.rows_stored||0)} normalized network relationship(s).`);return S.navigate('network',{push:false});}
        if(id==='compare-network'){const from=$('#networkHistoryFrom')?.value,to=$('#networkHistoryTo')?.value;if(!from||!to||from===to)throw new Error('Choose two different network snapshots.');busy('Comparing network snapshots');const q=new URLSearchParams({from,to});const d=await api('/api/network/history?'+q.toString());const out=$('#networkHistoryDiff');if(out)out.innerHTML=networkDiff(d.comparison);activity('Ready',100,'Selected network snapshots compared');return;}
      }
      const launch=event.target.closest('[data-launch-detail]');if(launch)return launchDetail(decodeURIComponent(launch.dataset.launchDetail||''));
      const process=event.target.closest('[data-system-pid]');if(process&&typeof S.openStory==='function')return S.openStory({pid:Number(process.dataset.systemPid||0)});
    }catch(e){notice(e.message);activity('Error',0,e.message);}
  });

  registerLens('network',renderNetworkDeep);
  registerLens('startup',renderStartupDeep);
  S.renderNetwork=renderNetworkDeep;
  S.renderStartup=renderStartupDeep;
})();
