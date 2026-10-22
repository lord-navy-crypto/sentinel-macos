# Sentinel Box v0.78 · 免费离线浏览器书签整理

2026-10-22 · Draft，基于 PR #102（文件夹目录树），不是正式发布版。

## 场景与已有工具的区别

浏览器里积累了大量书签，换电脑、换浏览器或归档资料时，需要搜索链接、查看是否重复、导出 Excel 可打开的 CSV 或 Markdown 备份。现有 QR、短链预设、网页抓取并不能直接查看**已导出的浏览器书签 HTML**，不依赖付费在线书签服务。

## 已实现

- 用户选择 .html/.htm 格式的书签导出文件，最多 2MB，提取常见 HTTP(S) HREF 链接；专用于 Netscape bookmarks export 类标准书签 HTML，其他自定义格式可能不兼容。
- 不用 DOMParser/iframe/img，HTML 当纯文本解析，只提取网页网址、标题和域名，**不自动访问网址**。
- 跳过 javascript:、file:、data: 及网址中包含用户名或密码的链接。
- 查找完全相同的网址，按域名统计，筛选标题和网址。默认保留重复项；只有用户勾选才对导出结果去重；源书签 HTML 从不修改。
- CSV 输出 UTF-8 BOM、双引号/逗号转义、危险公式前缀保护；也可导出 Markdown 链接列表。
- 最多 5,000 条书签，屏幕最多渲染 80 条，但导出始终是完整清单。
- 损坏文件导入失败保留旧结果，明确可清空会话。

## 自动化验证

- [x] Vitest：HTML 实体解码、重复 URL、查询参数保留、显式去重、CSV/Markdown、公式安全、危险 URL Scheme、数量限制。
- [x] Chromium：导入包含远程 IMG 的示例，确认无额外远程请求；查重、搜索、CSV 真下载、去重与 Markdown 下载、坏文件保留旧状态。
- [ ] 当前 TypeScript/Vitest/Chromium CI 全绿。
- [ ] Intel + Apple Silicon macOS CI 全绿。
- [ ] Mac 实机验证 Safari/Chrome/Firefox 不同导出格式、中文标题、Numbers/Excel CSV 兼容。
- [ ] 审查、合并 PR #102 及更早的依赖，再同步实际应用版本并发布。

## 隐私

只在当前本机会话内存处理。不会同步浏览器历史，不发起 HTTP HEAD/GET，不加载预览图片。用户主动导出时才写入本地文件。
