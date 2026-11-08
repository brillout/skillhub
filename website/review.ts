/**
 * How many skills SkillHub knows of and why it turned some down, for the header's tagline
 * and the about page. Only pages and +onRenderHtml.ts import it, which are server-only (see
 * pages/+config.ts), so crawl.jsonc stays out of the client build. Don't import it from a
 * +client.ts or what it imports.
 */

import raw from "../data/crawl.jsonc";
import { MINIMUMS } from "../scripts/data.ts";
import type { Crawl } from "../data/types.ts";
import { href } from "./format.ts";
import { data } from "./skills.ts";

const crawl = raw as Crawl;

/** The kinds of verdict an agent gives when it turns a skill down, told apart by its wording. */
const KINDS = [
  ["toolDocs", /^Tool docs/],
  ["vendorService", /^Vendor paid service/],
  ["language", /^In [A-Z][a-z]+\./],
  ["copy", /copy of|old name/i],
  ["retired", /^(Retired|Deprecated)/i],
] as const;
type Kind = (typeof KINDS)[number][0] | "other";

const turnedDown: Record<Kind, number> = {
  toolDocs: 0,
  vendorService: 0,
  language: 0,
  copy: 0,
  retired: 0,
  other: 0,
};
let gone = 0;
let notOnGitHub = 0;
for (const { reason } of crawl.disqualified) {
  if ("agentReview" in reason)
    turnedDown[KINDS.find(([, re]) => re.test(reason.agentReview.note))?.[0] ?? "other"]++;
  else if ("goneFromRepo" in reason) gone++;
  else notOnGitHub++;
}

export const review = {
  /** The skills the site lists. */
  listed: data.skills.length,
  bundles: data.bundles.length,
  /** Every skill SkillHub knows of: listed, waiting, under the minimums or disqualified. */
  reviewed:
    data.skills.length +
    crawl.qualified.length +
    crawl.unqualified.length +
    crawl.disqualified.length,
  turnedDown,
  gone,
  notOnGitHub,
  /** Qualified, waiting for an agent. */
  waiting: crawl.qualified.length,
  /** Found by the crawl, but under the minimums. */
  under: crawl.unqualified.length,
  minimums: MINIMUMS,
  asOf: data.asOf.installs,
};

const n = (x: number) => x.toLocaleString("en");

/** The header's tagline: on the skills list, its count is the page's h1; elsewhere, the page has its own. */
export const taglineHtml = (h1: boolean) => {
  const tag = h1 ? "h1" : "span";
  return `<div class="tagline"><${tag} class="tagline-count">${n(review.listed)} curated skills</${tag}><a href="${href("about/")}">From ${n(review.reviewed)} reviewed skills</a></div>`;
};
