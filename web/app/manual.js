// SPDX-License-Identifier: MPL-2.0
// Sentinel 2.7 User Manual — long-form, plain-language, in-app product guide.
(() => {
  'use strict';
  const S = window.SentinelApp;
  if (!S) throw new Error('Sentinel application core did not load before User Manual.');
  const {$, esc, question, registerLens, activity} = S;

  const MANUAL_MARKER = 'Sentinel 2.7 Comprehensive User Manual';

  const GROUPS = [
    {
      id:'start', label:'从这里开始 / START HERE',
      topics:[
        {
          id:'what-is-sentinel', title:'Sentinel 到底是什么？', kicker:'先理解产品，再点按钮',
          summary:'Sentinel 是一个本地优先的 macOS 系统证据工具。它的核心工作不是替你宣布“安全/危险”，而是把系统状态、变化、关系、历史和可恢复操作整理成可以检查的证据。',
          paragraphs:[
            '最简单的理解方式：Sentinel 像一张“这台 Mac 现在发生了什么”的可检查地图。它会读取本机可见的进程、启动项、网络关系、存储、系统快照、变化记录等，然后把它们整理成不同页面。',
            'Sentinel 刻意把“观察到的事实”和“我们对事实的解释”分开。看到一个陌生进程、一个公网连接、一个自动启动项目，通常都不足以单独证明有问题。你应该继续看它来自哪里、什么时候出现、和什么对象有关、与以前相比有没有变化。',
            'Sentinel 的大部分读取和分析发生在本机 localhost 引擎中。界面中的 LOCAL 标记就是提醒你：当前工作流设计目标是本地证据，不依赖云端替你下结论。'
          ],
          steps:['第一次使用时先看 Status，而不是立刻运行所有功能。','如果只想快速知道“有没有明显值得看一眼的东西”，运行 Easy Scan。','如果你准备建立后续对比基线，再主动运行 Full Scan。','看到具体问题后，用 Cases / Search / Relations / Object 继续调查。','只有证据已经足够支持一个小而可恢复的动作时，才进入 Safe Change。'],
          lookFor:['事实（Observed）','关系（Derived relationship）','未知项（Unknown）','证据的新旧程度（Freshness）','可见性边界（Visibility）'],
          caution:'Sentinel 的 Attention、Risk、Confidence、Drift 都不是“病毒概率”。它们是排序、关系强度或差异提示。'
        },
        {
          id:'screen-regions', title:'应用界面的 7 个区域分别是什么？', kicker:'认识屏幕',
          summary:'主界面从上到下被分成几个固定区域。理解这些区域后，你基本不会迷路。',
          paragraphs:[
            '① 顶部 Command Bar：包含 Sentinel 标志、全局搜索、LOCAL 状态、Easy Scan、Full Scan、Manual、Refresh、Export。这里是全局动作，不属于某一个单独页面。',
            '② Mission Ribbon：Orient、Investigate、Compare、System、Act、Limits。它们不是“扫描等级”，而是你当前想解决的问题类型。',
            '③ Lens Rail：每个 Mission 下的具体页面。例如 Investigate 下面有 Cases、Search、Relations、Audit、Object。',
            '④ Evidence Stage：屏幕中央最大的滚动区域。绝大多数结果、图、表、时间线、进度和手册正文都在这里上下滚动。',
            '⑤ Quick Actions：每个页面问题标题下面的快捷操作条。它会根据当前页面换成最常用的下一步。',
            '⑥ Context Tray：当你点某个对象查看上下文时出现的侧边详情区。这里通常告诉你“能建立什么”和“不要推断什么”。',
            '⑦ Activity Bar：底部状态条。长操作时看这里的阶段、百分比和当前正在处理的内容。'
          ],
          steps:['先看 Mission，确定自己是在“找重点”“调查原因”“看变化”“看系统现状”还是“执行可恢复动作”。','再看 Lens，进入具体功能。','结果很多时优先看页面顶部问题句和 Quick Actions。','长任务期间不要只盯着页面中间，底部 Activity Bar 会告诉你任务是否仍在推进。'],
          lookFor:['当前 Mission 是否正确','当前 Lens 是否正确','页面顶部问题句','Quick Actions','底部进度/错误信息'],
          caution:'页面很多不代表每次都要全部点一遍。Sentinel 的设计是沿着一个问题逐步缩小，而不是“所有页面全扫一遍”。'
        },
        {
          id:'first-five-minutes', title:'第一次打开：5 分钟入门路线', kicker:'最推荐的新手流程',
          summary:'如果你完全不知道该点什么，按这个顺序走一遍即可。',
          lens:'status',
          paragraphs:[
            '第一次打开时，Sentinel 应先加载轻量的 retained metadata，而不是自动运行 Full Scan。你应该能先看到 Status，再决定是否主动扫描。',
            'Easy Scan 适合第一次认识这台 Mac：它更快、只读，并且不会重写 Behavior、Trust、Persistence 或你的用户文件。Full Scan 则更像“建立未来可以比较的完整基础档案”。'
          ],
          steps:['打开 Status，先看当前系统概览和 retained baseline freshness。','点击 Easy Scan，阅读 review queue。','如果某一项吸引注意，先点 Cases / Relations / Object，不要急着 Safe Change。','准备以后比较“之前和之后”时，再从 Status 主动点击 Full Scan。','Full Scan 完成后，再到 Changes、Behavior、Reference、Network、Storage 查看历史与差异。'],
          lookFor:['是否有明显 review item','是否存在 limited/unavailable visibility','是否已有 System/Network/Storage 历史','是否需要建立新的 baseline'],
          caution:'第一次打开时没有 Full Scan 历史是正常的。不要因为“missing baseline”就把它理解成系统有问题。'
        },
        {
          id:'easy-vs-full', title:'Easy Scan 和 Full Scan 到底有什么区别？', kicker:'最容易混淆的两个按钮',
          summary:'Easy Scan = 快速只读检查；Full Scan = 由你主动触发的广泛 retained evidence 基线构建。',
          lens:'status',
          paragraphs:[
            'Easy Scan 适合“我现在只想快速看一眼”。它读取当前证据并形成一个 review queue，不应该改变用户文件，也不会自动把所有历史模型重做一遍。',
            'Full Scan 适合“我要建立或刷新后续调查所依赖的完整基础”。它会依次覆盖 visibility、system/process/startup/network、security audit、behavior/persistence capture、graph/timeline、cases、system checkpoint、network history、Home 存储遍历/哈希、storage history、recovery/readiness 等真实证据路径。',
            'Full Scan 完成后，很多页面会复用已经保留的 System / Network / Storage / Behavior / Case 证据。因此它不是每次打开都要跑。'
          ],
          steps:['快速检查：点 Easy Scan。','需要建立基线：点 Full Scan。','Full Scan 运行时看阶段列表和底部 Activity Bar。','如果存储遍历太久，可以取消；取消不会等于“系统失败”。','系统发生较大变化、你需要新的前后对比、或者 continuity 明确提示重扫时，再运行下一次 Full Scan。'],
          lookFor:['Full Scan 是否明确由你点击启动','阶段是 pending / running / done / limited / cancelled','retained baseline 的时间','扫描完成后的 follow-up actions'],
          caution:'Full Scan 永远不应该因为“打开应用”而自动开始。如果你没有点击 Full Scan，它不应该自行进入完整扫描。'
        }
      ]
    },
    {
      id:'global', label:'全局操作 / GLOBAL CONTROLS',
      topics:[
        {
          id:'command-search', title:'顶部搜索框与 ⌘K 怎么用？', kicker:'全局证据入口',
          summary:'顶部搜索针对 Sentinel 已经知道的当前证据做快速检索；Investigate → Search 则提供更明确的深度/范围搜索。',
          lens:'search',
          paragraphs:['按 ⌘K 可以直接把光标放进顶部搜索框。输入至少两个字符后，结果面板会显示当前有匹配的对象、路径或 case。','全局搜索适合“我大概知道名字”；Search Lens 更适合“我要控制 scope、limit，并对路径/文件做 bounded deep search”。'],
          steps:['按 ⌘K。','输入进程名、路径片段、endpoint 或你记得的关键词。','点击命中结果。','如果命中的是文件/路径，可继续打开 Object Story；如果是 case，进入 Cases。','需要更深的磁盘路径搜索时改用 Investigate → Search。'],
          lookFor:['结果类型 kind','title/name','subtitle / why matched','是否是当前 retained evidence 还是深度搜索结果'],
          caution:'搜索不到只表示“在当前可见/当前索引/当前搜索预算里没有匹配”，不等于这个对象绝对不存在。'
        },
        {
          id:'refresh', title:'Refresh 是什么？会不会重新 Full Scan？', kicker:'刷新当前页面',
          summary:'Refresh 重新渲染当前 Lens 并重新读取这个页面需要的当前数据；它不是 Full Scan。',
          paragraphs:['Refresh 的语义是“把我现在看的这一页刷新一下”。不同 Lens 会重新调用它自己的读取接口。','Refresh 不应该等价于建立完整 retained baseline，也不应该偷偷执行 Safe Change。'],
          steps:['当前页面数据看起来旧时点击 Refresh。','如果只是 Status 刷新，不要期待它自动生成全新的 Full Scan baseline。','需要新的历史点时，使用对应的 Capture History / Capture Checkpoint 等显式按钮。'],
          lookFor:['页面更新时间','底部 Activity 状态','是否出现新的历史 snapshot（只有显式 capture 才应该出现）'],
          caution:'“刷新页面”和“创建历史记录”是两件不同的事。'
        },
        {
          id:'export', title:'Export 导出的是什么？', kicker:'保存本地报告',
          summary:'顶部 Export 导出 Sentinel 的本地报告 JSON，用于保存、审阅或进一步分析。',
          paragraphs:['Export 是全局报告导出，不是删除、上传或修改系统。','Cases 中还可能有更专门的 Evidence Bundle / case export，它们针对调查故事本身。'],
          steps:['点击顶部 Export。','选择保存位置（由 macOS/浏览器壳处理）。','保留原文件用于以后对照。','如果你只想导出某个 Case，优先使用 Cases 中的专门导出。'],
          lookFor:['文件是否成功生成','导出时底部 Activity Bar','JSON 中的 evidence/metadata'],
          caution:'导出的报告可能包含本机路径、进程名和系统证据。分享之前先当作敏感的本机诊断资料处理。'
        },
        {
          id:'quick-actions', title:'每页的 Quick Actions 是什么？', kicker:'推荐下一步，不是自动流程',
          summary:'Quick Actions 是根据当前 Lens 放在最前面的常用按钮。它们只是快捷入口，不会自动连续执行所有下一步。',
          paragraphs:['例如 Audit 里会出现 Run Audit、Continue Investigation、Cases、Object Verify；Network 里会出现 Refresh Current、Capture History、Relations、Processes。','这些按钮复用主功能的真实 handler，而不是建立第二套隐藏操作路径。'],
          steps:['先阅读当前 Lens 的问题句。','再看 Quick Actions 是否有与你目标对应的下一步。','不确定时宁愿先进入 Relations / Object / Cases，看更多证据。','涉及修改的步骤仍然必须进入 Safe Change 的 preview/confirm/recovery 流程。'],
          lookFor:['Primary 按钮','是否是 Refresh / Capture / Compare / Open lens','按钮是否会创建 retained history'],
          caution:'“推荐下一步”不代表 Sentinel 已经判定你应该执行那个动作。'
        },
        {
          id:'context-tray', title:'右侧 Context Tray 怎么看？', kicker:'选中对象的证据抽屉',
          summary:'Context Tray 用来查看选中对象的更细证据，并明确区分“能建立什么”和“不能推断什么”。',
          paragraphs:['当你点击某些图节点、对象故事或证据详情时，右侧可能弹出 Context。','里面的 Can establish 是当前数据支持的事实；Do not infer 则是防止你从有限证据跳到过度结论。'],
          steps:['点击一个可解释对象。','先读 Can establish。','再读 Do not infer。','最后查看原始 Evidence JSON。','按 Esc 或右上角 × 关闭。'],
          lookFor:['对象精确身份','来源','时间','字段是否缺失','未知项'],
          caution:'Raw evidence 很详细，但字段多不等于证据强；要看来源和上下文。'
        },
        {
          id:'activity-bar', title:'底部 Activity Bar 与进度条怎么读？', kicker:'判断是否真的在工作',
          summary:'长操作时，底部状态条是判断“正在处理 / 已完成 / 报错”的主要位置。',
          paragraphs:['Full Scan、Storage traversal、系统快照、审计和某些比较操作会更新状态、百分比和当前阶段。','如果页面没有立刻出现最终结果，但 Activity 仍在推进，说明任务可能仍在执行。'],
          steps:['启动长操作后先看 label。','看 percent 是否变化。','看 detail 当前处于哪个阶段。','出现 Error 时先记录错误信息，再决定是否重试。'],
          lookFor:['Ready','Full Scan','Working locally…','Error','当前 stage label'],
          caution:'不要仅因为某一阶段耗时较长就重复点击同一个长任务。'
        }
      ]
    },
    {
      id:'orient', label:'ORIENT：先看重点',
      topics:[
        {
          id:'status', title:'Status：我现在首先应该看什么？', kicker:'ORIENT', lens:'status',
          summary:'Status 是默认起点，用来回答“这台 Mac 现在有哪些值得注意的状态，以及 retained baseline 是否准备好”。',
          paragraphs:['Status 会组合当前状态、readiness、scan center、retained freshness 和 Capability Atlas。','它应该是轻量入口：打开应用时先建立最小可用当前状态，不应该自动启动 Full Scan。'],
          steps:['看顶部 live instruments/readiness。','看 Easy Scan / Full Scan 卡片。','看 System / Network / Storage retained history 的时间。','需要快速检查就 Easy Scan；需要新的完整基线才 Full Scan。','下方 Capability Atlas 可以按任务类别打开其他功能。'],
          lookFor:['baseline ready / missing','fresh / recent / older','visibility sources','当前 case/timeline 数量（加载分析后）'],
          caution:'“older”表示证据旧，不代表证据危险。'
        },
        {
          id:'snapshot', title:'Snapshot / Easy Scan：快速检查结果怎么看？', kicker:'OBSERVE', lens:'snapshot',
          summary:'Snapshot 用最小的只读检查形成 review queue，帮助你决定下一步，而不是直接给出终局 verdict。',
          paragraphs:['把它理解成“今天先看哪几件事”。它会把当前状态压缩成可复查项目。','一个项目被排到前面通常意味着值得优先阅读，不意味着它一定恶意。'],
          steps:['运行 Easy Scan。','按优先级阅读 review queue。','对陌生项目打开 Cases / Relations / Object。','如果你要保存一个监测时点，使用 Monitoring Snapshot，而不是把 Easy Scan 当历史捕获。'],
          lookFor:['review reason','来源','对象路径/PID','是否能继续 Explain'],
          caution:'Easy Scan 主要是 orient；不要因为“review”两个字就直接删除任何东西。'
        },
        {
          id:'capability-atlas', title:'Capability Atlas：下方大量功能卡片是什么？', kicker:'功能地图', lens:'status',
          summary:'Capability Atlas 把 Sentinel 的功能按 Orient / Investigate / Compare / System / Act / Limits 分组。',
          paragraphs:['每个 tile 都是功能入口，并在下面写一句它主要解决什么问题。','它适合你“知道想干什么但不知道页面名字”的情况。例如想看自动启动，就找 SYSTEM → Auto-start。'],
          steps:['先找与你问题匹配的大组。','阅读 tile 的一句说明。','点击 tile 进入对应 Lens。','如果不确定，优先从 Orient / Investigate 开始。'],
          lookFor:['组标题','问题句','功能名称','OPEN LENS'],
          caution:'Capability Atlas 是导航，不代表所有功能都必须依次运行。'
        }
      ]
    },
    {
      id:'investigate', label:'INVESTIGATE：解释原因',
      topics:[
        {
          id:'cases', title:'Cases：为什么要把很多事件合成一个“故事”？', kicker:'CORRELATE', lens:'cases',
          summary:'Cases 把时间上和关系上可能属于同一件事的证据压缩成稳定 Story 与 Episode，减少你在几十条孤立记录之间来回跳。',
          paragraphs:['Stable Story ID 表示“同一个长期故事”；Episode ID 表示这个故事的一次具体出现。','页面会显示 occurrences、first/last seen、confidence、sources、active/historical，以及为什么这些证据被分组。'],
          steps:['打开一个 Case。','先读 Observed Facts。','再读 Derived Relationships。','把 Interpretation 当解释而不是事实。','看 Unknowns，确认还缺什么。','查看 Episode Evolution 和 ordered evidence timeline。','需要进一步对象级调查时使用 Object Story 或 Workbench。'],
          lookFor:['Story ID','Episode ID','occurrences','confidence','Observed Facts','Unknowns','evidence timeline'],
          caution:'Case 是证据组织方式，不是自动判罪。相关不等于因果。'
        },
        {
          id:'search-lens', title:'Search：普通搜索和 Deep Search 怎么选？', kicker:'QUERY', lens:'search',
          summary:'Search 先查 Sentinel 已知证据；Deep Search 在你明确 scope 和 limit 后，再进行受边界控制的路径/文件搜索。',
          paragraphs:['先用轻量已知证据搜索，因为快而且上下文更丰富。','只有当你知道需要查找某个文件/路径而当前证据里没有时，再扩大到 bounded deep search。'],
          steps:['输入关键词。','选择合适 scope。','设置合理 limit。','执行后查看 visited entries 和 results。','文件结果点击 Explain，继续 Object Story。'],
          lookFor:['kind','score','name','path','visited count','bounded budget'],
          caution:'Deep Search 不是“整台机器无限制搜索”。边界存在是为了性能和解释性。'
        },
        {
          id:'relations', title:'Relations：Graph、Timeline、Matrix 怎么看？', kicker:'CONNECT', lens:'relations',
          summary:'Relations 用“对象之间如何连接”和“这些连接何时出现”来解释单个对象无法解释的问题。',
          paragraphs:['Graph 视图把 process、startup、file、network、incident 等对象放在同一拓扑里。','Timeline 把关系放回时间顺序。Density / Heatmap 用来发现某段时间证据特别集中。Matrix 更适合看不同类别之间是否存在大量交叉关系。'],
          steps:['先看 Graph 的节点类型和边。','点节点打开 Object Story。','再看 Timeline 确认先后顺序。','使用过滤器缩小时间/类型范围。','证据复杂时用 Matrix/Heatmap 找密集区域。'],
          lookFor:['node type','edge meaning','first/last seen','review priority','source/provenance','time density'],
          caution:'Graph 中存在一条边只表示观测到关系，不代表其中一个对象“导致”另一个对象。'
        },
        {
          id:'audit', title:'Audit：Security Audit 的分数和排序怎么看？', kicker:'ASSESS', lens:'audit',
          summary:'Audit 用可解释规则把“更值得先复查”的证据放前面。它不是杀毒软件式的百分比结论。',
          paragraphs:['Audit 的重要价值是 why：为什么一个项目被提到前面。','你应该把它当成 investigation queue 的入口，而不是“高分 = 恶意”的结论。'],
          steps:['运行或刷新 Audit。','打开高优先级 finding 的理由。','使用 Cases 看是否和其他证据成组。','使用 Object Verify 确认精确路径/身份。','需要进入更深分支调查时使用 Continue Investigation。'],
          lookFor:['reason code','priority/risk context','source','path/PID','可以继续验证的证据'],
          caution:'Attention/Risk 不是 malware probability，也不是对人的意图判断。'
        },
        {
          id:'continue-investigation', title:'Continue Investigation：它到底做什么？', kicker:'从 Audit 进入深度调查', action:'continue',
          summary:'Continue Investigation 会进入独立 Investigation workspace，继续使用真实的调查 session / branch 流程，而不是只打开一张说明页面。',
          paragraphs:['主界面 Audit 的 Quick Actions 中可以看到 Continue Investigation。进入后，workspace 会保留 session token，并通过调查接口继续分支、历史、笔记等流程。','Continue from here 的含义是从当前调查节点派生下一步，而不是重新开始一个完全无关的扫描。'],
          steps:['在 Audit 发现值得继续的证据。','点击 Continue Investigation。','在 workspace 中阅读当前 session。','从具体证据点使用 Continue / Continue from here。','记录假设、笔记和后续节点。'],
          lookFor:['session','branch history','当前对象','Continue from here','调查上下文是否保持'],
          caution:'进入 Investigation workspace 不等于执行系统修改；它仍是证据调查流程。'
        },
        {
          id:'object', title:'Object：怎样把一个路径/进程真正“查清楚”？', kicker:'VERIFY', lens:'object',
          summary:'Object Story 围绕一个精确对象，把身份、关系、运行信息、历史、事件和未知项集中到一页。',
          paragraphs:['路径对象通常优先使用 Object Story v2；进程 PID 也可以从其他页面进入 story。','一个好的 Object Story 应包含 observed identity、relationships、process/persistence/background context、incidents、first/last seen、unknowns 和 next related targets。'],
          steps:['输入精确路径，或从 Search/Graph/Processes 点击 Explain。','先确认 identity。','再看 relations。','看 first/last seen 和 incidents。','查看 Unknowns。','点击 related object 继续横向调查。'],
          lookFor:['exact path','identity facts','PID/process context','relations','first seen','last seen','unknowns'],
          caution:'同名文件不是同一个对象。路径、身份和哈希等精确信息比名字本身更重要。'
        },
        {
          id:'workbench', title:'Investigation Workbench：什么时候需要它？', kicker:'跨页面调查工具箱', action:'workbench',
          summary:'Workbench 是跨 Lens 的调查层，用来保存选择、查询、watch、笔记、假设、书签和演化信息，适合已经不是“一页就能解释”的问题。',
          paragraphs:['它把 Cross-Lens Selection、Saved Queries、Watch Rules、Object/Process evolution、Network/Launch evolution、checkpoints、storage trend、visibility/completeness、Evidence Bundle、local evidence assistant、keyboard workflow 等功能串起来。','Workbench 中的本地笔记、名字、pin、saved query 和 watch definition 是你的工作元数据，不应该被误读成系统观测事实。'],
          steps:['当调查需要跨 Cases / Relations / Network / Changes 多个页面时打开 Workbench。','固定关键对象。','保存重复查询。','添加假设和笔记。','需要时建立 bounded watch。','最后导出 Evidence Bundle 或回到具体 Lens 验证。'],
          lookFor:['selected object','saved query','watch rule','notes/hypotheses','evolution','completeness'],
          caution:'Workbench 是组织证据的工具；用户自己写的 note/hypothesis 不是 Sentinel 观测到的事实。'
        }
      ]
    },
    {
      id:'compare', label:'COMPARE：看“前后差异”',
      topics:[
        {
          id:'changes', title:'Changes：Change Monitor 与 System Checkpoint 有什么区别？', kicker:'WATCH', lens:'changes',
          summary:'Change Monitor 看一个你明确选择的时间/范围内发生了什么；System Checkpoint 保存两个系统状态，让你做 before/after 对比。',
          paragraphs:['Change Monitor 是 bounded watch，不是假装全天候监控整台 Mac。','System Checkpoint 则适合“操作前一份、操作后一份”这样的显式比较。'],
          steps:['需要短时观察时启动 Change Watch。','选择 preset/interval。','完成后 stop/review。','需要系统级前后对比时 Capture Checkpoint。','在 FROM / TO 中选两个快照并查看分类 diff。'],
          lookFor:['added','removed','process/startup/network/mount/filesystem/security 分类','watch scope','checkpoint time'],
          caution:'某个项目“removed”表示在后一个观测里没有看到，不自动等于它被恶意删除。'
        },
        {
          id:'behavior', title:'Behavior：行为历史是怎么比较的？', kicker:'COMPARE', lens:'behavior',
          summary:'Behavior 记录相邻观测之间的行为差异，回答“这次和上一次相比，系统行为有什么不同”。',
          paragraphs:['它关注变化而不是静态身份。适合在安装软件、改变配置、复现问题前后进行比较。','行为差异本身是 evidence pressure，不是 danger。'],
          steps:['先确保有一个 previous observation。','在你关心的时间点 Capture & Compare。','阅读新增/减少/改变的行为。','需要精确对象解释时跳到 Object / Relations。'],
          lookFor:['previous vs current','new/ended behavior','时间','关联对象'],
          caution:'第一次没有 previous baseline 时，无法进行有意义的“变化”比较，这是正常情况。'
        },
        {
          id:'reference', title:'Reference：Trusted Profile 是“安全白名单”吗？', kicker:'REFERENCE', lens:'reference',
          summary:'不是。Reference 是你明确批准的某个系统状态，用于以后测量 drift；它不是永久安全证书。',
          paragraphs:['你可以在一个你认为适合作为参照的时刻 Capture Reference，然后未来 Compare Now。','Drift 表示与这个参照不同。不同可能来自正常更新、安装软件、配置变化，也可能值得进一步调查。'],
          steps:['只在你理解当前状态时建立/刷新 Reference。','未来需要检查差异时 Compare Now。','阅读 drift history。','对具体 drift 用 Object / Changes / Cases 验证。'],
          lookFor:['reference capture time','drift items','history','具体变化来源'],
          caution:'“在 Trusted Profile 里”不代表永远可信；“不在 Profile 里”也不代表恶意。'
        }
      ]
    },
    {
      id:'system', label:'SYSTEM：这台 Mac 上有什么',
      topics:[
        {
          id:'machine', title:'Machine：硬件、系统版本和运行环境怎么看？', kicker:'CONTEXT', lens:'machine',
          summary:'Machine 提供解释其他证据所需的环境背景，例如硬件架构、OS、运行时和容量。',
          paragraphs:['很多“异常”其实是兼容性或环境差异。Machine 页面帮助你先知道自己正在分析哪一台机器、什么架构和系统条件。'],
          steps:['确认 macOS / architecture。','检查内存、磁盘等基础上下文。','遇到兼容性问题时先回到 Machine 确认环境。'],
          lookFor:['OS version','architecture','memory','disk/runtime context'],
          caution:'Machine 是上下文，不是性能基准软件。'
        },
        {
          id:'processes', title:'Processes：正在运行的进程应该怎么看？', kicker:'LIVE', lens:'processes',
          summary:'Processes 展示当前运行对象，并把 PID 和 executable identity、网络、启动关系等连接起来。',
          paragraphs:['不要只看进程名。真正重要的是 executable path、PID、相关启动声明、网络活动和历史。','PID 会被系统复用，所以跨时间比较时不能只靠数字 PID 判断“是不是同一个东西”。'],
          steps:['按名称找到进程。','确认 executable/path。','点击 Explain/Object Story。','需要网络上下文时跳 Network。','需要自动启动来源时跳 Auto-start。'],
          lookFor:['PID','process name','executable','path','relations'],
          caution:'PID 是当前运行实例标识，不是永久身份。'
        },
        {
          id:'startup', title:'Auto-start：LaunchAgent / LaunchDaemon / RunAtLoad 怎么看？', kicker:'DECLARE', lens:'startup',
          summary:'Auto-start 展示系统声明为自动启动的项目，并把 plist、target executable 和当前 running PID 联系起来。',
          paragraphs:['macOS 合法软件大量使用 LaunchAgent/LaunchDaemon，所以“自动启动”本身很普通。','重点是 scope、plist 路径、executable、RunAtLoad、KeepAlive、target 是否存在，以及有没有当前运行实例。'],
          steps:['先看 user agent / system agent / daemon 的 scope。','看 label 和 plist path。','打开 detail。','确认 executable target 是否存在。','看 RunAtLoad / KeepAlive。','如果有 PID，转到 Processes/Object 继续。'],
          lookFor:['scope','plist','label','RunAtLoad','KeepAlive','running PID','target exists'],
          caution:'Persistence ≠ malicious persistence。自动启动是操作系统正常能力。'
        },
        {
          id:'persistence', title:'Persistence：为什么要比较启动配置变化？', kicker:'COMPARE', lens:'persistence',
          summary:'Persistence 不是简单列出当前启动项，而是比较 bounded captures 之间的启动配置变化。',
          paragraphs:['它适合回答“这个启动声明是什么时候出现/消失/改变的”。','这不是 continuous surveillance；如果两个 capture 之间发生过短暂变化但后来恢复，可能不会被两个端点完整反映。'],
          steps:['建立第一个 persistence/monitoring baseline。','系统变化后再捕获。','比较 added/removed/changed declarations。','回 Auto-start 查看当前真实配置。'],
          lookFor:['capture time','added/removed','label/path','当前状态是否仍存在'],
          caution:'只比较两个观测点有天然盲区；不要把“没看到变化”说成“绝对没有发生过变化”。'
        },
        {
          id:'background', title:'Background：和 Auto-start 有什么不同？', kicker:'REGISTER', lens:'background',
          summary:'Background 关注现代 macOS 的后台注册信息，用来补充经典 LaunchAgent / LaunchDaemon 视角。',
          paragraphs:['一些后台能力不会只通过传统 launch plist 来理解。Background 提供另一类 registration evidence。'],
          steps:['查看背景注册项。','记录 owning app / identifier。','需要实时实例时跳 Processes。','需要传统启动配置时跳 Auto-start。'],
          lookFor:['registration identity','owner/app','current process relation'],
          caution:'后台运行是许多正常应用的常见行为。'
        },
        {
          id:'network', title:'Network：公网连接、监听端口、历史连接怎么看？', kicker:'LIVE', lens:'network',
          summary:'Network 把当前 TCP 关系按进程和 endpoint 组织，并支持显式 Capture History 与历史 diff。',
          paragraphs:['页面会区分 established / listening，并把 endpoint 分类。公网 endpoint 很常见，不能单独当成异常。','Network History 只有你显式 Capture 才会创建历史 snapshot；普通 Refresh Current 不应该悄悄生成一个新的历史点。'],
          steps:['先看当前 TCP summary。','按 Process → Network 分组检查。','对陌生 PID 打开 Object Story。','要建立时间对比时点击 Capture History。','在 FROM/TO 选择两个历史点看 added / ended relationships。'],
          lookFor:['owning process','established/listening','endpoint class','history time','added/ended relation'],
          caution:'PID reuse 会让跨时间网络归属产生歧义，所以长期判断要结合 executable identity。'
        },
        {
          id:'storage', title:'Storage：磁盘扫描、重复文件、老文件和趋势怎么看？', kicker:'MEASURE', lens:'storage',
          summary:'Storage 用遍历、测量、可选哈希和 retained history 帮你解释空间压力，而不是直接帮你删除文件。',
          paragraphs:['Exact SHA duplicate groups 表示内容哈希相同；filename families 只是名字相似的启发式分组。这两个概念必须分开。','Storage History 可以显示可见字节趋势；Aging 把文件按年龄桶分组，并列出较老的测量对象。'],
          steps:['选择合理的扫描 root/scope。','开始 storage scan。','看 files/folders visited 与 hashing progress。','查看大对象、age buckets。','分别看 exact duplicates 和 filename heuristics。','需要趋势时 capture storage history。','空间处理前先进入 Reclaim Review。'],
          lookFor:['visible bytes','files visited','dirs visited','hash progress','exact duplicate','filename heuristic','aging bucket','history trend'],
          caution:'“老”“大”“重复名字”都不等于“可以删除”。先验证用途。'
        }
      ]
    },
    {
      id:'act', label:'ACT：执行可恢复动作',
      topics:[
        {
          id:'reclaim', title:'Reclaim：它会自动清理磁盘吗？', kicker:'REVIEW', lens:'reclaim',
          summary:'不会。Reclaim 只给出 cleanup preview / review candidates，帮助你决定哪些对象值得进一步检查。',
          paragraphs:['候选可能因为大、旧、缓存、重复等原因出现，但这些理由都不自动说明它应该被删。','真正的文件改变必须进入独立 Safe Change 流程。'],
          steps:['查看候选和 reason。','检查精确 path 和 size。','对不熟悉的对象先 Object Verify。','确认你真的要做可恢复操作时进入 Safe Change。'],
          lookFor:['candidate reason','path','size','是否可以解释用途'],
          caution:'Cleanup Preview 不永久删除文件。不要把候选列表当“垃圾文件真值表”。'
        },
        {
          id:'safe-change', title:'Safe Change：Preview → Phrase → Code → Acknowledge 是什么？', kicker:'RESOLVE', lens:'change',
          summary:'Safe Change 把系统修改与观察严格分开。任何可恢复修改都要先 preview，再显式确认，再由服务器重新验证后执行。',
          paragraphs:['Preview 会显示 action、object、source、destination、size、risk、reversible、dependencies、review signals、consequences。','只有你输入 exact confirmation phrase、one-time code，并选择“我已经审阅后果”，才能进入 execute。执行前服务器还会重新验证 target scope/state。'],
          steps:['选择 Rename / Vault / Reveal。','输入 exact file path。','点击 Preview impact。','认真读 Dependencies / Consequences。','如果只是 Reveal，系统只请求 Finder 显示对象。','Rename/Vault 时输入 exact phrase 和 one-time code。','明确 acknowledge 后再 Execute reversible change。','执行后看 Recovery journal。'],
          lookFor:['Reversible = Yes/No','Dependencies','Consequences','confirm phrase','one-time code','recovery metadata'],
          caution:'不要跳过 preview。手册也不会提供绕过确认的方法；这些门槛就是保护系统和用户文件的。'
        },
        {
          id:'recovery', title:'Recovery Center：改完以后怎么恢复？', kicker:'恢复准备', lens:'change',
          summary:'Recovery Center 汇总 Vault、journal 和恢复 readiness，确保“可恢复”不仅是一句按钮文案。',
          paragraphs:['Full Scan 和 Safe Change 页面都会读取 recovery/readiness 信息。','执行可恢复动作后，应该留下可追踪的 journal/recovery metadata。'],
          steps:['执行动作前先确认 recovery readiness。','动作后检查 journal。','需要恢复时按照 Recovery Center 给出的记录定位对应操作。','恢复后再用 Changes/Object 验证结果。'],
          lookFor:['recovery readiness','journal entry','source/destination','action status'],
          caution:'任何“可恢复”承诺都应该由实际 recovery metadata 支撑；如果 readiness 显示受限，就先不要把它当成完全可逆。'
        }
      ]
    },
    {
      id:'limits', label:'LIMITS：知道边界',
      topics:[
        {
          id:'visibility', title:'Visibility：为什么“看不到”不能等于“不存在”？', kicker:'BOUND', lens:'visibility',
          summary:'Visibility 告诉你哪些证据源 available / limited / unavailable。缺权限或工具不可用会降低结论强度。',
          paragraphs:['如果 Sentinel 对某类系统信息没有完整可见性，它应该明确标记 limited/unavailable，而不是编造一个“没有发现”。','这也是为什么所有安全结论都要和 coverage 一起读。'],
          steps:['遇到“没有发现”类结果时先看 Visibility。','查看 Coverage 区域。','查看 Evidence Sources 的 available 状态。','如果某来源 limited，降低对“absence”的信心。'],
          lookFor:['available','limited','unavailable','purpose','advanced sensor status'],
          caution:'Missing visibility lowers confidence; it never proves absence。'
        },
        {
          id:'model', title:'Model：Observe → Connect → Compare → Verify / Change', kicker:'MODEL', lens:'guide',
          summary:'Model 页是 Sentinel 最重要的思维流程：先观察，再连接，再比较，再验证；修改永远放最后。',
          paragraphs:['这个顺序能避免最常见的误判：看到一个陌生名字就直接把它当问题。','每一步都应该让下一步的问题更具体。'],
          steps:['Observe：Status / Easy Scan。','Connect：Cases / Relations。','Compare：Changes / Behavior / Reference。','Verify：Object / exact identity。','Change：只有证据足够时使用 Safe Change。'],
          lookFor:['事实是否足够','是否有关系上下文','是否有时间对比','是否确认 exact object'],
          caution:'如果你还不能清楚说出“我要改哪个精确对象、为什么、后果是什么”，就还没到 Change。'
        },
        {
          id:'scores', title:'Attention / Risk / Confidence / Drift 四种词分别是什么意思？', kicker:'避免误读',
          summary:'这些词服务于排序、解释和比较，不是统一的危险百分比。',
          paragraphs:['Attention：下一步先看哪里。Risk：为什么某对象被提高复查优先级。Confidence：多个观测被认为属于同一关系/故事的强度。Drift：当前状态与批准 reference 的差异。','它们解决不同问题，不能混成“75 分 = 75% 恶意”。'],
          steps:['看到分数先看标签类型。','寻找 why/reason。','回到 evidence source。','再用关系和时间验证。'],
          lookFor:['score name','reason','source','confidence context','reference context'],
          caution:'不要把任何一个评分当作对恶意、意图或安全性的直接概率。'
        },
        {
          id:'freshness', title:'Fresh / Recent / Older / Retained 是什么？', kicker:'证据有时间',
          summary:'Sentinel 会保留部分历史证据，但 retained 不等于实时。Freshness 是判断“这份证据还适不适合回答当前问题”的关键。',
          paragraphs:['Full Scan 后的 System / Network / Storage / Behavior / Case 证据可能被后续页面复用。这样可以避免每次分析都重新做昂贵扫描。','代价是你必须看时间。如果系统已经变化很大，旧 baseline 就不再适合回答“现在”的问题。'],
          steps:['先看 capture time。','fresh：通常适合当前分析。','recent：结合问题时间尺度判断。','older：如果问题发生在现在，考虑刷新对应来源。','需要新完整基线时再主动 Full Scan。'],
          lookFor:['captured_at','created_at','freshness badge','history count'],
          caution:'旧证据不等于错误证据；它只回答“当时是什么样”。'
        },
        {
          id:'privacy', title:'LOCAL、本地引擎和隐私边界', kicker:'数据在哪里处理',
          summary:'Sentinel 主产品通过本机 localhost 引擎读取和组织系统证据；LOCAL 是产品设计的重要边界提示。',
          paragraphs:['本地处理减少了为了得到系统解释而把大量原始路径、进程和网络信息发送到远端的需要。','但你自己导出的报告仍可能包含敏感本机信息；“本地生成”不代表“适合公开发布”。'],
          steps:['正常使用时确认顶部 LOCAL。','导出报告后按敏感诊断资料保存。','分享前检查路径、用户名、主机信息和网络证据。'],
          lookFor:['LOCAL indicator','exported file location','是否包含个人路径'],
          caution:'隐私不仅取决于 Sentinel 在哪里处理，也取决于你之后如何保存和分享导出文件。'
        }
      ]
    },
    {
      id:'troubleshoot', label:'常见问题 / TROUBLESHOOTING',
      topics:[
        {
          id:'startup-freeze', title:'一打开应用就卡住，应该先判断什么？', kicker:'性能排查',
          summary:'正常行为是先显示轻量 Status；Full Scan 不应该自动启动。',
          paragraphs:['如果一打开就完全冻结，先观察是否真的出现 Full Scan progress。没有的话，不要自动假设是完整扫描。','界面循环、某个同步读取、WebKit 渲染问题也可能造成“像扫描卡死”的感觉。'],
          steps:['确认自己没有点击 Full Scan。','看底部 Activity Bar 当前 label。','看 Status 是否出现 Full Scan stage list。','如果没有 stage list 但 UI 卡死，记录版本和复现步骤。','如果 Full Scan 正在跑，等待阶段更新或使用 Cancel。'],
          lookFor:['是否有明确 Full Scan UI','Activity label','版本号','哪个页面开始卡'],
          caution:'不要通过反复强制启动多个 Full Scan 来测试“是不是扫描问题”。'
        },
        {
          id:'full-scan-slow', title:'Full Scan 很慢时怎么办？', kicker:'尤其是 Storage 阶段', lens:'status',
          summary:'完整扫描中，Home storage traversal/hash 通常比读取系统 metadata 更重，所以耗时不均匀是正常的。',
          paragraphs:['Storage 阶段会显示 files visited、folders visited、hash progress，必要时还会显示 slow paths skipped。','UI 会在阶段之间让出渲染机会，所以进度应该能更新。'],
          steps:['看当前 stage 是否是 Storage。','看 files/dirs visited 是否增长。','如果你不需要完整存储基线，可以 Cancel。','取消后仍可以使用已经完成的其他页面证据，但不要把未完成的 Storage 当成完整结果。'],
          lookFor:['stage label','visited counters','hash counters','cancelled/limited'],
          caution:'“阶段耗时长”和“程序死循环”不是一回事，要看计数和 Activity 是否还在变化。'
        },
        {
          id:'missing-data', title:'页面显示 missing / limited / no data 怎么办？', kicker:'不要先猜错误', lens:'visibility',
          summary:'先区分三种情况：从未捕获、权限/能力受限、当前确实没有记录。',
          paragraphs:['例如没有 Network History 可能只是从未点击 Capture History；没有 previous Behavior 可能只是还没建立 baseline；Visibility limited 则表示证据源受限。'],
          steps:['先去 Visibility 看 coverage。','检查对应 history count。','确认是否需要显式 Capture。','确认该功能是否只显示当前状态还是 retained history。','刷新后仍受限时记录限制原因。'],
          lookFor:['history count','capture time','coverage status','error message'],
          caution:'No data 不是安全结论。'
        },
        {
          id:'when-rescan', title:'什么时候应该重新 Full Scan？什么时候不应该？', kicker:'节省时间', lens:'status',
          summary:'重新 Full Scan 应该由问题驱动，而不是形成“每次打开都扫一遍”的习惯。',
          paragraphs:['合理重扫：系统发生明显变化、安装/删除大量软件、你准备做新的系统级 before/after、旧 baseline 已经明显过时、continuity 明确提示需要刷新。','不合理重扫：只是切换了页面、只是想刷新一个网络当前状态、只是想看一个对象、刚刚完成 Full Scan 又没有系统变化。'],
          steps:['先看 freshness。','判断你的问题需要 current state 还是 historical baseline。','能用单 Lens Refresh/Capture 解决就不用 Full Scan。','只有需要新的广泛 retained baseline 时才 Full Scan。'],
          lookFor:['freshness','系统是否 materially changed','哪个 evidence family 真正过时'],
          caution:'重复 Full Scan 会浪费时间，也可能让“你到底在比较哪两个时点”变得更混乱。'
        },
        {
          id:'safe-defaults', title:'不确定时最安全的操作顺序是什么？', kicker:'新手防误操作',
          summary:'不确定时优先读、解释、比较；最后才修改。',
          paragraphs:['最稳妥的顺序是 Status → Easy Scan → Cases/Relations → Object → Changes/Reference → Safe Change。','任何时候只要证据还不够，都可以停在调查阶段。'],
          steps:['先读。','再找关系。','再看时间差异。','确认 exact object。','确认 consequences。','最后才执行可恢复动作。'],
          lookFor:['Unknowns 是否仍很多','是否确认 exact path','是否有 recovery readiness'],
          caution:'“我看不懂这个文件”不是执行修改的充分理由。'
        }
      ]
    }
  ];

  const allTopics = GROUPS.flatMap(group => group.topics.map(topic => ({...topic, groupId:group.id, groupLabel:group.label})));

  function openButton(topic) {
    if (topic.lens) return `<button type="button" class="s24-action primary" data-manual-open-lens="${esc(topic.lens)}">Open feature · ${esc(S.LENSES[topic.lens]?.label || topic.lens)}</button>`;
    if (topic.action === 'workbench') return '<button type="button" class="s24-action primary" data-workbench="open">Open Investigation Workbench</button>';
    if (topic.action === 'continue') return '<button type="button" class="s24-action primary" data-continue-investigation="1">Continue Investigation</button>';
    return '';
  }

  function list(items) {
    return `<ol class="manual-steps">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`;
  }

  function chips(items) {
    return `<div class="manual-lookfor">${items.map(item => `<span>${esc(item)}</span>`).join('')}</div>`;
  }

  const EN_TOPIC = {
    'what-is-sentinel':{purpose:'Understand Sentinel as a local evidence and system-intelligence tool, not a binary safe/danger classifier.',steps:['Start from Status.','Use Easy Scan for a quick read-only review.','Follow concrete evidence into Cases, Relations or Object.','Use Safe Change only after the exact object and consequences are understood.'],caution:'Attention, Risk, Confidence and Drift are evidence-oriented signals, not malware probabilities.'},
    'screen-regions':{purpose:'Learn the fixed regions of the app so you can see navigation, evidence, context and task progress without getting lost.',steps:['Choose a Mission.','Choose a Lens.','Read the question at the top of the Evidence Stage.','Use Quick Actions only when they match your goal.','Watch task/progress surfaces during long work.'],caution:'You do not need to run every page or every scan.'},
    'first-five-minutes':{purpose:'Use a safe first-session path that starts with orientation instead of a full-machine operation.',steps:['Open Status.','Run Easy Scan.','Review one concrete item.','Open Cases, Relations or Object if more context is needed.','Run Full Scan later only if you want a retained baseline.'],caution:'A missing baseline is normal on first use.'},
    'easy-vs-full':{purpose:'Choose between a quick read-only review and a broader retained baseline.',steps:['Use Easy Scan for a fast current review.','Use Full Scan only when you intentionally want broad retained evidence.','Watch stage progress and limitations.','Re-run Full Scan only when the machine materially changed or the baseline is stale.'],caution:'Full Scan must never start merely because the app was opened.'},
    'activity-bar':{purpose:'Tell whether a long operation is running, progressing, limited, failed or complete.',steps:['Read the task label.','Check measured progress when available.','Read the current stage/detail.','If progress stops, inspect Runtime Logs before launching duplicates.'],caution:'Do not repeatedly click the same expensive action just because one stage takes time.'},
    'status':{purpose:'Orient yourself before investigating or changing anything.',steps:['Read current readiness and retained evidence freshness.','Choose Easy Scan for a quick review.','Choose Full Scan only for a new baseline.','Open the relevant Lens for one concrete question.'],caution:'Older evidence means stale evidence, not dangerous evidence.'},
    'snapshot':{purpose:'Use Easy Scan to create a lightweight review queue from current read-only evidence.',steps:['Run Easy Scan.','Read why each item was prioritised.','Open a concrete object for deeper evidence.','Capture history separately when you need a retained comparison point.'],caution:'A review item is not an instruction to delete or modify anything.'},
    'search-lens':{purpose:'Find known evidence first, then deliberately broaden to a bounded deep search when needed.',steps:['Enter a specific keyword.','Choose a scope.','Set a reasonable result limit.','Inspect visited/result counts.','Open Object Story for a concrete file result.'],caution:'No match means no match inside the current visibility and search budget, not proof of absence.'},
    'relations':{purpose:'Understand how processes, files, startup items, network endpoints and cases are connected over time.',steps:['Read node and edge types.','Select one node.','Check timeline order.','Narrow the time/type filters.','Verify important objects separately.'],caution:'An observed edge is a relationship, not proof of causality.'},
    'audit':{purpose:'Prioritise evidence for review using explainable reasons.',steps:['Run or refresh Audit.','Read the reason behind a high-priority item.','Check Cases for correlated evidence.','Verify the exact object.','Continue Investigation only when more evidence is needed.'],caution:'Audit priority is not malware probability.'},
    'continue-investigation':{purpose:'Continue from one concrete evidence point while preserving investigation context.',steps:['Start from a specific finding.','Open Continue Investigation.','Read the current session and branch.','Continue from a meaningful node.','Record hypotheses and unresolved questions.'],caution:'Investigation does not grant mutation authority.'},
    'object':{purpose:'Verify one exact path or process before interpreting it.',steps:['Open a precise path or PID.','Confirm identity first.','Read relationships and time evidence.','Review unknowns.','Follow only relevant related objects.'],caution:'A strange name or unfamiliar path alone is not enough for a conclusion.'},
    'machine':{purpose:'Read hardware, architecture and runtime context that explains compatibility and capacity.',steps:['Confirm model/chip/architecture.','Check memory and storage context.','Use health/resource tools for live pressure rather than inferring from hardware alone.'],caution:'Hardware information explains capability; it does not diagnose a specific software problem by itself.'},
    'processes':{purpose:'See what is running now and connect a process to its executable and current activity.',steps:['Sort or inspect CPU/memory-heavy processes.','Select one PID.','Open its story or related evidence.','Use Terminal Tools for bounded process details when necessary.'],caution:'High CPU or memory use can be legitimate workload.'},
    'startup':{purpose:'Review software configured to start automatically.',steps:['Read the launch declaration.','Verify the executable target.','Compare with previous persistence captures when available.','Investigate unfamiliar items before considering action.'],caution:'Automatic startup is common in legitimate software.'},
    'network':{purpose:'Review current TCP/network evidence and connect it to the responsible process.',steps:['Refresh current network evidence.','Identify the process/PID.','Use Relations or Process Story for context.','Use Terminal Tools for DNS, routes, proxy or Network Quality when troubleshooting connectivity.'],caution:'A public endpoint is ordinary context and is not suspicious by itself.'},
    'storage':{purpose:'Measure where storage is used before deciding what is worth reviewing.',steps:['Choose a bounded scope.','Run the measurement.','Review largest objects and exact duplicate evidence separately.','Use Storage Graph or object inspection for a specific branch.','Send only reviewed candidates to Reclaim/Safe Change.'],caution:'Filename similarity is not the same as hash-confirmed duplication.'},
    'reclaim':{purpose:'Review space-saving candidates without turning an estimate into an automatic delete.',steps:['Measure storage first.','Review candidate path and size.','Open the object when uncertain.','Send a reviewed target to Safe Change.'],caution:'Nothing should be deleted automatically from a Reclaim suggestion.'},
    'change':{purpose:'Make the smallest reversible change supported by evidence.',steps:['Create a fresh Preview.','Read impact and expiry.','Confirm explicitly.','Use the one-time code.','Let Sentinel revalidate the object immediately before execution.','Use Recovery Journal/Vault if restoration is needed.'],caution:'Never bypass Preview, confirmation or recovery boundaries for convenience.'},
    'visibility':{purpose:'Understand exactly what Sentinel could and could not observe.',steps:['Read available evidence sources.','Read limited/unavailable sources.','Grant only permissions you intentionally want to grant.','Lower confidence when visibility is missing.'],caution:'Unavailable evidence must not be converted into a clean bill of health.'},
    'guide':{purpose:'Use Sentinel as an evidence workflow: observe, connect, compare, verify, then act only when justified.',steps:['Start from a question.','Choose the smallest relevant Lens.','Separate observed facts from interpretation.','Verify exact objects.','Act only with recovery.'],caution:'More scans do not automatically create better understanding.'}
  };
  const EN_LENS = {
    status:'Use this topic to orient current state and decide the next bounded step.',snapshot:'Use this topic for a lightweight current observation.',cases:'Use this topic to correlate related evidence into a readable story.',search:'Use this topic to find a concrete object inside a bounded scope.',relations:'Use this topic to understand relationships and time order.',audit:'Use this topic to prioritise review with explainable reasons.',object:'Use this topic to verify one exact object.',changes:'Use this topic to compare retained points and understand what changed.',behavior:'Use this topic to compare behavior captures without turning difference into a verdict.',reference:'Use this topic to compare against an approved reference while preserving context.',machine:'Use this topic to understand machine/runtime context.',processes:'Use this topic to inspect current processes and their resource/activity context.',startup:'Use this topic to understand launch declarations.',persistence:'Use this topic to compare bounded persistence captures.',background:'Use this topic to inspect background registrations.',network:'Use this topic to inspect current or retained network evidence.',storage:'Use this topic to measure storage before cleanup decisions.',reclaim:'Use this topic to review space-saving candidates.',change:'Use this topic only for previewed, confirmed and recoverable changes.',visibility:'Use this topic to understand evidence boundaries.',guide:'Use this topic to learn the evidence-first product model.',assistant:'Use this topic to understand Local AI as an interpretation layer.'
  };
  function englishCompanion(topic){
    if(EN_TOPIC[topic.id])return EN_TOPIC[topic.id];
    const purpose=EN_LENS[topic.lens]||'Use this topic to understand one Sentinel workflow while keeping observed evidence, interpretation and unknowns separate.';
    const steps=topic.lens?['Read the observed evidence first.','Use the feature only for the concrete question you are trying to answer.','Open related evidence when a result needs verification.','Stop at Unknown when visibility or evidence is insufficient.']:['Read the Chinese detailed guidance and the current Sentinel evidence together.','Follow only the smallest relevant workflow.','Verify important objects before acting.','Use Runtime Logs or Visibility when evidence is incomplete.'];
    return {purpose,steps,caution:'Do not turn one signal, score, unfamiliar object or missing observation into a safety or malware verdict.'};
  }

  function article(topic, index) {
    return `<article class="manual-article" id="manual-${esc(topic.id)}" data-manual-article="${esc(topic.id)}" data-manual-search="${esc([topic.title,topic.kicker,topic.summary,...topic.paragraphs,...topic.lookFor].join(' ').toLowerCase())}">
      <header class="manual-article-head">
        <div><span>${String(index+1).padStart(2,'0')} · ${esc(topic.kicker)}</span><h2>${esc(topic.title)}</h2><p>${esc(topic.summary)}</p></div>
        ${openButton(topic)}
      </header>
      <div class="manual-prose">${topic.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</div>
      <section class="manual-subsection"><h3>怎么用 / HOW TO USE</h3>${list(topic.steps)}</section>
      <section class="manual-subsection"><h3>重点看什么 / WHAT TO LOOK FOR</h3>${chips(topic.lookFor)}</section>
      <div class="manual-warning"><b>注意 / CAUTION</b><span>${esc(topic.caution)}</span></div>
      ${(()=>{const en=englishCompanion(topic);return `<section class="manual-subsection manual-english" data-manual-language="en"><h3>English companion / 英文说明</h3><p><b>Purpose:</b> ${esc(en.purpose)}</p><h4>How to use</h4>${list(en.steps)}<div class="manual-warning"><b>Caution</b><span>${esc(en.caution)}</span></div></section>`;})()}
    </article>`;
  }

  function toc() {
    return GROUPS.map(group => `<section class="manual-toc-group" data-manual-toc-group="${esc(group.id)}"><h3>${esc(group.label)}</h3>${group.topics.map(topic => `<button type="button" data-manual-target="${esc(topic.id)}"><b>${esc(topic.title)}</b><small>${esc(topic.kicker)}</small></button>`).join('')}</section>`).join('');
  }

  function renderManual() {
    const stage = $('#evidenceStage');
    stage.innerHTML = question('<button type="button" class="s24-action" data-manual-target="first-five-minutes">新手 5 分钟路线</button><button type="button" class="s24-action" data-manual-target="easy-vs-full">Easy vs Full Scan</button>') + `
      <section class="manual-intro">
        <div><span>USER MANUAL / 使用手册</span><h2>每个章节同时提供中文详细说明与 English companion。</h2><p><b>中文：</b>按“它是什么 → 什么时候用 → 怎么用 → 看什么 → 注意什么”解释。<br><b>English:</b> Every topic includes a Purpose, How to use, and Caution companion. Open feature jumps to the real feature.</p></div>
        <div class="manual-intro-stats"><b>${allTopics.length}</b><span>详细章节</span><b>${Object.keys(S.LENSES).length}</b><span>Lens / 页面</span></div>
      </section>
      <section class="manual-searchbar"><label for="manualSearch"><span>Search manual / 搜索手册</span><input id="manualSearch" type="search" placeholder="例如：Full Scan、网络、启动项、Safe Change、评分…" autocomplete="off"></label><small id="manualSearchState">Showing all ${allTopics.length} topics / 显示全部 ${allTopics.length} 个章节</small></section>
      <div class="manual-layout">
        <aside class="manual-toc" aria-label="User Manual table of contents"><div class="manual-toc-title"><span>CONTENTS</span><b>Jump to topic / 点击章节直接跳转</b></div>${toc()}</aside>
        <div class="manual-content">${allTopics.map(article).join('')}<div id="manualNoResults" class="manual-no-results" hidden><b>没有匹配章节</b><span>换一个更短或更通用的关键词，例如 “network”、“scan”、“启动”、“history”。</span></div></div>
      </div>`;
    activity('Ready',100,`User Manual · ${allTopics.length} detailed sections`);
  }

  function setActiveTarget(id) {
    document.querySelectorAll('[data-manual-target]').forEach(button => button.classList.toggle('active', button.dataset.manualTarget === id));
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-manual-target]');
    if (target && S.state.lens === 'manual') {
      event.preventDefault();
      const id = target.dataset.manualTarget;
      const articleNode = document.getElementById('manual-' + id);
      if (articleNode) {
        setActiveTarget(id);
        articleNode.scrollIntoView({behavior:'smooth',block:'start'});
      }
      return;
    }
    const open = event.target.closest('[data-manual-open-lens]');
    if (open && typeof S.navigate === 'function') {
      event.preventDefault();
      S.navigate(open.dataset.manualOpenLens);
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'manualSearch' || S.state.lens !== 'manual') return;
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('[data-manual-article]').forEach(node => {
      const show = !query || node.dataset.manualSearch.includes(query);
      node.hidden = !show;
      if (show) visible++;
    });
    document.querySelectorAll('[data-manual-toc-group]').forEach(group => {
      let groupVisible = 0;
      group.querySelectorAll('[data-manual-target]').forEach(button => {
        const articleNode = document.getElementById('manual-' + button.dataset.manualTarget);
        const show = articleNode && !articleNode.hidden;
        button.hidden = !show;
        if (show) groupVisible++;
      });
      group.hidden = groupVisible === 0;
    });
    const state = $('#manualSearchState');
    if (state) state.textContent = query ? `找到 ${visible} 个匹配章节` : `显示全部 ${allTopics.length} 个章节`;
    const none = $('#manualNoResults');
    if (none) none.hidden = visible !== 0;
  });

  registerLens('manual', renderManual);
  S.userManual = {marker:MANUAL_MARKER, groups:GROUPS, topics:allTopics, render:renderManual};
})();
