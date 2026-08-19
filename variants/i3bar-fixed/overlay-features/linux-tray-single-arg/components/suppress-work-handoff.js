"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxSuppressWorkHandoffRuntimeV1";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated Work handoff suppression patch`);
}

function contract(source) {
  if (typeof source !== "string") return "drifted";

  const markerCount = source.split(RUNTIME_MARKER).length - 1;
  if (markerCount === 1) return "patched";
  if (markerCount !== 0) return "drifted";

  return APP_PAGE_MARKERS.every((marker) => source.includes(marker)) ? "current" : "drifted";
}

function installRuntime() {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  const GLOBAL_KEY = "__codexLinuxSuppressWorkHandoffRuntimeV1";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const CONTINUE_HERE_LABELS = [
    "继续在此聊天",
    "继续此聊天",
    "继续聊天",
    "continue in this chat",
    "continue this chat",
    "keep chatting here",
    "continue here",
  ];
  const CONTINUE_WORK_LABELS = [
    "继续使用工作",
    "继续使用 work",
    "使用工作",
    "continue in work",
    "continue with work",
    "continue using work",
    "use work",
  ];
  let scanTimer = null;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function labelMatches(element, candidates) {
    if (!(element instanceof Element)) return false;
    const labels = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ]
      .map(normalize)
      .filter(Boolean);

    return labels.some((label) =>
      candidates.some((candidate) => label === candidate || label.startsWith(`${candidate} `)),
    );
  }

  function findButton(root, candidates) {
    for (const button of root.querySelectorAll("button,[role='button']")) {
      if (button instanceof HTMLElement && visible(button) && labelMatches(button, candidates)) {
        return button;
      }
    }
    return null;
  }

  function promptContainerFor(continueHere) {
    let current = continueHere;
    for (let depth = 0; current instanceof HTMLElement && depth < 9; depth += 1, current = current.parentElement) {
      const workButton = findButton(current, CONTINUE_WORK_LABELS);
      if (!workButton) continue;

      const rect = current.getBoundingClientRect();
      if (rect.width < 280 || rect.height < 70 || rect.height > 340) continue;
      return current;
    }
    return null;
  }

  function suppress() {
    for (const continueHere of document.querySelectorAll("button,[role='button']")) {
      if (!(continueHere instanceof HTMLElement) || !visible(continueHere)) continue;
      if (!labelMatches(continueHere, CONTINUE_HERE_LABELS)) continue;

      const container = promptContainerFor(continueHere);
      if (!container || container.dataset.codexLinuxWorkHandoffSuppressed === "true") continue;

      container.dataset.codexLinuxWorkHandoffSuppressed = "true";
      continueHere.click();
      container.style.setProperty("display", "none", "important");
    }
  }

  function scheduleSuppress() {
    if (scanTimer != null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      suppress();
    }, 60);
  }

  const start = () => {
    suppress();
    const observer = new MutationObserver(scheduleSuppress);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

function runtimeSource() {
  return `;(${installRuntime.toString()})();`;
}

function applyPatch(source) {
  try {
    const state = contract(source);
    if (state === "patched") return source;
    if (state !== "current") {
      warn("Could not find the current ChatGPT app-page contract");
      return source;
    }

    const patched = `${source}\n${runtimeSource()}\n`;
    if (contract(patched) !== "patched") {
      warn("Runtime marker validation failed");
      return source;
    }
    return patched;
  } catch (error) {
    warn(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return source;
  }
}

module.exports = {
  APP_PAGE_ASSET_PATTERN,
  APP_PAGE_MARKERS,
  RUNTIME_MARKER,
  applyPatch,
  contract,
  runtimeSource,
  descriptors: [
    {
      id: "suppress-work-handoff",
      phase: "webview-asset",
      order: 20_980,
      ciPolicy: "optional",
      enforceWhenEnabled: false,
      pattern: APP_PAGE_ASSET_PATTERN,
      assetMatch: (source) => contract(source) !== "drifted",
      missingDescription: "current ChatGPT app-page bundle",
      skipDescription: "isolated Work handoff suppression patch",
      apply: applyPatch,
    },
  ],
};
