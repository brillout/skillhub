/**
 * The site's name and its links. The name is top left on every page: atop the skills list's
 * sidebar, where it stays in view with the sidebar, and in the header of the other pages, at the
 * same place. The links are top right, in the header.
 */

import { href } from "./format.ts";
import { GITHUB } from "./skills.ts";

const LINKS = [
  ["tags/", "Tags"],
  ["about/", "About"],
] as const;

/** The site's name, as a link home. */
export const brandHtml = () =>
  `<a class="brand" href="${href()}"><img src="${href("gem.svg")}" alt="" width="28" height="28" /><span>SkillHub</span></a>`;

/**
 * `current` is the path of the page it's on, such as "tags/", to mark its link; "" for the skills
 * list, whose header has no name, as its sidebar has it.
 */
export function siteHeadHtml(current: string): string {
  const links = LINKS.map(
    ([to, label]) =>
      `<a href="${href(to)}"${to === current ? ` aria-current="page"` : ""}>${label}</a>`,
  ).join("");
  // #account is Log in, or your avatar and Log out: account-client.ts fills it in.
  return `
    <div class="site-head">
      ${current ? brandHtml() : ""}
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account"><a href="${href("api/auth/login")}" data-login>Log in</a></span></nav>
    </div>`;
}
