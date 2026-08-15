# Linux Tray Registration Compatibility

This overlay restores the complete tray behavior that existed in the older working Linux build path.

The current official bundle contains two coupled conditions that can suppress the Linux StatusNotifier item:

1. Electron `Tray` receives a second `undefined` argument on Linux.
2. The newly created tray is immediately destroyed while the upstream tray flag is false.

Fixing only the constructor still permits immediate destruction. Fixing only retention leaves the two-argument Linux constructor that upstream PR `ilysenko/codex-desktop-linux#1247` identified as preventing StatusNotifier registration. This feature changes both conditions atomically, while preserving the Windows GUID path and the non-Linux feature gate.

It does not modify i3, write user-level `.desktop` files, patch `BrowserWindow` icons, enable the optional Dock-icon feature, or add AppIndicator libraries. The patch fails on upstream contract drift instead of publishing a partially modified bundle.
