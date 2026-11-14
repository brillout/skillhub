---
name: review-skills
description: Review the skills SkillHub knows of. Approve or disqualify the qualified skills in crawl.jsonc, add a skill to skills.jsonc, tag or retag one, record a bundle of skills, and write or refresh the TLDRs of skills and bundles, the summaries the site shows people browsing skills. Use when asked to work through the qualified skills (the queue), to add, approve, disqualify (skip), tag, retag or review skills, to record a bundle, or to write, update or review TLDRs, such as catching up on the skills whose SKILL.md has drifted most from its TLDR.
---

# Review skills

Reviewing a skill is deciding whether the site lists it and writing what the site says about it: its tags, its bundle and its TLDR, all in its `agentReview`.

## Skills and their states

Every skill SkillHub knows of has one state, under its skills.sh page:

- **Approved:** shown on the site, with tags, a TLDR and a copy of its SKILL.md. In `data/skills.jsonc`.
- **Qualified:** in the skills.sh all-time top 600, or further down skills.sh's sitemap, at the minimums or above (`MINIMUMS` in `data/params.ts`: all-time installs, and its repo's GitHub stars), or by a whitelisted author (`WHITELISTED_AUTHORS` in `data/params.ts`) whatever its numbers, waiting for an agent to approve or disqualify it. In `data/crawl.jsonc`. A whitelisted author's skill can be there before skills.sh lists it, which it does once someone installs it: the crawl also reads the SKILL.md files beside their listed skills, in the same folder of the same repo, such as `skills/polish` beside `skills/refactor`, and records one skills.sh doesn't list yet as `unlisted`, with no numbers, under the page skills.sh will give it.
- **Unqualified:** found by the crawl, but under the minimums. In `data/crawl.jsonc`.
- **Disqualified:** not shown, with its `reason`, and no other agent data: no tags, no TLDR, no copy. In `data/crawl.jsonc`.

The daily crawl (`pnpm run crawl`) records new skills and moves them between qualified and unqualified. The daily sync disqualifies an approved skill whose SKILL.md is gone from its repo, unless that would leave its bundle fewer than two skills, as when a repo moves all its skills: the sync then leaves them as they are and fails, naming the bundle, until someone moves the bundle to where its skills are now, or removes it. The two files are cumulative: a skill never leaves them, only its state changes, and `pnpm run check` fails when a skill has two states. `Crawl` in `data/types.ts` describes crawl.jsonc.

Both files are JSONC and may hold comments, which the scripts keep. Edit them in place, or in code with `readData`/`writeData` and `readCrawl`/`writeCrawl` of `scripts/data.ts`; `JSON.parse` and `JSON.stringify` would drop the comments.

## Work through the qualified skills

- The user decides each time how many skills, or which ones. If they didn't say, ask, and recommend a number.
- Take a repo's qualified skills together: skills.sh counts an install of a repo once per skill in it, so its skills arrive together, and they may form a bundle.
- Read each skill's SKILL.md on GitHub, then disqualify it or approve it.

**Disqualify** a skill the site shouldn't show: move it from `qualified` to `disqualified`, as its skills.sh page (`url`) and its `reason`, `{"agentReview": {"note": "…", "model": "…", "effort": "…"}}`: one sentence saying why, such as "Tool docs: an agent's manual for aws.", with your model and effort as for an approved skill. Write nothing else about it. When its SKILL.md is gone from its repo, the reason is `{"goneFromRepo": "<today, YYYY-MM-DD>"}` instead. Disqualify:

- Tool docs: documentation for agents of one product, how to build with it, configure it, deploy to it or operate it, such as a framework's best practices or a cloud's CLI. They only matter once someone has chosen the product, so browsing them discovers nothing. A skill that gets a job done through a tool, such as browsing, testing, scraping, searching or generating media, isn't tool docs: there, the tool is how, not what. But see the next point.
- Vendor paid service: a skill whose job runs on one vendor's paid service, its API, MCP server, hosted agent or cloud, so it only works with an account there, such as `scoutqa-test`, which runs its tests on ScoutQA's cloud, or `fal-ai-media`, which generates media through fal.ai's MCP. It helps discovery, but it reads as an ad for the service, whoever publishes it, so SkillHub leaves it out. Paid means the service sells plans or credits, even with a free tier. The note says where the job runs: "Vendor paid service: it runs its job on ScoutQA's cloud." These aren't:
  - A workflow where the agent does the job and a paid service supplies one part, such as a research workflow that scrapes through Firecrawl.
  - A skill that also works without the service, such as one where the service is optional or has a free alternative, or that lets you pick among several services.
  - A bundle's skill that the bundle needs, rather than an optional front end to a service. Take an optional one out of the bundle, and say in the bundle's TLDR that SkillHub doesn't list it.
  - A free tool that runs on your machine, even when its maker also sells a cloud, such as an open-source CLI run with your own LLM key. Nor a hosted service that works without signing up, such as Context7, or a skill whose job runs locally and only needs a free account.
  - A skill for a product you already work in, such as Figma, Stripe, Expo or App Store Connect: there, the product is what, not how.
- A retired skill, whose SKILL.md points to a replacement.
- A skill that isn't in English.
- A copy: a skill republished under another name, or an approved skill under a second skills.sh listing, such as its repo under an old name.
- Anything else the user doesn't want.

A **whitelisted author**'s skill (`WHITELISTED_AUTHORS` in `data/params.ts`) is always listed: disqualify it only when its SKILL.md is gone from its repo, it's retired, a copy (such as a workshop repo's copy of the author's own skill), not in English, or a project's own skill that only works inside its repo (such as one that deploys or verifies that project), or when the user says so. Tool docs and vendor paid services are approved.

**Approve** the others, with the steps below. Approving an unqualified or disqualified skill works the same way, when the user asks for it.

## Approve a skill, or retag one

1. Add its entry to `skills` in `data/skills.jsonc`, and take it out of `data/crawl.jsonc`. SkillHub only shows skills that are on GitHub and on skills.sh, or by a whitelisted author, `unlisted` or not: its `id` is where its SKILL.md lives on GitHub, as `Skill` in `data/types.ts` describes, and its `skills.sh` field comes from its entry in crawl.jsonc, and what you write about it, its description, tags and note, goes in its `agentReview`, with your `model` (such as "Claude Opus 5.5") and `effort` (low, medium, high, xhigh or max, or null when you don't know it). Its repo needs an entry in `repos`, with your `agentReview` of it, and its `stars` from the crawl.jsonc entry. The repo's `description` is its GitHub description in full: a page that cuts it short, such as a search's results, gives it with an ellipsis, which `pnpm run check` rejects. Whenever you change any part of an `agentReview`, such as retagging a skill, set its `model` and `effort` to yours.
2. Run `pnpm run sync <id>` to save a copy of its SKILL.md in `data/skill-snapshots/`.
3. Read that copy, not only the skill's one-line description, and tag it. Tag values and their meanings are under `facets` in `data/skills.jsonc`.
   1. Give it every `category:` that fits. Don't add a parent such as `category:software-engineering`: it comes with the categories it `includes`.
   2. Give it one `type:` and one `effect:`, judged by the skill's own steps.
   3. List every `needs:` value that applies. Use `needs:none` only when nothing does.
   4. Add a `stack:` tag for each technology or service the skill is about. Stack is the one facet that lists no values: it takes any. Reuse a tag other skills carry when one fits, rather than a new spelling of it: `grep -o '"stack:[^"]*"' data/skills.jsonc | sort | uniq -c | sort -rn` lists them.
   5. Add one to five topics, preferring existing ones.
   6. Add a `flag:` only with evidence, such as a matching original.
4. Have the tags reviewed. Tagging goes wrong often: a review of all 280 skills once corrected 59 of them, mostly effects, needs and categories that didn't match the skill's own steps. If you can start a subagent, give a fresh one only the copy, the `facets` of `data/skills.jsonc` and your tags, and ask it to check each tag against the SKILL.md and the tag's meaning, and to name any tag that's missing. Settle each disagreement by rereading the SKILL.md. Without subagents, recheck each tag against its meaning yourself.
5. Set `asOf.tags` in `data/skills.jsonc` to today's date: the tags page says when the tags were last assigned.
6. Check whether it belongs to a bundle (below).
7. Run `pnpm run check`, which rejects tags outside the vocabulary, then commit and push to `main`.
8. Write its TLDR (below).

## Bundles

A bundle is skills of one repo meant to be installed and used together, such as the steps of a workflow. A collection of unrelated skills, such as `anthropics/skills`, isn't one. Record a bundle in `bundles` in `data/skills.jsonc`, as `Bundle` in `data/types.ts` describes:

- Its `id` is the repo, or `<repo>@<name>` when the repo holds more than one bundle, or skills outside the bundle.
- All of it but its `id` goes in its `agentReview`; the sync keeps its `skew`.
- Its `skills` come in the order they're used. A skill is in one bundle at most, and only an approved skill can be in one.
- Mark a skill `standalone` when someone would install it alone and get something out of it, with no other skill of the bundle. One that loads another skill of the bundle, uses its files, or only works on another's output isn't, and gets a `note` saying what it needs. A soft mention, such as suggesting another skill for the next step, doesn't count.
- Give a standalone skill `listedOutsideBundle`: whether the skills list also shows it on a row of its own, besides its bundle's row. Ask whether people would want it without the rest of the bundle. `true` when it serves a wider audience than the bundle, such as `tdd` in an engineering-workflow bundle: its own row is a real discovery. `false` when whoever would want it would want the bundle too: a skill for the bundle's niche, such as `save-systems` in a game-dev bundle, or one of a family of siblings that only differ in what they cover, such as game genres, CTF categories or variants of one output style. `false` too for the skill the bundle is named after, such as `caveman` in Caveman: the bundle's row already is its row. Decide per skill: a bundle can hold both. A bundle's skills get installed together and rise together, so a whole family of rows would flood the list.
- Give it a one-sentence `description`, its `install` commands from the repo's README, each with a `label` saying where it works, and a TLDR (below).

Skills that are `listedOutsideBundle` keep a row of their own in the skills list; the others are only listed inside their bundle's row.

## TLDRs

A TLDR explains a skill, or a bundle of skills, to a person browsing the site, so they can tell at a glance what it is and whether they want it. It's written from the skill's SKILL.md and records a permalink to the version it summarizes. Until a skill has one, the site shows its one-line `description` instead.

### 1. Pick what to write

Start from an up-to-date checkout of `main`. Then list the skills and bundles whose TLDR is missing or behind:

```bash
pnpm run tldr 20    # the 20 with the largest skew: skew, id, the copies to read
```

The skew is how many words the SKILL.md gained or lost since its TLDR was written, or its whole word count when there's no TLDR yet. Only approved skills, the ones in `data/skills.jsonc`, get a TLDR: disqualified ones get no agent data.

### 2. Read

- **A skill:** its copy, `data/skill-snapshots/<id>.md`. Write from the body. The frontmatter `description` is a trigger for agents, not a summary for people. When the body sends the agent to other files of the skill for the substance, read them on GitHub at the commit in the skill's `skillMd.version`.
- **A bundle:** the copies of all its skills, in the order its entry in `bundles` lists them, and the repo's README for how they fit together.
- **Its neighbours:** the other skills of its repo, and skills with the same topic tags, so you can say how it differs.

For a refresh, read what changed since the TLDR's permalink, and keep what still holds.

### 3. Write

A TLDR has two parts:

- **`glance`**: short labelled facts that place the skill at a glance. The skills list shows the first two, the skill's page shows them all, so put the most telling first. Suggested labels, none required, and invent your own when none fits: **Use it when**, **It does**, **You get**, **Unlike**, **Part of**, **Also called**, **Needs**, **Keeps**, **Runs**, **Works with**. Skip **Part of** for a skill in one of the `bundles`: its page and its entry already say so.
- **`text`**: prose that explains what the skill does, for a full picture of it. No fixed structure. A bundle's text says how its skills work together.

There are no minimums, only limits, which `pnpm run tldr` and `pnpm run check` enforce: at most 8 glance items, 4 words per label, 30 words per glance item and 200 words of text. Never pad to fill them.

The site shows each glance item as "Label: Text.", adding the colon and the full stop itself. So each item stands on its own after its label:

- Start it with a capital letter, unless it starts with a name written in lowercase, such as a command (`uv`), a file (`report.md`) or a skill (`grill-me`).
- Don't end it with a full stop. A "?" or "!" that belongs to it stays.
- Don't continue the label's sentence. An **Unlike X** item says, as a sentence of its own, what X does and how this skill differs, such as "That one drives a browser for one task; this one keeps what it learned as a skill you can rerun", not "which drives a browser for one task, it keeps…". Name X in the label, not a bare **Unlike**.

How to write them:

1. Use plain words. Explain any term the skill coins, such as "fragments", "beats" or "grounding", and don't just restate the skill's name.
2. Say what you end up with: a file, a plan, a draft, a reply style.
3. Say where it fits in its workflow, and how it differs from a close neighbour. One **Unlike X** item can do a lot.
4. Mention practical facts that change the decision: it only runs when called (`disable-model-invocation` in its frontmatter), it stays on until stopped, it needs a CLI, it writes a file.
5. Only state what the SKILL.md says or shows. Don't guess at behavior.

For example, writing-fragments' frontmatter says "Writing, explore: mine raw fragments, no structure yet." Its TLDR says:

- **Use it when:** You want to write an essay or article but don't know its shape yet.
- **It does:** Interviews you and saves every usable line, anecdote and idea to one Markdown file.
- **You get:** A file of raw notes, with no outline.
- **Runs:** Only when you call it.

> This is the exploring half of Matt Pocock's writing workflow. You say what you'd like to write about, and the agent keeps asking: what you noticed, what happened, what you meant by a phrase you used. Anything that might survive into the final piece goes into one Markdown file […]

### 4. Test it on a cold reader

Someone who has never heard of the skill should understand it from the TLDR alone. If you can start a subagent, give it only the glance and the text, with no other context, and ask what the skill does, what you end up with, and when you'd use it. Compare its answer with the SKILL.md, and rewrite whatever it got wrong or vague. Without subagents, reread the TLDR as that stranger would.

### 5. Save

```bash
pnpm run tldr <id> --model "<your model, such as Claude Opus 5.5>" --effort <your effort: low, medium, high, xhigh, max, or unknown> <<'EOF'
{"glance": [{"label": "Use it when", "text": "…"}], "text": "…"}
EOF
```

This checks the limits, records the permalink, resets the skew to 0, and records your model and effort as the review's `model` and `effort`. The permalink points to:

- **A skill:** its directory on GitHub at the commit its copy was taken from.
- **A bundle:** its repo at the current commit. Setting it fails when a skill's copy doesn't match that commit; then run `pnpm run sync <repo>`, reread what changed, and try again.

Then run `pnpm run check`, and commit and push to `main`. To see the result, `pnpm run dev` serves the site at http://localhost:3000, with each skill at `/<owner>/<repo>/<name>/` and each bundle at `/bundle/<id>/`, with a slash for its id's `@`.
