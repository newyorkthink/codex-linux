"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxDefaultHighReasoningRuntimeV3";
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

  const GLOBAL_KEY = "__codexLinuxDefaultHighReasoningRuntimeV3";
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
  const TRIGGER_TOKENS = new Set(["极速", "fast", "中", "medium", "高", "high"]);
  const HIGH_TOKENS = new Set(["高", "high"]);
  const REASONING_TOKENS = ["推理强度", "reasoning effort", "reasoning"];

  let generation = 0;
  let handledGeneration = -1;
  let startTimer = null;
  let runningGeneration = -1;
  let cycleCount = 0;

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

  function textParts(element) {
    if (!(element instanceof Element)) return [];
    const parts = new Set(labelsFor(element));
    for (const node of element.querySelectorAll("span,div,p")) {
      const text = normalize(node.textContent);
      if (text && text.length <= 48) parts.add(text);
    }
    return [...parts];
  }

  function containsToken(element, tokens) {
    return textParts(element).some((part) => tokens.has(part));
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
      if (!containsToken(element, TRIGGER_TOKENS)) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top < innerHeight * 0.32 || rect.left < innerWidth * 0.42) continue;
      if (rect.width > 360 || rect.height > 76) continue;

      const centerBias = Math.abs(rect.top + rect.height / 2 - innerHeight * 0.67);
      candidates.push({ element, rect, score: centerBias - rect.right / 1000 });
    }
    candidates.sort((a, b) => a.score - b.score || b.rect.right - a.rect.right);
    return candidates[0]?.element ?? null;
  }

  function isHighTrigger(trigger) {
    return trigger instanceof HTMLElement && containsToken(trigger, HIGH_TOKENS);
  }

  function findReasoningRow(trigger) {
    const triggerRect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : null;
    const candidates = [];

    for (const element of document.querySelectorAll("[role='menuitem'],[role='menuitemradio'],[role='option'],[role='button'],button,[data-radix-collection-item]")) {
      if (!(element instanceof HTMLElement) || !visible(element) || element === trigger) continue;
      const parts = textParts(element);
      if (!parts.some((part) => REASONING_TOKENS.some((token) => part === token || part.startsWith(`${token} `) || part.includes(token)))) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width > 560 || rect.height > 96) continue;
      let distance = 0;
      if (triggerRect) {
        const dx = rect.right < triggerRect.left ? triggerRect.left - rect.right : rect.left > triggerRect.right ? rect.left - triggerRect.right : 0;
        const dy = rect.bottom < triggerRect.top ? triggerRect.top - rect.bottom : rect.top > triggerRect.bottom ? rect.top - triggerRect.bottom : 0;
        if (dx > 520 || dy > 560) continue;
        distance = dx + dy;
      }
      candidates.push({ element, distance, rect });
    }

    candidates.sort((a, b) => a.distance - b.distance || b.rect.bottom - a.rect.bottom);
    return candidates[0]?.element ?? null;
  }

  function findHighOption(anchor) {
    const anchorRect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
    const candidates = [];

    for (const element of document.querySelectorAll("[role='menuitem'],[role='menuitemradio'],[role='option'],button,[data-radix-collection-item]")) {
      if (!(element instanceof HTMLElement) || !visible(element) || element === anchor) continue;
      if (!containsToken(element, HIGH_TOKENS)) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width > 380 || rect.height > 80) continue;
      let distance = 0;
      if (anchorRect) {
        const dx = rect.right < anchorRect.left ? anchorRect.left - rect.right : rect.left > anchorRect.right ? rect.left - anchorRect.right : 0;
        const dy = rect.bottom < anchorRect.top ? anchorRect.top - rect.bottom : rect.top > anchorRect.bottom ? rect.top - anchorRect.bottom : 0;
        if (dx > 520 || dy > 560) continue;
        distance = dx + dy;
      }
      candidates.push({ element, distance, rect });
    }

    candidates.sort((a, b) => a.distance - b.distance || b.rect.bottom - a.rect.bottom);
    return candidates[0]?.element ?? null;
  }

  function waitFor(targetGeneration, finder, tries, delay, done) {
    if (targetGeneration !== generation || handledGeneration === generation) return;
    const value = finder();
    if (value) {
      done(value);
      return;
    }
    if (tries <= 0) {
      retryCycle(targetGeneration);
      return;
    }
    setTimeout(() => waitFor(targetGeneration, finder, tries - 1, delay, done), delay);
  }

  function retryCycle(targetGeneration) {
    if (targetGeneration !== generation || handledGeneration === generation) return;
    if (runningGeneration !== targetGeneration) return;
    setTimeout(() => runCycle(targetGeneration), 260);
  }

  function runCycle(targetGeneration) {
    if (targetGeneration !== generation || handledGeneration === generation) return;
    if (cycleCount >= 12) {
      runningGeneration = -1;
      return;
    }
    cycleCount += 1;
    runningGeneration = targetGeneration;

    const trigger = findComposerTrigger();
    if (!trigger) {
      retryCycle(targetGeneration);
      return;
    }

    if (isHighTrigger(trigger)) {
      handledGeneration = generation;
      runningGeneration = -1;
      return;
    }

    trigger.click();

    waitFor(targetGeneration, () => findReasoningRow(trigger), 14, 90, (reasoningRow) => {
      reasoningRow.click();
      waitFor(targetGeneration, () => findHighOption(reasoningRow), 14, 90, (high) => {
        high.click();
        setTimeout(() => {
          if (targetGeneration !== generation) return;
          const current = findComposerTrigger();
          if (current && isHighTrigger(current)) {
            handledGeneration = generation;
            runningGeneration = -1;
            return;
          }
          retryCycle(targetGeneration);
        }, 220);
      });
    });
  }

  function beginNewChat(delay = 180) {
    generation += 1;
    handledGeneration = -1;
    runningGeneration = -1;
    cycleCount = 0;
    if (startTimer != null) clearTimeout(startTimer);
    const targetGeneration = generation;
    startTimer = setTimeout(() => {
      startTimer = null;
      runCycle(targetGeneration);
    }, delay);
  }

  function blankChatSurface() {
    const trigger = findComposerTrigger();
    if (!(trigger instanceof HTMLElement)) return false;
    const rect = trigger.getBoundingClientRect();
    if (rect.top < innerHeight * 0.32 || rect.top > innerHeight * 0.8) return false;

    const message = document.querySelector(
      "[data-message-author-role='user'],[data-message-author-role='assistant'],article[data-testid*='conversation']",
    );
    return !message;
  }

  function ensureBlankChatHigh() {
    if (!blankChatSurface()) return;
    const trigger = findComposerTrigger();
    if (trigger && isHighTrigger(trigger)) return;
    if (runningGeneration === generation || startTimer != null) return;
    beginNewChat(80);
  }

  function start() {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const clickable = event.target.closest("a[href],button,[role='button']");
      if (clickable && isNewChatControl(clickable)) beginNewChat(180);
    }, true);

    const observer = new MutationObserver(() => {
      setTimeout(ensureBlankChatHigh, 80);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "class", "data-state", "aria-expanded"],
    });

    setTimeout(ensureBlankChatHigh, 350);
    setTimeout(ensureBlankChatHigh, 900);
    setTimeout(ensureBlankChatHigh, 1800);
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
