# Codex Desktop Linux Builds

[中文](#中文) | [English](#english)

## 中文

这是一个面向 Linux 的公开自动构建仓库，构建来源为上游项目 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。

本仓库只保存公开的构建配置、独立托盘修复和说明，不包含私人配置、私有仓库内容、账号凭据、访问令牌或其他个人数据。

### 两个 AppImage 版本

固定使用 [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release，并用固定文件名区分两个版本：

| 文件 | 内容 | 适用情况 |
| --- | --- | --- |
| `codex-desktop-stock-x86_64.AppImage` | **官方核心原版（Stock）**。按字节保留当前 OpenAI 官方 Linux 包的 `resources/app.asar`，并沿用其中的 Electron 运行时和配套工具；不启用本仓库的 i3bar 源码补丁，也不替换运行时。 | 上游已经修复托盘，或需要完全避开本仓库托盘修改时使用。 |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar 修复版（Fixed）**。在 Stock 基础上应用已经实机验证的独立托盘补丁，并把缺少 XEmbed 的 Owl 替换为同版本标准 Electron。 | 当前 Kali Linux + i3wm / classic i3bar 需要显示 ChatGPT 托盘图标时使用。 |

Stock 文件名中的“官方核心原版”表示官方 `resources/app.asar` 按字节保留，官方包内的 Electron 运行时和配套工具不做托盘相关替换；只有 Linux AppImage 外层、启动脚本、图标和社区包身份由上游打包项目生成。因此它**不是 OpenAI 官方发布的 AppImage**，也不承诺整个文件与官方 `.deb` 按字节相同。

Release 还提供 Debian / Ubuntu `.deb`、Fedora / openSUSE `.rpm`、Arch Linux `.pkg.tar.zst` 和 `SHA256SUMS.txt`。当前原生包使用 i3bar Fixed 内容；如果检测到旧修复不再适用于新上游，则只发布始终独立可用的 Stock AppImage，避免强行套用旧补丁。

### i3bar 修复版改了什么

修复代码全部收纳在 [`variants/i3bar-fixed/`](variants/i3bar-fixed/) 中，与 Stock 构建完全分离：

1. 同时修改当前 `main-*.js` 和 `window-all-closed-*.js` 两个 bundle，恢复 Linux 单参数 `Tray` 构造、对象强引用、就绪回退和生命周期。
2. 将缺少 classic i3bar 所需 `GtkStatusIcon` / XEmbed 后端的 Owl 运行时替换为完全相同版本的标准 Electron。
3. 按标准 Electron ABI 重新编译 `better-sqlite3` 和 `node-pty`。
4. 发布前校验 Electron 官方 SHA256、两个补丁合同、两个原生模块和五个 `gtk_status_icon_*` 符号。

2026-08-15 已完成 Kali Linux + i3wm 实机验收：i3bar 出现 ChatGPT 托盘图标，右键菜单可以正常打开。完整排查过程见 [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md)。

### 自动构建与上游更新保护

GitHub Actions 每 30 分钟检查一次上游 `main`；同一个上游提交不会重复自动构建，也可以通过 `workflow_dispatch` 手动强制重新构建。工作流不使用 `actions/upload-artifact`，最终文件只保存到固定的 `latest` Release。

每轮构建严格按以下顺序执行：

1. 先用空 feature 配置构建并校验 Stock AppImage，确保没有启用或应用任何本仓库补丁。
2. 再检查当前官方 bundle 合同和 Electron 主版本；只有仍匹配已验证基线时，才构建 i3bar Fixed。
3. 如果上游已经修改托盘实现、直接完成修复或升级 Electron 主版本，旧修复会自动跳过，Stock 仍可正常发布，不会因旧补丁漂移拖垮整个 Action。
4. 当前合同仍匹配时，Fixed 的任一补丁、ABI、运行库或产物校验失败都会终止发布，禁止生成部分修复包。

### 对主机系统的影响

两个 AppImage 都不会自动安装或替换主机 Electron，不修改 `/usr`、`/etc`、i3 配置或 `~/.local/share/applications`，也不新增系统服务和开机启动项。应用运行时仍会产生 ChatGPT/Codex 正常的用户配置、状态和缓存。

AppImage 的显示大小不要求与官方 `.deb` 或旧构建一致：外层 SquashFS 会重新压缩，Fixed 还会替换运行时。因此类似 `513 MB` 与 `464 MiB` 的差异本身不代表缺文件；Stock 的核心一致性由 `app.asar` 按字节比较保证，Fixed 另有补丁、ABI、原生模块、符号和最终解包校验。

### 上游与声明

本仓库不是 OpenAI 官方项目，也不是上游项目的官方发布渠道。应用代码与 Linux 打包逻辑来自 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)，请同时参考上游项目的说明与许可证。

---

## English

This public repository automatically builds Linux packages from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux).

It stores only public build configuration, the isolated tray workaround, and documentation. It contains no private configuration, private-repository content, credentials, access tokens, or other personal data.

### Two AppImage variants

The rolling [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release uses stable filenames:

| File | Contents | Use when |
| --- | --- | --- |
| `codex-desktop-stock-x86_64.AppImage` | **Stock official core**. Byte-for-byte preserves the current official OpenAI Linux package's `resources/app.asar` and retains its Electron runtime and bundled tools; no repository i3bar source patch or runtime replacement is applied. | Upstream has fixed the tray or no repository tray changes are wanted. |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar Fixed**. Applies the independently maintained and machine-verified tray workaround, then replaces Owl with stock Electron of the same version. | ChatGPT needs a visible tray icon in classic i3bar. |

“Stock official core” means that official `resources/app.asar` is preserved byte-for-byte and the package's Electron runtime and bundled tools receive no tray-related replacement. The outer Linux AppImage, launcher, icons, and community package identity are still produced by the upstream packaging project. It is **not an OpenAI-official AppImage**, and the complete file is not claimed to be byte-identical to the official `.deb`.

The Release also provides DEB, RPM, Arch Linux, and SHA256 files. Native packages use the i3bar Fixed payload while the verified workaround remains applicable.

### Fixed variant changes

All workaround code is isolated under [`variants/i3bar-fixed/`](variants/i3bar-fixed/):

1. Patch both the current `main-*.js` and `window-all-closed-*.js` bundles for Linux one-argument `Tray` construction, strong retention, readiness fallbacks, and lifecycle.
2. Replace the Owl runtime that lacks the classic-i3bar GtkStatusIcon/XEmbed backend with stock Electron of the exact same version.
3. Rebuild `better-sqlite3` and `node-pty` for the stock Electron ABI.
4. Verify the Electron SHA256, both bundle contracts, both native modules, and all five required `gtk_status_icon_*` symbols before publishing.

On 2026-08-15 the Fixed AppImage passed a real Kali Linux + i3wm check: the ChatGPT tray icon appeared in i3bar and its context menu opened normally. See [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md) for the investigation record.

### Automation and upstream-drift protection

GitHub Actions checks upstream `main` every 30 minutes. The same upstream commit is not rebuilt automatically; `workflow_dispatch` may force a rebuild. No `actions/upload-artifact` storage is used, and final packages exist only in the rolling `latest` Release.

Each build first produces the Stock AppImage with an empty feature configuration. The workflow then enables the Fixed variant only when the official bundle still matches the verified contract and Electron remains on the supported major version. If upstream changes or fixes the tray, the old workaround is skipped while Stock still publishes. If the known contract still matches, every Fixed patch, ABI, runtime, and package check remains fail-closed.

### Host impact

Neither AppImage installs or replaces the host Electron, modifies `/usr`, `/etc`, i3 configuration, or `~/.local/share/applications`, or adds a system service or autostart entry. Normal ChatGPT/Codex user configuration, state, and cache files are still created while the application runs.

An AppImage is not expected to have the same displayed size as the official `.deb` or an older build: its outer SquashFS is recompressed, and Fixed also replaces the runtime. A difference such as `513 MB` versus `464 MiB` does not by itself indicate missing files. Stock integrity is enforced by a byte-for-byte `app.asar` comparison; Fixed additionally checks patches, ABI, native modules, symbols, and the final extracted bundles.

### Upstream and disclaimer

This repository is not an official OpenAI project or an official upstream release channel. Application code and Linux packaging logic come from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux). Refer to upstream documentation and licensing as well.
