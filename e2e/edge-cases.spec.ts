/**
 * The edge cases: the states the pages handle but that the real data has no example of on most
 * days, such as a skill without a TLDR, or with unknown installs. They're walked on a site of their
 * own, whose catalog has an entry for each, named after it: see data/edge-cases.ts.
 *
 * To look at one yourself: `SKILLHUB_DATA=edge-cases pnpm dev`, at http://localhost:3100.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import {
  FIRST_SEEN_DAYS,
  TOOK_OFF_WEEKS,
  edgeCases,
  siteOf,
  type BundleCase,
  type SkillCase,
} from "../data/edge-cases.ts";
import { readData } from "../scripts/data.ts";
import { age, date, daysBefore } from "../website/format.ts";
import { bundlePage, github, ownerPage, repoPage, skillPage } from "../website/github.ts";
import { expect, list, open, searchable, settled, test } from "./fixtures.ts";

test.use({ baseURL: `http://localhost:${siteOf(true).port}` });

const { data, skills, bundles } = edgeCases(readData());
const skillUrl = (name: SkillCase) => `/${skillPage(skills[name])}/`;
const bundleUrl = (name: BundleCase) => `/${bundlePage(bundles[name])}/`;
const PAGES: [name: string, url: string][] = [
  ["the list", "/"],
  ...(Object.keys(skills) as SkillCase[]).map((name) => [name, skillUrl(name)] as [string, string]),
  ...(Object.keys(bundles) as BundleCase[]).map(
    (name) => [name, bundleUrl(name)] as [string, string],
  ),
];

/** How many rows the unfiltered list has: every bundle, and every skill with a row of its own. */
const members = new Map(
  data.bundles.flatMap((b) => b.agentReview.skills.map((m) => [m.id, m] as const)),
);
const listedRows =
  data.bundles.length +
  data.skills.filter((s) => !members.has(s.id) || members.get(s.id)?.listedOutsideBundle === true)
    .length;

/** The row of an entry, by its name: a case's entry is named after it. */
const row = (page: Page, name: string) =>
  list(page).rows.filter({
    has: page.locator(".skill-name", { hasText: new RegExp(`^${name}$`) }),
  });
/** A number of a row, or of every row, by the name a screen reader gives it. Read it with textContent: a row off the screen isn't drawn. */
const number = (rows: Locator, label: string) =>
  rows
    .locator(".props > div")
    .filter({ has: rows.page().locator("dt", { hasText: label }) })
    .locator(".prop-value");
const UNKNOWN = "—";

/**
 * A number that can be unknown: what a row calls it, its tile on a page, its sort and its filter in
 * the URL, and the skill that lacks it. Each filter is one that takes nearly every known value, on
 * any day: ten or more, or published over a week ago.
 */
const NUMBERS: { row: string; tile: string; param: string; range: string; lacking: SkillCase }[] = [
  {
    row: "Total Downloads",
    tile: "Total Downloads",
    param: "downloads",
    range: "10..",
    lacking: "unknown-installs",
  },
  {
    row: "Weekly Downloads",
    tile: "Weekly Downloads",
    param: "week",
    range: "10..",
    lacking: "unknown-weekly-installs",
  },
  { row: "Age", tile: "Age", param: "published", range: "..7d", lacking: "unknown-first-seen" },
  { row: "Stars", tile: "Repo Stars", param: "stars", range: "10..", lacking: "unknown-stars" },
];

test("the list has a row for every case, named after it", async ({ page }) => {
  await open(page, "/");
  const { count, rows } = list(page);
  await expect(count).toHaveText(`${data.skills.length} skills`);
  await expect(rows).toHaveCount(listedRows);
  for (const name of [...Object.keys(skills), ...Object.keys(bundles)])
    await expect(row(page, name)).toHaveCount(1);
});

test("a search that finds a bundle only by its own name counts its skills", async ({ page }) => {
  // A case's bundle is named after the case, which none of its skills says.
  const bundle = bundles["bundle-no-tldr"];
  const skillCount = `${bundle.agentReview.skills.length} skills`;
  await open(page, "/");
  await searchable(page);
  const { count, rows, search } = list(page);
  await search.fill(bundle.agentReview.name);
  await settled(page);
  await expect(rows).toHaveCount(1);
  await expect(row(page, bundle.agentReview.name)).toHaveCount(1);
  // Its row shows every skill of it as found: so do the count, the lines under the boxes, the tags.
  await expect(rows.locator(".members a.dim")).toHaveCount(0);
  await expect(count).toHaveText(skillCount);
  await expect(page.locator("#search-note")).toContainText(skillCount);
  await expect(page.locator("#ask-label")).toContainText(`the ${skillCount} below`);
  await expect(page.locator(".tags-of")).not.toContainText(/^0 tags/);
  await expect(page.locator("#skill-tags .chip")).not.toHaveCount(0);
});

test("a search that finds one skill says so in the singular", async ({ page }) => {
  await open(page, "/");
  await searchable(page);
  await list(page).search.fill("unknown-stars");
  await settled(page);
  await expect(list(page).count).toHaveText("1 skill");
  await expect(page.locator("#ask-label")).toContainText("the 1 skill below.");
  // As does the prompt the agent gets, of its catalog.
  await page.locator(".ask-button").click();
  await expect(page.locator("#ask-label")).toContainText("copied to your clipboard");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("# Catalog (1 entry)\n");
});

test("the numbers line up down the list, whatever a row has of them", async ({ page }) => {
  await open(page, "/");
  // A row off the screen isn't laid out until it's drawn.
  await page.addStyleTag({ content: ".skill-list > li { content-visibility: visible; }" });
  const ends = await list(page).rows.evaluateAll((rows) =>
    rows.map((row) => {
      const numbers = row.querySelector(".props") as Element;
      const first = numbers.querySelector(".prop-value") as Element;
      return Math.round(first.getBoundingClientRect().right - numbers.getBoundingClientRect().left);
    }),
  );
  // Where the numbers end, and the charts start: the same in a row of dashes as in any other.
  expect(new Set(ends).size, String(ends)).toBe(1);
});

test.describe("without a TLDR, or with a TLDR that has no glance", () => {
  const lacking = [skills["no-tldr"], skills["empty-glance"], bundles["bundle-no-tldr"]];

  test("a row shows the description instead", async ({ page }) => {
    await open(page, "/");
    for (const entry of lacking) {
      const name = "name" in entry ? entry.name : entry.agentReview.name;
      await expect(row(page, name).locator(".skill-desc")).toHaveText(
        entry.agentReview.description,
      );
      await expect(row(page, name).locator(".glance")).toHaveCount(0);
    }
    // Every other row has its glance.
    await expect(list(page).rows.locator(".glance")).toHaveCount(listedRows - lacking.length);
  });

  test("a page shows the description instead, and the TLDR's prose when there's one", async ({
    page,
  }) => {
    for (const [url, entry] of [
      [skillUrl("no-tldr"), skills["no-tldr"]],
      [skillUrl("empty-glance"), skills["empty-glance"]],
      [bundleUrl("bundle-no-tldr"), bundles["bundle-no-tldr"]],
    ] as const) {
      await open(page, url);
      await expect(page.locator(".lede")).toHaveText(entry.agentReview.description);
      await expect(page.locator(".at-a-glance")).toHaveCount(0);
      const prose = entry.agentReview.tldr?.text;
      if (prose) await expect(page.locator(".tldr")).toContainText(prose.split("\n")[0]);
      else await expect(page.locator(".tldr")).toHaveCount(0);
    }
  });

  test("the agent's prompt describes it by its description", async ({ page }) => {
    await open(page, "/");
    await page.locator(".ask-button").click();
    await expect(page.locator("#ask-label")).toContainText("copied to your clipboard");
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    for (const entry of lacking) expect(prompt).toContain(`\n- ${entry.agentReview.description}`);
    // No entry comes with nothing said about it: each has its heading, where it's from, and a fact.
    const entries = prompt.split("\n# My need")[0].split("\n\n### ").slice(1);
    expect(entries).toHaveLength(listedRows);
    for (const entry of entries) {
      const [, numbers, fact = ""] = entry.split("\n");
      expect(fact, entry).toMatch(/^- \S/);
      // And a number that isn't known isn't written.
      expect(numbers, entry).not.toMatch(/undefined|null|NaN|—/);
    }
  });
});

test("a skill without a copy of its SKILL.md says so", async ({ page }) => {
  await open(page, skillUrl("no-skill-md-copy"));
  const section = page.locator(".skill-md");
  await expect(section).toContainText("No copy of its SKILL.md yet.");
  await expect(section.locator(".markdown, .frontmatter")).toHaveCount(0);
  // The rest of the page is all there.
  await expect(page.locator(".stat-tiles .stat")).toHaveCount(NUMBERS.length);
});

test("a skill skills.sh doesn't list yet has no link there, and only its repo's stars", async ({
  page,
}) => {
  const skillsSh = (p: Page) => p.locator(".get .links a", { hasText: "skills.sh" });
  await open(page, skillUrl("no-tldr"));
  await expect(skillsSh(page)).toHaveCount(1);
  await open(page, skillUrl("unlisted"));
  await expect(skillsSh(page)).toHaveCount(0);
  await expect(page.locator(".get .links a", { hasText: "Source on GitHub" })).toHaveCount(1);
  await expect(page.locator(".stat-tiles .stat-label")).toHaveText([/Repo Stars/]);
});

test.describe("a number that's unknown", () => {
  test("is a dash in its row, beside the numbers that are known", async ({ page }) => {
    await open(page, "/");
    for (const { row: label, lacking } of NUMBERS) {
      await expect(number(row(page, lacking), label)).toHaveText(UNKNOWN);
      for (const other of NUMBERS)
        if (other.row !== label)
          await expect(number(row(page, lacking), other.row)).not.toHaveText(UNKNOWN);
    }
    // Without its weekly installs, a skill has no growth either: the list opens sorted by it.
    await expect(number(row(page, "unknown-weekly-installs"), "Weekly Growth")).toHaveText(UNKNOWN);
  });

  test("has no tile on its page, which keeps the others", async ({ page }) => {
    for (const { tile, lacking } of NUMBERS) {
      await open(page, skillUrl(lacking));
      const labels = await page.locator(".stat-tiles .stat-label").allTextContents();
      const others = NUMBERS.map((n) => n.tile).filter((t) => t !== tile);
      expect(labels.map((l) => others.find((t) => l.includes(t))).sort()).toEqual(others.sort());
      await expect(page.locator(".stat-tiles")).not.toContainText(/undefined|null|NaN/);
    }
  });

  test("goes last when the list is sorted by it, whichever way", async ({ page }) => {
    for (const sort of ["growth", ...NUMBERS.map((n) => n.param)])
      for (const order of ["", "order=asc"]) {
        const query = [sort === "growth" ? "" : `sort=${sort}`, order].filter(Boolean).join("&");
        await open(page, `/?${query}`);
        const values = await list(page).sortedValues.allTextContents();
        expect(values, query).toHaveLength(listedRows);
        const known = values.filter((v) => v !== UNKNOWN);
        expect(known.length, query).toBeGreaterThan(0);
        expect(known.length, query).toBeLessThan(values.length);
        expect(values.slice(0, known.length), query).toEqual(known);
      }
  });

  test("is left out when the list is narrowed by it", async ({ page }) => {
    for (const { row: label, param, range, lacking } of NUMBERS) {
      await open(page, `/?${param}=${range}`);
      const { rows } = list(page);
      await expect(row(page, lacking)).toHaveCount(0);
      await expect(row(page, "bundle-unknown-numbers")).toHaveCount(0);
      const shown = await number(rows, label).allTextContents();
      expect(shown.length, param).toBeGreaterThan(0);
      expect(shown, param).not.toContain(UNKNOWN);
    }
  });

  test("a repo with unknown stars says how many skills it has, and nothing of stars", async ({
    page,
  }) => {
    await open(page, `/${repoPage(github(skills["unknown-stars"]).repo)}/`);
    await expect(page.locator(".listing-page > .muted")).toHaveText("1 skill listed here");
  });
});

test.describe("a bundle none of whose skills has numbers", () => {
  const bundle = bundles["bundle-unknown-numbers"];

  test("has a dash for each in its row", async ({ page }) => {
    await open(page, "/");
    const values = await row(page, "bundle-unknown-numbers")
      .locator(".prop-value")
      .allTextContents();
    expect(values).toEqual([...NUMBERS.map(() => UNKNOWN), UNKNOWN]);
  });

  test("has no numbers on its page, for itself or for its skills", async ({ page }) => {
    await open(page, bundleUrl("bundle-unknown-numbers"));
    // Not even the section they'd be in, which a screen reader would announce empty.
    await expect(page.locator(".stat-tiles")).toHaveCount(0);
    await expect(page.locator(".bundle-skills > li")).toHaveCount(bundle.agentReview.skills.length);
    await expect(page.locator(".bundle-skills .metric")).toHaveCount(0);
  });
});

test("a republished skill is marked in its row, and its page says what that means", async ({
  page,
}) => {
  await open(page, "/");
  const marked = page.locator("#results .skill-list > li.caution");
  await expect(marked).toHaveCount(1);
  await expect(marked.locator(".skill-name")).toHaveText("republished");
  await expect(marked.locator('[data-tag="flag:republished"]')).toHaveCount(1);

  await open(page, skillUrl("republished"));
  const flag = data.facets
    .find((f) => f.id === "flag")
    ?.values?.find((v) => v.id === "republished");
  await expect(page.locator(".tag-detail")).toContainText(flag?.description ?? "");
  // And up the page, before its command and its numbers, whose ranking it says to distrust: as
  // its preview does. Among its tags alone, it came after them.
  const caution = page.locator(".skill-page > .note", { hasText: flag?.description ?? "" });
  await expect(caution).toHaveCount(1);
  const top = async (selector: string) =>
    ((await page.locator(selector).first().boundingBox()) as { y: number }).y;
  expect(await top(".skill-page > .note")).toBeLessThan(await top(".get"));
  // Its tag leads to the list of such skills.
  await page.locator('.tag-detail [data-tag="flag:republished"]').click();
  await expect(page).toHaveURL("/?tag=flag%3Arepublished");
  await expect(list(page).rows).toHaveCount(1);
});

test("one of something is said in the singular: a repo's star, a week's download", async ({
  page,
}) => {
  // "1 stars on GitHub", on its repo's page and on its owner's.
  const { repo } = github(skills["one-star"]);
  for (const url of [`/${repoPage(repo)}/`, `/${ownerPage(repo)}/`]) {
    await open(page, url);
    await expect(page.locator(".listing-page .fact").first()).toHaveText(/^1 star on GitHub,/);
  }

  // "1 downloads", in the trend's tooltip, of the first of its weeks.
  await open(page, skillUrl("one-download-week"));
  await page.locator(".spark").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".spark-tip strong")).toHaveText("1 download");
  await page.keyboard.press("End");
  await expect(page.locator(".spark-tip strong")).toHaveText(/^[\d,]+ downloads$/);
});

test.describe("a skill with a week of almost no installs, then thousands a week again", () => {
  const asOf = data.asOf.installs;
  /** A skill's Age: on its tile, where it says since when, and in its row. */
  const ageOf = async (page: Page, name: SkillCase) => {
    await open(page, skillUrl(name));
    const tile = page.locator(".stat", {
      has: page.locator(".stat-name", { hasText: /^Age$/ }),
    });
    const shown = {
      tile: await tile.locator(".stat-value").innerText(),
      since: (await tile.locator(".stat-label .muted").innerText()).replace(/^published /, ""),
      why: await tile.locator("[title]").getAttribute("title"),
      row: "",
    };
    await open(page, "/");
    shown.row = (await number(row(page, name), "Age").textContent()) ?? "";
    return shown;
  };

  test("took off that week, when it was almost unused until then: its age counts from it", async ({
    page,
  }) => {
    const day = daysBefore(asOf, TOOK_OFF_WEEKS * 7);
    const shown = await ageOf(page, "took-off");
    expect(shown.tile).toBe(age(day, asOf));
    expect(shown.row).toBe(age(day, asOf));
    expect(shown.since).toBe(date(day));
    expect(shown.why).toContain("the week it took off");
  });

  test("keeps its age when it got thousands a week before it: it only had a bad week", async ({
    page,
  }) => {
    // It was as new as the one that took off, beside its total of 200,000 downloads, "Newer than"
    // nearly every skill, and listed under Rising & new.
    const day = daysBefore(asOf, FIRST_SEEN_DAYS);
    const shown = await ageOf(page, "bad-week");
    expect(shown.tile).toBe(age(day, asOf));
    expect(shown.row).toBe(age(day, asOf));
    expect(shown.since).toBe(date(day));
    expect(shown.why).not.toContain("took off");

    // Open on the full list: the preset is one of its presets, which narrows it to the new skills.
    await page.locator('[data-preset="rising-new"]').click();
    await settled(page);
    await expect(row(page, "took-off")).toHaveCount(1);
    await expect(row(page, "bad-week")).toHaveCount(0);
  });
});

/** A row's words, a click on which opens its preview. */
const wordsOf = (rows: Locator) => rows.locator(".skill-body :is(.glance dd, .skill-desc)").first();

test("a preview's numbers take its width, however many are known", async ({ page }) => {
  await open(page, "/");
  for (const { lacking } of NUMBERS) {
    await wordsOf(row(page, lacking)).click();
    await expect(page.locator("#preview h2")).toHaveText(lacking);
    // Three tiles left the fourth's quarter empty.
    const tiles = page.locator("#preview .preview-stats > div");
    await expect(tiles).toHaveCount(3);
    const all = await page.locator("#preview .preview-stats").boundingBox();
    const last = await tiles.last().boundingBox();
    if (!all || !last) throw new Error("the preview's numbers aren't laid out");
    expect(Math.abs(last.x + last.width - (all.x + all.width)), lacking).toBeLessThan(1);
    await page.keyboard.press("Escape");
  }
});

test("a republished skill's preview says what that means", async ({ page }) => {
  await open(page, "/");
  // Its row says so down its left edge, which the preview covers.
  await wordsOf(row(page, "republished")).click();
  const flag = data.facets
    .find((f) => f.id === "flag")
    ?.values?.find((v) => v.id === "republished");
  await expect(page.locator("#preview .note")).toHaveText(flag?.description ?? "");
});

test("each case's preview opens whole, and says what its page says of what it lacks", async ({
  page,
}) => {
  await open(page, "/");
  await searchable(page);
  const sheet = page.locator("#preview");
  // By textContent: a row off the screen isn't drawn.
  const names = await list(page).rows.locator(".skill-name").allTextContents();
  for (const name of names.map((text) => text.trim())) {
    await wordsOf(row(page, name)).click();
    await expect(sheet.locator("h2")).toContainText(name);
    // Once what comes from its page is in: the start of its SKILL.md, or how to install it.
    await expect(sheet.getByText(/Loading its SKILL\.md|How to install it…/)).toHaveCount(0);
    expect(await sheet.innerText(), name).not.toMatch(/undefined|NaN|\[object/);
    await page.keyboard.press("Escape");
  }
  await wordsOf(row(page, "no-skill-md-copy")).click();
  await expect(sheet.locator("[data-skill-md]")).toHaveText("No copy of its SKILL.md yet.");
});

for (const scheme of ["light", "dark"] as const)
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const [name, url] of PAGES)
      test(`${name} passes axe`, async ({ page }) => {
        await open(page, url);
        // Not inside a SKILL.md, which is its author's: see a11y.spec.ts.
        const { violations } = await new AxeBuilder({ page }).exclude(".markdown").analyze();
        const found = violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 120)}`,
        );
        expect(found).toEqual([]);
      });
  });

test.describe("on a phone", () => {
  const WIDTH = 390;
  test.use({ viewport: { width: WIDTH, height: 844 }, isMobile: true, hasTouch: true });
  for (const [name, url] of PAGES)
    test(`${name} fits the screen's width`, async ({ page }) => {
      await open(page, url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(WIDTH);
    });
});
