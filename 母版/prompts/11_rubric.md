# 11 考点、标答与机器校验

## 任务

把 04 的交付结构、05 的稳定难点和 08 的最终题面转换成可执行 rubric、独立标准答案、B 索引、答案核验、易错点和作答思路。所有题目事实只能来自模型可见的 A 系列与最终题面；不得从示例题、行业惯例或平台栏位猜表名、列名、坐标、值或阈值。

## 输入与唯一真源

只读以下上游产物：

1. `artifacts/00_spec/项目门槛.json`：读取 `score_max`、`score_rule`、`any_of` 及其 `extraction_status`。它们是 14 的判定门槛，不是 rubric 总分；11 不得把任何门槛写进 item 判定。`score_max`、`score_rule` 必须已成功提取；可选门槛为 `null` 时只登记其不适用状态，不由 11 判题。
2. `artifacts/04_scope/交付规格.json`：`business_fields`、`deliverables/parts`、类型、单位、精度、容差、唯一键和 `editable_parameters` 的唯一结构真源。00 的 `platform_fields` 不参与题目、标答或 rubric。
3. `artifacts/05_evidence/难点清单.json`、`难点策略.json`、`附件清单.json`、`关系图.json`：D 编号、难点语义、材料位置和附件是唯一难点真源；CSV/MD 只作人读镜像。
4. `artifacts/06_build/附件事实快照.json`、`校验报告.json` 及 A 系列附件：标准答案只能依赖模型可见材料。
5. `artifacts/09_style/题面_最终.md`、`字段映射差量.json`：最终题面唯一真源，以及 09 对 08 映射的无损核对结论；`artifacts/08_prompt/题面.md`、`字段映射.json` 只作生成该最终题面的上游输入。
6. `字段映射差量.json` 必须 `pass=true` 且 `changes=[]`；任何字段、坐标、单位、精度或容差变化都不得由 09 自行吸收，必须停止并路由 08/04。

任一必需输入缺失、hash 不一致或字段悬空时，停止输出可评分 rubric，先给返修点，不得自行补字段。

## 一、rubric.json

契约固定 `meta.schema_version=3`、`meta.total=100`；这是 judge 的结构不变量，不是项目分数门槛。项目 `score_max` 与 `score_rule` 仍只由 14 比较。

```json
{
  "meta": {
    "schema_version": 3,
    "total": 100,
    "items": 12,
    "strategy": "fixed",
    "model": "deepseek-v4.1-flash/max",
    "gate": "artifacts/00_spec/项目门槛.json",
    "source_delivery_sha256": "<sha256>",
    "source_prompt_sha256": "<sha256>",
    "difficulties_sha256": "<sha256>"
  },
  "items": [
    {
      "id": "R01",
      "difficulty_id": "D01",
      "business_field_keys": ["BF01"],
      "score": 8,
      "kind": "cell",
      "where": {
        "file": "<04 deliverable.file>",
        "part": "<04 part_id>",
        "sheet": "<04 column.sheet>",
        "cell": "<实际单元格坐标>"
      },
      "expect": 123.45,
      "match_mode": "numeric",
      "unit": "<04 unit>",
      "precision": 0,
      "tol": 0.01,
      "basis": {
        "source_refs": ["<A 文件#定位>"],
        "answer_layers": ["fact", "calculation"],
        "difficulty_evidence": "<该 item 为什么能证明 D 已被考到>"
      }
    }
  ]
}
```

### item 规则

1. `id` 全表唯一；`difficulty_id` 必须是 05 active 的 `D01` 式稳定 ID，不得写 M ID、空串或只写“综合”。
2. 一条只判一个事实、一个计算结论或一个明确决定。一个单元格、一个 row/summary 字段、一个受控文本区段分别成条。
3. `score` 为正数，所有 item 合计严格等于 `meta.total`；分值是 rubric 内部权重，不得从 `score_max` 反推。
4. `kind` 只能是 `cell|summary|row|section|derived|manual`。每个 item 必须有非空 `business_field_keys`，只能引用 04 已定义的 `BFxx`；每个 key 必须在 `basis` 写明源材料、答案核验层和该难点证据。跨字段计算可列多个 key。
5. `match_mode` 必须显式，不得省略。合法值：
   - `numeric`：数值比较；必须有 `unit` 和非空 `tol`，`tol=0` 也必须显式写。
   - `boolean`：布尔比较；`expect` 只能是 JSON 布尔值。
   - `exact`：文本归一后完全相等；不得用包含关系。
   - `contains_all`：`expect` 为非空字符串数组，所有短语都必须在判定区出现。
   - `contains_any`：`expect` 为非空字符串数组，至少一个短语出现。
   - `regex`：`expect` 为合法正则表达式。
   - `derived_rule`：仅 `kind=derived`，由独立复算脚本返回布尔结果。
   - `manual_review`：仅 `kind=manual`，由人工复核填写结论。
6. 文本判定不得使用“全文双向子串”。`exact` 用归一后相等；需要包含匹配时必须显式使用 `contains_all`/`contains_any`，并限定到 item 的坐标或受控区段。
7. `numeric` 的 `unit`、`precision`、`tol` 必须与 04 的同一 business field/part 一致；`precision` 必须是显式非负整数，0 也必须写；不得猜单位、精度或容差。非数值 item 不得伪造单位或 precision。

### kind 与格式

| kind | 允许的交付格式 | where 必填 | 判定 |
|---|---|---|---|
| `cell` | 仅 `.xlsx` | `file`、`part`、`sheet`、`cell` | 读取固定单元格 |
| `summary` | 仅 `.xlsx` | `file`、`part`、`sheet`、`key`、`column`/`col` | 按键找摘要行 |
| `row` | 仅 `.xlsx` | `file`、`part`、`sheet`、`key`、`column`/`col` | 按键找明细行 |
| `section` | 仅 `.md`、`.txt` | `file`、`start_anchor`、`end_anchor` | 只比较两锚点之间；锚点不唯一、顺序颠倒或跨节即为 invalid |
| `derived` | 任意由 04 声明的格式 | `file`、`rule_id`、非空 `derived_from`（BF/A/P 稳定引用） | 独立规则复算；`artifacts/11_rubric/rules.py` 的 `check(None)` 必须返回该 R ID 的 `[bool, note]` |
| `manual` | 任意由 04 声明的格式 | `file`、`locator`、`review_question` | rubric 明确标为人工项；同目录 `人工复核.json` 记录封闭结论和证据文件；judge 核验 hash 后返回 TRUE/FALSE，缺结论或 hash 不符时 fail closed |

- `.docx`、`.pdf` 交付物不得使用 `cell/summary/row/section`；其考点使用 `derived` 或 `manual`，或回到 04 增加可机判的 xlsx 交付，不能假装 judge 能读结构化坐标。
- `.csv`、`.json` 和未知结构化格式使用 `derived` 或 `manual`；不得套用 xlsx 坐标。
- `manual` 不是自动通过项。它必须写明谁看、看哪个定位、回答什么封闭问题、允许哪些结论。带 manual item 时，11 还必须生成 `人工复核.json` 的待填模板并要求独立复核人完成；未取得完整复核结论时 11 不得 `pass=true`，14 必须 fail closed。
- `derived_rule` 必须要求 `where.derived_from` 为非空字符串数组，引用 A/附件、BF 或 04 part 的稳定 ID；不能在复算脚本里硬编码答案。
- `derived` 不得由生成 rubric 的同一段“看一眼再算”替代。`rules.py` 必须能从 A 系列和答卷独立计算，且不得导入 11 的答案值来硬编码。

### 坐标纪律

1. 先从 04 建立允许坐标清单：`deliverable_id/file/format/part_id/kind/sheet/columns/business_field_keys`；每条的 `where.file`、`part`、`sheet`、`column`、`cell`、锚点都必须能在 04 或 08 字段映射中定位。
2. `business_field_key` 唯一标识业务字段，不是平台投稿栏位，也不是 Excel 列字母。item 的 `basis` 要能回指该 key。
3. `section` 的 `start_anchor`/`end_anchor` 必须来自最终题面要求或 04 的 section part；不得使用页码、段落序号或样式内部 ID。`end_anchor` 必须位于 `start_anchor` 之后。
4. 同一事实跨多个交付物时分别建 item 并标明勾稽，不用一个 item 代替跨文件核对。
5. 跨格式坐标、单位和容差不一致时，先回 04/08 修，不在 11 猜。

## 二、难点覆盖

每题必须输出 `artifacts/11_rubric/难点覆盖.json`：

```json
{
  "schema_version": 1,
  "source_difficulties_sha256": "<sha256>",
  "difficulty_to_rubric": [
    {
      "difficulty_id": "D01",
      "rubric_ids": ["R01", "R02"],
      "total_score": 16,
      "coverage_status": "covered"
    }
  ],
  "covered_difficulties": ["D01"],
  "uncovered_difficulties": [],
  "withdrawn_difficulties": [
    {"difficulty_id": "D03", "reason": "<05 原始 withdrawn 理由>"}
  ],
  "complete": true
}
```

- 05 中所有 `status=active` 的 D 都必须至少映射一个 rubric item；`uncovered_difficulties` 必须为空，`complete=true`。
- `withdrawn` 的 D 保留在索引并引用 05 的理由，不得悄悄删除或复用其 ID。
- `difficulty_to_rubric` 与 rubric items 双向一致：不得出现悬空 R ID，也不得让某 item 的 `difficulty_id` 不在映射中。
- 难点→考点映射只由本节点 `难点覆盖.json` 产生：11 不回写 05，05 不设“对应考点”列或字段，10 只读 05 清单与策略。

## 三、校验结论.json

这是 16 唯一消费的 11 机器结论，固定路径 `artifacts/11_rubric/校验结论.json`：

```json
{
  "schema_version": 1,
  "pass": false,
  "required_check_ids": [
    "rubric_schema", "score_total", "difficulty_refs", "format_kind",
    "coordinates", "match_contract", "numeric_contract", "counterfactual",
    "independent_recompute", "answer_key", "derived_rules", "manual_items",
    "upstream_hashes", "score_gate_isolation"
  ],
  "checks": [
    {
      "check_id": "rubric_schema",
      "required": true,
      "status": "pass|fail|not_applicable",
      "detail": "<实际检查结果>",
      "evidence": ["rubric.json#/meta/schema_version"]
    }
  ],
  "issues": [
    {
      "issue_id": "I01",
      "severity": "fatal|major|minor",
      "check_id": "rubric_schema",
      "message": "<问题>",
      "owner_node": "04|05|06|08|09|11",
      "target": "<相对路径/JSON Pointer>",
      "action": "<返修动作>"
    }
  ],
  "summary": {
    "rubric_items": 0,
    "rubric_points": 0,
    "machine_items": 0,
    "derived_items": 0,
    "manual_items": 0,
    "difficulties": 0,
    "covered_difficulties": 0
  },
  "hashes": {
    "rubric_sha256": "<sha256>",
    "difficulty_coverage_sha256": "<sha256>",
    "b_index_sha256": "<sha256>",
    "answer_check_sha256": "<sha256>",
    "manual_review_sha256": "<sha256或null>"
  },
  "upstream_hashes": [
    {"path": "artifacts/04_scope/交付规格.json", "sha256": "<sha256>"},
    {"path": "artifacts/05_evidence/难点清单.json", "sha256": "<sha256>"},
    {"path": "artifacts/06_build/附件事实快照.json", "sha256": "<sha256>"},
    {"path": "artifacts/08_prompt/字段映射.json", "sha256": "<sha256>"},
    {"path": "artifacts/09_style/题面_最终.md", "sha256": "<sha256>"},
    {"path": "artifacts/09_style/字段映射差量.json", "sha256": "<sha256>"}
  ]
}
```

必需 checks 覆盖：

1. `rubric_schema`：schema v3、字段完整、ID 唯一、pass 可复算。
2. `score_total`：逐项合计等于 100 且 `meta.items` 等于实际条数。
3. `difficulty_refs`：每个 item 的 D ID 存在于 05，覆盖文件完整。
4. `format_kind`：cell/summary/row 只出现在 xlsx；docx/pdf 只出现 derived/manual；section 只出现在 md/txt。
5. `coordinates`：所有 where 可回到 04/08，section 双锚点可定位且不唯一即失败。
6. `match_contract`：match_mode 与 expect 类型匹配；文本无隐式双向子串。
7. `numeric_contract`：数值项 unit/tol 与 04 一致。
8. `counterfactual`：04 的 editable_parameters 非空时逐参数给出可复算结果；为空时 status 为 `not_applicable` 且引用 04 空数组，不自造参数。
9. `independent_recompute`：每个关键数值至少有一种非同脚本复算依据，不能把换语言/换脚本当独立核对。
10. `answer_key`：B 索引完整、文件可打开、答案与题面/A 材料一致；模型可见范围内无私有材料。
11. `derived_rules`：每个 derived item 的 `rule_id` 在 `rules.py` 中存在并能对 B 答案返回布尔值；无 derived 时为 `not_applicable`。
12. `manual_items`：每个 manual item 有封闭问题、locator，并与 `人工复核.json` 的 R ID 一一对应；没有 manual item 时为 `not_applicable`。有 manual item 但复核未完成时 status=`fail`，不得伪造 pass。
13. `upstream_hashes`：`upstream_hashes` 必须恰好包含下列六项且无重复：04 `交付规格.json`、05 `难点清单.json`、06 `附件事实快照.json`、08 `字段映射.json`、09 `题面_最终.md`、09 `字段映射差量.json`；每项 SHA-256 必须从当前文件重算并一致。缺项、重复或多余均为 fail。
14. `score_gate_isolation`：rubric 未嵌入 `score_max`、`score_rule` 或 `any_of` 判定。

`required_check_ids` 必须与上述 14 个 ID 集合完全相等；`checks` 中每个 ID 必须恰好出现一次，不得缺项或重复。顶层 `pass=true` 的条件：所有固定 required check 均为 `pass`（允许的 `not_applicable` 仅限没有 manual/derived item 的 `manual_items`/`derived_rules`，且必须带实际依据）；`issues` 中没有 `fatal|major`。`minor` 可以保留但必须列出。`pass` 不是由模型口头声明，必须由上述 checks 汇总得出。

### `人工复核.json`

只要 rubric 含 `kind=manual`，就必须输出并由独立复核人完成 `artifacts/11_rubric/人工复核.json`；11 可以生成 `status=pending` 模板，但不得替复核人填写结论：

```json
{
  "schema_version": 1,
  "rubric_sha256": "<rubric.json实际sha256>",
  "reviewer": "<独立复核人标识>",
  "completed_at": "<带时区ISO-8601>",
  "items": [
    {
      "rubric_id": "R20",
      "status": "pass|fail",
      "answer": "<对封闭问题的结论>",
      "evidence": "<定位和实际依据>",
      "artifact_path": "<答卷目录内相对路径>",
      "artifact_sha256": "<被复核文件sha256>"
    }
  ]
}
```

- `items` 必须与 rubric 中全部 manual item 一一对应，不能多、少、重复或出现非 manual R ID。
- `rubric_sha256` 必须与 rubric 实际文件一致；每个 `artifact_path` 必须是答卷目录内的相对路径，`artifact_sha256` 必须与该文件实际摘要一致；`reviewer`、`completed_at` 不得为空。
- 任何一项 `pending`、缺失或 hash 不一致时，`manual_items` check 为 fail。14 只读取 12 冻结后的这份文件，取得 `pass/fail` 后按对应 item 分值计分；仍必须 fail closed 处理分辨率不足或无法定位的证据。

## 四、标准答案、B 索引与核验

从最终题面与 A 系列独立作答。每个 04 交付文件都要有对应 B 文件，格式一致，不能只给一份汇总答案。

`B索引.json` 固定形状：

```json
{
  "schema_version": 1,
  "source_delivery_sha256": "<sha256>",
  "entries": [
    {
      "deliverable_id": "OUT01",
      "deliverable_file": "<04 file>",
      "format": "xlsx|docx|pdf|md|txt|csv|json",
      "b_file": "<B 相对路径>",
      "sha256": "<实际 sha256>",
      "bytes": 1234,
      "part_ids": ["P01"],
      "complete": true
    }
  ],
  "missing_deliverables": []
}
```

`答案核验.md` 逐层记录：

1. 事实取值：来源文件、part/字段、记录定位、取值。
2. 计算与筛选：公式或规则、范围、单位、精度、容差。
3. 业务决定：结论、允许分支、不能继续的条件。
4. 执行与交接：动作、责任、时点、跨文件勾稽。

每个 rubric item 至少回指一层，并写出实际值或判定短语。

## 五、反事实

1. 只从 04 的 `editable_parameters` 选参数，复制到 `artifacts/11_rubric/_counterfactual_work/` 后修改；不得修改 A 系列或任何上游。
2. 逐个参数记录：参数 ID、原值、变更值、受影响 R ID、预期新值/新结论、实际复算和是否一致。
3. `editable_parameters=[]` 时 `counterfactual` check 为 `not_applicable`，依据引用 04 空数组；不得自造参数。
4. 清理时目标必须解析为 `taskDir/artifacts/11_rubric/_counterfactual_work/`，不得递归删除其它目录。

## 六、作答思路与易错点

`作答思路.md` 按 05 的 active D 逐条一节，标题为 `### D01`，不得使用 M ID。每节写：

- 在哪一步发现：材料、part/字段/行段和可回指定位。
- 怎么处理：筛选、计算、勾稽或决定的顺序与条件。
- 做错会得到什么：具体错值或错误结论，以及影响的交付坐标。

`易错点.md` 按 D ID 排列，每条至少含错误做法、触发条件、错误结果、正确核对路径、对应 R ID。它只作人工索引，不另计分。

## 输出

必须输出：

- `artifacts/11_rubric/rubric.json`
- `artifacts/11_rubric/难点覆盖.json`
- `artifacts/11_rubric/校验结论.json`
- `artifacts/11_rubric/人工复核.json`：仅当 rubric 存在 manual item；须由独立复核人完成
- `artifacts/11_rubric/B索引.json`
- `artifacts/11_rubric/答案核验.md`
- `artifacts/11_rubric/作答思路.md`
- `artifacts/11_rubric/易错点.md`
- `artifacts/11_rubric/B*`：按 04 交付格式生成的完整标答
- 若存在 derived item：`artifacts/11_rubric/rules.py`，提供 `check(None)`，返回 `{rubric_id: [bool, note]}`；脚本从 `ANSWER_INPUTS` 读取 A 系列、从 `ANSWER_OUTPUT` 读取答卷，不得把生产时的答案硬编码进脚本

## 硬要求

- 不读取 platform_fields 来生成题目、坐标或评分项；平台栏目只在 18 处理。
- 不从示例题复制行业、平台、表名、列名、单位、阈值或答案。
- 不把 `score_max`、`score_rule`、`any_of` 写进 rubric 判定；rubric 只提供逐项事实。
- 不用全文双向子串；文本匹配方式必须显式且可复现。
- 不用 `summary/row/cell` 伪造 docx/pdf 坐标；不能用自动判定掩盖 manual/derived。
- `required_check_ids`、checks 和 `upstream_hashes` 必须由机器重算并逐项唯一，不得以“已检查”文字代替。
- `B索引.json` 的 `deliverable_id` 必须使用 04 的 `OUTxx` 键，并与 08 字段映射逐项一致。
- 不修改 A 系列、04、05、06、08、09 或任何上游文件。
