# i3bar Fixed 独立修复版

此目录只保存已经通过 Kali Linux + i3wm 实机验收的托盘修复，以及与托盘逻辑完全分离的 Linux 标题栏主题兼容补丁，不包含 Stock 原版构建逻辑。Stock 原版会按字节保留当前官方 Linux 包的 `resources/app.asar`，沿用包内 Electron 运行时和配套工具，并且不会引用本目录中的任何补丁或运行时替换脚本；AppImage 外层仍由社区上游打包项目生成。

## 最终修复内容

1. 在当前 `main-*.js` 中恢复 Linux 单参数 `Tray` 构造、原始 `Tray` 强引用，并阻止当前 feature gate 在 Linux 上立即销毁托盘。
2. 在拆分的 `window-all-closed-*.js` 中恢复 Stock Electron 的 `whenReady()` / `isReady()` 就绪回退。
3. 把缺少 classic i3bar 所需 XEmbed 后端的 Owl 运行时替换为完全相同版本的标准 Electron。
4. 按标准 Electron ABI 重新编译 `better-sqlite3` 和 `node-pty`，并在打包前实际加载两个模块。
5. 校验 Electron 官方 SHA256、两个最终 bundle、五个 `gtk_status_icon_*` 符号和最终 AppImage 内容。
6. 独立修复官方 Linux `titleBarOverlay` 在浅色主题下仍保留深色背景、导致右上角最小化/最大化/关闭按钮难以看见的问题；深色主题沿用官方原值，浅色主题仅把 overlay 背景切换为 `#ffffff`。

稳定修复逻辑位于：

- `overlay-features/linux-tray-single-arg/patch.js`：仅修改托盘 JavaScript 合同，保持既有稳定基线不变。
- `overlay-features/linux-tray-single-arg/components/titlebar-overlay-theme/`：仅修改标题栏 overlay 背景主题合同，与托盘修复分离；上游已经主题化或合同发生变化时不会强行修改。
- `overlay-features/linux-tray-single-arg/combined.js`：只负责组合托盘与标题栏两个独立 descriptor，不承载具体修复逻辑。
- `scripts/install-stock-electron-runtime.sh`：仅在构建目录内替换运行时和两个原生模块。
- `detect-upstream-contract.js`：在构建修复版前判断当前上游是否仍符合已验证托盘合同。

## AppImage 配置隔离边界

根目录工作流会同时为 Stock 和 i3bar Fixed 两个 AppImage 的外层 `AppRun` 设置独立 `CODEX_HOME`，默认使用 `~/.codex-chatgpt-desktop`，用于避免 ChatGPT Desktop 与主机 Codex CLI 的 `~/.codex` 共用 provider、MCP、认证和其他本地状态。该配置属于两个 AppImage 共用的外层启动逻辑，不属于本目录的托盘修复，也不会写入 `resources/app.asar`。

因此 i3bar Fixed 的托盘稳定基线仍只由本目录现有 split-bundle overlay、同版本标准 Electron 和原生模块 ABI 重编译组成；标题栏主题补丁作为独立兼容层组合进入同一修复版，不修改托盘 `patch.js` 的既有逻辑。不得把 `CODEX_HOME` 隔离混入托盘补丁本体。`.deb`、`.rpm` 和 Arch 原生包不使用 AppImage `AppRun`，保持上游原生 `CODEX_HOME` 行为。

## 与主机系统的边界

这些脚本只在 GitHub Actions 的临时构建目录中执行。修复版 AppImage 不安装或替换主机 Electron，不修改 `/usr`、`/etc`、i3 配置或 `~/.local/share/applications`，也不新增系统服务和开机启动项。应用运行时仍会产生 ChatGPT/Codex 正常的用户配置、状态和缓存；本仓库 AppImage 的 Codex 配置和本地状态默认位于 `~/.codex-chatgpt-desktop`，主机 Codex CLI 的 `~/.codex` 保持不变。

## 上游更新保护

- Stock 原版永远先独立构建并校验；修复版失败或停用不会污染 Stock 原版。
- 只有检测到当前已验证的未修复托盘 bundle 合同，并且 Electron 主版本仍为 `42` 时，才启用此修复版。
- 如果上游修改托盘代码、直接修复 i3bar，或升级 Electron 主版本，工作流会跳过修复版并继续发布 Stock 原版，避免旧补丁强行套用后导致整个 Action 失败。
- 标题栏主题补丁单独判断自己的 helper 合同：检测到上游已经改成主题感知背景时保持字节不变；遇到未知或重复合同时也保持字节不变并仅报告警告，不会让已验证的托盘构建因为这个可选兼容层失败。
- 不允许为了追随上游漂移而放宽唯一匹配、删除校验或改写当前已验证托盘补丁。需要适配新上游时，必须重新对照真实官方包并完成实机验收。

## 已验证基线

- 2026-08-15：Stock Electron `42.3`、原生 ABI `146`、`better-sqlite3`、`node-pty` 和五个 XEmbed 符号均通过构建校验。
- 用户已在 Kali Linux + i3wm 实机确认：i3bar 出现 ChatGPT 托盘图标，右键菜单可正常打开。
- 已确认修复不依赖用户级 `.desktop`、i3 配置、BrowserWindow 图标或 `libayatana-appindicator3-1` 猜测。
