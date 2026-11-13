/**
 * The skills list's preview: on a wide screen, a click on a row (see row-links.ts) opens its skill
 * or bundle on a sheet over the window's left side, its whole height, up to the rows' words: over
 * the tags and the rows' numbers. What the row shows and more: every fact of its TLDR, its note,
 * its numbers, how to install it, its TLDR's prose, and the start of its SKILL.md, or a bundle's
 * skills. Once open, it follows the mouse from row to row (see `follow`), so that a click on a
 * row, the one it shows, closes it, as do a click anywhere but on a row or on the preview itself,
 * the preview's ×, and Escape. Its page is a click away, from All details, on the preview and on
 * the row.
 *
 * It opens on a click rather than when the pointer rests on a row: one that opened by itself hid
 * the tags, the search and the settings whenever the pointer was on the list. On a narrow screen,
 * where it would have only the tags' column, a click on a row opens its page.
 *
 * The click that opens it hands it the keyboard: Space and the arrows then scroll the sheet being
 * read, where they scrolled the list behind it, and Tab is on its All details, where it took as
 * many presses as the list has links. See "the keyboard", further down.
 */

import { age, commandHtml, esc, plural, textHtml } from "./format.ts";
import { copyButton, mountCopyButtons } from "./copy.ts";
import { saveButton, saveKey, thumbsHtml } from "./saves.ts";
import {
  aloneLine,
  bundleHref,
  bundleOf,
  CAUTION,
  data,
  glanceHtml,
  inBundleHtml,
  installCommand,
  installsOf,
  isBundle,
  nameOf,
  NUMBER_LABELS,
  publishedOf,
  repoHref,
  repoKey,
  skillById,
  skillHref,
  starsOf,
  tagInfo,
  weekOf,
} from "./skills.ts";
import type { ClientBundle as Bundle, ClientSkill as Skill, Prose } from "./client-data.ts";

type Entry = Skill | Bundle;

/** The narrowest window it opens in: under it, a row's numbers go under its words (see style.css), and the tags' column alone is too narrow for it. */
const wide = matchMedia("(min-width: 1151px)");

const pane = document.getElementById("preview") as HTMLElement;
const results = document.getElementById("results") as HTMLElement;

/** The TLDRs' prose, once list-client.ts has loaded it: until then the preview goes without. */
let prose: Prose | null = null;
export function setPreviewProse(p: Prose) {
  prose = p;
  const e = shown && entryOf(shown);
  const slot = pane.querySelector("[data-prose]");
  if (e && slot) put(slot, proseHtml(e));
}

/** Each row's skill or bundle, by the link of its name. */
let byHref: Map<string, Entry> | undefined;
function entryOf(row: Element): Entry | undefined {
  byHref ??= new Map<string, Entry>([
    ...data.skills.map((s): [string, Entry] => [skillHref(s.id), s]),
    ...data.bundles.map((b): [string, Entry] => [bundleHref(b.id), b]),
  ]);
  return byHref.get(row.querySelector(".skill-name")?.getAttribute("href") ?? "");
}

const pageOf = (e: Entry) => (isBundle(e) ? bundleHref(e.id) : skillHref(e.id));

// ------------------------------------------------------------------- what it shows

/** The 8 weeks' downloads as a line, as the Weekly Downloads tile of a skill's page draws them, smaller. */
function sparkHtml(weekly: number[] | null): string {
  if (!weekly || weekly.length < 2) return "";
  const max = Math.max(...weekly, 1);
  const points = weekly
    .map(
      (v, i) =>
        `${((i * 100) / (weekly.length - 1)).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="preview-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg>`;
}

/** Its numbers, which it covers on its row: exact, and named, as on its page. An unknown one is left out. */
function statsHtml(e: Entry): string {
  const week = weekOf(e);
  const total = installsOf(e);
  const stars = starsOf(e);
  const published = publishedOf(e);
  const stat = (label: string, value: string, more = "") =>
    `<div><dt>${label}</dt><dd>${value}${more}</dd></div>`;
  const stats = [
    week === null
      ? ""
      : stat(
          NUMBER_LABELS.week,
          week.toLocaleString("en"),
          isBundle(e) ? "" : sparkHtml(e["skills.sh"].weeklyInstalls),
        ),
    total === null ? "" : stat(NUMBER_LABELS.downloads, total.toLocaleString("en")),
    stars === null ? "" : stat(NUMBER_LABELS.stars, stars.toLocaleString("en")),
    published === null ? "" : stat(NUMBER_LABELS.published, age(published, data.asOf.installs)),
  ].filter(Boolean);
  if (!stats.length) return "";
  // A bundle's numbers are its skills' most, as on its row.
  const most = isBundle(e) ? `<p class="muted">The most of any of its skills.</p>` : "";
  return `<dl class="preview-stats">${stats.join("")}</dl>${most}`;
}

const CROSS = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>`;

/** The TLDR's prose, a paragraph each; "" until it's loaded, or for an entry without one. */
function proseHtml(e: Entry): string {
  const text = prose && (isBundle(e) ? prose.bundles : prose.skills)[e.id];
  if (!text) return "";
  const paragraphs = text.split(/\n\s*\n/).map((p) => `<p>${textHtml(p)}</p>`);
  return `<section class="preview-part"><h3>TL;DR</h3>${paragraphs.join("")}</section>`;
}

/**
 * A skill that only works inside its bundle is installed with it: no command for it alone. Until
 * its page is in, with the reason and the bundle's own command (see `fromPage`), the short of it.
 */
const onlyInBundle = (bundle: Bundle) =>
  `<p class="note">Only works inside its bundle: install <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a> instead.</p>`;

/** In place of a command that's on its way with its page, with the room of one: see `fromPage`. */
const GET_WAIT = `<p class="install-label">How to install it…</p><div class="install" aria-hidden="true"><code>&nbsp;</code></div>`;

function paneHtml(e: Entry): string {
  const review = e.agentReview;
  const parts = known.get(pageOf(e));
  const note = isBundle(e) ? undefined : e.agentReview.note;
  const place = isBundle(e) ? undefined : bundleOf.get(e.id);
  const only = place && !place.standalone;
  // What calls for a look before installing: its row says so down its left edge, which the sheet covers.
  const cautions = isBundle(e)
    ? []
    : e.agentReview.tags.filter((t) => CAUTION.includes(t) && tagInfo.has(t));
  // A skill's own command is at hand. A bundle's, and that of the bundle a skill only works in, are
  // on its page: the browser's data is without them (see client-data.ts).
  const install =
    isBundle(e) || only
      ? `<div class="preview-get" data-get>${parts?.get ?? GET_WAIT}</div>`
      : `<div class="install"><code>${commandHtml(installCommand(e))}</code>${copyButton(installCommand(e))}</div>`;
  const end = isBundle(e)
    ? `<section class="preview-part"><h3>Its skills</h3><p class="muted">${aloneLine(e, "Some")}</p><p class="members">${e.agentReview.skills
        .map(({ id }) => `<a href="${skillHref(id)}">${esc(skillById.get(id)?.name ?? id)}</a>`)
        .join(", ")}</p></section>`
    : `<section class="preview-part"><h3>SKILL.md</h3><div data-skill-md>${parts?.md ?? `<p class="muted">Loading its SKILL.md…</p>`}</div></section>`;
  return `
    <div class="preview-head">
      <div class="preview-title">
        <h2>${esc(nameOf(e))}${isBundle(e) ? ` <span class="kind">Bundle of ${plural(e.agentReview.skills.length, "skill")}</span>` : ""}</h2>
        <p class="skill-source"><a class="repo-link" href="${repoHref(repoKey(e))}">${esc(repoKey(e))}</a></p>
      </div>
      <a class="details" href="${pageOf(e)}">All details</a>
      ${thumbsHtml(saveKey(isBundle(e) ? "bundle" : "skill", e.id), nameOf(e))}
      ${saveButton(saveKey(isBundle(e) ? "bundle" : "skill", e.id), nameOf(e))}
      <button type="button" class="preview-close" data-close-preview aria-label="Close the preview">${CROSS}</button>
    </div>
    ${review.tldr?.glance.length ? glanceHtml(review.tldr.glance) : `<p class="skill-desc">${textHtml(review.description)}</p>`}
    ${isBundle(e) ? "" : inBundleHtml(e)}
    ${only ? `<div data-only>${parts?.only || onlyInBundle(place.bundle)}</div>` : ""}
    ${cautions.map((t) => `<p class="note">${esc(tagInfo.get(t) ?? "")}</p>`).join("")}
    ${note ? `<p class="note">${textHtml(note)}</p>` : ""}
    ${statsHtml(e)}
    ${install}
    <div data-prose>${proseHtml(e)}</div>
    ${end}`;
}

/**
 * What the sheet takes from the entry's own page, which the browser's data is without: the start
 * of a skill's SKILL.md (see `startOf`), a bundle's install commands, and, for a skill that only
 * works inside its bundle, why, with that bundle's command. Each page is fetched once, when its
 * preview first opens; once in, a preview of the same entry has them from its first frame.
 */
interface Parts {
  md: string;
  get: string;
  only: string;
}
const known = new Map<string, Parts>();
const pages = new Map<string, Promise<Parts | null>>();
function fromPage(e: Entry): Promise<Parts | null> {
  const page = pageOf(e);
  let parts = pages.get(page);
  if (!parts) {
    parts = fetch(page)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, "text/html");
        // Its first command, with what it's for: a bundle has up to ten, for as many agents, and
        // its page has them all.
        const commands = [...doc.querySelectorAll(".get > .install")];
        const label = commands[0]?.previousElementSibling;
        const more = isBundle(e)
          ? commands.length > 1 &&
            `<a href="${page}">${plural(commands.length - 1, "other way")} to install it</a>`
          : // Of the bundle a skill only works in: its page links to them.
            [...doc.querySelectorAll<HTMLAnchorElement>(".get .links a")]
              .filter((a) => a.textContent === "Other ways to install it")
              .map((a) => a.outerHTML)[0];
        const found = {
          md: startOf(doc, page),
          get: commands.length
            ? `${label?.matches(".install-label") ? label.outerHTML : ""}${commands[0].outerHTML}${more ? `<p class="muted">${more}</p>` : ""}`
            : "",
          only: doc.querySelector("[data-only-in-bundle]")?.outerHTML ?? "",
        };
        known.set(page, found);
        return found;
      })
      .catch(() => {
        // Tried again the next time it opens.
        pages.delete(page);
        return null;
      });
    pages.set(page, parts);
  }
  return parts;
}

/**
 * Puts what came in after the sheet opened into its part of it, without moving what's being read.
 * In a sheet that's read down, that's what is under the part, when the part is in the window's
 * upper half or above it: the sheet scrolls on by as much as it grew. The TLDR's prose, in over a
 * SKILL.md being read, pushed its lines a screen away. Not for a part that grows down from where
 * it starts, `under` false: the SKILL.md itself.
 */
function put(slot: Element, html: string, under = true) {
  const bottom = slot.getBoundingClientRect().bottom;
  const height = pane.scrollHeight;
  slot.innerHTML = html;
  const view = pane.getBoundingClientRect();
  if (under && pane.scrollTop > 0 && bottom < view.top + view.height / 2)
    pane.scrollTop += pane.scrollHeight - height;
  backToWhereRead();
}

/**
 * How far down the sheet was read when its page was left, for the way back (see `previewAgain`):
 * the sheet is first as short as its parts at hand, and takes its place once the rest is in. Until
 * the reader scrolls it themselves.
 */
let readTo: number | null = null;
function backToWhereRead() {
  if (readTo === null) return;
  pane.scrollTop = readTo;
  if (pane.scrollTop >= readTo - 1) readTo = null;
}
for (const type of ["wheel", "touchmove", "keydown", "pointerdown"])
  pane.addEventListener(type, () => (readTo = null), { passive: true });

/** Fills the open sheet's parts with what its entry's page had: see `fromPage`. */
function fill(e: Entry, parts: Parts | null) {
  const slot = (name: string) => pane.querySelector(`[data-${name}]`);
  const md = slot("skill-md");
  if (md)
    put(
      md,
      parts?.md ??
        `<p class="muted">Its SKILL.md didn't load: it's on <a href="${pageOf(e)}">its page</a>.</p>`,
      false,
    );
  const get = slot("get");
  if (get)
    put(
      get,
      parts?.get ||
        `<p class="muted">How to install it is on <a href="${pageOf(e)}">its page</a>.</p>`,
    );
  const only = slot("only");
  if (only && parts?.only) put(only, parts.only);
  reachable();
}

/**
 * The keyboard reaches what scrolls sideways in the start of a SKILL.md, a code block or a table
 * wider than the sheet, as on the skill's page (see scrollables.ts), whose tab stops don't come
 * with its HTML.
 */
function reachable() {
  for (const block of pane.querySelectorAll<HTMLElement>(".markdown pre, .markdown table"))
    if (block.scrollWidth > block.clientWidth) block.tabIndex = 0;
    else block.removeAttribute("tabindex");
}

/** The lines of a code block, and the rows of a table, that the start of a SKILL.md shows at most. */
const LINES = 16;
const ROWS = 8;

/**
 * The start of a skill's SKILL.md, from its page: the line saying where the copy is from, and its
 * first blocks, some 500 characters' worth. Cut where it reads as a start:
 * - not after a heading, which would head nothing, a rule, or a line that announces what comes
 *   next, "Use this skill when:": that one takes what it announces along, a list or a code block;
 * - a code block of a hundred lines, or a table of forty rows, is one block: they're cut too, to
 *   their first lines, or a start ran to four screens;
 * - when it's the whole of it, as for a SKILL.md of three lines, nothing says to read it all on
 *   its page.
 * Its headings are a level down, under the sheet's own "SKILL.md".
 */
function startOf(doc: Document, page: string): string {
  const section = doc.querySelector(".skill-md");
  if (!section) return "";
  // Its headings' ids would be the list's: a link to one of them leads to its page.
  for (const el of section.querySelectorAll("[id]")) el.removeAttribute("id");
  for (const a of section.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    a.setAttribute("href", page + a.getAttribute("href"));
  const from = section.querySelector(":scope > p.muted");
  const fromHtml = from ? `<p class="muted">${from.innerHTML}</p>` : "";
  const markdown = section.querySelector(".markdown");
  if (!markdown) return fromHtml;
  const all = [...markdown.children];
  const blocks: Element[] = [];
  let length = 0;
  for (const block of all) {
    if (length > 500 || blocks.length >= 5) break;
    blocks.push(block);
    length += block.textContent?.length ?? 0;
  }
  if (!blocks.length) return fromHtml;
  const last = () => blocks[blocks.length - 1];
  const announces = (block: Element) =>
    block.tagName === "P" && /[:：]\s*$/.test(block.textContent ?? "");
  // What a line announces comes with it.
  const next = all[blocks.length];
  if (announces(last()) && next && /^(UL|OL|PRE|TABLE|BLOCKQUOTE)$/.test(next.tagName))
    blocks.push(next);
  while (blocks.length > 1 && (/^(H[1-6]|HR)$/.test(last().tagName) || announces(last())))
    blocks.pop();
  let cut = blocks.length < all.length;
  for (const block of blocks) {
    const code = block.tagName === "PRE" ? (block.querySelector("code") ?? block) : null;
    const lines = code?.textContent?.replace(/\n$/, "").split("\n") ?? [];
    if (code && lines.length > LINES) {
      code.textContent = `${lines.slice(0, LINES).join("\n")}\n…`;
      cut = true;
    }
    const rows = block.tagName === "TABLE" ? [...block.querySelectorAll("tbody > tr")] : [];
    for (const row of rows.slice(ROWS)) row.remove();
    if (rows.length > ROWS) {
      const columns = rows[0].children.length;
      rows[ROWS - 1].insertAdjacentHTML("afterend", `<tr><td colspan="${columns}">…</td></tr>`);
      cut = true;
    }
  }
  const html = blocks.map((block) => {
    const level = /^H([1-6])$/.exec(block.tagName)?.[1];
    const tag = level ? `h${Math.min(6, Number(level) + 1)}` : null;
    return tag ? `<${tag}>${block.innerHTML}</${tag}>` : block.outerHTML;
  });
  return `${fromHtml}<div class="markdown">${html.join("")}</div>${cut ? `<p><a href="${page}">Read it all on its page</a></p>` : ""}`;
}

// ------------------------------------------------------------------- opening and closing

/** The row whose preview is open. */
let shown: HTMLElement | null = null;

/**
 * Tells the list that the preview opened, closed or took another row, for it to note with the
 * page's entry in the browser's history: see `note` in list-client.ts.
 */
let changed = () => {};
export function watchPreview(tell: () => void) {
  changed = tell;
}

function show(row: HTMLElement) {
  const e = entryOf(row);
  if (!e) return;
  waitNoMore();
  // The keyboard stays on the sheet while its words change: what's replaced takes the focus with it.
  const focused = pane.contains(document.activeElement);
  shown?.classList.remove("previewed");
  shown = row;
  row.classList.add("previewed");
  pane.setAttribute("aria-label", `Preview of ${nameOf(e)}`);
  pane.innerHTML = paneHtml(e);
  pane.hidden = false;
  // Once it's in the page, as a hidden sheet doesn't scroll: one read down, then closed, had the
  // next one open as far down, its name, All details and × above the window.
  pane.scrollTop = 0;
  readTo = null;
  if (focused) pane.focus({ preventScroll: true });
  place();
  reachable();
  changed();
  // What its page has that the browser's data doesn't: at once when it's in already.
  if (!known.has(pageOf(e)))
    void fromPage(e).then((parts) => {
      if (shown === row) fill(e, parts);
    });
}

/**
 * For a click on a row: opens its preview, or closes it when it's the one open, as the row the
 * mouse is on is once it's open. False on a narrow screen, where the click opens the row's page.
 */
export function previewRow(row: HTMLElement): boolean {
  if (!wide.matches) return false;
  if (row === shown) hidePreview();
  else {
    show(row);
    // The click is to read it: the keyboard is on it from here.
    pane.focus({ preventScroll: true });
  }
  return true;
}

/**
 * Closes it, as when the list is rendered again, whose rows it was about. The keyboard, if it was
 * on the sheet, goes back to the row it was about, from where Tab goes on down the list: left on
 * nothing, the next Tab started over from the page's top.
 */
export function hidePreview() {
  waitNoMore();
  const name = pane.contains(document.activeElement)
    ? shown?.querySelector<HTMLElement>(".skill-name")
    : null;
  const was = shown;
  shown?.classList.remove("previewed");
  shown = null;
  pane.hidden = true;
  name?.focus({ preventScroll: true });
  if (was) changed();
}

/**
 * For a list that's rendered again by itself, with what just came in (see `refresh` in
 * list-client.ts): what to open the preview again with, once it is, or null when none is open. The
 * page of its row, and how far down it was read.
 */
export const previewed = () => {
  const page = shown?.querySelector(".skill-name")?.getAttribute("href");
  // Where it's on its way back to, if it isn't there yet: see `backToWhereRead`.
  return page
    ? { page, top: readTo ?? pane.scrollTop, focused: pane.contains(document.activeElement) }
    : null;
};
/** What `previewed` tells: also kept with the page's entry in the browser's history (see list-client.ts). */
export type Previewed = NonNullable<ReturnType<typeof previewed>>;

/**
 * Opens it again, where it was read, if its row is still listed. The list rendered again closed
 * it: a row previewed while the TLDRs' prose was still loading, with a search on, lost its preview
 * under the reader's eyes once the prose was in.
 */
export function previewAgain({ page, top, focused }: Previewed) {
  if (!wide.matches) return;
  const row = results
    .querySelector(`.skill-list > li .skill-name[href="${CSS.escape(page)}"]`)
    ?.closest<HTMLElement>("li");
  if (!row) return;
  show(row);
  readTo = top;
  backToWhereRead();
  if (focused) pane.focus({ preventScroll: true });
}

/**
 * From the window's left edge to just short of the rows' words, its words starting where the tags
 * do, at --left, rather than at the window's edge, which can be far from the list on a wide
 * screen. See #preview in style.css.
 */
function place() {
  if (pane.hidden) return;
  const tags = document.getElementById("facets")?.getBoundingClientRect();
  const words = results.querySelector(".skill-list > li .skill-body")?.getBoundingClientRect();
  if (!tags || !words) return hidePreview();
  edge = words.left - 16;
  pane.style.setProperty("--left", `${tags.left}px`);
  pane.style.setProperty("--width", `${edge}px`);
}
/** The sheet's right edge, which the mouse heads for on its way to it: see `heading`. */
let edge = 0;

// ------------------------------------------------------------------- following the mouse

/*
 * Open, the preview shows the row the mouse moves onto. Onto, as a hand means it, which leaves
 * out three ways for the pointer to be over another row:
 * - On its way to the sheet. The straight line from a row down the window to the sheet's All
 *   details, or its Copy, crosses the rows above: the sheet took each in turn, and the click
 *   landed on the page of another skill than the one being read. A pointer heading for the
 *   sheet's edge (see `heading`) changes nothing, unless it comes to rest on a row.
 * - With a button down. A selection dragged past the sheet's edge, as one overshoots a line's
 *   end, had the words being selected replaced by another row's.
 * - While the list scrolls under a pointer that stays where it is, by the wheel or by Space: the
 *   sheet went through every row that passed under it, twenty-five in a few screens, fetching the
 *   page of each. The pointer has to move.
 * Not a touch's: a tap on another row is a click on it.
 */

/** The mouse's last moves on the list, the newest last, no older than TRAIL: where it's heading. */
const trail: { x: number; y: number; time: number }[] = [];
const TRAIL = 120;
/** How long the mouse rests on a row, on its way to the sheet, before the sheet takes that row. */
const REST = 250;
let waiting: ReturnType<typeof setTimeout> | undefined;
function waitNoMore() {
  clearTimeout(waiting);
  waiting = undefined;
}

/**
 * Whether the mouse is on its way to the sheet: going left, on a line that meets the sheet's edge
 * within the window's height, give or take. As a menu tells a pointer on its way to its submenu
 * from one that's going down its items.
 */
function heading(): boolean {
  const [from, now] = [trail[0], trail[trail.length - 1]];
  if (!now || from === now) return false;
  const [dx, dy] = [now.x - from.x, now.y - from.y];
  if (dx > -4) return false;
  const meets = now.y + (dy * (edge - now.x)) / dx;
  return meets > -80 && meets < innerHeight + 80;
}

/** The sheet takes the row the mouse is on, if it's another than the one it shows. */
function follow() {
  waitNoMore();
  const at = trail[trail.length - 1];
  const row = at && document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>(".skill-list > li");
  if (shown && row && row !== shown && results.contains(row)) show(row);
}

results.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;
  const last = trail[trail.length - 1];
  // The list scrolled under it: a browser may tell that as a move to where the pointer already
  // is. So where it is is kept while the preview is closed too, from before the click that opens.
  if (last && last.x === event.clientX && last.y === event.clientY) return;
  const time = performance.now();
  trail.push({ x: event.clientX, y: event.clientY, time });
  while (time - trail[0].time > TRAIL) trail.shift();
  if (!shown) return;
  if (event.buttons) return waitNoMore();
  const row = (event.target as Element).closest<HTMLElement>(".skill-list > li");
  if (!row || row === shown) return waitNoMore();
  if (!heading()) return show(row);
  waitNoMore();
  waiting = setTimeout(follow, REST);
});
// Off the list, onto the sheet or anything else: no row is left to wait for.
results.addEventListener("pointerleave", waitNoMore);

/*
 * A click outside the rows, which row-links.ts takes, and outside the preview, closes it. Not one
 * that began on either: a selection dragged out of the sheet, or out of a row, ends as a click on
 * whatever holds both ends, which is neither, and took the sheet away with the words just selected.
 */
let pressed: Element | null = null;
let down = false;
document.addEventListener(
  "pointerdown",
  (event) => {
    pressed = event.target as Element;
    down = true;
  },
  true,
);
const mine = (el: Element | null) =>
  Boolean(el && (pane.contains(el) || el.closest(".skill-list > li")));
document.addEventListener("click", (event) => {
  const began = pressed;
  pressed = null;
  if (shown && !mine(event.target as Element) && !mine(began)) hidePreview();
});

/*
 * A selection that begins in the sheet stays in it. Dragged past its edge, it took in the list
 * behind it, from the row under the pointer on: thousands of words in blue for half a line of the
 * sheet's. For the time of the drag nothing else on the page can be selected (see
 * [data-preview-selecting] in style.css), so that it ends where the line does.
 */
pane.addEventListener("selectstart", () => {
  if (down) document.body.setAttribute("data-preview-selecting", "");
});
for (const type of ["pointerup", "pointercancel"])
  document.addEventListener(
    type,
    () => {
      down = false;
      document.body.removeAttribute("data-preview-selecting");
    },
    true,
  );

/**
 * Windows has no cursor of an arrow one way, which e-resize and w-resize, the rows' cursors, are
 * elsewhere: it shows both as its ↔, as for resizing. There, the rows take images of the arrows
 * instead (see style.css).
 */
const platform =
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
  navigator.platform;
if (/^win/i.test(platform)) document.documentElement.setAttribute("data-windows", "");

pane.addEventListener("click", (event) => {
  if ((event.target as Element).closest("[data-close-preview]")) hidePreview();
});
// Read down, its head tells itself from the words that go under it: see .preview-head in style.css.
pane.addEventListener("scroll", () => pane.toggleAttribute("data-read", pane.scrollTop > 0), {
  passive: true,
});

// ------------------------------------------------------------------- the keyboard

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && shown) hidePreview();
});

/*
 * The sheet is the last thing in the page, far from the row it's about. Tab leaves it as if it
 * were beside that row: back from its first stop to the row's name, and on from its last one to
 * what follows the name. Left to the page's order, Shift+Tab went to the list's last row,
 * thousands of rows down, and Tab off the page.
 */
pane.addEventListener("keydown", (event) => {
  const name = shown?.querySelector<HTMLElement>(".skill-name");
  if (event.key !== "Tab" || !name) return;
  const stops = [...pane.querySelectorAll<HTMLElement>("a[href], button, [tabindex='0']")];
  const on = document.activeElement;
  if (event.shiftKey ? on !== pane && on !== stops[0] : on !== stops[stops.length - 1]) return;
  // Back: to the name. On: from the name, which the browser then leaves for what follows it.
  name.focus();
  if (event.shiftKey) event.preventDefault();
});

/*
 * What the sheet covers is out of sight, and the keyboard can still go there, to the tags, the
 * presets, the sort: over a hundred stops of the page, each without a ring to be seen. The sheet
 * makes way for a focus that lands under it.
 */
document.addEventListener("focusin", (event) => {
  const on = event.target as Element;
  if (!shown || pane.contains(on)) return;
  const box = on.getBoundingClientRect();
  if (box.width && box.left < edge) hidePreview();
});
addEventListener("resize", () => (wide.matches ? place() : hidePreview()));

mountCopyButtons();
