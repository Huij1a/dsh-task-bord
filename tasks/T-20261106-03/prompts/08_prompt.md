# 08 题面

## 前置读取

写题面前读取：

- `artifacts/00_spec/项目门槛.json` 和 `artifacts/00_spec/规范摘录.md`
- `artifacts/04_scope/交付规格.json`、`字段来源.md`、`边界.md`
- `artifacts/05_evidence/难点清单.json`、`难点策略.json`、`关系图.json`、`附件清单.json`
- `artifacts/06_build/A*` 实际附件文件、`附件事实快照.json` 和 `校验报告.json`
- `artifacts/07_metacheck/result.json`

07 必须为 `pass: true`。任何文件缺失或不可解析时停止。`args.industry` 必须与门槛 `industry` 一致；`industry_tree` 非 `null` 时不得越界。题面中的行业、题型、业务字段、禁用项、截止时间和业务边界只能取自项目门槛、04 和实际附件，不能按平台习惯补写。

`04_scope/交付规格.json` 的 `business_fields` 是题面业务字段唯一真源。00_spec 的 `platform_fields` 只描述投稿平台栏位，本节点不得读取、复制、改名或据此裁剪题面；18 才会使用平台栏位。

## 任务

写题目正文（prompt）。只写委托和业务事实，不写解法、考点或评分提示。

## 结构（R-T-C-O-F）

| 要素 | 必须写 |
|---|---|
| R 角色 | 当前岗位是谁、向谁负责；角色和职责由本题材料与 04 决定确定 |
| T 任务 | 现在要决定什么、交付什么 |
| C 上下文 | 业务时点、为什么现在做、实际附件、已有事实、成果交给谁/供什么决定使用（Consumer/Decision）、明确业务约束 |
| O 输出 | 文件名、part/节、业务字段、单位、精度、容差、接收方 |
| F 约束 | 项目门槛 `forbidden` 中与答题有关的限制、状态标记规则、其他明确边界，以及“只交付本地文件，不登录平台、不联网、不提交外部系统”的环境边界 |

## 交付结构

把 04 的 `交付规格.json` 转成答题者能读的清单：

- 文件名、格式
- 每个工作表/节/正文块的稳定名称
- 每个 `business_field_key` 及题面标签
- 数值字段的单位、精度、允许误差

并写一句：**表名、字段名、文件名不得改动，按此核对**。

不得重新设计结构。若 04 缺字段、无法定位、字段映射不闭合，或表格坐标与附件事实不相容，立即停止并退回 04；不得自行添加字段或列。

## 附件事实

`artifacts/06_build/附件事实快照.json` 是附件事实的机器快照真源，至少记录：

```json
{
  "schema_version": 1,
  "attachments": [
    {
      "attachment_id": "A01",
      "file": "<实际文件名>",
      "sha256": "<64位小写sha256>",
      "format": "xlsx|docx|pdf|md|txt|csv|json",
      "parts": [
        {
          "name": "<sheet/节>",
          "headers": ["<实际列名>"],
          "row_count": 0,
          "column_count": 0,
          "used_range": "<A1:F20 或 null>",
          "anchors": ["<docx/pdf 可定位锚点>"]
        }
      ]
    }
  ]
}
```

题面只能写快照和实际附件中存在的事实；必须逐个读取 `artifacts/06_build/A*` 实际文件并重算 sha256，核对快照 `file/sha256/format/parts` 与 05 `附件清单.json`；缺文件、hash 不符或快照内容冲突即 fail closed。不得从校验报告的“通过”状态反推不存在的表头、行数或业务字段。附件内容需要改动时，退回 06 并重跑 07，不在 08 修附件。

## 字段来源与映射

`artifacts/08_prompt/字段映射.json` 必需，是机器可读映射真源：

```json
{
  "schema_version": 1,
  "prompt_sha256": "<64位小写sha256>",
  "source_delivery_sha256": "<交付规格.json的sha256>",
  "items": [
    {
      "business_field_key": "BF01",
      "label_in_prompt": "<题面实际字段名>",
      "deliverable_id": "OUT01",
      "part_id": "P01",
      "coordinate": "<A列/start_anchor等>",
      "source_refs": [{"file": "<实际文件>", "locator": "<位置>", "quote": "<依据>"}]
    }
  ],
  "unmapped_business_fields": [],
  "extra_prompt_fields": [],
  "pass": true
}
```

- 每个 04 必判业务字段必须至少出现一次；展示性字段可不出现在评分结构中，但若出现在题面仍须映射。
- 题面不得出现 04 之外的新增业务字段。无法映射时停止并退回 04。
- 同一 `business_field_key` 在多个 part 出现时，每个坐标项分别列一条。
- 平台投稿栏位不得出现在 `items` 或题面。

同时输出 `artifacts/08_prompt/字段映射.md` 作为人读镜像，逐项列 `business_field_key → 题面标签 → deliverable/part/坐标 → source_refs`。若 Markdown 与 JSON 冲突，以 JSON 为准且视为本节点未完成。

## 必须写进去的

- 规范或材料明确要求的关键业务时点及其含义；时区、日期格式不自行补默认值。
- 业务规则确有优先级时，写清“哪条业务规则优先”，但不得写操作步骤、筛选顺序或去重算法。
- 规范或附件明确规定的资源、权限、时间、金额、数量等业务边界。
- 规范明确要求的状态标记规则；未规定则不发明。
- 交付物清单，文件名、part 名、字段名与 04 逐字一致。

## 绝对不能写进去的

- 具体答案、正确数量、应当选哪一项或其他最终结果。
- 先看哪张表、按什么顺序筛、怎么计算、怎么去重的操作步骤。
- “注意不要……”“容易出错的是……”等解法提示。
- 难点编号、考点编号、rubric、评分标准、附件隐藏的评判条件。
- 当前项目规范未定义的行业、平台投稿栏位、业务字段、业务规则或禁止事项。

执行环境的系统限制可以说明，但必须与项目业务约束分清；不得把系统限制写成业务规则，也不得漏掉 `forbidden`。每道题必须明确说明：交付物供谁用于何项业务决定，以及本题只交付本地文件，不登录平台、不联网、不提交任何外部系统；`Consumer/Decision` 必须来自 04 的决定登记，不得自行编造。

## 输出

- `artifacts/08_prompt/题面.md`
- `artifacts/08_prompt/字段映射.json`（canonical）
- `artifacts/08_prompt/字段映射.md`（人读镜像）

## 自检

- [ ] 新同事能理解谁在何时依据哪些事实决定什么、最后交什么
- [ ] 所有需判定的数值边界都有当期规范、04 或实际附件来源
- [ ] 没有一句在暗示解题路径
- [ ] 题面业务字段全部来自 04 `business_fields`，没有平台栏位或其他行业字段
- [ ] `字段映射.json` 的 `pass=true`，无未映射必判字段和额外字段
- [ ] 交付文件名、part 名、字段名、单位、精度、容差与 04 完全一致
- [ ] 附件事实与 `附件事实快照.json` 一致
