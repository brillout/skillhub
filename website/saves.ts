/**
 * Saving skills and bundles, and giving them a thumbs up or down: the Save buttons and the thumbs
 * beside them, and who's logged in and what they saved and thought, which account-client.ts gets
 * from the Worker (worker/index.ts). Pages pre-render with nobody logged in; in the browser,
 * account-client.ts fills `account` in before the pages' scripts render.
 */

import { ago, esc, href } from "./format.ts";

export type SaveKind = "skill" | "bundle";
/** A thumbs up or a thumbs down. */
export type Reaction = "up" | "down";
/** What the Worker keeps of a save, such as `bundle:obra/superpowers`: a skill and a bundle can have the same id. */
export const saveKey = (kind: SaveKind, id: string) => `${kind}:${id}`;

export interface Account {
  user: { login: string; avatar: string } | null;
  /** Keys, as `saveKey` makes them. */
  saved: Set<string>;
  /**
   * Whether a key is still on the list, as the skills list's script tells, which has the data: a
   * saved skill can leave it, such as when its SKILL.md is gone. Elsewhere, every key counts.
   */
  listed?: (key: string) => boolean;
  /** The thumbs given, by key: one per entry, at most. */
  reactions: Map<string, Reaction>;
  /** When each was saved, and given its thumb, by key: milliseconds, as the API says. */
  savedAt: Map<string, number>;
  reactedAt: Map<string, number>;
  /** Whether the page knows who's logged in, if anyone: not while it's pre-rendered, nor before the API's answer or the one kept. */
  known?: boolean;
}
export const account: Account = {
  user: null,
  saved: new Set(),
  reactions: new Map(),
  savedAt: new Map(),
  reactedAt: new Map(),
};

/** Where account-client.ts keeps the API's last answer, so that a page shows it at once. */
export const ACCOUNT_CACHE = "skillhub:account";

/**
 * Kept for the tab while it's away logging in: the page it left for it, and when. And where the
 * skills list was scrolled to as it was left, which it notes whenever it's left. The list comes
 * back from logging in as a new page, with no place noted in the browser's history: it opens where
 * it was left all the same (see list-client.ts). A first save, logged out, came back to the list's
 * top, the row just saved thousands of pixels down.
 */
export const LOGIN_FROM = "skillhub:login-from";
export const LEFT_AT = "skillhub:left-at";

/** How long after leaving a page to log in a page counts as the way back from it, in milliseconds. */
const LOGIN_BACK = 5 * 60_000;

/**
 * Inline in every page's <head>: marks <html data-logged-in> when the last answer said someone was
 * logged in, before the page is drawn, so that the pre-rendered Log in doesn't flash for them (see
 * [data-logged-in] in style.css). Whoever isn't logged in sees Log in at once.
 *
 * And on the way back from logging in (see LOGIN_FROM), which the last answer knows nothing of
 * yet: the page said Log in for as long as the API took to say who had just logged in, most of a
 * second on the list, then its links jumped 110px to make room for them. It's marked
 * data-login-back too, for account-client.ts not to show that last answer meanwhile.
 */
export const loggedInScript = `try {
  const kept = JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_CACHE)}) || "null");
  const from = JSON.parse(sessionStorage.getItem(${JSON.stringify(LOGIN_FROM)}) || "null");
  const back = !kept?.user && from && Date.now() - from.time < ${LOGIN_BACK};
  if (kept?.user || back) document.documentElement.dataset.loggedIn = "";
  if (back) document.documentElement.dataset.loginBack = "";
} catch {}`;

/**
 * The header's Log in, as every page is pre-rendered with (brand.ts), and as account-client.ts puts
 * it back after Log out.
 */
export const loginHtml = () => `<a href="${href("api/auth/login")}" data-login>Log in</a>`;

/**
 * Log in with GitHub, then back to this page, where it was, having done what the button that asked
 * to log in does: `save` saved, or the thumb `reaction` given to `react`.
 */
export function loginHref(
  then: { save?: string; react?: string; reaction?: Reaction } = {},
): string {
  const p = new URLSearchParams({
    return:
      typeof location === "undefined"
        ? href()
        : location.pathname + location.search + location.hash,
  });
  for (const [name, value] of Object.entries(then)) if (value) p.set(name, value);
  return `${href("api/auth/login")}?${p}`;
}

const BOOKMARK = `<path d="M5.5 3h9a.5.5 0 0 1 .5.5V17l-5-3.6L5 17V3.5a.5.5 0 0 1 .5-.5z" />`;
/** The bookmark, alone: for the skills list's Saved switch. */
export const bookmarkSvg = `<svg viewBox="0 0 20 20" aria-hidden="true">${BOOKMARK}</svg>`;

/**
 * How many skills and bundles you saved that are still listed, for the Saved switch, so that it
 * says as many as the list shows: none shown when logged out or for none.
 */
export function savedCount(): string {
  const { listed } = account;
  const n = listed ? [...account.saved].filter(listed).length : account.saved.size;
  return account.user && n ? String(n) : "";
}

/** The bookmark, outlined and filled: style.css shows the one for the button's state. */
const ICON = `<span class="save-icon" aria-hidden="true"><svg viewBox="0 0 20 20">${BOOKMARK}</svg><svg class="filled" viewBox="0 0 20 20">${BOOKMARK}</svg></span>`;

/** The words a Save button shows, by whether it's saved. */
export const saveLabel = (saved: boolean) => (saved ? "Saved" : "Save");

/**
 * What a Save button is called, for a screen reader: its word and the entry's name, "Save pdf" or
 * "Saved pdf". With its word as it shows it: named "Save pdf" while it read "Saved", what it's
 * called didn't hold what it says, which whoever speaks to their browser goes by.
 */
export const saveName = (saved: boolean, name: string) => `${saveLabel(saved)} ${name}`;

/**
 * A Save button's tooltip: its word, and when it was saved, such as "Saved 3 days ago (Nov 10,
 * 2026)". As of when it's shown: account-client.ts says it again as the pointer comes onto it.
 */
export function saveTitle(key: string): string {
  const at = account.saved.has(key) ? account.savedAt.get(key) : undefined;
  return at === undefined
    ? `${saveLabel(account.saved.has(key))}${loginFirst()}`
    : `Saved ${ago(at)}`;
}

/**
 * What a Save button's and a thumb's tooltips add for whoever isn't logged in: a click leaves for
 * GitHub's login first, then saves on the way back, which nothing said before the page was gone.
 * Once the page knows nobody's logged in, so not in the pre-rendered rows, three buttons each.
 */
const loginFirst = () => (account.known && !account.user ? " (logs in with GitHub first)" : "");

/** A Save button for the entry named `name`: its icon and its word. */
export function saveButton(key: string, name: string): string {
  const on = account.saved.has(key);
  return `<button type="button" class="save" data-save="${esc(key)}" data-name="${esc(name)}" aria-pressed="${on}" aria-label="${esc(saveName(on, name))}" title="${esc(saveTitle(key))}">${ICON}<span class="save-word">${saveLabel(on)}</span></button>`;
}

export const THUMB_WORDS: Record<Reaction, string> = { up: "Thumbs up", down: "Thumbs down" };

/**
 * A thumb's tooltip: its words, and, for the one given, when, such as "You gave it a thumbs up 3
 * days ago (Nov 10, 2026)". As of when it's shown, as saveTitle's.
 */
export function thumbTitle(key: string, r: Reaction): string {
  const at = account.reactions.get(key) === r ? account.reactedAt.get(key) : undefined;
  return at === undefined
    ? `${THUMB_WORDS[r]}${loginFirst()}`
    : `You gave it ${r === "up" ? "a thumbs up" : "a thumbs down"} ${ago(at)}`;
}

/**
 * A thumbs up and a thumbs down for the entry named `name`, beside its Save button: what you
 * think of it, one or neither, as `aria-pressed` says. Their icons are in style.css (--thumb), so
 * that the list, which repeats them in its every row, carries no SVG of them. What each is called
 * doesn't change with its state, unlike Save's, as its look holds no word.
 */
export function thumbsHtml(key: string, name: string): string {
  const mine = account.reactions.get(key);
  const button = (r: Reaction) =>
    `<button type="button" data-react="${r}" aria-pressed="${mine === r}" aria-label="${THUMB_WORDS[r]} for ${esc(name)}" title="${esc(thumbTitle(key, r))}"></button>`;
  return `<span class="thumbs" data-thumbs="${esc(key)}">${button("up")}${button("down")}</span>`;
}
