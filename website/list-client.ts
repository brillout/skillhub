/** The skills list's settings and filters: re-render the list whenever they change, and keep them in the URL. */

import {
  addSearchWords,
  PROPS,
  facetsHtml,
  boundAt,
  fieldText,
  fullRange,
  histogramHtml,
  isNarrowed,
  parseAge,
  parseCount,
  rangeError,
  rangeLabel,
  rangePositions,
  parse,
  askPrompt,
  askable,
  countHtml,
  isListed,
  tokensHtml,
  tokensOf,
  LARGE_PROMPT,
  largeHint,
  fullRanges,
  patched,
  presetPatch,
  query,
  resultsHtml,
  askLabel,
  scopeHtml,
  searchNote,
  rowCount,
  rowsHtml,
  presetsHtml,
  sortHtml,
  showHtml,
  titleOf,
  toggleTag,
  type Preset,
  type Prop,
  type Range,
  type Show,
  type Sort,
  type State,
} from "./list.ts";
import { href } from "./format.ts";
import { notice } from "./notice.ts";
import { searchWords } from "./client-data.ts";
import {
  hidePreview,
  previewAgain,
  previewed,
  setPreviewProse,
  watchPreview,
  type Previewed,
} from "./preview-client.ts";
import { ACCOUNT_EVENT, showsSaved, type AccountChange } from "./account-client.ts";
import { LEFT_AT, LOGIN_FROM, account, savedCount, type Reaction } from "./saves.ts";

// The Saved switch counts only what's still listed, as the list does; account-client.ts may have
// counted before this script ran.
account.listed = isListed;
for (const n of document.querySelectorAll("[data-saved-count]")) n.textContent = savedCount();

const app = document.getElementById("app") as HTMLElement;
const q = document.getElementById("q") as HTMLInputElement;
const results = document.getElementById("results") as HTMLElement;
/**
 * The settings' line. What each render looks up in it, the sliders, their fields and histograms, is
 * looked up in it, not in the page: the page holds the list too, some 90,000 elements, and a dozen
 * searches through them took a tenth of the time of the render that follows a letter of a search.
 */
const settings = document.getElementById("settings") as HTMLElement;
let state = parse(location.search);
let stackExpanded = false;

/** Whether the next render should bring the top of the list into view: see `go`. */
let toTop = false;

/**
 * What was just clicked among the tags, and where it was in the window: the next render puts it
 * back there (see `stay`). The tags above a picked one change with it, as do their counts, some
 * going and some coming back, so what's under them moves: the tag just tapped went up out of the
 * screen, by some 370px on a phone, and Show fewer left the screen amid the list, 3,000px on.
 * Noted at the click rather than from what has the focus, which a tap doesn't give a button on
 * every phone.
 */
let clicked: { selector: string; top: number } | null = null;
const noteClicked = (el: HTMLElement, selector: string) => {
  if (el.closest("#facets")) clicked = { selector, top: el.getBoundingClientRect().top };
};
/** The facet that was given room over it to keep a clicked tag in place: see `stay`. */
let roomOver: HTMLElement | null = null;
/**
 * Scrolls what the tags scroll with, their own column or else the page, to put it back.
 *
 * At its own top the column has nothing to scroll back by: a tag picked there went up with what
 * the tags over it lost, 33px for one row of them, so the pointer was on the next tag, and a second
 * click, to take the pick back, picked that one too. The tag's facet then gets as much room over
 * it, until the pointer leaves the tags.
 */
function stay() {
  const was = clicked;
  clicked = null;
  const el = was && document.querySelector<HTMLElement>(was.selector);
  if (!was || !el) return;
  const by = el.getBoundingClientRect().top - was.top;
  const column = document.getElementById("filters") as HTMLElement;
  if (getComputedStyle(column).overflowY === "visible") return scrollBy(0, by);
  column.scrollTop += by;
  const short = was.top - el.getBoundingClientRect().top;
  const facet = el.closest<HTMLElement>(".facet");
  if (short < 0.5 || !facet) return;
  facet.style.marginTop = `${Number.parseFloat(getComputedStyle(facet).marginTop) + short}px`;
  roomOver = facet;
}
// A finger leaves with every tap: its tag keeps its place until the tags are rendered again.
document.getElementById("filters")?.addEventListener("pointerleave", (event) => {
  if (event.pointerType !== "mouse") return;
  roomOver?.style.removeProperty("margin-top");
  roomOver = null;
});

/**
 * Whether every change the next render is for came as it was typed or dragged, a search, an amount
 * in a filter's field, a slider's handle: the list's rows past the first ones then wait for a pause
 * (see `render`).
 */
let typing = false;

/** `typed`: the change is one of a run, a letter of a search or a step of a slider's handle. */
function go(patch: Partial<State>, typed = false) {
  state = patched(state, patch);
  history.replaceState(null, "", query(state) || location.pathname);
  // A new order or new filters start the list over, except while typing a search, which happens
  // at the top anyway.
  if (Object.keys(patch).some((k) => k !== "q")) toTop = true;
  // A click that comes with it, before the render, takes it out of the run.
  typing = typed && (typing || !soon);
  renderSoon();
}

/**
 * Whether the list is on its way: `#results[aria-busy="true"]` from the change that calls for a
 * render until its last rows are in (see `render`). For assistive tech, and for whoever drives the
 * page, a test or an agent, to wait for the list a change leads to: see ready.ts.
 */
const busy = (on: boolean) => results.setAttribute("aria-busy", String(on));

/**
 * Where the list is scrolled to, as the row at the window's top and how far down that row the
 * window starts; or, above the rows, as the page's own offset. By row rather than by pixels alone:
 * a row off the screen counts as a typical row's height (see `.skill-list > .skill` in style.css),
 * so the same pixels are another row, some rows away, once the list is rendered again.
 */
type Place = { row: string; top: number } | { y: number };

function place(): Place {
  const box = results.getBoundingClientRect();
  const row = document
    .elementFromPoint(box.left + box.width / 2, 1)
    ?.closest<HTMLElement>("#results .skill-list > li");
  const href = row?.querySelector(".skill-name")?.getAttribute("href");
  return row && href ? { row: href, top: row.getBoundingClientRect().top } : { y: scrollY };
}

function backTo(at: Place) {
  if ("y" in at) return scrollTo(0, at.y);
  const row = results
    .querySelector(`.skill-list > li .skill-name[href="${CSS.escape(at.row)}"]`)
    ?.closest("li");
  if (!row) return;
  const under = () => scrollBy(0, row.getBoundingClientRect().top - at.top);
  row.scrollIntoView({ block: "start" });
  under();
  // The row gets its own height once it's drawn, which the browser does next: once more then.
  requestAnimationFrame(() => setTimeout(under));
}

/**
 * The browser puts a page back where it was scrolled to, by pixels, when it's reloaded or returned
 * to, such as from a skill's page: the list does it itself, by row, from the place it noted with
 * the page's entry in the browser's history as the page was left. With the preview that was open:
 * its All details leads to the skill's page, and the way back came to a list without the preview
 * it was left from, nor a sign of which row that was.
 */
history.scrollRestoration = "manual";
const here = () => location.pathname + location.search;
/** Where the list was left, and the preview that was open, if any. */
type Left = { at?: Place; preview?: Previewed | null };
const note = () => {
  const left: Left = { at: place(), preview: previewed() };
  history.replaceState(left, "");
  // And for the tab, should it be leaving to log in: see `leftToLogIn`.
  try {
    sessionStorage.setItem(LEFT_AT, JSON.stringify({ page: here(), ...left }));
  } catch {}
};
addEventListener("pagehide", note);

/**
 * Where this list was left to log in, when the page is the way back from it: within some minutes,
 * to the list it left, which then is a new page, with no place in the browser's history (see
 * LOGIN_FROM in saves.ts). Not on any other way to the same list, such as the site's name's link,
 * which starts it at its top.
 */
function leftToLogIn(): Left | undefined {
  try {
    const from = JSON.parse(sessionStorage.getItem(LOGIN_FROM) ?? "null");
    sessionStorage.removeItem(LOGIN_FROM);
    const left = JSON.parse(sessionStorage.getItem(LEFT_AT) ?? "null");
    if (from?.page === here() && left?.page === here() && Date.now() - from.time < 600_000)
      return left;
  } catch {}
  return undefined;
}
// A reload keeps what was noted before it began: so also once the page has stopped scrolling, and
// once a preview has opened, closed or taken another row.
let scrolled: ReturnType<typeof setTimeout> | undefined;
const noteSoon = () => {
  clearTimeout(scrolled);
  scrolled = setTimeout(note, 250);
};
addEventListener("scroll", noteSoon, { passive: true });
watchPreview(noteSoon);

/**
 * The same list again, with what just came in, such as the TLDRs' prose for the search: whole and
 * at once, as its first rows alone would cut the page short under a window scrolled further, and
 * back at the row it was at, with the preview that was open.
 */
function refresh() {
  const at = place();
  const preview = previewed();
  // What came in is in no key of the renders' caches: a new state misses them all, the list's
  // heading's count and the lines under the boxes included.
  state = { ...state };
  lastFacets = "";
  lastScope = "";
  render(true);
  backTo(at);
  if (preview) previewAgain(preview);
}

let soon = false;
/**
 * Render after the next paint, once for however many changes come before it, so that the control
 * just used shows its new state without waiting for the list.
 */
function renderSoon() {
  busy(true);
  if (soon) return;
  soon = true;
  requestAnimationFrame(() =>
    setTimeout(() => {
      soon = false;
      render();
    }),
  );
}

/** Re-rendering replaces the buttons; put focus back on the one that was used. */
function focusSelector(): string | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el.id === "q" || !app.contains(el)) return null;
  // A thumb is told from the other rows' by its entry, which its pair carries.
  const thumbs = el.dataset.react && el.closest<HTMLElement>("[data-thumbs]")?.dataset.thumbs;
  if (thumbs)
    return `#results [data-thumbs="${CSS.escape(thumbs)}"] [data-react="${el.dataset.react}"]`;
  for (const attr of [
    "data-tag",
    "data-action",
    "data-remove",
    "data-preset",
    "data-show",
    "data-order",
    "data-save",
  ]) {
    const v = el.getAttribute(attr);
    if (v === null) continue;
    // A facet's chip keeps the focus in the facets, rather than pass it to the same tag's among
    // those the search found, which come first; one of those passes it to the facet's once it
    // replaced the search, and its box is gone. See facetsHtml in list.ts.
    const within =
      ["skill-tags", "facets", "presets", "settings", "scope"].find((id) => el.closest(`#${id}`)) ??
      "results";
    // A filter's pill is told from the other three by its filter: they're all `data-action="range"`.
    const which =
      attr === "data-action" && el.dataset.value ? `[data-value="${el.dataset.value}"]` : "";
    return `#${within} [${attr}="${CSS.escape(v)}"]${which}`;
  }
  return el.id ? `#${CSS.escape(el.id)}` : null;
}

/** The range whose slider's popover is open, if any: one at a time. */
let open: Prop | null = null;
function openRange(p: Prop | null) {
  open = p;
  for (const range of settings.querySelectorAll<HTMLElement>("[data-range-section]")) {
    const on = range.dataset.rangeSection === p;
    const pop = range.querySelector<HTMLElement>(".range-pop");
    pop?.toggleAttribute("hidden", !on);
    range.querySelector(".range-pill")?.setAttribute("aria-expanded", String(on));
    if (on && pop) {
      fit(pop);
      intoView(pop);
    }
  }
}

/**
 * Keeps a popover inside the window: it opens from its pill's left edge, and the last pill's stuck
 * out of the window's right one wherever Show is on a line of its own and the pills are long with
 * their ranges, around 1,100px, which scrolled the page sideways. It's moved left by as much as it
 * would stick out: see --shift in style.css.
 */
function fit(pop: HTMLElement) {
  pop.style.removeProperty("--shift");
  const over = pop.getBoundingClientRect().right - (document.documentElement.clientWidth - 12);
  if (over > 0) pop.style.setProperty("--shift", `${Math.ceil(over)}px`);
}
// Again when the window's width changes under an open one, as when a tablet is turned.
addEventListener("resize", () => {
  const pop =
    open && settings.querySelector<HTMLElement>(`[data-range-section="${open}"] .range-pop`);
  if (pop) fit(pop);
});

/**
 * Brings what just opened under its button into view, when the window's bottom cuts it off: on a
 * phone, a filter's slider opens below the screen's edge.
 */
const intoView = (el: Element | null | undefined) =>
  el?.scrollIntoView({ block: "nearest", inline: "nearest" });

// A click elsewhere closes the popover; so does Escape, which puts the focus back on its pill.
document.addEventListener("click", (event) => {
  if (open && !(event.target as Element).closest(`[data-range-section="${open}"]`)) openRange(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !open) return;
  const range = settings.querySelector(`[data-range-section="${open}"]`);
  const inside = range?.contains(document.activeElement);
  openRange(null);
  if (inside) range?.querySelector<HTMLElement>(".range-pill")?.focus();
});
// On a narrow screen, Escape also closes the open tags from among them, as it closes a menu: the
// keyboard's only other way out was through them all, some 150 Tabs, to the button under them.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !tagsShown || open || sortOpen) return;
  if (!document.getElementById("filters")?.contains(document.activeElement)) return;
  tagsShown = false;
  syncTags();
  app.querySelector<HTMLElement>(".tags-toggle")?.focus();
});
// And so does the keyboard on its way out, as Tab closes the Sort by menu: left open, the popover
// stayed over the list while the focus moved on to the next filter. Only when the focus goes to
// something else: a click on the popover's own histogram takes it from the handle to nothing.
app.addEventListener("focusout", (event) => {
  const range = open && settings.querySelector(`[data-range-section="${open}"]`);
  const to = event.relatedTarget as Node | null;
  if (range && range.contains(event.target as Node) && to && !range.contains(to)) openRange(null);
});

/**
 * The Sort by menu: its button, and its options as a listbox under it. Arrow keys, Home and End move
 * among the options, Enter or Space picks one, Escape closes it and Tab leaves it; a click elsewhere
 * closes it.
 */
let sortOpen = false;
function openSort(on: boolean, focus: "option" | "button" | null = null) {
  sortOpen = on;
  const button = app.querySelector<HTMLElement>("#sort");
  const list = app.querySelector<HTMLElement>("#sort-options");
  button?.setAttribute("aria-expanded", String(on));
  list?.toggleAttribute("hidden", !on);
  if (on) intoView(list);
  if (on && focus === "option")
    (
      list?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      list?.querySelector<HTMLElement>('[role="option"]')
    )?.focus();
  if (!on && focus === "button") button?.focus();
}
/** Its button keeps the focus, so that it gets it back once the settings are re-rendered. */
function chooseSort(option: HTMLElement) {
  openSort(false, "button");
  if (option.dataset.sort !== state.sort) go({ sort: option.dataset.sort as Sort });
}
document.addEventListener("click", (event) => {
  if (sortOpen && !(event.target as Element).closest(".sort-menu")) openSort(false);
});
app.addEventListener("keydown", (event) => {
  const el = event.target as HTMLElement;
  if (el.id === "sort" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    openSort(true, "option");
    return;
  }
  if (!el.matches('#sort-options [role="option"]')) return;
  const options = [...app.querySelectorAll<HTMLElement>('#sort-options [role="option"]')];
  const at = options.indexOf(el);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 }[event.key];
  if (to !== undefined) {
    event.preventDefault();
    options[Math.max(0, Math.min(options.length - 1, to))].focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    chooseSort(el);
  } else if (event.key === "Escape") {
    event.preventDefault();
    openSort(false, "button");
  } else if (event.key === "Tab") openSort(false);
});

/**
 * The Saved switch isn't re-rendered, so that it can slide: it follows the state instead. And so
 * does the header's Saved link, which leads to this list with the switch on, and Show's thumbs,
 * whose icons cross-fade.
 */
const savedSwitch = document.getElementById("saved-switch") as HTMLElement;
const thumbsFilter = [
  ...document.querySelectorAll<HTMLElement>('#thumbs-filter [data-action="thumbs"]'),
];
const syncThumbs = (on: Reaction | null) => {
  for (const b of thumbsFilter) b.setAttribute("aria-pressed", String(b.dataset.value === on));
};
function syncSaved() {
  savedSwitch.setAttribute("aria-checked", String(state.saved));
  syncThumbs(state.thumbs);
  showsSaved(state.saved);
}

/**
 * The sliders and their fields aren't re-rendered, so that a handle can be dragged, or an amount
 * typed, while the list updates; they follow the state instead. A field being typed in keeps what
 * it holds, which may be on its way to an amount, such as "2w ".
 */
function syncRanges() {
  for (const p of Object.keys(PROPS) as Prop[]) {
    const range = state.ranges[p];
    const slider = settings.querySelector<HTMLElement>(`[data-slider="${p}"]`);
    if (!slider) continue;
    const last = PROPS[p].stops.length - 1;
    const at = rangePositions(p, range);
    slider.style.setProperty("--lo", String(at[0] / last));
    slider.style.setProperty("--hi", String(at[1] / last));
    for (const input of slider.querySelectorAll<HTMLInputElement>("input")) {
      input.value = String(at[Number(input.dataset.end)]);
      input.setAttribute("aria-valuetext", rangeLabel(p, range));
    }
    const fields = [...settings.querySelectorAll<HTMLInputElement>(`[data-exact="${p}"]`)];
    for (const field of fields)
      if (field !== document.activeElement) {
        field.value = fieldText(p, range[Number(field.dataset.bound)]);
        field.removeAttribute("aria-invalid");
      }
    if (!fields.includes(document.activeElement as HTMLInputElement)) sayRangeError(p, "");
    for (const label of settings.querySelectorAll(`[data-range-label="${p}"]`))
      label.textContent = rangeLabel(p, range);
    settings
      .querySelector(`[data-range-section="${p}"]`)
      ?.classList.toggle("narrowed", isNarrowed(range));
  }
}

/** What's wrong with what a slider's field holds, under its fields; "" for nothing. */
function sayRangeError(p: Prop, message: string) {
  const error = document.getElementById(`range-error-${p}`);
  if (error && error.textContent !== message) error.textContent = message;
}

/** The histograms' counts follow the other filters, and their bars the slider's own range. */
function renderHistograms() {
  for (const el of settings.querySelectorAll<HTMLElement>("[data-histogram]"))
    el.innerHTML = histogramHtml(state, el.dataset.histogram as Prop);
}

/** Rows rendered right away; the rest follow STEP at a time, so a change shows without waiting for the whole list. */
const FIRST = 40;
const STEP = 150;
/**
 * How long the rest waits, in milliseconds, after a change that's one of a run (see `go`): about
 * as long as from one letter of a search to the next. Following at once, the rest of a list that
 * the next letter replaces kept the page busy between two letters, a thousand rows for each: the
 * next letter showed late, and its list later. They now follow once the typing pauses.
 */
const TYPING_PAUSE = 200;
/** Counts renders, so that rows still on their way for an older one are dropped. */
let renders = 0;
/** What the facets were last rendered for: the pre-rendered page's are for no filters. */
let lastFacets = "";
/**
 * What the scope line and the lines under the boxes were last rendered for, since they don't
 * depend on the sort; "" for the pre-rendered page's.
 */
let lastScope = "";
/** The page's own title, which the whole list keeps: see titleOf in list.ts. */
const siteTitle = document.title;

/** What the list holds, whatever its order: its search and its filters. */
const scopeKey = () =>
  JSON.stringify([
    state.saved,
    state.thumbs,
    state.tags,
    state.repo,
    state.ranges,
    state.show,
    state.q,
  ]);

function renderScope() {
  const key = scopeKey();
  if (key === lastScope) return;
  lastScope = key;
  (document.getElementById("scope") as HTMLElement).innerHTML = scopeHtml(state);
  document.title = titleOf(state) ?? siteTitle;
  // What the line says for a moment (see `flash`) is about the list as it was: a change to the
  // search or the filters ends it, rather than leave "the list below is empty" over a list for
  // five seconds. Not what comes in by itself for the same ones, such as the TLDRs' prose (see
  // `refresh`): that would take "copied" away before it's read.
  if (askTimer && key !== flashedFor) {
    clearTimeout(askTimer);
    askTimer = undefined;
  }
  if (!askTimer) askLine.innerHTML = askLabel(state);
  (document.getElementById("search-note") as HTMLElement).innerHTML = searchNote(state);
}

/** The facets don't depend on the sort, so a preset leaves them as they are. */
function renderFacets() {
  const key = JSON.stringify([
    state.saved,
    state.thumbs,
    state.q,
    state.tags,
    state.repo,
    state.ranges,
    state.show,
    stackExpanded,
  ]);
  if (key === lastFacets) return;
  lastFacets = key;
  (document.getElementById("facets") as HTMLElement).innerHTML = facetsHtml(state, stackExpanded);
  syncTags();
}

/**
 * On narrow screens, the tags are hidden behind their count, a button. It's re-rendered with the
 * facets; what it shows is kept on #filters, which isn't.
 */
let tagsShown = false;
function syncTags() {
  document.getElementById("filters")?.classList.toggle("tags-shown", tagsShown);
  app.querySelector(".tags-toggle")?.setAttribute("aria-expanded", String(tagsShown));
}

/**
 * On narrow screens, the presets and the Saved switch stay in view, and the Filters button opens the
 * rest of the settings' line: the sort, the number filters, Show's buttons.
 */
let filtersShown = false;
function syncFiltersToggle() {
  document.getElementById("settings")?.classList.toggle("shown", filtersShown);
  const button = app.querySelector(".filters-toggle");
  button?.setAttribute("aria-expanded", String(filtersShown));
  if (button) button.textContent = filtersShown ? "Hide filters" : "Filters";
}

/**
 * `whole`: every row at once, rather than the first ones now and the rest in steps. For the page's
 * first render, so that the list is whole by the time the browser puts the page back where it was
 * scrolled to, on a reload or on the way back from a skill's page.
 */
function render(whole = false) {
  busy(true);
  // Its row is about to go.
  hidePreview();
  const focus = focusSelector();
  const focused = document.activeElement;
  if (q.value !== state.q) q.value = state.q;
  syncRanges();
  renderHistograms();
  syncSaved();
  (document.getElementById("presets") as HTMLElement).innerHTML = presetsHtml(state);
  (document.getElementById("sort-group") as HTMLElement).innerHTML = sortHtml(state);
  // A render while the Sort by menu is open, such as once you're logged in, keeps it open.
  if (sortOpen) openSort(true);
  (document.getElementById("show") as HTMLElement).innerHTML = showHtml(state);
  syncFiltersToggle();
  renderFacets();
  renderScope();
  // From deep in the list, a sort or filter would leave you amid the new list's middle: it starts
  // over at the window's top instead. From its column's top, not from its first row, which left
  // its count and the filters' chips just above the window: a tag picked down the list, in a row
  // or among the tags, which stay in view, showed neither how many skills it left nor its chip.
  const count = document.getElementById("count") as HTMLElement;
  const scrolledPast = toTop && count.getBoundingClientRect().top < 0;
  toTop = false;
  const first = whole ? Infinity : FIRST;
  results.innerHTML = resultsHtml(state, first);
  count.innerHTML = countHtml(state);
  // And on the button under the open tags, on a narrow screen: see .tags-done in style.css.
  const tagsDone = document.querySelector("#filters [data-list-count]");
  if (tagsDone) tagsDone.innerHTML = countHtml(state);
  // Only what was replaced: what's still in the page, such as a filter's pill, kept the focus.
  // Given to what its selector finds first, the focus went from the pill of an open filter to the
  // first filter's, which closed the open one's slider: under a finger on its handle, as a finger
  // leaves the focus on the pill it tapped to open it.
  if (focus && !focused?.isConnected) {
    // A filter's chip is gone once it's removed, as Clear filters is with the last of them: the
    // focus goes to the next chip, or else to the count they stood beside, from where Tab leads
    // into the list. Left alone, it would fall back to the top of the page. As it did from the
    // Clear filters of an empty list's message, which the skills that come back take the place of.
    const gone = focus.startsWith("#scope")
      ? (document.querySelector("#scope button") ?? count)
      : focus.startsWith("#results")
        ? count
        : null;
    ((document.querySelector(focus) ?? gone) as HTMLElement | null)?.focus({ preventScroll: true });
  }
  // Last, once the focus is back: a row that gets it is drawn at its own height, which moves what's
  // under it.
  if (scrolledPast) (results.closest(".list-main") ?? results).scrollIntoView({ block: "start" });
  stay();
  const st = state;
  const id = ++renders;
  const append = (from: number) => {
    // A newer render appends its own rows, and says when they're in: so does one on its way.
    if (id !== renders || soon) return;
    if (from >= rowCount(st)) return busy(false);
    results
      .querySelector(".skill-list")
      ?.insertAdjacentHTML("beforeend", rowsHtml(st, from, from + STEP));
    setTimeout(() => append(from + STEP));
  };
  setTimeout(() => append(first), typing ? TYPING_PAUSE : 0);
  typing = false;
}

/** The agent's box: what you need, in your own words. */
const need = document.getElementById("need") as HTMLTextAreaElement;
const askLine = document.getElementById("ask-label") as HTMLElement;
let askTimer: ReturnType<typeof setTimeout> | undefined;
/** The search and filters the line was last said about: see scopeKey. */
let flashedFor = "";
/**
 * Say something under the agent's box for a few seconds, then put its line back; sooner when the
 * search or the filters change meanwhile (see renderScope).
 */
function flash(html: string) {
  askLine.innerHTML = html;
  flashedFor = scopeKey();
  clearTimeout(askTimer);
  askTimer = setTimeout(() => {
    askTimer = undefined;
    askLine.innerHTML = askLabel(state);
  }, 5000);
}

/**
 * Copy the prompt for an agent, and say how big it is: a large catalog can be too much for some
 * agents. The need is what the agent's box holds, or else the search; with neither, the prompt
 * says it comes in the next message.
 */
function ask(from?: HTMLElement) {
  // An empty list, such as when the filters leave nothing, would make a prompt without a catalog.
  if (!askable(state)) return flash("Nothing copied: the list below is empty.");
  const text = need.value.trim() || state.q.trim();
  const prompt = askPrompt(state, text, new URL(href(), location.origin).href);
  // A browser can refuse, or have no clipboard at all, as on a page that isn't served over HTTPS.
  const refused = () => {
    flash("Your browser didn't let the prompt onto your clipboard.");
    sayOn(from, "Not copied: your browser didn't let it onto your clipboard");
  };
  if (!navigator.clipboard) return refused();
  navigator.clipboard.writeText(prompt).then(() => {
    // Not "ready to use with any AI" when it's more than some take: see LARGE_PROMPT in list.ts.
    const tokens = tokensOf(prompt);
    const copied = `Prompt of ${tokensHtml(tokens)} copied to your clipboard`;
    flash(
      tokens >= LARGE_PROMPT
        ? `${copied}.${largeHint(tokens, "Too much for your agent? Narrow the list and copy again.")}`
        : `${copied}, ready to use with any AI.`,
    );
    sayOn(from, "Prompt copied: paste it into your agent");
  }, refused);
}

/**
 * Says it on the link that was clicked too, for as long: the Find with your agent of an empty
 * list's message. The line under the agent's box is a screen above it on a phone, where the link
 * copied without a word.
 */
function sayOn(link: HTMLElement | undefined, words: string) {
  if (!link?.matches("#results .link-button")) return;
  link.dataset.words ??= link.textContent ?? "";
  link.textContent = words;
  setTimeout(() => {
    if (link.textContent === words) link.textContent = link.dataset.words ?? "";
  }, 5000);
}

// Enter asks, as it did when the box was one line; Shift+Enter starts a new line.
need.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  ask();
});

/**
 * With the focus, the agent's box grows with its words, between the heights style.css gives it: the
 * height to fit them is their scrollHeight once the box is at its least.
 */
function fitNeed() {
  need.style.setProperty("--need-height", "0px");
  need.style.setProperty("--need-height", `${need.scrollHeight}px`);
}
need.addEventListener("focus", fitNeed);
need.addEventListener("input", fitNeed);

// A press in the agent's box, but on its words, leaves the focus where it is. Taken off the words,
// as by a press on the button, it would shrink the box, if empty, to one line under the pointer,
// before the click: which would land on whatever is there then. The click focuses the words: see
// focus-need.
need.parentElement!.addEventListener("mousedown", (event) => {
  if (event.target !== need) event.preventDefault();
});

/**
 * And a press outside the box, while it's empty and has the focus, leaves it as tall until the
 * press is over (see .held in style.css). The press takes its focus, which shrank it to one line
 * at once: everything under it moved up 96px before the release, which then landed on something
 * else, so the click did nothing, on a preset, a filter, a tag, the Saved switch, a row. The first
 * click after a look at the box was lost.
 */
document.addEventListener(
  "pointerdown",
  (event) => {
    const field = need.parentElement as HTMLElement;
    if (document.activeElement !== need || need.value || field.contains(event.target as Node))
      return;
    field.classList.add("held");
    const over = () => {
      removeEventListener("pointerup", over, true);
      removeEventListener("pointercancel", over, true);
      // Once the click the release makes is through, which comes right after it.
      setTimeout(() => field.classList.remove("held"));
    };
    addEventListener("pointerup", over, true);
    addEventListener("pointercancel", over, true);
  },
  true,
);

q.addEventListener("input", () => go({ q: q.value }, true));

/**
 * Moves a slider's handle to a stop. The handles can't cross: the range keeps at least a part of a
 * step, so a handle stops short of the other, at the stop before it. The handle shows at its stop
 * at once, rather than where the pointer is until the list's next render: it's a range input of
 * step="any", so that a typed amount can put it between two stops (see rangesHtml).
 */
function toStop(p: Prop, end: 0 | 1, stop: number) {
  const range = state.ranges[p];
  const [lo, hi] = rangePositions(p, range);
  const last = PROPS[p].stops.length - 1;
  const to: Range =
    end === 0
      ? [boundAt(p, 0, Math.max(0, Math.min(stop, Math.ceil(hi) - 1))), range[1]]
      : [range[0], boundAt(p, 1, Math.min(last, Math.max(stop, Math.floor(lo) + 1)))];
  if (to[0] !== range[0] || to[1] !== range[1]) go({ ranges: { ...state.ranges, [p]: to } }, true);
  syncRanges();
}

app.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.dataset.exact) return typed(el);
  const p = el.dataset.range as Prop | undefined;
  if (p) toStop(p, Number(el.dataset.end) as 0 | 1, Math.round(Number(el.value)));
});

// The arrow keys move a handle from stop to stop, which a range input of step="any" doesn't do on
// its own; from between two stops, such as a typed amount's, to the next one.
app.addEventListener("keydown", (event) => {
  const el = event.target as HTMLInputElement;
  const p = el.dataset.range as Prop | undefined;
  const dir = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
  if (!p || !dir) return;
  event.preventDefault();
  const at = Number(el.value);
  toStop(
    p,
    Number(el.dataset.end) as 0 | 1,
    dir > 0 ? Math.floor(at + 1e-9) + 1 : Math.ceil(at - 1e-9) - 1,
  );
});

/**
 * An amount typed in a slider's field: the list follows as it's typed, as it does a search. What
 * isn't an amount, or would put a bound on the wrong side of the other, is said under the fields,
 * and leaves the range as it was.
 */
function typed(field: HTMLInputElement) {
  const p = field.dataset.exact as Prop;
  const end = Number(field.dataset.bound) as 0 | 1;
  const text = field.value.trim();
  let n = text ? (PROPS[p].date ? parseAge(text) : parseCount(text)) : null;
  const wrong = (message: string) => {
    field.setAttribute("aria-invalid", "true");
    sayRangeError(p, message);
  };
  if (text && n === null)
    return wrong(
      PROPS[p].date
        ? "Type an age, such as 45d, 3w or 2w 3d."
        : "Type a number, such as 1500 or 1.5K.",
    );
  // At least 0 is any count.
  if (n === 0 && end === 0) n = null;
  const range: Range = end === 0 ? [n, state.ranges[p][1]] : [state.ranges[p][0], n];
  const error = rangeError(p, range);
  if (error) return wrong(error);
  for (const f of settings.querySelectorAll(`[data-exact="${p}"]`))
    f.removeAttribute("aria-invalid");
  sayRangeError(p, "");
  go({ ranges: { ...state.ranges, [p]: range } }, true);
}

// Once a field is left, or Enter pressed in it, it shows its amount as the others do: "2w 3d" is
// 17d, and what wasn't an amount gives way to the range's own.
app.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement;
  if (!el.dataset.exact) return;
  el.value = fieldText(
    el.dataset.exact as Prop,
    state.ranges[el.dataset.exact as Prop][Number(el.dataset.bound)],
  );
  el.removeAttribute("aria-invalid");
  sayRangeError(el.dataset.exact as Prop, "");
});

/**
 * A click on a slider's track moves the nearer handle there, as on any slider: only the handles
 * take the pointer (see .slider in style.css), so a click beside them did nothing. Only a click
 * that also began on the track: a handle dragged against the other and let go further on ends in
 * a click on the track too, which would move the other handle.
 */
let pressedTrack: EventTarget | null = null;
app.addEventListener("pointerdown", (event) => {
  pressedTrack = (event.target as Element).matches("[data-slider]") ? event.target : null;
});
app.addEventListener("click", (event) => {
  const slider = event.target as HTMLElement;
  const p = slider.dataset.slider as Prop | undefined;
  if (!p || pressedTrack !== slider) return;
  const last = PROPS[p].stops.length - 1;
  // The track is inset by half a handle at either end: see --thumb in style.css.
  const thumb = Number.parseFloat(getComputedStyle(slider).getPropertyValue("--thumb")) || 0;
  const box = slider.getBoundingClientRect();
  const at = (event.clientX - box.left - thumb / 2) / (box.width - thumb);
  const stop = Math.max(0, Math.min(last, Math.round(at * last)));
  const [lo, hi] = rangePositions(p, state.ranges[p]);
  const end = stop <= lo ? 0 : stop >= hi ? 1 : stop - lo <= hi - stop ? 0 : 1;
  // As when a handle is dragged.
  toStop(p, end, stop);
  // The arrow keys go on from there.
  slider.querySelector<HTMLElement>(`input[data-end="${end}"]`)?.focus();
});

app.addEventListener("click", (event) => {
  const el = (event.target as Element).closest<HTMLElement>(
    "[data-tag],[data-action],[data-remove],[data-preset],[data-show],[data-order],[data-sort]",
  );
  if (!el || el.tagName === "A") return;
  const d = el.dataset;
  if (d.sort) return chooseSort(el);
  // A pressed button shows it right away; the list follows after the next paint.
  if (d.preset) {
    for (const b of settings.querySelectorAll("[data-preset]"))
      b.setAttribute("aria-pressed", String(b === el));
    go(presetPatch(d.preset as Preset));
  } else if (d.order) {
    if ((d.order === "asc") === state.asc) return;
    for (const b of settings.querySelectorAll("[data-order]"))
      b.setAttribute("aria-pressed", String(b === el));
    go({ asc: d.order === "asc" });
  } else if (d.show) {
    for (const b of settings.querySelectorAll("[data-show]"))
      b.setAttribute("aria-pressed", String(b === el));
    go({ show: d.show as Show });
  } else if (d.tag) {
    if (el.hasAttribute("aria-pressed"))
      el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
    // As the focus: a facet's chip stays the facet's, and a found one becomes it.
    noteClicked(
      el,
      `#${el.closest("#skill-tags") ? "skill-tags" : "facets"} [data-tag="${CSS.escape(d.tag)}"]`,
    );
    // A tag the search found takes the search's place: see foundTags in list.ts.
    const replaces = "replacesSearch" in d && !state.tags.includes(d.tag);
    go({ tags: toggleTag(state.tags, d.tag), ...(replaces ? { q: "" } : {}) });
  } else if (d.remove) {
    const v = d.value ?? "";
    if (d.remove === "saved") go({ saved: false });
    else if (d.remove === "thumbs") go({ thumbs: null });
    else if (d.remove === "tag") go({ tags: state.tags.filter((t) => t !== v) });
    else if (d.remove === "repo") go({ repo: null });
    else if (d.remove === "range") go({ ranges: { ...state.ranges, [v]: fullRange() } });
  } else if (d.action === "clear")
    go({ saved: false, thumbs: null, tags: [], repo: null, ranges: fullRanges() });
  else if (d.action === "ask") ask(el);
  else if (d.action === "focus-search") q.focus();
  else if (d.action === "focus-need") need.focus();
  else if (d.action === "range") openRange(open === d.value ? null : (d.value as Prop));
  else if (d.action === "sort-menu") openSort(!sortOpen, "option");
  else if (d.action === "saved") {
    // It slides at once; the list follows after the next paint.
    savedSwitch.setAttribute("aria-checked", String(!state.saved));
    go({ saved: !state.saved });
  } else if (d.action === "thumbs") {
    // One or neither: a second click shows everything again. Its icons cross-fade at once.
    const on = state.thumbs === d.value ? null : (d.value as Reaction);
    for (const b of thumbsFilter) b.dataset.toggled = "";
    syncThumbs(on);
    go({ thumbs: on });
  } else if (d.action === "stack") {
    noteClicked(el, '#facets [data-action="stack"]');
    stackExpanded = !stackExpanded;
    renderSoon();
  } else if (d.action === "tags") {
    tagsShown = !tagsShown;
    syncTags();
    // They open under their button, which is low on a phone's first screen: under it, the bar that
    // leads to the list covered what little of them was in view, and no tag showed. The button
    // goes to the screen's top, the tags under it. It was replaced with the facets: the one there.
    if (tagsShown) app.querySelector(".tags-toggle")?.scrollIntoView({ block: "start" });
  } else if (d.action === "tags-done") {
    // From the open tags, on a narrow screen, to the list they leave, which is under them all: the
    // tags close, and the list's count, which says how many it has, takes the screen's top and the
    // focus.
    tagsShown = false;
    syncTags();
    const count = document.getElementById("count") as HTMLElement;
    count.scrollIntoView({ block: "start" });
    count.focus({ preventScroll: true });
  } else if (d.action === "filters") {
    filtersShown = !filtersShown;
    syncFiltersToggle();
  }
});

/**
 * Once the API says what you saved and gave a thumb, the list of what's yours follows. A click on a
 * Save button or a thumb only changes the button: unsaving leaves the row in the list, where a
 * second click saves it back.
 */
document.addEventListener(ACCOUNT_EVENT, (event) => {
  const yours = state.saved || state.thumbs !== null;
  if (yours && (event as CustomEvent<AccountChange>).detail === "load") refresh();
});

// What was typed in the search before this script ran, on a slow connection, is searched for:
// list.ts's inline script marked the box.
if ("typed" in q.dataset && q.value !== state.q) {
  state = patched(state, { q: q.value });
  history.replaceState(null, "", query(state) || location.pathname);
}
// The page was pre-rendered unfiltered, and hidden until now if its link asks for another list, or
// if it's returned to, to be put back where it was.
if (location.search) render(true);
// Shown from here, before the preview is put back, which takes the keyboard's focus when it had it:
// what's hidden can't, so after a reload the sheet was back and Space scrolled the list under it.
delete document.documentElement.dataset.pending;
// A Save in a row's preview, logged out, logs in on the way: back with the preview, now saved.
const left = (history.state as Left | null)?.at ? (history.state as Left) : leftToLogIn();
if (left?.at) backTo(left.at);
if (left?.preview) previewAgain(left.preview);

// The TLDRs' prose, which only the search and the rows' previews read, is half the data, so it
// loads after the page. Until it's in, a search finds fewer skills; once it is, a search under way
// shows them too.
void import("../data/skills.jsonc?prose").then(
  ({ default: prose }) => {
    addSearchWords(searchWords(prose));
    setPreviewProse(prose);
    // For whoever drives the page: from now on, a search finds what it will always find. See ready.ts.
    document.documentElement.setAttribute("data-search-words", "");
    if (state.q.trim()) refresh();
  },
  () =>
    notice(
      "Some search data didn't load, so results may be incomplete. Reload the page to try again.",
      "search-data",
    ),
);
