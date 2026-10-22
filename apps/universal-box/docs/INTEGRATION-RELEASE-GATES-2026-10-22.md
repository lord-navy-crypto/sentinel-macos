# Sentinel Box · Stacked PR integration and actual DMG release gates

日期：2026-10-22，适用开发分支 v0.90 与后续版本。**此文件是操作清单，不代表项目已经发布。**

## 现状与可验证证据

当前 native macOS 应用版本实际为 **0.36.0**，并同时写入：
- apps/universal-box/package.json
- apps/universal-box/package-lock.json（根版本和 packages[""]）
- apps/universal-box/src-tauri/tauri.conf.json
- apps/universal-box/src-tauri/Cargo.toml

新增 `src/lib/releaseVersionConsistency.test.ts` 会在 npm/Vitest 测试中检查上述四处以及软件标识一致性。**v0.71–v0.90 是开发里程碑，不是已经发布、已签名或已公证的应用程序版本号。**

最近依赖顺序（这些 PR 全部仍是 Draft，不能当作已合并）：
- PR #108 · v0.83 HEX 与 v0.84 EML；base = v0.82；上一轮浏览器与 macOS 双架构 CI 通过
- PR #109 · v0.85 多文件只读 grep；base = #108；浏览器与双架构 CI 通过
- PR #110 · v0.86 文件夹快照元数据比较；base = #109；浏览器与双架构 CI 通过
- PR #111 · v0.87 离线 RSS/Atom；base = #110；浏览器与双架构 CI 通过
- PR #112 · v0.88 WCAG 颜色检查；base = #111；浏览器与双架构 CI 通过
- PR #113 · v0.89 VCF→CSV；base = #112；浏览器与双架构 CI 通过
- PR #114 · v0.90 UI 去重/版本一致性；base = #113；CI 必须在本分支最新 SHA 上验证

此前的 PR #88 等更早 Draft 也有逐层依赖。**仅查看最近七个 PR 不足以批准从头合并**：应从与 `main` 具有明确共同基准的首个未合并祖先开始核实变化，逐个比较与验证，不能跳过父分支或假设全部通过。

## 合并前操作顺序（必须按依赖顺序）

1. 列出所有未合并 Draft 与基分支，查 `main` 最新 SHA，并定位实际第一处未合并变更；审查作者、文件差异、依赖和潜在冲突。
2. 不将大批 Draft 一键盲合。先合并离 `main` 最近的已批准基础变更，持续运行 TypeScript、Vitest、动态 `browser-*.cjs` 全量 Chromium、Rust storage 测试和 Intel/Apple Silicon 两种 DMG 构建。
3. 父变更合并后，更新子 PR base 或重基，确保每个 PR diff 只包含其本身的功能；处理冲突，重新触发 CI。如果父分支直接从 main 删除，先改子 PR base，再删分支。
4. 检查新增功能是否注册且能从目录实际打开。特别注意过去修复的 `openTool` 白名单问题以及 catalog 同义重复。
5. 每个迭代至少做一次静态目录唯一性检查。v0.90 合并了原 Color Contrast 和新 WCAG 面板，保留老的 `color` id，避免破坏既有收藏入口。
6. 对外发 DMG 前，在一台 Intel 真实 Mac 和一台 Apple Silicon 真实 Mac（或有真实硬件可验证的可靠测试机）分别安装、启动、退出、打开本地样本文件、导出 CSV/TXT、验证 Finder 文件夹选择及权限取消路径。**macOS CI 自动打包不等于已完成真实硬件验收**。
7. 对照仓库 Apple 签名/公证现状。Tauri 配置里的 `signingIdentity:"-"` 是 ad-hoc 签名，不要写成已具备 Developer ID 签名或 Apple notarization；发布页必须准确描述安装限制。
8. 选择真正的发布版本号（不必与开发阶段标签 v0.90 相同），一次性同步前述四个版本字段，提交正式变更记录、平台适用范围和校验和。若任何字段不一致，新 `releaseVersionConsistency.test.ts` 应直接阻止 CI 通过。
9. 仅在实际确认打包产物、签名说明、下载地址、SHA-256 和用户可启动验证后，才称之为“正式可下载发布版”。

## 安全与产品边界

- 不因开发里程碑提升而擅自启用后台上传、付费云服务、索取通讯录权限、全盘扫描或不受控网络请求。
- 新增的 Contacts VCF→CSV 仍留在原 CSV→VCF 工作台；旧 Color Contrast 被整合到新的完整 WCAG 检查界面；继续优先消除重复而非增添同义目录入口。
- 对联系人、邮件、文件名等敏感资料，仅依用户明确选择读取，默认不自动保存、共享或传输。
- 开源仓库的 GitHub Actions 成功和 Mac 用户真实安装体验之间有显著差异，应保留“CI 通过/实机未验收”的明确区分。

## 本阶段完成标准

`#114` 最新 SHA 四项版本元数据一致、所有 Vitest、所有 Chromium 浏览器用例、x86_64 + aarch64 macOS 构建均为绿色，并且无不必要的 WCAG 或 Contacts 重复入口。

完成后进入 **合并审查阶段**，不要将 Draft PR 数量增加视为产品实际交付量。主分支、正式安装包和真实硬件验证尚未完成时必须如实说明。
