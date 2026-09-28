# Stage 4: Task Creation (tasks.md)

**Agent:** Sub-Task Creation Agent (Technical Project Manager)  
**Template:** `tasks-template.md` + multipass mode templates  
**Output:** `tasks.md`

### Prompt Summary

> "Decompose the plan into an ordered execution backlog for code generation."

Granular tasks with dependencies, agent routing, complexity, and per-task payloads — but no code.

**Mission:**

- Expand each plan phase into discrete tasks at file/package granularity
- Produce dependency DAG (Mermaid) + linear execution order
- Route each task to exactly one agent (`API_Agent`, `OperatorController_Agent`, etc.)
- Pair implementation tasks with verification tasks
- Every task gets a full payload: Objective, Target files, Non-goals, Acceptance criteria

**Required structure (§0–§5):**

| Section | Content |
|---------|---------|
| §0 | Input coverage checklist (FR/SC/phase → Task IDs) |
| §1 | Mermaid dependency graph |
| §2 | Linear execution order |
| §3 | Task manifest table |
| §4 | Per-task payloads |
| §5 | Orchestration notes (retry boundaries, merge hotspots) |

**Multipass generation (for large backlogs):**

- **Skeleton** — §0–§3 + `tasks_index.json`
- **Payloads** — §4 per phase batch
- **Orchestration** — §5 only
- **Impact assessment** — on phase rejection
- **Payload revision** — incorporate feedback

**Gate:** Stage eval scoring → refine → user approval → unlock Implementation
