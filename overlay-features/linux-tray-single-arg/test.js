"use strict";

const assert = require("node:assert/strict");
const {
  MARKER,
  applyLinuxSingleArgumentTray,
} = require("./patch.js");

const current = [
  "let V9=null,H9=null,W9=!1;",
  "async function gEe(e){",
  "let t=e.buildFlavor,n=await KAe(t,e.appBrand,e.repoRoot),",
  "i=new l.Tray(n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0);",
  "if(!W9)return i.destroy(),null;return V9=new qTe(i)}",
].join("");

const patched = applyLinuxSingleArgumentTray(current);

assert.ok(patched.includes(MARKER));
assert.ok(
  patched.includes(
    "i=/*codexLinuxSingleArgTray*/new l.Tray(...(process.platform===`linux`?[n.defaultIcon]:[n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0]))",
  ),
);
assert.ok(patched.includes("if(!W9)return i.destroy(),null"));
assert.equal(applyLinuxSingleArgumentTray(patched), patched);
assert.throws(
  () => applyLinuxSingleArgumentTray("new l.Tray(icon)"),
  /Expected exactly one current two-argument Electron Tray constructor/,
);

console.log("linux-tray-single-arg patch test: OK");
