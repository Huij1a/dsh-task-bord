# 05 证据链与附件设计

## 前置读取

开始前读取：

- `artifacts/00_spec/项目门槛.json` 和 `artifacts/00_spec/规范摘录.md`
- `artifacts/01_src/素材清单.md` 和 `artifacts/01_src/来源索引.csv`
- `artifacts/02_scrub/脱敏底稿.md`、`artifacts/02_scrub/映射表.csv` 和 `artifacts/02_scrub/脱敏映射.json`
- `artifacts/03_survey/可用方向.md` 和 `artifacts/03_survey/方向评估.csv`
- `artifacts/04_scope/决定与交付.md` 和 `artifacts/04_scope/交付规格.json`

`04_scope/交付规格.json` 中的 `business_fields` 是业务字段真源；00_spec 的 `platform_fields` 是投稿平台栏位，本节点不得读取它来设计题目字段、附件列或难点。04 的文件缺失、不可解析、`business_fields` 为空或字段来源不闭合时停止。`quality_gates`、`attachment_policy` 为 `null` 表示规范未声明，不得自行补规则。

## 任务

围绕 04 已选定的真实决定，建立“材料事实 → 难点 → 附件 → 可判定交付字段”的证据链。难点在本节点分配稳定 ID，11 只做反向考点映射，不得回填或改写本节点。

## 难点 ID 稳定性

- ID 固定为 `D01`、`D02`…，在本题生命周期内唯一且不复用。
- 同一难点在返修中保留原 ID；标题或描述可更新，但不得把旧 ID 分配给另一个难点。
- 删除的难点保留记录并标 `status: "withdrawn"`，同时填写非空 `withdrawal_reason`；`active` 项该字段必须为 `null`。新增难点取下一个未使用编号。11 只为 `active` 难点要求考点覆盖，并原样引用 withdrawn 的理由。
- 不得用 `M01` 与 `D01` 两套编号并存；旧稿中的 M 编号视为已废止。

## 考点映射边界

难点→考点映射的唯一生产者是 11 的 `artifacts/11_rubric/难点覆盖.json`；05 不设“对应考点”列或字段、不预留空值，11 不得回写 05；10 只读 05 清单与策略，不要求 05 提供考点。

## 输出一：难点清单.json（canonical）

必须输出严格 JSON：

```json
{
  "schema_version": 1,
  "source_delivery": {
    "path": "artifacts/04_scope/交付规格.json",
    "sha256": "<64位小写sha256>"
  },
  "difficulties": [
    {
      "difficulty_id": "D01",
      "title": "<难点标题>",
      "difficulty_types": ["multi_stage"],
      "judgment_class": "substantive|freebie",
      "business_field_keys": ["BF01"],
      "carrier_attachment_ids": ["A01"],
      "carrier_bindings": [
        {"attachment_id": "A01", "part": "<sheet/节>", "locator": "<单元格/区域/唯一锚点>", "field_keys": ["AF01"]}
      ],
      "text_only_reason": null,
      "source_locator": {
        "file": "artifacts/02_scrub/脱敏底稿/SID01.md",
        "locator": "<标题/行/段/表>",
        "quote": "<原文事实，不改写>",
        "source_ids": ["SID01"]
      },
      "stage_refs": ["S01", "S02"],
      "branch_failure_ids": ["F01"],
      "status": "active|withdrawn",
      "withdrawal_reason": null
    }
  ]
}
```

`difficulty_types` 只能从以下通用目录选择，可多选：`multi_stage`、`attachment_entanglement`、`implicit_rule`、`workload`、`rule_combination`、`standard_derivation`、`exception_branch`、`cross_validation`。不得写死项目、行业或题型的专属类型。

约束：

- 每个 `business_field_key` 必须存在于 04 `business_fields`；至少一个 active 难点覆盖每个 `must_judge=true` 字段。
- `judgment_class` 必须与 04 同字段的分类一致；一个难点覆盖多个分类冲突的字段时拆分难点，不取多数或猜测。
- `carrier_attachment_ids` 必须存在于下文附件清单；`carrier_bindings` 的 `attachment_id` 集合必须等于 `carrier_attachment_ids`，每个 `field_keys` 必须存在于 `附件清单.json` 对应 attachment 的 `fields[].field_key`。
- 无附件承载时 `carrier_attachment_ids=[]`、`carrier_bindings=[]`，且 `text_only_reason` 非空（说明证据来自题面或 04 决策）；有附件承载时 `text_only_reason` 为 `null`。
- `source_locator.file` 必须是实际存在的 01/02/03/04 文件；`quote` 必须逐字来自该位置，不得写概括；`source_locator.source_ids` 至少 1 个，且每个都存在于 02 `脱敏映射.json` 的 `entries[].source_id`。
- `stage_refs`、`branch_failure_ids` 必须能在 `关系图.json` 中找到。

同时输出 `artifacts/05_evidence/难点清单.csv` 供人阅读，列：

`difficulty_id,title,difficulty_types,judgment_class,business_field_keys,carrier_attachment_ids,carrier_bindings,text_only_reason,source_file,source_locator,source_ids,stage_refs,branch_failure_ids,status,withdrawal_reason`

CSV 只是 JSON 的镜像；若冲突，以 `难点清单.json` 为准，且视为本节点未完成。

## 输出二：难点策略.json

本文件让 10 判断“难点设计是否符合当期策略”，不得在提示词里写死条数或类型比例。结构：

```json
{
  "schema_version": 1,
  "policy_source": [{"file": "<实际文件>", "locator": "<位置>", "quote": "<依据>"}],
  "declared_count_min": null,
  "declared_count_max": null,
  "required_difficulty_types": [],
  "actual_count": 0,
  "actual_type_coverage": [],
  "coverage_rationale": "<为什么这些难点支撑本题决定>",
  "pass": false
}
```

- 只有 `quality_gates` 或题目定义明确写出条数/类型要求时，才填对应阈值并引用来源；否则 `declared_count_min/max` 为 `null`，`required_difficulty_types` 为空数组，表示不适用而不是失败。
- `actual_count` 必须等于 active 难点数；`actual_type_coverage` 必须等于 active 难点实际出现的类型集合。
- `pass` 只在 active 难点非空、数量/类型声明得到满足、每个必判业务字段至少被一个 active 难点覆盖时为 `true`；未声明阈值不参与失败判定。

## 输出三：关系图.json

必须输出严格 JSON，供 10 机器核对阶段、分支和反例，不得只给自由文本：

```json
{
  "schema_version": 1,
  "stages": [
    {
      "stage_id": "S01",
      "name": "<阶段名>",
      "input_refs": ["A01", "BF01", "OUT01/P01"],
      "output_refs": ["BF01", "OUT01/P02"],
      "difficulty_ids": ["D01"]
    }
  ],
  "edges": [
    {"from": "S01", "to": "S02", "condition": "<成立条件>", "difficulty_ids": ["D01"]}
  ],
  "branch_failures": [
    {
      "failure_id": "F01",
      "stage_id": "S01",
      "condition": "<可观察的错误/例外条件>",
      "expected_action": "stop|continue|repair|escalate|other",
      "business_consequence": "<后果>",
      "difficulty_ids": ["D01"],
      "source_refs": [{"file": "artifacts/02_scrub/脱敏底稿/SID01.md", "locator": "<位置>", "quote": "<依据>"}]
    }
  ]
}
```

`input_refs` 和 `output_refs` 只能使用可机器解析的稳定引用：`Dxx`、`BFxx`、`Axx` 或 `OUTxx/Pxx`；不得写“题面事实”等自由文本。`source_refs` 必须指向 01/02/03/04 的实际位置，`expected_action` 必须有题目材料依据。没有分支时 `branch_failures` 可写 `[]`，不能为了凑难度虚构反例。

## 输出四：附件清单.json 与 CSV

`附件清单.json` 是附件定义真源：

```json
{
  "schema_version": 1,
  "attachments": [
    {
      "attachment_id": "A01",
      "filename": "<06 将生成的具体文件名>",
      "format": "xlsx|docx|pdf|md|txt|csv|json",
      "purpose": "<该附件承载的业务事实>",
      "difficulty_ids": ["D01"],
      "fields": [
        {
          "field_key": "AF01",
          "label": "<附件中的列名或字段名>",
          "dtype": "string|number|date|datetime|boolean|enum|text",
          "required": true,
          "unit": null,
          "precision": null,
          "tol": null,
          "value_domain": null,
          "business_field_keys": ["BF01"],
          "source_locator": {"file": "artifacts/02_scrub/脱敏底稿/SID01.md", "locator": "<位置>", "quote": "<依据>"}
        }
      ]
    }
  ]
}
```

- `attachment_id` 稳定且与难点、关系图引用一致；`filename` 在整条流水线内唯一。
- 附件格式和大小受 `attachment_policy` 约束；该键为 `null` 时不补默认格式、大小或数量。
- 每个附件字段必须有 01/02/03 的实际来源，或明确写出由 04 业务字段按什么规则派生。`business_field_keys` 只引用 04 已定义字段。
- 附件不是答案：不得包含解法步骤、正确动作、评分标准或“注意/不要”等提示。

同时输出 `artifacts/05_evidence/附件清单.csv` 供人阅读，列：

`attachment_id,filename,format,purpose,difficulty_ids,field_key,label,dtype,required,unit,precision,tol,business_field_keys,source_file,source_locator`

冲突时以 JSON 为准并视为未完成。

## 输出五：字段口径.md

逐字段写明：

- `business_field_key/label → 04 类型/单位/精度/容差`
- `附件 field_key → business_field_key` 的继承或派生关系
- 同一业务量在不同附件中的口径、符号和单位换算
- 没有映射到业务字段的附件字段为什么仍然必要

不得把平台投稿栏位、旧题字段或其他行业字段写入本题口径。

## 硬要求

- 难点必须来自实际材料和 04 的真实决定，不得先写题面再倒推证据。
- 本节点不得写题面、rubric、答案或评分规则；不设“对应考点”列或字段、不预留空值，映射只由 11 的 `难点覆盖.json` 产生。
- 每个 active 难点至少 1 个 `source_ids`，且 `source_locator` 可回查；缺证据的难点不得进清单，退回 01/02/03 补材料。
- 04 `business_fields` 与附件字段的映射必须闭合；映射不到时停止，不得在 06 猜列名。
- 05 产物写完后，06 只能制造附件，07 只做元数据检查；任何字段或难点变更都必须在本节点重新生成。

## 机器门禁

最终回复最后一行是单行、可直接 `JSON.parse` 的 gate 对象（不套代码围栏）：`summary` 非空，`artifacts` 逐项核对产物，`conditions` 必须为 `true`，`extra.audit` 按实际重算填写。

- `conditions` 必须包含 `canonical_tables_consistent`、`attachment_manifest_complete`、`difficulty_source_traceable`、`carrier_bindings_complete`。
- `extra.audit` 形状（键名与嵌套逐字一致）：

```json
{"audit":{"active_difficulty_ids":["D01"],"difficulty_count":1,"source_ids_used":["SID01"],"known_source_ids":["SID01","SID02"],"unknown_source_ids":[],"carrier_attachment_ids":["A01"],"known_attachment_ids":["A01"],"unknown_carrier_ids":[],"carrier_binding_ids":["A01"],"binding_attachment_mismatch":[],"business_field_keys":["BF01"],"known_business_field_keys":["BF01"],"unknown_business_field_keys":[],"must_judge_keys":["BF01"],"uncovered_must_judge_keys":[],"every_active_has_source":true,"every_active_has_carrier_or_reason":true,"source_index_rows":2}}
```

- `active_difficulty_ids`、`difficulty_count` 按 active 项实际统计；`known_source_ids` 取自 02 `脱敏映射.json`，`known_attachment_ids`/`known_business_field_keys` 取自 05 `附件清单.json` 与 04 `交付规格.json`；三个 unknown 数组必须为空。
- `binding_attachment_mismatch` 记录 `carrier_bindings` 与 `carrier_attachment_ids` 的差集；`every_active_has_source`、`every_active_has_carrier_or_reason` 逐 active 项判定；`uncovered_must_judge_keys` 必须为空；`source_index_rows` 为 01 `来源索引.csv` 的实际数据行数。
