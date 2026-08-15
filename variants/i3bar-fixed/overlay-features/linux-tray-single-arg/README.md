# Complete Linux Tray Compatibility

This overlay restores the tray initialization and lifetime behavior from the last pre-migration Linux build (`ilysenko/codex-desktop-linux@4da3436f`). That code was retired when upstream switched to the official Linux package on 2026-08-12, even though the migration audit recorded `linux-tray` as still applying to the official bundle.

The patch applies four coupled repairs atomically:

1. Treat a missing nonstandard `Tray.whenReady()` method as ready, matching stock Electron.
2. Treat a missing nonstandard `Tray.isReady()` method as ready, matching stock Electron.
3. Keep a strong module-level reference to the raw Electron `Tray` object.
4. Call `new Tray(icon)` with exactly one argument on Linux and do not immediately destroy it behind the current upstream feature gate.

In the current official package, the first two fallbacks live in the imported `window-all-closed-*.js` helper chunk while construction and lifetime live in `main-*.js`. The feature therefore uses two descriptors and CI verifies both final files; targeting only the main bundle leaves the readiness failure untouched.

Windows retains its GUID second argument and its original feature-gate behavior. The patch fails on any incomplete or drifted bundle contract, and the package verifier checks the final built main bundle.

It does not modify i3, write user-level `.desktop` files, patch `BrowserWindow` icons, enable the optional Dock-icon feature, or add AppIndicator libraries.
