/** Every page besides the skills list, and the header they share. */

import {
  anchorsUrl,
  bundle,
  bundleUrl,
  codeInTldr,
  commentUrl,
  data,
  flagsBundleUrl,
  fromAHandful,
  headingsUrl,
  hiddenDirUrl,
  insideWord,
  joinedBundleUrl,
  longJoinedBundleUrl,
  longDescriptionUrls,
  longFrontmatterUrl,
  longTaskUrl,
  onlyInBundle,
  owner,
  quotedFact,
  repo,
  respelledOwner,
  respelledTags,
  skill,
  skillUrl,
  stackTags,
  tableThenUrl,
  taskListUrl,
  unendedRepo,
  unusedTag,
  wideCodeUrl,
} from "./data.ts";
import { MINIMUMS } from "../data/params.ts";
import { readCrawl } from "../scripts/data.ts";
import { bundlePage, bundleRepo } from "../website/github.ts";
import { expect, list, n, open, ready, test } from "./fixtures.ts";

const clipboard = (page: import("@playwright/test").Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test("a skill's page: its name, numbers, install command and SKILL.md", async ({ page }) => {
  await open(page, skillUrl);
  const [ownerName, repoName] = skill.id.split("/");
  // With its repo: some seventy skills share their name with another's.
  await expect(page).toHaveTitle(`${skill.name} · ${ownerName}/${repoName} · SkillHub`);
  await expect(page.locator("h1")).toHaveText(skill.name);
  // The card of its link, where it's shared: its name and repo, the site's apart, and what it's for.
  const card = (tag: string) => page.locator(`meta[property="og:${tag}"]`);
  await expect(card("title")).toHaveAttribute(
    "content",
    `${skill.name} · ${ownerName}/${repoName}`,
  );
  await expect(card("site_name")).toHaveAttribute("content", "SkillHub");
  // The start of the page's own description, as much of it as a card has the room for.
  const described = await page.locator('meta[name="description"]').getAttribute("content");
  const onCard = ((await card("description").getAttribute("content")) ?? "").replace(/…$/, "");
  expect(onCard).not.toBe("");
  expect(described?.startsWith(onCard)).toBe(true);
  await expect(page.locator(".crumbs a")).toHaveText(["Skills", ownerName, repoName]);

  // The install command is copied as shown.
  const command = `npx skills add https://github.com/${ownerName}/${repoName} --skill ${skill.name}`;
  await expect(page.locator(".install code")).toHaveText(command);
  await page.locator(".install .copy").click();
  await expect(page.locator(".install .copy[data-copied]")).toBeVisible();
  expect(await clipboard(page)).toBe(command);
  // Copy's edge, a ring outside its box, is level with the command's, a border inside its own.
  const edges = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox()) as { y: number; height: number };
    return [box.y, box.y + box.height];
  };
  const [top, bottom] = await edges(".install code");
  const [ringTop, ringBottom] = (await edges(".install .copy")).map((y, i) => y + (i ? 1 : -1));
  expect(Math.abs(ringTop - top)).toBeLessThan(0.5);
  expect(Math.abs(ringBottom - bottom)).toBeLessThan(0.5);

  // The sparkline reads out each week with the keyboard.
  const weekly = skill["skills.sh"].weeklyInstalls as number[];
  await page.locator(".spark").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[0])} downloads`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[1])} downloads`);

  await expect(page.locator(".skill-md .markdown")).not.toBeEmpty();

  // A tag leads to the list, filtered by it.
  const tag = page.locator(".tag-detail a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
  await expect(list(page).scope.locator('[data-remove="tag"]')).toHaveCount(1);
});

test("a description too long for a link's card ends there on a sentence, or on a word and its dots", async ({
  page,
}) => {
  // A page's HTML has its quotes and its ampersands escaped, each as several letters.
  const unescaped = (text: string) =>
    text
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&(quot|apos|lt|gt);/g, (_, name: "quot" | "apos" | "lt" | "gt") => {
        return { quot: '"', apos: "'", lt: "<", gt: ">" }[name];
      })
      .replace(/&amp;/g, "&");
  const meta = (html: string, tag: string) =>
    unescaped(
      new RegExp(`<meta (?:name|property)="${tag}" content="([^"]*)"`).exec(html)?.[1] ?? "",
    );
  let cut = 0;
  for (const url of longDescriptionUrls) {
    const html = await (await page.request.get(url)).text();
    const described = meta(html, "description");
    const onCard = meta(html, "og:description");
    expect(onCard, url).not.toBe("");
    if (onCard === described) continue;
    cut++;
    expect(onCard.length, url).toBeLessThanOrEqual(300);
    expect(described.startsWith(onCard.replace(/…$/, "")), url).toBe(true);
    // Not on a full stop and its dots, "skills.…", nor on the label of a fact it has no room
    // for, "Entry point:…": on its last whole sentence, or on a word's end.
    expect(onCard, url).toMatch(/[.!?]$|[^\s.,;:!?]…$/);
  }
  expect(cut).toBeGreaterThan(0);
});

test("a glance's fact that ends on what someone says gets no full stop after its quote", async ({
  page,
}) => {
  test.skip(!quotedFact, "no glance's fact ends on a quoted sentence today");
  if (!quotedFact) return;
  await open(page, quotedFact.url);
  // As it's written: with the full stop every other fact gets, `"how do I do X?"` read `X?".`
  const fact = page.locator(".at-a-glance dd").filter({ hasText: quotedFact.text });
  await expect(fact).toHaveText(quotedFact.text);
});

test("what a TLDR sets between backticks is code, and the backticks are gone", async ({ page }) => {
  test.skip(!codeInTldr, "no TLDR sets code between backticks today");
  if (!codeInTldr) return;
  await open(page, codeInTldr.url);
  const tldr = page.locator(".tldr");
  await expect(tldr.locator("code").first()).toHaveText(codeInTldr.code);
  await expect(tldr).not.toContainText("`");
  await expect(page.locator(".at-a-glance")).not.toContainText("`");
  // Nor in the page's description, where there's no code to tell from its words.
  const description = page.locator('meta[name="description"]');
  expect(await description.getAttribute("content")).not.toContain("`");
});

test("a skill's numbers are level from one tile to the one beside it", async ({ page }) => {
  await open(page, skillUrl);
  // Two tiles a row: Weekly Downloads, whose trend is on its number's own line, then Total
  // Downloads. Taller than the number, the trend pushed it, and what's under it, down.
  await expect(page.locator(".stat-tiles .stat").first().locator(".trend")).toBeVisible();
  for (const part of [".stat-value", ".stat-standing", ".crowd"]) {
    const [weekly, total] = await page
      .locator(`.stat-tiles ${part}`)
      .evaluateAll((all) => all.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(weekly, part).toBe(total);
  }
});

test("the numbers stay level where a tile's label takes more lines than its neighbor's", async ({
  page,
}) => {
  await open(page, bundleUrl);
  // As a bundle's Weekly Downloads, which names its top skill, or the stars of a repo with a long
  // name: on a second line, the label put its tile's number, words and chart under its neighbor's.
  const label = page.locator(".stat-tiles .stat-label > span").first();
  await label.locator(".muted").evaluate((from) => {
    from.textContent += " and what makes a label long enough for a second line of its tile";
  });
  const tall = await page
    .locator(".stat-tiles .stat-label > span")
    .evaluateAll((labels) => labels.slice(0, 2).map((el) => el.getBoundingClientRect().height));
  expect(tall[0]).toBeGreaterThan(tall[1] + 10);
  for (const part of [".stat-value", ".stat-standing", ".crowd"]) {
    const [weekly, total] = await page
      .locator(`.stat-tiles ${part}`)
      .evaluateAll((all) => all.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(weekly, part).toBe(total);
  }
});

test("a skill's change over its 8 weeks is told only from a week of 100 downloads or more", async ({
  page,
}) => {
  test.skip(!fromAHandful, "no skill's 8 weeks began with a handful of downloads today");
  await open(page, fromAHandful as string);
  // From a handful, it read as "+273,050% in 8 weeks", which the list refuses for its growth.
  await expect(page.locator(".stat-delta")).toHaveText("8 weeks");
  await open(page, skillUrl);
  await expect(page.locator(".stat-delta")).toHaveText(/^([+−][\d,]+|0)% in 8 weeks$/);
});

test("a skill that only works inside its bundle is installed with it", async ({ page }) => {
  const { skill: member, url, bundle: whole } = onlyInBundle;
  const [{ label, command }] = whole.agentReview.install;
  await open(page, url);
  await expect(page.locator(".note").first()).toContainText("Only works inside its bundle");
  // The way to it says that its last stop is a bundle: named after its repo, it read as the repo twice.
  await expect(page.locator(".crumbs")).toContainText(`/ ${whole.agentReview.name} bundle`);
  // Its note ends where the cards under it do: its box was 77px short of theirs.
  const right = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox()) as {
      x: number;
      width: number;
    };
    return box.x + box.width;
  };
  expect(Math.abs((await right(".note")) - (await right(".get")))).toBeLessThan(0.5);
  // Its page says to install the bundle instead: its one command installed the skill alone.
  await expect(page.locator(".install")).toHaveCount(1);
  await expect(page.locator(".install code")).toHaveText(command);
  await expect(page.locator(".install code")).not.toHaveText(new RegExp(`--skill ${member.name}$`));
  // What it installs, then where, each a sentence: after a label with a colon of its own,
  // ": installs …" ran on.
  await expect(page.locator(".install-label")).toHaveText(
    `Installs ${whole.agentReview.name}, the bundle it works in. ${label}${/[.!?]$/.test(label) ? "" : "."}`,
  );
  await page.locator(".install .copy").click();
  expect(await clipboard(page)).toBe(command);
  const others = page.locator(".links a", { hasText: "Other ways to install it" });
  await expect(others).toHaveCount(whole.agentReview.install.length > 1 ? 1 : 0);
  if (whole.agentReview.install.length > 1) {
    // To the bundle's commands, not to its page's top, a screen or two over them.
    await others.click();
    await ready(page);
    await expect(page).toHaveURL(`/${bundlePage(whole)}/#install`);
    await expect(page.locator(".install").first()).toBeInViewport();
    await page.goBack();
    await ready(page);
  }
  await page.locator(".install-label a").click();
  await expect(page).toHaveURL(`/${bundlePage(whole)}/`);
});

test("a skill in a hidden directory of its repo shows its SKILL.md", async ({ page }) => {
  test.skip(!hiddenDirUrl, "no skill is in a hidden directory today");
  if (!hiddenDirUrl) return;
  // Such as .claude/skills/<name>: the build skipped hidden directories, so forty skills' pages
  // said "No copy of its SKILL.md yet." beside a TL;DR that says how far the copy has moved.
  await open(page, hiddenDirUrl);
  await expect(page.locator(".skill-md .markdown")).not.toBeEmpty();
  await expect(page.locator(".skill-md")).not.toContainText("No copy of its SKILL.md yet");
});

test("a SKILL.md's frontmatter wraps, its comments are hidden and its tasks have boxes", async ({
  page,
}) => {
  // The description, which says when an agent picks the skill, is one long line: cut off at the
  // box's edge, which scrolled.
  await open(page, longFrontmatterUrl);
  await page.locator(".frontmatter summary").click();
  const pre = page.locator(".frontmatter pre");
  await expect(pre).toBeVisible();
  expect(await pre.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  // The disclosure is as wide as its word, not as the page.
  expect((await page.locator(".frontmatter summary").boundingBox())?.width).toBeLessThan(200);
  // Its letters are its box's, as a code block's are: made smaller once more for being code, they
  // were the smallest of the page.
  const size = (el: Element) => getComputedStyle(el).fontSize;
  expect(await pre.locator("code").evaluate(size)).toBe(await pre.evaluate(size));

  // An HTML comment, which GitHub hides, showed as text.
  await open(page, commentUrl);
  await expect(page.locator(".skill-md .markdown")).not.toContainText("<!--");
  await expect(page.locator(".skill-md .markdown")).not.toContainText("-->");

  // A task list's items showed as a bullet, then "[ ]".
  await open(page, taskListUrl);
  const tasks = page.locator(".skill-md .markdown li.task");
  await expect(tasks).not.toHaveCount(0);
  await expect(tasks.first().locator('input[type="checkbox"]')).toBeDisabled();
  // Each named for a screen reader, as GitHub names its own: a hundred "checkbox, dimmed" otherwise.
  await expect(tasks.first().locator('input[type="checkbox"]')).toHaveAccessibleName(
    /^(Completed|Incomplete) task$/,
  );
  for (const text of (await tasks.allInnerTexts()).slice(0, 20))
    expect(text).not.toMatch(/^\[[ xX]\]/);
});

test("a SKILL.md's table keeps its distance from the rule or the table under it", async ({
  page,
}) => {
  // A table had no margin of its own: a rule under it was half as far as from a paragraph, and
  // two tables touched.
  await open(page, tableThenUrl);
  const gaps = await page.locator(".skill-md .markdown table").evaluateAll((tables) =>
    tables.flatMap((table) => {
      const next = table.nextElementSibling;
      return next && /^(HR|TABLE)$/.test(next.tagName)
        ? [next.getBoundingClientRect().top - table.getBoundingClientRect().bottom]
        : [];
    }),
  );
  expect(gaps).not.toHaveLength(0);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(16);
});

test("a SKILL.md's headings are written alike, the smaller ones no bolder than the first", async ({
  page,
}) => {
  // Its first level had the site's own weight and letters, the ones under it the browser's bold:
  // a sub-heading stood out more than the heading over it.
  await open(page, headingsUrl);
  const written = await page
    .locator(".skill-md .markdown :is(h3, h4, h5, h6)")
    .evaluateAll((headings) =>
      headings.map((heading) => {
        const { fontWeight, fontVariationSettings } = getComputedStyle(heading);
        return { level: heading.tagName, written: `${fontWeight} ${fontVariationSettings}` };
      }),
    );
  expect(new Set(written.map((heading) => heading.level)).size).toBeGreaterThanOrEqual(3);
  expect([...new Set(written.map((heading) => heading.written))]).toHaveLength(1);
});

test("a SKILL.md's task too long for a line goes on under its own start", async ({ page }) => {
  // Its first line started a space further right than the next ones, after its box.
  await open(page, longTaskUrl);
  const starts = await page.locator(".skill-md .markdown li.task").evaluateAll((tasks) =>
    tasks.flatMap((task) => {
      const words = [...task.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim(),
      );
      if (!words) return [];
      const range = document.createRange();
      range.selectNodeContents(words);
      // From its first letter: the space before it is what moved the first line.
      range.setStart(words, (words.textContent ?? "").search(/\S/));
      // A line's start is its leftmost box: one box per line of the words.
      const lines = new Map<number, number>();
      for (const box of range.getClientRects()) {
        const top = Math.round(box.top);
        lines.set(top, Math.min(lines.get(top) ?? Infinity, box.left));
      }
      const lefts = [...lines.values()];
      return lefts.length > 1 ? [Math.max(...lefts) - Math.min(...lefts)] : [];
    }),
  );
  expect(starts).not.toHaveLength(0);
  expect(Math.max(...starts)).toBeLessThan(0.5);
});

test("a SKILL.md's links to its own headings lead to them", async ({ page }) => {
  await open(page, anchorsUrl);
  const link = page.locator('.markdown a[href^="#md-"]').first();
  const href = (await link.getAttribute("href")) as string;
  await link.click();
  await expect(page).toHaveURL(`${anchorsUrl}${href}`);
  await expect(page.locator(`[id="${href.slice(1)}"]`)).toBeInViewport();
});

test("the keyboard reaches a SKILL.md's blocks that scroll sideways, and only those", async ({
  page,
}) => {
  await open(page, wideCodeUrl);
  const blocks = page.locator(".markdown pre, .markdown table");
  await expect(page.locator('.markdown pre[tabindex="0"]')).not.toHaveCount(0);
  const mismatched = await blocks.evaluateAll(
    (all) => all.filter((b) => b.scrollWidth > b.clientWidth !== (b.tabIndex === 0)).length,
  );
  expect(mismatched).toBe(0);
});

test("a bundle's page: its skills in order, and how to install them", async ({ page }) => {
  const { name, skills, install } = bundle.agentReview;
  await open(page, bundleUrl);
  await expect(page).toHaveTitle(`${name} · bundle of ${bundleRepo(bundle)} · SkillHub`);
  await expect(page.locator("h1")).toContainText(name);
  await expect(page.locator("h1 .kind")).toHaveText(`Bundle of ${skills.length} skills`);
  const names = skills.map(({ id }) => data.skills.find((s) => s.id === id)?.name ?? "");
  await expect(page.locator(".bundle-skills .skill-name")).toHaveText(names);
  // Each skill's number is on its name's line: it was 2px higher, in a line of its own height.
  const off = await page.locator(".bundle-skills > li").evaluateAll((items) =>
    items.slice(0, 5).map((item) => {
      const number = getComputedStyle(item, "::before");
      const name = (item.querySelector(".skill-name") as Element).getClientRects()[0];
      const middle = Number.parseFloat(number.top) + Number.parseFloat(number.lineHeight) / 2;
      return Math.abs(middle - (name.top + name.height / 2 - item.getBoundingClientRect().top));
    }),
  );
  expect(Math.max(...off)).toBeLessThan(0.5);

  await expect(page.locator(".install")).toHaveCount(install.length);
  await page.locator(".install .copy").first().click();
  expect(await clipboard(page)).toBe(install[0].command);

  // Its trend reads out each week with the keyboard, as a skill's does.
  await page.locator(".spark").focus();
  await expect(page.locator(".spark-tip")).toBeVisible();
});

/**
 * How many of an install command's parts that read together are on two lines though one has the
 * room for them: the command is in a font whose letters are all as wide, so a part is as wide as
 * its letters.
 */
const parted = (parts: import("@playwright/test").Locator) =>
  parts.evaluateAll(
    (all) =>
      all.filter((part) => {
        const code = part.closest("code") as HTMLElement;
        const style = getComputedStyle(code);
        const room =
          code.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);
        const words = [...part.querySelectorAll(".word")].map((word) =>
          word.getBoundingClientRect(),
        );
        const letter = words[0].width / (part.querySelector(".word")?.textContent ?? " ").length;
        const lines = new Set(words.map((word) => Math.round(word.top))).size;
        return lines > 1 && (part.textContent ?? "").length * letter <= room;
      }).length,
  );

test("where an install command wraps, a flag stays with what it's set to", async ({ page }) => {
  await open(page, flagsBundleUrl);
  const pairs = page.locator(".install code .pair");
  await expect(pairs).not.toHaveCount(0);
  expect(await parted(pairs)).toBe(0);
});

test("where an install command of several wraps, each of its commands starts a line", async ({
  page,
}) => {
  // Joined by &&: a line ended inside the next command, rather than after the &&.
  await open(page, joinedBundleUrl);
  const commands = page.locator(".install code .cmd");
  await expect(commands).not.toHaveCount(0);
  expect(await parted(commands)).toBe(0);
  // What's copied is the command as it's written: on one line, whatever lines it shows on.
  const joined = page.locator(".install", { has: page.locator(".cmd") }).first();
  const text = (await joined.locator("code").textContent()) as string;
  expect(text).toContain(" && ");
  await joined.locator(".copy").click();
  expect(await clipboard(page)).toBe(text);
  // Said too, for who can't see the button change; and each Copy says which command it copies,
  // where a page has several: they all read out as "Copy".
  await expect(page.locator("#said")).toHaveText("Copied to your clipboard.");
  const label = await joined.evaluate((install) => install.previousElementSibling?.textContent);
  await expect(joined.locator(".copy")).toHaveAccessibleDescription(label as string);
});

test("a link to a skill's TL;DR shows its card whole", async ({ page }) => {
  // The card's top was cut off, by under 3px: the link scrolls to the heading inside the card.
  await open(page, `${skillUrl}#tldr`);
  const card = page.locator("section.tldr");
  await expect(card.locator("h2")).toBeInViewport();
  expect(((await card.boundingBox()) as { y: number }).y).toBeGreaterThanOrEqual(0);
});

test("a trend's tooltip opens under its line where there's no room over it, and Escape puts it away", async ({
  page,
}) => {
  await open(page, skillUrl);
  const spark = page.locator(".spark").first();
  const tip = page.locator(".spark-tip").first();
  const read = async () => {
    const box = (await spark.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await expect(tip).toBeVisible();
    return [box, (await tip.boundingBox()) as { y: number; height: number }] as const;
  };
  // With room over the line, it's over it.
  const [line, over] = await read();
  expect(over.y + over.height).toBeLessThanOrEqual(line.y);
  // Scrolled to the window's top, it was cut off there: it's under the line, whole.
  await page.mouse.move(0, 0);
  await spark.evaluate((el) => scrollBy(0, el.getBoundingClientRect().top - 20));
  const [atTop, under] = await read();
  expect(under.y).toBeGreaterThanOrEqual(atTop.y + atTop.height);
  // Escape puts it away while the keyboard stays on the line, whose arrow keys bring it back.
  await page.mouse.move(0, 0);
  await spark.focus();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(spark).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tip).toBeVisible();
});

test("what joins two commands of an install command is never alone on a line", async ({ page }) => {
  // After a command too long for a line, which wraps inside, its && had a line of its own, and so
  // had the `bash` a long `curl` is piped to: what joins starts the next command's line.
  await open(page, longJoinedBundleUrl);
  const lone = await page.locator(".install code").evaluateAll((codes) =>
    codes.flatMap((code) => {
      const words = [...code.querySelectorAll(".word")].map((word) => ({
        text: word.textContent ?? "",
        top: Math.round(word.getBoundingClientRect().top),
      }));
      return words
        .filter(
          ({ text, top }, i) =>
            /^(&&|\|\|?|;)$/.test(text) &&
            // Alone, or last on its line with the command it joins on the next.
            words[i + 1]?.top !== top,
        )
        .map(({ text }) => `${text} in: ${code.textContent}`);
    }),
  );
  expect(lone).toEqual([]);
  await expect(page.locator(".install code .cmd").first()).toBeVisible();
});

test("a bundle's page says which of its skills work alone: all, some or none", async ({ page }) => {
  const alone = (b: typeof bundle) => b.agentReview.skills.filter((m) => m.standalone).length;
  const kinds: [said: string, is: (b: typeof bundle) => boolean][] = [
    ["Each also works alone.", (b) => alone(b) === b.agentReview.skills.length],
    ["None works alone: each needs the rest of the bundle.", (b) => alone(b) === 0],
    ["The others also work alone.", (b) => alone(b) > 0 && alone(b) < b.agentReview.skills.length],
  ];
  for (const [said, is] of kinds) {
    // The data may have no bundle of a kind, on some day.
    const found = data.bundles.find(is);
    if (!found) continue;
    await open(page, `/${bundlePage(found)}/`);
    await expect(page.locator("#skills + p")).toContainText(said);
    await expect(page.locator(".bundle-skills .kind")).toHaveCount(
      found.agentReview.skills.length - alone(found),
    );
  }
});

test("a repo's page lists its bundles and skills, and leads to the list", async ({ page }) => {
  await open(page, repo.url);
  await expect(page.locator("h1")).toContainText(repo.repo.split("/")[1]);
  await expect(page.locator(".skill-list > li")).toHaveCount(
    repo.bundles.length + repo.skills.length,
  );
  await page.getByRole("link", { name: "Sort and filter them in the skills list" }).click();
  await ready(page);
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(repo.repo)}`);
  await expect(page.locator(".repo-banner")).toContainText(repo.repo);
});

test("an owner's page lists every repo of theirs", async ({ page }) => {
  await open(page, owner.url);
  await expect(page.locator("h1")).toHaveText(new RegExp(`^${owner.url.slice(1, -1)}$`, "i"));
  await expect(page.locator("main section")).toHaveCount(owner.repos);
  await expect(page.locator(".skill-list > li")).toHaveCount(owner.rows);
  // The skills counted are the ones listed here, which may be few of a repo's own.
  await expect(page.locator(".lede")).toContainText(/^[\d,]+ skills? listed here, from /);
});

test("a repo's or a bundle's kind is a box as tall as its line, beside a name of any size", async ({
  page,
}) => {
  // Inline, it was as tall as its letters: 15px beside a repo's name on its owner's page, 18px
  // beside a page's name, 22px in a row.
  const kinds = (url: string) =>
    open(page, url).then(() =>
      page.locator(".kind").evaluateAll((all) =>
        all.map((kind) => {
          // A row off the screen isn't laid out.
          const row = kind.closest<HTMLElement>(".skill-list > li");
          if (row) row.style.contentVisibility = "visible";
          const where = kind.closest("h1, h2")?.tagName ?? (row ? "row" : "");
          const line = Number.parseFloat(getComputedStyle(kind).lineHeight);
          return { where, off: Math.abs(kind.getBoundingClientRect().height - line) };
        }),
      ),
    );
  const all = [...(await kinds(owner.url)), ...(await kinds(repo.url))];
  expect(new Set(all.map((kind) => kind.where))).toEqual(new Set(["H1", "H2", "row"]));
  expect(Math.max(...all.map((kind) => kind.off))).toBeLessThan(0.5);
});

test("an owner is spelled one way, on the way to their page as on it", async ({ page }) => {
  test.skip(!respelledOwner, "no owner's repos spell them in two ways today");
  if (!respelledOwner) return;
  // Each repo's crumbs spelled its own id's: agricidaniel led to the page of AgriciDaniel.
  await open(page, respelledOwner.url);
  const spelled = await page.locator("h1").innerText();
  for (const url of respelledOwner.repos) {
    await open(page, url);
    await expect(page.locator(".crumbs a").nth(1)).toHaveText(spelled);
    // And on the page of a skill of the repo.
    await page.locator(".skill-list > li h3 a").first().click();
    await ready(page);
    await expect(page.locator(".crumbs a").nth(1)).toHaveText(spelled);
  }
});

test("a repo's description ends with a full stop, where GitHub's own has none", async ({
  page,
}) => {
  test.skip(!unendedRepo, "every repo's description ends with a full stop today");
  if (!unendedRepo) return;
  await open(page, unendedRepo.url);
  await expect(page.locator(".lede")).toHaveText(`${unendedRepo.text}.`);
});

test("the tags page: its search narrows it, and a tag leads to the list", async ({ page }) => {
  await open(page, "/tags/");
  const input = page.locator("#tag-q");
  const sections = page.locator(".facet-doc");
  const all = await sections.count();
  // After each facet's question, how many of its tags a skill has, as a sentence of its own.
  const counts = await page.locator(".question .muted").allTextContents();
  expect(counts).toHaveLength(all);
  for (const count of counts) expect(count).toMatch(/^[A-Z][a-z ]+ per skill\.$/);

  await input.fill("security");
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  await expect(shown).not.toHaveCount(0);
  for (const text of await shown.allInnerTexts()) expect(text.toLowerCase()).toContain("security");
  const left = await sections.filter({ visible: true }).count();
  expect(left).toBeLessThan(all);
  // The links atop the page lead only to the facets that are left.
  await expect(page.locator(".toc a:visible")).toHaveCount(left);

  await input.fill("zzzqqq");
  await expect(page.locator("#tag-none")).toHaveText("No tag matches “zzzqqq”.");
  await expect(sections.filter({ visible: true })).toHaveCount(0);

  // A word finds a tag by its start, as in the skills list's search, not by its middle: "git"
  // found the tag whose meaning says "legitimate".
  await input.fill(insideWord.word);
  await expect(shown).not.toHaveCount(0);
  await input.fill(insideWord.end);
  await expect(page.locator("#tag-none")).toHaveText(`No tag matches “${insideWord.end}”.`);

  await input.fill("");
  await expect(sections.filter({ visible: true })).toHaveCount(all);
  await expect(page.locator(".toc a:visible")).toHaveCount(all);
  await expect(page.locator("#tag-none")).toBeHidden();

  // Stack is an open vocabulary: the page lists the stack tags the skills have, each with skills.
  const stack = page.locator("#facet-stack .cloud-item");
  await expect(stack).toHaveCount(stackTags.size);
  expect(await stack.locator(".tag").evaluateAll((tags) => tags.map((t) => t.dataset.tag))).toEqual(
    expect.arrayContaining([...stackTags]),
  );
  expect(await stack.locator(".n").allTextContents()).not.toContain("0");
  // No tag is cut in two at a line's end, where its halves would look like two tags.
  const cut = await page
    .locator(".cloud-item .tag")
    .evaluateAll((tags) => tags.filter((t) => t.getClientRects().length > 1).length);
  expect(cut).toBe(0);

  const tag = page.locator(".tag-table a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
});

test("the tags page finds a tag by its name as people write it, as next.js or c++", async ({
  page,
}) => {
  test.skip(respelledTags.length === 0, "no tag is written otherwise than its name today");
  // A tag's name is letters, digits and hyphens: stack:nextjs, stack:cpp. Typed as the thing is
  // called, the page said no tag matches.
  await open(page, "/tags/");
  for (const { typed, tag } of respelledTags) {
    await page.locator("#tag-q").fill(typed);
    await expect(
      page.locator(`#tag-sections .cloud-item a[data-tag="${tag}"]`),
      typed,
    ).toBeVisible();
    await expect(page.locator("#tag-none"), typed).toBeHidden();
  }
});

test("the tags page finds tags by the names over them, their facet's and their group's", async ({
  page,
}) => {
  await open(page, "/tags/");
  const input = page.locator("#tag-q");
  const shown = page.locator(".cloud-item:visible");
  const topics = data.facets.find((f) => f.id === "topic");
  // "Topics" found nothing: topics have no prefix, so nothing of theirs said the word.
  await input.fill(topics?.name ?? "");
  await expect(shown).toHaveCount(topics?.values?.length ?? 0);
  const group = topics?.groups?.[0];
  if (group) {
    await input.fill(group.name);
    await expect(shown).toHaveCount(group.values.length);
  }
});

test("a tag that no skill has isn't a link to an empty list", async ({ page }) => {
  test.skip(!unusedTag, "every tag of the vocabulary has a skill today");
  await open(page, "/tags/");
  // It led to "0 skills", and a column of facets that each said None.
  const chip = page.locator(`#tag-sections [data-tag="${unusedTag}"]`).first();
  await expect(chip).toBeVisible();
  expect(await chip.evaluate((el) => el.tagName)).toBe("SPAN");
});

test("the tags page keeps its search in its address, for a link and for the way back", async ({
  page,
}) => {
  await open(page, "/tags/");
  const input = page.locator("#tag-q");
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  await input.fill("security");
  await expect(page).toHaveURL("/tags/?q=security");
  // And in its title, for a tab, a bookmark or the history to tell it from the whole page.
  await expect(page).toHaveTitle("“security” · Tags · SkillHub");
  const found = await shown.count();
  expect(found).toBeGreaterThan(0);

  // To a tag's list and back: the box came back empty, with every tag.
  await shown.first().locator("a.tag").first().click();
  await ready(page);
  await page.goBack();
  await ready(page);
  await expect(input).toHaveValue("security");
  await expect(shown).toHaveCount(found);

  // And a link to a search opens on it.
  await open(page, "/tags/?q=zzzqqq");
  await expect(input).toHaveValue("zzzqqq");
  await expect(page.locator("#tag-none")).toHaveText("No tag matches “zzzqqq”.");
  await input.fill("");
  await expect(page).toHaveURL("/tags/");
  await expect(page).toHaveTitle("Tags · SkillHub");
});

test("a link to the tags page with a search shows no tag until its script has narrowed them", async ({
  page,
}) => {
  // The page's scripts, held back, as on a slow connection: under an empty box, every tag showed
  // meanwhile, then the page snapped to the few the search finds.
  const held: import("@playwright/test").Route[] = [];
  let released = false;
  await page.route("**/*", (route) => {
    if (released || route.request().resourceType() !== "script") return route.continue();
    held.push(route);
  });
  await page.goto("/tags/?q=security", { waitUntil: "commit" });
  await expect(page.locator("#tag-q")).toHaveValue("security");
  await expect(page.locator("html[data-pending]")).toHaveCount(1);
  await expect(page.locator("#tag-sections")).toBeHidden();
  await expect(page.locator(".toc")).toBeHidden();

  released = true;
  await Promise.all(held.map((route) => route.continue()));
  await ready(page);
  await expect(page.locator("html[data-pending]")).toHaveCount(0);
  await expect(page.locator("#tag-sections")).toBeVisible();
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  expect(await shown.count()).toBeGreaterThan(0);
  expect(await shown.count()).toBeLessThan(stackTags.size);
});

test("the way back within the tags page, from a facet's link, brings back the search it had", async ({
  page,
}) => {
  await open(page, "/tags/");
  const input = page.locator("#tag-q");
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  await input.fill("security");
  const found = await shown.count();
  // A facet's link makes an entry in the browser's history, with the search of that moment.
  await page.locator(".toc a:visible").first().click();
  await input.fill("design");
  await expect(page).toHaveURL(/\/tags\/\?q=design#facet-/);
  // The address went back to it, and the box and the tags stayed on what was typed since.
  await page.goBack();
  await expect(page).toHaveURL("/tags/?q=security");
  await expect(input).toHaveValue("security");
  await expect(shown).toHaveCount(found);
});

test("the tags a parent includes follow it in its table, in the order it names them", async ({
  page,
}) => {
  await open(page, "/tags/");
  const parent = page
    .locator(".tag-table tbody tr")
    .filter({ has: page.locator(".includes") })
    .first();
  const tagsOf = (tags: Element[]) => tags.map((tag) => (tag as HTMLElement).dataset.tag);
  const included = await parent.locator(".includes .tag").evaluateAll(tagsOf);
  expect(included.length).toBeGreaterThan(1);
  // In the data's order they came in another one than the line just over them, and than the
  // skills list's tags.
  const under = await parent.locator("xpath=following-sibling::tr/td[1]//a").evaluateAll(tagsOf);
  expect(under.slice(0, included.length)).toEqual(included);
});

test("a tag of the tags page is as tall among a facet's many as in a table", async ({ page }) => {
  await open(page, "/tags/");
  const height = async (selector: string) =>
    ((await page.locator(selector).first().boundingBox()) as { height: number }).height;
  // Inline, a topic's or a stack's was as tall as its letters, which touched its edges.
  expect(await height(".cloud .tag")).toBe(await height(".tag-table td:first-child .tag"));
});

test("the tags page's tables line up, whatever their tags and whatever the search hides", async ({
  page,
}) => {
  await open(page, "/tags/");
  // Where each table's second and third columns start.
  const columns = () =>
    page
      .locator(".tag-table:visible")
      .evaluateAll((tables) =>
        tables.map((table) =>
          [...table.querySelectorAll("th")].slice(1).map((th) => th.getBoundingClientRect().left),
        ),
      );
  const all = await columns();
  expect(all.length).toBeGreaterThan(3);
  const lined = (tables: number[][]) => {
    for (const table of tables)
      table.forEach((left, column) => expect(Math.abs(left - all[0][column])).toBeLessThan(0.5));
  };
  lined(all);
  await page.locator("#tag-q").fill("git");
  lined(await columns());
});

test("a link to a part of a page leaves some air over its heading", async ({ page }) => {
  await open(page, "/tags/");
  await page.locator(".toc a").nth(2).click();
  const target = decodeURIComponent(new URL(page.url()).hash);
  expect(
    await page.locator(target).evaluate((el) => el.getBoundingClientRect().top),
  ).toBeGreaterThan(12);
});

test.describe("on a tablet, 768px wide", () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test("a skill's numbers are two tiles a line, as on a wider screen", async ({ page }) => {
    // One a line from 900px down, each as wide as the page, though two fit at a phone's width each.
    await open(page, skillUrl);
    const tiles = page.locator(".stat-tiles .stat");
    const [first, second] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()];
    expect(first?.y).toBe(second?.y);
    expect(second?.x).toBeGreaterThan(first?.x ?? 0);
  });

  test("the tags page's tables have the room for whole tags", async ({ page }) => {
    await open(page, "/tags/");
    const tags = page.locator(".tag-table td:first-child .tag");
    await expect(tags).not.toHaveCount(0);
    // They broke after their prefix, or inside their value, as on a phone, beside half a page of
    // room.
    const lines = await tags.evaluateAll((all) =>
      all.map((tag) =>
        Math.round(
          tag.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(tag).lineHeight),
        ),
      ),
    );
    expect(Math.max(...lines)).toBe(1);
  });
});

test("the about page counts what the site lists, and explains each row", async ({ page }) => {
  await open(page, "/about/");
  const listed = page.locator(".breakdown tr", {
    has: page.getByRole("button", { name: "About Listed", exact: true }),
  });
  await expect(listed.locator(".num")).toContainText(n(data.skills.length));
  await expect(page.locator(".lede")).toContainText(n(data.skills.length));

  // A click pins a row's explanation open; Escape closes it.
  const tip = listed.locator(".tip-text");
  await expect(tip).toBeHidden();
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  // So does a second click, though the first gave its button the focus, which shows it too.
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeVisible();
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
});

test("the about page's count of skills waiting for an agent review leads to them", async ({
  page,
}) => {
  const { qualified } = readCrawl();
  await open(page, "/about/");
  const waiting = page.locator(".breakdown tr", {
    has: page.getByRole("button", { name: "About Waiting for agent review", exact: true }),
  });
  const link = waiting.locator(".num a");
  await expect(link).toHaveText(n(qualified.length));
  // A digit wide at times, such as 0: with the room around it to click or tap.
  const box = (await link.boundingBox()) as { width: number; height: number };
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  await link.click();
  await ready(page);
  await expect(page).toHaveURL("/queue/");
  await expect(page.locator("h1")).toHaveText("Waiting for agent review");
  // What waits here, also while nothing does: the page then said that and nothing else.
  // With the minimums in numbers, which "the minimum installs and stars" left to the About page.
  await expect(page.locator(".lede")).toContainText(
    `at least ${n(MINIMUMS.installs)} installs and ${n(MINIMUMS.stars)} stars`,
  );
  // Each of them, in crawl.jsonc's order, most downloaded first: a listed one links to its
  // skills.sh page, which an unlisted one doesn't have yet, and each to its repo.
  const rows = page.locator(".queue-table tbody tr");
  await expect(rows).toHaveCount(qualified.length);
  // Read at once and compared in one `expect`, not row by row: the queue can hold thousands of
  // rows, such as after the minimums went down. An `expect` on the page is a round trip to the
  // browser, and three a row outlasted the test's time at the 1,185th of 1,927 rows; even off the
  // page, 22,000 of them took 24 s.
  const shown = await rows.evaluateAll((all) =>
    all.map((row, i) => ({
      row: i + 1,
      name: row.querySelector(".queue-name")?.textContent ?? "",
      page: row.querySelector(".queue-name a")?.getAttribute("href") ?? null,
      repo: row.querySelector(".queue-repo")?.getAttribute("href") ?? null,
    })),
  );
  const wrong = shown.filter(({ name, page, repo }, i) => {
    const skill = qualified[i];
    const itsPage = skill["skills.sh"].unlisted ? null : skill["skills.sh"].url;
    const itsRepo = `https://github.com/${skill.repo}`;
    return !name.includes(skill.name) || page !== itsPage || repo !== itsRepo;
  });
  // How many rows are wrong, and the first of them: all of them could run to thousands of lines.
  expect({ wrong: wrong.length, first: wrong.slice(0, 5) }).toEqual({ wrong: 0, first: [] });
  // A row's two links, each a line of text tall, are far enough apart for a finger to tell them
  // apart: 24px from middle to middle. They were 21px.
  const listed = rows.filter({ has: page.locator(".queue-name a") }).first();
  if (await listed.count()) {
    const middle = async (selector: string) => {
      const box = (await listed.locator(selector).boundingBox()) as { y: number; height: number };
      return box.y + box.height / 2;
    };
    expect((await middle(".queue-repo")) - (await middle(".queue-name a"))).toBeGreaterThanOrEqual(
      24,
    );
  }
});

test("the about page shows one explanation at a time", async ({ page }) => {
  await open(page, "/about/");
  const rows = page.locator(".breakdown tr");
  const shown = page.locator(".breakdown .tip-text:visible");
  const tipOf = (row: number) => rows.nth(row).locator(".tip-text");

  // The pointer's row's, over a pinned one, which is back once the pointer leaves the table: the
  // two showed together, one over the other's words.
  await rows.nth(3).locator(".tip-i").click();
  await expect(shown).toHaveCount(1);
  await rows.nth(4).locator("td").first().hover();
  await expect(tipOf(4)).toBeVisible();
  await expect(shown).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(tipOf(3)).toBeVisible();
  await expect(shown).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(shown).toHaveCount(0);

  // And the keyboard's row's, over the pointer's.
  await rows.nth(1).locator(".tip-i").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(rows.nth(1).locator(".tip-i")).toBeFocused();
  await rows.nth(6).locator("td").first().hover();
  await expect(tipOf(1)).toBeVisible();
  await expect(shown).toHaveCount(1);

  // Wherever the keyboard is on its row: on its number, where that's a link, as the Waiting row's
  // to the queue, a pinned one showed with it, the two over each other.
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await rows.nth(0).locator(".tip-i").focus();
  await page.keyboard.press("Enter");
  await expect(tipOf(0)).toBeVisible();
  const link = rows.nth(1).locator(".num a");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(tipOf(1)).toBeVisible();
  await expect(shown).toHaveCount(1);
});

/** A row's explanation, once the pointer is on the row: its box, and how far its arrow is from the row's number. */
async function explanationOf(page: import("@playwright/test").Page, row: number) {
  const tr = page.locator(".breakdown tr").nth(row);
  await tr.locator("td").first().hover();
  await expect(tr.locator(".tip-text")).toBeVisible();
  return tr.evaluate((el) => {
    const tip = el.querySelector(".tip-text") as HTMLElement;
    const box = tip.getBoundingClientRect();
    // The number's own letters: its cell is wider, and holds the explanation too.
    const number = document.createRange();
    number.selectNodeContents((el.querySelector(".num") as Element).firstChild as Node);
    const digits = number.getBoundingClientRect();
    // The arrow is a square of 8px, turned: its middle is 4px under its top.
    const arrowTop = Number.parseFloat(getComputedStyle(tip, "::after").top);
    return {
      bottom: box.bottom,
      // How far down the explanation its arrow is: 11px, and further once it's lifted.
      arrowTop,
      arrowOff: box.top + arrowTop + 4 - (digits.top + digits.height / 2),
      rowBottom: el.getBoundingClientRect().bottom,
    };
  });
}

test("an explanation of the about page's table points at its row's number", async ({ page }) => {
  await open(page, "/about/");
  const rows = await page.locator(".breakdown tr").count();
  // Whatever the row's own padding: hung from the row's top, the arrow was 5px over the number on
  // the rows with the most of it, and 7 on By script.
  for (let row = 0; row < rows; row++)
    expect(Math.abs((await explanationOf(page, row)).arrowOff), `row ${row}`).toBeLessThan(2);
});

test.describe("in a laptop's window, 650px tall", () => {
  test.use({ viewport: { width: 1366, height: 650 } });

  test("an explanation of a row near the window's bottom is lifted into it", async ({ page }) => {
    await open(page, "/about/");
    const rows = await page.locator(".breakdown tr").count();
    let lifted = 0;
    for (let row = 0; row < rows; row++) {
      const tip = await explanationOf(page, row);
      // A row the window cuts itself is the page's to scroll to.
      if (tip.rowBottom > 650) continue;
      // Hung down from its row, the last rows' were cut by the window, some by half their words.
      expect(tip.bottom, `row ${row}`).toBeLessThanOrEqual(650);
      // And its arrow is still on its row.
      expect(Math.abs(tip.arrowOff), `row ${row}`).toBeLessThan(2);
      if (tip.arrowTop > 12) lifted++;
    }
    expect(lifted).toBeGreaterThan(0);
  });
});

test("About explanations dismiss with Escape under the pointer and keep keyboard focus", async ({
  page,
}) => {
  await open(page, "/about/");
  const rows = page.locator(".breakdown tr");
  const row = rows.nth(3);
  const button = row.locator(".tip-i");
  const tip = row.locator(".tip-text");

  await row.locator("td").first().hover();
  await expect(tip).toBeVisible();
  // Escape must dismiss the words even when the pointer stays on the row that showed them.
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await page.mouse.move(0, 0);
  await row.locator("td").first().hover();
  await expect(tip).toBeVisible();

  await button.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(button).toBeFocused();
  // Keeping the dismissed button's focus must not suppress the pointer's next explanation.
  await rows.nth(4).locator("td").first().hover();
  await expect(rows.nth(4).locator(".tip-text")).toBeVisible();
  await expect(button).toBeFocused();
  // Tab goes on from the dismissed explanation, and opens the next one.
  await page.keyboard.press("Tab");
  await expect(rows.nth(4).locator(".tip-i")).toBeFocused();
  await expect(rows.nth(4).locator(".tip-text")).toBeVisible();

  // Two explicit clicks also close a pinned explanation, despite hover and focus.
  await button.click();
  await expect(tip).toBeVisible();
  await button.click();
  await expect(tip).toBeHidden();
});

test.describe("in a window 960px wide, where an explanation goes under its row", () => {
  test.use({ viewport: { width: 960, height: 900 } });

  test("the about page explains each row the pointer goes down to", async ({ page }) => {
    await open(page, "/about/");
    const rows = page.locator(".breakdown tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
    // Down the labels, as someone reading the table: an explanation lies over the next rows, and
    // kept the pointer that came down onto it, so that every other row showed none.
    for (let row = 0; row < count; row++) {
      const label = (await rows.nth(row).locator("td").first().boundingBox()) as {
        x: number;
        y: number;
        height: number;
      };
      await page.mouse.move(label.x + 80, label.y + label.height / 2, { steps: 4 });
      await expect(rows.nth(row).locator(".tip-text")).toBeVisible();
      await expect(page.locator(".breakdown .tip-text:visible")).toHaveCount(1);
    }
  });
});

test("the list's tagline and the about page give the same number of reviewed skills", async ({
  page,
}) => {
  await open(page, "/about/");
  const row = page.locator(".breakdown tr", {
    has: page.getByRole("button", { name: "About Reviewed", exact: true }),
  });
  // innerText leaves out the row's hidden tooltip, which is in the same cell.
  const reviewed = (await row.locator(".num").innerText()).trim();
  expect(reviewed).toMatch(/^[\d,]+$/);
  await expect(page.locator(".lede")).toContainText(`selected from ${reviewed} reviewed skills`);
  await open(page, "/");
  await expect(page.locator(".list-sub")).toContainText(`from ${reviewed} reviewed skills`);
});

test.describe("a page that doesn't exist", () => {
  test.use({ expected: /\b404\b/ });

  test("says so, and leads back to the skills", async ({ page }) => {
    const response = await page.goto("/no-such-page/");
    expect(response?.status()).toBe(404);
    await ready(page);
    await expect(page.locator("h1")).toHaveText("Page not found");
    // The tab says what the page says: it said "Not found".
    await expect(page).toHaveTitle("Page not found · SkillHub");
    await page.locator("main a").click();
    await ready(page);
    await expect(page).toHaveURL("/");
  });

  test("an address with capitals, as GitHub writes some names, leads to its page", async ({
    page,
  }) => {
    // The pages' addresses are lowercase: in capitals there's none, until it's tried in lowercase.
    await page.goto(skillUrl.toUpperCase());
    await expect(page).toHaveURL(skillUrl);
    await ready(page);
    await expect(page.locator("h1")).toHaveText(skill.name);
  });

  test("a bundle's address with its repo's capitals, as it once was, leads to its page", async ({
    page,
  }) => {
    const cased = data.bundles.find((b) => b.id !== b.id.toLowerCase());
    test.skip(!cased, "no bundle's id has capitals today");
    if (!cased) return;
    await page.goto(`/bundle/${cased.id}/`);
    await expect(page).toHaveURL(`/${bundlePage(cased)}/`);
    await ready(page);
    await expect(page.locator("h1")).toContainText(cased.agentReview.name);
  });

  test("a bundle's address with an @, as it once was, leads to its page", async ({ page }) => {
    const named = data.bundles.find((b) => b.id.includes("@"));
    test.skip(!named, "no bundle's id has a name after its repo today");
    if (!named) return;
    // With the @, and with the %40 that the address bar had for it: what was copied from there.
    for (const at of ["@", "%40"]) {
      await page.goto(`/bundle/${named.id.toLowerCase().replace("@", at)}/`);
      await expect(page).toHaveURL(`/${bundlePage(named)}/`);
      await ready(page);
      await expect(page.locator("h1")).toContainText(named.agentReview.name);
    }
  });

  /** The addresses the page goes to, in order, from the next navigation on. */
  const loads = (page: import("@playwright/test").Page) => {
    const urls: string[] = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) urls.push(r.url());
    });
    return urls;
  };

  /** Once on the page, a second passes without it going elsewhere. */
  async function staysPut(page: import("@playwright/test").Page, urls: string[]) {
    await ready(page);
    await expect(page.locator("h1")).toHaveText("Page not found");
    const count = urls.length;
    await page.waitForTimeout(1000);
    expect(urls.slice(count)).toEqual([]);
  }

  test("an address with an escape, such as a comma's, is tried in lowercase once", async ({
    page,
  }) => {
    // Cloudflare writes an escape in capitals, and redirects %2c to %2C. The retry in lowercase
    // made it %2c again, and the two went back and forth without end.
    const urls = loads(page);
    await page.goto("/No-Such/Page%2c%20Here/");
    await expect(page).toHaveURL("/no-such/page%2C%20here/");
    await staysPut(page, urls);
    // Between the two, Cloudflare's own redirect, to /No-Such/Page%2C%20Here/: not on Vike's dev
    // server, which answers the address as it's written. Either way the lowercase one comes once.
    const paths = urls.map((url) => new URL(url).pathname);
    expect(paths.filter((path) => path !== "/No-Such/Page%2C%20Here/")).toEqual([
      "/No-Such/Page%2c%20Here/",
      "/no-such/page%2C%20here/",
    ]);
  });

  test("a retry in lowercase that the server sends back isn't tried again", async ({ page }) => {
    await page.route("**/no-such-page/", (route) =>
      route.fulfill({ status: 307, headers: { location: "/No-Such-Page/" } }),
    );
    const urls = loads(page);
    await page.goto("/No-Such-Page/");
    await staysPut(page, urls);
    expect(urls.map((url) => new URL(url).pathname)).toEqual([
      "/No-Such-Page/",
      "/no-such-page/",
      "/No-Such-Page/",
    ]);
  });
});

test("a bundle's page is at the address its links have, with no redirect on the way", async ({
  page,
}) => {
  // One with a name after its repo: its address had its id's @, which Cloudflare redirects to
  // %40, so each link to it cost a redirect, and the address bar read skills%40writing.
  const named = data.bundles.find((b) => b.id.includes("@")) ?? bundle;
  const url = `/${bundlePage(named)}/`;
  const response = await page.goto(url);
  expect(response?.request().redirectedFrom()).toBeNull();
  await ready(page);
  await expect(page).toHaveURL(url);
  await expect(page.locator("h1")).toContainText(named.agentReview.name);
});

test("the header leads to every page, and marks the one you're on", async ({ page }) => {
  await open(page, "/");
  const nav = page.locator(".site-links");
  for (const [name, url] of [
    ["Tags", "/tags/"],
    ["About", "/about/"],
  ]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await ready(page);
    await expect(page).toHaveURL(url);
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await expect(nav.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/brillout/skillhub",
  );
  await page.locator(".brand").click();
  await ready(page);
  await expect(page).toHaveURL("/");
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system until the toggle says otherwise, which a reload keeps", async ({
    page,
  }) => {
    await open(page, "/about/");
    const html = page.locator("html");
    const toggle = page.locator("[data-theme-toggle]");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await ready(page);
    await expect(html).toHaveAttribute("data-theme", "light");

    // Toggled back to what the system says, it follows the system again: kept as a choice, dark
    // stayed dark whatever the system turned to since.
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});

/** The files a page loads that are named after their content: none on Vike's dev server, which serves the source files. */
async function builtFiles(page: import("@playwright/test").Page): Promise<string[]> {
  await open(page, "/about/");
  const files = await page
    .locator('link[rel="stylesheet"], link[rel="preload"], script[src]')
    .evaluateAll((all) => all.map((el) => el.getAttribute("href") ?? el.getAttribute("src") ?? ""));
  return files.filter((file) => file.startsWith("/assets/"));
}

test("search engines are sent to a sitemap of every page", async ({ page }) => {
  // The build writes the sitemap: Vike's dev server has none.
  test.skip((await builtFiles(page)).length === 0, "the dev server has no sitemap");
  // Each answered with the Not found page, as the site does for a file it lacks.
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const lines = (await robots.text()).split("\n");
  expect(lines).toContain("Sitemap: https://skillhub.build/sitemap.xml");
  // Not from the pages: only from the API, whose login leads to GitHub.
  expect(lines.filter((line) => line.startsWith("Disallow:"))).toEqual(["Disallow: /api/"]);

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const listed = [...(await sitemap.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc);
  expect(new Set(listed).size).toBe(listed.length);
  // A page of each kind, at the address it's live at.
  for (const path of [
    "/",
    "/about/",
    "/queue/",
    "/tags/",
    skillUrl,
    bundleUrl,
    repo.url,
    owner.url,
  ])
    expect(listed).toContain(`https://skillhub.build${path}`);
  // And every skill and bundle: each has a page.
  expect(listed.length).toBeGreaterThan(data.skills.length + data.bundles.length);
  expect(listed.filter((loc) => !loc.endsWith("/"))).toEqual([]);
});

test("the files named after their content may be kept by the browser for good", async ({
  page,
}) => {
  const named = await builtFiles(page);
  // Vike's dev server serves the source files, under their own names.
  test.skip(named.length === 0, "the dev server's files aren't named after their content");
  // Asked again at each page, they were seven requests before a page could show.
  for (const file of named) {
    const res = await page.request.get(file);
    expect(res.headers()["cache-control"], file).toContain("immutable");
  }
  // Not the pages, which change with each deploy under the same address.
  const again = await page.request.get("/about/");
  expect(again.headers()["cache-control"] ?? "").not.toContain("immutable");
});

test("a refused install copy explains how to copy manually, and can be retried", async ({
  page,
}) => {
  await open(page, skillUrl);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.locator(".install .copy").click();
  await expect(page.getByRole("status")).toContainText("Select the command and copy it manually");
  await expect(page.locator(".install .copy")).not.toHaveAttribute("data-copied");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.evaluate(() => {
    delete (navigator.clipboard as unknown as Record<string, unknown>).writeText;
  });
  await page.locator(".install .copy").click();
  await expect(page.locator(".install .copy")).toHaveAttribute("data-copied", "");
});
