"use strict";

const MARKER = "codexLinuxSingleArgTray";

// Current official Linux bundle shape seen in 26.810.41047:
//   tray = new Electron.Tray(icon.defaultIcon,
//     process.platform === `win32` && Electron.app.isPackaged ? guid(buildFlavor) : void 0)
//
// Upstream PR #1247 proved that Linux must call Electron Tray with exactly one
// argument for StatusNotifier registration, while Windows keeps the GUID path.
const CURRENT_TRAY_CONSTRUCTOR =
  /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\.Tray\((([A-Za-z_$][\w$]*)\.defaultIcon),process\.platform===`win32`&&\2\.app\.isPackaged\?([A-Za-z_$][\w$]*)\(([^()]*)\):void 0\)/g;

function applyLinuxSingleArgumentTray(source) {
  if (typeof source !== "string") return source;
  if (source.includes(MARKER)) return source;

  CURRENT_TRAY_CONSTRUCTOR.lastIndex = 0;
  const matches = [...source.matchAll(CURRENT_TRAY_CONSTRUCTOR)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one current two-argument Electron Tray constructor, found ${matches.length}`,
    );
  }

  const match = matches[0];
  const [current, trayVar, electronVar, iconExpr, , guidFunction, guidArg] = match;
  const replacement =
    `${trayVar}=/*${MARKER}*/new ${electronVar}.Tray(...(process.platform===\`linux\`?` +
    `[${iconExpr}]:[${iconExpr},process.platform===\`win32\`&&${electronVar}.app.isPackaged?` +
    `${guidFunction}(${guidArg}):void 0]))`;

  return source.slice(0, match.index) +
    current.replace(current, replacement) +
    source.slice(match.index + current.length);
}

module.exports = {
  MARKER,
  applyLinuxSingleArgumentTray,
  descriptors: [
    {
      id: "single-argument-tray-on-linux",
      phase: "main-bundle",
      order: 20_970,
      ciPolicy: "optional",
      apply: applyLinuxSingleArgumentTray,
    },
  ],
};
