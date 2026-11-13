import { compact, date, esc, href, number } from "../../format.ts";
import { queue } from "../../review.ts";

/** A number of the table, or a dash where skills.sh doesn't have it: an unlisted skill's. */
const num = (n: number | null) => (n === null ? "—" : compact(n));

/**
 * The queue: the skills waiting for an agent review, which lists them or turns them down, in
 * crawl.jsonc's order, most installed first. The About page's count of them links here.
 */
export default function Page(): string {
  const { skills, asOf } = queue;
  const lede =
    skills.length === 0
      ? "No skill is waiting for an agent review."
      : skills.length === 1
        ? "This skill has the minimum installs and stars, or is by an author SkillHub lists every skill of, and is next in line for an agent review, which lists it or turns it down."
        : `These ${number(skills.length)} skills have the minimum installs and stars, or are by an author SkillHub lists every skill of, and are next in line for an agent review, which lists them or turns them down.`;
  const rows = skills
    .map(({ name, repo, stars, "skills.sh": sh }) => {
      const weekly = sh.weeklyInstalls?.at(-1) ?? null;
      // An unlisted skill's skills.sh page doesn't exist yet: see SkillsSh in data/types.ts.
      const skill = sh.unlisted
        ? `${esc(name)} <span class="muted">· not on skills.sh yet</span>`
        : `<a href="${esc(sh.url)}">${esc(name)}</a>`;
      return `<tr><td><div class="queue-name">${skill}</div><a class="queue-repo" href="https://github.com/${esc(repo)}">${esc(repo).replace("/", "/<wbr>")}</a></td><td class="num">${num(sh.installs)}</td><td class="num">${num(weekly)}</td><td class="num">${num(stars)}</td></tr>`;
    })
    .join("");
  const table = `<div class="table-scroll"><table class="queue-table"><thead><tr><th scope="col">Skill</th><th scope="col">Total<span class="queue-long"> Downloads</span></th><th scope="col">Weekly<span class="queue-long"> Downloads</span></th><th scope="col">Stars</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `
    <div class="page queue">
      <p class="crumbs"><a href="${href("about/")}">About</a></p>
      <h1>Waiting for agent review</h1>
      <p class="lede">${lede}</p>
      ${skills.length ? table : ""}
      <p class="muted queue-note">As of ${date(asOf)}${skills.length > 1 ? ", most downloaded first" : ""}.</p>
    </div>`;
}
