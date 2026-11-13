/**
 * What the owners' and repos' pages list: every repo with a skill on the site, with its bundles and
 * skills. Only pages import it, which render on the server.
 */

import { date, plural } from "./format.ts";
import { bundleRepo, ownerPage, repoPage } from "./github.ts";
import { data, desc, installsOf, repoKey } from "./skills.ts";
import { fullRepoById } from "./server-data.ts";
import type { Repo } from "../data/types.ts";
import type { ClientBundle as Bundle, ClientSkill as Skill } from "./client-data.ts";

export interface Listing {
  repo: Repo;
  /** Most installed first, as are its skills. */
  bundles: Bundle[];
  /** Every skill of the repo, those only listed inside their bundle included. */
  skills: Skill[];
}

const mostInstalled = <E extends Skill | Bundle>(entries: E[]) =>
  entries.toSorted((a, b) => desc(installsOf(a), installsOf(b)));

/** Each repo's listing, by the repo's page: see repoPage(). */
export const listingByPage = new Map<string, Listing>();
for (const s of mostInstalled(data.skills)) {
  const id = repoKey(s);
  let listing = listingByPage.get(repoPage(id));
  if (!listing) {
    const bundles = mostInstalled(data.bundles.filter((b) => bundleRepo(b) === id));
    listing = { repo: fullRepoById.get(id) as Repo, bundles, skills: [] };
    listingByPage.set(repoPage(id), listing);
  }
  listing.skills.push(s);
}

/** The listings of each owner's repos, most starred first, by the owner's page: see ownerPage(). */
export const listingsByOwner = new Map<string, Listing[]>();
for (const listing of [...listingByPage.values()].sort((a, b) =>
  desc(a.repo.stars, b.repo.stars),
)) {
  const page = ownerPage(listing.repo.id);
  listingsByOwner.set(page, [...(listingsByOwner.get(page) ?? []), listing]);
}

/** A repo's kind, as its page and its owner's show it. */
export const KINDS: Record<Repo["agentReview"]["kind"], string> = {
  skills: "Skill collection",
  project: "Project",
  index: "Catalog",
};

/**
 * A repo's stars, and how many skills and bundles it has on the site: each a fact of its own, which
 * a line breaks between, not inside (see .fact in style.css). A fact's dot is its own, at its end,
 * so that a line ends on it: between two facts, it started the next line on some phones. Its skills
 * are the ones listed here, and say so: under a repo's own "86 agent skills for iOS", "1 skill"
 * read as a count of the repo's.
 */
export function numbersHtml({ repo, bundles, skills }: Listing): string {
  return [
    repo.stars === null ? "" : `${plural(repo.stars, "star")} on GitHub, ${date(data.asOf.stars)}`,
    `${plural(skills.length, "skill")} listed here`,
    bundles.length ? plural(bundles.length, "bundle") : "",
  ]
    .filter(Boolean)
    .map((fact, i, facts) => `<span class="fact">${fact}${i < facts.length - 1 ? " ·" : ""}</span>`)
    .join(" ");
}
