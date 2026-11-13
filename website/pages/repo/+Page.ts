import type { PageContextServer } from "vike/types";
import { esc, glanceEnd, href } from "../../format.ts";
import { crowdDefsHtml, listingHtml, skillsLink } from "../../list.ts";
import { KINDS, numbersHtml } from "../../listings.ts";
import { ownerHref, ownerName } from "../../skills.ts";
import type { Data } from "./+data.ts";

export default function Page(pageContext: PageContextServer): string {
  const { listing } = pageContext.data as Data;
  const { repo, bundles, skills } = listing;
  const name = repo.id.split("/")[1];
  return `
    <div class="page listing-page">
      <p class="crumbs"><a href="${href()}">Skills</a> <span aria-hidden="true">/</span> <a href="${ownerHref(repo.id)}">${esc(ownerName(repo.id))}</a></p>
      <h1>${esc(name)} <span class="kind">${KINDS[repo.agentReview.kind]}</span></h1>
      ${repo.agentReview.description ? `<p class="lede">${esc(glanceEnd(repo.agentReview.description))}</p>` : ""}
      ${repo.agentReview.note ? `<p class="note">${esc(repo.agentReview.note)}</p>` : ""}
      <p class="links"><a href="https://github.com/${esc(repo.id)}">Source on GitHub</a><a href="${skillsLink({ repo: repo.id })}">${skills.length === 1 ? "See it in the skills list" : "Sort and filter them in the skills list"}</a></p>
      <p class="muted">${numbersHtml(listing)}</p>
      ${
        bundles.length
          ? `<section aria-labelledby="bundles"><h2 id="bundles">${bundles.length === 1 ? "Its bundle" : "Its bundles"}</h2>${listingHtml(bundles)}</section>`
          : ""
      }
      <section aria-labelledby="skills"><h2 id="skills">${skills.length === 1 ? "Its skill" : "Its skills, most downloaded first"}</h2>${listingHtml(skills)}</section>
      ${crowdDefsHtml()}
    </div>`;
}
