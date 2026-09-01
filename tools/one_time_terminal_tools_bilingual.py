from pathlib import Path

# 1) Promote Terminal Tools into canonical System navigation.
p = Path('web/app/core.js')
s = p.read_text()
old = "{id:'system',mark:'▦',label:'System',hint:'What exists?',lenses:['machine','processes','startup','persistence','background','network','storage']},"
new = "{id:'system',mark:'▦',label:'System',hint:'Everyday Mac + evidence / 日常状态与证据',lenses:['machine','tools','processes','startup','persistence','background','network','storage']},"
if old not in s: raise SystemExit('System mission anchor missing')
s = s.replace(old, new, 1)
old = "machine:{label:'Machine',verb:'CONTEXT',title:'What machine is producing this evidence?',rule:'Hardware and runtime explain capability and compatibility.'},"
new = old + "\n    tools:{label:'Terminal Tools / 终端工具',verb:'TOOLS',title:'Which macOS command-line capability do I need without memorising Terminal syntax?',rule:'Only allowlisted, typed, bounded tools are exposed. No arbitrary shell / 仅开放白名单、类型化、有边界的工具，不提供任意 shell。'},"
s = s.replace(old, new, 1)
p.write_text(s)

# 2) Canonical visual Terminal Tools lens, reusing existing no-shell backend.
p = Path('web/app/lenses/system.js')
s = p.read_text()
anchor = "  registerLens('machine',renderMachine);"
if anchor not in s: raise SystemExit('system lens registration anchor missing')
insert = r'''
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
    const managed=event.target.closest('[data-terminal-managed]');if(managed){const route=managed.dataset.terminalManaged||'';if(route.startsWith('/api/actions/'))S.navigate('change');else if(route.includes('changes'))S.navigate('changes');else if(route.includes('trust'))S.navigate('reference');else if(route.endsWith('.html'))location.href=route+location.hash;}
  });

'''
s = s.replace(anchor, insert + anchor, 1)
s = s.replace("registerLens('machine',renderMachine);registerLens('processes'", "registerLens('machine',renderMachine);registerLens('tools',renderTools);registerLens('processes'", 1)
p.write_text(s)

# 3) Make System Console entry text explicitly bilingual without changing its execution layer.
p=Path('web/system-console.html'); s=p.read_text()
s=s.replace('<html lang="en">','<html lang="zh-CN">',1)
s=s.replace('Sentinel System Console</h1>','Sentinel System Console / 系统控制台</h1>',1)
s=s.replace('Visual Terminal Toolbox','Visual Terminal Toolbox / 可视化终端工具箱')
s=s.replace('Ask the Mac','Ask the Mac / 问这台 Mac')
s=s.replace('Read-only','Read-only / 只读')
s=s.replace('Open Terminal Guide','Open Terminal Guide / 打开终端指南')
p.write_text(s)

# 4) Primary bilingual Quick Start and Guide. These are user docs, not developer internals.
Path('QUICK_START.md').write_text(r'''# Sentinel Quick Start / Sentinel 快速开始

> **English:** Sentinel is a local-first macOS system intelligence tool. Start by observing; change things only through explicit reversible workflows.  
> **中文：** Sentinel 是本地优先的 macOS 系统智能工具。先观察，再验证；只有在明确、可恢复的流程中才执行修改。

## 1. Open / 打开

**English** — Open `Sentinel.app`. The local engine listens only on localhost and the app UI connects with a session token.  
**中文** — 打开 `Sentinel.app`。本地引擎只监听 localhost，应用界面使用会话 token 连接。

## 2. Start with Status / 从 Status 开始

**English** — Use Status for orientation. Run **Easy Scan** for a quick read-only review. Run **Full Scan** only when you intentionally want a broader retained baseline.  
**中文** — 使用 Status 判断当前状态。想快速只读检查时运行 **Easy Scan**；只有在你明确需要更广泛 retained baseline 时才运行 **Full Scan**。

## 3. Everyday Mac / 日常 Mac

**English** — Under **System**, use Machine, Terminal Tools, Processes, Auto-start, Persistence, Background, Network and Storage. Terminal Tools are visual wrappers around a fixed allowlist of macOS commands; they are not an arbitrary shell.  
**中文** — 在 **System** 下使用 Machine、Terminal Tools、Processes、Auto-start、Persistence、Background、Network 和 Storage。Terminal Tools 是白名单 macOS 命令的可视化封装，不是任意 shell。

## 4. Investigate / 调查

**English** — Cases groups related evidence; Search finds objects; Relations shows graph/timeline links; Audit prioritises review; Object verifies one path or process. A priority score is not malware probability.  
**中文** — Cases 聚合相关证据；Search 查找对象；Relations 查看图与时间关系；Audit 对复查顺序排序；Object 验证具体路径或进程。优先级分数不是恶意软件概率。

## 5. Safe Change / 安全修改

**English** — Mutating actions must use **Preview → explicit confirmation → one-time code → execution revalidation → journal/recovery**.  
**中文** — 会修改状态的操作必须经过 **Preview → 明确确认 → 一次性代码 → 执行前重新验证 → 日志/恢复**。

## 6. Local AI / 本地 AI

**English** — Local AI explains Sentinel evidence. It is an interpretation layer, not a source of system facts and not an unrestricted shell.  
**中文** — Local AI 用来解释 Sentinel 证据。它是解释层，不是系统事实来源，也没有不受限制的 shell 权限。

## 7. Long tasks / 长任务

**English** — Use progress indicators and Runtime Logs to see whether work is running, limited, stalled, cancelled or complete. Avoid repeatedly launching the same expensive task.  
**中文** — 通过进度信息和 Runtime Logs 判断任务是运行中、受限、卡顿、已取消还是已完成。不要反复启动同一个昂贵任务。

## 8. Privacy / 隐私

**English** — Treat exported diagnostics as sensitive: they may contain local paths, process names and system evidence.  
**中文** — 导出的诊断资料可能包含本机路径、进程名和系统证据，应按敏感资料处理。
''')

Path('GUIDE.md').write_text(r'''# Sentinel User Guide / Sentinel 用户指南

This is the primary repository usage guide. Every user-facing instruction in this guide is paired in English and Chinese. / 这是仓库中的主要用户使用指南，本指南中的用户说明均以中英文成对呈现。

## Product model / 产品模型

**English:** Sentinel should be used as six balanced capabilities: **Observe → Explore → Tools → Compare → Act → Investigate**. The product must not become only a malware-investigation dashboard.  
**中文：** Sentinel 应均衡发展为六类能力：**Observe 观察 → Explore 探索 → Tools 工具 → Compare 比较 → Act 操作 → Investigate 调查**。产品不应只变成恶意软件调查面板。

## Observe / 观察

**English:** Machine state, processes, CPU/memory/energy context, network, storage, startup/background state, task progress and runtime logs answer “what is happening now?”  
**中文：** Machine 状态、进程、CPU/内存/能耗上下文、网络、存储、启动/后台状态、任务进度和 Runtime Logs 用来回答“现在正在发生什么？”

## Explore / 探索

**English:** Search, Object, Relations, Storage analysis and retained history help locate and understand one concrete object before interpretation.  
**中文：** Search、Object、Relations、Storage 分析和 retained history 帮助在解释之前先定位并理解一个具体对象。

## Terminal Tools / 终端工具

**English:** System → Terminal Tools exposes a fixed, typed catalog. Sentinel runs the executable directly with explicit arguments, timeout and output limits. User text is never concatenated into a shell command. Path tools accept an absolute path; PID tools accept a positive PID. The UI shows the equivalent command for learning and transparency.  
**中文：** System → Terminal Tools 提供固定、类型化的工具目录。Sentinel 直接运行明确 executable 和参数，并设置超时与输出上限；用户文本不会被拼接成 shell 命令。路径工具只接受绝对路径，PID 工具只接受正整数 PID。界面会显示等价命令，方便学习和核对。

**English:** Read-only examples include process tables, disk/APFS information, Network Quality, DNS/proxy configuration, battery/power state, Time Machine status, FileVault/SIP, signing/Gatekeeper, file metadata and bounded recent logs.  
**中文：** 只读工具包括进程表、磁盘/APFS、Network Quality、DNS/代理、电池/电源、Time Machine、FileVault/SIP、签名/Gatekeeper、文件元数据和有界近期日志等。

**English:** State-changing tools are not executed by the Terminal query runner. They remain inside Sentinel-managed preview/confirmation/recovery workflows.  
**中文：** 会改变状态的工具不会由 Terminal query runner 直接执行，而是继续留在 Sentinel 的 preview/confirmation/recovery 受控流程中。

## Compare / 比较

**English:** Changes, Behavior, Reference, historical network/storage captures and checkpoints answer “what changed?” Difference is evidence, not automatically danger.  
**中文：** Changes、Behavior、Reference、网络/存储历史和 checkpoint 用来回答“发生了什么变化？”差异是证据，不自动等于危险。

## Act / 操作

**English:** Reclaim is review-first. Safe Change is reversible-first. Never treat a suggested cleanup or action as automatic permission to modify the Mac.  
**中文：** Reclaim 先复查，Safe Change 先可恢复。任何清理建议或操作建议都不代表可以自动修改 Mac。

## Investigate / 调查

**English:** Cases, Graph/Timeline, Audit, Object Story, Workbench and Local AI are for deeper explanations after a concrete question exists. Keep Observed, Derived, Interpretation and Unknown separate.  
**中文：** Cases、Graph/Timeline、Audit、Object Story、Workbench 和 Local AI 用于在存在具体问题后继续深入解释。始终区分 Observed、Derived、Interpretation 和 Unknown。

## Troubleshooting / 排障

**English:** If a task appears stuck, first check the task/progress surface and Runtime Logs. A visibility or permission limitation should be shown as limited/unavailable, not converted into a clean bill of health.  
**中文：** 如果任务看起来卡住，先查看任务/进度界面和 Runtime Logs。可见性或权限限制应显示为 limited/unavailable，而不是被误解释为“没有问题”。

## Documentation rule / 文档规则

**English:** Primary usage documentation and in-app guidance should provide both English and Chinese. Developer-only implementation notes may remain English-first when they are not user instructions.  
**中文：** 主要用户说明和应用内引导应同时提供英文和中文；不属于用户使用说明的开发者内部实现文档可以继续以英文为主。
''')

# 5) Product balance audit: prevent future feature tunnel vision.
Path('docs/PRODUCT_BALANCE_AUDIT.md').write_text(r'''# Product Balance Audit / 产品重心审计

## Finding / 结论

**English:** Sentinel became disproportionately deep in Investigation, Full Scan, Local AI and Safe Change while everyday observability and discoverability of existing AUX tools lagged behind. The missing capability was often not backend code; it was product integration and information architecture.  
**中文：** Sentinel 在 Investigation、Full Scan、Local AI、Safe Change 上发展得很深，但日常观察能力和既有 AUX 工具的可发现性相对落后。很多时候真正缺少的不是后端代码，而是产品整合和信息架构。

## Balanced roadmap / 均衡路线

| Area / 领域 | User question / 用户问题 | Priority / 优先级 |
|---|---|---|
| Observe / 观察 | Why is my Mac slow/hot/busy? / 为什么卡、热、忙？ | High / 高 |
| Power / 电源 | Why is battery draining or sleep blocked? / 为什么掉电快或不睡眠？ | High / 高 |
| Network / 网络 | Is the connection healthy and what is using it? / 网络是否正常、谁在使用？ | High / 高 |
| Storage / 存储 | What is using space and how is it organised? / 空间去哪了、文件如何组织？ | High / 高 |
| Tools / 工具 | Can I use useful Terminal capabilities without memorising commands? / 不记命令能否使用 Terminal 能力？ | High / 高 |
| Compare / 比较 | What changed since a known point? / 和之前相比变了什么？ | High / 高 |
| Recovery / 恢复 | Can I undo or explain a change? / 能否恢复或解释一次修改？ | High / 高 |
| Investigate / 调查 | What explains one concrete anomaly? / 一个具体异常如何解释？ | High, but not dominant / 高，但不能独占 |
| Learn / 学习 | What does this button/metric mean? / 这个按钮或指标是什么意思？ | High / 高 |

## Rule / 规则

Every major release should review coverage across Observe, Explore, Tools, Compare, Act, Investigate and Learn. / 每个主要版本都应检查 Observe、Explore、Tools、Compare、Act、Investigate、Learn 七类能力是否失衡。
''')

# 6) Bilingual contract and Terminal integration contract.
Path('bilingual_terminal_product_contract_test.go').write_text(r'''// SPDX-License-Identifier: MPL-2.0
package main

import (
    "os"
    "strings"
    "testing"
)

func TestCanonicalSystemPromotesVisualTerminalTools(t *testing.T) {
    core := readUIFile(t, "web/app/core.js")
    system := readUIFile(t, "web/app/lenses/system.js")
    for _, want := range []string{"'machine','tools','processes'", "Terminal Tools / 终端工具", "No arbitrary shell / 仅开放白名单"} {
        if !strings.Contains(core, want) { t.Fatalf("canonical navigation missing %q", want) }
    }
    for _, want := range []string{"renderTools", "/api/system/console", "/api/system/query/structured", "Equivalent command / 等价命令", "READ ONLY / 只读", "MANAGED / 受控", "Raw evidence / 原始证据"} {
        if !strings.Contains(system, want) { t.Fatalf("canonical Terminal Tools missing %q", want) }
    }
    if strings.Contains(system, "exec(") || strings.Contains(system, "shell:true") {
        t.Fatal("canonical Terminal Tools must not introduce browser-side arbitrary shell execution")
    }
}

func TestPrimaryUsageDocsAreBilingual(t *testing.T) {
    for _, path := range []string{"QUICK_START.md", "GUIDE.md", "docs/PRODUCT_BALANCE_AUDIT.md", "web/terminal-guide.html", "web/system-console.html"} {
        raw, err := os.ReadFile(path); if err != nil { t.Fatal(err) }
        s := string(raw)
        hasChinese := false
        for _, r := range s { if r >= '\u4e00' && r <= '\u9fff' { hasChinese = true; break } }
        if !hasChinese { t.Fatalf("%s has no Chinese user guidance", path) }
        for _, want := range []string{"English", "中文"} {
            if !strings.Contains(s, want) && path != "web/system-console.html" { t.Fatalf("%s missing bilingual marker %q", path, want) }
        }
    }
}

func TestTerminalBackendRemainsTypedBoundedAndNoShell(t *testing.T) {
    backend := readUIFile(t, "system_console.go")
    for _, want := range []string{"systemConsoleMaxTimeout", "systemConsoleOutputLimit", "normalizeSystemConsoleTarget", "exec.CommandContext", "tool.Mode != \"read_only\""} {
        if !strings.Contains(backend, want) { t.Fatalf("Terminal backend safety contract missing %q", want) }
    }
    for _, forbidden := range []string{"/bin/sh", "/bin/zsh", "sh -c", "zsh -c"} {
        if strings.Contains(backend, forbidden) { t.Fatalf("Terminal backend unexpectedly exposes shell marker %q", forbidden) }
    }
}
''')
