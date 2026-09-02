# Product Balance Audit / 产品重心审计

## Finding / 结论

**English:** Sentinel became disproportionately deep in Investigation, Full Scan, Local AI and Safe Change while everyday observability and discoverability of existing tools lagged behind. The missing capability was often not backend code; it was product integration and information architecture.

**中文：** Sentinel 在 Investigation、Full Scan、Local AI、Safe Change 上发展得很深，但日常观察能力和既有工具的可发现性相对落后。很多时候真正缺少的不是后端代码，而是产品整合和信息架构。

## Canonical product model / 正式产品模型

**Observe → Explore → Tools → Compare → Act → Investigate → Learn**

**观察 → 探索 → 工具 → 比较 → 操作 → 调查 → 学习**

Investigation remains deep, but it no longer defines the default center of gravity. Everyday Mac understanding comes first; deeper investigation is available when a concrete anomaly needs explanation.

Investigation 继续保持深度，但不再默认成为整个产品的中心。普通用户先理解 Mac 当前状态，需要解释具体异常时再进入深度调查。

## Balanced coverage / 均衡覆盖

| Area / 领域 | User question / 用户问题 | Canonical coverage / 正式覆盖 |
|---|---|---|
| Observe / 观察 | Why is my Mac slow/hot/busy? / 为什么卡、热、忙？ | Status, Easy Scan, Machine, Resource Observatory |
| Explore / 探索 | What is using resources, network or storage? / 谁在使用资源、网络或空间？ | Processes, Network Diagnostics, Storage, Maintenance, Search, Relations |
| Tools / 工具 | Can I use useful Terminal capabilities without memorising commands? / 不记命令能否使用 Terminal 能力？ | Visual allowlisted Terminal Tools + Controlled Workflows |
| Compare / 比较 | What changed since a known point? / 和之前相比变了什么？ | Changes, Behavior, Reference, Persistence |
| Act / 操作 | What is the smallest reversible action? / 最小可恢复操作是什么？ | Reclaim + Safe Change preview/confirmation/recovery |
| Investigate / 调查 | What explains one concrete anomaly? / 一个具体异常如何解释？ | Cases, Audit, Object verification |
| Learn / 学习 | What does this feature or metric mean? / 这个功能或指标是什么意思？ | Visibility, Guide, bilingual Manual, Local AI guidance, Runtime Logs |

## Everyday-system commitments / 日常系统能力承诺

Major releases must preserve first-class coverage for CPU, memory pressure/compression/swap, disk and network activity, battery/power evidence, resource history, Network Quality/DNS/Proxy/Route diagnostics, Storage Graph/Heatmap, Large Files, exact duplicate evidence, App Footprint, Floating Task Center, and Chinese + English product guidance.

主要版本必须保持 CPU、内存压力/压缩/swap、磁盘/网络活动、电池与电源、资源历史、网络诊断、Storage Graph/Heatmap、大文件、严格重复文件、App Footprint、Task Center 和中英双语说明作为一等能力。

## Controlled workflow boundary / 受控工作流边界

Read-only Terminal-backed tools may execute directly only when the executable and argument structure are explicitly allowlisted and bounded. Sentinel does not provide a free-form command surface.

只读 Terminal 工具只有在 executable 与参数结构均被明确白名单限制并受到时间/输出限制时才能直接运行。Sentinel 不提供自由命令输入面。

Git Pull and Download are **Managed Workflow** capabilities rather than read-only tools:

- **Git Pull** changes a working tree. Sentinel first performs a typed preflight that shows the resolved repository, branch, upstream, worktree cleanliness and equivalent operation. Execution is offered only when the worktree is clean and an upstream exists; the only supported mutation is `pull --ff-only`. Sentinel does not silently reset, stash, switch branches or resolve conflicts. The result records the before/after commit IDs for review.
- **Download** creates a file. Sentinel first validates a credential-free HTTPS source and a destination already contained inside the user's resolved `~/Downloads` tree. Execution uses exclusive file creation, never overwrites an existing path, has a 512 MiB hard ceiling, stays on HTTPS across redirects, rejects local/private-network destinations, removes partial files after failure and reports the resulting SHA-256.
- Both execution paths require a second explicit confirmation and are disabled in Sentinel ephemeral mode.

Git Pull 会改变工作区；Download 会创建文件。二者属于 **Managed Workflow / 受控工作流**：先做真实后端 preflight，只有满足边界条件才出现执行入口，并且执行前还需要第二次明确确认。Git 只允许 fast-forward-only；Download 只允许受限 HTTPS 下载到 `~/Downloads`，默认绝不覆盖已有文件。

## Task progress rule / 任务进度规则

The visible legacy bottom Activity Bar is retired. The Floating Task Center is the canonical progress surface.

旧的可见底部 Activity Bar 已退役。Floating Task Center 是正式任务进度界面。

- Measurable work shows real measured progress.
- Unknown-total work shows an indeterminate state rather than an invented percentage.
- A stalled warning is a visibility warning, not proof of failure.

## Release audit / 版本发布审计

Every major release must answer all seven questions before merge:

1. **Observe:** Did everyday current-state understanding improve or regress?
2. **Explore:** Can users move from a symptom to a relevant process/network/storage object without entering Investigation first?
3. **Tools:** Are useful command-line capabilities discoverable with bounded authority?
4. **Compare:** Can users distinguish current state from retained history/reference?
5. **Act:** Are mutations previewed, explicit and recoverable?
6. **Investigate:** Is deep investigation available without dominating the default product flow?
7. **Learn:** Are new user-facing capabilities explained in Chinese and English, including Purpose / How to use / Caution where appropriate?

A major release should not deepen Investigation or AI while leaving Observe, Explore, Tools or Learn materially behind.
