/**
 * A question asks; it does not instruct.
 *
 * "Can you send 10 USDC to Adik?" contains a verb, an amount and a name, so a reader that
 * only looks for those reads it as a transfer. But nobody asked for one, and under the
 * confirm threshold that transfer is silent: the money leaves the wallet with no PIN and no
 * card.
 *
 * This lives here, next to the other money rules, because it is a money rule and not a
 * reading trick: the reader's job is to extract what the owner wrote, and this decides
 * what happens to it.
 *
 * The question is never allowed to cancel an attack. An injection or a forwarded order is
 * a stronger signal than a question, and it reaches the deny path where it is logged — see
 * server/core.ts, where the denial is decided before this is consulted.
 */

/**
 * Ways of asking, in phrases rather than single words.
 *
 * Phrases, not words, because a word on its own is often not a question: "send 10 USDC to
 * Can" is an order to a contact called Can, and "Do send 10 USDC to Adik" is a command.
 */
const ASKING_PHRASE =
  /\b(?:can|could|would|should|shall|may|will|might)\s+(?:you|i|we|they|he|she|it|there|this|that)\b|\b(?:do|does|did)\s+(?:you|i|we|they)\b|\b(?:is|are|was|were)\s+(?:it|this|that|there|the)\b|\b(?:how|what|who|whom|whose|where|when|why|which|whether)\b/i;

/**
 * Indonesian ways of asking. These are single words, so they need one more rule: a word
 * right after a name preposition is the contact's name, not a question — "10 USDC ke Bisa"
 * is an order to someone called Bisa.
 */
const ASKING_WORD = /\b(?:bisa|boleh|apakah|gimana|bagaimana|apa|siapa|kapan|kenapa|mana|berapa)\b/i;

/** A name preposition: what follows it is the recipient, not a question. */
const NAME_PREPOSITION = /\b(?:to|ke|kepada|buat|dari|for)\s+$/i;

/** A command at the start of the sentence: "send 10 USDC to Adik?" is still an order. */
const COMMAND = /^\s*(?:send|kirim|transfer|pay|bayar|move|pindah)\b/i;

/**
 * Is this sentence a question rather than an order?
 *
 * True means: do not move money on this sentence alone. It does not mean the sentence is
 * meaningless — an owner who asks "can you send 10 USDC to Adik?" gets asked to confirm,
 * which is a better answer than either sending it silently or pretending not to understand.
 */
export function isQuestion(text: string): boolean {
  const trimmed = (text ?? '').trim();
  if (ASKING_PHRASE.test(trimmed)) return true;

  const word = ASKING_WORD.exec(trimmed);
  if (word && !NAME_PREPOSITION.test(trimmed.slice(0, word.index))) return true;

  // A trailing question mark asks, unless the sentence already commands.
  return trimmed.endsWith('?') && !COMMAND.test(trimmed);
}
