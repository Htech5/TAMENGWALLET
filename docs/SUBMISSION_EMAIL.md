# Final submission email

**Ticket:** TMG-45 · **Deadline:** 20 Oct 2026, 23:59 Beijing time (22:59 WIB) · **Team target:** 12:00 WIB.

Send from the team lead's address, **plain text or light HTML**, with the repository public and all four PDFs attached.

---

**To:** fintechathon@ican-x.com
**Subject:** `[Submission] Tameng — Topic F Agent Wallet — Universitas Diponegoro, Indonesia`

**Attachments**

1. `Tameng_1_TechnicalDoc.pdf`
2. `Tameng_2_Deck.pdf`
3. `Tameng_3_SecurityReport.pdf`
4. `Tameng_4_ExecutionEvidence.pdf`

---

Dear FinTechathon Organizing Committee,

We are Team Tameng from Universitas Diponegoro, Indonesia, submitting to the International Track, Topic F: Agent Wallet.

**Tameng** is a mobile AI wallet agent for cross-border remittances. It sends money autonomously on the owner's mandate — scheduled splits to family and savings, with a minimum balance — and it refuses anything outside that mandate, including prompt injection, look-alike addresses and transfers that try to originate from received messages. The rule we build on: the LLM decides what the owner wants, code decides whether it is allowed.

What the submission contains:

- **11 real transactions on Base Sepolia USDC** (testnet), every receipt `success`, covering a one-off transfer, two auto-send runs, an idempotent replay and a postponed run — hashes and explorer links in the Execution Evidence PDF.
- **49 of 49 attack prompts blocked with zero funds moved** in the deterministic benchmark (54 cases total), plus six recorded red-team checks including an injected instruction, a look-alike recipient, a private-key request and a phone-style address change.
- **65 automated tests** across the policy engine, security guards, on-chain layer and HTTP server.
- A working mobile app (Expo / React Native) and a Node 22 backend with a signed-transaction policy gate; the repository below runs in simulated mode with no key and no chain access.

Links:

- Repository: https://github.com/Htech5/TAMENGWALLET
- Deployment guide: docs/DEPLOYMENT.md
- Demo video (≤ 5 min): `<LINK — TMG-44>`

We confirm the work is our own, developed for this competition, and that all on-chain activity is on the Base Sepolia testnet with no real funds.

Thank you for your time and consideration.

Sincerely,
**Hizkia Yosefha Wetrawatri Sanjaya**
Team lead, Tameng — Universitas Diponegoro, Indonesia
`<email>` · `<phone>`

---

## Send checklist

- [ ] GitHub repository is **public** and contains the pushed branch with `docs/` (branch `TMG-12-19-onchain-evidence` merged or visible).
- [ ] All four files attached, names exactly `Tameng_1_TechnicalDoc.pdf` … `Tameng_4_ExecutionEvidence.pdf`.
- [ ] Demo video link filled in (optional but recommended, TMG-44).
- [ ] Contact phone/email filled in.
- [ ] Sent before **22:59 WIB** on 20 Oct 2026; keep the sent copy.
