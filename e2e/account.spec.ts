/**
 * Logging in and saving. The servers of `pnpm dev` and `pnpm preview` log in as a test user
 * instead of with GitHub: see DEV_LOGIN in worker/index.ts. There's only the one, so these tests
 * run in order, and each starts from nothing saved and nobody logged in.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { skill, skillUrl } from "./data.ts";
import { accountLoaded, expect, list, open, ready, settled, test } from "./fixtures.ts";

/** A short list, which the test skill's row heads: see fixtures.ts for why not the whole list. */
const LIST = `/?q=${encodeURIComponent(skill.name)}`;

test.describe.configure({ mode: "default" });

test.beforeEach(async ({ page }) => {
  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  const { saved } = (await (await page.request.get("/api/me")).json()) as { saved: string[] };
  for (const key of saved) await page.request.post("/api/saves", { data: { key, saved: false } });
  await page.request.post("/api/auth/logout", { data: {} });
});

const login = (page: Page) => page.locator("#account a[data-login]");
const logout = (page: Page) => page.locator("#account [data-logout]");
/** The header's link to what you saved. */
const savedLink = (page: Page) => page.locator("#account .saved-link");
const savedCount = (page: Page) => page.locator("[data-saved-count]");
/** The test skill's row. */
const skillRow = (page: Page) => list(page).rows.first();

/** Opens a page and logs in from its header. */
async function openLoggedIn(page: Page, path: string) {
  await open(page, path);
  await login(page).click();
  await ready(page);
  await expect(logout(page)).toBeVisible();
}

test("Log in comes back to the page you were on, its filters included", async ({ page }) => {
  await openLoggedIn(page, "/?show=bundles");
  await expect(page).toHaveURL("/?show=bundles");
  await expect(page.locator("#account .avatar")).toHaveAttribute("title", "Logged in as test-user");
  await expect(login(page)).toHaveCount(0);

  // And to the part of it you were at.
  await logout(page).click();
  await openLoggedIn(page, "/about/#bundles");
  await expect(page).toHaveURL("/about/#bundles");
  await expect(page.locator("#bundles")).toBeInViewport();
});

// 320px is the narrowest phone, and 360px the narrowest that keeps the avatar and the links' gap.
for (const width of [320, 360])
  test(`the header of whoever is logged in fits one line on a phone ${width}px wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 640 });
    await openLoggedIn(page, "/about/");
    // The Saved link, the avatar and Log out are wider than Log in: dark mode's toggle went onto a
    // line of its own.
    await expect(savedLink(page)).toBeVisible();
    const middles = await page
      .locator(".site-links")
      .locator("a, .logout, .theme-toggle")
      .evaluateAll((links) =>
        links.map((link) => {
          const box = link.getBoundingClientRect();
          return box.top + box.height / 2;
        }),
      );
    expect(middles).toHaveLength(6);
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

// A wide screen, a phone, whose Saved link is its bookmark alone, and the narrowest, without the
// avatar: each keeps the room of what's about to show in its own way.
for (const width of [1440, 390, 320])
  test(`the header's links stay put once a page knows who's logged in, ${width}px wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await staysPut(page);
  });

async function staysPut(page: Page) {
  await openLoggedIn(page, "/about/");
  const tags = page.locator(".site-links a").first();
  const left = async () => (await tags.boundingBox())?.x ?? Number.NaN;

  // The next page, until its script has run, as on a slow connection: Log in is hidden, for
  // whoever was logged in on the last page, and replaced by their avatar and Log out once it has.
  let run = () => {};
  const held = new Promise<void>((resolve) => (run = resolve));
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await held;
    await route.continue();
  });
  await page.goto("/tags/", { waitUntil: "commit" });
  await expect(tags).toBeVisible();
  await expect(page.locator("html[data-logged-in]:not([data-account])")).toHaveCount(1);
  await expect(login(page)).toBeHidden();
  const before = await left();

  run();
  await ready(page);
  await expect(logout(page)).toBeVisible();
  await expect(savedLink(page)).toBeVisible();
  // The Saved link, the avatar and Log out are wider than Log in: the links before them jumped
  // that much left.
  expect(Math.abs((await left()) - before)).toBeLessThan(1);
}

test("the header's Saved link leads from a skill's page to what you saved", async ({ page }) => {
  // Nobody's logged in: there's nothing of theirs to lead to.
  await open(page, skillUrl);
  await accountLoaded(page);
  await expect(savedLink(page)).toHaveCount(0);

  await openLoggedIn(page, skillUrl);
  const save = page.locator(".title-row [data-save]");
  const saved = page.waitForResponse((res) => res.url().endsWith("/api/saves"));
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await saved;
  // The Saved switch is on the list alone: from here, there was no way to what was just saved.
  await expect(savedLink(page)).toHaveAccessibleName("Saved");
  await expect(savedLink(page)).not.toHaveAttribute("aria-current");
  await savedLink(page).click();
  await ready(page);
  await accountLoaded(page);
  await settled(page);
  await expect(page).toHaveURL("/?saved");
  const { rows } = list(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".skill-name")).toHaveAttribute("href", skillUrl);

  // It's the page you're on there, for as long as the Saved switch is on.
  const toggle = page.locator("#saved-switch");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(savedLink(page)).toHaveAttribute("aria-current", "page");
  const tags = page.locator(".site-links a").first();
  const left = async () => (await tags.boundingBox())?.x ?? Number.NaN;
  const before = await left();
  await toggle.click();
  await settled(page);
  await expect(savedLink(page)).not.toHaveAttribute("aria-current");
  // Its word is bold on that list, and wider: the links before it stay put all the same.
  expect(Math.abs((await left()) - before)).toBeLessThan(0.5);
  await toggle.click();
  await settled(page);
  await expect(savedLink(page)).toHaveAttribute("aria-current", "page");
});

test("a save lands on the header's Saved link, where the page has no Saved switch", async ({
  page,
}) => {
  await openLoggedIn(page, skillUrl);
  const link = savedLink(page);
  const save = page.locator(".title-row [data-save]");
  const answered = () => page.waitForResponse((res) => res.url().endsWith("/api/saves"));
  await expect(link).not.toHaveAttribute("data-pulse");
  let kept = answered();
  await save.click();
  // A bookmark flies from the button to the link, which then shows that it took it.
  await expect(page.locator(".save-flight")).toHaveCount(1);
  await expect(link).toHaveAttribute("data-pulse", "");
  await expect(page.locator(".save-flight")).toHaveCount(0);
  await kept;
  // Unsaving goes nowhere.
  await link.evaluate((el) => delete (el as HTMLElement).dataset.pulse);
  kept = answered();
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".save-flight")).toHaveCount(0);
  await expect(link).not.toHaveAttribute("data-pulse");
  await kept;

  // On the list, a save lands on the Saved switch, as it did: the link stays as it is.
  await open(page, LIST);
  await accountLoaded(page);
  await skillRow(page).locator("[data-save]").click();
  await expect(page.locator("#saved-switch")).toHaveAttribute("data-pulse", "");
  await expect(savedCount(page)).toHaveText("1");
  await expect(savedLink(page)).not.toHaveAttribute("data-pulse");
});

/** The test skill's row's words, a click on which opens its preview on a wide screen. */
const skillWords = (page: Page) =>
  skillRow(page).locator(".skill-body :is(.glance dd, .skill-desc)").first();

test.describe("a save the connection drops", () => {
  // The dropped request, and the console's word for it, which doesn't name it.
  test.use({ expected: /\/api\/saves\b|net::ERR_FAILED/ });

  test("says so on its button, a removal as a save", async ({ page }) => {
    await openLoggedIn(page, skillUrl);
    const save = page.locator(".title-row [data-save]");
    const word = save.locator(".save-word");
    const answered = () => page.waitForResponse((res) => res.url().endsWith("/api/saves"));
    const dropped = () => page.route("**/api/saves", (route) => route.abort());

    await dropped();
    await save.click();
    await expect(word).toHaveText("Not saved");
    await expect(save).toHaveAttribute("aria-pressed", "false");

    await page.unroute("**/api/saves");
    const done = answered();
    await save.click();
    await done;
    await expect(save).toHaveAttribute("aria-pressed", "true");
    // A removal that fails went back to Saved without a word, as if the click had missed.
    await dropped();
    await save.click();
    await expect(word).toHaveText("Still saved");
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(word).toHaveText("Saved");
    await page.unroute("**/api/saves");
  });
});

test("a preview's own Save saves, and its bookmark lands where it's in sight", async ({ page }) => {
  // Just wide enough for the preview: Show is then on a line of its own, at the left, and the
  // Saved switch under the sheet.
  await page.setViewportSize({ width: 1160, height: 900 });
  await openLoggedIn(page, LIST);
  await skillWords(page).click();
  const sheet = page.locator("#preview");
  await expect(sheet).toBeVisible();
  const edge = (await sheet.boundingBox())?.width ?? 0;
  expect((await page.locator("#saved-switch").boundingBox())?.x).toBeLessThan(edge);

  // The sheet had no Save of its own: the row's, beside it, can be scrolled out of sight.
  const save = sheet.locator("[data-save]");
  await expect(save).toHaveAccessibleName(`Save ${skill.name}`);
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveAccessibleName(`Saved ${skill.name}`);
  await expect(skillRow(page).locator("[data-save]")).toHaveAttribute("aria-pressed", "true");
  // The bookmark flew to the switch, onto the sheet's words: to the header's link instead.
  await expect(savedLink(page)).toHaveAttribute("data-pulse", "");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("h2")).toHaveText(skill.name);
});

test("Save in a preview, logged out, comes back to the preview, saved", async ({ page }) => {
  await open(page, LIST);
  await accountLoaded(page);
  await skillWords(page).click();
  const sheet = page.locator("#preview");
  await sheet.locator("[data-save]").click();
  // Saving logs in on the way, and the list comes back as a new page.
  await ready(page);
  await expect(page).toHaveURL(LIST);
  await expect(logout(page)).toBeVisible();
  await expect(sheet.locator("h2")).toHaveText(skill.name);
  await expect(sheet.locator("[data-save]")).toHaveAttribute("aria-pressed", "true");
  await expect(skillRow(page)).toHaveClass(/previewed/);
});

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("a save still shows on the header's Saved link, with nothing flying", async ({ page }) => {
    await openLoggedIn(page, skillUrl);
    await page.locator(".title-row [data-save]").click();
    await expect(savedLink(page)).toHaveAttribute("data-pulse", "");
    await expect(page.locator(".save-flight")).toHaveCount(0);
  });
});

// What a11y.spec.ts checks of the pages as nobody logged in sees them, of what only shows logged
// in: the header's Saved link, avatar and Log out, a saved Save button and the Saved switch, on.
for (const scheme of ["light", "dark"] as const)
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("the list of what you saved passes axe", async ({ page }) => {
      await openLoggedIn(page, LIST);
      await skillRow(page).locator("[data-save]").click();
      await expect(savedCount(page)).toHaveText("1");
      await page.locator("#saved-switch").click();
      await settled(page);
      await expect(savedLink(page)).toHaveAttribute("aria-current", "page");
      // The animations of a save, which tint what they're on, are over.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      const { violations } = await new AxeBuilder({ page }).analyze();
      const found = violations.map(
        (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 120)}`,
      );
      expect(found).toEqual([]);
    });
  });

test("on a phone, the header's Saved link is its bookmark, still called Saved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLoggedIn(page, skillUrl);
  const link = savedLink(page);
  await expect(link).toHaveAccessibleName("Saved");
  // Its word is for a screen reader: the line has no room for it. Big enough to tap all the same.
  const word = (await link.locator(".saved-word").boundingBox()) ?? { width: 0, height: 0 };
  expect(word.width).toBeLessThanOrEqual(1);
  const box = (await link.boundingBox()) ?? { x: 0, width: 0, height: 0 };
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  // Without reaching over its neighbors, which a tap meant for them would then miss.
  const edges = await page.evaluate(() => {
    const box = (selector: string) =>
      (document.querySelector(selector) as Element).getBoundingClientRect();
    return {
      github: box(".site-links > a:nth-of-type(3)").right,
      avatar: box("#account .avatar").left,
    };
  });
  expect(box.x).toBeGreaterThanOrEqual(edges.github);
  expect(box.x + box.width).toBeLessThanOrEqual(edges.avatar);
  await link.click();
  await ready(page);
  await expect(page).toHaveURL("/?saved");
});

test("a save shows on its button, on the Saved switch and in the Saved list", async ({ page }) => {
  await openLoggedIn(page, LIST);
  const { count, rows, empty } = list(page);
  const save = skillRow(page).locator("[data-save]");
  const href = (await skillRow(page).locator(".skill-name").getAttribute("href")) as string;
  await expect(savedCount(page)).toHaveText("");

  // It's called what it says, with the skill's name.
  await expect(save).toHaveAccessibleName(`Save ${skill.name}`);
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveText("Saved");
  await expect(save).toHaveAccessibleName(`Saved ${skill.name}`);
  await expect(savedCount(page)).toHaveText("1");

  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(page).toHaveURL(LIST.replace("?", "?saved&"));
  await expect(rows).toHaveCount(1);
  await expect(count).toHaveText("1 skill");
  await expect(rows.locator(".skill-name")).toHaveAttribute("href", href);

  // It's kept by the server: a reload shows it again.
  await page.reload();
  await ready(page);
  await accountLoaded(page);
  await settled(page);
  await expect(rows).toHaveCount(1);
  await expect(savedCount(page)).toHaveText("1");

  // Its own page shows it saved, and unsaves it.
  await open(page, href);
  await accountLoaded(page);
  const onPage = page.locator(".title-row [data-save]");
  await expect(onPage).toHaveAttribute("aria-pressed", "true");
  const unsaved = page.waitForResponse((res) => res.url().endsWith("/api/saves"));
  await onPage.click();
  await expect(onPage).toHaveAttribute("aria-pressed", "false");
  await unsaved;

  await open(page, "/?saved");
  await accountLoaded(page);
  await settled(page);
  await expect(empty).toContainText("Nothing saved yet.");
});

test("a saved bundle counts as a bundle, not as its skills", async ({ page }) => {
  await openLoggedIn(page, "/?show=bundles");
  const save = list(page).rows.first().locator("[data-save]");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(savedCount(page)).toHaveText("1");

  await page.locator('[data-show="all"]').click();
  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(list(page).count).toHaveText("0 skills and 1 bundle");
  await expect(list(page).rows).toHaveCount(1);

  // A search that finds nothing in it counts what you saved the same way.
  await list(page).search.fill("zzzqqqxxx");
  await settled(page);
  await expect(list(page).empty).toContainText(
    "among the 0 skills and 1 bundle the filters leave.",
  );
});

test("the Saved list is sorted by Recently saved, the last saved first", async ({ page }) => {
  await openLoggedIn(page, "/?show=bundles");
  const { rows, search } = list(page);
  const sort = page.locator("#sort");
  const option = page.locator('#sort-options [data-sort="saved"]');
  /** The rows' links, in the list's order: a bundle's own comes before its skills'. */
  const hrefs = () =>
    rows.evaluateAll((lis) =>
      lis.map((li) => li.querySelector(".skill-name")?.getAttribute("href")),
    );
  // Only while the list shows only what you saved.
  await expect(option).toHaveCount(0);

  // The list's first two bundles, saved in its order, each once the server has it.
  const [first, second] = (await hrefs()).slice(0, 2);
  const name = (await rows.first().locator(".skill-name").textContent()) as string;
  for (const i of [0, 1]) {
    const save = rows.nth(i).locator("[data-save]");
    const saved = page.waitForResponse((res) => res.url().endsWith("/api/saves"));
    await save.click();
    await saved;
  }

  // The Saved switch sorts by it, with nothing in the URL to say so.
  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(page).toHaveURL("/?saved&show=bundles");
  await expect(sort).toContainText("Recently saved");
  await expect(page.locator('[data-order="desc"]')).toHaveAttribute("title", "Last saved first");
  expect(await hrefs()).toEqual([second, first]);

  // A search sorts by best match, until it's cleared.
  await search.fill(name);
  await settled(page);
  await expect(sort).toContainText("Best match");
  await search.fill("");
  await settled(page);
  await expect(sort).toContainText("Recently saved");
  await expect(page).toHaveURL("/?saved&show=bundles");

  await page.locator('[data-order="asc"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?saved&order=asc&show=bundles");
  expect(await hrefs()).toEqual([first, second]);

  // It goes with the Saved switch, back to the default sort.
  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(page).toHaveURL("/?order=asc&show=bundles");
  await expect(sort).toContainText("Weekly Growth");
  await expect(option).toHaveCount(0);
  // And a link to it without Saved opens on the default sort.
  await open(page, "/?sort=saved&show=bundles");
  await expect(sort).toContainText("Weekly Growth");
  // Another sort picked for the Saved list stays picked.
  await open(page, "/?saved&sort=growth&show=bundles");
  await expect(sort).toContainText("Weekly Growth");
  await expect(option).toHaveCount(1);
});

test("the Saved list is empty when what you saved is no longer listed", async ({ page }) => {
  // As a skill whose SKILL.md is gone from its repo: saved once, and off the list since.
  const key = "skill:some/repo/delisted";
  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  await page.request.post("/api/saves", { data: { key, saved: true } });
  await open(page, "/?saved");
  await accountLoaded(page);
  await settled(page);
  await expect(savedCount(page)).toHaveText("");
  await expect(list(page).empty).toContainText("Nothing saved yet.");
  await expect(page.locator("#ask-label")).toContainText("there's nothing to copy");
});

test("Save, logged out, logs you in and saves", async ({ page }) => {
  await open(page, LIST);
  await accountLoaded(page);
  const save = skillRow(page).locator("[data-save]");
  const key = (await save.getAttribute("data-save")) as string;
  await save.click();
  await ready(page);
  await expect(page).toHaveURL(LIST);
  await expect(logout(page)).toBeVisible();
  await expect(page.locator(`[data-save="${key}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(savedCount(page)).toHaveText("1");
});

test("Save, logged out, down a list, comes back to where the list was", async ({ page }) => {
  await open(page, "/?show=bundles");
  await accountLoaded(page);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 700);
  // The list notes its place once the page has stopped scrolling.
  await page.waitForFunction(() => history.state?.at);
  const save = await page.evaluate(() => {
    for (const button of document.querySelectorAll<HTMLElement>("#results [data-save]")) {
      const box = button.getBoundingClientRect();
      if (box.top > 200 && box.bottom < innerHeight - 200)
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, key: button.dataset.save };
    }
  });
  if (!save) throw new Error("no row's Save button is in view");
  await page.mouse.click(save.x, save.y);

  // Logging in comes back to the list as a new page: at its top, the row just saved was thousands
  // of pixels down, and only the Saved switch's count said the save had worked.
  await ready(page);
  await expect(page).toHaveURL("/?show=bundles");
  await expect(logout(page)).toBeVisible();
  const saved = page.locator(`#results [data-save="${save.key}"]`);
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await expect(saved).toBeInViewport({ ratio: 1 });

  // Not on another way to the same list, which starts at its top.
  await page.locator(".brand").click();
  await ready(page);
  await open(page, "/?show=bundles");
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("the Saved list, logged out, asks to log in", async ({ page }) => {
  await open(page, "/?saved");
  await accountLoaded(page);
  const { empty } = list(page);
  await expect(empty).toContainText("to see what you saved.");
  // An empty list has no tags: the tags' column says so in a line, not once per facet.
  await expect(page.locator("#tag-facets")).toHaveText("No tags: the list is empty.");
  await empty.getByRole("link", { name: "Log in with GitHub" }).click();
  await ready(page);
  await accountLoaded(page);
  await settled(page);
  await expect(page).toHaveURL("/?saved");
  await expect(empty).toContainText("Nothing saved yet.");
});

test("Log out brings Log in back, and forgets what's saved", async ({ page }) => {
  await openLoggedIn(page, LIST);
  const save = skillRow(page).locator("[data-save]");
  await save.click();
  await expect(savedCount(page)).toHaveText("1");

  await logout(page).focus();
  await page.keyboard.press("Enter");
  await expect(login(page)).toBeVisible();
  // The keyboard is on what took Log out's place, rather than back at the page's top.
  await expect(login(page)).toBeFocused();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(savedCount(page)).toHaveText("");
});

test("the API refuses what isn't a logged-in page's own request", async ({ page }) => {
  const post = (data: unknown, headers?: Record<string, string>) =>
    page.request.post("/api/saves", { data, headers });
  const key = "skill:some/repo/skill";
  expect((await post({ key, saved: true })).status(), "not logged in").toBe(401);

  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  expect((await post({ key, saved: true })).status(), "logged in").toBe(200);
  expect((await post({ key: "skill:../ x", saved: true })).status(), "not an id").toBe(400);
  expect((await post({ key, saved: "yes" })).status(), "not a boolean").toBe(400);
  expect((await post({ key, saved: true }, { "Sec-Fetch-Site": "cross-site" })).status()).toBe(403);
  expect((await post("key=x", { "Content-Type": "text/plain" })).status(), "a form").toBe(403);
  expect((await page.request.get("/api/nope")).status()).toBe(404);
  // A cookie that doesn't decode, as another script may set, doesn't get in the way.
  const odd = await page.request.get("/api/me", { headers: { Cookie: "other=%E0%A4%A" } });
  expect(odd.status(), "an undecodable cookie").toBe(200);

  // Logging in never leads off the site.
  const back = await page.request.get("/api/auth/login?return=//evil.example/", {
    maxRedirects: 0,
  });
  expect(back.headers().location).toBe("/");

  // Nothing stays saved for the test user, whose site may be a `pnpm dev` left running.
  expect((await post({ key, saved: false })).status(), "unsaved").toBe(200);
});
