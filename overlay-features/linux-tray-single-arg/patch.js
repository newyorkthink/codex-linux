"use strict";

const MARKER = "codexLinuxTrayRegistrationFix";

// Current official Linux bundle shape:
//   tray = new Electron.Tray(icon.defaultIcon,
//     process.platform === `win32` && Electron.app.isPackaged ? guid(buildFlavor) : void 0);
//   if (!trayEnabled) return tray.destroy(), null;
//
// The older working wrapper fixed both conditions together: Linux passed one
// argument to Electron Tray and did not destroy that Tray behind the upstream
// feature gate. Applying only one half leaves the tray absent.
const CURRENT_TRAY_FACTORY =
  /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\.Tray\((([A-Za-z_$][\w$]*)\.defaultIcon),process\.platform===`win32`&&\2\.app\.isPackaged\?([A-Za-z_$][\w$]*)\(([^()]*)\):void 0\);if\(!([A-Za-z_$][\w$]*)\)return \1\.destroy\(\),null;/g;

function applyLinuxTrayRegistrationFix(source) {
  if (typeof source !== "string") return source;
  if (source.includes(MARKER)) return source;

  CURRENT_TRAY_FACTORY.lastIndex = 0;
  const matches = [...source.matchAll(CURRENT_TRAY_FACTORY)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one current Electron Tray factory and destruction gate, found ${matches.length}`,
    );
  }

  const match = matches[0];
  const [
    current,
    trayVar,
    electronVar,
    iconExpr,
    ,
    guidFunction,
    guidArg,
    enabledFlag,
  ] = match;
  const replacement =
    `${trayVar}=/*${MARKER}*/new ${electronVar}.Tray(...(process.platform===\`linux\`?` +
    `[${iconExpr}]:[${iconExpr},process.platform===\`win32\`&&${electronVar}.app.isPackaged?` +
    `${guidFunction}(${guidArg}):void 0]));` +
    `if(process.platform!==\`linux\`&&!${enabledFlag})return ${trayVar}.destroy(),null;`;

  return source.slice(0, match.index) +
    current.replace(current, replacement) +
    source.slice(match.index + current.length);
}

module.exports = {
  CURRENT_TRAY_FACTORY,
  MARKER,
  applyLinuxTrayRegistrationFix,
  descriptors: [
    {
      id: "linux-tray-registration",
      phase: "main-bundle",
      order: 20_970,
      ciPolicy: "optional",
      apply: applyLinuxTrayRegistrationFix,
    },
  ],
};
