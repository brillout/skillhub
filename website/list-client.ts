/** The skills list's settings and filters: re-render the list whenever they change, and keep them in the URL. */

import {
  PRESETS,
  addSearchWords,
  PROPS,
  facetsHtml,
  fullRange,
  isNarrowed,
  rangeLabel,
  parse,
  askPrompt,
  countHtml,
  isListed,
  tokensHtml,
  fullRanges,
  patched,
  sinceRange,
  query,
  resultsHtml,
  askLabel,
  scopeHtml,
  searchNote,
  rowCount,
  rowsHtml,
  settingsHtml,
  showHtml,
  toggleTag,
  type Preset,
  type Prop,
  type Range,
  type Show,
  type Sort,
  type State,
} from "./list.ts";
import { href } from "./format.ts";
import { ACCOUNT_EVENT, type AccountChange } from "./account-client.ts";
import { account, savedCount } from "./saves.ts";

// The Saved switch counts only what's still listed, as the list does; account-client.ts may have
// counted before this script ran.
account.listed = isListed;
for (const n of document.querySelectorAll("[data-saved-count]")) n.textContent = savedCount();

const app = document.getElementById("app") as HTMLElement;
const q = document.getElementById("q") as HTMLInputElement;
let state = parse(location.search);
let stackExpanded = false;

/** Whether the next render should bring the top of the list into view: see `go`. */
let toTop = false;

function go(patch: Partial<State>) {
  state = patched(state, patch);
  history.replaceState(null, "", query(state) || location.pathname);
  // A new order or new filters start the list over, except while typing a search, which happens
  // at the top anyway.
  if (Object.keys(patch).some((k) => k !== "q")) toTop = true;
  renderSoon();
}

let soon = false;
/**
 * Render after the next paint, once for however many changes come before it, so that the control
 * just used shows its new state without waiting for the list.
 */
function renderSoon() {
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
  for (const attr of [
    "data-tag",
    "data-action",
    "data-remove",
    "data-preset",
    "data-show",
    "data-save",
  ]) {
    const v = el.getAttribute(attr);
    if (v !== null)
      return `#${["facets", "settings", "show", "scope"].find((id) => el.closest(`#${id}`)) ?? "results"} [${attr}="${CSS.escape(v)}"]`;
  }
  return el.id ? `#${CSS.escape(el.id)}` : null;
}

/** The range whose slider's popover is open, if any: one at a time. */
let open: Prop | null = null;
function openRange(p: Prop | null) {
  open = p;
  for (const range of app.querySelectorAll<HTMLElement>("[data-range-section]")) {
    const on = range.dataset.rangeSection === p;
    range.querySelector(".range-pop")?.toggleAttribute("hidden", !on);
    range.querySelector(".range-pill")?.setAttribute("aria-expanded", String(on));
  }
}

// A click elsewhere closes the popover; so does Escape, which puts the focus back on its pill.
document.addEventListener("click", (event) => {
  if (open && !(event.target as Element).closest(`[data-range-section="${open}"]`)) openRange(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !open) return;
  const range = app.querySelector(`[data-range-section="${open}"]`);
  const inside = range?.contains(document.activeElement);
  openRange(null);
  if (inside) range?.querySelector<HTMLElement>(".range-pill")?.focus();
});

/** The Saved switch isn't re-rendered, so that it can slide: it follows the state instead. */
const savedSwitch = document.getElementById("saved-switch") as HTMLElement;
const syncSaved = () => savedSwitch.setAttribute("aria-checked", String(state.saved));

/** The sliders aren't re-rendered, so that one can be dragged while the list updates; they follow the state instead. */
function syncRanges() {
  for (const p of Object.keys(PROPS) as Prop[]) {
    const range = state.ranges[p];
    const slider = app.querySelector<HTMLElement>(`[data-slider="${p}"]`);
    if (!slider) continue;
    const last = PROPS[p].stops.length - 1;
    slider.style.setProperty("--lo", String(range[0] / last));
    slider.style.setProperty("--hi", String(range[1] / last));
    for (const input of slider.querySelectorAll<HTMLInputElement>("input")) {
      input.value = String(range[Number(input.dataset.end)]);
      input.setAttribute("aria-valuetext", rangeLabel(p, range));
    }
    for (const label of app.querySelectorAll(`[data-range-label="${p}"]`))
      label.textContent = rangeLabel(p, range);
    app
      .querySelector(`[data-range-section="${p}"]`)
      ?.classList.toggle("narrowed", isNarrowed(p, range));
  }
}

/** Rows rendered right away; the rest follow STEP at a time, so a change shows without waiting for the whole list. */
const FIRST = 40;
const STEP = 150;
/** Counts renders, so that rows still on their way for an older one are dropped. */
let renders = 0;
/** What the facets were last rendered for: the pre-rendered page's are for no filters. */
let lastFacets = "";
/** What the scope line and the search box's placeholder were last rendered for, since they don't depend on the search; "" for the pre-rendered page's. */
let lastScope = "";

function renderScope() {
  const key = JSON.stringify([state.saved, state.tags, state.repo, state.ranges, state.show]);
  if (key === lastScope) return;
  lastScope = key;
  (document.getElementById("scope") as HTMLElement).innerHTML = scopeHtml(state);
  if (!askTimer) askLine.innerHTML = askLabel(state);
  (document.getElementById("search-note") as HTMLElement).innerHTML = searchNote(state);
}

/** The facets don't depend on the sort, so a preset leaves them as they are. */
function renderFacets() {
  const key = JSON.stringify([
    state.saved,
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
}

/** On narrow screens, the presets stay in view and the Filters button opens the rest. */
let filtersShown = false;
function syncFiltersToggle() {
  document.getElementById("filters")?.classList.toggle("shown", filtersShown);
  const button = app.querySelector(".filters-toggle");
  button?.setAttribute("aria-expanded", String(filtersShown));
  if (button) button.textContent = filtersShown ? "Hide filters" : "Filters";
}

function render() {
  const focus = focusSelector();
  if (q.value !== state.q) q.value = state.q;
  syncRanges();
  syncSaved();
  (document.getElementById("settings") as HTMLElement).innerHTML = settingsHtml(state);
  (document.getElementById("show") as HTMLElement).innerHTML = showHtml(state);
  syncFiltersToggle();
  renderFacets();
  renderScope();
  const results = document.getElementById("results") as HTMLElement;
  // From deep in the list, a preset, sort or filter would leave you amid the new list's middle.
  const scrolledPast = toTop && results.getBoundingClientRect().top < 0;
  toTop = false;
  results.innerHTML = resultsHtml(state, FIRST);
  (document.getElementById("count") as HTMLElement).innerHTML = countHtml(state);
  if (scrolledPast) results.scrollIntoView({ block: "start" });
  if (focus) (document.querySelector(focus) as HTMLElement | null)?.focus({ preventScroll: true });
  const st = state;
  const id = ++renders;
  const append = (from: number) => {
    if (id !== renders || from >= rowCount(st)) return;
    results
      .querySelector(".skill-list")
      ?.insertAdjacentHTML("beforeend", rowsHtml(st, from, from + STEP));
    setTimeout(() => append(from + STEP));
  };
  setTimeout(() => append(FIRST));
}

/** The agent's box: what you need, in your own words. */
const need = document.getElementById("need") as HTMLInputElement;
const askLine = document.getElementById("ask-label") as HTMLElement;
let askTimer: ReturnType<typeof setTimeout> | undefined;
/** Say something under the agent's box for a few seconds, then put its line back. */
function flash(html: string) {
  askLine.innerHTML = html;
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
function ask() {
  const text = need.value.trim() || state.q.trim();
  const prompt = askPrompt({ ...state, q: text }, new URL(href(), location.origin).href);
  navigator.clipboard
    ?.writeText(prompt)
    .then(() =>
      flash(
        `Copied to your clipboard (${tokensHtml(Math.round(prompt.length / 4))}): paste it into any chat agent.`,
      ),
    );
}

need.addEventListener("keydown", (event) => {
  if (event.key === "Enter") ask();
});

q.addEventListener("input", () => go({ q: q.value }));

app.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  const p = el.dataset.range as Prop | undefined;
  if (!p) return;
  // The handles can't cross: the range keeps at least one step.
  const [lo, hi] = state.ranges[p];
  const v = Number(el.value);
  const range: Range =
    el.dataset.end === "0" ? [Math.min(v, hi - 1), hi] : [lo, Math.max(v, lo + 1)];
  go({ ranges: { ...state.ranges, [p]: range } });
});

app.addEventListener("click", (event) => {
  const el = (event.target as Element).closest<HTMLElement>(
    "[data-tag],[data-action],[data-remove],[data-preset],[data-show]",
  );
  if (!el || el.tagName === "A") return;
  const d = el.dataset;
  // A pressed button shows it right away; the list follows after the next paint.
  if (d.preset) {
    for (const b of app.querySelectorAll("[data-preset]"))
      b.setAttribute("aria-pressed", String(b === el));
    const { sort, since } = PRESETS[d.preset as Preset];
    go({ sort, asc: false, ranges: { ...state.ranges, published: sinceRange(since) } });
  } else if (d.show) {
    for (const b of app.querySelectorAll("[data-show]"))
      b.setAttribute("aria-pressed", String(b === el));
    go({ show: d.show as Show });
  } else if (d.tag) {
    if (el.hasAttribute("aria-pressed"))
      el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
    go({ tags: toggleTag(state.tags, d.tag) });
  } else if (d.remove) {
    const v = d.value ?? "";
    if (d.remove === "saved") go({ saved: false });
    else if (d.remove === "tag") go({ tags: state.tags.filter((t) => t !== v) });
    else if (d.remove === "repo") go({ repo: null });
    else if (d.remove === "range") go({ ranges: { ...state.ranges, [v]: fullRange(v as Prop) } });
  } else if (d.action === "clear") go({ saved: false, tags: [], repo: null, ranges: fullRanges() });
  else if (d.action === "ask") ask();
  else if (d.action === "focus-search") q.focus();
  else if (d.action === "focus-need") need.focus();
  else if (d.action === "order") go({ asc: !state.asc });
  else if (d.action === "range") openRange(open === d.value ? null : (d.value as Prop));
  else if (d.action === "saved") {
    // It slides at once; the list follows after the next paint.
    savedSwitch.setAttribute("aria-checked", String(!state.saved));
    go({ saved: !state.saved });
  } else if (d.action === "stack") {
    stackExpanded = !stackExpanded;
    renderSoon();
  } else if (d.action === "filters") {
    filtersShown = !filtersShown;
    syncFiltersToggle();
  }
});

app.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "sort") go({ sort: el.value as Sort });
});

/**
 * Once the API says what you saved, the list of what you saved follows. A click on a Save button
 * only changes the button: unsaving leaves the row in the list, where a second click saves it back.
 */
document.addEventListener(ACCOUNT_EVENT, (event) => {
  if (!state.saved || (event as CustomEvent<AccountChange>).detail !== "load") return;
  // What's saved is in no key of the renders' caches: a new state misses them all.
  state = { ...state };
  lastFacets = "";
  lastScope = "";
  renderSoon();
});

// The page was pre-rendered unfiltered.
if (location.search) render();

// The TLDRs' prose, which only the search reads, is half the data, so it loads after the page.
// Until it's in, a search finds fewer skills; once it is, a search under way shows them too.
void import("../data/skills.jsonc?search-words").then(({ default: words }) => {
  addSearchWords(words);
  if (!state.q) return;
  lastFacets = "";
  renderSoon();
});
