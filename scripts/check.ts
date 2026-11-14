/**
 * check.ts — validate skills.jsonc against its own tag vocabulary, and crawl.jsonc against
 * skills.jsonc.
 *
 * Run: pnpm run check:data
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { approvedPages, pageKey, readCrawl, readData, readJsonc, tldrProblems } from "./data.ts";
import { generate, SCHEMAS, TYPES, undocumented } from "./schema.ts";
import { nameInSkillMd } from "../website/markdown.ts";
import { copyPath } from "../website/skill-md.ts";
import type { Facet, SkillsSh } from "../data/types.ts";
import { bundlePage, bundleRepo, github, repoPage, skillPage } from "../website/github.ts";

const root = new URL("../", import.meta.url);
const data = readData();
const errors: string[] = [];
const fail = (where: string, message: string) => errors.push(`${where}: ${message}`);

const facets = new Map<string, Facet>(data.facets.map((f) => [f.id, f]));
const topics = new Set(facets.get("topic")?.values?.map((v) => v.id));
const repos = new Set<string>();
for (const repo of data.repos) {
  if (repos.has(repo.id)) fail(repo.id, "duplicate repo");
  repos.add(repo.id);
  // Its GitHub description as copied from a page that cut it short, such as a search's results: a
  // repo's page showed "…business analytics for online…" as what the repo says of itself.
  if (/(…|\.\.\.)$/.test(repo.agentReview.description ?? ""))
    fail(
      `repo ${repo.id}`,
      "its description ends with an ellipsis: it was cut off where it was copied from, so write it in full",
    );
}

// Every review says which model wrote it, and with which effort when that was recorded.
const EFFORTS = ["low", "medium", "high", "xhigh", "max", null];
for (const [at, review] of [
  ...data.repos.map((r) => [`repo ${r.id}`, r.agentReview] as const),
  ...data.skills.map((s) => [s.id, s.agentReview] as const),
  ...data.bundles.map((b) => [`bundle ${b.id}`, b.agentReview] as const),
]) {
  if (typeof review.model !== "string" || !review.model) fail(at, "agentReview needs a model");
  if (!EFFORTS.includes(review.effort))
    fail(at, "agentReview's effort must be low, medium, high, xhigh, max or null");
}

/** The facets that take any value, and so list none: see `Facet` in data/types.ts. */
const OPEN = ["stack"];
for (const f of data.facets)
  if (Boolean(f.values) === OPEN.includes(f.id))
    fail(
      `facet ${f.id}`,
      f.values
        ? "takes any value, so it lists none: drop its values"
        : "needs the list of the values its tags can take",
    );

// A parent includes plain values of its own facet: parents don't nest, and skills don't carry them.
const parents = new Set<string>();
for (const f of data.facets)
  for (const v of f.values ?? []) {
    if (!v.includes) continue;
    parents.add(f.prefix === false ? v.id : `${f.id}:${v.id}`);
    for (const id of v.includes) {
      const child = f.values?.find((c) => c.id === id);
      if (!child) fail(`facet ${f.id}`, `${v.id} includes unknown value "${id}"`);
      else if (child.includes) fail(`facet ${f.id}`, `${v.id} includes ${id}, another parent`);
    }
  }
/** A skill's page on skills.sh: the repo it comes from on GitHub, then the skill. */
const SKILL_PAGE = /^https:\/\/skills\.sh\/[^/.]+\/[^/]+\/[^/]+$/;

/** What's wrong with the numbers of a skill's listing on skills.sh, if anything. */
function listingProblems(sh: SkillsSh): string[] {
  const problems: string[] = [];
  if (sh.weeklyInstalls && sh.weeklyInstalls.length !== 8)
    problems.push("weeklyInstalls must have 8 weeks");
  if (sh.unlisted !== undefined && sh.unlisted !== true)
    problems.push("unlisted is true or left out");
  else if (sh.unlisted && (sh.installs !== null || sh.weeklyInstalls !== null))
    problems.push("an unlisted skill has no installs on skills.sh: they must be null");
  return problems;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COUNTS: Record<Facet["count"], (n: number) => boolean> = {
  one: (n) => n === 1,
  "one or more": (n) => n >= 1,
  "at most one": (n) => n <= 1,
  "one to five": (n) => n >= 1 && n <= 5,
  any: () => true,
};

/**
 * The site's own pages that an owner's page, /owner/, or a page under it would land on, such as
 * /tags/: an owner by one of these names gets no pages. See ownerPage() of website/github.ts.
 */
const ROUTES = ["bundle", "api", "tags", "about", "queue"];

/** Whose each repo's and skill's page is: they're lowercase, so two that differ in case clash. */
const pages = new Map<string, string>();
function claim(at: string, page: string) {
  if (pages.has(page)) fail(at, `its page /${page}/ is ${pages.get(page)}'s too`);
  pages.set(page, at);
  const top = page.split("/")[0];
  if (ROUTES.includes(top)) fail(at, `its page /${page}/ is under the site's /${top}/`);
}
for (const repo of data.repos) claim(`repo ${repo.id}`, repoPage(repo.id));

const ids = new Set<string>();
for (const skill of data.skills) {
  const at = skill.id;
  if (ids.has(at)) fail(at, "duplicate skill id");
  ids.add(at);
  claim(at, skillPage(skill));
  if (!skill.agentReview.description) fail(at, "missing description");
  for (const t of skill.agentReview.tags)
    if (parents.has(t)) fail(at, `${t} comes with the tags it includes; don't tag it directly`);
  // SkillHub only lists skills that are on GitHub and on skills.sh, but for a whitelisted author's,
  // which skills.sh may not list yet: its skills.sh field is then `unlisted`, at the page it'll have.
  const gh = github(skill);
  if (gh.repo.split("/")[0].includes("."))
    fail(at, "not on GitHub: the id must be owner/repo/path/to/dir");
  if (!repos.has(gh.repo)) fail(at, `repo "${gh.repo}" has no entry in repos`);
  if (!skill["skills.sh"]) fail(at, "not on skills.sh");
  else {
    if (!SKILL_PAGE.test(skill["skills.sh"].url))
      fail(at, "the skills.sh url must be its page there, https://skills.sh/owner/repo/skill");
    for (const problem of listingProblems(skill["skills.sh"])) fail(at, problem);
  }

  const copy = existsSync(new URL(copyPath(skill), root));
  if (skill.skillMd && !copy) fail(at, `no copy at ${copyPath(skill)}; run pnpm run sync`);
  if (!skill.skillMd && copy) fail(at, `${copyPath(skill)} has no skillMd; run pnpm run sync`);
  const named = copy ? nameInSkillMd(readFileSync(new URL(copyPath(skill), root), "utf8")) : null;
  if (copy && named !== skill.name)
    fail(
      at,
      `its name must be the one its SKILL.md gives, ${named ?? "none"}; see ${copyPath(skill)}`,
    );
  const skew = skill.skillMd?.skew;
  if (skew !== undefined && !(Number.isInteger(skew) && skew >= 0))
    fail(at, "skew must be a whole number of words");
  if (skill.agentReview.tldr) {
    for (const problem of tldrProblems(skill.agentReview.tldr)) fail(at, problem);
    const target = `https://github.com/${escape(gh.repo)}/tree/[0-9a-f]{40}${gh.dir ? `/${escape(gh.dir)}` : ""}`;
    if (!new RegExp(`^${target}$`).test(skill.agentReview.tldr.permalink))
      fail(at, "the TLDR permalink must point to the skill at a commit; set it with pnpm run tldr");
  }

  const perFacet = new Map<string, string[]>();
  for (const tag of skill.agentReview.tags) {
    const i = tag.indexOf(":");
    const facetId = i === -1 ? "topic" : tag.slice(0, i);
    const value = i === -1 ? tag : tag.slice(i + 1);
    const facet = facets.get(facetId);
    if (!facet || (i === -1) !== (facet.prefix === false)) {
      fail(at, `unknown tag "${tag}"`);
      continue;
    }
    // A facet that lists its values has a closed vocabulary. One that lists none takes any value:
    // stack, whose tags are the technologies and services the skills are about.
    if (facet.values && !facet.values.some((v) => v.id === value)) fail(at, `unknown tag "${tag}"`);
    perFacet.set(facetId, [...(perFacet.get(facetId) ?? []), value]);
  }
  for (const facet of data.facets) {
    const values = perFacet.get(facet.id) ?? [];
    if (!COUNTS[facet.count](values.length))
      fail(at, `needs ${facet.count} ${facet.id} tag(s), has ${values.length}`);
    if (new Set(values).size !== values.length) fail(at, `repeated ${facet.id} tag`);
  }
  const needs = perFacet.get("needs") ?? [];
  if (needs.includes("none") && needs.length > 1)
    fail(at, "needs:none can't be combined with other needs");
  const type = perFacet.get("type")?.[0];
  if ((type === "guidelines" || type === "router") && perFacet.get("effect")?.[0] !== "none")
    fail(at, `type:${type} must be effect:none`);
  if (!skill.agentReview.tags.every((t) => t.includes(":") || topics.has(t)))
    fail(at, "unknown topic");
}

const bundled = new Map<string, string>();
const bundleIds = new Set<string>();
const bundlePages = new Map<string, string>();
for (const bundle of data.bundles) {
  const at = `bundle ${bundle.id}`;
  if (bundleIds.has(bundle.id)) fail(at, "duplicate bundle id");
  bundleIds.add(bundle.id);
  // Its page is its id in lowercase, as a skill's is: two ids that differ in case would share it.
  const page = bundlePage(bundle);
  if (bundlePages.has(page))
    fail(at, `its page /${page}/ is bundle ${bundlePages.get(page)}'s too`);
  bundlePages.set(page, bundle.id);
  const repo = bundleRepo(bundle);
  if (!repos.has(repo)) fail(at, `repo "${repo}" has no entry in repos`);
  if (!bundle.agentReview.name || !bundle.agentReview.description)
    fail(at, "needs a name and a description");
  if (bundle.agentReview.skills.length < 2) fail(at, "a bundle needs two skills or more");
  for (const { id, standalone, listedOutsideBundle, note } of bundle.agentReview.skills) {
    if (!ids.has(id)) fail(at, `no skill ${id}`);
    if (!id.startsWith(`${repo}/`)) fail(at, `${id} isn't in ${repo}`);
    if (bundled.has(id)) fail(at, `${id} is in ${bundled.get(id)} too`);
    bundled.set(id, bundle.id);
    if (!standalone && !note) fail(at, `${id} isn't standalone, so it needs a note saying why`);
    if (standalone && note) fail(at, `${id} is standalone, so it takes no note`);
    if (standalone && typeof listedOutsideBundle !== "boolean")
      fail(at, `${id} is standalone, so it needs listedOutsideBundle: true or false`);
    if (!standalone && listedOutsideBundle !== undefined)
      fail(
        at,
        `${id} isn't standalone, so it's only listed inside its bundle: drop listedOutsideBundle`,
      );
  }
  if (
    !bundle.agentReview.install.length ||
    bundle.agentReview.install.some((i) => !i.label || !i.command)
  )
    fail(at, "needs install commands, each with a label");
  if (!(Number.isInteger(bundle.skew) && bundle.skew >= 0))
    fail(at, "skew must be a whole number of words");
  if (bundle.agentReview.tldr) {
    for (const problem of tldrProblems(bundle.agentReview.tldr)) fail(at, problem);
    if (
      !new RegExp(`^https://github.com/${escape(repo)}/tree/[0-9a-f]{40}$`).test(
        bundle.agentReview.tldr.permalink,
      )
    )
      fail(at, "the TLDR permalink must point to the repo at a commit; set it with pnpm run tldr");
  }
}

// crawl.jsonc: every skill has one state, approved (skills.jsonc), qualified, unqualified or
// disqualified, under its skills.sh page. It's lenient: a disqualified skill can be a website's.
const crawl = readCrawl();
const states = new Map<string, string>([...approvedPages(data)].map((page) => [page, "approved"]));
const state = (at: string, url: string, name: string) => {
  const was = states.get(pageKey(url));
  if (was) fail(at, `it's ${was} too: a skill has one state`);
  states.set(pageKey(url), name);
};
for (const [name, list] of [
  ["qualified", crawl.qualified],
  ["unqualified", crawl.unqualified],
] as const)
  for (const c of list) {
    const url = c["skills.sh"]?.url ?? "";
    const at = `${name} ${url}`;
    if (!SKILL_PAGE.test(url))
      fail(at, "the url must be a skill's page on skills.sh, https://skills.sh/owner/repo/skill");
    state(at, url, name);
    if (!c.name || !c.repo || !c.seen) fail(at, "needs a name, a repo and the day it was seen");
    for (const problem of listingProblems(c["skills.sh"])) fail(at, problem);
  }
for (const { url, reason } of crawl.disqualified) {
  const at = `disqualified ${url}`;
  if (
    !/^https:\/\/skills\.sh\/(site\/)?[^/]+\/[^/]+$|^https:\/\/skills\.sh\/[^/.]+\/[^/]+\/[^/]+$/.test(
      url,
    )
  )
    fail(at, "the url must be a skill's page on skills.sh");
  state(at, url, "disqualified");
  const kinds = Object.keys(reason ?? {});
  if (kinds.length !== 1 || !["agentReview", "goneFromRepo", "notOnGitHub"].includes(kinds[0]))
    fail(at, "needs one reason: agentReview, goneFromRepo or notOnGitHub");
  else if (!Object.values(reason)[0]) fail(at, "its reason is empty");
  else if ("agentReview" in reason) {
    const r = reason.agentReview;
    if (typeof r !== "object" || !r.note) fail(at, "its agentReview needs a note saying why");
    else if (typeof r.model !== "string" || !r.model) fail(at, "its agentReview needs a model");
    else if (!EFFORTS.includes(r.effort))
      fail(at, "its agentReview's effort must be low, medium, high, xhigh, max or null");
  } else if ("goneFromRepo" in reason && !/^\d{4}-\d\d-\d\d$/.test(reason.goneFromRepo))
    fail(at, "goneFromRepo must be a YYYY-MM-DD date");
}

const copies = new Set(data.skills.map(copyPath));
for (const file of readdirSync(new URL("data/skill-snapshots", root), {
  recursive: true,
  encoding: "utf8",
}))
  if (file.endsWith(".md") && !copies.has(`data/skill-snapshots/${file}`))
    fail(`data/skill-snapshots/${file}`, "copy of a skill that isn't in skills.jsonc");

// The JSON Schemas, for editors: each data file points to its own, which matches its type, and
// describes every field.
for (const s of SCHEMAS) {
  const ref = `./${s.schema.split("/").pop()}`;
  if (readJsonc<{ $schema?: string }>(fileURLToPath(new URL(s.data, root))).$schema !== ref)
    fail(s.data, `$schema must be "${ref}"; run pnpm run schema`);
  const { schema, text } = generate(s);
  if (
    !existsSync(new URL(s.schema, root)) ||
    readFileSync(new URL(s.schema, root), "utf8") !== text
  )
    fail(s.schema, `out of date with the ${s.type} type; run pnpm run schema`);
  for (const field of undocumented(schema))
    fail(TYPES, `${field} needs a doc comment, its description in ${s.schema}`);
}

if (errors.length > 0) {
  console.error(
    `The data has ${errors.length} problem(s):\n${errors.map((e) => `  ${e}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `skills.jsonc is valid: ${data.skills.length} skills, ${data.bundles.length} bundles, ${data.repos.length} repos. crawl.jsonc is too: ${crawl.qualified.length} qualified, ${crawl.unqualified.length} unqualified, ${crawl.disqualified.length} disqualified.`,
);
