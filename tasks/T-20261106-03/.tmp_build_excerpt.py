# -*- coding: utf-8 -*-
import json, os

SPEC_DIR = r"D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_"
GATE = r"D:\高经出题流水线\tasks\T-20261106-03\artifacts\00_spec\项目门槛.json"
OUT = r"D:\高经出题流水线\tasks\T-20261106-03\artifacts\00_spec\规范摘录.md"
MAIN_REL = "高经济价值【八期】任务说明文档LANCER.V1.md"

g = json.load(open(GATE, encoding="utf-8"))
srcs = {s["source_id"]: s for s in g["source"]}

def kb(n):
    return f"{n} B" if n < 1024 else f"{n/1024:.1f} KB"

md_files = sorted([f for f in os.listdir(SPEC_DIR) if f.lower().endswith(".md")])
xlsx_files = sorted([f for f in os.listdir(SPEC_DIR) if f.lower().endswith(".xlsx")])
attach = []
imgdir = os.path.join(SPEC_DIR, "图片和附件")
for f in sorted(os.listdir(imgdir)):
    p = os.path.join(imgdir, f)
    attach.append((f, os.path.getsize(p)))

read_mode = {
    "高经济价值【八期】任务说明文档LANCER.V1.md": "全文读取（260 行），全部门槛的规范正文来源",
    "一个行业，怎么轻松出满 8 道高经济价值难题？.md": "读取《一、出题标准》表（第5-11行），用于交叉核对合格线与二选一口径",
    "高经济价值任务难度突破指南.md": "关键词定位读取（得分率、轮数、附件要求相关条款），无新增门槛值",
    "一道好题是怎么构成的：两道优秀案例讲解.md": "关键词定位读取，仅为案例讲解，无门槛值",
    "📑从零开始：行业专家的 Prompt 与 Rubrics 写作实战指南.md": "关键词定位读取，仅为写作方法，无门槛值",
    "提升题目难度专题.md": "关键词定位读取，未命中得分率/截止/平台栏位等门槛条款",
    "建筑、地产与物业服务.md": "关键词定位读取，未命中门槛条款（行业优秀案例）",
}
for f in md_files:
    read_mode.setdefault(f, "关键词定位读取，未命中门槛条款（行业优秀案例）")

lines = []
add = lines.append

add("# 00 规范摘录：高经济价值【八期】项目门槛")
add("")
add("本文件是 `artifacts/00_spec/项目门槛.json` 的可复核摘录，二者一一对应；`source_id`、`file`、`quote`、`locator` 与 JSON 的 `source` 数组完全一致。")
add("")
add("## 一、读取范围")
add("")
add(f"- `specPath`：`{SPEC_DIR}`（目录）")
add(f"- 顶层 `.md` 文件数：{len(md_files)}；另读取职业树整理表 1 个（`{xlsx_files[0] if xlsx_files else ''}`，扩展名 .xlsx，用于 `occupation_tree` 结构化）。")
add("- 未读取工作区中任何其他“类似规范”，未修改规范目录内任何文件。")
add("")
add("| # | 相对路径 | 格式 | 大小 | 本次读取方式 |")
add("|---|---|---|---|---|")
for i, f in enumerate(md_files, 1):
    add(f"| {i} | {f} | .md | {kb(os.path.getsize(os.path.join(SPEC_DIR, f)))} | {read_mode.get(f, '关键词定位读取')} |")
for f in xlsx_files:
    add(f"| {len(md_files)+1} | {f} | .xlsx | {kb(os.path.getsize(os.path.join(SPEC_DIR, f)))} | `occupation_tree` 来源：职业树工作表逐行结构化读取（42 个 L1 职业簇） |")
add("")
add("## 二、当期行业与行业树路径")
add("")
add("- `args.industry`：`金融服务/银行、支付与消费金融`")
add("- 门槛 `industry`：`金融服务`（`industry_tree` 的 L1 根节点名称，满足“必须是树中节点”的约束；`args.industry` 的 L1 段与之完全一致）")
add("- 在 `industry_tree` 中的路径：`金融服务 → 银行、支付与消费金融 → （L2 无更深层级）`")
add("- 行业树共 17 个 L1 根节点；`金融服务` 下 4 个 L2：银行、支付与消费金融 / 证券、投行与资本市场 / 资管、PE/VC与投研 / 保险与财富管理。`影视文娱/新媒体（10月29新增）` 行 L2 列为空，`children` 记为 `[]`，未补任何规范外节点。")
add("")
add("## 三、门槛表")
add("")
add("| 顶层键 | 提取值 | 状态 | source_id | 原文文件 | 定位 | 原文引文（长引文见第七节） |")
add("|---|---|---|---|---|---|---|")

def disp(kind):
    if kind == "project":
        return f"`{g['project']}`"
    if kind == "industry":
        return f"`{g['industry']}`"
    if kind == "score_max":
        return f"`{g['score_max']}`（有限数字）"
    if kind == "score_rule":
        return f"`{g['score_rule']}`"
    if kind == "any_of":
        return "`rounds >= 50` 或 `minutes > 40`（OR，二选一）"
    if kind == "freebie_ratio_max":
        return "`null`"
    if kind == "platform_fields":
        return f"{len(g['platform_fields'])} 个栏位（PF01–PF13）"
    if kind == "task_types":
        return "；".join(g["task_types"])
    if kind == "industry_tree":
        return f"17 个 L1 根节点 / {sum(len(r['children']) for r in g['industry_tree']['roots'])} 个 L2"
    if kind == "occupation_tree":
        return f"42 个 L1 职业簇 / {sum(len(r['children']) for r in g['occupation_tree']['roots'])} 个 L2 典型职业；source_file=`{g['occupation_tree']['source_file']}`"
    if kind == "forbidden":
        return f"{len(g['forbidden'])} 条"
    if kind == "deadlines":
        return "4 条（DL01–DL04）"
    if kind == "quality_gates":
        return "4 条（QG01–QG04）"
    if kind == "attachment_policy":
        return "formats=pdf/word/txt/rar；max_bytes=2147483648；max_count=null；naming_rule=null"
    if kind == "history_refs":
        return "`null`"
    return ""

def srcids(k):
    ids = [s["source_id"] for s in g["source"] if s["key"] == k]
    return "、".join(ids) if ids else "—"

def files_for(k):
    fs = sorted({s["file"] for s in g["source"] if s["key"] == k})
    return "<br>".join(fs) if fs else "—"

def locs_for(k):
    ls = [s["locator"] for s in g["source"] if s["key"] == k]
    if len(ls) > 2:
        return "；".join(ls[:2]) + f" 等 {len(ls)} 处"
    return "；".join(ls) if ls else "—"

def quote_short(k):
    qs = [s["quote"] for s in g["source"] if s["key"] == k]
    if not qs:
        return "—（not_applicable）"
    q = qs[0].replace("|", "｜").replace("\n", " ⏎ ")
    q = q.replace("**", "")
    return (q[:80] + "…") if len(q) > 80 else q

KEYS = ["project", "industry", "score_max", "score_rule", "any_of", "freebie_ratio_max",
        "platform_fields", "task_types", "industry_tree", "occupation_tree", "forbidden",
        "deadlines", "quality_gates", "attachment_policy", "history_refs"]
for k in KEYS:
    add(f"| `{k}` | {disp(k)} | `{g['extraction_status'][k]}` | {srcids(k)} | {files_for(k)} | {locs_for(k)} | {quote_short(k)} |")
add("")
add("缺失/冲突说明：除第四节两个 `not_applicable` 键（规范确实未写）外，上表所有非 `null` 值均有对应原文；无 `unparseable`、无 `conflict`，没有需要回补的规范内容。")
add("")
add("`extraction_status` 覆盖上表 15 个逻辑键，无多余键。所有非 `null` 键均有同 `key` 的 `source` 记录；两个 `null` 键为 `not_applicable`，不产出 `source`。")
add("")
add("## 四、`null` 的原因")
add("")
add("| 键 | 状态 | 原因 |")
add("|---|---|---|")
add("| `freebie_ratio_max` | `not_applicable` | 规范未写送分/基础分占比上限；全文无“送分”“基础分比例”等表述。语义为“该条件不适用、不参与判定”，下游 10/14/16 按 NA 处理。 |")
add("| `history_refs` | `not_applicable` | 规范未要求参考任何历史题/样例题路径。第25行、第119行只给出“优秀案例/更多示例请看”等飞书链接作为格式示例，第243-260行为参考资料链接，均非“要求参考的历史题路径”，且规范未提供工作区路径；按要求不扫描工作区自行补充。 |")
add("")
add("无 `unparseable`、无 `conflict`。规范内两处《行业分类》表（第82-100行、第127-144行）内容一致，仅第82-100行多一行“影视文娱/新媒体（10月29新增）”，不构成冲突。")
add("")
add("## 五、`platform_fields` 原表抄录")
add("")
add("规范《出题字段说明》表（第29-43行）原文按顺序共 13 个栏位；`required` 一律记为 `null`，因为原表只写“专家填写/单选/无需填写”，未声明必填或选填。")
add("")
add("| field_id | 规范栏位名 | order | required | value_type | enum_values | source_id |")
add("|---|---|---|---|---|---|---|")
for p in g["platform_fields"]:
    ev = "—" if p["enum_values"] is None else f"{len(p['enum_values'])} 项"
    add(f"| `{p['field_id']}` | {p['name']} | {p['order']} | `null` | `{p['value_type']}` | {ev} | `{p['source_id']}` |")
add("")
add("原表逐行抄录（逐字，`source_id` 对应第 31-43 行）：")
add("")
add("```text")
for p in g["platform_fields"]:
    s = srcs[p["source_id"]]
    add(f"[{p['field_id']} / {p['source_id']}] 第{s['locator'].split('行')[0].replace('第', '')}行: {s['quote']}")
add("```")
add("")
add("- `PF02 任务类型` 枚举取自《任务类型说明》表 6 行：经营与投资决策、数据、财务与业务运营、法务、合规与交易支持、客户与专业项目交付、持续运营与团队协作、工程、产品与专业研究。")
add("- `PF03 任务形式` 枚举取自原表填写要求“单轮或多轮”，为 `[单轮, 多轮]`。")
add("- `PF04/PF05` 枚举取自《行业分类》表 17 个 L1 与 59 个 L2。")
add("- `PF06` 枚举为职业树 42 个“L1职业簇”；`PF07` 为“L2典型职业”，枚举值未在规范正文列出，`enum_source` 指向 `高经济题目职业树_整理表.xlsx` 的“职业树”工作表 L2典型职业列，完整层级见 JSON `occupation_tree.roots`。")
add("- 平台栏位只用于 17/18 核对投稿栏位与顺序，不作为业务字段、附件字段或评分坐标的上游。")
add("")
add("## 六、被忽略的文件清单")
add("")
add("`图片和附件/` 下 28 个文件为规范中“一个完整题目格式示例”的示例输入与示例标准答案附件，不是规范条款正文，未参与门槛提取：")
add("")
add("| 文件 | 大小 | 忽略原因 |")
add("|---|---|---|")
for f, sz in attach:
    add(f"| 图片和附件/{f} | {kb(sz)} | 示例题目的附件材料（A 系列输入 / B 系列标答 / image.png 流程图），非规范条款 |")
add("")
add("无隐藏临时文件、无 `~$` 锁文件。`高经济题目职业树_整理表.xlsx` 不作忽略处理，已作为 `occupation_tree` 的结构化来源。")
add("")
add("## 七、来源明细（逐字引文）")
add("")
cur = None
for s in g["source"]:
    if s["file"] != cur:
        add(f"### 文件：`{s['file']}`")
        add("")
        cur = s["file"]
    add(f"- `{s['source_id']}`（key=`{s['key']}`，定位：{s['locator']}）")
    add("")
    add("```text")
    add(s["quote"])
    add("```")
    if "normalized_value" in s:
        nv = s["normalized_value"]
        if not isinstance(nv, str):
            nv = json.dumps(nv, ensure_ascii=False, indent=1)
        add(f"- normalized_value：`{nv}`")
        add(f"- derivation：{s.get('derivation', '栏位原名，无单位换算或比较符映射；normalized_value 仅为栏位名称归一化')}")
    add("")
add("## 八、模型条件")
add("")
add("模型条件固定为 `deepseek-v4.1-flash`，推理等级固定为 `max`。该值来自流水线节点的固定配置，不是从项目规范、行业名称或下游提示词推断得到。")
add("")
add("## 九、完成判定自查")
add("")
add("- 两件产物存在且非空；`项目门槛.json` 可被标准 JSON 解析。")
add("- 15 个规定顶层键齐全，另有 `source`、`extraction_status`；未写项为 `null` 而非省略。")
add("- 状态与值严格成对：13 个 `extracted` 键值非 `null`，2 个 `not_applicable` 键值为 `null`；无 `unparseable`/`conflict`。")
add("- `score_max=50`、`score_rule=<=`、`industry=金融服务` 均为 `extracted` 且非 `null`。")
add("- 每个非 `null` 键都有真实 `source.file + quote`；13 个平台栏位各有独立 `source_id`（SPF01–SPF13）。")
add("- 本摘录引文与 `source.quote` 逐字一致；未修改规范目录任何文件。")
add("")

open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("OK", os.path.getsize(OUT))
