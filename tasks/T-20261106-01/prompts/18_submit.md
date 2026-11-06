# 18 提交准备

## 任务

把本版题包映射为当期投稿平台栏位，并记录真实状态。字段集合、顺序、必填性、类型、枚举和取值规则来自 17 `字段映射草案.json`（其元数据逐字来自 `12_freeze/frozen/项目门槛.json`），18 只回填取值与 NA，不在本提示词里预设任何平台字段。18 只写 `artifacts/18_submit/`，不改题包、题面、rubric、评分或上游结论。

## 两种字段

- `platform_fields`：投稿平台要求填写的栏位，只来自 00。17 只产同 schema 的元数据草案，18 在草案基线上回填最终值，是最终 `字段映射.json` 的唯一生产者。
- `business_fields`：题目交付物的业务表、列、坐标，只由 04 定义。18 可引用它在题包中的交付文件，但不得把业务字段自动复制成平台字段。

## 必读输入

1. `artifacts/12_freeze/frozen/项目门槛.json`、`artifacts/12_freeze/frozen/规范摘录.md`
2. `artifacts/12_freeze/frozen/交付规格.json`
3. `artifacts/12_freeze/frozen/题面.md`
4. `artifacts/12_freeze/frozen/rubric.json`、`artifacts/12_freeze/frozen/作答思路.md`、`artifacts/12_freeze/frozen/B索引.json`、`artifacts/12_freeze/frozen/B*`、`artifacts/12_freeze/frozen/难点覆盖.json`
5. `artifacts/12_freeze/冻结清单.json`
6. `artifacts/14_score/汇总.json`、`artifacts/14_score/补卷判定.json`、`artifacts/14_score/<runId>/评分.json`、`artifacts/15_review/汇总.json`、`artifacts/15_review/<runId>/问题表.csv`、`artifacts/16_qc/结论.json`
7. `artifacts/17_pack/核对.json`、`artifacts/17_pack/字段映射草案.json`、三个 zip 的实际成员清单
8. `args.industry`

00/04/09/11 的权威内容只从 12 冻结副本读取，并逐项核对 `冻结清单.json` 的 bytes/sha256；live 目录不得成为最终映射来源。17 `核对.json` 必须同时 `pass=true` 且 `source_hash_check="pass"`。只引用而不重判 14/15/16/17。14 `汇总.json.pass`、16 `结论.json.pass`、17 `核对.json.pass` 任一不为布尔 `true` 时不得宣称可提交。17 草案的字段集合、顺序、元数据必须与冻结门槛 `platform_fields` 完全一致，作为 `mapping_matches_draft` 的基线。

## 一、平台栏位契约

`platform_fields` 只有两种合法状态：

- `null` 且 `extraction_status.platform_fields="not_applicable"`：规范未声明投稿平台栏位；输出空 `fields`，`platform_fields_applicable=false`。
- 非空数组且状态为 `extracted`：按数组原顺序逐项映射，不重排、不增删、不合并。
- 空数组 `[]`、状态 `unparseable|conflict`、值/状态组合不一致：全部 `invalid`，`platform_contract_valid=false`，`pass=false`，不得降级成“不适用”。

字段集合/顺序/元数据以 17 草案为基线：18 只回填 `value/status/na_basis/value_source/constraint_checks/note`，不得重排、增删，也不得改 `field_id/name/order/required/value_type/enum_values/enum_source/value_rule/source_id`；草案与 00 门槛任一字段不一致时 `field_count_match=false`、`order_preserved=false`、`pass=false`。

每项必须同时具备 00 已定义的 `field_id`、`name`、`order`、`required`、`value_type`、`enum_values`、`enum_source`、`value_rule`、`source_id`。另须满足：

- `field_id` 唯一；`order` 从 1 连续递增并与数组位置一致。
- `required` 必须是布尔值；`null` 表示规范没有说明是否必填，映射项状态必须为 `invalid`，不得猜选填或必填。
- `source_id` 必须存在于门槛 `source`，且该来源 `key="platform_fields"`、原文可逐字复核。
- `value_type` 只允许 `text|number|date|datetime|boolean|enum|file|url|other`。

## 二、取值来源

先依据栏位自己的 `name`、`value_rule`、`enum_source` 和规范原文判断它要什么，再选择实际存在的内容。不得按本提示词或示例硬编码栏位名称。

可使用的语义来源：

- 题面正文：冻结最终题面及其包内副本。
- 输入附件：`仅模型输入.zip` 中的 A 系列。
- 标准答案文字或附件：11 的 `B索引.json` 与 B 文件。
- 作答思路：必须取 `artifacts/12_freeze/frozen/作答思路.md`。
- 考点：`rubric.json`、`难点覆盖.json`。
- 交付要求：04 `交付规格.json`。
- 任务类型：门槛 `task_types` 中实际存在的值。
- 截止时间：只从门槛 `deadlines` 中选择与栏位名称/规则明确对应的项，保留其 `raw_value` 与原标签；不得只取一个总截止，不得补时区。

无法从栏位原文和实际文件无歧义确定值时记 `missing`，不得靠关键词、行业惯例、历史题或平台默认值补全。

### 行业与职业

- 行业：`industry_tree` 非 `null + extracted` 时，只能选择树中存在的完整 L1/L2 路径；L1 必须匹配 `args.industry`。`industry_tree=null + not_applicable` 时只能使用门槛 `industry` 与 `args.industry` 一致的原文值，并记录“规范未声明行业树”，不得自造 L1/L2。`unparseable|conflict`、空树或值/状态组合不一致时 `industry_valid=false`、`pass=false`。
- 职业：`occupation_tree` 非 `null + extracted` 时，只能从 `roots` 或明确 `source_file` 的实际内容中选择 L1/L2。只给来源文件时，必须先读取并记录文件路径、定位和可选节点；文件不可读时 `invalid`。`unparseable|conflict` 或值/状态组合不一致时 `occupation_valid=false`、`pass=false`。
- `occupation_tree=null + not_applicable` 且某平台栏位明确要求职业/岗位时，该栏位只能记 `missing`，不得从题面、行业或常识猜职业。
- 所选行业/职业节点必须在 `industry_source`/`occupation_source` 中以对象记录 `{source_id,file,locator,quote}`；`source_id` 必须是 00 source 中实际存在的键，`quote` 必须逐字来自该定位。

## 三、逐项状态

`status` 只允许：

- `ready`：值非空、类型/枚举/格式合法，来源文件存在且包内 bytes/sha256 可核。
- `missing`：上游没有可用值或来源文件/包成员不存在。
- `invalid`：有值或元数据，但必填性未知、类型/枚举/格式/来源/hash 校验失败，或规范定义冲突。
- `not_applicable`：规范明确该栏位对本项目不适用，且同时满足：
  1. `required=false`；
  2. `na_basis.source_id` 指向真实门槛来源；
  3. `na_basis.quote` 是原文逐字摘录；
  4. `na_basis.reason` 说明为什么该栏位不适用。

`required=true` 的栏位不得记 NA。仅因为“没有内容”“不知道怎么填”或历史题为空，不能记 NA。

## 四、包与约束核对

- 必须先确认 `artifacts/17_pack/核对.json.pass` 严格为布尔 `true`、`source_hash_check="pass"`，且其中三个包均 `checked=true`；否则 `package_valid=false`、`pass=false`。
- 题面、A、B、rules 等文件引用必须能在 17 三个包的对应成员中找到；记录 zip 名、成员路径、bytes 和 sha256。
- 模型输入只引用 `仅模型输入.zip`，不得引用专家侧。
- 题面、附件、字段值中不得出现 `forbidden` 禁止内容；`forbidden=null + not_applicable` 才表示没有禁用项约束，`unparseable|conflict` 使 `forbidden_clear=false`、`pass=false`。
- `task_types`、`deadlines`、`quality_gates`、`attachment_policy`、`history_refs` 按提取状态核对；`null + not_applicable` 不参与判定，`unparseable`/`conflict` fail closed。
- 若 `attachment_policy.max_bytes` 或某平台栏位的 `value_rule` 明确声明附件大小/字节上限，必须按包内实际 `bytes` 校验、在对应项的 `constraint_checks.size_valid` 记录结果，并对超限项记 `invalid`；`max_bytes=null` 表示规范未写，不参与判定；不得自造大小阈值。全局 `attachment_size_valid` 仅在本次实际核验到的全部大小约束均成立时为 `true`。
- 17 草案与包内 `平台/平台栏位映射.md` 是元数据基线，不是最终提交值；18 以草案为基线回填并产出最终 `字段映射.json/.md`。

## 输出

### `artifacts/18_submit/字段映射.json`

```json
{
  "schema_version": 1,
  "spec_path": "artifacts/12_freeze/frozen/项目门槛.json",
  "spec_sha256": "<sha256>",
  "source_freeze_sha256": "<冻结清单.json sha256>",
  "platform_fields_applicable": true,
  "platform_fields_na_basis": null,
  "upload_package": {
    "rebuilt": false,
    "rebuild_node": "18_rebuild_upload",
    "check_path": "artifacts/18_submit/上传包核对.json",
    "note": "18 不重建；由编排在 18 通过后执行 18_rebuild_upload"
  },
  "fields": [
    {
      "field_id": "PF01",
      "name": "<门槛原文名称>",
      "order": 1,
      "required": true,
      "value_type": "text",
      "enum_values": null,
      "enum_source": null,
      "value_rule": "<门槛原文规则或null>",
      "source_id": "<00 source_id>",
      "status": "ready|missing|invalid|not_applicable",
      "value": "<提交值或null>",
      "value_source": {
        "path": "<实际文件或null>",
        "locator": "<定位或null>",
        "package": "<zip名或null>",
        "member": "<成员路径或null>",
        "bytes": null,
        "sha256": null
      },
      "constraint_checks": {
        "type_valid": true,
        "enum_valid": true,
        "format_valid": true,
        "source_resolved": true,
        "file_refs_resolved": true,
        "size_valid": true
      },
      "na_basis": null,
      "note": "<通过依据或阻断原因>"
    }
  ],
  "selections": {
    "industry_path": ["<L1>", "<L2或省略>"],
    "industry_source": {"source_id": "<00 source_id>", "file": "<实际来源>", "locator": "<定位>", "quote": "<原文>"},
    "occupation_path": ["<L1>", "<L2或省略>"],
    "occupation_source": {"source_id": "<00 source_id>", "file": "<occupation_tree 文件或 roots 来源>", "locator": "<定位>", "quote": "<原文>"}
  },
  "checks": {
    "freeze_hash_valid": true,
    "platform_contract_valid": true,
    "field_count_match": true,
    "order_preserved": true,
    "metadata_complete": true,
    "mapping_matches_draft": true,
    "constraint_valid": true,
    "status_schema_valid": true,
    "na_justification_valid": true,
    "industry_valid": true,
    "occupation_valid": true,
    "task_type_valid": true,
    "forbidden_clear": true,
    "deadlines_resolved": true,
    "quality_gates_valid": true,
    "history_refs_valid": true,
    "file_refs_resolved": true,
    "attachment_size_valid": true,
    "package_valid": true,
    "upstream_pass": true
  },
  "counts": {
    "total": 0,
    "ready": 0,
    "missing": 0,
    "invalid": 0,
    "not_applicable": 0
  },
  "pass": false
}
```

`upload_package` 只是编排流程信息块，`rebuilt=false` 表示 18 未重建，不参与通过式。

`checks` 每项必须是布尔值；`mapping_matches_draft` 在字段集合、顺序与元数据（`id/name/order/required/value_type/enum_values/enum_source/value_rule/source_id`）全部与 17 草案一致时为 `true`。`counts` 必须由 `fields` 实际重算并满足：

```text
total = fields.length
ready + missing + invalid + not_applicable = total
pass = missing == 0 AND invalid == 0
       AND ready + not_applicable == total
       AND 所有 checks 为 true
```

`platform_fields_applicable=false` 时，`fields=[]`、五项 counts 均为 0，`platform_fields_na_basis` 必须是对象 `{"extraction_status":"not_applicable","source_id":null,"quote":null,"reason":"规范未声明投稿平台栏位"}`，并仍须通过其余 checks 才能 `pass=true`。只要值为 `null|[]` 但状态不是 `not_applicable`，或状态为 `not_applicable` 但值不是 `null`，`platform_contract_valid=false` 且 `pass=false`。

`freeze_hash_valid` 只在以下全部成立时为 `true`：冻结清单可解析；本节点读取的 00 项目门槛/规范摘录、04/09/11 副本均存在；每个副本 bytes/sha256 与冻结清单完全一致；`spec_sha256` 等于冻结清单中项目门槛的摘要。任何 live/冻结混读、hash 缺失或版本不一致均 fail closed。

### 其余输出

- `artifacts/18_submit/字段映射.md`：按原顺序的人读表，逐项写 name/order/required/type/value/status/source/NA 依据。
- `artifacts/18_submit/状态.md`：分别记录材料制作、内容核验、附件制造、独立作答、评分、质检、打包、平台保存、上传、提交、审核的真实状态；上传包重建记 `pending`（未执行）。
- `artifacts/18_submit/待办.md`：只列 missing、invalid 和需人工确认项，并写主责节点与验收条件。

18 通过后由编排 `18_rebuild_upload` 执行：以 17 `填写上传.zip` 为底包，只替换 `填写上传/平台/平台栏位映射.md`，逐成员重算 bytes/sha256、成员集合不变；机器门禁 `upload_rebuilt/member_set_unchanged/member_hashes_recomputed/mapping_reflected/no_forbidden_members`，结果写 `artifacts/18_submit/上传包核对.json`。18 不修改 17 的 zip。

## 硬要求

- 不伪造模型分数、运行时长、AI 率、平台保存结果、审核结果或提交回执。
- 不把 `business_fields` 直接当 `platform_fields`，也不把平台栏位渗入题面或 rubric。
- 不补写 00 未声明的平台字段、枚举、必填性或行业/职业层级。
- 任何 missing、invalid、无法定位的包内文件/哈希都使 `pass=false`。
- 作答思路只能来自 `artifacts/12_freeze/frozen/作答思路.md`。

## 最终回复

文件落盘后按编排 brief 的 JSON gate 返回，`artifacts` 逐项核对本节点产物。`conditions` 必须含 `counts_recomputed`、`mapping_file_consistent`、`mapping_matches_draft`，全部来自实际重算；`file_conclusion`/`reply_conclusion` 投影 `字段映射.json` 的 `pass` 与 `counts`（`total/ready/missing/invalid/not_applicable` 五个计数必须与文件深等，并与 `extra.audit` 同名键一致）；`extra.audit` 必须按实际重算给出 `draft_field_count`、`draft_ids_equal`、`draft_orders_equal`、`draft_metadata_equal`、`total`、`ready`、`missing`、`invalid`、`not_applicable`、`counts_sum_ok`、`pass_formula_ok`、`all_checks_true`、`platform_fields_applicable`。

不得照抄模板值；平台保存、上传、提交和审核未发生时，不得写成平台已通过。
