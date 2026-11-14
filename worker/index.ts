/**
 * SkillHub's server: a Cloudflare Worker. Cloudflare serves the pre-rendered site
 * (website/dist/client) itself, without running this; it runs for /api/* only (`run_worker_first`
 * in ../wrangler.jsonc). It logs people in with GitHub and keeps the skills and bundles they save,
 * and their thumbs up and down on them, in D1: see ./migrations/.
 *
 * Logging in: /api/auth/login sends you to GitHub, which sends you back to /api/auth/callback. Of
 * your GitHub account, only its id, login and avatar are kept; GitHub's access token is dropped at
 * once. You get a session of SkillHub's own, as a cookie. In local dev, DEV_LOGIN makes
 * /api/auth/login log you in as a test user instead, so that agents can test logging in and saving
 * without GitHub (see scripts/dev.ts).
 */

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Of the GitHub OAuth App: Worker secrets, which CI uploads (see .github/workflows/deploy.yml). */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** "1" in local dev only, where scripts/dev.ts passes it to `wrangler dev`. Never set in production. */
  DEV_LOGIN?: string;
}

interface User {
  /** GitHub's numeric user id, which, unlike the login, never changes. */
  id: number;
  login: string;
  avatar_url: string;
}

const DAY = 86_400_000;
const SESSION = "session";
const SESSION_DAYS = 365;
/** The cookie that carries the OAuth `state`, and what to do once logged in, from /api/auth/login to the callback. */
const PENDING = "login";
const MAX_SAVES = 1000;
const MAX_REACTIONS = 1000;
const KINDS = ["skill", "bundle"];
const REACTIONS = ["up", "down"];
/** The ids of data/skills.jsonc, such as `vercel-labs/skills/skills/find-skills`, with room to spare. */
const ID = /^[\w.@-]+(\/[\w.@-]+)*$/;
const TEST_USER: User = { id: 0, login: "test-user", avatar_url: "/gem.svg" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/me":
          return await me(request, env);
        case "POST /api/saves":
          return await save(request, env);
        case "POST /api/reactions":
          return await react(request, env);
        case "GET /api/auth/login":
          return await login(request, env);
        case "GET /api/auth/callback":
          return await callback(request, env);
        case "POST /api/auth/logout":
          return await logout(request, env);
      }
    } catch (error) {
      console.error(error);
      // Logging in is the tab's own navigation, not a script's request: back to the page it
      // started from, logged out, as when GitHub says no. An error's JSON was all the tab showed.
      if (request.method === "GET" && url.pathname.startsWith("/api/auth/"))
        return redirect(
          backTo(startedFrom(request, url), url),
          cookie(request, PENDING, "", 0, "/api/auth"),
        );
      return json({ error: "Server error" }, 500);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// ------------------------------------------------------------------- the API

/**
 * Who's logged in, what they saved, as keys such as `skill:<id>` (see website/saves.ts), in the
 * order they saved it, and their thumbs, as `{ [key]: "up" | "down" }`. And when, by key, in
 * milliseconds: `savedAt` and `reactedAt`, which the buttons' tooltips say.
 */
async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null, saved: [], savedAt: {}, reactions: {}, reactedAt: {} });
  const [saves, reactions] = await env.DB.batch<{
    kind: string;
    entry_id: string;
    reaction: string;
    created_at: number;
  }>([
    env.DB.prepare(
      "SELECT kind, entry_id, created_at FROM saves WHERE user_id = ? ORDER BY created_at",
    ).bind(user.id),
    env.DB.prepare(
      "SELECT kind, entry_id, reaction, created_at FROM reactions WHERE user_id = ?",
    ).bind(user.id),
  ]);
  const key = (r: { kind: string; entry_id: string }) => `${r.kind}:${r.entry_id}`;
  return json({
    user: { login: user.login, avatar: user.avatar_url },
    saved: saves.results.map(key),
    savedAt: Object.fromEntries(saves.results.map((r) => [key(r), r.created_at])),
    reactions: Object.fromEntries(reactions.results.map((r) => [key(r), r.reaction])),
    reactedAt: Object.fromEntries(reactions.results.map((r) => [key(r), r.created_at])),
  });
}

/** Saves or unsaves `{ key, saved }`. */
async function save(request: Request, env: Env): Promise<Response> {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Not logged in" }, 401);
  const body = (await request.json().catch(() => null)) as {
    key?: unknown;
    saved?: unknown;
  } | null;
  const entry = parseKey(body?.key);
  if (!entry || typeof body?.saved !== "boolean") return json({ error: "Bad request" }, 400);
  if (!body.saved)
    await env.DB.prepare("DELETE FROM saves WHERE user_id = ? AND kind = ? AND entry_id = ?")
      .bind(user.id, entry.kind, entry.id)
      .run();
  else if (!(await addSave(env, user.id, entry)))
    return json(
      { error: `You can save at most ${MAX_SAVES.toLocaleString("en")} skills and bundles.` },
      409,
    );
  return json({ ok: true });
}

/** Whether the entry is saved now: false when the user is at MAX_SAVES. */
async function addSave(env: Env, userId: number, { kind, id }: Entry): Promise<boolean> {
  // The count is in the same statement, so that requests made at once can't go past it.
  const { meta } = await env.DB.prepare(
    `INSERT OR IGNORE INTO saves (user_id, kind, entry_id, created_at)
     SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM saves WHERE user_id = ?1) < ?5`,
  )
    .bind(userId, kind, id, Date.now(), MAX_SAVES)
    .run();
  if (meta.changes) return true;
  // Nothing inserted: saved already, or at the cap.
  return Boolean(
    await env.DB.prepare("SELECT 1 FROM saves WHERE user_id = ? AND kind = ? AND entry_id = ?")
      .bind(userId, kind, id)
      .first(),
  );
}

/**
 * Gives `{ key, reaction }` a thumbs up or down, `reaction` "up" or "down", or takes it back:
 * `reaction` null.
 */
async function react(request: Request, env: Env): Promise<Response> {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Not logged in" }, 401);
  const body = (await request.json().catch(() => null)) as {
    key?: unknown;
    reaction?: unknown;
  } | null;
  const entry = parseKey(body?.key);
  const reaction = body?.reaction;
  if (!entry || !(reaction === null || isReaction(reaction)))
    return json({ error: "Bad request" }, 400);
  if (reaction === null)
    await env.DB.prepare("DELETE FROM reactions WHERE user_id = ? AND kind = ? AND entry_id = ?")
      .bind(user.id, entry.kind, entry.id)
      .run();
  else if (!(await addReaction(env, user.id, entry, reaction)))
    return json(
      {
        error: `You can give a thumbs up or down to at most ${MAX_REACTIONS.toLocaleString("en")} skills and bundles.`,
      },
      409,
    );
  return json({ ok: true });
}

const isReaction = (reaction: unknown): reaction is string =>
  typeof reaction === "string" && REACTIONS.includes(reaction);

/**
 * Whether the entry has the reaction now: false when the user is at MAX_REACTIONS. Turning a thumb
 * to the other one takes no more room, also at the cap.
 */
async function addReaction(
  env: Env,
  userId: number,
  { kind, id }: Entry,
  reaction: string,
): Promise<boolean> {
  // The count is in the same statement, as for saves: see addSave.
  const { meta } = await env.DB.prepare(
    `INSERT INTO reactions (user_id, kind, entry_id, reaction, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE (SELECT COUNT(*) FROM reactions WHERE user_id = ?1) < ?6
       OR EXISTS (SELECT 1 FROM reactions WHERE user_id = ?1 AND kind = ?2 AND entry_id = ?3)
     ON CONFLICT (user_id, kind, entry_id) DO UPDATE
       SET reaction = excluded.reaction, created_at = excluded.created_at`,
  )
    .bind(userId, kind, id, reaction, Date.now(), MAX_REACTIONS)
    .run();
  return meta.changes > 0;
}

type Entry = { kind: string; id: string };
function parseKey(key: unknown): Entry | null {
  if (typeof key !== "string" || key.length > 300) return null;
  const i = key.indexOf(":");
  const entry = { kind: key.slice(0, i), id: key.slice(i + 1) };
  return KINDS.includes(entry.kind) && ID.test(entry.id) ? entry : null;
}

// ------------------------------------------------------------------- logging in

/**
 * The page a link to /api/auth/login was on, from its Referer, for a link without `?return=`: the
 * header's Log in is one until the page's script gives it its page (see loginHtml in
 * website/saves.ts), and a click before that, on a slow connection, came back to the home page.
 */
function cameFrom(request: Request, url: URL): string | null {
  try {
    const from = new URL(request.headers.get("Referer") ?? "");
    // One of the site's own pages: the browser says so, or else its address does. In `pnpm dev`
    // only the browser can tell: the Worker is behind the site's server there, on another port.
    const own =
      request.headers.get("Sec-Fetch-Site") === "same-origin" || from.origin === url.origin;
    return own && !from.pathname.startsWith("/api/") ? from.pathname + from.search : null;
  } catch {
    return null;
  }
}

/** The page a login started from, for one that fails on the way: see the `catch` of `fetch`. */
function startedFrom(request: Request, url: URL): string | null {
  if (url.pathname === "/api/auth/login")
    return url.searchParams.get("return") ?? cameFrom(request, url);
  try {
    const pending = JSON.parse(cookies(request).get(PENDING) ?? "null") as Pending | null;
    return pending?.back ?? null;
  } catch {
    return null;
  }
}

/**
 * `?return=` is the page to go back to; without it, the page the link was on. What to do once
 * logged in, for the button that asked to log in: `?save=` a key to save, the Save button's, or
 * `?react=` a key and `?reaction=` the thumb to give it, "up" or "down".
 */
async function login(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pending: Pending = {
    state: token(),
    back: backTo(url.searchParams.get("return") ?? cameFrom(request, url), url),
    save: url.searchParams.get("save"),
    react: url.searchParams.get("react"),
    reaction: url.searchParams.get("reaction"),
  };
  if (env.DEV_LOGIN === "1") return loggedIn(request, env, TEST_USER, pending);
  const github = new URL("https://github.com/login/oauth/authorize");
  github.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  github.searchParams.set("redirect_uri", callbackUrl(url));
  github.searchParams.set("state", pending.state);
  // No `scope`: the token can read only what's public, and SkillHub only reads who you are.
  return redirect(github.href, cookie(request, PENDING, JSON.stringify(pending), 600, "/api/auth"));
}

interface Pending {
  state: string;
  back: string;
  save: string | null;
  /** Optional: a login started before reactions existed has neither. */
  react?: string | null;
  reaction?: string | null;
}

async function callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clear = cookie(request, PENDING, "", 0, "/api/auth");
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(cookies(request).get(PENDING) ?? "null");
  } catch {}
  const code = url.searchParams.get("code");
  // Declined on GitHub, or a callback this browser didn't start: back to the page, logged out.
  if (!pending || !code || url.searchParams.get("state") !== pending.state)
    return redirect(backTo(pending?.back, url), clear);
  const exchanged = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(url),
    }),
  });
  const { access_token } = (await exchanged.json().catch(() => ({}))) as { access_token?: string };
  if (!access_token) return redirect(backTo(pending.back, url), clear);
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "skillhub.build",
    },
  });
  if (!res.ok) return redirect(backTo(pending.back, url), clear);
  const { id, login, avatar_url } = (await res.json()) as User;
  return loggedIn(request, env, { id, login, avatar_url }, pending, clear);
}

/**
 * Records the user, starts their session, makes the save or gives the thumb they asked for, and
 * goes back to their page.
 */
async function loggedIn(
  request: Request,
  env: Env,
  user: User,
  pending: Pending,
  ...setCookies: string[]
): Promise<Response> {
  const session = token();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, login, avatar_url, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url`,
    ).bind(user.id, user.login, user.avatar_url, now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(
      await sha256(session),
      user.id,
      now + SESSION_DAYS * DAY,
    ),
  ]);
  const entry = parseKey(pending.save);
  if (entry) await addSave(env, user.id, entry);
  const reacted = parseKey(pending.react);
  if (reacted && isReaction(pending.reaction))
    await addReaction(env, user.id, reacted, pending.reaction);
  return redirect(
    backTo(pending.back, new URL(request.url)),
    cookie(request, SESSION, session, (SESSION_DAYS * DAY) / 1000),
    ...setCookies,
  );
}

async function logout(request: Request, env: Env): Promise<Response> {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  const session = cookies(request).get(SESSION);
  if (session)
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(session))
      .run();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": cookie(request, SESSION, "", 0), "Cache-Control": "no-store" },
  });
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const session = cookies(request).get(SESSION);
  if (!session) return null;
  return env.DB.prepare(
    `SELECT users.id, users.login, users.avatar_url FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256(session), Date.now())
    .first<User>();
}

/** Must be the OAuth App's callback URL on GitHub: https://skillhub.build/api/auth/callback. */
const callbackUrl = (url: URL) => `${url.origin}/api/auth/callback`;

/** The page to go back to: a path on this site, never another site's address, such as `//evil.example`. */
function backTo(path: string | null | undefined, url: URL): string {
  if (!path?.startsWith("/")) return "/";
  const to = new URL(path, url.origin);
  const back = to.pathname + to.search + to.hash;
  return to.origin === url.origin && !back.startsWith("//") ? back : "/";
}

/**
 * Writes take JSON only, which a form on another site can't send, and only from SkillHub's own
 * pages. With the session cookie's SameSite=Lax, that's what keeps other sites from saving or
 * logging out on your behalf.
 */
function refuseCrossSite(request: Request): Response | null {
  const isJson = (request.headers.get("Content-Type") ?? "").startsWith("application/json");
  const site = request.headers.get("Sec-Fetch-Site");
  return isJson && (!site || site === "same-origin") ? null : json({ error: "Forbidden" }, 403);
}

// ------------------------------------------------------------------- helpers

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function redirect(to: string, ...setCookies: string[]): Response {
  const headers = new Headers({ Location: to, "Cache-Control": "no-store" });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

function cookies(request: Request): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    // A cookie that isn't SkillHub's own, such as one an extension sets, may not decode: it's
    // left out, rather than failing every request that carries it.
    try {
      map.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
    } catch {}
  }
  return map;
}

/** A Set-Cookie value; `maxAge` 0 deletes it. Secure over HTTPS, so that local dev works over HTTP. */
function cookie(request: Request, name: string, value: string, maxAge: number, path = "/"): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** 32 random bytes, base64url. */
function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Sessions are kept by their token's hash, so that the database alone can't log anyone in. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
