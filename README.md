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

GitHub Actions 每 30 分钟检查一次上游 `main` 的最新提交。只有检测到尚未发布的新提交时才进行完整构建；同一个上游提交不会重复自动构建。也可以通过 `workflow_dispatch` 手动强制重新构建。

构建完成后会替换固定的 `latest` Release。仓库不使用 `actions/upload-artifact` 保存构建产物，最终软件包只保存在 Release 中。

### 托盘图标排查记录

Linux system tray / i3bar 图标的已尝试方案、失败原因、上游证据和禁止重复事项统一记录在 [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md)。当前构建分别修改当前的 main bundle 与 `window-all-closed` helper bundle，恢复 stock Electron 就绪回退、原始 `Tray` 强引用、Linux 单参数构造和避免立即销毁；不修改用户的 i3 配置，也不启用 Dock-icon / `.desktop` 实验。

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

GitHub Actions checks upstream `main` every 30 minutes. A full build runs only when a new upstream commit has not yet been published, so the same upstream revision is not rebuilt automatically. `workflow_dispatch` can also force a manual rebuild.

After a successful build, the fixed `latest` Release is replaced. The workflow does not use `actions/upload-artifact`; final packages are stored only in the Release.

### Tray debugging history

All attempted Linux system-tray fixes, failed approaches, upstream evidence, and no-repeat rules are tracked in [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md). The current build patches both current bundle locations to restore stock-Electron readiness fallbacks, a strong raw `Tray` reference, one-argument Linux construction, and prevention of immediate destruction. It does not modify i3 or enable the Dock-icon / `.desktop` experiments.

### Upstream and disclaimer

This repository is not an official OpenAI project and is not an official release channel of the upstream project. Application code and Linux packaging logic come from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux). Refer to the upstream project for its documentation and license.
