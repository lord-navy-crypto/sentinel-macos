# Controlled Workflows Ultra / 受控工作流

Sentinel treats **Git Pull** and **Download** differently from read-only Terminal Tools because both can change local state.

Sentinel 将 **Git Pull** 和 **Download** 与只读 Terminal Tools 区分处理，因为二者都会改变本机状态。

## Git Pull

### Purpose / 用途

Update an existing local Git working tree without turning Sentinel into a general command runner.

在不把 Sentinel 变成自由命令执行器的前提下，更新一个已有的本地 Git 工作区。

### How to use / 如何使用

1. Enter an absolute repository path. / 输入仓库绝对路径。
2. Run **Preview**. Sentinel resolves the real Git top-level path and reads the current branch, upstream and worktree state. / 运行 **Preview**；Sentinel 会解析真实仓库根目录并读取当前分支、上游和工作区状态。
3. Execution is offered only when the worktree is clean and a readable upstream exists. / 只有工作区干净且存在可读取的 upstream 时才出现执行按钮。
4. Confirm the second prompt. The only supported mutation is `git pull --ff-only`. / 再次确认；唯一允许的变更是 `git pull --ff-only`。
5. Review the before/after commit IDs and Git output. / 检查执行前后 commit ID 和 Git 输出。

### Caution / 注意

Sentinel does **not** reset, stash, switch branches, resolve conflicts or interactively request credentials. A non-fast-forward update stops instead of being forced. Controlled Git mutations are disabled in ephemeral mode.

Sentinel **不会**自动 reset、stash、切换分支、解决冲突或交互式索取凭据。无法 fast-forward 时会停止，而不是强制处理。Ephemeral 模式下禁止受控 Git 变更。

## Controlled Download

### Purpose / 用途

Create one new file from a bounded HTTPS source while keeping destination and network-address boundaries explicit.

从受限 HTTPS 来源创建一个新文件，同时明确限制目标目录和网络地址范围。

### How to use / 如何使用

1. Enter a credential-free `https://` URL. / 输入不含账号凭据的 `https://` URL。
2. Choose a destination that already has a parent directory inside your resolved `~/Downloads` tree. / 目标文件的父目录必须已存在，并位于解析后的 `~/Downloads` 内。
3. Run **Preview**. Preview is read-only and does not create directories or files. / 运行 **Preview**；预览完全只读，不创建目录或文件。
4. Confirm the second prompt to start the transfer. / 再次确认后开始传输。
5. On success Sentinel reports the destination, byte count and SHA-256. / 成功后 Sentinel 显示目标、字节数和 SHA-256。

### Safety boundary / 安全边界

- HTTPS only; redirects must remain HTTPS. / 仅 HTTPS，重定向也必须保持 HTTPS。
- Local, loopback, link-local and private-network destinations are rejected. / 拒绝本机、回环、链路本地和私有网络目标。
- Maximum transfer size is 512 MiB. / 最大传输 512 MiB。
- Existing files are never overwritten; exclusive create is required. / 永不覆盖已有文件，必须独占新建。
- Partial files are removed after a failed transfer. / 传输失败后清理未完成文件。
- Destination parents must already exist; Preview does not create them. / 父目录必须预先存在，Preview 不会创建。
- Controlled downloads are disabled in ephemeral mode. / Ephemeral 模式下禁止受控下载。

## Task Center

Git preflight, Git Pull, Download preflight and Download execution all appear in the bottom-left Floating Task Center. Their total work is generally not measurable in advance, so they use **indeterminate** progress rather than invented percentages.

Git preflight、Git Pull、Download preflight 和实际下载都会进入左下角 Floating Task Center。由于总工作量通常无法提前准确知道，它们使用 **indeterminate** 状态，而不是伪造百分比。
