# 15 全盘读卷（分卷与汇总）

## 任务

按业务完整性逐卷读一遍独立答卷，记录事实、判断过程、已做对项、自纠项、确定错误、遗漏、材料歧义和工具问题。读取范围严格取 `artifacts/14_score/汇总.json.run_ids`：默认只有 `C01`，最多为 `C01/C02`；不得漏读任何已登记卷，也不得凭空补出第三卷。rubric 只用于标注某条观察是否已由现有考点覆盖，不限制读卷范围，也不得据此跳过对答卷其他部分的业务复核。本节点为每卷写一份问题表和读卷记录，再写汇总；不改分、不改答卷或任何上游文件。

## 输入

1. `artifacts/12_freeze/frozen/项目门槛.json`、`artifacts/12_freeze/frozen/规范摘录.md`
2. `artifacts/12_freeze/frozen/交付规格.json`
3. `artifacts/12_freeze/frozen/字段映射.json`、`artifacts/12_freeze/frozen/字段映射差量.json`、`artifacts/12_freeze/frozen/题面.md`
4. `artifacts/12_freeze/frozen/rubric.json`、`artifacts/12_freeze/frozen/作答思路.md`
5. `artifacts/14_score/汇总.json`、`artifacts/14_score/补卷判定.json`，以及汇总 `run_ids` 对应的每卷 `artifacts/14_score/<runId>/评分.json`
6. 每卷 `artifacts/13_answer/<runId>/`：14 通过 judge `--copy-to` 原子归档后的被测模型交付物，是该卷读卷唯一答卷真源；不得改读外部题包的活 `output/`、历史作答副本或另一卷归档
7. `artifacts/12_freeze/frozen/model_input/题面.md`、`artifacts/12_freeze/frozen/model_input/A*`、`artifacts/12_freeze/frozen/附件清单.json`、`artifacts/12_freeze/frozen/附件事实快照.json`：核对题面输入附件与答卷引用
8. 每卷 `artifacts/13_answer/<runId>/运行记录.json` 和 `artifacts/13_answer/<runId>/进度断点.json`：只读归档副本，仅用于解释超时、截断、工具失败或未完成交付，不作为内容正确性依据

权威业务输入必须来自 12 冻结副本，并与 `冻结清单.json` 的 hash 一致；活目录文件只可用于生成冻结副本，不得在 15 另读一个版本。`汇总.json.runs[].answer_package` 只作为外部题包身份和审计定位，不作为答卷正文来源。

每卷开始时先核对：`run_ids` 无重复且只含允许卷号；该卷评分报告存在、`评分.json` 与 `汇总.json.runs[]` 的分数和 `run_id` 一致；归档目录存在且至少包含评分时确认的交付文件。C01 与 C02 是两个独立会话和独立题包，不得把 C02 的内容补进 C01，也不得用 C01 的解释替 C02 判定。首卷 invalid 时仍按归档证据读卷并如实记录缺口；若汇总已选择某卷，仍须完成全部登记卷的复核，并在汇总中将所选卷标为后续质检主证据。

字段语义分两类核对：

- 平台的 `platform_fields` 只用来核对投稿栏位，不能作为答卷业务表、列或坐标的定义。
- 题目的 `business_fields` 只从 04 读取；08 字段映射负责题面转写，09 只作无损差量核对。15 不从平台栏位反推业务字段。

## 读法

1. 先建立“rubric 已覆盖位置”索引，但它只用于回标覆盖关系，不用于限制阅读范围。
2. 打开答卷的全部文件、sheet、正文、值、公式和可见格式；逐项记录已做对、先错后自纠、确定错误、遗漏、材料歧义和工具问题。
3. 从最终题面、输入附件、04 业务字段和当期规范出发独立核对业务事实，再回到答卷找差异。
4. 运行记录和进度断点只用于解释超时、截断、工具失败或未完成交付；核对 `aborted` 原因与 `mismatched_files`，但不把运行成本或中止状态当作内容正确性。
5. 每条观察先在 `读卷记录.json` 留痕，再决定是否进入 `问题表.csv`；已做对、自纠和单纯优点不得伪装成问题，也不得省略。

## 检查维度

1. **时间线**：判断所需信息在业务时点是否已经可得，承诺、回执、审批与执行先后是否成立。
2. **对象对应**：金额、编号、主体、口径、动作是否挂到了错误对象上。
3. **字段语义**：实际内容是否符合 04 的 `business_field_key`、单位、精度、值域和 part 坐标。
4. **状态与动作**：未办、在办、已办、已批准等状态是否与证据一致。
5. **跨文件一致**：同一事实、数字或决定在不同交付物中是否同步。
6. **依赖与边界**：上游变更、资源上限、权限限制或禁止条件出现后，下游方案是否仍可执行。

另核对门槛中的 `task_types`、`industry_tree`、`occupation_tree`、`forbidden`、`deadlines`、`quality_gates`、`attachment_policy`。`null + extraction_status=not_applicable` 表示该条件不适用；`unparseable`/`conflict` 才表示规范不可用，不得把两者混为一谈。

## 输出

每卷固定输出到 `artifacts/15_review/<runId>/`，另写 `artifacts/15_review/汇总.json`。不得把两卷观察混在同一张分卷问题表里。

### `artifacts/15_review/<runId>/读卷记录.json`

必需，schema_version=1，至少包含：

```json
{
  "schema_version": 1,
  "run_id": "C01",
  "answer_package": "D:\\高经作答区\\<taskId>\\C01",
  "answer_files_checked": ["<实际答卷文件>"],
  "observations": [
    {
      "observation_id": "C01-O01",
      "kind": "correct|self_corrected|error|omission|ambiguity|tool_issue",
      "answer_path": "<文件#part/坐标>",
      "input_basis": "<冻结输入位置>",
      "actual": "<实际内容>",
      "expected_or_question": "<独立核对结果或待澄清问题>",
      "rubric_coverage": {"covered": true, "rubric_ids": ["R01"]},
      "requires_repair": false
    }
  ],
  "summary": {
    "correct": 0,
    "self_corrected": 0,
    "error": 0,
    "omission": 0,
    "ambiguity": 0,
    "tool_issue": 0
  }
}
```

`run_id` 必须与目录名、评分报告和汇总登记一致；`observation_id` 以 `<runId>-O` 开头且在本卷内唯一。`kind` 六类都必须按实际出现情况记录；没有某类时计数为 0，不得为了完整而编造。`rubric_coverage.covered=true` 时必须引用真实 rubric ID，覆盖只表示已有考点记录该位置，不表示该观察可从全盘读卷中省略。

### `artifacts/15_review/<runId>/问题表.csv`

只登记本卷 `error|omission|ambiguity|tool_issue` 且需要下一动作的观察；`correct|self_corrected` 只留在 JSON 记录，不得计入返修。UTF-8，表头固定为：

`问题ID,答卷位置,实际内容,输入依据,独立正确结果,业务影响,类别,是否属现有考点,考点ID,是否需返修,根因关联,下一动作,验收条件,主责节点,字段域,确定程度`

`问题ID` 必须带当前卷前缀，例如 `C01-P01`；`答卷位置` 只能指向本卷 `artifacts/13_answer/<runId>/`。`字段域` 只能为 `platform|business|not_applicable`。只有核的是投稿栏位时才写 `platform`，题目交付字段写 `business`，与字段无关的规则问题写 `not_applicable`。

### `artifacts/15_review/汇总.json`

`汇总.json` 至少含 `schema_version`、`run_ids`、`selected_run_id`、`runs[]`、`cross_run` 和 `summary`：

```json
{
  "schema_version": 1,
  "run_ids": ["C01"],
  "selected_run_id": "C01|null",
  "runs": [
    {
      "run_id": "C01",
      "valid": true,
      "record_path": "artifacts/15_review/C01/读卷记录.json",
      "issues_path": "artifacts/15_review/C01/问题表.csv",
      "observation_counts": {"correct": 0, "self_corrected": 0, "error": 0, "omission": 0, "ambiguity": 0, "tool_issue": 0},
      "issue_rows": 0,
      "needs_repair_rows": 0
    }
  ],
  "cross_run": {
    "shared_errors": [],
    "divergent_errors": [],
    "better_run": "C01|null",
    "comparison": "<逐卷差异说明或无补卷说明>"
  },
  "summary": "<是否发现阻断问题及所选卷证据概况>"
}
```

单卷时 `cross_run.shared_errors=[]`、`divergent_errors=[]`、`better_run=null`，并明确写“未补卷，无跨卷比较”。两卷时逐项比较共同错误、只在一卷出现的错误、所选卷是否相对证据更充分；该比较只用于质检解释，不得改写 14 已定的 `selected_run_id` 或分数。`汇总.json` 的 `run_ids` 必须与 14 完全一致，`selected_run_id` 必须原样继承；若 14 选择 `null`，15 仍读完全部登记卷并写 `selected_run_id=null`，不得自行改选。

## 路由

`根因关联` 只能引用 `04|05|06|08|09|11|12|13|14` 中一个或多个实际存在的当前上游；`主责节点` 必须唯一：

- 交付结构、业务字段、单位/精度/容差 → `04`
- 难点、附件业务字段登记 → `05`
- 附件事实、格式或内容 → `06`
- 题面转写、字段映射 → `08`
- 最终题面润色或映射差量 → `09`
- 考点、标答、rubric 或人工项 → `11`
- 冻结版本/隔离集合 → `12`
- 答卷内容 → `13`
- 既有评分结论 → `14`

不得把尚未运行的 15/16/17/18 作为根因。缺交付物只登记缺交，不推测缺失文件里可能出现的格式或数值问题。

## 硬要求

- `是否属现有考点` 只能填 `是` 或 `否`；`考点ID` 是独立受控列：填“是”时必须写成实际存在的 `Rxx`（多个用 `;` 分隔），填“否”时必须为空。16 会机器核对每个 R ID 存在；填“是”的行不进入待返修计数。
- 每条必须有可定位的答卷位置、输入依据、独立正确结果、下一动作和可复核的验收条件。
- 不修改历史分数，不输出新分数，不给 10/14 重做判定。
- 规范值为 `null + not_applicable` 时，不据此判错。
- 不把 `platform_fields` 与 `business_fields` 互相替代。
