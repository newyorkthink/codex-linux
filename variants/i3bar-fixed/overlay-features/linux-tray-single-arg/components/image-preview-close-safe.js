"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxImagePreviewCloseSafeRuntimeV2";
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

  const GLOBAL_KEY = "__codexLinuxImagePreviewCloseSafeRuntimeV2";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const PROXY_ID = "codex-linux-image-preview-close-proxy";
  const STYLE_ID = "codex-linux-image-preview-close-style";
  const MOVED_MARKER = "codexLinuxImagePreviewCloseMoved";
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

  function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function hasPreviewMedia(root) {
    if (!(root instanceof Element)) return false;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);

    for (const media of root.querySelectorAll("img,canvas,video,picture")) {
      if (!(media instanceof HTMLElement) || !visible(media)) continue;
      const rect = media.getBoundingClientRect();
      if (rect.width >= 280 && rect.height >= 180 && rectArea(rect) >= viewportArea * 0.08) return true;
    }

    for (const element of root.querySelectorAll("div,figure")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rectArea(rect) < viewportArea * 0.12) continue;
      const background = window.getComputedStyle(element).backgroundImage;
      if (background && background !== "none") return true;
    }

    return false;
  }

  function previewRoot() {
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const candidates = [];

    for (const element of document.querySelectorAll("[role='dialog'],[aria-modal='true'],[data-state='open']")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rectArea(rect) < viewportArea * 0.35) continue;
      if (!hasPreviewMedia(element)) continue;
      candidates.push({ element, area: rectArea(rect) });
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.area - a.area);
      return candidates[0].element;
    }

    for (const media of document.querySelectorAll("img,canvas,video,picture")) {
      if (!(media instanceof HTMLElement) || !visible(media)) continue;
      const mediaRect = media.getBoundingClientRect();
      if (rectArea(mediaRect) < viewportArea * 0.14) continue;

      let ancestor = media.parentElement;
      while (ancestor instanceof HTMLElement && ancestor !== document.body) {
        const style = window.getComputedStyle(ancestor);
        const rect = ancestor.getBoundingClientRect();
        if ((style.position === "fixed" || style.position === "absolute") && rectArea(rect) >= viewportArea * 0.55) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
      }
    }

    return null;
  }

  function isCloseLabel(element) {
    if (!(element instanceof HTMLElement)) return false;
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
      label === "close image" ||
      label === "×" ||
      label === "✕" ||
      label === "✖"
    );
  }

  function findOriginalClose(root) {
    if (!(root instanceof HTMLElement)) return null;
    const rootRect = root.getBoundingClientRect();
    const labeled = [];
    const positional = [];

    for (const button of root.querySelectorAll("button,[role='button']")) {
      if (!(button instanceof HTMLElement) || !visible(button) || button.id === PROXY_ID) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width > 72 || rect.height > 72) continue;
      const nearTop = rect.top <= rootRect.top + 112;
      const nearRight = rect.right >= rootRect.right - 260;
      if (!nearTop || !nearRight) continue;

      const distance = Math.abs(rootRect.right - rect.right) + Math.abs(rect.top - rootRect.top);
      if (isCloseLabel(button)) labeled.push({ button, distance });
      else positional.push({ button, distance });
    }

    const candidates = labeled.length ? labeled : positional;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.button ?? null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const target = document.head || document.documentElement;
    if (!target) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      `#${PROXY_ID}{position:fixed;top:8px;right:172px;width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid rgba(127,127,127,.24);border-radius:999px;background:rgba(245,245,245,.78);color:#202020;font:24px/1 sans-serif;z-index:2147483646;cursor:default;-webkit-app-region:no-drag;-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%)}`,
      `#${PROXY_ID}:hover{background:rgba(255,255,255,.94)}`,
      `@media (prefers-color-scheme:dark){#${PROXY_ID}{background:rgba(36,36,36,.78);color:#f4f4f4;border-color:rgba(255,255,255,.12)}#${PROXY_ID}:hover{background:rgba(54,54,54,.94)}}`,
    ].join("");
    target.appendChild(style);
  }

  function dispatchEscape() {
    const init = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent("keydown", init));
    document.dispatchEvent(new KeyboardEvent("keyup", init));
    window.dispatchEvent(new KeyboardEvent("keydown", init));
    window.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  function moveOriginal(button) {
    if (!(button instanceof HTMLElement) || button.dataset[MOVED_MARKER] === "true") return;
    button.style.setProperty("transform", "translateX(-156px)", "important");
    button.style.setProperty("z-index", "2147483645", "important");
    button.dataset[MOVED_MARKER] = "true";
  }

  function removeProxy() {
    document.getElementById(PROXY_ID)?.remove();
  }

  function ensureProxy(root, original) {
    ensureStyle();
    let proxy = document.getElementById(PROXY_ID);
    if (!(proxy instanceof HTMLButtonElement)) {
      proxy = document.createElement("button");
      proxy.id = PROXY_ID;
      proxy.type = "button";
      proxy.textContent = "×";
      proxy.title = "Close preview";
      proxy.setAttribute("aria-label", "Close preview");
      document.body?.appendChild(proxy);
    }

    proxy.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentRoot = previewRoot() || root;
      const currentOriginal = findOriginalClose(currentRoot) || original;
      if (currentOriginal instanceof HTMLElement && currentOriginal !== proxy) {
        currentOriginal.click();
      } else {
        dispatchEscape();
      }
      window.setTimeout(scheduleScan, 60);
    };
  }

  function scan() {
    const root = previewRoot();
    if (!root) {
      removeProxy();
      return;
    }

    const original = findOriginalClose(root);
    if (original) moveOriginal(original);
    ensureProxy(root, original);
  }

  function scheduleScan() {
    if (scanTimer != null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scan();
    }, 60);
  }

  const start = () => {
    scan();
    const observer = new MutationObserver(scheduleScan);
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "aria-modal", "title", "class", "style", "data-state"],
      });
    }
    window.addEventListener("resize", scheduleScan, { passive: true });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") window.setTimeout(scheduleScan, 60);
    }, true);
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
