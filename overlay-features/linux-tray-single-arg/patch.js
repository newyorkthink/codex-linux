"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAIN_MARKER = "codexLinuxLegacyTrayCompatibility";
const READINESS_MARKER = "codexLinuxTrayReadinessCompatibility";
const LEGACY_MARKERS = [
  "codexLinuxTrayRegistrationFix",
  "codexLinuxSingleArgTray",
  "codexLinuxNativeTrayRetention",
];

// The current bundle puts the Electron compatibility adapters in an imported
// window-all-closed chunk instead of the main bundle. Stock Electron Tray does
// not expose the custom whenReady()/isReady() methods these adapters probe.
const CURRENT_WHEN_READY_FALLBACK =
  /if\(typeof ([A-Za-z_$][\w$]*)\.whenReady!=`function`\)return process\.platform!==`linux`;try\{return await \1\.whenReady\(\),!0\}catch\{return!1\}/g;
const COMPATIBLE_WHEN_READY_FALLBACK =
  /if\(typeof ([A-Za-z_$][\w$]*)\.whenReady!=`function`\)return!0;try\{return await \1\.whenReady\(\),!0\}catch\{return!1\}/g;

const CURRENT_IS_READY_FALLBACK =
  /return typeof ([A-Za-z_$][\w$]*)\.isReady==`function`\?\1\.isReady\(\):process\.platform!==`linux`/g;
const COMPATIBLE_IS_READY_FALLBACK =
  /return typeof ([A-Za-z_$][\w$]*)\.isReady==`function`\?\1\.isReady\(\):!0/g;

// Current official main bundle shape:
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

function assertMainPatchedContract(source) {
  const checks = [
    ["main compatibility marker", countOccurrences(source, MAIN_MARKER), 1],
    ["tray retention helper", countOccurrences(source, "codexLinuxRegisterTray=e=>"), 1],
    ["strong raw Tray reference", countOccurrences(source, "codexLinuxTray=null"), 1],
    ["compatible Tray factory", matches(source, COMPATIBLE_TRAY_FACTORY).length, 1],
    ["old Tray factory", matches(source, CURRENT_TRAY_FACTORY).length, 0],
  ];

  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Incomplete Linux tray main-bundle patch: ${label} count is ${actual}, expected ${expected}`,
      );
    }
  }

  for (const marker of LEGACY_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`Incomplete Linux tray main-bundle patch: stale marker ${marker} remains`);
    }
  }
}

function assertReadinessPatchedContract(source) {
  const checks = [
    ["readiness compatibility marker", countOccurrences(source, READINESS_MARKER), 1],
    ["compatible whenReady fallback", matches(source, COMPATIBLE_WHEN_READY_FALLBACK).length, 1],
    ["compatible isReady fallback", matches(source, COMPATIBLE_IS_READY_FALLBACK).length, 1],
    ["old whenReady fallback", matches(source, CURRENT_WHEN_READY_FALLBACK).length, 0],
    ["old isReady fallback", matches(source, CURRENT_IS_READY_FALLBACK).length, 0],
  ];

  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Incomplete Linux tray readiness patch: ${label} count is ${actual}, expected ${expected}`,
      );
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

function readinessContract(source) {
  const currentWhenReady = matches(source, CURRENT_WHEN_READY_FALLBACK).length;
  const compatibleWhenReady = matches(source, COMPATIBLE_WHEN_READY_FALLBACK).length;
  const currentIsReady = matches(source, CURRENT_IS_READY_FALLBACK).length;
  const compatibleIsReady = matches(source, COMPATIBLE_IS_READY_FALLBACK).length;
  const marker = countOccurrences(source, READINESS_MARKER);

  if (
    currentWhenReady === 1 &&
    compatibleWhenReady === 0 &&
    currentIsReady === 1 &&
    compatibleIsReady === 0 &&
    marker === 0
  ) {
    return "current";
  }
  if (
    currentWhenReady === 0 &&
    compatibleWhenReady === 1 &&
    currentIsReady === 0 &&
    compatibleIsReady === 1 &&
    marker === 1
  ) {
    return "patched";
  }
  return null;
}

function applyLinuxTrayRegistrationFix(source) {
  if (typeof source !== "string") return source;
  if (source.includes(MAIN_MARKER)) {
    assertMainPatchedContract(source);
    return source;
  }

  for (const marker of LEGACY_MARKERS) {
    if (source.includes(marker)) {
      throw new Error(`Refusing to layer the complete tray patch over stale marker ${marker}`);
    }
  }

  const factoryMatch = requireSingleCurrentContract(
    source,
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

  let patchedSource =
    source.slice(0, factoryMatch.index) +
    compatibleFactory +
    source.slice(factoryMatch.index + currentFactory.length);

  const constructorIndex = patchedSource.indexOf(`${trayVar}=codexLinuxRegisterTray(`);
  const factoryIndex = patchedSource.lastIndexOf("async function ", constructorIndex);
  if (constructorIndex === -1 || factoryIndex === -1) {
    throw new Error("Could not find the Linux tray helper insertion point");
  }

  const retentionHelper =
    `/*${MAIN_MARKER}*/let codexLinuxTray=null,codexLinuxRegisterTray=e=>(codexLinuxTray=e,e);`;
  patchedSource =
    patchedSource.slice(0, factoryIndex) +
    retentionHelper +
    patchedSource.slice(factoryIndex);

  assertMainPatchedContract(patchedSource);
  return patchedSource;
}

function applyLinuxTrayReadinessSource(source) {
  if (typeof source !== "string") return source;
  if (source.includes(READINESS_MARKER)) {
    assertReadinessPatchedContract(source);
    return source;
  }

  requireSingleCurrentContract(source, CURRENT_WHEN_READY_FALLBACK, "Linux Tray.whenReady fallback");
  requireSingleCurrentContract(source, CURRENT_IS_READY_FALLBACK, "Linux Tray.isReady fallback");

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
  patchedSource = `/*${READINESS_MARKER}*/${patchedSource}`;

  assertReadinessPatchedContract(patchedSource);
  return patchedSource;
}

function findReadinessBundle(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    throw new Error(`Could not find extracted Vite build directory: ${buildDir}`);
  }

  const candidates = fs.readdirSync(buildDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => {
      const target = path.join(buildDir, name);
      if (!fs.statSync(target).isFile()) return null;
      const source = fs.readFileSync(target, "utf8");
      const contract = readinessContract(source);
      return contract == null ? null : { contract, name, source, target };
    })
    .filter((candidate) => candidate != null);

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one Electron Tray readiness helper bundle, found ${candidates.length}`,
    );
  }
  return candidates[0];
}

function applyLinuxTrayReadinessFiles(extractedDir) {
  const candidate = findReadinessBundle(extractedDir);
  const patchedSource = applyLinuxTrayReadinessSource(candidate.source);
  const changed = patchedSource !== candidate.source;
  if (changed) fs.writeFileSync(candidate.target, patchedSource, "utf8");
  return { assetName: candidate.name, changed, target: candidate.target };
}

module.exports = {
  COMPATIBLE_IS_READY_FALLBACK,
  COMPATIBLE_TRAY_FACTORY,
  COMPATIBLE_WHEN_READY_FALLBACK,
  CURRENT_IS_READY_FALLBACK,
  CURRENT_TRAY_FACTORY,
  CURRENT_WHEN_READY_FALLBACK,
  LEGACY_MARKERS,
  MAIN_MARKER,
  READINESS_MARKER,
  applyLinuxTrayReadinessFiles,
  applyLinuxTrayReadinessSource,
  applyLinuxTrayRegistrationFix,
  assertMainPatchedContract,
  assertReadinessPatchedContract,
  findReadinessBundle,
  readinessContract,
  descriptors: [
    {
      id: "linux-tray-registration",
      phase: "main-bundle",
      order: 20_970,
      ciPolicy: "optional",
      apply: applyLinuxTrayRegistrationFix,
    },
    {
      id: "linux-tray-readiness",
      phase: "extracted-app:pre-webview",
      order: 20_980,
      ciPolicy: "optional",
      apply: applyLinuxTrayReadinessFiles,
    },
  ],
};
