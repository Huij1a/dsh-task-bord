from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "母版"
MANIFEST = MASTER / "manifest.json"
EXPECTED_VERSION = "v008"


def managed_paths() -> list[str]:
    prompt_paths = sorted(
        path.relative_to(MASTER).as_posix()
        for path in (MASTER / "prompts").glob("*.md")
    )
    return prompt_paths + ["judge.py", "workflow.js", "workflow_s2.js"]


def record(relative: str) -> dict:
    path = MASTER / relative
    data = path.read_bytes()
    return {
        "path": relative,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def expected_document() -> dict:
    paths = managed_paths()
    return {
        "version": EXPECTED_VERSION,
        "frozen_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "files": [record(path) for path in paths],
        "note": "v008 card 3: evidence-chain contracts (01 excerpt one-to-one + sha256, 02 per-source scrub mapping, 05 difficulty-to-source/carrier traceability, 06 initial/repair contract), unified 17->18 field mapping draft/final roundtrip, and the 18 post-submit upload-package rebuild gate, enforced by a machine audit layer.",
    }


def compare(manifest: dict) -> dict:
    expected = expected_document()
    expected_records = {item["path"]: item for item in expected["files"]}
    actual_records = {
        item.get("path"): item
        for item in manifest.get("files", [])
        if isinstance(item, dict)
    }
    missing = sorted(set(expected_records) - set(actual_records))
    extra = sorted(set(actual_records) - set(expected_records))
    changed = []
    for path in sorted(set(expected_records) & set(actual_records)):
        wanted = expected_records[path]
        actual = actual_records[path]
        if actual.get("bytes") != wanted["bytes"] or actual.get("sha256") != wanted["sha256"]:
            changed.append({
                "path": path,
                "expected": wanted,
                "actual": actual,
            })
    version_ok = manifest.get("version") == EXPECTED_VERSION
    return {
        "expected_version": EXPECTED_VERSION,
        "version": manifest.get("version"),
        "version_ok": version_ok,
        "file_count": len(expected_records),
        "missing": missing,
        "extra": extra,
        "changed": changed,
        "mismatch": (
            (0 if version_ok else 1)
            + len(missing)
            + len(extra)
            + len(changed)
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    if args.write:
        document = expected_document()
        MANIFEST.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    result = compare(manifest)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["mismatch"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
