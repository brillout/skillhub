import{n as e}from"../chunks/chunk-4tVxZq34.js";import{i as t,n}from"../chunks/chunk-CdK6qszE.js";import{n as r}from"../chunks/chunk-BtHByGwc.js";import{r as i}from"../chunks/chunk-rmaATvgx.js";var a=e({default:()=>s}),o=e=>e.toLocaleString(`en`);function s(){let{turnedDown:e}=r,a=e.toolDocs+e.language+e.copy+e.retired+e.other;return`
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <strong>${o(r.listed)} agent skills</strong>, out of the ${o(r.reviewed)} it reviewed. Each was read and judged on whether people looking for skills would find it useful.</p>

      <h2>1. Finding skills</h2>
      <p>Skills come from <a href="https://skills.sh/">skills.sh</a>, with their installs, and their repo's stars from GitHub. A skill is reviewed once it has <strong>${o(r.minimums.installs)} installs</strong> and its repo <strong>${o(r.minimums.stars)} stars</strong>. ${o(r.under)} skills are under that line, and ${r.waiting?`${o(r.waiting)} are waiting for review`:`none is waiting for review`}. Numbers are as of ${n(r.asOf)}.</p>

      <h2>2. Reviewing them</h2>
      <p>A review reads the skill's whole SKILL.md, not only its description. ${o(a)} skills were turned down:</p>
      <ul>
        <li><strong>${o(e.toolDocs)} tool docs:</strong> manuals for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. They only matter once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.</li>
        <li><strong>${o(e.language)} not in English.</strong></li>
        <li><strong>${o(e.copy)} copies:</strong> a skill republished under another name, or listed twice, such as under its repo's old name.</li>
        <li><strong>${o(e.retired)} retired:</strong> its SKILL.md points to a replacement.</li>
        <li><strong>${o(e.other)} for other reasons:</strong> it only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.</li>
      </ul>
      <p>Another ${o(r.gone)} skills are off the list because their SKILL.md is gone from their repo, and ${o(r.notOnGitHub)} because they aren't on GitHub.</p>

      <h2>3. Describing the rest</h2>
      <p>Each listed skill gets:</p>
      <ul>
        <li><strong>A TLDR:</strong> what the skill does, what you end up with, when to use it and how it differs from a close neighbour.</li>
        <li><strong>Tags:</strong> what area it's for, how it works, what it needs and what it can change on its own. The <a href="${t(`tags/`)}">Tags</a> page explains each one.</li>
        <li><strong>A note</strong> when there's something to know before installing, such as an account it needs, what it sends to a third party, or a safety check it switches off.</li>
        <li><strong>A bundle</strong> when skills of one repo are meant to be used together, such as the steps of a workflow. SkillHub has ${o(r.bundles)}.</li>
      </ul>

      <h2>4. Keeping it current</h2>
      <p>SkillHub follows each listed skill's SKILL.md in its repo. A skill's page says when its SKILL.md has changed since its TLDR was written, and a skill whose SKILL.md is gone comes off the list.</p>

      <h2>What to keep in mind</h2>
      <p>Reviews can be wrong, and no one runs the skills to test them: a review reads the SKILL.md and judges it. Install counts come from skills.sh and stars from GitHub. Something wrong or missing? <a href="${i}/issues">Open an issue</a>.</p>
    </div>`}var c={hasServerOnlyHook:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!1}},isClientRuntimeLoaded:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!1}},onBeforeRenderEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},dataEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},guardEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},Page:{type:`standard`,definedAtData:{filePathToShowToUser:`/pages/about/+Page.ts`,fileExportPathToShowToUser:[]},valueSerialized:{type:`plus-file`,exportValues:a}}};export{c as configValuesSerialized};