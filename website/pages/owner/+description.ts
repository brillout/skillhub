import type { PageContextServer } from "vike/types";
import { plural } from "../../format.ts";
import type { Data } from "./+data.ts";

export default (pageContext: PageContextServer) => {
  const { owner, listings } = pageContext.data as Data;
  const skills = listings.reduce((n, l) => n + l.skills.length, 0);
  return `The ${skills === 1 ? "agent skill" : plural(skills, "agent skill")} SkillHub lists from ${owner} on GitHub, in ${listings.map((l) => l.repo.id).join(", ")}.`;
};
