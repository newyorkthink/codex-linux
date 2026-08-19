"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxDefaultHighReasoningRuntimeV2";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated default-high reasoning patch`);
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

  const GLOBAL_KEY = "__codexLinuxDefaultHighReasoningRuntimeV2";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const NEW_CHAT_LABELS = [
    "new chat",
    "new conversation",
    "start a new chat",
    "新聊天",
    "新建聊天",
    "新建对话",
    "开始新聊天",
    "开始新对话",
  ];
  const TRIGGER_LABELS = new Set(["极速", "fast", "中", "medium", "高", "high"]);
  const HIGH_LABELS = new Set(["高", "high"]);
  const REASONING_LABELS = ["推理强度", "reasoning effort", "reasoning"];

  let generation = 0;
  let handledGeneration = -1;
  let timer = null;

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

  function labelsFor(element) {
    if (!(element instanceof Element)) return [];
    return [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title")]
      .map(normalize)
      .filter(Boolean);
  }

  function isNewChatControl(element) {
    return labelsFor(element).some((label) =>
      NEW_CHAT_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate} `)),
    );
  }

  function findComposerTrigger() {
    const candidates = [];
    for (const element of document.querySelectorAll("button,[role='button']")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const labels = labelsFor(element);
      if (!labels.some((label) => TRIGGER_LABELS.has(label))) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom < innerHeight - 190 || rect.top < innerHeight * 0.58) continue;
      if (rect.width > 320 || rect.height > 72) continue;
      candidates.push({ element, rect });
    }
    candidates.sort((a, b) => b.rect.bottom - a.rect.bottom || b.rect.right - a.rect.right);
    return candidates[0]?.element ?? null;
  }

  function findReasoningRow() {
    const candidates = [];
    for (const element of document.querySelectorAll("[role='menuitem'],[role='button'],button,[data-radix-collection-item]")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const labels = labelsFor(element);
      if (!labels.some((label) => REASONING_LABELS.some((needle) => label === needle || label.startsWith(`${needle} `)))) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 520 || rect.height > 84) continue;
      candidates.push({ element, rect });
    }
    candidates.sort((a, b) => b.rect.bottom - a.rect.bottom || b.rect.right - a.rect.right);
    return candidates[0]?.element ?? null;
  }

  function findHighOption(anchor) {
    const anchorRect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
    const candidates = [];
    for (const element of document.querySelectorAll("[role='menuitem'],[role='menuitemradio'],[role='option'],button,[data-radix-collection-item]")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const labels = labelsFor(element);
      if (!labels.some((label) => HIGH_LABELS.has(label))) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 360 || rect.height > 72) continue;
      let distance = 0;
      if (anchorRect) {
        const dx = rect.right < anchorRect.left ? anchorRect.left - rect.right : rect.left > anchorRect.right ? rect.left - anchorRect.right : 0;
        const dy = rect.bottom < anchorRect.top ? anchorRect.top - rect.bottom : rect.top > anchorRect.bottom ? rect.top - anchorRect.bottom : 0;
        if (dx > 480 || dy > 520) continue;
        distance = dx + dy;
      }
      candidates.push({ element, distance, rect });
    }
    candidates.sort((a, b) => a.distance - b.distance || b.rect.bottom - a.rect.bottom);
    return candidates[0]?.element ?? null;
  }

  function currentTriggerIsHigh(trigger) {
    return labelsFor(trigger).some((label) => HIGH_LABELS.has(label));
  }

  function trySetHigh(targetGeneration, attemptIndex) {
    if (targetGeneration !== generation || handledGeneration === generation) return;

    const trigger = findComposerTrigger();
    if (!trigger) {
      if (attemptIndex < 18) setTimeout(() => trySetHigh(targetGeneration, attemptIndex + 1), 220);
      return;
    }

    if (currentTriggerIsHigh(trigger)) {
      handledGeneration = generation;
      return;
    }

    trigger.click();

    setTimeout(() => {
      if (targetGeneration !== generation || handledGeneration === generation) return;

      const reasoningRow = findReasoningRow();
      if (reasoningRow) {
        reasoningRow.click();
        setTimeout(() => {
          if (targetGeneration !== generation || handledGeneration === generation) return;
          const high = findHighOption(reasoningRow);
          if (high) {
            high.click();
            handledGeneration = generation;
            return;
          }
          if (attemptIndex < 18) setTimeout(() => trySetHigh(targetGeneration, attemptIndex + 1), 220);
        }, 100);
        return;
      }

      const directHigh = findHighOption(trigger);
      if (directHigh) {
        directHigh.click();
        handledGeneration = generation;
        return;
      }

      if (attemptIndex < 18) setTimeout(() => trySetHigh(targetGeneration, attemptIndex + 1), 220);
    }, 110);
  }

  function beginNewChat(delay = 320) {
    generation += 1;
    handledGeneration = -1;
    if (timer != null) clearTimeout(timer);
    const targetGeneration = generation;
    timer = setTimeout(() => {
      timer = null;
      trySetHigh(targetGeneration, 0);
    }, delay);
  }

  function likelyBlankChat() {
    const message = document.querySelector("[data-message-author-role='user'],[data-message-author-role='assistant'],article[data-testid*='conversation']");
    if (message) return false;
    return findComposerTrigger() instanceof HTMLElement;
  }

  function start() {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const clickable = event.target.closest("a[href],button,[role='button']");
      if (clickable && isNewChatControl(clickable)) beginNewChat(360);
    }, true);

    setTimeout(() => {
      if (likelyBlankChat()) beginNewChat(120);
    }, 900);
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
      id: "default-high-reasoning",
      phase: "webview-asset",
      order: 20_960,
      ciPolicy: "optional",
      enforceWhenEnabled: false,
      pattern: APP_PAGE_ASSET_PATTERN,
      assetMatch: (source) => contract(source) !== "drifted",
      missingDescription: "current ChatGPT app-page bundle",
      skipDescription: "isolated default-high reasoning patch",
      apply: applyPatch,
    },
  ],
};
