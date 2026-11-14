/**
 * sync.ts — keep the copy of every skill's SKILL.md in data/skill-snapshots/ current.
 *
 * For each skill it fetches the SKILL.md from the HEAD of the skill's GitHub repo. When the text
 * differs from the copy, it rewrites the copy, records the commit in the skill's `skillMd` and
 * recomputes `skew`, how far the text has moved from the SKILL.md the skill's TLDR summarizes.
 * When a bundle's skill changes, it recomputes the bundle's skew too. A skill whose SKILL.md is
 * gone from its repo is disqualified: it moves to `disqualified` in data/crawl.jsonc, without its
 * agent data.
 *
 * Run: pnpm run sync [id prefix...]
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { readCrawl, readData, root, writeCrawl, writeData } from "./data.ts";
import { get, pool } from "./fetch.ts";
import { copyPath, rawUrl, skew } from "../website/skill-md.ts";
import type { Bundle, Skill, SkillMd } from "../data/types.ts";
import { github } from "../website/github.ts";

const today = new Date().toISOString().slice(0, 10);
const git = (args: string[]) =>
  promisify(execFile)("git", args, { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).then(
    ({ stdout }) => stdout.trim(),
  );

// ------------------------------------------------------------------- fetching

interface Found {
  version: string;
  text: string;
}

const skillMdIn = (dir: string) => (dir ? `${dir}/SKILL.md` : "SKILL.md");
const raw = (repo: string, commit: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Each repo's HEAD commit, looked up once per run. */
const heads = new Map<string, Promise<string>>();
function head(repo: string): Promise<string> {
  if (!heads.has(repo))
    heads.set(
      repo,
      git(["ls-remote", `https://github.com/${repo}`, "HEAD"]).then((out) => {
        const commit = out.split(/\s/)[0];
        if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${repo}: no HEAD commit`);
        return commit;
      }),
    );
  return heads.get(repo) as Promise<string>;
}

/** The SKILL.md at the HEAD of the skill's repo, or null when it's gone from there. */
async function fetchSkillMd(skill: Skill): Promise<Found | null> {
  const gh = github(skill);
  const version = await head(gh.repo);
  const text = await get(raw(gh.repo, version, skillMdIn(gh.dir)));
  return text === null ? null : { version, text };
}

// ------------------------------------------------------------------- syncing

const changed = new Set<string>();
const gone: Skill[] = [];
const errors: string[] = [];

/** How far `text` is from the SKILL.md the skill's TLDR summarizes. */
async function skewOf(skill: Skill, copy: string | null, text: string): Promise<number> {
  if (!skill.agentReview.tldr) return skew("", text);
  const url = rawUrl(skill.agentReview.tldr.permalink);
  const summarized = url ? await get(url).catch(() => null) : null;
  if (summarized !== null) return skew(summarized, text);
  // The summarized SKILL.md can't be fetched: add this change to the skew so far.
  errors.push(
    `${skill.id}: can't fetch the SKILL.md its TLDR summarizes, ${skill.agentReview.tldr.permalink}`,
  );
  return (skill.skillMd?.skew ?? 0) + skew(copy ?? "", text);
}

async function save(skill: Skill, copy: string | null, found: Found) {
  let { version, updated, skew: words } = skill.skillMd ?? ({} as SkillMd);
  if (copy !== found.text || !skill.skillMd) {
    const file = join(root, copyPath(skill));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, found.text);
    changed.add(skill.id);
    version = found.version;
    updated = today;
    words = await skewOf(skill, copy, found.text);
  }
  skill.skillMd = { version, updated, skew: words };
}

async function sync(skill: Skill) {
  const file = join(root, copyPath(skill));
  const copy = existsSync(file) ? readFileSync(file, "utf8") : null;
  const before = JSON.stringify(skill.skillMd);
  const found = await fetchSkillMd(skill);
  if (found) await save(skill, copy, found);
  else gone.push(skill);
  if (JSON.stringify(skill.skillMd) !== before) changed.add(skill.id);
}

/** How far a bundle's skills are from the SKILL.md files at the commit its TLDR summarizes. */
async function bundleSkew(bundle: Bundle, skills: Map<string, Skill>): Promise<number> {
  const commit =
    bundle.agentReview.tldr &&
    /\/tree\/([0-9a-f]{40})$/.exec(bundle.agentReview.tldr.permalink)?.[1];
  let words = 0;
  for (const { id } of bundle.agentReview.skills) {
    const skill = skills.get(id);
    if (!skill) continue;
    const gh = github(skill);
    const text = readFileSync(join(root, copyPath(skill)), "utf8");
    // A skill that's new since that commit counts all its words.
    const summarized = commit ? ((await get(raw(gh.repo, commit, skillMdIn(gh.dir)))) ?? "") : "";
    words += skew(summarized, text);
  }
  return words;
}

const data = readData();
const only = process.argv.slice(2);
const skills = data.skills.filter((s) => !only.length || only.some((p) => s.id.startsWith(p)));
await pool(skills, 8, (skill) =>
  sync(skill).catch((error: Error) => {
    errors.push(`${skill.id}: ${error.message}`);
  }),
);

/**
 * The skills gone from their repo that stay as they are all the same: those whose going would leave
 * their bundle fewer than two skills, which isn't a bundle. A repo that moves its skills, as
 * bmad-method did for its next version, would lose its bundle, and all an agent wrote about it and
 * its skills, to a change of address. So they wait for someone to move the bundle to where its
 * skills are now, or to remove it, and the run fails, which says so. Disqualified with the others,
 * they left a bundle of no skill, which the data's check refuses: nothing that synced was kept,
 * that day and every day after.
 */
function held(): Set<string> {
  const ids = new Set(gone.map((s) => s.id));
  const kept = new Set<string>();
  for (const bundle of data.bundles) {
    const its = bundle.agentReview.skills.map(({ id }) => id);
    const going = its.filter((id) => ids.has(id));
    if (!going.length || its.length - going.length >= 2) continue;
    for (const id of going) kept.add(id);
    errors.push(
      `bundle ${bundle.id}: ${going.length} of its ${its.length} skills are gone from the repo, which would leave it fewer than two: move it to where they are now, or remove it`,
    );
  }
  return kept;
}

// Disqualify the skills gone from their repo, and take them out of their bundles.
const waiting = held();
const disqualified = gone.filter((s) => !waiting.has(s.id));
if (disqualified.length) {
  const crawl = readCrawl();
  const ids = new Set(disqualified.map((s) => s.id));
  for (const skill of disqualified) {
    crawl.disqualified.push({
      url: skill["skills.sh"].url,
      reason: { goneFromRepo: today },
    });
    rmSync(join(root, copyPath(skill)), { force: true });
    changed.add(skill.id);
  }
  data.skills = data.skills.filter((s) => !ids.has(s.id));
  for (const bundle of data.bundles)
    bundle.agentReview.skills = bundle.agentReview.skills.filter(({ id }) => !ids.has(id));
  writeCrawl(crawl);
}

const byId = new Map(data.skills.map((s) => [s.id, s]));
for (const bundle of data.bundles)
  if (bundle.agentReview.skills.some(({ id }) => changed.has(id))) {
    const before = bundle.skew;
    bundle.skew = await bundleSkew(bundle, byId).catch((error: Error) => {
      errors.push(`bundle ${bundle.id}: ${error.message}`);
      return before;
    });
    if (bundle.skew !== before) changed.add(`bundle ${bundle.id}`);
  }

// Drop the copies of skills that left skills.jsonc.
if (!only.length) {
  const kept = new Set(data.skills.map(copyPath));
  const dir = join(root, "data/skill-snapshots");
  for (const file of existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }) : [])
    if (file.endsWith(".md") && !kept.has(`data/skill-snapshots/${file}`)) {
      rmSync(join(dir, file));
      changed.add(`removed copy ${file}`);
    }
}

writeData(data);

console.log(
  `Checked ${skills.length} skills: ${changed.size} changed, ${disqualified.length} gone from their repo and disqualified, ${errors.length} failed.`,
);
for (const id of changed) console.log(`  changed ${id}`);
for (const skill of disqualified) console.log(`  disqualified ${skill.id}: gone from its repo`);
for (const e of errors) console.error(`  failed ${e}`);
if (errors.length) process.exit(1);
