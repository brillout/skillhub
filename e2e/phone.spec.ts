/** On a phone: nothing wider than the screen, and the list's settings and tags behind their buttons. */

import {
  atBundleUrl,
  bundleUrl,
  data,
  longLabelUrl,
  longRepo,
  longWordUrl,
  owner,
  repo,
  skill,
  skillUrl,
} from "./data.ts";
import { expect, list, n, open, settled, test } from "./fixtures.ts";

const all = `${n(data.skills.length)} skills`;
const WIDTH = 390;
test.use({ viewport: { width: WIDTH, height: 844 }, isMobile: true, hasTouch: true });

for (const [name, url] of [
  ["the skills list", "/"],
  ["a filtered list", "/?q=design&tag=type%3Aworkflow&stars=100..&show=bundles"],
  ["a skill's page", skillUrl],
  // What's hardest to fit: a label as long as another skill's name, and a word as long as a file's.
  ["a skill's page whose glance has a long label", longLabelUrl],
  ["a skill's page whose glance has a long word", longWordUrl],
  ["a bundle's page", bundleUrl],
  ["a repo's page", repo.url],
  ["an owner's page", owner.url],
  ["the tags page", "/tags/"],
  ["the about page", "/about/"],
  ["the queue page", "/queue/"],
])
  test(`${name} fits the screen's width`, async ({ page }) => {
    await open(page, url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(WIDTH);
  });

test("a glance's facts keep most of the line, however long a label is", async ({ page }) => {
  await open(page, longLabelUrl);
  const [glance, text] = await page
    .locator(".at-a-glance .glance")
    .evaluate((dl) => [
      dl.getBoundingClientRect().width,
      (dl.querySelector("dd") as Element).getBoundingClientRect().width,
    ]);
  expect(text).toBeGreaterThan(glance / 2);
});

test("a trend's tooltip stays on the screen, at its last week too", async ({ page }) => {
  await open(page, skillUrl);
  const spark = page.locator(".spark");
  await spark.scrollIntoViewIfNeeded();
  const box = (await spark.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // The last week is at the chart's right end, by the screen's edge.
  await page.touchscreen.tap(box.x + box.width - 3, box.y + box.height / 2);
  const tip = page.locator(".spark-tip");
  await expect(tip).toBeVisible();
  expect(await tip.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(WIDTH);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(WIDTH);

  // A tap reads out the week it's on: it read out the last one wherever it was.
  const weekly = skill["skills.sh"].weeklyInstalls as number[];
  await page.touchscreen.tap(box.x + 3, box.y + box.height / 2);
  await expect(tip).toContainText(`${n(weekly[0])} downloads`);
});

test("a label of the about page's table, too long for its line, goes on under its own start", async ({
  page,
}) => {
  await open(page, "/about/");
  // Where each line of a label starts, for the labels that take more than one.
  const starts = await page.locator(".breakdown td:first-child").evaluateAll((cells) =>
    cells
      .map((cell) => {
        const label = [...cell.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!label) return [];
        const range = document.createRange();
        range.selectNodeContents(label);
        return [...range.getClientRects()].map((line) => Math.round(line.left));
      })
      .filter((lines) => lines.length > 1),
  );
  expect(starts).not.toHaveLength(0);
  // Not under the row's emoji, which comes before the label's first line.
  for (const lines of starts) expect(new Set(lines).size, lines.join(", ")).toBe(1);
});

test("a tap opens an explanation of the about page's table, and a second tap closes it", async ({
  page,
}) => {
  await open(page, "/about/");
  const rows = page.locator(".breakdown tr");
  const shown = page.locator(".breakdown .tip-text:visible");
  // A finger stays "on" the row it last tapped: the explanation that the second tap unpinned
  // stayed open until a tap elsewhere.
  await rows.nth(3).locator(".tip-i").tap();
  await expect(rows.nth(3).locator(".tip-text")).toBeVisible();
  await rows.nth(3).locator(".tip-i").tap();
  await expect(shown).toHaveCount(0);

  // A tap anywhere on a row opens its explanation, as a pointer on the row does elsewhere; a tap
  // on the explanation closes it, rather than open the one of the row it covers.
  await rows
    .nth(5)
    .locator("td")
    .first()
    .tap({ position: { x: 60, y: 10 } });
  await expect(rows.nth(5).locator(".tip-text")).toBeVisible();
  await expect(shown).toHaveCount(1);
  await rows.nth(5).locator(".tip-text").tap();
  await expect(shown).toHaveCount(0);
});

test("a repo's numbers break between two of them, not inside one", async ({ page }) => {
  await open(page, repo.url);
  const facts = page.locator(".listing-page > .muted .fact");
  await expect(facts).not.toHaveCount(0);
  // Each on one line: none is wider than the screen.
  const broken = await facts.evaluateAll(
    (all) =>
      all.filter(
        (fact) =>
          fact.getBoundingClientRect().height >
          1.5 * Number.parseFloat(getComputedStyle(fact).lineHeight),
      ).length,
  );
  expect(broken).toBe(0);
  // And a line ends on the dot between two, rather than start with it: each but the last has its
  // own.
  const texts = await facts.allInnerTexts();
  texts.forEach((text, i) => expect(text.endsWith("·")).toBe(i < texts.length - 1));
});

test("a tag of the tags page's tables breaks after its prefix, its value whole on the next line", async ({
  page,
}) => {
  await open(page, "/tags/");
  const tags = page.locator(".tag-table td:first-child .tag");
  await expect(tags.locator(".tag-value")).not.toHaveCount(0);
  const [lines, broken] = await tags.evaluateAll((all) => {
    const linesOf = (el: Element) =>
      Math.round(
        el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
      );
    // How wide a value is by itself, on one line: as wide as its lines together.
    const widthOf = (value: Element) => {
      const range = document.createRange();
      range.selectNodeContents(value);
      return [...range.getClientRects()].reduce((sum, rect) => sum + rect.width, 0);
    };
    const values = all.map((tag) => {
      const value = tag.querySelector(".tag-value") as HTMLElement;
      const style = getComputedStyle(tag);
      const room =
        (tag.closest("td") as HTMLElement).clientWidth -
        Number.parseFloat(getComputedStyle(tag.closest("td") as Element).paddingRight) -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      // On two lines, or as an inline box in two boxes: either way, broken.
      const parts = Math.max(linesOf(value), value.getClientRects().length);
      return { tag: tag as HTMLElement, value, parts, room, text: value.textContent ?? "" };
    });
    // The longest value, which a phone's column hasn't the room for.
    const longest = values.toSorted((a, b) => b.text.length - a.text.length)[0];
    return [
      // Its prefix, then its value: two lines at most, but for the longest.
      values.filter((v) => v !== longest && linesOf(v.tag) > 2).map((v) => v.tag.dataset.tag),
      // And none is broken that its column has the room for, as "needs:claude-" over "ai" would be.
      values.filter((v) => v.parts > 1 && widthOf(v.value) <= v.room).map((v) => v.tag.dataset.tag),
    ];
  });
  expect(lines).toEqual([]);
  expect(broken).toEqual([]);
});

test("an install command is as wide as the page, with its Copy button under it", async ({
  page,
}) => {
  await open(page, skillUrl);
  const install = page.locator(".install").first();
  const box = async (selector: string) =>
    (await install.locator(selector).boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  const [code, copy] = [await box("code"), await box(".copy")];
  const whole = (await install.boundingBox()) as { x: number; width: number };
  // Beside the button, the command had a line of some 26 letters, which a long name ran out of.
  expect(Math.round(code.width)).toBe(Math.round(whole.width));
  expect(copy.y).toBeGreaterThanOrEqual(code.y + code.height);
  expect(Math.round(copy.x + copy.width)).toBe(Math.round(whole.x + whole.width));
  // Under the box or beside it, it copies the command.
  const command = await install.locator("code").textContent();
  await install.locator(".copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
});

test("a plugin's name too long for a line of its install command breaks after its @", async ({
  page,
}) => {
  await open(page, atBundleUrl);
  // It was one word, cut off at the edge of its box, which scrolled sideways for the rest.
  const starts = page.locator(".install code .word", { hasText: /^[^/]+@$/ });
  await expect(starts).not.toHaveCount(0);
  const cut = await starts.evaluateAll(
    (all) =>
      all.filter((start) => {
        const code = start.closest("code") as HTMLElement;
        const end =
          code.getBoundingClientRect().right -
          Number.parseFloat(getComputedStyle(code).paddingRight);
        // Its start, up to the @, and what follows it.
        return [start, start.nextElementSibling?.nextElementSibling as Element].some(
          (word) => word.getBoundingClientRect().right > end + 0.5,
        );
      }).length,
  );
  expect(cut).toBe(0);
});

test("a number filter's slider opens in view", async ({ page }) => {
  await open(page, "/?show=bundles");
  await page.locator(".filters-toggle").click();
  await page.locator('.range-pill[data-value="week"]').click();
  await expect(page.locator("#range-pop-week")).toBeInViewport({ ratio: 1 });
});

test("the agent's button is under its box, as wide as it", async ({ page }) => {
  await open(page, "/?show=bundles");
  const box = async (selector: string) =>
    (await page.locator(selector).boundingBox()) as { y: number; width: number; height: number };
  const [need, button, field] = [
    await box("#need"),
    await box(".ask-button"),
    await box(".agent-field"),
  ];
  expect(button.y).toBeGreaterThanOrEqual(need.y + need.height);
  expect(button.width).toBeGreaterThan(field.width * 0.9);
});

test("the list's settings and tags open from their buttons", async ({ page }) => {
  await open(page, "/");
  const settings = page.locator("#sort-group");
  const tags = page.locator("#tag-facets");
  const filters = page.locator(".filters-toggle");
  const tagsToggle = page.locator(".tags-toggle");

  // The presets, the Saved switch and Show's thumbs, beside it, stay in view.
  await expect(page.locator("#presets")).toBeVisible();
  await expect(page.locator("#saved-switch")).toBeVisible();
  await expect(page.locator("#thumbs-filter")).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(tags).toBeHidden();

  await filters.click();
  await expect(settings).toBeVisible();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expect(filters).toHaveText("Hide filters");
  // Stacked, the order's arrows are as easy to tap as the settings around them.
  for (const arrow of await page.locator(".order button").all())
    expect((await arrow.boundingBox())?.height).toBeGreaterThanOrEqual(32);
  await filters.click();
  await expect(settings).toBeHidden();

  await tagsToggle.click();
  await expect(tags).toBeVisible();
  await expect(tagsToggle).toHaveAttribute("aria-expanded", "true");
  await tagsToggle.click();
  await expect(tags).toBeHidden();
});

test("the open tags keep a way to the list at the screen's bottom, which says how many skills they leave", async ({
  page,
}) => {
  await open(page, "/");
  const { count } = list(page);
  const tags = page.locator("#tag-facets");
  const toList = page.locator(".tags-done button");
  await expect(toList).toBeHidden();

  await page.locator(".tags-toggle").click();
  await expect(toList).toBeInViewport({ ratio: 1 });
  await expect(toList).toHaveText(`Show ${all}`);

  // A tag picked there narrows a list that's under them all, out of sight: the button says to how
  // many, as the tag's chip did.
  const chip = tags.locator(".chip").first();
  const said = await chip.locator(".n").innerText();
  const left = `${said} ${said === "1" ? "skill" : "skills"}`;
  await chip.click();
  await settled(page);
  await expect(count).not.toBeInViewport();
  await expect(toList).toBeInViewport({ ratio: 1 });
  await expect(toList).toHaveText(`Show ${left}`);

  // It closes the tags, and the list starts at the screen's top, under its count.
  await toList.click();
  await expect(tags).toBeHidden();
  await expect(toList).toBeHidden();
  await expect(page.locator(".tags-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(count).toHaveText(left);
  await expect(count).toBeInViewport({ ratio: 1 });
  await expect(count).toBeFocused();
  expect(await count.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(40);
});

test("what's tapped among the open tags stays under the finger", async ({ page }) => {
  await open(page, "/");
  await page.locator(".tags-toggle").click();
  const top = (selector: string) =>
    page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);

  // A tag far down them, a stack's: the tags over it change with it, some going, and it went up
  // out of the screen with what was under them.
  const tag = await page.locator("#skill-tags .facet").last().locator(".chip").first();
  const chip = `#skill-tags [data-tag="${await tag.getAttribute("data-tag")}"]`;
  await page.locator(chip).scrollIntoViewIfNeeded();
  let before = await top(chip);
  await page.locator(chip).click();
  await settled(page);
  await expect(page.locator(chip)).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs((await top(chip)) - before)).toBeLessThan(2);
  await page.locator(chip).click();
  await settled(page);

  // And the button that shows every stack tag, then fewer: it left the screen amid the list.
  const stack = '#facets [data-action="stack"]';
  await page.locator(stack).click();
  await settled(page);
  await page.locator(stack).scrollIntoViewIfNeeded();
  await expect(page.locator(stack)).toHaveText("Show fewer");
  before = await top(stack);
  await page.locator(stack).click();
  await settled(page);
  await expect(page.locator(stack)).toHaveText(/^Show all/);
  expect(Math.abs((await top(stack)) - before)).toBeLessThan(2);
});

test.describe("on a phone 667px tall, whose first screen ends at the tags' button", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("the tags open in view, their button at the screen's top", async ({ page }) => {
    await open(page, "/");
    const toggle = page.locator(".tags-toggle");
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    // Under the button where it was, the bar that leads to the list covered what little of the
    // tags was in view: none showed.
    await expect(page.locator("#skill-tags .chip").first()).toBeInViewport({ ratio: 1 });
    expect(await toggle.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(40);
  });
});

test.describe("on a small phone, 360px wide", () => {
  const SMALL = 360;
  test.use({ viewport: { width: SMALL, height: 740 } });

  test("a filter's chip longer than the screen wraps", async ({ page }) => {
    await open(page, `/?repo=${encodeURIComponent(longRepo.repo)}`);
    const chip = list(page).scope.locator('[data-remove="repo"]');
    await expect(chip).toContainText(`from ${longRepo.repo}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(SMALL);
    const box = (await chip.boundingBox()) as { x: number; width: number };
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(SMALL);
  });

  test("the Saved switch stays under the finger that taps it", async ({ page }) => {
    await open(page, "/");
    const saved = page.locator("#saved-switch");
    const top = () => saved.evaluate((el) => el.getBoundingClientRect().top);
    const before = await top();
    // The line under the agent's box says less for the empty list that follows, on fewer lines:
    // what's under it moved up, the switch included.
    await saved.click();
    await settled(page);
    await expect(page.locator("#ask-label")).toContainText("nothing to copy");
    expect(Math.abs((await top()) - before)).toBeLessThan(1);
  });

  test("the filters' pills fit the screen, however long their ranges", async ({ page }) => {
    // Every filter narrowed, and Age at its longest, which doesn't fit half a row: its pill takes
    // a row of its own, rather than push the others off the screen.
    await open(
      page,
      "/?show=bundles&published=90d..30d&stars=1000..50000&downloads=1000..100000&week=100..5000",
    );
    await page.locator(".filters-toggle").click();
    const pills = page.locator(".range-pill");
    await expect(pills.first()).toContainText("1 month – 3 months");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(SMALL);
    // Nor do a pill's words stick out of it.
    expect(
      await pills.evaluateAll((all) => all.filter((pill) => pill.scrollWidth > pill.clientWidth)),
    ).toHaveLength(0);
  });
});
