// SPDX-License-Identifier: MPL-2.0
(() => {
  'use strict';
  const S=window.SentinelApp;
  const {$,$$,state,api,busy,activity,notice,esc,bytes,fmt,badge,question,band,empty,ledger,table,primitiveRows,registerLens}=S;

  async function renderMachine(){busy('Reading machine','System Profile');const d=await api('/api/system-profile');const rows=[['Model',d.model_name,d.model_identifier],['Chip',d.chip||d.processor,d.platform_family],['Architecture',d.architecture,d.engine_explanation],['Physical cores',d.physical_cores],['Logical cores',d.logical_cores],['Memory',bytes(d.memory_bytes)],['macOS',d.os_version,d.os_build],['Kernel',d.kernel_version],['Rosetta',d.rosetta_translated?'Yes':'No'],['Root storage',bytes(d.disk_total),`${bytes(d.disk_available)} available`]];$('#evidenceStage').innerHTML=question()+band(1,'Machine identity',ledger(rows),'Unique serial number and Hardware UUID are intentionally unnecessary for this view.')+band(2,'Runtime implication',`<div class="s24-note good">${esc(d.engine_explanation||'Sentinel uses the architecture-matched local engine packaged in the Universal app.')}</div>`);activity('Ready',100,'Machine profile loaded');}

  async function renderProcesses(){busy('Reading processes','Current process snapshot');const d=await api('/api/processes');state.processRows=d.processes||[];const rows=state.processRows.slice(0,260).map(p=>[`<b>${esc(p.pid)}</b>`,`${Number(p.cpu||0).toFixed(1)}%`,`${Number(p.memory||0).toFixed(1)}%`,esc(p.user||''),`<code>${esc(p.command||'')}</code>`,`<button data-story-pid="${Number(p.pid)}">Explain</button>`]);$('#evidenceStage').innerHTML=question()+band(1,'Running software',rows.length?table(['PID','CPU','Memory','User','Command',''],rows):empty('No process rows returned.'),'Current state only; historical process activity requires prior capture.');activity('Ready',100,`${state.processRows.length} processes returned`);}

  async function renderStartup(){busy('Reading startup','Launch configuration');const d=await api('/api/startup');const items=d.items||[];const rows=items.slice(0,260).map(x=>[badge(x.risk??0,Number(x.risk||0)>=70?'bad':Number(x.risk||0)>=35?'warn':''),esc(x.scope||''),esc(x.manifest?.label||x.name||''),`<code>${esc(x.executable||x.target||'')}</code>`,`<code>${esc(x.path||x.manifest_path||'')}</code>`]);$('#evidenceStage').innerHTML=question()+band(1,'Launch declarations',items.length?table(['Risk','Scope','Item','Executable','Manifest'],rows):empty('No visible startup items returned.'),'Launch persistence is common; path, identity and behavior determine whether it deserves review.');activity('Ready',100,`${items.length} startup items`);}

  async function renderGenericLens(endpoint,title,description,method='GET'){
    busy('Reading evidence',title);const d=await api(endpoint,{method});const rows=primitiveRows(d,18);const arrays=Object.entries(d||{}).filter(([,v])=>Array.isArray(v)).sort((a,b)=>b[1].length-a[1].length);let body=ledger(rows);if(arrays.length){const [name,list]=arrays[0];if(list.length&&typeof list[0]==='object'){const keys=[...new Set(list.slice(0,8).flatMap(x=>Object.keys(x).filter(k=>['string','number','boolean'].includes(typeof x[k]))))].slice(0,6);body+=`<div style="height:16px"></div>`+table(keys.map(k=>k.replaceAll('_',' ')),list.slice(0,200).map(x=>keys.map(k=>`<span class="${k.includes('path')?'mono':''}">${esc(x[k]??'')}</span>`)));}else if(list.length)body+=`<div class="s24-note">${esc(name)}: ${esc(list.slice(0,20).join(' · '))}</div>`;}$('#evidenceStage').innerHTML=question()+band(1,title,body,description);activity('Ready',100,title+' loaded');
  }

  async function renderStorage(){$('#evidenceStage').innerHTML=question()+band(1,'Acquisition',`<form class="s24-form" data-form="storage"><label class="s24-field"><span>Scope</span><select name="scope"><option value="home">Home</option><option value="downloads">Downloads</option><option value="workspace">Workspace</option></select></label><label class="s24-field"><span>Minimum file MB</span><input name="min" type="number" min="1" max="10240" value="100"></label><label class="s24-field"><span>Large-file limit</span><input name="limit" type="number" min="10" max="2000" value="200"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Measure storage</button><button class="s24-action" type="button" data-do="cancel-storage">Cancel</button></div></form><div id="storagePipeline" class="s24-pipeline"><div class="s24-step"><span>01</span><b>Traverse</b></div><div class="s24-step"><span>02</span><b>Measure</b></div><div class="s24-step"><span>03</span><b>Hash candidates</b></div><div class="s24-step"><span>04</span><b>Report</b></div></div>`,'Scanning is bounded and cancellable. Progress appears only after a real localhost request starts.')+band(2,'Measured footprint',`<div id="storageSummary">${empty('Run a measurement to populate observed numbers.')}</div>`)+band(3,'Objects',`<div id="storageObjects">${empty('No storage result yet.')}</div>`)+band(4,'Storage Graph / 存储图',`<form class="s24-form" data-form="storage-graph"><label class="s24-field"><span>Folder / 文件夹</span><input name="path" value="" placeholder="Leave blank for Home / 留空表示 Home"></label><label class="s24-field"><span>Top children / 每层显示数量</span><input name="limit" type="number" min="6" max="60" value="24"></label><div class="s24-form-actions"><button class="s24-action primary" type="submit">Generate Storage Graph / 生成存储图</button></div></form><div id="storageGraph">${empty('Generate a graph, then expand only the folders you want to inspect. / 生成后只展开需要检查的目录。')}</div>`,'Lazy, bounded expansion / 惰性有界展开：不会为了画图先扫描整棵目录树。');activity('Ready',0,'Storage measurement idle');}

  async function startStorage(form){if(state.scanTimer)clearTimeout(state.scanTimer);const fd=new FormData(form);busy('Starting scan','Bounded localhost request');const job=await api('/api/storage/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:fd.get('scope'),min_mb:Number(fd.get('min')),limit:Number(fd.get('limit'))})});state.scanJob=job.id;pollStorage();}

  async function pollStorage(){if(!state.scanJob)return;try{const j=await api('/api/storage/jobs?id='+encodeURIComponent(state.scanJob));const phase=String(j.phase||'scan'),phasePct=Number(j.phase_percent||0);let detail=`${Number(j.files_visited||0).toLocaleString()} files · ${Number(j.dirs_visited||0).toLocaleString()} folders`;if(j.slow_paths_skipped)detail+=` · ${Number(j.slow_paths_skipped).toLocaleString()} slow paths skipped`;if(j.hash_files_total)detail+=` · hashes ${Number(j.hash_files_done||0)}/${Number(j.hash_files_total||0)}`;if(j.hash_bytes_total)detail+=` · ${bytes(j.hash_bytes_done||0)} / ${bytes(j.hash_bytes_total||0)}`;if(j.current_hash_path)detail+=` · ${j.current_hash_path}`;activity(phase.replaceAll('_',' '),phasePct,detail);const steps=$$('#storagePipeline .s24-step'),idx=phase.includes('hash')?2:phase.includes('report')?3:phase.includes('measure')?1:0;steps.forEach((x,i)=>{x.classList.toggle('active',i===idx);x.classList.toggle('done',i<idx);});if(j.status==='running'){state.scanTimer=setTimeout(pollStorage,500);return;}if(j.status==='failed')throw new Error(j.error||'Storage scan failed');if(j.result)renderStorageResult(j.result,j.status);activity(j.status==='cancelled'?'Cancelled':'Complete',100,j.status==='cancelled'?'Partial measured result preserved when available.':'Building storage report complete.');}catch(e){notice(e.message);activity('Error',0,e.message);}}

  function renderStorageResult(d,status){const summary=$('#storageSummary'),objects=$('#storageObjects');if(!summary||!objects)return;summary.innerHTML=ledger([['Status',status||'complete'],['Files visited',Number(d.files_visited||0).toLocaleString()],['Folders visited',Number(d.dirs_visited||0).toLocaleString()],['Visible bytes',bytes(d.visible_bytes)],['Permission limits',d.permission_errors||0],['Slow paths skipped',d.slow_paths_skipped||0],['Duplicate hash bytes',bytes(d.duplicate_hash_bytes||0)]]);const files=d.large_files||[],dups=d.duplicates||[],families=d.families||[];let body=files.length?table(['Size','Modified','File','Path',''],files.slice(0,300).map(f=>[`<b>${bytes(f.size)}</b>`,esc(fmt(f.modified_unix)),esc(f.name),`<code>${esc(f.path)}</code>`,`<button data-story-path="${esc(encodeURIComponent(f.path))}">Explain</button>`])):empty('No large files matched the scan threshold.');if(dups.length)body+=`<div class="s24-note good">${dups.length} exact duplicate group(s) use hash agreement. Filename families remain separate heuristics.</div>`;if(families.length)body+=`<div class="s24-note warn">${families.length} possible version family/families are naming heuristics only.</div>`;objects.innerHTML=body;}



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

  const TOOL_ZH={
    system:'系统与硬件信息',processes:'进程与资源占用',storage:'磁盘、文件系统与空间',network:'网络连接与配置',power:'电池、电源与睡眠',security:'系统安全状态',filesystem:'文件与元数据',integrity:'应用签名与完整性',startup:'启动项与服务',backup:'Time Machine 与备份',search:'Spotlight 与搜索',logs:'系统日志',persistence:'持久化配置',changes:'变化记录',trust:'信任基线'
  };
  const TOOL_PURPOSE_ZH={
    'network-quality':'运行 Apple networkQuality 测量网络响应与吞吐表现；会产生临时测试流量，但不会修改网络设置。',
    'battery-status':'查看当前电量、电源来源和充电状态。',
    'power-assertions':'查看哪些进程或系统断言正在影响睡眠或屏幕休眠。',
    'power-profile':'查看电池与电源硬件信息。',
    'disk-filesystems':'查看各已挂载文件系统的容量和使用量。',
    'disk-layout':'查看物理磁盘、APFS 容器、分区与卷的布局。',
    'file-metadata':'读取一个绝对路径的 Spotlight 元数据。',
    'extended-attributes':'读取文件扩展属性，例如 quarantine 元数据。',
    'code-signing':'读取应用或可执行文件的代码签名身份。',
    'gatekeeper-assessment':'询问 Gatekeeper 如何评估一个应用/可执行路径；拒绝不是恶意软件结论。',
    'process-table':'查看当前进程的 PID、父进程、用户、CPU、内存和命令。',
    'process-open-files':'查看指定 PID 当前打开的文件和 socket。',
    'dns-configuration':'查看 macOS 当前 DNS resolver 配置。',
    'proxy-configuration':'查看当前系统代理配置。',
    'route-table':'查看当前路由表，不修改网络。',
    'time-machine-status':'查看 Time Machine 当前是否正在备份以及可见状态。',
    'software-update-history':'查看 macOS 已安装的软件更新历史。',
    'filevault-status':'查看 FileVault 加密状态；Sentinel 不读取恢复密钥。',
    'sip-status':'查看 System Integrity Protection 状态。'
  };
  function toolZh(t){return TOOL_PURPOSE_ZH[t.id]||`读取“${TOOL_ZH[t.domain]||t.domain||'系统'}”相关的本机证据。该工具使用固定程序和固定参数，不会把你的输入交给任意 shell。`;}
  function toolCommand(t){const args=[...(t.base_args||[])];if(t.target_kind==='path')args.push('<absolute-path>');if(t.target_kind==='pid')args.push('<PID>');return [t.command,...args].filter(Boolean).join(' ');}
  function toolCard(t){
    const needs=t.target_kind==='path'||t.target_kind==='pid';
    const target=needs?`<label class="s24-field"><span>${t.target_kind==='pid'?'PID':'Absolute path / 绝对路径'}</span><input data-terminal-target="${esc(t.id)}" placeholder="${t.target_kind==='pid'?'1234':'/Applications/Example.app'}"></label>`:'';
    const run=t.mode==='read_only'?`<button class="s24-action primary" type="button" data-terminal-run="${esc(t.id)}" ${t.available?'':'disabled'}>Run / 运行</button>`:`<button class="s24-action" type="button" data-terminal-managed="${esc(t.route||'')}">Open managed workflow / 打开受控流程</button>`;
    return `<article class="s24-card" data-terminal-tool="${esc(t.id)}"><div class="s24-card-head"><div><span>${esc((TOOL_ZH[t.domain]||t.domain||'System')+' / '+(t.domain||'system'))}</span><h3>${esc(t.name)}</h3></div>${badge(t.mode==='read_only'?'READ ONLY / 只读':'MANAGED / 受控',t.mode==='read_only'?'good':'focus')}</div><p><b>中文：</b>${esc(toolZh(t))}</p><p><b>English:</b> ${esc(t.summary||'')}</p><div class="s24-note"><b>Equivalent command / 等价命令</b><br><code>${esc(toolCommand(t)||t.route||'Sentinel managed workflow')}</code></div>${target}<div class="s24-form-actions">${run}</div><div class="terminal-inline-result" data-terminal-result="${esc(t.id)}"></div></article>`;
  }
  async function renderTools(){
    busy('Loading tools','Allowlisted macOS command catalog / 白名单 macOS 工具目录');
    const d=await api('/api/system/console');
    const tools=d.tools||[];
    const read=tools.filter(t=>t.mode==='read_only'),managed=tools.filter(t=>t.mode!=='read_only');
    $('#evidenceStage').innerHTML=question('<button type="button" class="s24-action" data-terminal-full>Open full System Console / 打开完整 System Console</button>')+
      band(1,'Terminal Tools / 终端工具',`<div class="s24-note good"><b>不是任意 Terminal / Not an arbitrary shell.</b><br>Sentinel 只运行白名单 executable + 明确参数，并限制时间与输出。 / Sentinel runs only allowlisted executables with explicit arguments, bounded time and bounded output.</div><div class="s24-card-grid">${read.map(toolCard).join('')}</div>`,'Use visual controls for common macOS command-line evidence without memorising syntax. / 用可视化控件调用常用 macOS 命令行证据能力，无需记忆语法。')+
      band(2,'Managed actions / 受控操作',`<div class="s24-card-grid">${managed.map(toolCard).join('')}</div>`,'Mutating operations stay in Preview → confirmation → journal/recovery. / 会修改状态的操作仍必须经过预览、确认、日志与恢复边界。');
    activity('Ready',100,`${tools.length} Terminal-backed tools / 终端工具`);
  }
  async function runTerminalTool(id){
    const card=document.querySelector(`[data-terminal-tool="${CSS.escape(id)}"]`),host=card?.querySelector(`[data-terminal-result="${CSS.escape(id)}"]`),input=card?.querySelector(`[data-terminal-target="${CSS.escape(id)}"]`);
    if(!host)return;host.innerHTML='<div class="s24-note">Running locally… / 正在本机运行…</div>';
    try{const d=await api('/api/system/query/structured',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool_id:id,target:input?.value?.trim()||''})});host.innerHTML=`<div class="s24-note ${d.status==='ok'?'good':'warn'}"><b>${esc(d.tool_name||id)}</b> · ${esc(d.status||'')} · ${Number(d.duration_ms||0)} ms<br><code>${esc(d.display_command||'')}</code></div>${d.summary?.length?`<ul>${d.summary.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<details><summary>Raw evidence / 原始证据</summary><pre>${esc(d.output||'No textual output / 无文本输出')}</pre></details>${d.limitations?.length?`<div class="s24-note warn"><b>Limitations / 限制</b><br>${d.limitations.map(esc).join('<br>')}</div>`:''}`;}
    catch(e){host.innerHTML=`<div class="s24-note warn">${esc(e.message||String(e))}</div>`;}
  }
  document.addEventListener('click',event=>{
    const run=event.target.closest('[data-terminal-run]');if(run){void runTerminalTool(run.dataset.terminalRun);return;}
    const full=event.target.closest('[data-terminal-full]');if(full){location.href='/system-console.html'+location.hash;return;}
    const managed=event.target.closest('[data-terminal-managed]');if(managed){const route=managed.dataset.terminalManaged||'';if(route.startsWith('/api/'+'actions/'))S.navigate('change');else if(route.includes('changes'))S.navigate('changes');else if(route.includes('trust'))S.navigate('reference');else if(route.endsWith('.html'))location.href=route+location.hash;}
  });

  registerLens('machine',renderMachine);registerLens('health',renderHealth);registerLens('tools',renderTools);registerLens('processes',renderProcesses);registerLens('startup',renderStartup);registerLens('persistence',()=>renderGenericLens('/api/persistence','Persistence comparison','Visible LaunchAgent/LaunchDaemon configuration state and bounded comparison.'));registerLens('background',()=>renderGenericLens('/api/background','Background registrations','Background Task Management registrations macOS exposes to this process.'));registerLens('network',()=>renderGenericLens('/api/network','Current TCP evidence','Current network snapshot only; encrypted content and unobserved history are outside this evidence.'));registerLens('storage',renderStorage);
  S.startStorage=startStorage;S.pollStorage=pollStorage;S.renderStorage=renderStorage;S.renderHealth=renderHealth;S.loadStorageGraph=loadStorageGraph;
})();
