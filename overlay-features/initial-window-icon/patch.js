"use strict";

const MARKER = "codexLinuxInitialWindowIcon";
const MARKER_COMMENT = `/*${MARKER}*/`;
const BROWSER_WINDOW_PATTERN = /new\s+([A-Za-z_$][\w$]*)\.BrowserWindow\(\{/g;

function applyInitialWindowIconPatch(source) {
  if (typeof source !== "string") {
    return source;
  }
  if (source.includes(MARKER_COMMENT)) {
    return source;
  }

  const matches = [...source.matchAll(BROWSER_WINDOW_PATTERN)];
  if (matches.length === 0) {
    console.warn("WARN: Could not find BrowserWindow construction for initial Linux icon patch");
    return source;
  }

  let patchedCount = 0;
  const patched = source.replace(BROWSER_WINDOW_PATTERN, (match, electronAlias) => {
    patchedCount += 1;
    return (
      `new ${electronAlias}.BrowserWindow({${MARKER_COMMENT}` +
      `...(process.platform===\`linux\`?{icon:${electronAlias}.nativeImage.createFromPath(process.resourcesPath+\`/icon-chatgpt.png\`)}:{}),`
    );
  });

  if (patchedCount === 0) {
    console.warn("WARN: Initial Linux window icon patch made no changes");
    return source;
  }

  console.log(`Restored constructor-time Linux BrowserWindow icon on ${patchedCount} window constructor(s)`);
  return patched;
}

module.exports = {
  MARKER,
  applyInitialWindowIconPatch,
  descriptors: [
    {
      id: "initial-linux-window-icon",
      phase: "main-bundle",
      order: 20_500,
      ciPolicy: "optional",
      apply: applyInitialWindowIconPatch,
    },
  ],
};
