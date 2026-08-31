// SPDX-License-Identifier: MPL-2.0
// Navigation/bootstrap glue for the Sentinel 2.6 in-app User Manual.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before Manual navigation.');

  const limits = S.MISSIONS.find(m => m.id === 'limits');
  if (limits && !limits.lenses.includes('manual')) limits.lenses.push('manual');
  S.LENSES.manual = {
    label:'Manual',
    verb:'LEARN',
    title:'How do I use every part of Sentinel?',
    rule:'Read the plain-language guide, jump to any section, then open the real feature directly.'
  };

  const AI_MANUAL_GROUP = {
    id:'local-ai', label:'本地 AI / LOCAL AI',
    topics:[
      {
        id:'ai-overview',title:'Sentinel 本地 AI 到底是什么？',kicker:'AI 是解释层，不是事实来源',lens:'assistant',
        summary:'Local AI 使用 WebLLM + WebGPU 在你的浏览器/App View 内运行模型。Sentinel Engine 仍负责采集事实，AI 负责解释、组织和提出下一步。',
        paragraphs:['你会在几乎每个主要 Lens 的 Quick Actions 下方看到 Local AI contextual bar。点 Explain with AI 时，Sentinel 先把当前 Lens、Cross-Lens Selection、可见 Context Tray、相关 retained evidence 和 Manual 片段整理成一个 bounded Evidence Packet，再交给本地模型。','AI 不会直接扫描整个 Mac，也不会绕过 Sentinel 的证据 API 自己读取任意文件。它看到什么由 Sentinel 明确提供。','模型输出属于 interpretation。Observed facts、用户 Workbench notes、Manual guidance 和 AI interpretation 会被提示词明确区分。'],
        steps:['进入 Limits → Assistant，或点击顶部 Assistant。','选择模型并点击 Load / Download selected。','返回任意 Lens，点击 Explain with AI。','需要追问时回到 Assistant，Pinned context 会保留在当前运行会话里。'],
        lookFor:['LOCAL AI · READY / OPT-IN','Pinned context','Observed / Interpretation / Unknown / Next Step','当前加载模型'],
        caution:'AI 的回答不是 Sentinel evidence，也不是恶意软件判决。真正的事实仍然来自 Sentinel 的本机 evidence engine。'
      },
      {
        id:'ai-model-library',title:'Model Library 怎么选？',kicker:'Small / Medium / Specialist / Large',lens:'assistant',
        summary:'模型不会自动下载。你先选模型，再显式 Load / Download；多个模型可以缓存，但一次只进入一个模型到 GPU/统一内存。',
        paragraphs:['Small 适合 8GB Mac 和快速解释；Medium 适合更复杂的中英技术问题；Specialist 包含 Qwen Coder 和 Qwen Math；Large 的 7B–9B 模型需要明显更多 unified memory。','Model Library 显示的是 WebLLM runtime memory estimate，不等于网络下载文件大小。','模型文件使用本地 IndexedDB 持久缓存，Native App View 重启后可以复用已下载模型。'],
        steps:['点一个模型卡。','确认 Selected model。','点击 Load / Download selected。','第一次等待下载和 WebGPU 初始化进度。','不使用时点 Unload memory；缓存文件不会因此被删除。'],
        lookFor:['Selected','Loaded','WebLLM memory','Suggested Mac','GPU feature'],
        caution:'不要因为参数更大就默认更适合。对于 Sentinel evidence explanation，1.5B–3B 往往已经更轻、更快。'
      },
      {
        id:'ai-context',title:'Explain with AI 为什么会知道我正在看什么？',kicker:'Context-aware / Cross-Lens Selection',lens:'assistant',
        summary:'Sentinel 会把当前 Lens 和 Workbench Cross-Lens Selection 变成显式 Evidence Packet，而不是让模型猜你的屏幕。',
        paragraphs:['如果你在 Process Story、Object Story、Graph node 或 Case object 中选中了一个对象，Workbench 会保存 selected path/PID。Local AI 会把 selection 和对应 object/process evidence 一起加入 packet。','如果 Context Tray 正在打开，Local AI 还会加入一个有长度限制的 Context Tray 文本摘录。','活动 Workbench investigation 的 notes/hypothesis 可以作为 USER CONTEXT 加入，但提示词要求模型不能把用户笔记说成系统观察事实。'],
        steps:['在任意支持的对象上点击，使顶部出现 Selected。','点击 Local AI bar 的 Explain selection。','查看 Assistant 中 Pinned context。','继续追问关系、时间或 unknowns。'],
        lookFor:['Cross-Lens Selection','Selected path / PID','Pinned context label','USER CONTEXT 标签'],
        caution:'选中对象只是在告诉 AI“你在问谁”；它不会提高该对象的风险等级。'
      },
      {
        id:'ai-full-scan',title:'Full Scan AI Brief 怎么用？',kicker:'扫描完成后的本地分析',lens:'status',
        summary:'Full Scan 完成后可以显式生成 AI Brief，把 retained baseline、review queue、audit、changes、persistence、reference、behavior 和 visibility 合并解释。',
        paragraphs:['Full Scan 本身不会因为 AI 自动启动，AI Brief 也不会自动生成。只有用户点击 AI Full Scan Brief / Explain retained baseline 才会准备 packet。','Brief 的目标是把很多页面压缩成“最强 observed evidence、重要变化、可能的日常/模糊项、visibility limits、下一步”。'],
        steps:['显式完成一次 Full Scan，或确保已经有 retained baseline。','点击 AI Full Scan Brief。','如果模型未加载，先 Load / Download selected。','阅读 Brief 后用提供的下一步回到 Changes、Cases、Persistence、Network 或 Storage 验证。'],
        lookFor:['retained baseline freshness','review queue','bounded/unavailable stages','visibility limits','prioritized next step'],
        caution:'AI 不应该把 Full Scan 的 Risk/Attention/novelty 变成“病毒概率”。'
      },
      {
        id:'ai-guided',title:'Guided Investigation 是什么？',kicker:'把几十个页面变成一条调查路线',lens:'assistant',
        summary:'Guided Investigation 为常见目标提供确定性的 Lens 顺序，AI 只负责解释每一步，不负责偷偷执行下一步。',
        paragraphs:['目前内置 Unknown network activity、Strange startup item、Investigate an application、What changed、Storage suddenly increased、Mac feels slow 等路线。','每条路线明确列出下一 Lens。你点步骤后才导航；AI 不会自动扫描或修改系统。','当前 Guide step 会显示在每个 Lens 的 Local AI contextual bar。'],
        steps:['Assistant → Guided Investigation。','选择问题类型。','点击第一个 Step。','在该 Lens 查看真实证据。','点 Explain guide step。','证据读完后再点 Next step。'],
        lookFor:['ACTIVE GUIDE','Step x/y','当前 Lens','Explain current step','Stop guide'],
        caution:'Guide 是调查结构，不是诊断结论。你可以随时停止或跳到其它 Lens。'
      },
      {
        id:'ai-manual-rag',title:'Manual Copilot / Manual RAG 是什么？',kicker:'先从 Sentinel 自己的手册找答案',lens:'assistant',
        summary:'当问题与“怎么用 Sentinel”有关时，本地 AI 会先检索这份应用内 Manual 的相关章节，并把匹配摘要、步骤和 caution 加进 packet。',
        paragraphs:['这减少了模型凭通用训练知识猜 Sentinel 功能的机会。Manual excerpt 会明确标记为 PRODUCT GUIDANCE。','你可以在 Manual 页面直接点 Ask Manual，也可以在 Assistant 选择 Manual Copilot。'],
        steps:['提出例如“Full Scan 和 Easy Scan 有什么区别？”','Sentinel 在 Manual topics 中本地匹配相关章节。','模型读取相关 summary/steps/caution。','如果问题还涉及当前 Mac，回答必须把 Manual guidance 与 observed machine evidence 分开。'],
        lookFor:['manual_context','Sentinel User Manual','PRODUCT GUIDANCE','相关 caution'],
        caution:'Manual 能解释产品设计，但不能证明你电脑上的某个对象安全或危险。'
      },
      {
        id:'ai-terminal',title:'Terminal Copilot 可以做什么？',kicker:'解释命令，不执行命令',lens:'assistant',
        summary:'把命令粘贴到 Terminal Copilot，它会解释用途、参数、读写性质和可能的只读替代方式，但没有 shell 执行权限。',
        paragraphs:['Terminal Copilot 的 system prompt 明确禁止执行、模拟已执行或声称有输出。','你可以选择 Qwen Coder 1.5B 作为轻量技术模型。','任何真正改变文件/系统状态的操作仍必须回到 Safe Change 的 Preview → confirmation → recovery 流程。'],
        steps:['Assistant → Terminal Copilot。','可选 Select Qwen Coder。','粘贴命令。','点击 Explain command locally。','确认 AI 是否把命令分类为 read-only 或 mutating。','需要实际修改时不要从 AI 执行，进入 Safe Change。'],
        lookFor:['Purpose','flags / arguments','read-only vs mutating','expected output in general','safer read-only alternative'],
        caution:'Local AI 没有 unrestricted shell authority，也不能绕过 Safe Change。'
      },
      {
        id:'ai-global-search',title:'顶部 Search 如何直接 Ask Sentinel？',kicker:'Natural-language bridge',lens:'search',
        summary:'顶部搜索结果现在会加入 ASK LOCAL AI。明显的问题句按 Enter 也可以把当前 Lens + selection + Manual context 一起固定给 Assistant。',
        paragraphs:['原来的确定性 Natural-language Command Bar 仍优先处理明确的导航意图，例如 network、startup、storage。只有没有被确定性路由接管的问题句才进入 Local AI。','这样“打开 Network”仍是确定性导航，而“为什么这个进程有这个连接？”可以进入 AI explanation。'],
        steps:['按 ⌘K。','输入普通关键词时先看 evidence search results。','输入完整问题时点 ASK LOCAL AI，或对明显问题句按 Enter。','Assistant 会显示 Search question 的 pinned context。'],
        lookFor:['当前 evidence search results','ASK LOCAL AI','Pinned context','Manual matches'],
        caution:'AI 搜索不会扩大 Sentinel 的 visibility。搜不到/看不到的数据仍然必须保持 Unknown。'
      },
      {
        id:'ai-levels',title:'Beginner / Technical / Expert 有什么区别？',kicker:'改变解释深度，不改变事实',lens:'assistant',
        summary:'Explanation level 只改变语言和技术深度，不会改变 Evidence Packet、风险分数或安全边界。',
        paragraphs:['Beginner 会定义术语、强调普通用户应该看什么；Technical 会保留较多 macOS/evidence 细节；Expert 更短、更密集，强调 identity/time/relationship/visibility distinctions。'],
        steps:['Assistant → Explanation level。','选择 Beginner / Technical / Expert。','继续同一个问题即可。'],
        lookFor:['术语解释密度','技术字段细节','Unknowns 是否仍被保留'],
        caution:'切到 Expert 不会让模型获得更多系统权限，也不会让低置信 evidence 变成高置信。'
      },
      {
        id:'ai-boundaries',title:'本地 AI 的隐私、缓存和安全边界',kicker:'LOCAL 不等于“AI 可以做任何事”',lens:'visibility',
        summary:'推理发生在 WebGPU 本地模型中；第一次下载 runtime/model 需要网络。模型缓存保留在本机 WebKit IndexedDB。Sentinel evidence 不会被提交给云端聊天 API。',
        paragraphs:['Native App View 使用持久 WebKit storage 是为了让模型缓存跨重启复用。','WebLLM runtime/model 下载只允许 Sentinel CSP 中明确放行的模型来源。','AI 没有 Safe Change execute API、没有任意 shell、没有永久删除接口。'],
        steps:['在 Assistant 查看 Model cache / Authority。','在 Visibility 查看 Sentinel 自己能看到的证据边界。','不想占 GPU memory 时点击 Unload memory。','需要删除网站/模型缓存时使用系统/WebKit 数据管理，而不是把 Unload memory 当删除缓存。'],
        lookFor:['WebGPU','IndexedDB','LOCAL','Authority','Visibility'],
        caution:'第一次模型下载需要访问外部模型源；“本地推理”并不意味着模型文件从来不需要下载。'
      }
    ]
  };

  // manual.js exports the same GROUPS/allTopics array objects used by its renderer,
  // so extending those arrays here updates the existing long-form Manual without
  // creating a second documentation system.
  if (S.userManual && !S.userManual.groups.some(group => group.id === AI_MANUAL_GROUP.id)) {
    S.userManual.groups.push(AI_MANUAL_GROUP);
    for (const topic of AI_MANUAL_GROUP.topics) {
      S.userManual.topics.push({...topic, groupId:AI_MANUAL_GROUP.id, groupLabel:AI_MANUAL_GROUP.label});
    }
  }

  // Add Manual to the contextual navigation without creating a second action path.
  if (S.actionDock?.actions) {
    S.actionDock.actions.manual = [
      {label:'Status', lens:'status', primary:true},
      {label:'Assistant', lens:'assistant'},
      {label:'Easy Scan', lens:'snapshot'},
      {label:'Full Scan', scan:'full'},
      {label:'Visibility', lens:'visibility'},
    ];
    for (const lens of ['status','visibility','guide','assistant']) {
      const actions = S.actionDock.actions[lens];
      if (Array.isArray(actions) && !actions.some(x => x.lens === 'manual')) actions.push({label:'Manual', lens:'manual'});
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#manualButton');
    if (!button) return;
    event.preventDefault();
    if (typeof S.navigate === 'function') S.navigate('manual');
  });
})();
