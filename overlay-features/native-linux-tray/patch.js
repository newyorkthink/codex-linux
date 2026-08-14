"use strict";

const MARKER = "codexLinuxNativeTrayRetention";
const TRAY_GATE_PATTERN = /([A-Za-z_$][\w$]*)=new ([A-Za-z_$][\w$]*)\.Tray\(([^;]+?)\);if\(!([A-Za-z_$][\w$]*)\)return \1\.destroy\(\),null;/g;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyNativeLinuxTrayRetention(source) {
  if (typeof source !== "string") return source;
  if (source.includes(MARKER)) return source;

  TRAY_GATE_PATTERN.lastIndex = 0;
  const matches = [...source.matchAll(TRAY_GATE_PATTERN)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one current native Tray destruction gate, found ${matches.length}`,
    );
  }

  const match = matches[0];
  const trayVar = match[1];
  const enabledFlag = match[4];
  const flagDeclaration = new RegExp(
    `(?:let|var)\\s+[^;]*\\b${escapeRegExp(enabledFlag)}=!1(?:[,;])`,
  );
  if (!flagDeclaration.test(source)) {
    throw new Error(`Could not verify current tray-enabled flag declaration: ${enabledFlag}`);
  }

  const currentGate = `;if(!${enabledFlag})return ${trayVar}.destroy(),null;`;
  const retainedGate =
    `;/*${MARKER}*/if(process.platform!==\`linux\`&&!${enabledFlag})return ${trayVar}.destroy(),null;`;
  if (!match[0].includes(currentGate)) {
    throw new Error("Current native Tray destruction gate did not match the verified contract");
  }

  return source.slice(0, match.index) +
    match[0].replace(currentGate, retainedGate) +
    source.slice(match.index + match[0].length);
}

module.exports = {
  MARKER,
  applyNativeLinuxTrayRetention,
  descriptors: [
    {
      id: "retain-linux-tray",
      phase: "main-bundle",
      order: 20_980,
      ciPolicy: "optional",
      apply: applyNativeLinuxTrayRetention,
    },
  ],
};
