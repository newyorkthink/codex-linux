"use strict";

const { findMatchingBrace } = require("../../scripts/patches/lib/minified-js.js");

const MARKER = "codexLinuxInitialWindowIcon";
const MARKER_COMMENT = `/*${MARKER}*/`;
const BROWSER_WINDOW_PATTERN = /new\s+([A-Za-z_$][\w$]*)\.BrowserWindow\(\{/g;
const READY_TO_SHOW_PATTERN = /([A-Za-z_$][\w$]*)\.once\(`ready-to-show`,\(\)=>\{/g;
const ICON_PATH_EXPRESSION = "process.resourcesPath+`/icon-chatgpt.png`";

function applyInitialWindowIconPatch(source) {
  if (typeof source !== "string") {
    return source;
  }
  if (source.includes(MARKER_COMMENT)) {
    return source;
  }

  const matches = [...source.matchAll(BROWSER_WINDOW_PATTERN)];
  if (matches.length === 0) {
    throw new Error("Could not find BrowserWindow construction for Linux icon patch");
  }

  // Match the old upstream Linux behavior in two stages:
  // 1. Set the icon in BrowserWindow constructor options.
  // 2. Set it again immediately before ready-to-show, because the old working
  //    implementation explicitly called BrowserWindow.setIcon() on Linux.
  const insertions = [];
  for (const match of matches) {
    const objectOpenIndex = match.index + match[0].length - 1;
    const objectCloseIndex = findMatchingBrace(source, objectOpenIndex);
    if (objectCloseIndex === -1) {
      throw new Error("Could not locate BrowserWindow options closing brace for Linux icon patch");
    }

    const beforeClose = source.slice(objectOpenIndex + 1, objectCloseIndex).trimEnd();
    const separator = beforeClose.length === 0 || beforeClose.endsWith(",") ? "" : ",";
    const iconOption =
      `${separator}${MARKER_COMMENT}...(` +
      "process.platform===`linux`" +
      `?{icon:${ICON_PATH_EXPRESSION}}` +
      ":{})";

    insertions.push({ index: objectCloseIndex, text: iconOption });
  }

  let patched = source;
  for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
    patched = patched.slice(0, insertion.index) + insertion.text + patched.slice(insertion.index);
  }

  let setIconCount = 0;
  patched = patched.replace(
    READY_TO_SHOW_PATTERN,
    (match, windowVar, offset, currentSource) => {
      const linuxPatch =
        `process.platform===\`linux\`&&!${windowVar}.isDestroyed()&&` +
        `${windowVar}.setIcon(${ICON_PATH_EXPRESSION}),`;
      const prefix = currentSource.slice(
        Math.max(0, offset - Math.max(500, linuxPatch.length * 2)),
        offset,
      );
      if (prefix.includes(`setIcon(${ICON_PATH_EXPRESSION})`)) {
        return match;
      }
      setIconCount += 1;
      return `${linuxPatch}${match}`;
    },
  );

  if (setIconCount === 0 && !patched.includes(`setIcon(${ICON_PATH_EXPRESSION})`)) {
    throw new Error("Could not find ready-to-show insertion point for Linux setIcon patch");
  }

  console.log(
    `Restored Linux window icon on ${insertions.length} BrowserWindow constructor(s) and ${setIconCount} ready-to-show hook(s)`,
  );
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
