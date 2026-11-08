import { fresh, listView } from "../../list.ts";

/** The skills list, unfiltered; ../../list-client.ts applies the settings and filters in the URL. */
export default () => listView(fresh());
