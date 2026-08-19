"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxConversationTabsRuntimeV4";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated conversation tabs patch`);
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

  const GLOBAL_KEY = "__codexLinuxConversationTabsRuntimeV4";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const BAR_ID = "codex-linux-conversation-tabs";
  const LIST_ID = "codex-linux-conversation-tabs-list";
  const STYLE_ID = "codex-linux-conversation-tabs-style";
  const STORAGE_KEY = "codex-linux-conversation-tabs-v4";
  const LEGACY_STORAGE_KEYS = [
    "codex-linux-conversation-tabs-v1",
    "codex-linux-conversation-tabs-v2",
    "codex-linux-conversation-tabs-v3",
  ];
  const MAX_TABS = 16;
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
  const STATIC_LABELS = new Set([
    "new chat", "new conversation", "search", "library", "projects", "project", "plugins", "plugin",
    "scheduled", "sites", "settings", "work", "codex", "新聊天", "新建聊天", "新建对话", "搜索",
    "资料库", "项目", "插件", "已安排", "站点", "设置", "工作",
  ]);

  let tabs = [];
  let activeKey = null;
  let syncTimer = null;
  let draftCounter = 0;
  let pendingSelection = null;
  const closedKeys = new Set();

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function cleanTitle(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function keyForTitle(title) {
    const clean = cleanTitle(title);
    return clean ? `title:${normalize(clean)}` : null;
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

  function displayTitle(element) {
    if (!(element instanceof Element)) return "";
    for (const value of [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title")]) {
      const text = cleanTitle(value);
      if (text) return text;
    }
    return "";
  }

  function isNewChatControl(element) {
    return labelsFor(element).some((label) =>
      NEW_CHAT_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate} `)),
    );
  }

  function clickableFrom(target) {
    if (!(target instanceof Element)) return null;
    return target.closest("a[href],button,[role='button']");
  }

  function findNewChatControl() {
    const candidates = [];
    for (const element of document.querySelectorAll("a[href],button,[role='button']")) {
      if (!(element instanceof HTMLElement) || !visible(element) || !isNewChatControl(element)) continue;
      if (element.closest(`#${BAR_ID}`)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left > Math.min(460, innerWidth * 0.36) || rect.top > innerHeight * 0.5) continue;
      candidates.push({ element, rect });
    }
    candidates.sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
    return candidates[0]?.element ?? null;
  }

  function mainSidebar() {
    const newChat = findNewChatControl();
    if (newChat) {
      let current = newChat.parentElement;
      const candidates = [];
      while (current instanceof HTMLElement && current !== document.body) {
        const rect = current.getBoundingClientRect();
        if (rect.left <= 32 && rect.width >= 170 && rect.width <= 440 && rect.height >= innerHeight * 0.62) {
          candidates.push({ element: current, width: rect.width });
        }
        current = current.parentElement;
      }
      candidates.sort((a, b) => a.width - b.width);
      if (candidates.length) return candidates[0].element;
    }

    for (const element of document.querySelectorAll("aside,nav,[data-testid*='sidebar'],[class*='sidebar']")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left > 32 || rect.width < 170 || rect.width > 440 || rect.height < innerHeight * 0.62) continue;
      return element;
    }
    return null;
  }

  function sidebarRight() {
    const sidebar = mainSidebar();
    if (!(sidebar instanceof HTMLElement)) return 240;
    const rect = sidebar.getBoundingClientRect();
    return Math.max(0, Math.min(480, Math.round(rect.right)));
  }

  function sidebarRows() {
    const sidebar = mainSidebar();
    if (!(sidebar instanceof HTMLElement)) return [];
    const sidebarRect = sidebar.getBoundingClientRect();
    const rows = [];
    const seen = new Set();

    for (const element of sidebar.querySelectorAll("a[href],button,[role='button']")) {
      if (!(element instanceof HTMLElement) || !visible(element) || element.closest(`#${BAR_ID}`)) continue;
      if (isNewChatControl(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left < sidebarRect.left - 4 || rect.right > sidebarRect.right + 8) continue;
      if (rect.height < 22 || rect.height > 68 || rect.width < 100) continue;
      const title = displayTitle(element);
      const normalized = normalize(title);
      if (!title || !normalized || STATIC_LABELS.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      rows.push({ element, title, key: `title:${normalized}`, rect });
    }

    rows.sort((a, b) => a.rect.top - b.rect.top);
    return rows;
  }

  function rowForTarget(target) {
    if (!(target instanceof Element)) return null;
    const clickable = clickableFrom(target);
    for (const row of sidebarRows()) {
      if (row.element === clickable || row.element === target || row.element.contains(target) || (clickable && row.element.contains(clickable))) {
        return row;
      }
    }
    return null;
  }

  function rowForTab(tab) {
    if (!tab || tab.draft) return null;
    const key = keyForTitle(tab.title);
    if (!key) return null;
    return sidebarRows().find((row) => row.key === key)?.element ?? null;
  }

  function loadTabs() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      let parsed = current == null ? null : JSON.parse(current);
      if (parsed == null) {
        const legacy = localStorage.getItem("codex-linux-conversation-tabs-v3");
        if (legacy != null) parsed = JSON.parse(legacy);
      }
      for (const oldKey of LEGACY_STORAGE_KEYS) localStorage.removeItem(oldKey);
      if (!Array.isArray(parsed)) return [];

      const clean = [];
      const seen = new Set();
      for (const item of parsed) {
        if (!item || typeof item.title !== "string") continue;
        const title = cleanTitle(item.title);
        const key = keyForTitle(title);
        if (!title || !key || seen.has(key)) continue;
        seen.add(key);
        clean.push({ key, title, draft: false });
      }
      return clean.slice(-MAX_TABS);
    } catch {
      return [];
    }
  }

  function saveTabs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.filter((tab) => !tab.draft).map(({ title }) => ({ title }))));
      for (const oldKey of LEGACY_STORAGE_KEYS) localStorage.removeItem(oldKey);
    } catch {
      // Storage failures must never affect ChatGPT itself.
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      `#${BAR_ID}{position:fixed;top:0;height:48px;box-sizing:border-box;display:flex;align-items:flex-end;gap:4px;padding:0 6px 4px;background:rgba(248,248,248,.70);color:#202020;border-bottom:1px solid rgba(127,127,127,.16);z-index:2147483000;-webkit-app-region:no-drag;font-family:inherit;pointer-events:auto;-webkit-backdrop-filter:blur(18px) saturate(145%);backdrop-filter:blur(18px) saturate(145%)}`,
      `#${LIST_ID}{display:flex;align-items:flex-end;gap:3px;min-width:0;flex:1;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}`,
      `#${LIST_ID}::-webkit-scrollbar{display:none}`,
      `#${BAR_ID} .codex-linux-conversation-tab{height:32px;min-width:108px;max-width:220px;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 7px 0 10px;border:1px solid rgba(127,127,127,.12);border-radius:8px;background:rgba(255,255,255,.34);cursor:default;user-select:none;outline:none;-webkit-app-region:no-drag;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}`,
      `#${BAR_ID} .codex-linux-conversation-tab:hover{background:rgba(255,255,255,.50)}`,
      `#${BAR_ID} .codex-linux-conversation-tab[data-active='true']{background:rgba(255,255,255,.66);border-color:rgba(127,127,127,.24)}`,
      `#${BAR_ID} .codex-linux-conversation-tab-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}`,
      `#${BAR_ID} button{font:inherit;color:inherit}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close,#${BAR_ID} .codex-linux-conversation-tab-add{border:0;background:transparent;border-radius:6px;display:grid;place-items:center;padding:0;cursor:default;-webkit-app-region:no-drag}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close{width:20px;height:20px;font-size:16px;line-height:1;opacity:.65}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close:hover,#${BAR_ID} .codex-linux-conversation-tab-add:hover{background:rgba(127,127,127,.18);opacity:1}`,
      `#${BAR_ID} .codex-linux-conversation-tab-add{width:32px;height:32px;flex:0 0 32px;font-size:20px;line-height:1}`,
      `@media (prefers-color-scheme:dark){#${BAR_ID}{background:rgba(18,18,18,.70);color:#f3f3f3}#${BAR_ID} .codex-linux-conversation-tab{background:rgba(64,64,64,.34);border-color:rgba(255,255,255,.06)}#${BAR_ID} .codex-linux-conversation-tab:hover{background:rgba(78,78,78,.48)}#${BAR_ID} .codex-linux-conversation-tab[data-active='true']{background:rgba(92,92,92,.58);border-color:rgba(255,255,255,.10)}}`,
    ].join("");
    (document.head || document.documentElement)?.appendChild(style);
  }

  function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    if (!document.body) return null;

    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Conversation tabs");

    const list = document.createElement("div");
    list.id = LIST_ID;
    bar.appendChild(list);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "codex-linux-conversation-tab-add";
    add.textContent = "+";
    add.title = "New chat";
    add.setAttribute("aria-label", "New chat");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      createNewChat();
    });
    bar.appendChild(add);

    document.body.appendChild(bar);
    updateGeometry();
    return bar;
  }

  function updateGeometry() {
    const bar = document.getElementById(BAR_ID);
    if (!(bar instanceof HTMLElement)) return;
    bar.style.left = `${sidebarRight()}px`;
    bar.style.right = "138px";
  }

  function render() {
    ensureStyle();
    const bar = ensureBar();
    if (!bar) return;
    updateGeometry();
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    list.replaceChildren();

    for (const tab of tabs) {
      const item = document.createElement("div");
      item.className = "codex-linux-conversation-tab";
      item.dataset.active = String(tab.key === activeKey);
      item.setAttribute("role", "tab");
      item.setAttribute("aria-selected", String(tab.key === activeKey));
      item.tabIndex = 0;
      item.title = tab.title;

      const label = document.createElement("span");
      label.className = "codex-linux-conversation-tab-label";
      label.textContent = tab.title;
      item.appendChild(label);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "codex-linux-conversation-tab-close";
      close.textContent = "×";
      close.title = "Close tab";
      close.setAttribute("aria-label", `Close ${tab.title}`);
      close.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeTab(tab.key);
      });
      item.appendChild(close);

      item.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        activateTab(tab.key);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateTab(tab.key);
      });
      list.appendChild(item);
    }
  }

  function promoteOrUpsertTitle(title, makeActive, explicitReopen = false) {
    const clean = cleanTitle(title);
    const key = keyForTitle(clean);
    if (!clean || !key) return false;
    if (explicitReopen) closedKeys.delete(key);
    if (closedKeys.has(key)) return false;

    const draftIndex = makeActive && activeKey?.startsWith("draft:") ? tabs.findIndex((tab) => tab.key === activeKey) : -1;
    const existingIndex = tabs.findIndex((tab) => tab.key === key);
    let changed = false;

    if (draftIndex !== -1) {
      if (existingIndex !== -1 && existingIndex !== draftIndex) {
        tabs.splice(draftIndex, 1);
      } else {
        tabs[draftIndex] = { key, title: clean, draft: false };
      }
      activeKey = key;
      changed = true;
    } else if (existingIndex === -1) {
      tabs.push({ key, title: clean, draft: false });
      if (tabs.length > MAX_TABS) tabs = tabs.slice(-MAX_TABS);
      if (makeActive) activeKey = key;
      changed = true;
    } else {
      if (tabs[existingIndex].title !== clean) {
        tabs[existingIndex] = { ...tabs[existingIndex], title: clean };
        changed = true;
      }
      if (makeActive && activeKey !== key) {
        activeKey = key;
        changed = true;
      }
    }

    if (changed) {
      saveTabs();
      render();
    }
    return true;
  }

  function addDraft(makeActive = true) {
    if (makeActive && activeKey?.startsWith("draft:")) return activeKey;
    const key = `draft:${Date.now()}:${++draftCounter}`;
    tabs.push({ key, title: "新聊天", draft: true });
    if (tabs.length > MAX_TABS) tabs = tabs.slice(-MAX_TABS);
    if (makeActive) activeKey = key;
    render();
    return key;
  }

  function activateTab(key) {
    const tab = tabs.find((item) => item.key === key);
    if (!tab) return;
    activeKey = key;
    render();

    if (tab.draft) {
      const target = findNewChatControl();
      if (target instanceof HTMLElement) target.click();
      return;
    }

    const target = rowForTab(tab);
    if (target instanceof HTMLElement) {
      pendingSelection = { key: tab.key, title: tab.title, expires: Date.now() + 3000 };
      target.click();
    }
  }

  function closeTab(key) {
    const index = tabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    const tab = tabs[index];
    const wasActive = activeKey === key;
    if (!tab.draft) closedKeys.add(tab.key);
    tabs.splice(index, 1);
    saveTabs();

    if (!wasActive) {
      render();
      return;
    }

    const neighbor = tabs[index] ?? tabs[index - 1] ?? null;
    activeKey = null;
    render();
    if (neighbor) activateTab(neighbor.key);
    else createNewChat();
  }

  function createNewChat() {
    addDraft(true);
    pendingSelection = null;
    const target = findNewChatControl();
    if (target instanceof HTMLElement) target.click();
  }

  function findHeaderTitle() {
    const known = new Map();
    for (const tab of tabs) if (!tab.draft) known.set(normalize(tab.title), tab.title);
    for (const row of sidebarRows()) if (!known.has(normalize(row.title))) known.set(normalize(row.title), row.title);
    if (!known.size) return null;

    const left = sidebarRight();
    const candidates = [];
    for (const element of document.querySelectorAll("header button,header [role='button'],header div,header span,h1,h2,h3,[data-testid*='title'],main button,main div,main span")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      if (element.closest(`#${BAR_ID}`) || element.closest("aside,nav,[data-testid*='sidebar'],[class*='sidebar']")) continue;
      const rect = element.getBoundingClientRect();
      if (rect.top < 32 || rect.top > 116) continue;
      if (rect.left < left - 8 || rect.right > innerWidth - 112) continue;
      if (rect.height < 14 || rect.height > 58 || rect.width < 28 || rect.width > 760) continue;

      const title = displayTitle(element);
      const normalized = normalize(title);
      if (!normalized || normalized.length > 120) continue;
      let matched = known.get(normalized) ?? null;
      if (!matched && normalized.length >= 4) {
        for (const [key, value] of known) {
          if (key.length < 4) continue;
          if (normalized.startsWith(key) || key.startsWith(normalized)) {
            matched = value;
            break;
          }
        }
      }
      if (!matched) continue;
      candidates.push({ title: matched, area: rect.width * rect.height, top: rect.top });
    }
    candidates.sort((a, b) => a.area - b.area || a.top - b.top);
    return candidates[0]?.title ?? null;
  }

  function activeSidebarRow() {
    for (const row of sidebarRows()) {
      const element = row.element;
      if (element.getAttribute("aria-current") === "page" || element.getAttribute("aria-selected") === "true" || element.getAttribute("data-state") === "active" || element.getAttribute("data-active") === "true") {
        return row;
      }
    }
    return null;
  }

  function syncState() {
    ensureStyle();
    ensureBar();
    updateGeometry();

    const headerTitle = findHeaderTitle();
    if (headerTitle) {
      const headerKey = keyForTitle(headerTitle);
      const explicit = pendingSelection && pendingSelection.expires >= Date.now() && pendingSelection.key === headerKey;
      if (promoteOrUpsertTitle(headerTitle, true, explicit)) {
        if (explicit) pendingSelection = null;
        return;
      }
    }

    if (activeKey?.startsWith("draft:")) return;

    const row = activeSidebarRow();
    if (row) {
      const explicit = pendingSelection && pendingSelection.expires >= Date.now() && pendingSelection.key === row.key;
      if (promoteOrUpsertTitle(row.title, true, explicit) && explicit) pendingSelection = null;
    }
    if (pendingSelection && pendingSelection.expires < Date.now()) pendingSelection = null;
  }

  function scheduleSync(delay = 100) {
    if (syncTimer != null) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncState();
    }, delay);
  }

  function handleSidebarSelection(target) {
    const row = rowForTarget(target);
    if (!row) return false;
    closedKeys.delete(row.key);
    pendingSelection = { key: row.key, title: row.title, expires: Date.now() + 3000 };
    if (tabs.some((tab) => tab.key === row.key)) promoteOrUpsertTitle(row.title, true, true);
    scheduleSync(80);
    setTimeout(() => scheduleSync(80), 260);
    setTimeout(() => scheduleSync(80), 700);
    return true;
  }

  function start() {
    tabs = loadTabs();
    render();
    syncState();

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const clickable = clickableFrom(event.target);
      if (!clickable || clickable.closest(`#${BAR_ID}`)) return;
      if (isNewChatControl(clickable)) {
        addDraft(true);
        pendingSelection = null;
        scheduleSync(220);
        return;
      }
      handleSidebarSelection(event.target);
    }, true);

    document.addEventListener("contextmenu", (event) => {
      if (!event.ctrlKey || !(event.target instanceof Element)) return;
      const row = rowForTarget(event.target);
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      closedKeys.delete(row.key);
      promoteOrUpsertTitle(row.title, false, true);
    }, true);

    const observer = new MutationObserver(() => scheduleSync(90));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-selected", "data-state", "data-active", "class"],
    });

    addEventListener("resize", updateGeometry, { passive: true });
    setInterval(syncState, 900);
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
      warn("Conversation tabs runtime marker validation failed");
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
      id: "conversation-tabs",
      phase: "webview-asset",
      order: 20_950,
      ciPolicy: "optional",
      enforceWhenEnabled: false,
      pattern: APP_PAGE_ASSET_PATTERN,
      assetMatch: (source) => contract(source) !== "drifted",
      missingDescription: "current ChatGPT app-page sidebar bundle",
      skipDescription: "isolated conversation tabs patch",
      apply: applyPatch,
    },
  ],
};
