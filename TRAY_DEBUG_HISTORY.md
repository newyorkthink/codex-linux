# Codex Linux 托盘图标排查记录 / Linux Tray Debug History

> 目的：记录已经做过、已经失败、已经确认无效或仅解决部分问题的方案，避免后续再次重复试错。
>
> 当前验收目标只有一个：**Codex 运行后必须在 i3bar 的 system tray / StatusNotifier 区域出现一个真实的小图标。**
> 这不是 i3 workspace/window title 图标问题，也不是普通任务栏窗口图标问题。

## 当前结论

- 用户环境中的 i3bar system tray 本身正常，其他应用图标正常显示。
- Codex 主窗口能够正常启动，但 **Codex 没有在 system tray 中出现图标**。
- 2026-08-15 对最终 AppImage 的原生运行时做符号级对比后确认了根因：官方 Owl 42.3 二进制完全没有 `gtk_status_icon_new`、`gtk_status_icon_set_from_pixbuf`、`gtk_status_icon_set_tooltip_text`、`gtk_status_icon_set_visible`、`gtk_status_icon_position_menu`。
- classic i3bar tray 使用 XEmbed；同版本标准 Electron 42.3 仍导入上述五个 GtkStatusIcon 符号。因此 Owl 无法在该 i3bar 中创建可见图标，任何只改 `app.asar` JavaScript 的补丁都无法补回缺失的原生后端。
- 当前策略保留最新上游与当前官方 Linux 应用资源，同时恢复拆分 bundle 中缺失的两段 tray 兼容逻辑；随后把 Owl 替换为同版本标准 Electron，并按标准 Electron ABI 重编译 `better-sqlite3` 与 `node-pty`。
- 根因已定位到 2026-08-12 上游 PR `#1317` 的官方 Linux 包迁移：迁移把旧工作路径中的核心 `linux-tray` 兼容补丁整体移除，改为默认保留官方 `app.asar`。
- 当前官方 bundle 同时存在两个直接的注册/销毁条件：Linux `Tray` 仍收到第二个 `undefined` 参数，并且上游 tray flag 为 false 时会立即执行 `tray.destroy()`。
- 组合修复提交 `98ada1d` / Action `31852548909` 已同时处理这两项并成功发布，但用户实机仍无图标，证明旧工作路径还有关键生命周期逻辑没有恢复。
- 对比最后一个迁移前提交 `4da3436f` 后确认，旧 `linux-tray` 还会把缺失的非标准 `Tray.whenReady()` / `Tray.isReady()` 当作 ready，并用模块级变量强引用原始 Electron `Tray`。这些代码在迁移时一起被删除。
- Stock Electron 没有上述两个非标准方法；当前 main bundle 的 `qTe.waitForReady()` / `qTe.isReady()` 会调用导入的 `r.W` / `r.S`，而真正的 Linux false fallback 位于 `.vite/build/window-all-closed-*.js`，不是 main bundle。托盘包装器因此把正常的 Electron Tray 判成未就绪。
- 之前的 retention-only、single-argument-only 以及 constructor+gate 组合构建都没有恢复这套 readiness/strong-reference 逻辑，所以均未出现 StatusNotifier 图标。
- 单纯修改 `BrowserWindow` 图标、`.desktop`、`StartupWMClass`、Dock icon 都不能证明 StatusNotifier 已注册。
- 上游已经有与此症状高度一致的历史问题：
  - `#1052`：Stock Electron tray readiness/lifetime 兼容问题。
  - `#1054`：Linux tray icon fallback 在重构后丢失。
  - `#1098`：GNOME/X11 中 Codex 没有注册 StatusNotifier item。
  - `#1100`：即使做了 tray retention，仍然可能完全没有 StatusNotifier 注册。
  - `#1247`：**明确修复：Linux 上调用 Electron `Tray` 时只传 1 个参数，恢复 StatusNotifier tray registration。**
- 因此后续不能再把“构建成功 / 图标文件存在 / `setIcon()` 被调用”当作“托盘已修复”的证据。

## 已尝试方案与结果

### 1. 用户级 `.desktop` / XDG 图标注册

做过：

- 尝试让 AppImage 启动时写入用户级 desktop entry / icon。
- 目标路径包括 `~/.local/share/applications/` 和用户图标目录。
- 尝试用 `StartupWMClass`、`Icon=`、desktop identity 帮助桌面环境识别应用。

结果：**无效于当前 system tray 问题。**

原因：这主要影响 launcher、窗口分组、任务栏/桌面图标解析，不负责创建 `org.kde.StatusNotifierItem-*`。

规则：**后续不得再次把 XDG desktop 注册当成 system tray 修复。**

### 2. `BrowserWindow` constructor `icon`

做过：

- 在 `new BrowserWindow({...})` 参数中注入 Linux icon。
- 还尝试把 `icon` 放到参数最后，避免后续 spread 覆盖。

结果：**无效于 system tray。**

原因：这是窗口 `_NET_WM_ICON` / taskbar icon 层面，不负责 Electron `Tray` 的 StatusNotifier 注册。

规则：**后续不得再次用 BrowserWindow constructor icon 作为 system tray 主修复。**

### 3. `BrowserWindow.setIcon()` / `ready-to-show`

做过：

- 恢复过旧版 Linux `win.setIcon(...)` 路径。
- 在窗口 ready 后再次设置 icon。

结果：**无效于 system tray。**

规则：窗口图标与 tray registration 分开处理。

### 4. 上游 `ui-tweaks -> appearance.dockIcon`

做过：

- 启用上游 `ui-tweaks`。
- 启用 `tweaks.appearance.dockIcon.enabled=true`。
- 验证 `appearance-dock-icon-main-process` 和 settings patch 已 applied。
- 验证 `icon-chatgpt.png` 与 `sync-desktop-icon.sh` 存在。

结果：**当前 i3bar system tray 仍无 Codex 图标。**

说明：该功能负责图标选择/同步，能调用 BrowserWindow `setIcon()`、tray `setImage()`、desktop icon 同步；但如果底层 Electron Tray 根本没有成功注册 StatusNotifier，它不能凭空创建可见 tray item。

上游 `#1100` 的维护者还明确要求：排查核心 tray 时应先关闭所有 optional features，避免 Dock icon tweak 干扰归因。

规则：**核心 tray 修复验证阶段不要依赖 optional Dock icon tweak。**

### 5. 自定义 `native-linux-tray` retention overlay

做过：

- 新增 `overlay-features/native-linux-tray`。
- 匹配：`new Tray(...); if(!FLAG) return tray.destroy(), null;`
- 修改成 Linux 不进入立即 destroy 分支。
- 第一版还额外校验了 minified flag（例如 `W9`）声明。

第一次结果：**Action 失败。**

失败原因：minified flag 声明形状发生漂移，额外 `W9` 声明校验过严。

后续修复：

- 删除多余的 flag declaration 校验。
- 只保留唯一 Tray destruction gate 匹配。
- Action `31809697451` 构建成功并发布。

最终运行结果：**仍然没有 system tray 图标。**

关键结论：这重复了上游 `#1099/#1100` 已知结论——**“保留 Tray JS 对象”本身并不足以保证 StatusNotifier 注册成功。**

规则：**不得再把单纯 retention patch 当作完整修复。**

### 6. `libayatana-appindicator3-1` 猜测

当前状态：**没有证据证明是 AppImage 漏包该库导致。**

原因：Electron 的 `Tray` 在 Linux 上走其自身 StatusNotifier/AppIndicator 实现；真正需要验证的是 Codex 进程是否成功创建并注册 StatusNotifier item。

规则：以后必须以实际 D-Bus/StatusNotifier 注册证据判断，不再仅凭“可能缺某个库”猜测。

### 7. 单独的 Linux 单参数 Tray 构造补丁

做过：

- 只把 Linux 的 `new Tray(icon, undefined)` 改成单参数 `new Tray(icon)`。
- Windows GUID 路径保持不变，并关闭 Dock-icon 与旧 retention 实验。
- Action `31837061805` 成功构建并发布。

最终运行结果：**仍然没有 system tray 图标。**

原因：当前 bundle 紧接着仍执行 `if (!trayEnabled) return tray.destroy(), null`；构造成功后立即销毁，单独修构造参数不能保留 StatusNotifier item。

规则：**不得再单独应用 constructor-only 或 retention-only 补丁；两个条件必须在同一个原子补丁中同时验证和修改。**

### 8. constructor + gate 组合修复

做过：

- 在同一个原子补丁中让 Linux 使用单参数 `new Tray(icon)`。
- Linux 绕过当前 `trayEnabled=false` 的立即 `destroy()` 分支。
- Windows GUID 与非 Linux gate 行为保持不变。
- Action `31852548909` 成功构建并发布。

最终运行结果：**用户在 i3 实机再次确认，仍然没有 system tray 图标。**

新定位：该补丁只恢复了旧 `linux-tray` 的后半段。最后一个迁移前实现还包含 `whenReady` / `isReady` 的 stock-Electron fallback 和原始 `Tray` 强引用；2026-08-12 的官方 Linux 包迁移将整套 core patch 删除，但迁移审计本身记录 `linux-tray` 对官方 bundle 仍为 `applies`。

规则：**不得再把 constructor + gate 两项称作“完整旧版托盘路径”；必须同时恢复 readiness fallback 与强引用。**

### 9. 完整逻辑第一次移植到错误的 bundle

做过：

- 提交 `f2640c4` 增加 readiness fallback、强引用、单参数构造和 gate 保留。
- 本地合成 fixture 测试通过后触发 Action `31854124586`。

结果：**Action 在真实官方包的 patch 阶段失败，没有发布软件包。**

失败日志：`Expected exactly one current Linux Tray.whenReady fallback, found 0`。

精确原因：当前 main bundle 只包含 `qTe.waitForReady(){return r.W(this.tray)}` 与 `qTe.isReady(){return r.S(this.tray)}`；`r.W` / `r.S` 的实现已拆到导入的 `window-all-closed-*.js`。第一次移植仍按迁移前单 bundle 布局只扫描 main，因此找不到 readiness contract。

修正：feature 现在使用两个 descriptor：`main-bundle` 修改构造与生命周期，`extracted-app:pre-webview` 唯一定位并修改 readiness helper chunk。已下载并校验官方 `chatgpt_26.810.50856_amd64.deb`（SHA256 `e3b47c1298e01e4a2aa54f120eb169834c6911bd295122bc43e5cd1642c1a4ba`），在其原始完整 `app.asar` 上通过上游 patch runner、两个真实 bundle 的语法和最终 verifier 测试。

规则：**readiness fallback 必须在 helper chunk 中验证；不得再假定所有 tray 代码都在 main bundle。**

## 上游关键证据

### `#1100`：retention 修复存在，但仍无 tray

上游报告明确写到：

- `#1099` retention fix 已经存在；
- Electron 主进程正常；
- 系统 StatusNotifier watcher 正常；
- 其他应用可以注册 tray；
- Codex-owned StatusNotifier item 仍然不存在。

这直接证明“再补一次 retention”不是正确的下一步。

参考：<https://github.com/ilysenko/codex-desktop-linux/issues/1100>

### `#1247`：Linux Tray 必须用单参数构造

上游 PR 的 Summary 明确写明：

> call Electron `Tray` with one argument on Linux ... restoring StatusNotifier tray registration

也就是：

- Windows 保留 GUID 第二参数；
- Linux **只传 icon 一个参数**；
- 该修改的目的就是恢复当前 upstream 下的 StatusNotifier tray registration。

参考：<https://github.com/ilysenko/codex-desktop-linux/pull/1247>

这条是目前最重要、与当前症状最直接的已验证方向。

同时，`#1247` 合并时的历史 `applyLinuxTrayPatch` 已经包含 tray retention；PR 新增的是在该保留路径上再规范化 Linux 构造参数。因此只复制 PR 的 constructor 变化、却删除 retention，并不等价于 `#1247` 的完整工作状态。

## 当前失败构建的完整结论

- retention-only 构建 `31809697451`：Tray 不再被 gate 销毁，但 Linux 仍使用两参数构造；实机无图标。
- single-argument-only 构建 `31837061805`：Linux 改为单参数构造，但 Tray 仍被 gate 销毁；实机截图再次确认无图标。
- constructor + gate 组合构建 `31852548909`：两项同时修复后实机仍无图标；这排除了“只要组合这两项即可”的假设。
- 三轮结果与迁移前源码对照证明：这不是 i3bar 配置、BrowserWindow 图标或 desktop entry 问题；迁移时被删掉的 readiness fallback 与原始 Tray 强引用同样属于可见托盘路径。

Action 成功只能证明静态补丁和打包通过；最终仍以用户实机 StatusNotifier / i3bar 图标为验收。

## 下一步固定策略

1. 继续跟随上游 `main` 并使用当前官方 Linux 应用资源，不回退 ChatGPT 代码。
2. 在当前拆分 bundle 中同时应用 tray 注册补丁与 readiness/强引用补丁，缺少任一命中都禁止打包。
3. 下载与官方包声明版本完全一致的标准 Linux Electron，并校验官方 SHA256。
4. 为标准 Electron ABI 重编译 `better-sqlite3` 与 `node-pty`；CI 必须实际加载两个模块，并确认打包后的运行时含五个 `gtk_status_icon_*` 符号。
5. 不启用额外 Dock-icon / `.desktop` overlay；用户实际 i3bar 截图仍是最终验收，在此之前不得标记“已修复”。

## 禁止重复犯错

- 不再把 **窗口图标** 当成 **system tray**。
- 不再用 `.desktop` 注册解释 StatusNotifier 缺失。
- 不再仅靠 `setIcon()` / `setImage()` 判断 tray 已存在。
- 不再重复单纯 retention 修复。
- 不再在同一轮同时叠加多个互相影响的 optional feature。
- 不再因为 Action green 就声称运行时问题已经解决。
- 不再反复触发完整 Action；先完成源码/上游对照和静态验证，再触发一次有明确假设的构建。

## 当前状态

**此前的 split-bundle-only 构建已被实机否定。当前改动保留完整 split-bundle overlay，并新增同版本标准 Electron 替换与原生 ABI 重编译；托盘专项 Node 测试 8/8、真实 AppImage 打包及运行时/原生模块校验均已通过，Release 构建和用户实机验收仍待完成。**

最后一次用户实机验证对象是 Owl 42.3 构建：AppImage 主窗口正常，i3bar system tray 中仍没有 ChatGPT 小图标。
