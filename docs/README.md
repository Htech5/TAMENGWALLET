# docs/ — Submission materials

**Owner:** Hizkia Yosefha Wetrawatri Sanjaya · **Epic:** TMG-6 Docs & Submission

Everything is in English and goes to fintechathon@ican-x.com before **20 Oct 2026, 23:59 Beijing time (22:59 WIB)**. Team target: 12:00 WIB.

## Submission checklist

| # | Item | Ticket | File | Status |
|---|---|---|---|---|
| 1 | Technical documentation (architecture, core algorithm, security design) | TMG-39 | [`TECHNICAL_DOC.md`](TECHNICAL_DOC.md) → [`submission/Tameng_1_TechnicalDoc.pdf`](submission/Tameng_1_TechnicalDoc.pdf) | done |
| 2 | Presentation deck (≤ 10 min) | TMG-40 | [`build/deck.html`](build/deck.html) → [`submission/Tameng_2_Deck.pdf`](submission/Tameng_2_Deck.pdf) (12 slides) | done |
| 3 | Demo video (≤ 5 min, optional) | TMG-44 | link | open |
| 4 | Source code: README, GitHub link, deployment guide, tests | TMG-43 | [repo root](../README.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), `npm test` (120 pass) | done |
| 5 | Security self-assessment (permission tiers, threat model + known risks) | TMG-41 | [`SECURITY_REPORT.md`](SECURITY_REPORT.md) → [`submission/Tameng_3_SecurityReport.pdf`](submission/Tameng_3_SecurityReport.pdf) | done |
| 6 | Execution evidence: real on-chain tx hashes + app screens | TMG-42 | [`EXECUTION_EVIDENCE.md`](EXECUTION_EVIDENCE.md) → [`submission/Tameng_4_ExecutionEvidence.pdf`](submission/Tameng_4_ExecutionEvidence.pdf) | done |
| — | Final submission email | TMG-45 | [`SUBMISSION_EMAIL.md`](SUBMISSION_EMAIL.md) | draft ready |

The PDFs are rebuilt from source with `python3 docs/build/render_pdfs.py`; the app screenshots in the evidence PDF live in [`submission/screenshots/`](submission/screenshots/).

The repository must be **public** before the submission email is sent so judges can open the link.
