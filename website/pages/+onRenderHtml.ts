import { dangerouslySkipEscape, escapeInject } from "vike/server";
import type { InjectFilterEntry, PageContextServer } from "vike/types";
import { siteHeadHtml } from "../brand.ts";
import { href } from "../format.ts";
import { themeScript } from "../theme.ts";
import { loggedInScript } from "../saves.ts";
// Geologica, with its sharpness axis: see the design notes atop style.css.
import "@fontsource-variable/geologica/shrp.css";
import "../style.css";

/** A page's `Page` returns the HTML of its `<main>`. */
export type Page = (pageContext: PageContextServer) => string;

export function onRenderHtml(pageContext: PageContextServer) {
  const { title, description } = pageContext.config;
  const value = (v: typeof title) => (typeof v === "function" ? v(pageContext) : (v ?? ""));
  // Every page gets the header.
  const path = pageContext.urlPathname.replace(/^\//, "");
  const head = `<header id="page-head">${siteHeadHtml(path && !path.endsWith("/") ? `${path}/` : path)}</header>`;
  const main = (pageContext.Page as Page)(pageContext);
  const documentHtml = escapeInject`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${value(title)}</title>
    <meta name="description" content="${value(description)}" />
    <meta property="og:site_name" content="SkillHub" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${cardTitle(value(title))}" />
    <meta property="og:description" content="${cardText(value(description))}" />
    <meta name="twitter:card" content="summary" />
    <link rel="icon" type="image/svg+xml" href="${href("gem.svg")}" />
    <script>${dangerouslySkipEscape(themeScript)}</script>
    <script>${dangerouslySkipEscape(loggedInScript)}</script>
  </head>
  <body>
    ${dangerouslySkipEscape(head)}
    <main id="app">${dangerouslySkipEscape(main)}</main>
  </body>
</html>`;
  return { documentHtml, injectFilter: preloadLatinOnly };
}

/*
 * A page's card, where its link is shared: its title, a description and the site's name, as Open
 * Graph tags, which chats and social sites read. Without them a link showed bare on some, such as
 * X, which wants the last tag too. In words only: there's no picture of a page yet.
 */

/** A page's title on its card: without the site's name after it, which the card has of its own. */
const cardTitle = (title: string) => title.replace(/ · SkillHub$/, "");
/**
 * A page's description on its card, where it's longer than the 300 characters a card has the room
 * for, as a bundle's, which runs to a thousand: its sentences that fit whole, where they fill half
 * of it, or else its start, up to a word's end. Cut at a word's end whatever came before, it
 * ended on a full stop and its dots, "skills.…", or on the label of a fact it had no room for,
 * "Entry point:…".
 */
function cardText(text: string): string {
  if (text.length <= 300) return text;
  const start = text.slice(0, 300);
  const whole = Math.max(...[". ", "? ", "! "].map((end) => start.lastIndexOf(end)));
  return whole >= 150
    ? start.slice(0, whole + 1)
    : `${start.replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "")}…`;
}

/**
 * Vike preloads every font file the stylesheets name: Geologica's six subsets, some 110 KB, of
 * which a page in English uses the Latin one, 29 KB. Only that one is preloaded: every visit
 * fetched the other five for nothing, ahead of the page's own script, and the browser said so in
 * its console. One of them still loads when a page has a letter of its own, such as a SKILL.md
 * that quotes Greek, as the stylesheet tells which letters each file has.
 */
function preloadLatinOnly(assets: InjectFilterEntry[]) {
  for (const asset of assets)
    if (asset.assetType === "font" && !/\/geologica-latin-shrp-[^/]*$/.test(asset.src))
      asset.inject = false;
}
