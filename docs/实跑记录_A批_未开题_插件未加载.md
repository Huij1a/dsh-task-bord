# 实跑记录 · A 批（00_spec + 01–07）— 未开题：authoring_* 插件工具不可见

> 记录时间：2026-11-06 08:56 +08:00
> **结论：A 批未通过（实际上未开始 / 阻塞）。**
> 任务第 1 步「确认插件工具可见」失败：`authoring_init`、`authoring_script`、`authoring_status`、`authoring_verify`（以及插件里的 `authoring_trace`、`authoring_isolate`）在本会话均不可见。
> 按任务说明第 1 步与第 5 步，**已停止**：未开题、未调用 `authoring_script`、未提交 workflow、未手工复制 `tasks/T-demo`、未手工拼脚本、未补任何产物。
> 根因（高置信）与最小修复建议见 §7；修复需改 `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml` 并重启 DSH，超出本任务授权范围，故只记录未执行。

---

## 1. 基本信息

| 项 | 值 |
|---|---|
| taskId | 无（`authoring_init` 未调用，未生成任务） |
| taskDir | 无 |
| 会话 | `session-e01edda9-270f-43fe-a4eb-660b8080ef2b` |
| 任务开始（会话首条消息） | 2026-11-06 01:52:40 +08:00 |
| 会话中断 | 02:13:16 → 08:47:48（约 6 小时 34 分，属宿主待机/中断，不是流水线耗时） |
| 恢复核查 | 2026-11-06 08:47:48 起 |
| A 批实际运行耗时 | **0**（未启动） |
| workflow 返回 ok / calls / calls_by_batch / error | **N/A（workflow 未调用，无返回值原文）** |
| 宿主 | DSH desktop-next 2.0.22-next；electron 44.7.0；node v24.21.0；dsh 0.2.2-rc.1；profile `desktop`；GUI `http://127.0.0.1:50367`；host boot `2026-11-05T17:49:19Z` |
| 会话模型 | `opencode-go` / `deepseek-v4.1-flash`（reasoningEffort max，profile 默认模型） |
| 工作目录 | `D:\高经出题流水线` |
| 写盘范围 | 仅新增本文件。未修改 `母版\`、`插件\`、`AGENTS.md`、`tasks\T-demo\`、`C:\Users\Administrator\.dsh\` 下任何文件；`tasks\` 仍只有 `T-demo`（11-05 12:17:21）。调查期间只在 `%TEMP%` 生成过解压/读取用临时文件，不影响仓库。 |

## 2. 步骤 1 检查结果（停止依据）

### 2.1 模型侧工具清单（本会话实际注入 52 个）

`acp_cache, acp_read_original_image, acp_status, ask_user_question, compress, create_goal, decompress, edit, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents, list_subagent_models, load_workspace_dependencies, plugin_manager, present, pwsh, read, read_image, schedule_create, schedule_edit, schedule_list, schedule_view, search_context, send_message, skill, spawn_teammate, subagent, subagent_fork, task_board_create, task_board_get, task_board_list, task_board_manage, task_board_run, task_board_schedule, task_board_set_parent, task_board_update, team_task_create, team_task_get, team_task_list, team_task_update, todo_write, update_goal, wait_agent, web_fetch, workflow, working_directory, write`

**无任何 `authoring_*` 工具。**

### 2.2 DSH 运行时插件注册表（决定性证据）

`plugin_manager(list_plugins)` 三页全量核对（`offset=0/100/200`，`total=214`，尾页 14 条）：
- 所有条目都是 `include:*` 引用的既有 bundle/插件（如 `include:agents-anywhere-bridge-next`、`include:agent-team`、`include:bili-native`、`ui-task-board`、`desktop-next-capabilities`、`desktop-next-webserver`、`auto-review` 等）；
- **没有任何 `dsh-plugin-authoring` 条目**。

⇒ 插件从未被 cordis 加载，工具不可能注册到会话；这与模型侧工具清单缺失完全一致。

### 2.3 配置证据（为什么没加载）

`C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`（108 行，11-06 01:52 本地 mtime）：

| 行 | 内容 |
|---|---|
| :1–:88 | `computer-use-cua-driver-native`(:1)、`plugin-market`(:3–7)、`llm-pi-ai`(:8–59，含 opencode-go/deepseek-v4.1-flash)、`permission`(:60–73，默认 danger-full-access)、`subagent-model-selection-settings`(:74–80，allowedModels 仅 opencode-go/deepseek-v4.1-flash)、`subagent`(:81–84)、`ui-theme`(:85–88) —— **均带 `id:`** |
| **:89** | **`- name: dsh-plugin-authoring`（无 `id:`、无 `insert:`）** |
| :90–:108 | `llm-deepseek`、`agent-default-model`(provider opencode-go, model deepseek-v4.1-flash, reasoningEffort max) —— 均带 `id:` |

同 profile 其它配置：`cordis.yml` 为空数组（注释说明树由 `package.json` 的 `dsh.profile.bundles` + `cordis.patch.yml` + `--patch` overlays 组装）；`package.json` 的 `dsh.profile.bundles` 共 9 项，**不含 authoring**；`desktop-next.cordis.patch.json`、`desktop-next.runtime.patch.json` 只配置 webserver/bridge。

历史备份 `cordis.patch.yml.bak-20261105-authoring`(:116)、`.bak-20261105-subagent`(:116)、`.bak-20261106-opencode`(:128) 与当前 `:89` **一直是同一条无 id 形式**，即从插件安装起就没用对格式。

### 2.4 DSH 源码证据（patch 条目被静默跳过）

`D:\DSH NEXT\resources\app.asar`（237,037,363 B）中字符串 `is required for non-insert patches` 位于字节偏移 `17,934,825`，其 `applyPatches()` 逻辑：

```js
const { id, insert, name, ...overrides } = patch;
if (insert) { /* clone = structuredClone(insert); 无 id 时 data.push(...clone) */ buildMap(clone); continue; }
if (!id) { warn("patch: id is required for non-insert patches"); continue; }   // ← 当前条目走这里
const target = entryMap.get(id);
if (!target) { warn("patch: entry %C not found", id); continue; }
```

即：**无 `id` 且无 `insert` 的 patch 条目会被 `warn` 后 `continue` 跳过**；`insert` 才是「向条目数组插入」的合法形式（`ensureInsertIds` 会给 insert 条目补随机 id）。

### 2.5 运行日志证据

日志目录 `C:\Users\Administrator\.dsh\logs\`：

| 证据 | 内容 |
|---|---|
| `desktop-next-2026-11-05.0.jsonl` | `patch: id is required for non-insert patches` **155 条**，最早 `2026-11-05T05:29:15.229Z`（= 本地 13:29，插件安装后第一次启动时段） |
| `desktop-next.log` | 同警告 **37 条**（行 :24–:28、:59–:60、:71–:72、:94–:95、:126–:128、:139–:144 等），含 11-06 01:49 本地开机与 01:52 本会话创建时段 |
| 同一日志 | `2026-11-05T05:23:16.956Z` / `05:23:19.635Z` 有 2 条 `patch: entry "authoring" not found` —— 安装时曾用 `- id: authoring` 形式（被拒），随后改成 name-only 形式，从此变成「跳过」 |
| 工具执行记录 | 全日志检索 `"tool":"authoring` **0 命中**；jsonl 的 `host.tools` 事件只有 `execute.failed` 63 条（成功执行不入日志）。日志中出现过的工具名：`grep`16、`read`14、`edit`9、`compress`4、`web_fetch`3、`wait_agent`3、`subagent`3、`ops_bash`3、`pwsh`2、`list_subagent_models`2、`task_board_create`1、`bash`1、`web_search`1、`rg -n `1 —— 从未出现过 `authoring_*` |

### 2.6 插件本体健康（排除「插件代码坏了」）

| 检查 | 结果 |
|---|---|
| 源码 | `D:\高经出题流水线\插件\dsh-plugin-authoring\index.js` 102,757 B（11-06 00:00:31）、`package.json` 408 B、`README.md` 15,373 B |
| profile 副本 | `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-plugin-authoring\` 三文件同大小/同 mtime 量级（index.js 102,757 B 00:00:31） |
| 模块解析 | 在 profile 目录执行 `node -e "import('dsh-plugin-authoring')"` → `IMPORT OK keys=[apply,inject,name]` |
| 工具注册位置 | `index.js:1687 authoring_init`、`:1805 authoring_verify`、`:1952 authoring_status`、`:2103 authoring_script`、`:2252 authoring_isolate`（另 `:2163` 一处注册）；`inject=["tools"]`，零外部运行时依赖 |
| 结论 | 插件代码本身可加载、可 import；**卡在宿主 patch 配置格式**，不是插件实现问题 |

### 2.7 判定

| 工具 | 是否可见 | 结论 |
|---|---|---|
| `authoring_init` | ❌ | 不满足任务第 1 步前置条件 |
| `authoring_script` | ❌ | 同上 |
| `authoring_status` | ❌ | 同上 |
| `authoring_verify` | ❌ | 同上 |

⇒ 按任务说明「不可见就停下报告」，A 批不启动。

## 3. 未执行项（对照任务要求逐项）

| 任务步骤 | 状态 | 说明 |
|---|---|---|
| 步骤 2 `authoring_init(industry=…, specPath=…)` | **未执行** | 工具不可见，调用不可能；taskId/taskDir 均不存在 |
| 步骤 2 `authoring_verify(taskId, against="template")` | **未执行** | 无 taskId |
| 步骤 3 `authoring_script(taskId, kind="batch")` | **未执行** | 无 taskId |
| 步骤 3 提交 workflow | **未执行** | 无脚本；未手工拼脚本 |
| 步骤 4 `authoring_status(taskId)` | **未执行** | 无 taskId |
| 步骤 5 不跑 B 批 | 自然未跑 | — |
| A 批 9 节点（00_spec、01_src、02_scrub、03_survey、04_scope、05_evidence、06_build、07_metacheck） | **全部未执行** | 无节点完成状态、无产物清单、无 06 repair 轮次 |
| 07 `result.json` 的 `pass` / findings 数 | **N/A** | 无产物 |
| 子代理 provider/model | **N/A** | 未启动任何子代理；预期 `opencode-go/deepseek-v4.1-flash`，本批无法观察，未出现 "not allowed for this Session" / "no adapter" 报错 |
| 手工补产物 / 复制 T-demo | **未做**（按要求禁止） | `tasks\` 目录仍只有 `T-demo` |

## 4. 卡3交接第 6 节六个观察点（本批 N/A，附恢复后抽查清单）

来源：`docs\v006_卡3_证据链交接.md`。本批未开题，六点均无法观察；为下一轮直接对照，列出恢复后应**直接读产物文件**的检查项：

| # | 观察点 | 本批结论 | 恢复 A 批后应读的文件与字段 |
|---|---|---|---|
| 1 | 00_spec 字段分域与 `extraction_status` | N/A（未运行） | `artifacts\00_spec\项目门槛.json` 的 `platform_fields` / `business_fields` 是否分域；`extraction_status` 是否为成功值；行业树/职业树抽取是否齐全 |
| 2 | 01 是否真原文、摘录 sha 一致 | N/A | `artifacts\01_src\原文_索引.json` 8 列（含 `摘录文件sha256`）；`原文摘录\<SID>.md` 元数据块与磁盘 sha 是否与索引一致；正文是否为摘录而非概述 |
| 3 | 02 每源脱敏、`summary.blocked` | N/A | `artifacts\02_scrub\脱敏映射.json` 是否逐来源映射；`summary.blocked` 是否为 0；5 个产物是否齐 |
| 4 | 05 每个 Dxx 的 `source_ids` / `carrier_bindings` | N/A | `artifacts\05_evidence\难点清单.json`：每个 Dxx 是否都有 `source_ids` 与 `carrier_bindings`，`must_judge` 是否全覆盖 |
| 5 | 06 `initial findings_total`、repair 的 `unrelated_files_unchanged` | N/A | `artifacts\06_build\initial_findings.json` 的 `findings_total`（初始应为 0）；若 07 失败回 06，`返修记录.json` 的 `unrelated_files_unchanged` 应为 true |
| 6 | 07 `findings` 是否带 `finding_id` | N/A | `artifacts\07_metacheck\result.json`：`pass`、findings 数、每条 finding 是否含 `finding_id` |

## 5. 职业树观察（本批 N/A）

- 规范职业树 `D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_\高经济题目职业树_整理表.xlsx` 无金融服务专属职业簇（备选贴近项：法律与合规/合规审计、财务/对账、数据分析/风控、金融分析师）。
- 本批未开题，因此 **00_spec 是否抽到行业树/职业树、`extraction_status` 值、03 选定方向最贴近哪个职业簇** 均无法观察，本记录不做任何替代抽取。
- 恢复运行后按 §4-#1 与 `artifacts\03_survey\` 的方向文件核对；本报告下一版补记。

## 6. 提示词 / 编排 / 环境问题清单（只记录，不修）

| # | 对象 | 现象 | 证据 |
|---|---|---|---|
| 1 | 宿主插件加载（环境） | 本地插件条目无 `id`/`insert`，被 DSH 0.2.2-rc.1 的 patch 引擎静默跳过，插件从未加载、`authoring_*` 工具不可见 | `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml:89`；`D:\DSH NEXT\resources\app.asar` 偏移 17,934,825 的 `applyPatches`；`desktop-next-2026-11-05.0.jsonl` 155 条、`desktop-next.log` 37 条 `patch: id is required for non-insert patches` |
| 2 | 插件安装文档 | 安装说明明确要求「只写 name，不要写 id」，该形式在现行 DSH 无效；README 配置示例同样是 name-only | `插件\dsh-plugin-authoring\README.md:12-13`、`:265` |
| 3 | 项目文档 / 验证结论（假阳性） | `AGENTS.md` 声称「工具可见性 已验证（无 id 即可加载）」；实际 0 次 `authoring_*` 执行、155 条跳过警告。卡3 的插件 smoke（stub，31 项 0 失败）与 profile hash 同步只能证明代码与副本一致，证明不了宿主加载 | `AGENTS.md:22`、`AGENTS.md:70`；`docs\v006_卡3_证据链交接.md:124-126`；日志证据同上 |
| 4 | 宿主可观测性 | 插件加载失败只在 host 日志 `warn` 出现，模型侧工具清单无提示；`plugin_manager(list_plugins)` 可直接暴露「不在注册表」，但此前无检查步骤把它作为 gate | 本批 `list_plugins total=214` 无 authoring 条目；日志中无任何用户可见告警 |
| 5 | 流水线节点提示词（00_spec/01–07）与编排层 | **N/A** —— 未进入流水线，无运行证据，不下结论 | — |

## 7. 根因与修复建议（未执行，需用户授权）

### 根因链

1. 插件源码与 profile `node_modules` 副本完好（可 `import`，工具注册代码在 `index.js:1687/1805/1952/2103/2252`）。
2. 但 `cordis.patch.yml:89` 写成 `- name: dsh-plugin-authoring`（无 `id`、无 `insert`）。
3. DSH 0.2.2-rc.1 的 `applyPatches` 对这种条目 `warn` 后 `continue`（见 §2.4），条目被丢弃 → 插件不加载 → 工具不注册。
4. 历史备份显示自安装起一直是该形式；日志中 `entry "authoring" not found` 说明更早的 `- id: authoring` 形式也失败过，此后未再验证真实加载。
5. 项目文档的「已验证」来自 stub smoke / hash 一致性检查，未覆盖宿主 patch 加载。

### 最小修复（建议，未执行）

把 `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml:89` 改为 `insert` 形式（放回原位置：`ui-theme` 之后、`llm-deepseek` 之前）：

```yaml
- insert:
    - name: dsh-plugin-authoring
      config:
        root: D:\高经出题流水线
        templateDir: 母版
        maxTasks: 200
```

依据：`applyPatches` 对 `insert` 分支直接 `structuredClone` 后 `data.push(...clone)`，`ensureInsertIds` 会自动补 id；`config` 按插件 `apply(ctx, config)` 的默认值处理（README:262-276 的示例字段）。

### 验证步骤（修复后）

1. 重启 DSH（必须），确认启动日志不再出现 `patch: id is required for non-insert patches`；`plugin_manager(list_plugins)` 出现 authoring 条目。
2. 新会话工具清单出现 `authoring_init / authoring_script / authoring_status / authoring_verify`（+trace/isolate）。
3. 冒烟：`authoring_status` 空参或对 `T-demo` 只读调用，确认返回 `{ok:true|false}` 而非未知工具。
4. 通过后从本任务第 2 步重跑（新会话、新 taskId），A 批结束再进本报告第二版。

### 注意

- 该修改落在 `~/.dsh` 配置，按任务约束我未执行；需用户明确授权（或在 GUI 内自行修改并重启）。
- 若 insert 形式仍不加载，需进一步排查 profile 是否要求插件作为 bundle 声明（`package.json` 的 `dsh.profile.bundles` 仅 9 项），或宿主对本地插件另有允许清单；这属于环境修复，不在 A 批职能内。
- 修复后建议同步更正 `插件\dsh-plugin-authoring\README.md:12-13`、`README.md:265` 与 `AGENTS.md:22/:70` 的过时说明（本批只记录，未改）。

## 8. 下一步（待用户决定）

| 选项 | 内容 | 需要 |
|---|---|---|
| A（推荐） | 授权我修改 `cordis.patch.yml:89` 为 insert 形式，重启 DSH 后从任务第 2 步重跑 A 批 | 明确授权改 `~/.dsh` + 重启宿主 |
| B | 用户自行修复并重启，之后叫我继续（我会先重做步骤 1 工具可见性检查） | 用户操作 |
| C | 若本意是绕过插件手工组装运行（与任务说明第 1 步相悖），需重新下达指令 | 需重新定义任务 |

在 A/B 完成前，A 批保持未开始，不产生任何产物。

## 9. 复现命令（只读）

```powershell
# 1) 运行时插件注册表
#    工具：plugin_manager(action="list_plugins", offset=0/100/200, limit=100)

# 2) 配置条目
Get-Content 'C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml' | Select-Object -First 110

# 3) 日志警告
Select-String 'C:\Users\Administrator\.dsh\logs\desktop-next-2026-11-05.0.jsonl' -Pattern 'id is required for non-insert patches' | Measure-Object
Select-String 'C:\Users\Administrator\.dsh\logs\desktop-next.log' -Pattern 'id is required for non-insert patches'

# 4) 插件工具从未执行
Select-String 'C:\Users\Administrator\.dsh\logs\desktop-next-2026-11-05.0.jsonl' -Pattern '"tool":"authoring'   # 0 命中

# 5) 插件本体可 import（profile 目录）
Set-Location 'C:\Users\Administrator\.dsh\profiles\desktop'
node -e "import('dsh-plugin-authoring').then(m=>console.log('IMPORT OK keys=['+Object.keys(m)+']'))"
```

---

### 附：本记录与任务报告模板的差异

任务要求文件名 `docs\实跑记录_A批_<taskId>.md`，因 `authoring_init` 未执行、**无 taskId**，故命名为 `docs\实跑记录_A批_未开题_插件未加载.md`；报告中所有依赖 taskId/产物的字段均标注 N/A 并说明原因。工具可见性恢复后，A 批正式运行记录将另写 `docs\实跑记录_A批_<taskId>.md`。
