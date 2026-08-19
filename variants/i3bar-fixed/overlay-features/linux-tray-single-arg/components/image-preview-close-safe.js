"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxImagePreviewCloseSafeRuntimeV3";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated image-preview close-position patch`);
}

function contract(source) {
  if (typeof source !== "string") return "drifted";
  const count = source.split(RUNTIME_MARKER).length - 1;
  if (count === 1) return "patched";
  if (count !== 0) return "drifted";
  return APP_PAGE_MARKERS.every((marker) => source.includes(marker)) ? "current" : "drifted";
}

function installRuntime() {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  const GLOBAL_KEY = "__codexLinuxImagePreviewCloseSafeRuntimeV3";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const MARKER = "codexLinuxImagePreviewCloseMovedV3";
  let scanTimer = null;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function area(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function previewPresent() {
    const viewportArea = Math.max(1, innerWidth * innerHeight);

    for (const root of document.querySelectorAll("[role='dialog'],[aria-modal='true'],[data-state='open']")) {
      if (!(root instanceof HTMLElement) || !visible(root)) continue;
      const rect = root.getBoundingClientRect();
      if (area(rect) < viewportArea * 0.35) continue;
      for (const media of root.querySelectorAll("img,canvas,video,picture")) {
        if (!(media instanceof HTMLElement) || !visible(media)) continue;
        const mediaRect = media.getBoundingClientRect();
        if (area(mediaRect) >= viewportArea * 0.08) return true;
      }
    }

    for (const media of document.querySelectorAll("img,canvas,video,picture")) {
      if (!(media instanceof HTMLElement) || !visible(media)) continue;
      const rect = media.getBoundingClientRect();
      if (area(rect) < viewportArea * 0.14) continue;
      let parent = media.parentElement;
      while (parent instanceof HTMLElement && parent !== document.body) {
        const parentRect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        if ((style.position === "fixed" || style.position === "absolute") && area(parentRect) >= viewportArea * 0.55) {
          return true;
        }
        parent = parent.parentElement;
      }
    }
    return false;
  }

  function closeLabels(element) {
    return [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
    ]
      .map(normalize)
      .filter(Boolean);
  }

  function looksLikeClose(element) {
    if (!(element instanceof HTMLElement) || !visible(element)) return false;
    return closeLabels(element).some((label) =>
      label === "close" ||
      label === "关闭" ||
      label === "关闭预览" ||
      label === "close preview" ||
      label === "close image" ||
      label === "×" ||
      label === "✕" ||
      label === "✖"
    );
  }

  function candidates() {
    const labeled = [];
    const fallback = [];
    for (const button of document.querySelectorAll("button,[role='button']")) {
      if (!(button instanceof HTMLElement) || !visible(button)) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width > 76 || rect.height > 76) continue;
      if (rect.top > 128 || rect.right < innerWidth - 360) continue;
      const distance = Math.abs(innerWidth - rect.right) + rect.top;
      if (looksLikeClose(button)) labeled.push({ button, distance });
      else if (button.querySelector("svg") && rect.right > innerWidth - 260) fallback.push({ button, distance });
    }
    const list = labeled.length ? labeled : fallback;
    list.sort((a, b) => a.distance - b.distance);
    return list.map((item) => item.button);
  }

  function move(button) {
    if (!(button instanceof HTMLElement)) return;
    button.style.setProperty("position", "fixed", "important");
    button.style.setProperty("top", "8px", "important");
    button.style.setProperty("right", "176px", "important");
    button.style.setProperty("left", "auto", "important");
    button.style.setProperty("transform", "none", "important");
    button.style.setProperty("z-index", "2147483645", "important");
    button.style.setProperty("-webkit-app-region", "no-drag", "important");
    button.dataset[MARKER] = "true";
  }

  function scan() {
    if (!previewPresent()) return;
    const [button] = candidates();
    if (button) move(button);
  }

  function scheduleScan() {
    if (scanTimer != null) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 60);
  }

  function start() {
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-modal", "title", "class", "style", "data-state"],
    });
    addEventListener("resize", scheduleScan, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
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
