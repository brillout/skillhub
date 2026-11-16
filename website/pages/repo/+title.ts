import type { PageContextServer } from "vike/types";
import { repoName } from "../../skills.ts";
import type { Data } from "./+data.ts";

export default (pageContext: PageContextServer) =>
  `${repoName((pageContext.data as Data).listing.repo.id)} · SkillHub`;
