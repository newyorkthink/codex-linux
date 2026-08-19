"use strict";

const IDENT = "[A-Za-z_$][\\w$]*";

// Current official Linux titleBarOverlay helper. The background color is fixed,
// while the button symbol color already follows nativeTheme.shouldUseDarkColors.
const CURRENT_TITLEBAR_OVERLAY_HELPER = new RegExp(
  `function (${IDENT})\\((${IDENT})=1\\)\\{return\\{color:(${IDENT}),symbolColor:(${IDENT})\\.nativeTheme\\.shouldUseDarkColors\\?(${IDENT}):(${IDENT}),height:Math\\.round\\((${IDENT})\\*\\2\\)\\}\\}`,
  "g",
);

// A theme-aware helper means either this compatibility patch or upstream has
// already made the overlay background follow the native light/dark theme.
const THEME_AWARE_TITLEBAR_OVERLAY_HELPER = new RegExp(
  `function (${IDENT})\\((${IDENT})=1\\)\\{return\\{color:(${IDENT})\\.nativeTheme\\.shouldUseDarkColors\\?[^,{}]+:[^,{}]+,symbolColor:\\3\\.nativeTheme\\.shouldUseDarkColors\\?(${IDENT}):(${IDENT}),height:Math\\.round\\((${IDENT})\\*\\2\\)\\}\\}`,
  "g",
);

function matches(source, pattern) {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)];
}

function overlayHelperCandidates(source, pattern) {
  return matches(source, pattern).filter((match) =>
    source.includes(`.setTitleBarOverlay(${match[1]}(`),
  );
}

function titlebarOverlayThemeContract(source) {
  if (typeof source !== "string") return "drifted";
  const currentCount = overlayHelperCandidates(source, CURRENT_TITLEBAR_OVERLAY_HELPER).length;
  const themeAwareCount = overlayHelperCandidates(source, THEME_AWARE_TITLEBAR_OVERLAY_HELPER).length;

  if (currentCount === 1 && themeAwareCount === 0) return "current";
  if (currentCount === 0 && themeAwareCount === 1) return "theme-aware";
  return "drifted";
}

function applyLinuxTitlebarOverlayThemePatch(source) {
  if (typeof source !== "string") return source;

  const contract = titlebarOverlayThemeContract(source);
  if (contract === "theme-aware") return source;
  if (contract !== "current") {
    console.warn(
      "WARN: Could not find exactly one current Linux titleBarOverlay theme contract - skipping isolated titlebar theme patch",
    );
    return source;
  }

  const [match] = overlayHelperCandidates(source, CURRENT_TITLEBAR_OVERLAY_HELPER);
  const [
    currentHelper,
    helper,
    zoom,
    darkBackground,
    electron,
    darkThemeSymbol,
    lightThemeSymbol,
    height,
  ] = match;
  const replacement =
    `function ${helper}(${zoom}=1){return{color:${electron}.nativeTheme.shouldUseDarkColors?${darkBackground}:\`#ffffff\`,` +
    `symbolColor:${electron}.nativeTheme.shouldUseDarkColors?${darkThemeSymbol}:${lightThemeSymbol},` +
    `height:Math.round(${height}*${zoom})}}`;
  const patched =
    source.slice(0, match.index) +
    replacement +
    source.slice(match.index + currentHelper.length);

  if (titlebarOverlayThemeContract(patched) !== "theme-aware") {
    console.warn(
      "WARN: Linux titleBarOverlay theme patch did not produce a complete theme-aware contract - leaving source unchanged",
    );
    return source;
  }
  return patched;
}

module.exports = {
  CURRENT_TITLEBAR_OVERLAY_HELPER,
  THEME_AWARE_TITLEBAR_OVERLAY_HELPER,
  applyLinuxTitlebarOverlayThemePatch,
  titlebarOverlayThemeContract,
  descriptors: [
    {
      id: "linux-titlebar-overlay-theme",
      phase: "main-bundle",
      order: 20_960,
      ciPolicy: "optional",
      // This is an isolated cosmetic compatibility layer. If upstream fixes or
      // reshapes the helper, do not make the tray build fail just because this
      // optional contract no longer applies.
      enforceWhenEnabled: false,
      apply: applyLinuxTitlebarOverlayThemePatch,
    },
  ],
};
