/**
 * The parameters that decide what lands in the data files: which skills the crawl records and
 * qualifies, and how long a TLDR may be.
 */

/** What a skill of the top 600 needs to qualify: all-time installs, and its GitHub repo's stars. */
export const MINIMUMS = { installs: 5000, stars: 100 };

/**
 * GitHub owners whose every skill SkillHub lists: the crawl records all their skills, on skills.sh
 * and in their GitHub repos, which skills.sh lists only once someone installs them, whatever their
 * installs, and they qualify whatever the minimums. An agent still reviews each one, with the
 * add-skill skill, which says the few reasons that disqualify them.
 */
export const WHITELISTED_AUTHORS = ["mattpocock", "brillout"];

/**
 * How far down skills.sh's sitemap the crawl reads: until this many skills in a row are under
 * MINIMUMS.installs. The sitemap lists skills roughly most installed first, but loosely, so a
 * skill that reaches the minimum can come after many that don't.
 */
export const UNDER_IN_A_ROW = 1000;

/** The most a TLDR may hold; there's no minimum. */
export const TLDR_LIMITS = { glanceItems: 8, labelWords: 4, glanceWords: 30, textWords: 200 };
