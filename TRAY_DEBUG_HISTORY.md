# Codex Linux 托盘图标排查记录 / Linux Tray Debug History

> 目的：记录已经做过、已经失败、已经确认无效或仅解决部分问题的方案，避免后续再次重复试错。
>
> 当前验收目标只有一个：**Codex 运行后必须在 i3bar 的 system tray / StatusNotifier 区域出现一个真实的小图标。**
> 这不是 i3 workspace/window title 图标问题，也不是普通任务栏窗口图标问题。

## 当前结论

- 用户环境中的 i3bar system tray 本身正常，其他应用图标正常显示。
- Codex 主窗口能够正常启动，但 **Codex 没有在 system tray 中出现图标**。
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

## 当前构建为什么仍然不可信

最近一次成功构建 `31809697451` 只能证明：

- patch descriptor applied；
- ASAR JS 语法正确；
- AppImage / DEB / RPM / Arch 包成功生成；
- Release 成功发布。

它**没有证明**：

- `new Tray(...)` 在 Linux 上以正确参数调用；
- StatusNotifier item 已注册；
- i3bar 能看到 Codex tray item。

因此以后 CI 不允许把“静态 grep 通过”写成“tray fixed”。

## 下一步固定策略

1. **先停止继续叠加 XDG / BrowserWindow / Dock-icon / retention 补丁。**
2. 以 `#1247` 为基线检查当前官方 Linux package 的实际 `new Tray(...)` 调用形状。
3. 如果当前官方 Linux bundle 又回到了 `new Tray(icon, undefined-or-guid)`，只做一件事：Linux 改成 **单参数 `new Tray(icon)`**，Windows 保持 GUID。
4. 核心 tray 验证先禁用所有 optional features，按上游维护者对 `#1100` 的要求隔离问题。
5. 只有核心 tray 正常后，再单独恢复 `ui-tweaks/dockIcon`；不能两者一起改，避免无法归因。
6. 每次发布前记录：上游 SHA、官方 package 版本、Tray constructor 形状、应用的 patch id。
7. 用户实际 i3bar 截图是最终验收；在此之前不得标记“已修复”。

## 禁止重复犯错

- 不再把 **窗口图标** 当成 **system tray**。
- 不再用 `.desktop` 注册解释 StatusNotifier 缺失。
- 不再仅靠 `setIcon()` / `setImage()` 判断 tray 已存在。
- 不再重复单纯 retention 修复。
- 不再在同一轮同时叠加多个互相影响的 optional feature。
- 不再因为 Action green 就声称运行时问题已经解决。
- 不再反复触发完整 Action；先完成源码/上游对照和静态验证，再触发一次有明确假设的构建。

## 当前状态

**未修复。**

最后一次用户实机验证：AppImage 主窗口正常，i3bar system tray 中仍没有 Codex 小图标。
