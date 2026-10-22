# Sentinel Box · v0.90 质量整理：颜色检查去重与目录完整性

日期：2026-10-22 · Stacked Draft，实际 macOS 安装包版本仍是 0.36.0。

## 依据

终极开发计划书（已归档） apps/universal-box/docs/archive/SENTINEL-BOX-ULTIMATE-PLAN-2026-10-22.md，要求每四项左右新增功能后进行 UI 去重、回归测试及构建验证，而不是无限增加重复的小工具。

检查发现：
- 旧 EverydayTools 有一个「Color contrast」工具，已经按照 W3C sRGB 公式计算普通 AA / 大字号 AA。
- 新 v0.88 另加 WCAG Text Contrast 独立入口，提供四项 AA/AAA、输入颜色、预览、TXT 导出。两者的用户目的相同，形成了真正的 UI 与公式重复。
- v0.89 VCF→CSV 已正确集成现有 Contacts 工具，因此无需新建联系人入口。

## 已修复

1. 保留原 Color Contrast 目录标识 `color` 和旧 EverydayTools 的 `color` tab 与导航路径；通过此入口打开完整的新 `TextContrastDesk`。老用户收藏/记忆的工具标识不变。
2. 从 ToolLaunchpad 移除新建的 `wcag-text-color-contrast` 第二入口；原 `color` 条目改为准确显示「WCAG Text Contrast · 文字对比度 AA/AAA 无障碍颜色检查」。
3. 删除单独的 `text-contrast` 路由和页面导入。减少无意义的长期路由维护。
4. 删除 EverydayTools 旧的第二套 `channel/luminance/ratio` 与独立颜色 state。保留 W3C 来源、最小测试与真实交互已经覆盖的纯函数 `wcagTextContrast.ts`。
5. 新增 `ToolLaunchpad.catalog.test.ts`：校验所有目录 ID 不重复、WCAG 只有一个公共入口、原色彩模块标识继续存在、现有双向联系人转换只有一个目录条目。

## 质量与发布界限

- [x] 已更新全量浏览器回归依赖：旧 `browser-wcag-text-contrast.cjs` 继续从用户目录搜索唯一 WCAG 条目，点击后验证颜色、颜色选择器和 TXT 导出。
- [x] 完整标准算法的独立 Vitest 仍保留。
- [ ] v0.90 当前 SHA TypeScript/Vitest/完整 Chromium 通过。
- [ ] v0.90 当前 SHA Intel / Apple Silicon macOS 构建通过。
- [ ] 真实 Mac: 工具目录搜索、旧颜色 tab、保存 TXT、从旧收藏切换新版页面的完整手动检查。
- [ ] GitHub Draft PR 按依赖审核合并到稳定分支；实际 0.36.0 / Tauri config / DMG 版本号一致性验证及签名/公证决策。

不要把 macOS CI 能够生成 DMG 当成安装包已正式交付或已在真实个人电脑验收。只有全部上游 PR 通过评审合并、真实打包版本同步并做好可安装件说明，才能宣称公开发布。
