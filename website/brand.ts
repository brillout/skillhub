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

/**
 * Dark mode, on or off: a moon in light mode, a sun in dark. theme.ts handles its clicks and keeps
 * its aria-pressed.
 */
const THEME_TOGGLE = `<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Dark mode" title="Dark mode"><svg class="moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M17.5 10.66A7.5 7.5 0 1 1 9.34 2.5a5.83 5.83 0 0 0 8.16 8.16z" /></svg><svg class="sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.75" /><path d="M10 1.25v1.5M10 17.25v1.5M3.8 3.8l1.06 1.06M15.14 15.14l1.06 1.06M1.25 10h1.5M17.25 10h1.5M3.8 16.2l1.06-1.06M15.14 4.86l1.06-1.06" /></svg></button>`;

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
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account"><a href="${href("api/auth/login")}" data-login>Log in</a></span>${THEME_TOGGLE}</nav>
    </div>`;
}
