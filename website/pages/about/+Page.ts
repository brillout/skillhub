import { date, href } from "../../format.ts";
import { review } from "../../review.ts";
import { GITHUB, GROWTH_BASE_MIN, GROWTH_MIN, GROWTH_WEEKS } from "../../skills.ts";

const n = (x: number) => x.toLocaleString("en");

interface Row {
  label: string;
  count: number;
  /** The explanation the row's [i] shows. */
  tip: string;
  /** 1 to 4 when the row is one of the parts the last row of a lower depth adds up. */
  depth?: 0 | 1 | 2 | 3 | 4;
  emoji?: string;
  /** Its bar is garnet, as the row the page is about. */
  accent?: boolean;
  /** It has no bar: Crawled, whose bar would always be full, and Waiting. */
  noBar?: boolean;
  /** What a screen reader calls the row, when the label alone isn't clear. Defaults to the label. */
  name?: string;
  /** Where its number leads, and what a screen reader calls that link: the number alone says little. */
  link?: { href: string; name: string };
}

/**
 * The queue on GitHub: the qualified skills, at the top of crawl.jsonc. writeCrawl() of
 * scripts/data.ts always writes "$schema" and "asOf" first, so `qualified` starts on line 4.
 */
const QUEUE = `${GITHUB}/blob/main/data/crawl.jsonc#L4`;

/**
 * About: how skills get on SkillHub, with the numbers of the latest crawl and agent reviews. It
 * says what a visitor can rely on, not how the work is done (how many passes, how often), which may
 * change.
 */
export default function Page(): string {
  const { turnedDown: t, minimums } = review;
  const byAgent = t.toolDocs + t.vendorService + t.language + t.copy + t.retired + t.other;
  const byScript = review.gone + review.notOnGitHub;
  /** The reasons a skill was disqualified, most frequent first, and Other reasons last. */
  const byCount = (reasons: Row[]) =>
    reasons.sort(
      (a, b) =>
        Number(a.label === "Other reasons") - Number(b.label === "Other reasons") ||
        b.count - a.count,
    );
  // Each row adds up the rows one level deeper under it, down from Crawled: every skill SkillHub
  // knows of. A row's bar is its share of them.
  const rows: Row[] = [
    {
      label: "Crawled",
      emoji: "🔍",
      noBar: true,
      count: review.crawled,
      tip: "Every skill SkillHub found on skills.sh: reviewed, or waiting for an agent review.",
    },
    {
      label: "Waiting for agent review",
      emoji: "⏳",
      depth: 1,
      noBar: true,
      count: review.waiting,
      link: {
        href: QUEUE,
        name: `${n(review.waiting)} waiting for agent review: the queue on GitHub`,
      },
      tip: "It has the minimum installs and stars, or it's by an author SkillHub lists every skill of, and is next in line for an agent review.",
    },
    {
      label: "Reviewed",
      emoji: "👀",
      depth: 1,
      count: review.reviewed,
      tip: "SkillHub has a verdict on it: listed, disqualified, or checked on its installs and stars and found under the minimums.",
    },
    {
      label: "Listed",
      emoji: "✅",
      depth: 2,
      accent: true,
      count: review.listed,
      tip: "An agent review judged it useful to people looking for skills.",
    },
    {
      label: "Under the minimum installs or stars",
      emoji: "🌱",
      depth: 2,
      count: review.under,
      tip: `It has fewer than ${n(minimums.installs)} installs, or its repo fewer than ${n(minimums.stars)} stars. It gets an agent review once it has both.`,
    },
    {
      label: "Disqualified",
      emoji: "❌",
      depth: 2,
      count: byAgent + byScript,
      tip: "Not listed: an agent review turned it down, or a script found its SKILL.md can't be read on GitHub.",
    },
    {
      label: "By agent",
      name: "Disqualified by agent",
      emoji: "🤖",
      depth: 3,
      count: byAgent,
      tip: "An agent review read the skill's whole SKILL.md, not only its description, and judged it not useful to people looking for skills.",
    },
    ...byCount([
      {
        label: "Tool docs",
        depth: 4,
        count: t.toolDocs,
        tip: "A manual for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. It only matters once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.",
      },
      {
        label: "Vendor paid service",
        depth: 4,
        count: t.vendorService,
        tip: "A skill whose job runs on one vendor's paid service, such as its API or cloud, so it only works with an account there. It reads as an ad for the service, whoever publishes it. A workflow where the agent does the job and a paid service supplies one part isn't one, nor is a free tool that runs on your machine, even when its maker also sells a cloud.",
      },
      {
        label: "Not in English",
        depth: 4,
        count: t.language,
        tip: "Its SKILL.md isn't in English.",
      },
      {
        label: "Copies",
        depth: 4,
        count: t.copy,
        tip: "A skill republished under another name, or listed twice, such as under its repo's old name.",
      },
      {
        label: "Retired",
        depth: 4,
        count: t.retired,
        tip: "Its SKILL.md points to a replacement.",
      },
      {
        label: "Other reasons",
        depth: 4,
        count: t.other,
        tip: "It only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.",
      },
    ]),
    {
      label: "By script",
      name: "Disqualified by script",
      emoji: "⚙️",
      depth: 3,
      count: byScript,
      tip: "A script found the skill's SKILL.md can't be read on GitHub, so there's nothing for an agent review to judge.",
    },
    ...byCount([
      {
        label: "SKILL.md gone from its repo",
        depth: 4,
        count: review.gone,
        tip: "Its repo no longer has its SKILL.md, such as after deleting or moving it. A listed skill whose SKILL.md goes comes off the list.",
      },
      {
        label: "Not on GitHub",
        depth: 4,
        count: review.notOnGitHub,
        tip: "It's hosted somewhere other than GitHub, where SkillHub reads each SKILL.md and follows its changes.",
      },
    ]),
  ];
  const row = (
    { label, count, tip, depth = 0, emoji, accent, noBar, name = label, link }: Row,
    i: number,
  ) => {
    const bar =
      !noBar && count
        ? `<span${accent ? ' class="accent"' : ""} style="--share: ${(count / review.crawled).toFixed(4)}"></span>`
        : "";
    const num = link
      ? `<a href="${link.href}" aria-label="${link.name}">${n(count)}</a>`
      : n(count);
    return `<tr class="d${depth}"><td>${emoji ? `<span class="emoji" aria-hidden="true">${emoji}</span>` : ""}${label}<button type="button" class="tip-i" aria-label="About ${name}" aria-describedby="tip-${i}">i</button></td><td class="bar">${bar}</td><td class="num">${num}<span class="tip-text" role="tooltip" id="tip-${i}">${tip}</span></td></tr>`;
  };
  return `
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <span class="badge">${n(review.listed)}</span> agent skills, selected from a review of the <span class="badge">${n(review.reviewed)}</span> <a href="https://skills.sh">most downloaded skills</a>.</p>
      <div class="breakdown-box">
        <table class="breakdown">
          <tbody>${rows.map(row).join("")}</tbody>
        </table>
      </div>
      <p class="breakdown-note">As of ${date(review.asOf)}.</p>

      <h2>Agent review</h2>
      <p>When SkillHub's agent reviews a skill, it adds:</p>
      <ul>
        <li><strong>A TL;DR:</strong> what the skill does, what you end up with, when to use it and how it differs from a close neighbour.</li>
        <li><strong>Tags:</strong> what area it's for, how it works, what it needs and what it can change on its own. The <a href="${href("tags/")}">Tags</a> page explains each one.</li>
        <li><strong>A note</strong> when there's something to know before installing, such as an account it needs, what it sends to a third party, or a safety check it switches off.</li>
        <li><strong>A bundle</strong> when it's meant to be used with other skills of its repo: see <a href="#bundles">Bundles</a>.</li>
      </ul>

      <h2 id="bundles">Bundles</h2>
      <p>A bundle is skills of one repo that are meant to be installed and used together, such as the steps of a workflow: one writes a spec, the next turns it into tickets, another implements them. A repo that only collects unrelated skills isn't a bundle. SkillHub has ${n(review.bundles)}.</p>
      <ul>
        <li><strong>In the list,</strong> a bundle has a row of its own that names its skills in the order they're used. A skill that works alone, and that people would want without the rest of the bundle, such as a test-driven development skill in a bundle for a whole workflow, also keeps a row of its own, which says what bundle it's part of. The others are only listed inside their bundle: those that only work with the rest, such as one that works on another's output, and those that only interest the bundle's audience, such as a game-dev bundle's genre guides. Set to show Skills, the list shows every skill on its own row. Set to show Bundles, it lists only bundles.</li>
        <li><strong>Its page</strong> explains how its skills work together, what each one needs from the others, and how to install them all at once.</li>
        <li><strong>Its numbers</strong> come from its skills: Age is its oldest skill's, Total and Weekly Downloads are its most downloaded skill's, and Stars are its repo's. The filters' sliders use these numbers, so an old bundle with a few new skills isn't in “Age: ≤ 3 months”.</li>
        <li><strong>Tags and the search</strong> match a bundle through any of its skills, and grey out its other skills.</li>
      </ul>

      <h2 id="weekly-growth">Weekly Growth</h2>
      <p>How fast a <a href="https://skills.sh">skill's downloads</a> grow: its average weekly downloads of the last 2 weeks against those of the 4 weeks before. Only for skills with at least ${n(GROWTH_MIN)} downloads a week, and at least ${n(GROWTH_BASE_MIN)} in each of the last ${GROWTH_WEEKS} weeks.</p>

      <h2>Up to date</h2>
      <p>SkillHub follows each listed skill's SKILL.md in its repo. A skill's page says when its SKILL.md has changed since its TL;DR was written.</p>
    </div>`;
}
