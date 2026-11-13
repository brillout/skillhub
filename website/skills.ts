/** The data behind every page, ../data/skills.jsonc, and what the pages derive from it. */

import raw from "../data/skills.jsonc";
import { daysBefore, esc, glanceEnd, href, plural, textHtml } from "./format.ts";
import type { Facet, Tldr } from "../data/types.ts";
// The browser runs this file, in the skills list, so it types the data as the browser's copy, which
// leaves some fields out: reading one here doesn't type-check. Pages get them from server-data.ts.
import type {
  ClientBundle as Bundle,
  ClientBundleSkill as BundleSkill,
  ClientData as Data,
  ClientSkill as Skill,
} from "./client-data.ts";
import { bundlePage, bundleRepo, github, ownerPage, repoPage, skillPage } from "./github.ts";

export const data = raw as Data;
export const GITHUB = "https://github.com/brillout/skillhub";

export const facetById = new Map(data.facets.map((f) => [f.id, f]));
export const repoById = new Map(data.repos.map((r) => [r.id, r]));
export const skillById = new Map(data.skills.map((s) => [s.id, s]));
export const bundleById = new Map(data.bundles.map((b) => [b.id, b]));
/** The bundle a skill is in, and its place there. */
export const bundleOf = new Map<string, BundleSkill & { bundle: Bundle; index: number }>();
for (const bundle of data.bundles)
  bundle.agentReview.skills.forEach((m, index) => bundleOf.set(m.id, { ...m, bundle, index }));
/** Whether the skills list shows a skill on a row of its own, rather than only inside its bundle's row. */
export const listedOutsideBundle = (s: Skill) => {
  const m = bundleOf.get(s.id);
  return !m || m.listedOutsideBundle === true;
};
// Every skill is on skills.sh; a bundle isn't.
export const isBundle = (e: Skill | Bundle): e is Bundle => !("skills.sh" in e);
export const nameOf = (e: Skill | Bundle) => (isBundle(e) ? e.agentReview.name : e.name);
export const skillsOf = (b: Bundle) =>
  b.agentReview.skills.map(({ id }) => skillById.get(id) as Skill);

/** Tags are `facet:value`, except topics, which are written without a prefix. */
export const tagOf = (facet: Facet, value: string) =>
  facet.prefix === false ? value : `${facet.id}:${value}`;
export const facetOf = (tag: string) =>
  tag.includes(":") ? tag.slice(0, tag.indexOf(":")) : "topic";
export const tagInfo = new Map<string, string>();
const labels = new Map<string, string>();
/** The parents each tag has through `includes`, such as category:software-engineering for category:debugging. */
const parents = new Map<string, string[]>();
for (const facet of data.facets)
  // A facet that takes any value, stack, lists none: see Facet in ../data/types.ts.
  for (const v of facet.values ?? []) {
    const tag = tagOf(facet, v.id);
    if (v.description) tagInfo.set(tag, v.description);
    if (v.label) labels.set(tag, v.label);
    for (const child of v.includes ?? [])
      parents.set(tagOf(facet, child), [...(parents.get(tagOf(facet, child)) ?? []), tag]);
  }
/** A tag's name for chips, when it has one besides the tag itself. */
export const tagLabel = (tag: string) => labels.get(tag);
/** The values a parent tag includes, as tags. */
export const includedBy = (tag: string) =>
  [...parents].filter(([, of]) => of.includes(tag)).map(([child]) => child);
/** The parents a tag has through `includes`. */
export const parentsOf = (tag: string) => parents.get(tag) ?? [];
const withParents = new Map(
  data.skills.map((s) => [
    s.id,
    [...s.agentReview.tags, ...new Set(s.agentReview.tags.flatMap((t) => parents.get(t) ?? []))],
  ]),
);
/** A skill's tags, plus the parents it has through them. */
export const tagsOf = (s: Skill) => withParents.get(s.id) ?? s.agentReview.tags;

/**
 * The order facets appear in, where they're listed: a row's tags, a skill's page and the Tags
 * page. Not in the skills list's sidebar, which has Flags before Topics and Stack: see facetsHtml
 * in list.ts.
 */
export const FACET_ORDER = ["category", "type", "effect", "needs", "by", "topic", "stack", "flag"];
/** Tags that call for a look before installing. */
export const CAUTION = ["flag:republished"];

const most = (n: (number | null)[]) => {
  const known = n.filter((x) => x !== null);
  return known.length ? Math.max(...known) : null;
};

// A bundle's numbers are those of its skills: the most installs any one of them has, and the
// first time one was seen.

/** The GitHub repo a skill or bundle lives in. */
export const repoKey = (e: Skill | Bundle) => (isBundle(e) ? bundleRepo(e) : github(e).repo);
export const starsOf = (e: Skill | Bundle) => repoById.get(repoKey(e))?.stars ?? null;
export const installsOf = (e: Skill | Bundle): number | null =>
  isBundle(e) ? most(skillsOf(e).map(installsOf)) : e["skills.sh"].installs;
export const firstSeenOf = (e: Skill | Bundle): string | null =>
  isBundle(e)
    ? (skillsOf(e).map(firstSeenOf).filter(Boolean).sort()[0] ?? null)
    : e["skills.sh"].firstSeen;
/** Installs on skills.sh in the latest of its 8 weeks. */
export const weekOf = (e: Skill | Bundle): number | null => {
  if (isBundle(e)) return most(skillsOf(e).map(weekOf));
  const weekly = e["skills.sh"].weeklyInstalls;
  return weekly?.length ? weekly[weekly.length - 1] : null;
};

/**
 * What each number is called where it's on a tile of its own: on a skill's or a bundle's page (see
 * stat-tiles.ts) and in its preview in the skills list (see preview-client.ts). One name each, for
 * both: the preview said "Weekly downloads" where the page it previews says "Weekly Downloads".
 * Each written as a name, its words in capitals, the stars' too: "Repo stars" stood beside "Total
 * Downloads". The stars are the repo's, which the rows say with their tooltip.
 */
export const NUMBER_LABELS = {
  week: "Weekly Downloads",
  downloads: "Total Downloads",
  stars: "Repo Stars",
  published: "Age",
} as const;

/** A skill needs this many installs a week, in its latest 2 weeks, for its growth to count. */
export const GROWTH_MIN = 1000;
/** And this many in each of its last GROWTH_WEEKS weeks: fewer is a week it sat almost unused. */
export const GROWTH_BASE_MIN = 100;
/** The weeks a skill needs GROWTH_BASE_MIN installs in to have a growth: the 6 it compares, and the one before. */
export const GROWTH_WEEKS = 7;

/**
 * How fast its installs on skills.sh grow: the average week of its latest 2 weeks against the
 * average week of the 4 before, as a ratio minus 1 (0.5 for +50%). Null when it has fewer than
 * GROWTH_MIN a week, or a week with fewer than GROWTH_BASE_MIN installs among the last
 * GROWTH_WEEKS: a younger skill would count the weeks before it existed, and its first, partial
 * week, as weeks it grew from. Likewise a skill that sat almost unused, then took off: it's new in
 * all but its date (see tookOffOf), and growing from a handful of installs a week reads as an
 * absurd +45,000%. For a bundle, the most of any of its skills.
 */
export const growthOf = (e: Skill | Bundle): number | null => {
  if (isBundle(e)) return most(skillsOf(e).map(growthOf));
  const weekly = e["skills.sh"].weeklyInstalls;
  if (!weekly || weekly.length < GROWTH_WEEKS) return null;
  if (weekly.slice(-GROWTH_WEEKS).some((n) => n < GROWTH_BASE_MIN)) return null;
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const recent = avg(weekly.slice(-2));
  if (recent < GROWTH_MIN) return null;
  return recent / avg(weekly.slice(-6, -2)) - 1;
};

/**
 * The day a skill took off on skills.sh, when it sat there almost unused first: the start of the
 * week after its latest week with fewer than GROWTH_BASE_MIN installs, when it has GROWTH_MIN a
 * week in its latest 2 weeks, as growthOf counts them, and that dormant week came after skills.sh
 * first saw it (else it's just a new skill's first, partial week). So a skill with GROWTH_MIN a week
 * but no growth, for such a week among its last GROWTH_WEEKS, took off or was first seen in the
 * last GROWTH_WEEKS weeks, and shows under Rising & new instead; or it had a few bad weeks.
 *
 * Almost unused, as far as its total tells: until that day it got fewer than GROWTH_MIN installs a
 * week on average, since skills.sh first saw it. One that got many more only had bad weeks, as the
 * eleven skills of RigorPilot did: 12K to 16K a week for six months, three weeks of 50, then 10K
 * again. Counted as taking off, they were "5 weeks" old beside 356K total downloads, newer than 97%
 * of the skills, and listed under Rising & new. Such a skill keeps its date, and has no growth.
 */
export const tookOffOf = (s: Skill): string | null => {
  const { weeklyInstalls: weekly, firstSeen, installs } = s["skills.sh"];
  if (!weekly || !firstSeen) return null;
  if ((weekly[weekly.length - 1] + weekly[weekly.length - 2]) / 2 < GROWTH_MIN) return null;
  const since = weekly.findLastIndex((n) => n < GROWTH_BASE_MIN) + 1;
  if (since === 0 || since === weekly.length) return null;
  // The last week is the one to data.asOf.installs.
  const day = daysBefore(data.asOf.installs, (weekly.length - since) * 7);
  if (daysBefore(day, 7) < firstSeen) return null;
  // What it got until that day: its total, without the weeks since. An unknown total tells nothing.
  const before = (installs ?? 0) - weekly.slice(since).reduce((a, b) => a + b, 0);
  const weeks = (Date.parse(day) - Date.parse(firstSeen)) / (7 * 86_400_000);
  return before / weeks < GROWTH_MIN ? day : null;
};

/**
 * When it was published, as the skills list counts it: the day it took off, see tookOffOf, or else
 * when skills.sh first saw it. For a bundle, the earliest of its skills.
 */
export const publishedOf = (e: Skill | Bundle): string | null =>
  isBundle(e)
    ? (skillsOf(e).map(publishedOf).filter(Boolean).sort()[0] ?? null)
    : (tookOffOf(e) ?? e["skills.sh"].firstSeen);

/** Compare for a descending sort, unknown values last. */
export const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

/**
 * An owner as the site spells them: as their most starred repo with a skill here does. The ids
 * spell some owners two ways, such as AgriciDaniel and agricidaniel, which get one page (see
 * github.ts): each repo's crumbs spelled its own, so the way to that page read otherwise than the
 * page's name.
 */
const ownerNames = new Map<string, string>();
{
  const listed = new Set(data.skills.map(repoKey));
  for (const r of data.repos.filter((r) => listed.has(r.id)).sort((a, b) => desc(a.stars, b.stars)))
    if (!ownerNames.has(ownerPage(r.id))) ownerNames.set(ownerPage(r.id), r.id.split("/")[0]);
}
/** The owner of a repo (`owner/name`), as the site spells them. */
export const ownerName = (repo: string) => ownerNames.get(ownerPage(repo)) ?? repo.split("/")[0];

/** A page (see github.ts) as URL path segments. */
export const idPath = (page: string) => page.split("/").map(encodeURIComponent).join("/");
/** The page of a repo's owner, from the repo (`owner/name`): see ownerPage(). */
export const ownerHref = (repo: string) => href(`${idPath(ownerPage(repo))}/`);
/** The repo's page: see repoPage(). */
export const repoHref = (repo: string) => href(`${idPath(repoPage(repo))}/`);
/** The skill's own page: see skillPage(). */
export const skillHref = (id: string) => href(`${idPath(skillPage(skillById.get(id) as Skill))}/`);
/** The bundle's page: see bundlePage(). */
export const bundleHref = (id: string) => href(`${idPath(bundlePage({ id }))}/`);

/** The crumbs atop a page inside a repo (`owner/name`): the list, its owner, the repo, then `more`. */
export function crumbsHtml(repo: string, ...more: string[]): string {
  const name = repo.split("/")[1];
  const links = [
    `<a href="${href()}">Skills</a>`,
    `<a href="${ownerHref(repo)}">${esc(ownerName(repo))}</a>`,
    `<a href="${repoHref(repo)}">${esc(name)}</a>`,
    ...more,
  ];
  return `<p class="crumbs">${links.join(` <span aria-hidden="true">/</span> `)}</p>`;
}

/** A TLDR's glance as a list of labelled facts, or its first `max` items. */
export function glanceHtml(glance: Tldr["glance"], max = glance.length): string {
  const items = glance
    .slice(0, max)
    .map(
      ({ label, text }) =>
        `<div><dt>${esc(label)}:</dt><dd>${textHtml(glanceEnd(text))}</dd></div>`,
    );
  return `<dl class="glance">${items.join("")}</dl>`;
}

/** A tag, as a link to `link`, or with no link as a toggle for the skills list's filters. */
export function tagChip(tag: string, link: string | null, pressed = false): string {
  const info = tagInfo.get(tag);
  const attrs = `class="tag" data-tag="${esc(tag)}" data-facet="${esc(facetOf(tag))}"${info ? ` title="${esc(info)}"` : ""}`;
  // The prefix is quieter than the value. Where a tag must break, it breaks after its prefix, or at
  // a hyphen. Its value is an element of its own for the Tags page's tables, where it goes to the
  // next line whole on a phone: see .tag-table in style.css.
  const colon = tag.indexOf(":");
  const text =
    colon < 0
      ? esc(tag)
      : `<span class="tag-facet">${esc(tag.slice(0, colon + 1))}</span><wbr><span class="tag-value">${esc(tag.slice(colon + 1))}</span>`;
  return link === null
    ? `<button type="button" ${attrs} aria-pressed="${pressed}">${text}</button>`
    : `<a ${attrs} href="${link}">${text}</a>`;
}

/**
 * Where a skill sits in its bundle, with the skills before and after it, such as "Skill 3 of 14 in
 * the Superpowers bundle, after brainstorming and before executing-plans."; "" for one in none. On
 * its page and in its preview.
 */
export function inBundleHtml(s: Skill): string {
  const place = bundleOf.get(s.id);
  if (!place) return "";
  const { bundle, index } = place;
  const link = (i: number) => {
    const id = bundle.agentReview.skills[i]?.id;
    return id ? `<a href="${skillHref(id)}">${esc(skillById.get(id)?.name ?? id)}</a>` : "";
  };
  const near = [
    link(index - 1) && `after ${link(index - 1)}`,
    link(index + 1) && `before ${link(index + 1)}`,
  ].filter(Boolean);
  return `<p class="in-bundle">Skill ${index + 1} of ${bundle.agentReview.skills.length} in the <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a> bundle${near.length ? `, ${near.join(" and ")}` : ""}.</p>`;
}

/** Which of a bundle's skills work without the rest of it, in a sentence: on its page and in its preview. */
export function aloneLine(b: Bundle, marked = "The ones marked “Only in the bundle”"): string {
  const alone = b.agentReview.skills.filter((m) => m.standalone).length;
  return alone === b.agentReview.skills.length
    ? "Each also works alone."
    : alone === 0
      ? "None works alone: each needs the rest of the bundle."
      : `${marked} need the rest of it. The others also work alone.`;
}

/** The command that installs a skill, as skills.sh gives it: the skills CLI's --skill ignores case. */
export const installCommand = (s: Skill) =>
  `npx skills add https://github.com/${github(s).repo} --skill ${s.name}`;

/** A commit as its first 7 characters. */
export const short = (commit: string) => commit.slice(0, 7);

/** The TLDR's prose, and what it summarizes: `what` at the permalink's commit, which has changed by `skew` words since. */
export function tldrHtml(tldr: Tldr, what: string, skew: number): string {
  const commit = /\/tree\/([0-9a-f]{40})/.exec(tldr.permalink)?.[1] ?? "";
  return `
    <section class="tldr" aria-labelledby="tldr">
      <h2 id="tldr">TL;DR</h2>
      ${tldr.text
        .split(/\n\s*\n/)
        .map((p) => `<p>${textHtml(p)}</p>`)
        .join("")}
      <p class="muted">Summarizes <a href="${esc(tldr.permalink)}">${esc(what)} at ${short(commit)}</a>.${
        skew
          ? ` ${what === "the skill" ? "Its SKILL.md has" : "Its skills have"} changed by ${plural(skew, "word")} since.`
          : ""
      }</p>
    </section>`;
}
