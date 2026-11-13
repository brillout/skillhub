import type { PageContextServer } from "vike/types";
import type { Data } from "./+data.ts";
import { glanceEnd, plainText } from "../../format.ts";

export default (pageContext: PageContextServer) => {
  const { tldr, description } = (pageContext.data as Data).bundle.agentReview;
  // Without the backticks its agent set a command apart with: see textHtml in format.ts.
  return plainText(
    tldr?.glance.length
      ? tldr.glance.map(({ label, text }) => `${label}: ${glanceEnd(text)}`).join(" ")
      : description,
  );
};
