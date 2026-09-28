# Stage 1: Spec Understanding (validation.json → specs.md)

**Agent:** Specification Validator → Specification Analyst  
**Template:** `validation-template.md`, `spec-template.md`  
**Output:** `validation.json`, `specs.md`

---

## Step 1: Specification Validation

### Prompt Summary

> "Quality gate before engineering — is the Jira spec complete, testable, and contradiction-free?"

Catch ambiguous, incomplete, inconsistent, or un-testable requirements early. Make gaps explicit — do not invent product behavior.

**Mission:**

- Score completeness (60%) and quality (40%) against a structured rubric
- Check context, personas, acceptance criteria, scope, dependencies, impacted repos
- Flag ambiguity, testability, sizing, and consistency issues
- Emit `validation.json` with scores, `missing_elements`, `blockers`, and rewrite suggestions

**Gate outcomes:**

| Status | Action |
|--------|--------|
| PASS (≥80%, no blockers) | Proceed to spec authoring |
| NEEDS_REVISION | Proceed with gaps noted as assumptions |
| BLOCKED | Halt pipeline |

---

## Step 2: Spec Authoring

### Prompt Summary

> "Transform the Jira ticket into a clean, technology-agnostic feature spec."

Express *what* the system must do — never *how*. No languages, frameworks, file paths, or API details.

**Mission:**

- Extract prioritized user stories (P1/P2/P3) with Given/When/Then acceptance scenarios
- Derive functional requirements (`FR-001`, `FR-002`, …)
- Define measurable success criteria (`SC-001`, `SC-002`, …)
- Document assumptions for unresolved ticket gaps (max 3 `[NEEDS CLARIFICATION]` markers)
- Address Stage 0 `missing_elements` from `validation.json`

**Required structure:**

| Section | Content |
|---------|---------|
| User Scenarios & Testing | Prioritized stories, acceptance scenarios, edge cases |
| Requirements | `FR-xxx` functional requirements, key entities |
| Success Criteria | `SC-xxx` measurable, user-observable outcomes |
| Assumptions | `A-xxx` numbered assumptions |

**Gate:** User approval required. **Rejection exits the entire workflow** — no feedback loop, no downstream stages.
