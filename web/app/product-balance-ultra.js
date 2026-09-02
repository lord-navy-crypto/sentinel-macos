// SPDX-License-Identifier: MPL-2.0
// Sentinel 3.2 Product Balance Ultra — canonical seven-stage product model.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) return;

  const MARKER = 'Sentinel 3.2 Product Balance Ultra';
  const {$, api, esc, badge, band, empty, ledger, table, question} = S;

  const BALANCED_MISSIONS = [
    {id:'observe',mark:'●',label:'Observe',hint:'What is happening?',lenses:['status','snapshot','machine','observatory']},
    {id:'explore',mark:'⌁',label:'Explore',hint:'Where should I look?',lenses:['processes','network','storage','maintenance','startup','background','search','relations']},
    {id:'tools',mark:'⌘',label:'Tools',hint:'Use bounded capabilities',lenses:['tools']},
    {id:'compare',mark:'Δ',label:'Compare',hint:'What changed?',lenses:['changes','behavior','reference','persistence']},
    {id:'act',mark:'↺',label:'Act',hint:'Preview and recover',lenses:['reclaim','change']},
    {id:'investigate',mark:'◎',label:'Investigate',hint:'Explain one anomaly',lenses:['cases','audit','object']},
    {id:'learn',mark:'?',label:'Learn',hint:'Understand the product',lenses:['visibility','guide','manual','assistant','runtime-logs']},
  ];

  S.MISSIONS.splice(0, S.MISSIONS.length, ...BALANCED_MISSIONS);

  function setCurrentMission() {
    const mission = S.MISSIONS.find(item => item.lenses.includes(S.state.lens));
    S.state.mission = mission?.id || 'observe';
    S.renderNavigation();
  }

  function task(label, detail, indeterminate=true) {
    return S.TaskCenter?.create(label,{kind:'diagnostic',detail,indeterminate}) || '';
  }
  function taskDone(id, detail) { if(id) S.TaskCenter?.finish(id,detail); }
  function taskFail(id, detail) { if(id) S.TaskCenter?.fail(id,detail); }

  const NETWORK_TOOL_IDS = ['network-quality','dns-configuration','proxy-configuration','route-table'];
  const NETWORK_ZH = {
    'network-quality':'运行 Apple networkQuality 测量响应性和吞吐表现。会产生临时测试流量，但不会修改网络设置。',
    'dns-configuration':'读取当前 DNS resolver 配置，帮助判断名称解析路径。',
    'proxy-configuration':'读取当前系统代理配置，不修改任何代理设置。',
    'route-table':'读取当前路由表，帮助判断默认路径与接口选择。'
  };

  function networkToolCard(tool) {
    const command = [tool.command,...(tool.base_args||[])].filter(Boolean).join(' ');
    return `<article class="s24-card" data-balance-network-card="${esc(tool.id)}">
      <div class="s24-card-head"><div><span>NETWORK DIAGNOSTIC / 网络诊断</span><h3>${esc(tool.name)}</h3></div>${badge('READ ONLY / 只读','good')}</div>
      <p><b>中文：</b>${esc(NETWORK_ZH[tool.id]||'读取本机网络证据。')}</p>
      <p><b>English:</b> ${esc(tool.summary||'Read local network evidence.')}</p>
      <div class="s24-note"><b>Equivalent command / 等价命令</b><br><code>${esc(command)}</code></div>
      <div class="s24-form-actions"><button type="button" class="s24-action primary" data-balance-network-run="${esc(tool.id)}" ${tool.available?'':'disabled'}>Run diagnostic / 运行诊断</button></div>
      <div data-balance-network-result="${esc(tool.id)}"></div>
    </article>`;
  }

  function tcpBody(data) {
    const arrays = Object.entries(data||{}).filter(([,v])=>Array.isArray(v)).sort((a,b)=>b[1].length-a[1].length);
    const primitive = Object.entries(data||{}).filter(([,v])=>['string','number','boolean'].includes(typeof v)).slice(0,14).map(([k,v])=>[k.replaceAll('_',' '),String(v)]);
    let body = primitive.length ? ledger(primitive) : '';
    if(arrays.length){
      const [name,list]=arrays[0];
      if(list.length && typeof list[0]==='object'){
        const keys=[...new Set(list.slice(0,12).flatMap(x=>Object.keys(x).filter(k=>['string','number','boolean'].includes(typeof x[k]))))].slice(0,6);
        body += table(keys.map(k=>k.replaceAll('_',' ')),list.slice(0,180).map(x=>keys.map(k=>`<span class="${k.includes('path')?'mono':''}">${esc(x[k]??'')}</span>`)));
      } else if(list.length) body += `<div class="s24-note">${esc(name)}: ${esc(list.slice(0,20).join(' · '))}</div>`;
    }
    return body || empty('No current TCP rows were returned.');
  }

  async function renderNetworkDiagnostics() {
    const [net,catalog] = await Promise.all([api('/api/network'),api('/api/system/console')]);
    const tools=(catalog.tools||[]).filter(t=>NETWORK_TOOL_IDS.includes(t.id));
    $('#evidenceStage').innerHTML=question()+
      band(1,'Current network evidence / 当前网络证据',tcpBody(net),'Current visible TCP/network state. A public endpoint is ordinary context, not a suspicion signal.')+
      band(2,'Network Diagnostics / 网络诊断',`<div class="s24-note good"><b>Analyze without changing settings / 分析但不修改设置。</b><br>These controls reuse Sentinel’s allowlisted, fixed-argument System Console runner. No arbitrary shell is exposed.</div><div class="s24-card-grid">${tools.map(networkToolCard).join('')}</div>`,'Network Quality, DNS, Proxy and Route evidence are presented together so connectivity problems can be explored without memorising Terminal commands.')+
      band(3,'Interpretation boundary / 解释边界',`<div class="s24-note">A failed quality test, unusual route, DNS entry, proxy value, or public connection is evidence to investigate. Sentinel does not turn any one of them into a malware or hardware-failure verdict.</div>`);
  }
  S.registerLens('network', renderNetworkDiagnostics);

  async function runNetworkTool(id, host) {
    const tid=task('Network diagnostic',`Running ${id} locally…`);
    host.innerHTML='<div class="s24-note">Running locally… / 正在本机运行…</div>';
    try{
      const d=await api('/api/system/query/structured',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool_id:id,target:''})});
      host.innerHTML=`<div class="s24-note ${d.status==='ok'?'good':'warn'}"><b>${esc(d.tool_name||id)}</b> · ${esc(d.status||'')} · ${Number(d.duration_ms||0)} ms<br><code>${esc(d.display_command||'')}</code></div>${d.summary?.length?`<ul>${d.summary.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<details><summary>Raw evidence / 原始证据</summary><pre>${esc(d.output||'No textual output / 无文本输出')}</pre></details>${d.limitations?.length?`<div class="s24-note warn"><b>Limitations / 限制</b><br>${d.limitations.map(esc).join('<br>')}</div>`:''}`;
      taskDone(tid,`${d.tool_name||id} complete`);
    }catch(err){host.innerHTML=`<div class="s24-note warn">${esc(err.message||String(err))}</div>`;taskFail(tid,err.message||String(err));}
  }

  function controlledWorkflowsBand() {
    return band(3,'Controlled Git & Download / 受控 Git 与下载',`
      <div class="s24-card-grid">
        <article class="s24-card">
          <div class="s24-card-head"><div><span>MANAGED WORKFLOW / 受控流程</span><h3>Git Pull</h3></div>${badge('MUTATING / 会修改','focus')}</div>
          <p><b>中文：</b>Pull 会改变工作区，不能伪装成只读工具。Sentinel 要求先指定仓库、展示当前分支/上游与等价操作，并只允许 fast-forward-only 路线进入执行层。</p>
          <p><b>English:</b> Git Pull changes a working tree. The product contract requires repository preflight, branch/upstream visibility, clean-worktree review, and a fast-forward-only execution path.</p>
          <label class="s24-field"><span>Repository / 仓库路径</span><input data-controlled-git-repo placeholder="/Users/name/project"></label>
          <div class="s24-note"><b>Equivalent operation / 等价操作</b><br><code>/usr/bin/git -C &lt;repo&gt; pull --ff-only</code></div>
          <div class="s24-form-actions"><button type="button" class="s24-action" data-controlled-git-preview>Preview requirements / 查看执行条件</button></div>
          <div data-controlled-git-result></div>
        </article>
        <article class="s24-card">
          <div class="s24-card-head"><div><span>MANAGED WORKFLOW / 受控流程</span><h3>Download</h3></div>${badge('CREATES FILE / 创建文件','focus')}</div>
          <p><b>中文：</b>下载会创建文件。Sentinel 不把任意 URL 直接交给 shell；执行层必须限制 HTTPS、明确目标目录、默认不覆盖，并在下载前显示来源和目标。</p>
          <p><b>English:</b> Download creates a file. The contract requires HTTPS, an explicit destination, no overwrite by default, bounded transfer policy, and no shell interpolation.</p>
          <label class="s24-field"><span>HTTPS URL</span><input data-controlled-download-url placeholder="https://example.com/file"></label>
          <label class="s24-field"><span>Destination / 目标</span><input data-controlled-download-dest placeholder="~/Downloads/file"></label>
          <div class="s24-note"><b>Execution boundary / 执行边界</b><br>Preview first. Arbitrary shell and silent overwrite are prohibited.</div>
          <div class="s24-form-actions"><button type="button" class="s24-action" data-controlled-download-preview>Preview requirements / 查看执行条件</button></div>
          <div data-controlled-download-result></div>
        </article>
      </div>
      <div class="s24-note warn"><b>Important / 重要：</b>These cards define and enforce the product boundary. Direct mutation is intentionally gated until backend preflight/recovery requirements are satisfied; Sentinel will not substitute an unsafe arbitrary command runner.</div>`,
      'Observation tools may run directly through the allowlist. Git Pull and Download remain explicitly managed because they change local state.');
  }

  const baseToolsRenderer=S.renderers.tools;
  if(typeof baseToolsRenderer==='function'){
    S.registerLens('tools',async()=>{
      await baseToolsRenderer();
      $('#evidenceStage')?.insertAdjacentHTML('beforeend',controlledWorkflowsBand());
    });
  }

  function patchManual() {
    const topics=S.userManual?.topics||[];
    const screen=topics.find(t=>t.id==='screen-regions');
    if(screen){
      screen.title='应用界面的主要区域分别是什么？';
      screen.summary='Sentinel 现在以七阶段产品模型组织功能；长任务统一由左下角 Task Center 显示。';
      screen.paragraphs=(screen.paragraphs||[]).map(p=>p.replace(/⑦ Activity Bar：底部状态条。长操作时看这里的阶段、百分比和当前正在处理的内容。/g,'⑦ Task Center：左下角悬浮任务中心。长操作在这里显示真实进度或 indeterminate 状态、耗时、卡顿提示与完成结果。'));
      screen.steps=(screen.steps||[]).map(p=>p.replace(/底部 Activity Bar/g,'左下角 Task Center'));
      screen.lookFor=(screen.lookFor||[]).map(p=>p.replace(/底部进度\/错误信息/g,'Task Center 任务进度 / 错误信息'));
    }
    const activityTopic=topics.find(t=>t.id==='activity-bar');
    if(activityTopic){
      activityTopic.title='Task Center 与任务进度怎么读？';
      activityTopic.kicker='判断任务是否真的在工作';
      activityTopic.summary='长操作统一显示在左下角 Task Center。可测量工作显示真实百分比；未知总量工作显示 indeterminate，不制造假进度。';
      activityTopic.paragraphs=['Task Center 会显示当前任务、阶段/细节、已耗时、完成/失败/取消状态。多个任务同时运行时会分别保留条目。','如果任务总量可以真实测量，Sentinel 显示真实百分比；如果无法预先知道总量，就显示 indeterminate 动画而不是伪造 20%→90%。','长时间没有可见进展会标记 Possibly stalled，但这不是自动判定任务失败。'];
      activityTopic.steps=['在左下角打开 Task Center。','查看任务名称与当前阶段。','有真实百分比时读取百分比；看到 … 时表示总量未知。','需要时使用支持的 Cancel；不要重复启动相同昂贵任务。','完成后可保留结果直到 Clear。'];
      activityTopic.lookFor=['Running / Done / Failed / Cancelled','真实百分比或 indeterminate','Elapsed time','Possibly stalled','可取消任务'];
      activityTopic.caution='Possibly stalled 表示一段时间没有可见进展，不等于已经证明后台任务失败。';
    }
    for(const topic of topics){
      topic.paragraphs=(topic.paragraphs||[]).map(p=>p.replace(/底部 Activity Bar/g,'左下角 Task Center').replace(/底部状态条/g,'Task Center'));
      topic.steps=(topic.steps||[]).map(p=>p.replace(/底部 Activity Bar/g,'左下角 Task Center').replace(/底部 Activity 状态/g,'Task Center 状态'));
      topic.lookFor=(topic.lookFor||[]).map(p=>p.replace(/底部 Activity Bar/g,'Task Center'));
    }
  }
  patchManual();

  document.addEventListener('click',event=>{
    const netButton=event.target.closest('[data-balance-network-run]');
    if(netButton){const host=netButton.closest('[data-balance-network-card]')?.querySelector('[data-balance-network-result]');if(host)void runNetworkTool(netButton.dataset.balanceNetworkRun,host);return;}
    const git=event.target.closest('[data-controlled-git-preview]');
    if(git){
      const card=git.closest('.s24-card'),repo=(card?.querySelector('[data-controlled-git-repo]')?.value||'').trim(),host=card?.querySelector('[data-controlled-git-result]');
      if(host)host.innerHTML=repo.startsWith('/')?`<div class="s24-note good"><b>Preview / 预览</b><br>Repository: <code>${esc(repo)}</code><br>Required before execution: repository exists · Git worktree detected · branch/upstream visible · local changes reviewed · operation is <code>pull --ff-only</code> · no shell.</div>`:`<div class="s24-note warn">Use an absolute repository path. / 请输入绝对仓库路径。</div>`;
      return;
    }
    const dl=event.target.closest('[data-controlled-download-preview]');
    if(dl){
      const card=dl.closest('.s24-card'),url=(card?.querySelector('[data-controlled-download-url]')?.value||'').trim(),dest=(card?.querySelector('[data-controlled-download-dest]')?.value||'').trim(),host=card?.querySelector('[data-controlled-download-result]');
      let valid=false;try{const u=new URL(url);valid=u.protocol==='https:';}catch{}
      if(host)host.innerHTML=valid&&dest?`<div class="s24-note good"><b>Preview / 预览</b><br>Source: <code>${esc(url)}</code><br>Destination: <code>${esc(dest)}</code><br>Required before execution: HTTPS · explicit destination · no overwrite by default · bounded transfer · no shell.</div>`:`<div class="s24-note warn">Provide a valid HTTPS URL and explicit destination. / 请输入有效 HTTPS URL 与明确目标。</div>`;
    }
  });

  setCurrentMission();
  S.ProductBalanceUltra={marker:MARKER,missions:BALANCED_MISSIONS,networkTools:NETWORK_TOOL_IDS};
})();
