# Working on Tameng

Every change starts from a Jira ticket (`TMG-xx`) on tameng.atlassian.net. Putting the ticket key in branch names and commit messages lets the board show which code belongs to which ticket.

## Workflow

1. **Pick your ticket** on the board and move it to **In Progress**.
2. **Branch from `main`** using the ticket key:
   ```bash
   git checkout main && git pull
   git checkout -b TMG-31-chat-decision-cards
   ```
3. **Commit with the key first:**
   ```
   TMG-31 Add Allow / Confirm / Deny decision cards
   ```
4. **Run tests** before pushing: `npm test`.
5. **Push and open a pull request** into `main`. Title: `TMG-31 Chat screen + decision cards`.
6. **One reviewer** approves (see table below), then merge. Move the ticket to **Done**.

Small fixes in your own folder can go straight to `main` after the feature freeze is close, but still use the ticket key in the commit.

## Who reviews what

| Folder | Owner | Reviewer |
|---|---|---|
| `app/` | Faris | Habib |
| `agent/` | Faras | Habib |
| `onchain/` | Farrel | Habib |
| `policy/`, `server/` | Habib | Faras |
| `docs/` | Hizkia | Faris |

Anything that touches `policy/` must be reviewed by Habib or include a passing test for the new rule.

## Folder boundaries

- Stay inside your own folder. If you need something from another folder, import it, don't copy it.
- Shared types for transactions and policy decisions live in `policy/types.ts`. Ask Habib before changing them.
- The mobile app talks to the backend **only** through the HTTP API listed in the README. No keys in `app/`.

## Linking GitHub to Jira (team lead, once)

Install the **GitHub for Jira** app on the Jira site and connect this repository. After that, branches, commits and pull requests that contain `TMG-xx` show up inside the matching ticket automatically.

## Commit hygiene

- Never commit `.env`, private keys, or wallet files. `.gitignore` blocks the common ones; still check `git status`.
- Keep commits focused on one ticket.
- Write commit messages in English (the whole submission is in English).
