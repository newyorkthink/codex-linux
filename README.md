# Codex Desktop Linux Builds

[中文](#中文) | [English](#english)

## 中文

这是一个面向 Linux 的公开自动构建仓库。目前有两条构建来源：`chatgpt-desktop.AppImage` 直接使用 OpenAI 官方 Linux amd64 DEB；其余 Codex Desktop AppImage 与原生包使用上游项目 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。

本仓库只保存公开的构建配置、独立托盘修复、独立 Linux 标题栏主题兼容补丁和说明，不包含私人配置、私有仓库内容、账号凭据、访问令牌或其他个人数据。

当前应用是 ChatGPT Desktop 运行时，不是只包含 Codex 的客户端；桌面应用可提供 Chat、Work 和 Codex，具体功能仍由 OpenAI 账号、套餐和工作区权限控制。按照 OpenAI 当前说明，符合条件时 Desktop 的 Work 可以在用户授权后访问本机文件和目录；参考 [`ChatGPT Work and Codex`](https://help.openai.com/en/articles/20001275/)。

### 三个 AppImage 版本

固定使用 [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release，并用固定文件名区分三个版本：

| 文件 | 内容 | 适用情况 |
| --- | --- | --- |
| `chatgpt-desktop.AppImage` | **OpenAI 官方 DEB 直封版**。直接下载 OpenAI 官方 Linux amd64 DEB，复用 DEB 自带的 `ChatGPT`、`resources`、desktop 文件和 PNG 图标，只用 quick-sharun 补齐 AppImage 运行环境；不应用本仓库 i3bar 源码补丁。 | 优先使用官方 DEB 作为应用来源、希望减少中间打包层时使用。 |
| `codex-desktop-stock-x86_64.AppImage` | **官方核心原版（Stock）**。通过 `ilysenko/codex-desktop-linux` 构建，按字节保留当前 OpenAI 官方 Linux 包的 `resources/app.asar`，并沿用其中的 Electron 运行时和配套工具；不启用本仓库的 i3bar 源码补丁，也不替换运行时。 | 上游已经修复托盘，或需要完全避开本仓库托盘修改时使用。 |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar 修复版（Fixed）**。在 Stock 基础上应用已经实机验证的独立托盘补丁，把缺少 XEmbed 的 Owl 替换为同版本标准 Electron，并组合独立的 Linux 标题栏浅色主题兼容补丁。 | 当前 Kali Linux + i3wm / classic i3bar 需要显示 ChatGPT 托盘图标，或需要修复浅色主题右上角窗口按钮对比度时使用。 |

`chatgpt-desktop.AppImage` 的应用来源直接是 OpenAI 官方 DEB，但最终 AppImage 外层仍由本仓库用 quick-sharun 重新封装，因此它**不是 OpenAI 官方发布的 AppImage**。Stock 文件名中的“官方核心原版”表示官方 `resources/app.asar` 按字节保留，官方包内的 Electron 运行时和配套工具不做托盘相关替换；只有 Linux AppImage 外层、启动脚本、图标和社区包身份由上游打包项目生成。

Release 还提供 Debian / Ubuntu `.deb`、Fedora / openSUSE `.rpm`、Arch Linux `.pkg.tar.zst` 和 `SHA256SUMS.txt`。这些原生包仍来自 `ilysenko/codex-desktop-linux` 构建链路，当前使用 i3bar Fixed 内容；如果检测到旧修复不再适用于新上游，则只发布始终独立可用的 Stock AppImage，避免强行套用旧补丁。

### ChatGPT Desktop 与 Codex CLI 配置隔离

三个 AppImage 都在外层启动器中为 ChatGPT Desktop 使用同一个独立 `CODEX_HOME`：

```text
ChatGPT Desktop AppImage -> ~/.codex-chatgpt-desktop
主机 Codex CLI          -> ~/.codex
```

这样做只影响本仓库发布的三个 AppImage，不修改主机 shell 环境，不写入 `~/.zshrc`，也不会修改、覆盖或迁移现有 `~/.codex`。即使启动 AppImage 的环境中已经设置了普通 `CODEX_HOME`，AppImage 默认也不会继承该值，而是使用独立目录；如确实需要给 Desktop 指定其他位置，可只在启动 AppImage 时设置 `CHATGPT_DESKTOP_CODEX_HOME=/path/to/directory`。

隔离原因是 OpenAI Codex 将 `CODEX_HOME` 作为配置和本地状态根目录；如果 ChatGPT Desktop 与主机 Codex CLI 共用 `~/.codex`，CLI 中的自定义 model provider、`base_url`、MCP、认证和其他本地状态也可能被 Desktop 读取。对于 Voice / Realtime 等能力，这可能导致 Desktop 把请求发到 CLI 使用的兼容 API/provider，而不是预期的 ChatGPT 后端。AppImage 启动器会先创建独立目录，再导出 `CODEX_HOME`，避免这类交叉污染。

`chatgpt-desktop.AppImage` 与现有 Stock / Fixed 不再各自建立新的目录，而是统一复用 `~/.codex-chatgpt-desktop`。因此已经在 Stock / Fixed 中使用这套 Desktop Codex 状态时，官方 DEB 直封版也会读取同一个 Desktop 专用目录；主机 Codex CLI 仍独立使用 `~/.codex`。

因为认证和本地状态也随 `CODEX_HOME` 隔离，首次使用新的 AppImage 独立目录时可能需要重新登录。不要为了“继承配置”直接把整个 `~/.codex` 复制到 `~/.codex-chatgpt-desktop`，否则会把原本需要隔离的 provider、MCP 和其他 CLI 配置一起复制过去。

这项修改只位于 AppImage 外层启动器，不修改官方 `resources/app.asar`。`.deb`、`.rpm` 和 `.pkg.tar.zst` 仍保持上游原生包的 `CODEX_HOME` 行为，不应用这项 AppImage 专用隔离。

### i3bar 修复版改了什么

修复代码全部收纳在 [`variants/i3bar-fixed/`](variants/i3bar-fixed/) 中，与 Stock 构建完全分离：

1. 同时修改当前 `main-*.js` 和 `window-all-closed-*.js` 两个 bundle，恢复 Linux 单参数 `Tray` 构造、对象强引用、就绪回退和生命周期。
2. 将缺少 classic i3bar 所需 `GtkStatusIcon` / XEmbed 后端的 Owl 运行时替换为完全相同版本的标准 Electron。
3. 按标准 Electron ABI 重新编译 `better-sqlite3` 和 `node-pty`。
4. 发布前校验 Electron 官方 SHA256、两个托盘 bundle 合同、两个原生模块和五个 `gtk_status_icon_*` 符号。
5. 以独立组件修复 Linux `titleBarOverlay` 浅色主题背景：深色主题保持上游原值，浅色主题仅把 overlay 背景切换为 `#ffffff`，不删除最小化、最大化或关闭按钮，也不启用 `frameless-titlebar`。

托盘稳定基线与标题栏主题兼容层彼此分离：托盘逻辑仍保留在既有 `patch.js` 中；标题栏逻辑位于 [`components/titlebar-overlay-theme/`](variants/i3bar-fixed/overlay-features/linux-tray-single-arg/components/titlebar-overlay-theme/)，由 `combined.js` 组合。若以后上游已经提供主题感知的标题栏背景，该标题栏补丁会保持源码字节不变；如果标题栏 helper 合同变化或匹配不唯一，也只跳过该可选兼容层，不会把旧标题栏补丁强行套到新上游。更详细的边界与退役条件见 [`variants/i3bar-fixed/README.md`](variants/i3bar-fixed/README.md)。

2026-08-15 已完成 Kali Linux + i3wm 托盘实机验收：i3bar 出现 ChatGPT 托盘图标，右键菜单可以正常打开。完整托盘排查过程见 [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md)。

### 自动构建与上游更新保护

两个 GitHub Actions 工作流都只发布到固定的 [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release。两个 workflow 使用不同的 concurrency group，因此 Codex 与官方 DEB 构建可以并行执行；进入最终发布步骤前，较新的 run 只等待更早且仍未完成的这两个构建工作流，避免同时改写 `latest` Release。`ilysenko/codex-desktop-linux` 上游每 30 分钟检查一次；OpenAI 官方 DEB 每 6 小时检查一次指纹。相同上游版本不会重复自动构建，`workflow_dispatch` 可手动强制重建；工作流不使用 `actions/upload-artifact`。

Codex Desktop 构建严格按以下顺序执行：

1. 克隆并锁定本轮上游提交后，只修改上游 AppImage 的 `AppRun` 模板，加入 Desktop 专用 `CODEX_HOME` 隔离；该修改不进入 `resources/app.asar`，也不用于原生包。
2. 用空 feature 配置构建并校验 Stock AppImage，确保没有启用或应用任何本仓库源码补丁，并检查最终 AppImage staging 中仍包含独立 `CODEX_HOME` 启动配置。
3. 再检查当前官方托盘 bundle 合同和 Electron 主版本；只有仍匹配已验证托盘基线时，才构建 i3bar Fixed，并再次检查其 AppImage staging 中的独立 `CODEX_HOME` 配置。
4. i3bar Fixed 内的标题栏主题补丁单独判断自己的 helper 合同：已由上游修复时保持字节不变，未知或重复合同时跳过并报告警告，不参与严格托盘合同，也不会因为这个可选外观层单独阻断已验证的托盘构建。
5. 如果上游已经修改托盘实现、直接完成 i3bar 修复或升级 Electron 主版本，旧托盘修复会自动跳过，Stock 仍可正常发布，不会因旧托盘补丁漂移拖垮整个 Action。
6. 托盘合同仍匹配时，严格托盘补丁、ABI、运行库或产物校验失败都会终止发布，禁止生成部分托盘修复包。

官方 DEB 直封流程独立执行：下载并校验 OpenAI 官方 amd64 DEB，使用 DEB 自带 desktop/PNG 和应用目录，通过 Arch AnyLinux + quick-sharun 收集运行依赖；quick-sharun 生成 `AppRun.sh` 后只在外层启动器中加入与 Stock / Fixed 相同的 `CODEX_HOME=~/.codex-chatgpt-desktop` 隔离，再生成 `chatgpt-desktop.AppImage`。该流程不应用 i3bar 修复，也不应用本仓库的应用源码补丁。

### 对主机系统的影响

三个 AppImage 都不会自动安装或替换主机 Electron，不修改 `/usr`、`/etc`、i3 配置或 `~/.local/share/applications`，也不新增系统服务和开机启动项。AppImage 会在需要时创建并使用 `~/.codex-chatgpt-desktop` 作为 ChatGPT Desktop 的独立 Codex 配置和本地状态目录；主机 Codex CLI 原有的 `~/.codex` 保持不变。

AppImage 的显示大小不要求与官方 `.deb` 或旧构建一致：外层文件系统会重新压缩，Fixed 还会替换运行时。因此体积差异本身不代表缺文件。Stock 的核心一致性由 `app.asar` 按字节比较保证；Fixed 另有补丁、ABI、原生模块、符号和最终解包校验；官方 DEB 直封版则记录官方 DEB 与原始 `resources/app.asar` 的 SHA256，并由 quick-sharun 生成可携带运行环境。

### 上游与声明

本仓库不是 OpenAI 官方项目，也不是任何上游项目的官方发布渠道。`chatgpt-desktop.AppImage` 的应用来源为 OpenAI 官方 Linux amd64 DEB，但 AppImage 外层由本仓库重新封装；`codex-desktop-stock-x86_64.AppImage`、`codex-desktop-i3bar-fixed-x86_64.AppImage` 及原生包的 Linux 打包逻辑来自 [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux)。请同时参考对应上游说明与许可证。

---

## English

This public repository provides two Linux build paths: `chatgpt-desktop.AppImage` is repackaged directly from OpenAI's official Linux amd64 DEB, while the other Codex Desktop AppImages and native packages are built from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux).

It stores only public build configuration, the isolated tray workaround, the isolated Linux titlebar-theme compatibility patch, and documentation. It contains no private configuration, private-repository content, credentials, access tokens, or other personal data.

The application is the ChatGPT desktop runtime rather than a Codex-only client. Chat, Work, and Codex availability still depends on the OpenAI account, plan, and workspace permissions. OpenAI documents that eligible desktop Work sessions can access local files and folders after the user grants permission; see [`ChatGPT Work and Codex`](https://help.openai.com/en/articles/20001275/).

### Three AppImage variants

The rolling [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release uses stable filenames:

| File | Contents | Use when |
| --- | --- | --- |
| `chatgpt-desktop.AppImage` | **Direct official-DEB repack**. Downloads OpenAI's official Linux amd64 DEB, reuses its `ChatGPT`, `resources`, desktop entry, and PNG icon, and uses quick-sharun only to provide the portable AppImage runtime. No repository i3bar source patch is applied. | Prefer the official DEB as the direct application source with fewer intermediate packaging layers. |
| `codex-desktop-stock-x86_64.AppImage` | **Stock official core**. Built through `ilysenko/codex-desktop-linux`; byte-for-byte preserves the current official OpenAI Linux package's `resources/app.asar` and retains its Electron runtime and bundled tools, with no repository i3bar source patch or runtime replacement. | Upstream has fixed the tray or no repository tray changes are wanted. |
| `codex-desktop-i3bar-fixed-x86_64.AppImage` | **i3bar Fixed**. Applies the independently maintained and machine-verified tray workaround, replaces Owl with stock Electron of the same version, and composes an isolated Linux light-theme titlebar compatibility patch. | ChatGPT needs a visible tray icon in classic i3bar or the light-theme top-right window controls need correct contrast. |

`chatgpt-desktop.AppImage` uses the official OpenAI DEB as its application source, but the outer AppImage is still repackaged by this repository with quick-sharun, so it is **not an OpenAI-official AppImage**. “Stock official core” means that official `resources/app.asar` is preserved byte-for-byte while the outer Linux AppImage, launcher, icons, and community package identity are produced by the upstream packaging project.

The Release also provides DEB, RPM, Arch Linux, and SHA256 files. Those native packages are still produced through the `ilysenko/codex-desktop-linux` build path and use the i3bar Fixed payload while the verified workaround remains applicable.

### ChatGPT Desktop and Codex CLI configuration isolation

All three AppImage variants use the same AppImage-only `CODEX_HOME`:

```text
ChatGPT Desktop AppImage -> ~/.codex-chatgpt-desktop
Host Codex CLI           -> ~/.codex
```

This affects only the three AppImages published by this repository. It does not modify the host shell environment, `~/.zshrc`, or the existing `~/.codex`. The AppImage intentionally does not inherit a generic `CODEX_HOME` from the launching environment. To use a different Desktop-only location intentionally, set `CHATGPT_DESKTOP_CODEX_HOME=/path/to/directory` when launching the AppImage.

The separation prevents Desktop from unintentionally inheriting Codex CLI model providers, custom `base_url` values, MCP configuration, authentication, and other local state. For Voice / Realtime features, sharing the CLI home can otherwise route Desktop requests through a CLI-compatible provider instead of the expected ChatGPT backend. The AppImage launcher creates the dedicated directory before exporting `CODEX_HOME`.

The direct official-DEB repack does not create another Desktop home: it uses the same `~/.codex-chatgpt-desktop` already used by Stock / Fixed. The host Codex CLI remains on `~/.codex`.

Because authentication and local state are also separated, the first launch with a new Desktop directory may require signing in again. Do not copy the entire host `~/.codex` into the Desktop directory if the purpose is to keep CLI providers and other CLI configuration isolated.

This change is limited to the outer AppImage launcher and does not modify official `resources/app.asar`. DEB, RPM, and Arch packages retain the upstream native `CODEX_HOME` behavior.

### Fixed variant changes

All workaround code is isolated under [`variants/i3bar-fixed/`](variants/i3bar-fixed/):

1. Patch both the current `main-*.js` and `window-all-closed-*.js` bundles for Linux one-argument `Tray` construction, strong retention, readiness fallbacks, and lifecycle.
2. Replace the Owl runtime that lacks the classic-i3bar GtkStatusIcon/XEmbed backend with stock Electron of the exact same version.
3. Rebuild `better-sqlite3` and `node-pty` for the stock Electron ABI.
4. Verify the Electron SHA256, both tray bundle contracts, both native modules, and all five required `gtk_status_icon_*` symbols before publishing.
5. Apply a separate Linux `titleBarOverlay` light-theme compatibility component: dark mode keeps the upstream background, light mode changes only the overlay background to `#ffffff`, while minimize/maximize/close controls remain enabled and `frameless-titlebar` stays disabled.

The validated tray baseline and the titlebar compatibility layer are kept separate. Existing tray logic remains in `patch.js`; the titlebar component lives under [`components/titlebar-overlay-theme/`](variants/i3bar-fixed/overlay-features/linux-tray-single-arg/components/titlebar-overlay-theme/) and is composed by `combined.js`. If upstream later provides a theme-aware titlebar background, the titlebar component leaves the source byte-identical. If that helper contract drifts or is duplicated, the optional titlebar layer is skipped rather than forcing an old patch onto a new upstream bundle. See [`variants/i3bar-fixed/README.md`](variants/i3bar-fixed/README.md) for the detailed boundaries and retirement behavior.

On 2026-08-15 the Fixed AppImage passed a real Kali Linux + i3wm tray check: the ChatGPT tray icon appeared in i3bar and its context menu opened normally. See [`TRAY_DEBUG_HISTORY.md`](TRAY_DEBUG_HISTORY.md) for the tray investigation record.

### Automation and upstream-drift protection

Both GitHub Actions workflows publish only to the rolling [`latest`](https://github.com/newyorkthink/codex-linux/releases/tag/latest) Release. They use separate concurrency groups so the Codex and official-DEB builds can run in parallel. Before mutating the Release, a newer run waits only for an older still-active run from these two build workflows, preventing simultaneous writes to `latest`. The `ilysenko/codex-desktop-linux` upstream is checked every 30 minutes; the official OpenAI DEB fingerprint is checked every six hours. Unchanged upstream versions are not rebuilt automatically, while `workflow_dispatch` can force a rebuild. No `actions/upload-artifact` storage is used.

The Codex Desktop build first applies only the AppImage launcher isolation to the upstream AppRun template, then builds the Stock AppImage with an empty feature configuration and validates that no repository source patch was applied. The workflow verifies the generated Stock AppImage staging still contains the isolated `CODEX_HOME`. It enables the Fixed variant only while the official tray bundle still matches the verified tray contract and Electron remains on the supported major version. Inside that Fixed build, the titlebar component evaluates its own helper contract independently: an upstream theme-aware implementation is left byte-identical, while an unknown or duplicate helper shape is skipped with a warning and does not by itself block the validated tray build. If upstream changes or fixes the tray, the old tray workaround is skipped while Stock still publishes. When the known tray contract still matches, tray patch, ABI, runtime, and package validation remains fail-closed.

The direct official-DEB workflow separately verifies and extracts OpenAI's official amd64 DEB, reuses the DEB-provided desktop entry and PNG icon, and deploys runtime dependencies with Arch AnyLinux + quick-sharun. After quick-sharun creates `AppRun.sh`, only the outer launcher receives the same `CODEX_HOME=~/.codex-chatgpt-desktop` isolation used by Stock / Fixed before `chatgpt-desktop.AppImage` is generated. No i3bar source fix or other repository application-source patch is applied.

### Host impact

None of the three AppImages installs or replaces the host Electron, modifies `/usr`, `/etc`, i3 configuration, or `~/.local/share/applications`, or adds a system service or autostart entry. The AppImages create and use `~/.codex-chatgpt-desktop` when needed for ChatGPT Desktop's isolated Codex configuration and local state; the host Codex CLI's existing `~/.codex` is left unchanged.

An AppImage is not expected to have the same displayed size as the official `.deb` or an older build: its outer filesystem is recompressed, and Fixed also replaces the runtime. A size difference does not by itself indicate missing files. Stock integrity is enforced by a byte-for-byte `app.asar` comparison; Fixed additionally checks patches, ABI, native modules, symbols, and the final extracted bundles; the direct official-DEB repack records the official DEB and original `resources/app.asar` SHA256 values and uses quick-sharun for the portable runtime.

### Upstream and disclaimer

This repository is not an official OpenAI project or an official release channel for any upstream. `chatgpt-desktop.AppImage` uses OpenAI's official Linux amd64 DEB as its application source, but the AppImage wrapper is community-packaged by this repository. The Linux packaging logic for `codex-desktop-stock-x86_64.AppImage`, `codex-desktop-i3bar-fixed-x86_64.AppImage`, and the native packages comes from [`ilysenko/codex-desktop-linux`](https://github.com/ilysenko/codex-desktop-linux). Refer to the corresponding upstream documentation and licensing as well.
