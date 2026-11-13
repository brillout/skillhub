/**
 * The shape of the data files: skills.jsonc, as `Data` describes, and crawl.jsonc, as `Crawl`
 * describes. ../scripts/schema.ts generates their JSON Schemas from these types.
 */

/**
 * The shape of skills.jsonc, the single data file behind the site: the approved skills, the ones
 * it shows. The skills the crawl found but that aren't approved are in crawl.jsonc.
 */
export interface Data {
  /** The JSON Schema of this file, generated from this interface: for editors. */
  $schema: string;
  /** When each kind of data is from (YYYY-MM-DD). */
  asOf: {
    /**
     * When the installs were collected.
     *
     * Source: scripts/crawl.ts, which .github/workflows/crawl.yml runs daily, sets it to the day
     * it runs.
     */
    installs: string;
    /**
     * When the GitHub stars were collected.
     *
     * Source: scripts/crawl.ts sets it to the day it runs, when it got stars from GitHub.
     */
    stars: string;
    /**
     * When the tags were last assigned, which the tags page shows.
     *
     * Source: the agent that tags or retags a skill, with the review-skills skill, sets it to that
     * day.
     */
    tags: string;
  };
  /** The tag dimensions, with the values their tags can take. */
  facets: Facet[];
  /** The GitHub repos of the skills and bundles, one entry each. */
  repos: Repo[];
  /** Skills meant to be installed together. */
  bundles: Bundle[];
  /** The approved skills: the ones the site lists. */
  skills: Skill[];
}

/**
 * The shape of data/crawl.jsonc: every skill the crawl has seen that isn't approved (the approved
 * ones are in skills.jsonc), keyed by its skills.sh page: those of the skills.sh all-time top 600,
 * those further down skills.sh's sitemap that reach `MINIMUMS.installs`, and all those of the
 * `WHITELISTED_AUTHORS` of ./params.ts, on skills.sh or beside those in their GitHub repos. The two
 * files are cumulative: a skill that lands in either never leaves them, only its state changes.
 * Unlike skills.jsonc, crawl.jsonc takes any skill, such as one a website publishes.
 */
export interface Crawl {
  /** The JSON Schema of this file, generated from this interface: for editors. */
  $schema: string;
  /**
   * When crawl.ts last ran (YYYY-MM-DD).
   *
   * Source: scripts/crawl.ts, which .github/workflows/crawl.yml runs daily, sets it to the day it
   * runs.
   */
  asOf: string;
  /**
   * At the minimums (`MINIMUMS` in ./params.ts) or above, or by a whitelisted author
   * (`WHITELISTED_AUTHORS` there), most installed first: waiting for an agent to approve or
   * disqualify them, with the review-skills skill.
   *
   * Source: scripts/crawl.ts sorts every skill it saw that day, in the top 600, down the sitemap or
   * by a whitelisted author, into `qualified` or `unqualified`, with `passes()` of scripts/data.ts; a skill it
   * didn't see keeps its state.
   */
  qualified: Crawled[];
  /**
   * Below the minimums, most installed first.
   *
   * Source: scripts/crawl.ts, as for `qualified`.
   */
  unqualified: Crawled[];
  /**
   * Not to be shown, each with why, and with no agent data: no tags, no TLDR, no copy of its
   * SKILL.md.
   *
   * Source: scripts/crawl.ts adds the skills of the top 600 that aren't on GitHub, scripts/sync.ts
   * the approved skills whose SKILL.md is gone from their repo, and an agent, with the
   * review-skills skill, the qualified skills it turns down.
   */
  disqualified: Disqualified[];
}

/**
 * A skill the crawl found, in the top 600, down the sitemap or by a whitelisted author, that's
 * qualified or unqualified.
 */
export interface Crawled {
  /**
   * Its name on skills.sh: the end of its skills.sh page.
   *
   * Source: scraped by scripts/crawl.ts when it records the skill: `topSkills()` takes `name`
   * from the leaderboard JSON in the HTML of https://www.skills.sh/; for a skill found down the
   * sitemap or by a whitelisted author, it's the end of the skill's page there, which for one found
   * beside their skills in their repos, `besideListed()`, is the `name` of its SKILL.md's
   * frontmatter.
   */
  name: string;
  /**
   * Its GitHub repo, `owner/name`, as skills.sh names it: possibly an old name the repo redirects
   * from.
   *
   * Source: scraped by scripts/crawl.ts when it records the skill: the `source` of its
   * leaderboard entry, or for a skill found down the sitemap or by a whitelisted author, the owner
   * and repo in its page's URL.
   */
  repo: string;
  /**
   * Whether skills.sh shows its publisher as verified: false while skills.sh doesn't list it.
   *
   * Source: scraped by scripts/crawl.ts, daily while it sees the skill: the `isOfficial` of its
   * leaderboard entry, or for any other skill, whether the HTML of its skills.sh page
   * has `title="Verified organization on GitHub"`.
   */
  official: boolean;
  /**
   * Its repo's GitHub stars, or null when unknown.
   *
   * Source: the GitHub API, by scripts/crawl.ts, daily while it sees the skill: the
   * `stargazers_count` of https://api.github.com/repos/<repo>, when GITHUB_TOKEN is set. A
   * request that fails keeps the last number.
   */
  stars: number | null;
  /**
   * The last day the crawl saw it, in the top 600, down the sitemap or by a whitelisted author,
   * which its numbers are from (YYYY-MM-DD).
   *
   * Source: scripts/crawl.ts sets it to the day it runs, for every skill it sees.
   */
  seen: string;
  /** Its `skills.sh` field once it's approved. */
  "skills.sh": SkillsSh;
}

export interface Disqualified {
  /** Its skills.sh page. */
  url: string;
  /** Why it's disqualified: an agent's verdict, or a fact a script found. */
  reason: DisqualifiedReason;
}

/** One of: an agent turned it down, its SKILL.md is gone from its repo, or it isn't on GitHub. */
export type DisqualifiedReason =
  | {
      /**
       * Why an agent turned it down, and which agent.
       *
       * Source: the agent that reviews the qualified skill, with the review-skills skill.
       */
      agentReview: DisqualifyReview;
    }
  | {
      /**
       * The day its SKILL.md was found gone from its repo's HEAD, YYYY-MM-DD.
       *
       * Source: scripts/sync.ts, for an approved skill; and the agent working through the
       * qualified skills, with the review-skills skill, for a qualified one.
       */
      goneFromRepo: string;
    }
  | {
      /**
       * The site skills.sh lists it from instead of a GitHub repo, such as "open.feishu.cn".
       *
       * Source: scripts/crawl.ts, for a skill of the skills.sh top 600 that isn't on GitHub.
       */
      notOnGitHub: string;
    };

/** A tag dimension. Tags are written `facet:value`, except topics, which have no prefix. */
export interface Facet {
  /** Its id: the prefix of its tags, `id:value`. */
  id: string;
  /** Its name, as the site shows it. */
  name: string;
  /** The question its values answer. */
  question: string;
  /** How many values of this facet a skill carries. */
  count: "one" | "one or more" | "at most one" | "one to five" | "any";
  /**
   * The values its tags can take, when they're a closed list. Left out for a facet that takes any
   * value, as stack does, a technology or a service: its tags are the ones the skills carry.
   */
  values?: {
    /** Its id: the tag is `facet:id`, or just `id` for a topic. */
    id: string;
    /** A name for chips, when the id alone isn't one. */
    label?: string;
    /** What it means: for people browsing, and for agents tagging skills. */
    description?: string;
    /**
     * Makes the value a parent of these values of the same facet: skills don't carry it, they
     * have it through any of them, and filtering on it lists them all.
     */
    includes?: string[];
  }[];
  /** `false` for topics, which are written without a `topic:` prefix. */
  prefix?: false;
  /** Display groups (topics only). */
  groups?: {
    /** The group's heading. */
    name: string;
    /** The ids of its values. */
    values: string[];
  }[];
}

export interface Repo {
  /**
   * GitHub `owner/name`: its page is https://github.com/<id>.
   *
   * Source: the agent that approves the repo's first skill, with the review-skills skill.
   */
  id: string;
  /**
   * GitHub stars, or null when unknown.
   *
   * Source: the GitHub API, by scripts/crawl.ts, which .github/workflows/crawl.yml runs daily:
   * the `stargazers_count` of https://api.github.com/repos/<id>, when GITHUB_TOKEN is set. A
   * request that fails keeps the last number.
   */
  stars: number | null;
  /**
   * What an agent wrote about the repo: everything else is collected by scripts.
   *
   * Source: the agent that approves the repo's first skill, with the review-skills skill.
   */
  agentReview: RepoReview;
}

/** An agent's verdict on a skill it turned down. */
export interface DisqualifyReview extends ReviewAuthor {
  /** Why, in one sentence, such as "Tool docs: an agent's manual for aws.". */
  note: string;
}

/** Which agent wrote a review: every `agentReview` object has these two fields. */
export interface ReviewAuthor {
  /**
   * The model of the agent that last wrote or changed the review, such as "Claude Opus 5.5". When
   * that agent switched models partway, the one that served most of its turns.
   *
   * Source: the agent that writes or changes any part of the review sets it to its own model. For
   * a review last written before 2026-11-07, it's the model the repo's commits name in their
   * Co-Authored-By trailer.
   */
  model: string;
  /**
   * That agent's reasoning effort, or null when it wasn't recorded, as for a review last written
   * before 2026-11-07.
   *
   * Source: as for `model`.
   */
  effort: "low" | "medium" | "high" | "xhigh" | "max" | null;
}

export interface RepoReview extends ReviewAuthor {
  /** `skills`: exists to ship skills. `project`: a product that also ships a skill. `index`: a curated list or catalog. */
  kind: "skills" | "project" | "index";
  /** The repo in one line, such as its GitHub description, or null when it has none. */
  description: string | null;
  /** Something to know about the repo, such as where its star count comes from. */
  note?: string;
}

/**
 * A skill on GitHub that skills.sh lists, or a whitelisted author's (`WHITELISTED_AUTHORS` of
 * ./params.ts), which skills.sh may not list yet. SkillHub lists no other skills.
 */
export interface Skill {
  /**
   * Unique: where the skill's SKILL.md lives, as the GitHub repo and the directory inside it,
   * `owner/name/path/to/dir` (just `owner/name` for a SKILL.md at the root). The repo has an
   * entry in `repos`.
   *
   * Source: the agent that approves the skill, with the review-skills skill, from where its
   * SKILL.md is on GitHub.
   */
  id: string;
  /**
   * Its name: the `name` in the frontmatter of its SKILL.md, which skills.sh also ends its page
   * with.
   *
   * Source: the `name` of its crawl.jsonc entry, which the agent that approves the skill copies.
   * `pnpm run check` fails when it isn't the `name` of its SKILL.md copy.
   */
  name: string;
  /**
   * Its listing on skills.sh, or for a whitelisted author's skill skills.sh doesn't list yet, the
   * listing it will have, `unlisted`.
   *
   * Source: its crawl.jsonc entry, which the agent that approves the skill copies; scripts/crawl.ts
   * then keeps its numbers current.
   */
  "skills.sh": SkillsSh;
  /**
   * The copy of the skill's SKILL.md at `data/skill-snapshots/<id>.md`, which `sync.ts` keeps
   * current.
   *
   * Source: scripts/sync.ts, which .github/workflows/sync.yml runs daily: it fetches the SKILL.md
   * from https://raw.githubusercontent.com/<repo>/<commit>/<dir>/SKILL.md, at the commit of the
   * repo's HEAD, and updates the copy and this field when the text changed.
   */
  skillMd?: SkillMd;
  /**
   * What an agent wrote about the skill: everything else is collected by scripts.
   *
   * Source: the agent that approves the skill, with the review-skills skill, which writes its
   * description, tags and note, and sets its TLDR with `pnpm run tldr`.
   */
  agentReview: SkillReview;
}

export interface SkillReview extends ReviewAuthor {
  /** One sentence on what it does, shown until it has a TLDR. */
  description: string;
  /** What the skill is and does, written from the SKILL.md its permalink points to. */
  tldr?: Tldr;
  /** Its tags, `facet:value` or just the value for a topic, from the values `facets` defines. */
  tags: string[];
  /** Something to know before installing. */
  note?: string;
}

/**
 * Skills of one repo meant to be installed together, such as the steps of a workflow. Its skills
 * are listed inside its entry; those worth installing alone also get an entry of their own.
 */
export interface Bundle {
  /**
   * The GitHub repo, `owner/name`, or `owner/name@part` for one of several bundles in a repo.
   *
   * Source: the agent that records the bundle, with the review-skills skill.
   */
  id: string;
  /**
   * Words added plus words removed across its skills' SKILL.md since the commit the TLDR
   * summarizes, or all their words when there's no TLDR.
   *
   * Source: scripts/sync.ts, daily, when one of its skills' SKILL.md changed: it compares each
   * skill's copy with its SKILL.md at the commit of the bundle's TLDR permalink, fetched from
   * https://raw.githubusercontent.com/, with `skew()` of website/skill-md.ts. `pnpm run tldr`
   * resets it to 0 when it sets the TLDR.
   */
  skew: number;
  /**
   * What an agent wrote about the bundle: all of it but its id and skew.
   *
   * Source: the agent that records the bundle, with the review-skills skill, which sets its TLDR
   * with `pnpm run tldr`.
   */
  agentReview: BundleReview;
}

export interface BundleReview extends ReviewAuthor {
  /** Its name, as the site shows it. */
  name: string;
  /** One sentence, shown until it has a TLDR. */
  description: string;
  /** What the bundle is and how its skills work together, written from the repo at its permalink's commit. */
  tldr?: Tldr;
  /** Its skills, in the order they're used. */
  skills: BundleSkill[];
  /** How to install all of its skills, one command per way, as its README gives them. */
  install: {
    /** Where the command works, such as "Claude Code plugin". */
    label: string;
    /** The command to run. */
    command: string;
  }[];
}

export interface BundleSkill {
  /** Where its SKILL.md lives, as for a skill's `id`. */
  id: string;
  /**
   * Whether it's worth installing alone, with no other skill of the bundle. A skill that loads
   * another one of the bundle, or only works on another's output, isn't.
   */
  standalone: boolean;
  /**
   * For a standalone skill: whether the skills list also shows it on a row of its own, besides its
   * bundle's row. True when people would want it without the rest of the bundle, such as `tdd` in
   * an engineering-workflow bundle. False when whoever would want it would want the bundle too:
   * a skill for the bundle's niche, such as `save-systems` in a game-dev bundle, or one of a
   * family of siblings that only differ in what they cover, such as game genres. False too for the
   * skill the bundle is named after, such as `caveman` in Caveman: the bundle's row already is its
   * row. A bundle's skills get installed together and rise together, so such rows would flood the
   * list.
   */
  listedOutsideBundle?: boolean;
  /** For a skill that isn't standalone: what it needs from the rest of the bundle. */
  note?: string;
}

export interface Tldr {
  /** Short labelled facts to place the skill quickly, most telling first, such as "Use it when". */
  glance: {
    /** A few words, such as "Use it when". */
    label: string;
    /** What the label introduces. */
    text: string;
  }[];
  /** Prose that explains what the skill does. */
  text: string;
  /**
   * GitHub permalink to what the TLDR summarizes: the skill's directory at a commit. For a
   * bundle, its repo at a commit.
   *
   * Source: scripts/tldr.ts, when it sets the TLDR: for a skill, its directory at the commit of
   * its copy (`skillMd.version`); for a bundle, its repo at the commit of the repo's HEAD, once
   * its skills' copies match it.
   */
  permalink: string;
}

export interface SkillMd {
  /**
   * The GitHub commit the copy was taken from.
   *
   * Source: scripts/sync.ts: `git ls-remote https://github.com/<repo> HEAD`, when the copy
   * changes.
   */
  version: string;
  /**
   * When the copy last changed (YYYY-MM-DD).
   *
   * Source: scripts/sync.ts sets it to the day it finds the SKILL.md changed.
   */
  updated: string;
  /**
   * Words added plus words removed since the SKILL.md the TLDR summarizes, or all its words when
   * there's no TLDR.
   *
   * Source: scripts/sync.ts, when the SKILL.md changed: it compares the new text with the
   * SKILL.md at the TLDR's permalink, fetched from https://raw.githubusercontent.com/, with
   * `skew()` of website/skill-md.ts. `pnpm run tldr` resets it to 0 when it sets the TLDR.
   */
  skew: number;
}

export interface SkillsSh {
  /**
   * The skill's page on skills.sh, or for one it doesn't list yet (`unlisted`), the page it will
   * have once someone installs the skill: https://skills.sh/<repo>/<name>.
   *
   * Source: scripts/crawl.ts, when it records the skill: `pageOf()` builds it from the `source`
   * and `skillId` of its leaderboard entry, `sitemapSkills()` takes it from skills.sh's sitemap,
   * `authorSkills()` from a whitelisted author's repo pages there, such as
   * https://www.skills.sh/mattpocock/skills, or `besideListed()` builds it from a SKILL.md beside
   * one of those skills in its GitHub repo: the repo and the `name` of its frontmatter.
   */
  url: string;
  /**
   * Set while skills.sh doesn't list the skill: its `url` is a page skills.sh doesn't have, and
   * its numbers are null. skills.sh lists a skill once someone installs it with the skills CLI, so
   * a whitelisted author's new skill starts unlisted. Left out once skills.sh lists it.
   *
   * Source: scripts/crawl.ts, daily while it sees the skill: when skills.sh answers the skill's
   * page with its "isn't available" page, which it keeps out of search engines (`noindex`).
   */
  unlisted?: true;
  /**
   * All-time installs, or null when unknown: exact for a skill in the skills.sh all-time top 600,
   * rounded to three digits (such as 26.5K) for a skill outside it. A skill of crawl.jsonc the
   * crawl no longer sees keeps its last number.
   *
   * Source: scraped from skills.sh's HTML, with no skills.sh API, by scripts/crawl.ts, which
   * .github/workflows/crawl.yml runs daily. For a skill in the top 600, `topSkills()` fetches the
   * HTML of https://www.skills.sh/ and parses the leaderboard JSON that the page's Next.js payload
   * embeds (its `self.__next_f.push(…)` scripts, the `initialSkills` object of the all-time
   * view). For a skill outside it, an approved one, one of the skills of
   * https://www.skills.sh/sitemap.xml it reads or one of a whitelisted author, `skillPage()` fetches the HTML of the skill's skills.sh page
   * and matches the "Installs" stat in its markup with a regex, such as "26.5K"; null when
   * skills.sh doesn't have the page, no longer or not yet (`unlisted`).
   */
  installs: number | null;
  /**
   * Installs per week for the 8 weeks up to the installs snapshot, oldest first, or null when
   * unknown.
   *
   * Source: scraped from skills.sh's HTML by scripts/crawl.ts, daily, together with `installs`. For
   * a skill in the top 600, `topSkills()` takes `weeklyInstalls` from the same leaderboard JSON in
   * the HTML of https://www.skills.sh/. For a skill outside it, `skillPage()` matches the
   * `aria-label="Weekly installs: …"` of the chart in the HTML of the skill's skills.sh page.
   */
  weeklyInstalls: number[] | null;
  /**
   * When skills.sh first saw the skill (YYYY-MM-DD), or null when unknown. It never changes.
   *
   * Source: scraped from skills.sh's HTML by scripts/crawl.ts. `skillPage()` fetches the HTML of
   * the skill's skills.sh page and matches its "First Seen" stat with a regex, such as "Jan 22,
   * 2026", or for a recent skill "10 days ago", counted back from the day of the crawl. The
   * leaderboard doesn't give it. It does so once: when the crawl records the skill in
   * crawl.jsonc, or for a skill that has none, such as one skills.sh didn't list then.
   */
  firstSeen: string | null;
}
