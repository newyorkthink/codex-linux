"use strict";

const { findMatchingBrace } = require("../../scripts/patches/lib/minified-js.js");

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
      "?{icon:process.resourcesPath+`/icon-chatgpt.png`}" +
      ":{})";

    insertions.push({ index: objectCloseIndex, text: iconOption });
  }

  let patched = source;
  for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
    patched = patched.slice(0, insertion.index) + insertion.text + patched.slice(insertion.index);
  }

  console.log(
    `Restored final Linux BrowserWindow icon option on ${insertions.length} window constructor(s)`,
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
