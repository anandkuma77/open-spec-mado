#!/usr/bin/env python3
"""Generate processed metrics JSON from raw metric data.

Reads every raw metric JSON file in --raw-dir, groups them by JIRA epic,
aggregates per-epic and per-ticket summaries, and writes processed JSON files
that the dashboard's JS can fetch at runtime.

Produces two outputs:
  1. Epics JSON (--output)  — from raw metric files in the top-level --raw-dir
  2. QE JSON    (--qe-output) — from raw QE files in the --raw-dir/QE/ subfolder

Usage:
    python3 scripts/generate_processed_metrics.py \
        --raw-dir data/open-spec-matrics/operators/ztwim \
        --output  data/processed/ztwim_epics.json \
        --qe-output data/processed/ztwim_qe.json
"""

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Display-name mappings
# ---------------------------------------------------------------------------

PHASE_DISPLAY_NAMES = {
    "spec_understanding": "1. Spec Understanding",
    "repo_assessment": "2. Repo Assessment",
    "arch_planning": "3. Architectural Planning",
    "subtask_creation": "4. Sub-Tasks Creation (DAG)",
    "code_generation": "5. Code Generation / Harness",
}

AGENT_TYPE_MAP = {
    "ai_helpers": "AI Helpers",
    "ai_helper": "AI Helpers",
    "cursor_agent": "Cursor Agent",
    "cursor": "Cursor Agent",
}

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def format_tokens(n):
    """486958 -> '487.0k'"""
    if n >= 1000:
        return f"{n / 1000:.1f}k"
    return str(n)


def format_duration(seconds):
    """11457.7 -> '190m 58s', 0.3 -> '< 1s'"""
    if seconds < 1:
        return "< 1s"
    total_s = round(seconds)
    m = total_s // 60
    s = total_s % 60
    return f"{m}m {s}s"


def format_cost(usd):
    """2.2254 -> '$2.23'"""
    return f"${usd:.2f}"

# ---------------------------------------------------------------------------
# Filename / label helpers
# ---------------------------------------------------------------------------

def _format_model_name(raw):
    """'composer_2_5' -> 'Composer 2.5', 'sonnet5_metrics_report' -> 'Sonnet 5'"""
    if not raw:
        return ""
    for suffix in ("_metrics_report", "_report"):
        if raw.endswith(suffix):
            raw = raw[: -len(suffix)]
    if not raw:
        return ""
    parts = raw.split("_")
    result = []
    i = 0
    while i < len(parts):
        part = parts[i]
        m = re.match(r"^([a-zA-Z]+)(\d+)$", part)
        if m:
            result.append(m.group(1).capitalize())
            if i + 1 < len(parts) and parts[i + 1].isdigit():
                result.append(f"{m.group(2)}.{parts[i + 1]}")
                i += 2
            else:
                result.append(m.group(2))
                i += 1
        elif part.isdigit() and i + 1 < len(parts) and parts[i + 1].isdigit():
            result.append(f"{part}.{parts[i + 1]}")
            i += 2
        else:
            result.append(part.capitalize())
            i += 1
    return " ".join(result)


def derive_agent_label(filename):
    """Derive a human-readable agent label from a raw-metric filename.

    'ztwim_ai_helper_composer_2_5.json'                       -> 'AI Helpers + Composer 2.5'
    'ztwim_cursor_composer_2_5.json'                          -> 'Cursor Agent + Composer 2.5'
    'sscsi-openspec-ai-helpers-sonnet5-metrics-report.json'   -> 'AI Helpers + Sonnet 5'
    'sscsi-openspec-cursor-agent-sonnet5-metrics-report.json' -> 'Cursor Agent + Sonnet 5'
    """
    stem = os.path.splitext(os.path.basename(filename))[0]
    normalized = stem.replace("-", "_")
    for key, label in sorted(AGENT_TYPE_MAP.items(), key=lambda x: -len(x[0])):
        idx = normalized.find(key)
        if idx >= 0:
            model_part = normalized[idx + len(key) :].strip("_")
            model_name = _format_model_name(model_part)
            return f"{label} + {model_name}" if model_name else label
    return stem


def simplify_task_name(task_name):
    """Strip the operator-name prefix that precedes the dash separator.

    'Zero Trust Workload Identity Manager-  Central TLS Profile consistency'
    -> 'Central TLS Profile consistency'
    """
    if "-" in task_name:
        _, _, rest = task_name.partition("-")
        cleaned = rest.lstrip("- ").strip()
        if cleaned:
            return cleaned
    return task_name


def extract_jira_key(url):
    """'.../browse/SPIRE-359' -> 'SPIRE-359'"""
    return url.rstrip("/").split("/")[-1]

# ---------------------------------------------------------------------------
# Metric derivation helpers
# ---------------------------------------------------------------------------

def count_rejections(phases):
    """Count phases that were rejected (have a 'failed' entry)."""
    return sum(1 for p in phases if p.get("status") == "failed")


def _clean_quality_label(raw_label):
    """Normalise minor variants ('approved-round-1' -> 'approved')."""
    if re.match(r"^approved-round-\d+$", raw_label, re.IGNORECASE):
        return "approved"
    return raw_label


def build_quality_label(score, label, phase_name=None, tasks_total=0):
    """Produce the 'Quality / Eval Output' cell text for one phase row."""
    cleaned = _clean_quality_label(label.strip())

    if phase_name == "code_generation" and score == 0:
        if "implementation report" in cleaned.lower():
            return f"Implementation report complete ({tasks_total} tasks)"
        if cleaned:
            return cleaned[0].upper() + cleaned[1:]
        return ""

    if score > 0:
        result = f"Score: {int(score)}/100"
        if cleaned and not cleaned.startswith("Approved"):
            result += f" \u2014 {cleaned}"
        return result

    if cleaned:
        return cleaned[0].upper() + cleaned[1:]
    return ""


def _task_duration_s(task):
    start = datetime.fromisoformat(task["started_at"])
    end = datetime.fromisoformat(task["completed_at"])
    return (end - start).total_seconds()


def _has_generic_titles(tasks):
    """True when every task_title equals its task_id (no human-readable names)."""
    return all(t["task_title"] == t["task_id"] for t in tasks)


def detect_unit_test_tasks(tasks):
    """Return the subset of tasks whose titles indicate unit / regression tests."""
    keywords = ["unit test", "regression test"]
    return [
        t
        for t in tasks
        if any(kw in t["task_title"].lower() for kw in keywords)
    ]

# ---------------------------------------------------------------------------
# Phase processing
# ---------------------------------------------------------------------------

def process_phases(phases_list, tasks_total):
    """Aggregate raw phase entries (including retries) into display-ready rows."""
    groups = defaultdict(list)
    for p in phases_list:
        groups[p["phase_number"]].append(p)

    result = []
    for phase_num in sorted(groups):
        entries = groups[phase_num]
        last = entries[-1]

        total_duration = sum(e["duration_s"] for e in entries)
        total_tokens_in = sum(e["tokens_in"] for e in entries)
        total_tokens_out = sum(e["tokens_out"] for e in entries)

        display_name = PHASE_DISPLAY_NAMES.get(last["phase_name"], last["phase_name"])
        status = "PASSED" if last["status"] == "passed" else last["status"].upper()
        iters = last["iteration_count"]

        result.append(
            {
                "phase_name": display_name,
                "status": status,
                "iterations": f"{iters} Iteration{'s' if iters != 1 else ''}",
                "time_taken": format_duration(total_duration),
                "tokens_in_out": (
                    f"{format_tokens(total_tokens_in)} / "
                    f"{format_tokens(total_tokens_out)}"
                ),
                "quality": build_quality_label(
                    last.get("quality_score", 0),
                    last.get("quality_label", ""),
                    phase_name=last["phase_name"],
                    tasks_total=tasks_total,
                ),
            }
        )
    return result


def build_unit_test_phase(test_tasks):
    """Synthesise the '5.1 Unit Tests' phase row from identified test tasks."""
    n = len(test_tasks)
    if n == 0:
        return None

    tokens_in = sum(t["tokens_in"] for t in test_tasks)
    tokens_out = sum(t["tokens_out"] for t in test_tasks)
    self_corrections = sum(t.get("self_correction_loops", 0) for t in test_tasks)
    duration = sum(_task_duration_s(t) for t in test_tasks)
    passed = sum(1 for t in test_tasks if t["status"] == "passed")

    return {
        "phase_name": f"5.1 Unit Tests ({n} tasks)",
        "status": "PASSED" if passed == n else "PARTIAL",
        "iterations": f"{self_corrections} Self-corrections",
        "time_taken": format_duration(duration),
        "tokens_in_out": f"{format_tokens(tokens_in)} / {format_tokens(tokens_out)}",
        "quality": f"{passed}/{n} tasks passed",
    }

# ---------------------------------------------------------------------------
# Per-run (ticket) processing
# ---------------------------------------------------------------------------

def process_run(raw_data, filename):
    """Transform one raw-metric JSON file into a processed ticket dict."""
    gh = raw_data["global_health"]
    run = raw_data["run"]

    phases = process_phases(raw_data["phases"], gh["tasks_total"])
    test_tasks = detect_unit_test_tasks(raw_data["tasks"])
    generic = _has_generic_titles(raw_data["tasks"])

    return {
        "ticket_id": extract_jira_key(raw_data["jira_task_link"]),
        "ticket_link": raw_data["jira_task_link"],
        "ticket_summary": simplify_task_name(raw_data["jira_task_name"]),
        "agent_label": derive_agent_label(filename),
        "status": "Completed" if run["status"] == "completed" else run["status"].title(),
        "health": {
            "total_tokens": format_tokens(gh["total_tokens_consumed"]),
            "run_cost": format_cost(gh["estimated_cost_usd"]),
            "wall_time": format_duration(gh["cumulative_wall_time_s"]),
            "eval_rejections": count_rejections(raw_data["phases"]),
            "agent_success_pct": f"{gh['agent_success_rate']:.0f}%",
            "tasks_passed": gh["tasks_passed"],
            "tasks_total": gh["tasks_total"],
        },
        "phases": phases,
        # internal fields (removed before final output)
        "_test_tasks": test_tasks,
        "_generic_titles": generic,
        "_raw_tasks": raw_data["tasks"],
        "_global_health": gh,
    }

# ---------------------------------------------------------------------------
# Epic-level aggregation
# ---------------------------------------------------------------------------

def aggregate_epic(epic_meta, tickets):
    """Combine per-ticket data into epic-level summary and resolve unit tests."""

    # Resolve unit-test tasks for runs that have only generic titles by
    # borrowing the detected count from a sibling run with descriptive titles.
    descriptive_test_count = 0
    for t in tickets:
        if not t["_generic_titles"] and t["_test_tasks"]:
            descriptive_test_count = len(t["_test_tasks"])
            break

    total_unit_tests = 0
    total_unit_test_tokens = 0

    for t in tickets:
        test_tasks = t["_test_tasks"]
        if t["_generic_titles"] and not test_tasks and descriptive_test_count > 0:
            test_tasks = t["_raw_tasks"][-descriptive_test_count:]

        ut_phase = build_unit_test_phase(test_tasks)
        if ut_phase:
            t["phases"].append(ut_phase)
            total_unit_tests += len(test_tasks)
            total_unit_test_tokens += sum(
                tk["tokens_in"] + tk["tokens_out"] for tk in test_tasks
            )

    runs_total = len(tickets)
    runs_completed = sum(1 for t in tickets if t["status"] == "Completed")
    total_tokens_raw = sum(t["_global_health"]["total_tokens_consumed"] for t in tickets)
    total_passed = sum(t["health"]["tasks_passed"] for t in tickets)
    total_tasks = sum(t["health"]["tasks_total"] for t in tickets)
    agent_success = (total_passed / total_tasks * 100) if total_tasks else 0
    all_complete = runs_completed == runs_total

    for t in tickets:
        for key in ("_test_tasks", "_generic_titles", "_raw_tasks", "_global_health"):
            t.pop(key, None)

    return {
        "epic_id": epic_meta["epic_id"],
        "epic_link": epic_meta["epic_link"],
        "epic_title": epic_meta["epic_title"],
        "status": "Complete" if all_complete else "In Progress",
        "progress_pct": 100 if all_complete else round(runs_completed / runs_total * 100),
        "summary": {
            "runs_completed": runs_completed,
            "runs_total": runs_total,
            "total_tokens": format_tokens(total_tokens_raw),
            "agent_success_pct": f"{agent_success:.0f}%",
            "open_blockers": 0,
            "unit_tests": total_unit_tests,
            "unit_test_tokens": format_tokens(total_unit_test_tokens),
        },
        "tickets": tickets,
    }

# ---------------------------------------------------------------------------
# QE metric processing
# ---------------------------------------------------------------------------

def process_qe_run(raw_data):
    """Transform one raw QE metric JSON file into a processed QE ticket dict."""
    coverage = raw_data.get("ac_scenario_coverage", {})
    automation = raw_data.get("automation_coverage", {})
    fpr = raw_data.get("first_pass_rate", {})
    flake = raw_data.get("flake_rate", {})
    bugs = raw_data.get("bugs", {})
    triage = raw_data.get("triage_accuracy", {})
    cost = raw_data.get("cost", {})

    return {
        "ticket_id": extract_jira_key(raw_data["jira_task_link"]),
        "ticket_link": raw_data["jira_task_link"],
        "ticket_name": raw_data.get("jira_task_name", ""),
        "change_name": raw_data.get("change_name", ""),
        "pr_url": raw_data.get("pr_url", ""),
        "phase": raw_data.get("phase", ""),
        "mode": raw_data.get("mode", ""),
        "ac_scenario_coverage": {
            "total": coverage.get("total_acceptance_criteria", 0),
            "covered": coverage.get("criteria_covered_by_tests", 0),
            "pct": coverage.get("coverage_pct", 0),
            "uncovered": coverage.get("uncovered", []),
        },
        "automation_coverage": {
            "total": automation.get("total_scenarios", 0),
            "automated": automation.get("automated", 0),
            "manual": automation.get("manual", 0),
            "pct": automation.get("coverage_pct", 0),
        },
        "first_pass_rate": {
            "executed": fpr.get("tests_executed", 0),
            "passed": fpr.get("tests_passed_first_run", 0),
            "failed": fpr.get("tests_failed_first_run", 0),
            "pct": fpr.get("pass_rate_pct", 0),
            "source": fpr.get("execution_source", ""),
        },
        "flake_rate": {
            "retries": flake.get("total_retries", 0),
            "retries_passed": flake.get("retries_passed_no_code_change", 0),
            "pct": flake.get("flake_rate_pct", 0),
        },
        "bugs": {
            "found": bugs.get("found", 0),
            "verified": bugs.get("verified", 0),
            "details": bugs.get("details", []),
        },
        "triage_accuracy": {
            "total": triage.get("total_triaged", 0),
            "correct": triage.get("correct", 0),
            "pct": triage.get("accuracy_pct"),
            "reason": triage.get("reason", ""),
        },
        "cost": {
            "tokens_in": cost.get("tokens_in", 0),
            "tokens_out": cost.get("tokens_out", 0),
            "tokens_total": cost.get("tokens_total", 0),
            "tokens_total_fmt": format_tokens(cost.get("tokens_total", 0)),
            "estimated_cost_usd": format_cost(cost.get("estimated_cost_usd", 0)),
            "wall_time": format_duration(cost.get("wall_time_s", 0)),
            "per_stage": [
                {
                    "stage": s.get("stage", ""),
                    "tokens_in": s.get("tokens_in", 0),
                    "tokens_out": s.get("tokens_out", 0),
                    "duration": format_duration(s.get("duration_s", 0)),
                }
                for s in cost.get("per_stage", [])
            ],
        },
    }


def aggregate_qe_epic(epic_meta, tickets, has_epic):
    """Combine per-ticket QE data into an epic-level QE summary."""
    total_ac = sum(t["ac_scenario_coverage"]["total"] for t in tickets)
    covered_ac = sum(t["ac_scenario_coverage"]["covered"] for t in tickets)
    total_scenarios = sum(t["automation_coverage"]["total"] for t in tickets)
    automated = sum(t["automation_coverage"]["automated"] for t in tickets)
    total_tests = sum(t["first_pass_rate"]["executed"] for t in tickets)
    passed_first = sum(t["first_pass_rate"]["passed"] for t in tickets)
    bugs_found = sum(t["bugs"]["found"] for t in tickets)
    bugs_verified = sum(t["bugs"]["verified"] for t in tickets)
    total_tokens = sum(t["cost"]["tokens_in"] + t["cost"]["tokens_out"] for t in tickets)
    total_cost_raw = sum(
        float(t["cost"]["estimated_cost_usd"].replace("$", "")) for t in tickets
    )

    return {
        "epic_id": epic_meta["epic_id"],
        "epic_link": epic_meta["epic_link"],
        "epic_title": epic_meta["epic_title"],
        "has_epic": has_epic,
        "summary": {
            "tickets_count": len(tickets),
            "ac_coverage_pct": round(covered_ac / total_ac * 100, 1) if total_ac else 0,
            "automation_pct": round(automated / total_scenarios * 100, 1) if total_scenarios else 0,
            "first_pass_pct": round(passed_first / total_tests * 100, 1) if total_tests else 0,
            "bugs_found": bugs_found,
            "bugs_verified": bugs_verified,
            "total_tokens": format_tokens(total_tokens),
            "total_cost": format_cost(total_cost_raw),
        },
        "tickets": tickets,
    }


def generate_qe_output(raw_dir, qe_output):
    """Scan raw_dir/QE/ for QE JSON files, process, and write output."""
    qe_dir = os.path.join(raw_dir, "QE")
    if not os.path.isdir(qe_dir):
        payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "epics": []}
        out_dir = os.path.dirname(qe_output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(qe_output, "w") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"QE metrics: no QE/ directory found, wrote empty {qe_output}")
        return

    qe_files = sorted(f for f in os.listdir(qe_dir) if f.endswith(".json"))
    if not qe_files:
        payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "epics": []}
        out_dir = os.path.dirname(qe_output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(qe_output, "w") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"QE metrics: no JSON files in QE/, wrote empty {qe_output}")
        return

    epic_groups = defaultdict(lambda: {"epic_id": None, "epic_link": None,
                                        "epic_title": None, "has_epic": False,
                                        "tickets": []})

    for fname in qe_files:
        with open(os.path.join(qe_dir, fname)) as f:
            raw = json.load(f)
        has_epic = bool(raw.get("jira_epic_link"))
        key = raw.get("jira_epic_link") or raw.get("jira_task_link", "unknown")
        grp = epic_groups[key]
        grp["epic_id"] = extract_jira_key(key)
        grp["epic_link"] = key
        grp["epic_title"] = raw.get("jira_epic_name", raw.get("jira_task_name", ""))
        if has_epic:
            grp["has_epic"] = True
        grp["tickets"].append(process_qe_run(raw))

    epics = [
        aggregate_qe_epic(meta, meta.pop("tickets"), meta.pop("has_epic"))
        for meta in epic_groups.values()
    ]

    out_dir = os.path.dirname(qe_output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "epics": epics,
    }
    with open(qe_output, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"QE metrics written to {qe_output}")
    for epic in epics:
        print(f"  QE Epic {epic['epic_id']}: {len(epic['tickets'])} tickets")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate processed metrics JSON from raw metric data.",
    )
    parser.add_argument(
        "--raw-dir", required=True,
        help="Directory containing raw metric JSON files",
    )
    parser.add_argument(
        "--output", required=True,
        help="Output path for the processed epics JSON file",
    )
    parser.add_argument(
        "--qe-output",
        help="Output path for the processed QE JSON file (defaults to sibling of --output)",
    )
    args = parser.parse_args()

    # --- Epics processing (existing) ---
    raw_files = sorted(
        f for f in os.listdir(args.raw_dir) if f.endswith(".json")
    )

    epic_groups = defaultdict(lambda: {"epic_id": None, "epic_link": None,
                                        "epic_title": None, "tickets": []})

    for fname in raw_files:
        with open(os.path.join(args.raw_dir, fname)) as f:
            raw = json.load(f)
        key = raw["jira_epic_link"]
        grp = epic_groups[key]
        grp["epic_id"] = extract_jira_key(key)
        grp["epic_link"] = key
        grp["epic_title"] = raw["jira_epic_name"]
        grp["tickets"].append(process_run(raw, fname))

    epics = [
        aggregate_epic(meta, meta.pop("tickets"))
        for meta in epic_groups.values()
    ]

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "epics": epics,
    }
    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Processed metrics written to {args.output}")
    for epic in epics:
        print(f"  Epic {epic['epic_id']}: {len(epic['tickets'])} tickets, "
              f"{epic['summary']['total_tokens']} total tokens")

    # --- QE processing ---
    qe_output = args.qe_output
    if not qe_output:
        base, _ = os.path.splitext(args.output)
        qe_output = base.replace("_epics", "") + "_qe.json"
    generate_qe_output(args.raw_dir, qe_output)


if __name__ == "__main__":
    main()
