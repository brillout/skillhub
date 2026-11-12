/**
 * SkillHub's server: a Cloudflare Worker. Cloudflare serves the pre-rendered site
 * (website/dist/client) itself, without running this; it runs for /api/* only (`run_worker_first`
 * in ../wrangler.jsonc). It logs people in with GitHub and keeps the skills and bundles they save,
 * in D1: see ./migrations/.
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
const KINDS = ["skill", "bundle"];
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
        case "GET /api/auth/login":
          return await login(request, env);
        case "GET /api/auth/callback":
          return await callback(request, env);
        case "POST /api/auth/logout":
          return await logout(request, env);
      }
    } catch (error) {
      console.error(error);
      return json({ error: "Server error" }, 500);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// ------------------------------------------------------------------- the API

/** Who's logged in, and what they saved, as keys such as `skill:<id>` (see website/saves.ts). */
async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null, saved: [] });
  const { results } = await env.DB.prepare(
    "SELECT kind, entry_id FROM saves WHERE user_id = ? ORDER BY created_at",
  )
    .bind(user.id)
    .all<{ kind: string; entry_id: string }>();
  return json({
    user: { login: user.login, avatar: user.avatar_url },
    saved: results.map((r) => `${r.kind}:${r.entry_id}`),
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
      {
        error: `You can save at most ${MAX_SAVES.toLocaleString("en")} skills and bundles. Remove one to save another.`,
      },
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

type Entry = { kind: string; id: string };
function parseKey(key: unknown): Entry | null {
  if (typeof key !== "string" || key.length > 300) return null;
  const i = key.indexOf(":");
  const entry = { kind: key.slice(0, i), id: key.slice(i + 1) };
  return KINDS.includes(entry.kind) && ID.test(entry.id) ? entry : null;
}

// ------------------------------------------------------------------- logging in

/** `?return=` is the page to go back to, `?save=` a key to save once logged in: the Save button that asked to log in. */
async function login(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pending: Pending = {
    state: token(),
    back: backTo(url.searchParams.get("return"), url),
    save: url.searchParams.get("save"),
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

/** Records the user, starts their session, makes the save they asked for, and goes back to their page. */
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
