# Linux Titlebar Overlay Theme Compatibility

This component is intentionally isolated from the validated i3bar tray repair. It only addresses the official Linux `titleBarOverlay` helper where the caption-button symbols already follow `nativeTheme.shouldUseDarkColors` but the overlay background remains fixed. That mismatch makes the top-right minimize/maximize/close controls effectively disappear in the light theme while the dark theme remains correct.

The patch changes only the helper's `color` field: dark mode keeps the official existing background value, while light mode uses `#ffffff`. The existing symbol-color branches, overlay height, window construction, zoom refresh, theme refresh, menu behavior, and tray logic are left unchanged.

## Upstream-safe behavior

The component is deliberately non-blocking and fail-closed:

- If exactly one known fixed-background helper is present, only that helper is patched.
- If a theme-aware helper is already present, the source is left byte-identical with no warning. This covers this patch being applied twice and an upstream implementation that already fixes the background.
- If the contract is duplicated or changes into an unrecognized shape, the source is left byte-identical and a warning is emitted instead of forcing an old patch onto a new upstream bundle.
- Its descriptor sets `enforceWhenEnabled: false`, so future upstream titlebar changes cannot make the validated tray build fail solely because this cosmetic compatibility layer no longer applies.

The component does not enable `frameless-titlebar` and does not remove Electron's minimize, maximize, or close controls.
