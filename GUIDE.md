# Sentinel User Guide / Sentinel 用户指南

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
