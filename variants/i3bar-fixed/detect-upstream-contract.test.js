#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { SUPPORTED_ELECTRON_MAJOR, classifyContract } = require("./detect-upstream-contract.js");

const currentFacts = {
  electronMajor: SUPPORTED_ELECTRON_MAJOR,
  hasAllXEmbedSymbols: false,
  mainCompatible: 0,
  mainCurrent: 1,
  mainMarker: 0,
  readinessCurrent: 1,
  readinessPatched: 0,
};

assert.deepEqual(classifyContract(currentFacts), {
  mode: "apply",
  reason: "known-unfixed-upstream-contract",
});

assert.deepEqual(
  classifyContract({
    ...currentFacts,
    hasAllXEmbedSymbols: true,
    mainCompatible: 1,
    mainCurrent: 0,
    mainMarker: 1,
    readinessCurrent: 0,
    readinessPatched: 1,
  }),
  { mode: "skip", reason: "upstream-already-compatible" },
);

assert.deepEqual(
  classifyContract({ ...currentFacts, electronMajor: SUPPORTED_ELECTRON_MAJOR + 1 }),
  { mode: "skip", reason: `unsupported-electron-major-${SUPPORTED_ELECTRON_MAJOR + 1}` },
);

assert.deepEqual(
  classifyContract({ ...currentFacts, mainCurrent: 0 }),
  { mode: "skip", reason: "upstream-contract-changed" },
);

assert.deepEqual(
  classifyContract({ ...currentFacts, mainCurrent: 2 }),
  { mode: "skip", reason: "upstream-contract-changed" },
);

console.log("i3bar fixed upstream contract detector test: OK");
