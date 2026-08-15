"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  CURRENT_TRAY_FACTORY,
  MARKER,
  applyLinuxTrayRegistrationFix,
} = require("./patch.js");

const current = [
  "let V9=null,H9=null,W9=!1;",
  "async function gEe(e){",
  "let t=e.buildFlavor,n=await KAe(t,e.appBrand,e.repoRoot),",
  "i=new l.Tray(n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0);",
  "if(!W9)return i.destroy(),null;return V9=new qTe(i)}",
].join("");

const patched = applyLinuxTrayRegistrationFix(current);
const expectedFactory =
  "i=/*codexLinuxTrayRegistrationFix*/new l.Tray(...(process.platform===`linux`?" +
  "[n.defaultIcon]:[n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0]));" +
  "if(process.platform!==`linux`&&!W9)return i.destroy(),null;";

assert.ok(patched.includes(expectedFactory));
assert.ok(patched.includes("return V9=new qTe(i)"));
assert.equal(applyLinuxTrayRegistrationFix(patched), patched);
assert.throws(
  () => applyLinuxTrayRegistrationFix("new l.Tray(icon)"),
  /Expected exactly one current Electron Tray factory and destruction gate/,
);

function runFactory(platform, enabled) {
  const context = {
    W9: enabled,
    i: null,
    l: {
      app: { isPackaged: true },
      Tray: class {
        constructor(...args) {
          this.args = args;
          this.destroyed = false;
        }

        destroy() {
          this.destroyed = true;
        }
      },
    },
    n: { defaultIcon: "icon" },
    process: { platform },
    RAe: () => "windows-guid",
    t: "prod",
  };
  const result = vm.runInNewContext(`(function(){${expectedFactory}return i})()`, context);
  return { result, tray: context.i };
}

const linuxDisabled = runFactory("linux", false);
assert.deepEqual(Array.from(linuxDisabled.tray.args), ["icon"]);
assert.equal(linuxDisabled.tray.destroyed, false);
assert.equal(linuxDisabled.result, linuxDisabled.tray);

const windowsDisabled = runFactory("win32", false);
assert.deepEqual(Array.from(windowsDisabled.tray.args), ["icon", "windows-guid"]);
assert.equal(windowsDisabled.tray.destroyed, true);
assert.equal(windowsDisabled.result, null);

const windowsEnabled = runFactory("win32", true);
assert.deepEqual(Array.from(windowsEnabled.tray.args), ["icon", "windows-guid"]);
assert.equal(windowsEnabled.tray.destroyed, false);
assert.equal(windowsEnabled.result, windowsEnabled.tray);

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function verifyBuiltBundle(bundlePath) {
  const source = fs.readFileSync(bundlePath, "utf8");
  assert.equal(countOccurrences(source, MARKER), 1);
  assert.ok(source.includes("process.platform!==`linux`&&!"));
  assert.equal(countOccurrences(source, "codexLinuxSingleArgTray"), 0);
  assert.equal(countOccurrences(source, "codexLinuxNativeTrayRetention"), 0);
  assert.equal(countOccurrences(source, "codexLinuxApplyDockIcon"), 0);
  CURRENT_TRAY_FACTORY.lastIndex = 0;
  assert.equal([...source.matchAll(CURRENT_TRAY_FACTORY)].length, 0);
  new Function(source);
  console.log(`verified patched bundle: ${bundlePath}`);
}

if (process.argv[2]) verifyBuiltBundle(process.argv[2]);

console.log("atomic Linux tray registration patch test: OK");
