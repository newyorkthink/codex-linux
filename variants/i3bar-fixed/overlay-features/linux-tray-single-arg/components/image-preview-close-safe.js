"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxImagePreviewCloseSafeRuntimeV1";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated image-preview close-position patch`);
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

  const GLOBAL_KEY = "__codexLinuxImagePreviewCloseSafeRuntimeV1";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const MARKER = "codexLinuxImagePreviewCloseSafe";
  let scanTimer = null;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isCloseControl(element) {
    if (!(element instanceof HTMLElement) || !visible(element)) return false;
    const labels = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
    ]
      .map(normalize)
      .filter(Boolean);

    return labels.some((label) =>
      label === "close" ||
      label === "关闭" ||
      label === "关闭预览" ||
      label === "close preview" ||
      label === "×" ||
      label === "✕" ||
      label === "✖"
    );
  }

  function hasLargePreviewImage() {
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    for (const image of document.querySelectorAll("img")) {
      if (!(image instanceof HTMLImageElement) || !visible(image)) continue;
      const rect = image.getBoundingClientRect();
      if (rect.width < 360 || rect.height < 240) continue;
      if (rect.width * rect.height >= viewportArea * 0.20) return true;
    }
    return false;
  }

  function applySafePosition(button) {
    if (!(button instanceof HTMLElement) || button.dataset[MARKER] === "true") return;
    const rect = button.getBoundingClientRect();
    if (rect.top > 84 || rect.right < window.innerWidth - 220) return;

    const position = window.getComputedStyle(button).position;
    if (position === "absolute" || position === "fixed" || position === "sticky") {
      button.style.setProperty("right", "152px", "important");
      button.style.setProperty("left", "auto", "important");
    } else {
      button.style.setProperty("transform", "translateX(-138px)", "important");
    }
    button.dataset[MARKER] = "true";
  }

  function scan() {
    if (!hasLargePreviewImage()) return;

    for (const button of document.querySelectorAll("button,[role='button']")) {
      if (!(button instanceof HTMLElement) || !isCloseControl(button)) continue;
      applySafePosition(button);
    }
  }

  function scheduleScan() {
    if (scanTimer != null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scan();
    }, 80);
  }

  const start = () => {
    scan();
    const observer = new MutationObserver(scheduleScan);
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "title", "class", "style"],
      });
    }
    window.addEventListener("resize", scheduleScan, { passive: true });
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
      id: "image-preview-close-safe",
      phase: "webview-asset",
      order: 20_970,
      ciPolicy: "optional",
      enforceWhenEnabled: false,
      pattern: APP_PAGE_ASSET_PATTERN,
      assetMatch: (source) => contract(source) !== "drifted",
      missingDescription: "current ChatGPT app-page bundle",
      skipDescription: "isolated image-preview close-position patch",
      apply: applyPatch,
    },
  ],
};
