/**
 * The skills list: its filters, which live in the URL query so every filtered list can be shared
 * as a link, and its HTML. The page is pre-rendered unfiltered; its client script re-renders it.
 */

import { compact, date, esc, href, plural } from "./format.ts";
import {
  CAUTION,
  FACET_ORDER,
  bundleHref,
  bundleOf,
  data,
  facetById,
  facetOf,
  firstSeenOf,
  idPath,
  includedBy,
  glanceHtml,
  installsOf,
  isBundle,
  nameOf,
  ownEntry,
  parentsOf,
  repoById,
  repoKey,
  growthOf,
  GROWTH_MIN,
  GROWTH_WEEKS,
  skillById,
  skillHref,
  skillsOf,
  starsOf,
  tagChip,
  tagInfo,
  tagLabel,
  tagOf,
  tagsOf,
  weekOf,
} from "./skills.ts";
// The browser's copy of the data, which leaves some fields out: see client-data.ts.
import {
  searchWords,
  type ClientBundle as Bundle,
  type ClientSkill as Skill,
  type SearchWords,
} from "./client-data.ts";
import { account, loginHref, saveButton, saveKey } from "./saves.ts";

/** A row of the skills list: a skill, or a bundle with its skills inside. */
type Entry = Skill | Bundle;

/** Tags the list's rows leave to the skill's page: ones that hold for most skills, and categories, which the filters already show. */
const quiet = (tag: string) => tag === "by:community" || facetOf(tag) === "category";

// ------------------------------------------------------------------- state

/**
 * Buttons that only set the list's settings, highest first, each named after what it shows, which
 * the sidebar spells out: Rising, the default view, by how fast the weekly downloads grow; Rising &
 * new by weekly downloads among the skills published in the last NEW_SINCE days (a skill that young
 * has no growth yet, see growthOf); Top by weekly downloads; New by publishing date.
 */
export type Preset = "rising" | "rising-new" | "top" | "new";
interface PresetInfo {
  label: string;
  sort: Sort;
  /** The Published range it sets: the last so many days, or any date. */
  since: Age | null;
  title: string;
}
/** How recent Rising & new's skills are, in days. */
const NEW_SINCE = 90;
export const PRESETS: Record<Preset, PresetInfo> = {
  rising: {
    label: "Rising",
    sort: "growth",
    since: null,
    title: "Downloads growing the fastest",
  },
  "rising-new": {
    label: "Rising & new",
    sort: "week",
    since: NEW_SINCE,
    title: `The most downloaded this week of those published in the last ${NEW_SINCE} days`,
  },
  top: { label: "Top", sort: "week", since: null, title: "Most downloaded this week" },
  new: {
    label: "New",
    sort: "published",
    since: null,
    title: "Most recently published",
  },
};

/** The numbers every row shows, which the list sorts by and the sliders filter on. */
export type Prop = "published" | "stars" | "downloads" | "week";
type Value = number | string;
interface PropInfo {
  label: string;
  /** The entry's value, or null when unknown. Dates are YYYY-MM-DD. */
  of: (e: Entry) => Value | null;
  /** Where the value comes from, for its tooltip. */
  title: (e: Entry) => string;
  /** The slider's stops, lowest first. The last one is above every value, so the full range includes them all. */
  stops: Value[];
  /** How the URL names each stop, when not by its value. */
  keys?: string[];
  /** Its values are dates, and its stops ages: see AGES. */
  date?: boolean;
}

/** 0, 10, 20, 50, 100… up past the largest value. */
function countStops(of: (s: Skill) => number | null): number[] {
  const max = Math.max(0, ...data.skills.map(of).filter((n) => n !== null));
  const stops = [0];
  for (let p = 10; stops[stops.length - 1] <= max; p *= 10) stops.push(p, 2 * p, 5 * p);
  return stops.slice(0, stops.findIndex((n) => n > max) + 1);
}
/**
 * The Published slider's inner stops, oldest first, in days before the data's date: its range is
 * relative, such as the last 30 days, so a link keeps its meaning as the data moves on. The URL
 * names them such as 30d.
 */
const AGES = [365, 90, 30, 7] as const;
type Age = (typeof AGES)[number];
const AGO: Record<Age, string> = { 365: "a year", 90: "90 days", 30: "30 days", 7: "a week" };
const LAST: Record<Age, string> = {
  365: "Last year",
  90: "Last 90 days",
  30: "Last 30 days",
  7: "Last week",
};
const daysBefore = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// A bundle's numbers are its most popular skill's.
const most = (e: Entry) => (isBundle(e) ? "The most of any of its skills: " : "");
export const PROPS: Record<Prop, PropInfo> = {
  published: {
    label: "Published",
    of: firstSeenOf,
    title: (e) =>
      isBundle(e) ? "When skills.sh first saw one of its skills" : "When skills.sh first saw it",
    // Below and above every date, so that the full range takes them all in.
    stops: ["", ...AGES.map((n) => daysBefore(data.asOf.installs, n)), "~"],
    keys: ["", ...AGES.map((n) => `${n}d`), "~"],
    date: true,
  },
  stars: {
    label: "Stars",
    of: starsOf,
    title: (e) => `GitHub stars of ${repoKey(e)}, ${date(data.asOf.stars)}`,
    stops: countStops(starsOf),
  },
  downloads: {
    label: "Total Downloads",
    of: installsOf,
    title: (e) => `${most(e)}All-time installs on skills.sh, ${date(data.asOf.installs)}`,
    stops: countStops(installsOf),
  },
  week: {
    label: "Weekly Downloads",
    of: weekOf,
    title: (e) => `${most(e)}Installs on skills.sh in the week to ${date(data.asOf.installs)}`,
    stops: countStops(weekOf),
  },
};
const PROP_IDS = Object.keys(PROPS) as Prop[];
const lastStop = (p: Prop) => PROPS[p].stops.length - 1;

/** A slider's range, as indexes into its stops: `lo` included, `hi` excluded. */
export type Range = [lo: number, hi: number];
export const fullRange = (p: Prop): Range => [0, lastStop(p)];
export const fullRanges = () =>
  Object.fromEntries(PROP_IDS.map((p) => [p, fullRange(p)])) as Record<Prop, Range>;
export const isNarrowed = (p: Prop, [lo, hi]: Range) => lo > 0 || hi < lastStop(p);

/** How the URL names a slider's stop. */
const stopKey = (p: Prop, i: number) => PROPS[p].keys?.[i] ?? String(PROPS[p].stops[i]);

/** A slider's range in words, such as "≥ 1K", "Last 30 days" or "30 days to a year ago". */
export function rangeLabel(p: Prop, [lo, hi]: Range): string {
  const { stops, date } = PROPS[p];
  if (date) {
    // A date at or after `lo`'s is within that age; one before `hi`'s is older than it.
    const within = lo > 0 ? AGES[lo - 1] : null;
    const older = hi < lastStop(p) ? AGES[hi - 1] : null;
    if (within && older) {
      const young = AGO[older];
      return `${young[0].toUpperCase()}${young.slice(1)} to ${AGO[within]} ago`;
    }
    return within ? LAST[within] : older ? `Over ${AGO[older]} ago` : "Any";
  }
  const from = lo > 0 ? compact(stops[lo] as number) : null;
  const to = hi < lastStop(p) ? compact(stops[hi] as number) : null;
  return from && to ? `${from} – ${to}` : from ? `≥ ${from}` : to ? `< ${to}` : "Any";
}

/**
 * A number to sort by; "growth", how fast the weekly downloads grow (a sort only: it can be
 * negative or infinite, so it gets no slider); or "match", how well the entry matches the search,
 * for when there is one.
 */
export type Sort = Prop | "growth" | "match";
const GROWTH = {
  label: "Weekly Growth",
  title: (e: Entry) =>
    `${isBundle(e) ? "The most of any of its skills: " : ""}Installs on skills.sh in an average week of the 2 to ${date(data.asOf.installs)}, against an average week of the 4 before. Only for skills with at least ${compact(GROWTH_MIN)} a week, and installs in each of the last ${GROWTH_WEEKS} weeks: a younger skill shows under New.`,
};
/** A growth as a percentage with its sign, such as +180% or −12%. */
const percent = (g: number) =>
  `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.round(Math.abs(g) * 100).toLocaleString("en")}%`;
/** A search sorts by best match unless another sort is picked; otherwise the list is Rising, by growth. */
export const defaultSort = (q: string): Sort => (q ? "match" : "growth");
/** The Published range for the last `since` days, or any date. */
export const sinceRange = (since: Age | null): Range =>
  since
    ? [PROPS.published.keys?.indexOf(`${since}d`) ?? 0, lastStop("published")]
    : fullRange("published");
const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];
export interface State {
  q: string;
  tags: string[];
  repo: string | null;
  sort: Sort;
  /** Lowest (or oldest) first, instead of highest first. */
  asc: boolean;
  ranges: Record<Prop, Range>;
  show: Show;
  /** Only what the logged-in person saved: the header's Saved link. */
  saved: boolean;
}

/**
 * What the list shows: bundles and the skills worth installing alone ("all"), every skill, those
 * only listed inside their bundle included ("skills"), or only bundles. Not a preset's business.
 */
export type Show = "all" | "skills" | "bundles";
export const SHOWS: [Show, string][] = [
  ["all", "Skills & bundles"],
  ["skills", "Skills"],
  ["bundles", "Bundles"],
];

export function parse(search: string): State {
  const p = new URLSearchParams(search);
  const sort = p.get("sort") as Sort | null;
  const q = p.get("q") ?? "";
  const ranges = fullRanges();
  for (const prop of PROP_IDS) {
    // Such as stars=1000..50000, published=30d.. with no upper bound, or published=.. for any.
    const param = p.get(prop);
    if (param === null) continue;
    ranges[prop] = fullRange(prop);
    const [lo, hi] = param.split("..");
    const keys = PROPS[prop].stops.map((_, i) => stopKey(prop, i));
    if (lo && keys.includes(lo)) ranges[prop][0] = keys.indexOf(lo);
    if (hi && keys.includes(hi) && keys.indexOf(hi) > ranges[prop][0])
      ranges[prop][1] = keys.indexOf(hi);
  }
  return {
    q,
    tags: p.getAll("tag"),
    repo: p.get("repo"),
    sort:
      sort && (sort in PROPS || sort === "growth" || (sort === "match" && q))
        ? sort
        : defaultSort(q),
    asc: p.get("order") === "asc",
    ranges,
    show: (["skills", "bundles"] as const).find((v) => v === p.get("show")) ?? "all",
    saved: p.has("saved"),
  };
}
/** The query string for a state, empty for the default view. */
export function query(s: State): string {
  const p = new URLSearchParams();
  if (s.saved) p.set("saved", "");
  if (s.q) p.set("q", s.q);
  for (const t of s.tags) p.append("tag", t);
  if (s.repo) p.set("repo", s.repo);
  if (s.sort !== defaultSort(s.q)) p.set("sort", s.sort);
  if (s.asc) p.set("order", "asc");
  for (const prop of PROP_IDS) {
    const [lo, hi] = s.ranges[prop];
    if (isNarrowed(prop, [lo, hi]))
      p.set(
        prop,
        `${lo > 0 ? stopKey(prop, lo) : ""}..${hi < lastStop(prop) ? stopKey(prop, hi) : ""}`,
      );
  }
  if (s.show !== "all") p.set("show", s.show);
  // ?saved rather than ?saved=
  const q = p.toString().replace(/^saved=(&|$)/, "saved$1");
  return q ? `?${q}` : "";
}
/** The default view: Rising. */
export const fresh = (): State => parse("");
/**
 * `prev` with `patch` applied. The sort, while at its default, follows the default for the new
 * search: best match while there is one.
 */
export function patched(prev: State, patch: Partial<State>): State {
  const next = { ...prev, ...patch };
  if (!("sort" in patch) && prev.sort === defaultSort(prev.q)) next.sort = defaultSort(next.q);
  if (next.sort === "match" && !next.q) next.sort = defaultSort("");
  return next;
}
/**
 * Select or unselect a tag. Selecting one unselects its parents and the tags it includes, since
 * either would only repeat or widen it: picking Design under Software engineering narrows the list
 * to design, and picking Software engineering again widens it back.
 */
export function toggleTag(tags: string[], tag: string): string[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  const related = [...parentsOf(tag), ...includedBy(tag)];
  return [...tags.filter((t) => !related.includes(t)), tag];
}

/** A link to the skills list filtered to the given state changes. */
export const skillsLink = (patch: Partial<State>) => href() + query({ ...fresh(), ...patch });

// ------------------------------------------------------------------- filtering

/**
 * The words of the TLDRs' prose, which only the search reads. The server has the prose in the
 * data. The client's copy leaves it out: list-client.ts loads the words after the page and hands
 * them to addSearchWords, and until then the search goes without them. See client-data.ts.
 */
let prose = searchWords(data);

/** What the search looks in, and with what weight it ranks: see `index`. */
let searchText = new Map<string, string>();
let bundleText = new Map<string, string>();
let skillFields = new Map<string, Fields>();
let bundleFields = new Map<string, Fields>();

/** Adds the TLDRs' words to what the search looks in. */
export function addSearchWords(words: SearchWords) {
  prose = words;
  index();
  last = undefined;
}

/** The search's words, plurals cut back so they match the singular too: "resumes" finds "resume", "strategies" finds "strategy". */
const words = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w,
    );
const matches = (text: string, q: string) => words(q).every((word) => text.includes(word));

/**
 * For sorting a search by best match: each word of it scores where it appears, a name the most,
 * then the description, the TLDR's glance and the tags, the repo, and last the TLDR's text and the
 * note. A name holding the whole search scores extra.
 */
type Fields = [text: string, weight: number][];
const fields = (parts: [string | null | undefined, number][]): Fields =>
  parts.filter((p): p is [string, number] => Boolean(p[0])).map(([t, w]) => [t.toLowerCase(), w]);
function index() {
  searchText = new Map(
    data.skills.map((s) => [
      s.id,
      [
        s.name,
        s.agentReview.description,
        ...(s.agentReview.tldr?.glance.map((g) => g.text) ?? []),
        prose.skills[s.id],
        repoKey(s),
        s.agentReview.note,
        ...tagsOf(s),
        ...tagsOf(s).map(tagLabel),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    ]),
  );
  bundleText = new Map(
    data.bundles.map((b) => [
      b.id,
      [
        b.agentReview.name,
        b.agentReview.description,
        ...(b.agentReview.tldr?.glance.map((g) => g.text) ?? []),
        prose.bundles[b.id],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    ]),
  );
  skillFields = new Map(
    data.skills.map((s) => [
      s.id,
      fields([
        [s.name, 8],
        [s.agentReview.description, 4],
        [s.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
        [[...tagsOf(s), ...tagsOf(s).map(tagLabel)].filter(Boolean).join(" "), 3],
        [repoKey(s), 2],
        [prose.skills[s.id], 1],
        [s.agentReview.note, 1],
      ]),
    ]),
  );
  bundleFields = new Map(
    data.bundles.map((b) => [
      b.id,
      fields([
        [b.agentReview.name, 8],
        [b.agentReview.description, 4],
        [b.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
        [repoKey(b), 2],
        [prose.bundles[b.id], 1],
      ]),
    ]),
  );
}
index();

/** A word counts in full where it starts a word, and a quarter inside one, such as "cad" in "academic". */
function score(f: Fields, q: string): number {
  const ws = words(q).map((w) => ({
    w,
    start: new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"),
  }));
  const name = f[0]?.[1] === 8 ? f[0][0] : "";
  const phrase = q.trim().toLowerCase();
  return (
    ws.reduce(
      (n, { w, start }) =>
        n + Math.max(0, ...f.map(([t, wt]) => (start.test(t) ? wt : t.includes(w) ? wt / 4 : 0))),
      0,
    ) + (phrase && name.includes(phrase) ? 4 : 0)
  );
}
/** A bundle matches as well as itself or its best matching skill. */
const matchScore = (e: Entry, q: string): number =>
  isBundle(e)
    ? Math.max(
        score(bundleFields.get(e.id) ?? [], q),
        ...skillsOf(e).map((s) => score(skillFields.get(s.id) ?? [], q)),
      )
    : score(skillFields.get(e.id) ?? [], q);

/** Within a facet a skill needs any selected value; across facets it needs all of them. `skip` leaves one facet out, for its counts. */
function passes(s: Skill, st: State, skip: string | null = null): boolean {
  if (st.repo && repoKey(s) !== st.repo) return false;
  if (st.saved && !account.saved.has(saveKey("skill", s.id))) return false;
  // A skill listed only inside its bundle is in the sliders' ranges when its bundle is, unless
  // the list shows it on its own.
  const listedIn = !listsAlone(s, st) ? bundleOf.get(s.id)?.bundle : undefined;
  if (!inRanges(listedIn ?? s, st)) return false;
  const selected = new Map<string, string[]>();
  for (const t of st.tags) selected.set(facetOf(t), [...(selected.get(facetOf(t)) ?? []), t]);
  for (const [facet, tags] of selected)
    if (facet !== skip && !tags.some((t) => tagsOf(s).includes(t))) return false;
  return !st.q || matches(searchText.get(s.id) ?? "", st.q);
}

/**
 * Whether the entry's numbers are within the sliders' ranges. A bundle's are its own, the ones its
 * row shows (its oldest skill's date, its most downloaded skill's downloads), so that a bundle
 * whose oldest skill is a year old isn't in "Published: last 90 days" for its newest skills.
 */
function inRanges(e: Entry, st: State): boolean {
  for (const p of PROP_IDS) {
    const [lo, hi] = st.ranges[p];
    if (!isNarrowed(p, [lo, hi])) continue;
    const v = PROPS[p].of(e);
    if (v === null || v < PROPS[p].stops[lo] || v >= PROPS[p].stops[hi]) return false;
  }
  return true;
}

/**
 * Whether the list shows the skill on its own row. With bundles, a skill that only works inside its
 * bundle is only listed in it; but what you saved is listed, whatever it is.
 */
const listsAlone = (s: Skill, st: State) => st.show === "skills" || st.saved || ownEntry(s);

/**
 * The filters about a bundle's skills: tags and the search. The sliders' ranges, and whether it's
 * saved, are about the bundle itself.
 */
const skillFilters = (st: State): State => ({ ...st, ranges: fullRanges(), saved: false });
/** Whether the bundle is saved, when the list shows only what's saved. */
const savedBundle = (b: Bundle, st: State) =>
  !st.saved || account.saved.has(saveKey("bundle", b.id));

/**
 * The skills through which a bundle matches the tags and search: those that match them, or, when
 * the search matches the bundle itself, those that match the tags. `skip` leaves a facet out.
 */
function matchedThrough(b: Bundle, st: State, skip: string | null = null): Skill[] {
  const rest = skillFilters(st);
  const skills = skillsOf(b);
  const hits = skills.filter((s) => passes(s, rest, skip));
  if (hits.length || !st.q || !matches(bundleText.get(b.id) ?? "", st.q)) return hits;
  return skills.filter((s) => passes(s, { ...rest, q: "" }, skip));
}

/** A bundle is in its sliders' ranges by its own numbers, and matches the tags and search through any of its skills. */
const bundlePasses = (b: Bundle, st: State, skip: string | null = null) =>
  savedBundle(b, st) && inRanges(b, st) && matchedThrough(b, st, skip).length > 0;

const isFiltered = (st: State) =>
  Boolean(st.q || st.tags.length || st.repo) || PROP_IDS.some((p) => isNarrowed(p, st.ranges[p]));

/** On a tie, such as a bundle and its most installed skill, the bundle goes first. */
const bundleFirst = (a: Entry, b: Entry) => Number(isBundle(b)) - Number(isBundle(a));
/** Compare for a descending sort, unknown values last. */
const descending = (a: Value | null, b: Value | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1;
/** Compare for an ascending sort, unknown values still last. */
const ascending = (a: Value | null, b: Value | null) =>
  a === null || b === null ? descending(a, b) : -descending(a, b);
const order = (sort: Sort, asc: boolean, q: string) => (a: Entry, b: Entry) =>
  (sort === "match"
    ? matchScore(b, q) - matchScore(a, q)
    : sort === "growth"
      ? (asc ? ascending : descending)(growthOf(a), growthOf(b))
      : (asc ? ascending : descending)(PROPS[sort].of(a), PROPS[sort].of(b))) ||
  descending(installsOf(a), installsOf(b)) ||
  bundleFirst(a, b) ||
  nameOf(a).localeCompare(nameOf(b));

interface Results {
  list: Entry[];
  total: number;
  bundles: number;
}

/** The client renders a state's rows in several steps, all from the same results. */
let last: { st: State; r: Results } | undefined;
function results(st: State): Results {
  if (last?.st !== st) last = { st, r: compute(st) };
  return last.r;
}

/** The filtered, sorted list. With bundles, a skill that only works inside its bundle is only listed in it. */
function compute(st: State): Results {
  const matching = [
    ...(st.show === "skills" ? [] : data.bundles.filter((b) => bundlePasses(b, st))),
    ...(st.show === "bundles" ? [] : data.skills.filter((s) => listsAlone(s, st) && passes(s, st))),
  ].sort(order(st.sort, st.asc, st.q));
  return { list: matching, total: matching.length, bundles: matching.filter(isBundle).length };
}

/** How many skills, or bundles when the list shows only those, have each value of a facet, with the other filters. */
function counts(st: State, facet: string, valuesOf: (s: Skill) => string[]): Map<string, number> {
  const n = new Map<string, number>();
  const add = (values: string[]) => {
    for (const v of new Set(values)) n.set(v, (n.get(v) ?? 0) + 1);
  };
  if (st.show === "bundles") {
    for (const b of data.bundles)
      if (savedBundle(b, st) && inRanges(b, st))
        add(matchedThrough(b, st, facet).flatMap(valuesOf));
  } else for (const s of data.skills) if (passes(s, st, facet)) add(valuesOf(s));
  return n;
}

// ------------------------------------------------------------------- asking an agent

/** The active filters in words, the search left out. */
function filtersText(st: State): string[] {
  const parts = st.tags.map((t) => `tag ${t}`);
  if (st.saved) parts.unshift("the ones I saved");
  if (st.repo) parts.push(`from ${st.repo}`);
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      parts.push(`${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`);
  return parts;
}

/**
 * A prompt to paste into any chat agent, for a need in your own words, which the search can't
 * match: the catalog is every entry the filters leave, the search is ignored and taken as the need
 * instead. `base` is the site's absolute URL, which the entries' paths are relative to.
 */
export function askPrompt(st: State, base: string): string {
  const { list } = compute({ ...st, q: "" });
  const entry = (e: Entry) => {
    const review = e.agentReview;
    const numbers = [
      installsOf(e) !== null ? `${compact(installsOf(e) as number)} installs` : "",
      starsOf(e) !== null ? `${compact(starsOf(e) as number)} stars` : "",
    ].filter(Boolean);
    const head = isBundle(e)
      ? `### ${nameOf(e)} (bundle/${idPath(e.id)}/): a bundle of ${skillsOf(e)
          .map((s) => s.name)
          .join(", ")}`
      : `### ${e.name} (skill/${idPath(e.id)}/)`;
    const tags = isBundle(e) ? [] : e.agentReview.tags.filter((t) => !quiet(t));
    const facts = review.tldr?.glance.map((g) => `- ${g.label}: ${g.text}`) ?? [
      `- ${review.description}`,
    ];
    return [
      head,
      [repoKey(e), ...numbers, tags.length ? `tags: ${tags.join(", ")}` : ""]
        .filter(Boolean)
        .join(" · "),
      ...facts,
    ].join("\n");
  };
  const filters = filtersText(st);
  return `I'm looking for an agent skill: a SKILL.md that teaches a coding agent (Claude Code, Codex, Cursor…) how to do something. Below is the catalog of SkillHub, a directory of agent-reviewed skills${
    filters.length ? `, narrowed to: ${filters.join("; ")}` : ""
  }.

Using only this catalog, pick the skills that best fit my need, best first, at most 5. For each, give its name, its link, why it fits, and anything that could make it a poor fit (what it needs, what it won't do). If skills fit only together, say so. If none fits well, say so plainly. If my need is too vague to choose, ask me first.

Each entry's link is its path in parentheses, after ${base}

# Catalog (${list.length} entries)

${list.map(entry).join("\n\n")}

# My need

${st.q.trim() || "I'll tell you in my next message."}`;
}

// ------------------------------------------------------------------- pieces

function filterChip(
  attr: string,
  value: string,
  label: string,
  n: number,
  pressed: boolean,
  title?: string,
): string {
  return `<button type="button" class="chip" ${attr}="${esc(value)}" aria-pressed="${pressed}"${
    title ? ` title="${esc(title)}"` : ""
  }><span>${esc(label)}</span><span class="n">${n}</span></button>`;
}

/** The row's numbers, top right, with the one the list is sorted by highlighted. */
function propsHtml(e: Entry, st: State): string {
  const rows = PROP_IDS.map((p) => {
    const v = PROPS[p].of(e);
    const shown = v === null ? "—" : PROPS[p].date ? date(v as string) : compact(v as number);
    return `<div${p === st.sort ? ` class="on"` : ""}${v === null ? "" : ` title="${esc(PROPS[p].title(e))}"`}><dt>${PROPS[p].label}</dt><dd>${shown}</dd></div>`;
  });
  // The growth shows only while the list is sorted by it, to explain the order.
  if (st.sort === "growth") {
    const g = growthOf(e);
    rows.push(
      `<div class="on" title="${esc(GROWTH.title(e))}"><dt>${GROWTH.label}</dt><dd>${g === null ? "—" : percent(g)}</dd></div>`,
    );
  }
  return `<dl class="props">${rows.join("")}</dl>`;
}

function skillRow(s: Skill, st: State): string {
  const tags = s.agentReview.tags
    .filter((t) => !quiet(t))
    .sort((a, b) => FACET_ORDER.indexOf(facetOf(a)) - FACET_ORDER.indexOf(facetOf(b)));
  const caution = s.agentReview.tags.some((t) => CAUTION.includes(t));
  const bundle = bundleOf.get(s.id)?.bundle;
  return `
    <li class="skill${caution ? " caution" : ""}">
      <div class="skill-body">
      <div class="row-head">
      <div class="skill-head">
        <h3><a class="skill-name" href="${skillHref(s.id)}">${esc(s.name)}</a></h3>
        <span class="skill-source">${esc(repoKey(s))}</span>${
          bundle
            ? `<span class="skill-source">${ownEntry(s) ? "Part of" : "Only works as part of"} <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a></span>`
            : ""
        }
      </div>
      ${saveButton(saveKey("skill", s.id), s.name)}
      </div>
      ${s.agentReview.tldr?.glance.length ? glanceHtml(s.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(s.agentReview.description)}</p>`}
      <div class="tags">${tags.map((t) => tagChip(t, null, st.tags.includes(t))).join("")}</div>
      </div>
      ${propsHtml(s, st)}
    </li>`;
}

function bundleRow(b: Bundle, st: State): string {
  // When filtering, the skills that don't match are dimmed.
  // The ranges are about the bundle, so only the tags and search dim its skills.
  const hits = isFiltered(st) ? skillsOf(b).filter((s) => passes(s, skillFilters(st))) : [];
  const members = b.agentReview.skills.map(({ id }) => {
    const dim = hits.length && !hits.some((s) => s.id === id);
    return `<a href="${skillHref(id)}"${dim ? ` class="dim"` : ""}>${esc(skillById.get(id)?.name ?? id)}</a>`;
  });
  return `
    <li class="skill bundle">
      <div class="skill-body">
      <div class="row-head">
      <div class="skill-head">
        <h3><a class="skill-name" href="${bundleHref(b.id)}">${esc(b.agentReview.name)}</a></h3>
        <span class="kind">Bundle of ${plural(b.agentReview.skills.length, "skill")}</span>
        <span class="skill-source">${esc(repoKey(b))}</span>
      </div>
      ${saveButton(saveKey("bundle", b.id), b.agentReview.name)}
      </div>
      ${b.agentReview.tldr?.glance.length ? glanceHtml(b.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(b.agentReview.description)}</p>`}
      <p class="members">${members.join(", ")}</p>
      </div>
      ${propsHtml(b, st)}
    </li>`;
}

function section(title: string, question: string | null, chips: string): string {
  return `<section class="facet"><h2${question ? ` title="${esc(question)}"` : ""}>${esc(title)}</h2><div class="chips">${chips || `<span class="muted">None</span>`}</div></section>`;
}

/** Whether a tag is one the tag search asks for: its id, label and description hold each of its words. */
const tagFits = (tag: string, label: string, tagQ: string) => {
  const text = `${tag} ${label} ${tagInfo.get(tag) ?? ""}`.toLowerCase();
  return tagQ
    .toLowerCase()
    .split(/\s+/)
    .every((w) => text.includes(w));
};

/** A facet's tags, with their counts for the other filters; only those `tagQ` asks for, if given. */
function tagSection(st: State, facetId: string, tagQ: string): string {
  const facet = facetById.get(facetId);
  if (!facet) return "";
  const n = counts(st, facetId, (s) => tagsOf(s).filter((t) => facetOf(t) === facetId));
  const label = (t: string) => tagLabel(t) ?? t.slice(facetId.length + 1);
  const shown = (t: string) =>
    Boolean(n.get(t) || st.tags.includes(t)) && (!tagQ || tagFits(t, label(t), tagQ));
  const chip = (t: string) =>
    filterChip("data-tag", t, label(t), n.get(t) ?? 0, st.tags.includes(t), tagInfo.get(t));
  // A parent's values sit indented under it; a value with two parents shows under both.
  // While searching, a parent shows for its children that match.
  const top = facet.values.map((v) => tagOf(facet, v.id)).filter((t) => !parentsOf(t).length);
  const chips = top
    .map((t) => {
      const children = includedBy(t).filter(shown);
      return `${shown(t) || (tagQ && children.length) ? chip(t) : ""}${children.length ? `<div class="chips sub">${children.map(chip).join("")}</div>` : ""}`;
    })
    .join("");
  return tagQ && !chips ? "" : section(facet.name, facet.question, chips);
}

/** The tag facets. `tagQ`, the tag search, leaves only the tags it asks for, and the facets with any. */
export function facetsHtml(st: State, stackExpanded: boolean, tagQ = ""): string {
  const sections: string[] = [];
  for (const f of ["category", "type", "effect", "needs", "by", "flag"])
    sections.push(tagSection(st, f, tagQ));
  // Topics, by group.
  const topic = facetById.get("topic");
  const topicCounts = counts(st, "topic", (s) =>
    s.agentReview.tags.filter((t) => facetOf(t) === "topic"),
  );
  const groups = (topic?.groups ?? [])
    .map((g) => {
      const chips = g.values
        .filter((v) => topicCounts.get(v) || st.tags.includes(v))
        .filter((v) => !tagQ || tagFits(v, v, tagQ))
        .map((v) => filterChip("data-tag", v, v, topicCounts.get(v) ?? 0, st.tags.includes(v)))
        .join("");
      return chips ? `<h3 class="group">${esc(g.name)}</h3><div class="chips">${chips}</div>` : "";
    })
    .join("");
  if (groups || !tagQ)
    sections.push(
      `<section class="facet"><h2 title="${esc(topic?.question ?? "")}">Topics</h2>${groups || `<p class="muted">None</p>`}</section>`,
    );
  // Stack, most used first.
  const stackCounts = counts(st, "stack", (s) =>
    s.agentReview.tags.filter((t) => t.startsWith("stack:")),
  );
  const stack = [
    ...stackCounts.keys(),
    ...st.tags.filter((t) => t.startsWith("stack:") && !stackCounts.has(t)),
  ]
    .filter((t) => !tagQ || tagFits(t, t.slice(6), tagQ))
    .sort((a, b) => (stackCounts.get(b) ?? 0) - (stackCounts.get(a) ?? 0) || a.localeCompare(b));
  // While searching, every matching stack shows.
  const shown = stackExpanded || tagQ ? stack : stack.slice(0, 16);
  if (stack.length || !tagQ)
    sections.push(
      section(
        "Stack",
        facetById.get("stack")?.question ?? null,
        shown
          .map((t) =>
            filterChip("data-tag", t, t.slice(6), stackCounts.get(t) ?? 0, st.tags.includes(t)),
          )
          .join("") +
          (stack.length > 16 && !tagQ
            ? `<button type="button" class="link-button" data-action="stack">${stackExpanded ? "Show fewer" : `Show all ${stack.length}`}</button>`
            : ""),
      ),
    );
  const html = sections.join("");
  return tagQ && !html ? `<p class="muted tag-none">No tag matches “${esc(tagQ)}”.</p>` : html;
}

/** Whether filters narrow the list: the search and the agent prompt then look through what they leave. */
const filtersOn = (st: State) =>
  Boolean(st.saved || st.tags.length || st.repo) ||
  PROP_IDS.some((p) => isNarrowed(p, st.ranges[p]));

/**
 * The list and the search's scope are counted in skills, those listed only inside a bundle
 * included, since the search looks through them too; or in bundles, when the list shows only
 * those. Counting the list's rows instead would make it look smaller than SkillHub.
 */
const unitOf = (st: State) => (st.show === "bundles" ? "bundle" : "skill");

/** How many skills (or bundles) a state leaves, its search included: for one state at a time. */
let lastShown: { st: State; n: number } | undefined;
const shownOf = (st: State) => {
  if (lastShown?.st !== st)
    lastShown = {
      st,
      n:
        st.show === "bundles"
          ? data.bundles.filter((b) => bundlePasses(b, st)).length
          : data.skills.filter((s) => passes(s, st)).length,
    };
  return lastShown.n;
};

/** The list's heading: how many skills (or bundles) it shows, and a link to how they get here. */
export function countHtml(st: State): string {
  const n = shownOf(st);
  return `${n.toLocaleString("en")} <a href="${href("about/")}">curated ${unitOf(st)}${n === 1 ? "" : "s"}</a>`;
}

/** The search's scope, for one state at a time: how many skills (or bundles) the filters leave. */
let lastScope: { st: State; n: number } | undefined;
const scopeOf = (st: State) => {
  if (lastScope?.st !== st) {
    const rest = { ...st, q: "" };
    const n =
      st.show === "bundles"
        ? data.bundles.filter((b) => bundlePasses(b, rest)).length
        : data.skills.filter((s) => passes(s, rest)).length;
    lastScope = { st, n };
  }
  return lastScope.n;
};

/** How many skills (or bundles) the filters leave, as the lines under the boxes say it: the number highlighted. */
function scopeCountHtml(st: State): string {
  const n = scopeOf(st);
  return `${badgeHtml(n.toLocaleString("en"))} ${unitOf(st)}${n === 1 ? "" : "s"}`;
}

/** Under the search box: what it does, and how many skills (or bundles) it looks through. */
export const searchNote = (st: State) => `Filters the list of ${scopeCountHtml(st)} below.`;

/** The filters, as chips each with its × to remove it. */
function scopeChipsHtml(st: State): string {
  const chips: string[] = [];
  const remove = (kind: string, value: string, label: string) =>
    `<button type="button" class="scope-chip" data-remove="${kind}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`;
  if (st.saved) chips.push(remove("saved", "", "Saved"));
  for (const t of st.tags) chips.push(remove("tag", t, t));
  if (st.repo) chips.push(remove("repo", st.repo, `from ${st.repo}`));
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      chips.push(remove("range", p, `${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`));
  return chips.join(" ");
}

/**
 * Above the search and the agent's box, since the filters narrow both: the filters as chips, and
 * Clear filters. Nothing without filters: the list's heading says how many skills there are.
 */
export function scopeHtml(st: State): string {
  if (!filtersOn(st)) return "";
  return `<span>Filtered by</span> ${scopeChipsHtml(st)} <button type="button" class="link-button" data-action="clear">Clear filters</button>`;
}

/** The prompt's size, its number highlighted, in the line under the agent's box. */
export const tokensHtml = (tokens: number) => `${badgeHtml(`~${compact(tokens)}`)} tokens`;

/** A number highlighted in the line under a box. */
const badgeHtml = (text: string) => `<span class="badge">${esc(text)}</span>`;

/** Under the agent's box: what Find with your agent copies, and its size. */
export function askLabel(st: State): string {
  const which = filtersOn(st) ? "these" : "all";
  return `Copies a prompt to your clipboard that includes the TL;DR of ${which} ${scopeCountHtml(st)} below — ${tokensHtml(promptTokens(st))}.`;
}

/**
 * About how many tokens the prompt for a state takes, at 4 characters a token, before the need is
 * typed: a large catalog can be too much for some agents. For one state at a time.
 */
let lastPrompt: { st: State; tokens: number } | undefined;
function promptTokens(st: State): number {
  if (lastPrompt?.st !== st)
    lastPrompt = { st, tokens: Math.round(askPrompt({ ...st, q: "" }, href()).length / 4) };
  return lastPrompt.tokens;
}

const rowHtml = (e: Entry, st: State) => (isBundle(e) ? bundleRow(e, st) : skillRow(e, st));

/** The rows from `from` to `to`, to append to the `limit` rows `resultsHtml` rendered. */
export function rowsHtml(st: State, from: number, to: number): string {
  return results(st)
    .list.slice(from, to)
    .map((e) => rowHtml(e, st))
    .join("");
}

/** How many rows `st` lists. */
export const rowCount = (st: State) => results(st).list.length;

/** Instead of the list of what you saved: logged out, or nothing saved yet. */
function savedNote(st: State): string | null {
  if (!st.saved) return null;
  if (!account.user)
    return `<p class="empty"><a href="${esc(loginHref())}" data-login>Log in with GitHub</a> to see what you saved.</p>`;
  if (!account.saved.size)
    return `<p class="empty">Nothing saved yet. Each skill and bundle has a Save button, here in the list and on its page.</p>`;
  return null;
}

/** The count, the active filters and the list, of only its first `limit` rows if given. */
export function resultsHtml(st: State, limit = Infinity): string {
  const { list } = results(st);
  const repoNote = st.repo ? repoById.get(st.repo) : undefined;
  return `
    ${savedNote(st) ?? ""}
    ${repoNote ? `<p class="repo-banner"><a href="https://github.com/${esc(repoNote.id)}">${esc(repoNote.id)}</a>${repoNote.agentReview.description ? ` <span>${esc(repoNote.agentReview.description)}</span>` : ""}</p>` : ""}
    ${
      savedNote(st) !== null
        ? ""
        : list.length
          ? `<ol class="skill-list">${list
              .slice(0, limit)
              .map((e) => rowHtml(e, st))
              .join("")}</ol>`
          : `<p class="empty">No ${st.show === "all" ? "skill or bundle" : unitOf(st)} matches${st.q ? ` “${esc(st.q)}”` : ""}${filtersOn(st) ? ` among the ${plural(scopeOf(st), unitOf(st))} the filters leave. <button type="button" class="link-button" data-action="clear">Clear filters</button>` : "."}${
              st.q
                ? `<br />Describing a need in your own words? <button type="button" class="link-button" data-action="ask">Find with your agent</button>`
                : ""
            }</p>`
    }`;
}

/** A two-handled slider per property. The client updates them in place while they're dragged. */
export function rangesHtml(st: State): string {
  return PROP_IDS.map((p) => {
    const [lo, hi] = st.ranges[p];
    const last = lastStop(p);
    const handle = (end: 0 | 1, value: number) =>
      `<input type="range" min="0" max="${last}" step="1" value="${value}" data-range="${p}" data-end="${end}" aria-label="${PROPS[p].label}, ${end ? "to" : "from"}" aria-valuetext="${rangeLabel(p, [lo, hi])}" />`;
    return `<section class="facet range${isNarrowed(p, [lo, hi]) ? " narrowed" : ""}" data-range-section="${p}"><h2>${PROPS[p].label} <output data-range-label="${p}">${rangeLabel(p, [lo, hi])}</output></h2><div class="slider" data-slider="${p}" style="--lo: ${lo / last}; --hi: ${hi / last}">${handle(0, lo)}${handle(1, hi)}</div></section>`;
  }).join("");
}

/** The presets, then the sort and its order, and what to show. Re-rendered with the list, since a search adds Best match. */
export function settingsHtml(st: State): string {
  const presets = (Object.keys(PRESETS) as Preset[])
    .map((id) => {
      const p = PRESETS[id];
      const on =
        st.sort === p.sort && !st.asc && sameRange(st.ranges.published, sinceRange(p.since));
      return `<button type="button" class="preset" data-preset="${id}" aria-pressed="${on}" title="${esc(p.title)}">${esc(p.label)}</button>`;
    })
    .join("");
  const options = `${
    st.q ? `<option value="match"${st.sort === "match" ? " selected" : ""}>Best match</option>` : ""
  }${PROP_IDS.map(
    (p) => `<option value="${p}"${p === st.sort ? " selected" : ""}>${PROPS[p].label}</option>`,
  ).join(
    "",
  )}<option value="growth"${st.sort === "growth" ? " selected" : ""}>${GROWTH.label}</option>`;
  const order =
    st.sort === "match"
      ? ""
      : `<button type="button" class="order" data-action="order" title="Reverse the order">${
          st.sort !== "growth" && PROPS[st.sort].date
            ? st.asc
              ? "Oldest first"
              : "Newest first"
            : st.asc
              ? "Lowest first"
              : "Highest first"
        } <span aria-hidden="true">${st.asc ? "↑" : "↓"}</span></button>`;
  return `
    <div class="presets" role="group" aria-label="Presets">${presets}</div>
    <button type="button" class="filters-toggle" data-action="filters" aria-controls="filters" aria-expanded="false">Filters</button>
    <section class="facet settings">
      <div class="sort-head"><h2><label for="sort">Sort by</label></h2>${order}</div>
      <select id="sort">${options}</select>
    </section>
    <section class="facet settings">
      <h2 id="show-label">Show</h2>
      <div class="show-switch" role="group" aria-labelledby="show-label">${SHOWS.map(
        ([v, label]) =>
          `<button type="button" data-show="${v}" aria-pressed="${st.show === v}">${label}</button>`,
      ).join("")}</div>
    </section>`;
}

/**
 * The skills list's page, under the site's header. The left sidebar holds every setting: presets,
 * sort, sliders and tags. The right side holds what the page is for: the two ways to search, and
 * the list.
 */
export function listView(st: State): string {
  return `
    <div class="skills-view">
      <aside id="filters" aria-label="Settings and filters">
        <div id="settings">${settingsHtml(st)}</div>
        <div id="ranges">${rangesHtml(st)}</div>
        <div class="tag-search">
          <label for="tag-q" class="sr-only">Search tags</label>
          <input id="tag-q" type="search" placeholder="Search tags" autocomplete="off" spellcheck="false" aria-controls="facets" />
        </div>
        <div id="facets">${facetsHtml(st, false)}</div>
      </aside>
      <div class="list-main">
        <div class="finder">
          <p id="scope" class="scope">${scopeHtml(st)}</p>
          <div class="search-field" data-action="focus-search">
            <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="q" class="sr-only">Search</label>
            <input id="q" type="search" value="${esc(st.q)}" placeholder="Search" autocomplete="off" spellcheck="false" aria-describedby="search-note scope" />
          </div>
          <div class="agent-field" data-action="focus-need">
            <svg class="ask-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6.5V4M2 11v3M18 11v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><rect x="4" y="6.5" width="12" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="10" cy="3" r="1.25" fill="currentColor" /><circle cx="7.75" cy="10.75" r="1.25" fill="currentColor" /><circle cx="12.25" cy="10.75" r="1.25" fill="currentColor" /><path d="M8.5 13.75h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="need" class="sr-only">What you need, for your agent</label>
            <input id="need" type="text" placeholder="Describe what you need" autocomplete="off" aria-describedby="ask-label scope" />
            <button type="button" class="ask-button" data-action="ask">Find with your agent</button>
          </div>
          <p id="search-note" class="search-note">${searchNote(st)}</p>
          <p id="ask-label" class="ask-label" aria-live="polite">${askLabel(st)}</p>
        </div>
        <h1 id="count" class="list-head" aria-live="polite">${countHtml(st)}</h1>
        <section id="results" aria-label="Skills">${resultsHtml(st)}</section>
      </div>
    </div>`;
}
