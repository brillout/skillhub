/**
 * How many skills SkillHub knows of and why it turned some down, for the about page, and the
 * skills waiting for an agent review, for the queue page. Only pages import it, and Page is
 * server-only (pages/+config.ts), so crawl.jsonc stays out of the client build. Don't import it
 * from a +client.ts or what it imports.
 */

import raw from "../data/crawl.jsonc";
import { MINIMUMS } from "../data/params.ts";
import type { Crawl } from "../data/types.ts";
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
  /**
   * The skills SkillHub has a verdict on: listed, disqualified, or under the minimums, which only
   * their installs and stars were checked for. All but those waiting for an agent review.
   */
  reviewed: data.skills.length + crawl.disqualified.length + crawl.unqualified.length,
  /** Every skill SkillHub found on skills.sh: reviewed or waiting. */
  crawled:
    data.skills.length +
    crawl.disqualified.length +
    crawl.unqualified.length +
    crawl.qualified.length,
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

/** The skills waiting for an agent review, most installed first, as of the crawl's day. */
export const queue = { skills: crawl.qualified, asOf: crawl.asOf };
