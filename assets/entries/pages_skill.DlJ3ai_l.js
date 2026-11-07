import{n as e}from"../chunks/chunk-4tVxZq34.js";import{i as t,n,r,t as i}from"../chunks/chunk-CdK6qszE.js";import{A as a,C as o,D as s,E as c,N as l,S as u,a as d,c as f,i as p,j as m,n as h,o as g,s as _,u as v,v as y,x as b,y as x}from"../chunks/chunk-rmaATvgx.js";import{m as S}from"../chunks/chunk-qvzHbnOa.js";import{n as C}from"../chunks/chunk-CKWGTyTQ.js";var w=e({default:()=>A}),T=e=>`npx skills add https://github.com/${l(e).repo} --skill ${e.name}`;function E(e,{version:t}){let n=l(e);return`<a href="https://github.com/${r(n.repo)}/blob/${t}/${r(encodeURI(n.dir?`${n.dir}/SKILL.md`:`SKILL.md`))}">${r(n.repo)} at ${b(t)}</a>`}function D(e){let t=y.get(l(e).repo),i=e[`skills.sh`],a=[];return i.installs!==null&&a.push(`<div><dt>Total Downloads</dt><dd>${i.installs.toLocaleString(`en`)} <span class="muted">on skills.sh, ${n(g.asOf.installs)}</span></dd></div>`),t?.stars!=null&&a.push(`<div><dt>Repo stars</dt><dd>${t.stars.toLocaleString(`en`)} <span class="muted">${r(t.id)}</span></dd></div>`),i.firstSeen&&a.push(`<div><dt>First seen</dt><dd>${n(i.firstSeen)} <span class="muted">on skills.sh</span></dd></div>`),`<dl class="facts">${a.join(``)}</dl>`}function O(e){let t=new Map;for(let n of a(e))t.set(f(n),[...t.get(f(n))??[],n]);return`<table class="tag-detail">${h.filter(e=>t.has(e)).map(e=>{let n=t.get(e)??[],i=e===`topic`||e===`stack`?[]:n.filter(e=>s.has(e));return`
      <tr>
        <th scope="row">${r(_.get(e)?.name??e)}</th>
        <td>
          <div class="tags">${n.map(e=>c(e,S({tags:[e]}))).join(``)}</div>
          ${i.map(e=>`<p class="tag-meaning">${r(s.get(e)??``)}</p>`).join(``)}
        </td>
      </tr>`}).join(``)}</table>`}function k(e){let t=d.get(e.id);if(!t)return``;let{bundle:n,index:i,standalone:a,note:s}=t,c=(e,t)=>{let i=n.agentReview.skills[e]?.id;return i?` · ${t}: <a href="${o(i)}">${r(u.get(i)?.name??i)}</a>`:``};return`
    <p class="in-bundle">Skill ${i+1} of ${n.agentReview.skills.length} in the <a href="${p(n.id)}">${r(n.agentReview.name)}</a> bundle${c(i-1,`Before it`)}${c(i+1,`After it`)}</p>
    ${a?``:`<p class="note">Only works inside its bundle: ${r(s??``)} Install <a href="${p(n.id)}">${r(n.agentReview.name)}</a> instead.</p>`}`}function A(e){let{skill:a,copy:o}=e.data,s=l(a),c=a[`skills.sh`],u=a.skillMd,f=[`<a href="${r(c.url)}">skills.sh page</a>`,`<a href="https://github.com/${r(s.repo)}${s.dir?`/tree/HEAD/${r(encodeURI(s.dir))}`:``}">Source on GitHub</a>`,`<a href="${S({repo:x(a)})}">All skills from ${r(x(a))}</a>`],h=d.get(a.id)?.bundle;return`
    <div class="page skill-page">
      <p class="crumbs"><a href="${t()}">Skills</a> <span aria-hidden="true">/</span> <a href="${S({repo:x(a)})}">${r(x(a))}</a>${h?` <span aria-hidden="true">/</span> <a href="${p(h.id)}">${r(h.agentReview.name)}</a>`:``}</p>
      <h1>${r(a.name)}</h1>
      ${a.agentReview.tldr?.glance.length?`<section class="at-a-glance" aria-label="At a glance">${v(a.agentReview.tldr.glance)}</section>`:`<p class="lede">${r(a.agentReview.description)}</p>`}
      ${k(a)}
      ${a.agentReview.note?`<p class="note">${r(a.agentReview.note)}</p>`:``}
      ${a.agentReview.tldr?m(a.agentReview.tldr,`the skill`,a.skillMd?.skew??0):``}
      <div class="details-grid">
        <div>
          <div class="install"><code>${r(T(a))}</code><button type="button" class="copy" data-copy="${r(T(a))}">Copy</button></div>
          <p class="links">${f.join(` · `)}</p>
          ${D(a)}
        </div>
        ${c.weeklyInstalls?C(c.weeklyInstalls,g.asOf.installs,i):``}
      </div>
      ${O(a)}
      <section class="skill-md" aria-labelledby="skill-md">
        <h2 id="skill-md">SKILL.md</h2>
        ${o&&u?`<p class="muted">From ${E(a,u)}. Checked daily, last changed ${n(u.updated)}.</p>
        ${o.frontmatter?`<details class="frontmatter"><summary>Frontmatter</summary><pre><code>${r(o.frontmatter)}</code></pre></details>`:``}
        <div class="markdown">${o.html}</div>`:`<p class="muted">No copy of its SKILL.md yet.</p>`}
      </section>
    </div>`}var j={hasServerOnlyHook:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!0}},isClientRuntimeLoaded:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!1}},onBeforeRenderEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},dataEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:{server:!0}}},guardEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},Page:{type:`standard`,definedAtData:{filePathToShowToUser:`/pages/skill/+Page.ts`,fileExportPathToShowToUser:[]},valueSerialized:{type:`plus-file`,exportValues:w}}};export{j as configValuesSerialized};