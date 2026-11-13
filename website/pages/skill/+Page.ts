import type { PageContextServer } from "vike/types";
import { age, commandHtml, date, esc, textHtml } from "../../format.ts";
import { skillsLink } from "../../list.ts";
import { statTilesHtml } from "../../stat-tiles.ts";
import { copyButton } from "../../copy.ts";
import {
  CAUTION,
  FACET_ORDER,
  bundleHref,
  bundleOf,
  crumbsHtml,
  data,
  facetById,
  facetOf,
  glanceHtml,
  inBundleHtml,
  installCommand,
  NUMBER_LABELS,
  publishedOf,
  repoHref,
  repoKey,
  short,
  starsOf,
  tagChip,
  tagInfo,
  tagsOf,
  tldrHtml,
} from "../../skills.ts";
import type { Skill, SkillMd } from "../../../data/types.ts";
import { github } from "../../github.ts";
import { saveButton, saveKey, thumbsHtml } from "../../saves.ts";
import { fullBundleById } from "../../server-data.ts";
import type { Data } from "./+data.ts";

/** Where the copy of the SKILL.md came from. */
function source(s: Skill, { version }: SkillMd): string {
  const gh = github(s);
  return `<a href="https://github.com/${esc(gh.repo)}/blob/${version}/${esc(encodeURI(gh.dir ? `${gh.dir}/SKILL.md` : "SKILL.md"))}">${esc(gh.repo)} at ${short(version)}</a>`;
}

/** Its numbers, a tile each: see stat-tiles.ts. */
function tiles(s: Skill): string {
  const sh = s["skills.sh"];
  const week = sh.weeklyInstalls?.[sh.weeklyInstalls.length - 1] ?? null;
  const stars = starsOf(s);
  const published = publishedOf(s);
  return statTilesHtml(s, [
    {
      p: "week",
      label: NUMBER_LABELS.week,
      from: `week to ${date(data.asOf.installs)}`,
      shown: week?.toLocaleString("en") ?? "",
      trend: sh.weeklyInstalls,
    },
    {
      p: "downloads",
      label: NUMBER_LABELS.downloads,
      from: "on skills.sh",
      shown: sh.installs?.toLocaleString("en") ?? "",
    },
    {
      p: "stars",
      label: NUMBER_LABELS.stars,
      from: esc(repoKey(s)),
      shown: stars?.toLocaleString("en") ?? "",
    },
    {
      p: "published",
      label: NUMBER_LABELS.published,
      from: published ? `published ${date(published)}` : "",
      shown: published ? age(published, data.asOf.installs) : "",
    },
  ]);
}

function tagTable(s: Skill): string {
  const byFacet = new Map<string, string[]>();
  for (const t of tagsOf(s)) byFacet.set(facetOf(t), [...(byFacet.get(facetOf(t)) ?? []), t]);
  const rows = FACET_ORDER.filter((f) => byFacet.has(f)).map((f) => {
    const tags = byFacet.get(f) ?? [];
    const explained = f === "topic" || f === "stack" ? [] : tags.filter((t) => tagInfo.has(t));
    return `
      <tr>
        <th scope="row">${esc(facetById.get(f)?.name ?? f)}</th>
        <td>
          <div class="tags">${tags.map((t) => tagChip(t, skillsLink({ tags: [t] }))).join("")}</div>
          ${explained.map((t) => `<p class="tag-meaning">${esc(tagInfo.get(t) ?? "")}</p>`).join("")}
        </td>
      </tr>`;
  });
  return `<table class="tag-detail">${rows.join("")}</table>`;
}

/**
 * Where the skill sits in its bundle (see inBundleHtml), and, for one that only works there, why.
 * `data-only-in-bundle` marks that for its preview on the skills list, which takes it from here:
 * the browser's data is without the reason (see client-data.ts).
 */
function inBundle(s: Skill): string {
  const place = bundleOf.get(s.id);
  if (!place) return "";
  const { bundle, index, standalone } = place;
  const note = fullBundleById.get(bundle.id)?.agentReview.skills[index]?.note;
  return `
    ${inBundleHtml(s)}
    ${standalone ? "" : `<p class="note" data-only-in-bundle>Only works inside its bundle: ${textHtml(note ?? "")} Install <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a> instead.</p>`}`;
}

export default function Page(pageContext: PageContextServer): string {
  const { skill: s, copy } = pageContext.data as Data;
  const gh = github(s);
  const sh = s["skills.sh"];
  const state = s.skillMd;
  const links = [
    // A skill skills.sh doesn't list yet has no page there.
    ...(sh.unlisted ? [] : [`<a href="${esc(sh.url)}">skills.sh page</a>`]),
    `<a href="https://github.com/${esc(gh.repo)}${gh.dir ? `/tree/HEAD/${esc(encodeURI(gh.dir))}` : ""}">Source on GitHub</a>`,
    `<a href="${repoHref(repoKey(s))}">All skills from ${esc(repoKey(s))}</a>`,
  ];
  const bundle = bundleOf.get(s.id)?.bundle;
  // A skill that only works inside its bundle is installed with it: its page says "Install <the
  // bundle> instead", and its one command, with Copy beside it, installed the skill alone.
  const whole = bundleOf.get(s.id)?.standalone === false && bundle && fullBundleById.get(bundle.id);
  const with_ = whole ? whole.agentReview.install[0] : undefined;
  const get =
    whole && with_
      ? `<p class="install-label">${esc(with_.label)}: installs <a href="${bundleHref(whole.id)}">${esc(whole.agentReview.name)}</a>, the bundle it works in.</p>
        <div class="install"><code>${commandHtml(with_.command)}</code>${copyButton(with_.command)}</div>`
      : `<div class="install"><code>${commandHtml(installCommand(s))}</code>${copyButton(installCommand(s))}</div>`;
  if (whole && whole.agentReview.install.length > 1)
    links.unshift(`<a href="${bundleHref(whole.id)}">Other ways to install it</a>`);
  // What calls for a look before installing, such as a republished skill's flag, which says to
  // distrust its ranking: up here, before its command and its numbers, as its preview has it and as
  // its row says down its left edge. In the tags' table alone, it came after them all.
  const cautions = s.agentReview.tags.filter((t) => CAUTION.includes(t) && tagInfo.has(t));
  return `
    <div class="page skill-page">
      ${crumbsHtml(repoKey(s), ...(bundle ? [`<a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a>`] : []))}
      <div class="title-row"><h1>${esc(s.name)}</h1><div class="title-actions">${thumbsHtml(saveKey("skill", s.id), s.name)}${saveButton(saveKey("skill", s.id), s.name)}</div></div>
      ${
        s.agentReview.tldr?.glance.length
          ? `<section class="at-a-glance" aria-label="At a glance">${glanceHtml(s.agentReview.tldr.glance)}</section>`
          : `<p class="lede">${textHtml(s.agentReview.description)}</p>`
      }
      ${inBundle(s)}
      ${cautions.map((t) => `<p class="note">${esc(tagInfo.get(t) ?? "")}</p>`).join("")}
      ${s.agentReview.note ? `<p class="note">${textHtml(s.agentReview.note)}</p>` : ""}
      ${s.agentReview.tldr ? tldrHtml(s.agentReview.tldr, "the skill", s.skillMd?.skew ?? 0) : ""}
      <div class="get">
        ${get}
        <p class="links">${links.join("")}</p>
      </div>
      ${tiles(s)}
      ${tagTable(s)}
      <section class="skill-md" aria-labelledby="skill-md">
        <h2 id="skill-md">SKILL.md</h2>
        ${
          copy && state
            ? `<p class="muted">From ${source(s, state)}. Checked daily, last changed ${date(state.updated)}.</p>
        ${copy.frontmatter ? `<details class="frontmatter"><summary>Frontmatter</summary><pre><code>${esc(copy.frontmatter)}</code></pre></details>` : ""}
        <div class="markdown">${copy.html}</div>`
            : `<p class="muted">No copy of its SKILL.md yet.</p>`
        }
      </section>
    </div>`;
}
