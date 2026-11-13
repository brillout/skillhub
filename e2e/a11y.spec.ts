/**
 * Accessibility, as axe checks it: contrast, names, roles, keyboard reach. On every kind of page,
 * in light and in dark.
 *
 * On short pages, as axe reads every element: the unfiltered list's 90,000 take it half a minute,
 * and a filtered one has every part of it. And not inside a SKILL.md, which is its author's: only
 * that the keyboard reaches what scrolls there, which is the page's doing.
 */

import AxeBuilder from "@axe-core/playwright";
import { bundleUrl, skill, skillUrl, smallOwnerUrl, smallRepo, wideCodeUrl } from "./data.ts";
import { expect, open, test } from "./fixtures.ts";

const PAGES: [name: string, url: string][] = [
  // A short list with every part of the long one: skills with tags of every tint, a chip to remove
  // the filter, a pressed tag, and a bundle with the skills that don't match greyed out.
  ["a filtered list", "/?tag=flag%3Adual-use"],
  ["a skill's page", skillUrl],
  ["a skill's page with wide code", wideCodeUrl],
  ["a bundle's page", bundleUrl],
  ["a repo's page", smallRepo.url],
  ["an owner's page", smallOwnerUrl],
  ["the tags page", "/tags/"],
  ["the about page", "/about/"],
  ["the queue page", "/queue/"],
];

/** A list and the entry to preview in it: a skill, and a bundle. */
const PREVIEWS: [name: string, url: string, entry: string][] = [
  ["a skill's preview", `/?q=${encodeURIComponent(skill.name)}`, skillUrl],
  ["a bundle's preview", "/?show=bundles", bundleUrl],
];

for (const scheme of ["light", "dark"] as const)
  test.describe(`in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const [name, url] of PAGES)
      test(`${name} passes axe`, async ({ page }) => {
        await open(page, url);
        const { violations } = await new AxeBuilder({ page }).exclude(".markdown").analyze();
        if (await page.locator(".skill-md").count()) {
          const inSkillMd = new AxeBuilder({ page }).include(".skill-md");
          violations.push(
            ...(await inSkillMd.withRules(["scrollable-region-focusable"]).analyze()).violations,
          );
        }
        // What's wrong, and where, in a line each: the report itself runs to pages.
        const found = violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 120)}`,
        );
        expect(found).toEqual([]);
      });

    // A row's preview, open, on a wide screen: the sheet with its head, its numbers, how to install
    // it, and the start of a SKILL.md, whose own words are its author's, as on the skill's page.
    for (const [name, url, entry] of PREVIEWS)
      test(`${name} passes axe`, async ({ page }) => {
        await open(page, url);
        await page
          .locator(`#results .skill-list > li:has(.skill-name[href="${entry}"])`)
          .locator(".skill-body :is(.glance dd, .skill-desc)")
          .first()
          .click();
        const sheet = page.locator("#preview");
        await expect(sheet.locator("[data-skill-md] .markdown, [data-get] .copy")).toBeVisible();
        const { violations } = await new AxeBuilder({ page }).exclude(".markdown").analyze();
        const inSkillMd = new AxeBuilder({ page }).include("#preview");
        violations.push(
          ...(await inSkillMd.withRules(["scrollable-region-focusable"]).analyze()).violations,
        );
        const found = violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 120)}`,
        );
        expect(found).toEqual([]);
      });
  });
