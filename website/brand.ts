/**
 * The site's name, its search and its links, in every page's header: the name top left, the
 * search and the links top right.
 */

import { href } from "./format.ts";
import { loginHtml } from "./saves.ts";
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
 * The search, by the links, where a search is looked for: on every page but the skills list, which
 * has its own. Someone who lands on a skill's page from a search engine, or on a page not found,
 * had no search in sight, only the name's link home to it. Its words open the list searched for
 * them, as the list's own search field would have it (`q`, see list.ts), a script or not. Its
 * field is a label, so that a click anywhere on it, its icon too, is in the field.
 */
const searchHtml = () =>
  `<form class="head-search" action="${href()}" role="search"><label class="head-field"><svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg><span class="sr-only">Search skills</span><input name="q" type="search" placeholder="Search skills" autocomplete="off" spellcheck="false" /></label></form>`;

/** `current` is the path of the page it's on, such as "tags/", to mark its link; "" for the skills list. */
export function siteHeadHtml(current: string): string {
  const links = LINKS.map(
    ([to, label]) =>
      `<a href="${href(to)}"${to === current ? ` aria-current="page"` : ""}>${label}</a>`,
  ).join("");
  // #account is Log in, or a link to what you saved, your avatar and Log out: account-client.ts
  // fills it in.
  return `
    <div class="site-head">
      ${brandHtml()}${current ? searchHtml() : ""}
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account">${loginHtml()}</span>${THEME_TOGGLE}</nav>
    </div>`;
}
