# -*- coding: utf-8 -*-
"""八期考点判定器：按 rubric.json 判答卷，输出逐项 TRUE/FALSE 与得分。

用法: python judge.py <答卷.xlsx> [--rubric rubric.json] [--json out.json]
"""
import argparse, json, re, sys
from pathlib import Path
from openpyxl import load_workbook

def norm(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return str(v).strip()

def num(v):
    if isinstance(v, (int, float)): return float(v)
    s = norm(v).replace(",", "").replace("¥", "").replace("元", "")
    try: return float(s)
    except Exception: return None

def find_row(ws, key, col=2):
    """按首列标签找行，取第 col 列（1-based）。"""
    for row in ws.iter_rows(min_row=1, values_only=True):
        if row and norm(row[0]) and key in norm(row[0]):
            return row[col-1] if len(row) >= col else None
    return None

def compare(got, expect, tol):
    g = norm(got)
    if not g: return False
    if isinstance(expect, str) and not re.fullmatch(r"-?\d+(\.\d+)?", expect.strip()):
        e = norm(expect)
        return e in g or g in e
    gn = num(got)
    if gn is None: return False
    return abs(gn - float(expect)) <= float(tol)

def judge(xlsx, rubric_path, inputs=None):
    doc = json.loads(Path(rubric_path).read_text(encoding="utf-8"))
    import os; os.environ["ANSWER_XLSX"] = str(xlsx)
    try:
        from rules import check as rule_check
        rc = rule_check(None)
    except Exception as e:
        rc = {}
    if inputs:
        try:
            from rules_ext import external
            rc.update(external(inputs))
        except Exception as e:
            rc[999] = (False, f"外部复算失败 {e}")
    wb = load_workbook(xlsx, data_only=True)
    sheets = wb.sheetnames
    rows, score, total, unjudged = [], 0.0, doc["meta"]["total"], 0
    for it in doc["items"]:
        kind = it["kind"]; got = None; status = "FALSE"; note = ""
        try:
            if kind in ("summary", "row"):
                w = it["where"]; name = w.get("sheet", "决策摘要")
                ws = wb[name] if name in sheets else wb[sheets[0]]
                col = w.get("col", 2)
                got = find_row(ws, w["key"], col)
                if got is None:
                    status, note = "MISSING", f"{name} 无此指标"
                else:
                    status = "TRUE" if compare(got, it["expect"], it["tol"]) else "FALSE"
            elif kind == "cell":
                ws = wb[it["where"]["sheet"]]
                got = ws[it["where"]["cell"]].value
                status = "TRUE" if compare(got, it["expect"], it["tol"]) else "FALSE"
            elif kind in ("derived",) and it["id"] in rc:
                ok, note = rc[it["id"]]
                got = "见说明"; status = "TRUE" if ok else "FALSE"
            else:
                status = "UNJUDGED"; unjudged += 1
                note = "需独立复算或人工"
        except Exception as e:
            status, note = "ERROR", str(e)[:60]
        if status == "TRUE": score += it["score"]
        rows.append({"id": it["id"], "score": it["score"], "status": status,
                     "got": norm(got)[:40], "expect": norm(it["expect"])[:40], "text": it["text"], "note": note})
    wb.close()
    judged = sum(1 for r in rows if r["status"] in ("TRUE", "FALSE", "MISSING"))
    return {"file": str(xlsx), "score": score, "total": total,
            "judged": judged, "unjudged": unjudged,
            "true": sum(1 for r in rows if r["status"] == "TRUE"),
            "false": sum(1 for r in rows if r["status"] == "FALSE"),
            "missing": sum(1 for r in rows if r["status"] == "MISSING"),
            "rows": rows}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx"); ap.add_argument("--rubric", default="rubric.json")
    ap.add_argument("--json", default=None); ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--inputs", default=None, help="A 系列输入附件目录")
    a = ap.parse_args()
    r = judge(a.xlsx, a.rubric, a.inputs)
    print(f"得分 {r['score']:.0f}/{r['total']} | 已判 {r['judged']} 项（真 {r['true']} / 假 {r['false']} / 缺 {r['missing']}）| 待算 {r['unjudged']}")
    if not a.quiet:
        for row in r["rows"]:
            mark = {"TRUE":"[OK]  ","FALSE":"[FAIL]","MISSING":"[MISS]","UNJUDGED":"[--]  ","ERROR":"[ERR] "}[row["status"]]
            print(f"  {mark} #{row['id']:>2} {row['score']}分  {row['text'][:40]}  实得={row['got']} 应={row['expect']} {row['note']}")
    if a.json:
        Path(a.json).write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if r["false"] == 0 and r["missing"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
