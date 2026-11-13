/**
 * check-live.ts — ask a deployed site whether it answers as it should: its pages, what search
 * engines ask it for, its API with the database behind it, and the way to GitHub that Log in
 * takes. The checks before a deploy can't tell: they run the Worker here, with a database and
 * secrets of their own, so a deploy can pass them all and still be broken, by a secret that's
 * missing or a database that isn't bound.
 *
 * Run: pnpm check:live [site] [--commit <sha>]
 *
 * `site` is https://skillhub.build unless given. With `--commit`, which the deploy workflow passes
 * (see .github/workflows/deploy.yml), it first waits for the site to be that commit's deploy, as
 * its /version.txt tells, and it compares the pages with the build in website/dist/client, which
 * must then be that commit's: the site serves what was built, byte for byte.
 *
 * It only reads: of a site set up as production is, it logs nobody in, and saves nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  bundlePage,
  bundleRepo,
  github,
  ownerPage,
  repoPage,
  skillPage,
} from "../website/github.ts";
import { LIVE } from "../data/edge-cases.ts";
import { readData, root } from "./data.ts";

const args = process.argv.slice(2);
const commit = args.includes("--commit") ? args[args.indexOf("--commit") + 1] : null;
const site = (args.find((arg) => /^https?:\/\//.test(arg)) ?? LIVE).replace(/\/+$/, "");
const built = `${root}website/dist/client`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request as a browser's first one: no cookie unless given, and a redirect isn't followed, to see where it leads. */
const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(site + path, { redirect: "manual", headers, signal: AbortSignal.timeout(30_000) });

/** The commit the site is the deploy of, which the deploy workflow writes into it: null when it has none. */
async function liveCommit(): Promise<string | null> {
  const res = await get("/version.txt");
  const text = res.ok ? (await res.text()).trim() : "";
  return /^[0-9a-f]{40}$/.test(text) ? text : null;
}

// ------------------------------------------------------------------- what to ask for

const data = readData();
const skill = data.skills.toSorted(
  (a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0),
)[0];
const bundle = data.bundles[0];
/** A page of each kind: the catalog has others every day, so these are today's. */
const PAGES = [
  ...new Set([
    "/",
    "/about/",
    "/tags/",
    `/${skillPage(skill)}/`,
    `/${repoPage(github(skill).repo)}/`,
    `/${ownerPage(github(skill).repo)}/`,
    `/${bundlePage(bundle)}/`,
    `/${repoPage(bundleRepo(bundle))}/`,
  ]),
];

/** The build's file for a path, when the site is to be compared with it. */
const file = (path: string) => (commit ? readFileSync(built + path) : null);
const same = (a: Uint8Array, b: Uint8Array) => Buffer.compare(a, b) === 0;

type Check = [what: string, run: () => Promise<string | null>];

/** A page answers, and with the build's own bytes when there's a build to compare with. */
const page = (path: string): Check => [
  `the page ${path}`,
  async () => {
    const res = await get(path);
    if (res.status !== 200) return `answers ${res.status}`;
    const body = new Uint8Array(await res.arrayBuffer());
    const expected = file(`${path}index.html`);
    if (expected) return same(body, expected) ? null : "isn't the page that was built";
    return new TextDecoder().decode(body).includes("</html>") ? null : "isn't a whole page";
  },
];

/**
 * What a search engine asks for first, robots.txt and the sitemap it names, answers as the file it
 * is, rather than as the Not found page, which is what the site answers for a file it lacks; and
 * with the build's own bytes when there's a build to compare with.
 */
const crawled = (path: string, type: RegExp, holds: string): Check => [
  `the file ${path}`,
  async () => {
    const res = await get(path);
    if (res.status !== 200) return `answers ${res.status}`;
    const served = res.headers.get("Content-Type") ?? "nothing";
    if (!type.test(served)) return `is served as ${served}`;
    const body = new Uint8Array(await res.arrayBuffer());
    const expected = file(path);
    if (expected) return same(body, expected) ? null : "isn't the file that was built";
    return new TextDecoder().decode(body).includes(holds) ? null : `doesn't hold ${holds}`;
  },
];

/** What the home page loads: its styles and scripts, which the site serves as files. */
async function assets(): Promise<Check[]> {
  const home = commit ? readFileSync(`${built}/index.html`, "utf8") : await (await get("/")).text();
  const paths = new Set(
    [...home.matchAll(/\s(?:href|src)="(\/[^"/][^"]*\.[a-z0-9]+)"/g)].map((m) => m[1]),
  );
  return [...paths].map((path): Check => [
    `the file ${path}`,
    async () => {
      const res = await get(path);
      if (res.status !== 200) return `answers ${res.status}`;
      const expected = file(path);
      if (!expected) return null;
      return same(new Uint8Array(await res.arrayBuffer()), expected)
        ? null
        : "isn't the file that was built";
    },
  ]);
}

/**
 * What /api/me answers nobody: no user, and nothing saved, nor anything else that's a user's, such
 * as their thumbs and when they gave them. Each such field is empty, however many /api/me has: a
 * field added to it, such as `reactions`, needn't be added here.
 */
function loggedOut(body: string): boolean {
  let me: unknown;
  try {
    me = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof me !== "object" || me === null || !("user" in me) || !("saved" in me)) return false;
  const { user, ...rest } = me as Record<string, unknown>;
  return (
    user === null &&
    Object.values(rest).every(
      (value) => typeof value === "object" && value !== null && Object.keys(value).length === 0,
    )
  );
}

const CHECKS: Check[] = [
  ...PAGES.map(page),
  crawled("/robots.txt", /^text\/plain\b/, `Sitemap: ${LIVE}/sitemap.xml`),
  crawled("/sitemap.xml", /^(application|text)\/xml\b/, `<loc>${LIVE}/</loc>`),
  [
    "a page without its trailing slash",
    async () => {
      const res = await get("/tags");
      const to = res.headers.get("Location") ?? "";
      return res.status >= 300 && res.status < 400 && new URL(to, site).pathname === "/tags/"
        ? null
        : `answers ${res.status}${to ? `, to ${to}` : ""}, rather than lead to /tags/`;
    },
  ],
  [
    "a page that doesn't exist",
    async () => {
      const res = await get("/no-such-page-the-live-check-asks-for/");
      if (res.status !== 404) return `answers ${res.status}, not 404`;
      const body = new Uint8Array(await res.arrayBuffer());
      const expected = file("/404.html");
      if (expected) return same(body, expected) ? null : "isn't the Not found page that was built";
      return new TextDecoder().decode(body).includes("</html>")
        ? null
        : "isn't the site's Not found page";
    },
  ],
  [
    "the API, /api/me",
    async () => {
      const res = await get("/api/me");
      if (res.status !== 200) return `answers ${res.status}`;
      if (res.headers.get("Cache-Control") !== "no-store") return "may be kept by a cache";
      const body = await res.text();
      return loggedOut(body) ? null : `answers ${body.slice(0, 200)}`;
    },
  ],
  [
    // A session it never started has the Worker look it up: that's the database's binding, and its tables.
    "the API's database, /api/me with a session",
    async () => {
      const res = await get("/api/me", { Cookie: "session=the-live-check-has-none" });
      if (res.status !== 200) return `answers ${res.status}: the Worker can't read its database`;
      const body = await res.text();
      return loggedOut(body) ? null : `answers ${body.slice(0, 200)}`;
    },
  ],
  [
    "an address of the API that isn't one",
    async () => {
      const res = await get("/api/no-such-address");
      const type = res.headers.get("Content-Type") ?? "";
      return res.status === 404 && type.startsWith("application/json")
        ? null
        : `answers ${res.status} as ${type || "nothing"}: /api/* doesn't reach the Worker`;
    },
  ],
  [
    "Log in, /api/auth/login",
    async () => {
      const res = await get("/api/auth/login?return=/about/");
      const cookies = res.headers.getSetCookie();
      if (res.status !== 302) return `answers ${res.status}, not a redirect`;
      const to = new URL(res.headers.get("Location") ?? "", site);
      if (to.origin === new URL(site).origin)
        return cookies.some((c) => c.startsWith("session="))
          ? "logs a test user in without GitHub: DEV_LOGIN is set, which is for local dev only"
          : `leads to ${to.pathname}, not to GitHub`;
      if (to.origin + to.pathname !== "https://github.com/login/oauth/authorize")
        return `leads to ${to.origin}${to.pathname}, not to GitHub's login`;
      const clientId = to.searchParams.get("client_id") ?? "";
      if (!clientId || clientId === "undefined")
        return "leads to GitHub without the OAuth App's id: the Worker lacks its GITHUB_CLIENT_ID secret";
      if (to.searchParams.get("redirect_uri") !== `${site}/api/auth/callback`)
        return `tells GitHub to come back to ${to.searchParams.get("redirect_uri")}`;
      if ((to.searchParams.get("state") ?? "").length < 32)
        return "leads to GitHub without a state";
      const pending = cookies.find((c) => c.startsWith("login="));
      if (!pending?.includes("HttpOnly"))
        return "doesn't keep its state in a cookie scripts can't read";
      if (site.startsWith("https:") && !pending.includes("Secure"))
        return "keeps its state in a cookie that isn't Secure";
      return null;
    },
  ],
];

// ------------------------------------------------------------------- ask

if (commit) {
  if (!existsSync(`${built}/index.html`)) {
    console.error(
      "--commit compares the site with its build: there's none in website/dist/client.",
    );
    process.exit(1);
  }
  // A deploy takes a few seconds to be what Cloudflare serves, everywhere.
  const until = Date.now() + 120_000;
  for (let served = await liveCommit().catch(() => null); served !== commit;) {
    if (Date.now() > until) {
      console.error(
        `${site} isn't the deploy of ${commit} after two minutes: it's ${served ? `the one of ${served}` : "one that doesn't tell its commit"}.`,
      );
      process.exit(1);
    }
    await sleep(3000);
    served = await liveCommit().catch(() => null);
  }
}

async function problems(): Promise<string[]> {
  const found: string[] = [];
  // Without the home page there's no telling what it loads: its own check says that it's missing.
  const files = await assets().catch(() => []);
  for (const [what, run] of [...CHECKS, ...files]) {
    // A request that fails is a problem as well.
    const problem = await run().catch((error: Error) => `can't be asked for: ${error.message}`);
    if (problem) found.push(`${what} ${problem}`);
  }
  return found;
}

let found = await problems();
if (found.length) {
  // Once more, a moment later: a deploy isn't served by all of Cloudflare at the same instant.
  await sleep(15_000);
  found = await problems();
}
if (found.length) {
  console.error(
    `${site} doesn't answer as it should, in ${found.length} way(s):\n${found.map((problem) => `  ${problem}`).join("\n")}`,
  );
  process.exit(1);
}
const live = commit ?? (await liveCommit().catch(() => null));
console.log(
  `${site} answers as it should${live ? `, as the deploy of ${live.slice(0, 7)}` : ""}: its pages${commit ? ", which are the build's" : ""}, its robots.txt and sitemap, its API and database, and Log in's way to GitHub.`,
);
