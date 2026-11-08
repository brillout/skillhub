import { dangerouslySkipEscape, escapeInject } from "vike/server";
import type { PageContextServer } from "vike/types";
import { siteHeadHtml } from "../brand.ts";
import { href } from "../format.ts";
import { themeScript } from "../theme.ts";
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
  return escapeInject`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${value(title)}</title>
    <meta name="description" content="${value(description)}" />
    <link rel="icon" type="image/svg+xml" href="${href("gem.svg")}" />
    <script>${dangerouslySkipEscape(themeScript)}</script>
  </head>
  <body>
    ${dangerouslySkipEscape(head)}
    <main id="app">${dangerouslySkipEscape(main)}</main>
  </body>
</html>`;
}
