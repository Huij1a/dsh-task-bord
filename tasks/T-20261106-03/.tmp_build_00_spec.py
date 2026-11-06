# -*- coding: utf-8 -*-
import json, os, re
import openpyxl

SPEC_DIR = r"D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_"
MAIN_REL = "高经济价值【八期】任务说明文档LANCER.V1.md"
GUIDE_REL = "一个行业，怎么轻松出满 8 道高经济价值难题？.md"
XLSX_REL = "高经济题目职业树_整理表.xlsx"
MAIN = os.path.join(SPEC_DIR, MAIN_REL)
GUIDE = os.path.join(SPEC_DIR, GUIDE_REL)
XLSX = os.path.join(SPEC_DIR, XLSX_REL)
OUT_DIR = r"D:\高经出题流水线\tasks\T-20261106-03\artifacts\00_spec"

main_text = open(MAIN, encoding="utf-8").read()
guide_text = open(GUIDE, encoding="utf-8").read()
main_lines = main_text.split("\n")
guide_lines = guide_text.split("\n")

def ml(n):
    return main_lines[n - 1]

def gl(n):
    return guide_lines[n - 1]

def block(lines, a, b):
    return "\n".join(lines[a - 1:b])

# ---------- 断言行号正确 ----------
assert "任务名称" in ml(31) and "出题字段说明" in ml(23)
assert "Sota模型得分率" in ml(160)
assert "执行轮数" in ml(161)
assert "运行时间" in ml(162)
assert ml(9).startswith("**⚠️本任务不支持纯代码")
assert "金融服务" in ml(84) and ml(84).startswith("|金融服务|")

# ---------- 行业树 ----------
industry_rows = list(range(84, 101))
roots = []
for i in industry_rows:
    line = ml(i)
    cells = line.split("|")
    l1 = cells[1].strip()
    l2cell = cells[2].strip() if len(cells) > 2 else ""
    children = []
    if l2cell:
        for part in l2cell.split("；"):
            name = part.strip()
            if name:
                children.append({"name": name, "children": []})
    roots.append({"name": l1, "children": children})
industry_tree = {"roots": roots}
assert len(roots) == 17, len(roots)
assert roots[0]["name"] == "金融服务"
assert roots[0]["children"][0]["name"] == "银行、支付与消费金融"

# ---------- 职业树 ----------
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["职业树"]
occ_roots = []
seen = {}
for row in ws.iter_rows(min_row=2, values_only=True):
    sector = (str(row[1]).strip() if row[1] is not None else "")
    l1 = (str(row[2]).strip() if row[2] is not None else "")
    raw_l2 = (str(row[3]) if row[3] is not None else "")
    if not l1:
        continue
    children = []
    for chunk in raw_l2.split("\n"):
        chunk = chunk.strip()
        if not chunk:
            continue
        for piece in re.split(r"[、；]", chunk):
            name = piece.strip()
            if name:
                children.append({"name": name, "children": []})
    if l1 in seen:
        seen[l1]["children"].extend(children)
    else:
        node = {"name": l1, "sector": sector, "children": children}
        seen[l1] = node
        occ_roots.append(node)
occupation_tree = {
    "source_file": XLSX_REL,
    "source_locator": "职业树工作表（第1-43行，五列：原表行号/板块/L1职业簇/L2典型职业/典型端到端核心工作流/任务分类）",
    "roots": occ_roots,
}
assert any(n["name"] == "金融分析师" for n in occ_roots)

# ---------- 平台栏位 ----------
L1_ENUM = [r["name"] for r in roots]
L2_ENUM = [c["name"] for r in roots for c in r["children"]]
TASK_TYPES = [ml(i).split("|")[1].replace("<br>", "").strip() for i in range(53, 59)]
L1_OCC = [n["name"] for n in occ_roots]

pf_meta = [
    (31, "PF01", "任务名称", "text", None, None, None),
    (32, "PF02", "任务类型", "enum", TASK_TYPES, "《任务类型说明》表（本文件第45-58行）", None),
    (33, "PF03", "任务形式", "enum", ["单轮", "多轮"], "《出题字段说明》表 任务形式 行", None),
    (34, "PF04", "L1行业", "enum", L1_ENUM, "《行业分类》表 L1行业列（本文件第82-100行）", "每次任务只能选择一个对应的L1行业，不能跨L1行业（L2行业无限制）"),
    (35, "PF05", "L2行业", "enum", L2_ENUM, "《行业分类》表 L2行业配额列（本文件第82-100行）", "属于L1行业下的细分行业，从对应L1行业下的L2行业中单选"),
    (36, "PF06", "L1职业", "enum", L1_OCC, "高经济题目职业树_整理表.xlsx（职业树工作表 L1职业簇列）", "从职业分类树的“职业簇”中单选；职业类型不能穷举，选择一个最贴近任务类型的L1职业即可"),
    (37, "PF07", "L2职业", "enum", None, "高经济题目职业树_整理表.xlsx（职业树工作表 L2典型职业列）", "填写实际执行任务的具体岗位，使用职业分类树“典型职业”的颗粒度；以职责和工作流为准"),
    (38, "PF08", "题目-文字", "text", None, None, "题目表述在尽量真实的前提下应当没有歧义，清晰给出需要作答的内容和需要交付的产物"),
    (39, "PF09", "题目-附件", "file", None, None, "大小不超过2G；支持pdf/word/txt/rar等多种格式；附件之间应服务于同一个复杂目标，不能只是多个无关材料的简单拼合"),
    (40, "PF10", "考点", "text", None, None, "给出关键评分点、通过标准、枚举易错点、枚举正确答案"),
    (41, "PF11", "作答思路", "text", None, None, "描述专家认为合理的完成路径，包括应如何拆解任务、使用哪些资料、关键判断点在哪里、容易出错的地方是什么"),
    (42, "PF12", "标准答案-文字", "text", None, None, "如果题目有明确答案，给出完整标准答案或关键结论。如果题目偏开放，给出高质量参考答案，并说明它为什么好，包括结构、内容、判断质量、可执行性等"),
    (43, "PF13", "标准答案-附件", "file", None, None, "附件应与题目要求一一对应"),
]
assert len(pf_meta) == 13

# ---------- source ----------
sources = []

def add_source(sid, key, fname, quote, locator, normalized=None, derivation=None, text=None):
    rec = {"source_id": sid, "key": key, "file": fname, "quote": quote, "locator": locator}
    if normalized is not None:
        rec["normalized_value"] = normalized
    if derivation is not None:
        rec["derivation"] = derivation
    base = text if text is not None else (guide_text if fname == GUIDE_REL else (main_text if fname == MAIN_REL else None))
    if base is not None:
        assert quote in base, f"{sid} quote 不在 {fname} 中：{quote[:60]!r}"
    sources.append(rec)

add_source("S001", "project", MAIN_REL, ml(1), "第1行 文档标题",
           normalized="高经济价值【八期】",
           derivation="标题“# 高经济价值【八期】任务说明文档LANCER\\.V1”去掉文档类型后缀“任务说明文档LANCER.V1”与 Markdown 转义后得到项目名")
add_source("S002", "industry", MAIN_REL, ml(84), "第84行《行业分类》表 金融服务 行",
           normalized="金融服务",
           derivation="args.industry=“金融服务/银行、支付与消费金融”，取其中 L1 节点“金融服务”作为门槛 industry；L2 路径见 industry_tree 第一根节点")
add_source("S003", "score_max", MAIN_REL,
           "|Sota模型得分率（必须满足）|\\<= 50 分<br>|",
           "第160行《收题难度要求》指标表 Sota模型得分率 行",
           normalized=50,
           derivation="原文“<= 50 分”为得分率上限，取百分号前的数值 50，不是题目总分")
add_source("S004", "score_rule", MAIN_REL,
           "|Sota模型得分率（必须满足）|\\<= 50 分<br>|",
           "第160行《收题难度要求》指标表 Sota模型得分率 行",
           normalized="<=",
           derivation="原文比较语义“<=”直译为 JSON 运算符 <=，modelscore 需小于等于 score_max")
add_source("S005", "any_of", MAIN_REL, ml(161),
           "第161行《收题难度要求》指标表 Sota模型执行轮数 行",
           normalized={"metric": "rounds", "op": ">=", "value": 50},
           derivation="“Sota模型执行轮数 |\\> =50 步”中的“轮数”按第160行补充知识“一个执行轮次的边界就是一次完整的模型决策输出，也就是模型生成的 assistant message 条数”映射为 judge 指标 rounds，比较符 >=，值 50")
add_source("S006", "any_of", MAIN_REL, ml(162),
           "第162行《收题难度要求》指标表 Sota模型运行时间 行",
           normalized={"metric": "minutes", "op": ">", "value": 40},
           derivation="“运行时间|\\> 40 分钟”的单位已是分钟，直接映射 judge 指标 minutes，比较符 >，值 40")
add_source("S007", "any_of", GUIDE_REL, gl(10),
           "第10行《出题标准》表 合格线 行",
           normalized="轮数或时间二选一",
           derivation="“执行轮数 ≥ 50 步，或运行时长 > 40 分钟（二选一）”确认 any_of 为 OR 语义，与主规范第156行“轮数、时间二选一即为达标”一致")
add_source("S008", "platform_fields", MAIN_REL, ml(29), "第29行《出题字段说明》表 表头",
           normalized="字段|如何填写|填写要求",
           derivation="投稿平台栏位表，共13个栏位，按第31-43行原顺序采集")

for i, sid, name, vt, enum, esrc, vrule in pf_meta:
    add_source("S0" + str(20 + i - 30).rjust(2, "0") if False else "SPF" + sid[-2:],
               "platform_fields", MAIN_REL, ml(i),
               f"第{i}行《出题字段说明》表 {name} 行",
               normalized=name)

add_source("S020", "task_types", MAIN_REL, block(main_lines, 53, 58),
           "第51-58行《任务类型说明》表（6个任务类型行）",
           normalized=TASK_TYPES,
           derivation="按表格行顺序提取第1列“任务类型”，去掉行内 <br> 后得到 6 个值")
add_source("S021", "industry_tree", MAIN_REL, block(main_lines, 82, 100),
           "第82-100行《行业分类》表（L1行业/L2行业配额）",
           normalized="17 个 L1 根节点及各自 L2 子节点",
           derivation="按行取第1列作 L1、第2列按“；”拆分作 L2；“影视文娱/新媒体（10月29新增）”行 L2 列为空，children 记 []，未补任何节点")
add_source("S022", "occupation_tree", MAIN_REL, ml(62),
           "第60-62行《职业填写说明》",
           normalized="职业分类树（外部来源）",
           derivation="规范要求按职业分类树的“职业簇”与“典型职业”命名；本地同目录整理表 高经济题目职业树_整理表.xlsx 为其可读来源")
add_source("S023", "occupation_tree", XLSX_REL, "L1职业簇",
           "职业树工作表!C1 表头“L1职业簇”",
           normalized="42 个 L1 职业簇及其 L2 典型职业",
           derivation="职业树按 板块/L1职业簇/L2典型职业 三列结构化；L2 单元格按换行、“、”“；”拆分，未新增规范外节点")
add_source("S024", "forbidden", MAIN_REL, ml(9),
           "第9行 任务范围禁止项",
           normalized="不支持纯代码；不支持视频生成、图片生成、选题策划等偏创意、内容策划类题目；不收与业务工作场景无关的题目")
add_source("S025", "forbidden", MAIN_REL, ml(229), "第229行 注意事项1 禁止跨行业出题")
add_source("S026", "forbidden", MAIN_REL, ml(231), "第231行 注意事项2 任务必须真实")
add_source("S027", "forbidden", MAIN_REL, ml(233), "第233行 注意事项3 禁止同质化出题")
add_source("S028", "forbidden", MAIN_REL, ml(235), "第235行 注意事项4 单人出题上限6道")
add_source("S029", "forbidden", MAIN_REL, ml(237), "第237行 注意事项5 禁止重复出题")
add_source("S030", "forbidden", MAIN_REL, ml(239), "第239行 注意事项6 禁止模版化出题")
add_source("S031", "forbidden", MAIN_REL, ml(241), "第241行 注意事项7 禁止套用公开评测集/竞赛题")
add_source("S032", "forbidden", MAIN_REL, block(main_lines, 176, 185),
           "第176-185行《不纳入的任务》表（8类不纳入任务）",
           normalized="8 类不纳入任务")
add_source("S033", "deadlines", MAIN_REL, ml(13), "第13行 收题周期")
add_source("S034", "deadlines", MAIN_REL, ml(15), "第15行 质检周期")
add_source("S035", "deadlines", MAIN_REL, ml(17), "第17行 返修说明")
add_source("S036", "deadlines", MAIN_REL, ml(21), "第21行 返修三阶段最后时间")
add_source("S037", "quality_gates", MAIN_REL, ml(152), "第152行 收题难度要求 第1条")
add_source("S038", "quality_gates", MAIN_REL, ml(154), "第154行 收题难度要求 第2条")
add_source("S039", "quality_gates", MAIN_REL, ml(156), "第156行 收题难度要求 第3条")
add_source("S040", "quality_gates", MAIN_REL, "但您提供的附件必须与提示词相关",
           "第160行《收题难度要求》指标表 Sota模型得分率 行 第2点",
           normalized="附件必须与提示词相关")
add_source("S041", "attachment_policy", MAIN_REL, ml(39),
           "第39行《出题字段说明》表 题目-附件 行",
           normalized="pdf/word/txt/rar；不超过2G；可直接上传文件或压缩包",
           derivation="文件大小“不超过2G”按 1G=1024^3 字节换算为 max_bytes=2147483648；格式只收原文明确列出的 pdf/word/txt/rar，其他格式原文写明“不确定能否上传”，不补值")

# 平台栏位 source_id 与 source 记录对齐
pf_source_ids = ["SPF%02d" % (i + 1) for i in range(13)]
pf_records = [s["source_id"] for s in sources if s["key"] == "platform_fields" and s["source_id"].startswith("SPF")]
assert pf_records == pf_source_ids

# ---------- 顶层字段 ----------
forbidden = [
    "本任务不支持纯代码",
    "不支持视频生成、图片生成、选题策划等偏创意、内容策划类题目",
    "不收与业务工作场景无关的题目，如纯计算题、纯文案生成",
    "禁止跨行业出题：单期任务内只能选择自己 L1 行业中的题目",
    "任务必须真实，具有现实意义，不能是架空场景或者虚构场景",
    "禁止同质化出题：同一专家的6题至少应在任务目标、工作流程、任务类型或最终产物中的两个方面存在实质差异",
    "单人出题上限6道，最多出6题",
    "禁止重复出题：与其他任务（进行中或已结束）相似度高的题目按作废处理",
    "禁止模版化出题",
    "禁止套用公开评测集/竞赛题：禁止对公开评测集仅修改数据就提交",
    "不纳入简单知识问答（主要考察“知不知道”，结果不会进入真实工作流程）",
    "不纳入单点事实、日期或定义查询",
    "不纳入单篇文章或单份材料摘要",
    "不纳入普通润色、翻译、排版和简单制图",
    "不纳入玩具代码和一次性小页面",
    "不纳入靠扩大范围制造的“长任务”",
    "不纳入多个互不相关的小任务拼接",
    "不纳入缺少关键材料或权限的任务",
]

deadlines = [
    {"deadline_id": "DL01", "label": "收题周期（提交截止）", "kind": "submission",
     "raw_value": "11月4日-11月9日23:59:59分", "normalized_value": None, "timezone": None,
     "source_id": "S033"},
    {"deadline_id": "DL02", "label": "质检周期", "kind": "qa",
     "raw_value": "收题结束后2-3周内（依实际情况而定）", "normalized_value": None, "timezone": None,
     "source_id": "S034"},
    {"deadline_id": "DL03", "label": "返修周期", "kind": "repair",
     "raw_value": "质检结果公布后两日内需完成返修", "normalized_value": None, "timezone": None,
     "source_id": "S035"},
    {"deadline_id": "DL04", "label": "返修三阶段最后时间", "kind": "stage_final",
     "raw_value": "11月10日14:30前", "normalized_value": None, "timezone": None,
     "source_id": "S036"},
]

quality_gates = [
    {"gate_id": "QG01", "name": "题目要素完备", "rule": "提示词、附件、标答、考点等信息完备且符合规范",
     "applies_to": "17", "source_id": "S037"},
    {"gate_id": "QG02", "name": "题目完备性、AI率检测、高经济价值三项通过",
     "rule": "题目完备性、AI率检测、高经济价值三项通过", "applies_to": "16", "source_id": "S038"},
    {"gate_id": "QG03", "name": "题目足够困难",
     "rule": "Sota模型得分率<=50分（必须满足）；Sota模型执行轮数>=50步或运行时间>40分钟，二选一即达标",
     "applies_to": "16", "source_id": "S039"},
    {"gate_id": "QG04", "name": "附件与提示词相关", "rule": "提供的附件必须与提示词相关",
     "applies_to": "05", "source_id": "S040"},
]

attachment_policy = {
    "allowed_formats": ["pdf", "word", "txt", "rar"],
    "max_bytes": 2147483648,
    "max_count": None,
    "naming_rule": None,
    "rule": "可以直接上传文件或压缩包；大小不超过2G；支持pdf/word/txt/rar等多种格式，其他格式不确定能否上传；附件之间应服务于同一个复杂目标，不能只是多个无关材料的简单拼合",
}

platform_fields = []
for (i, sid, name, vt, enum, esrc, vrule), srcid in zip(pf_meta, pf_source_ids):
    platform_fields.append({
        "field_id": sid,
        "name": name,
        "order": int(sid[-2:]),
        "required": None,
        "value_type": vt,
        "enum_values": enum,
        "enum_source": esrc,
        "value_rule": vrule,
        "source_id": srcid,
    })

extraction_status = {
    "project": "extracted",
    "industry": "extracted",
    "score_max": "extracted",
    "score_rule": "extracted",
    "any_of": "extracted",
    "freebie_ratio_max": "not_applicable",
    "platform_fields": "extracted",
    "task_types": "extracted",
    "industry_tree": "extracted",
    "occupation_tree": "extracted",
    "forbidden": "extracted",
    "deadlines": "extracted",
    "quality_gates": "extracted",
    "attachment_policy": "extracted",
    "history_refs": "not_applicable",
}

gate = {
    "project": "高经济价值【八期】",
    "industry": "金融服务",
    "score_max": 50,
    "score_rule": "<=",
    "any_of": [
        {"metric": "rounds", "op": ">=", "value": 50},
        {"metric": "minutes", "op": ">", "value": 40},
    ],
    "freebie_ratio_max": None,
    "platform_fields": platform_fields,
    "task_types": TASK_TYPES,
    "industry_tree": industry_tree,
    "occupation_tree": occupation_tree,
    "forbidden": forbidden,
    "deadlines": deadlines,
    "quality_gates": quality_gates,
    "attachment_policy": attachment_policy,
    "history_refs": None,
    "source": sources,
    "extraction_status": extraction_status,
}

# ---------- 校验 ----------
KEYS = ["project", "industry", "score_max", "score_rule", "any_of", "freebie_ratio_max",
        "platform_fields", "task_types", "industry_tree", "occupation_tree", "forbidden",
        "deadlines", "quality_gates", "attachment_policy", "history_refs"]
assert set(gate.keys()) == set(KEYS) | {"source", "extraction_status"}, set(gate.keys()) ^ (set(KEYS) | {"source", "extraction_status"})
assert set(extraction_status.keys()) == set(KEYS)
VALID = {"extracted", "not_applicable", "unparseable", "conflict"}
for k in KEYS:
    st = extraction_status[k]
    assert st in VALID, k
    nonnull = gate[k] is not None
    if st == "extracted":
        assert nonnull, k
        assert any(s["key"] == k for s in sources), k
    else:
        assert not nonnull, k
for k in ("score_max", "score_rule", "industry"):
    assert extraction_status[k] == "extracted" and gate[k] is not None
for pf in platform_fields:
    assert pf["source_id"] in {s["source_id"] for s in sources}
    assert pf["source_id"] in pf_source_ids
assert len({s["source_id"] for s in sources}) == len(sources)
assert all(s["quote"].strip() for s in sources)
assert all(s["file"] in {MAIN_REL, GUIDE_REL, XLSX_REL} for s in sources)

os.makedirs(OUT_DIR, exist_ok=True)
gate_path = os.path.join(OUT_DIR, "项目门槛.json")
with open(gate_path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(gate, f, ensure_ascii=False, indent=2)
    f.write("\n")

# 回读校验
with open(gate_path, encoding="utf-8") as f:
    g2 = json.load(f)
assert g2["score_max"] == 50 and g2["score_rule"] == "<="
print("OK gate bytes", os.path.getsize(gate_path))
print("sources", len(sources), "pf", len(platform_fields), "occ roots", len(occ_roots))
print("forbidden", len(forbidden), "deadlines", len(deadlines), "qg", len(quality_gates))
print(json.dumps({k: (g2[k] if k not in ("industry_tree", "occupation_tree", "source", "platform_fields") else "…") for k in KEYS}, ensure_ascii=False, indent=1)[:1500])
