# Sentinel Box 终极开发计划 · v0.89 CSV/vCard 双向转换补全

2026-10-22 · 仅开发 Draft，未合并，当前正式应用版本并未随里程碑更新。

## 设计：现有工具的真正补全而不是新入口堆积

已归档的基线：apps/universal-box/docs/archive/SENTINEL-BOX-ULTIMATE-PLAN-2026-10-22.md（baseline commit 2855a335）。

原有 Office & Privacy 已支持 CSV → vCard 3.0，但没有反向导入已保存 .vcf 的能力。新功能直接集成同一个 OfficePrivacyDesk 的 Contacts 模式及原有的 ToolLaunchpad 条目，不另建一个重复导航入口。目标是补齐跨 Mac/Windows/Linux 可交换通讯录的离线工作流程。

格式依据：IETF RFC 6350 https://www.rfc-editor.org/rfc/rfc6350.html ；vCard 4.0 UTF-8、BEGIN/END、VERSION、FN、折行和多值 TEL/EMAIL。兼容常见 vCard 3.0。**不是完整 vCard 2.1、所有厂商扩展或所有地址簿数据无损转换器**。

## 已实现的能力

- 用户主动选择一个 UTF-8 .vcf 文件（24 bytes–500 KB），最多 300 条联系人；不读取系统联系人、不请求通讯录权限、不联系邮件地址、网址或远程服务。
- 本地解析 vCard 3.0/4.0：强制边界完整、VERSION 在前、每条联系人有 FN；支持 CRLF 折行、反斜线转义、中文、重复邮箱/电话、组织、网址和职位。
- 安全处理数据：拒绝旧版或特殊非 UTF-8 编码；PHOTO/KEY/SOUND/LOGO 等二进制扩展仅统计跳过，不加载、执行或导出这些资源；非法 HTTP(S) 网址不作为站点导出。
- 只在内存中显示前 12 个联系人的预览，明确主动点击后才导出全部联系人 CSV；原有 CSV→VCF 生成不受影响。
- CSV 使用 UTF-8 BOM、引号转义与防止以 =、+、-、@ 开头的表格公式自动执行的前缀；含 Name、Phone、Email、Organization、Website、Title 列，多值以竖线分隔。
- 新文件导入失败保留旧报告，清空只移除当前窗口内存；原始 VCF 不会被覆盖或重写。
- 联系方式属于敏感个人信息，任何 CSV 在保存后仍由用户自行管理；不做自动公开、发送或同步。

## 验证门槛

- [x] 新增 Vitest：标准 3/4、CRLF 折行、中文姓名和反斜线转义、多值、格式拒绝、照片跳过、超限、Excel 单元格安全。
- [x] 新增真正浏览器 E2E 文件：首先在已有 CSV→VCF UI 里导出 VCF 到真实文件，然后选中该文件导入反向工具，重新导出 CSV，核对两条联系人与源 VCF 不变；损坏旧格式导入保留报告。
- [ ] 本次 SHA TypeScript + Vitest 全绿。
- [ ] 全部 Chromium suite，包括上述双向转换真实操作通过。
- [ ] Intel + Apple Silicon macOS DMG 构建成功。
- [ ] macOS 实机 Finder 导入和 Numbers/Excel CSV 打开检查；不同通讯录来源的导出格式人工验收。
- [ ] 按依赖顺序审查并合并此前 Draft PR；同步真实应用版本和安装包再宣布正式发布。

## 对过去工作的修正

库存检查发现目录原本已有基础 Color Contrast；因此以后不能仅因目录项命名不同就宣称无障碍颜色检查是全新类别，应比较其公式、标准覆盖范围和界面功能。当前 VCF→CSV 是有明确输入输出变化的新功能，选择复用旧通讯录页面以减轻 UI 维护成本。

## 下一次迭代的首要责任

项目 Draft 依赖栈已经较长；后续在新功能验收之后需要进行 PR 依赖审查、消除重复目录项、一次可靠的实机 macOS 安装包测试和版本发布。所有功能不得仅凭 AI 生成或提交成功宣称已完成。
