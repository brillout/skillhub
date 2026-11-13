/**
 * What every test of the walk shares: a page that fails its test when anything goes wrong in the
 * browser, and how to wait for the site, which is pre-rendered and shows before its scripts run.
 *
 * Never wait a fixed time. Wait for what the page says about itself (see website/ready.ts):
 * `open` for a page's script, `settled` for the list a change leads to, `searchable` for the whole
 * search; and for anything else, an `expect` on what a person would see, which retries by itself.
 *
 * The data changes every day, so no test names a number or a skill: e2e/data.ts derives what the
 * pages should show from the data files themselves.
 *
 * The unfiltered list is some 90,000 elements. An `expect` that starts out wrong on an element
 * that isn't visible, such as the Saved switch's empty count, has Playwright describe the whole
 * page on each try: seconds each there, during which the page can't move on, so the `expect` times
 * out on what a person would see at once. Test such things on a shorter list, such as a search's.
 */

import { test as base, expect, type Page } from "@playwright/test";

export { expect };

export const test = base.extend<{
  /** The problems a test brings about on purpose, such as the 404 of a page that doesn't exist. */
  expected: RegExp | null;
}>({
  expected: [null, { option: true }],
  // Any error in the console, uncaught exception, failed request or error response fails the test.
  page: async ({ page, expected }, use) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console error: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "";
      // Leaving a page cancels what it was still loading, such as its /api/me.
      if (reason !== "net::ERR_ABORTED")
        problems.push(`request failed: ${request.method()} ${request.url()} ${reason}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await use(page);
    expect(
      problems.filter((problem) => !expected?.test(problem)),
      "problems in the browser",
    ).toEqual([]);
  },
});

/** Opens a page of the site, and waits for its script and, on the skills list, for the list its URL asks for. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await ready(page);
}

/** Waits for the page's script, such as after a reload or a link: `open` does it for the page it opens. */
export async function ready(page: Page) {
  await marked(page, "data-ready");
  await settled(page);
}

/** Waits for a mark on <html>: see website/ready.ts. */
const marked = (page: Page, mark: string) => expect(page.locator(`html[${mark}]`)).toHaveCount(1);

/** Waits for the list that the last change leads to, all its rows in. */
export const settled = (page: Page) =>
  expect(page.locator('#results[aria-busy="true"]')).toHaveCount(0);

/** Waits for the search to look through the TLDRs' prose too, which loads after the page: until then it finds fewer skills. */
export async function searchable(page: Page) {
  await marked(page, "data-search-words");
  await settled(page);
}

/** Waits for the API's word on who's logged in: the Save buttons and the Saved switch show it from then on. */
export const accountLoaded = (page: Page) => marked(page, "data-account");

/** The skills list's parts. */
export const list = (page: Page) => ({
  count: page.locator("#count"),
  rows: page.locator("#results .skill-list > li"),
  search: page.locator("#q"),
  scope: page.locator("#scope"),
  empty: page.locator("#results .empty"),
  /**
   * A row's numbers, as the row shows them, for the number the list is sorted by. Read them with
   * allTextContents(): a row off the screen isn't drawn, so its innerText is empty.
   */
  sortedValues: page.locator("#results .skill-list > li .props > .on .prop-value"),
});

/**
 * How the heads of a list's first rows are laid out, a row's name with what follows it and its
 * buttons: the head's width, its name's, and its repo's, with whether the repo is on one line.
 * Of the first rows only, which it has the browser draw: a row off the screen isn't laid out.
 */
export const rowHeads = (page: Page, rows = 60) =>
  page.locator("#results .skill-list > li").evaluateAll(
    (all, n) =>
      all.slice(0, n).flatMap((row) => {
        (row as HTMLElement).style.contentVisibility = "visible";
        const head = row.querySelector(".row-head");
        const repo = row.querySelector(".row-head .repo-link");
        if (!head || !repo) return [];
        // An inline box has a rectangle for each line it's on.
        const lines = [...repo.getClientRects()];
        return [
          {
            name: row.querySelector(".skill-name")?.textContent ?? "",
            width: head.getBoundingClientRect().width,
            nameWidth: (row.querySelector(".row-head h3") as Element).getBoundingClientRect().width,
            repoWidth: lines.reduce((sum, line) => sum + line.width, 0),
            repoLines: lines.length,
          },
        ];
      }),
    rows,
  );

/** A row's number as the list shows it, such as 12.6K or 3.5M, back as a number; NaN for an unknown one, shown as a dash. */
export function fromCompact(text: string): number {
  const m = /^([\d.]+)([KM]?)$/.exec(text.trim());
  return m ? Number(m[1]) * { "": 1, K: 1e3, M: 1e6 }[m[2] as "" | "K" | "M"] : Number.NaN;
}

/** A count as a tag's chip writes it, such as 1,012, back as a number. */
export const fromCount = (text: string) => Number(text.replace(/,/g, ""));

/** 1190 as the site writes it: 1,190. */
export const n = (count: number) => count.toLocaleString("en");
