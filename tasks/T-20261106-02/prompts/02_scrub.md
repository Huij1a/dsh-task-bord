# 02 脱敏

## 前置读取

先读取 `artifacts/00_spec/项目门槛.json`、`artifacts/00_spec/规范摘录.md`、`artifacts/01_src/素材清单.md`、`artifacts/01_src/来源索引.csv`，并按索引逐 SID 读取 `artifacts/01_src/原文摘录/<SID>.md`，核对 `args.industry`、`task_types`、`industry_tree`、`occupation_tree`、`forbidden` 与行业边界。`args.industry` 必须与门槛 `industry` 一致；`industry_tree` 非 `null` 时还须落在对应路径内，`null` 时记录“规范未声明行业树”，不得自行补层级。只按当期门槛和 01 的逐来源原文工作；门槛缺失、索引与摘录不一致、缺摘录或行业不一致时立即停止并退回 01，不得凭空生成底稿。本节点早于 04，不读取也不推断 `platform_fields` 或 `business_fields`。

## 任务

把 01 采集到的素材整理成可以进题目附件的底稿，去掉真实主体，保留业务机制。

## 规则

1. 真实主体（公司名、人名、机构名、可反向检索的标题）一律替换，但**正文、表格、跨文件引用要一致**。
2. 保留：业务关系、金额量级、时间结构、规则条款、状态机、权限关系。
3. 不保留：真实联系方式、身份证/工号、可定位到具体个人的信息、原始 URL。
4. 脱敏后的行业术语和业务语义必须来自当期规范、`规范摘录.md` 或素材本身；不得把平台的 `platform_fields` 当成业务字段，也不得预造尚应由 04 定义的 `business_fields`。
5. 不得过度脱敏到丢失真实感：如果把行业术语、业务约束都删掉，这题就废了。

## 输出

1. `artifacts/02_scrub/脱敏底稿/<SID>.md`：每个 `source_id` 一份，文件首行写 `source_id: SIDxx`，文件名与 01 索引一致。
2. `artifacts/02_scrub/脱敏底稿.md`：人读总览，逐份给出 `source_id` → 底稿文件路径，不替代逐份文件。
3. `artifacts/02_scrub/映射表.csv`：列固定为 `source_id,原主体,替换后,出现位置,原文定位,脱敏后定位,来源摘录sha256,处理状态`。
4. `artifacts/02_scrub/脱敏检查.md`：逐 SID 写保留事实、去除标识、残留扫描范围与结果。
5. `artifacts/02_scrub/脱敏映射.json`（canonical，逐 SID 一份 entry）：

```json
{
  "schema_version": 1,
  "source_index": {"path": "artifacts/01_src/来源索引.csv", "row_count": 2, "source_ids": ["SID01", "SID02"]},
  "entries": [
    {
      "source_id": "SID01",
      "excerpt_path": "artifacts/01_src/原文摘录/SID01.md",
      "excerpt_sha256": "<64hex>",
      "scrubbed_path": "artifacts/02_scrub/脱敏底稿/SID01.md",
      "scrubbed_sha256": "<64hex>",
      "replacement_rules": [
        {"original": "<原文>", "replacement": "<替换后>", "kind": "company|person|org|title|contact|url|other", "locations": ["<段/表/单元格>"]}
      ],
      "residual_check": {"pass": true, "hits": [], "scope": ["正文", "表格", "页眉页脚", "文件名", "交叉引用"]},
      "status": "scrubbed|blocked",
      "blocked_reason": null
    }
  ],
  "summary": {"total": 2, "scrubbed": 2, "blocked": 0, "all_one_to_one": true, "residual_all_pass": true}
}
```

## 硬要求

- 每个 01 `source_id` 恰有一条 `entries`；`scrubbed_path` 文件存在、非空、sha256 与磁盘一致；`replacement_rules` 覆盖该来源实际出现的全部真实主体。
- `residual_check` 必须扫正文、表格、页眉页脚、文件名、跨文件引用，命中 `forbidden` 或未替换主体即 `pass=false`。
- 有 `blocked` 来源时整节点停止，不得静默丢源；每条 entry 的 `blocked_reason` 必须非空，无法脱敏时退回 01。
- 替换后的名字在全文、全表、跨文件引用中必须一致。
- 不要用“某某公司A”这种一眼假的占位名；按当期行业的真实命名结构生成不可反查的虚构名称。
- 凡被 `forbidden` 禁止的主体、字段或信息，脱敏后必须消失；无法消除时停止，不得只做表面替换。

## 机器门禁

最终回复最后一行是单行、可直接 `JSON.parse` 的 gate 对象（不套代码围栏）：`summary` 非空，`artifacts` 逐项核对产物，`conditions` 必须为 `true`，`extra.audit` 按实际重算填写。

- `conditions` 必须包含 `redaction_complete`、`per_source_mapping_complete`、`residual_checks_recorded`。
- `extra.audit` 形状（键名与嵌套逐字一致）：

```json
{"audit":{"index_source_ids":["SID01","SID02"],"mapped_source_ids":["SID01","SID02"],"total":2,"scrubbed":2,"blocked":0,"one_to_one":true,"sha_matches_disk":true,"all_residual_pass":true,"entries":[{"source_id":"SID01","status":"scrubbed","scrubbed_exists":true,"scrubbed_nonempty":true,"sha_match":true,"residual_pass":true,"rule_count":3,"has_locations":true}]}}
```

- `total`/`scrubbed`/`blocked` 按实际 `entries` 重算；`one_to_one` 只在 01 索引 ID 集合与映射 entries 集合相等且无重复时为 `true`；`sha_matches_disk`、`all_residual_pass` 必须逐条真实重算，`rule_count` 为实际规则数。
