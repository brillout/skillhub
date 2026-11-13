/**
 * Every page's login, saves and thumbs, in the browser: the header's Log in, or its link to what
 * you saved and Log out, the Save buttons and the thumbs beside them, and the count on the skills
 * list's Saved switch. The Worker's /api/me says who's logged in and what they saved and thought.
 * Its last answer is kept in localStorage, so that a page shows it at once, before the API answers.
 *
 * The Save buttons, the thumbs, the Saved switch and the header's Log in are pre-rendered, as if
 * nobody were logged in, and show at once: the click handler below makes them work, and paint()
 * shows who's logged in and what they saved and thought. For whoever the last answer said was
 * logged in, Log in stays hidden until paint() replaces it, so that it doesn't flash: see
 * loggedInScript in saves.ts.
 */

import { esc, href } from "./format.ts";
import { clearNotice, notice } from "./notice.ts";
import {
  ACCOUNT_CACHE,
  LOGIN_FROM,
  account,
  bookmarkSvg,
  loginHref,
  loginHtml,
  saveLabel,
  saveName,
  saveTitle,
  savedCount,
  thumbTitle,
  type Account,
  type Reaction,
} from "./saves.ts";

/**
 * Fired on `document` when `account` changes: its `detail` is "load" when the API told who's
 * logged in and what they saved, "toggle" when a Save button was clicked, "react" when a thumb was.
 */
export const ACCOUNT_EVENT = "skillhub:account";
export type AccountChange = "load" | "toggle" | "react";

interface Me {
  user: Account["user"];
  saved: string[];
  /** Missing from what a page kept before there were thumbs, and before it kept the times. */
  reactions?: Record<string, Reaction>;
  savedAt?: Record<string, number>;
  reactedAt?: Record<string, number>;
}

const pendingSaves = new Set<string>();
const pendingReactions = new Set<string>();
let endingSession = false;
let loggedOut = false;
let initialFetchComplete = false;
const initialSavesChanged = new Set<string>();
const initialReactionsChanged = new Set<string>();
const LOGGED_OUT: Me = { user: null, saved: [], reactions: {}, savedAt: {}, reactedAt: {} };

function apply(me: Me) {
  account.user = me.user;
  account.saved = new Set(me.saved);
  account.reactions = new Map(Object.entries(me.reactions ?? {}));
  account.savedAt = new Map(Object.entries(me.savedAt ?? {}));
  account.reactedAt = new Map(Object.entries(me.reactedAt ?? {}));
}

function store() {
  try {
    localStorage.setItem(
      ACCOUNT_CACHE,
      JSON.stringify({
        user: account.user,
        saved: [...account.saved],
        reactions: Object.fromEntries(account.reactions),
        savedAt: Object.fromEntries(account.savedAt),
        reactedAt: Object.fromEntries(account.reactedAt),
      } satisfies Me),
    );
  } catch {}
}

function changed(change: AccountChange) {
  store();
  paint(change === "toggle");
  document.dispatchEvent(new CustomEvent<AccountChange>(ACCOUNT_EVENT, { detail: change }));
}

/** The API answers: show the buttons and links. */
const reachable = () => document.documentElement.setAttribute("data-account", "");

/** The header's Saved link, among the account's links: see paintLinks. */
const SAVED_LINK = ".saved-link";

/**
 * Where what you save goes, for the eye: the bookmark of the skills list's Saved switch, or, where
 * there's none in sight, that of the header's Saved link. That's on every other page, such as a
 * skill's or a repo's: saving there changed the button and nothing else, with no word of where to
 * find what's saved.
 */
function savedPlace(): { box: DOMRect; link: boolean } | null {
  // A row's preview, open, lies over the window's left side: in a window just wide enough for
  // it, over the switch, and the bookmark landed on the preview's words.
  const sheet = document.querySelector("#preview:not([hidden])")?.getBoundingClientRect();
  for (const [selector, link] of [
    ["#saved-switch svg", false],
    [`#account ${SAVED_LINK} svg`, true],
  ] as const) {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    if (box?.width && !(sheet && box.left < sheet.right)) return { box, link };
  }
  return null;
}

/**
 * The header's Saved link shows that a save went to it: its bookmark fills and pops, in garnet. The
 * animation is in style.css, on [data-pulse]; reading offsetWidth restarts it for a second save.
 */
function pulseLink() {
  const link = document.querySelector<HTMLElement>(`#account ${SAVED_LINK}`);
  if (!link) return;
  delete link.dataset.pulse;
  void link.offsetWidth;
  link.dataset.pulse = "";
}

/**
 * On a save, a garnet bookmark flies from the Save button to where what you save goes (see
 * savedPlace), so that you see it; null when nothing is flying. The switch's count waits for it to
 * land, and so does the header's link, which then shows it took it.
 */
let landing: Promise<void> | null = null;

function fly(from: Element) {
  const place = savedPlace();
  if (!place) return;
  const landed = () => {
    if (place.link) pulseLink();
  };
  const a = from.getBoundingClientRect();
  const b = place.box;
  // Nothing moves: the link only takes its color.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return landed();
  const icon = document.createElement("div");
  icon.className = "save-flight";
  icon.innerHTML = bookmarkSvg;
  const [x, y] = [a.left + a.width / 2, a.top + a.height / 2];
  icon.style.left = `${x - 12}px`;
  icon.style.top = `${y - 12}px`;
  document.body.append(icon);
  // Toward the switch: to the window's edge when it's scrolled out of view, such as on a phone.
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 24), max - 24);
  const dx = clamp(b.left + b.width / 2, innerWidth) - x;
  const dy = clamp(b.top + b.height / 2, innerHeight) - y;
  // An arc: up and bigger first, then down into the switch's bookmark.
  const flight = icon.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 90}px) scale(1.7)`, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.4 },
    ],
    { duration: 750, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
  landing = flight.finished.then(() => {
    icon.remove();
    landing = null;
    landed();
  });
}

/**
 * Draw the eye to the Saved switch when a click changes how many you saved, so that you know where
 * to find them: its count rolls to the new number, and on a save, the switch flashes and ripples
 * in garnet. The animations are in style.css, on [data-bump] and [data-pulse]; reading offsetWidth
 * between removing and setting them restarts them for a quick second click.
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

/** Whether the page is the list of what you saved, which its link then says: see showsSaved. */
let onSaved = false;
/** What the header's account links were last filled with: the pre-rendered page has Log in. */
let links = loginHtml();

/**
 * The header's links for who's logged in: Log in; or what's theirs, a link to what they saved, the
 * skills list with its Saved switch on, then their avatar and Log out. The link is on every page:
 * the switch is on the list alone, so from a skill's page there was no way to what you had just
 * saved there. In its bookmark alone on a phone, whose line has no room for its word (see
 * .saved-link in style.css): its tooltip says what it is to a pointer on a window that narrow.
 */
function paintLinks() {
  const el = document.getElementById("account");
  const { user } = account;
  const html = user
    ? `<a class="saved-link" href="${href("?saved")}" title="What you saved"${onSaved ? ` aria-current="page"` : ""}>${bookmarkSvg}<span class="saved-word">Saved</span></a><span class="me"><img class="avatar" src="${esc(user.avatar)}" alt="" width="20" height="20" title="Logged in as ${esc(user.login)}" /><button type="button" class="logout" data-logout>Log out</button></span>`
    : loginHtml();
  // Only when they change: a link that's replaced loses the pointer's hover, and its animation.
  if (!el || html === links) return;
  // What's replaced takes the keyboard's focus with it, which then starts over from the page's
  // top: after Log out, it's on Log in.
  const focused = el.contains(document.activeElement) ? document.activeElement : null;
  const again = focused?.matches("[data-logout]") ? "[data-logout]" : "a, button";
  el.innerHTML = links = html;
  if (focused)
    (el.querySelector<HTMLElement>(again) ?? el.querySelector<HTMLElement>("a"))?.focus();
}

/**
 * The skills list tells whether it shows only what you saved, with its Saved switch on: the
 * header's Saved link is then the page you're on, as Tags is on the tags' page.
 */
export function showsSaved(on: boolean) {
  onSaved = on;
  paintLinks();
}

/** `animate`: whether a click caused the change, rather than the page's load. */
function paint(animate = false) {
  paintLinks();
  for (const button of document.querySelectorAll<HTMLElement>("[data-save]")) {
    const key = button.dataset.save ?? "";
    const on = account.saved.has(key);
    if (pendingSaves.has(key)) {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
    }
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", saveName(on, button.dataset.name ?? ""));
    button.title = saveTitle(button.dataset.save ?? "");
    const word = button.querySelector(".save-word");
    if (word) word.textContent = saveLabel(on);
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-react]")) {
    const key = button.closest<HTMLElement>("[data-thumbs]")?.dataset.thumbs ?? "";
    if (pendingReactions.has(key)) {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
    }
    button.setAttribute(
      "aria-pressed",
      String(account.reactions.get(key) === button.dataset.react),
    );
    button.title = thumbTitle(key, button.dataset.react as Reaction);
  }
  for (const n of document.querySelectorAll<HTMLElement>("[data-saved-count]")) {
    const before = Number(n.textContent) || 0;
    const after = Number(savedCount()) || 0;
    if (!animate || after === before) n.textContent = savedCount();
    // Once the flying bookmark, if any, has landed.
    else
      void (landing ?? Promise.resolve()).then(() => {
        n.textContent = savedCount();
        bump(n, after > before);
      });
  }
}

const post = (path: string, body: unknown) =>
  fetch(href(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: path === "api/auth/logout" ? undefined : AbortSignal.timeout(15_000),
  });

/** Notes that the tab leaves this page to log in: see LOGIN_FROM in saves.ts. */
function leaveToLogIn() {
  try {
    const page = location.pathname + location.search;
    sessionStorage.setItem(LOGIN_FROM, JSON.stringify({ page, time: Date.now() }));
  } catch {}
}

/**
 * Says so on an entry's Save buttons, for a moment, when its save didn't go through, as when the
 * connection dropped: the button went from Saved back to Save without a word.
 */
function notSaved(key: string) {
  for (const word of document.querySelectorAll(`[data-save="${CSS.escape(key)}"] .save-word`))
    word.textContent = "Not saved";
  setTimeout(() => paint(), 3000);
}

async function toggle(key: string) {
  if (pendingSaves.has(key)) return;
  if (!account.user) {
    leaveToLogIn();
    location.href = loginHref({ save: key });
    return;
  }
  const on = !account.saved.has(key);
  const at = account.savedAt.get(key);
  /** `time`: when it was saved, now unless given. */
  const set = (saved: boolean, time = Date.now()) => {
    if (saved) {
      account.saved.add(key);
      account.savedAt.set(key, time);
    } else {
      account.saved.delete(key);
      account.savedAt.delete(key);
    }
  };
  // Don't accept a second write for this item until the first is confirmed.
  pendingSaves.add(key);
  if (!initialFetchComplete) initialSavesChanged.add(key);
  set(on);
  changed("toggle");
  const res = await post("api/saves", { key, saved: on }).catch(() => null);
  const error = res?.status === 409 ? await res.json().catch(() => null) : null;
  pendingSaves.delete(key);
  paint();
  if (loggedOut) return;
  if (!account.user) {
    if (res?.status === 401 && !endingSession)
      notice("Your session expired. Log in and try your action again.", "session");
    return;
  }
  if (res?.ok) {
    clearNotice(key);
    return;
  }
  set(!on, at);
  changed("toggle");
  if (endingSession) return;
  if (res?.status === 401) {
    apply(LOGGED_OUT);
    changed("load");
    notice("Your session expired. Log in and try your action again.", "session");
  } else if (res?.status === 409) {
    notice(
      typeof error?.error === "string" ? error.error : "Couldn't update this save. Try again.",
      key,
    );
  } else {
    if (on) notSaved(key);
    notice(
      !res
        ? "Couldn't confirm this change. Reload to check before trying again."
        : on
          ? "Couldn't save this item. Try again."
          : "Couldn't remove this save. Try again.",
      key,
    );
  }
}

/**
 * A click on a thumb: gives it, in place of the other one, or takes it back when it was given
 * already. Logged out, it logs in first, and gives it on the way back.
 */
async function react(key: string, clicked: Reaction) {
  if (pendingReactions.has(key)) return;
  if (!account.user) {
    leaveToLogIn();
    location.href = loginHref({ react: key, reaction: clicked });
    return;
  }
  const before = account.reactions.get(key) ?? null;
  const action = `reaction:${key}`;
  const beforeAt = account.reactedAt.get(key);
  const after = before === clicked ? null : clicked;
  /** `time`: when it was given, now unless given. */
  const set = (r: Reaction | null, time = Date.now()) => {
    if (r) {
      account.reactions.set(key, r);
      account.reactedAt.set(key, time);
    } else {
      account.reactions.delete(key);
      account.reactedAt.delete(key);
    }
  };
  // Both thumbs represent one value, so wait for this write before accepting another.
  pendingReactions.add(key);
  if (!initialFetchComplete) initialReactionsChanged.add(key);
  set(after);
  changed("react");
  const res = await post("api/reactions", { key, reaction: after }).catch(() => null);
  const error = res?.status === 409 ? await res.json().catch(() => null) : null;
  pendingReactions.delete(key);
  paint();
  if (loggedOut) return;
  if (!account.user) {
    if (res?.status === 401 && !endingSession)
      notice("Your session expired. Log in and try your action again.", "session");
    return;
  }
  if (res?.ok) {
    clearNotice(action);
    return;
  }
  set(before, beforeAt);
  changed("react");
  if (endingSession) return;
  if (res?.status === 401) {
    apply(LOGGED_OUT);
    changed("load");
    notice("Your session expired. Log in and try your action again.", "session");
  } else if (res?.status === 409) {
    notice(
      typeof error?.error === "string" ? error.error : "Couldn't update your thumb. Try again.",
      action,
    );
  } else
    notice(
      res
        ? `Couldn't ${after ? "save" : "remove"} your thumbs ${after ?? before}. Try again.`
        : "Couldn't confirm this change. Reload to check before trying again.",
      action,
    );
}

/**
 * The tooltips of the Save buttons and the thumbs say how long ago, as of when they show: said
 * again as the pointer comes onto one, ahead of its tooltip, a page left open says "just now" no
 * more an hour later.
 */
document.addEventListener("pointerover", (event) => {
  const el = event.target instanceof Element ? event.target : null;
  const save = el?.closest<HTMLElement>("[data-save]");
  if (save) save.title = saveTitle(save.dataset.save ?? "");
  const thumb = el?.closest<HTMLElement>("[data-react]");
  const key = thumb?.closest<HTMLElement>("[data-thumbs]")?.dataset.thumbs;
  if (thumb && key) thumb.title = thumbTitle(key, thumb.dataset.react as Reaction);
});

async function logout() {
  endingSession = true;
  const res = await post("api/auth/logout", {}).catch(() => null);
  if (!res?.ok) {
    endingSession = false;
    notice("Couldn't confirm log out. Reload to check before trying again.", "logout");
    return;
  }
  clearNotice("logout");
  loggedOut = true;
  apply(LOGGED_OUT);
  changed("load");
}

document.addEventListener("click", (event) => {
  const el = event.target as Element;
  const login = el.closest<HTMLAnchorElement>("a[data-login]");
  // The list keeps its filters in the URL, so where to come back to is only known at the click.
  if (login) {
    login.href = loginHref();
    leaveToLogIn();
  } else if (el.closest("[data-logout]")) void logout();
  else if (el.closest("[data-react]")) {
    const thumb = el.closest<HTMLElement>("[data-react]")!;
    const key = thumb.closest<HTMLElement>("[data-thumbs]")?.dataset.thumbs;
    if (!key || pendingReactions.has(key)) return;
    // Their icons animate from now on, the one given and the one it replaces, as Save's do.
    for (const button of document.querySelectorAll<HTMLElement>(
      `[data-thumbs="${CSS.escape(key)}"] [data-react]`,
    ))
      button.dataset.toggled = "";
    void react(key, thumb.dataset.react as Reaction);
  } else {
    const clicked = el.closest<HTMLElement>("[data-save]");
    const key = clicked?.dataset.save;
    if (!clicked || !key || pendingSaves.has(key)) return;
    // Its icon animates from now on, unlike when the page's load sets what's saved.
    for (const button of document.querySelectorAll<HTMLElement>(`[data-save="${CSS.escape(key)}"]`))
      button.dataset.toggled = "";
    if (account.user && !account.saved.has(key)) fly(clicked);
    void toggle(key);
  }
});

try {
  const cached = localStorage.getItem(ACCOUNT_CACHE);
  if (cached) {
    apply(JSON.parse(cached));
    reachable();
    paint();
  }
} catch {}

void fetch(href("api/me"))
  .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
  .then((me) => {
    initialFetchComplete = true;
    if (!me || endingSession || loggedOut) return;
    reachable();
    // The response may be an older snapshot than an action made from cached account data.
    const sameUser = me.user && account.user?.login === me.user.login;
    const saved = new Map(
      [...initialSavesChanged].map((key) => [
        key,
        {
          on: account.saved.has(key),
          at: account.savedAt.get(key),
        },
      ]),
    );
    const reacted = new Map(
      [...initialReactionsChanged].map((key) => [
        key,
        {
          value: account.reactions.get(key),
          at: account.reactedAt.get(key),
        },
      ]),
    );
    apply(me);
    if (sameUser) {
      for (const [key, state] of saved) {
        if (state.on) account.saved.add(key);
        else account.saved.delete(key);
        if (state.at !== undefined) account.savedAt.set(key, state.at);
        else account.savedAt.delete(key);
      }
      for (const [key, state] of reacted) {
        if (state.value) account.reactions.set(key, state.value);
        else account.reactions.delete(key);
        if (state.at !== undefined) account.reactedAt.set(key, state.at);
        else account.reactedAt.delete(key);
      }
    }
    changed("load");
  })
  .catch(() => {
    initialFetchComplete = true;
  });
