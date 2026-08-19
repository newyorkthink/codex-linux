"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxConversationTabsRuntimeV2";
const APP_PAGE_MARKERS = [
  "group/folder-row",
  "className:`text-fade-truncate pe-1`",
];

function warn(message) {
  console.warn(`WARN: ${message} - skipping isolated conversation tabs patch`);
}

function conversationTabsContract(source) {
  if (typeof source !== "string") return "drifted";

  const markerCount = source.split(RUNTIME_MARKER).length - 1;
  if (markerCount === 1) return "patched";
  if (markerCount !== 0) return "drifted";

  return APP_PAGE_MARKERS.every((marker) => source.includes(marker)) ? "current" : "drifted";
}

function installConversationTabsRuntime() {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  const GLOBAL_KEY = "__codexLinuxConversationTabsRuntimeV2";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const BAR_ID = "codex-linux-conversation-tabs";
  const LIST_ID = "codex-linux-conversation-tabs-list";
  const STYLE_ID = "codex-linux-conversation-tabs-style";
  const STORAGE_KEY = "codex-linux-conversation-tabs-v2";
  const LEGACY_STORAGE_KEY = "codex-linux-conversation-tabs-v1";
  const MAX_TABS = 16;
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

  let tabs = [];
  let activeKey = null;
  let syncTimer = null;
  let draftCounter = 0;

  function normalizeLabel(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function normalizedHref(value) {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI || window.location.href);
      const sameOrigin = url.origin === window.location.origin;
      const sameFileProtocol = url.protocol === "file:" && window.location.protocol === "file:";
      if (!sameOrigin && !sameFileProtocol) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  function isConversationHref(href) {
    return typeof href === "string" && CONVERSATION_ROUTE.test(href);
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

  function elementLabels(element) {
    if (!(element instanceof Element)) return [];
    return [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ]
      .map(normalizeLabel)
      .filter(Boolean);
  }

  function displayTitle(element) {
    if (!(element instanceof Element)) return "";
    for (const candidate of [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ]) {
      const compact = String(candidate ?? "").replace(/\s+/g, " ").trim();
      if (compact) return compact.slice(0, 120);
    }
    return "";
  }

  function clickableFrom(target) {
    if (!(target instanceof Element)) return null;
    return target.closest("a[href],button,[role='button']");
  }

  function hrefFrom(element) {
    if (!(element instanceof Element)) return null;
    const anchor = element.matches("a[href]") ? element : element.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return null;
    return normalizedHref(anchor.href || anchor.getAttribute("href"));
  }

  function isNewChatControl(element) {
    return elementLabels(element).some((label) =>
      NEW_CHAT_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate} `)),
    );
  }

  function tabDescriptorFor(element) {
    if (!(element instanceof Element) || element.closest(`#${BAR_ID}`)) return null;
    const href = hrefFrom(element);
    if (!href || !isConversationHref(href)) return null;
    const title = displayTitle(element) || "Chat";
    return { key: `href:${href}`, href, title };
  }

  function cleanStoredTabs(parsed) {
    if (!Array.isArray(parsed)) return [];
    const clean = [];
    const seen = new Set();
    for (const item of parsed) {
      if (!item || typeof item.href !== "string" || typeof item.title !== "string") continue;
      const href = normalizedHref(item.href);
      if (!href || !isConversationHref(href)) continue;
      const key = `href:${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ key, href, title: item.title.slice(0, 120), draft: false });
    }
    return clean.slice(-MAX_TABS);
  }

  function loadTabs() {
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current != null) return cleanStoredTabs(JSON.parse(current));

      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy == null) return [];
      const migrated = cleanStoredTabs(JSON.parse(legacy));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    } catch {
      return [];
    }
  }

  function saveTabs() {
    try {
      const persisted = tabs.filter((tab) => !tab.draft);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Storage failure must never affect ChatGPT itself.
    }
  }

  function sidebarRight() {
    const candidates = [];
    for (const element of document.querySelectorAll("aside,nav,[data-testid*='sidebar'],[class*='sidebar']")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left > 64 || rect.width > 480 || rect.height < window.innerHeight * 0.45) continue;
      candidates.push(rect.right);
    }
    return candidates.length ? Math.max(...candidates) : 0;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const target = document.head || document.documentElement;
    if (!target) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      `#${BAR_ID}{position:fixed;top:0;height:48px;box-sizing:border-box;display:flex;align-items:flex-end;gap:4px;padding:0 6px 4px;background:rgba(248,248,248,.72);color:#202020;border-bottom:1px solid rgba(127,127,127,.18);z-index:2147483000;-webkit-app-region:no-drag;font-family:inherit;pointer-events:auto;-webkit-backdrop-filter:blur(18px) saturate(145%);backdrop-filter:blur(18px) saturate(145%)}`,
      `#${LIST_ID}{display:flex;align-items:flex-end;gap:3px;min-width:0;flex:1;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}`,
      `#${LIST_ID}::-webkit-scrollbar{display:none}`,
      `#${BAR_ID} .codex-linux-conversation-tab{height:32px;min-width:108px;max-width:220px;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 7px 0 10px;border:1px solid rgba(127,127,127,.12);border-radius:8px;background:rgba(255,255,255,.34);cursor:default;user-select:none;outline:none;-webkit-app-region:no-drag;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}`,
      `#${BAR_ID} .codex-linux-conversation-tab:hover{background:rgba(255,255,255,.48)}`,
      `#${BAR_ID} .codex-linux-conversation-tab[data-active='true']{background:rgba(255,255,255,.64);border-color:rgba(127,127,127,.24)}`,
      `#${BAR_ID} .codex-linux-conversation-tab-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}`,
      `#${BAR_ID} button{font:inherit;color:inherit}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close,#${BAR_ID} .codex-linux-conversation-tab-add{border:0;background:transparent;border-radius:6px;display:grid;place-items:center;padding:0;cursor:default;-webkit-app-region:no-drag}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close{width:20px;height:20px;font-size:16px;line-height:1;opacity:.65}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close:hover,#${BAR_ID} .codex-linux-conversation-tab-add:hover{background:rgba(127,127,127,.18);opacity:1}`,
      `#${BAR_ID} .codex-linux-conversation-tab-add{width:32px;height:32px;flex:0 0 32px;font-size:20px;line-height:1}`,
      `@media (prefers-color-scheme:dark){#${BAR_ID}{background:rgba(18,18,18,.70);color:#f3f3f3}#${BAR_ID} .codex-linux-conversation-tab{background:rgba(64,64,64,.34);border-color:rgba(255,255,255,.06)}#${BAR_ID} .codex-linux-conversation-tab:hover{background:rgba(78,78,78,.48)}#${BAR_ID} .codex-linux-conversation-tab[data-active='true']{background:rgba(92,92,92,.58);border-color:rgba(255,255,255,.10)}}`,
    ].join("");
    target.appendChild(style);
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
      createNewChat(true);
    });
    bar.appendChild(add);

    document.body.appendChild(bar);
    updateGeometry();
    return bar;
  }

  function updateGeometry() {
    const bar = document.getElementById(BAR_ID);
    if (!(bar instanceof HTMLElement)) return;
    bar.style.left = `${Math.max(0, Math.round(sidebarRight()))}px`;
    bar.style.right = "138px";
  }

  function render() {
    ensureStyle();
    const bar = ensureBar();
    if (!bar) return;
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
      close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTab(tab.key);
      });
      item.appendChild(close);

      item.addEventListener("click", () => activateTab(tab.key));
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateTab(tab.key);
      });
      list.appendChild(item);
    }
  }

  function upsertTab(tab, makeActive) {
    if (!tab || typeof tab.key !== "string" || typeof tab.title !== "string") return;
    const index = tabs.findIndex((item) => item.key === tab.key);
    if (index === -1) {
      tabs.push({
        key: tab.key,
        href: tab.href ?? null,
        title: tab.title.slice(0, 120),
        draft: Boolean(tab.draft),
      });
      if (tabs.length > MAX_TABS) tabs = tabs.slice(-MAX_TABS);
    } else {
      tabs[index] = {
        ...tabs[index],
        href: tab.href ?? tabs[index].href ?? null,
        title: tab.title.slice(0, 120),
        draft: Boolean(tab.draft ?? tabs[index].draft),
      };
    }

    if (makeActive) activeKey = tab.key;
    saveTabs();
    render();
  }

  function beginDraft(forceNew) {
    const current = tabs.find((tab) => tab.key === activeKey);
    if (!forceNew && current?.draft) return current;

    draftCounter += 1;
    const draft = {
      key: `draft:${Date.now()}:${draftCounter}`,
      href: null,
      title: "新聊天",
      draft: true,
    };
    tabs.push(draft);
    if (tabs.length > MAX_TABS) tabs = tabs.slice(-MAX_TABS);
    activeKey = draft.key;
    render();
    return draft;
  }

  function findClickableForTab(tab) {
    if (!tab?.href) return null;
    for (const anchor of document.querySelectorAll("a[href]")) {
      if (anchor.closest(`#${BAR_ID}`)) continue;
      if (hrefFrom(anchor) === tab.href) return anchor;
    }
    return null;
  }

  function activateTab(key) {
    const tab = tabs.find((item) => item.key === key);
    if (!tab) return;
    activeKey = tab.key;
    render();

    if (tab.draft) {
      navigateToNewChat();
      return;
    }

    const target = findClickableForTab(tab);
    if (target instanceof HTMLElement) {
      target.click();
      return;
    }

    if (!tab.href) return;
    try {
      window.location.assign(new URL(tab.href, document.baseURI || window.location.href).href);
    } catch {
      // A stale route must not disturb the app.
    }
  }

  function closeTab(key) {
    const index = tabs.findIndex((item) => item.key === key);
    if (index === -1) return;
    const wasActive = activeKey === key;
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
    else createNewChat(true);
  }

  function findNewChatControl() {
    const candidates = [];
    for (const candidate of document.querySelectorAll("a[href],button,[role='button']")) {
      if (!(candidate instanceof HTMLElement) || candidate.closest(`#${BAR_ID}`) || !visible(candidate)) continue;
      if (!isNewChatControl(candidate)) continue;
      const rect = candidate.getBoundingClientRect();
      const score = (rect.left < 420 ? 0 : 5000) + rect.top + rect.left * 0.01;
      candidates.push({ candidate, score });
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.candidate ?? null;
  }

  function navigateToNewChat() {
    const target = findNewChatControl();
    if (target instanceof HTMLElement) {
      target.click();
      return;
    }

    try {
      const next = new URL(window.location.href);
      next.pathname = "/";
      next.hash = "";
      window.location.assign(next.href);
    } catch {
      console.warn("WARN: ChatGPT New chat control not found - conversation tab did not navigate");
    }
  }

  function createNewChat(forceNewDraft) {
    beginDraft(Boolean(forceNewDraft));
    navigateToNewChat();
  }

  function titleForHref(href) {
    for (const anchor of document.querySelectorAll("a[href]")) {
      if (anchor.closest(`#${BAR_ID}`)) continue;
      if (hrefFrom(anchor) !== href) continue;
      const title = displayTitle(anchor);
      if (title) return title;
    }
    const existing = tabs.find((tab) => tab.href === href);
    return existing?.title || "Chat";
  }

  function syncFromLocation() {
    const href = normalizedHref(window.location.href);
    if (!isConversationHref(href)) return false;

    const key = `href:${href}`;
    const title = titleForHref(href);
    const draftIndex = tabs.findIndex((tab) => tab.key === activeKey && tab.draft);
    const existingIndex = tabs.findIndex((tab) => tab.key === key);

    if (draftIndex !== -1) {
      if (existingIndex !== -1 && existingIndex !== draftIndex) {
        tabs.splice(draftIndex, 1);
      } else {
        tabs[draftIndex] = { key, href, title, draft: false };
      }
      activeKey = key;
      saveTabs();
      render();
      return true;
    }

    upsertTab({ key, href, title, draft: false }, true);
    return true;
  }

  function syncState() {
    ensureStyle();
    if (!document.getElementById(BAR_ID)) render();
    updateGeometry();
    syncFromLocation();
  }

  function scheduleSync() {
    if (syncTimer != null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      syncState();
    }, 120);
  }

  function start() {
    tabs = loadTabs();
    render();
    syncState();

    document.addEventListener(
      "click",
      (event) => {
        const clickable = clickableFrom(event.target);
        if (!clickable || clickable.closest(`#${BAR_ID}`)) return;

        if (isNewChatControl(clickable)) {
          beginDraft(false);
          return;
        }

        const tab = tabDescriptorFor(clickable);
        if (tab) upsertTab(tab, true);
      },
      true,
    );

    document.addEventListener(
      "contextmenu",
      (event) => {
        if (!event.ctrlKey) return;
        const clickable = clickableFrom(event.target);
        if (!clickable || clickable.closest(`#${BAR_ID}`)) return;
        const tab = tabDescriptorFor(clickable);
        if (!tab) return;

        event.preventDefault();
        event.stopPropagation();
        upsertTab(tab, false);
      },
      true,
    );

    const observer = new MutationObserver(scheduleSync);
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "aria-label", "title"],
      });
    }

    window.addEventListener("resize", updateGeometry, { passive: true });
    window.setInterval(syncState, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

function conversationTabsRuntimeSource() {
  return `;(${installConversationTabsRuntime.toString()})();`;
}

function applyConversationTabsPatch(source) {
  try {
    const contract = conversationTabsContract(source);
    if (contract === "patched") return source;
    if (contract !== "current") {
      warn("Could not find the current ChatGPT app-page sidebar contract");
      return source;
    }

    const patched = `${source}\n${conversationTabsRuntimeSource()}\n`;
    if (conversationTabsContract(patched) !== "patched") {
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
  applyConversationTabsPatch,
  conversationTabsContract,
  conversationTabsRuntimeSource,
  descriptors: [
    {
      id: "conversation-tabs",
      phase: "webview-asset",
      order: 20_950,
      ciPolicy: "optional",
      enforceWhenEnabled: false,
      pattern: APP_PAGE_ASSET_PATTERN,
      assetMatch: (source) => conversationTabsContract(source) !== "drifted",
      missingDescription: "current ChatGPT app-page sidebar bundle",
      skipDescription: "isolated conversation tabs patch",
      apply: applyConversationTabsPatch,
    },
  ],
};
