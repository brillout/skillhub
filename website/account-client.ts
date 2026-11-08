/**
 * Every page's login and saves, in the browser: the header's Log in, or Log out, the Save buttons,
 * and the count on the skills list's Saved switch. The Worker's /api/me says who's logged in and
 * what they saved. Its last answer is kept in localStorage, so that a page shows it at once, before
 * the API answers.
 *
 * The Save buttons and the Saved switch are pre-rendered, as if nobody were logged in, and show at
 * once: the click handler below makes them work, and paint() shows what you saved. The header's Log
 * in stays hidden until the API has answered once, in this browser, so that it doesn't flash for
 * whoever is logged in. See [data-account] in style.css.
 */

import { esc, href } from "./format.ts";
import { account, loginHref, saveLabel, savedCount, type Account } from "./saves.ts";

/**
 * Fired on `document` when `account` changes: its `detail` is "load" when the API told who's
 * logged in and what they saved, "toggle" when a Save button was clicked.
 */
export const ACCOUNT_EVENT = "skillhub:account";
export type AccountChange = "load" | "toggle";

const CACHE = "skillhub:account";
interface Me {
  user: Account["user"];
  saved: string[];
}

function apply(me: Me) {
  account.user = me.user;
  account.saved = new Set(me.saved);
}

function store() {
  try {
    localStorage.setItem(CACHE, JSON.stringify({ user: account.user, saved: [...account.saved] }));
  } catch {}
}

function changed(change: AccountChange) {
  store();
  paint(change === "toggle");
  document.dispatchEvent(new CustomEvent<AccountChange>(ACCOUNT_EVENT, { detail: change }));
}

/** The API answers: show the buttons and links. */
const reachable = () => document.documentElement.setAttribute("data-account", "");

/**
 * Draw the eye to the Saved switch when a click changes how many you saved, so that you know where
 * to find them: its count rolls to the new number, and on a save, the switch ripples in garnet.
 * The animations are in style.css, on [data-bump] and [data-pulse]; reading offsetWidth between
 * removing and setting them restarts them for a quick second click.
 */
function bump(n: HTMLElement, up: boolean) {
  const row = n.closest<HTMLElement>(".saved-switch");
  for (const el of [n, row]) {
    if (!el) continue;
    delete el.dataset.bump;
    delete el.dataset.pulse;
    void el.offsetWidth;
  }
  n.dataset.bump = up ? "up" : "down";
  if (up && row) row.dataset.pulse = "";
}

/** `animate`: whether a click caused the change, rather than the page's load. */
function paint(animate = false) {
  const links = document.getElementById("account");
  if (links)
    links.innerHTML = account.user
      ? `<span class="me"><img class="avatar" src="${esc(account.user.avatar)}" alt="" width="20" height="20" title="Logged in as ${esc(account.user.login)}" /><button type="button" class="logout" data-logout>Log out</button></span>`
      : `<a href="${href("api/auth/login")}" data-login>Log in</a>`;
  for (const button of document.querySelectorAll<HTMLElement>("[data-save]")) {
    const on = account.saved.has(button.dataset.save ?? "");
    button.setAttribute("aria-pressed", String(on));
    button.title = saveLabel(on);
    const word = button.querySelector(".save-word");
    if (word) word.textContent = saveLabel(on);
  }
  for (const n of document.querySelectorAll<HTMLElement>("[data-saved-count]")) {
    const before = Number(n.textContent) || 0;
    n.textContent = savedCount();
    const after = Number(n.textContent) || 0;
    if (animate && after !== before) bump(n, after > before);
  }
}

const post = (path: string, body: unknown) =>
  fetch(href(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function toggle(key: string) {
  if (!account.user) {
    location.href = loginHref(key);
    return;
  }
  const on = !account.saved.has(key);
  const set = (saved: boolean) => (saved ? account.saved.add(key) : account.saved.delete(key));
  // The button shows its new state at once, and goes back if the Worker refuses it.
  set(on);
  changed("toggle");
  const res = await post("api/saves", { key, saved: on }).catch(() => null);
  if (res?.ok) return;
  set(!on);
  changed("toggle");
  if (res?.status === 401) {
    // The session ended: log in again, and save on the way back.
    apply({ user: null, saved: [] });
    store();
    location.href = loginHref(on ? key : undefined);
  } else if (res?.status === 409) alert((await res.json()).error);
}

async function logout() {
  await post("api/auth/logout", {}).catch(() => null);
  apply({ user: null, saved: [] });
  changed("load");
}

document.addEventListener("click", (event) => {
  const el = event.target as Element;
  const login = el.closest<HTMLAnchorElement>("a[data-login]");
  // The list keeps its filters in the URL, so where to come back to is only known at the click.
  if (login) login.href = loginHref();
  else if (el.closest("[data-logout]")) void logout();
  else {
    const key = el.closest<HTMLElement>("[data-save]")?.dataset.save;
    if (!key) return;
    // Its icon animates from now on, unlike when the page's load sets what's saved.
    for (const button of document.querySelectorAll<HTMLElement>(`[data-save="${CSS.escape(key)}"]`))
      button.dataset.toggled = "";
    void toggle(key);
  }
});

try {
  const cached = localStorage.getItem(CACHE);
  if (cached) {
    apply(JSON.parse(cached));
    reachable();
    paint();
  }
} catch {}

void fetch(href("api/me"))
  .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
  .then((me) => {
    if (!me) return;
    reachable();
    apply(me);
    changed("load");
  })
  .catch(() => {});
