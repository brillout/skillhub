/**
 * The skills list: its filters, which live in the URL query so every filtered list can be shared
 * as a link, and its HTML. The page is pre-rendered unfiltered; its client script re-renders it.
 */

import { age, compact, date, daysBefore, esc, href, number, percent, plural } from "./format.ts";
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
  listedOutsideBundle,
  nameOf,
  parentsOf,
  repoById,
  repoHref,
  repoKey,
  growthOf,
  GROWTH_BASE_MIN,
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
  publishedOf,
  weekOf,
} from "./skills.ts";
import { bundlePage, skillPage } from "./github.ts";
// The browser's copy of the data, which leaves some fields out: see client-data.ts.
import {
  proseOf,
  searchWords,
  type ClientBundle as Bundle,
  type ClientSkill as Skill,
  type SearchWords,
} from "./client-data.ts";
import { CHECK, CHICK, DOWNLOAD, SAVED, SEARCH, STAR, iconDefsHtml } from "./prop-icons.ts";
import { plain, sought, terms, type Term } from "./search-terms.ts";
import {
  account,
  bookmarkSvg,
  loginHref,
  saveButton,
  saveKey,
  savedCount,
  thumbsHtml,
} from "./saves.ts";

/** A row of the skills list: a skill, or a bundle with its skills inside. */
type Entry = Skill | Bundle;

/** Tags the list's rows leave to the skill's page: ones that hold for most skills, and categories, which the filters already show. */
const quiet = (tag: string) => tag === "by:community" || facetOf(tag) === "category";

// ------------------------------------------------------------------- state

/**
 * The Age slider's inner stops, oldest first, in days before the data's date: its range is
 * relative, such as a month at most, so a link keeps its meaning as the data moves on. A year, and
 * every whole month up to 3, week up to 3 and day up to 6. Not 4 weeks, 2 days off a month: a stop
 * that would filter almost what its neighbor does. Its fields take any age between them, such as
 * 45 days (see parseAge). The URL names an age in days, such as 30d, in its `published` parameter:
 * the filter was named Published, and links to it still work.
 */
const AGES = [365, 90, 60, 30, 21, 14, 7, 6, 5, 4, 3, 2, 1];
/** The stops named under the Age slider's histogram: 1 year is a step from 3 months, too close for both. */
const AGE_MARKS = [90, 30, 7, 1];
/** An age's units, largest first: a month is 30 days and a year 365, as a row's age says them. */
const AGE_UNITS: [days: number, word: string, short: string][] = [
  [365, "year", "y"],
  [30, "month", "m"],
  [7, "week", "w"],
  [1, "day", "d"],
];
/** The largest unit that divides an age: 60 days are 2 months, 21 are 3 weeks, 45 stay 45 days. */
const unitOfAge = (days: number) => AGE_UNITS.find(([n]) => days % n === 0) ?? AGE_UNITS[3];
/** An age in words, as a range says it: "≤ 3 months", "> 1 year", "1 week – 45 days". */
const ageWords = (days: number) => {
  const [n, word] = unitOfAge(days);
  return plural(days / n, word);
};
/**
 * An age in short, under the slider's histogram and in its fields: "3m", "2w", "45d". m is a month:
 * an age is never in minutes, and a count's M, a million, is in fields of its own.
 */
const ageShort = (days: number) => {
  const [n, , short] = unitOfAge(days);
  return `${days / n}${short}`;
};
/** An age as a preset's tooltip says it: "the last 3 months", "the last month". */
const theLast = (since: number) => `the last ${ageWords(since).replace(/^1 /, "")}`;

/**
 * Buttons that set the sort and the sliders (see presetPatch), highest first, each named after what
 * it shows, which the settings spell out: Rising, the default view, by how fast the weekly downloads
 * grow; Rising & new by weekly downloads among the skills published in the last RISING_NEW_SINCE
 * days (a skill that young has no growth yet, see growthOf; one that took off from almost nothing
 * counts as published then, see publishedOf); Top by weekly downloads among the skills with at least
 * TOP_WEEKLY of them; New by publishing date among those published in the last NEW_SINCE days.
 * Without a range, Top was every skill, those hardly downloaded too, under a name that says top; New
 * was every skill, the oldest too, under a name that says new.
 */
export type Preset = "rising" | "rising-new" | "top" | "new";
interface PresetInfo {
  label: string;
  sort: Sort;
  /** The Age range it sets: so many days at most, or any age. */
  since: number | null;
  /** The Weekly Downloads range it sets: so many at least, or any number. */
  weekly: number | null;
  title: string;
}
/** How recent the skills of Rising & new are, and of New, in days: each a stop of the Age slider. */
const RISING_NEW_SINCE = 90;
const NEW_SINCE = 30;
/**
 * The weekly downloads of Top's skills, at least: a stop of the Weekly Downloads slider, and the bar
 * Rising's growth sets too (GROWTH_MIN). Low enough that Top with a tag or a search still lists a few.
 */
const TOP_WEEKLY = 1000;
export const PRESETS: Record<Preset, PresetInfo> = {
  rising: {
    label: "Rising",
    sort: "growth",
    since: null,
    weekly: null,
    title: "Downloads growing the fastest",
  },
  "rising-new": {
    label: "Rising & new",
    sort: "week",
    since: RISING_NEW_SINCE,
    weekly: null,
    title: `The most downloaded this week of those published in ${theLast(RISING_NEW_SINCE)}`,
  },
  top: {
    label: "Top",
    sort: "week",
    since: null,
    weekly: TOP_WEEKLY,
    title: `The most downloaded this week of those with at least ${compact(TOP_WEEKLY)} weekly downloads`,
  },
  new: {
    label: "New",
    sort: "published",
    since: NEW_SINCE,
    weekly: null,
    title: `The newest of those published in ${theLast(NEW_SINCE)}`,
  },
};

/** The numbers every row shows, which the list sorts by and the sliders filter on. */
export type Prop = "published" | "stars" | "downloads" | "week";
type Value = number | string;
interface PropInfo {
  label: string;
  /** The icon that stands for it in the rows and on its filter's pill: see prop-icons.ts. */
  icon: string;
  /** The word under the icon, when it shares its icon with another number. */
  tag?: string;
  /** The entry's value, or null when unknown. Dates are YYYY-MM-DD. */
  of: (e: Entry) => Value | null;
  /** Where the value comes from, for its tooltip. Only called when the value is known. */
  title: (e: Entry) => string;
  /**
   * The slider's stops, lowest first, as its values: the first is at most every value and the last
   * above every one, so that the full range includes them all. Each bar of its histogram is a step.
   */
  stops: Value[];
  /**
   * What each stop stands for as a range's bound (see Range): a count, or an age in days. The ends'
   * are only for placing a bound that lies between them on the track: see positionOf.
   */
  bounds: number[];
  /** Its values are dates, and its bounds ages: see AGES. */
  date?: boolean;
  /** How the catalog's values spread out: see Crowd. */
  crowd?: Crowd;
  /** Where its value stands, in words, for the skill's page: see standingOf. */
  standing?: { more: string; fewer: string; most: string };
}

/**
 * How the catalog's values of a number spread out, so that a row shows whether its number is a lot:
 * a histogram next to it, with its own bar in garnet and its rank under it (see crowdHtml). A
 * value's place is 1 plus how many are higher, so equal values share a place: a bundle shares its
 * most installed skill's, every skill of a repo its repo's.
 */
interface Crowd {
  /** What it ranks, such as "skill". */
  what: string;
  /** Its rank's words at either end: "Top" and "Bottom", or for an age "Newest" and "Oldest". */
  ends: [top: string, bottom: string];
  /** Which way its places go, when it says so, such as "newest first". */
  order?: string;
  total: number;
  placeOf: (n: number) => number;
  /** How many are lower. */
  belowOf: (n: number) => number;
  /** Which bar a value is in, from 0, the lowest values', to BINS - 1. */
  binOf: (n: number) => number;
  /**
   * Each bar's height in the chart's 100 × 20 viewBox, lowest values first: as tall as the values
   * it holds against the fullest bar's; one that holds any is at least 1.2, so it doesn't pass for
   * none. The bar of a row's own value is as tall as the others: only its color sets it apart.
   */
  bars: number[];
  /** The chart's scale, for the skill's page: where each mark is, from 0 to 1, and its label. */
  ticks: [at: number, label: string][];
}
/** The histograms' bars, and the gap between two, in the chart's viewBox. */
const BINS = 24;
const BAR_GAP = 1;
const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
/**
 * `scale` "log" spreads counts by their order of magnitude, so that 10 to 100 is as wide as 10K to
 * 100K; "days" spreads dates, as days, evenly; "linear" spreads growths evenly. The chart starts at
 * the 1st percentile: a few new skills with a handful of downloads would squeeze the rest into its
 * right end. A growth's also ends at the 99th, as a few grow several times over.
 */
function crowd(
  what: string,
  values: (number | null)[],
  scale: "log" | "days" | "linear",
  { ends = ["Top", "Bottom"], order }: { ends?: [string, string]; order?: string } = {},
): Crowd {
  const known = values.filter((v) => v !== null);
  const desc = [...known].sort((a, b) => b - a);
  const f = scale === "log" ? (v: number) => Math.log10(Math.max(v, 1)) : (v: number) => v;
  const lo = f(desc[Math.floor(desc.length * 0.99)]);
  const hi = f(desc[scale === "linear" ? Math.floor(desc.length * 0.01) : 0]);
  const at = (v: number) => Math.min(1, Math.max(0, (f(v) - lo) / (hi - lo || 1)));
  const binOf = (v: number) => Math.min(BINS - 1, Math.floor(at(v) * BINS));
  const counts = Array<number>(BINS).fill(0);
  for (const v of known) counts[binOf(v)]++;
  const fullest = Math.max(...counts);
  /** How many come before the first that `past` says is past, in `desc`. */
  const countUntil = (past: (x: number) => boolean) => {
    let a = 0;
    let b = desc.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (past(desc[mid])) b = mid;
      else a = mid + 1;
    }
    return a;
  };
  const ticks: [number, string][] = [];
  if (scale === "log")
    for (let p = Math.ceil(lo); p <= Math.floor(hi); p++)
      ticks.push([at(10 ** p), compact(10 ** p)]);
  else if (scale === "days") {
    // A month's first day, some months apart: about six marks. January says its year.
    const first = new Date((lo + 1) * 86_400_000);
    const months = Math.max(1, Math.ceil((hi - lo) / 30 / 6));
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    for (; d.getTime() / 86_400_000 <= hi; d.setUTCMonth(d.getUTCMonth() + months))
      ticks.push([
        at(d.getTime() / 86_400_000),
        d.getUTCMonth() ? MONTH.format(d) : String(d.getUTCFullYear()),
      ]);
  }
  return {
    what,
    ends,
    order,
    total: desc.length,
    placeOf: (v) => countUntil((x) => x <= v) + 1,
    belowOf: (v) => desc.length - countUntil((x) => x < v),
    binOf,
    bars: counts.map((n) => (n ? Math.max(1.2, (n / fullest) * 20) : 0)),
    ticks,
  };
}
/** A date as days, for the Age chart, on which the newest is the highest. */
const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
/** The repos the catalog's skills and bundles are in, which stars rank among. */
const listedRepos = new Set([...data.skills, ...data.bundles].map(repoKey));

/**
 * A count's stops, 0, 10, 20, 30… 90, 100, 200… up past the largest value: every whole tens,
 * hundreds, thousands. Each is the bound it stands for, as it is the count.
 */
function countStops(of: (s: Skill) => number | null): Pick<PropInfo, "stops" | "bounds"> {
  const max = Math.max(0, ...data.skills.map(of).filter((n) => n !== null));
  const stops = [0];
  for (let p = 10; stops[stops.length - 1] <= max; p *= 10)
    for (let m = 1; m < 10; m++) stops.push(m * p);
  const counts = stops.slice(0, stops.findIndex((n) => n > max) + 1);
  return { stops: counts, bounds: counts };
}

// A bundle's numbers are its most popular skill's.
const most = (e: Entry) => (isBundle(e) ? "The most of any of its skills: " : "");
// Downloads is the site's word, in what it names and compares: Total Downloads, "more downloads
// than". Installs is skills.sh's, and on purpose the word where a number's source is told: its
// tooltip here, the About page's minimums, the agent's prompt.
export const PROPS: Record<Prop, PropInfo> = {
  // Its age, such as "3 days", counted from the day it was published, which its tooltip gives: the
  // values are those dates, so the newest is the highest, and "published" names it in the URL.
  published: {
    label: "Age",
    icon: CHICK,
    of: publishedOf,
    title: (e) => {
      const on = date(publishedOf(e) as string);
      const tookOff = publishedOf(e) !== firstSeenOf(e);
      if (isBundle(e))
        return tookOff
          ? `Published ${on}, the earliest of its skills: when skills.sh first saw one, or the week one took off after getting under ${compact(GROWTH_BASE_MIN)} installs a week`
          : `Published ${on}, when skills.sh first saw one of its skills`;
      return tookOff
        ? `Published ${on}, the week it took off on skills.sh: skills.sh first saw it ${date(firstSeenOf(e) as string)}, but it got under ${compact(GROWTH_BASE_MIN)} installs a week until then`
        : `Published ${on}, when skills.sh first saw it`;
    },
    // Below and above every date, so that the full range takes them all in. The ends' ages place an
    // age between them: over a year, toward 2; under a day, toward none.
    stops: ["", ...AGES.map((n) => daysBefore(data.asOf.installs, n)), "~"],
    bounds: [2 * AGES[0], ...AGES, 0],
    date: true,
    crowd: crowd(
      "skill",
      data.skills.map((s) => {
        const d = publishedOf(s);
        return d ? days(d) : null;
      }),
      "days",
      { ends: ["Newest", "Oldest"], order: "newest first" },
    ),
    standing: { more: "Newer than", fewer: "Older than", most: "The newest skill" },
  },
  stars: {
    label: "Stars",
    icon: STAR,
    of: starsOf,
    title: (e) => `GitHub stars of ${repoKey(e)}, ${date(data.asOf.stars)}`,
    ...countStops(starsOf),
    crowd: crowd(
      "repo",
      data.repos.filter((r) => listedRepos.has(r.id)).map((r) => r.stars),
      "log",
    ),
    standing: {
      more: "More stars than",
      fewer: "Fewer stars than",
      most: "The most stars of any repo",
    },
  },
  downloads: {
    label: "Total Downloads",
    icon: DOWNLOAD,
    tag: "Total",
    of: installsOf,
    title: (e) => `${most(e)}All-time installs on skills.sh, ${date(data.asOf.installs)}`,
    ...countStops(installsOf),
    crowd: crowd("skill", data.skills.map(installsOf), "log"),
    standing: {
      more: "More downloads than",
      fewer: "Fewer downloads than",
      most: "The most downloads of any skill",
    },
  },
  week: {
    label: "Weekly Downloads",
    icon: DOWNLOAD,
    tag: "Week",
    of: weekOf,
    title: (e) => `${most(e)}Installs on skills.sh in the week to ${date(data.asOf.installs)}`,
    ...countStops(weekOf),
    crowd: crowd("skill", data.skills.map(weekOf), "log"),
    standing: {
      more: "More weekly downloads than",
      fewer: "Fewer weekly downloads than",
      most: "The most weekly downloads of any skill",
    },
  },
};
const PROP_IDS = Object.keys(PROPS) as Prop[];
const lastStop = (p: Prop) => PROPS[p].stops.length - 1;

/**
 * A slider's range, as the URL says it: a count at least `lo` and under `hi`, such as
 * stars=1000..50000; an age at most `lo` days and over `hi`, such as published=90d..7d. null: no
 * bound. Any amount, which its fields take: the slider's stops are only where its handles stop.
 */
export type Range = [lo: number | null, hi: number | null];
export const fullRange = (): Range => [null, null];
export const fullRanges = () =>
  Object.fromEntries(PROP_IDS.map((p) => [p, fullRange()])) as Record<Prop, Range>;
export const isNarrowed = ([lo, hi]: Range) => lo !== null || hi !== null;

/** How the URL names a bound: an age in days, such as 30d; a count as itself. */
const boundKey = (p: Prop, n: number) => (PROPS[p].date ? `${n}d` : String(n));

/**
 * Where a bound is on its slider's track, from 0 to its last stop: at a stop, or between two, in
 * proportion. Counts by their order of magnitude, as their stops spread, from 0 to the first stop
 * by their value; ages by their days.
 */
function positionOf(p: Prop, n: number): number {
  const { bounds, date } = PROPS[p];
  // Ages run the other way: the newest, the fewest days, on the right.
  const key = (v: number) => (date ? -v : v);
  if (key(n) <= key(bounds[0])) return 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const [a, b] = [bounds[i], bounds[i + 1]];
    if (key(n) > key(b)) continue;
    return i + (date || a === 0 ? (n - a) / (b - a) : Math.log(n / a) / Math.log(b / a));
  }
  return bounds.length - 1;
}
/** A range's handles on its track: see positionOf. No bound is either end. */
export const rangePositions = (p: Prop, [lo, hi]: Range): [number, number] => [
  lo === null ? 0 : positionOf(p, lo),
  hi === null ? lastStop(p) : positionOf(p, hi),
];
/** The bound a handle at a stop stands for: at its end of the track, none. */
export const boundAt = (p: Prop, end: 0 | 1, stop: number): number | null =>
  stop === (end ? lastStop(p) : 0) ? null : PROPS[p].bounds[stop];
/** The range between two neighboring stops, a step: what a bar of the histogram counts. */
const stepRange = (p: Prop, i: number): Range => [boundAt(p, 0, i), boundAt(p, 1, i + 1)];

/** A count in words: as the rows say it, 1.5K, where that's all of it; otherwise 1,234. */
const countWords = (n: number) => (parseCount(compact(n)) === n ? compact(n) : number(n));

/** A bound as its field shows it: an age such as 3m or 45d, a count such as 1.5K. */
export const fieldText = (p: Prop, n: number | null) =>
  n === null ? "" : PROPS[p].date ? ageShort(n) : countWords(n);

/** A typed count, such as 1500, 1,500 or 1.5K: a whole number, or null. */
export function parseCount(text: string): number | null {
  const m = text.replace(/[,\s_]/g, "").match(/^(\d+(?:\.\d+)?)([km])?$/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] ? (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : 1));
}
/** The words a typed age's units go by, and their days: a bare number is days. */
const AGE_WORD_DAYS: Record<string, number> = {
  "": 1,
  d: 1,
  day: 1,
  days: 1,
  w: 7,
  wk: 7,
  wks: 7,
  week: 7,
  weeks: 7,
  m: 30,
  month: 30,
  months: 30,
  y: 365,
  yr: 365,
  yrs: 365,
  year: 365,
  years: 365,
};
/**
 * A typed age, in days: 45, 45d, 3w, 2m, 1y, 2w 3d or 1 month 2 weeks; null when it isn't one, or
 * is under a day. A bare number is days, and m months, as the fields show them: see ageShort.
 */
export function parseAge(text: string): number | null {
  let days = 0;
  let parts = 0;
  const rest = text
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*([a-z]*)/g, (_, n: string, unit: string) => {
      parts++;
      days += Object.hasOwn(AGE_WORD_DAYS, unit) ? Number(n) * AGE_WORD_DAYS[unit] : Number.NaN;
      return "";
    });
  if (!parts || rest.replace(/[\s,+]|and/g, "") || !(days >= 1)) return null;
  return Math.round(days);
}
/** What each field of a slider's popover sets, and some of what it takes, for its placeholder. */
export const fieldWords = (p: Prop): [lo: string, hi: string, examples: string] =>
  PROPS[p].date
    ? ["Newer than", "Older than", "45d / 3w / 2m"]
    : ["At least", "Under", "500 / 1.5K / 2M"];
/**
 * What the fields of a range say is wrong with it, if anything: each bound on the right side of the
 * other. It names the fields in quotes: without them, "Under has to be over At least" read as a
 * sentence gone wrong.
 */
export function rangeError(p: Prop, [lo, hi]: Range): string | null {
  const [loWords, hiWords] = fieldWords(p);
  if (PROPS[p].date)
    return lo !== null && hi !== null && hi >= lo
      ? `“${hiWords}” has to be less than “${loWords}”.`
      : null;
  return hi !== null && hi <= (lo ?? 0)
    ? `“${hiWords}” has to be more than ${lo === null ? "0" : `“${loWords}”`}.`
    : null;
}

/**
 * A slider's range in words, such as "≥ 1K" or "1K – 5K"; and for an age, said as the counts are,
 * "≤ 1 month" or "1 month – 1 year": in words, as "Under 3 months", it was too long for the
 * settings' line on a 1,280px screen (see .settings-line in style.css).
 */
export function rangeLabel(p: Prop, [lo, hi]: Range): string {
  if (PROPS[p].date) {
    // An age at most `lo` days, and over `hi`.
    const atMost = lo === null ? null : ageWords(lo);
    const over = hi === null ? null : ageWords(hi);
    return atMost && over
      ? `${over} – ${atMost}`
      : atMost
        ? `≤ ${atMost}`
        : over
          ? `> ${over}`
          : "Any";
  }
  const from = lo === null ? null : countWords(lo);
  const to = hi === null ? null : countWords(hi);
  return from && to ? `${from} – ${to}` : from ? `≥ ${from}` : to ? `< ${to}` : "Any";
}

/**
 * A number to sort by; "growth", how fast the weekly downloads grow (a sort only: it can be
 * negative or infinite, so it gets no slider); "match", how well the entry matches the search,
 * for when there is one; or "saved", when you saved it, for when the list shows only what you saved.
 */
export type Sort = Prop | "growth" | "match" | "saved";
const GROWTH = {
  label: "Weekly Growth",
  icon: DOWNLOAD,
  tag: "Growth",
  /** Among the skills that have a growth: see growthOf. */
  crowd: crowd("skill", data.skills.map(growthOf), "linear"),
  // No full stop at its end, as the numbers' titles: propsHtml adds one before the place.
  title: (e: Entry) =>
    `${isBundle(e) ? "The most of any of its skills: " : ""}Installs on skills.sh in an average week of the 2 weeks to ${date(data.asOf.installs)}, against an average week of the 4 weeks before. Only for skills with at least ${compact(GROWTH_MIN)} a week, and at least ${compact(GROWTH_BASE_MIN)} in each of the last ${GROWTH_WEEKS} weeks: a younger skill, or one that took off from almost nothing, shows under ${PRESETS["rising-new"].label}`,
};
/**
 * The sort unless another is picked: a search's is best match; the list of what you saved is
 * Recently saved, the last saved first, unless it's searched; otherwise the list is Rising, by growth.
 */
export const defaultSort = ({ q, saved }: Pick<State, "q" | "saved">): Sort =>
  q.trim() ? "match" : saved ? "saved" : "growth";
/**
 * The search as it's looked for: what the box holds, without the spaces around it. A box that only
 * holds spaces isn't a search: it neither narrows the list nor sorts it by best match.
 */
const term = (st: State) => st.q.trim();
/** The Age range for `since` days at most, or any age. */
export const sinceRange = (since: number | null): Range => [since, null];
const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];
/**
 * What a preset sets: its sort, highest first, and its Age and Weekly Downloads ranges, every other
 * slider back at its full range, since one left narrowed (say Stars from 5,000) would make the list
 * something other than what the preset is named after. The search, tags and Show stay as they are.
 */
export function presetPatch(id: Preset) {
  const { sort, since, weekly } = PRESETS[id];
  return {
    sort,
    asc: false,
    ranges: { ...fullRanges(), published: sinceRange(since), week: [weekly, null] },
  } satisfies Partial<State>;
}
export interface State {
  q: string;
  tags: string[];
  repo: string | null;
  sort: Sort;
  /** Lowest (or oldest) first, instead of highest first. */
  asc: boolean;
  ranges: Record<Prop, Range>;
  show: Show;
  /** Only what the logged-in person saved: the Saved switch. */
  saved: boolean;
}

/**
 * What the list shows: bundles and the skills listedOutsideBundle ("all"), every skill, those only
 * listed inside their bundle included ("skills"), or only bundles. Not a preset's business.
 */
export type Show = "all" | "skills" | "bundles";
/**
 * Each with its button's word, and what it means in full where the word alone doesn't say: "Both"
 * rather than "Skills & bundles", whose length sent Show onto a second line of settings on a
 * 1,280px screen (see .settings-line in style.css).
 */
export const SHOWS: [show: Show, label: string, full?: string][] = [
  ["all", "Both", "Skills and bundles"],
  ["skills", "Skills"],
  ["bundles", "Bundles"],
];

/** The repos' ids by their lowercase: GitHub ignores case, and so do this site's pages (see github.ts). */
const repoIdByLower = new Map(data.repos.map((r) => [r.id.toLowerCase(), r.id]));

export function parse(search: string): State {
  const p = new URLSearchParams(search);
  const sort = p.get("sort") as Sort | null;
  const q = p.get("q") ?? "";
  // A repo as the data spells it, however the link does: ?repo=Anthropics/Skills is anthropics/skills.
  const repo = p.get("repo");
  const ranges = fullRanges();
  for (const prop of PROP_IDS) {
    // Such as stars=1000..50000, published=30d.. with no upper bound, or published=.. for any: any
    // amount, as the fields take, not only a stop's. A count of 0 is no lower bound, and an age is
    // at least a day.
    const param = p.get(prop);
    if (param === null) continue;
    const [lo, hi] = param.split("..").map((key) => {
      const m = key.match(PROPS[prop].date ? /^(\d+)d$/ : /^(\d+)$/);
      return m && Number(m[1]) > 0 ? Number(m[1]) : null;
    });
    // An upper bound on the wrong side of the lower one, which the fields don't let through, is none.
    ranges[prop] = [lo ?? null, hi ?? null];
    if (rangeError(prop, ranges[prop])) ranges[prop][1] = null;
  }
  return {
    q,
    // Each tag once, and none without a name: ?tag= would be a filter's chip that says nothing.
    tags: [...new Set(p.getAll("tag").filter(Boolean))],
    repo: repo && (repoIdByLower.get(repo.toLowerCase()) ?? repo),
    // A sort the list has, by its own name: `in` would also take what every object inherits, such
    // as ?sort=constructor, which has no number to sort by, and the list's script would throw.
    sort:
      sort &&
      (Object.hasOwn(PROPS, sort) ||
        sort === "growth" ||
        (sort === "match" && q.trim()) ||
        (sort === "saved" && p.has("saved")))
        ? sort
        : defaultSort({ q, saved: p.has("saved") }),
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
  // As it's looked for: the box may hold a space after it, while the next word is typed.
  if (term(s)) p.set("q", term(s));
  for (const t of s.tags) p.append("tag", t);
  if (s.repo) p.set("repo", s.repo);
  if (s.sort !== defaultSort(s)) p.set("sort", s.sort);
  if (s.asc) p.set("order", "asc");
  for (const prop of PROP_IDS) {
    const [lo, hi] = s.ranges[prop];
    if (isNarrowed([lo, hi]))
      p.set(
        prop,
        `${lo === null ? "" : boundKey(prop, lo)}..${hi === null ? "" : boundKey(prop, hi)}`,
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
 * search and Saved switch: best match while there's a search, Recently saved while the switch is
 * on (see defaultSort). Best match goes with the search, and Recently saved with the switch.
 */
export function patched(prev: State, patch: Partial<State>): State {
  const next = { ...prev, ...patch };
  if (!("sort" in patch) && prev.sort === defaultSort(prev)) next.sort = defaultSort(next);
  // Best match has no order. One picked for another sort stayed, unseen, and came back with the
  // search's end, on the sort that follows: "Weekly Growth, lowest first", from Age's oldest first.
  if (next.sort === "match") next.asc = false;
  if (next.sort === "match" && !term(next)) next.sort = defaultSort(next);
  if (next.sort === "saved" && !next.saved) next.sort = defaultSort(next);
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
 * The words of the TLDRs' prose, for the search. The server has the prose in the data. The
 * client's copy leaves it out: list-client.ts loads the prose after the page and hands its words to
 * addSearchWords, and until then the search goes without them. See client-data.ts.
 */
let prose = searchWords(proseOf(data));

/** What the search looks in, and with what weight it ranks: see `index`. */
let searchText = new Map<string, string>();
let bundleText = new Map<string, string>();
let skillFields = new Map<string, Fields>();
let bundleFields = new Map<string, Fields>();
/**
 * Each entry's score for the search under way (see matchScore), worked out once: the sort asks for
 * the scores of both entries at each comparison, some twenty thousand times for a search that most
 * skills match, such as its first letter. `index` empties it, as the fields it scores change.
 */
let scores: { q: string; of: Map<Entry, number> } | undefined;

/** Adds the TLDRs' words to what the search looks in. */
export function addSearchWords(words: SearchWords) {
  prose = words;
  index();
  last = undefined;
}

/**
 * A search, read once for the many times every skill is asked about it: its words, each with what
 * tells whether it starts a word of a text (see search-terms.ts, which the Tags page's search reads
 * its own with); and the whole of it, for `score`.
 */
interface Sought {
  q: string;
  words: Term[];
  phrase: string;
}
let lastSought: Sought | undefined;
function read(q: string): Sought {
  if (lastSought?.q === q) return lastSought;
  const phrase = sought(q);
  return (lastSought = { q, words: terms(phrase), phrase });
}
const words = (q: string) => read(q).words;
const matches = (text: string, q: string) => words(q).every(({ w }) => text.includes(w));

/**
 * For sorting a search by best match: each word of it scores where it appears, a name the most,
 * then the description, the TLDR's glance and the tags, the repo, and last the TLDR's text and the
 * note. A name holding the whole search scores extra.
 */
type Fields = [text: string, weight: number][];
const fields = (parts: [string | null | undefined, number][]): Fields =>
  parts.filter((p): p is [string, number] => Boolean(p[0])).map(([t, w]) => [plain(t), w]);
function index() {
  scores = undefined;
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
        .map((text) => plain(text as string))
        .join(" "),
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
        .map((text) => plain(text as string))
        .join(" "),
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
  const name = f[0]?.[1] === 8 ? f[0][0] : "";
  const { words, phrase } = read(q);
  return (
    words.reduce(
      (n, { w, start }) =>
        n + Math.max(0, ...f.map(([t, wt]) => (start.test(t) ? wt : t.includes(w) ? wt / 4 : 0))),
      0,
    ) + (phrase && name.includes(phrase) ? 4 : 0)
  );
}
/** A bundle matches as well as itself or its best matching skill. */
function matchScore(e: Entry, q: string): number {
  if (scores?.q !== q) scores = { q, of: new Map() };
  let n = scores.of.get(e);
  if (n === undefined) {
    n = isBundle(e)
      ? Math.max(
          score(bundleFields.get(e.id) ?? [], q),
          ...skillsOf(e).map((s) => matchScore(s, q)),
        )
      : score(skillFields.get(e.id) ?? [], q);
    scores.of.set(e, n);
  }
  return n;
}

/** Within a facet a skill needs any selected value; across facets it needs all of them. `skip` leaves one facet out, for its counts. */
function passes(s: Skill, st: State, skip: string | null = null): boolean {
  if (st.repo && repoKey(s) !== st.repo) return false;
  if (st.saved && !account.saved.has(saveKey("skill", s.id))) return false;
  if (!inRanges(rangedBy(s, st), st)) return false;
  const selected = new Map<string, string[]>();
  for (const t of st.tags) selected.set(facetOf(t), [...(selected.get(facetOf(t)) ?? []), t]);
  for (const [facet, tags] of selected)
    if (facet !== skip && !tags.some((t) => tagsOf(s).includes(t))) return false;
  return !term(st) || matches(searchText.get(s.id) ?? "", st.q);
}

/**
 * Whether the entry's numbers are within the sliders' ranges. A bundle's are its own, the ones its
 * row shows (its oldest skill's date, its most downloaded skill's downloads), so that a bundle
 * whose oldest skill is a year old isn't in "Age: ≤ 3 months" for its newest skills.
 */
const inRanges = (e: Entry, st: State) => PROP_IDS.every((p) => inRange(e, p, st.ranges[p]));
function inRange(e: Entry, p: Prop, [lo, hi]: Range): boolean {
  if (!isNarrowed([lo, hi])) return true;
  const v = PROPS[p].of(e);
  return v !== null && (lo === null || v >= valueOf(p, lo)) && (hi === null || v < valueOf(p, hi));
}
/** The dates so many days before the data's: see valueOf. */
const daysAgo = new Map<number, string>();
/** A bound as the entries' values are: for an age, the date so many days before the data's. */
function valueOf(p: Prop, n: number): Value {
  if (!PROPS[p].date) return n;
  let day = daysAgo.get(n);
  if (day === undefined) daysAgo.set(n, (day = daysBefore(data.asOf.installs, n)));
  return day;
}

/**
 * The entry whose numbers the sliders filter a skill by: a skill listed only inside its bundle is
 * in the sliders' ranges when its bundle is, unless the list shows it on its own.
 */
const rangedBy = (s: Skill, st: State): Entry =>
  (!listsAlone(s, st) && bundleOf.get(s.id)?.bundle) || s;

/**
 * Whether the list shows the skill on its own row. With bundles, a skill that isn't
 * listedOutsideBundle is only listed in its bundle's row; but what you saved is listed, whatever
 * it is.
 */
const listsAlone = (s: Skill, st: State) =>
  st.show === "skills" || st.saved || listedOutsideBundle(s);

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
 * the search matches the bundle itself, those that match the tags.
 */
function matchedThrough(b: Bundle, st: State): Skill[] {
  const hits = skillsOf(b).filter((s) => passes(s, skillFilters(st)));
  return hits.length ? hits : matchedByItself(b, st);
}

/**
 * The skills a bundle matches through when the search matches only the bundle itself, its name or
 * its words, and none of its skills: those that match the tags. None when a skill of it matches the
 * search, or when the bundle doesn't.
 */
function matchedByItself(b: Bundle, st: State): Skill[] {
  if (!term(st) || !matches(bundleText.get(b.id) ?? "", st.q)) return [];
  const rest = skillFilters(st);
  const skills = skillsOf(b);
  if (skills.some((s) => passes(s, rest))) return [];
  return skills.filter((s) => passes(s, { ...rest, q: "" }));
}

/**
 * The skills the list shows as matching, on a row of their own or in their bundle's: those that
 * pass the filters and the search, and those of a bundle that a search only finds by the bundle's
 * own name or words, which its row then shows as matching too. The list's count and the sliders'
 * histograms count these, and the tags' counts go by them (see counts), so that a search for a
 * bundle's name doesn't show its row under "0 skills" and no tags. Not with Saved on, where a saved
 * bundle counts as a bundle, not as its skills (see savedBundlesHtml), nor when the list shows no
 * bundle.
 */
function shownSkills(st: State): Skill[] {
  const shown = data.skills.filter((s) => passes(s, st));
  if (!term(st) || st.saved || st.show === "skills") return shown;
  const seen = new Set(shown);
  for (const b of data.bundles)
    if (inRanges(b, st))
      for (const s of matchedByItself(b, st))
        if (!seen.has(s)) {
          seen.add(s);
          shown.push(s);
        }
  return shown;
}

/** A bundle is in its sliders' ranges by its own numbers, and matches the tags and search through any of its skills. */
const bundlePasses = (b: Bundle, st: State) =>
  savedBundle(b, st) && inRanges(b, st) && matchedThrough(b, st).length > 0;

const isFiltered = (st: State) =>
  Boolean(term(st) || st.tags.length || st.repo) || PROP_IDS.some((p) => isNarrowed(st.ranges[p]));

/** On a tie, such as a bundle and its most installed skill, the bundle goes first. */
const bundleFirst = (a: Entry, b: Entry) => Number(isBundle(b)) - Number(isBundle(a));
/** Compare for a descending sort, unknown values last. */
const descending = (a: Value | null, b: Value | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1;
/** Compare for an ascending sort, unknown values still last. */
const ascending = (a: Value | null, b: Value | null) =>
  a === null || b === null ? descending(a, b) : -descending(a, b);
function order(sort: Sort, asc: boolean, q: string) {
  // When it was saved, as its place among what's saved: the API lists them in the order they were
  // saved, and a click on Save adds to the end (see account-client.ts).
  const savedAt = new Map(sort === "saved" ? [...account.saved].map((k, i) => [k, i]) : []);
  const value = (e: Entry): Value | null =>
    sort === "growth"
      ? growthOf(e)
      : sort === "saved"
        ? (savedAt.get(saveKey(isBundle(e) ? "bundle" : "skill", e.id)) ?? null)
        : PROPS[sort as Prop].of(e);
  return (a: Entry, b: Entry) =>
    (sort === "match"
      ? matchScore(b, q) - matchScore(a, q)
      : (asc ? ascending : descending)(value(a), value(b))) ||
    descending(installsOf(a), installsOf(b)) ||
    bundleFirst(a, b) ||
    nameOf(a).localeCompare(nameOf(b));
}

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

/** The filtered, sorted list. With bundles, a skill that isn't listedOutsideBundle is only listed in its bundle's row. */
function compute(st: State): Results {
  const matching = [
    ...(st.show === "skills" ? [] : data.bundles.filter((b) => bundlePasses(b, st))),
    ...(st.show === "bundles" ? [] : data.skills.filter((s) => listsAlone(s, st) && passes(s, st))),
  ].sort(order(st.sort, st.asc, st.q));
  return { list: matching, total: matching.length, bundles: matching.filter(isBundle).length };
}

/**
 * How many skills, or bundles when the list shows only those, have each value of a facet, with the
 * other filters: as many as the list counts once the value is the facet's selected tag.
 *
 * A bundle that the search finds by its own name or words takes some care, as which of its skills
 * it matches through depends on the tag (see matchedThrough): the ones that match the search and
 * have the tag, or else every one that has the tag. So a value also counts the skills that have
 * it and don't match the search, unless one that matches the search has it too. Counting only what
 * the search finds without the tag, a chip said 49 and the list it led to 53.
 */
function counts(st: State, facet: string, valuesOf: (s: Skill) => string[]): Map<string, number> {
  const n = new Map<string, number>();
  const add = (values: string[]) => {
    for (const v of new Set(values)) n.set(v, (n.get(v) ?? 0) + 1);
  };
  const rest = skillFilters(st);
  const unsearched = { ...rest, q: "" };
  const itself = (b: Bundle) => Boolean(term(st)) && matches(bundleText.get(b.id) ?? "", st.q);
  if (st.show === "bundles") {
    // A bundle has a value through any skill the search finds, or through any skill at all when
    // the search finds the bundle itself.
    for (const b of data.bundles)
      if (savedBundle(b, st) && inRanges(b, st)) {
        const through = itself(b) ? unsearched : rest;
        add(
          skillsOf(b)
            .filter((s) => passes(s, through, facet))
            .flatMap(valuesOf),
        );
      }
    return n;
  }
  for (const s of data.skills) if (passes(s, st, facet)) add(valuesOf(s));
  // As in shownSkills: only a search brings in a bundle's skills through the bundle itself.
  if (!term(st) || st.saved || st.show === "skills") return n;
  for (const b of data.bundles) {
    if (!inRanges(b, st) || !itself(b)) continue;
    const skills = skillsOf(b);
    const found = skills.filter((s) => passes(s, rest, facet));
    const foundValues = new Set(found.flatMap(valuesOf));
    for (const s of skills)
      if (!found.includes(s) && passes(s, unsearched, facet))
        add(valuesOf(s).filter((v) => !foundValues.has(v)));
  }
  return n;
}

/** A facet's values on a skill: its tags in that facet, the parents it has through them included. */
const valuesIn = (facet: string) => (s: Skill) => tagsOf(s).filter((t) => facetOf(t) === facet);

/**
 * Every tag, with what the search looks in for it: its name, the tag and its label, and its
 * meaning, which the values of some facets have (see Facet in ../data/types.ts).
 */
const tagFields = new Map<string, { name: string; meaning: string }>();
for (const t of new Set([
  ...data.facets.flatMap((f) => (f.values ?? []).map((v) => tagOf(f, v.id))),
  ...data.skills.flatMap(tagsOf),
]))
  tagFields.set(t, {
    name: plain(`${t} ${tagLabel(t) ?? ""}`),
    meaning: plain(tagInfo.get(t) ?? ""),
  });

/**
 * How well a tag matches the search: every word of it starts a word of the tag's name, 2 each, or
 * of its meaning, 1 each; 0 when one doesn't. A word must start one, unlike in a skill's text,
 * which is longer: inside words, "git" found flag:dual-use, by "legitimate". A tag named the
 * whole search, its facet aside, scores extra: git and stack:git before stack:github.
 */
function tagScore(tag: string, q: string): number {
  const f = tagFields.get(tag);
  if (!f) return 0;
  const { words, phrase } = read(q);
  let n = 0;
  for (const { start } of words) {
    const w = start.test(f.name) ? 2 : start.test(f.meaning) ? 1 : 0;
    if (!w) return 0;
    n += w;
  }
  const label = tagLabel(tag);
  const named = [tag.slice(tag.indexOf(":") + 1), ...(label ? [label] : [])].map(plain);
  return n + (named.includes(phrase) ? 1 : 0);
}

/**
 * The tags the search finds, best match first, each with how many skills (or bundles, when the list
 * shows only those) have it with the other filters. One of them takes the search's place when
 * picked (see list-client.ts), so it counts as the list will then, without the search. Those that
 * count none are left out, unless selected, as the facets leave them out. For one state at a time.
 */
let lastFound: { st: State; tags: [tag: string, n: number][] } | undefined;
function foundTags(st: State): [tag: string, n: number][] {
  if (lastFound?.st === st) return lastFound.tags;
  const unsearched = { ...st, q: "" };
  const byFacet = new Map<string, Map<string, number>>();
  const countOf = (t: string) => {
    const facet = facetOf(t);
    let n = byFacet.get(facet);
    if (!n) byFacet.set(facet, (n = counts(unsearched, facet, valuesIn(facet))));
    return n.get(t) ?? 0;
  };
  const tags = !term(st)
    ? []
    : [...tagFields.keys()]
        .map((t) => ({ t, score: tagScore(t, st.q) }))
        .filter(({ score }) => score > 0)
        .map(({ t, score }) => ({ t, score, n: countOf(t) }))
        .filter(({ t, n }) => n > 0 || st.tags.includes(t))
        .sort((a, b) => b.score - a.score || b.n - a.n || a.t.localeCompare(b.t))
        .map(({ t, n }): [string, number] => [t, n]);
  lastFound = { st, tags };
  return tags;
}

/**
 * Each slider's histogram: how many skills, or bundles when the list shows only those, have a
 * value between each two neighboring stops, one bar per step of the slider. A slider counts with
 * the other filters, as a facet's chips do, but not with its own range, so that its bars outside
 * the range show what widening it would bring back. For one state at a time.
 */
type Histograms = Record<Prop, number[]>;
let lastHistograms: { st: State; h: Histograms } | undefined;
function histograms(st: State): Histograms {
  if (lastHistograms?.st === st) return lastHistograms.h;
  const h = Object.fromEntries(
    PROP_IDS.map((p) => [p, Array<number>(lastStop(p)).fill(0)]),
  ) as Histograms;
  const add = (e: Entry) => {
    // An entry that only one range leaves out counts in that slider's histogram only.
    const out = PROP_IDS.filter((p) => !inRange(e, p, st.ranges[p]));
    for (const p of out.length === 0 ? PROP_IDS : out.length === 1 ? out : []) {
      const v = PROPS[p].of(e);
      // The stops end above every value, so every known value has its bar.
      const bar = v === null ? -1 : PROPS[p].stops.findIndex((stop) => v < stop) - 1;
      if (bar >= 0) h[p][bar]++;
    }
  };
  const unranged = { ...st, ranges: fullRanges() };
  if (st.show === "bundles") {
    for (const b of data.bundles) if (bundlePasses(b, unranged)) add(b);
  } else for (const s of shownSkills(unranged)) add(rangedBy(s, st));
  lastHistograms = { st, h };
  return h;
}

// ------------------------------------------------------------------- asking an agent

/** The active filters in words, the search included. */
function filtersText(st: State): string[] {
  const parts = st.tags.map((t) => `tag ${t}`);
  if (term(st)) parts.unshift(`the search "${term(st)}"`);
  if (st.saved) parts.unshift("the ones I saved");
  if (st.repo) parts.push(`from ${st.repo}`);
  for (const p of PROP_IDS)
    if (isNarrowed(st.ranges[p])) parts.push(`${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`);
  return parts;
}

/**
 * The state whose list the agent's prompt holds: the list below, unless its search finds nothing.
 * A search that finds nothing is most likely a need in the person's own words, which is what the
 * agent is for, so the prompt then holds what the filters leave, rather than nothing. For one state
 * at a time.
 */
let lastAsk: { st: State; of: State } | undefined;
function askState(st: State): State {
  if (lastAsk?.st !== st)
    lastAsk = { st, of: term(st) && !results(st).list.length ? { ...st, q: "" } : st };
  return lastAsk.of;
}

/**
 * An entry as the agent's prompt lists it: its name and its path, its repo, numbers and tags, and
 * its glance. Written once each, as no filter changes it: the prompt is put together again, for the
 * line under the agent's box to say its size, with each letter typed in the search, and writing a
 * thousand entries anew took as long as the search itself.
 */
const promptEntries = new Map<Entry, string>();
function promptEntry(e: Entry): string {
  let text = promptEntries.get(e);
  if (text !== undefined) return text;
  const review = e.agentReview;
  const numbers = [
    installsOf(e) !== null ? `${compact(installsOf(e) as number)} installs` : "",
    starsOf(e) !== null ? `${compact(starsOf(e) as number)} stars` : "",
  ].filter(Boolean);
  const head = isBundle(e)
    ? `### ${nameOf(e)} (${idPath(bundlePage(e))}/): a bundle of ${skillsOf(e)
        .map((s) => s.name)
        .join(", ")}`
    : `### ${e.name} (${idPath(skillPage(e))}/)`;
  const tags = isBundle(e) ? [] : e.agentReview.tags.filter((t) => !quiet(t));
  // As in its row: its description stands in for a glance it doesn't have.
  const facts = review.tldr?.glance.length
    ? review.tldr.glance.map((g) => `- ${g.label}: ${g.text}`)
    : [`- ${review.description}`];
  text = [
    head,
    [repoKey(e), ...numbers, tags.length ? `tags: ${tags.join(", ")}` : ""]
      .filter(Boolean)
      .join(" · "),
    ...facts,
  ].join("\n");
  promptEntries.set(e, text);
  return text;
}

/**
 * A prompt to paste into any chat agent, for a need in your own words, which the search can't
 * match: the catalog is the list below, every entry the filters and the search leave (see
 * askState); "" for a need that comes in the next message. `base` is the site's absolute URL, which
 * the entries' paths are relative to.
 */
export function askPrompt(shown: State, need: string, base: string): string {
  const st = askState(shown);
  const { list } = results(st);
  const filters = filtersText(st);
  return `I'm looking for an agent skill: a SKILL.md that teaches a coding agent (Claude Code, Codex, Cursor…) how to do something. Below is the catalog of SkillHub, a directory of agent-reviewed skills${
    filters.length ? `, narrowed to: ${filters.join("; ")}` : ""
  }.

Using only this catalog, pick the skills that best fit my need, best first, at most 5. For each, give its name, its link, why it fits, and anything that could make it a poor fit (what it needs, what it won't do). If skills fit only together, say so. If none fits well, say so plainly. If my need is too vague to choose, ask me first.

Each entry's link is its path in parentheses, after ${base}

# Catalog (${list.length} ${list.length === 1 ? "entry" : "entries"})

${list.map(promptEntry).join("\n\n")}

# My need

${need.trim() || "I'll tell you in my next message."}`;
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

/**
 * The row's numbers, on its left: each as its icon, the number, and a histogram of the catalog's
 * values with its own bar and rank (see crowdHtml). The one the list is sorted by is on grey.
 */
function propsHtml(e: Entry, st: State): string {
  const row = (
    on: boolean,
    info: { icon: string; tag?: string },
    label: string,
    title: string | null,
    shown: string,
    chart: string,
  ) =>
    `<div${on ? ` class="on"` : ""}${title === null ? "" : ` title="${esc(`${label}: ${title}`)}"`}><dt>${info.icon}${info.tag ? `<span class="prop-tag" aria-hidden="true">${info.tag}</span>` : ""}<span class="sr-only">${label}</span></dt><dd class="prop-value">${shown}</dd>${chart}</div>`;
  const rows = PROP_IDS.map((p) => {
    const info = PROPS[p];
    const v = info.of(e);
    // Ages count up to the data's date, as the Age slider does, not to the viewer's day.
    const shown =
      v === null ? "—" : info.date ? age(v as string, data.asOf.installs) : compact(v as number);
    let title = v === null ? null : info.title(e);
    let chart = "";
    if (info.crowd && v !== null) {
      const n = info.date ? days(v as string) : (v as number);
      title += `. ${placeText(info.crowd, n)}`;
      chart = crowdHtml(p, info.crowd, n, "dd", true);
    }
    return row(p === st.sort, info, info.label, title, shown, chart);
  });
  // The growth shows only while the list is sorted by it, to explain the order.
  if (st.sort === "growth") {
    const g = growthOf(e);
    const title = `${GROWTH.title(e)}${g === null ? "" : `. ${placeText(GROWTH.crowd, g)}`}`;
    const chart = g === null ? "" : crowdHtml("growth", GROWTH.crowd, g, "dd", true);
    rows.push(row(true, GROWTH, GROWTH.label, title, g === null ? "—" : percent(g), chart));
  }
  return `<dl class="props">${rows.join("")}</dl>`;
}

/** Where a bar is in the chart's viewBox: its left edge and its width. */
const barX = (i: number) => (i * 100) / BINS + BAR_GAP / 2;
const BAR_WIDTH = 100 / BINS - BAR_GAP;

/**
 * A histogram of the catalog's values, lowest on the left: its bars are drawn once per page, as
 * crowdDefsHtml; the row draws its own value's bar over them in garnet, as tall as it is. With
 * `rank`, its rank in words under it, such as "Top #34" or "Oldest 23%", which slides with its bar:
 * under the first bar it starts where the chart starts, under the last it ends where it ends.
 */
function crowdHtml(id: string, c: Crowd, n: number, tag: "dd" | "div", rank: boolean): string {
  const bin = c.binOf(n);
  const h = c.bars[bin];
  const bar = h
    ? `<rect class="me" x="${barX(bin).toFixed(2)}" y="${(20 - h).toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" />`
    : "";
  return `<${tag} class="crowd" style="--at: ${(bin / (BINS - 1)).toFixed(3)}"><svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><use href="#crowd-${id}" />${bar}</svg>${
    rank ? `<span class="rank">${rankText(c, n)}</span>` : ""
  }</${tag}>`;
}

/**
 * Its rank, at a glance: up to #99, its place, such as "Top #34"; further down, the share of the
 * field at or above it, such as "Top 12%", or, past the middle, at or below it, such as
 * "Bottom 8%". For an age, "Newest" and "Oldest".
 */
function rankText(c: Crowd, n: number): string {
  const place = c.placeOf(n);
  const [top, bottom] = c.ends;
  if (place < 100) return `${top} #${place}`;
  return place <= c.total / 2
    ? `${top} ${Math.ceil((place / c.total) * 100)}%`
    : `${bottom} ${Math.ceil(((c.total - place + 1) / c.total) * 100)}%`;
}

/** Such as "#34 of 1,190 skills", or "#586 of 1,190 skills, newest first". */
const placeText = (c: Crowd, n: number) =>
  `#${number(c.placeOf(n))} of ${plural(c.total, c.what)}${c.order ? `, ${c.order}` : ""}`;

/**
 * Where an entry's number stands among the catalog's, for the skill's page: its place, in words,
 * such as "More weekly downloads than 97% of skills", and the histogram the rows show (see
 * crowdHtml) with its scale under it. Null when the number is unknown, or doesn't rank. The page
 * adds crowdDefsHtml.
 */
export function standingOf(
  p: Prop,
  e: Entry,
): { place: string; words: string; chart: string } | null {
  const { of, date: isDate, crowd: c, standing: say } = PROPS[p];
  const v = of(e);
  if (!c || !say || v === null) return null;
  const n = isDate ? days(v as string) : (v as number);
  const place = c.placeOf(n);
  const below = c.belowOf(n);
  // Past the middle, the share it beats; before it, the share that beats it.
  const share = (k: number) => `<em>${Math.floor((k / c.total) * 100)}%</em> of ${c.what}s`;
  const words =
    place === 1
      ? say.most
      : below >= c.total / 2
        ? `${say.more} ${share(below)}`
        : `${say.fewer} ${share(place - 1)}`;
  const axis = c.ticks
    .map(([at, label]) => `<span style="--at: ${at.toFixed(3)}"><span>${label}</span></span>`)
    .join("");
  return {
    place: placeText(c, n),
    words,
    chart: `${crowdHtml(p, c, n, "div", false)}<div class="crowd-axis" aria-hidden="true">${axis}</div>`,
  };
}

/**
 * The histograms' grey bars, which the rows' charts draw (see crowdHtml), and the icons (see
 * prop-icons.ts), once per page that lists rows or tiles. The bars take their color from the
 * chart's CSS.
 */
export function crowdDefsHtml(): string {
  const charts: [string, Crowd | undefined][] = [
    ...PROP_IDS.map((p): [string, Crowd | undefined] => [p, PROPS[p].crowd]),
    ["growth", GROWTH.crowd],
  ];
  const groups = charts.map(([id, c]) => {
    if (!c) return "";
    const bars = c.bars
      .map((h, i) =>
        h
          ? `<rect x="${barX(i).toFixed(2)}" y="${(20 - h).toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" />`
          : "",
      )
      .join("");
    return `<g id="crowd-${id}">${bars}</g>`;
  });
  return `<svg class="crowd-defs" aria-hidden="true"><defs>${groups.join("")}${iconDefsHtml()}</defs></svg>`;
}

/**
 * A row's link to its page, beside its thumbs and Save, where a click on the row opens its preview
 * rather than its page: on the skills list, on a wide screen (see #preview in style.css). Elsewhere
 * the row itself leads there, and its name. For the pointer alone: the row's name is that link
 * already, for the keyboard and screen readers, to which this one was a second stop in every row, a
 * thousand in the list, each called All details.
 */
const detailsLink = (page: string) =>
  `<a class="details" href="${page}" tabindex="-1" aria-hidden="true">All details</a>`;

/** A row's repo, as a link to its page. */
const sourceHtml = (e: Entry) =>
  `<span class="skill-source"><a class="repo-link" href="${repoHref(repoKey(e))}">${esc(repoKey(e))}</a></span>`;

/**
 * A skill's row. `outside` is for a row outside the skills list, on a page about its repo: its tags
 * link to the list, filtered by them, rather than toggling its filters, and it doesn't repeat the repo.
 */
function skillRow(s: Skill, st: State, outside = false): string {
  const tags = s.agentReview.tags
    .filter((t) => !quiet(t))
    .sort((a, b) => FACET_ORDER.indexOf(facetOf(a)) - FACET_ORDER.indexOf(facetOf(b)));
  const caution = s.agentReview.tags.some((t) => CAUTION.includes(t));
  const place = bundleOf.get(s.id);
  return `
    <li class="skill${caution ? " caution" : ""}">
      <div class="skill-body">
      <div class="row-head">
      <div class="skill-head">
        <h3><a class="skill-name" href="${skillHref(s.id)}">${esc(s.name)}</a></h3>
        ${outside ? "" : sourceHtml(s)}${
          place
            ? `<span class="skill-source">${place.standalone ? "Part of" : "Only works as part of"} <a href="${bundleHref(place.bundle.id)}">${esc(place.bundle.agentReview.name)}</a></span>`
            : ""
        }
      </div>
      ${detailsLink(skillHref(s.id))}${thumbsHtml(saveKey("skill", s.id), s.name)}${saveButton(saveKey("skill", s.id), s.name)}
      </div>
      ${s.agentReview.tldr?.glance.length ? glanceHtml(s.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(s.agentReview.description)}</p>`}
      <div class="tags">${tags.map((t) => tagChip(t, outside ? skillsLink({ tags: [t] }) : null, st.tags.includes(t))).join("")}</div>
      </div>
      ${propsHtml(s, st)}
    </li>`;
}

/** A bundle's row; `outside` as for skillRow(). */
function bundleRow(b: Bundle, st: State, outside = false): string {
  // When filtering, the skills the bundle doesn't match through are dimmed. The ranges are about the
  // bundle, so only the tags and search dim its skills.
  const hits = isFiltered(st) ? matchedThrough(b, st) : [];
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
        ${outside ? "" : sourceHtml(b)}
      </div>
      ${detailsLink(bundleHref(b.id))}${thumbsHtml(saveKey("bundle", b.id), b.agentReview.name)}${saveButton(saveKey("bundle", b.id), b.agentReview.name)}
      </div>
      ${b.agentReview.tldr?.glance.length ? glanceHtml(b.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(b.agentReview.description)}</p>`}
      <p class="members">${members.join(", ")}</p>
      </div>
      ${propsHtml(b, st)}
    </li>`;
}

/**
 * A facet of the sidebar. One with no tag to list says None and keeps its place, rather than go:
 * its heading stays where it is while a search is typed. On purpose also when the search finds
 * nothing, and every facet says None.
 */
function section(title: string, question: string | null, chips: string): string {
  return `<section class="facet"><h2${question ? ` title="${esc(question)}"` : ""}>${esc(title)}</h2><div class="chips">${chips || `<span class="muted">None</span>`}</div></section>`;
}

/** A facet's tags, with their counts for the other filters. Adds the tags it lists to `listed`. */
function tagSection(st: State, facetId: string, listed: Set<string>): string {
  const facet = facetById.get(facetId);
  if (!facet) return "";
  const n = counts(st, facetId, valuesIn(facetId));
  const label = (t: string) => tagLabel(t) ?? t.slice(facetId.length + 1);
  const shown = (t: string) => Boolean(n.get(t) || st.tags.includes(t));
  const chip = (t: string) => {
    listed.add(t);
    return filterChip("data-tag", t, label(t), n.get(t) ?? 0, st.tags.includes(t), tagInfo.get(t));
  };
  // A parent's values sit indented under it; a value with two parents shows under both.
  const top = (facet.values ?? [])
    .map((v) => tagOf(facet, v.id))
    .filter((t) => !parentsOf(t).length);
  const chips = top
    .map((t) => {
      const children = includedBy(t).filter(shown);
      return `${shown(t) ? chip(t) : ""}${children.length ? `<div class="chips sub">${children.map(chip).join("")}</div>` : ""}`;
    })
    .join("");
  return section(facet.name, facet.question, chips);
}

/**
 * The tags the facets list for a state: every tag the skills the other filters leave have, and the
 * selected ones, each once (a value under two parents shows under both), the stack's that "Show
 * all" hides included. facetSections notes them as it renders them, for one state at a time.
 */
let lastListed: { st: State; tags: Set<string> } | undefined;
function listedOf(st: State): Set<string> {
  if (lastListed?.st !== st) facetSections(st, false);
  return (lastListed as { tags: Set<string> }).tags;
}

/** The tag facets, Category to Stack, each with its tags: see listedOf. */
function facetSections(st: State, stackExpanded: boolean): string {
  const sections: string[] = [];
  const listed = new Set<string>();
  // Flags before Topics and Stack, unlike FACET_ORDER, and on purpose: those two are the long
  // ones, and under them the few flags, which say what to check before installing, would be out
  // of sight.
  for (const f of ["category", "type", "effect", "needs", "by", "flag"])
    sections.push(tagSection(st, f, listed));
  // Topics, by group.
  const topic = facetById.get("topic");
  const topicCounts = counts(st, "topic", (s) =>
    s.agentReview.tags.filter((t) => facetOf(t) === "topic"),
  );
  const groups = (topic?.groups ?? [])
    .map((g) => {
      const values = g.values.filter((v) => topicCounts.get(v) || st.tags.includes(v));
      for (const v of values) listed.add(v);
      const chips = values
        .map((v) => filterChip("data-tag", v, v, topicCounts.get(v) ?? 0, st.tags.includes(v)))
        .join("");
      return chips ? `<h3 class="group">${esc(g.name)}</h3><div class="chips">${chips}</div>` : "";
    })
    .join("");
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
  ].sort((a, b) => (stackCounts.get(b) ?? 0) - (stackCounts.get(a) ?? 0) || a.localeCompare(b));
  for (const t of stack) listed.add(t);
  const shown = stackExpanded ? stack : stack.slice(0, 16);
  sections.push(
    section(
      "Stack",
      facetById.get("stack")?.question ?? null,
      shown
        .map((t) =>
          filterChip("data-tag", t, t.slice(6), stackCounts.get(t) ?? 0, st.tags.includes(t)),
        )
        .join("") +
        (stack.length > 16
          ? `<button type="button" class="link-button" data-action="stack">${stackExpanded ? "Show fewer" : `Show all ${stack.length}`}</button>`
          : ""),
    ),
  );
  lastListed = { st, tags: listed };
  return sections.join("");
}

/**
 * How many tags the tags' column lists, as its heading and the line under the search box count
 * them: those the search finds, while there's one (see foundTags), or else those of the facets.
 */
const tagCountOf = (st: State) => (term(st) ? foundTags(st).length : listedOf(st).size);

/**
 * A tag the search finds, as the rows write it: picking it filters by it in place of the search
 * (see list-client.ts), and its count is the skills it then lists. Its tooltip is its meaning,
 * which may be why the search found it. One too long for the tags' column, such as
 * category:software-engineering, breaks after its facet, its value whole on the next line (see
 * .tag-value in style.css), rather than at a hyphen inside the value.
 */
function foundChip(t: string, n: number, pressed: boolean): string {
  const colon = t.indexOf(":");
  const name =
    colon < 0
      ? esc(t)
      : `<span class="tag-facet">${esc(t.slice(0, colon + 1))}</span><wbr><span class="tag-value">${esc(t.slice(colon + 1))}</span>`;
  const title = [tagInfo.get(t), pressed ? "" : "Filters by this tag in place of the search."]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="chip" data-tag="${esc(t)}" data-replaces-search aria-pressed="${pressed}" title="${esc(title)}"><span>${name}</span><span class="n">${n}</span></button>`;
}

/**
 * The tags' column, under how many tags it lists (see tagCountOf). While there's a search, two
 * boxes: first the tags the search finds, then, under how many they are, the tags of the skills it
 * finds, which are the facets. On narrow screens the count is a button that shows and hides them,
 * which are hidden at first: see list-client.ts.
 *
 * With no tag to list, the facets aren't there: an empty list has no tags, and each of the eight
 * facets said "None" under "0 tags of the 0 skills", a column of them beside a search that found
 * nothing. What's left says why, in a line.
 */
export function facetsHtml(st: State, stackExpanded: boolean): string {
  const count = plural(tagCountOf(st), "tag");
  const head = `<h2 class="list-count"><span class="tags-count">${count}</span><button type="button" class="tags-toggle" data-action="tags" aria-expanded="false" aria-controls="tag-facets">${count}${CHEVRON}</button></h2>`;
  const sections = facetSections(st, stackExpanded);
  const listed = listedOf(st).size;
  const none = `<span class="muted">No tags: the list is empty.</span>`;
  const facets = `<div id="skill-tags" class="tag-box">${listed ? sections : `<div class="chips">${none}</div>`}</div>`;
  if (!term(st)) return `${head}<div id="tag-facets" class="tag-facets">${facets}</div>`;
  const found = foundTags(st)
    .map(([t, n]) => foundChip(t, n, st.tags.includes(t)))
    .join("");
  // Not "of the 0 skills": the tags a filter keeps listed when the search finds nothing with it,
  // which are the selected ones and those that would bring skills back, are of no skill listed.
  const of = shownOf(st)
    ? ` of the ${plural(shownOf(st), unitOf(st))}${savedBundlesHtml(st, true)}`
    : "";
  // Where the filters leave nothing, there's no tag for the search to find, whatever its words.
  const unfound = scopeOf(st)
    ? `<span class="muted">No tag matches “${esc(term(st))}”.</span>`
    : none;
  return `${head}<div id="tag-facets" class="tag-facets"><div id="found-tags" class="tag-box"><div class="chips">${
    found || unfound
  }</div></div>${listed ? `<h2 class="tags-of">${plural(listed, "tag")}${of}</h2>${facets}` : ""}</div>`;
}

/** Whether filters narrow the list: the search and the agent prompt then look through what they leave. */
const filtersOn = (st: State) =>
  Boolean(st.saved || st.tags.length || st.repo) || PROP_IDS.some((p) => isNarrowed(st.ranges[p]));

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
          : shownSkills(st).length,
    };
  return lastShown.n;
};

/** Over the list: how many skills (or bundles) it shows. */
export function countHtml(st: State): string {
  return `${plural(shownOf(st), unitOf(st))}${savedBundlesHtml(st, true)}`;
}

/**
 * What you saved is counted as you saved it: a saved bundle is one more entry, not its skills,
 * which the skills' count leaves out unless you saved them too. So, with Saved on and the list
 * showing skills and bundles, the counts add " and 1 bundle", and they add up to the Saved
 * switch's. `search`: whether to count only those the search finds.
 */
function savedBundlesHtml(st: State, search: boolean, badge = (s: string) => s): string {
  if (!st.saved || st.show !== "all") return "";
  const rest = search ? st : { ...st, q: "" };
  const n = data.bundles.filter((b) => bundlePasses(b, rest)).length;
  return n ? ` and ${badge(number(n))} bundle${n === 1 ? "" : "s"}` : "";
}

/** Every key a Save button can save: what the Saved switch counts (see `account.listed`). */
const listedKeys = new Set([
  ...data.skills.map((s) => saveKey("skill", s.id)),
  ...data.bundles.map((b) => saveKey("bundle", b.id)),
]);
export const isListed = (key: string) => listedKeys.has(key);

/**
 * The search's scope, for one state at a time: what the filters leave for it to look through, in
 * words, counted as the list's heading counts, such as "54 skills" or "2 skills and 1 bundle"; ""
 * when they leave nothing.
 */
let lastScope: { st: State; text: string } | undefined;
const scopeOf = (st: State) => {
  if (lastScope?.st !== st) {
    const rest = { ...st, q: "" };
    lastScope = {
      st,
      text: results(rest).list.length
        ? `${plural(shownOf(rest), unitOf(st))}${savedBundlesHtml(st, false)}`
        : "",
    };
  }
  return lastScope.text;
};

/** How many skills (or bundles) the list below shows, as the lines under the boxes say it: the number highlighted. */
function shownCountHtml(st: State): string {
  const n = shownOf(st);
  return `${badgeHtml(number(n))} ${unitOf(st)}${n === 1 ? "" : "s"}${savedBundlesHtml(st, true, badgeHtml)}`;
}

/**
 * Under the search box: what it does, and how many skills (or bundles) the list below shows, and
 * how many tags the tags' column does (see tagCountOf).
 */
export function searchNote(st: State): string {
  const n = tagCountOf(st);
  const tags = `${badgeHtml(number(n))} tag${n === 1 ? "" : "s"}`;
  // "2 skills, 1 bundle and 5 tags", with Saved on: see savedBundlesHtml.
  const shown = shownCountHtml(st).replace(" and ", ", ");
  return `Filters ${shown} and ${tags} below.`;
}

/** The filters, each as its chip says it. */
function filtersOf(st: State): { kind: string; value: string; label: string }[] {
  const filters: { kind: string; value: string; label: string }[] = [];
  if (st.saved) filters.push({ kind: "saved", value: "", label: "Saved" });
  for (const t of st.tags) filters.push({ kind: "tag", value: t, label: t });
  if (st.repo) filters.push({ kind: "repo", value: st.repo, label: `from ${st.repo}` });
  for (const p of PROP_IDS)
    if (isNarrowed(st.ranges[p]))
      filters.push({
        kind: "range",
        value: p,
        label: `${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`,
      });
  return filters;
}

/**
 * The filters, as chips each with its × to remove it: after a space that doesn't break, so that a
 * chip that wraps, as a long repo's on a phone, keeps its × with its last word.
 */
function scopeChipsHtml(st: State): string {
  return filtersOf(st)
    .map(
      ({ kind, value, label }) =>
        `<button type="button" class="scope-chip" data-remove="${kind}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label)}">${esc(label)}&nbsp;<span aria-hidden="true">×</span></button>`,
    )
    .join(" ");
}

/**
 * The page's title for a list that a search or filters narrow: what it's narrowed to, the search
 * first, then the filters as their chips say them, such as "“design”, type:workflow · SkillHub".
 * Null for the whole list, which keeps the page's own title. Every list had that one, so a tab, a
 * bookmark or the history couldn't tell one search from another.
 */
export function titleOf(st: State): string | null {
  const parts = [...(term(st) ? [`“${term(st)}”`] : []), ...filtersOf(st).map((f) => f.label)];
  return parts.length ? `${parts.join(", ")} · SkillHub` : null;
}

/**
 * Beside the count over the list: the filters as chips, and Clear filters. Nothing without filters:
 * the count says how many skills there are.
 */
export function scopeHtml(st: State): string {
  if (!filtersOn(st)) return "";
  return `${scopeChipsHtml(st)} <button type="button" class="link-button" data-action="clear">Clear filters</button>`;
}

/**
 * About how many tokens a prompt takes: an estimate. The site has no tokenizer, and each model
 * counts with its own. At 4 characters a token, the count is within some 5% of what the tokenizers
 * of GPT-4o and GPT-4 give for these prompts, and Claude's older one. It's said without a ~, on
 * purpose: in thousands, as 203K, a number already reads as about so many.
 */
export const tokensOf = (prompt: string) => Math.round(prompt.length / 4);
/**
 * A prompt's size, its number highlighted, as the line under the agent's box says it: 203K tokens.
 * Under a thousand it's rounded to the ten, as an estimate is: 330 rather than 333, which the line
 * after the click would give as 332, for the few letters by which the copied prompt differs.
 */
export const tokensHtml = (tokens: number) =>
  `${badgeHtml(compact(tokens < 1000 ? Math.round(tokens / 10) * 10 : tokens))} tokens`;

/** A number highlighted in the line under a box. */
const badgeHtml = (text: string) => `<span class="badge">${esc(text)}</span>`;

/**
 * Under the agent's box: what Find with your agent copies, the list below, and its size. When the
 * search finds nothing, that's what the filters leave: see askState.
 */
export function askLabel(st: State): string {
  if (!askable(st)) return "The list below is empty: there's nothing to copy.";
  const of = askState(st);
  const copies = `Copies a prompt of ${tokensHtml(promptTokens(st))} to your clipboard that includes the TL;DR of`;
  if (of !== st)
    return filtersOn(of)
      ? `${copies} the ${shownCountHtml(of)} the filters leave.`
      : `${copies} all ${shownCountHtml(of)}.`;
  // "the", not "these": it reads right for one, too, as in "the 1 skill below".
  const which = filtersOn(st) || term(st) ? "the" : "all";
  return `${copies} ${which} ${shownCountHtml(st)} below.`;
}

/**
 * Whether there's anything for the agent's prompt to hold: not when the filters leave nothing,
 * nor for a Saved list that's empty or asks to log in. A search that finds nothing still has what
 * the filters leave: see askState.
 */
export const askable = (st: State) => results(askState(st)).list.length > 0;

/**
 * About how many tokens the prompt for a state takes (see tokensOf), before the need is typed: a
 * large catalog can be too much for some agents. For one state at a time.
 */
let lastPrompt: { st: State; tokens: number } | undefined;
function promptTokens(st: State): number {
  if (lastPrompt?.st !== st) lastPrompt = { st, tokens: tokensOf(askPrompt(st, "", href())) };
  return lastPrompt.tokens;
}

const rowHtml = (e: Entry, st: State) => (isBundle(e) ? bundleRow(e, st) : skillRow(e, st));

/**
 * Rows outside the skills list, on a page about their repo: what the page passes, in its order,
 * with Downloads highlighted, as they're most installed first. The page adds crowdDefsHtml once.
 */
export function listingHtml(entries: Entry[]): string {
  const st: State = { ...fresh(), sort: "downloads" };
  return `<ol class="skill-list">${entries
    .map((e) => (isBundle(e) ? bundleRow(e, st, true) : skillRow(e, st, true)))
    .join("")}</ol>`;
}

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
  // Nothing that's still listed, as the Saved switch counts: a saved skill can leave the list.
  if (![...account.saved].some(isListed))
    return `<p class="empty">Nothing saved yet. Each skill and bundle has a Save button, here in the list and on its page.</p>`;
  return null;
}

/**
 * Instead of the list, when nothing is left to list: whether it's the search that finds nothing
 * among what the filters leave, or the filters that leave nothing, with the way out of each.
 */
function emptyHtml(st: State): string {
  const what = st.show === "all" ? "skill or bundle" : unitOf(st);
  const clear = `<button type="button" class="link-button" data-action="clear">Clear filters</button>`;
  const found = `No ${what} matches “${esc(term(st))}”`;
  const said = !filtersOn(st)
    ? term(st)
      ? `${found}.`
      : `No ${what} to list.`
    : term(st) && scopeOf(st)
      ? `${found} among the ${scopeOf(st)} the filters leave. ${clear}`
      : `No ${what} matches the filters. ${clear}`;
  // A search that finds nothing may be a need in the person's own words, which is the agent's job.
  const ask =
    term(st) && askable(st)
      ? `<br />Describing a need in your own words? <button type="button" class="link-button" data-action="ask">Find with your agent</button>`
      : "";
  return `<p class="empty">${said}${ask}</p>`;
}

/**
 * The count, the active filters and the list, of only its first `limit` rows if given. Over a list
 * of one repo's skills, the repo and what it is: its name leads to its page, as it does in each of
 * the rows under it, rather than to GitHub, which its page leads to.
 */
export function resultsHtml(st: State, limit = Infinity): string {
  const { list } = results(st);
  const repoNote = st.repo ? repoById.get(st.repo) : undefined;
  return `
    ${savedNote(st) ?? ""}
    ${repoNote ? `<p class="repo-banner"><a href="${repoHref(repoNote.id)}">${esc(repoNote.id)}</a>${repoNote.agentReview.description ? ` <span>${esc(repoNote.agentReview.description)}</span>` : ""}</p>` : ""}
    ${
      savedNote(st) !== null
        ? ""
        : list.length
          ? `<ol class="skill-list">${list
              .slice(0, limit)
              .map((e) => rowHtml(e, st))
              .join("")}</ol>`
          : emptyHtml(st)
    }`;
}

/**
 * A slider's histogram's bars (see histograms), each as tall as its count against the tallest; one
 * with a count is at least a few pixels tall, so that it doesn't pass for none. The bars outside the
 * range fade. The client re-renders them with the list, as their counts follow the filters.
 */
export function histogramHtml(st: State, p: Prop): string {
  const bars = histograms(st)[p];
  const max = Math.max(1, ...bars);
  const [lo, hi] = rangePositions(p, st.ranges[p]);
  return bars
    .map((n, i) => {
      // How much of its step is in the range: all of it, none, or, where a typed bound lies between
      // two stops, the part up to the bound, which the bar fills that far (see .part in style.css).
      const from = Math.max(lo, i) - i;
      const to = Math.min(hi, i + 1) - i;
      const part = to - from > 0.999 ? "" : to - from < 0.001 ? "out" : "part";
      const fill =
        part === "part"
          ? `; --from: ${(from * 100).toFixed(1)}%; --to: ${(to * 100).toFixed(1)}%`
          : "";
      return `<span${part ? ` class="${part}"` : ""} style="--h: ${n ? Math.max(0.08, n / max).toFixed(3) : 0}${fill}" title="${esc(`${rangeLabel(p, stepRange(p, i))}: ${plural(n, unitOf(st))}`)}"></span>`;
    })
    .join("");
}

/**
 * Under a histogram, some of its stops' values, each under its stop: for counts, 0 and the powers
 * of 10 at least 3 steps apart, such as 0, 100, 1K, 10K; for dates, some of the ages: AGE_MARKS.
 */
function axisHtml(p: Prop): string {
  const { stops, date } = PROPS[p];
  const last = lastStop(p);
  const labels: [number, string][] = [];
  if (date)
    AGES.forEach((n, i) => {
      if (AGE_MARKS.includes(n)) labels.push([i + 1, ageShort(n)]);
    });
  else
    stops.forEach((v, i) => {
      const decade = v === 0 || Number.isInteger(Math.log10(v as number));
      if (decade && (!labels.length || i - labels[labels.length - 1][0] >= 3))
        labels.push([i, compact(v as number)]);
    });
  return labels.map(([i, text]) => `<span style="--at: ${i / last}">${text}</span>`).join("");
}

/**
 * Inline, right after the search box, so that it runs before the rest of the page shows. The page
 * is pre-rendered unfiltered, and its script, list-client.ts, comes last, after megabytes of rows:
 * - A link to another list, such as a search's, would show the unfiltered one until then, and a
 *   list returned to, such as from a skill's page, its top. It marks <html data-pending>, which
 *   hides the settings and the list (see style.css) until the script has rendered what the link
 *   asks for, where it was left, and puts the link's search in the box.
 * - A search typed until then would do nothing. It marks the box, for the script to search for
 *   what it holds.
 */
const PENDING_SCRIPT = `(() => {
  const q = document.getElementById("q");
  if (location.search || history.state?.at) {
    document.documentElement.dataset.pending = "";
    q.value = new URLSearchParams(location.search).get("q") || "";
  }
  q.addEventListener("input", () => { q.dataset.typed = ""; }, { once: true });
})();`;

const CHEVRON = `<svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>`;

/**
 * A pill per property, with its range; a click opens its two-handled slider in a popover under the
 * pill (see list-client.ts), with a histogram above it. The client updates them in place while a
 * slider is dragged.
 */
export function rangesHtml(st: State): string {
  return PROP_IDS.map((p) => {
    const range = st.ranges[p];
    const [lo, hi] = rangePositions(p, range);
    const last = lastStop(p);
    const { label } = PROPS[p];
    const value = `<span data-range-label="${p}">${rangeLabel(p, range)}</span>`;
    // step="any", so that a typed bound between two stops puts its handle there; a dragged handle
    // stops at a stop all the same, as do the arrow keys: see list-client.ts.
    const handle = (end: 0 | 1, v: number) =>
      `<input type="range" min="0" max="${last}" step="any" value="${v}" data-range="${p}" data-end="${end}" aria-label="${label}, ${end ? "to" : "from"}" aria-valuetext="${rangeLabel(p, range)}" />`;
    // Where a handle stops, as dots on the track.
    const stops = Array.from(
      { length: last - 1 },
      (_, i) => `<i style="--at: ${(i + 1) / last}"></i>`,
    ).join("");
    // Any amount, typed, under the slider: the list follows as it's typed, as it does a search.
    const [loWords, hiWords, examples] = fieldWords(p);
    const field = (end: 0 | 1, words: string) =>
      `<div class="range-field"><label for="range-${p}-${end}">${words}</label><input type="text" id="range-${p}-${end}" autocomplete="off" spellcheck="false" placeholder="${examples}" value="${esc(fieldText(p, range[end]))}" data-exact="${p}" data-bound="${end}" aria-describedby="range-error-${p}" /></div>`;
    const fields = `<div class="range-fields">${field(0, loWords)}${field(1, hiWords)}<p class="range-error" id="range-error-${p}" aria-live="polite"></p></div>`;
    const { icon, tag } = PROPS[p];
    // The pill says the word the rows say under a shared icon, such as Total, to fit the settings'
    // line; its popover says the whole name. A name on its own, as Age's and Stars', whose
    // icons are theirs alone, gives way to the range once it narrows the list: see .range-word in
    // style.css.
    const short = tag
      ? `<span class="range-name">${icon}<span aria-hidden="true">${tag}</span><span class="sr-only">${label}</span></span>`
      : `<span class="range-name">${icon}<span class="range-word">${label}</span></span>`;
    const name = `<span class="range-name">${icon}${label}</span>`;
    return `<div class="range${isNarrowed(range) ? " narrowed" : ""}" data-range-section="${p}"><button type="button" class="range-pill" data-action="range" data-value="${p}" title="${label}" aria-expanded="false" aria-controls="range-pop-${p}">${short}<span class="range-value">${value}${CHEVRON}</span></button><div class="range-pop" id="range-pop-${p}" role="group" aria-label="${label}" hidden><div class="range-pop-head">${name}${value}</div><div class="histogram${last > 28 ? " dense" : ""}" data-histogram="${p}" aria-hidden="true">${histogramHtml(st, p)}</div><div class="histogram-axis" aria-hidden="true">${axisHtml(p)}</div><div class="slider" data-slider="${p}" style="--lo: ${lo / last}; --hi: ${hi / last}"><span class="slider-stops" aria-hidden="true">${stops}</span>${handle(0, lo)}${handle(1, hi)}</div>${fields}</div></div>`;
  }).join("");
}

/** The presets' buttons, the one the state matches pressed. Re-rendered with the list. */
export const presetsHtml = (st: State) =>
  (Object.keys(PRESETS) as Preset[])
    .map((id) => {
      const p = PRESETS[id];
      const { sort, ranges } = presetPatch(id);
      const on =
        st.sort === sort && !st.asc && PROP_IDS.every((r) => sameRange(st.ranges[r], ranges[r]));
      return `<button type="button" class="preset" data-preset="${id}" data-label="${esc(p.label)}" aria-pressed="${on}" title="${esc(p.title)}">${esc(p.label)}</button>`;
    })
    .join("");

/**
 * Sort by: its menu and its order. Re-rendered with the list, since a search adds Best match, and
 * the Saved switch Recently saved. The sort is a menu of its own, rather than a <select>, to show
 * each option's icon: see list-client.ts for its keys.
 */
export function sortHtml(st: State): string {
  // The sorts, each with its icon: Best match only while searching, Recently saved only while the
  // list shows only what you saved.
  const sorts: [Sort, string, string][] = [
    ...(term(st) ? [["match", SEARCH, "Best match"] as [Sort, string, string]] : []),
    ...(st.saved ? [["saved", SAVED, "Recently saved"] as [Sort, string, string]] : []),
    ...PROP_IDS.map((p): [Sort, string, string] => [p, PROPS[p].icon, PROPS[p].label]),
    ["growth", GROWTH.icon, GROWTH.label],
  ];
  const current = sorts.find(([id]) => id === st.sort) ?? sorts[0];
  // The button keeps the room for the longest name, so that picking another sort doesn't resize it.
  const longest = sorts.reduce((a, [, , label]) => (label.length > a.length ? label : a), "");
  const options = sorts
    .map(
      ([id, icon, label]) =>
        `<li role="option" id="sort-${id}" data-sort="${id}" aria-selected="${id === st.sort}" tabindex="-1">${icon}<span>${label}</span>${id === st.sort ? CHECK : ""}</li>`,
    )
    .join("");
  // The order: both directions as arrows, the current one pressed, their words in their labels.
  const [down, up] =
    st.sort === "saved"
      ? ["Last saved first", "First saved first"]
      : st.sort !== "match" && st.sort !== "growth" && PROPS[st.sort].date
        ? ["Newest first", "Oldest first"]
        : ["Highest first", "Lowest first"];
  const direction = (asc: boolean, arrow: string, words: string) =>
    `<button type="button" data-order="${asc ? "asc" : "desc"}" aria-pressed="${st.asc === asc}" aria-label="${words}" title="${words}">${arrow}</button>`;
  const order =
    st.sort === "match"
      ? ""
      : `<div class="order" role="group" aria-label="Order">${direction(false, "↓", down)}${direction(true, "↑", up)}</div>`;
  return `
    <div class="sort-head"><h2 id="sort-label">Sort by</h2>${order}</div>
    <div class="sort-menu">
      <button type="button" class="sort-button" id="sort" data-action="sort-menu" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-options" aria-labelledby="sort-label sort">${current[1]}<span data-longest="${longest}">${current[2]}</span>${CHEVRON}</button>
      <ul class="sort-options" id="sort-options" role="listbox" aria-labelledby="sort-label" hidden>${options}</ul>
    </div>`;
}

/**
 * Show's buttons: Both, Skills or Bundles. Re-rendered with the list. `data-label`, as on the
 * presets, is the room a button keeps for its words once pressed, and bold: see style.css. Both
 * says what it means in its tooltip, and to a screen reader, which meets it before the two it's
 * the both of.
 */
export const showHtml = (st: State) =>
  SHOWS.map(
    ([v, label, full]) =>
      `<button type="button" data-show="${v}" data-label="${esc(label)}" aria-pressed="${st.show === v}"${
        full ? ` title="${esc(full)}" aria-label="${esc(`${label}: ${full.toLowerCase()}`)}"` : ""
      }>${esc(label)}</button>`,
  ).join("");

/**
 * Before Show's buttons: a switch that shows only what you saved. list-client.ts keeps it in step
 * with the state rather than re-rendering it, so that it slides; account-client.ts keeps its count.
 * On narrow screens, it stays in view while the Filters button hides the rest of the line.
 */
const savedSwitchHtml = (st: State) =>
  `<button type="button" id="saved-switch" class="saved-switch" role="switch" aria-checked="${st.saved}" data-action="saved" title="Show only what you saved">${bookmarkSvg}<span>Saved</span><span class="n" data-saved-count>${savedCount()}</span><span class="switch" aria-hidden="true"></span></button>`;

/**
 * The skills list's page, under the site's header. Across the page's top: its heading; the two ways
 * to search; one line of every setting: the presets, the sort, the number filters and Show. Under
 * them, the tags on the left and the list, each under its count, the list's with the filters'
 * chips; on a wide screen, a click on a row opens its preview over the tags (see
 * preview-client.ts). On
 * narrow screens, the presets and the Saved switch stay in view, and the Filters button, between
 * them, opens the line's other settings; the tags come before the list, behind their count, which
 * opens them, and once open they keep a button at the screen's bottom, which says how many skills
 * they leave and leads to the list (see .tags-done in style.css). The tags come before the list for
 * the keyboard too, some 150 of them: a link atop
 * them, which only shows once it has the focus, skips to the list. `listed` is how many skills the
 * site lists, all of them whatever the list below shows, and `reviewed` how many SkillHub reviewed,
 * both from review.ts, which only the server reads: the line saying so isn't re-rendered.
 *
 * The line under the agent's box has an unseen copy of itself as the page is pre-rendered, its
 * longest, in the same place: the room the line keeps (see .ask-room in style.css).
 */
export function listView(
  st: State,
  { listed, reviewed }: { listed: number; reviewed: number },
): string {
  return `
    <div class="list-top">
      <div class="list-top-in">
        <div class="list-title">
          <h1 class="list-head">Agent skills</h1>
          <p class="list-sub"><a href="${href("about/")}">${number(listed)} skills curated from ${number(reviewed)} reviewed skills</a></p>
        </div>
        <div class="finder">
          <div class="agent-field" data-action="focus-need">
            <svg class="ask-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6.5V4M2 11v3M18 11v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><rect x="4" y="6.5" width="12" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="10" cy="3" r="1.25" fill="currentColor" /><circle cx="7.75" cy="10.75" r="1.25" fill="currentColor" /><circle cx="12.25" cy="10.75" r="1.25" fill="currentColor" /><path d="M8.5 13.75h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="need" class="sr-only">What you need, for your agent</label>
            <input id="need" type="text" placeholder="Describe what you need" autocomplete="off" aria-describedby="ask-label scope" />
            <button type="button" class="ask-button" data-action="ask">Find with your agent</button>
          </div>
          <div class="search-field" data-action="focus-search">
            <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="q" class="sr-only">Search</label>
            <input id="q" type="search" value="${esc(st.q)}" placeholder="Search" autocomplete="off" spellcheck="false" aria-describedby="search-note scope" />
          </div>
          <p class="ask-label ask-room" aria-hidden="true">${askLabel(st)}</p>
          <p id="ask-label" class="ask-label" aria-live="polite">${askLabel(st)}</p>
          <p id="search-note" class="search-note">${searchNote(st)}</p>
          <script>${PENDING_SCRIPT}</script>
        </div>
        <div id="settings" class="settings-line" role="group" aria-label="Settings">
          <section class="setting preset-group" aria-labelledby="presets-label">
            <h2 id="presets-label">Presets</h2>
            <div id="presets" class="presets" role="group" aria-labelledby="presets-label">${presetsHtml(st)}</div>
          </section>
          <button type="button" class="filters-toggle" data-action="filters" aria-controls="settings" aria-expanded="false">Filters</button>
          <section id="sort-group" class="setting sort-group">${sortHtml(st)}</section>
          <section class="setting filter-group" aria-labelledby="filter-label">
            <h2 id="filter-label">Filter</h2>
            <div class="ranges">${rangesHtml(st)}</div>
          </section>
          <section class="setting show-group" aria-labelledby="show-label">
            <h2 id="show-label">Show</h2>
            <div class="show-row">
              ${savedSwitchHtml(st)}
              <div id="show" class="show-switch" role="group" aria-labelledby="show-label">${showHtml(st)}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
    <div class="skills-view">
      <aside id="filters" aria-label="Tags">
        <a class="skip-tags" href="#results">Skip the tags, to the list</a>
        <div id="facets">${facetsHtml(st, false)}</div>
        <div class="tags-done"><button type="button" data-action="tags-done">Show <span data-list-count>${countHtml(st)}</span></button></div>
      </aside>
      <div class="list-main">
        <div class="list-count-row">
          <h2 id="count" class="list-count" aria-live="polite" tabindex="-1">${countHtml(st)}</h2>
          <p id="scope" class="scope">${scopeHtml(st)}</p>
        </div>
        <section id="results" aria-label="Skills">${resultsHtml(st)}</section>
        ${crowdDefsHtml()}
      </div>
      <aside id="preview" class="preview" aria-label="Preview" tabindex="-1" hidden></aside>
    </div>`;
}
