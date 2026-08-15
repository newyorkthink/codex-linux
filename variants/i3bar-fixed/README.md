# i3bar Fixed 独立修复版

此目录只保存已经通过 Kali Linux + i3wm 实机验收的托盘修复，不包含 Stock 原版构建逻辑。Stock 原版会按字节保留当前官方 Linux 包的 `resources/app.asar`，沿用包内 Electron 运行时和配套工具，并且不会引用本目录中的任何补丁或运行时替换脚本；AppImage 外层仍由社区上游打包项目生成。

## 最终修复内容

1. 在当前 `main-*.js` 中恢复 Linux 单参数 `Tray` 构造、原始 `Tray` 强引用，并阻止当前 feature gate 在 Linux 上立即销毁托盘。
2. 在拆分的 `window-all-closed-*.js` 中恢复 Stock Electron 的 `whenReady()` / `isReady()` 就绪回退。
3. 把缺少 classic i3bar 所需 XEmbed 后端的 Owl 运行时替换为完全相同版本的标准 Electron。
4. 按标准 Electron ABI 重新编译 `better-sqlite3` 和 `node-pty`，并在打包前实际加载两个模块。
5. 校验 Electron 官方 SHA256、两个最终 bundle、五个 `gtk_status_icon_*` 符号和最终 AppImage 内容。

稳定修复逻辑位于：

- `overlay-features/linux-tray-single-arg/`：仅修改托盘 JavaScript 合同。
- `scripts/install-stock-electron-runtime.sh`：仅在构建目录内替换运行时和两个原生模块。
- `detect-upstream-contract.js`：在构建修复版前判断当前上游是否仍符合已验证合同。

## 与主机系统的边界

这些脚本只在 GitHub Actions 的临时构建目录中执行。修复版 AppImage 不安装或替换主机 Electron，不修改 `/usr`、`/etc`、i3 配置或 `~/.local/share/applications`，也不新增系统服务和开机启动项。应用运行时仍会产生 ChatGPT/Codex 正常的用户配置、状态和缓存。

## 上游更新保护

- Stock 原版永远先独立构建并校验；修复版失败或停用不会污染 Stock 原版。
- 只有检测到当前已验证的未修复 bundle 合同，并且 Electron 主版本仍为 `42` 时，才启用此修复版。
- 如果上游修改托盘代码、直接修复 i3bar，或升级 Electron 主版本，工作流会跳过修复版并继续发布 Stock 原版，避免旧补丁强行套用后导致整个 Action 失败。
- 不允许为了追随上游漂移而放宽唯一匹配、删除校验或改写当前已验证补丁。需要适配新上游时，必须重新对照真实官方包并完成实机验收。

## 已验证基线

- 2026-08-15：Stock Electron `42.3`、原生 ABI `146`、`better-sqlite3`、`node-pty` 和五个 XEmbed 符号均通过构建校验。
- 用户已在 Kali Linux + i3wm 实机确认：i3bar 出现 ChatGPT 托盘图标，右键菜单可正常打开。
- 已确认修复不依赖用户级 `.desktop`、i3 配置、BrowserWindow 图标或 `libayatana-appindicator3-1` 猜测。
