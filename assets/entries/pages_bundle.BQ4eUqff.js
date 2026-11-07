import{n as e}from"../chunks/chunk-4tVxZq34.js";import{a as t,i as n,n as r,r as i,t as a}from"../chunks/chunk-CdK6qszE.js";import{C as o,j as s,l as c,o as l,p as u,u as d,v as f,w as p,y as m}from"../chunks/chunk-rmaATvgx.js";import{m as h}from"../chunks/chunk-qvzHbnOa.js";var g=e({default:()=>y});function _(e){let t=f.get(m(e)),n=p(e).toSorted((e,t)=>(u(t)??-1)-(u(e)??-1))[0],a=u(n),s=c(e),d=[];return a!==null&&d.push(`<div><dt>Total Downloads</dt><dd>${a.toLocaleString(`en`)} <span class="muted">of <a href="${o(n.id)}">${i(n.name)}</a>, its most installed skill, on skills.sh, ${r(l.asOf.installs)}</span></dd></div>`),t?.stars!=null&&d.push(`<div><dt>Repo stars</dt><dd>${t.stars.toLocaleString(`en`)} <span class="muted">${i(t.id)}</span></dd></div>`),s&&d.push(`<div><dt>First seen</dt><dd>${r(s)} <span class="muted">on skills.sh, its first skill</span></dd></div>`),`<dl class="facts">${d.join(``)}</dl>`}function v(e){return`<ol class="bundle-skills">${e.agentReview.skills.map(({id:t,standalone:n,note:r},s)=>{let c=p(e)[s],l=u(c);return`
      <li>
        <div class="skill-head">
          <h3><a class="skill-name" href="${o(t)}">${i(c.name)}</a></h3>
          ${n?``:`<span class="kind">Only in the bundle</span>`}
          ${l===null?``:`<span class="metric"><strong>${a(l)}</strong> total downloads</span>`}
        </div>
        <p class="skill-desc">${i(c.agentReview.description)}</p>
        ${r?`<p class="member-note">${i(r)}</p>`:``}
      </li>`}).join(``)}</ol>`}function y(e){let{bundle:r}=e.data,a=m(r),o=r.agentReview.skills.filter(e=>e.standalone).length;return`
    <div class="page skill-page bundle-page">
      <p class="crumbs"><a href="${n()}">Skills</a> <span aria-hidden="true">/</span> <a href="${h({repo:a})}">${i(a)}</a></p>
      <h1>${i(r.agentReview.name)} <span class="kind">Bundle · ${t(r.agentReview.skills.length,`skill`)}</span></h1>
      ${r.agentReview.tldr?.glance.length?`<section class="at-a-glance" aria-label="At a glance">${d(r.agentReview.tldr.glance)}</section>`:`<p class="lede">${i(r.agentReview.description)}</p>`}
      ${r.agentReview.tldr?s(r.agentReview.tldr,`the repo`,r.skew):``}
      <div class="details-grid">
        <div>
          ${r.agentReview.install.map(({label:e,command:t})=>`<p class="install-label">${i(e)}</p><div class="install"><code>${i(t)}</code><button type="button" class="copy" data-copy="${i(t)}">Copy</button></div>`).join(``)}
          <p class="links"><a href="https://github.com/${i(a)}">Source on GitHub</a> · <a href="${h({repo:a})}">All skills from ${i(a)}</a></p>
          ${_(r)}
        </div>
      </div>
      <section aria-labelledby="skills">
        <h2 id="skills">Its skills, in the order they're used</h2>
        <p class="muted">${o===r.agentReview.skills.length?`Each also works alone, so each also has its own entry in the skills list.`:`The ones marked “Only in the bundle” need the rest of it, so they're only listed here. The others also have their own entry in the skills list.`}</p>
        ${v(r)}
      </section>
    </div>`}var b={hasServerOnlyHook:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!0}},isClientRuntimeLoaded:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:!1}},onBeforeRenderEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},dataEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:{server:!0}}},guardEnv:{type:`computed`,definedAtData:null,valueSerialized:{type:`js-serialized`,value:null}},Page:{type:`standard`,definedAtData:{filePathToShowToUser:`/pages/bundle/+Page.ts`,fileExportPathToShowToUser:[]},valueSerialized:{type:`plus-file`,exportValues:g}}};export{b as configValuesSerialized};