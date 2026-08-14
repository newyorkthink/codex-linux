# Initial Window Icon

这个本地 overlay feature 只负责恢复 Linux 主窗口创建时的图标。

上游迁移到官方 Linux 包后，不再从旧的 webview icon asset 为 `BrowserWindow` 注入图标；在 i3/X11 下这会导致窗口标题栏/i3bar 无法获得应用图标。

本 feature 在主 `BrowserWindow` 构造阶段加入 `resources/icon-chatgpt.png`，不修改用户的 i3 配置，也不向 `~/.local/share/applications/` 写入文件。

该目录作为构建时 overlay 复制到上游 `linux-features/initial-window-icon/`，因此必须保留本 README、`feature.json` 与 `patch.js`。
