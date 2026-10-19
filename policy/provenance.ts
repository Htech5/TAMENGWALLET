/**
 * FR-15 Provenance guard.
 *
 * Every piece of text reaching the agent carries a label: USER means the owner typed it
 * here, EXTERNAL means it arrived from somewhere else, a forwarded WhatsApp message, a
 * pasted email, a tool result, a token name read off-chain.
 *
 * The rule the whole feature exists for: EXTERNAL text is information, never an order.
 * It may answer "what does this say"; it may never move money. The attacker's whole plan
 * is to get their sentence read in a context where it counts as the owner speaking, so the
 * label has to travel with the text rather than be decided at the end.
 */

export type Provenance = "USER" | "EXTERNAL";

export interface Segment {
  text: string;
  provenance: Provenance;
}

// How forwarded content announces itself: a quote marker, a forward header, or "X said".
const FORWARD_MARKERS = [
  /^\s*>+\s?/,
  /^\s*(fwd|fw|forwarded message|pesan diteruskan)\b[:\-]?/i,
  /^\s*\[?(forwarded|diteruskan)\]?\b/i,
  /\b(said|wrote|says|bilang|berkata|menulis|kata)\s*[:\-]\s*$/i,
  /^\s*(from|dari)\s*[:\-]\s*\S+/i,
];

const QUOTED = /[«"“”']{1}([^"“”«»']{20,})[»"“”']{1}/g;

/**
 * Splits a chat message into USER and EXTERNAL parts. A message with no forwarded content
 * is one USER segment, which is the common case and costs nothing.
 */
export function labelSegments(message: string, declared: Provenance = "USER"): Segment[] {
  if (declared === "EXTERNAL") return [{ text: message, provenance: "EXTERNAL" }];

  const segments: Segment[] = [];
  const lines = message.split(/\r?\n/);
  let carryExternal = false;

  for (const line of lines) {
    const marked = FORWARD_MARKERS.some((re) => re.test(line));
    if (marked) carryExternal = true;
    if (!line.trim()) {
      carryExternal = false; // a blank line ends the quoted block
      continue;
    }
    segments.push({ text: line, provenance: carryExternal ? "EXTERNAL" : "USER" });
  }

  // A long quoted passage inside one line is forwarded content too.
  const singleLine = segments.length <= 1;
  if (singleLine) {
    const text = segments[0]?.text ?? message;
    const quotes = [...text.matchAll(QUOTED)].map((m) => m[1]);
    if (quotes.length) {
      const rest = quotes.reduce((acc, q) => acc.replace(q, " "), text);
      return [
        { text: rest, provenance: "USER" },
        ...quotes.map((q) => ({ text: q, provenance: "EXTERNAL" as const })),
      ];
    }
  }

  return segments.length ? segments : [{ text: message, provenance: "USER" }];
}

// An instruction that would move value, as opposed to a question about one.
const MOVES_MONEY =
  /\b(send|transfer|pay|approve|withdraw|drain|kirim|kirimkan|transfer|bayar|setujui|tarik|pindahkan)\b/i;
const IS_QUESTION = /\?\s*$|^\s*(what|who|how|when|why|apa|siapa|berapa|kapan|kenapa)\b/i;

export interface ProvenanceResult {
  /** True when an order to move money was found in EXTERNAL text. */
  blocked: boolean;
  /** The offending text, trimmed for the activity feed. */
  excerpt?: string;
  message: string;
}

export function checkProvenance(message: string, declared: Provenance = "USER"): ProvenanceResult {
  const segments = labelSegments(message, declared);
  const offending = segments.find(
    (s) => s.provenance === "EXTERNAL" && MOVES_MONEY.test(s.text) && !IS_QUESTION.test(s.text),
  );

  if (!offending) return { blocked: false, message: "" };

  return {
    blocked: true,
    excerpt: offending.text.trim().slice(0, 120),
    message: "That instruction came from a forwarded message, not from you.",
  };
}
