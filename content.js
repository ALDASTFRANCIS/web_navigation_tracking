// content.js

console.log('CONTENT SCRIPT LOADED');
alert('CONTENT SCRIPT LOADED');

let isTracking = false;

// On script load, always read persisted tracking state
chrome.storage.local.get({ isTracking: false }, res => {
    isTracking = res.isTracking;
  });

// ---- Utility: Human label for any DOM element ----
function getElementLabel(el) {
  if (!el) return '';
  return (
    el.innerText?.trim() ||
    el.value?.trim() ||
    el.getAttribute?.('aria-label')?.trim() ||
    el.getAttribute?.('title')?.trim() ||
    el.getAttribute?.('alt')?.trim() ||
    el.placeholder?.trim() ||
    el.name ||
    el.id ||
    (el.className && typeof el.className === 'string' && el.className.split(" ").filter(c => c.length > 3)[0]) ||
    el.tagName
  );
}

// ---- Main event logging function, includes natural language for every event ----
function captureEvent(eventType, additionalContext = {}) {
  if (!isTracking) return;
  const record = {
    url: location.href,
    eventType,
    additionalContext,
    timestamp: new Date().toISOString(),
    title: document.title,
    naturalDescription: additionalContext.naturalDescription || '',
  };
  chrome.storage.local.get({ navigationEvents: [] }, res => {
    const events = res.navigationEvents;
    events.push(record);
    // Keep last 2000 events for safety
    if (events.length > 2000) events.splice(0, events.length - 2000);
    chrome.storage.local.set({ navigationEvents: events });
  });
}

// ---- ALWAYS sync isTracking state with storage ----
chrome.storage.local.get({ isTracking: false }, res => { isTracking = res.isTracking; });
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "start") {
    isTracking = true;
    chrome.storage.local.set({ isTracking: true });
    captureEvent("tracking", { naturalDescription: "Tracking started" });
  }
  if (msg.action === "stop") {
    isTracking = false;
    chrome.storage.local.set({ isTracking: false });
    captureEvent("tracking", { naturalDescription: "Tracking stopped" });
  }
  if (msg.action === "clear") {
    chrome.storage.local.set({ navigationEvents: [] });
    captureEvent("tracking", { naturalDescription: "Events cleared" });
  }
  sendResponse?.({ result: "ok" });
});

// ---- Initial page load navigation ----
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    captureEvent("navigation", { naturalDescription: "Page loaded (DOMContentLoaded)" });
  });
} else {
  captureEvent("navigation", { naturalDescription: "Page loaded (quick start)" });
}

// ---- Track ALL user clicks (even deeply nested dynamic UIs) ----
document.addEventListener("click", (evt) => {
  const el = evt.target.closest("a,button,[role=button],[role=tab],input,li,div,span"); // Add more tags if needed
  if (!el) return;
  const label = getElementLabel(el);
  let desc = label ? `Clicked on "${label}"` : `Clicked on ${el.tagName}`;
  captureEvent("click", {
    tag: el.tagName,
    text: el.innerText || el.value || "",
    id: el.id,
    class: el.className,
    href: el.href || "",
    type: el.type || "",
    role: el.getAttribute?.('role') || "",
    naturalDescription: desc
  });
}, true);

// ---- Track form submissions ----
document.addEventListener("submit", (evt) => {
  const form = evt.target;
  const label = (
    form.getAttribute("name") ||
    form.getAttribute("id") ||
    getElementLabel(form) ||
    "form"
  );
  captureEvent("form_submit", {
    action: form.action, method: form.method,
    naturalDescription: `Submitted ${label}`
  });
}, true);

// ---- Track user input in edit fields ----
document.addEventListener("keydown", (evt) => {
  const t = evt.target;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) {
    captureEvent("input_edit", {
      key: evt.key,
      name: t.name || t.id,
      type: t.type || "",
      value: (t.value || "").substr(0, 100),
      naturalDescription: `Typed "${evt.key}" in "${getElementLabel(t)}"`
    });
  }
}, true);

// ---- Navigation via history API ----
window.addEventListener("popstate", () => {
  captureEvent("navigation", { naturalDescription: "Navigated using browser back/forward" });
});
window.addEventListener("hashchange", () => {
  captureEvent("navigation", { naturalDescription: `Changed hash to "${location.hash}"` });
});

// ---- Detect SPA/AJAX-driven dynamic changes via network interception ----
// Patch fetch
if (!window._navcap_fetch_patched) {
  window._navcap_fetch_patched = true;
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    if (isTracking) {
      let url = args[0];
      captureEvent("network", {
        method: "fetch",
        url: typeof url === "string" ? url : (url?.url || ""),
        naturalDescription: `Triggered fetch(${typeof url === "string" ? url : (url?.url || "")})`
      });
    }
    return origFetch.apply(this, args);
  };
}
// Patch XMLHttpRequest
if (!window._navcap_xhr_patched) {
  window._navcap_xhr_patched = true;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._navcap_url = url;
    return origOpen.apply(this, [method, url, ...rest]);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    if (isTracking && this._navcap_url) {
      captureEvent("network", {
        method: "xhr",
        url: this._navcap_url,
        naturalDescription: `Triggered XHR to "${this._navcap_url}"`
      });
    }
    return origSend.apply(this, args);
  };
}

// ---- MutationObserver for SPA view/content switches ----
const observer = new MutationObserver(mutations => {
  // Look for significant content changes (new main view, panel, etc)
  let changed = false;
  for (const m of mutations) {
    if (
      m.type === "childList" &&
      (m.addedNodes.length > 0 || m.removedNodes.length > 0)
    ) {
      changed = true;
      break;
    }
  }
  if (changed) {
    // Try to get new heading or view context
    const heading =
      document.querySelector("main h1,main h2,.page-title,.header,h1,h2,[role='main'] h1,[role='main'] h2")?.innerText?.trim();
    if (heading) {
      captureEvent("internalNav", {
        heading,
        naturalDescription: `Switched view to "${heading}"`
      });
    } else {
      captureEvent("internalNav", { naturalDescription: "Switched dynamic view (SPA detected)" });
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });