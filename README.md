# Codex Desktop Linux Builds

[中文](#中文) | [English](#english)

## 中文

这是一个面向 Linux 的公开自动构建仓库。目前有两条构建来源：`chatgpt-desktop.AppImage` 直接使用 OpenAI 官方 Linux amd64 DEB；其余 Codex Desktop AppImage 与原生包使用上游项目 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。

本仓库只保存公开构建配置、独立托盘修复、独立 Linux 标题栏主题兼容补丁和说明，不包含私人配置、私有仓库内容、账号凭据、访问令牌或其他个人数据。

### 三个 AppImage 版本

固定使用 [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release：

| 文件 | 内容 | 适用情况 |
| --- | --- | --- |
| `chatgpt-desktop.AppImage` | **OpenAI 官方 DEB 直封版**。直接下载官方 Linux amd64 DEB，复用其中的 `ChatGPT`、`resources`、desktop 文件和 PNG 图标，用 quick-sharun 补齐 AppImage 运行环境。`resources/app.asar` 不做源码修改；AppImage 启动入口直接进入 `ChatGPT`。 | 优先使用官方 DEB 作为应用来源、希望减少中间打包层时使用。 |
| `codex-desktop-stock-x86_64.AppImage` | **官方核心原版（Stock）**。通过 `ilysenko/codex-desktop-linux` 构建，按字节保留当前 OpenAI 官方 Linux 包的 `resources/app.asar`，不应用本仓库 i3bar 源码补丁。 | 上游已经修复托盘，或需要完全避开本仓库托盘修改时使用。 |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar 修复版（Fixed）**。在 Stock 基础上应用已经实机验证的托盘补丁，并组合独立的 Linux 标题栏浅色主题兼容补丁。 | Kali Linux + i3wm / classic i3bar 需要显示 ChatGPT 托盘图标，或需要修复浅色主题窗口按钮对比度时使用。 |

`chatgpt-desktop.AppImage` 的应用来源是 OpenAI 官方 DEB，但 AppImage 外层由本仓库重新封装，因此它**不是 OpenAI 官方发布的 AppImage**。

Release 还提供 Debian / Ubuntu `.deb`、Fedora / openSUSE `.rpm`、Arch Linux `.pkg.tar.zst` 和 `SHA256SUMS.txt`。这些原生包来自 `ilysenko/codex-desktop-linux` 构建链路。

### ChatGPT Desktop 启动链与 Voice / Realtime

官方 DEB 中 `/usr/bin/chatgpt` 指向 `codex-launcher`。对于本仓库的 `chatgpt-desktop.AppImage`，最终稳定启动链明确固定为：

```text
AppRun.sh
  -> ChatGPT
```

同时保留包内的 `codex-launcher` 文件，但它**不参与 AppImage 启动链**；兼容入口 `chatgpt` 也直接解析到 `ChatGPT`。

这样做只改变 AppImage 外层入口，不修改官方 `resources/app.asar` 或应用源码。构建脚本会进行 fail-closed 校验：`MAIN_BIN` 必须是 `ChatGPT`，`chatgpt` 必须解析到 `ChatGPT`，并且 `codex-launcher` 文件仍必须存在；任何一项漂移都会直接终止构建。

2026-08-21 实机验证：直封版原先在 Voice / Realtime 出现的 `http://127.0.0.1:7860/v1/live` `401 Unauthorized`，在 AppImage 启动链改为直接进入 `ChatGPT` 后不再复现。因此后续维护中不要把直封版入口重新切回 `codex-launcher`，除非有新的上游证据和完整实机回归验证。

### ChatGPT Desktop 与 Codex CLI 配置隔离

三个 AppImage 都使用同一个 Desktop 专用 `CODEX_HOME`：

```text
ChatGPT Desktop AppImage -> ~/.codex-chatgpt-desktop
主机 Codex CLI          -> ~/.codex
```

该隔离只作用于本仓库发布的 AppImage，不修改主机 shell 环境，不写入 `~/.zshrc`，也不会修改、覆盖或迁移现有 `~/.codex`。如需为 Desktop 指定其他位置，可只在启动 AppImage 时设置：

```text
CHATGPT_DESKTOP_CODEX_HOME=/path/to/directory
```

隔离用于避免 Desktop 继承主机 Codex CLI 的自定义 model provider、`base_url`、MCP、认证和其他本地状态。`chatgpt-desktop.AppImage`、Stock 和 Fixed 统一复用 `~/.codex-chatgpt-desktop`；主机 Codex CLI 继续使用 `~/.codex`。

不要为了继承配置直接把整个 `~/.codex` 复制到 `~/.codex-chatgpt-desktop`，否则会把原本需要隔离的 CLI provider、MCP 和其他配置一起带过去。

需要区分两件事：`CODEX_HOME` 隔离继续保留；2026-08-21 已确认的直封版 Voice / Realtime 401 修复则来自**直接启动 `ChatGPT`、绕过 `codex-launcher`**，不是删除或改回 `CODEX_HOME`。

`.deb`、`.rpm` 和 `.pkg.tar.zst` 仍保持上游原生 `CODEX_HOME` 行为，不应用这项 AppImage 专用隔离。

### i3bar 修复版

修复代码全部收纳在 [`variants/i3bar-fixed/`](variants/i3bar-fixed/) 中，与 Stock 构建分离。主要内容包括：

1. 修复 Linux 托盘构造、对象强引用、就绪回退和生命周期。
2. 将缺少 classic i3bar 所需 `GtkStatusIcon` / XEmbed 后端的 Owl 运行时替换为相同版本的标准 Electron。
3. 按标准 Electron ABI 重新编译 `better-sqlite3` 和 `node-pty`。
4. 发布前严格校验 Electron SHA256、托盘 bundle 合同、原生模块和 `gtk_status_icon_*` 符号。
5. 以独立组件处理 Linux `titleBarOverlay` 浅色主题背景，不影响深色主题，也不删除最小化、最大化或关闭按钮。

详细边界与退役条件见 [`variants/i3bar-fixed/README.md`](variants/i3bar-fixed/README.md)。完整托盘排查过程见 [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md)。

2026-08-15 已完成 Kali Linux + i3wm 托盘实机验收：i3bar 出现 ChatGPT 托盘图标，右键菜单可正常打开。

### 自动构建与上游更新保护

两个 GitHub Actions 工作流都只发布到固定的 [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release。Codex 与官方 DEB 构建可以并行执行，但进入最终发布步骤前会避免同时改写 `latest` Release。

- `ilysenko/codex-desktop-linux` 上游每 30 分钟检查一次。
- OpenAI 官方 DEB 每 6 小时检查一次指纹。
- 相同上游版本不会重复自动构建。
- `workflow_dispatch` 可手动强制重建。
- 工作流不使用 `actions/upload-artifact` 保存中间产物。

官方 DEB 直封流程会下载并校验 OpenAI 官方 amd64 DEB，使用 DEB 自带 desktop/PNG 和应用目录，通过 Arch AnyLinux + quick-sharun 收集运行依赖；随后固定 `MAIN_BIN=ChatGPT`、确认 `chatgpt -> ChatGPT`、保留 `codex-launcher` 文件，并在外层 `AppRun.sh` 注入 `CODEX_HOME=~/.codex-chatgpt-desktop`，最后生成 `chatgpt-desktop.AppImage`。该流程不应用 i3bar 修复，也不修改官方 `resources/app.asar`。

### 对主机系统的影响

三个 AppImage 都不会自动安装或替换主机 Electron，不修改 `/usr`、`/etc`、i3 配置或 `~/.local/share/applications`，也不新增系统服务和开机启动项。AppImage 只会在需要时创建并使用 `~/.codex-chatgpt-desktop` 作为 Desktop 专用 Codex 配置和本地状态目录。

AppImage 体积不要求与官方 `.deb` 或旧构建一致；外层文件系统会重新压缩，Fixed 还会替换运行时。体积差异本身不代表缺文件。直封版会记录官方 DEB、原始 `resources/app.asar` 和最终 AppImage 的 SHA256。

### 上游与声明

本仓库不是 OpenAI 官方项目，也不是任何上游项目的官方发布渠道。`chatgpt-desktop.AppImage` 的应用来源为 OpenAI 官方 Linux amd64 DEB，但 AppImage 外层由本仓库重新封装；其他 AppImage 与原生包的 Linux 打包逻辑来自 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。

---

## English

This public repository provides two Linux build paths: `chatgpt-desktop.AppImage` is repackaged directly from OpenAI's official Linux amd64 DEB, while the other Codex Desktop AppImages and native packages are built through [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux).

The repository contains only public build configuration, the isolated tray workaround, the isolated Linux titlebar compatibility patch, and documentation. It contains no private configuration, credentials, access tokens, or other personal data.

### Three AppImage variants

The rolling [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release uses stable filenames:

| File | Contents | Use when |
| --- | --- | --- |
| `chatgpt-desktop.AppImage` | **Direct official-DEB repack**. Reuses the official `ChatGPT`, `resources`, desktop entry, and PNG icon, with quick-sharun providing the portable AppImage runtime. Official `resources/app.asar` is not source-patched, and the AppImage starts `ChatGPT` directly. | Prefer the official DEB as the direct application source. |
| `codex-desktop-stock-x86_64.AppImage` | **Stock official core**. Built through `ilysenko/codex-desktop-linux`; preserves the current official `resources/app.asar` byte-for-byte and does not apply this repository's i3bar patch. | Upstream tray behavior is already sufficient or repository tray changes are not wanted. |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar Fixed**. Applies the machine-verified tray workaround and the isolated Linux light-theme titlebar compatibility layer. | A visible tray icon is required in classic i3bar or light-theme window controls need corrected contrast. |

The direct-DEB AppImage uses OpenAI's official DEB as its application source, but the outer AppImage is repackaged by this repository and is **not an OpenAI-official AppImage**.

### ChatGPT Desktop launch chain and Voice / Realtime

The official DEB exposes `/usr/bin/chatgpt` through `codex-launcher`. The stable AppImage contract in this repository is intentionally different:

```text
AppRun.sh
  -> ChatGPT
```

`codex-launcher` remains packaged, but it is **not part of the AppImage startup chain**. The compatibility entry `chatgpt` also resolves directly to `ChatGPT`.

This changes only the outer AppImage entry point and does not modify official `resources/app.asar` or application source. The build fails closed unless `MAIN_BIN=ChatGPT`, `chatgpt` resolves to `ChatGPT`, and the packaged `codex-launcher` still exists.

On 2026-08-21, the previously reproduced Voice / Realtime failure at `http://127.0.0.1:7860/v1/live` with `401 Unauthorized` no longer reproduced after the direct-DEB AppImage was changed to launch `ChatGPT` directly. Future maintenance should therefore not restore `codex-launcher` as the AppImage entry without new upstream evidence and full runtime regression testing.

### ChatGPT Desktop and Codex CLI configuration isolation

All three AppImage variants use the same Desktop-only `CODEX_HOME`:

```text
ChatGPT Desktop AppImage -> ~/.codex-chatgpt-desktop
Host Codex CLI           -> ~/.codex
```

This affects only the AppImages published by this repository. It does not modify the host shell environment, `~/.zshrc`, or the existing `~/.codex`. To intentionally use another Desktop-only location, launch with `CHATGPT_DESKTOP_CODEX_HOME=/path/to/directory`.

The isolation prevents Desktop from unintentionally inheriting Codex CLI model providers, custom `base_url` values, MCP configuration, authentication, and other local state. The direct official-DEB repack, Stock, and Fixed all reuse `~/.codex-chatgpt-desktop`; the host Codex CLI remains on `~/.codex`.

Do not copy the entire host `~/.codex` into the Desktop directory if the purpose is to preserve provider and configuration isolation.

These are separate concerns: the `CODEX_HOME` isolation remains intentional, while the confirmed 2026-08-21 Voice / Realtime 401 fix came from **launching `ChatGPT` directly and bypassing `codex-launcher`**, not from removing or reverting the isolated `CODEX_HOME`.

Native DEB, RPM, and Arch packages retain their upstream `CODEX_HOME` behavior.

### i3bar Fixed

All workaround code is isolated under [`variants/i3bar-fixed/`](variants/i3bar-fixed/). It repairs the Linux tray lifecycle, replaces the Owl runtime with stock Electron of the same version where classic i3bar requires GtkStatusIcon/XEmbed support, rebuilds the native modules for the matching Electron ABI, validates the runtime and tray contract before publishing, and keeps the light-theme titlebar compatibility layer separate from the tray patch.

See [`variants/i3bar-fixed/README.md`](variants/i3bar-fixed/README.md) for detailed boundaries and retirement behavior, and [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md) for the tray investigation record.

On 2026-08-15 the Fixed AppImage passed a real Kali Linux + i3wm tray check: the ChatGPT tray icon appeared in i3bar and its context menu opened normally.

### Automation and upstream-drift protection

Both workflows publish only to the rolling [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release. The Codex upstream is checked every 30 minutes and the official OpenAI DEB fingerprint every six hours. Unchanged upstream versions are not rebuilt automatically; `workflow_dispatch` can force a rebuild.

The direct official-DEB workflow verifies and extracts OpenAI's amd64 DEB, reuses its desktop entry, PNG icon, and application directory, deploys runtime dependencies with Arch AnyLinux + quick-sharun, fixes the AppImage contract to `MAIN_BIN=ChatGPT` and `chatgpt -> ChatGPT`, keeps `codex-launcher` packaged but outside the startup chain, injects `CODEX_HOME=~/.codex-chatgpt-desktop` into the outer `AppRun.sh`, and then generates `chatgpt-desktop.AppImage`. No i3bar patch or official `resources/app.asar` source modification is applied.

### Host impact

None of the three AppImages installs or replaces host Electron, modifies `/usr`, `/etc`, i3 configuration, or `~/.local/share/applications`, or adds a system service or autostart entry. The AppImages only create and use `~/.codex-chatgpt-desktop` when needed for Desktop-specific Codex configuration and local state.

AppImage size is not expected to match the official `.deb` or older builds because the outer filesystem is recompressed, and Fixed also replaces the runtime. A size difference alone does not indicate missing files. The direct-DEB build records SHA256 values for the official DEB, original `resources/app.asar`, and final AppImage.

### Upstream and disclaimer

This repository is not an official OpenAI project or an official release channel for any upstream. `chatgpt-desktop.AppImage` uses OpenAI's official Linux amd64 DEB as its application source, but its AppImage wrapper is community-packaged by this repository. The other AppImages and native Linux packages are built through [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux).