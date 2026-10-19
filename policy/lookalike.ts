/**
 * FR-17 Look-alike address detection.
 *
 * The attack is older than crypto: register something that reads like the real thing and
 * let the eye do the rest. On-chain it is cheap to grind a wallet sharing a prefix or a
 * suffix with someone the owner trusts, because every wallet UI abbreviates the middle.
 *
 * So the test is not "are these strings similar" but "would the owner read these as the
 * same contact": same shortened form, a one or two character edit, or confusable digits.
 * False positives are fine here. Being asked to double check an address costs a minute;
 * missing one costs the transfer.
 */

export interface KnownAddress {
  id: string;
  name: string;
  address: string;
}

export type LookalikeKind = "same-short-form" | "shared-prefix" | "shared-suffix" | "near-identical" | "confusable";

export interface LookalikeMatch {
  contact: KnownAddress;
  kind: LookalikeKind;
  /** One sentence, ready to show. */
  message: string;
}

/** How a wallet UI shows an address: first 6, last 4. */
export function shorten(address: string): string {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

// 0/o, 1/l/i, 5/s, 8/b: the pairs that survive a glance at a monospace font.
const CONFUSABLE: Record<string, string> = { o: "0", l: "1", i: "1", s: "5", b: "8" };

// For repairing a typed address, only characters that are NOT valid hex may be folded:
// mapping b to 8 would rewrite a perfectly real address into a different one.
const NON_HEX_CONFUSABLE: Record<string, string> = { o: "0", l: "1", i: "1", s: "5", g: "9", z: "2" };

export function foldConfusable(address: string): string {
  return address
    .toLowerCase()
    .split("")
    .map((c) => CONFUSABLE[c] ?? c)
    .join("");
}

/**
 * An address typed with look-alike characters (0x0O47… for 0x0047…) is not valid hex, so a
 * plain regex drops it and the agent ends up asking "who?" instead of "this is a trap".
 * Fold it back to hex first, and report that it was written confusably.
 */
export function normaliseAddress(raw: string): { address: string; confusable: boolean } | undefined {
  const candidate = raw.trim().toLowerCase();
  if (!/^0x[0-9a-z]{40}$/.test(candidate)) return undefined;
  const folded =
    "0x" +
    candidate
      .slice(2)
      .split("")
      .map((c) => (/[0-9a-f]/.test(c) ? c : NON_HEX_CONFUSABLE[c] ?? c))
      .join("");
  if (!/^0x[0-9a-f]{40}$/.test(folded)) return undefined;
  return { address: folded, confusable: folded !== candidate };
}

/** Edit distance, capped: we only care whether it is 1 or 2, so stop counting past that. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > max) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= max;
}

/**
 * Returns the contact this address could be mistaken for, or undefined when it is plainly
 * its own address. An exact match of a known contact is never a look-alike.
 */
export function findLookalike(address: string, known: KnownAddress[]): LookalikeMatch | undefined {
  const a = address.trim().toLowerCase();
  if (!a) return undefined;

  for (const contact of known) {
    const b = contact.address.toLowerCase();
    if (a === b) return undefined; // it IS that contact
  }

  for (const contact of known) {
    const b = contact.address.toLowerCase();
    const head = a.slice(0, 6) === b.slice(0, 6);
    const tail = a.slice(-4) === b.slice(-4);

    if (head && tail)
      return {
        contact,
        kind: "same-short-form",
        message: "This address is shown exactly like " + contact.name + "'s but is a different wallet.",
      };

    if (withinEdits(a, b, 2))
      return {
        contact,
        kind: "near-identical",
        message: "This address differs from " + contact.name + "'s by a character or two.",
      };

    if (foldConfusable(a) === foldConfusable(b))
      return {
        contact,
        kind: "confusable",
        message: "This address only differs from " + contact.name + "'s in characters that look alike.",
      };

    if (head)
      return {
        contact,
        kind: "shared-prefix",
        message: "This address starts like " + contact.name + "'s but is a different wallet.",
      };

    if (tail)
      return {
        contact,
        kind: "shared-suffix",
        message: "This address ends like " + contact.name + "'s but is a different wallet.",
      };
  }

  return undefined;
}
