import { date, href } from "../../format.ts";
import { review } from "../../review.ts";

const n = (x: number) => x.toLocaleString("en");

interface Row {
  label: string;
  count: number;
  /** The explanation the row's [i] shows. */
  tip: string;
  /** 1 or 2 when the row splits the last row of a lower depth. */
  depth?: 0 | 1 | 2;
  emoji?: string;
  /** What a screen reader calls the row, when the label alone isn't clear. Defaults to the label. */
  name?: string;
}

/**
 * About: how skills get on SkillHub, with the numbers of the latest crawl and agent reviews. It
 * says what a visitor can rely on, not how the work is done (how many passes, how often), which may
 * change.
 */
export default function Page(): string {
  const { turnedDown: t, minimums } = review;
  const byAgent = t.toolDocs + t.vendorService + t.language + t.copy + t.retired + t.other;
  const byScript = review.gone + review.notOnGitHub;
  // Each skill SkillHub knows of is in exactly one row of depth 0.
  const rows: Row[] = [
    {
      label: "Listed",
      emoji: "✅",
      count: review.listed,
      tip: "An agent review judged it useful to people looking for skills.",
    },
    {
      label: "Disqualified",
      emoji: "❌",
      count: byAgent + byScript,
      tip: "Not listed: an agent review turned it down, or a script found its SKILL.md can't be read on GitHub.",
    },
    {
      label: "By agent",
      name: "Disqualified by agent",
      emoji: "🤖",
      depth: 1,
      count: byAgent,
      tip: "An agent review read the skill's whole SKILL.md, not only its description, and judged it not useful to people looking for skills.",
    },
    {
      label: "Tool docs",
      count: t.toolDocs,
      depth: 2,
      tip: "A manual for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. It only matters once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.",
    },
    {
      label: "Vendor paid service",
      count: t.vendorService,
      depth: 2,
      tip: "A skill whose job runs on one vendor's paid service, such as its API or cloud, so it only works with an account there. It reads as an ad for the service, whoever publishes it. A workflow where the agent does the job and a paid service supplies one part isn't one, nor is a free tool that runs on your machine, even when its maker also sells a cloud.",
    },
    {
      label: "Not in English",
      count: t.language,
      depth: 2,
      tip: "Its SKILL.md isn't in English.",
    },
    {
      label: "Copies",
      count: t.copy,
      depth: 2,
      tip: "A skill republished under another name, or listed twice, such as under its repo's old name.",
    },
    {
      label: "Retired",
      count: t.retired,
      depth: 2,
      tip: "Its SKILL.md points to a replacement.",
    },
    {
      label: "Other reasons",
      count: t.other,
      depth: 2,
      tip: "It only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.",
    },
    {
      label: "By script",
      name: "Disqualified by script",
      emoji: "⚙️",
      depth: 1,
      count: byScript,
      tip: "A script found the skill's SKILL.md can't be read on GitHub, so there's nothing for an agent review to judge.",
    },
    {
      label: "SKILL.md gone from its repo",
      count: review.gone,
      depth: 2,
      tip: "Its repo no longer has its SKILL.md, such as after deleting or moving it. A listed skill whose SKILL.md goes comes off the list.",
    },
    {
      label: "Not on GitHub",
      count: review.notOnGitHub,
      depth: 2,
      tip: "It's hosted somewhere other than GitHub, where SkillHub reads each SKILL.md and follows its changes.",
    },
    {
      label: "Under the minimum installs or stars",
      emoji: "🌱",
      count: review.under,
      tip: `It has fewer than ${n(minimums.installs)} installs, or its repo fewer than ${n(minimums.stars)} stars. It gets an agent review once it has both.`,
    },
    {
      label: "Waiting for agent review",
      emoji: "⏳",
      count: review.waiting,
      tip: "It has the minimum installs and stars, and is next in line for an agent review.",
    },
  ];
  const total: Row = {
    label: "Reviewed",
    emoji: "👀",
    count: review.reviewed,
    tip: "Every skill SkillHub found on skills.sh. Each was reviewed at least on its installs, from skills.sh, and its repo's stars, from GitHub.",
  };
  const row = ({ label, count, tip, depth = 0, emoji, name = label }: Row, i: number) =>
    `<tr class="d${depth}"><td>${emoji ? `<span class="emoji" aria-hidden="true">${emoji}</span>` : ""}${label}<button type="button" class="tip-i" aria-label="About ${name}" aria-describedby="tip-${i}">i</button></td><td class="num">${n(count)}<span class="tip-text" role="tooltip" id="tip-${i}">${tip}</span></td></tr>`;
  return `
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <strong>${n(review.listed)} agent skills</strong>, out of the ${n(review.reviewed)} it reviewed: first on their installs and stars, then with an agent review of whether people looking for skills would find them useful.</p>
      <div class="breakdown-box">
        <table class="breakdown">
          <tbody>${rows.map(row).join("")}</tbody>
          <tfoot>${row(total, rows.length)}</tfoot>
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
        <li><strong>In the list,</strong> a bundle has a row of its own that names its skills in the order they're used. A skill worth installing alone also keeps a row of its own, which says what bundle it's part of. One that only works with the rest, such as one that works on another's output, is only listed inside its bundle, unless the list is set to show Skills, which lists every skill on its own. Set to show Bundles, it lists only bundles.</li>
        <li><strong>Its page</strong> explains how its skills work together, what each one needs from the others, and how to install them all at once.</li>
        <li><strong>Its numbers</strong> come from its skills: Published is when its oldest skill was first seen, Total and Weekly Downloads are its most downloaded skill's, and Stars are its repo's. The filters' sliders use these numbers, so an old bundle with a few new skills isn't in "Published: last 90 days".</li>
        <li><strong>Tags and the search</strong> match a bundle through any of its skills, and grey out its other skills.</li>
      </ul>

      <h2>Up-to-date</h2>
      <p>SkillHub follows each listed skill's SKILL.md in its repo. A skill's page says when its SKILL.md has changed since its TL;DR was written.</p>
    </div>`;
}
