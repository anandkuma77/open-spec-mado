# Stage 3: Planning (plan.md)

**Agent:** Technical Planning Agent  
**Template:** `plan-template.md`  
**Output:** `plan.md`

### Prompt Summary

> "Architectural blueprint — HOW work proceeds and in what order, without creating tasks."

Bridge approved spec + repo facts into a sequenced implementation strategy. No code, no patches, no assignable tasks.

**Mission:**

- Read `constitution.md` (first precedence), `specs.md`, `repo-assessment.md`, optional `agents.md`
- Produce sections §0–§8 covering strategy, interfaces, dependencies, phases, verification, risks
- Include mandatory **repo-grounded reality check** (greenfield vs delta vs hardening)
- Map every spec FR and P1 user story to ≥1 phase and ≥1 verification matrix row
- Each phase defines Goal, Dependencies, Target files, Required capabilities, Verification hooks
- Map phases to agent IDs from `agents.md` (or provisional taxonomy if absent)

**Input precedence (conflicts):**

1. `constitution.md` (non-negotiable)
2. `specs.md` (product behavior)
3. `repo-assessment.md` (repo facts, paths)
4. `agents.md` (agent routing)

**Required structure (§0–§8):**

| Section | Content |
|---------|---------|
| §0 | Inputs acknowledged (status table, AgentRoutingMode) |
| §1 | Architectural strategy + repo-grounded reality check |
| §2 | Persistence & state (K8s objects, operand config) |
| §3 | Interfaces & contracts (CRDs, controllers, webhooks, RBAC, OLM) |
| §4 | Dependencies & sequencing graph |
| §5 | Implementation phases (logical sequence — NOT tasks) |
| §6 | Verification matrix (unit, integration, e2e, manual) |
| §7 | Risks, migrations, operational follow-ups |
| §8 | Open questions / SME decisions |

**Gate:** Stage eval scoring → refine → user approval → unlock Task Creation
