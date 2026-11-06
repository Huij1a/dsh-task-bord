# 10 难度诊断（判定节点）

## 任务

判定这套题是否具备足够的内在难度。**只读，不修改任何上游文件，也不提前代替 13/14 作答或评分。**

本节点只输出 `pass`、九项证据和返修路由。最终 `score`、运行时长、运行轮次以及 `score_max`、`score_rule`、`any_of` 是否满足，全部由 14 根据独立作答结果计算，本节点不得预判或代填。

## 输入

1. `artifacts/00_spec/项目门槛.json`：只读取 `freebie_ratio_max` 和 `extraction_status.freebie_ratio_max`。值为 `null` 且状态为 `not_applicable` 时，本节点把送分比例判为 `not_applicable`，不参与通过判定；规范写了但状态为 `unparseable|conflict` 时，00 已经失败，本节点不得继续。
2. `artifacts/04_scope/交付规格.json`：`business_fields`、`deliverables/parts`、`must_judge`、`judgment_class`、单位、精度、容差和可编辑参数。
3. `artifacts/05_evidence/难点清单.json`、`难点策略.json`、`关系图.json`、`附件清单.json`、`字段口径.md`。
4. `artifacts/06_build/附件事实快照.json`、`校验报告.json` 和实际附件。
5. `artifacts/09_style/题面_最终.md`、`字段映射差量.json`、`附件问题.json`；两个 JSON 必须 `pass=true`，否则本节点立即停止并按其 `route` 返修，不得进入难度判定。
6. `artifacts/08_prompt/字段映射.json`。
7. `artifacts/01_src/来源索引.csv`、`artifacts/01_src/原文摘录/`、`artifacts/02_scrub/脱敏底稿/`、`artifacts/03_survey/方向评估.csv`：只用于核对难点 `source_locator` 是否真实存在并与原文一致。

路径一律相对 `taskDir`。缺少上述任一必需输入时，`pass=false`，原因写 `INPUT_MISSING`，不得凭印象判定。

## 九项判据

| # | 判据 | 判定方式 | 必须引用的实际字段 | 不通过条件 |
|---|---|---|---|---|
| 1 | 难点策略覆盖 | 机器可判 | 05 `难点策略.json` 的 `declared_count_min/max`、`required_difficulty_types`、`actual_count`、`actual_type_coverage`、`pass`；`难点清单.json` 的 active D ID | 策略 `pass=false`；active 数量与 `actual_count` 不一致；非空条数阈值不满足；要求的类型未被 active 难点覆盖；同一 D ID 重复 |
| 2 | 证据与业务字段可追溯 | 机器可判 | active 难点的 `source_locator`、`business_field_keys`；04 全部 `must_judge=true` 的 `business_fields` | 任一 active 难点无真实材料位置；引用不存在的业务字段；任一必判字段未被 active 难点覆盖 |
| 3 | 送分占比 | 机器可判（条件适用） | 04 `judgment_class` 的逐字段计数；00 `freebie_ratio_max` 和 `extraction_status` | 门槛非 `null` 时，`freebie 字段数 ÷ must_judge 字段数 × 100` 超过门槛；门槛非 `null` 但 `must_judge` 字段数为 0；口径不是逐字段分类；门槛为 `null` 却当成失败或自行补比例 |
| 4 | 附件纠缠 | 人工确认 | 05 `附件清单.json` 的 `attachment_id`、`difficulty_ids`、字段；06 实际附件与快照 | 任一附件没有任何难点引用；逐份移除测试无法指出至少一个 D 的结论变化；未逐份核对 |
| 5 | 多阶段链路 | 机器可判 | 05 `关系图.json` 的 `stages`、`edges`、`input_refs`、`output_refs` | 少于两个存在依赖的阶段；后阶段不消费前阶段输出；引用悬空；仅把同一步骤改写成多个阶段 |
| 6 | 明细到汇总工作量 | 机器可判 | 04 parts 的 `role`、`grain`、`primary_key_fields`、`aggregation_of`；05 `关系图.json` | 没有 `detail` 与 `summary` 的可复核关系；汇总不能由明细复算；仅有格式重复 |
| 7 | 判断标准自推 | 人工确认 | 09 最终题面、04 `decision`、05 难点清单 | 题面直接给出该看哪列、先做什么、公式、筛法或最终选择；业务规则优先级本身可以写，操作步骤不可以写 |
| 8 | 无解/反例 | 人工确认 | 05 `关系图.json` 的 `branch_failures` 及对应 source | 无法从材料证明至少一个停止/继续/例外分支；反例没有输入证据；题面直接点破答案 |
| 9 | 关键数字唯一 | 机器可判 | 04 业务字段的 `unit/precision/tol`、parts 坐标；08 `字段映射.json`；05 附件字段口径 | 必判数值字段缺单位/精度/容差语义；同一量存在多个合法口径；题面字段无法定位到 04；跨附件口径不闭合 |

### 判定口径

- `machine`：按输入文件中的字段、条数、路径、引用关系和门槛值计算；证据格式为 `相对路径#字段/行/锚点`。
- `manual`：复核人逐条阅读后给出 `confirmed` 或 `pending`，附具体证据；不得把 `pending` 当作通过。
- `freebie_ratio_max=null` 时，判据 3 的 `status` 为 `not_applicable`，`blocking` 不包含 3，整题仍可 `pass=true`。
- 其它判据不得写 `not_applicable`；证据缺失一律 `fail`。
- 任一 `fail` 或 `pending` 使整题 `pass=false`。只有所有适用判据为 `pass/confirmed`、`blocking=[]` 且 `route=null` 时才可 `pass=true`。
- 不读取 11 的 rubric、13 的答卷或 14 的评分。

## 输出

必须输出两个文件：

- `artifacts/10_difficulty/诊断.json`：机器唯一真源。
- `artifacts/10_difficulty/诊断.md`：人读摘要，不重复放可解析 JSON；必须引用同一 `诊断.json` 的结论。

`诊断.json` 严格按以下结构：

```json
{
  "schema_version": 1,
  "pass": false,
  "route": "05|06|08|11|null",
  "criteria": [
    {
      "id": 1,
      "name": "难点策略覆盖",
      "mode": "machine|manual",
      "status": "pass|fail|confirmed|pending|not_applicable",
      "evidence": ["相对路径#字段/行/锚点"],
      "reason": "<可复核结论>",
      "upstream_blocker": null
    }
  ],
  "terminal_blockers": [],
  "blocking": [1],
  "repair_routes": [
    {
      "criterion": 1,
      "primary_owner": "05|06|08|11",
      "secondary_owners": [],
      "target": "相对路径",
      "locator": "字段/行/段落",
      "action": "<具体改什么>",
      "acceptance": "<重跑时如何确认>"
    }
  ]
}
```

规则：

1. `criteria` 恰好九项，ID 为 1 到 9；机器项 `mode=machine`，人工项 `mode=manual`。
2. `blocking` 按 ID 升序列出所有未通过和待人工确认的项；全部适用项通过时为 `[]`。
3. `repair_routes` 在 `blocking=[]` 时必须为空数组；否则每条非 terminal 阻断项恰有一条主路由，`primary_owner` 必须写清。
4. 上游 blocker 固定为对象 `{"node":"01|02|03|04|05|06|08|09|11","path":"<相对路径>","pointer":"<JSON Pointer/行/锚点>","reason":"<阻断原因>"}`；对应判据的 `upstream_blocker` 写同一对象，并同时追加到顶层 `terminal_blockers`。
5. 只有 `node=05|06|08|11` 且属于本节点可执行返修项的 blocker 才进入 `repair_routes`；`node=01|02|03|04|09` 是 terminal blocker，`route=null`，不得伪装成 05/06/08/11 的修改任务。
6. 顶层 `route` 在通过时为 `null`；存在可执行阻断时从主路由中按 `05 > 06 > 08 > 11` 的确定性优先级取第一个，保证同一诊断可复现；存在 terminal blocker 时 `pass=false`、`route=null`。
7. `诊断.json` 必须可解析，`pass` 必须是布尔值。

## 返修主责

| 判据 | 主责 | 次责 | 动作 | 验收 |
|---|---|---|---|---|
| 1 | 05 | 无 | 调整难点清单、类型、策略或合并重复难点 | 策略 pass，D ID 唯一且条数与类型可核对 |
| 2 | 05 | 无 | 补 active 难点的材料位置和业务字段映射 | 每个必判业务字段至少被一个 D 覆盖 |
| 3 | 05 | 无 | 在 05 汇总 04 的逐字段分类并核对比例；不得在 05 改写 04 分类 | 分子分母和分类均可复核；门槛 null 时 not_applicable |
| 4 | 06 | 05 | 06 修附件内容后回写快照；05 补 carrier 映射 | 每个附件都有 D 引用；移除测试有证据 |
| 5 | 05 | 06 | 修关系图或附件阶段输入/输出 | 至少两个真实依赖阶段，引用不悬空 |
| 6 | 05 | 06 | 修关系图、明细/汇总 part 映射或数据 | 汇总可用明细独立复算 |
| 7 | 08 | 无 | 删除指标名、步骤、公式和筛选提示，只保留业务规则与委托 | 新同事仍需自行判断指标与顺序 |
| 8 | 05 | 06 | 补失败分支、停止条件及附件证据 | 分支有材料来源，题面不点破 |
| 9 | 11 | 08 | 11 在 rubric 前完成字段-坐标-单位闭环；08 同步题面表达 | 每个关键数值只有一个合法判定口径 |

若 01/02/03 证据不可定位，或 04 本身缺失必判分类、单位、精度、容差、part 关系，10 必须将该问题记在对应判据的 `reason`、结构化 `upstream_blocker` 和 `terminal_blockers` 中，令 `route=null` 并停止返修链；不得让 05/06/08/11 猜或篡改上游。

## 最终回复

正文只简述九项结论和主路由；最后一行必须是单行合法 JSON：

```json
{"pass":false,"route":"05"}
```

通过时为 `{"pass":true,"route":null}`。该行必须与 `诊断.json` 顶层 `pass/route` 完全一致；不得只输出“通过/不通过”，不得在最后一行添加代码围栏、句号或其它文本。

## 禁止

- 不读取或泄露 11 的标答、13 的答卷、14 的评分。
- 不评价 `score_max`、`score_rule` 或 `any_of`，那是 14 的最终判定。
- 不把“难点条数多”当成难度通过的唯一理由。
- 不为凑条数复制、拆分同一难点。
- 不在本节点修改任何文件。
