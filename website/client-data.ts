/**
 * What the browser gets of skills.jsonc. The skills list's client script embeds the data, so the
 * jsonc plugin of pages/+config.ts gives it a trimmed copy: without the fields no client code reads,
 * and without the TLDRs' prose, which is half the data and which only the search and a row's
 * preview read. The prose comes as `Prose`, a module the client script loads after the page (see
 * list-client.ts). Pages render on the server, with all of the data.
 */

import type {
  Bundle,
  BundleReview,
  BundleSkill,
  Data,
  Repo,
  RepoReview,
  Skill,
  SkillReview,
  SkillsSh,
  Tldr,
} from "../data/types.ts";

/**
 * What the browser's copy leaves out, by the kind of object it's in. `forClient` takes these out,
 * and the Client types below are the data's types without them: the code the browser runs, such
 * as skills.ts and list.ts, is typed with those, so reading one of these there doesn't type-check.
 * Pages read them from server-data.ts. To have the browser read one, take it off this list.
 */
const STRIPPED = {
  data: ["$schema"],
  skill: ["skillMd"],
  skillsSh: ["url", "unlisted"],
  /** A skill's or a bundle's agentReview. */
  review: ["model", "effort"],
  tldr: ["text", "permalink"],
  bundle: ["skew"],
  bundleReview: ["install"],
  bundleSkill: ["note"],
  // The list only shows a repo's description, in the banner of a list filtered to it.
  repoReview: ["kind", "note", "model", "effort"],
} as const;
type Stripped<K extends keyof typeof STRIPPED> = (typeof STRIPPED)[K][number];

export type ClientTldr = Omit<Tldr, Stripped<"tldr">>;
export type ClientSkill = Omit<Skill, Stripped<"skill"> | "skills.sh" | "agentReview"> & {
  "skills.sh": Omit<SkillsSh, Stripped<"skillsSh">>;
  agentReview: Omit<SkillReview, Stripped<"review"> | "tldr"> & { tldr?: ClientTldr };
};
export type ClientBundleSkill = Omit<BundleSkill, Stripped<"bundleSkill">>;
export type ClientBundle = Omit<Bundle, Stripped<"bundle"> | "agentReview"> & {
  agentReview: Omit<
    BundleReview,
    Stripped<"review"> | Stripped<"bundleReview"> | "tldr" | "skills"
  > & {
    tldr?: ClientTldr;
    skills: ClientBundleSkill[];
  };
};
export type ClientRepo = Omit<Repo, "agentReview"> & {
  agentReview: Omit<RepoReview, Stripped<"repoReview">>;
};
/** The browser's copy of skills.jsonc, the search words aside. */
export type ClientData = Omit<Data, Stripped<"data"> | "skills" | "bundles" | "repos"> & {
  skills: ClientSkill[];
  bundles: ClientBundle[];
  repos: ClientRepo[];
};

/** Each TLDR's prose, keyed by skill or bundle id: what the browser's copy leaves out of the TLDRs. */
export interface Prose {
  skills: Record<string, string>;
  bundles: Record<string, string>;
}

/**
 * Takes the server's data, which has the prose, or the browser's copy, which finds none: list.ts
 * runs on both.
 */
export function proseOf(data: Data | ClientData): Prose {
  const of = (entries: { id: string; agentReview: { tldr?: Partial<Tldr> } }[]) =>
    Object.fromEntries(
      entries.flatMap((e) => (e.agentReview.tldr?.text ? [[e.id, e.agentReview.tldr.text]] : [])),
    );
  return { skills: of(data.skills), bundles: of(data.bundles) };
}

/**
 * The distinct words of each TLDR's prose, lowercased, keyed by skill or bundle id. The search
 * only asks whether a word is in a text and whether it starts a word there, so these find and rank
 * exactly as the prose would.
 */
export type SearchWords = Prose;

const distinct = (text: string) =>
  [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))].join(" ");

const mapValues = (o: Record<string, string>, f: (v: string) => string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

export const searchWords = (prose: Prose): SearchWords => ({
  skills: mapValues(prose.skills, distinct),
  bundles: mapValues(prose.bundles, distinct),
});

const drop = (o: object | undefined, keys: readonly string[]) => {
  for (const k of keys) if (o) delete (o as Record<string, unknown>)[k];
};

/** Takes STRIPPED out of `data`, in place: what the browser doesn't read until later, or ever. */
export function forClient(data: Data): ClientData {
  drop(data, STRIPPED.data);
  for (const s of data.skills) {
    drop(s, STRIPPED.skill);
    drop(s["skills.sh"], STRIPPED.skillsSh);
    drop(s.agentReview, STRIPPED.review);
    drop(s.agentReview.tldr, STRIPPED.tldr);
  }
  for (const b of data.bundles) {
    drop(b, STRIPPED.bundle);
    drop(b.agentReview, [...STRIPPED.review, ...STRIPPED.bundleReview]);
    drop(b.agentReview.tldr, STRIPPED.tldr);
    for (const m of b.agentReview.skills) drop(m, STRIPPED.bundleSkill);
  }
  for (const r of data.repos) drop(r.agentReview, STRIPPED.repoReview);
  return data;
}
