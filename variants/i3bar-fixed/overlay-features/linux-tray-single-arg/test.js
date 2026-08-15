"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const {
  LEGACY_MARKERS,
  MAIN_MARKER,
  READINESS_MARKER,
  applyLinuxTrayReadinessFiles,
  applyLinuxTrayReadinessSource,
  applyLinuxTrayRegistrationFix,
  assertMainPatchedContract,
  assertReadinessPatchedContract,
  findReadinessBundle,
} = require("./patch.js");

const currentMain = [
  "let V9=null,H9=null,W9=!1;",
  "async function gEe(e){",
  "let t=e.buildFlavor,n=await KAe(t,e.appBrand,e.repoRoot),",
  "i=new l.Tray(n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0);",
  "if(!W9)return i.destroy(),null;return V9=new qTe(i)}",
].join("");

const currentReadiness = [
  "async function tG(e){let t=e;",
  "if(typeof t.whenReady!=`function`)return process.platform!==`linux`;",
  "try{return await t.whenReady(),!0}catch{return!1}}",
  "function nG(e){let t=e;",
  "return typeof t.isReady==`function`?t.isReady():process.platform!==`linux`}",
  "Object.defineProperty(exports,`S`,{get:function(){return nG}});",
  "Object.defineProperty(exports,`W`,{get:function(){return tG}});",
].join("");

const patchedMain = applyLinuxTrayRegistrationFix(currentMain);
const patchedReadiness = applyLinuxTrayReadinessSource(currentReadiness);
const expectedFactory =
  "i=codexLinuxRegisterTray(new l.Tray(...(process.platform===`linux`?" +
  "[n.defaultIcon]:[n.defaultIcon,process.platform===`win32`&&l.app.isPackaged?RAe(t):void 0])));" +
  "if(process.platform!==`linux`&&!W9)return i.destroy(),null;";

assert.ok(
  patchedMain.includes(
    `/*${MAIN_MARKER}*/let codexLinuxTray=null,codexLinuxRegisterTray=e=>(codexLinuxTray=e,e);`,
  ),
);
assert.ok(patchedMain.includes(expectedFactory));
assert.ok(patchedMain.includes("return V9=new qTe(i)"));
assert.ok(patchedReadiness.startsWith(`/*${READINESS_MARKER}*/`));
assert.ok(patchedReadiness.includes("if(typeof t.whenReady!=`function`)return!0;"));
assert.ok(patchedReadiness.includes("return typeof t.isReady==`function`?t.isReady():!0"));
assertMainPatchedContract(patchedMain);
assertReadinessPatchedContract(patchedReadiness);
assert.equal(applyLinuxTrayRegistrationFix(patchedMain), patchedMain);
assert.equal(applyLinuxTrayReadinessSource(patchedReadiness), patchedReadiness);
assert.doesNotThrow(() => new Function(patchedMain));
assert.doesNotThrow(() => new Function(patchedReadiness));

assert.throws(
  () => applyLinuxTrayRegistrationFix("new l.Tray(icon)"),
  /Expected exactly one current Electron Tray factory and destruction gate, found 0/,
);
assert.throws(
  () => applyLinuxTrayReadinessSource(currentReadiness.replace("process.platform!==`linux`;", "!0;")),
  /Expected exactly one current Linux Tray\.whenReady fallback, found 0/,
);
assert.throws(
  () => applyLinuxTrayReadinessSource(`${currentReadiness}${currentReadiness}`),
  /Expected exactly one current Linux Tray\.whenReady fallback, found 2/,
);
assert.throws(
  () => applyLinuxTrayRegistrationFix(`${currentMain}/*codexLinuxTrayRegistrationFix*/`),
  /Refusing to layer the complete tray patch over stale marker/,
);

function verifyExtractedAppMutation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-linux-tray-test-"));
  try {
    const buildDir = path.join(root, ".vite", "build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, "main-fixture.js"), currentMain);
    fs.writeFileSync(path.join(buildDir, "window-all-closed-fixture.js"), currentReadiness);
    fs.writeFileSync(path.join(buildDir, "decoy.js"), "function decoy(){}");

    const first = applyLinuxTrayReadinessFiles(root);
    assert.equal(first.assetName, "window-all-closed-fixture.js");
    assert.equal(first.changed, true);
    assertReadinessPatchedContract(fs.readFileSync(first.target, "utf8"));

    const second = applyLinuxTrayReadinessFiles(root);
    assert.equal(second.assetName, "window-all-closed-fixture.js");
    assert.equal(second.changed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

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

  const windowsEnabled = runFactory("win32", true);
  assert.deepEqual(Array.from(windowsEnabled.tray.args), ["icon", "windows-guid"]);
  assert.equal(windowsEnabled.tray.destroyed, false);
  assert.equal(windowsEnabled.factoryResult, windowsEnabled.tray);

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

function verifyBuiltBundle(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  const mainFiles = fs.readdirSync(buildDir).filter((name) => /^main[^/]*\.js$/.test(name));
  assert.equal(mainFiles.length, 1);

  const mainPath = path.join(buildDir, mainFiles[0]);
  const mainSource = fs.readFileSync(mainPath, "utf8");
  const readiness = findReadinessBundle(extractedDir);
  assert.equal(readiness.contract, "patched");

  assertMainPatchedContract(mainSource);
  assertReadinessPatchedContract(readiness.source);
  for (const marker of LEGACY_MARKERS) assert.equal(countOccurrences(mainSource, marker), 0);
  assert.equal(countOccurrences(mainSource, "codexLinuxApplyDockIcon"), 0);
  new Function(mainSource);
  new Function(readiness.source);
  console.log(`verified patched bundles: ${mainPath}, ${readiness.target}`);
}

async function main() {
  verifyExtractedAppMutation();
  await verifyRuntimeBehavior();
  if (process.argv[2]) verifyBuiltBundle(process.argv[2]);
  console.log("split-bundle Linux tray compatibility patch test: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
