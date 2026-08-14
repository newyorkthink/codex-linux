# Native Linux Tray Retention

This local overlay restores the native Electron system tray retention behavior that existed in the older Linux build path.

It is intentionally narrow: on Linux only, it prevents the current upstream tray factory from immediately destroying the newly-created `Tray` object while the upstream tray-enabled flag is false. Windows/macOS behavior is unchanged.

The patch is contract-checked against the current minified main bundle. If upstream changes the tray factory or fixes the behavior itself, the patch fails instead of silently publishing an unverified package.
