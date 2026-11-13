/** The skills list: its search, its settings and its tags, which all live in the URL. */

import type { Page, Route } from "@playwright/test";
import { data, listedRows, longTag, meaningTag, repo, skill } from "./data.ts";
import {
  expect,
  fromCompact,
  list,
  n,
  open,
  ready,
  searchable,
  settled,
  test,
} from "./fixtures.ts";

const all = `${n(data.skills.length)} skills`;

/** A name with an accent on its first vowel, as someone may type it: "résumé" for "resume". */
const accented = (name: string) =>
  name.replace(/[aeiou]/, (vowel) => "áéíóú"["aeiou".indexOf(vowel)]);

test("opens on Rising, with every skill counted and every row in", async ({ page }) => {
  await open(page, "/");
  const { count, rows } = list(page);
  await expect(count).toHaveText(all);
  await expect(rows).toHaveCount(listedRows);
  await expect(page.locator('[data-preset="rising"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sort")).toContainText("Weekly Growth");
  // The growth's tooltip ends in its place, after one full stop.
  await expect(rows.first().locator(".props > .on")).toHaveAttribute(
    "title",
    /shows under Rising & new\. #1 of [\d,]+ skills$/,
  );
});

test("the search narrows the list as you type, best match first", async ({ page }) => {
  await open(page, "/");
  await searchable(page);
  const { count, rows, search } = list(page);
  await search.fill(skill.name);
  await settled(page);
  await expect(page).toHaveURL(`/?q=${encodeURIComponent(skill.name)}`);
  await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  await expect(page.locator("#sort")).toContainText("Best match");
  await expect(count).not.toHaveText(all);
  // What the list shows is what the lines under the boxes count.
  const found = (await count.innerText()).split(" ")[0];
  await expect(page.locator("#search-note")).toContainText(`Filters ${found} skill`);

  // In quotes, as for an exact phrase elsewhere, or with an accent it doesn't have: the same skill.
  for (const written of [`"${skill.name}"`, `\u201c${skill.name}\u201d`, accented(skill.name)]) {
    await search.fill(written);
    await settled(page);
    await expect(rows.first().locator(".skill-name"), written).toHaveText(skill.name);
    await expect(count, written).toHaveText(`${found} ${found === "1" ? "skill" : "skills"}`);
  }
  // A space after it, as while the next word is typed, stays in the box and out of the link.
  await search.fill(`${skill.name} `);
  await settled(page);
  await expect(page).toHaveURL(`/?q=${encodeURIComponent(skill.name)}`);
  await expect(search).toHaveValue(`${skill.name} `);

  await search.fill("");
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
  await expect(page.locator("#sort")).toContainText("Weekly Growth");

  // Spaces alone aren't a search: the list keeps its order.
  await search.fill("  ");
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(page.locator("#sort")).toContainText("Weekly Growth");
});

test("a search that finds nothing says so, and offers the agent", async ({ page }) => {
  await open(page, "/");
  const { count, empty, search } = list(page);
  await search.fill("zzzqqqxxx");
  await settled(page);
  await expect(count).toHaveText("0 skills");
  await expect(empty).toContainText("No skill or bundle matches “zzzqqqxxx”");
  // The tags' column says as much, once: it had every facet under it, each with "None".
  await expect(page.locator("#tag-facets")).toHaveText("No tag matches “zzzqqqxxx”.");
  await expect(page.locator("#facets .facet")).toHaveCount(0);

  // The agent gets the search as the need, and the skills it would have looked through.
  await expect(page.locator("#ask-label")).toContainText(`of all ${n(data.skills.length)} skills.`);
  await empty.locator('[data-action="ask"]').click();
  await expect(page.locator("#ask-label")).toContainText("copied to your clipboard");
  // The link says so too: on a phone, the line under the agent's box is a screen above it.
  await expect(empty.locator('[data-action="ask"]')).toHaveText(
    "Prompt copied: paste it into your agent",
  );
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`# Catalog (${listedRows} entries)`);
  expect(prompt.trimEnd().endsWith("zzzqqqxxx")).toBe(true);

  // A search without a space, such as a pasted link, is one long word: what the tags' box says of
  // it wraps inside the box, as what the list says of it does.
  await search.fill("https://github.com/anthropics/skills/tree/main/skills/zzzqqqxxx");
  await settled(page);
  const right = (selector: string) =>
    page.locator(selector).evaluate((el) => el.getBoundingClientRect().right);
  expect(await right("#found-tags .muted")).toBeLessThanOrEqual(await right("#found-tags"));
  expect(await right("#results .empty")).toBeLessThanOrEqual(await right("#results"));
});

test("filters that leave nothing say so, and leave the agent nothing to copy", async ({ page }) => {
  // No skill has it: a tag from an old link, say. The same as a slider's range with nothing in it.
  await open(page, "/?tag=no-such-tag&q=design");
  const { count, empty, rows } = list(page);
  const label = page.locator("#ask-label");
  await expect(count).toHaveText("0 skills");
  await expect(empty).toContainText("No skill or bundle matches the filters.");
  // It's the filters that find nothing, not the search: no "among the 0 skills", and no agent to
  // offer a prompt that would hold no skill.
  await expect(empty).not.toContainText("among");
  await expect(empty.locator('[data-action="ask"]')).toHaveCount(0);
  await expect(label).toHaveText("The list below is empty: there's nothing to copy.");
  // The tags a filter keeps listed, such as the one that's picked, aren't "of the 0 skills".
  await expect(page.locator(".tags-of")).toHaveText(/^[\d,]+ tags?$/);

  await page.evaluate(() => navigator.clipboard.writeText("as it was"));
  await page.locator(".ask-button").click();
  await expect(label).toHaveText("Nothing copied: the list below is empty.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("as it was");

  // The way out: without the filters, the search finds its skills.
  await empty.locator('[data-action="clear"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?q=design");
  await expect(rows).not.toHaveCount(0);
  // And the line under the agent's box is about them at once: what it said for a moment, that the
  // list is empty, goes with the empty list, not five seconds later.
  await expect(label).toContainText("Copies a prompt of", { timeout: 1000 });
});

test("the page's title says what the list is narrowed to", async ({ page }) => {
  await open(page, "/");
  await searchable(page);
  // Every list had the site's own title: a tab, a bookmark or the history couldn't tell two apart.
  const site = await page.title();
  const { scope, search } = list(page);
  await search.fill("design");
  await settled(page);
  await expect(page).toHaveTitle("“design” · SkillHub");

  // Then the filters, as their chips say them.
  const chip = page.locator("#skill-tags .chip").first();
  await chip.click();
  await settled(page);
  const tag = (await scope.locator('[data-remove="tag"]').getAttribute("data-value")) as string;
  await expect(page).toHaveTitle(`“design”, ${tag} · SkillHub`);
  await page.locator('[data-show="bundles"]').click();
  await settled(page);
  await expect(page).toHaveTitle(`“design”, ${tag} · SkillHub`);

  // A link to a list opens under the list's title, and the whole list has the site's again.
  await open(page, "/?tag=type%3Aworkflow&saved");
  await expect(page).toHaveTitle("Saved, type:workflow · SkillHub");
  await scope.locator('[data-action="clear"]').click();
  await settled(page);
  await expect(page).toHaveTitle(site);
});

test("a link with what the list doesn't have opens on what it has", async ({ page }) => {
  // A sort that isn't one, though every object has something by that name; a tag without a name,
  // and one twice; an age that starts where its slider ends.
  await open(
    page,
    "/?sort=constructor&tag=&tag=type%3Aworkflow&tag=type%3Aworkflow&published=~..&show=bundles",
  );
  const { rows, scope } = list(page);
  await expect(page.locator("#sort")).toContainText("Weekly Growth");
  await expect(scope.locator("[data-remove]")).toHaveCount(1);
  await expect(scope.locator('[data-remove="tag"]')).toHaveText(/^type:workflow/);
  await expect(page.locator('[data-range-label="published"]').first()).toHaveText("Any");
  await expect(rows).not.toHaveCount(0);
});

test("oversized number filters in a link leave the list usable", async ({ page }) => {
  await open(page, "/?published=1000000000d..&stars=9007199254740992..&show=bundles");
  await expect(list(page).rows).toHaveCount(data.bundles.length);
  await expect(list(page).scope.locator("[data-remove]")).toHaveCount(0);
  await expect(page.locator('[data-range-label="published"]').first()).toHaveText("Any");
  await expect(page.locator('[data-range-label="stars"]').first()).toHaveText("Any");
});

test("an age with a thousands separator keeps its whole amount", async ({ page }) => {
  await open(page, "/?show=bundles");
  await page.locator('.range-pill[data-value="published"]').click();
  const newer = page.locator("#range-pop-published").getByLabel("Newer than");
  for (const amount of ["1,000d", "1,000"]) {
    await newer.fill(amount);
    await settled(page);
    await expect(page).toHaveURL("/?published=1000d..&show=bundles");
    await expect(page.locator('[data-range-label="published"]').first()).toHaveText("≤ 1,000 days");
  }
  // Commas between units still separate parts of an age.
  await newer.fill("1w, 2d");
  await settled(page);
  await expect(page).toHaveURL("/?published=9d..&show=bundles");
});

test("oversized typed amounts explain the error and keep the previous range", async ({ page }) => {
  await open(page, "/?published=30d..&stars=100..&show=bundles");
  const before = await list(page).count.textContent();
  for (const [prop, label, invalid] of [
    ["published", "Newer than", "1000000000d"],
    ["stars", "At least", "9007199254740992"],
  ]) {
    await page.locator(`.range-pill[data-value="${prop}"]`).click();
    const pop = page.locator(`#range-pop-${prop}`);
    await pop.getByLabel(label).fill(invalid);
    await expect(pop.getByLabel(label)).toHaveAttribute("aria-invalid", "true");
    await expect(pop.locator(".range-error")).toBeVisible();
    await expect(page).toHaveURL("/?published=30d..&stars=100..&show=bundles");
    await expect(list(page).count).toHaveText(before as string);
    await page.keyboard.press("Escape");
  }
});

test("the presets set the sort, the Age range and the Weekly Downloads range", async ({ page }) => {
  await open(page, "/");
  const preset = (id: string) => page.locator(`[data-preset="${id}"]`);

  // Top is the most downloaded of those with 1K weekly downloads or more: without them, it was every
  // skill, those hardly downloaded too.
  await preset("top").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=week&week=1000..");
  await expect(preset("top")).toHaveAttribute("aria-pressed", "true");
  await expect(preset("rising")).toHaveAttribute("aria-pressed", "false");
  await expect(preset("top")).toHaveAttribute(
    "title",
    /of those with at least 1K weekly downloads$/,
  );
  await expect(page.locator('[data-range-label="week"]').first()).toHaveText("≥ 1K");
  const weeks = (await list(page).sortedValues.allTextContents()).map(fromCompact);
  expect(weeks.length).toBeGreaterThan(0);
  expect(weeks.length).toBeLessThan(listedRows);
  expect(weeks).toEqual(weeks.toSorted((a, b) => b - a));
  expect(weeks.at(-1)).toBeGreaterThanOrEqual(1000);

  await preset("rising-new").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=week&published=90d..");
  await expect(page.locator('[data-range-label="published"]').first()).toHaveText("≤ 3 months");
  await expect(list(page).scope).toContainText("Age: ≤ 3 months");
  await expect(preset("rising-new")).toHaveAttribute("title", /published in the last 3 months$/);

  // New is the newest of the last month: without an age, it was every skill, the oldest too.
  await preset("new").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=published&published=30d..");
  await expect(preset("new")).toHaveAttribute("aria-pressed", "true");
  await expect(preset("new")).toHaveAttribute("title", /published in the last month$/);
  await expect(page.locator('[data-range-label="published"]').first()).toHaveText("≤ 1 month");
  await expect(list(page).scope).toContainText("Age: ≤ 1 month");
  // A month at most is so many days or weeks, as a row says its age: the youngest first.
  const ages = await list(page).sortedValues.allTextContents();
  for (const age of ages) expect(age).toMatch(/^\d+ (day|week)s?$/);
  const days = ages.map((age) => Number.parseInt(age) * (age.includes("week") ? 7 : 1));
  expect(days).toEqual(days.toSorted((a, b) => a - b));

  await preset("rising").click();
  await settled(page);
  await expect(page).toHaveURL("/");
});

test("Rising & new keeps the settings on one line, and the list where it is", async ({ page }) => {
  await open(page, "/");
  const top = async (selector: string) => (await page.locator(selector).boundingBox())?.y;
  const list = await top("#results");

  await page.locator('[data-preset="rising-new"]').click();
  await settled(page);
  // Age shows its range in place of its name, which leaves Show room on the line.
  const pill = page.locator('.range-pill[data-value="published"]');
  await expect(pill.locator(".range-value")).toHaveText("≤ 3 months");
  await expect(pill.locator(".range-word")).not.toBeInViewport();
  await expect(pill).toHaveAccessibleName("Age ≤ 3 months");
  expect(await top(".show-group")).toBe(await top(".preset-group"));
  expect(await top("#results")).toBe(list);
});

/*
 * Where the settings' line holds Show: on a 1,280px screen with Rising, the list's default, and on
 * a 1,366px one with every preset. Show's thumbs, beside the Saved switch, took the room a 1,280px
 * screen had for Rising & new and Top: see .settings-line in style.css.
 */
for (const [width, presets] of [
  [1280, []],
  [1366, ["rising-new", "top", "new"]],
] as const)
  test.describe(`on a laptop's screen, ${width.toLocaleString("en")}px wide`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`the settings are on one line, with ${["Rising", ...presets].join(", ")}`, async ({
      page,
    }) => {
      const top = async (selector: string) => (await page.locator(selector).boundingBox())?.y;
      await open(page, "/");
      // Show's first button is the one word, Both: at its full length, Show was on a second line.
      await expect(page.locator('[data-show="all"]')).toHaveText("Both");
      await expect(page.locator('[data-show="all"]')).toHaveAccessibleName(
        "Both: skills and bundles",
      );
      expect(await top(".show-group")).toBe(await top(".preset-group"));
      // Show's thumbs are beside the Saved switch.
      expect(await top("#thumbs-filter")).toBe(await top("#saved-switch"));

      for (const id of presets) {
        await page.locator(`[data-preset="${id}"]`).click();
        await settled(page);
        expect(await top(".show-group"), id).toBe(await top(".preset-group"));
      }
    });
  });

test.describe("on a tablet, 768px wide", () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test("the agent's button is beside its box, as on a wide screen", async ({ page }) => {
    await open(page, "/?show=bundles");
    const middle = async (selector: string) => {
      const box = (await page.locator(selector).boundingBox()) as { y: number; height: number };
      return box.y + box.height / 2;
    };
    expect(Math.abs((await middle(".ask-button")) - (await middle("#need")))).toBeLessThan(2);
  });

  test("the keyboard's link past the open tags shows over them, not at the page's top", async ({
    page,
  }) => {
    await open(page, "/?show=bundles");
    const toggle = page.locator(".tags-toggle");
    await toggle.click();
    // It comes right before the tags' count, which opened them.
    await toggle.focus();
    await page.keyboard.press("Shift+Tab");
    const skip = page.locator(".skip-tags");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport({ ratio: 1 });
    const [link, tags] = [await skip.boundingBox(), await page.locator("#filters").boundingBox()];
    if (!link || !tags) throw new Error("the tags aren't laid out");
    expect(link.y).toBeGreaterThanOrEqual(tags.y);
    expect(link.y + link.height).toBeLessThan(tags.y + 60);
    // And leads to the list.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#results$/);
  });

  test("Escape closes the open tags, from among them", async ({ page }) => {
    await open(page, "/?show=bundles");
    const toggle = page.locator(".tags-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#tag-facets")).toBeVisible();
    // Into the tags: the only other way out was through them all, to the button under them.
    await page.keyboard.press("Tab");
    await expect(page.locator("#skill-tags .chip").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#tag-facets")).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

test("the Sort by menu works with the mouse and with the keyboard", async ({ page }) => {
  await open(page, "/");
  const button = page.locator("#sort");
  const options = page.locator("#sort-options");

  await button.click();
  await expect(options).toBeVisible();
  await options.locator('[data-sort="stars"]').click();
  await settled(page);
  await expect(options).toBeHidden();
  await expect(page).toHaveURL("/?sort=stars");
  await expect(button).toContainText("Stars");

  await page.locator('[data-order="asc"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=stars&order=asc");
  const stars = (await list(page).sortedValues.allTextContents()).slice(0, 30).map(fromCompact);
  expect(stars).toEqual(stars.toSorted((a, b) => a - b));

  // Arrow keys open it on the current sort and move among the options; Escape hands the focus back.
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.locator('[data-sort="stars"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(options.locator('[role="option"]').first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(button).toBeFocused();

  // Enter picks: the last option is Weekly Growth, the default, so the URL drops the sort.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(page).toHaveURL("/?order=asc");
  await expect(button).toBeFocused();
});

test("a number filter narrows the list from its popover", async ({ page }) => {
  await open(page, "/");
  const { count, scope } = list(page);
  const pill = page.locator('.range-pill[data-value="stars"]');
  const pop = page.locator("#range-pop-stars");

  await pill.click();
  await expect(pop).toBeVisible();
  await expect(pill).toHaveAttribute("aria-expanded", "true");
  await pop.locator('input[data-end="0"]').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await settled(page);
  await expect(page).toHaveURL(/\/\?stars=\d+\.\.$/);
  const label = await page.locator('[data-range-label="stars"]').first().innerText();
  expect(label).toMatch(/^≥ /);
  await expect(scope).toContainText(`Stars: ${label}`);
  expect(Number.parseInt((await count.innerText()).replace(/,/g, ""))).toBeLessThan(
    data.skills.length,
  );

  // Escape closes the popover and hands the focus back to its pill.
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(pill).toBeFocused();
  // So does a click elsewhere.
  await pill.click();
  await expect(pop).toBeVisible();
  await page.locator("h1").click();
  await expect(pop).toBeHidden();
  // And so does the keyboard on its way out: past its two handles and its two fields, to the next
  // filter.
  await pill.focus();
  await page.keyboard.press("Enter");
  await expect(pop).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(pop.locator('input[data-end="1"]')).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(pop.getByLabel("Under")).toBeFocused();
  await expect(pop).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator('.range-pill[data-value="downloads"]')).toBeFocused();
  await expect(pop).toBeHidden();

  await scope.locator('[data-remove="range"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
});

test("a number filter's slider stays where it is while it narrows the list", async ({ page }) => {
  await open(page, "/");
  const pill = page.locator('.range-pill[data-value="stars"]');
  const left = async () => Math.round((await pill.boundingBox())?.x ?? Number.NaN);
  await pill.click();
  const before = await left();
  await page.locator('#range-pop-stars input[data-end="0"]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await settled(page);
  // Its pill got longer, for its range, and Rising isn't pressed anymore: neither moved it.
  await expect(pill).toContainText("≥");
  await expect(page.locator('[data-preset="rising"]')).toHaveAttribute("aria-pressed", "false");
  expect(await left()).toBe(before);
});

test("a number filter's slider stays open while a finger drags its handle", async ({ page }) => {
  await open(page, "/?show=bundles");
  const { count } = list(page);
  const all = await count.innerText();
  // Not the first filter's: the focus was handed to the first pill there is.
  for (const filter of ["stars", "week"]) {
    const pill = page.locator(`.range-pill[data-value="${filter}"]`);
    const pop = page.locator(`#range-pop-${filter}`);
    await pill.click();
    await expect(pop).toBeVisible();
    // A finger on a handle moves it without giving it the focus, which stays on the pill it tapped.
    await pop.locator('input[data-end="0"]').evaluate((handle: HTMLInputElement) => {
      handle.value = "12";
      handle.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settled(page);
    await expect(count).not.toHaveText(all);
    await expect(pop).toBeVisible();
    await expect(pill).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await page.locator(`#scope [data-remove="range"]`).click();
    await settled(page);
  }
});

test("a click on a number filter's track moves the nearer handle there", async ({ page }) => {
  await open(page, "/?show=bundles");
  await page.locator('.range-pill[data-value="stars"]').click();
  const pop = page.locator("#range-pop-stars");
  const track = (await page.locator('[data-slider="stars"]').boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const click = (along: number) =>
    page.mouse.click(track.x + track.width * along, track.y + track.height / 2);

  // A third of the way along is nearer the low handle, at the track's start.
  await click(1 / 3);
  await settled(page);
  await expect(page).toHaveURL(/\/\?stars=\d+\.\.&show=bundles$/);
  await expect(pop.locator('input[data-end="0"]')).toBeFocused();
  // Most of the way along is nearer the high one, at its end.
  await click(5 / 6);
  await settled(page);
  await expect(page).toHaveURL(/\/\?stars=\d+\.\.\d+&show=bundles$/);
  await expect(pop.locator('input[data-end="1"]')).toBeFocused();
  await expect(pop).toBeVisible();

  // A handle dragged against the other, and let go beyond it, leaves the other where it is.
  const [low, high] = await pop
    .locator("input")
    .evaluateAll((handles) => handles.map((handle) => Number((handle as HTMLInputElement).value)));
  const last = Number(await pop.locator('input[data-end="1"]').getAttribute("max"));
  // A stop's place on the track, which is inset by half a handle, 8px, at either end.
  const at = (stop: number) => track.x + 8 + (stop / last) * (track.width - 16);
  await page.mouse.move(at(low), track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(at(last), track.y + track.height / 2, { steps: 10 });
  await page.mouse.up();
  await settled(page);
  await expect(pop.locator('input[data-end="0"]')).toHaveValue(String(high - 1));
  await expect(pop.locator('input[data-end="1"]')).toHaveValue(String(high));
});

test("a number filter's handles stop at every whole month, week and day of an age, and every tens of a count", async ({
  page,
}) => {
  await open(page, "/?show=bundles");
  const steps = async (p: string, labels: string[]) => {
    await page.locator(`.range-pill[data-value="${p}"]`).click();
    await page.locator(`#range-pop-${p} input[data-end="0"]`).focus();
    for (const label of labels) {
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(`[data-range-label="${p}"]`).first()).toHaveText(label);
    }
    await page.keyboard.press("Escape");
  };
  // Not 4 weeks, 2 days off a month.
  await steps("published", [
    "≤ 1 year",
    "≤ 3 months",
    "≤ 2 months",
    "≤ 1 month",
    "≤ 3 weeks",
    "≤ 2 weeks",
    "≤ 1 week",
    "≤ 6 days",
  ]);
  await steps("stars", ["≥ 10", "≥ 20", "≥ 30", "≥ 40"]);
  await settled(page);
  await expect(page).toHaveURL("/?published=6d..&stars=40..&show=bundles");
});

test("a number filter takes any amount, typed in its fields", async ({ page }) => {
  await open(page, "/?sort=published");
  const pop = page.locator("#range-pop-published");
  const newer = pop.getByLabel("Newer than");
  const older = pop.getByLabel("Older than");
  const error = pop.locator(".range-error");
  const label = page.locator('[data-range-label="published"]').first();
  await page.locator('.range-pill[data-value="published"]').click();

  // Between two stops, 2 months and 1 month: its handle halfway between theirs.
  await newer.fill("45");
  await settled(page);
  await expect(page).toHaveURL("/?sort=published&published=45d..");
  await expect(label).toHaveText("≤ 45 days");
  await expect(pop.locator('input[data-end="0"]')).toHaveValue("3.5");

  // m is a month, as under the histogram: not mo.
  await expect(pop.locator(".histogram-axis")).toContainText("3m");
  await newer.fill("2m");
  await settled(page);
  await expect(page).toHaveURL("/?sort=published&published=60d..");
  await expect(label).toHaveText("≤ 2 months");
  await newer.fill("2mo");
  await expect(error).toHaveText("Type an age, such as 45d, 3w or 2w 3d.");
  await expect(page).toHaveURL("/?sort=published&published=60d..");

  // In weeks and days, as a row says its age: none of them over it.
  await newer.fill("2w 3d");
  await settled(page);
  await expect(page).toHaveURL("/?sort=published&published=17d..");
  await expect(label).toHaveText("≤ 17 days");
  for (const age of await list(page).sortedValues.allTextContents())
    expect(Number.parseInt(age) * (age.includes("week") ? 7 : 1), age).toBeLessThanOrEqual(17);
  // Once left, the field says it in short, as it would a stop: 17d.
  await newer.press("Tab");
  await expect(newer).toHaveValue("17d");

  // What isn't an age, or isn't under Newer than, is said, and leaves the list as it was.
  await older.fill("soon");
  await expect(error).toHaveText("Type an age, such as 45d, 3w or 2w 3d.");
  await expect(older).toHaveAttribute("aria-invalid", "true");
  await older.fill("3w");
  await expect(error).toHaveText("“Older than” has to be less than “Newer than”.");
  await older.fill("1w");
  await settled(page);
  await expect(error).toBeHidden();
  await expect(page).toHaveURL("/?sort=published&published=17d..7d");
  await expect(label).toHaveText("1 week – 17 days");

  // A count, as the rows say it: the least of the list is at least that.
  await open(page, "/?sort=stars&order=asc&show=skills");
  const stars = page.locator("#range-pop-stars");
  await page.locator('.range-pill[data-value="stars"]').click();
  await stars.getByLabel("At least").fill("1.5K");
  await settled(page);
  await expect(page).toHaveURL("/?sort=stars&order=asc&stars=1500..&show=skills");
  await expect(page.locator('[data-range-label="stars"]').first()).toHaveText("≥ 1.5K");
  expect(fromCompact(await list(page).sortedValues.first().innerText())).toBeGreaterThanOrEqual(
    1500,
  );
  // What isn't over At least, or over nothing, is said in the fields' own words.
  const starsError = stars.locator(".range-error");
  await stars.getByLabel("Under").fill("1K");
  await expect(starsError).toHaveText("“Under” has to be more than “At least”.");
  await stars.getByLabel("At least").fill("");
  await settled(page);
  await stars.getByLabel("Under").fill("0");
  await expect(starsError).toHaveText("“Under” has to be more than 0.");
  await expect(page).toHaveURL("/?sort=stars&order=asc&show=skills");

  // A link with any amount: its field says it, every digit where 1.2K wouldn't be all of it.
  await open(page, "/?stars=1234..");
  await expect(page.locator('[data-range-label="stars"]').first()).toHaveText("≥ 1,234");
  await expect(page.locator("#range-stars-0")).toHaveValue("1,234");
});

test.describe("in a window 1,100px wide, where Show is on a line of its own", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("the last filter's popover stays inside the window", async ({ page }) => {
    // Every filter narrowed: its pill is longer with its range, and the last one further right.
    await open(
      page,
      "/?show=bundles&published=90d..&stars=1000..50000&downloads=1000..100000&week=100..5000",
    );
    await page.locator('.range-pill[data-value="week"]').click();
    const pop = page.locator("#range-pop-week");
    await expect(pop).toBeInViewport({ ratio: 1 });
    // Sticking out of the window's right edge, it scrolled the page sideways.
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollX,
      ]),
    ).toEqual([0, 0]);
  });
});

test("Best match has no order: another sort's doesn't come back once the search ends", async ({
  page,
}) => {
  await open(page, "/?sort=published&order=asc&show=bundles");
  const { search } = list(page);
  await search.fill("design");
  await settled(page);
  await page.locator("#sort").click();
  await page.locator('#sort-options [data-sort="match"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?q=design&show=bundles");
  // The list is back on Rising, highest first: it was "Weekly Growth, lowest first", from Age's
  // oldest first, which stayed, unseen, while the search was sorted by best match.
  await search.fill("");
  await settled(page);
  await expect(page).toHaveURL("/?show=bundles");
  await expect(page.locator('[data-order="desc"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-preset="rising"]')).toHaveAttribute("aria-pressed", "true");
});

test("the Sort by button fits each sort's name, at one width", async ({ page }) => {
  await open(page, "/?show=bundles");
  const button = page.locator("#sort");
  const width = async () => (await button.boundingBox())?.width;
  const first = await width();
  for (const sort of ["published", "stars", "downloads", "week"]) {
    await button.click();
    await page.locator(`#sort-options [data-sort="${sort}"]`).click();
    await settled(page);
    expect(await button.evaluate((b) => b.scrollWidth <= b.clientWidth), sort).toBe(true);
    expect(await width(), sort).toBe(first);
  }
});

test("Find with your agent says so when the browser refuses the clipboard", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("refused"));
  });
  await open(page, "/?show=bundles");
  await page.locator(".ask-button").click();
  await expect(page.locator("#ask-label")).toContainText(
    "didn't let the prompt onto your clipboard",
  );
});

test("Show switches between skills, bundles and both", async ({ page }) => {
  await open(page, "/");
  const { count, rows } = list(page);

  await page.locator('[data-show="bundles"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?show=bundles");
  await expect(count).toHaveText(`${n(data.bundles.length)} bundles`);
  await expect(rows).toHaveCount(data.bundles.length);

  // Every skill on a row of its own, those only listed inside a bundle included.
  await page.locator('[data-show="skills"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?show=skills");
  await expect(count).toHaveText(all);
  await expect(rows).toHaveCount(data.skills.length);

  await page.locator('[data-show="all"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(rows).toHaveCount(listedRows);
});

test("a tag narrows the list to as many skills as it says", async ({ page }) => {
  await open(page, "/");
  const { count, rows, scope } = list(page);
  const first = page.locator("#facets .chip[data-tag]").first();
  const tag = (await first.getAttribute("data-tag")) as string;
  const chip = page.locator(`#facets .chip[data-tag="${tag}"]`);
  const says = Number(await chip.locator(".n").innerText());

  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(tag)}`);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText(`${n(says)} skills`);
  await expect(scope.locator('[data-remove="tag"]')).toHaveCount(1);

  // A row's own tag joins the filters.
  await rows.first().locator("button.tag").first().click();
  await settled(page);
  await expect(scope.locator('[data-remove="tag"]')).toHaveCount(2);

  await scope.locator('[data-action="clear"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});

test("the search finds tags too, one of which takes its place once picked", async ({ page }) => {
  await open(page, "/");
  await searchable(page);
  const { count, search } = list(page);
  const tags = page.locator("#facets .tags-count");
  const note = page.locator("#search-note");
  // Without a search, the line under its box counts the facets' tags, as their heading does.
  await expect(note).toContainText(` and ${await tags.innerText()} below.`);

  // By a word of its meaning, which its name doesn't hold.
  await search.fill(meaningTag.word);
  await settled(page);
  const chip = page.locator(`#found-tags .chip[data-tag="${meaningTag.tag}"]`);
  expect(await chip.getAttribute("title")).toContain(meaningTag.meaning);
  // The heading and the line under the box count the tags the search finds.
  const found = await page.locator("#found-tags .chip").count();
  const said = `${n(found)} ${found === 1 ? "tag" : "tags"}`;
  await expect(tags).toHaveText(said);
  await expect(note).toContainText(` and ${said} below.`);
  // The tags of the skills it finds follow, under their own count.
  await expect(page.locator(".tags-of")).toContainText(` of the ${await count.innerText()}`);

  const says = Number(await chip.locator(".n").innerText());
  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(meaningTag.tag)}`);
  await expect(search).toHaveValue("");
  await expect(count).toHaveText(`${n(says)} ${says === 1 ? "skill" : "skills"}`);
  await expect(page.locator("#found-tags")).toHaveCount(0);
  await expect(page.locator(`#skill-tags .chip[data-tag="${meaningTag.tag}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a tag the search finds, too long for a line of the tags' column, breaks after its facet", async ({
  page,
}) => {
  // The longest tag there is, found by its own name.
  await open(page, `/?q=${encodeURIComponent(longTag.slice(longTag.indexOf(":") + 1))}`);
  const chip = page.locator(`#found-tags [data-tag="${longTag}"]`);
  await expect(chip).toBeVisible();
  const laid = await chip.evaluate((el) => {
    const box = (part: string) => el.querySelector(part)?.getBoundingClientRect();
    const [name, facet, value] = [box("span") as DOMRect, box(".tag-facet"), box(".tag-value")];
    const line = Number.parseFloat(getComputedStyle(el).lineHeight);
    const lines = (height: number) => Math.round(height / line);
    return {
      lines: lines(name.height),
      valueLines: value ? lines(value.height) : null,
      valueStartsLine: value && facet ? value.left === facet.left : null,
    };
  });
  test.skip(laid.lines < 2, "no tag is too long for the tags' column today");
  // Its value whole on the next line, rather than broken at one of its hyphens.
  expect(laid).toMatchObject({ lines: 2, valueLines: 1, valueStartsLine: true });
});

test("with a search on, a tag still narrows the list to as many as it says", async ({ page }) => {
  // A common word, which finds some bundles by their own words and others by their skills': a tag
  // can then bring a bundle in through skills the search alone didn't count.
  for (const view of ["/?q=design", "/?q=design&show=bundles"]) {
    await open(page, view);
    await searchable(page);
    const chips = page.locator(
      '#skill-tags .chip[data-tag^="type:"], #skill-tags .chip[data-tag^="effect:"]',
    );
    const said = await chips.evaluateAll((all) =>
      all.map((chip) => [
        (chip as HTMLElement).dataset.tag as string,
        chip.querySelector(".n")?.textContent as string,
      ]),
    );
    expect(said.length, view).toBeGreaterThan(0);
    for (const [tag, says] of said) {
      const chip = page.locator(`#skill-tags .chip[data-tag="${tag}"]`);
      await chip.click();
      await settled(page);
      await expect(list(page).count, `${view}, ${tag}`).toHaveText(
        new RegExp(`^${n(Number(says))} (skill|bundle)s?$`),
      );
      await chip.click();
      await settled(page);
    }
  }
});

test("a link holds the whole view, and a reload shows it again", async ({ page }) => {
  await open(page, "/?q=design&tag=type%3Aworkflow&sort=stars&order=asc&stars=100..&show=skills");
  await searchable(page);
  const { count, search } = list(page);
  const shows = async () => {
    await expect(search).toHaveValue("design");
    await expect(page.locator('#skill-tags .chip[data-tag="type:workflow"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#sort")).toContainText("Stars");
    await expect(page.locator('[data-order="asc"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-range-label="stars"]').first()).toHaveText("≥ 100");
    await expect(page.locator('[data-show="skills"]')).toHaveAttribute("aria-pressed", "true");
  };
  await shows();
  const before = await count.innerText();
  expect(before).not.toBe(all);

  await page.reload();
  await ready(page);
  await searchable(page);
  await shows();
  await expect(count).toHaveText(before);
});

test("a repo's link lists that repo's skills, under its banner", async ({ page }) => {
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}&show=skills`);
  const { count, rows, scope } = list(page);
  await expect(page.locator(".repo-banner")).toContainText(repo.repo);
  // Its name leads to the repo's page, as it does in each row, not to GitHub.
  await expect(page.locator(".repo-banner a")).toHaveAttribute("href", repo.url);
  await expect(rows).toHaveCount(repo.skills.length);
  await expect(count).toHaveText(`${n(repo.skills.length)} skills`);
  await expect(scope.locator('[data-remove="repo"]')).toContainText(`from ${repo.repo}`);

  // However the link spells it: GitHub ignores a repo's case, and so do this site's pages.
  await open(page, `/?repo=${encodeURIComponent(repo.repo.toUpperCase())}&show=skills`);
  await expect(page.locator(".repo-banner")).toContainText(repo.repo);
  await expect(rows).toHaveCount(repo.skills.length);
});

test("the keyboard can skip the tags, and keeps its place when a filter goes", async ({ page }) => {
  await open(page, "/?tag=type%3Aworkflow&stars=1000..&show=bundles");
  const { rows, scope } = list(page);

  // The tags come before the list: a link atop them, shown once focused, leads past them.
  await page.locator('[data-show="bundles"]').focus();
  await page.keyboard.press("Tab");
  const skip = page.locator(".skip-tags");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(rows.first().locator(".skill-name")).toBeFocused();

  // Removing a filter's chip hands the focus to the next one, and the last one to the count.
  await scope.locator('[data-remove="tag"]').focus();
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(scope.locator('[data-remove="range"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(page.locator("#count")).toBeFocused();

  // As does the Clear filters of an empty list's message, which the skills that come back replace.
  await open(page, "/?tag=no-such-tag");
  await list(page).empty.locator('[data-action="clear"]').focus();
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(rows).not.toHaveCount(0);
  await expect(page.locator("#count")).toBeFocused();
});

test("the list is where you left it after a skill's page, and after a reload", async ({ page }) => {
  await open(page, "/?sort=week");
  // The row at the window's top, how far down it the window starts, and the row after it.
  const place = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll("#results .skill-list > li")];
      const at = rows.findIndex((row) => row.getBoundingClientRect().bottom > 1);
      const href = (row?: Element) => row?.querySelector(".skill-name")?.getAttribute("href");
      const top = Math.round(rows[at]?.getBoundingClientRect().top ?? 0);
      return { row: href(rows[at]), top, next: href(rows[at + 1]) };
    });
  const back = async (left: Awaited<ReturnType<typeof place>>) => {
    await ready(page);
    // To the row, and within a pixel or two of where the window started in it.
    await expect.poll(async () => (await place()).row).toBe(left.row);
    await expect.poll(async () => Math.abs((await place()).top - left.top)).toBeLessThan(3);
  };

  // As a person does: down through the rows, which get their own height as they're drawn, rather
  // than the typical height they count as until then.
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 700);
  // The list notes its place once the page has stopped scrolling.
  await page.waitForFunction(() => history.state?.at);
  const selected = await place();
  expect(selected.top).toBeLessThan(1);

  // A wheel can still be finishing, and clicking the next row can scroll its link into view.
  // Measure where the visitor actually leaves, independently of the app's saved history state.
  await page.evaluate(() => {
    addEventListener(
      "pagehide",
      () => {
        const rows = [...document.querySelectorAll("#results .skill-list > li")];
        const at = rows.findIndex((row) => row.getBoundingClientRect().bottom > 1);
        sessionStorage.setItem(
          "test:left",
          JSON.stringify({
            row: rows[at]?.querySelector(".skill-name")?.getAttribute("href"),
            top: Math.round(rows[at]?.getBoundingClientRect().top ?? 0),
          }),
        );
      },
      { once: true },
    );
  });

  await page.locator(`#results .skill-name[href="${selected.next}"]`).first().click();
  await expect(page).toHaveURL(selected.next as string);
  await ready(page);
  const left = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test:left")!));
  expect(left.row).toBeTruthy();
  await page.goBack();
  await back(left);

  await page.reload();
  await back(left);
});

test("a tag picked down the list starts the new list under its count and its chip", async ({
  page,
}) => {
  await open(page, "/?sort=week");
  const { count, rows, scope } = list(page);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 700);
  await expect(count).not.toBeInViewport();

  // A tag of a row in view, clicked where it is, as a person does.
  const tag = await page.evaluate(() => {
    for (const chip of document.querySelectorAll<HTMLElement>("#results .tags .tag")) {
      const box = chip.getBoundingClientRect();
      if (box.top > 100 && box.bottom < innerHeight - 100)
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, name: chip.dataset.tag };
    }
  });
  if (!tag) throw new Error("no row's tag is in view");
  await page.mouse.click(tag.x, tag.y);
  await settled(page);

  // Not from its first row alone, which left what says what it holds just above the window.
  await expect(count).toBeInViewport({ ratio: 1 });
  await expect(scope.locator(`[data-remove="tag"][data-value="${tag.name}"]`)).toBeInViewport({
    ratio: 1,
  });
  await expect(rows.first().locator(".skill-name")).toBeInViewport();
  // Level with the tags' count, which stayed in view beside it.
  const middle = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox()) as { y: number; height: number };
    return box.y + box.height / 2;
  };
  expect(Math.abs((await middle("#count")) - (await middle("#facets > .list-count")))).toBeLessThan(
    2,
  );
});

test.describe("until the list's script has run, as on a slow connection", () => {
  /** Holds the page's scripts back until the returned function is called. */
  async function holdScripts(page: Page) {
    const held: Route[] = [];
    let released = false;
    await page.route("**/*", (route) => {
      if (released || route.request().resourceType() !== "script") return route.continue();
      held.push(route);
    });
    return async () => {
      released = true;
      await Promise.all(held.map((route) => route.continue()));
    };
  }

  test("a link to another list doesn't show the unfiltered one", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/?q=${encodeURIComponent(skill.name)}&show=skills`, { waitUntil: "commit" });
    const { rows, search } = list(page);
    await expect(search).toHaveValue(skill.name);
    await expect(page.locator("html[data-pending]")).toHaveCount(1);
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#settings")).toBeHidden();

    await release();
    await ready(page);
    await expect(page.locator("html[data-pending]")).toHaveCount(0);
    await expect(page.locator("#results")).toBeVisible();
    await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  });

  test("a search typed meanwhile is searched for", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto("/", { waitUntil: "commit" });
    const { rows, search } = list(page);
    await search.fill(skill.name);

    await release();
    await ready(page);
    await expect(page).toHaveURL(`/?q=${encodeURIComponent(skill.name)}`);
    await expect(search).toHaveValue(skill.name);
    await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  });
});

test("Find with your agent copies a prompt with the list and the need", async ({ page }) => {
  await open(page, "/?tag=type%3Aworkflow&show=bundles");
  const rows = await list(page).rows.count();
  await page.locator("#need").fill("review my pull requests");
  await page.locator(".ask-button").click();
  // Its size in short, the number highlighted as in the line before the click, and without a ~.
  // Said as that line says it, "a prompt of 2.1K tokens": in brackets, the highlight's own
  // padding stood between the bracket and the number, "( 2.1K tokens)".
  await expect(page.locator("#ask-label")).toHaveText(
    /^Prompt of [\d.]+[KM]? tokens copied to your clipboard, ready to use with any AI\.$/,
  );
  await expect(page.locator("#ask-label .badge")).toHaveText(/^[\d.]+[KM]?$/);
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`# Catalog (${rows} entries)`);
  expect(prompt).toContain("narrowed to: tag type:workflow");
  expect(prompt.trimEnd().endsWith("review my pull requests")).toBe(true);
});

test("the agent's box is a prompt box of a few lines while it has the focus or words", async ({
  page,
}) => {
  await open(page, "/?show=bundles");
  const need = page.locator("#need");
  const height = async () =>
    ((await page.locator(".agent-field").boundingBox()) as { height: number }).height;
  const oneLine = await height();
  await need.click();
  const focused = await height();
  expect(focused).toBeGreaterThan(oneLine * 2);

  // Enter asks, rather than start a line.
  await need.fill("review my pull requests");
  await need.press("Enter");
  await expect(page.locator("#ask-label")).toContainText("copied to your clipboard");
  await expect(need).toHaveValue("review my pull requests");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt.trimEnd().endsWith("review my pull requests")).toBe(true);

  // Shift+Enter starts one. The box grows with the lines, up to ten, then scrolls.
  for (let i = 0; i < 12; i++) await need.press("Shift+Enter");
  await expect(need).toHaveValue(`review my pull requests${"\n".repeat(12)}`);
  expect(await height()).toBeGreaterThan(focused);
  expect(await need.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // Elsewhere, it stays a prompt box while it holds words.
  await page.locator("#q").focus();
  expect(await height()).toBeGreaterThan(focused);

  // Empty, a press on the button leaves the focus in the box, which so doesn't shrink under the
  // pointer.
  await need.fill("");
  await page.locator(".ask-button").click();
  await expect(need).toBeFocused();
  expect(await height()).toBe(focused);

  // Empty and elsewhere, one line again.
  await page.locator("#q").focus();
  expect(await height()).toBe(oneLine);
});
