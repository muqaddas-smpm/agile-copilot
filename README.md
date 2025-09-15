# **README.md — Agile Copilot MVP**

````markdown
# Agile Copilot — AI Agile Reporting for Scrum Masters & PMs

**Tagline:** AI-powered Agile Copilot that turns sprint CSV exports into concise sprint health reports, executive summaries, and Slack-style standup drafts.  
**Status:** MVP (V1) — CSV/Jira export support. Architecture designed to extend to Azure DevOps, Rally, and direct API connectors.

---

## TL;DR
Agile Copilot accepts a sprint CSV (Jira, ADO, Rally exports or generic CSV), computes key metrics (velocity, %complete, blockers), and generates:
- **Sprint Health Summary** (Markdown)  
- **Executive Status Update** (1-page summary for stakeholders)  
- **Daily Standup Draft** (one short line per assignee, Slack-ready)

This repo is a 2-week portfolio MVP demonstrating prompt engineering, backend integration with an LLM, and a simple frontend demo.

---

## Demo (what you’ll see)
- Upload `sample_sprint.csv` → click **Generate Report** → see Markdown sprint report and standup lines.  
- Optional: Post the summary to a Slack channel (demo webhook).

---

## Features (V1)
- Parse CSV sprint exports (Jira format or generic with required columns)  
- Compute sprint aggregates (total story points, completed, percent complete)  
- Detect blocked items and surface top risks  
- Generate three output modes: Sprint Report / Exec Summary / Standup Draft  
- Simple web UI for uploading CSV and viewing Markdown output

---

## Tech Stack (suggested)
- Node.js + Express (backend)  
- OpenAI API (LLM)  
- Frontend: static `index.html` (fetch to `/api/report`)  
- Optional: Slack Incoming Webhook (demo posting)  
- Deploy: Replit / Vercel / Render (for demo)

---

## Quickstart (run locally)

### Prereqs
- Node.js (14+) or use Replit/Vercel  
- OpenAI API key

### Setup
```bash
# clone (after you create repo)
git clone https://github.com/<your-username>/agile-copilot.git
cd agile-copilot

# install deps
npm install

# create .env
# OPENAI_API_KEY=sk-...
# PORT=3000
# (optional) SLACK_WEBHOOK_URL=https://hooks.slack.com/...
````

### Run (dev)

```bash
npm run dev     # or `node server/index.js`
# open http://localhost:3000
```

---

## Sample CSV format (required columns)

Your CSV should include these or mapped equivalents:

```
issue_key,summary,assignee,status,story_points,labels,created,updated
PROJ-12,Add login flow,Aisha,Done,5,feature;ui,2025-09-01,2025-09-07
PROJ-13,Payment API,Bilal,In Progress,8,backend,2025-09-02,2025-09-10
PROJ-14,Fix bug,Sara,Blocked,3,bug;blocked,2025-09-03,2025-09-11
```

If using other tools, export CSV and ensure column names above are present or mapped in the uploader.

---

## Prompt templates (example)

**System prompt**

```
You are an expert Scrum Master and Agile coach. Produce concise, actionable sprint health summaries and Slack-friendly standup lines. Output only in Markdown.
```

**User prompt (template)**

```
Sprint JSON:
{{AGGREGATED_JSON}}

Produce:
1) Sprint Health Summary (key stats, counts, percent complete)
2) Top 3 risks with short reasons
3) 3 suggested next steps (actionable)
4) Slack-ready one-line standup per assignee: "@name — one-line update"
Return Markdown only.
```

---

## Example output (sample)

```markdown
## Sprint Health Summary — Sprint 12
**Key stats**
- Total story points: 40
- Completed: 26 (65% complete)
- Done / In Progress / Blocked: 12 / 6 / 2

**Top 3 risks**
1. PROJ-123 — API bug (blocks two stories) — risk: delays cross-team dependencies.
2. PROJ-145 — High scope on feature X — risk: incomplete QA time.
3. PROJ-150 — Unassigned tasks — risk: work redistribution needed.

**Suggested Next Steps**
- Triage PROJ-123 with backend owners and assign hotfix owner.
- Re-scope feature X for MVP and move lower-priority work to next sprint.
- Reassign unowned tasks and confirm owners in today's standup.

**Slack standup lines**
@Aisha — Completed: payment integration; In progress: UI tests; Blocked: none.
@Bilal — Completed: API endpoint; In progress: bugfix PROJ-123; Blocked: needs backend review.
@Sara — Completed: docs; In progress: regression tests; Blocked: waiting on infra.
```

---

## Security & privacy

* V1 demo uses sample data only. For production, never store PII in plaintext.
* Use OAuth when integrating real project tools; limit scopes.
* Keep `OPENAI_API_KEY` secret (use environment variables).

---

## Roadmap (V2+)

* Add direct connectors: Jira API, Azure DevOps, Rally
* Save historical sprints → analytics + trends (velocity, %complete over time)
* Retrospective auto-suggestions and voting cards
* Multi-tenant auth, team settings, and admin UI

---

## Contributing / Notes

This is a personal portfolio project to demonstrate AI + Agile thinking. PRs and feedback welcome — open an Issue.

---

## License

MIT 

---

## Contact

Muqaddas Ejaz — LinkedIn: <https://www.linkedin.com/in/muqaddas-ejaz> — Email: <muqaddas.tech101@gmail.com>

```
