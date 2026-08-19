"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxImagePreviewCloseSafeRuntimeV4";
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

  const GLOBAL_KEY = "__codexLinuxImagePreviewCloseSafeRuntimeV4";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const MARKER = "codexLinuxImagePreviewCloseMovedV4";
  const TAB_BAR_ID = "codex-linux-conversation-tabs";
  const TAB_PREVIEW_MARKER = "codexLinuxImagePreviewDemoted";
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

  function findPreviewRoot() {
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const candidates = [];

    for (const root of document.querySelectorAll("[role='dialog'],[aria-modal='true'],[data-state='open']")) {
      if (!(root instanceof HTMLElement) || !visible(root)) continue;
      const rect = root.getBoundingClientRect();
      if (area(rect) < viewportArea * 0.35) continue;

      let hasLargeMedia = false;
      for (const media of root.querySelectorAll("img,canvas,video,picture")) {
        if (!(media instanceof HTMLElement) || !visible(media)) continue;
        if (area(media.getBoundingClientRect()) >= viewportArea * 0.08) {
          hasLargeMedia = true;
          break;
        }
      }
      if (hasLargeMedia) candidates.push({ root, size: area(rect) });
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.size - a.size);
      return candidates[0].root;
    }

    for (const media of document.querySelectorAll("img,canvas,video,picture")) {
      if (!(media instanceof HTMLElement) || !visible(media)) continue;
      if (area(media.getBoundingClientRect()) < viewportArea * 0.14) continue;

      let parent = media.parentElement;
      while (parent instanceof HTMLElement && parent !== document.body) {
        const rect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        if ((style.position === "fixed" || style.position === "absolute") && area(rect) >= viewportArea * 0.55) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    return null;
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

  function findCloseButton(root) {
    if (!(root instanceof HTMLElement)) return null;
    const rootRect = root.getBoundingClientRect();
    const labeled = [];
    const fallback = [];

    const collect = (button, allowFallback) => {
      if (!(button instanceof HTMLElement) || !visible(button)) return;
      const rect = button.getBoundingClientRect();
      if (rect.width > 76 || rect.height > 76) return;
      if (rect.top > rootRect.top + 160 || rect.right < rootRect.right - 360) return;

      const distance = Math.abs(rootRect.right - rect.right) + Math.abs(rect.top - rootRect.top);
      if (looksLikeClose(button)) labeled.push({ button, distance });
      else if (allowFallback && button.querySelector("svg") && rect.top <= rootRect.top + 104 && rect.right >= rootRect.right - 180) {
        fallback.push({ button, distance });
      }
    };

    for (const button of root.querySelectorAll("button,[role='button']")) collect(button, true);

    if (!labeled.length) {
      for (const button of document.querySelectorAll("button,[role='button']")) {
        if (root.contains(button)) continue;
        collect(button, false);
      }
    }

    const list = labeled.length ? labeled : fallback;
    list.sort((a, b) => a.distance - b.distance);
    return list[0]?.button ?? null;
  }

  function setTabsPreviewState(active) {
    const bar = document.getElementById(TAB_BAR_ID);
    if (!(bar instanceof HTMLElement)) return;

    if (active) {
      if (bar.dataset[TAB_PREVIEW_MARKER] === "true") return;
      bar.dataset[TAB_PREVIEW_MARKER] = "true";
      bar.style.setProperty("z-index", "1", "important");
      bar.style.setProperty("pointer-events", "none", "important");
      bar.style.setProperty("filter", "blur(7px)", "important");
      bar.style.setProperty("opacity", "0.28", "important");
      return;
    }

    if (bar.dataset[TAB_PREVIEW_MARKER] !== "true") return;
    delete bar.dataset[TAB_PREVIEW_MARKER];
    bar.style.removeProperty("z-index");
    bar.style.removeProperty("pointer-events");
    bar.style.removeProperty("filter");
    bar.style.removeProperty("opacity");
  }

  function move(button) {
    if (!(button instanceof HTMLElement)) return;
    button.style.setProperty("position", "fixed", "important");
    button.style.setProperty("top", "58px", "important");
    button.style.setProperty("right", "18px", "important");
    button.style.setProperty("left", "auto", "important");
    button.style.setProperty("transform", "none", "important");
    button.style.setProperty("z-index", "2147483645", "important");
    button.style.setProperty("visibility", "visible", "important");
    button.style.setProperty("opacity", "1", "important");
    button.style.setProperty("pointer-events", "auto", "important");
    button.style.setProperty("-webkit-app-region", "no-drag", "important");
    button.dataset[MARKER] = "true";
  }

  function scan() {
    const root = findPreviewRoot();
    if (!root) {
      setTabsPreviewState(false);
      return;
    }

    setTabsPreviewState(true);
    const button = findCloseButton(root);
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
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setTimeout(scheduleScan, 80);
    }, true);
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
