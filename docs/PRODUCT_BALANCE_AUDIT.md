# Product Balance Audit / 产品重心审计

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
