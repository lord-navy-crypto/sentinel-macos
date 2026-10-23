# Sentinel Box 终极开发计划 · v0.92 日历 ICS → CSV

2026-10-23 · 开发 Draft，不代表已发布 DMG。

## 来源与产品设计

依据此前归档的 Sentinel Box 终极计划书：复用成熟功能、离线、真实文件、简单易用，不新增重复入口。现有软件已经在 LifeMediaDesk 的 `calendar` 模式提供批量 UTC 事件生成、冲突检测与 .ics 导出，但缺失从保存的 .ics **反向读取并校验** 的能力。

本轮在**同一个日历模式**加入 ICS → CSV：一个方向生成日历文件，一个方向核查/导出既有日历档案；不新增 ToolLaunchpad 条目，保留原目录名称和导航。

格式来源：IETF RFC 5545 https://www.rfc-editor.org/rfc/rfc5545 。

## 具体交付

- `src/lib/localIcsArchive.ts`：本地 UTF-8 iCalendar 2.0 的受限解析器。明确选择一份 .ics（40 bytes–750 KB，至多 400 条 VEVENT）。支持 RFC5545 折行、转义文本、非重复 UTC 日期时间（YYYYMMDDTHHMMSSZ），以及 VALUE=DATE 全天活动。逐项提取起止时间、全天类型、标题、地点、描述和 UID。
- **不做危险的时间猜测**：拒绝 RRULE、RDATE、EXDATE、RECURRENCE-ID、TZID 和 floating local times；未来要支持时区与周期须引入可验证的时区/重复展开方案及新测试。全天活动的结束日期按 RFC5545 为不包含的终止日。
- `src/components/LocalIcsImportDesk.tsx`：读取用户明确选择的文件，显示前 30 条日程和 UTC 定时事件相互重叠的组数，明确导出完整 CSV（全部 1–400 条）；超限或损坏文件导入失败时保留上一次成功内容。
- CSV：UTF-8 BOM、引号转义和阻断电子表格公式自动执行的前缀。导出只在用户主动点击后发生；源 .ics 不写回、不删除、不自动加入系统日历、不发送邀请、不连接订阅服务器。
- 无权限升级、无第三方新库、无远程 URL 加载。邮件/个人日历数据可能含敏感信息，分享报告前用户需自己审阅。

## 已提交测试

- [x] Vitest：真实 `generateCalendarBatch` 和 `makeIcsEvent` 的 ICS 解析往返、两事件时间重叠、全天 DATE + fold、多种异常时间/不完整边界、周期拒绝、CSV 公式防护。
- [x] Chromium E2E 已写：从原日历模式真实生成 .ics 文件并下载，再导回新工具，核查标题、UTC 时刻、冲突数与下载的 CSV 具体行内容；遇到 RRULE 拒绝并保存上次成功报告；原生成文件字节保持不变。
- [ ] 当前 SHA TypeScript + 全量 Vitest + 动态 browser-*.cjs Chromium CI 全部通过。
- [ ] 当前 SHA Intel + Apple Silicon macOS 构建通过。
- [ ] 真实 Mac 文件选择器、日历 App 导入兼容性、Finder 导出与电子表格打开实测。
- [ ] 上游所有堆叠 Draft 审核/整合到稳定分支，实际版本号同步与可靠 DMG 发布。

## 发布前注意

这轮同时继承 PR #115 发布流水线修复：两架构 DMG 附件名称一致、发布标签与四处版本号校验、SHA256SUMS.txt、仅创建 Draft Release。此分支仍不等于公开发布版，当前安装包元数据维持 0.36.0。优先修复任何 CI 失败，不继续堆叠未经验证功能。
