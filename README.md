# Codex Desktop Linux Builds

[中文](#中文) | [English](#english)

## 中文

这是一个面向 Linux 的公开自动构建仓库，构建来源为上游项目 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。

本仓库只保存公开的构建配置与说明，不包含私人配置、私有仓库内容、账号凭据、访问令牌或其他个人数据。

### 发布内容

固定使用 `latest` Release，提供：

- AppImage
- Debian / Ubuntu `.deb`
- Fedora / openSUSE `.rpm`
- Arch Linux `.pkg.tar.zst`
- `SHA256SUMS.txt`

### 自动构建

GitHub Actions 每 30 分钟检查一次上游 `main`。只有检测到尚未发布的新提交时才进行完整构建，也可以通过 `workflow_dispatch` 手动强制重新构建。构建继续使用当前上游与当前官方 Linux 应用资源；打包前会把缺少 XEmbed 后端的 Owl 运行时替换为同版本标准 Electron，并为它重新编译原生模块。

构建完成后会替换固定的 `latest` Release。仓库不使用 `actions/upload-artifact` 保存构建产物，最终软件包只保存在 Release 中。

### 托盘图标排查记录

Linux system tray / i3bar 图标的排查证据统一记录在 [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md)。最终定位不是 PNG：官方 Owl 42.3 二进制没有 classic i3bar 所需的 `gtk_status_icon_*` / XEmbed 后端，而同版本标准 Electron 仍包含它。CI 会同时恢复拆分 bundle 中的两段 tray 兼容逻辑、替换运行时、按新 ABI 重编译 `better-sqlite3` 与 `node-pty`，并在发布前硬性验证五个 GtkStatusIcon 符号。

### 上游与声明

本仓库不是 OpenAI 官方项目，也不是上游项目的官方发布渠道。应用代码与 Linux 打包逻辑来自 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)，请同时参考上游项目的说明与许可证。

---

## English

This is a public automated Linux build repository based on the upstream project [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux).

This repository stores only public build configuration and documentation. It does not contain private configuration, private-repository content, account credentials, access tokens, or other personal data.

### Release packages

A single rolling `latest` Release provides:

- AppImage
- Debian / Ubuntu `.deb`
- Fedora / openSUSE `.rpm`
- Arch Linux `.pkg.tar.zst`
- `SHA256SUMS.txt`

### Automation

GitHub Actions checks upstream `main` every 30 minutes. A full build runs only when a new commit has not yet been published; `workflow_dispatch` can also force a rebuild. The build keeps the current upstream and official Linux application resources, then replaces the Owl runtime that lacks XEmbed with stock Electron of the same version and rebuilds native modules for it.

After a successful build, the fixed `latest` Release is replaced. The workflow does not use `actions/upload-artifact`; final packages are stored only in the Release.

### Tray debugging history

All Linux system-tray evidence is tracked in [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md). The root cause is native: Owl 42.3 lacks the `gtk_status_icon_*` / XEmbed backend required by classic i3bar, while stock Electron of the same version retains it. CI restores both tray-compatibility paths in the split bundles, swaps the runtime, rebuilds `better-sqlite3` and `node-pty` for the new ABI, and requires all five GtkStatusIcon symbols before publishing.

### Upstream and disclaimer

This repository is not an official OpenAI project and is not an official release channel of the upstream project. Application code and Linux packaging logic come from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux). Refer to the upstream project for its documentation and license.
