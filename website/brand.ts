/** The site's header, on every page: its name and its links. */

import { href } from "./format.ts";
import { GITHUB } from "./skills.ts";

const LINKS = [
  ["tags/", "Tags"],
  ["about/", "About"],
] as const;

/** `current` is the path of the page it's on, such as "tags/", to mark its link; "" for the skills list. */
export function siteHeadHtml(current: string): string {
  const links = LINKS.map(
    ([to, label]) =>
      `<a href="${href(to)}"${to === current ? ` aria-current="page"` : ""}>${label}</a>`,
  ).join("");
  // #account is Log in, or your avatar and Log out: account-client.ts fills it in.
  return `
    <div class="site-head">
      <a class="brand" href="${href()}">
        <img src="${href("gem.svg")}" alt="" width="28" height="28" />
        <span>SkillHub</span>
      </a>
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account"><a href="${href("api/auth/login")}" data-login>Log in</a></span></nav>
    </div>`;
}
