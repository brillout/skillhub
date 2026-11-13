/**
 * check-widths.ts — open every page of the built site, website/dist/client, at a phone's width and
 * at wider ones, and tell the pages that scroll sideways: a label, a word or a tooltip wider than
 * the screen takes the whole page with it, and what's beside it off the screen.
 *
 * It serves the built files itself, as Cloudflare does, to a browser of its own, so nothing else
 * has to run. The Worker isn't there: the pages show as they do to someone who isn't logged in.
 *
 * It isn't one of the checks before a deploy: it opens every page at every width, some 1,600 pages
 * a width, which takes about a minute each. The end-to-end walk opens the pages hardest to fit
 * instead: see e2e/phone.spec.ts. Run this one after a change to the layout, or to what a page can
 * hold, such as a longer label.
 *
 * Run: pnpm run build && pnpm run check:widths [width…]       such as: pnpm run check:widths 390
 * With SKILLHUB_DATA=edge-cases on both, it checks the edge cases' site: see data/edge-cases.ts.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";
import { EDGE_CASES, siteOf } from "../data/edge-cases.ts";
import { launchOptions } from "../playwright.config.ts";
import { root } from "./data.ts";

/**
 * The narrowest screen of each form the layout takes, where a page has the least room: a small
 * phone's 360px, then the widths from which a row's repo is beside its name, the header is on one
 * line, the tags are beside the list, a row's numbers are beside its words, and its repo beside
 * its name there too. See the media queries of website/style.css.
 */
const WIDTHS = [360, 481, 601, 901, 1151, 1231];
/** How many pages are open at once. */
const TABS = 6;

const site = join(root, siteOf().dist, "client");
if (!existsSync(join(site, "index.html"))) {
  console.error("There's no built site to check: run pnpm run build first.");
  process.exit(1);
}
const given = process.argv.slice(2).map(Number);
if (given.some((width) => !Number.isInteger(width) || width < 200)) {
  console.error("Usage: pnpm run check:widths [width…], each in pixels, such as 390 1024");
  process.exit(1);
}
const widths = given.length ? given : WIDTHS;

/** Every page, by its address: tags/index.html is /tags/. Not 404.html, which has none of its own. */
const pages = readdirSync(site, { recursive: true, encoding: "utf8" })
  .map((file) => file.split("\\").join("/"))
  .filter((file) => file === "index.html" || file.endsWith("/index.html"))
  .map((file) => `/${file.slice(0, -"index.html".length)}`);

// ------------------------------------------------------------------- the built site, served

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const isFile = (path: string) => existsSync(path) && statSync(path).isFile();
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  // A directory's page is its index.html, as Cloudflare serves it: see wrangler.jsonc.
  const file = join(site, path.endsWith("/") ? `${path}index.html` : path);
  if (!file.startsWith(site) || !isFile(file)) {
    response.writeHead(404, { "Content-Type": TYPES[".html"] }).end("Not found");
    return;
  }
  response
    .writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      // The pages share their stylesheet, font and scripts, whose names change with their content:
      // fetched once, rather than by each of the pages.
      "Cache-Control": path.startsWith("/assets/") ? "max-age=31536000, immutable" : "no-cache",
    })
    .end(readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ------------------------------------------------------------------- every page, at every width

const browser = await chromium.launch(launchOptions);
/** The pages that scroll sideways at a width, each with how wide it got, widest first. */
async function tooWide(width: number): Promise<[page: string, scrollWidth: number][]> {
  const phone = width < 600;
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width, height: 900 },
    isMobile: phone,
    hasTouch: phone,
  });
  // The Worker isn't here to say who's logged in: nobody is.
  await context.route("**/api/**", (route) => route.abort());
  const left = [...pages];
  const found: [string, number][] = [];
  const tab = async () => {
    const page = await context.newPage();
    for (let url = left.pop(); url !== undefined; url = left.pop()) {
      await page.goto(url, { waitUntil: "load" });
      // The page's own font, whose letters aren't as wide as the one that stands in for it.
      const scrollWidth = await page.evaluate(async () => {
        await document.fonts.ready;
        return document.documentElement.scrollWidth;
      });
      if (scrollWidth > width) found.push([url, scrollWidth]);
    }
  };
  await Promise.all(Array.from({ length: TABS }, tab));
  await context.close();
  return found.sort((a, b) => b[1] - a[1]);
}

/** As many pages as a report names, at a width: the rest are counted. */
const NAMED = 20;
const of = `${EDGE_CASES ? "the edge cases' " : ""}${pages.length.toLocaleString("en")} pages`;
let failed = false;
for (const width of widths) {
  const found = await tooWide(width);
  if (!found.length) {
    console.log(`At ${width}px, none of ${of} scrolls sideways.`);
    continue;
  }
  failed = true;
  const lines = found.slice(0, NAMED).map(([page, scrollWidth]) => `  ${page}  ${scrollWidth}px`);
  if (found.length > NAMED) lines.push(`  and ${found.length - NAMED} more`);
  console.error(
    `At ${width}px, ${found.length} of ${of} scroll${found.length === 1 ? "s" : ""} sideways:\n${lines.join("\n")}`,
  );
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
