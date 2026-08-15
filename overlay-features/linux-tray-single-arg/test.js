"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  LEGACY_MARKERS,
  MARKER,
  applyLinuxTrayRegistrationFix,
  assertPatchedContract,
} = require("./patch.js");

const current = [
  "async function trayWhenReady(e){",
  "if(typeof e.whenReady!=`function`)return process.platform!==`linux`;",
  "try{return await e.whenReady(),!0}catch{return!1}}",
  "function trayIsReady(e){",
  "return typeof e.isReady==`function`?e.isReady():process.platform!==`linux`}",
  "let V9=null,H9=null,W9=!1;",
  "async function gEe(e){",
  "let t=e.buildFlavor,n=await KAe(t,e.appBrand,e.repoRoot),",
  "i=new l.Tray(n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0);",
  "if(!W9)return i.destroy(),null;return V9=new qTe(i)}",
].join("");

const patched = applyLinuxTrayRegistrationFix(current);
const expectedFactory =
  "i=codexLinuxRegisterTray(new l.Tray(...(process.platform===`linux`?" +
  "[n.defaultIcon]:[n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0])));" +
  "if(process.platform!==`linux`&&!W9)return i.destroy(),null;";

assert.ok(patched.includes(`/*${MARKER}*/let codexLinuxTray=null,codexLinuxRegisterTray=e=>(codexLinuxTray=e,e);`));
assert.ok(patched.includes("if(typeof e.whenReady!=`function`)return!0;"));
assert.ok(patched.includes("return typeof e.isReady==`function`?e.isReady():!0"));
assert.ok(patched.includes(expectedFactory));
assert.ok(patched.includes("return V9=new qTe(i)"));
assertPatchedContract(patched);
assert.equal(applyLinuxTrayRegistrationFix(patched), patched);
assert.doesNotThrow(() => new Function(patched));

assert.throws(
  () => applyLinuxTrayRegistrationFix(current.replace("process.platform!==`linux`;", "!0;")),
  /Expected exactly one current Linux Tray\.whenReady fallback, found 0/,
);
assert.throws(
  () => applyLinuxTrayRegistrationFix(`${current}${current}`),
  /Expected exactly one current Linux Tray\.whenReady fallback, found 2/,
);
assert.throws(
  () => applyLinuxTrayRegistrationFix(`${current}/*codexLinuxTrayRegistrationFix*/`),
  /Refusing to layer the complete tray patch over stale marker/,
);
assert.throws(
  () => assertPatchedContract(patched.replace("return!0;try{return await", "return process.platform!==`linux`;try{return await")),
  /Incomplete Linux tray compatibility patch/,
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
  const script = [
    "let codexLinuxTray=null,codexLinuxRegisterTray=e=>(codexLinuxTray=e,e);",
    `let factoryResult=(function(){${expectedFactory}return i})();`,
    "({factoryResult,retained:codexLinuxTray})",
  ].join("");
  const result = vm.runInNewContext(script, context);
  return { ...result, tray: context.i };
}

async function verifyRuntimeBehavior() {
  const linuxDisabled = runFactory("linux", false);
  assert.deepEqual(Array.from(linuxDisabled.tray.args), ["icon"]);
  assert.equal(linuxDisabled.tray.destroyed, false);
  assert.equal(linuxDisabled.factoryResult, linuxDisabled.tray);
  assert.equal(linuxDisabled.retained, linuxDisabled.tray);

  const windowsDisabled = runFactory("win32", false);
  assert.deepEqual(Array.from(windowsDisabled.tray.args), ["icon", "windows-guid"]);
  assert.equal(windowsDisabled.tray.destroyed, true);
  assert.equal(windowsDisabled.factoryResult, null);
  assert.equal(windowsDisabled.retained, windowsDisabled.tray);

  const windowsEnabled = runFactory("win32", true);
  assert.deepEqual(Array.from(windowsEnabled.tray.args), ["icon", "windows-guid"]);
  assert.equal(windowsEnabled.tray.destroyed, false);
  assert.equal(windowsEnabled.factoryResult, windowsEnabled.tray);
  assert.equal(windowsEnabled.retained, windowsEnabled.tray);

  const readiness = await vm.runInNewContext(
    "(async()=>{" +
      "async function whenReady(e){if(typeof e.whenReady!=`function`)return!0;" +
      "try{return await e.whenReady(),!0}catch{return!1}}" +
      "function isReady(e){return typeof e.isReady==`function`?e.isReady():!0}" +
      "return [await whenReady({}),isReady({}),await whenReady({whenReady:async()=>{throw Error()}}),isReady({isReady:()=>!1})]" +
      "})()",
  );
  assert.deepEqual(Array.from(readiness), [true, true, false, false]);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function verifyBuiltBundle(bundlePath) {
  const source = fs.readFileSync(bundlePath, "utf8");
  assertPatchedContract(source);
  for (const marker of LEGACY_MARKERS) assert.equal(countOccurrences(source, marker), 0);
  assert.equal(countOccurrences(source, "codexLinuxApplyDockIcon"), 0);
  new Function(source);
  console.log(`verified patched bundle: ${bundlePath}`);
}

async function main() {
  await verifyRuntimeBehavior();
  if (process.argv[2]) verifyBuiltBundle(process.argv[2]);
  console.log("complete legacy Linux tray compatibility patch test: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
