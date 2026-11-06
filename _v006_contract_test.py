from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parent
JUDGE = ROOT / "母版" / "judge.py"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def file_manifest(root: Path) -> list[dict]:
    rows = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.relative_to(root).as_posix()):
        data = path.read_bytes()
        rows.append({
            "path": path.relative_to(root).as_posix(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    return rows


def make_case(
    root: Path,
    name: str,
    any_of: object,
    any_of_status: str,
    omit_any_of: bool = False,
    run_id: str = "C01",
) -> tuple[Path, list[str], dict]:
    case = root / name
    task = case / "T-contract"
    answer_package = case / "answer_package" / run_id
    answers = answer_package / "output"
    inputs = case / "inputs"
    task.mkdir(parents=True)
    answers.mkdir(parents=True)
    inputs.mkdir()
    (inputs / "A01.txt").write_text("synthetic input\n", encoding="utf-8")

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "结果"
    sheet["A1"] = 42
    workbook.save(answers / "answer.xlsx")
    workbook.close()

    rubric = {
        "meta": {
            "schema_version": 3,
            "total": 100,
            "items": 1,
            "strategy": "fixed",
            "model": "deepseek-v4.1-flash/max",
        },
        "items": [
            {
                "id": "R01",
                "difficulty_id": "D01",
                "business_field_keys": ["BF01"],
                "score": 100,
                "kind": "cell",
                "where": {
                    "file": "answer.xlsx",
                    "part": "结果",
                    "sheet": "结果",
                    "cell": "A1",
                },
                "expect": 42,
                "match_mode": "numeric",
                "unit": "分",
                "precision": 0,
                "tol": 0,
                "basis": {
                    "source_refs": ["synthetic"],
                    "answer_layers": ["fact"],
                    "difficulty_evidence": "synthetic",
                },
            }
        ],
    }
    gate = {
        "score_max": 100,
        "score_rule": ">=",
        "any_of": any_of,
        "extraction_status": {
            "score_max": "extracted",
            "score_rule": "extracted",
            "any_of": any_of_status,
        },
    }
    if omit_any_of:
        del gate["any_of"]

    runtime = {
        "run_id": run_id,
        "model": "deepseek-v4.1-flash/max",
        "started_at": "2026-11-05T10:00:00+08:00",
        "ended_at": "2026-11-05T10:10:00+08:00",
        "minutes": 10,
        "rounds": 2,
        "natural_finish": True,
        "rounds_source": "self-report",
        "host_trace_status": "not_available",
    }
    host_trace = {
        "schema_version": 1,
        "source": "host",
        "task_id": task.name,
        "run_id": run_id,
        "model": "deepseek-v4.1-flash/max",
        "started_at": "2026-11-05T10:00:00+08:00",
        "ended_at": "2026-11-05T10:10:00+08:00",
        "minutes": 10,
        "rounds": 2,
    }
    paths = {
        "rubric": case / "rubric.json",
        "gate": case / "gate.json",
        "runtime": answers / "运行记录.json",
        "host_trace": answer_package / "host_trace.json",
        "report": task / "artifacts" / "14_score" / "评分.json",
        "task": task,
        "run_id": run_id,
        "archive": task / "artifacts" / "13_answer" / run_id,
    }
    write_json(paths["rubric"], rubric)
    write_json(paths["gate"], gate)
    write_json(paths["runtime"], runtime)
    write_json(paths["host_trace"], host_trace)
    command = [
        sys.executable,
        str(JUDGE),
        "--answers",
        str(answers),
        "--rubric",
        str(paths["rubric"]),
        "--gate",
        str(paths["gate"]),
        "--runtime",
        str(paths["runtime"]),
        "--inputs",
        str(inputs),
        "--copy-to",
        str(paths["archive"]),
        "--host-trace",
        str(paths["host_trace"]),
        "--task-dir",
        str(paths["task"]),
        "--run-id",
        paths["run_id"],
        "--json",
        str(paths["report"]),
        "--quiet",
    ]
    return answers, command, paths


def run_judge(command: list[str]) -> dict:
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(f"judge exit={result.returncode}: {result.stderr}")
    report_path = Path(command[command.index("--json") + 1])
    return json.loads(report_path.read_text(encoding="utf-8"))


def run_case(answers: Path, command: list[str], paths: dict) -> dict:
    report = run_judge(command)
    if Path(report.get("copy", {}).get("destination", "")) != paths["archive"].resolve():
        raise SystemExit(f"copy destination mismatch: {report.get('copy')}")
    expected_files = file_manifest(answers)
    if report.get("copy", {}).get("files") != expected_files:
        raise SystemExit(f"copy manifest mismatch: {report.get('copy')} != {expected_files}")
    actual_archive = file_manifest(paths["archive"])
    if actual_archive != expected_files:
        raise SystemExit(f"archive mismatch: {actual_archive} != {expected_files}")
    if paths["host_trace"].is_file():
        expected_trace_hash = hashlib.sha256(paths["host_trace"].read_bytes()).hexdigest()
        if report.get("host_trace_sha256") != expected_trace_hash:
            raise SystemExit(
                f"host trace hash mismatch: {report.get('host_trace_sha256')} != {expected_trace_hash}"
            )
    if Path(report.get("inputs", {}).get("host_trace", "")) != paths["host_trace"].resolve():
        raise SystemExit(f"host trace path mismatch: {report.get('inputs', {}).get('host_trace')}")
    return report


def summary(report: dict) -> dict:
    return {
        "score": report.get("score"),
        "total": report.get("total"),
        "any_of_applicable": report.get("any_of_applicable"),
        "any_of_status": report.get("any_of_status"),
        "difficulty_pass": report.get("difficulty_pass"),
        "pass": report.get("pass"),
        "fail_closed": report.get("fail_closed"),
        "runtime_source": report.get("runtime_source"),
        "host_trace_status": report.get("host_trace_status"),
    }


def assert_summary(name: str, report: dict, expected: dict) -> None:
    actual = summary(report)
    if actual != expected:
        raise SystemExit(f"{name} mismatch: {actual}")


with tempfile.TemporaryDirectory(prefix="v006_judge_") as tmp:
    root = Path(tmp)

    positive_answers, positive_command, positive_paths = make_case(
        root,
        "positive",
        [{"metric": "minutes", "op": ">=", "value": 5}],
        "extracted",
    )
    positive = run_case(positive_answers, positive_command, positive_paths)
    assert_summary(
        "positive",
        positive,
        {
            "score": 100,
            "total": 100,
            "any_of_applicable": True,
            "any_of_status": "extracted",
            "difficulty_pass": True,
            "pass": True,
            "fail_closed": False,
            "runtime_source": "host_trace",
            "host_trace_status": "verified",
        },
    )

    stale = positive_paths["archive"] / "stale.txt"
    stale.write_text("must be removed\n", encoding="utf-8")
    sibling_volume = positive_paths["archive"].parent / "C02" / "must_stay.txt"
    sibling_volume.parent.mkdir(parents=True)
    sibling_volume.write_text("other volume\n", encoding="utf-8")
    positive = run_case(positive_answers, positive_command, positive_paths)
    if stale.exists():
        raise SystemExit("stale archive file was not removed")
    if not sibling_volume.is_file():
        raise SystemExit("copy-to cleared another run volume")

    volume2_answers, volume2_command, volume2_paths = make_case(
        root,
        "volume_c02",
        [{"metric": "minutes", "op": ">=", "value": 5}],
        "extracted",
        run_id="C02",
    )
    volume2 = run_case(volume2_answers, volume2_command, volume2_paths)
    if (
        volume2_paths["archive"].name != "C02"
        or volume2.get("host_trace_status") != "verified"
        or volume2.get("pass") is not True
    ):
        raise SystemExit(f"second volume did not pass through its own package: {summary(volume2)}")

    fallback_answers, fallback_command, fallback_paths = make_case(
        root,
        "host_trace_fallback",
        [{"metric": "minutes", "op": ">=", "value": 5}],
        "extracted",
    )
    trace_flag = fallback_command.index("--host-trace")
    del fallback_command[trace_flag:trace_flag + 2]
    fallback_trace = run_case(fallback_answers, fallback_command, fallback_paths)
    if fallback_trace.get("host_trace_status") != "verified" or fallback_trace.get("pass") is not True:
        raise SystemExit(
            f"package-local host trace fallback did not pass: {summary(fallback_trace)}"
        )

    _, na_command, na_paths = make_case(root, "any_of_null", None, "not_applicable")
    na = run_case(na_paths["runtime"].parent, na_command, na_paths)
    assert_summary(
        "any_of_null",
        na,
        {
            "score": 100,
            "total": 100,
            "any_of_applicable": False,
            "any_of_status": "not_applicable",
            "difficulty_pass": True,
            "pass": True,
            "fail_closed": False,
            "runtime_source": "host_trace",
            "host_trace_status": "verified",
        },
    )

    manual_answers, manual_command, manual_paths = make_case(
        root, "manual_review", None, "not_applicable"
    )
    manual_rubric = json.loads(manual_paths["rubric"].read_text(encoding="utf-8"))
    manual_item = manual_rubric["items"][0]
    manual_item.update({
        "kind": "manual",
        "where": {
            "file": "answer.xlsx",
            "locator": "结果!A1",
            "review_question": "A1 是否等于 42？",
        },
        "match_mode": "manual_review",
    })
    for key in ("unit", "precision", "tol", "expect"):
        manual_item.pop(key, None)
    write_json(manual_paths["rubric"], manual_rubric)
    evidence_path = manual_answers / "answer.xlsx"
    manual_review = {
        "schema_version": 1,
        "rubric_sha256": hashlib.sha256(manual_paths["rubric"].read_bytes()).hexdigest(),
        "reviewer": "synthetic-reviewer",
        "completed_at": "2026-11-05T10:20:00+08:00",
        "items": [
            {
                "rubric_id": "R01",
                "status": "pass",
                "answer": "A1 等于 42",
                "evidence": "读取结果!A1，实际值为 42",
                "artifact_path": "answer.xlsx",
                "artifact_sha256": hashlib.sha256(evidence_path.read_bytes()).hexdigest(),
            }
        ],
    }
    write_json(manual_paths["rubric"].parent / "人工复核.json", manual_review)
    manual = run_case(manual_answers, manual_command, manual_paths)
    assert_summary(
        "manual_review",
        manual,
        {
            "score": 100,
            "total": 100,
            "any_of_applicable": False,
            "any_of_status": "not_applicable",
            "difficulty_pass": True,
            "pass": True,
            "fail_closed": False,
            "runtime_source": "host_trace",
            "host_trace_status": "verified",
        },
    )

    manual_review["items"][0]["artifact_sha256"] = "0" * 64
    write_json(manual_paths["rubric"].parent / "人工复核.json", manual_review)
    bad_manual = run_case(manual_answers, manual_command, manual_paths)
    if not bad_manual.get("fail_closed") or bad_manual.get("pass"):
        raise SystemExit(f"manual hash mismatch did not fail closed: {summary(bad_manual)}")

    failure_cases = [
        ("empty_list", [], "not_applicable", False, "not_applicable"),
        ("null_extracted", None, "extracted", False, "extracted"),
        ("missing_key", None, "not_applicable", True, "not_applicable"),
        ("unparseable", None, "unparseable", False, "unparseable"),
    ]
    failures = {}
    for name, any_of, status, omit_any_of, expected_status in failure_cases:
        answers, command, paths = make_case(root, name, any_of, status, omit_any_of)
        report = run_case(answers, command, paths)
        if not report.get("fail_closed") or report.get("difficulty_pass") or report.get("pass"):
            raise SystemExit(f"{name} did not fail closed: {summary(report)}")
        if report.get("any_of_status") != expected_status:
            raise SystemExit(f"{name} status mismatch: {report.get('any_of_status')!r}")
        failures[name] = summary(report)

    missing_answers, missing_command, missing_paths = make_case(
        root, "host_trace_missing", None, "not_applicable"
    )
    missing_paths["host_trace"].unlink()
    missing_trace = run_case(missing_answers, missing_command, missing_paths)
    if not missing_trace.get("fail_closed") or missing_trace.get("pass"):
        raise SystemExit(f"missing host trace did not fail closed: {summary(missing_trace)}")

    conflict_answers, conflict_command, conflict_paths = make_case(
        root, "host_trace_conflict", None, "not_applicable"
    )
    conflicting_trace = json.loads(conflict_paths["host_trace"].read_text(encoding="utf-8"))
    conflicting_trace["rounds"] = 3
    write_json(conflict_paths["host_trace"], conflicting_trace)
    conflict_trace = run_case(conflict_answers, conflict_command, conflict_paths)
    if not conflict_trace.get("fail_closed") or conflict_trace.get("pass"):
        raise SystemExit(f"conflicting host trace did not fail closed: {summary(conflict_trace)}")

    malformed_answers, malformed_command, malformed_paths = make_case(
        root, "host_trace_malformed", None, "not_applicable"
    )
    malformed_paths["host_trace"].write_text("{", encoding="utf-8")
    malformed_trace = run_case(malformed_answers, malformed_command, malformed_paths)
    if (
        malformed_trace.get("host_trace_status") != "invalid"
        or not malformed_trace.get("fail_closed")
        or malformed_trace.get("pass")
    ):
        raise SystemExit(
            f"malformed host trace did not fail closed: {summary(malformed_trace)}"
        )

    legacy_trace_answers, legacy_trace_command, legacy_trace_paths = make_case(
        root, "host_trace_legacy_fields", None, "not_applicable"
    )
    legacy_trace = json.loads(legacy_trace_paths["host_trace"].read_text(encoding="utf-8"))
    del legacy_trace["task_id"]
    del legacy_trace["run_id"]
    write_json(legacy_trace_paths["host_trace"], legacy_trace)
    accepted_legacy_trace = run_case(
        legacy_trace_answers, legacy_trace_command, legacy_trace_paths
    )
    if not accepted_legacy_trace.get("pass") or accepted_legacy_trace.get("fail_closed"):
        raise SystemExit(
            f"optional host trace identity fields did not remain compatible: "
            f"{summary(accepted_legacy_trace)}"
        )

    trace_identity_answers, trace_identity_command, trace_identity_paths = make_case(
        root, "host_trace_run_id_mismatch", None, "not_applicable"
    )
    trace_identity = json.loads(
        trace_identity_paths["host_trace"].read_text(encoding="utf-8")
    )
    trace_identity["run_id"] = "C02"
    write_json(trace_identity_paths["host_trace"], trace_identity)
    trace_identity_report = run_case(
        trace_identity_answers, trace_identity_command, trace_identity_paths
    )
    if (
        trace_identity_report.get("host_trace_status") != "invalid"
        or not trace_identity_report.get("fail_closed")
        or trace_identity_report.get("pass")
    ):
        raise SystemExit(
            f"host trace run_id mismatch did not fail closed: "
            f"{summary(trace_identity_report)}"
        )

    task_identity_answers, task_identity_command, task_identity_paths = make_case(
        root, "host_trace_task_id_mismatch", None, "not_applicable"
    )
    task_identity = json.loads(
        task_identity_paths["host_trace"].read_text(encoding="utf-8")
    )
    task_identity["task_id"] = "T-other"
    write_json(task_identity_paths["host_trace"], task_identity)
    task_identity_report = run_case(
        task_identity_answers, task_identity_command, task_identity_paths
    )
    if (
        task_identity_report.get("host_trace_status") != "invalid"
        or not task_identity_report.get("fail_closed")
        or task_identity_report.get("pass")
    ):
        raise SystemExit(
            f"host trace task_id mismatch did not fail closed: "
            f"{summary(task_identity_report)}"
        )

    runtime_schema_answers, runtime_schema_command, runtime_schema_paths = make_case(
        root, "runtime_schema", None, "not_applicable"
    )
    runtime_schema = json.loads(
        runtime_schema_paths["runtime"].read_text(encoding="utf-8")
    )
    del runtime_schema["host_trace_status"]
    write_json(runtime_schema_paths["runtime"], runtime_schema)
    runtime_schema_report = run_case(
        runtime_schema_answers, runtime_schema_command, runtime_schema_paths
    )
    if not runtime_schema_report.get("fail_closed") or runtime_schema_report.get("pass"):
        raise SystemExit(
            f"runtime schema error did not fail closed: {summary(runtime_schema_report)}"
        )

    runtime_identity_answers, runtime_identity_command, runtime_identity_paths = make_case(
        root, "runtime_run_id_mismatch", None, "not_applicable"
    )
    runtime_identity = json.loads(
        runtime_identity_paths["runtime"].read_text(encoding="utf-8")
    )
    runtime_identity["run_id"] = "C02"
    write_json(runtime_identity_paths["runtime"], runtime_identity)
    runtime_identity_report = run_case(
        runtime_identity_answers, runtime_identity_command, runtime_identity_paths
    )
    if (
        not runtime_identity_report.get("fail_closed")
        or runtime_identity_report.get("pass")
    ):
        raise SystemExit(
            f"runtime run_id mismatch did not fail closed: "
            f"{summary(runtime_identity_report)}"
        )

    runtime_type_answers, runtime_type_command, runtime_type_paths = make_case(
        root, "runtime_minutes_type", None, "not_applicable"
    )
    runtime_type = json.loads(
        runtime_type_paths["runtime"].read_text(encoding="utf-8")
    )
    runtime_type["minutes"] = "10"
    write_json(runtime_type_paths["runtime"], runtime_type)
    runtime_type_report = run_case(
        runtime_type_answers, runtime_type_command, runtime_type_paths
    )
    if not runtime_type_report.get("fail_closed") or runtime_type_report.get("pass"):
        raise SystemExit(
            f"runtime minutes type did not fail closed: {summary(runtime_type_report)}"
        )

    trace_type_answers, trace_type_command, trace_type_paths = make_case(
        root, "host_trace_minutes_type", None, "not_applicable"
    )
    trace_type = json.loads(
        trace_type_paths["host_trace"].read_text(encoding="utf-8")
    )
    trace_type["minutes"] = "10"
    write_json(trace_type_paths["host_trace"], trace_type)
    trace_type_report = run_case(
        trace_type_answers, trace_type_command, trace_type_paths
    )
    if (
        trace_type_report.get("host_trace_status") != "invalid"
        or not trace_type_report.get("fail_closed")
        or trace_type_report.get("pass")
    ):
        raise SystemExit(
            f"host trace minutes type did not fail closed: {summary(trace_type_report)}"
        )

    invalid_run_answers, invalid_run_command, invalid_run_paths = make_case(
        root, "invalid_run_id", None, "not_applicable"
    )
    invalid_run_command[invalid_run_command.index("--run-id") + 1] = "../escape"
    invalid_run_report = run_judge(invalid_run_command)
    if (
        not invalid_run_report.get("fail_closed")
        or invalid_run_report.get("pass")
        or invalid_run_paths["archive"].exists()
    ):
        raise SystemExit(f"invalid run_id was not rejected: {summary(invalid_run_report)}")

    escape_answers, escape_command, escape_paths = make_case(
        root, "copy_to_escape", None, "not_applicable"
    )
    outside = escape_paths["task"].parent / "outside"
    outside.mkdir()
    stale_outside = outside / "must_stay.txt"
    stale_outside.write_text("outside\n", encoding="utf-8")
    escape_command[escape_command.index("--copy-to") + 1] = str(outside)
    escape_report = run_judge(escape_command)
    if (
        not escape_report.get("fail_closed")
        or escape_report.get("pass")
        or not stale_outside.is_file()
        or escape_paths["archive"].exists()
    ):
        raise SystemExit(f"copy-to escape was not rejected: {summary(escape_report)}")

    print(json.dumps({"positive": summary(positive), "volume_c02": summary(volume2), "host_trace_fallback": summary(fallback_trace), "any_of_null": summary(na), "manual_review": summary(manual), "manual_hash_mismatch": summary(bad_manual), "failures": failures, "host_trace_missing": summary(missing_trace), "host_trace_conflict": summary(conflict_trace), "host_trace_malformed": summary(malformed_trace), "host_trace_legacy_fields": summary(accepted_legacy_trace), "host_trace_run_id_mismatch": summary(trace_identity_report), "host_trace_task_id_mismatch": summary(task_identity_report), "runtime_schema": summary(runtime_schema_report), "runtime_run_id_mismatch": summary(runtime_identity_report), "runtime_minutes_type": summary(runtime_type_report), "host_trace_minutes_type": summary(trace_type_report), "invalid_run_id": summary(invalid_run_report), "copy_to_escape": summary(escape_report)}, ensure_ascii=False))
