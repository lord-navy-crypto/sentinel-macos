# Sentinel Box v0.63 · 高频办公小工具整理与免费化优先级

日期：2026-10-22 ｜ 当前状态：开发分支／Draft，**不是稳定版**。

## 产品方向

用户要求：**不要继续开发复杂、低频的商务流程**；优先免费、离线、少点击、生活办公经常使用的小功能。先检查现有工具，再做真正的缺口，拒绝重复添加目录图标。

研究参考（供应商一手资料，功能说明并不等于用户热度统计）：

- [Microsoft PowerToys 官方工具目录](https://learn.microsoft.com/en-us/windows/powertoys)：Advanced Paste、PowerRename、图片调整、OCR、颜色拾取、Command Palette 等日常工具，Windows 上免费开源。
- [Microsoft Advanced Paste 官方说明](https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste)：纯文本粘贴作为一个本机非 AI 动作。
- [Apple macOS 原生复制粘贴](https://support.apple.com/en-gb/102553)：macOS 已支持 ⌥⇧⌘V “粘贴并匹配样式”，Sentinel Box 不应宣称系统没有这项功能。
- [Apple Finder 批量改名](https://support.apple.com/en-gb/guide/mac-help/mchlp1144/27/mac/27)：Finder 已自带文字替换、添加文字、序号格式化；不是值得再研发的独占能力。
- [PDF24 官方产品目录](https://www.pdf24.org/en/)：PDF 合并、拆分、压缩、旋转、OCR、水印等基础任务，许多已经完全免费。付费化不是这些工具的唯一模式。
- [Smallpdf 官方帮助](https://smallpdf.com/support)：免费层有限定任务次数；Pro 才有无限使用、部分 OCR／批量转换等能力。
- [Adobe Acrobat 官方产品比较](https://www.adobe.com/ie/acrobat/plans.html)：PDF 编辑、转换、页面组织及更高级 PDF 工作流程可属于付费方案。

## 仓库实际查重结论

| 能力 | Sentinel Box 已有情况 | 下一步 |
| --- | --- | --- |
| PDF 合并／拆分／旋转／水印／添加页码 | FileDesk/PDF Freedom/PdfEverydayDesk 已有 | **优化路径、预览与报错；不要重造编辑器** |
| 图片压缩／改尺寸／格式转换 | FileDesk、图像批处理和照片目标 KB 工作流已有 | 提供常用预设及明确输出比原图小多少 |
| 文件名清单／批量重命名 | LOCAL_TOOLS 已有对应 entries，Finder 也原生支持 | 优化实际预览和失败报告，不添加一个重复入口 |
| 文本去空行／去重／查找替换／转换大小写 | QuickKit、UniversalLab 和 Quick Tools 已有 | 优化常用路径而不是重建功能 |
| Excel ↔ CSV | FreeFormatsDesk 和数据工具已有 | 优先用更友好的导入默认设置 |
| Apple Vision OCR | VisionWorkflowDesk 已有 | 缩短 “识别 → 复制文字” 路径 |
| 纯文本剪贴板直接进入清理工具 | **QuickKit 缺少显式“读取剪贴板”动作** | **本 PR 实现** |
| PDF 或网页复制后意外折行 | 现有 `joinWrappedLines` 把所有行合在一起 | **本 PR 增加保留段落／项目符号的可选模式** |

## v0.63 本 PR 范围（一次解决常用三件事）

1. 在现有 Quick Tools 文本清理页面点击 **读取剪贴板纯文本**。只有主动点击才触发 `navigator.clipboard.readText()`。不能读取时给出手工粘贴提示，**绝不偷偷监视剪贴板、记录历史、保存密码或上传内容**。
2. **复制原文为纯文本**：没有任何自动清理或修改，保留原来的制表符、空格和换行。与“复制整理结果”分开，避免误改合同和代码。
3. 添加选项 **合并 PDF/网页意外折行，尽量保留段落和列表**；默认关闭。保持空白段落边界，不拼接显式项目符号和句末终止标点；相邻中文不随意加空格。该启发式不是完美版面解析，诗歌、代码、复杂清单请不要开启。
4. “移除空行”“合并所有行”“保留段落折行修复”互斥，减少冲突设置。沿用既有保存 TXT、复制、输出预览和工具目录，**不增加独立新页面**。

## 验收

- [x] 修改现有 QuickKit 数据层和界面，不做重复导航入口。
- [x] Vitest 测试中英混排、项目符号、段落空行、默认无损保持换行。
- [x] Chromium UI 测试明确点击读取剪贴板、原样复制、整理预览和整理结果回写剪贴板。
- [x] 新测试加入已有 GitHub Actions browser workflow。
- [ ] 当前 PR TypeScript + 单元测试 + Chromium 全套检查通过。
- [ ] 当前 PR Intel／Apple Silicon 构建通过。
- [ ] 实机 macOS 权限弹窗、剪贴板无法访问时的友好回退、键盘操作检查。
- [ ] 审查 stacked PR 和 release 合并顺序（#79 → #80 → #81 → #82 → #83 → #84 → #85 → #86 → #87 → 本 PR）。

## 下一轮继续做的小功能，而非复杂平台

P0：常用工具首页只显示 8–12 个高频任务；清晰的“拖文件／点一次／看预览／保存”路径。
P0：PDF、图片处理的预设按钮（邮件附件、打印、网页上传）；明确体积和输出能力，不承诺不能保证的压缩效果。
P1：表格 CSV/TSV 复制粘贴更友好；UTF-8 BOM 和前导 0 的编号不误改。
P1：改名工具增加重名冲突、扩展名风险预览；优先复用已有功能。
P2：支持者页面需用户主动进入。不要为了收入限制现有免费的离线功能。没有真实下载量、支付记录和用户调研前，不能宣称收入、热度排行或商业成功。

**停止继续堆复杂功能的原则：** 先让已有基础工具快速、可靠、无需教程，再讨论更高级的收费服务。
