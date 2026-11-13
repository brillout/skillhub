import type { PageContextServer } from "vike/types";
import { esc, glanceEnd, href, plural } from "../../format.ts";
import { crowdDefsHtml, listingHtml } from "../../list.ts";
import { KINDS, numbersHtml } from "../../listings.ts";
import { repoHref } from "../../skills.ts";
import type { Data } from "./+data.ts";

export default function Page(pageContext: PageContextServer): string {
  const { owner, listings } = pageContext.data as Data;
  const skills = listings.reduce((n, l) => n + l.skills.length, 0);
  const repos = listings.map((listing, i) => {
    const { repo, bundles, skills } = listing;
    return `
      <section aria-labelledby="repo-${i}">
        <h2 id="repo-${i}"><a href="${repoHref(repo.id)}">${esc(repo.id.split("/")[1])}</a> <span class="kind">${KINDS[repo.agentReview.kind]}</span></h2>
        ${repo.agentReview.description ? `<p>${esc(glanceEnd(repo.agentReview.description))}</p>` : ""}
        <p class="muted">${numbersHtml(listing)}</p>
        ${listingHtml([...bundles, ...skills])}
      </section>`;
  });
  return `
    <div class="page listing-page">
      <p class="crumbs"><a href="${href()}">Skills</a></p>
      <h1>${esc(owner)}</h1>
      <p class="lede">${plural(skills, "skill")} listed here, from ${listings.length === 1 ? "one repo" : `${listings.length} repos, most starred first`}.</p>
      <p class="links"><a href="https://github.com/${esc(owner)}">${esc(owner)} on GitHub</a></p>
      ${repos.join("")}
      ${crowdDefsHtml()}
    </div>`;
}
