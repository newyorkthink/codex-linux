#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  COMPATIBLE_TRAY_FACTORY,
  CURRENT_TRAY_FACTORY,
  MAIN_MARKER,
  readinessContract,
} = require("./overlay-features/linux-tray-single-arg/patch.js");

const SUPPORTED_ELECTRON_MAJOR = 42;
const TRAY_SYMBOLS = [
  "gtk_status_icon_new",
  "gtk_status_icon_set_from_pixbuf",
  "gtk_status_icon_set_tooltip_text",
  "gtk_status_icon_set_visible",
  "gtk_status_icon_position_menu",
];

function countMatches(source, pattern) {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)].length;
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function classifyContract(facts) {
  if (facts.electronMajor !== SUPPORTED_ELECTRON_MAJOR) {
    return {
      mode: "skip",
      reason: `unsupported-electron-major-${facts.electronMajor ?? "unknown"}`,
    };
  }

  const knownUnfixedContract =
    facts.mainCurrent === 1 &&
    facts.mainCompatible === 0 &&
    facts.mainMarker === 0 &&
    facts.readinessCurrent === 1 &&
    facts.readinessPatched === 0;
  if (knownUnfixedContract) {
    return { mode: "apply", reason: "known-unfixed-upstream-contract" };
  }

  const alreadyCompatible =
    facts.mainCurrent === 0 &&
    facts.mainCompatible === 1 &&
    facts.mainMarker === 1 &&
    facts.readinessCurrent === 0 &&
    facts.readinessPatched === 1 &&
    facts.hasAllXEmbedSymbols === true;
  if (alreadyCompatible) {
    return { mode: "skip", reason: "upstream-already-compatible" };
  }

  return { mode: "skip", reason: "upstream-contract-changed" };
}

function inspectMainBundle(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  const mainFiles = fs.existsSync(buildDir)
    ? fs.readdirSync(buildDir).filter((name) => /^main[^/]*\.js$/.test(name))
    : [];
  if (mainFiles.length !== 1) {
    return { mainCompatible: 0, mainCurrent: 0, mainMarker: 0 };
  }

  const source = fs.readFileSync(path.join(buildDir, mainFiles[0]), "utf8");
  return {
    mainCompatible: countMatches(source, COMPATIBLE_TRAY_FACTORY),
    mainCurrent: countMatches(source, CURRENT_TRAY_FACTORY),
    mainMarker: countOccurrences(source, MAIN_MARKER),
  };
}

function inspectReadinessBundles(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  const contracts = [];
  if (fs.existsSync(buildDir)) {
    for (const name of fs.readdirSync(buildDir)) {
      if (!name.endsWith(".js")) continue;
      const target = path.join(buildDir, name);
      if (!fs.statSync(target).isFile()) continue;
      const contract = readinessContract(fs.readFileSync(target, "utf8"));
      if (contract != null) contracts.push(contract);
    }
  }
  return {
    readinessCurrent: contracts.filter((value) => value === "current").length,
    readinessPatched: contracts.filter((value) => value === "patched").length,
  };
}

function electronMajorFromVersionFile(versionFile) {
  try {
    const match = fs.readFileSync(versionFile, "utf8").trim().match(/^(\d+)\./);
    return match == null ? null : Number.parseInt(match[1], 10);
  } catch {
    return null;
  }
}

function runtimeHasAllXEmbedSymbols(runtimeBinary) {
  const result = childProcess.spawnSync("objdump", ["-T", runtimeBinary], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return false;
  return TRAY_SYMBOLS.every((symbol) => result.stdout.includes(symbol));
}

function inspectUpstream(extractedDir, runtimeBinary, versionFile) {
  return {
    electronMajor: electronMajorFromVersionFile(versionFile),
    hasAllXEmbedSymbols: runtimeHasAllXEmbedSymbols(runtimeBinary),
    ...inspectMainBundle(extractedDir),
    ...inspectReadinessBundles(extractedDir),
  };
}

function writeGitHubOutput(outputPath, result) {
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `mode=${result.mode}\nreason=${result.reason}\n`, "utf8");
}

function main() {
  const [extractedDir, runtimeBinary, versionFile, outputPath] = process.argv.slice(2);
  if (!extractedDir || !runtimeBinary || !versionFile) {
    throw new Error(
      "usage: detect-upstream-contract.js <extracted-app-dir> <runtime-binary> <version-file> [github-output]",
    );
  }

  const facts = inspectUpstream(
    path.resolve(extractedDir),
    path.resolve(runtimeBinary),
    path.resolve(versionFile),
  );
  const result = classifyContract(facts);
  writeGitHubOutput(outputPath, result);
  console.log(JSON.stringify({ ...result, facts }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  SUPPORTED_ELECTRON_MAJOR,
  TRAY_SYMBOLS,
  classifyContract,
  inspectUpstream,
};
