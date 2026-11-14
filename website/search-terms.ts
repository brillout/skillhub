/**
 * How a search is read: by the skills list's search (list.ts) and by the Tags page's
 * (pages/tags/+client.ts), so that both find a tag by the same words. Apart, the Tags page looked
 * for a word anywhere in a tag's text, and "git" found flag:dual-use there, by "legitimate", after
 * the list had stopped finding it.
 */

/**
 * A text as the search compares it: in lowercase and without accents, so that "résumé" finds
 * "resume", and the other way around. Both what's searched for and what's looked in. And with a
 * straight apostrophe for a curly one, which a phone's keyboard types: "addy’s" found nothing of
 * the 25 skills "addy's" finds.
 */
export const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‘’]/g, "'");

/**
 * What's searched for, plain, and without its double quotes, straight or curly: a search in quotes,
 * as one for an exact phrase elsewhere, looked for the quotes themselves, and found nothing.
 */
export const sought = (q: string) =>
  plain(q)
    .replace(/["“”]/g, " ")
    .trim();

/**
 * A word of a search: itself, the ways it's spelled that a text may have instead, and what tells
 * whether one of them starts a word of a text.
 */
export interface Term {
  /** The word as it was typed, plain, its plural cut back. */
  w: string;
  /** The word and its other spellings: a text has the word when it holds one of them. */
  forms: string[];
  /** Whether a word of a text starts with one of them, or with the name the word is the ".js" of. */
  start: RegExp;
}

/**
 * The ways a word is spelled where names are letters, digits and hyphens, as a tag is: a tag is
 * found by its name as people write it, "next.js" for stack:nextjs. Typed so, the Tags page said
 * no tag matches, and the list offered none.
 * - A dot inside it is left out, or a hyphen: next.js is nextjs, socket.io is socket-io.
 * - A sign is spelled out: c++ is cpp, c# is csharp, .net is dotnet.
 */
function spellings(word: string): string[] {
  const named = word
    .replace(/\+\+/g, "pp")
    .replace(/([\p{L}\p{N}])#/gu, "$1sharp")
    .replace(/^\.(?=\p{L})/u, "dot");
  const inside = /([\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu;
  return [...new Set([word, named, named.replace(inside, "$1"), named.replace(inside, "$1-")])];
}

/**
 * The name a word is the ".js" of, as people write a library's: vue.js is vue, node.js is node,
 * with or without its dot, vuejs, nodejs. Only for where a word has to start one of a text's, as
 * in a tag: anywhere in a skill's words, "next" would find every skill that says what comes next.
 */
const libraryOf = (word: string) => /^(.{2,}?)\.?js$/.exec(word)?.[1];

/**
 * The words of a search, as `sought` gives it: plurals cut back so they match the singular too
 * ("resumes" finds "resume", "strategies" finds "strategy").
 */
export function terms(phrase: string): Term[] {
  const singular = (w: string) =>
    w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  const escaped = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    phrase
      // "next js" is next.js, written in two words: the second, alone, starts no tag's word.
      .replace(/(\S)\s+js(?=\s|$)/g, "$1.js")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        // A plural is cut back in a word spelled one way only: the s of ".js" isn't one.
        const spelled = spellings(word);
        const forms = spelled.length > 1 ? spelled : [singular(word)];
        const library = libraryOf(word);
        const starts = library ? [...forms, library] : forms;
        return {
          w: forms[0],
          forms,
          start: new RegExp(`(^|[^\\p{L}\\p{N}])(?:${starts.map(escaped).join("|")})`, "u"),
        };
      })
  );
}
