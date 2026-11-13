import type { PageContextServer } from "vike/types";
import { age, commandHtml, compact, date, esc, plural } from "../../format.ts";
import {
  aloneLine,
  crumbsHtml,
  data,
  glanceHtml,
  installsOf,
  NUMBER_LABELS,
  publishedOf,
  repoHref,
  repoKey,
  skillHref,
  skillsOf,
  starsOf,
  tldrHtml,
  weekOf,
} from "../../skills.ts";
import type { ClientSkill as Skill } from "../../client-data.ts";
import { statTilesHtml } from "../../stat-tiles.ts";
import { saveButton, saveKey, thumbsHtml } from "../../saves.ts";
import { copyButton } from "../../copy.ts";
import type { Bundle } from "../../../data/types.ts";
import type { Data } from "./+data.ts";

/**
 * Its numbers, a tile each (see stat-tiles.ts): as the skills list counts a bundle's, its most
 * downloaded skill's downloads, which each tile names, its repo's stars and its first skill's age.
 */
function tiles(b: Bundle): string {
  const most = (of: (s: Skill) => number | null) =>
    skillsOf(b).toSorted((x, y) => (of(y) ?? -1) - (of(x) ?? -1))[0];
  const link = (s: Skill) => `<a href="${skillHref(s.id)}">${esc(s.name)}</a>`;
  const topWeek = most(weekOf);
  const top = most(installsOf);
  const stars = starsOf(b);
  const published = publishedOf(b);
  return statTilesHtml(b, [
    {
      p: "week",
      label: NUMBER_LABELS.week,
      from: `${link(topWeek)}, its top skill`,
      shown: weekOf(topWeek)?.toLocaleString("en") ?? "",
      trend: topWeek["skills.sh"].weeklyInstalls,
    },
    {
      p: "downloads",
      label: NUMBER_LABELS.downloads,
      from: `${link(top)}, its top skill`,
      shown: installsOf(top)?.toLocaleString("en") ?? "",
    },
    {
      p: "stars",
      label: NUMBER_LABELS.stars,
      from: esc(repoKey(b)),
      shown: stars?.toLocaleString("en") ?? "",
    },
    {
      p: "published",
      label: NUMBER_LABELS.published,
      from: published ? `its first skill, published ${date(published)}` : "",
      shown: published ? age(published, data.asOf.installs) : "",
    },
  ]);
}

function skills(b: Bundle): string {
  const items = b.agentReview.skills.map(({ id, standalone, note }, i) => {
    const s = skillsOf(b)[i];
    const installs = installsOf(s);
    return `
      <li>
        <div class="skill-head">
          <h3><a class="skill-name" href="${skillHref(id)}">${esc(s.name)}</a></h3>
          ${standalone ? "" : `<span class="kind">Only in the bundle</span>`}
          ${installs === null ? "" : `<span class="metric"><strong>${compact(installs)}</strong> total downloads</span>`}
        </div>
        <p class="skill-desc">${esc(s.agentReview.description)}</p>
        ${note ? `<p class="member-note">${esc(note)}</p>` : ""}
      </li>`;
  });
  return `<ol class="bundle-skills">${items.join("")}</ol>`;
}

export default function Page(pageContext: PageContextServer): string {
  const { bundle: b } = pageContext.data as Data;
  const repo = repoKey(b);
  return `
    <div class="page skill-page bundle-page">
      ${crumbsHtml(repo)}
      <div class="title-row"><h1>${esc(b.agentReview.name)} <span class="kind">Bundle of ${plural(b.agentReview.skills.length, "skill")}</span></h1>${thumbsHtml(saveKey("bundle", b.id), b.agentReview.name)}${saveButton(saveKey("bundle", b.id), b.agentReview.name)}</div>
      ${
        b.agentReview.tldr?.glance.length
          ? `<section class="at-a-glance" aria-label="At a glance">${glanceHtml(b.agentReview.tldr.glance)}</section>`
          : `<p class="lede">${esc(b.agentReview.description)}</p>`
      }
      ${b.agentReview.tldr ? tldrHtml(b.agentReview.tldr, "the repo", b.skew) : ""}
      <div class="get">
          ${b.agentReview.install
            .map(
              ({ label, command }) =>
                `<p class="install-label">${esc(label)}</p><div class="install"><code>${commandHtml(command)}</code>${copyButton(command)}</div>`,
            )
            .join("")}
          <p class="links"><a href="https://github.com/${esc(repo)}">Source on GitHub</a><a href="${repoHref(repo)}">All skills from ${esc(repo)}</a></p>
      </div>
      ${tiles(b)}
      <section aria-labelledby="skills">
        <h2 id="skills">Its skills, in the order they're used</h2>
        <p class="muted">${aloneLine(b)}</p>
        ${skills(b)}
      </section>
    </div>`;
}
