/**
 * First-line heuristic check for prompt-injection / social-engineering in user messages
 * or tool outputs. This is a DEFENCE-IN-DEPTH layer: checkPolicy() still blocks unsafe
 * transactions even if this misses.
 *
 * An attacker who knows the pattern list will hide the payload instead of dropping it, so
 * the text is normalised first: homoglyphs folded, invisible characters stripped, spacing
 * tricks collapsed, then any base64 or Morse blob decoded and scanned as if it had been
 * written in the open. Everything found that way is reported with the layer it hid behind.
 */

const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore (all |any |the )?(previous |prior |above |your )?(instructions|rules)/i, label: "instruction override" },
  { re: /(abaikan|lupakan) (semua |segala )?(instruksi|aturan|perintah)( (sebelumnya|di atas))?/i, label: "instruction override" },
  { re: /(you are|act as) (now )?(in )?(developer|admin|god|dan) mode/i, label: "role escalation" },
  { re: /(kamu|anda) (sekarang )?(adalah|jadi) (admin|developer|mode dewa)/i, label: "role escalation" },
  { re: /(reveal|show|print|send|export).{0,30}(private key|seed phrase|mnemonic|secret)/i, label: "secret extraction" },
  { re: /(tunjukkan|kirim|bagikan).{0,30}(private key|seed phrase|frasa|kunci pribadi)/i, label: "secret extraction" },
  { re: /(send|transfer|drain).{0,20}(all|entire|everything|max)/i, label: "drain attempt" },
  { re: /(kirim|transfer|pindahkan).{0,20}(semua|seluruh|semuanya)/i, label: "drain attempt" },
  { re: /(disable|bypass|turn off|remove).{0,20}(limit|policy|confirmation|allowlist)/i, label: "policy bypass" },
  { re: /(matikan|nonaktifkan|lewati|hapus).{0,20}(limit|batas|aturan|konfirmasi)/i, label: "policy bypass" },
  { re: /(system|admin|anthropic|openai|coinbase)\s*(says|message|override)/i, label: "fake authority" },
  { re: /(pesan|perintah) (dari )?(sistem|admin|tim keamanan)/i, label: "fake authority" },
  { re: /\b(urgent|emergency|right now|immediately|sekarang juga|darurat)\b.{0,40}\b(send|transfer|kirim)\b/i, label: "urgency pressure" },
];

// Folded before matching so "І𝗴𝗻𝗼𝗿𝗲" and "i g n o r e" cannot walk past a plain regex.
const HOMOGLYPHS: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ѕ: "s",
  Α: "A", Β: "B", Ε: "E", Ι: "I", Ο: "O", Ρ: "P", Τ: "T", Χ: "X",
};

const INVISIBLE = /[​-‏⁠﻿­]/g;

const MORSE: Record<string, string> = {
  ".-": "a", "-...": "b", "-.-.": "c", "-..": "d", ".": "e", "..-.": "f", "--.": "g",
  "....": "h", "..": "i", ".---": "j", "-.-": "k", ".-..": "l", "--": "m", "-.": "n",
  "---": "o", ".--.": "p", "--.-": "q", ".-.": "r", "...": "s", "-": "t", "..-": "u",
  "...-": "v", ".--": "w", "-..-": "x", "-.--": "y", "--..": "z",
  "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4",
  ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};

/** Fold the cheap obfuscations: invisible characters, look-alike letters, s p a c e d out text. */
export function normalise(text: string): string {
  const folded = text
    .replace(INVISIBLE, "")
    .replace(/[Ѐ-ӿͰ-Ͽ]/g, (c) => HOMOGLYPHS[c] ?? HOMOGLYPHS[c.toLowerCase()] ?? c)
    .normalize("NFKC");
  // "i g n o r e  a l l" -> "ignore all": only when single letters dominate, so normal prose is left alone.
  const deSpaced = folded.replace(/\b(?:[a-z]\s){2,}[a-z]\b/gi, (run) => run.replace(/\s+/g, ""));
  return deSpaced;
}

/** Decode base64 blobs long enough to hide a sentence. Short words are skipped as noise. */
function decodeBase64(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9+/]{16,}={0,2}/g)) {
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf8");
      // Printable ASCII only: random hex and ids decode to control-character soup.
      if (/^[\x20-\x7e\s]{8,}$/.test(decoded)) out.push(decoded);
    } catch {
      // not base64 after all
    }
  }
  return out;
}

function decodeMorse(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?:[.\-]{1,6}(?:\s+|\/)){4,}[.\-]{1,6}/g)) {
    // A wider gap or a slash separates words, a single space separates letters.
    const decoded = match[0]
      .trim()
      .split(/\s{2,}|\s*\/\s*/)
      .map((wordCodes) =>
        wordCodes
          .split(/\s+/)
          .map((code) => MORSE[code] ?? "")
          .join(""),
      )
      .join(" ")
      .trim();
    if (decoded.replace(/\s/g, "").length >= 4) out.push(decoded);
  }
  return out;
}

export interface InjectionResult {
  suspicious: boolean;
  matches: string[];
  /** Where it was hiding: "plain", "base64", "morse". Useful in the audit log. */
  layers: string[];
}

export function detectInjection(text: string): InjectionResult {
  const matches = new Set<string>();
  const layers = new Set<string>();

  const scan = (candidate: string, layer: string) => {
    const clean = normalise(candidate);
    // Three readings of the same text: as written, with invisible characters read as spaces,
    // and with every space removed. An attacker has to defeat all three at once.
    const spaced = candidate.replace(INVISIBLE, " ").normalize("NFKC");
    const collapsed = clean.replace(/\s+/g, "");
    for (const p of PATTERNS) {
      const squeezed = new RegExp(p.re.source.replace(/ /g, ""), p.re.flags);
      if (p.re.test(clean) || p.re.test(spaced) || squeezed.test(collapsed)) {
        matches.add(p.label);
        layers.add(layer);
      }
    }
  };

  scan(text, "plain");
  for (const decoded of decodeBase64(text)) scan(decoded, "base64");
  for (const decoded of decodeMorse(text)) scan(decoded, "morse");

  return { suspicious: matches.size > 0, matches: [...matches], layers: [...layers] };
}

/**
 * Tool output and forwarded content are never the owner speaking, so an instruction found
 * there is suspicious even when it is phrased politely.
 */
export function detectInjectionInToolOutput(output: string): InjectionResult {
  const direct = detectInjection(output);
  const clean = normalise(output);
  const imperative =
    /\b(send|transfer|approve|kirim|transfer|setujui)\b.{0,40}\b(0x[0-9a-f]{4,}|usdc|eth)\b/i.test(clean);
  if (!imperative) return direct;
  const matches = new Set(direct.matches);
  matches.add("instruction inside tool output");
  return { suspicious: true, matches: [...matches], layers: [...new Set([...direct.layers, "tool-output"])] };
}
