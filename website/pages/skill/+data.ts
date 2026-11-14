import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { renderSkillMd } from "../../markdown.ts";
import { fullSkillByPage } from "../../server-data.ts";
import { github } from "../../github.ts";

// The copy of every SKILL.md, read at build time. `exhaustive`: a skill's directory can be a hidden
// one, such as .claude/skills/<name>, which the glob skips otherwise. Forty skills' pages said "No
// copy of its SKILL.md yet.", under a TL;DR that says how far that copy has moved since.
const copies = import.meta.glob<string>("../../../data/skill-snapshots/**/*.md", {
  query: "?raw",
  import: "default",
  exhaustive: true,
});

export type Data = Awaited<ReturnType<typeof data>>;

export async function data(pageContext: PageContextServer) {
  const { owner, repo, name } = pageContext.routeParams;
  const skill = fullSkillByPage.get([owner, repo, name].map(decodeURIComponent).join("/"));
  if (!skill) throw render(404);
  const { id } = skill;
  const load = copies[`../../../data/skill-snapshots/${id}.md`];
  // A copy the sync recorded and the build can't find is the build's to fail on: shown as a skill
  // without a copy, it went unseen, as the tests read the copies from the disk.
  if (skill.skillMd && !load)
    throw new Error(`No copy of ${id}'s SKILL.md among the build's files.`);
  const gh = github(skill);
  const commit = skill.skillMd?.version;
  // Relative links and images point into the skill's directory, at the commit the copy is from.
  const rebase = commit
    ? (url: string, image: boolean) => {
        const root = image
          ? `https://raw.githubusercontent.com/${gh.repo}/${commit}/`
          : `https://github.com/${gh.repo}/blob/${commit}/`;
        if (url.startsWith("/")) return new URL(url.slice(1), root).href;
        return new URL(url, gh.dir ? `${root}${gh.dir}/` : root).href;
      }
    : null;
  return { skill, copy: load ? renderSkillMd(await load(), rebase) : null };
}
