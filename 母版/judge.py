# -*- coding: utf-8 -*-
"""Deterministic rubric scorer for the authoring pipeline.

Legacy mode:
    python judge.py <answer.xlsx> --rubric rubric.json [--json detail.json]

14 contract mode:
    python judge.py --answers <output-dir> --rubric rubric.json \
      --gate <project-gate.json> --runtime <output>/运行记录.json \
      --host-trace <answerPackage>/host_trace.json \
      --task-dir <taskDir> --run-id <runId> \
      --json <评分.json> --copy-to <taskDir>/artifacts/13_answer/<runId>

Contract mode always writes a machine-readable verdict.  A malformed rubric,
gate, runtime record, missing answer, MISSING item, unjudged item or parser
error sets ``fail_closed=true`` and ``pass=false``.  The process exit code says
whether the verdict was written (0) or the report itself could not be produced
(2), not whether the submission passed.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string


OPS = {
    "<=": lambda a, b: a <= b,
    "<": lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    ">": lambda a, b: a > b,
    "==": lambda a, b: a == b,
}
STATUSES = {"TRUE", "FALSE", "MISSING", "UNJUDGED", "ERROR"}
NUMERIC_TEXT = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
RUN_ID_TEXT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


class ScoreError(Exception):
    """A coordinate or file cannot be evaluated deterministically."""


class MissingLocation(ScoreError):
    """The requested file, part, row or cell is absent."""


class UnjudgedItem(ScoreError):
    """A legacy item has no deterministic checker."""


def norm(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def text_norm(value):
    return re.sub(r"\s+", " ", norm(value)).casefold()


def clean_number(value):
    value = float(value)
    return int(value) if value.is_integer() else round(value, 9)


def finite_json_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except (OverflowError, ValueError):
        return None
    return number if math.isfinite(number) else None


def as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    text = norm(value)
    text = re.sub(r"(?i)\b(?:CNY|RMB)\b", "", text)
    text = text.replace(",", "").replace("¥", "").replace("￥", "")
    text = text.replace("元", "").replace("%", "").replace(" ", "")
    if not NUMERIC_TEXT.fullmatch(text):
        return None
    number = float(text)
    return number if math.isfinite(number) else None


def as_quantity(value, unit=None):
    """Parse a finite number from a numeric cell, tolerating one declared unit."""
    number = as_number(value)
    if number is not None:
        return number
    text = norm(value)
    unit_text = norm(unit)
    if text and unit_text:
        if text.startswith(unit_text):
            text = text[len(unit_text):].strip()
        elif text.endswith(unit_text):
            text = text[:-len(unit_text)].strip()
    return as_number(text)


def resolve_op(actual, op, expected):
    if op not in OPS:
        raise ScoreError(f"不支持的比较符：{op!r}")
    left, right = as_number(actual), as_number(expected)
    if left is None or right is None:
        raise ScoreError(f"比较值不是有限数字：{actual!r} {op} {expected!r}")
    return OPS[op](left, right)


def compare(got, expect, tol=0.0, unit=None):
    if isinstance(expect, dict):
        text = text_norm(got)
        all_terms = expect.get("all", [])
        any_terms = expect.get("any", [])
        none_terms = expect.get("none", [])
        if not isinstance(all_terms, list) or not isinstance(any_terms, list) or not isinstance(none_terms, list):
            raise ScoreError("文本 expect 的 all/any/none 必须是数组")
        if not text:
            return False
        if any(text_norm(term) not in text for term in all_terms):
            return False
        if any_terms and not any(text_norm(term) in text for term in any_terms):
            return False
        if any(text_norm(term) in text for term in none_terms):
            return False
        return bool(all_terms or any_terms or none_terms)
    if isinstance(expect, list):
        return any(compare(got, item, tol, unit) for item in expect)
    if isinstance(expect, bool):
        text = text_norm(got)
        return text in ({"true", "1", "是", "通过", "yes"} if expect else {"false", "0", "否", "不通过", "no"})
    expected_number = as_number(expect)
    if expected_number is not None:
        got_number = as_quantity(got, unit)
        if got_number is None:
            return False
        tolerance = 0.0 if tol is None else as_number(tol)
        if tolerance is None or tolerance < 0:
            raise ScoreError(f"非法容差：{tol!r}")
        return abs(got_number - expected_number) <= tolerance
    actual, expected = text_norm(got), text_norm(expect)
    if not actual:
        return False
    return expected in actual or actual in expected


def compare_with_mode(got, expect, mode, tol=0.0, unit=None):
    """Compare a schema-v3 value using an explicit, non-ambient match mode."""
    if mode == "numeric":
        expected_number = as_number(expect)
        if expected_number is None:
            raise ScoreError(f"numeric expect 必须是有限数字：{expect!r}")
        got_number = as_quantity(got, unit)
        if got_number is None:
            return False
        tolerance = as_number(tol)
        if tolerance is None or tolerance < 0:
            raise ScoreError(f"非法容差：{tol!r}")
        return abs(got_number - expected_number) <= tolerance
    if mode == "boolean":
        if not isinstance(expect, bool):
            raise ScoreError("boolean expect 必须是 JSON 布尔值")
        text = text_norm(got)
        return text in ({"true", "1", "是", "通过", "yes"} if expect else {"false", "0", "否", "不通过", "no"})
    if mode == "exact":
        if not isinstance(expect, str):
            raise ScoreError("exact expect 必须是字符串")
        return text_norm(got) == text_norm(expect)
    if mode in {"contains_all", "contains_any"}:
        if not isinstance(expect, list) or not expect or any(not isinstance(term, str) or not term for term in expect):
            raise ScoreError(f"{mode} expect 必须是非空字符串数组")
        actual = text_norm(got)
        matches = [text_norm(term) in actual for term in expect]
        return all(matches) if mode == "contains_all" else any(matches)
    if mode == "regex":
        if not isinstance(expect, str) or not expect:
            raise ScoreError("regex expect 必须是非空字符串")
        try:
            return re.search(expect, norm(got)) is not None
        except re.error as exc:
            raise ScoreError(f"regex 非法：{exc}") from exc
    raise ScoreError(f"不支持的 match_mode：{mode!r}")


def read_json(path):
    path = Path(path)
    if not path.is_file():
        raise ScoreError(f"文件缺失：{path}")
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise ScoreError(f"JSON 不可解析：{path}（{exc}）") from exc


def item_id_key(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def validate_rubric(doc):
    """Return ``(items, total, schema_version)`` or raise ScoreError."""
    if not isinstance(doc, dict) or not isinstance(doc.get("meta"), dict):
        raise ScoreError("rubric 缺少 meta")
    meta = doc["meta"]
    items = doc.get("items")
    if not isinstance(items, list) or not items:
        raise ScoreError("rubric.items 必须是非空数组")
    total = as_number(meta.get("total"))
    if total is None or total <= 0:
        raise ScoreError("rubric.meta.total 必须是正数")
    try:
        schema_version = int(meta.get("schema_version", 1))
    except Exception as exc:
        raise ScoreError("rubric.meta.schema_version 非法") from exc

    allowed_kinds = {"cell", "summary", "row", "section", "derived"}
    if schema_version >= 3:
        allowed_kinds.add("manual")
    match_modes = {
        "numeric", "boolean", "exact", "contains_all", "contains_any",
        "regex", "derived_rule", "manual_review",
    }

    seen = set()
    score_sum = 0.0
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ScoreError(f"rubric.items[{index}] 不是对象")
        if "id" not in item:
            raise ScoreError(f"rubric.items[{index}] 缺少 id")
        key = item_id_key(item["id"])
        if key in seen:
            raise ScoreError(f"rubric item id 重复：{item['id']!r}")
        seen.add(key)
        score = as_number(item.get("score"))
        if score is None or score <= 0:
            raise ScoreError(f"rubric item {item['id']} 的 score 必须是正数")
        score_sum += score
        if item.get("kind") not in allowed_kinds:
            raise ScoreError(f"rubric item {item['id']} 的 kind 非法")
        if not isinstance(item.get("where"), dict):
            raise ScoreError(f"rubric item {item['id']} 缺少 where 对象")

    if abs(score_sum - total) > 1e-9:
        raise ScoreError(f"rubric 分值合计 {clean_number(score_sum)} 与 meta.total {clean_number(total)} 不一致")

    if schema_version >= 2:
        if total != 100:
            raise ScoreError("新 rubric 的 meta.total 必须为 100")
        if meta.get("model") != "deepseek-v4.1-flash/max":
            raise ScoreError("rubric.meta.model 必须固定为 deepseek-v4.1-flash/max")
        declared_items = meta.get("items")
        if isinstance(declared_items, bool) or not isinstance(declared_items, int) or declared_items != len(items):
            raise ScoreError("rubric.meta.items 必须等于 items 实际条数")
        for item in items:
            where = item["where"]
            if item["kind"] == "derived" and schema_version < 3:
                raise ScoreError(f"schema v2 rubric 不得使用 derived：{item['id']}")
            if not norm(where.get("file")):
                raise ScoreError(f"rubric item {item['id']} 缺少 where.file")
            file_suffix = Path(norm(where.get("file"))).suffix.lower()
            if item["kind"] in {"cell", "summary", "row"}:
                if file_suffix and file_suffix != ".xlsx":
                    raise ScoreError(f"{item['kind']} 坐标只支持 xlsx：{item['id']}")
                if not norm(where.get("part") or where.get("sheet")):
                    raise ScoreError(f"rubric item {item['id']} 缺少 where.part/sheet")
                if item["kind"] == "cell" and not norm(where.get("cell")):
                    raise ScoreError(f"rubric item {item['id']} 缺少 where.cell")
                if item["kind"] in {"summary", "row"}:
                    if "key" not in where or "column" not in where and "col" not in where:
                        raise ScoreError(f"rubric item {item['id']} 缺少 where.key 或列坐标")
            if item["kind"] == "section":
                if file_suffix and file_suffix not in {".md", ".txt"}:
                    raise ScoreError(f"section 只支持 md/txt：{item['id']}")
                if schema_version >= 3:
                    if not norm(where.get("start_anchor")) or not norm(where.get("end_anchor")):
                        raise ScoreError(f"rubric item {item['id']} 缺少 start_anchor/end_anchor")
                elif not norm(where.get("anchor")):
                    raise ScoreError(f"rubric item {item['id']} 缺少 where.anchor")
            if schema_version >= 3:
                if not re.fullmatch(r"D\d{2,}", str(item.get("difficulty_id", ""))):
                    raise ScoreError(f"rubric item {item['id']} 的 difficulty_id 非法")
                if not isinstance(item.get("basis"), dict):
                    raise ScoreError(f"rubric item {item['id']} 缺少 basis 对象")
                field_keys = item.get("business_field_keys")
                if (
                    not isinstance(field_keys, list)
                    or not field_keys
                    or any(not re.fullmatch(r"BF\d{2,}", str(key)) for key in field_keys)
                    or len(set(field_keys)) != len(field_keys)
                ):
                    raise ScoreError(f"rubric item {item['id']} 的 business_field_keys 必须是非空且不重复的 BF ID 数组")
                mode = item.get("match_mode")
                if mode not in match_modes:
                    raise ScoreError(f"rubric item {item['id']} 的 match_mode 非法或缺失")
                expect = item.get("expect")
                if mode == "numeric":
                    if as_number(expect) is None:
                        raise ScoreError(f"numeric rubric item {item['id']} 的 expect 非法")
                    if not norm(item.get("unit")):
                        raise ScoreError(f"数值 rubric item {item['id']} 缺少 unit")
                    tolerance = as_number(item.get("tol")) if "tol" in item else None
                    if tolerance is None or tolerance < 0:
                        raise ScoreError(f"数值 rubric item {item['id']} 缺少可执行且非负的 tol")
                    precision = item.get("precision")
                    if isinstance(precision, bool) or not isinstance(precision, int) or precision < 0:
                        raise ScoreError(f"数值 rubric item {item['id']} 缺少非负整数 precision")
                elif mode == "boolean" and not isinstance(expect, bool):
                    raise ScoreError(f"boolean rubric item {item['id']} 的 expect 必须是布尔值")
                elif mode in {"exact", "regex"} and not isinstance(expect, str):
                    raise ScoreError(f"{mode} rubric item {item['id']} 的 expect 必须是字符串")
                elif mode in {"contains_all", "contains_any"} and (
                    not isinstance(expect, list)
                    or not expect
                    or any(not isinstance(term, str) or not term for term in expect)
                ):
                    raise ScoreError(f"{mode} rubric item {item['id']} 的 expect 必须是非空字符串数组")
                elif mode == "derived_rule":
                    derived_from = where.get("derived_from")
                    if (
                        item["kind"] != "derived"
                        or not norm(where.get("rule_id"))
                        or not isinstance(derived_from, list)
                        or not derived_from
                        or any(not re.fullmatch(r"(?:BF|A|P)\d{2,}", str(key)) for key in derived_from)
                        or len(set(derived_from)) != len(derived_from)
                    ):
                        raise ScoreError(f"derived_rule rubric item {item['id']} 契约不完整")
                elif mode == "manual_review":
                    if (
                        item["kind"] != "manual"
                        or not norm(where.get("locator"))
                        or not norm(where.get("review_question"))
                    ):
                        raise ScoreError(f"manual_review rubric item {item['id']} 必须指定 locator/review_question")
            else:
                expected_number = as_number(item.get("expect"))
                if expected_number is not None:
                    if not norm(item.get("unit")):
                        raise ScoreError(f"数值 rubric item {item['id']} 缺少 unit")
                    tolerance = as_number(item.get("tol")) if "tol" in item else None
                    if tolerance is None or tolerance < 0:
                        raise ScoreError(f"数值 rubric item {item['id']} 缺少可执行且非负的 tol")
    return items, total, schema_version


def safe_candidate(root, relative):
    root = Path(root).resolve()
    candidate = (root / str(relative)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ScoreError(f"where.file 越出答卷目录：{relative}") from exc
    return candidate


def workbook_for(path, cache):
    key = str(path.resolve())
    if key not in cache:
        try:
            cache[key] = load_workbook(path, data_only=True, read_only=True)
        except Exception as exc:
            raise ScoreError(f"工作簿不可解析：{path.name}（{exc}）") from exc
    return cache[key]


def resolve_sheet(workbook, where):
    name = norm(where.get("part") or where.get("sheet"))
    if not name:
        raise ScoreError("where 缺少 part/sheet")
    if name in workbook.sheetnames:
        return workbook[name]
    matches = [candidate for candidate in workbook.sheetnames if candidate.casefold() == name.casefold()]
    if len(matches) == 1:
        return workbook[matches[0]]
    raise MissingLocation(f"工作簿无此 part/sheet：{name}")


def resolve_column(ws, value):
    if isinstance(value, int) and not isinstance(value, bool):
        if value >= 1:
            return value
        raise ScoreError(f"列坐标非法：{value!r}")
    text = norm(value)
    if re.fullmatch(r"\d+", text) and int(text) >= 1:
        return int(text)
    if re.fullmatch(r"[A-Za-z]{1,3}", text):
        return column_index_from_string(text.upper())
    target = text_norm(text)
    for row in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        for index, cell in enumerate(row, start=1):
            if text_norm(cell) == target:
                return index
    raise MissingLocation(f"part 内无此列标题：{text}")


def find_row_value(ws, where):
    key = norm(where.get("key"))
    if not key:
        raise ScoreError("where 缺少 key")
    key_col = resolve_column(ws, where.get("key_column", 1))
    column = resolve_column(ws, where.get("column", where.get("col", 2)))
    candidates = []
    for row in ws.iter_rows(values_only=True):
        if len(row) < key_col:
            continue
        value = norm(row[key_col - 1])
        if value == key:
            candidates.append(row)
    if not candidates:
        raise MissingLocation(f"part 内无此 key：{key}")
    if len(candidates) > 1:
        raise ScoreError(f"key 命中 {len(candidates)} 行，坐标不唯一：{key}")
    row = candidates[0]
    if len(row) < column:
        return None
    return row[column - 1]


def resolve_legacy_summary_sheet(workbook, where):
    """Match the v1 judge's forgiving summary/row sheet lookup."""
    name = norm(where.get("part") or where.get("sheet"))
    if name and name in workbook.sheetnames:
        return workbook[name]
    return workbook[workbook.sheetnames[0]]


def find_legacy_row_value(ws, where):
    """Match the v1 judge's first-column substring lookup."""
    key = norm(where.get("key"))
    if not key:
        raise ScoreError("where 缺少 key")
    col = where.get("col", 2)
    if isinstance(col, bool) or not isinstance(col, int) or col < 1:
        raise ScoreError(f"legacy 列坐标非法：{col!r}")
    for row in ws.iter_rows(min_row=1, values_only=True):
        if row and norm(row[0]) and key in norm(row[0]):
            return row[col - 1] if len(row) >= col else None
    raise MissingLocation(f"{where.get('sheet', '决策摘要')} 无此指标：{key}")


def read_text_file(path):
    suffix = path.suffix.lower()
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(path) as package:
                root = ElementTree.fromstring(package.read("word/document.xml"))
            namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            parts = [node.text or "" for node in root.iter(namespace + "t")]
            return "\n".join(parts)
        except Exception as exc:
            raise ScoreError(f"DOCX 不可解析：{path.name}（{exc}）") from exc
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except Exception:
            PdfReader = None
        if PdfReader is not None:
            try:
                return "\n".join((page.extract_text() or "") for page in PdfReader(str(path)).pages)
            except Exception as exc:
                raise ScoreError(f"PDF 不可解析：{path.name}（{exc}）") from exc
        try:
            result = subprocess.run(
                ["pdftotext", "-layout", str(path), "-"],
                check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            return result.stdout
        except Exception as exc:
            raise ScoreError(f"PDF 不可解析且无 pypdf/pdftotext：{path.name}（{exc}）") from exc
    if suffix == ".xlsx":
        workbook = load_workbook(path, data_only=True, read_only=True)
        try:
            values = []
            for ws in workbook.worksheets:
                values.append(ws.title)
                for row in ws.iter_rows(values_only=True):
                    values.extend(norm(cell) for cell in row if cell is not None)
            return "\n".join(values)
        finally:
            workbook.close()
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ScoreError(f"文本不可解析：{path.name}")


def evaluate_item(item, answer_source, inputs, workbook_cache, text_cache, legacy=False, schema_version=1):
    kind = item["kind"]
    where = item["where"]
    if kind == "manual":
        result = MANUAL_RESULTS.get(str(item.get("id")))
        if result is None:
            raise UnjudgedItem("manual 项无独立人工复核结论")
        root = answer_source if answer_source.is_dir() else answer_source.parent
        artifact = safe_candidate(root, result.get("artifact_path"))
        if not artifact.is_file():
            raise MissingLocation(f"人工复核证据文件缺失：{result.get('artifact_path')}")
        actual_hash = hashlib.sha256(artifact.read_bytes()).hexdigest()
        if actual_hash != result.get("artifact_sha256"):
            raise ScoreError(f"人工复核证据 hash 不一致：{result.get('artifact_path')}")
        status = "TRUE" if result.get("status") == "pass" else "FALSE"
        return status, result.get("answer"), result.get("evidence"), artifact
    if kind == "derived":
        result = RULE_RESULTS.get(item_id_key(item["id"]))
        if result is None:
            raise UnjudgedItem("derived 无独立复算结果")
        if not isinstance(result, (list, tuple)) or len(result) < 2 or not isinstance(result[0], bool):
            raise UnjudgedItem("derived 复算结果格式非法")
        ok, note = result[0], result[1]
        return "TRUE" if ok else "FALSE", "见复算说明", str(note), None

    if answer_source.is_dir():
        root, default_file = answer_source, None
    else:
        root, default_file = answer_source.parent, answer_source

    relative = where.get("file")
    if not relative and default_file is not None:
        path = default_file
    elif not relative:
        candidates = [path for path in root.iterdir() if path.is_file() and path.suffix.lower() in {".xlsx", ".docx", ".md", ".txt", ".csv", ".json", ".pdf"}]
        if len(candidates) != 1:
            raise ScoreError("旧 rubric 未指定 where.file，且答卷目录不是单一候选文件")
        path = candidates[0]
    else:
        path = safe_candidate(root, relative)
    if not path.is_file():
        raise MissingLocation(f"交付文件缺失：{relative or path.name}")

    if kind in {"summary", "row", "cell"}:
        if path.suffix.lower() != ".xlsx":
            raise ScoreError(f"{kind} 坐标只支持 xlsx：{path.name}")
        workbook = workbook_for(path, workbook_cache)
        if legacy and kind in {"summary", "row"}:
            worksheet = resolve_legacy_summary_sheet(workbook, where)
            got = find_legacy_row_value(worksheet, where)
            if got is None:
                raise MissingLocation(f"{where.get('sheet', '决策摘要')} 无此指标")
        else:
            worksheet = resolve_sheet(workbook, where)
            if kind == "cell":
                cell = norm(where.get("cell"))
                try:
                    got = worksheet[cell].value
                except Exception as exc:
                    raise MissingLocation(f"单元格不存在：{cell}") from exc
            else:
                got = find_row_value(worksheet, where)
        if schema_version >= 3:
            status = "TRUE" if compare_with_mode(
                got, item.get("expect"), item.get("match_mode"),
                item.get("tol", 0), item.get("unit"),
            ) else "FALSE"
        else:
            status = "TRUE" if compare(got, item.get("expect"), item.get("tol", 0), item.get("unit")) else "FALSE"
        return status, got, "", path

    if kind == "section":
        if path.suffix.lower() not in {".md", ".txt"}:
            raise ScoreError(f"section 只支持 md/txt：{path.name}")
        key = str(path.resolve())
        if key not in text_cache:
            text_cache[key] = read_text_file(path)
        text = text_cache[key]
        if schema_version >= 3:
            start_anchor = norm(where.get("start_anchor"))
            end_anchor = norm(where.get("end_anchor"))
            if not start_anchor or not end_anchor:
                raise ScoreError("section 缺少 start_anchor/end_anchor")
            haystack = text.casefold()
            start_needle, end_needle = start_anchor.casefold(), end_anchor.casefold()
            if haystack.count(start_needle) != 1 or haystack.count(end_needle) != 1:
                raise MissingLocation("section 锚点缺失或不唯一")
            start = haystack.find(start_needle) + len(start_needle)
            end = haystack.find(end_needle)
            if end <= start:
                raise MissingLocation("section end_anchor 必须位于 start_anchor 之后")
            got = text[start:end]
            status = "TRUE" if compare_with_mode(
                got, item.get("expect"), item.get("match_mode"),
                item.get("tol", 0), item.get("unit"),
            ) else "FALSE"
            excerpt = got[:240]
            return status, excerpt, "", path
        anchor = where.get("anchor")
        anchors = anchor if isinstance(anchor, list) else [anchor]
        anchors = [norm(value) for value in anchors if norm(value)]
        if not anchors or any(text_norm(value) not in text_norm(text) for value in anchors):
            raise MissingLocation(f"文档无此 anchor：{anchors or anchor!r}")
        status = "TRUE" if compare(text, item.get("expect"), item.get("tol", 0), item.get("unit")) else "FALSE"
        excerpt = text[:160]
        return status, excerpt, "", path

    raise ScoreError(f"不支持的 kind：{kind}")


def select_legacy_answer(root):
    """Choose one deterministic answer for a v1 rubric without where.file."""
    root = Path(root)
    suffixes = {".xlsx", ".docx", ".md", ".txt", ".csv", ".json", ".pdf"}
    candidates = sorted(
        (path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in suffixes),
        key=lambda path: path.relative_to(root).as_posix().casefold(),
    )
    if not candidates:
        raise MissingLocation(f"答卷目录没有可评分文件：{root}")
    workbooks = [path for path in candidates if path.suffix.lower() == ".xlsx"]
    return (workbooks or candidates)[0]


def load_legacy_module(directory, name):
    path = directory / f"{name}.py"
    if not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"无法加载 {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_rule_results(inputs, rubric_path, answer_source):
    """Load optional v1 checkers from beside the legacy rubric."""
    results = {}

    def merge(result):
        if isinstance(result, dict):
            results.update({item_id_key(key): value for key, value in result.items()})

    rubric_dir = Path(rubric_path).resolve().parent
    if inputs:
        os.environ["ANSWER_INPUTS"] = str(Path(inputs).resolve())
    os.environ["ANSWER_OUTPUT"] = str(answer_source.resolve())
    if answer_source.is_file():
        os.environ["ANSWER_XLSX"] = str(answer_source.resolve())
    sys.path.insert(0, str(rubric_dir))
    try:
        try:
            rules = load_legacy_module(rubric_dir, "rules")
            if rules is not None:
                merge(rules.check(None))
        except Exception:
            pass
        if inputs:
            try:
                rules_ext = load_legacy_module(rubric_dir, "rules_ext")
                if rules_ext is not None:
                    merge(rules_ext.external(str(Path(inputs).resolve())))
            except Exception:
                pass
    finally:
        try:
            sys.path.remove(str(rubric_dir))
        except ValueError:
            pass
    return results


def load_manual_results(rubric_path, rubric_doc):
    manual_ids = {
        str(item["id"])
        for item in rubric_doc.get("items", [])
        if isinstance(item, dict) and item.get("kind") == "manual"
    }
    if not manual_ids:
        return {}
    review_path = Path(rubric_path).resolve().parent / "人工复核.json"
    if not review_path.is_file():
        raise ScoreError("rubric 含 manual 项但缺少同目录 人工复核.json")
    doc = read_json(review_path)
    if not isinstance(doc, dict) or doc.get("schema_version") != 1:
        raise ScoreError("人工复核.json 顶层或 schema_version 非法")
    rubric_hash = hashlib.sha256(Path(rubric_path).read_bytes()).hexdigest()
    if doc.get("rubric_sha256") != rubric_hash:
        raise ScoreError("人工复核.json 的 rubric_sha256 不一致")
    if not norm(doc.get("reviewer")) or not norm(doc.get("completed_at")):
        raise ScoreError("人工复核.json 缺少 reviewer/completed_at")
    entries = doc.get("items")
    if not isinstance(entries, list) or not entries:
        raise ScoreError("人工复核.json.items 必须是非空数组")
    results = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ScoreError("人工复核.json.items 元素必须是对象")
        rubric_id = norm(entry.get("rubric_id"))
        if rubric_id in results:
            raise ScoreError(f"人工复核.json 的 rubric_id 重复：{rubric_id}")
        if rubric_id not in manual_ids:
            raise ScoreError(f"人工复核.json 含非 manual 或未知 rubric_id：{rubric_id}")
        if entry.get("status") not in {"pass", "fail"}:
            raise ScoreError(f"人工复核结论 status 非法：{rubric_id}")
        if not norm(entry.get("answer")) or not norm(entry.get("evidence")):
            raise ScoreError(f"人工复核结论缺少 answer/evidence：{rubric_id}")
        artifact_path = norm(entry.get("artifact_path"))
        artifact_hash = norm(entry.get("artifact_sha256"))
        if not artifact_path or not re.fullmatch(r"[0-9a-f]{64}", artifact_hash):
            raise ScoreError(f"人工复核证据定位或 hash 非法：{rubric_id}")
        results[rubric_id] = {
            "status": entry["status"],
            "answer": norm(entry.get("answer")),
            "evidence": norm(entry.get("evidence")),
            "artifact_path": artifact_path,
            "artifact_sha256": artifact_hash,
        }
    if set(results) != manual_ids:
        missing = sorted(manual_ids - set(results))
        raise ScoreError(f"人工复核.json 未覆盖全部 manual 项：{missing}")
    return results


RULE_RESULTS = {}
MANUAL_RESULTS = {}


def score_items(answer_source, rubric_path, inputs=None):
    answer_source = Path(answer_source).resolve()
    base = {
        "file": str(answer_source), "score": 0.0, "total": None, "judged": 0,
        "unjudged": 0, "true": 0, "false": 0, "missing": 0, "error": 0,
        "rows": [], "validation_errors": [],
    }
    try:
        doc = read_json(rubric_path)
        items, total, schema_version = validate_rubric(doc)
        manual_results = load_manual_results(rubric_path, doc)
    except Exception as exc:
        base["validation_errors"] = [str(exc)]
        return base

    global RULE_RESULTS, MANUAL_RESULTS
    MANUAL_RESULTS = manual_results
    legacy = schema_version < 2
    evaluation_source = answer_source
    if legacy and answer_source.is_dir():
        try:
            evaluation_source = select_legacy_answer(answer_source)
        except Exception:
            evaluation_source = answer_source
    RULE_RESULTS = load_rule_results(inputs, rubric_path, evaluation_source)
    workbook_cache, text_cache = {}, {}
    rows, score = [], 0.0
    for item in items:
        got, note, path = None, "", None
        try:
            status, got, note, path = evaluate_item(
                item, evaluation_source, inputs, workbook_cache, text_cache,
                legacy=legacy, schema_version=schema_version,
            )
        except MissingLocation as exc:
            status, note = "MISSING", str(exc)
        except UnjudgedItem as exc:
            status, note = "UNJUDGED", str(exc)
        except Exception as exc:
            status, note = "ERROR", str(exc)
        if status == "TRUE":
            score += float(item["score"])
        rows.append({
            "id": item["id"],
            "difficulty_id": item.get("difficulty_id"),
            "kind": item["kind"],
            "match_mode": item.get("match_mode"),
            "file": str(path.relative_to(answer_source if answer_source.is_dir() else answer_source.parent)) if path else item.get("where", {}).get("file"),
            "score": clean_number(item["score"]),
            "status": status,
            "got": norm(got)[:240],
            "expect": norm(item.get("expect"))[:240],
            "text": item.get("text", ""),
            "note": note,
        })
    for workbook in workbook_cache.values():
        try:
            workbook.close()
        except Exception:
            pass

    counts = {status: sum(1 for row in rows if row["status"] == status) for status in STATUSES}
    judged = counts["TRUE"] + counts["FALSE"] + counts["MISSING"]
    base.update({
        "score": clean_number(score),
        "total": clean_number(total),
        "judged": judged,
        "unjudged": counts["UNJUDGED"],
        "true": counts["TRUE"],
        "false": counts["FALSE"],
        "missing": counts["MISSING"],
        "error": counts["ERROR"],
        "rows": rows,
    })
    return base


def judge(answer_path, rubric_path, inputs=None):
    """Legacy API retained for callers that score one workbook or directory."""
    return score_items(answer_path, rubric_path, inputs)


def validate_runtime(path, run_id=None):
    errors = []
    raw = {}
    run = {"minutes": None, "rounds": None}
    try:
        raw = read_json(path)
    except Exception as exc:
        return run, False, [str(exc)], raw
    if not isinstance(raw, dict):
        return run, False, ["运行记录顶层必须是对象"], raw
    if raw.get("model") != "deepseek-v4.1-flash/max":
        errors.append("运行记录 model 必须固定为 deepseek-v4.1-flash/max")
    minutes = finite_json_number(raw.get("minutes"))
    if minutes is None or minutes < 0:
        errors.append("运行记录 minutes 必须是非负有限数字")
    else:
        run["minutes"] = clean_number(minutes)
    rounds = raw.get("rounds")
    if isinstance(rounds, bool) or not isinstance(rounds, int) or rounds < 0:
        errors.append("运行记录 rounds 必须是非负整数")
    else:
        run["rounds"] = rounds
    if not isinstance(raw.get("natural_finish"), bool):
        errors.append("运行记录 natural_finish 必须是布尔值")
    if raw.get("rounds_source") != "self-report":
        errors.append("运行记录 rounds_source 必须是 self-report")
    if raw.get("host_trace_status") != "not_available":
        errors.append("运行记录 host_trace_status 必须为 not_available")
    if run_id is not None and raw.get("run_id") != run_id:
        errors.append("运行记录 run_id 必须存在且与 --run-id 一致")
    times = {}
    for field in ("started_at", "ended_at"):
        value = raw.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"运行记录缺少 {field}")
            continue
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("timezone required")
            times[field] = parsed
        except Exception:
            errors.append(f"运行记录 {field} 必须是带时区的 ISO-8601")
    if len(times) == 2 and times["ended_at"] < times["started_at"]:
        errors.append("运行记录 ended_at 早于 started_at")
    return run, not errors, errors, raw


def load_host_trace(runtime_path, self_run, self_raw, host_trace_path=None, run_id=None, task_id=None):
    """Use the host-owned trace when present; otherwise keep the self-report explicit."""
    runtime_path = Path(runtime_path).resolve()
    host_path = (
        Path(host_trace_path).resolve()
        if host_trace_path is not None
        else runtime_path.parent.parent / "host_trace.json"
    )
    metadata = {
        "runtime_source": "self-report",
        "host_trace_status": "not_available",
        "host_trace_sha256": None,
    }
    if not host_path.is_file():
        return dict(self_run, **metadata), [
            f"host_trace.json 缺失，运行指标只能自报而不可验证：{host_path}"
        ], metadata, host_path
    try:
        data = host_path.read_bytes()
    except Exception as exc:
        metadata["host_trace_status"] = "invalid"
        return self_run, [f"host_trace.json 无法读取：{exc}"], metadata, host_path
    metadata["host_trace_sha256"] = hashlib.sha256(data).hexdigest()
    metadata["host_trace_status"] = "available"
    errors = []
    try:
        raw = json.loads(data.decode("utf-8"))
    except Exception as exc:
        metadata["host_trace_status"] = "invalid"
        return self_run, [f"host_trace.json 无法解析：{exc}"], metadata, host_path
    if not isinstance(raw, dict):
        metadata["host_trace_status"] = "invalid"
        return self_run, ["host_trace.json 顶层必须是对象"], metadata, host_path
    schema_version = raw.get("schema_version")
    if (
        isinstance(schema_version, bool)
        or not isinstance(schema_version, int)
        or schema_version != 1
    ):
        errors.append("host_trace.json schema_version 必须为整数 1")
    if raw.get("source") != "host":
        errors.append("host_trace.json source 必须为 host")
    if run_id is not None and "run_id" in raw and raw.get("run_id") != run_id:
        errors.append("host_trace.json run_id 与 --run-id 不一致")
    if task_id is not None and "task_id" in raw and raw.get("task_id") != task_id:
        errors.append("host_trace.json task_id 与 taskDir 不一致")
    if raw.get("model") != "deepseek-v4.1-flash/max":
        errors.append("host_trace.json model 不符")
    minutes = finite_json_number(raw.get("minutes"))
    rounds = raw.get("rounds")
    if minutes is None or minutes < 0:
        errors.append("host_trace.json minutes 必须是非负有限数字")
    if isinstance(rounds, bool) or not isinstance(rounds, int) or rounds < 0:
        errors.append("host_trace.json rounds 必须是非负整数")
    times = {}
    for field in ("started_at", "ended_at"):
        value = raw.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"host_trace.json 缺少 {field}")
            continue
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("timezone required")
            times[field] = parsed
        except Exception:
            errors.append(f"host_trace.json {field} 必须是带时区的 ISO-8601")
    if len(times) == 2 and times["ended_at"] < times["started_at"]:
        errors.append("host_trace.json ended_at 早于 started_at")
    if isinstance(self_raw, dict):
        if minutes is None:
            errors.append("host_trace.json 缺少可用于对照的 minutes")
        elif self_run.get("minutes") != clean_number(minutes):
            errors.append("运行记录 minutes 与 host_trace.json 不一致")
        if self_run.get("rounds") != rounds:
            errors.append("运行记录 rounds 与 host_trace.json 不一致")
    if errors:
        metadata["host_trace_status"] = "invalid"
        return self_run, errors, metadata, host_path
    metadata["runtime_source"] = "host_trace"
    metadata["host_trace_status"] = "verified"
    run = {
        "minutes": clean_number(minutes),
        "rounds": rounds,
        **metadata,
    }
    return run, [], metadata, host_path


def evaluate_gate(gate, scoring, run):
    errors = []
    detail = []
    score_ok = False
    any_of_ok = False
    any_of_applicable = False
    score_max = None
    score_rule = None
    any_of = None
    any_of_status = None
    if not isinstance(gate, dict):
        return {
            "score_ok": False, "any_of_ok": False, "any_of_applicable": False,
            "any_of_status": None, "score_max": None,
            "score_rule": None, "any_of": None, "any_of_detail": [],
            "errors": ["项目门槛顶层必须是对象"],
        }
    statuses = gate.get("extraction_status")
    if not isinstance(statuses, dict):
        statuses = {}
        errors.append("项目门槛缺少 extraction_status 对象")
    score_max = gate.get("score_max")
    score_rule = gate.get("score_rule")
    any_of = gate.get("any_of")
    any_of_status = statuses.get("any_of")
    if "any_of" not in gate:
        errors.append("项目门槛缺少 any_of；缺失键不能按 not_applicable 处理")
    if statuses.get("score_max") != "extracted":
        errors.append("项目门槛 score_max 未成功提取")
    if statuses.get("score_rule") != "extracted":
        errors.append("项目门槛 score_rule 未成功提取")
    if score_max is None:
        errors.append("项目门槛 score_max 缺失，不可机判")
    elif as_number(score_max) is None:
        errors.append("项目门槛 score_max 不是有限数字")
    if score_rule is None:
        errors.append("项目门槛 score_rule 缺失，不可机判")
    elif score_rule not in OPS:
        errors.append(f"项目门槛 score_rule 非法：{score_rule!r}")
    if score_max is not None and score_rule is not None and not errors:
        try:
            score_ok = resolve_op(scoring["score"], score_rule, score_max)
        except Exception as exc:
            errors.append(str(exc))
    if any_of_status in {"unparseable", "conflict"}:
        errors.append(f"项目门槛 any_of 状态为 {any_of_status}，必须 fail closed")
    elif any_of is None:
        if any_of_status != "not_applicable":
            errors.append("项目门槛 any_of 为 null 但状态不是 not_applicable")
        else:
            any_of_applicable = False
            any_of_ok = True
    elif not isinstance(any_of, list) or not any_of:
        errors.append("项目门槛 any_of 必须是非空数组；空数组不表示不适用")
        any_of = any_of if isinstance(any_of, list) else None
    elif any_of_status != "extracted":
        errors.append("项目门槛 any_of 非空但状态不是 extracted")
    else:
        any_of_applicable = True
        metrics = {
            "score": scoring["score"],
            "total": scoring["total"],
            "true": scoring["true"],
            "false": scoring["false"],
            "missing": scoring["missing"],
            "unjudged": scoring["unjudged"],
            "error": scoring["error"],
            "minutes": run.get("minutes"),
            "rounds": run.get("rounds"),
        }
        for index, condition in enumerate(any_of):
            item = {"index": index, "metric": None, "op": None, "value": None, "actual": None, "ok": False, "status": "ERROR"}
            if not isinstance(condition, dict):
                item["note"] = "条件必须是对象"
                detail.append(item)
                errors.append(f"any_of[{index}] 不是对象")
                continue
            metric, op, value = condition.get("metric"), condition.get("op"), condition.get("value")
            item.update({"metric": metric, "op": op, "value": value, "actual": metrics.get(metric)})
            if metric not in metrics:
                item["note"] = "未知 metric"
                errors.append(f"any_of[{index}] metric 不受支持：{metric!r}")
            elif op not in OPS:
                item["note"] = "非法 op"
                errors.append(f"any_of[{index}] op 非法：{op!r}")
            elif metrics[metric] is None:
                item["note"] = "运行指标缺失"
                errors.append(f"any_of[{index}] 所需指标缺失：{metric}")
            elif as_number(value) is None:
                item["note"] = "比较值不是有限数字"
                errors.append(f"any_of[{index}] value 非法")
            else:
                try:
                    item["ok"] = resolve_op(metrics[metric], op, value)
                    item["status"] = "TRUE" if item["ok"] else "FALSE"
                except Exception as exc:
                    item["note"] = str(exc)
                    errors.append(f"any_of[{index}]：{exc}")
            detail.append(item)
        any_of_ok = bool(detail) and all(item["status"] in {"TRUE", "FALSE"} for item in detail) and any(item["ok"] for item in detail)
    return {
        "score_ok": bool(score_ok),
        "any_of_ok": bool(any_of_ok),
        "any_of_applicable": bool(any_of_applicable),
        "any_of_status": any_of_status,
        "score_max": score_max,
        "score_rule": score_rule,
        "any_of": any_of,
        "any_of_detail": detail,
        "errors": errors,
    }


def file_manifest(root):
    root = Path(root)
    files = []
    for path in sorted((p for p in root.rglob("*") if p.is_file()), key=lambda p: p.relative_to(root).as_posix()):
        data = path.read_bytes()
        files.append({
            "path": path.relative_to(root).as_posix(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    return files


def is_path_redirect(path):
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def contract_archive_path(task_dir, run_id, copy_to):
    """Return the only archive path allowed by the 14 contract."""
    if not task_dir:
        raise ScoreError("14 契约模式缺少 --task-dir")
    if not isinstance(run_id, str) or RUN_ID_TEXT.fullmatch(run_id) is None:
        raise ScoreError("--run-id 必须是 1-64 位字母、数字、下划线或连字符，且以字母或数字开头")
    task_root = Path(task_dir).resolve()
    if not task_root.is_dir():
        raise ScoreError(f"--task-dir 不是目录：{task_root}")
    archive_root = task_root / "artifacts" / "13_answer"
    for parent in (task_root / "artifacts", archive_root):
        if is_path_redirect(parent):
            raise ScoreError(f"受控归档路径不得经过符号链接或 junction：{parent}")
        if parent.exists() and not parent.is_dir():
            raise ScoreError(f"受控归档路径必须是目录：{parent}")
    target = archive_root / run_id
    if is_path_redirect(target):
        raise ScoreError(f"copy-to 目标不得是符号链接或 junction：{target}")
    if target.exists() and not target.is_dir():
        raise ScoreError(f"copy-to 目标必须是目录：{target}")
    expected = target.resolve()
    destination = Path(copy_to).resolve()
    if destination != expected:
        raise ScoreError(
            f"copy-to 必须等于受控路径 {expected}，实际为 {destination}"
        )
    return destination


def copy_output(source, destination):
    source = Path(source).resolve()
    destination_path = Path(destination)
    if destination_path.exists() and is_path_redirect(destination_path):
        raise ScoreError("copy-to 目标不得是符号链接或 junction")
    destination = destination_path.resolve()
    if not source.is_dir():
        raise ScoreError(f"答卷输出目录缺失：{source}")
    if destination == source or source in destination.parents or destination in source.parents:
        raise ScoreError("copy-to 与答卷输出目录不得重叠")
    if destination.exists() and not destination.is_dir():
        raise ScoreError("copy-to 目标必须是目录")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{destination.name}.staging-", dir=destination.parent))
    backup = None
    try:
        for path in source.rglob("*"):
            relative = path.relative_to(source)
            target = staging / relative
            if path.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            elif path.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
        files = file_manifest(staging)
        if destination.exists():
            backup = Path(tempfile.mkdtemp(prefix=f".{destination.name}.backup-", dir=destination.parent))
            backup.rmdir()
            destination.replace(backup)
        try:
            staging.replace(destination)
        except Exception:
            if backup is not None and backup.exists():
                backup.replace(destination)
            raise
        if backup is not None:
            shutil.rmtree(backup)
        return {
            "source": str(source),
            "destination": str(destination),
            "files": files,
        }
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def empty_scoring(answer_path):
    return {
        "file": str(answer_path), "score": 0, "total": None, "judged": 0,
        "unjudged": 0, "true": 0, "false": 0, "missing": 0, "error": 0,
        "rows": [], "validation_errors": [],
    }


def final_report(
    answer_path, rubric_path, gate_path, runtime_path,
    inputs=None, copy_to=None, host_trace_path=None, task_dir=None, run_id=None,
):
    copy_info = None
    top_errors = []
    task_root = Path(task_dir).resolve() if task_dir else None
    if copy_to:
        try:
            archive_path = contract_archive_path(task_dir, run_id, copy_to)
            copy_info = copy_output(answer_path, archive_path)
        except Exception as exc:
            top_errors.append(f"复制答卷失败：{exc}")
            copy_info = {"error": str(exc)}
    try:
        scoring = score_items(answer_path, rubric_path, inputs)
    except Exception as exc:
        scoring = empty_scoring(answer_path)
        scoring["validation_errors"] = [str(exc)]
    run, runtime_valid, runtime_errors, runtime_raw = validate_runtime(
        runtime_path, run_id=run_id
    )
    run, host_trace_errors, runtime_metadata, resolved_host_trace_path = load_host_trace(
        runtime_path, run, runtime_raw,
        host_trace_path=host_trace_path,
        run_id=run_id,
        task_id=task_root.name if task_root is not None else None,
    )
    runtime_errors.extend(host_trace_errors)
    runtime_valid = bool(runtime_valid and not host_trace_errors)
    try:
        gate = read_json(gate_path)
        gate_result = evaluate_gate(gate, scoring, run)
    except Exception as exc:
        gate = {}
        gate_result = {
            "score_ok": False, "any_of_ok": False, "any_of_applicable": False,
            "any_of_status": None, "score_max": None,
            "score_rule": None, "any_of": None, "any_of_detail": [],
            "errors": [str(exc)],
        }
    detail_errors = [row for row in scoring["rows"] if row["status"] in {"MISSING", "UNJUDGED", "ERROR"}]
    fail_closed = bool(
        top_errors
        or scoring["validation_errors"]
        or runtime_errors
        or gate_result["errors"]
        or detail_errors
    )
    natural_finish = runtime_raw.get("natural_finish") is True if isinstance(runtime_raw, dict) else False
    difficulty_pass = bool(
        gate_result["score_ok"]
        and gate_result["any_of_ok"]
        and not fail_closed
    )
    overall_pass = bool(difficulty_pass and runtime_valid and natural_finish)
    extraction_statuses = gate.get("extraction_status") if isinstance(gate, dict) else {}
    if not isinstance(extraction_statuses, dict):
        extraction_statuses = {}
    report = {
        "score": scoring["score"],
        "total": scoring["total"],
        "run": run,
        "runtime_source": runtime_metadata["runtime_source"],
        "host_trace_status": runtime_metadata["host_trace_status"],
        "host_trace_sha256": runtime_metadata["host_trace_sha256"],
        "score_ok": bool(gate_result["score_ok"]),
        "any_of_ok": bool(gate_result["any_of_ok"]),
        "any_of_applicable": bool(gate_result["any_of_applicable"]),
        "any_of_status": gate_result["any_of_status"],
        "difficulty_pass": difficulty_pass,
        "natural_finish": natural_finish,
        "pass": overall_pass,
        "fail_closed": fail_closed,
        "threshold": {
            "score_max": gate_result["score_max"],
            "score_rule": gate_result["score_rule"],
            "any_of": gate_result["any_of"],
            "extraction_status": {
                "score_max": extraction_statuses.get("score_max"),
                "score_rule": extraction_statuses.get("score_rule"),
                "any_of": extraction_statuses.get("any_of"),
            },
        },
        "any_of_detail": gate_result["any_of_detail"],
        "true": scoring["true"],
        "false": scoring["false"],
        "missing": scoring["missing"],
        "unjudged": scoring["unjudged"],
        "error": scoring["error"],
        "missing_items": [row["id"] for row in scoring["rows"] if row["status"] == "MISSING"],
        "unjudged_items": [row["id"] for row in scoring["rows"] if row["status"] == "UNJUDGED"],
        "error_items": [
            {"id": row["id"], "note": row["note"]}
            for row in scoring["rows"] if row["status"] == "ERROR"
        ],
        "validation_errors": scoring["validation_errors"] + runtime_errors + gate_result["errors"] + top_errors,
        "copy": copy_info,
        "inputs": {
            "answers": str(Path(answer_path).resolve()),
            "rubric": str(Path(rubric_path).resolve()),
            "gate": str(Path(gate_path).resolve()),
            "runtime": str(Path(runtime_path).resolve()),
            "host_trace": str(resolved_host_trace_path),
        },
        "detail": scoring["rows"],
    }
    return report


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def final_conclusion(report):
    return {
        "score": report["score"],
        "run": report["run"],
        "any_of_applicable": report["any_of_applicable"],
        "any_of_status": report["any_of_status"],
        "difficulty_pass": report["difficulty_pass"],
        "pass": report["pass"],
        "fail_closed": report["fail_closed"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("answer", nargs="?", help="Legacy: one answer workbook or directory")
    parser.add_argument("--answers", default=None, help="Directory containing the model deliverables")
    parser.add_argument("--rubric", default="rubric.json")
    parser.add_argument("--gate", default=None, help="Project gate JSON")
    parser.add_argument("--runtime", default=None, help="运行记录.json")
    parser.add_argument("--json", default=None, help="Report path")
    parser.add_argument("--copy-to", default=None, help="Copy the full answer directory here first")
    parser.add_argument("--host-trace", default=None, help="Explicit host_trace.json path")
    parser.add_argument("--task-dir", default=None, help="Authoring task directory")
    parser.add_argument("--run-id", default=None, help="Answer run/volume identifier")
    parser.add_argument("--inputs", default=None, help="A-series input directory for legacy derived rules")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    contract_mode = bool(
        args.gate or args.runtime or args.copy_to
        or args.host_trace or args.task_dir or args.run_id
    )
    answer = args.answers or args.answer
    if args.answers and args.answer:
        parser.error("answer 与 --answers 只能提供一个")
    if not answer:
        parser.error("缺少答卷文件或 --answers")

    if contract_mode:
        required = (
            args.gate, args.runtime, args.json, args.copy_to,
            args.task_dir, args.run_id,
        )
        if not all(required):
            parser.error(
                "14 契约模式必须同时提供 --gate、--runtime、--json、--copy-to、"
                "--task-dir、--run-id；--host-trace 可显式提供或按题包固定位置解析"
            )
        report = final_report(
            answer, args.rubric, args.gate, args.runtime,
            inputs=args.inputs, copy_to=args.copy_to,
            host_trace_path=args.host_trace, task_dir=args.task_dir, run_id=args.run_id,
        )
        try:
            write_json(args.json, report)
        except Exception as exc:
            print(f"无法写入评分报告：{exc}", file=sys.stderr)
            return 2
        if not args.quiet:
            print(
                f"得分 {report['score']}/{report['total']} | "
                f"run={report['run']['minutes']}min/{report['run']['rounds']}rounds | "
                f"difficulty_pass={str(report['difficulty_pass']).lower()} | "
                f"pass={str(report['pass']).lower()} | fail_closed={str(report['fail_closed']).lower()}"
            )
        print(json.dumps(final_conclusion(report), ensure_ascii=False, separators=(",", ":")))
        return 0

    result = score_items(answer, args.rubric, args.inputs)
    errors = result["validation_errors"]
    print(
        f"得分 {result['score']}/{result['total']} | 已判 {result['judged']} 项"
        f"（真 {result['true']} / 假 {result['false']} / 缺 {result['missing']}）"
        f" | 待算 {result['unjudged']} | 错误 {result['error']}"
    )
    if not args.quiet:
        for row in result["rows"]:
            mark = {
                "TRUE": "[OK]  ", "FALSE": "[FAIL]", "MISSING": "[MISS]",
                "UNJUDGED": "[--]  ", "ERROR": "[ERR] ",
            }[row["status"]]
            print(
                f"  {mark} #{row['id']:>2} {row['score']}分  {row.get('text', '')[:40]}"
                f"  实得={row['got']} 应={row['expect']} {row['note']}"
            )
        for error in errors:
            print(f"  [VALIDATION] {error}")
    if args.json:
        write_json(args.json, result)
    clean = not errors and result["missing"] == 0 and result["unjudged"] == 0 and result["error"] == 0
    return 0 if clean else 1


if __name__ == "__main__":
    sys.exit(main())
