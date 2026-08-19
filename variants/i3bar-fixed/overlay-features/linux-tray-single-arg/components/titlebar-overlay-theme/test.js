#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyLinuxTitlebarOverlayThemePatch,
  descriptors,
  titlebarOverlayThemeContract,
} = require("./patch.js");

function officialCurrentFixture() {
  return [
    "function A9(e=1){return{color:O9,symbolColor:l.nativeTheme.shouldUseDarkColors?LTe:ITe,height:Math.round(FTe*e)}}",
    "setWindowZoom(e,t){let n=l.BrowserWindow.fromWebContents(e);n&&n.setTitleBarOverlay(A9(t))}",
  ].join("");
}

function captureWarnings(callback) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    return { value: callback(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

test("patches only the titleBarOverlay helper background into a theme-aware background", () => {
  const source = officialCurrentFixture();
  assert.equal(titlebarOverlayThemeContract(source), "current");

  const patched = applyLinuxTitlebarOverlayThemePatch(source);
  assert.notEqual(patched, source);
  assert.equal(titlebarOverlayThemeContract(patched), "theme-aware");
  assert.match(
    patched,
    /color:l\.nativeTheme\.shouldUseDarkColors\?O9:`#ffffff`,symbolColor:l\.nativeTheme\.shouldUseDarkColors\?LTe:ITe/,
  );
  assert.match(patched, /setWindowZoom\(e,t\).*setTitleBarOverlay\(A9\(t\)\)/);
  assert.equal(applyLinuxTitlebarOverlayThemePatch(patched), patched);
});

test("ignores a same-shaped helper that is not used by setTitleBarOverlay", () => {
  const unrelated =
    "function B9(x=1){return{color:C9,symbolColor:q.nativeTheme.shouldUseDarkColors?D9:E9,height:Math.round(F9*x)}}";
  const source = unrelated + officialCurrentFixture();
  const patched = applyLinuxTitlebarOverlayThemePatch(source);
  assert.ok(patched.startsWith(unrelated));
  assert.equal((patched.match(/#ffffff/g) ?? []).length, 1);
});

test("leaves an upstream theme-aware implementation byte-identical", () => {
  const source = [
    "function A9(e=1){return{color:l.nativeTheme.shouldUseDarkColors?O9:P9,symbolColor:l.nativeTheme.shouldUseDarkColors?LTe:ITe,height:Math.round(FTe*e)}}",
    "setWindowZoom(e,t){let n=l.BrowserWindow.fromWebContents(e);n&&n.setTitleBarOverlay(A9(t))}",
  ].join("");
  const result = captureWarnings(() => applyLinuxTitlebarOverlayThemePatch(source));
  assert.equal(titlebarOverlayThemeContract(source), "theme-aware");
  assert.equal(result.value, source);
  assert.deepEqual(result.warnings, []);
});

test("fails closed on duplicate or drifted contracts without changing bytes", () => {
  const duplicate = officialCurrentFixture().replace(
    "setWindowZoom",
    "setWindowZoomA",
  ) + officialCurrentFixture().replace(/A9/g, "B9").replace("setWindowZoom", "setWindowZoomB");
  for (const source of [duplicate, "function unrelated(){return 1}"]) {
    const result = captureWarnings(() => applyLinuxTitlebarOverlayThemePatch(source));
    assert.equal(result.value, source);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /skipping isolated titlebar theme patch/);
  }
});

test("descriptor is isolated and non-blocking when upstream changes", () => {
  assert.deepEqual(
    descriptors.map(({ id, phase, order, ciPolicy, enforceWhenEnabled }) => ({
      id,
      phase,
      order,
      ciPolicy,
      enforceWhenEnabled,
    })),
    [
      {
        id: "linux-titlebar-overlay-theme",
        phase: "main-bundle",
        order: 20_960,
        ciPolicy: "optional",
        enforceWhenEnabled: false,
      },
    ],
  );
});
