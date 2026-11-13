---
name: test-site
description: Run SkillHub's site and verify a change to it. Start it locally with a test login, drive it in a browser, and run the checks CI runs before it deploys, the Worker's tests and the end-to-end walk included. Use when asked to run, start, test, verify, debug or screenshot the site, when writing a test for it, and before pushing any change to website/, worker/ or e2e/.
---

# Run and test the site

A push to `main` goes live within four minutes, so check a change before pushing it.

## Check a change

```bash
pnpm check                      # the data files and the types: 5 s
pnpm test:worker                # the Worker's tests, worker/index.test.ts: 5 s
pnpm test:e2e                   # the end-to-end walk, e2e/: 2.5 min
pnpm build && pnpm check:site   # the built site's links, ids and sitemap: 15 s
```

CI runs all four, in `.github/workflows/deploy.yml`, and deploys only when they pass. A failed walk in CI leaves its screenshots as the run's `test-results` artifact.

After the deploy, CI asks the live site whether it's that deploy and answers as it should: its pages are the build's, its API reaches its database, and Log in leads to GitHub with the OAuth App's id. That's `pnpm check:live`, which only reads, so you can run it too: 5 s. Whether a push is live yet: `https://skillhub.build/version.txt` is the commit that is.

`pnpm test:e2e` uses whatever serves `localhost:3000`, such as a `pnpm dev` you left running. With nothing there, it builds the site and starts `pnpm preview` itself. It does the same on port 3100 for the edge cases' site, below. One test: `pnpm test:e2e -g "part of its name"`. One file: `pnpm test:e2e e2e/list.spec.ts`.

Don't edit a file while the walk runs against `pnpm dev`: the edit reloads the pages under the tests, which then fail with "Execution context was destroyed".

## Run it

```bash
pnpm dev             # the site at http://localhost:3000, with hot reload
pnpm dev --fresh     # the same, from an empty database
pnpm preview         # the built site, as Cloudflare serves it: run pnpm build first
pnpm dev:stop        # stop every one running in this checkout, from anywhere
```

- **Ready:** it prints a line starting with `Ready:` once the site and the Worker answer. Started in the background, wait for that line, or for `http://localhost:3000/api/me` to answer.
- **Ports:** 3000 for the site, and in `pnpm dev` 8787 for the Worker, which the site proxies `/api/*` to. A taken port fails at once: run `pnpm dev:stop`, then start again.
- **Stopping:** Ctrl-C, or `pnpm dev:stop`. A `kill` of `pnpm dev` itself does nothing, as pnpm doesn't pass the signal on.
- **404s and trailing slashes** behave as in production only in `pnpm preview`.

## The edge cases: states today's data has no example of

The pages handle states that the real data lacks on most days, so neither the eye nor a test of the real site sees them: a skill without a TLDR, with a TLDR that has no glance, without a copy of its SKILL.md, with unknown installs, weekly installs, first-seen date or stars, one flagged `republished`, one whose repo has one star, one with a week of one download, one that took off after months almost unused and one that only had a bad week, a bundle without a TLDR, and a bundle whose skills have no numbers. Some go live unreviewed, such as a skill approved but without its TLDR yet.

`SKILLHUB_DATA=edge-cases` puts a second site beside the real one, whose catalog of some twenty entries has one for each of those states, named after it, such as `no-tldr`:

```bash
SKILLHUB_DATA=edge-cases pnpm dev                              # http://localhost:3100
SKILLHUB_DATA=edge-cases pnpm build                            # into website/dist-edge-cases/
SKILLHUB_DATA=edge-cases pnpm preview
SKILLHUB_DATA=edge-cases pnpm check:site
```

- **It's carved out of the real data,** by `data/edge-cases.ts`: each entry is a real skill or bundle with one thing taken away. A new state is one more entry in `SKILL_CASES` or `BUNDLE_CASES` there, and a test in `e2e/edge-cases.spec.ts`.
- **It runs beside the real site:** ports 3100 and 8887, its own build directory, which a deploy can't take, and its own database, in `.wrangler/edge-cases/`.
- **When you change how a page renders something that can be missing,** look at it there, and run its walk: `pnpm test:e2e e2e/edge-cases.spec.ts`.

## Log in and save

Locally, Log in logs you in as a test user at once, without GitHub: see `DEV_LOGIN` in `worker/index.ts`. There's only that one user.

The database is in `.wrangler/state/` and keeps what you saved between runs. Read or change it while the site runs:

```bash
pnpm exec wrangler d1 execute skillhub --local --command "SELECT * FROM saves"
```

That's also how to reach states the pages can't set up fast, such as the most a person can save: insert 1,000 rows for user `0`, then save one more.

## The Worker's tests

Logging in with GitHub can't run locally, nor in the walk. `worker/index.test.ts` covers it, and the rest of the API: it runs `worker/index.ts` in Miniflare, the runtime `wrangler dev` uses, with a database of its own and with GitHub played by the tests, by GitHub's rules.

- **One test:** `pnpm run node-ts --test --test-name-pattern "part of its name" worker/index.test.ts`. The pattern goes before the file.
- **A browser** there is a `Browser`, which keeps its cookies; `logIn(browser)` takes it through GitHub and back.
- **An error the Worker logs fails the test,** unless the test expects it.
- **After a wrangler upgrade,** give `miniflare` in `package.json` the version wrangler pins: a test says so when they differ.

## Drive it in a browser

The pages are pre-rendered, so they show before their controls work. Wait for what the page says about itself, never for a fixed time:

| Wait for                        | Meaning                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `html[data-ready]`              | The page's script ran: its controls work                                        |
| `html[data-account]`            | The API told who's logged in: the Save buttons and the Saved switch show it     |
| `html[data-search-words]`       | The search looks through the TLDRs' prose too; until then it finds fewer skills |
| no `#results[aria-busy="true"]` | The list a change leads to is complete                                          |

`networkidle` isn't one of them: in `pnpm dev` it fires before the home page's script runs.

- **Selectors:** the controls carry what they do, such as `[data-preset="top"]`, `[data-tag="type:workflow"]`, `[data-show="bundles"]`, `[data-save]`, `#q`, `#sort`, `#saved-switch`, and their state in `aria-pressed`, `aria-expanded` and `aria-checked`.
- **Rows off the screen aren't drawn:** each counts as a typical row's height until it's scrolled to, and its `innerText` is empty until then. Read a row's text with `textContent`. A full-page screenshot shows them blank: scroll to them, or add `.skill-list > li { content-visibility: visible }` for the picture.
- **The whole list is heavy:** `/` holds some 90,000 elements. Whatever reads the whole page is slow there: axe takes 30 s, and Playwright describes the whole page on every retry of an `expect` that starts out wrong on an element that isn't visible, which stalls the page for seconds. Use a shorter list for such things, such as `/?show=bundles` or a search.
- **A row's preview,** on a screen 1,151px wide or wider, opens on a click on the row, and takes the keyboard's focus. It follows the pointer when the pointer moves, not when the list scrolls under it: after a scroll, move it. And it comes back with its list on a reload and on the way back: to open the same list without it, go through another page first, such as `about:blank`.
- **Screens:** the tests use 1440×900, and 390×844 for a phone. Dark mode is the header's toggle, or Playwright's `colorScheme: "dark"`.
- **The widths in between have layouts of their own,** which hardly a test opens: up to 480px what follows a row's name, its repo and its bundle, is under its name and buttons, as wide as the row, and a row's Save is its bookmark alone; up to 600px the header's links are on a line above the site's name, and the agent's button under its box; up to 900px the tags are above the list, behind their count, and the settings behind Filters; up to 1,150px the two search boxes are one under the other, and a row's numbers under its words; up to 1,230px what follows a row's name is under it again, beside All details; up to about 1,275px Show is on a second line. Look at them when a change touches the layout: a window that takes half a screen is some 960px wide.
- **Whether a page scrolls sideways** is `document.documentElement.scrollWidth > clientWidth`. The pages hardest to fit are the ones `e2e/data.ts` picks as `longLabelUrl` and `longWordUrl`, which the walk opens at a phone's width. `pnpm build && pnpm check:widths` opens every page, at the narrowest width of each of those layouts, or at the widths you give it: a minute a width, so it isn't one of CI's checks. Run it after a change to the layout, or to what a page can hold.
- **The app's own functions:** in a `pnpm dev` page, `await import("/list.ts")` gives them with the real data, such as `parse` and `query`.

## Write a test

Add it to the spec in `e2e/` that covers its page, with the helpers of `e2e/fixtures.ts`: `open`, `ready`, `settled`, `searchable`, `accountLoaded`.

- **No numbers, no names:** the data changes every day. `e2e/data.ts` derives what the pages should show from the data files, such as the skill and the bundle to test with.
- **Any browser error fails a test:** console errors, uncaught exceptions, failed requests and error responses. A test that brings one about on purpose, such as a 404, says so with `test.use({ expected: /…/ })`.
- **The account's tests share the one test user,** so they're in `account.spec.ts`, which runs in order and starts each test from nothing saved. Tests elsewhere don't log in.
- **A test that can't fail proves nothing:** break what it's about, see it fail, then put it back.
