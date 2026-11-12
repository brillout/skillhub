import { href } from "../../format.ts";

/**
 * Inline, atop the page, so that it runs before the page shows. An address that isn't written as
 * this site writes its own (see ../../github.ts) is tried again as it does, once: there it has a
 * page, or it's back here to stay.
 * - In lowercase, as on skills.sh, while GitHub writes some owners and repos with capitals, such as
 *   AgriciDaniel/claude-seo, and so do the pages here that name them.
 * - A bundle's, with a slash for its @: /bundle/mattpocock/skills@writing/ is where that bundle's
 *   page was, and skills%40writing how Cloudflare made the address bar spell it.
 *
 * Its escapes stay in capitals: Cloudflare redirects %2c to %2C, which would be tried in lowercase
 * again, and so on without end, as /a/b/c/%2C%20d/ did. Should Cloudflare send the retry back here
 * all the same, the referrer is this very address, and it stays here.
 */
const RETRY_SCRIPT = `(() => {
  const { pathname, search, hash } = location;
  let to = pathname.toLowerCase().replace(/%[0-9a-f]{2}/g, (e) => e.toUpperCase());
  if (to.includes("/bundle/")) to = to.replace(/@|%40/g, "/");
  const bounced = document.referrer === location.href.split("#")[0];
  if (to !== pathname && !bounced) location.replace(to + search + hash);
})();`;

/**
 * A way on from an address that names a skill, a bundle or a repo no longer here, or never here as
 * spelled, such as an old link to a skill since renamed or no longer listed: a search for its last
 * part, ux-heuristic for /wondelai/skills/ux-heuristic/, which finds the skill under its new name,
 * or its neighbors. Its words are the part's, as a name's hyphens don't hold them in order. Inline,
 * after the line it adds to, so that it shows with the page: the address is only known here, as
 * every address that has no page is served this one page.
 */
const SEARCH_SCRIPT = `(() => {
  let last = location.pathname.split("/").filter(Boolean).pop() ?? "";
  try { last = decodeURIComponent(last); } catch {}
  const words = last.replace(/[-_.+]+/g, " ").trim();
  if (!words) return;
  const link = document.createElement("a");
  link.href = ${JSON.stringify(href())} + "?" + new URLSearchParams({ q: words });
  link.textContent = "search them for “" + words + "”";
  document.getElementById("not-found-search").replaceChildren(", or ", link);
})();`;

export default () => `
  <script>${RETRY_SCRIPT}</script>
  <div class="page">
    <h1>Page not found</h1>
    <p class="lede">There's no page at this address. <a href="${href()}">Browse the skills</a><span id="not-found-search"></span>.</p>
    <script>${SEARCH_SCRIPT}</script>
  </div>`;
