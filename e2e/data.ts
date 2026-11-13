/**
 * What the pages should show, derived from the data files: the data changes every day, so the
 * tests name no number and no skill of their own.
 */

import { existsSync, readFileSync } from "node:fs";
import { readData, root } from "../scripts/data.ts";
import {
  bundlePage,
  bundleRepo,
  github,
  ownerPage,
  repoPage,
  skillPage,
} from "../website/github.ts";
import { renderSkillMd } from "../website/markdown.ts";
import { copyPath } from "../website/skill-md.ts";

export const data = readData();

const members = new Map(
  data.bundles.flatMap((b) => b.agentReview.skills.map((m) => [m.id, m] as const)),
);
/** The skills with a row of their own in the list: those in no bundle, or listed outside theirs. */
const alone = data.skills.filter((s) => {
  const member = members.get(s.id);
  return !member || member.listedOutsideBundle === true;
});

/** How many rows the unfiltered list has: every bundle, and every skill with a row of its own. */
export const listedRows = data.bundles.length + alone.length;

/** A search's word as the list's search cuts it: see `terms` in website/search-terms.ts. */
const stem = (w: string) =>
  w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
const names = [...data.skills.map((s) => s.name), ...data.bundles.map((b) => b.agentReview.name)];

/**
 * A skill to test with, the most installed that fits: in no bundle, so its row and its page stand
 * alone, and named like no other skill or bundle, so a search for its name ranks it first.
 */
export const skill = data.skills
  .filter(
    (s) =>
      !members.has(s.id) &&
      names.filter((name) => name.toLowerCase().includes(stem(s.name.toLowerCase()))).length === 1,
  )
  .toSorted((a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0))[0];
export const skillUrl = `/${skillPage(skill)}/`;

const mostInstalled = data.skills.toSorted(
  (a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0),
);
/** The most installed skill whose SKILL.md, as its page renders it, has what `has` looks for. */
function skillWhoseSkillMd(has: (html: string, text: string) => boolean): string {
  const found = mostInstalled.find((s) => {
    const file = `${root}${copyPath(s)}`;
    if (!existsSync(file)) return false;
    const text = readFileSync(file, "utf8");
    return has(renderSkillMd(text, null).html, text);
  });
  if (!found) throw new Error("no SKILL.md copy has what a test looks for");
  return `/${skillPage(found)}/`;
}
/** The page of a skill whose SKILL.md links to one of its own headings, as a table of contents does. */
export const anchorsUrl = skillWhoseSkillMd((html) => html.includes('href="#md-'));
/** The page of a skill whose SKILL.md has a line of code too long for any screen. */
export const wideCodeUrl = skillWhoseSkillMd(
  (html, text) => html.includes("<pre>") && /^```[\s\S]*?^.{240,}$/m.test(text),
);

/** The page of a skill whose frontmatter has a line too long for any screen, as most descriptions are. */
export const longFrontmatterUrl = skillWhoseSkillMd((_html, text) =>
  /^---\n[\s\S]*?^description:.{400,}$[\s\S]*?^---$/m.test(text),
);
/**
 * The page of a skill whose SKILL.md has an HTML comment on a line of its own, and none that its
 * page keeps, as one in a code block.
 */
export const commentUrl = skillWhoseSkillMd(
  (html, text) => /^<!--.*-->$/m.test(text) && !html.includes("&lt;!--"),
);
/** The page of a skill whose SKILL.md has a task list, `- [ ] to do`. */
export const taskListUrl = skillWhoseSkillMd((html) => html.includes('class="task"'));
/** The page of a skill whose SKILL.md has a task of words alone, too long for a line of any screen. */
export const longTaskUrl = skillWhoseSkillMd((html) =>
  /<li class="task"><input[^>]*>[^<]{240,}<\/li>/.test(html),
);
/** The page of a skill whose SKILL.md has a table right before a rule, or before another table. */
export const tableThenUrl = skillWhoseSkillMd((html) => /<\/table>\s*<(hr|table)\b/.test(html));
/** The page of a skill whose SKILL.md has headings of three levels, which its page shows as h3 to h5. */
export const headingsUrl = skillWhoseSkillMd((html) =>
  ["<h3", "<h4", "<h5"].every((heading) => html.includes(heading)),
);

/**
 * A skill that only works inside its bundle, and the bundle: of those bundles, the first with more
 * than one way to install it.
 */
export const onlyInBundle = (() => {
  const of = data.bundles
    .filter((b) => b.agentReview.skills.some((m) => !m.standalone))
    .toSorted(
      (a, b) =>
        Math.min(b.agentReview.install.length, 2) - Math.min(a.agentReview.install.length, 2),
    )[0];
  const member = of.agentReview.skills.find((m) => !m.standalone) as { id: string };
  const skill = data.skills.find((s) => s.id === member.id) as (typeof data.skills)[number];
  return { skill, url: `/${skillPage(skill)}/`, bundle: of };
})();

/**
 * A skill whose 8 weeks began with a handful of downloads, under the 100 its change is told from,
 * if there's one today: the one that grew the most since.
 */
export const fromAHandful = data.skills
  .filter((s) => {
    const weekly = s["skills.sh"].weeklyInstalls;
    return weekly && weekly.length >= 2 && weekly[0] > 0 && weekly[0] < 100;
  })
  .toSorted(
    (a, b) =>
      (b["skills.sh"].weeklyInstalls?.at(-1) ?? 0) - (a["skills.sh"].weeklyInstalls?.at(-1) ?? 0),
  )
  .map((s) => `/${skillPage(s)}/`)[0] as string | undefined;

/**
 * A skill whose TLDR sets code apart between backticks, such as `npm install`, with the first of it,
 * if there's one today: one whose glance does too, where there's one, as the page's description is
 * made of its glance.
 */
export const codeInTldr = (() => {
  const code = (text: string | undefined) => /`([^`\n]+)`/.exec(text ?? "")?.[1];
  const found = mostInstalled
    .filter((s) => code(s.agentReview.tldr?.text))
    .toSorted((a, b) => {
      const inGlance = (s: typeof a) =>
        Number((s.agentReview.tldr?.glance ?? []).some((fact) => code(fact.text)));
      return inGlance(b) - inGlance(a);
    })[0];
  return found
    ? { url: `/${skillPage(found)}/`, code: code(found.agentReview.tldr?.text) as string }
    : undefined;
})();

/**
 * A glance's fact that ends on what someone says, its question mark or full stop before the closing
 * quote, such as `You ask "how do I do X?"`, with its skill's page, if there's one today.
 */
export const quotedFact = (() => {
  for (const s of mostInstalled)
    for (const { text } of s.agentReview.tldr?.glance ?? [])
      if (/[.!?]["”]$/.test(text) && !text.includes("`")) return { url: `/${skillPage(s)}/`, text };
  return undefined;
})();

/** The page of the skill whose glance has the most of something, which a phone's width has to take. */
function skillWhoseGlanceHasMost(of: (fact: { label: string; text: string }) => number): string {
  const most = (s: (typeof data.skills)[number]) =>
    Math.max(0, ...(s.agentReview.tldr?.glance ?? []).map(of));
  return `/${skillPage(data.skills.toSorted((a, b) => most(b) - most(a))[0])}/`;
}
/** The page of the skill whose glance has the longest label, such as "Unlike <another skill's name>". */
export const longLabelUrl = skillWhoseGlanceHasMost((fact) => fact.label.length);
/**
 * The page of the skill whose glance has the longest run of letters a line can't break in, such as
 * a file's name: a line breaks at a space, and after a hyphen.
 */
export const longWordUrl = skillWhoseGlanceHasMost((fact) =>
  Math.max(...fact.text.split(/[\s-]+/).map((word) => word.length)),
);

/**
 * The page of the skill whose name has the longest word, such as microinteractions: on most days
 * too long for what a phone's title has beside its buttons.
 */
export const longNameUrl = (() => {
  const longest = (name: string) => Math.max(...name.split(/[\s-]+/).map((word) => word.length));
  return `/${skillPage(data.skills.toSorted((a, b) => longest(b.name) - longest(a.name))[0])}/`;
})();

/** The stack tags the skills have: stack is the one facet whose values aren't a closed list. */
export const stackTags = new Set(
  data.skills.flatMap((s) => s.agentReview.tags.filter((t) => t.startsWith("stack:"))),
);

/**
 * A tag the search finds only by its meaning: of the facets' values that skills carry and that have
 * a meaning, the most carried, with the longest word of its meaning that its name doesn't hold.
 */
export const meaningTag = data.facets
  .flatMap((f) =>
    (f.values ?? []).map((v) => {
      const tag = f.prefix === false ? v.id : `${f.id}:${v.id}`;
      const name = `${tag} ${v.label ?? ""}`.toLowerCase();
      const word = (v.description ?? "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !name.includes(stem(w)))
        .toSorted((a, b) => b.length - a.length)[0];
      const carried = data.skills.filter((s) => s.agentReview.tags.includes(tag)).length;
      return { tag, word, meaning: v.description ?? "", carried };
    }),
  )
  .filter((t) => t.word && t.carried)
  .toSorted((a, b) => b.carried - a.carried)[0];

/**
 * A word of a tag's meaning, and its end, which starts no word of any tag, in its name, label or
 * meaning: the Tags page's search finds the tag by the word, and nothing by its end, as it finds a
 * word by its start, never by its middle. The longest such word.
 */
export const insideWord = (() => {
  const texts = [
    ...data.facets.flatMap((f) =>
      (f.values ?? []).map(
        (v) =>
          `${f.prefix === false ? "" : `${f.id}:`}${v.id} ${v.label ?? ""} ${v.description ?? ""}`,
      ),
    ),
    ...stackTags,
  ];
  const wordsOf = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const all = new Set(texts.flatMap(wordsOf));
  const found = data.facets
    .flatMap((f) => (f.values ?? []).flatMap((v) => wordsOf(v.description ?? "")))
    .filter((word) => word.length >= 8)
    .toSorted((a, b) => b.length - a.length)
    .map((word) => ({ word, end: word.slice(2) }))
    // As the search cuts it, too: see `stem`.
    .find(({ end }) => ![...all].some((w) => w.startsWith(end) || w.startsWith(stem(end))));
  if (!found) throw new Error("no tag's meaning has a word whose end starts no other");
  return found;
})();

/**
 * The longest tag with a facet that skills have, by themselves or through the tags it includes,
 * such as category:software-engineering: on most days too long for a line of the tags' column.
 */
export const longTag = (() => {
  const carried = new Set(data.skills.flatMap((s) => s.agentReview.tags));
  return data.facets
    .filter((f) => f.prefix !== false)
    .flatMap((f) =>
      (f.values ?? [])
        .filter((v) => [v.id, ...(v.includes ?? [])].some((id) => carried.has(`${f.id}:${id}`)))
        .map((v) => `${f.id}:${v.id}`),
    )
    .toSorted((a, b) => b.length - a.length)[0];
})();

/** A bundle to test with: the one with the most skills. */
export const bundle = data.bundles.toSorted(
  (a, b) => b.agentReview.skills.length - a.agentReview.skills.length,
)[0];
export const bundleUrl = `/${bundlePage(bundle)}/`;

/** How many flags a bundle's install commands set to something, such as a `--skill` per skill. */
const flagsSet = (b: (typeof data.bundles)[number]) =>
  b.agentReview.install.reduce(
    (n, { command }) => n + (command.match(/(?:^| )-\S* (?!-|&&|\|)\S/g)?.length ?? 0),
    0,
  );
/** The page of the bundle whose install commands set the most flags: the ones with the most to wrap. */
export const flagsBundleUrl = `/${bundlePage(data.bundles.toSorted((a, b) => flagsSet(b) - flagsSet(a))[0])}/`;

/** The words of a bundle's install commands. */
const installWords = (b: (typeof data.bundles)[number]) =>
  b.agentReview.install.flatMap(({ command }) => command.split(" "));
const most = (count: (b: (typeof data.bundles)[number]) => number) =>
  `/${bundlePage(data.bundles.toSorted((a, b) => count(b) - count(a))[0])}/`;
/** The page of the bundle whose install commands join the most commands with &&. */
export const joinedBundleUrl = most((b) => installWords(b).filter((w) => w === "&&").length);
/**
 * The page of the bundle whose install commands have the longest word with an @ inside and no
 * slash, such as a plugin's `name@marketplace`: on most days longer than a line of a phone's
 * command box, with nowhere else to break.
 */
export const atBundleUrl = most((b) =>
  Math.max(0, ...installWords(b).map((w) => (/^[^/]*[a-z0-9]@[^/]*$/i.test(w) ? w.length : 0))),
);

/** What a repo's page lists: its bundles, then every skill of the repo. */
const listing = (repo: string) => ({
  repo,
  url: `/${repoPage(repo)}/`,
  bundles: data.bundles.filter((b) => bundleRepo(b) === repo),
  skills: data.skills.filter((s) => github(s).repo === repo),
});
/** The repos with a skill on the site, each of which has a page. */
const listings = [...new Set(data.skills.map((s) => github(s).repo))].map(listing);

/** A repo to test with: of those with a bundle, the one with the most skills. */
export const repo = listings
  .filter((l) => l.bundles.length)
  .toSorted((a, b) => b.skills.length - a.skills.length)[0];

/** A short page of the same kind, for what reads a whole page, such as axe: the repo with a bundle and the fewest skills. */
export const smallRepo = listings
  .filter((l) => l.bundles.length)
  .toSorted((a, b) => a.skills.length - b.skills.length)[0];
export const smallOwnerUrl = `/${ownerPage(smallRepo.repo)}/`;

/** The repo with the longest name, whose chip, in a list filtered to it, is longer than a phone's line. */
export const longRepo = listings.toSorted((a, b) => b.repo.length - a.repo.length)[0];

/**
 * An owner whose repos' ids spell them in more than one way, such as AgriciDaniel and agricidaniel,
 * if there's one today: their page, and their repos'.
 */
export const respelledOwner = (() => {
  for (const l of listings) {
    const theirs = listings.filter((other) => ownerPage(other.repo) === ownerPage(l.repo));
    if (new Set(theirs.map((other) => other.repo.split("/")[0])).size > 1)
      return { url: `/${ownerPage(l.repo)}/`, repos: theirs.map((other) => other.url) };
  }
  return undefined;
})();

/**
 * A repo whose description, GitHub's own, has no full stop at its end, if there's one today, with
 * the description.
 */
export const unendedRepo = (() => {
  for (const l of listings) {
    const text = data.repos.find((r) => r.id === l.repo)?.agentReview.description;
    if (text && /[\p{L}\p{N}]$/u.test(text)) return { url: l.url, text };
  }
  return undefined;
})();

/**
 * The pages whose description is the longest of their kind, a skill's and a bundle's: longer than
 * a card has the room for, where their links are shared.
 */
export const longDescriptionUrls = (() => {
  const length = (tldr: { glance: { label: string; text: string }[] } | undefined) =>
    (tldr?.glance ?? []).reduce((n, fact) => n + fact.label.length + fact.text.length + 4, 0);
  const longest = <E extends { agentReview: { tldr?: Parameters<typeof length>[0] } }>(of: E[]) =>
    of.toSorted((a, b) => length(b.agentReview.tldr) - length(a.agentReview.tldr)).slice(0, 12);
  return [
    ...longest(data.skills).map((s) => `/${skillPage(s)}/`),
    ...longest(data.bundles).map((b) => `/${bundlePage(b)}/`),
  ];
})();

/** Its owner, whose page lists every repo of theirs: however their name is spelled, as GitHub ignores case. */
const theirs = listings.filter((l) => ownerPage(l.repo) === ownerPage(repo.repo));
export const owner = {
  url: `/${ownerPage(repo.repo)}/`,
  repos: theirs.length,
  rows: theirs.reduce((rows, l) => rows + l.bundles.length + l.skills.length, 0),
};
