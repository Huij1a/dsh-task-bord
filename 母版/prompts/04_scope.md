# 04 选题定位与交付结构

> 本节点不预设行业、题型、平台或交付物。下面 JSON 只示形状，实际业务字段、文件、表和坐标均由本题真实决定与材料决定。

## 前置读取

开始前读取：

- `artifacts/00_spec/项目门槛.json`
- `artifacts/00_spec/规范摘录.md`
- `artifacts/02_scrub/脱敏底稿.md`
- `artifacts/03_survey/可用方向.md`
- `artifacts/03_survey/方向评估.csv`

确认 `args.industry` 与门槛 `industry` 一致；`industry_tree` 非 `null` 时须落在对应路径内。候选方向属于 `task_types`，不触碰 `forbidden`。项目门槛缺失、不可解析或行业不一致时停止。`quality_gates`、`deadlines`、`task_types` 等键为 `null` 时表示规范未声明该条件；只有 `score_max`、`score_rule` 必须非 `null`。不得把未声明的条件自行补成要求。

## 任务

从 03 的方向里选定一个，把“真实决定”和“交付要求”钉死。

## 必须回答

1. **谁负责**：哪个岗位为最终判断负责，拿成果去做什么？
2. **什么时点**：业务时点是什么，时区或口径来自哪一个明确来源？
3. **决定什么**：一句话说清需要作出的选择。
4. **错了损失什么**：错误决定造成哪些可观察的业务后果。
5. **为何值得做**：需要哪些判断、证据处理或跨约束核对，为什么足以形成区分度。

## 字段分域

- `platform_fields` 是 00_spec 从投稿规范采集的平台投稿栏位，只供 18 核对；04 不用它裁剪题目。
- `business_fields` 由本节点根据题目真实交付物定义，是 08/11/16/18 的直接业务字段真源，14 通过冻结 rubric 间接消费。它可以来自题目要填写的表、决定要输出的结论、计算要交付的数值或正文中必须回答的业务项。
- 相同文字出现在平台栏位和业务字段中也不得自动合并；二者的键、语义和消费者不同。
- `business_fields` 的 `key` 由本节点分配且全局唯一，形如 `BF01`…；`label` 可随题目变化。不得根据行业或平台写死字段名、数量或顺序。

## 交付规格.json

必须输出严格 JSON。最小结构如下：

```json
{
  "schema_version": 2,
  "selected_direction_id": "DIR01",
  "selection_rationale": "<为何选它、为何淘汰其它方向>",
  "decision": {
    "decision_id": "DEC01",
    "owner_role": "<负责岗位>",
    "decision_time": "<业务时点>",
    "decision_question": "<需要拍板的问题>",
    "consequence": "<错误后果>",
    "value_signal": "<决定错了会造成什么可观察、可计量的损失，或为什么它是真实高频用途>",
    "decision_user": "<拿成果做决定的人及用途>",
    "sources": [{"file": "<实际文件>", "locator": "<位置>", "quote": "<原文或材料事实>"}]
  },
  "business_fields": [
    {
      "key": "BF01",
      "label": "<业务字段名>",
      "dtype": "string|number|date|datetime|boolean|enum|text",
      "required": true,
      "must_judge": true,
      "judgment_class": "substantive|freebie",
      "unit": null,
      "precision": null,
      "tol": null,
      "allowed_values": null,
      "source_kind": "project_spec|scrubbed_material|task_definition|derived",
      "source_refs": [{"file": "<实际文件>", "locator": "<位置>", "quote": "<依据>"}]
    }
  ],
  "deliverables": [
    {
      "deliverable_id": "OUT01",
      "file": "<答题者必须生成的具体文件名>",
      "format": "xlsx|docx|pdf|md|txt|csv|json",
      "required": true,
      "parts": [
        {
          "part_id": "P01",
          "name": "<工作表或节名>",
          "kind": "table|section|text",
          "role": "detail|summary|decision|narrative",
          "business_field_keys": ["BF01"],
          "table": {
            "sheet": "<工作表名>",
            "header_row": 1,
            "data_start_row": 2,
            "data_end_row": null,
            "primary_key_fields": ["BF01"],
            "grain": "<一行代表什么>",
            "aggregation_of": ["P00"],
            "columns": [
              {"business_field_key": "BF01", "column": "A"}
            ]
          },
          "section": null,
          "text": null
        }
      ]
    }
  ],
  "editable_parameters": [],
  "boundaries": {
    "forbidden": [],
    "deadline_ids": [],
    "quality_gate_ids": []
  }
}
```

### business_fields

每个字段必须：

- `dtype` 只能是 `string|number|date|datetime|boolean|enum|text`；
- 数值字段的 `unit`、`precision`、`tol` 必须按题目来源明确；无单位/容差语义时显式写 `null`，不得由下游猜；
- `source_kind` 为 `project_spec` 时 `source_refs` 指向规范原文；为 `scrubbed_material` 时指向 02 的具体位置；为 `task_definition` 时指向 03/本题决定中明确要求交付的事实；为 `derived` 时写清由哪些业务字段按什么规则派生；
- `must_judge=true` 的字段必须进入至少一个 part；`must_judge=false` 只能用于不参与实质判定的展示性字段；
- `judgment_class` 只取 `substantive`（实质判断）或 `freebie`（送分/基础项）；同一字段不能既必判又不分类；
- `required=false` 表示答卷可以不填该业务项，不等同于平台栏位的 `not_applicable`。

### deliverables 与 parts

- `deliverable_id`、`part_id` 稳定唯一；`file` 是答题者真实生成的具体文件名，不得写集合或“见附件”。
- `kind=table` 仅可用于可真实生成 `xlsx` 的结构化表；`table` 字段必填，必须给出 `sheet`、`header_row`、`data_start_row`、`primary_key_fields`、`grain` 和 `columns`。`data_end_row=null` 表示数据行数由业务记录决定，不是无界；评分坐标仍由具体字段列定位。
- `role=detail|summary` 用于让 10 判断明细→汇总链路；`aggregation_of` 指向被汇总的 part ID，没有汇总关系时写空数组。
- `kind=section` 用于有稳定标题边界的 `docx/pdf/md/txt` 正文；`section` 必须为 `{"start_anchor":"...","end_anchor":"..."}`，两个锚点都必须由题面或交付模板固定，且 start 必须早于 end。
- `kind=text` 用于有唯一锚点的正文块；`text` 必须为 `{"anchor":"..."}`。`section`/`text` 不得冒充 `xlsx` 的单元格坐标。
- 每个 part 的 `business_field_keys` 必须引用顶层已定义字段；table 的 `columns` 必须覆盖该 part 的全部必判字段，不得出现未登记列。

### editable_parameters

反事实/替代参数只能来自本数组。每项至少含 `parameter_id`、`label`、`business_field_key`、`value_source`、`change_rule`；没有题面允许改变的参数时写 `[]`，不得为满足下游而虚构。11 只能选择本数组中的参数生成反事实项；若数组为空，`counterfactual` 检查写 `not_applicable` 并给出来源依据。

## 输出

- `artifacts/04_scope/决定与交付.md`：回答上述五问，附项目门槛路径、行业路径、`task_types` 依据、`selected_direction_id`、全部候选方向淘汰理由和方向来源定位。
- `artifacts/04_scope/交付规格.json`：严格按上文结构输出 `selected_direction_id`、`selection_rationale`、`decision`、`business_fields`、`deliverables`、`editable_parameters`、`boundaries`。
- `artifacts/04_scope/字段来源.md`：逐字段列 `business_field_key → label → source_kind/source_refs → 使用它的 deliverable/part`，并单列 `editable_parameters` 来源。
- `artifacts/04_scope/边界.md`：不做什么、需要哪些外部条件、哪些不许模型做，逐条标明来自项目门槛还是执行环境约束。

## 硬要求

- `selected_direction_id` 必须存在于 03 输出，且 `selection_rationale` 必须同时说明业务价值、证据可得性与可判定性；材料不足时停止并退回 03，不得硬选。
- 交付必须具体到文件、part、字段和坐标，11 才能生成机器可判 rubric。
- 业务时点必须标明口径和来源；规范未给时区或时点时不得自行补默认值。
- 所有 `business_fields` 必须能追溯到项目规范、脱敏材料、题目定义或明确派生规则；不得因附件好造、评分方便或平台常见而添加。
- 不得引用、复制或改写 `platform_fields` 作为业务字段；平台栏位只供 17 生成草案、18 做最终映射。
- 04 完成后，08、11、14、16 只能使用本文件的 `business_fields` 和交付结构，不得各自添加或改名；09 只能润色文字，若字段或坐标发生变化必须退回 08 重新生成。
- 数值字段的 `unit`、`precision`、`tol` 没有来源时必须停止并报告缺口，不得由下游猜默认值。
