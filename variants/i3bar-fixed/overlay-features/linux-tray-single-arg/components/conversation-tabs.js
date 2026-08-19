"use strict";

const APP_PAGE_ASSET_PATTERN = /^app-initial-[A-Za-z0-9_-]+\.js$/;
const RUNTIME_MARKER = "__codexLinuxConversationTabsRuntimeV1";
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

  const GLOBAL_KEY = "__codexLinuxConversationTabsRuntimeV1";
  if (window[GLOBAL_KEY]) return;
  window[GLOBAL_KEY] = true;

  const BAR_ID = "codex-linux-conversation-tabs";
  const LIST_ID = "codex-linux-conversation-tabs-list";
  const STYLE_ID = "codex-linux-conversation-tabs-style";
  const STORAGE_KEY = "codex-linux-conversation-tabs-v1";
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
  const RECENT_LABELS = new Set([
    "recents",
    "recent",
    "recent chats",
    "chats",
    "conversations",
    "最近",
    "近期",
    "最近使用",
    "最近聊天",
    "聊天",
    "对话",
  ]);
  const SECTION_BARRIER_LABELS = new Set([
    "projects",
    "project",
    "work",
    "codex",
    "plugins",
    "plugin",
    "gpts",
    "library",
    "项目",
    "工作",
    "插件",
    "资料库",
  ]);
  const STATIC_LABELS = new Set([
    "new chat",
    "new conversation",
    "search",
    "library",
    "projects",
    "project",
    "work",
    "codex",
    "plugins",
    "plugin",
    "scheduled",
    "sites",
    "settings",
    "新聊天",
    "新建聊天",
    "新建对话",
    "搜索",
    "资料库",
    "项目",
    "工作",
    "插件",
    "已安排",
    "站点",
    "设置",
  ]);

  let tabs = [];
  let activeKey = null;
  let syncTimer = null;

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
      return `${url.pathname}${url.hash}`;
    } catch {
      return null;
    }
  }

  function isConversationHref(href) {
    return typeof href === "string" && CONVERSATION_ROUTE.test(href);
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
    const candidates = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ];
    for (const candidate of candidates) {
      const compact = String(candidate ?? "").replace(/\s+/g, " ").trim();
      if (compact) return compact.slice(0, 120);
    }
    return "";
  }

  function visibleRect(element) {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return null;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return null;
    return rect;
  }

  function sidebarCandidates() {
    const candidates = [];
    const seen = new Set();
    for (const element of document.querySelectorAll("aside,nav,[data-testid*='sidebar'],[class*='sidebar']")) {
      if (!(element instanceof HTMLElement) || seen.has(element)) continue;
      seen.add(element);
      const rect = visibleRect(element);
      if (!rect) continue;
      if (rect.left > 64 || rect.width > 480 || rect.height < window.innerHeight * 0.45) continue;
      candidates.push({ element, rect });
    }
    candidates.sort((a, b) => b.rect.height - a.rect.height || b.rect.width - a.rect.width);
    return candidates;
  }

  function sidebarFor(element) {
    return sidebarCandidates().find((candidate) => candidate.element.contains(element))?.element ?? null;
  }

  function sidebarRight() {
    const candidates = sidebarCandidates();
    if (candidates.length === 0) return 0;
    return Math.max(...candidates.map((candidate) => candidate.rect.right));
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

  function isInsideRecentSection(element, sidebar) {
    if (!(element instanceof Element) || !(sidebar instanceof Element)) return false;
    const rowRect = element.getBoundingClientRect();
    let recentTop = Number.NEGATIVE_INFINITY;
    let barrierTop = Number.NEGATIVE_INFINITY;

    for (const candidate of sidebar.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],div,span,p")) {
      if (!(candidate instanceof HTMLElement)) continue;
      const label = normalizeLabel(candidate.textContent);
      if (!label || label.length > 32) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom > rowRect.top + 2) continue;
      if (RECENT_LABELS.has(label)) recentTop = Math.max(recentTop, rect.top);
      if (SECTION_BARRIER_LABELS.has(label)) barrierTop = Math.max(barrierTop, rect.top);
    }

    return Number.isFinite(recentTop) && recentTop > barrierTop;
  }

  function tabDescriptorFor(element) {
    if (!(element instanceof Element) || element.closest(`#${BAR_ID}`)) return null;
    const title = displayTitle(element);
    if (!title) return null;
    const href = hrefFrom(element);

    if (href && isConversationHref(href)) {
      return { key: `href:${href}`, href, title };
    }

    const sidebar = sidebarFor(element);
    if (!sidebar || STATIC_LABELS.has(normalizeLabel(title)) || !isInsideRecentSection(element, sidebar)) {
      return null;
    }

    return { key: `title:${normalizeLabel(title)}`, href: null, title };
  }

  function loadTabs() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      const clean = [];
      const seen = new Set();
      for (const item of parsed) {
        if (!item || typeof item.key !== "string" || typeof item.title !== "string") continue;
        if (seen.has(item.key)) continue;
        const href = typeof item.href === "string" ? item.href : null;
        if (href && !isConversationHref(href)) continue;
        seen.add(item.key);
        clean.push({ key: item.key, href, title: item.title.slice(0, 120) });
      }
      return clean.slice(-MAX_TABS);
    } catch {
      return [];
    }
  }

  function saveTabs() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // Storage failure must never affect ChatGPT itself.
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      `#${BAR_ID}{position:fixed;top:0;height:48px;box-sizing:border-box;display:flex;align-items:flex-end;gap:4px;padding:0 6px 4px;background:Canvas;color:CanvasText;border-bottom:1px solid rgba(127,127,127,.18);z-index:2147483000;-webkit-app-region:no-drag;font-family:inherit;pointer-events:auto}`,
      `#${LIST_ID}{display:flex;align-items:flex-end;gap:3px;min-width:0;flex:1;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}`,
      `#${LIST_ID}::-webkit-scrollbar{display:none}`,
      `#${BAR_ID} .codex-linux-conversation-tab{height:32px;min-width:108px;max-width:220px;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 7px 0 10px;border:1px solid transparent;border-radius:8px;background:rgba(127,127,127,.10);cursor:default;user-select:none;outline:none;-webkit-app-region:no-drag}`,
      `#${BAR_ID} .codex-linux-conversation-tab:hover{background:rgba(127,127,127,.16)}`,
      `#${BAR_ID} .codex-linux-conversation-tab[data-active='true']{background:rgba(127,127,127,.22);border-color:rgba(127,127,127,.22)}`,
      `#${BAR_ID} .codex-linux-conversation-tab-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}`,
      `#${BAR_ID} button{font:inherit;color:inherit}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close,#${BAR_ID} .codex-linux-conversation-tab-add{border:0;background:transparent;border-radius:6px;display:grid;place-items:center;padding:0;cursor:default;-webkit-app-region:no-drag}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close{width:20px;height:20px;font-size:16px;line-height:1;opacity:.65}`,
      `#${BAR_ID} .codex-linux-conversation-tab-close:hover,#${BAR_ID} .codex-linux-conversation-tab-add:hover{background:rgba(127,127,127,.18);opacity:1}`,
      `#${BAR_ID} .codex-linux-conversation-tab-add{width:32px;height:32px;flex:0 0 32px;font-size:20px;line-height:1}`,
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
    let changed = false;
    const index = tabs.findIndex((item) => item.key === tab.key);
    if (index === -1) {
      tabs.push({ key: tab.key, href: tab.href ?? null, title: tab.title.slice(0, 120) });
      if (tabs.length > MAX_TABS) tabs = tabs.slice(-MAX_TABS);
      changed = true;
    } else {
      const current = tabs[index];
      const nextHref = tab.href ?? current.href ?? null;
      const nextTitle = tab.title.slice(0, 120);
      if (current.href !== nextHref || current.title !== nextTitle) {
        tabs[index] = { ...current, href: nextHref, title: nextTitle };
        changed = true;
      }
    }

    if (makeActive && activeKey !== tab.key) {
      activeKey = tab.key;
      changed = true;
    }

    if (!changed) return;
    saveTabs();
    render();
  }

  function findClickableForTab(tab) {
    if (!tab) return null;
    if (tab.href) {
      for (const anchor of document.querySelectorAll("a[href]")) {
        if (anchor.closest(`#${BAR_ID}`)) continue;
        if (hrefFrom(anchor) === tab.href) return anchor;
      }
    }

    const wanted = normalizeLabel(tab.title);
    for (const sidebar of sidebarCandidates()) {
      for (const candidate of sidebar.element.querySelectorAll("a[href],button,[role='button']")) {
        if (normalizeLabel(displayTitle(candidate)) === wanted) return candidate;
      }
    }
    return null;
  }

  function activateTab(key) {
    const tab = tabs.find((item) => item.key === key);
    if (!tab) return;
    activeKey = tab.key;
    render();

    const target = findClickableForTab(tab);
    if (target instanceof HTMLElement) {
      target.click();
      return;
    }

    if (!tab.href) return;
    try {
      window.location.assign(new URL(tab.href, document.baseURI || window.location.href).href);
    } catch {
      // If the stored route is no longer valid, keep the tab without disturbing the app.
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
    else createNewChat();
  }

  function findNewChatControl() {
    for (const sidebar of sidebarCandidates()) {
      for (const candidate of sidebar.element.querySelectorAll("a[href],button,[role='button']")) {
        if (isNewChatControl(candidate)) return candidate;
      }
    }
    return null;
  }

  function createNewChat() {
    activeKey = null;
    render();
    const target = findNewChatControl();
    if (target instanceof HTMLElement) {
      target.click();
      return;
    }
    console.warn("WARN: ChatGPT New chat control not found - conversation tab add button did not navigate");
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
    upsertTab({ key: `href:${href}`, href, title: titleForHref(href) }, true);
    return true;
  }

  function syncFromActiveSidebar() {
    for (const sidebar of sidebarCandidates()) {
      for (const active of sidebar.element.querySelectorAll(
        "[aria-current='page'],[aria-selected='true'],[data-state='active'],[data-active='true']",
      )) {
        const clickable = clickableFrom(active) || active;
        const tab = tabDescriptorFor(clickable);
        if (!tab) continue;
        upsertTab(tab, true);
        return true;
      }
    }
    return false;
  }

  function syncState() {
    ensureStyle();
    if (!document.getElementById(BAR_ID)) render();
    updateGeometry();
    if (!syncFromLocation()) syncFromActiveSidebar();
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
          if (activeKey !== null) {
            activeKey = null;
            render();
          }
          return;
        }
        const tab = tabDescriptorFor(clickable);
        if (tab) upsertTab(tab, true);
      },
      true,
    );

    const observer = new MutationObserver(scheduleSync);
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-current", "aria-selected", "data-state", "data-active", "href"],
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
