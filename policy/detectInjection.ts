/**
 * First-line heuristic check for prompt-injection / social-engineering
 * in user messages or tool outputs. This is a DEFENCE-IN-DEPTH layer:
 * checkPolicy() still blocks unsafe transactions even if this misses.
 *
 * TODO(security, TMG-23): extend patterns (base64, Morse, tool outputs),
 * add Indonesian variants, and consider an LLM-based second opinion.
 */

const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore (all |any )?(previous|prior|above) (instructions|rules)/i, label: "instruction override" },
  { re: /(you are|act as) (now )?(in )?(developer|admin|god|dan) mode/i, label: "role escalation" },
  { re: /(reveal|show|print|send|export).{0,30}(private key|seed phrase|mnemonic|secret)/i, label: "secret extraction" },
  { re: /(send|transfer|drain).{0,20}(all|entire|everything|max)/i, label: "drain attempt" },
  { re: /(disable|bypass|turn off|remove).{0,20}(limit|policy|confirmation|allowlist)/i, label: "policy bypass" },
  { re: /(system|admin|anthropic|openai|coinbase)\s*(says|message|override)/i, label: "fake authority" },
];

export interface InjectionResult {
  suspicious: boolean;
  matches: string[];
}

export function detectInjection(text: string): InjectionResult {
  const matches = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
  return { suspicious: matches.length > 0, matches };
}
