# Stage 2: Repo Understanding (repo-assessment.md)

**Agent:** Repository Assessment Agent (Principal Software Engineer)  
**Template:** `repo-assessment-template.md`  
**Output:** `repo-assessment.md`

### Prompt Summary

> "Produce a grounded 'how to work in this repo' playbook for downstream planning."

Not a file inventory — a fact-based engineering guide the Planning Agent can trust. Every claim must cite repo evidence.

**Mission:**

- Analyze the target repository (or working folder) against approved `specs.md`
- Document architecture, reconciliation flow, and component map
- Identify target files to modify/create with confidence levels
- List reusable assets, architectural guardrails, and change cascades
- Provide test commands, CI pipeline info, and developer workflow
- Call out risks, branch-specific absences, and UNVERIFIED items
- Does **not** use `constitution.md` — governance is resolved after this stage

**Required structure (§0–§12):**

| Section | Content |
|---------|---------|
| §0 | Inputs & tooling (repo, branch, commit, tooling status) |
| §1 | Architecture overview (components, frameworks, data flow) |
| §2 | Target files (modify/create with confidence levels) |
| §3 | Reference context (read-only files for patterns) |
| §4 | Configuration surface & runtime behavior (hooks, status, feature gates) |
| §5 | Reusable assets (what NOT to reimplement) |
| §6 | Architectural guardrails (structural, API, build, security) |
| §7 | Change cascade checklist ("when X changes, also change Y") |
| §8 | Test & CI reference (commands, pipeline, coverage gaps) |
| §9 | Developer workflow (Makefile targets, "how to add..." walkthroughs) |
| §10 | Platform integration (SCC, proxy, OLM, FIPS) |
| §11 | Risks & downstream impacts (branch honesty) |
| §12 | Quick reference card (preflight checklist, file quick-nav) |

**Gate:** Stage eval scoring → refine → user approval → resolve `constitution.md` → unlock Planning
