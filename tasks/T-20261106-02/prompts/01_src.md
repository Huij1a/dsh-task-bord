# 01 素材采集

## 前置读取

先读取 `artifacts/00_spec/项目门槛.json` 和 `artifacts/00_spec/规范摘录.md`。确认：

- `args.industry` 与项目门槛的 `industry` 一致；`industry_tree` 非 `null` 时还须落在对应路径内，`null` 时记录“规范未声明行业树”，不得自行补树。
- 候选素材符合 `task_types`；规范未定义的题型标记为候选缺口，不得自行补成项目要求。
- `forbidden`、`deadlines` 等与来源或时效有关的限制已经应用；`deadlines` 有多个时按各自 `kind/label` 使用，不得只取一个总截止。
- 本节点只读取门槛文件，不修改 00_spec 的产物，也不从旧题或常识补默认值。

任一必需文件缺失、JSON 不可解析、`industry` 与 `args.industry` 不一致，或非空行业树中无法定位，立即停止并报告具体缺口。

## 任务

围绕 `args.industry`，从公开、可核验的渠道采集**真实业务底本**，作为出题素材。采集数量由可用证据和后续选题需要决定，不得为了凑固定条数拼接不相干材料。每条素材分配稳定来源 ID `SID01`、`SID02`…；同一来源在本题生命周期内不得改号或复用。

## 要找什么

来源类型必须由当期 `industry`、`task_types` 和规范规定决定，先问“哪个机构会在此行业记录此类决定和失败”，再选择对应的一手渠道。不得沿用其他行业或旧题的来源清单。

判断标准只有一个：能不能还原“谁在某个业务时点，依据哪些当时可见的事实，必须做一个会被追责的决定”。

不要找：与行业路径无关的材料、科普、新闻通稿、营销软文、模型生成的总结。

## 每条记录写清

```text
来源 ID | 来源名称 | 发布机构 | 日期 | 链接 | 原文位置（页/节/段）
真实发生了什么 | 当事人当时掌握什么 | 适用条件 | 错误机制 | 后果
价值信号：发生频率 | 影响量级（金额/工时/损失） | 付费方或成果使用者 | 判错代价
原文未说明的部分
本题可能改编成什么业务决定
```

价值信号每项都要附原文定位；材料没有依据时写“未证明”，不得由 agent 估值、换算或补默认值。

## 输出

- `artifacts/01_src/素材清单.md`：上面格式逐条列，含价值信号；顶部写明读取的项目门槛路径、args.industry、实际使用的筛选条件。
- `artifacts/01_src/来源索引.csv`：列固定为 `source_id,来源名称,机构,日期,链接,可获取的原文类型,原文摘录文件,摘录文件sha256`。
- `artifacts/01_src/原文摘录/<SID>.md`：每个来源一份，文件名使用该来源的 `source_id`。文件**首部**必须是机器可读元数据块（逐项一行），随后逐字保存 02 脱敏所需的原文段落或表格片段；不得只存标题、搜索摘要或模型转述：

```text
<!-- source_metadata
source_id: SID01
source_url: <真实链接或用户提供材料标识>
source_name: <来源名称>
institution: <机构>
publish_date: <YYYY-MM-DD 或 未标明>
read_at: <YYYY-MM-DD>
locator: <页/节/段定位>
-->
```

## 外部采集边界

- 只读 `args.specPath`、公开网页和用户明确提供的材料；禁止扫描本机私人目录、凭据、浏览器配置或与本任务无关的文件。
- 每个来源都要记录真实链接与读取日期，保证可复核；无法联网或找不到可核验原文时，输出缺口 `NO_EXTERNAL_SOURCE` 并停止，不得编造，也不得用标题、搜索摘要或转述降级冒充原文。

## 硬要求

- 每条素材必须真的打开读过，不能只凭标题或搜索摘要；`原文摘录/` 与 `来源索引.csv` 必须一一对应。
- 索引行数必须等于摘录文件数；每个 `source_id` 恰一行、恰一份摘录，不得有重复、缺摘录或孤儿摘录。
- 每份摘录必须有上述元数据块，且 `source_id` 与文件名、索引一致；`摘录文件sha256` 必须是对磁盘摘录文件实际重算的 64 位小写十六进制，不得照抄、估算或省略。
- 找不到合适素材就换来源或停止报告缺口，不要编造案例，也不要降低行业与题型匹配要求。
- 一个案例只能证明“发生过”，不能称“行业高发”。
- 素材覆盖量必须能支撑初勘中的真实选择；如果规范规定了最低数量或来源类型，严格按规范执行并引用出处。

## 机器门禁

最终回复最后一行是单行、可直接 `JSON.parse` 的 gate 对象（不套代码围栏）：`summary` 非空，`artifacts` 逐项核对产物，`conditions` 必须为 `true`，`extra.audit` 按实际重算填写。

- `conditions` 必须包含 `excerpts_one_to_one`、`excerpt_metadata_complete`、`excerpt_sha256_matches_index`。
- `extra.audit` 形状（键名与嵌套逐字一致，数值来自实际计数与磁盘重算）：

```json
{"audit":{"index_rows":2,"excerpt_files":2,"one_to_one":true,"index_source_ids":["SID01","SID02"],"excerpt_source_ids":["SID01","SID02"],"duplicate_source_ids":[],"missing_excerpts":[],"orphan_excerpts":[],"index_sha_matches_disk":true,"excerpts":[{"source_id":"SID01","path":"artifacts/01_src/原文摘录/SID01.md","index_sha256":"<64hex>","actual_sha256":"<64hex>","sha_match":true,"has_source_metadata":true,"metadata_fields":{"source_url":true,"read_at":true,"locator":true}}]}}
```

- `index_rows`/`excerpt_files` 为实际计数；`one_to_one` 只在行数相等、两 ID 集合相等且无重复/缺失/孤儿时为 `true`；`index_sha_matches_disk` 只在每条摘录的索引 sha256 与磁盘重算值都相等时为 `true`；`excerpts` 逐条与索引一一对应。
