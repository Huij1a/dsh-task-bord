# 00 项目规范提取（第 0 节点 / 强制前置）

## 任务

从 `args.specPath` 指向的当期项目规范中提取可机读的项目门槛，产出：

- `artifacts/00_spec/项目门槛.json`
- `artifacts/00_spec/规范摘录.md`

本节点是整条流水线的第 0 个节点和强制前置。没有完成本节点、或本节点判定为不完整时，01 及之后任何节点都不得启动。

模型条件固定为 `deepseek-v4.1-flash`，推理等级固定为 `max`。不得从规范、行业名称或下游提示词改写模型条件。

## 启动参数

工作流启动时必须同时传入：

- `taskDir`：当前题目目录。
- `specPath`：当期项目规范的绝对路径，或相对于 `taskDir` 的路径。
- `industry`：当期要求出题的行业；必须是规范中明确出现的行业名称或行业树节点。

以下情况立即停止，不得猜测，也不得写“已完成”：

1. 没有 `specPath`、路径为空、路径不存在或不是文件/目录。
2. 没有 `industry` 或行业为空。
3. `specPath` 是文件但扩展名不是 `.md`、`.docx`、`.pdf`。
4. 目录递归读取后没有任何可读的 `.md`、`.docx`、`.pdf` 文件。
5. 规范中找不到可核对的当期行业，或规范给出非空行业树而 `industry` 不属于其中。

停止时只在回复中写明缺失项、实际读取路径和错误原因；不要生成半成品门槛，不要用示例行业、示例字段或示例分数补齐。

## 读取范围与方式

1. 只读取 `specPath` 指向的文件或目录，不读取工作区里其他“类似规范”，不修改任何源文件。
2. `specPath` 为目录时递归读取其中的 `.md`、`.docx`、`.pdf`；扩展名大小写不敏感。忽略隐藏临时文件，但要在规范摘录中列出被忽略的非规范文件。
3. Markdown 用文本读取工具读取。
4. DOCX 使用现有 `office-docx` 技能，或使用可用的 Python 文档库读取。
5. PDF 使用现有 `office`/PDF 读取技能，或使用可用的 Python PDF 库读取；不得只凭文件名、目录标题或搜索摘要提取。
6. 保留每个文件的相对路径。若规范有多个文件，先全部读完，再合并提取。
7. 多份规范相互冲突时，不按“更常见”“更严格”或样例猜一个值；将该键填 `null`，`extraction_status` 标为 `conflict`，并在 `规范摘录.md` 记录冲突文件、引文和位置，交回要求补充规范。

## 两种字段不得混用

- `platform_fields` 只表示**投稿平台栏位**：平台要求填写的名称、顺序、是否必填、取值类型、枚举及来源、规范原文引用。它不是题目的业务表或业务列。
- `business_fields` 由 04 在 `artifacts/04_scope/交付规格.json` 中根据题目本身的交付物定义。00_spec 不输出、不推断、不从 `platform_fields` 复制业务字段。
- 平台栏位不能成为题面业务字段、附件字段或评分坐标的上游；业务字段也不能冒充平台投稿栏位。

## 项目门槛.json

必须输出严格 JSON，至少包含下列键。除 `score_max`、`score_rule` 和 `industry` 外，规范没有写明的项填 `null`，不能凭经验补值，不能用示例值顶替。

```json
{
  "project": null,
  "industry": null,
  "score_max": null,
  "score_rule": null,
  "any_of": null,
  "freebie_ratio_max": null,
  "platform_fields": null,
  "task_types": null,
  "industry_tree": null,
  "occupation_tree": null,
  "forbidden": null,
  "deadlines": null,
  "quality_gates": null,
  "attachment_policy": null,
  "history_refs": null,
  "source": [],
  "extraction_status": {}
}
```

`source` 每条记录除唯一 `source_id`、`key`、真实 `file`、逐字 `quote`、`locator` 外，可含 `normalized_value` 和 `derivation`。`quote` 只能复制原文；单位换算、比较符映射和结构归一化写入 `normalized_value`/`derivation`，不得混入引文。

以上值只示 JSON 形状，不是默认值。`score_max`、`score_rule` 是评分链的必需门槛：规范必须给出可无歧义解析的值；任一无法提取时，第 0 节点失败，不得用 `null` 生成可继续的门槛文件。

`any_of`、`freebie_ratio_max` 是可选门槛：规范未写时值为 `null`，语义是“该条件不适用、不参与判定”，不是“门槛缺失”。下游 10、14、16 必须按 `not_applicable` 处理。规范写了但无法解析或来源冲突时，`extraction_status` 必须是 `unparseable` 或 `conflict`，第 0 节点失败，不能把错误吞成 `null`。

### 字段约定

- `project`：规范明确写出的项目名称；没有写就 `null`。
- `industry`：规范明确写出的当期行业名称，必须与 `args.industry` 对应；不能从字段或样例反推。
- `score_max`：规范明确给出的有限数值分数门槛；不是分数总分的默认值，必须是 JSON 有限数字。
- `score_rule`：分数比较运算符。规范用明确比较语义的完整句子时，可映射为 `<=`、`<`、`>=`、`>`、`==`；原文放 `source.quote`，映射依据放该来源的 `normalized_value`/`derivation`。语义含糊或存在多种解释时填 `null` 并判本节点失败。
- `any_of`：规范明确写出的任一满足条件。非 `null` 时必须是对象数组，每项固定包含 `metric`、`op`、`value`：
  - `metric` 只能使用 14/judge 已实现的指标键：`score`、`total`、`true`、`false`、`missing`、`unjudged`、`error`、`minutes`、`rounds`。其中 `minutes`/`rounds` 分别取运行记录的自然作答分钟数和自然对话轮数，其余取评分计数；不得把规范原文中的任意名称直接当指标键。只有原文语义和单位都能无歧义映射到上述键时才做归一化；无法无歧义映射时整个 `any_of` 填 `null`，标 `unparseable` 并失败，禁止猜指标。
  - `op` 按 `score_rule` 的同一规则从原文明确语义映射。
  - `value` 必须与上述规范键的单位一致；原文以小时等其它单位表达时，先按原文明确的比例换算为 `minutes`。`source.quote` 只留原句，换算比例、算式和归一化结果写入 `source.normalized_value`/`source.derivation`，不得猜测精度。
  - 规范没有写任一条件时整个字段为 `null`，`extraction_status.any_of` 为 `not_applicable`。
- `freebie_ratio_max`：规范明确给出的送分/基础分占比上限，必须是非负有限数值。百分数保存百分号前的数值，不转换成小数；规范未写就 `null` 且状态为 `not_applicable`。
- `platform_fields`：规范明确列出的投稿平台栏位，保持规范顺序。非 `null` 时必须是数组，每项至少含：
  - `field_id`：本规范内稳定且唯一的 `PF01`、`PF02`…；
  - `name`：规范原文栏位名称；
  - `order`：从 1 开始的正整数；
  - `required`：仅当规范明确必填/选填时为布尔值，无法判断时为 `null`；
  - `value_type`：`text|number|date|datetime|boolean|enum|file|url|other`，规范未说明时为 `null`；
  - `enum_values`：枚举值数组；非枚举或未列出时为 `null`；
  - `enum_source`：枚举来源的规范文件、表名、章节或 `null`；
  - `value_rule`：规范原文的格式/长度/校验规则或 `null`；
  - `source_id`：指向 `source` 中同一栏位原文记录的 `source_id`。
- `task_types`：规范明确列出的题型集合，保持原文；没有写就 `null`。
- `industry_tree`：规范明确给出的行业层级。非 `null` 时统一为 `{"roots":[{"name":"<规范原文名称>","children":[...]}]}`；每个节点至少含 `name` 和 `children`，深层继续递归，只保留规范中出现的节点，不补全、不推测同级行业。无法可靠结构化时填 `null`，标 `unparseable` 并在摘录中保留原表。
- `occupation_tree`：规范明确给出的职业/岗位层级，或明确指向其来源文件。值为 `null`，或为：
  `{"source_file":"<实际规范文件相对路径>","source_locator":"<页/表/节>","roots":[{"name":"<原文名称>","children":[...]}]}`。
  `roots` 可结构化时不得省略；规范只给出外部来源文件路径时，`source_file` 和 `source_locator` 必填，`roots` 可为 `null`，并记录该来源文件可读路径。18 只能从本树或其 `source_file` 选择 L1/L2，不得自造。
- `forbidden`：规范明确禁止的事项，一条一项；没有写就 `null`。
- `deadlines`：规范中全部可适用期限/时点的数组，不是单个总截止。每项至少含 `deadline_id`（`DL01`…）、`label`（规范原文的阶段或用途名称）、`kind`（能在原文明确对应时取 `submission|qa|repair|stage_final|other`，否则为 `other`）、`raw_value`（规范原文表达）、`normalized_value`（仅在有明确时区和换算依据时填写，否则 `null`）、`timezone`（原文明确时填写，否则 `null`）、`source_id`。规范没有写任何期限时为 `null`，不得合成总截止。
- `quality_gates`：规范明确的质量要求数组；每项至少含 `gate_id`（`QG01`…）、`name`、`rule`、`applies_to`（只取 `03|04|05|06|16|17|18`）、`source_id`。没有质量要求时为 `null`。`rule` 中的阈值只能是规范原文给出的值，不得补默认值。
- `attachment_policy`：规范明确的附件约束，至少可含 `allowed_formats`、`max_bytes`、`max_count`、`naming_rule`、`rule`；未声明的子项为 `null`，整个键未声明时为 `null`。不得写死大小或格式。
- `history_refs`：规范明确要求参考的历史题/样例题路径数组；没有写就 `null`。不得扫描工作区自行补充。
- `source`：来源审计数组，不是门槛值的替代品。每条记录必须含唯一 `source_id`、`key`、真实 `file`、逐字 `quote`；定位信息放 `locator`。同一门槛可有多条来源。
- `extraction_status`：每个逻辑键的提取状态映射。必须覆盖 `project`、`industry`、`score_max`、`score_rule`、`any_of`、`freebie_ratio_max`、`platform_fields`、`task_types`、`industry_tree`、`occupation_tree`、`forbidden`、`deadlines`、`quality_gates`、`attachment_policy`、`history_refs`，不得少键或多出额外键。值为 `extracted|not_applicable|unparseable|conflict`：
  - `extracted`：值非 `null` 且来源可定位；
  - `not_applicable`：规范确实未写，值必须严格为 JSON `null`，摘录写明“规范未写”；
  - `unparseable`：规范写了但无法无歧义解析，本节点失败；
  - `conflict`：多个规范来源冲突，本节点失败。
  `score_max`、`score_rule`、`industry` 只能为 `extracted`，否则失败。`any_of` 只允许 `null + not_applicable` 或非空数组 + `extracted`；空数组 `[]` 永远非法。`platform_fields` 只允许 `null + not_applicable` 或非空数组 + `extracted`，空数组 `[]` 不算“未声明”，应写 `null`。`unparseable`/`conflict` 时对应逻辑键的值必须严格为 JSON `null`，不能保留候选值；已读到的原文候选、冲突内容和定位只写入 `source`/`规范摘录.md`。这两种状态不得被下游当作 NA。

### 来源完整性

所有非 `null` 键至少各有一条 `source` 记录的 `key` 与之完全相同，且 `source_id` 可被引用。`platform_fields` 的每一项还必须通过自己的 `source_id` 指回原文；不能只给整个数组一条笼统来源。`unparseable`/`conflict` 状态也必须尽可能保留已读取到的真实文件、原文和定位，供审计；`not_applicable` 不要求 `source`。

`source.file` 必须是本次实际读取的规范文件，不能写“项目规范”“某文件”；`source.quote` 必须从该文件原文逐字摘录，不能改写、概括成同义句或用省略号拼接两个位置。无法原样定位的内容宁可不提取，相应门槛保持 `null` 并标 `unparseable`。

`any_of` 的每个条件由同一 `any_of` 原文来源共同支持；若条件分散在多段原文，分别增加 `source` 记录。`source` 只用于审计，不参与下游计算。

## 规范摘录.md

必须写成可复核的摘录，至少包含：

1. 本次实际读取的 `specPath`、文件数量、每个文件的相对路径和格式。
2. 本次选定的 `args.industry` 以及它在 `industry_tree` 中的路径；树或行业缺失时说明原因。
3. 一张门槛表：顶层键、提取值、提取状态、原文来源文件、原文引文、定位、缺失/冲突说明。
4. 每个 `null` 的原因：规范未写（`not_applicable`）、无法读取或结构化（`unparseable`）或多个来源冲突（`conflict`）。
5. `platform_fields` 的原表抄录及每个栏位的 `field_id`/`source_id`；没有平台字段时写“规范未声明平台字段”。
6. 被忽略的文件清单；没有则写“无”。
7. 模型条件固定为 `deepseek-v4.1-flash/max`，并注明该值不是从项目规范推断。

摘录中每个非空值都要能回到 `source`；不能只写“见规范”。

## 完成判定

只有同时满足以下条件才算完成：

- 两件产物都存在且不是空文件。
- `项目门槛.json` 可被标准 JSON 解析器解析。
- 所有规定顶层键都存在；未写项是 `null`，不是省略或空字符串冒充。
- `extraction_status` 覆盖全部逻辑键且无额外键；`null` 只能对应 `not_applicable|unparseable|conflict`，非 `null` 只能对应 `extracted`，状态与值必须严格成对。
- `score_max`、`score_rule`、`industry` 非 `null` 且状态为 `extracted`。
- 任何 `unparseable` 或 `conflict` 状态都使本节点失败。
- 每个非 `null` 键都有对应的真实 `source.file + quote`；每个平台栏位都有独立 `source_id`。
- `规范摘录.md` 中的引文与 `source.quote` 一致。
- 没有修改规范目录中的任何文件。
- 没有使用具体期次、行业样例、平台字段样例或示例分数作为默认值。

失败时不要伪造通过结果；直接报告第 0 节点失败及需要补充的规范内容。
