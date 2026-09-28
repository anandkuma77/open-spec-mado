#!/usr/bin/env python3
"""Aggregate ticket-level pipeline run metrics into monthly SDLC summary JSON.

Scans every JSON file under data/open-spec-matrics/operators/ (skipping QE/
folders) and includes any file whose contents contain a global_health block
and an exported_at timestamp, regardless of filename. Groups by calendar
month from exported_at and writes data/processed/sdlc_summary_by_month.json.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

MONTH_KEYS = ("july", "august", "september")


def month_key_from_exported_at(exported_at: str) -> str | None:
    dt = datetime.fromisoformat(exported_at.replace("Z", "+00:00"))
    key = dt.strftime("%B").lower()
    return key if key in MONTH_KEYS else None


def empty_month():
    return {
        "story_points": None,
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        "time_saved_hours": None,
        "run_count": 0,
        "sources": [],
    }


def extract_pipeline_metrics(data: dict) -> dict:
    gh = data.get("global_health") or {}
    pm = data.get("productivity_metrics") or {}
    return {
        "story_points": pm.get("story_points_delivered"),
        "cost": gh.get("estimated_cost_usd") or 0.0,
        "tokens": gh.get("total_tokens_consumed") or 0,
        "time_saved": pm.get("time_saved_hours"),
    }



def is_in_qe_dir(path: Path) -> bool:
    """True if any parent directory in the path is named QE."""
    return "QE" in path.parts[:-1]


def classify_report(data: dict) -> str | None:
    if "global_health" in data:
        return "pipeline"
    return None


def aggregate_months(operators_root: Path) -> dict:
    months = {m: empty_month() for m in MONTH_KEYS}
    story_point_hours = {m: 0.0 for m in MONTH_KEYS}
    time_saved_hours = {m: 0.0 for m in MONTH_KEYS}
    has_story_points = {m: False for m in MONTH_KEYS}
    has_time_saved = {m: False for m in MONTH_KEYS}

    for path in sorted(operators_root.glob("**/*.json")):
        if is_in_qe_dir(path):
            continue

        rel = path.relative_to(operators_root).as_posix()

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        report_kind = classify_report(data)
        if report_kind is None:
            continue

        exported_at = data.get("exported_at")
        if not exported_at:
            continue

        month = month_key_from_exported_at(exported_at)
        if month is None:
            continue

        if report_kind == "pipeline":
            metrics = extract_pipeline_metrics(data)
        else:
            continue

        entry = months[month]
        entry["run_count"] += 1
        entry["total_cost_usd"] += metrics["cost"]
        entry["total_tokens"] += metrics["tokens"]
        entry["sources"].append(rel)

        if metrics["story_points"] is not None:
            story_point_hours[month] += metrics["story_points"]
            has_story_points[month] = True

        if metrics["time_saved"] is not None:
            time_saved_hours[month] += metrics["time_saved"]
            has_time_saved[month] = True

    for month in MONTH_KEYS:
        entry = months[month]
        entry["story_points"] = story_point_hours[month] if has_story_points[month] else None
        entry["time_saved_hours"] = time_saved_hours[month] if has_time_saved[month] else None
        if entry["run_count"] == 0:
            entry["total_cost_usd"] = None
            entry["total_tokens"] = None

    return months


def main():
    parser = argparse.ArgumentParser(description="Generate SDLC monthly summary JSON.")
    parser.add_argument(
        "--operators-root",
        default="data/open-spec-matrics/operators",
        help="Root directory containing operator metric JSON files",
    )
    parser.add_argument(
        "--output",
        default="data/processed/sdlc_summary_by_month.json",
        help="Output path for processed monthly summary",
    )
    args = parser.parse_args()

    operators_root = Path(args.operators_root)
    months = aggregate_months(operators_root)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "months": months,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"SDLC summary written to {out_path}")
    for month, entry in months.items():
        print(
            f"  {month}: runs={entry['run_count']}, "
            f"story_points={entry['story_points']}, "
            f"cost={entry['total_cost_usd']}, "
            f"tokens={entry['total_tokens']}"
        )


if __name__ == "__main__":
    main()
