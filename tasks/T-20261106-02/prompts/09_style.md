# 09 题面润色

## 任务

在不改变任何业务事实、字段、坐标和交付约束的前提下，把 08 的题面润色成当前岗位在真实业务时点写出的委托，并在本节点目录产出最终题面。09 不修改 08、06、05、04 或任何上游文件。

## 前置读取

- `artifacts/00_spec/项目门槛.json` 和 `artifacts/00_spec/规范摘录.md`
- `artifacts/04_scope/交付规格.json` 和 `字段来源.md`
- `artifacts/05_evidence/难点清单.json`、`附件清单.json`
- `artifacts/06_build/校验报告.json`、`附件事实快照.json`
- `artifacts/07_metacheck/result.json`：读取每个 A 文件的 `sha256`，作为 06 附件未变化基线
- `artifacts/08_prompt/题面.md`、`字段映射.json`、`字段映射.md`（只作 08 上游，09 不回写）

07 必须为 `pass: true`。任一上游必需文件缺失、不可解析或字段映射不闭合时停止，不得用润色掩盖结构问题。

`00_spec.platform_fields` 不是题目字段，本节点不得读取它来改题面；业务字段只以 04 的 `business_fields` 和 08 的 `字段映射.json` 为准。

## 任务边界

可以润色的事实只能来自：

- 08 题面中已经存在的业务时点、对象、状态、条件、否定、承诺、权限和数量关系
- 项目门槛 `forbidden` 和 `deadlines` 中与本题业务时点相关的已明确限制
- 04 已登记的交付字段、单位、精度、容差和 part 结构
- 05 `附件清单.json` 和 06 `附件事实快照.json` 中已存在且有来源的附件事实

不得新增上述材料中没有的对象、字段、时间、阈值、因果、平台规则或解题步骤。不得改变数字、日期、编号、状态、条件、否定、承诺、权限、字段名、文件名、part 名或坐标。润色不是补题；缺少业务信息时保持原状并在 `附件问题.md` 记录应退回的节点。

## 文种与改写

- 邮件或交班记录：按当时已知事实写，说清当前动作和下一责任人。
- 工单或处理记录：保留原始诉求、处理阶段和状态。
- 制度或合同：保持正式层级和条款结构。
- 台账或表单说明：字段准确，不写成叙事文。

文种由当期题目决定，不得预设某行业或平台固定使用某一种文种。把抽象动词还原为材料中已经存在的对象、动作、时间和责任人；一句话只承担一个清楚动作；专业术语必须与门槛、04 和附件中的用法一致。

## 字段映射核对

写最终题面前，逐项读取 08 `字段映射.json`，核对最终题面中的 `business_field_key`、题面标签、deliverable/part/坐标与 04 完全一致。09 不得修改业务字段或坐标：

- 字段完全一致：`字段映射差量.json` 的 `changes=[]`、`pass=true`。
- 发现字段新增、删除、改名、单位/精度/容差变化或坐标变化：停止，不输出最终题面为可交付版本，写 `pass=false`，路由 04（结构定义错误）或 08（题面转写错误）。
- 不得把平台投稿栏位加入题面或映射。
- 发现附件表达、字段口径或实际附件与 05/06 不一致：不得在 09 修复，`附件问题.json` 记 `pass=false`、`owner_node="06"`，最终 `pass=false`、`route="06"`；编排须执行 `06 → 07 → 08 → 09` 复审链。

`artifacts/09_style/字段映射差量.json` 固定结构：

```json
{
  "schema_version": 1,
  "source_prompt_sha256": "<08题面sha256>",
  "final_prompt_sha256": "<09最终题面sha256或null>",
  "source_mapping_sha256": "<08字段映射sha256>",
  "mapping_unchanged": true,
  "06_unchanged": true,
  "attachment_hashes": [
    {
      "attachment_id": "A01",
      "file": "<实际文件名>",
      "before_sha256": "<07 result中的sha256>",
      "after_sha256": "<09完成时实际重算sha256>",
      "pass": true
    }
  ],
  "changes": [],
  "pass": true,
  "route": null,
  "issues": []
}
```

`attachment_hashes` 必须逐一覆盖 07 `files` 中的实际 A 文件，`before_sha256` 取 07 result，`after_sha256` 在 09 完成前对当前文件重算；任一缺失、集合不一致或值不同时 `06_unchanged=false`，不得把 09 的写入当作附件变化。`字段映射差量.pass = mapping_unchanged AND 06_unchanged AND changes=[]`。失败时 `pass=false`：字段/映射问题 route 为 `"04"` 或 `"08"`，附件 hash/set 问题 route 为 `"06"`；`issues` 逐条写 `issue_id/owner_node/target/action`。Markdown 镜像 `字段映射差量.md` 只作人读。

`artifacts/09_style/附件问题.json` 固定结构：

```json
{
  "schema_version": 1,
  "pass": true,
  "issues": [],
  "route": null
}
```

没有附件问题时 `pass=true/issues=[]/route=null`。否则每条 issue 必须含 `issue_id/finding_id/owner_node/target/action/acceptance`；`finding_id` 有 `issue_id` 时取同值，否则 `09#<n>`（n 为 issues 数组 1-based 序号），供 06 repair 原样引用；`owner_node` 只能是 `"06"`，`pass=false/route="06"`。Markdown 镜像 `附件问题.md` 只作人读；JSON 与 Markdown 冲突时以 JSON 为准并按本节点未完成处理。

## 输出

- `artifacts/09_style/题面_最终.md`：润色后的最终题面；通过时必须存在且非空。
- `artifacts/09_style/字段映射差量.json`：机器可读核对结论。
- `artifacts/09_style/字段映射差量.md`：同结论的人读镜像。
- `artifacts/09_style/润色说明.md`：逐处列 `改前 → 改后 → 保真项 → 依据（门槛/04/05/06/08 的具体文件位置）`。
- `artifacts/09_style/附件问题.json`：机器可读的附件问题与返修路由；没有问题时仍须输出。
- `artifacts/09_style/附件问题.md`：同结论的人读镜像；没有则写“无”。

## 自检

- [ ] 数字、时间、对象、状态、条件、否定、承诺和权限没有改变
- [ ] 业务字段、坐标、单位、精度和容差与 04/08 完全一致，没有平台字段
- [ ] 没有新增解题顺序、考点或评分提示
- [ ] 不同文种读起来符合各自用途
- [ ] 只写了 `artifacts/09_style/`，08、06 及所有上游文件哈希未变
- [ ] `字段映射差量.json` 的 `attachment_hashes` 覆盖全部 A 文件，前后 sha256 与 07 result/当前实际文件一致且 `06_unchanged=true`
- [ ] `字段映射差量.json.pass=true` 且 `mapping_unchanged=true`、`06_unchanged=true`、`changes=[]`，或已 fail closed 并写明路由
- [ ] `附件问题.json` 存在；无问题时 `pass=true`，有问题时 `pass=false/route="06"` 并给出 06 验收条件

`pass = 字段映射差量.pass AND 附件问题.pass`。最终回复最后一行给出单行 JSON：`{"pass":true,"route":null,"final_prompt":"artifacts/09_style/题面_最终.md","mapping_changes":0,"attachment_issues":0}`；任一子结论失败时 `pass=false`，`route` 取对应子结论的唯一路由（04/06/08）。
