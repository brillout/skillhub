/** The site's header, on every page: its name, the tagline and its links. */

import { href } from "./format.ts";
import { GITHUB } from "./skills.ts";

const LINKS = [
  ["tags/", "Tags"],
  ["about/", "About"],
] as const;

/**
 * `current` is the path of the page it's on, such as "tags/", to mark its link; "" for the skills
 * list. `tagline` is review.ts's taglineHtml, which only the server can render.
 */
export function siteHeadHtml(current: string, tagline: string): string {
  const links = LINKS.map(
    ([to, label]) =>
      `<a href="${href(to)}"${to === current ? ` aria-current="page"` : ""}>${label}</a>`,
  ).join("");
  // #account is Log in, or Saved and Log out: account-client.ts fills it in.
  return `
    <div class="site-head">
      <a class="brand" href="${href()}">
        <img src="${href("gem.svg")}" alt="" width="28" height="28" />
        <span>SkillHub</span>
      </a>
      ${tagline}
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account"><a href="${href("api/auth/login")}" data-login>Log in</a></span></nav>
    </div>`;
}
