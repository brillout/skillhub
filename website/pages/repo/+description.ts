import type { PageContextServer } from "vike/types";
import { glanceEnd, plural } from "../../format.ts";
import type { Data } from "./+data.ts";

export default (pageContext: PageContextServer) => {
  const { repo, skills } = (pageContext.data as Data).listing;
  // The ones SkillHub lists, which may be few of the repo's: before its own "86 agent skills for
  // iOS", "The agent skill of" the repo said there's one.
  const what = `The ${skills.length === 1 ? "agent skill" : plural(skills.length, "agent skill")} SkillHub lists from ${repo.id} on GitHub.`;
  return repo.agentReview.description ? `${what} ${glanceEnd(repo.agentReview.description)}` : what;
};
