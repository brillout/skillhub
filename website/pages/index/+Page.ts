import { fresh, listView } from "../../list.ts";
import { review } from "../../review.ts";

/**
 * The skills list, unfiltered; ../../list-client.ts applies the settings and filters in the URL.
 * How many skills were reviewed comes from review.ts, which only the server can read.
 */
export default () => listView(fresh(), review.reviewed);
