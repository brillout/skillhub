/**
 * The edge cases: a catalog of some twenty entries, with one for each state the pages handle but
 * that the real data has no example of on most days, such as a skill without a TLDR, or with
 * unknown installs. Nobody sees how the pages take those, and no test does, until one goes live:
 * a skill is without a TLDR and without a copy of its SKILL.md from the add-skill skill to the
 * next sync, and skills.sh drops a skill's numbers when it drops its page.
 *
 * `SKILLHUB_DATA=edge-cases` has `pnpm dev`, `pnpm build`, `pnpm preview` and `pnpm check:site` work
 * on this catalog instead of the real one, beside it: see `siteOf`. The end-to-end walk covers it,
 * with e2e/edge-cases.spec.ts.
 *
 * The catalog is carved out of the real one rather than written: each entry is a real skill or
 * bundle, with its real SKILL.md copy, so it follows the data's shape as that changes. The entry
 * of a case is named after it, so that the list says what each row is there for.
 */

import { bundleRepo, github } from "../website/github.ts";
import type { Bundle, Data, Repo, Skill } from "./types.ts";

if (process.env.SKILLHUB_DATA && process.env.SKILLHUB_DATA !== "edge-cases")
  throw new Error(`SKILLHUB_DATA is "${process.env.SKILLHUB_DATA}": it can only be "edge-cases".`);
/** Whether this process works on the edge cases instead of the real catalog. */
export const EDGE_CASES = process.env.SKILLHUB_DATA === "edge-cases";

/**
 * Where a site is built and served: the edge cases' beside the real one's, so that both can run at
 * once, each with a database of its own, and so that a deploy, which takes website/dist/, can't
 * ship the edge cases.
 */
export const siteOf = (edgeCases = EDGE_CASES) =>
  edgeCases
    ? {
        port: 3100,
        workerPort: 8887,
        dist: "website/dist-edge-cases",
        state: ".wrangler/edge-cases",
      }
    : { port: 3000, workerPort: 8787, dist: "website/dist", state: ".wrangler/state" };

/**
 * Where the real site is live: its sitemap and its robots.txt say so (scripts/sitemap.ts), and
 * `pnpm check:live` asks it.
 */
export const LIVE = "https://skillhub.build";

/** What each case takes from a skill that lacks nothing, or from its repo. */
const SKILL_CASES = {
  /** As from the add-skill skill to the write-tldr skill: its description stands in. */
  "no-tldr": (s) => {
    delete s.agentReview.tldr;
  },
  /** A TLDR may have no glance, only its prose. */
  "empty-glance": (s) => {
    if (s.agentReview.tldr) s.agentReview.tldr.glance = [];
  },
  /** As from the add-skill skill to the next sync. */
  "no-skill-md-copy": (s) => {
    delete s.skillMd;
  },
  /** As when skills.sh no longer has its page. */
  "unknown-installs": (s) => {
    s["skills.sh"].installs = null;
  },
  "unknown-weekly-installs": (s) => {
    s["skills.sh"].weeklyInstalls = null;
  },
  "unknown-first-seen": (s) => {
    s["skills.sh"].firstSeen = null;
  },
  /**
   * A whitelisted author's skill that skills.sh doesn't list yet, as until someone installs it: it
   * has no numbers there, nor a page.
   */
  unlisted: (s) => {
    const sh = s["skills.sh"];
    s["skills.sh"] = {
      ...sh,
      installs: null,
      weeklyInstalls: null,
      firstSeen: null,
      unlisted: true,
    };
  },
  /** As when GitHub never answered for its repo. */
  "unknown-stars": (_s, repo) => {
    repo.stars = null;
  },
  /** The one tag that calls for a look before installing: see CAUTION in website/skills.ts. */
  republished: (s) => {
    s.agentReview.tags.push("flag:republished");
  },
} satisfies Record<string, (skill: Skill, repo: Repo) => void>;

/** What each case takes from a bundle that lacks nothing, from its skills, or from its repo. */
const BUNDLE_CASES = {
  "bundle-no-tldr": (b) => {
    delete b.agentReview.tldr;
  },
  /** A bundle's numbers are its skills': it has none when none of them has. */
  "bundle-unknown-numbers": (_b, skills, repo) => {
    for (const s of skills)
      s["skills.sh"] = { ...s["skills.sh"], installs: null, weeklyInstalls: null, firstSeen: null };
    repo.stars = null;
  },
} satisfies Record<string, (bundle: Bundle, skills: Skill[], repo: Repo) => void>;

export type SkillCase = keyof typeof SKILL_CASES;
export type BundleCase = keyof typeof BUNDLE_CASES;

/** How many skills and bundles that lack nothing the catalog keeps as they are: what the cases compare with. */
const ORDINARY = { skills: 2, bundles: 1 };

/** The edge cases' catalog, and each case's entry in it. */
export function edgeCases(real: Data): {
  data: Data;
  skills: Record<SkillCase, Skill>;
  bundles: Record<BundleCase, Bundle>;
} {
  const all = structuredClone(real);
  const repoById = new Map(all.repos.map((r) => [r.id, r]));
  const skillById = new Map(all.skills.map((s) => [s.id, s]));
  const members = (b: Bundle) => b.agentReview.skills.map((m) => skillById.get(m.id) as Skill);
  const inBundle = new Set(all.bundles.flatMap((b) => b.agentReview.skills.map((m) => m.id)));

  /** Nothing a case takes away is missing already, so that an entry differs from the others by its case alone. */
  const lacksNothing = (s: Skill) => {
    const sh = s["skills.sh"];
    return Boolean(
      s.agentReview.tldr?.glance.length &&
      s.skillMd &&
      sh.installs !== null &&
      sh.weeklyInstalls?.length &&
      sh.firstSeen &&
      repoById.get(github(s).repo)?.stars != null &&
      !s.agentReview.tags.some((t) => t.startsWith("flag:")),
    );
  };
  // One entry per repo: a case that changes its repo, such as unknown stars, changes no other entry.
  const repos = new Set<string>();
  const take = <E extends Skill | Bundle>(from: E[], n: number, repoOf: (e: E) => string) => {
    const taken: E[] = [];
    for (const e of from) {
      if (taken.length === n) break;
      if (repos.has(repoOf(e))) continue;
      repos.add(repoOf(e));
      taken.push(e);
    }
    if (taken.length < n)
      throw new Error("The data has too few entries to carve the edge cases from.");
    return taken;
  };

  // The smallest bundles, to keep the catalog small; and the most installed skills, in no bundle.
  const bundleCases = Object.keys(BUNDLE_CASES) as BundleCase[];
  const bundles = take(
    all.bundles
      .filter((b) => b.agentReview.tldr?.glance.length && members(b).every(lacksNothing))
      .sort(
        (a, b) =>
          a.agentReview.skills.length - b.agentReview.skills.length || a.id.localeCompare(b.id),
      ),
    bundleCases.length + ORDINARY.bundles,
    bundleRepo,
  );
  const skillCases = Object.keys(SKILL_CASES) as SkillCase[];
  const skills = take(
    all.skills
      .filter((s) => !inBundle.has(s.id) && lacksNothing(s))
      .sort((a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0)),
    skillCases.length + ORDINARY.skills,
    (s) => github(s).repo,
  );

  const bundleOf = {} as Record<BundleCase, Bundle>;
  bundleCases.forEach((name, i) => {
    const b = bundles[i];
    BUNDLE_CASES[name](b, members(b), repoById.get(bundleRepo(b)) as Repo);
    b.agentReview.name = name;
    bundleOf[name] = b;
  });
  const skillOf = {} as Record<SkillCase, Skill>;
  skillCases.forEach((name, i) => {
    const s = skills[i];
    SKILL_CASES[name](s, repoById.get(github(s).repo) as Repo);
    s.name = name;
    skillOf[name] = s;
  });

  const kept = new Set([...skills, ...bundles.flatMap(members)]);
  const data: Data = {
    ...all,
    repos: all.repos.filter((r) => repos.has(r.id)),
    bundles: all.bundles.filter((b) => bundles.includes(b)),
    skills: all.skills.filter((s) => kept.has(s)),
  };
  return { data, skills: skillOf, bundles: bundleOf };
}
