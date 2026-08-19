"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxDefaultHighReasoningRuntimeV1";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated default-high reasoning patch`);
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

  const GLOBAL_KEY = "__codexLinuxDefaultHighReasoningRuntimeV1";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const CONVERSATION_ROUTE = /(?:^|[\/#])(?:c|chat|conversation|thread)\/[A-Za-z0-9_-]{6,}(?:[\/?#]|$)/i;
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
  const MEDIUM_LABELS = [
    "中",
    "medium",
    "推理强度 中",
    "推理强度：中",
    "reasoning medium",
    "reasoning effort medium",
  ];
  const HIGH_LABELS = [
    "高",
    "high",
    "推理强度 高",
    "推理强度：高",
    "reasoning high",
    "reasoning effort high",
  ];

  let generation = 0;
  let handledGeneration = -1;
  let attemptTimer = null;
  let lastLocation = window.location.href;

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function labelsFor(element) {
    if (!(element instanceof Element)) return [];
    return [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-state"),
    ]
      .map(normalize)
      .filter(Boolean);
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

  function labelMatches(element, candidates) {
    const labels = labelsFor(element);
    return labels.some((label) =>
      candidates.some((candidate) => label === candidate || label.endsWith(` ${candidate}`)),
    );
  }

  function isConversationLocation() {
    return CONVERSATION_ROUTE.test(`${window.location.pathname}${window.location.hash}`);
  }

  function findReasoningControl() {
    const controls = [];
    for (const element of document.querySelectorAll("button,[role='button']")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      if (!labelMatches(element, MEDIUM_LABELS) && !labelMatches(element, HIGH_LABELS)) continue;

      const rect = element.getBoundingClientRect();
      if (rect.bottom < window.innerHeight * 0.55) continue;
      if (rect.width > 280 || rect.height > 72) continue;
      controls.push({ element, rect });
    }
    controls.sort((a, b) => b.rect.bottom - a.rect.bottom || b.rect.right - a.rect.right);
    return controls[0]?.element ?? null;
  }

  function findHighOption(trigger) {
    if (!(trigger instanceof HTMLElement)) return null;
    const triggerRect = trigger.getBoundingClientRect();
    const candidates = [];

    for (const element of document.querySelectorAll(
      "[role='menuitem'],[role='menuitemradio'],[role='option'],button,[data-radix-collection-item]",
    )) {
      if (!(element instanceof HTMLElement) || element === trigger || !visible(element)) continue;
      if (!labelMatches(element, HIGH_LABELS)) continue;

      const rect = element.getBoundingClientRect();
      const horizontalDistance =
        rect.right < triggerRect.left
          ? triggerRect.left - rect.right
          : rect.left > triggerRect.right
            ? rect.left - triggerRect.right
            : 0;
      const verticalDistance =
        rect.bottom < triggerRect.top
          ? triggerRect.top - rect.bottom
          : rect.top > triggerRect.bottom
            ? rect.top - triggerRect.bottom
            : 0;
      if (horizontalDistance > 360 || verticalDistance > 420) continue;
      candidates.push({ element, distance: horizontalDistance + verticalDistance });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.element ?? null;
  }

  function scheduleAttempt(delay = 160) {
    if (handledGeneration === generation) return;
    if (attemptTimer != null) window.clearTimeout(attemptTimer);
    const targetGeneration = generation;
    attemptTimer = window.setTimeout(() => {
      attemptTimer = null;
      attemptSetHigh(targetGeneration, 0);
    }, delay);
  }

  function attemptSetHigh(targetGeneration, attempt) {
    if (targetGeneration !== generation || handledGeneration === generation) return;

    const control = findReasoningControl();
    if (control && labelMatches(control, HIGH_LABELS)) {
      handledGeneration = generation;
      return;
    }

    if (!control) {
      if (attempt < 10) {
        window.setTimeout(() => attemptSetHigh(targetGeneration, attempt + 1), 220);
      }
      return;
    }

    control.click();

    window.setTimeout(() => {
      if (targetGeneration !== generation || handledGeneration === generation) return;

      const option = findHighOption(control);
      if (option) {
        option.click();
        handledGeneration = generation;
        return;
      }

      if (attempt < 10) {
        window.setTimeout(() => attemptSetHigh(targetGeneration, attempt + 1), 220);
      }
    }, 90);
  }

  function beginNewChat() {
    generation += 1;
    handledGeneration = -1;
    scheduleAttempt(180);
  }

  function isNewChatControl(element) {
    return labelsFor(element).some((label) =>
      NEW_CHAT_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate} `)),
    );
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const clickable = event.target.closest("a[href],button,[role='button']");
      if (clickable && isNewChatControl(clickable)) beginNewChat();
    },
    true,
  );

  window.setInterval(() => {
    const current = window.location.href;
    if (current === lastLocation) return;
    const wasConversation = CONVERSATION_ROUTE.test(lastLocation);
    lastLocation = current;
    if (wasConversation && !isConversationLocation()) beginNewChat();
  }, 350);

  if (!isConversationLocation()) beginNewChat();
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
