"use strict";

const MARKER = "codexLinuxLegacyTrayCompatibility";
const LEGACY_MARKERS = [
  "codexLinuxTrayRegistrationFix",
  "codexLinuxSingleArgTray",
  "codexLinuxNativeTrayRetention",
];

// Stock Electron does not expose the custom Tray.whenReady()/Tray.isReady()
// methods expected by the upstream bundle. The retired pre-migration Linux
// patch treated an absent method as ready; the official bundle instead treats
// that absence as a Linux failure and never enables the tray.
const CURRENT_WHEN_READY_FALLBACK =
  /if\(typeof ([A-Za-z_$][\w$]*)\.whenReady!=`function`\)return process\.platform!==`linux`;try\{return await \1\.whenReady\(\),!0\}catch\{return!1\}/g;
const COMPATIBLE_WHEN_READY_FALLBACK =
  /if\(typeof ([A-Za-z_$][\w$]*)\.whenReady!=`function`\)return!0;try\{return await \1\.whenReady\(\),!0\}catch\{return!1\}/g;

const CURRENT_IS_READY_FALLBACK =
  /return typeof ([A-Za-z_$][\w$]*)\.isReady==`function`\?\1\.isReady\(\):process\.platform!==`linux`/g;
const COMPATIBLE_IS_READY_FALLBACK =
  /return typeof ([A-Za-z_$][\w$]*)\.isReady==`function`\?\1\.isReady\(\):!0/g;

// Current official Linux bundle shape:
//   tray = new Electron.Tray(icon.defaultIcon,
//     process.platform === `win32` && Electron.app.isPackaged ? guid(flavor) : void 0);
//   if (!trayEnabled) return tray.destroy(), null;
const CURRENT_TRAY_FACTORY =
  /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\.Tray\((([A-Za-z_$][\w$]*)\.defaultIcon),process\.platform===`win32`&&\2\.app\.isPackaged\?([A-Za-z_$][\w$]*)\(([^()]*)\):void 0\);if\(!([A-Za-z_$][\w$]*)\)return \1\.destroy\(\),null;/g;

const COMPATIBLE_TRAY_FACTORY =
  /([A-Za-z_$][\w$]*)=codexLinuxRegisterTray\(new ([A-Za-z_$][\w$]*)\.Tray\(\.\.\.\(process\.platform===`linux`\?\[((([A-Za-z_$][\w$]*)\.defaultIcon))\]:\[\3,process\.platform===`win32`&&\2\.app\.isPackaged\?([A-Za-z_$][\w$]*)\(([^()]*)\):void 0\]\)\)\);if\(process\.platform!==`linux`&&!([A-Za-z_$][\w$]*)\)return \1\.destroy\(\),null;/g;

function matches(source, pattern) {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)];
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function assertPatchedContract(source) {
  const checks = [
    ["compatibility marker", countOccurrences(source, MARKER), 1],
    ["legacy tray retention helper", countOccurrences(source, "codexLinuxRegisterTray=e=>"), 1],
    ["legacy tray reference", countOccurrences(source, "codexLinuxTray=null"), 1],
    ["compatible whenReady fallback", matches(source, COMPATIBLE_WHEN_READY_FALLBACK).length, 1],
    ["compatible isReady fallback", matches(source, COMPATIBLE_IS_READY_FALLBACK).length, 1],
    ["compatible Tray factory", matches(source, COMPATIBLE_TRAY_FACTORY).length, 1],
    ["old whenReady fallback", matches(source, CURRENT_WHEN_READY_FALLBACK).length, 0],
    ["old isReady fallback", matches(source, CURRENT_IS_READY_FALLBACK).length, 0],
    ["old Tray factory", matches(source, CURRENT_TRAY_FACTORY).length, 0],
  ];

  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Incomplete Linux tray compatibility patch: ${label} count is ${actual}, expected ${expected}`,
      );
    }
  }

  for (const marker of LEGACY_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`Incomplete Linux tray compatibility patch: stale marker ${marker} remains`);
    }
  }
}

function requireSingleCurrentContract(source, pattern, label) {
  const found = matches(source, pattern);
  if (found.length !== 1) {
    throw new Error(`Expected exactly one current ${label}, found ${found.length}`);
  }
  return found[0];
}

function applyLinuxTrayRegistrationFix(source) {
  if (typeof source !== "string") return source;
  if (source.includes(MARKER)) {
    assertPatchedContract(source);
    return source;
  }

  for (const marker of LEGACY_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`Refusing to layer the complete tray patch over stale marker ${marker}`);
    }
  }

  requireSingleCurrentContract(source, CURRENT_WHEN_READY_FALLBACK, "Linux Tray.whenReady fallback");
  requireSingleCurrentContract(source, CURRENT_IS_READY_FALLBACK, "Linux Tray.isReady fallback");
  requireSingleCurrentContract(source, CURRENT_TRAY_FACTORY, "Electron Tray factory and destruction gate");

  CURRENT_WHEN_READY_FALLBACK.lastIndex = 0;
  let patchedSource = source.replace(
    CURRENT_WHEN_READY_FALLBACK,
    (_match, trayVar) =>
      `if(typeof ${trayVar}.whenReady!=\`function\`)return!0;try{return await ${trayVar}.whenReady(),!0}catch{return!1}`,
  );

  CURRENT_IS_READY_FALLBACK.lastIndex = 0;
  patchedSource = patchedSource.replace(
    CURRENT_IS_READY_FALLBACK,
    (_match, trayVar) => `return typeof ${trayVar}.isReady==\`function\`?${trayVar}.isReady():!0`,
  );

  const factoryMatch = requireSingleCurrentContract(
    patchedSource,
    CURRENT_TRAY_FACTORY,
    "Electron Tray factory and destruction gate",
  );
  const [
    currentFactory,
    trayVar,
    electronVar,
    iconExpression,
    ,
    guidFunction,
    guidArgument,
    enabledFlag,
  ] = factoryMatch;
  const compatibleFactory =
    `${trayVar}=codexLinuxRegisterTray(new ${electronVar}.Tray(...(process.platform===\`linux\`?` +
    `[${iconExpression}]:[${iconExpression},process.platform===\`win32\`&&${electronVar}.app.isPackaged?` +
    `${guidFunction}(${guidArgument}):void 0])));` +
    `if(process.platform!==\`linux\`&&!${enabledFlag})return ${trayVar}.destroy(),null;`;

  patchedSource =
    patchedSource.slice(0, factoryMatch.index) +
    compatibleFactory +
    patchedSource.slice(factoryMatch.index + currentFactory.length);

  const constructorIndex = patchedSource.indexOf(`${trayVar}=codexLinuxRegisterTray(`);
  const factoryIndex = patchedSource.lastIndexOf("async function ", constructorIndex);
  if (constructorIndex === -1 || factoryIndex === -1) {
    throw new Error("Could not find the Linux tray helper insertion point");
  }

  const retentionHelper =
    `/*${MARKER}*/let codexLinuxTray=null,codexLinuxRegisterTray=e=>(codexLinuxTray=e,e);`;
  patchedSource =
    patchedSource.slice(0, factoryIndex) +
    retentionHelper +
    patchedSource.slice(factoryIndex);

  assertPatchedContract(patchedSource);
  return patchedSource;
}

module.exports = {
  COMPATIBLE_IS_READY_FALLBACK,
  COMPATIBLE_TRAY_FACTORY,
  COMPATIBLE_WHEN_READY_FALLBACK,
  CURRENT_IS_READY_FALLBACK,
  CURRENT_TRAY_FACTORY,
  CURRENT_WHEN_READY_FALLBACK,
  LEGACY_MARKERS,
  MARKER,
  applyLinuxTrayRegistrationFix,
  assertPatchedContract,
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
