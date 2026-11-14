/**
 * The Worker's tests: worker/index.ts in Cloudflare's own runtime, with a database of its own, and
 * with GitHub played by the tests. They're the only place where logging in with GitHub runs before
 * production: locally the site logs a test user in instead (DEV_LOGIN), and so does the end-to-end
 * walk, e2e/.
 *
 * The runtime is Miniflare's, the one `wrangler dev` runs the Worker in, so the tests need neither
 * a build nor a server. They take the Worker's source as it is: Node strips its types, which is all
 * a Worker in one file needs to run.
 *
 * Run: pnpm test:worker
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { Miniflare, Response, type Request, type WorkerdStructuredLog } from "miniflare";
import { readJsonc, root } from "../scripts/data.ts";

const SITE = "https://skillhub.build";
const WORKER = `${root}worker/`;
const MIGRATIONS = `${WORKER}migrations/`;
const config = readJsonc<{
  compatibility_date: string;
  compatibility_flags?: string[];
  vars?: Record<string, unknown>;
}>(`${root}wrangler.jsonc`);
const version = (dependency: string) =>
  JSON.parse(readFileSync(`${root}node_modules/${dependency}/package.json`, "utf8"));

// ------------------------------------------------------------------- GitHub, played by the tests

/** SkillHub's OAuth App on GitHub, as the tests' Worker knows it. */
const APP = { id: "the-tests-client-id", secret: "the-tests-client-secret" };

/** A GitHub account, as https://api.github.com/user describes it: these fields, among forty others. */
interface Account {
  id: number;
  login: string;
  avatar_url: string;
}
const OCTOCAT: Account = {
  id: 583231,
  login: "octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
};
const HUBOT: Account = {
  id: 480938,
  login: "hubot",
  avatar_url: "https://avatars.githubusercontent.com/u/480938?v=4",
};

interface Asked {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * GitHub's side of logging in, by its rules: a Worker that gets the protocol wrong, such as by
 * leaving out the header GitHub answers in JSON for, fails here as it would there.
 */
const github = {
  /** Every request the Worker made, in order. */
  asked: [] as Asked[],
  /** The codes GitHub gave browsers to bring back, each for the Worker to exchange once. */
  codes: new Map<string, { account: Account; redirectUri: string }>(),
  /** The access tokens it gave the Worker for them. */
  tokens: new Map<string, Account>(),
  /** A test's own answer to a request, such as an outage: GitHub's usual one when it returns nothing. */
  instead: null as ((asked: Asked) => Response | undefined) | null,

  reset() {
    this.asked.length = 0;
    this.codes.clear();
    this.tokens.clear();
    this.instead = null;
  },

  /**
   * The person approves on the page the Worker sent their browser to, and GitHub sends it back:
   * returns where to.
   */
  approve(authorize: string | null, account = OCTOCAT): string {
    const page = new URL(authorize ?? "");
    assert.equal(page.origin + page.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(page.searchParams.get("client_id"), APP.id);
    const redirectUri = page.searchParams.get("redirect_uri") ?? "";
    const code = `code-${this.codes.size + this.tokens.size + 1}`;
    this.codes.set(code, { account, redirectUri });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", page.searchParams.get("state") ?? "");
    return back.pathname + back.search;
  },

  /** The person declines there instead. */
  decline(authorize: string | null): string {
    const page = new URL(authorize ?? "");
    const back = new URL(page.searchParams.get("redirect_uri") ?? "");
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "The user has denied your application access.");
    back.searchParams.set("state", page.searchParams.get("state") ?? "");
    return back.pathname + back.search;
  },

  /** Answers the Worker's own requests: whatever it fetches goes here, not to the network. */
  async answer(request: Request): Promise<Response> {
    const asked: Asked = {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: await request.text(),
    };
    github.asked.push(asked);
    const instead = github.instead?.(asked);
    if (instead) return instead;
    if (`${asked.method} ${asked.url}` === "POST https://github.com/login/oauth/access_token")
      return github.exchange(asked);
    if (`${asked.method} ${asked.url}` === "GET https://api.github.com/user")
      return github.user(asked);
    return new Response("Not Found", { status: 404 });
  },

  /** A code for an access token. GitHub answers 200 even to refuse, and in JSON only when asked to. */
  exchange(asked: Asked): Response {
    const sent = asked.headers["content-type"]?.startsWith("application/json")
      ? (JSON.parse(asked.body) as Record<string, string>)
      : Object.fromEntries(new URLSearchParams(asked.body));
    const reply = (fields: Record<string, string>) =>
      asked.headers.accept === "application/json"
        ? Response.json(fields)
        : new Response(new URLSearchParams(fields).toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
    if (sent.client_id !== APP.id || sent.client_secret !== APP.secret)
      return reply({ error: "incorrect_client_credentials" });
    const code = this.codes.get(sent.code);
    if (!code) return reply({ error: "bad_verification_code" });
    if (sent.redirect_uri && sent.redirect_uri !== code.redirectUri)
      return reply({ error: "redirect_uri_mismatch" });
    this.codes.delete(sent.code);
    const token = `gho_${this.tokens.size + 1}_of_the_tests`;
    this.tokens.set(token, code.account);
    return reply({ access_token: token, token_type: "bearer", scope: "" });
  },

  /** Whose token it is. GitHub's API turns away a request that doesn't say who's asking. */
  user(asked: Asked): Response {
    if (!asked.headers["user-agent"])
      return new Response("Request forbidden by administrative rules.", { status: 403 });
    const account = this.tokens.get(asked.headers.authorization?.replace(/^(Bearer|token) /, ""));
    if (!account)
      return Response.json({ message: "Bad credentials", status: "401" }, { status: 401 });
    return Response.json({ ...account, type: "User", name: "The Tests", email: null });
  },
};

// ------------------------------------------------------------------- the Worker, and a browser

/** What the Worker logged as an error: a test that doesn't expect one fails on it. */
const logged: string[] = [];
const PAGE = "A page of the site";
const text = (value: string) => ({ type: "text" as const, value });

/** A migration's statements, one at a time, as D1 takes them; without its comments, which may hold a `;`. */
const statements = (sql: string) =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

/** Starts the Worker with an empty database. `vars`: what `wrangler dev --var` adds, such as DEV_LOGIN. */
async function start(vars: Record<string, string> = {}) {
  const source = readFileSync(`${WORKER}index.ts`, "utf8");
  const mf = new Miniflare({
    logRequests: false,
    handleStructuredLogs: ({ level, message }: WorkerdStructuredLog) => {
      if (level === "error") logged.push(message);
    },
    workers: [
      {
        config: {
          name: "skillhub",
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          manifest: {
            mainModule: "index.ts",
            modulesRoot: WORKER,
            modules: { "index.ts": { type: "esm", contents: stripTypeScriptTypes(source) } },
          },
          // As wrangler.jsonc binds them, and CI's secrets: see .github/workflows/deploy.yml.
          env: {
            DB: { type: "d1", id: "skillhub" },
            ASSETS: { type: "fetcher", handler: () => new Response(PAGE) },
            GITHUB_CLIENT_ID: text(APP.id),
            GITHUB_CLIENT_SECRET: text(APP.secret),
            ...Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, text(value)])),
          },
        },
        dev: { outboundService: { type: "fetcher", handler: github.answer } },
      },
    ],
  });
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(MIGRATIONS).sort())
    await db.batch(statements(readFileSync(MIGRATIONS + file, "utf8")).map((s) => db.prepare(s)));
  return { mf, db };
}
type Started = Awaited<ReturnType<typeof start>>;

/**
 * A browser, as far as the Worker can tell: it keeps the cookies it's given, sends each back where
 * its path says, and doesn't follow a redirect, so that a test sees where it leads.
 */
class Browser {
  #cookies = new Map<string, { value: string; path: string }>();
  #mf: Miniflare;
  #origin: string;
  constructor({ mf }: Started, origin = SITE) {
    this.#mf = mf;
    this.#origin = origin;
  }

  async fetch(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ) {
    const url = new URL(path, this.#origin);
    const cookies = [...this.#cookies]
      .filter(([, cookie]) => url.pathname.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`);
    const headers = { ...(cookies.length ? { Cookie: cookies.join("; ") } : {}), ...init.headers };
    const res = await this.#mf.dispatchFetch(url, { redirect: "manual", ...init, headers });
    for (const [name, cookie] of Object.entries(setCookies(res)))
      if (cookie.attributes.includes("Max-Age=0")) this.#cookies.delete(name);
      else this.#cookies.set(name, { value: cookie.value, path: cookie.path });
    return res;
  }

  get = (path: string) => this.fetch(path);

  /** A request as the site's own pages make it. */
  post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    this.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers },
      body: JSON.stringify(body),
    });

  /** A cookie's value, as the browser holds it. */
  cookie = (name: string) => this.#cookies.get(name)?.value;
  /** Gives the browser a cookie, such as another browser's, or one the Worker never set. */
  setCookie = (name: string, value: string, path = "/") => this.#cookies.set(name, { value, path });

  /** What /api/me says: who's logged in, what they saved and their thumbs; when, `times` says. */
  me = async (): Promise<Me> => {
    const { savedAt, reactedAt, ...me } = (await (await this.get("/api/me")).json()) as Me & Times;
    return me;
  };
  /** When each was saved and given its thumb, by key, as /api/me says. */
  times = async (): Promise<Times> => {
    const { savedAt, reactedAt } = (await (await this.get("/api/me")).json()) as Times;
    return { savedAt, reactedAt };
  };
  save = (key: string, saved = true) => this.post("/api/saves", { key, saved });
  react = (key: string, reaction: "up" | "down" | null = "up") =>
    this.post("/api/reactions", { key, reaction });
}
interface Me {
  user: { login: string; avatar: string } | null;
  saved: string[];
  reactions: Record<string, string>;
}
interface Times {
  savedAt: Record<string, number>;
  reactedAt: Record<string, number>;
}
/** What /api/me says to a browser nobody's logged in in, but `times`. */
const NOBODY: Me = { user: null, saved: [], reactions: {} };

/** The cookies a response sets, by name. */
function setCookies(res: { headers: { getSetCookie(): string[] } }) {
  const cookies: Record<string, { value: string; path: string; attributes: string[] }> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split("; ");
    const path = attributes.find((a) => a.startsWith("Path="))?.slice(5) ?? "/";
    cookies[pair.slice(0, pair.indexOf("="))] = {
      value: pair.slice(pair.indexOf("=") + 1),
      path,
      attributes,
    };
  }
  return cookies;
}

/**
 * Logs in with GitHub, from the Log in button to the page the person was on. Returns the last
 * response, the callback's.
 */
async function logIn(
  browser: Browser,
  {
    as = OCTOCAT,
    from = "/",
    ...then
  }: { as?: Account; from?: string; save?: string; react?: string; reaction?: string } = {},
) {
  const query = new URLSearchParams({ return: from, ...then });
  const toGitHub = await browser.get(`/api/auth/login?${query}`);
  return browser.get(github.approve(toGitHub.headers.get("Location"), as));
}

/** Waits for what the Worker logs, which arrives after its response. */
async function until(condition: () => boolean) {
  for (let waited = 0; !condition() && waited < 2000; waited += 10)
    await new Promise((resolve) => setTimeout(resolve, 10));
}

const SKILL = "skill:vercel-labs/skills/skills/find-skills";
const BUNDLE = "bundle:obra/superpowers@core";

// ------------------------------------------------------------------- the tests

let worker: Started;
let db: Started["db"];
const rows = async (sql: string, ...values: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...values)
      .all<Record<string, unknown>>()
  ).results;
const count = async (table: string) => (await rows(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;

before(async () => {
  worker = await start();
  db = worker.db;
});
after(() => worker.mf.dispose());
beforeEach(async () => {
  github.reset();
  for (const table of ["saves", "reactions", "sessions", "users"])
    await db.exec(`DELETE FROM ${table}`);
});
afterEach(() => assert.deepEqual(logged.splice(0), [], "the Worker logged an error"));

describe("who's logged in", () => {
  test("nobody, in a browser that never logged in", async () => {
    const res = await new Browser(worker).get("/api/me");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ...NOBODY, savedAt: {}, reactedAt: {} });
    // Who's logged in changes: no cache may keep an answer.
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  });

  test("nobody, with a session the Worker never started", async () => {
    const browser = new Browser(worker);
    browser.setCookie("session", "made-up");
    assert.deepEqual(await browser.me(), NOBODY);
  });

  test("nobody, once the session is past its year", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    assert.equal((await browser.me()).user?.login, "octocat");
    await db
      .prepare("UPDATE sessions SET expires_at = ?")
      .bind(Date.now() - 1)
      .run();
    assert.deepEqual(await browser.me(), NOBODY);
  });

  test("still the person, beside a cookie that isn't the Worker's and doesn't decode", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    browser.setCookie("theme", "100%");
    assert.equal((await browser.me()).user?.login, "octocat");
  });
});

describe("logging in with GitHub", () => {
  test("Log in sends the browser to GitHub, and remembers the page it came from", async () => {
    const res = await new Browser(worker).get("/api/auth/login?return=/about/");
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("Location") ?? "");
    assert.equal(to.origin + to.pathname, "https://github.com/login/oauth/authorize");
    // The callback GitHub knows for the OAuth App: it refuses any other.
    assert.deepEqual(Object.fromEntries(to.searchParams), {
      client_id: APP.id,
      redirect_uri: "https://skillhub.build/api/auth/callback",
      state: to.searchParams.get("state"),
    });
    const { login } = setCookies(res);
    assert.deepEqual(JSON.parse(decodeURIComponent(login.value)), {
      state: to.searchParams.get("state"),
      back: "/about/",
      save: null,
      react: null,
      reaction: null,
    });
    // Only the callback gets it, no script can read it, and it doesn't outlive the login.
    assert.deepEqual(login.attributes, [
      "Path=/api/auth",
      "Max-Age=600",
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
    ]);
    assert.equal(github.asked.length, 0);
  });

  test("each login has a state of its own, which nobody could guess", async () => {
    const browser = new Browser(worker);
    const states = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await browser.get("/api/auth/login");
      states.add(new URL(res.headers.get("Location") ?? "").searchParams.get("state") ?? "");
    }
    assert.equal(states.size, 5);
    // 32 random bytes, in base64url.
    for (const state of states) assert.match(state, /^[\w-]{43}$/);
  });

  test("back from GitHub, the person is logged in, on the page they were on", async () => {
    const browser = new Browser(worker);
    const res = await logIn(browser, { from: "/?q=design&sort=stars#results" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/?q=design&sort=stars#results");
    assert.equal(res.headers.get("Cache-Control"), "no-store");

    const { session, login } = setCookies(res);
    assert.match(session.value, /^[\w-]{43}$/);
    assert.deepEqual(session.attributes, [
      "Path=/",
      "Max-Age=31536000",
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
    ]);
    // The login's own cookie is done.
    assert.deepEqual(
      [login.value, login.attributes.slice(0, 2)],
      ["", ["Path=/api/auth", "Max-Age=0"]],
    );

    assert.deepEqual(await browser.me(), {
      user: { login: "octocat", avatar: OCTOCAT.avatar_url },
      saved: [],
      reactions: {},
    });
  });

  test("the Worker asks GitHub what GitHub expects, and nothing else", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    assert.deepEqual(
      github.asked.map((asked) => `${asked.method} ${asked.url}`),
      ["POST https://github.com/login/oauth/access_token", "GET https://api.github.com/user"],
    );
    const [exchange, user] = github.asked;
    assert.deepEqual(JSON.parse(exchange.body), {
      client_id: APP.id,
      client_secret: APP.secret,
      code: "code-1",
      redirect_uri: "https://skillhub.build/api/auth/callback",
    });
    assert.equal(exchange.headers.accept, "application/json");
    assert.equal(user.headers.authorization, "Bearer gho_1_of_the_tests");
    assert.ok(user.headers["user-agent"]);
  });

  test("of the account, only its id, login and avatar are kept; and of the session, only a hash", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    const users = await rows("SELECT id, login, avatar_url FROM users");
    assert.deepEqual(users, [OCTOCAT]);
    const sessions = await rows("SELECT * FROM sessions");
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].user_id, OCTOCAT.id);
    assert.match(String(sessions[0].token_hash), /^[0-9a-f]{64}$/);
    // Neither the session's token nor GitHub's is anywhere in the database.
    const kept = JSON.stringify([await rows("SELECT * FROM users"), sessions]);
    assert.ok(!kept.includes(browser.cookie("session") ?? "none"));
    assert.ok(!kept.includes("gho_"));
    // A year from now, give or take the test's own time.
    const left = Number(sessions[0].expires_at) - Date.now();
    assert.ok(left > 364.9 * 86_400_000 && left <= 365 * 86_400_000);
  });

  test("the Save button that asked to log in gets its save", async () => {
    const browser = new Browser(worker);
    const res = await logIn(browser, { from: "/obra/superpowers/", save: BUNDLE });
    assert.equal(res.headers.get("Location"), "/obra/superpowers/");
    assert.deepEqual((await browser.me()).saved, [BUNDLE]);
  });

  test("the thumb that asked to log in is given", async () => {
    const browser = new Browser(worker);
    const res = await logIn(browser, { from: "/?q=pdf", react: SKILL, reaction: "down" });
    assert.equal(res.headers.get("Location"), "/?q=pdf");
    assert.deepEqual((await browser.me()).reactions, { [SKILL]: "down" });
  });

  test("a thumb that isn't one, or for no skill's or bundle's key, is left out, and the login goes on", async () => {
    for (const then of [
      { react: SKILL, reaction: "sideways" },
      { react: SKILL },
      { react: "skill:<script>", reaction: "up" },
      { reaction: "up" },
    ]) {
      const browser = new Browser(worker);
      await logIn(browser, then);
      assert.equal((await browser.me()).user?.login, "octocat", JSON.stringify(then));
    }
    assert.equal(await count("reactions"), 0);
  });

  test("a save that's no skill's or bundle's key is left out, and the login goes on", async () => {
    const browser = new Browser(worker);
    await logIn(browser, { save: "skill:<script>" });
    assert.deepEqual(await browser.me(), {
      user: { login: "octocat", avatar: OCTOCAT.avatar_url },
      saved: [],
      reactions: {},
    });
  });

  test("someone who comes back is the same person, under the name GitHub has for them now", async () => {
    const laptop = new Browser(worker);
    await logIn(laptop);
    await laptop.save(SKILL);

    const phone = new Browser(worker);
    await logIn(phone, {
      as: { ...OCTOCAT, login: "octocat-renamed", avatar_url: "https://a.test/new" },
    });
    const renamed = {
      user: { login: "octocat-renamed", avatar: "https://a.test/new" },
      saved: [SKILL],
      reactions: {},
    };
    assert.deepEqual(await phone.me(), renamed);
    // The first browser stays logged in, as the same person.
    assert.deepEqual(await laptop.me(), renamed);
    assert.equal(await count("users"), 1);
    assert.equal(await count("sessions"), 2);
  });

  test("two people each have their own saves", async () => {
    const octocat = new Browser(worker);
    const hubot = new Browser(worker);
    await logIn(octocat);
    await logIn(hubot, { as: HUBOT });
    await octocat.save(SKILL);
    await hubot.save(BUNDLE);
    assert.deepEqual((await octocat.me()).saved, [SKILL]);
    assert.deepEqual(await hubot.me(), {
      user: { login: "hubot", avatar: HUBOT.avatar_url },
      saved: [BUNDLE],
      reactions: {},
    });
  });

  test("a login clears out the sessions that ran out, whoever's they were", async () => {
    await logIn(new Browser(worker));
    await db
      .prepare("UPDATE sessions SET expires_at = ?")
      .bind(Date.now() - 1)
      .run();
    await logIn(new Browser(worker), { as: HUBOT });
    assert.deepEqual(await rows("SELECT user_id FROM sessions"), [{ user_id: HUBOT.id }]);
  });

  test("over plain HTTP, as locally, the cookies do without Secure", async () => {
    const browser = new Browser(worker, "http://localhost:3000");
    const toGitHub = await browser.get("/api/auth/login");
    assert.equal(
      new URL(toGitHub.headers.get("Location") ?? "").searchParams.get("redirect_uri"),
      "http://localhost:3000/api/auth/callback",
    );
    assert.ok(!setCookies(toGitHub).login.attributes.includes("Secure"));
    const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
    assert.ok(!setCookies(res).session.attributes.includes("Secure"));
    assert.equal((await browser.me()).user?.login, "octocat");
  });
});

describe("a login that doesn't go through leaves the person logged out, on their page", () => {
  /** Back on `page`, with the login's cookie gone, no session, and nothing recorded. */
  async function loggedOut(
    browser: Browser,
    res: Awaited<ReturnType<Browser["get"]>>,
    page: string,
  ) {
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), page);
    const cookies = setCookies(res);
    assert.deepEqual(Object.keys(cookies), ["login"]);
    assert.ok(cookies.login.attributes.includes("Max-Age=0"));
    assert.deepEqual(await browser.me(), NOBODY);
    assert.equal(await count("users"), 0);
    assert.equal(await count("sessions"), 0);
  }
  const start = async (browser: Browser, query = "return=/tags/&save=skill:a/b") =>
    (await browser.get(`/api/auth/login?${query}`)).headers.get("Location");

  test("declined on GitHub", async () => {
    const browser = new Browser(worker);
    const res = await browser.get(github.decline(await start(browser)));
    await loggedOut(browser, res, "/tags/");
    assert.equal(github.asked.length, 0);
  });

  test("a callback with another login's state", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    const res = await browser.get(back.replace(/state=[^&]*/, "state=someone-elses"));
    await loggedOut(browser, res, "/tags/");
    // The code isn't even tried.
    assert.equal(github.asked.length, 0);
  });

  test("a callback in a browser that didn't start a login", async () => {
    const back = github.approve(await start(new Browser(worker)));
    const other = new Browser(worker);
    await loggedOut(other, await other.get(back), "/");
    assert.equal(github.asked.length, 0);
  });

  test("a callback whose login cookie isn't the Worker's", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    for (const value of ["not%20json", "%7B", "5", "null", "%5B%5D", "%E0%A4%A"]) {
      browser.setCookie("login", value, "/api/auth");
      await loggedOut(browser, await browser.get(back), "/");
    }
    assert.equal(github.asked.length, 0);
  });

  test("the same callback, opened again", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser, "return=/tags/"));
    await browser.get(back);
    assert.equal((await browser.me()).user?.login, "octocat");
    const asked = github.asked.length;
    // The login is over, so its code and state are worth nothing: nobody new is logged in.
    const again = await browser.get(back);
    assert.equal(again.headers.get("Location"), "/");
    assert.deepEqual(Object.keys(setCookies(again)), ["login"]);
    assert.equal(github.asked.length, asked);
    assert.equal(await count("sessions"), 1);
  });

  test("a code GitHub doesn't know, or knows no more", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    github.codes.clear();
    await loggedOut(browser, await browser.get(back), "/tags/");
    assert.equal(github.asked.length, 1);
  });

  test("GitHub down when asked for the token", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    github.instead = () => new Response("<html>Unicorn!</html>", { status: 503 });
    await loggedOut(browser, await browser.get(back), "/tags/");
    assert.equal(github.asked.length, 1);
  });

  test("GitHub down when asked whose token it is", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    github.instead = ({ url }) =>
      url.startsWith("https://api.github.com/")
        ? new Response("<html>Unicorn!</html>", { status: 503 })
        : undefined;
    await loggedOut(browser, await browser.get(back), "/tags/");
    assert.equal(github.asked.length, 2);
  });

  test("the database failing as the person comes back", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    await db.exec("ALTER TABLE sessions RENAME TO sessions_gone");
    try {
      const res = await browser.get(back);
      // Their page, as for the other failures: an error's JSON was all their tab then showed.
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("Location"), "/tags/");
      const cookies = setCookies(res);
      assert.deepEqual(Object.keys(cookies), ["login"]);
      assert.ok(cookies.login.attributes.includes("Max-Age=0"));
      await until(() => logged.length > 0);
      assert.match(logged.splice(0).join("\n"), /no such table: sessions/);
    } finally {
      await db.exec("ALTER TABLE sessions_gone RENAME TO sessions");
    }
    assert.deepEqual(await browser.me(), NOBODY);
    assert.equal(await count("users"), 0);
    assert.equal(await count("sessions"), 0);
  });

  test("a token GitHub takes back at once", async () => {
    const browser = new Browser(worker);
    const back = github.approve(await start(browser));
    github.instead = ({ url }) => {
      if (url.startsWith("https://api.github.com/")) github.tokens.clear();
      return undefined;
    };
    await loggedOut(browser, await browser.get(back), "/tags/");
  });
});

describe("the page to go back to is one of the site's", () => {
  const cases: [from: string, back: string][] = [
    ["/about/", "/about/"],
    ["/?q=a%20b&tag=type%3Aworkflow#results", "/?q=a%20b&tag=type%3Aworkflow#results"],
    ["/vercel-labs/skills/find-skills/", "/vercel-labs/skills/find-skills/"],
    // Another site's address, however it's spelled, is no page of this one: not even its path.
    ["https://evil.example/about/", "/"],
    ["//evil.example/about/", "/"],
    ["///evil.example/about/", "/"],
    ["/\\evil.example/about/", "/"],
    ["/..//evil.example/about/", "/"],
    ["/%2F%2Fevil.example/", "/%2F%2Fevil.example/"],
    ["javascript:alert(1)", "/"],
    ["about/", "/"],
    ["", "/"],
  ];
  for (const [from, back] of cases)
    test(`from ${JSON.stringify(from)}: ${back}`, async () => {
      const browser = new Browser(worker);
      const toGitHub = await browser.get(
        `/api/auth/login?${new URLSearchParams({ return: from })}`,
      );
      // The page is checked when the login starts, and again when it ends: each time for itself.
      const { login } = setCookies(toGitHub);
      assert.equal(JSON.parse(decodeURIComponent(login.value)).back, back);
      for (const kept of [from, "//evil.example/about/"]) {
        const pending = { ...JSON.parse(decodeURIComponent(login.value)), back: kept };
        browser.setCookie("login", encodeURIComponent(JSON.stringify(pending)), "/api/auth");
        const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
        assert.equal(res.headers.get("Location"), kept === from ? back : "/");
        // Where the browser ends up: on this site.
        assert.equal(new URL(res.headers.get("Location") ?? "", SITE).origin, SITE);
        assert.equal((await browser.me()).user?.login, "octocat");
      }
    });

  test("with no page given: the home page", async () => {
    const browser = new Browser(worker);
    const toGitHub = await browser.get("/api/auth/login");
    const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
    assert.equal(res.headers.get("Location"), "/");
  });

  test("with no page given, from a page of the site: that page", async () => {
    // The header's Log in, clicked before the page's script gave it its page: the home page it was.
    const browser = new Browser(worker);
    const toGitHub = await browser.fetch("/api/auth/login", {
      headers: { Referer: `${SITE}/tags/?q=react` },
    });
    const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
    assert.equal(res.headers.get("Location"), "/tags/?q=react");
    assert.equal((await browser.me()).user?.login, "octocat");
  });

  test("with no page given, from a page the browser says is the site's: that page", async () => {
    // As in `pnpm dev`, where the Worker is behind the site's server, on another port.
    const browser = new Browser(worker);
    const toGitHub = await browser.fetch("/api/auth/login", {
      headers: { Referer: "http://localhost:3000/about/", "Sec-Fetch-Site": "same-origin" },
    });
    const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
    assert.equal(res.headers.get("Location"), "/about/");
  });

  test("with no page given, from elsewhere: the home page", async () => {
    // Another site's page, the API's own address, and what isn't an address.
    const elsewhere: [from: string, site: string][] = [
      ["https://evil.example/tags/", "cross-site"],
      ["https://evil.example/tags/", ""],
      [`${SITE}/api/auth/login`, "same-origin"],
      ["/tags/", "same-origin"],
    ];
    for (const [from, site] of elsewhere) {
      const browser = new Browser(worker);
      const toGitHub = await browser.fetch("/api/auth/login", {
        headers: { Referer: from, ...(site ? { "Sec-Fetch-Site": site } : {}) },
      });
      const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
      assert.equal(res.headers.get("Location"), "/", `${from} ${site}`);
    }
  });

  test("the page given, rather than the one the link was on", async () => {
    const browser = new Browser(worker);
    const toGitHub = await browser.fetch("/api/auth/login?return=/about/", {
      headers: { Referer: `${SITE}/tags/` },
    });
    const res = await browser.get(github.approve(toGitHub.headers.get("Location")));
    assert.equal(res.headers.get("Location"), "/about/");
  });
});

describe("saving", () => {
  let browser: Browser;
  beforeEach(async () => {
    browser = new Browser(worker);
    await logIn(browser);
  });

  test("a skill and a bundle, then neither", async () => {
    for (const key of [SKILL, BUNDLE]) {
      const res = await browser.save(key);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(res.headers.get("Cache-Control"), "no-store");
    }
    assert.deepEqual((await browser.me()).saved.sort(), [BUNDLE, SKILL]);
    assert.equal((await browser.save(SKILL, false)).status, 200);
    assert.deepEqual((await browser.me()).saved, [BUNDLE]);
    assert.equal((await browser.save(BUNDLE, false)).status, 200);
    assert.deepEqual((await browser.me()).saved, []);
  });

  test("what's saved is listed in the order it was saved", async () => {
    const keys = ["skill:c/c", "skill:a/a", "bundle:b/b"];
    for (const [i, key] of keys.entries()) {
      await browser.save(key);
      // The order is the saves' times, which are milliseconds.
      await db
        .prepare("UPDATE saves SET created_at = ? WHERE entry_id = ?")
        .bind(i, key.slice(key.indexOf(":") + 1))
        .run();
    }
    assert.deepEqual((await browser.me()).saved, keys);
  });

  test("saving twice saves once, and unsaving what isn't saved is fine", async () => {
    assert.equal((await browser.save(SKILL)).status, 200);
    assert.equal((await browser.save(SKILL)).status, 200);
    assert.deepEqual((await browser.me()).saved, [SKILL]);
    assert.equal((await browser.save(BUNDLE, false)).status, 200);
    assert.deepEqual((await browser.me()).saved, [SKILL]);
  });

  test("a skill and a bundle of one id are two saves", async () => {
    await browser.save("skill:obra/superpowers");
    await browser.save("bundle:obra/superpowers");
    assert.deepEqual((await browser.me()).saved.sort(), [
      "bundle:obra/superpowers",
      "skill:obra/superpowers",
    ]);
    await browser.save("skill:obra/superpowers", false);
    assert.deepEqual((await browser.me()).saved, ["bundle:obra/superpowers"]);
  });

  const bad: [what: string, body: unknown][] = [
    ["a kind the site doesn't have", { key: "repo:vercel-labs/skills", saved: true }],
    ["no kind", { key: "vercel-labs/skills", saved: true }],
    ["no id", { key: "skill:", saved: true }],
    ["an id that starts at the root", { key: "skill:/etc/passwd", saved: true }],
    ["an id that ends in a slash", { key: "skill:vercel-labs/skills/", saved: true }],
    ["an id with a space", { key: "skill:vercel labs/skills", saved: true }],
    ["an id with markup", { key: "skill:<script>alert(1)</script>", saved: true }],
    ["a key longer than any skill's", { key: `skill:${"a".repeat(300)}`, saved: true }],
    ["a key that isn't text", { key: 7, saved: true }],
    ["no key", { saved: true }],
    ["saved as a word", { key: SKILL, saved: "yes" }],
    ["no saved", { key: SKILL }],
    ["a list", [SKILL]],
    ["nothing", null],
  ];
  for (const [what, body] of bad)
    test(`refuses ${what}`, async () => {
      const res = await browser.post("/api/saves", body);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "Bad request" });
      assert.equal(await count("saves"), 0);
    });

  test("refuses what isn't JSON", async () => {
    const res = await browser.fetch("/api/saves", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: "{",
    });
    assert.equal(res.status, 400);
    assert.equal(await count("saves"), 0);
  });

  test("refuses someone who isn't logged in", async () => {
    const res = await new Browser(worker).save(SKILL);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Not logged in" });
    assert.equal(await count("saves"), 0);
  });

  test("refuses another site, which could otherwise save on the person's behalf", async () => {
    const body = { key: SKILL, saved: true };
    const fromElsewhere: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { "Sec-Fetch-Site": "none" },
      // What a form can send, from a browser that doesn't say where a request comes from.
      { "Sec-Fetch-Site": "", "Content-Type": "application/x-www-form-urlencoded" },
      { "Sec-Fetch-Site": "", "Content-Type": "text/plain" },
      { "Sec-Fetch-Site": "", "Content-Type": "multipart/form-data; boundary=x" },
    ];
    for (const headers of fromElsewhere) {
      const res = await browser.post("/api/saves", body, headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.deepEqual(await res.json(), { error: "Forbidden" });
    }
    assert.equal(await count("saves"), 0);
  });

  test("takes a browser that doesn't say where a request comes from, when it's JSON", async () => {
    const res = await browser.post(
      "/api/saves",
      { key: SKILL, saved: true },
      { "Sec-Fetch-Site": "" },
    );
    assert.equal(res.status, 200);
    assert.deepEqual((await browser.me()).saved, [SKILL]);
  });

  test("stops at a thousand saves, and says so", async () => {
    await db
      .prepare(
        `WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1000)
         INSERT INTO saves SELECT ?, 'skill', 'seed/skill-' || i, i FROM n`,
      )
      .bind(OCTOCAT.id)
      .run();
    const res = await browser.save(SKILL);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "You can save at most 1,000 skills and bundles." });
    assert.equal(await count("saves"), 1000);
    // What's saved already stays so, without an error.
    assert.equal((await browser.save("skill:seed/skill-7")).status, 200);
    // And room made is room to save.
    assert.equal((await browser.save("skill:seed/skill-7", false)).status, 200);
    assert.equal((await browser.save(SKILL)).status, 200);
    assert.equal((await browser.me()).saved.length, 1000);
    // Someone else's saves don't count.
    const hubot = new Browser(worker);
    await logIn(hubot, { as: HUBOT });
    assert.equal((await hubot.save(SKILL)).status, 200);
  });
});

describe("thumbs up and down", () => {
  let browser: Browser;
  beforeEach(async () => {
    browser = new Browser(worker);
    await logIn(browser);
  });

  test("a thumb for a skill and one for a bundle, then neither", async () => {
    for (const [key, reaction] of [
      [SKILL, "up"],
      [BUNDLE, "down"],
    ] as const) {
      const res = await browser.react(key, reaction);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(res.headers.get("Cache-Control"), "no-store");
    }
    assert.deepEqual((await browser.me()).reactions, { [SKILL]: "up", [BUNDLE]: "down" });
    assert.equal((await browser.react(SKILL, null)).status, 200);
    assert.deepEqual((await browser.me()).reactions, { [BUNDLE]: "down" });
    assert.equal((await browser.react(BUNDLE, null)).status, 200);
    assert.deepEqual((await browser.me()).reactions, {});
  });

  test("say when each was given, as saves do", async () => {
    const before = Date.now();
    await browser.save(SKILL);
    await browser.react(BUNDLE, "up");
    const first = await browser.times();
    assert.deepEqual(Object.keys(first.savedAt), [SKILL]);
    assert.deepEqual(Object.keys(first.reactedAt), [BUNDLE]);
    for (const at of [first.savedAt[SKILL], first.reactedAt[BUNDLE]])
      assert.ok(at >= before && at <= Date.now(), String(at));

    // Turned over, a thumb is given anew; saved again, a save keeps its time.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await browser.react(BUNDLE, "down");
    await browser.save(SKILL);
    const then = await browser.times();
    assert.ok(then.reactedAt[BUNDLE] > first.reactedAt[BUNDLE]);
    assert.equal(then.savedAt[SKILL], first.savedAt[SKILL]);

    // Taken back, neither has one.
    await browser.react(BUNDLE, null);
    await browser.save(SKILL, false);
    assert.deepEqual(await browser.times(), { savedAt: {}, reactedAt: {} });
  });

  test("the other thumb replaces the first; the same one twice is one", async () => {
    await browser.react(SKILL, "up");
    await browser.react(SKILL, "up");
    assert.deepEqual((await browser.me()).reactions, { [SKILL]: "up" });
    await browser.react(SKILL, "down");
    assert.deepEqual((await browser.me()).reactions, { [SKILL]: "down" });
    assert.equal(await count("reactions"), 1);
    // Taking back what isn't given is fine.
    assert.equal((await browser.react(BUNDLE, null)).status, 200);
  });

  test("are apart from saves, and a skill and a bundle of one id have one each", async () => {
    await browser.save(SKILL);
    await browser.react("skill:obra/superpowers", "up");
    await browser.react("bundle:obra/superpowers", "down");
    assert.deepEqual(await browser.me(), {
      user: { login: "octocat", avatar: OCTOCAT.avatar_url },
      saved: [SKILL],
      reactions: { "skill:obra/superpowers": "up", "bundle:obra/superpowers": "down" },
    });
    await browser.save(SKILL, false);
    assert.equal(await count("reactions"), 2);
  });

  test("two people each have their own", async () => {
    const hubot = new Browser(worker);
    await logIn(hubot, { as: HUBOT });
    await browser.react(SKILL, "up");
    await hubot.react(SKILL, "down");
    assert.deepEqual((await browser.me()).reactions, { [SKILL]: "up" });
    assert.deepEqual((await hubot.me()).reactions, { [SKILL]: "down" });
  });

  const bad: [what: string, body: unknown][] = [
    ["a kind the site doesn't have", { key: "repo:vercel-labs/skills", reaction: "up" }],
    ["an id with markup", { key: "skill:<script>alert(1)</script>", reaction: "up" }],
    ["a key longer than any skill's", { key: `skill:${"a".repeat(300)}`, reaction: "up" }],
    ["no key", { reaction: "up" }],
    ["a thumb that isn't one", { key: SKILL, reaction: "sideways" }],
    ["a thumb in capitals", { key: SKILL, reaction: "UP" }],
    ["a thumb that isn't text", { key: SKILL, reaction: true }],
    ["no thumb", { key: SKILL }],
    ["a list", [SKILL]],
    ["nothing", null],
  ];
  for (const [what, body] of bad)
    test(`refuses ${what}`, async () => {
      const res = await browser.post("/api/reactions", body);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "Bad request" });
      assert.equal(await count("reactions"), 0);
    });

  test("refuses someone who isn't logged in", async () => {
    const res = await new Browser(worker).react(SKILL);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Not logged in" });
    assert.equal(await count("reactions"), 0);
  });

  test("refuses another site, which could otherwise give a thumb on the person's behalf", async () => {
    const fromElsewhere: Record<string, string>[] = [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "", "Content-Type": "text/plain" },
    ];
    for (const headers of fromElsewhere) {
      const res = await browser.post("/api/reactions", { key: SKILL, reaction: "up" }, headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
    }
    assert.equal(await count("reactions"), 0);
  });

  test("stops at a thousand, and says so; turning a thumb over still works there", async () => {
    await db
      .prepare(
        `WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1000)
         INSERT INTO reactions SELECT ?, 'skill', 'seed/skill-' || i, 'up', i FROM n`,
      )
      .bind(OCTOCAT.id)
      .run();
    const res = await browser.react(SKILL);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), {
      error: "You can give a thumbs up or down to at most 1,000 skills and bundles.",
    });
    assert.equal(await count("reactions"), 1000);
    // A thumb given already turns to the other one, and takes no more room.
    assert.equal((await browser.react("skill:seed/skill-7", "down")).status, 200);
    assert.equal((await browser.me()).reactions["skill:seed/skill-7"], "down");
    // Room made is room to give one.
    assert.equal((await browser.react("skill:seed/skill-7", null)).status, 200);
    assert.equal((await browser.react(SKILL)).status, 200);
    assert.equal(await count("reactions"), 1000);
    // Someone else's don't count.
    const hubot = new Browser(worker);
    await logIn(hubot, { as: HUBOT });
    assert.equal((await hubot.react(SKILL)).status, 200);
  });
});

describe("logging out", () => {
  test("ends the session, in this browser only", async () => {
    const laptop = new Browser(worker);
    const phone = new Browser(worker);
    await logIn(laptop);
    await logIn(phone);
    await laptop.save(SKILL);
    const token = laptop.cookie("session") ?? "";

    const res = await laptop.post("/api/auth/logout", {});
    assert.equal(res.status, 204);
    assert.deepEqual(setCookies(res).session.attributes.slice(0, 2), ["Path=/", "Max-Age=0"]);
    assert.equal(laptop.cookie("session"), undefined);
    assert.deepEqual(await laptop.me(), NOBODY);
    // The session is gone, not just its cookie: whoever kept the token gets nowhere with it.
    const thief = new Browser(worker);
    thief.setCookie("session", token);
    assert.deepEqual(await thief.me(), NOBODY);
    // The other browser stays logged in, and the saves stay theirs.
    assert.deepEqual((await phone.me()).saved, [SKILL]);
  });

  test("is fine for someone who isn't logged in", async () => {
    assert.equal((await new Browser(worker).post("/api/auth/logout", {})).status, 204);
  });

  test("refuses another site, which could otherwise log the person out", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    const res = await browser.post("/api/auth/logout", {}, { "Sec-Fetch-Site": "cross-site" });
    assert.equal(res.status, 403);
    assert.equal((await browser.me()).user?.login, "octocat");
  });
});

describe("everything else", () => {
  test("an address of the API that isn't one, or not by that method", async () => {
    const browser = new Browser(worker);
    for (const [method, path] of [
      ["GET", "/api/"],
      ["GET", "/api/nothing"],
      ["GET", "/api/saves"],
      ["GET", "/api/reactions"],
      ["POST", "/api/me"],
      ["GET", "/api/auth/logout"],
      ["POST", "/api/auth/login"],
      ["GET", "/api/me/"],
    ]) {
      const res = await browser.fetch(path, { method });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.deepEqual(await res.json(), { error: "Not found" });
    }
  });

  test("any other address is the site's own pages'", async () => {
    // In production Cloudflare serves those without running the Worker: `run_worker_first`.
    const res = await new Browser(worker).get("/tags/");
    assert.equal(await res.text(), PAGE);
  });

  test("a failure is logged, and tells the browser nothing of it", async () => {
    const browser = new Browser(worker);
    await logIn(browser);
    await db.exec("ALTER TABLE saves RENAME TO saves_gone");
    try {
      const res = await browser.get("/api/me");
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "Server error" });
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      await until(() => logged.length > 0);
      assert.match(logged.splice(0).join("\n"), /no such table: saves/);
    } finally {
      await db.exec("ALTER TABLE saves_gone RENAME TO saves");
    }
  });
});

describe("local dev's test login", () => {
  let dev: Started;
  before(async () => {
    dev = await start({ DEV_LOGIN: "1" });
  });
  after(() => dev.mf.dispose());

  test("Log in logs the test user in at once, without GitHub", async () => {
    const browser = new Browser(dev, "http://localhost:3000");
    const res = await browser.get(
      `/api/auth/login?return=/about/&save=${encodeURIComponent(SKILL)}`,
    );
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), "/about/");
    assert.deepEqual(Object.keys(setCookies(res)), ["session"]);
    assert.deepEqual(await browser.me(), {
      user: { login: "test-user", avatar: "/gem.svg" },
      saved: [SKILL],
      reactions: {},
    });
    assert.equal(github.asked.length, 0);
  });

  test("production has no such login", () => {
    // Only scripts/dev.ts passes DEV_LOGIN, to `wrangler dev`: set here, anyone could be the test user.
    assert.equal(config.vars?.DEV_LOGIN, undefined);
  });
});

test("the tests' runtime is the one wrangler runs the Worker in", () => {
  // Wrangler pins its Miniflare. After a wrangler upgrade, give `miniflare` in package.json that version.
  assert.equal(version("miniflare").version, version("wrangler").dependencies.miniflare);
});
