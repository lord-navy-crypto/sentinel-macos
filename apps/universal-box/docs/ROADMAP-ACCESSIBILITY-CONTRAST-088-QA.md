# Sentinel Box v0.88 · 免费离线文字颜色对比度检查器

2026-10-22 开发 Draft，依赖 PR #111。v0.88 只是开发里程碑，不是已发布 DMG 版本。

## 计划和权威标准

终极开发计划书 P1-4 的无障碍检查器机会项，本轮只实现**不透明 sRGB 纯色文字和背景对比度**，不是全面无障碍认证。

官方标准：
- WCAG 2.2 Contrast Minimum AA：https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum ；普通文字至少 4.5:1、大字号文字至少 3:1。
- WCAG 2.x Contrast Enhanced AAA：https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced ；普通文字至少 7:1、大字号文字至少 4.5:1。
- W3C relative luminance：https://www.w3.org/WAI/WCAG21/Understanding/relative-luminance.html ；使用现代 0.04045 sRGB 解码阈值，0.2126、0.7152、0.0722 亮度系数。
- 所有 AA/AAA 判断基于未经舍入的真实比值，不能对 4.499 比值先四舍五入后误判通过。

## 已实现

1. 手动输入三位或六位不透明 HEX 颜色，或用系统颜色选择器选取前景及背景。非法输入不展示虚假结果。
2. 实时显示文字预览、对比度及 AA/AAA 普通/大字号文字四种结果。
3. 提供一键交换前景和背景；在纯黑、纯白间选择对比度更高的建议文字色，但不自动修改用户选择，除非明确点击使用。
4. 明确点击才下载带原始实际数值的 TXT 报告。全程无需文件读取、屏幕截图、网络服务、账号和收费订阅。
5. 仅适用于不透明纯色。不检测透明度、渐变、照片背景、实际字号、字重、反锯齿、键盘可访问性和屏幕阅读器等其他无障碍因素。

## 自动化与发布门禁

- [x] Vitest：颜色格式、alpha 拒绝、黑白 21:1、相同颜色 1:1、#777777 小于 4.5、#767676 达到 4.5、对比度对称性、黑白建议和 TXT 文本。
- [x] Chromium E2E 已写：目录入口、真实比值与 AA/AAA 判定、颜色更改、黑白建议、交换颜色、非法值、真实 TXT 下载。
- [ ] 当前 SHA TypeScript、全部 Vitest、全部自动发现的 Chromium 测试全绿。
- [ ] Intel + Apple Silicon macOS 构建全绿。
- [ ] 真正 macOS WebView 的本地颜色选择器和导出对话框人工测试。
- [ ] 堆叠 PR 顺序审查、合并和真实发布包版本同步。

## 维护边界

这一工具用于设计辅助，而不是一套完整的网页或 Office 文件无障碍扫描器。未来若扩展图片对比度、透明层合成和真实文档分析，应另行立项，并新增相应测试，不能挪用本轮纯色比值冒充完整认证。
