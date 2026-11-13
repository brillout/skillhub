/**
 * The skills list's layout, the tags left of the list; its rows, which open wherever clicked; and
 * their previews, which a click on a row opens over the tags on a wide screen (see
 * website/preview-client.ts), where elsewhere it opens the row's page.
 */

import type { Locator, Page } from "@playwright/test";
import { bundle, bundleUrl, onlyInBundle, repo, skill, skillUrl, smallRepo } from "./data.ts";
import { skillPage } from "../website/github.ts";
import { expect, list, open, ready, searchable, settled, test } from "./fixtures.ts";

const preview = (page: Page) => page.locator("#preview");
/** The name the preview shows: of the row it's about. */
const shownIn = (page: Page) => preview(page).locator("h2");
/** A row's words, beside its numbers, which the preview covers once open. */
const wordsOf = (row: Locator) => row.locator(".skill-body :is(.glance dd, .skill-desc)").first();
/** The row of a skill or a bundle, by its page. */
const rowOf = (page: Page, url: string) =>
  list(page).rows.filter({ has: page.locator(`.skill-name[href="${url}"]`) });
/** How far down the preview is read. */
const readTo = (page: Page) => preview(page).evaluate((pane) => pane.scrollTop);
/** A short list of several rows, without a search: the repo with the most skills, which has a bundle. */
const SEVERAL = `/?repo=${encodeURIComponent(repo.repo)}`;
/** The pages of the skills whose preview has a TL;DR and the start of a SKILL.md. */
const PROSE_AND_MD = new Set(
  [skill, ...repo.skills]
    .filter((s) => s.agentReview.tldr?.text && s.skillMd)
    .map((s) => `/${skillPage(s)}/`),
);

test("the tags are left of the list, the settings' line as wide as both", async ({ page }) => {
  await open(page, "/");
  const tags = await page.locator("#facets").boundingBox();
  const results = await page.locator("#results").boundingBox();
  const settings = await page.locator("#settings").boundingBox();
  if (!tags || !results || !settings) throw new Error("the list's view isn't laid out");
  expect(tags.x + tags.width).toBeLessThan(results.x);
  expect(Math.abs(settings.x - tags.x)).toBeLessThan(2);
  expect(Math.abs(settings.x + settings.width - (results.x + results.width))).toBeLessThan(2);
});

test("a click on a row previews it over the tags, with its page a click away", async ({ page }) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The preview shows the TLDR's prose, which loads after the page.
  await searchable(page);
  const row = list(page).rows.first();
  await expect(row.locator(".skill-name")).toHaveText(skill.name);

  await wordsOf(row).click();
  await expect(preview(page)).toBeVisible();
  await expect(page).toHaveURL(/\?q=/);
  await expect(row).toHaveClass(/previewed/);
  await expect(preview(page).locator("h2")).toHaveText(skill.name);
  for (const { label } of skill.agentReview.tldr?.glance ?? [])
    await expect(preview(page).locator(".glance")).toContainText(`${label}:`);
  const prose = skill.agentReview.tldr?.text;
  if (prose) await expect(preview(page)).toContainText(prose.slice(0, 60));
  await expect(preview(page).locator(".install")).toContainText(`--skill ${skill.name}`);
  // The start of its SKILL.md, from its page.
  await expect(preview(page).locator("[data-skill-md]")).toContainText(
    skill.skillMd ? "Checked daily" : "No copy",
  );
  // Over the window's left side, its whole height, up to the row's words: over the tags, and over
  // the row's numbers. Its words start where the tags do.
  const pane = await preview(page).boundingBox();
  const tags = await page.locator("#facets").boundingBox();
  const name = await preview(page).locator("h2").boundingBox();
  const words = await row.locator(".skill-body").boundingBox();
  const window = page.viewportSize();
  if (!pane || !tags || !name || !words || !window) throw new Error("the preview isn't laid out");
  expect(pane).toMatchObject({ x: 0, y: 0, height: window.height });
  expect(pane.width).toBeLessThan(words.x);
  expect(pane.width).toBeGreaterThan(words.x - 40);
  expect(Math.abs(name.x - tags.x)).toBeLessThan(2);

  // Its × closes it, and the tags under it are back.
  await preview(page).getByRole("button", { name: "Close the preview" }).click();
  await expect(preview(page)).toBeHidden();
  await expect(row).not.toHaveClass(/previewed/);
  const chip = page.locator("#facets .chip").first();
  const tag = await chip.getAttribute("data-tag");
  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(tag as string)}`));

  // All details, on the preview as on the row, opens its page.
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await wordsOf(list(page).rows.first()).click();
  const numbers = await preview(page).locator(".preview-stats dt").allInnerTexts();
  expect(numbers.length).toBeGreaterThan(0);
  await preview(page).getByRole("link", { name: "All details" }).click();
  await expect(page).toHaveURL(skillUrl);
  // Which names its numbers as the preview did: "Weekly Downloads", not "Weekly downloads" there.
  await ready(page);
  const tiles = await page.locator(".stat-label").allInnerTexts();
  for (const name of numbers) expect(tiles.filter((tile) => tile.startsWith(name))).toHaveLength(1);
});

test("a preview opened while the TLDRs' prose is still loading stays open once it's in", async ({
  page,
}) => {
  // The prose is what the list's script asks for once it runs, after it took the page's scroll in
  // charge: held back until `arrive` is called, as a slow connection holds it.
  let arrive = () => {};
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  await page.route("**/*", async (route) => {
    const running = () => page.evaluate(() => history.scrollRestoration === "manual");
    if (route.request().resourceType() === "script" && (await running().catch(() => false)))
      await arrived;
    await route.continue();
  });
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  const row = list(page).rows.first();
  await wordsOf(row).click();
  await expect(preview(page)).toBeVisible();
  await expect(page.locator("html[data-search-words]")).toHaveCount(0);

  // With a search on, the list is rendered again once the prose is in, to look through it too:
  // the preview closed with the rows it was about, under the eyes of whoever was reading it.
  arrive();
  await searchable(page);
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator("h2")).toHaveText(skill.name);
  await expect(row).toHaveClass(/previewed/);
  const prose = skill.agentReview.tldr?.text;
  if (prose) await expect(preview(page)).toContainText(prose.slice(0, 60));
});

test("the start of a SKILL.md, in a preview, ends on what it says, not on a heading", async ({
  page,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await searchable(page);
  // The skill's page, as the preview fetches it, with a SKILL.md whose fifth block, where its start
  // is cut, is a heading: it would head nothing.
  const blocks = `<h3>Its title</h3><p>One.</p><p>Two.</p><p>Three.</p><h4>Cut here</h4><p>Four.</p>`;
  await page.route(`**${skillUrl}`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<section class="skill-md"><p class="muted">From its repo.</p><div class="markdown">${blocks}</div></section>`,
    }),
  );
  await wordsOf(list(page).rows.first()).click();
  const start = preview(page).locator("[data-skill-md] .markdown");
  await expect(start.locator("> *")).toHaveText(["Its title", "One.", "Two.", "Three."]);
});

test("once open, the preview shows the row the mouse is on, and a click on it, outside it, or Escape, closes it", async ({
  page,
}) => {
  // A short list: on the whole one, Playwright's waits on the preview hold up the page.
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}`);
  const { rows } = list(page);
  const names = await rows.locator(".skill-name").allInnerTexts();
  await wordsOf(rows.nth(0)).click();
  await expect(preview(page).locator("h2")).toContainText(names[0]);
  await wordsOf(rows.nth(1)).hover();
  await expect(preview(page).locator("h2")).toContainText(names[1]);
  await expect(rows.nth(0)).not.toHaveClass(/previewed/);
  await expect(rows.nth(1)).toHaveClass(/previewed/);
  await wordsOf(rows.nth(1)).click();
  await expect(preview(page)).toBeHidden();
  // Closed, it waits for a click again.
  await wordsOf(rows.nth(0)).hover();
  await expect(preview(page)).toBeHidden();
  await wordsOf(rows.nth(0)).click();
  await expect(preview(page).locator("h2")).toContainText(names[0]);
  await page.keyboard.press("Escape");
  await expect(preview(page)).toBeHidden();
  await expect(rows.nth(0)).not.toHaveClass(/previewed/);
  // A click on the preview leaves it open; one outside it and the rows, such as on the list's
  // count, closes it.
  await wordsOf(rows.nth(0)).click();
  await preview(page).locator(".glance").click();
  await expect(preview(page)).toBeVisible();
  await page.locator("#count").click();
  await expect(preview(page)).toBeHidden();
});

test("a row's own buttons, a selection in it, and Ctrl leave its preview closed", async ({
  page,
  context,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The TLDRs' prose, once in, renders the search's list again, which would undo a selection.
  await searchable(page);
  const row = list(page).rows.first();
  const words = wordsOf(row);

  // Selecting its words, by dragging across them.
  const box = await words.boundingBox();
  if (!box) throw new Error("the row's words aren't laid out");
  await page.mouse.move(box.x + 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 8, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString().length))
    .toBeGreaterThan(0);
  await expect(preview(page)).toBeHidden();
  await page.evaluate(() => getSelection()?.removeAllRanges());

  // With Ctrl or Cmd, its page, in a new tab, as a link.
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    words.click({ modifiers: ["ControlOrMeta"] }),
  ]);
  await expect(tab).toHaveURL(skillUrl);
  await tab.close();
  await expect(preview(page)).toBeHidden();

  // All details, on the row, opens its page. For the pointer alone: the row's name is that link
  // for the keyboard and for screen readers, to which this one was a second stop in every row.
  const details = row.locator(".details");
  await expect(details).toHaveText("All details");
  await expect(details).toHaveAttribute("aria-hidden", "true");
  await row.locator(".skill-name").focus();
  await page.keyboard.press("Tab");
  await expect(row.locator(".repo-link")).toBeFocused();
  for (const next of ['[data-react="up"]', '[data-react="down"]', "[data-save]"]) {
    await page.keyboard.press("Tab");
    await expect(row.locator(next)).toBeFocused();
  }
  await details.click();
  await expect(page).toHaveURL(skillUrl);
});

test("a pointer on its way to the preview doesn't change what it shows", async ({ page }) => {
  await open(page, SEVERAL);
  const { rows } = list(page);
  // The rows from the window's top, so that one starts in its lower half, with rows above it: the
  // straight line from its words to the preview's All details, at the window's top, crosses those.
  await page.locator("#results").evaluate((el) => el.scrollIntoView({ block: "start" }));
  const low = await rows.evaluateAll((all) =>
    all.findIndex((row) => row.getBoundingClientRect().top > innerHeight / 2),
  );
  expect(low).toBeGreaterThan(0);
  const row = rows.nth(low);
  const name = await row.locator(".skill-name").innerText();
  const href = (await row.locator(".skill-name").getAttribute("href")) as string;
  await wordsOf(row).click();
  await expect(shownIn(page)).toContainText(name);

  const details = preview(page).getByRole("link", { name: "All details" });
  const to = await details.boundingBox();
  if (!to) throw new Error("the preview's All details isn't laid out");
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 });
  // The preview took each row on the way in turn, and the click opened another skill's page than
  // the one that was read.
  await expect(shownIn(page)).toContainText(name);
  await details.click();
  await expect(page).toHaveURL(href);

  // A pointer that comes to rest on a row on such a way means that row.
  await page.goBack();
  await ready(page);
  await expect(shownIn(page)).toContainText(name);
  const above = rows.nth(low - 1);
  const from = await wordsOf(row).boundingBox();
  const rest = await above.boundingBox();
  if (!from || !rest) throw new Error("the rows aren't laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + 8);
  await page.mouse.move(from.x + 24, rest.y + rest.height / 2, { steps: 12 });
  await expect(shownIn(page)).toContainText(await above.locator(".skill-name").innerText());
});

test("the list scrolling under the pointer leaves the preview on its row, until the pointer moves", async ({
  page,
}) => {
  await open(page, SEVERAL);
  const { rows } = list(page);
  const names = await rows.locator(".skill-name").allInnerTexts();
  const at = await wordsOf(rows.nth(0)).boundingBox();
  if (!at) throw new Error("the first row's words aren't laid out");
  const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];
  await page.mouse.click(x, y);
  await expect(shownIn(page)).toContainText(names[0]);

  // The wheel, with the pointer where it clicked: another row comes under it.
  await page.mouse.wheel(0, 600);
  const under = () =>
    page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px, py)?.closest(".skill-list > li")?.querySelector(".skill-name")
          ?.textContent ?? "",
      [x, y],
    );
  await expect.poll(under).not.toBe(names[0]);
  const now = await under();
  expect(now).not.toBe("");
  // Once the browser has told the page so: the preview went through every row that passed under
  // the pointer, fetching the page of each.
  await expect
    .poll(() => page.evaluate(() => document.querySelector(".skill-list > li:hover") !== null))
    .toBe(true);
  await expect(shownIn(page)).toContainText(names[0]);
  // A move of the pointer, and it's that row's.
  await page.mouse.move(x + 3, y + 2);
  await expect(shownIn(page)).toContainText(now);
});

test("the click that opens a preview hands it the keyboard", async ({ page }) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await searchable(page);
  const row = list(page).rows.first();
  const name = row.locator(".skill-name");
  await wordsOf(row).click();
  await expect(preview(page)).toBeFocused();
  // Once the start of its SKILL.md is in, which makes it longer than the window.
  await expect(preview(page).locator("[data-skill-md] .markdown")).toBeVisible();
  // Space reads on, in the sheet: it scrolled the list behind it, and the sheet took the row that
  // came under the pointer.
  await page.keyboard.press("Space");
  await expect.poll(() => readTo(page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(shownIn(page)).toHaveText(skill.name);

  // Tab is on the sheet's own stops, which were as many presses away as the list has links: its
  // repo, then All details.
  const details = preview(page).getByRole("link", { name: "All details" });
  await page.keyboard.press("Tab");
  await expect(preview(page).locator(".repo-link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(details).toBeFocused();
  // Back from its first stop, the row it's about, rather than the list's last row.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(name).toBeFocused();
  await expect(preview(page)).toBeVisible();
  // On from its last stop, what follows that row's name, rather than the page's end.
  await preview(page).locator("a[href], button").last().focus();
  await page.keyboard.press("Tab");
  await expect(row.locator(".repo-link")).toBeFocused();

  // Escape, from the sheet, leaves the keyboard on the row: on nothing, the next Tab started over
  // from the page's top.
  await details.focus();
  await page.keyboard.press("Escape");
  await expect(preview(page)).toBeHidden();
  await expect(name).toBeFocused();
});

test("the keyboard's focus doesn't go under the preview, which makes way for it", async ({
  page,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await searchable(page);
  await wordsOf(list(page).rows.first()).click();
  await expect(preview(page)).toBeFocused();
  // From the sheet to its row's name, then to what's before the list: the tags, which it covers.
  await page.keyboard.press("Shift+Tab");
  await expect(preview(page)).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(preview(page)).toBeHidden();
  const focused = page.locator(":focus");
  await expect(focused).toBeInViewport();
  expect(await focused.evaluate((el) => Boolean(el.closest("#filters, #settings")))).toBe(true);
});

test("a selection in the preview stays in it, and keeps it open", async ({ page }) => {
  await open(page, SEVERAL);
  const { rows } = list(page);
  const names = await rows.locator(".skill-name").allInnerTexts();
  await wordsOf(rows.nth(1)).click();
  await expect(shownIn(page)).toContainText(names[1]);
  const fact = await preview(page).locator(".glance dd, .skill-desc").first().boundingBox();
  const first = await wordsOf(rows.nth(0)).boundingBox();
  if (!fact || !first) throw new Error("the preview's words, or the first row's, aren't laid out");
  const selection = () =>
    page.evaluate(() => {
      const s = getSelection();
      const pane = document.getElementById("preview") as HTMLElement;
      return {
        length: s?.toString().length ?? 0,
        inside: Boolean(s && pane.contains(s.anchorNode) && pane.contains(s.focusNode)),
      };
    });

  // Dragged past the sheet's edge onto the first row, as one overshoots a line's end: the sheet
  // took that row, replacing the words being selected.
  await page.mouse.move(fact.x + 4, fact.y + 8);
  await page.mouse.down();
  await page.mouse.move(first.x + 60, first.y + 8, { steps: 12 });
  await expect(shownIn(page)).toContainText(names[1]);
  await page.mouse.up();
  await expect(shownIn(page)).toContainText(names[1]);
  // The selection is the sheet's words, not the list's behind it.
  expect((await selection()).length).toBeGreaterThan(0);
  expect((await selection()).inside).toBe(true);

  // Released over what isn't a row, the page's heading: that click closed the sheet.
  const heading = await page.locator(".list-head").boundingBox();
  if (!heading) throw new Error("the list's heading isn't laid out");
  await page.mouse.move(fact.x + 4, fact.y + 8);
  await page.mouse.down();
  await page.mouse.move(heading.x + heading.width - 40, heading.y + heading.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(preview(page)).toBeVisible();
  expect((await selection()).inside).toBe(true);
  // A click there, without a selection, still closes it.
  await page.mouse.click(heading.x + heading.width - 40, heading.y + heading.height / 2);
  await expect(preview(page)).toBeHidden();
});

test("a preview read down keeps its name and its × in sight, and the next one starts at its top", async ({
  page,
}) => {
  await open(page, SEVERAL);
  const { rows } = list(page);
  await wordsOf(rows.nth(0)).click();
  await expect(preview(page)).toBeVisible();
  const pane = await preview(page).boundingBox();
  if (!pane) throw new Error("the preview isn't laid out");
  await page.mouse.move(pane.width / 2, pane.height / 2);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => readTo(page)).toBeGreaterThan(0);
  // Read to its end, it no longer said whose it was, and its × was a screen up: on a tablet,
  // without an Escape key, that left the few places that aren't a row to close it.
  await expect(shownIn(page)).toBeInViewport({ ratio: 1 });
  const close = preview(page).getByRole("button", { name: "Close the preview" });
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.click();
  await expect(preview(page)).toBeHidden();

  // The next one opened as far down as the last was read, its name above the window.
  await wordsOf(rows.nth(1)).click();
  await expect(preview(page)).toBeVisible();
  expect(await readTo(page)).toBe(0);
});

test("the way back from All details brings the preview back, where it was read", async ({
  page,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await searchable(page);
  const row = list(page).rows.first();
  await wordsOf(row).click();
  await expect(shownIn(page)).toHaveText(skill.name);
  await preview(page)
    .locator("[data-skill-md]")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  const read = await readTo(page);
  await preview(page).getByRole("link", { name: "All details" }).click();
  await expect(page).toHaveURL(skillUrl);
  await ready(page);

  // The list came back without the preview it was left from, nor a sign of which row that was.
  await page.goBack();
  await ready(page);
  await expect(preview(page)).toBeVisible();
  await expect(shownIn(page)).toHaveText(skill.name);
  await expect(row).toHaveClass(/previewed/);
  // Once all of it is in again: its prose and the start of its SKILL.md come after the page.
  const back = async () => Math.abs((await readTo(page)) - read);
  await expect.poll(back).toBeLessThan(2);
  // As a reload does.
  await page.reload();
  await ready(page);
  await expect(shownIn(page)).toHaveText(skill.name);
  await expect.poll(back).toBeLessThan(2);
  // Closed, it stays closed: once the list has noted so, a moment later.
  await page.keyboard.press("Escape");
  await expect(preview(page)).toBeHidden();
  await page.waitForFunction(() => history.state?.at && !history.state.preview);
  await page.reload();
  await ready(page);
  await expect(preview(page)).toBeHidden();
  // And one opened without leaving the page is there after a reload too.
  await wordsOf(row).click();
  await page.waitForFunction(() => history.state?.preview);
  await page.reload();
  await ready(page);
  await expect(shownIn(page)).toHaveText(skill.name);
});

for (const [what, url] of [
  ["a list", SEVERAL],
  ["a search's list, which is rendered again", `/?q=${encodeURIComponent(skill.name)}`],
] as const)
  test(`the TLDRs' prose, arriving, doesn't move what's being read in a preview of ${what}`, async ({
    page,
  }) => {
    // Held back until `arrive` is called, as in the test of the search's list above.
    let arrive = () => {};
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    await page.route("**/*", async (route) => {
      const running = () => page.evaluate(() => history.scrollRestoration === "manual");
      if (route.request().resourceType() === "script" && (await running().catch(() => false)))
        await arrived;
      await route.continue();
    });
    await open(page, url);
    // A skill with prose of its own, and a SKILL.md under it: the first of the list's.
    const listed = await list(page)
      .rows.locator(".skill-name")
      .evaluateAll((names) => names.map((name) => name.getAttribute("href") ?? ""));
    const withProse = listed.find((href) => PROSE_AND_MD.has(href));
    if (!withProse) throw new Error("no skill of the list has a TLDR's prose and a SKILL.md");
    await wordsOf(rowOf(page, withProse)).click();
    const md = preview(page).locator("[data-skill-md]");
    await expect(md.locator(".markdown")).toBeVisible();
    await expect(preview(page).getByRole("heading", { name: "TL;DR" })).toHaveCount(0);
    await md.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const before = (await md.boundingBox())?.y ?? Number.NaN;
    const read = await readTo(page);
    expect(read).toBeGreaterThan(0);

    // The prose came in above it, and pushed the lines being read a screen down.
    arrive();
    await searchable(page);
    await expect(preview(page).getByRole("heading", { name: "TL;DR" })).toHaveCount(1);
    expect(await readTo(page)).toBeGreaterThan(read);
    expect(Math.abs(((await md.boundingBox())?.y ?? Number.NaN) - before)).toBeLessThan(2);
  });

test("a bundle's preview says how to install it, and which of its skills work alone", async ({
  page,
}) => {
  await open(page, "/?show=bundles");
  await wordsOf(rowOf(page, bundleUrl)).click();
  await expect(shownIn(page)).toContainText(bundle.agentReview.name);
  // Its first command, with what it's for: the sheet had none, and its page up to ten.
  const [first, ...others] = bundle.agentReview.install;
  const get = preview(page).locator("[data-get]");
  await expect(get.locator(".install-label")).toHaveText(first.label);
  await get.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first.command);
  const more = get.getByRole("link", { name: /other ways? to install it/ });
  if (others.length) {
    await expect(more).toHaveText(
      `${others.length} other way${others.length === 1 ? "" : "s"} to install it`,
    );
    await expect(more).toHaveAttribute("href", bundleUrl);
  } else await expect(more).toHaveCount(0);
  // As its page says of its skills.
  const alone = bundle.agentReview.skills.filter((m) => m.standalone).length;
  await expect(preview(page).locator(".preview-part", { hasText: "Its skills" })).toContainText(
    alone === bundle.agentReview.skills.length
      ? "Each also works alone."
      : alone === 0
        ? "None works alone"
        : "Some need the rest of it.",
  );
  // And it's saved from there, and leads to its repo, as its row does.
  await expect(preview(page).locator(".preview-head [data-save]")).toHaveAccessibleName(
    `Save ${bundle.agentReview.name}`,
  );
  await expect(preview(page).locator(".preview-head .repo-link")).toHaveAttribute(
    "href",
    new RegExp(`^/${bundleUrl.split("/")[2]}`, "i"),
  );
});

test("the preview of a skill that only works inside its bundle installs the bundle, and says why", async ({
  page,
}) => {
  const { skill: member, url, bundle: of } = onlyInBundle;
  const why = of.agentReview.skills.find((m) => m.id === member.id)?.note ?? "";
  await open(page, `/?show=skills&q=${encodeURIComponent(member.name)}`);
  await searchable(page);
  await wordsOf(rowOf(page, url)).click();
  await expect(shownIn(page)).toHaveText(member.name);
  // Where it sits in its bundle, as on its page.
  await expect(preview(page).locator(".in-bundle")).toContainText(
    `in the ${of.agentReview.name} bundle`,
  );
  // The sheet said "install <the bundle> instead", without the reason, and without a command.
  const only = preview(page).locator("[data-only]");
  await expect(only).toContainText("Only works inside its bundle:");
  await expect(only).toContainText(why);
  const get = preview(page).locator("[data-get]");
  await expect(get.locator(".install-label")).toContainText(
    `Installs ${of.agentReview.name}, the bundle it works in.`,
  );
  await get.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    of.agentReview.install[0].command,
  );
});

/** The skill's page, as the preview fetches it, with `blocks` for its SKILL.md. */
const withSkillMd = (page: Page, blocks: string) =>
  page.route(`**${skillUrl}`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<section class="skill-md"><p class="muted">From its repo.</p><div class="markdown">${blocks}</div></section>`,
    }),
  );

test("the start of a SKILL.md, in a preview, reads as a start", async ({ page }) => {
  const start = preview(page).locator("[data-skill-md] .markdown");
  const more = preview(page).getByRole("link", { name: "Read it all on its page" });
  const openIt = async (blocks: string) => {
    await page.unrouteAll();
    await withSkillMd(page, blocks);
    // As a new page: the same one again would come back with the preview it was left with.
    await page.goto("about:blank");
    await open(page, `/?q=${encodeURIComponent(skill.name)}`);
    await searchable(page);
    await wordsOf(list(page).rows.first()).click();
    await expect(start).toBeVisible();
  };

  // Its fifth block, where it's cut, announces what follows: 80 starts ended on "Use it when:".
  await openIt(
    `<h3>Its title</h3><p>One.</p><p>Two.</p><p>Three.</p><p>Use it when:</p><ul><li>asked</li></ul><p>Later.</p>`,
  );
  await expect(start.locator("> *")).toHaveText([
    "Its title",
    "One.",
    "Two.",
    "Three.",
    "Use it when:",
    "asked",
  ]);
  await expect(more).toHaveCount(1);
  // Its headings are a level down, under the sheet's own "SKILL.md".
  await expect(start.locator("h4")).toHaveText("Its title");

  // With nothing after it to announce, nor a rule to end on.
  await openIt(`<p>One.</p><p>Two.</p><hr><p>Use it when:</p><h3>Cut</h3><p>Later.</p>`);
  await expect(start.locator("> *")).toHaveText(["One.", "Two."]);

  // A code block of a hundred lines is one block, and so is a table of forty rows: a start ran to
  // four screens.
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
  const rows = Array.from({ length: 40 }, (_, i) => `<tr><td>row ${i + 1}</td><td>x</td></tr>`);
  await openIt(
    `<p>One.</p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows.join("")}</tbody></table><pre><code>${lines}\n</code></pre>`,
  );
  const code = (await start.locator("pre").innerText()).split("\n");
  expect(code).toHaveLength(17);
  expect(code.at(-1)).toBe("…");
  await expect(start.locator("tbody tr")).toHaveCount(9);
  await expect(start.locator("tbody tr").last()).toHaveText("…");
  await expect(more).toHaveCount(1);

  // The whole of it, when it's three lines: nothing more to read on its page.
  await openIt(`<p>One.</p><p>Two.</p>`);
  await expect(start.locator("> *")).toHaveText(["One.", "Two."]);
  await expect(more).toHaveCount(0);

  // What scrolls sideways in it, a line of code wider than the sheet, is a stop for the keyboard,
  // as on the skill's page.
  await openIt(`<p>One.</p><pre><code>${"a long line of code ".repeat(20)}</code></pre>`);
  await expect(start.locator("pre")).toHaveAttribute("tabindex", "0");
});

/** The cursor over a row, as the browser has it, such as "e-resize". */
const cursorOf = (row: import("@playwright/test").Locator) =>
  row.evaluate((el) => getComputedStyle(el).cursor);

test("the pointer says whether a click on a row opens its preview or closes it", async ({
  page,
}) => {
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}`);
  const row = list(page).rows.first();
  // An arrow away from the left edge, where the preview opens, then back to it.
  await expect.poll(() => cursorOf(row)).toBe("e-resize");
  await wordsOf(row).click();
  await expect(preview(page)).toBeVisible();
  await expect.poll(() => cursorOf(row)).toBe("w-resize");
  // On that row alone: a click on another one, which the pointer can be over once the list has
  // scrolled, opens that one's.
  await expect.poll(() => cursorOf(list(page).rows.nth(1))).toBe("e-resize");
  // Windows shows both as its ↔: there, images of the arrows.
  await page.evaluate(() => document.documentElement.setAttribute("data-windows", ""));
  await expect.poll(() => cursorOf(row)).toMatch(/^url\(.*\) 16 16, w-resize$/);
  await page.keyboard.press("Escape");
  await expect.poll(() => cursorOf(row)).toMatch(/^url\(.*\) 16 16, e-resize$/);
});

test("a repo's rows open their pages", async ({ page }) => {
  await open(page, smallRepo.url);
  const row = page.locator(".skill-list > li").first();
  const href = await row.locator(".skill-name").getAttribute("href");
  await expect(row.locator(".details")).toBeHidden();
  // The hand, as for a link.
  await expect.poll(() => cursorOf(row)).toBe("pointer");
  await wordsOf(row).click();
  await expect(page).toHaveURL(href as string);
});

test.describe("in a window 1,100px wide, too narrow for the preview", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("a click on a row opens its page", async ({ page }) => {
    await open(page, `/?q=${encodeURIComponent(skill.name)}`);
    const row = list(page).rows.first();
    await expect(row.locator(".skill-name")).toHaveText(skill.name);
    await expect(row.locator(".details")).toBeHidden();
    await expect.poll(() => cursorOf(row)).toBe("pointer");
    await wordsOf(row).click();
    await expect(page).toHaveURL(skillUrl);
  });
});
