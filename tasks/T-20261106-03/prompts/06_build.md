# 06 附件制造

## 前置读取

开始前读取：

- `artifacts/00_spec/项目门槛.json`
- `artifacts/00_spec/规范摘录.md`
- `artifacts/04_scope/交付规格.json`
- `artifacts/05_evidence/附件清单.json`（canonical）、`难点清单.json`、`关系图.json` 和 `字段口径.md`
- `mode=repair` 时：编排 brief 指定的 `findings_path`（`artifacts/07_metacheck/result.json` 或 `artifacts/09_style/附件问题.json`）

只制造 05 `附件清单.json` 中的输入附件，并让每个 `active` 难度 `Dxx` 在附件中有可定位的实际承载位置。行业、题型、业务字段、禁止项和时间口径必须来自项目门槛、04 `business_fields` 与 05；`args.industry` 必须与门槛 `industry` 一致，`industry_tree` 非 `null` 时不得越界；门槛缺失、附件字段无法追溯或行业不一致时立即停止。`platform_fields` 只描述投稿平台栏位，不得作为附件业务字段来源。

## 任务与模式

按 05 的附件清单，造出全部输入附件。Office 文件用 `officecli` 和 Python 生成，不用手写；所有产物统一写入 `artifacts/06_build/`。

模式必须来自编排 brief；brief 未传 `mode` 时按 `initial`。`制造记录.md` 顶部和最终回复都必须声明 `mode` 与（repair 时的）`findings_path`：

- `mode=initial`：无 findings，按 05 清单从零生成全部附件。`返修记录.json` 写 `mode=initial`、`findings=[]`、`closed_count=0`、`pass=true`。
- `mode=repair`：编排 brief 传 `mode=repair` 与 `findings_path`（`artifacts/07_metacheck/result.json` 或 `artifacts/09_style/附件问题.json`）。只修复 findings 指向的问题：不删 finding、不降标准、不重建未被 finding 指向的文件；修复前后对 `artifacts/06_build/` 全部附件重算 sha256，未被任何 finding 引用的文件必须 byte 级 hash 不变；修不了的 finding 记 `status=unrepairable` 且整体 `pass=false`，不得谎报 closed。
- finding 标识：`finding_id` 原样沿用源文件给出的值（07 `findings[].finding_id`、09 `issues[].issue_id/finding_id`）；源文件没有时按 `07#<n>` / `09#<n>`（n 为 findings/issues 数组 1-based 序号）生成。每条 finding 必须写 `source_ref`（`file` + `locator`）。

## 工具

```bash
officecli create A01_xxx.xlsx
officecli batch A01_xxx.xlsx --input cmds.json     # 批量加 sheet/cell/formula/格式
officecli validate A01_xxx.xlsx
officecli add A13_xxx.docx / --type markdown --prop src=src.md   # Markdown 转原生 Word
```

- xlsx：cell 支持 `value`/`formula`/`numberformat`，公式文件生成后按需使用 `office-recalculate` 刷新并核验缓存值。
- docx：先写 Markdown（含 GFM 表格），再 `--type markdown` 展开成原生 Word。
- PDF 只允许两种生成路径：
  1. 对已有 Office 文档，使用 DSH 内置 `office-export-pdf` 技能（LibreOffice Kit）导出。
  2. 对无需 Office 源文件的附件，使用 `reportlab` 直接生成。
- 禁止使用上述两种路径之外的任何未授权 PDF 转换器。

## 制造纪律

1. **数据必须程序生成**：需要多条明细或跨表关系时，用可复现脚本保证自洽，不能手写。
2. 每份附件先想清谁产生它、字段为什么长这样，再确定列名；文件名、格式和实际业务字段必须与 05 `附件清单.json`、04 `business_fields` 的来源登记逐项一致。缺文件、多文件、改名或改格式均判失败，不得由 06 自行纠正清单。
3. 埋错点必须落在明细记录、状态或规则关系中，不能靠说明文字提示答案。
4. 不要在附件里写“注意”“不要”“正确做法”等解法提示。
5. 生成后立即校验：字段完整性、行数、主键唯一、跨表勾稽、公式可算和文件可打开。
6. PDF 导出后重新打开，检查页数、文字可抽取性和关键表格未截断；不得把转换失败当作成功。
7. 生成工具的默认作者、公司或应用名不得留在最终文件元数据中；07 会逐文件复检。
8. 对 05 `难点清单.json` 中每个 `status="active"` 的 `Dxx`，必须落实至少一个实际承载位置：`attachment_id + part + locator`（xlsx 用 sheet/单元格或命名区域，docx/pdf 用唯一锚点或页锚点）；承载附件集合必须与 05 `carrier_attachment_ids` 一致，实际 `part/locator` 必须落在 05 `carrier_bindings` 声明的位置内且 `field_keys` 与附件字段一致。`withdrawn` 难点不制造新承载，但必须在覆盖报告中说明沿用或空缺。

## 输出

所有产物保存在 `artifacts/06_build/`：

- 05 清单中要求的 `<附件文件名>`（`.xlsx`、`.docx`、`.pdf` 等）
- `制造记录.md`（必需）：顶部写 `mode` 与（repair 时的）`findings_path`；逐份写附件的生成来源、工具/技能、业务字段、行数、关键校验、PDF 导出方式，以及每个 `Dxx` 的 `attachment_id/part/locator` 承载位置
- `校验报告.json`（必需）：机器可读的完整校验结果
- `附件事实快照.json`（必需）：供 08/10/11 消费的实际结构快照
- `返修记录.json`（必需，initial 也写）：逐 finding 的修复与关闭证据
- `build_*.py`：必要的可复现生成脚本

`校验报告.json` 至少包含：

```json
{
  "pass": false,
  "mode": "initial|repair",
  "artifacts_dir": "artifacts/06_build",
  "manifest_match": {
    "expected_files": 0,
    "actual_files": 0,
    "missing": [],
    "extra": [],
    "renamed_or_reformatted": []
  },
  "files": [
    {
      "file": "<附件文件名>",
      "format": "<xlsx|docx|pdf|md|txt|csv|json>",
      "opens": false,
      "parts": [
        {
          "name": "<工作表或节>",
          "rows": 0,
          "primary_key": "<主键或 null>",
          "key_unique": false
        }
      ],
      "checks": [
        {"name": "<检查项>", "pass": false, "detail": "<实际值与判定>"}
      ]
    }
  ],
  "reconciliations": [
    {"name": "<勾稽项>", "left": "<口径与值>", "right": "<口径与值>", "pass": false}
  ],
  "formula_checks": [
    {"file": "<文件>", "part": "<工作表>", "formula_count": 0, "recalculated": false, "pass": false}
  ],
  "difficulty_coverage": [
    {
      "difficulty_id": "D01",
      "status": "covered|unresolved",
      "carrier_attachment_ids": ["A01"],
      "actual_carriers": [
        {"attachment_id": "A01", "part": "<part>", "locator": "<cell/key/anchor>", "evidence": "<实际值或结构定位>"}
      ],
      "matches_manifest": false,
      "pass": false
    }
  ],
  "failures": ["<未通过项>"]
}
```

没有某项时使用空数组，不用 `true` 冒充。`difficulty_coverage` 必须逐一覆盖 05 中所有 `active` `Dxx`（各一次），每个条目的实际承载集合与 05 `carrier_attachment_ids` 一致，且每个 `actual_carriers[].locator` 能在快照对应 `part` 或实际附件中定位；`withdrawn` 不进入该数组。`pass` 只有 `manifest_match.missing/extra/renamed_or_reformatted` 全为空、全部文件实际检查通过、`difficulty_coverage` 全部 `pass=true` 且 `failures=[]` 时才可为 `true`；repair 还要求全部 finding `status=closed`、`open_count=0`。`校验报告.json.mode` 必须等于 `返修记录.json.mode`；`附件事实快照.json` 必须与修复后磁盘一致。

`附件事实快照.json` 必须从生成后的实际文件重新读取，不得复制 05 的声明值：

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
          "name": "<工作表/节/正文块>",
          "headers": ["<实际列名>"],
          "row_count": 0,
          "column_count": 0,
          "used_range": "<A1:F20或null>",
          "anchors": ["<docx/pdf可定位锚点>"]
        }
      ]
    }
  ]
}
```

快照中的每个 `attachment_id` 必须与 05 清单一致，每个文件 hash 必须与磁盘一致；格式不支持的结构字段用 `null`/空数组，不得编造表头或坐标。`校验报告.json` 的 `files` 也必须同时覆盖 05 清单和快照中的每个文件。

## 返修记录.json

初始制造也必须写，结构与模式无关，只按实际发生填写：

```json
{"schema_version":1,"mode":"initial|repair","findings_path":null,"findings":[{"finding_id":"07#1","source":"07|09|none","source_ref":{"file":"artifacts/07_metacheck/result.json","locator":"findings[0]"},"fix":"<实际修复动作>","evidence":"<修复后实际检查/重算证据>","status":"closed|unrepairable","files":[{"path":"artifacts/06_build/A01.xlsx","sha256_before":"<64hex>","sha256_after":"<64hex>","changed":true}],"unrepairable_reason":null}],"changed_files":["artifacts/06_build/A01.xlsx"],"unchanged_files":[{"path":"artifacts/06_build/A02.xlsx","sha256":"<64hex>"}],"closed_count":0,"open_count":0,"pass":true}
```

- `mode=initial` 时 `findings=[]`、`changed_files=[]`、`closed_count=0`、`open_count=0`、`pass=true`，`unchanged_files` 覆盖全部附件。
- `mode=repair` 时每条 finding 都要有非空 `fix`、`evidence`、`source_ref`；`unchanged_files` 必须覆盖未被 finding 引用的全部文件及其修复后 sha256，`changed=true` 的文件必须被至少一条 finding `files` 引用；`closed_count` 按 `status=closed` 实际计数，`open_count` 为未关闭数，`pass` 仅在 `open_count=0` 且无 `unrepairable` 时为 `true`。
- `制造记录.md` 与 `校验报告.json.mode` 必须与本文件 `mode` 一致。

## 硬要求

- 文件能打开、能读，规范要求的关键字段非空。
- 行数、权重、金额、数量和状态等勾稽只按当期项目规范、04 交付规格和 05 附件清单明确要求的关系核对；规范没有定义加总、分类或平衡关系时，不得自行假设。
- 业务字段只来自 04 `business_fields` 与 05 附件清单，不另造业务字段或平台字段，不把其他行业字段带入附件。
- 目录名固定为 `artifacts/06_build/`，不得使用历史目录名或其他替代目录。
- 不留 `OfficeCLI`、`python-docx`、`openpyxl`、`WPS`、`LibreOffice`、`reportlab` 等默认工具痕迹；若导出工具不可避免写入元数据，须在不改变业务内容的前提下清理并重新执行全部校验。

## 机器门禁

最终回复最后一行是单行、可直接 `JSON.parse` 的 gate 对象（不套代码围栏）：`summary` 非空，`artifacts` 逐项核对产物，`conditions` 必须为 `true`，`extra.audit` 按实际重算填写。

- `conditions` 必须包含 `attachments_built`、`attachment_checks_recorded`、`repair_contract_ok`。
- `extra.audit` 形状（键名与嵌套逐字一致）：

```json
{"audit":{"mode":"initial","findings_path":null,"findings_total":0,"findings_closed":0,"findings_unrepairable":0,"records_complete":true,"unrelated_files_unchanged":true,"changed_files_covered":true,"facts_match_disk":true,"report_mode_matches":true,"changed_files":[],"unchanged_file_count":2}}
```

- initial 时 `findings_total`/`findings_closed`/`findings_unrepairable` 均为 0；repair 时 `findings_total>=1`、`findings_closed==findings_total`、`findings_unrepairable==0`。
- `records_complete` = 每条 finding 有非空 `fix`/`evidence`/`source_ref`；`unrelated_files_unchanged` = 未被任何 `finding.files` 引用的文件 before/after hash 相同；`changed_files_covered` = 每个 `changed_files` 至少被一条 finding `files` 引用；`facts_match_disk`/`report_mode_matches` 按 `附件事实快照.json` 与 `校验报告.json` 的实际一致性判定；`unchanged_file_count` 为实际未变文件数。
