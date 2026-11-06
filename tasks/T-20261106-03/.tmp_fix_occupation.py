# -*- coding: utf-8 -*-
"""收敛 occupation_tree 形态：节点只保留 name/children（与 00_spec 约定形状一致），
并把 source_locator 写清楚列名与行范围。"""
import json, openpyxl

GATE = r"D:\高经出题流水线\tasks\T-20261106-03\artifacts\00_spec\项目门槛.json"
XLSX = r"D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_\高经济题目职业树_整理表.xlsx"

ws = openpyxl.load_workbook(XLSX, data_only=True)["职业树"]
last = ws.max_row

g = json.load(open(GATE, encoding="utf-8"))
for node in g["occupation_tree"]["roots"]:
    node.pop("sector", None)
    for ch in node["children"]:
        ch.pop("sector", None)
g["occupation_tree"]["source_locator"] = (
    f"职业树工作表（第2-{last}行、A-F 共 6 列中的 5 个数据列：原表行号、板块、L1职业簇、"
    "L2典型职业、典型端到端核心工作流/任务分类；L2典型职业单元格内以换行分隔多个岗位）"
)
open(GATE, "w", encoding="utf-8", newline="\n").write(
    json.dumps(g, ensure_ascii=False, indent=2) + "\n"
)
print("rows", last, "L1", len(g["occupation_tree"]["roots"]),
      "L2", sum(len(n["children"]) for n in g["occupation_tree"]["roots"]))
print("keys", sorted(g["occupation_tree"]["roots"][0]))
