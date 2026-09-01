from pathlib import Path

# Backend wiring
p=Path('main.go'); s=p.read_text()
old='\tlogs           *runtimeLogBuffer\n}'
new='\tlogs           *runtimeLogBuffer\n\tobservatory    *resourceObservatory\n}'
if old not in s: raise SystemExit('app struct anchor missing')
s=s.replace(old,new,1)
old='\t\tnetworkHistory: newNetworkHistoryManager(*ephemeral), logs: logs,\n'
new='\t\tnetworkHistory: newNetworkHistoryManager(*ephemeral), logs: logs, observatory: newResourceObservatory(),\n'
if old not in s: raise SystemExit('app init anchor missing')
s=s.replace(old,new,1)
old='\tmux.HandleFunc("/api/system-profile", a.auth(a.handleSystemProfile))\n'
new=old+'\tmux.HandleFunc("/api/health/live", a.auth(a.work.wrap("resource-observatory", a.handleMacObservatory)))\n\tmux.HandleFunc("/api/health/history", a.auth(a.handleMacObservatoryHistory))\n'
if old not in s: raise SystemExit('system profile route anchor missing')
s=s.replace(old,new,1)
old='\tmux.HandleFunc("/api/storage/cancel", a.auth(a.handleStorageCancel))\n'
new=old+'\tmux.HandleFunc("/api/storage/graph", a.auth(a.work.wrap("storage-graph", a.handleStorageGraph)))\n'
if old not in s: raise SystemExit('storage route anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Canonical navigation
p=Path('web/app/core.js'); s=p.read_text()
old="{id:'system',mark:'▦',label:'System',hint:'Everyday Mac + evidence / 日常状态与证据',lenses:['machine','tools','processes','startup','persistence','background','network','storage']},"
new="{id:'system',mark:'▦',label:'System',hint:'Everyday Mac + evidence / 日常状态与证据',lenses:['machine','health','tools','processes','startup','persistence','background','network','storage']},"
if old not in s: raise SystemExit('system mission anchor missing')
s=s.replace(old,new,1)
old="    machine:{label:'Machine',verb:'CONTEXT',title:'What machine is producing this evidence?',rule:'Hardware and runtime explain capability and compatibility.'},\n"
new=old+"    health:{label:'Everyday Mac / 日常 Mac',verb:'OBSERVE',title:'How are resources, memory pressure, power and network activity changing?',rule:'Use bounded current samples and trends to explain load. Resource pressure is evidence, not a hardware-health certificate. / 使用有界样本和趋势解释负载，不输出硬件健康证书。'},\n"
if old not in s: raise SystemExit('machine lens anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Canonical lens registry contract
p=Path('product_frontend_contract_helpers_test.go'); s=p.read_text()
old='\t\t"machine", "tools", "processes", "startup", "persistence", "background", "network", "storage",\n'
new='\t\t"machine", "health", "tools", "processes", "startup", "persistence", "background", "network", "storage",\n'
if old not in s: raise SystemExit('canonical lens registry anchor missing')
s=s.replace(old,new,1); p.write_text(s)

# System UI: add Observatory and lazy Storage Graph without replacing Terminal Tools.
p=Path('web/app/lenses/system.js'); s=p.read_text()
anchor='  const TOOL_ZH={'
if anchor not in s: raise SystemExit('Terminal Tools anchor missing')
insert=r'''
  function resourceBars(samples,key,maxValue=100){
    const rows=(samples||[]).slice(-30), values=rows.map(x=>Math.max(0,Number(x?.[key]||0))), peak=Math.max(maxValue,...values,1);
    return `<div class="s24-pipeline" aria-label="Recent bounded resource history">${values.map((v,i)=>`<div class="s24-step ${i===values.length-1?'active':''}" title="${v.toFixed(1)}"><span>${Math.round(v/peak*100)}%</span><b>${v.toFixed(1)}</b></div>`).join('')}</div>`;
  }
  function batteryText(b){if(!b?.available)return 'Not reported / 未报告';const state=b.charging?'Charging / 充电中':b.ac_power?'AC power / 外接电源':'Battery / 电池';return `${Number(b.charge_percent||0)}% · ${state}`;}
  async function renderHealth(){
    busy('Sampling Everyday Mac','CPU · memory · power · network / CPU · 内存 · 电源 · 网络');
    const live=await api('/api/health/live'), hist=await api('/api/health/history').catch(()=>({samples:[]})), s=live.sample||{}, samples=hist.samples||[];
    const proc=(s.top_processes||[]).map(p=>[`<b>${Number(p.pid)}</b>`,`${Number(p.cpu_percent||0).toFixed(1)}%`,`${Number(p.memory_percent||0).toFixed(1)}%`,`<code>${esc(p.command||'')}</code>`,`<button data-story-pid="${Number(p.pid)}">Explain / 解释</button>`]);
    const assertions=(s.power_assertions||[]).length?`<ul>${s.power_assertions.map(x=>`<li><code>${esc(x)}</code></li>`).join('')}</ul>`:empty('No matching sleep-prevention assertion in this sample. / 本次样本未发现匹配的阻止睡眠断言。');
    $('#evidenceStage').innerHTML=question('<button class="s24-action primary" type="button" data-do="refresh-health">Sample again / 再采样</button><button class="s24-action" type="button" data-lens="tools">Terminal Tools / 终端工具</button>')+
      band(1,'Resource & Energy / 资源与能耗',ledger([['CPU load / CPU 负载',`${Number(s.cpu_percent||0).toFixed(1)}%`,'Normalized across logical CPUs / 按逻辑核心归一化'],['Memory free context / 可用内存上下文',s.memory_free_percent?`${Number(s.memory_free_percent)}%`:'—','Do not read this alone; compression and pressure matter / 不能单独判断，应结合压缩与压力'],['Compressed / 压缩内存',bytes(s.memory_compressed_bytes||0)],['Wired / 联动内存',bytes(s.memory_wired_bytes||0)],['Battery / 电池',batteryText(s.battery)],['History / 历史',`${samples.length}/${Number(live.history_limit||120)} session samples / 会话样本`]]),'Current read-only sample plus bounded session history. / 当前只读样本 + 有界会话历史。')+
      band(2,'CPU trend / CPU 趋势',resourceBars(samples,'cpu_percent',100),'Recent samples only; this is not a benchmark. / 仅显示近期样本，不是性能跑分。')+
      band(3,'Memory pressure context / 内存压力上下文',ledger([['Free context / 可用上下文',bytes(s.memory_free_bytes||0)],['Active / 活跃',bytes(s.memory_active_bytes||0)],['Wired / 联动',bytes(s.memory_wired_bytes||0)],['Compressed / 压缩',bytes(s.memory_compressed_bytes||0)]]),'Compression and sustained pressure are more informative than a single free-memory number. / 持续压力和压缩比单一“剩余内存”更有意义。')+
      band(4,'Network trend / 网络趋势',ledger([['Inbound rate / 接收速率',`${bytes(s.network_in_bytes_per_second||0)}/s`],['Outbound rate / 发送速率',`${bytes(s.network_out_bytes_per_second||0)}/s`],['Observed inbound / 累计接收',bytes(s.network_in_bytes||0)],['Observed outbound / 累计发送',bytes(s.network_out_bytes||0)]]),'Rates require at least two samples; the first sample may show zero. / 速率至少需要两个样本，第一次可能为零。')+
      band(5,'Preventing sleep / 阻止睡眠',assertions,'Power assertions explain why sleep/display sleep may be deferred; they are not automatically a problem. / 电源断言可解释为何暂缓睡眠，但不自动代表异常。')+
      band(6,'Top resource processes / 高资源进程',proc.length?table(['PID','CPU','Memory / 内存','Command / 程序',''],proc):empty('No process sample available. / 无进程样本。'),'A current hotspot list for explanation, not a process ranking of trust or danger. / 这是资源热点，不是可信度或危险度排名。');
    activity('Ready',100,`Everyday Mac · ${samples.length} retained session sample(s)`);
  }

  function storageGraphRows(d){const rows=d.children||[];return `<div class="s24-note ${d.limited?'warn':'good'}"><b>${esc(d.path||'')}</b><br>${esc(d.detail||'')} ${d.hidden_children?`· ${d.hidden_children} smaller child item(s) hidden / 个较小项目已隐藏。`:''}</div><div class="storage-graph-tree">${rows.map(x=>`<div class="storage-graph-node"><div><b>${esc(x.name)}</b><span>${bytes(x.bytes)} · ${Number(x.percent||0).toFixed(1)}%</span></div><progress max="100" value="${Math.max(0,Math.min(100,Number(x.percent||0)))}"></progress>${x.is_dir?`<button type="button" class="s24-action" data-storage-graph-path="${esc(encodeURIComponent(x.path))}">Expand / 展开</button>`:''}<div class="storage-graph-children"></div></div>`).join('')}</div>`;}
  async function loadStorageGraph(path='',limit=24,host=$('#storageGraph')){if(!host)return;host.innerHTML=empty('Measuring this folder… / 正在测量此文件夹…');const d=await api('/api/storage/graph?path='+encodeURIComponent(path)+'&limit='+encodeURIComponent(limit));host.innerHTML=storageGraphRows(d);return d;}
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-storage-graph-path]');if(!button)return;const node=button.closest('.storage-graph-node'),host=node?.querySelector('.storage-graph-children');if(!host)return;button.disabled=true;try{await loadStorageGraph(decodeURIComponent(button.dataset.storageGraphPath||''),18,host);button.textContent='Refresh branch / 刷新分支';}catch(error){host.innerHTML=`<div class="s24-note warn">${esc(error?.message||String(error))}</div>`;}finally{button.disabled=false;}});

'''
s=s.replace(anchor,insert+anchor,1)
old="+band(3,'Objects',`<div id=\"storageObjects\">${empty('No storage result yet.')}</div>`);activity('Ready',0,'Storage measurement idle');}"
new="+band(3,'Objects',`<div id=\"storageObjects\">${empty('No storage result yet.')}</div>`)+band(4,'Storage Graph / 存储图',`<form class=\"s24-form\" data-form=\"storage-graph\"><label class=\"s24-field\"><span>Folder / 文件夹</span><input name=\"path\" value=\"\" placeholder=\"Leave blank for Home / 留空表示 Home\"></label><label class=\"s24-field\"><span>Top children / 每层显示数量</span><input name=\"limit\" type=\"number\" min=\"6\" max=\"60\" value=\"24\"></label><div class=\"s24-form-actions\"><button class=\"s24-action primary\" type=\"submit\">Generate Storage Graph / 生成存储图</button></div></form><div id=\"storageGraph\">${empty('Generate a graph, then expand only the folders you want to inspect. / 生成后只展开需要检查的目录。')}</div>`,'Lazy, bounded expansion / 惰性有界展开：不会为了画图先扫描整棵目录树。');activity('Ready',0,'Storage measurement idle');}"
if old not in s: raise SystemExit('storage render anchor missing')
s=s.replace(old,new,1)
old="registerLens('machine',renderMachine);registerLens('tools',renderTools);registerLens('processes'"
new="registerLens('machine',renderMachine);registerLens('health',renderHealth);registerLens('tools',renderTools);registerLens('processes'"
if old not in s: raise SystemExit('lens registration anchor missing')
s=s.replace(old,new,1)
s=s.replace('S.startStorage=startStorage;S.pollStorage=pollStorage;S.renderStorage=renderStorage;','S.startStorage=startStorage;S.pollStorage=pollStorage;S.renderStorage=renderStorage;S.renderHealth=renderHealth;S.loadStorageGraph=loadStorageGraph;',1)
p.write_text(s)

# Runtime actions/forms.
p=Path('web/app/runtime.js'); s=p.read_text()
old="    if(name==='refresh-machine-health')return navigate('machine',{push:false});\n"
if old in s:
    s=s.replace(old,"    if(name==='refresh-machine-health')return navigate('machine',{push:false});\n    if(name==='refresh-health')return navigate('health',{push:false});\n",1)
else:
    anchor="    if(name==='cancel-storage'){if(state.scanJob)await api('/api/storage/cancel?id='+encodeURIComponent(state.scanJob),{method:'POST'});return;}\n"
    if anchor not in s: raise SystemExit('runtime action anchor missing')
    s=s.replace(anchor,anchor+"    if(name==='refresh-health')return navigate('health',{push:false});\n",1)
old="      else if(form.dataset.form==='storage')await S.startStorage(form);\n"
new=old+"      else if(form.dataset.form==='storage-graph'){const fd=new FormData(form);await S.loadStorageGraph(String(fd.get('path')||''),Number(fd.get('limit')||24));}\n"
if old not in s: raise SystemExit('runtime storage form anchor missing')
s=s.replace(old,new,1); p.write_text(s)
