# Linux Single-Argument Tray

该 overlay 只解决一个已知问题：Linux 上 Electron `Tray` 必须只接收图标这一个参数。

依据：上游 `ilysenko/codex-desktop-linux` PR #1247 明确说明，Linux 使用单参数 `Tray` 可恢复 StatusNotifier tray registration；Windows 继续保留 GUID 第二参数。

本 feature 不修改 i3 配置、不注册用户级 `.desktop`、不修改 `BrowserWindow` 图标、不启用 `ui-tweaks` Dock icon，也不做额外 Tray retention。这样可以单独验证核心 system tray 注册问题。
