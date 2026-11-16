import type { PageContextServer } from "vike/types";
import { age, commandHtml, compact, date, esc, plural, textHtml } from "../../format.ts";
import {
  aloneLine,
  crumbsHtml,
  data,
  glanceHtml,
  growthOf,
  installsOf,
  NUMBER_LABELS,
  publishedOf,
  repoHref,
  repoKey,
  repoName,
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
 * downloaded skill's downloads, its repo's stars and its oldest skill's age. Each tile names the
 * skill its number is, and says which it is: the week's top skill can be another than the top one
 * of all time, as for Superpowers, whose two tiles both said "its top skill" of two skills. And the
 * oldest isn't the first of the bundle's list, as "its first skill" read.
 */
function tiles(b: Bundle): string {
  const most = (of: (s: Skill) => number | null) =>
    skillsOf(b).toSorted((x, y) => (of(y) ?? -1) - (of(x) ?? -1))[0];
  const link = (s: Skill) => `<a href="${skillHref(s.id)}">${esc(s.name)}</a>`;
  const topWeek = most(weekOf);
  const top = most(installsOf);
  const stars = starsOf(b);
  const published = publishedOf(b);
  const oldest = skillsOf(b).find((s) => publishedOf(s) === published);
  return statTilesHtml(b, [
    {
      p: "week",
      label: NUMBER_LABELS.week,
      from: `${link(topWeek)}, its top skill this week`,
      shown: weekOf(topWeek)?.toLocaleString("en") ?? "",
      trend: topWeek["skills.sh"].weeklyInstalls,
      growth: growthOf(topWeek),
    },
    {
      p: "downloads",
      label: NUMBER_LABELS.downloads,
      from: `${link(top)}, its top skill of all time`,
      shown: installsOf(top)?.toLocaleString("en") ?? "",
    },
    {
      p: "stars",
      label: NUMBER_LABELS.stars,
      from: esc(repoName(repoKey(b))),
      shown: stars?.toLocaleString("en") ?? "",
    },
    {
      p: "published",
      label: NUMBER_LABELS.published,
      from:
        oldest && published
          ? `${link(oldest)}, its oldest skill, published <span class="nowrap">${date(published)}</span>`
          : "",
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
          ${installs === null ? "" : `<span class="metric"><strong>${compact(installs)}</strong> total download${installs === 1 ? "" : "s"}</span>`}
        </div>
        <p class="skill-desc">${textHtml(s.agentReview.description)}</p>
        ${note ? `<p class="member-note">${textHtml(note)}</p>` : ""}
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
      <div class="title-row"><h1>${esc(b.agentReview.name)} <span class="kind">Bundle of ${plural(b.agentReview.skills.length, "skill")}</span></h1><div class="title-actions">${thumbsHtml(saveKey("bundle", b.id), b.agentReview.name)}${saveButton(saveKey("bundle", b.id), b.agentReview.name)}</div></div>
      ${
        b.agentReview.tldr?.glance.length
          ? `<section class="at-a-glance" aria-label="At a glance">${glanceHtml(b.agentReview.tldr.glance)}</section>`
          : `<p class="lede">${textHtml(b.agentReview.description)}</p>`
      }
      ${b.agentReview.tldr ? tldrHtml(b.agentReview.tldr, "the repo", b.skew) : ""}
      <div class="get" id="install">
          ${b.agentReview.install
            .map(
              ({ label, command }, i) =>
                `<p class="install-label" id="install-${i + 1}">${esc(label)}</p><div class="install"><code>${commandHtml(command)}</code>${copyButton(command, `install-${i + 1}`)}</div>`,
            )
            .join("")}
          <p class="links"><a href="https://github.com/${esc(repo)}">Source on GitHub</a><a href="${repoHref(repo)}">All skills from ${esc(repoName(repo))}</a></p>
      </div>
      ${tiles(b)}
      <section aria-labelledby="skills">
        <h2 id="skills">Its skills, in the order they're used</h2>
        <p class="muted">${aloneLine(b)}</p>
        ${skills(b)}
      </section>
    </div>`;
}
