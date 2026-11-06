# dsh-plugin-authoring

DSH 插件：提供 19 节点出题流水线所需的 6 个工具。零依赖，只使用 Node 内置模块；不联网、不读取凭据、不执行外部命令。

## 安装

```powershell
# 复制到 profile 的 node_modules
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-plugin-authoring" | Out-Null
Copy-Item index.js,package.json,README.md "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-plugin-authoring\" -Force

# 在 cordis.patch.yml 中只写 name，不要写 id
# - name: dsh-plugin-authoring

# 重启 DSH
```

插件继续使用手写的 `tool()` / `paramSchema()` / `outSchema()` 注册工具，不依赖 `@deepseek-ai/dsh-tools` 的 `defineTool`。

## 工具总览

| 工具 | 作用 | 写盘 |
|---|---|---|
| `authoring_init` | 按母版 manifest 开题、复制文件、重算哈希并冻结 | 是 |
| `authoring_verify` | 校验任务全部冻结文件，或对照当前母版检查漂移 | 否 |
| `authoring_status` | 查看节点产物、按卷评分/隔离/补跑、补卷判定与汇总终态 | 否 |
| `authoring_script` | 返回 batch/full/short workflow 脚本原文 | 否 |
| `authoring_trace` | 解析 DSH 会话记录，查看 subagent 进度和失败调用 | 否 |
| `authoring_isolate` | 两阶段生成 13 分卷隔离审计与题包 host trace | 是 |

## 公共参数校验

所有工具在 `execute` 外包一层参数校验。必填参数缺失、字符串为空、类型不符或参数不是对象时，返回：

```json
{"ok":false,"error":"参数错误：..."}
```

工具内部异常也统一转成 `{ok:false,error:"..."}`，不向调用方抛裸异常。

## authoring_init

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `industry` | string | 是 | 行业，L1 或 L1/L2，写入任务 manifest |
| `taskId` | string | 否 | 字母数字、`-`、`_`，2–64 字符；省略时生成 `T-YYYYMMDD-NN` |
| `specPath` | string | 否 | 当期项目规范文件或目录，写入任务 manifest 的 `spec` 字段 |

行为：

1. 读取 `<root>/母版/manifest.json` 的 `files` 数组，以它为唯一复制清单，不维护第二份硬编码列表。
2. 逐个复制清单文件到 `<root>/tasks/<taskId>/`，对复制后的文件重新计算 `bytes` 与 `sha256`。
3. 任务 manifest 的 `version` 和 `template_version` 都取母版 manifest 的 `version`。
4. `template_sha` 是母版 `manifest.json` 自身的 SHA-256。
5. 复制或写任务 manifest 中途失败时，只删除本次成功新建且确认位于 `<root>/tasks` 直接子目录下的 `taskDir`。
6. 已存在的题目目录不覆盖。

成功后的 `next` 会要求调用 `authoring_script` 取脚本，并按批次提交 workflow：

```json
{"taskDir":"<绝对路径>","batch":"A","specPath":"<当期项目规范文件或目录>","industry":"<行业>"}
```

批次划分：

| 批次 | 节点 |
|---|---|
| `A` | `00_spec` + `01`–`07` |
| `B` | `08`–`12` |
| `C` | `13`–`16` |
| `D` | `17`–`18` |
| `all` | 全量 |

上一批通过后再提交下一批。

## authoring_verify

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | string | 是 | 题目 ID |
| `against` | string | 否 | `task`（默认）或 `template` |

`against=task`：任务副本对照任务自己的 `manifest.json`，校验 manifest 中列出的全部文件，不只 `prompts/`。

`against=template`：任务副本对照当前 `<root>/母版/manifest.json`，同时检查母版文件本身与清单是否一致。母版任一项发生变化、母版目录出现未登记文件、母版 manifest 自身或版本变化时返回 `clean:false`，并返回 `templateVersion` / `taskVersion`。

返回字段包括：

- `clean`
- `against`
- `changed`：同名文件内容或登记哈希不一致
- `added`：同步到当前母版时需要补入任务副本的文件，包括母版中未登记到 manifest 的物理新增文件
- `deleted`：当前母版已不再包含、但任务副本仍有的文件
- `missing`：任务 manifest 已登记、任务目录中物理缺失的文件
- `templateVersion`
- `taskVersion`

## authoring_status

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | string | 是 | 题目 ID |

行为：

1. 统计 `artifacts/*/` 下每个节点目录的文件数和最新修改时间，排除 `_cell.py`、`*.pyc`。
2. 从 `artifacts/14_score/补卷判定.json`、`artifacts/14_score/汇总.json`、评分目录和隔离审计目录收集卷号。
3. 每卷读取 `artifacts/14_score/<runId>/评分.json` 和 `artifacts/13_answer/<runId>/隔离审计.json`，在 `volumes` 中展示分数、难度、整体结论、隔离状态、是否补跑和是否被选中。
4. 判定文件缺失时显示“尚未判定”；若只有 `C01`、`C02` 两个目录而没有判定/汇总，仍按目录列出 compatibility 状态，并把 `C02` 标为目录兼容的补跑卷。
5. 旧单卷布局兼容读取根 `artifacts/14_score/评分.json` 和根 `artifacts/13_answer/隔离审计.json`，卷号显示为“单卷”。有分卷目录时，根评分只映射到判定/汇总明确指定的卷，或唯一存在的卷。
6. 若存在 `artifacts/00_spec/项目门槛.json`，在 `verdicts` 中展示分数阈值等内容。
7. `buildDirs` 同时识别 `06_build` 与 `06_wps`，两者都存在时都会返回。

固定契约：

```json
{
  "schema_version": 1,
  "default_runs": 1,
  "max_runs": 2,
  "first_run_id": "C01",
  "first_triggers": [
    {"kind": "score", "actual": 68, "threshold": 75, "upper": null, "evidence": "..."}
  ],
  "supplement_required": true,
  "supplement_run_id": "C02",
  "selected_run_id": "C02",
  "selection_rule": "higher_score_then_closer_difficulty_margin",
  "selection_reason": "...",
  "created_at": "2026-11-05T00:00:00.000Z"
}
```

- `artifacts/14_score/补卷判定.json` 是首卷后是否补卷的权威记录。`runId` 按 `[A-Za-z0-9_-]+` 校验；首卷为 `C01`，补卷至多一次，为 `C02`。
- `first_triggers[].kind` 限定为 `score`、`rounds`、`minutes`、`invalid`。无需补卷时 `supplement_required=false`、`supplement_run_id=null`。
- `artifacts/14_score/汇总.json` 记录最终状态，Status 读取 `run_ids`（或 `runs[].run_id`）、`selected_run_id`、`selection_rule`、`selection_evidence`、`pass`、`stop_reason`。
- 根 `artifacts/14_score/评分.json` 是 selected report 的旧单卷兼容入口，不是额外的第三卷；插件不会从任意 JSON 内容猜补跑。
- `13_answer/<runId>/隔离审计.json` 的最小字段为 `schema_version=1`、`task_id`、`run_id`、`model`、`pass`、`package_root`、`input_dir`、`output_dir`、`frozen_version`、`input_files`、`output_was_empty`、`brief_contains_no_task_dir`、`checks`、`violations`、`audited_at`。Status 读取 `pass`、`status` 和 `violations` 展示隔离结论。

## authoring_script

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | string | 是 | 题目 ID |
| `kind` | string | 否 | `full`（默认）、`batch` 或 `short` |

行为：

- `batch`：返回任务目录中当前 `workflow.js` 原文，并在 `workflowArgs` 和 `note` 中说明单批 workflow 参数；每次只提交 `A/B/C/D` 中一批，`all` 仅用于显式全量执行。
- `full`：保持原有行为，返回同一个 `workflow.js` 原文，按 `args.batch` 的 `A/B/C/D/all` 分批执行。
- `short`：返回 `workflow_s2.js` 原文，即 13 作答 → 14 评分两节点。
- `range`：已删除，不再支持按行截取。传入后会返回 `ok:false`，并提示改用 `kind=batch` 与 `workflow args.batch`。

batch/full 模式的 workflow 参数：

```json
{"taskDir":"<绝对路径>","batch":"A","specPath":"<当期项目规范文件或目录>","industry":"<行业>"}
```

调用 workflow 时，`taskDir`、`batch`、`specPath`、`industry` 都必须非空。注意：`authoring_init.specPath` 是可选参数；如果开题时没传，启动 workflow 前必须补齐。脚本应原样提交给 workflow 工具，不要由模型重写。

## authoring_trace

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | string | 是 | 题目 ID，同时用于附带该题 artifacts 进度 |
| `session` | string | 否 | 会话 ID；省略时取最近修改的会话 |
| `lastN` | integer | 否 | 返回最近多少次工具调用，默认 15 |
| `errorsOnly` | boolean | 否 | 为 true 时 `recent` 只保留失败调用 |

读取 `~/.dsh/sessions/<工作区>/<会话>/session.v4.jsonl.zstd`，返回：

- `steps`
- `subagents[]`：label、model、effort、provider、mode
- `tools`：工具调用分布
- `errorCount` / `errors[]`
- `recent[]`：最近调用的参数和结果摘要
- `artifacts[]`：该题节点目录文件数和修改时间

会话文件是多帧 zstd，插件按帧解压后解析 JSONL。会话记录可能包含完整提示词和产物内容，不要外传。

## authoring_isolate

在 14 评分节点中对每个分卷调用两次。`precheck` 位于唯一一次 judge 之前，`finalize` 位于 judge 已成功写出评分报告并完成归档之后。

```json
{
  "taskId": "<taskId>",
  "runId": "C01",
  "answerPackage": "D:\\高经作答区\\<taskId>\\C01",
  "phase": "precheck"
}
```

```json
{
  "taskId": "<taskId>",
  "runId": "C01",
  "answerPackage": "D:\\高经作答区\\<taskId>\\C01",
  "phase": "finalize"
}
```

### 会话定位

`precheck` 优先从工具执行上下文 `exec.agent.session.id` 取得当前 14 子会话，读取其 `parentSession`，再在 workflow 父会话的 `tool-workflow/agent-start` 事件中找到当前 14 `childId`，向前取最近的 `phase/label=13` 子会话。该 13 子会话的 `tool/call`、`step/start`、模型描述和消息记录是审计证据。

无法通过 workflow 父会话定位时，可传 `session` 显式指定 13 会话：

```json
{
  "taskId": "<taskId>",
  "runId": "C01",
  "answerPackage": "D:\\高经作答区\\<taskId>\\C01",
  "phase": "precheck",
  "session": "<13-session-id>"
}
```

`session` 是手工排障 fallback，不改变结构校验。找不到会话、事件或 13 子会话时，工具仍尽力写出可解析的 fail-closed 审计和 trace，并在返回值和审计中设置 `infrastructure_failure=true`；14 此时停止评分交人，不启动 C02。

### precheck

1. 验证题包绝对路径严格等于 `<answerRoot>/<taskId>/<runId>`，且与 `taskDir` 不重叠。
2. 读取 `<taskDir>/artifacts/12_freeze/冻结清单.json`，逐文件核对题包 `input/` 与 `model_input_files` 的 `path`、`bytes`、`sha256`；题包必须同时有普通目录 `input/`、`output/`。
3. 扫描 13 会话的 `read/read_image/grep/glob/write/edit/apply_patch/office_*` 路径参数，以及 `pwsh` 的 `cwd/workdir`、绝对路径和 `..`。web/session 工具不计入本审计。
4. 允许路径白名单：
   - 题包 `input/`：只读。
   - 题包 `output/`：读写。
   - `<root>/.dsh/skills/`：只读。
   - `~/.dsh/skills/`：只读。
   - Node 安装目录：只读。
   - 配置项 `isolationAllowPaths` 列出的绝对路径：只读。
5. 写入外部题包根 `<answerPackage>/host_trace.json`，并写入临时审计 `<taskDir>/artifacts/13_answer/.host-audit/<runId>.json`。绝不预写 judge 会原子替换的 `<runId>/` 目录。
6. 返回 `ok:true` 表示两份证据已成功生成；`isolation_pass` 是独立的隔离结论。普通路径越界、hash 不符等只令 `isolation_pass=false`，不当作工具机制异常。

固定六项检查：

- `PACKAGE_OUTSIDE_TASK_DIR`
- `RUN_ID_MATCH`
- `INPUT_ALLOWLIST`
- `INPUT_HASH`
- `OUTPUT_EMPTY`
- `BRIEF_NO_TASKDIR`

只有六项唯一且全部 `status=pass`、`violations=[]`、`pass=true`、`output_was_empty=true`、`brief_contains_no_task_dir=true` 时，隔离结论才为 PASS。audit 最小字段为 `schema_version=1`、`task_id`、`run_id`、`model`、`pass`、`status`、`infrastructure_failure`、`answer_package`、`package_root`、`input_dir`、`output_dir`、`frozen_version`、`input_files[{path,bytes,sha256}]`、`output_was_empty`、`brief_contains_no_task_dir`、`checks[{check_id,status,evidence}]`、`violations`、`read_paths`、`whitelist`、`steps`、`rounds_source="trace"`、`started_at`、`ended_at`、`minutes`、`host_trace_path`、`host_trace_sha256`、`audited_at`。模型固定为 `deepseek-v4.1-flash/max`。

host trace 的权威字段为 `schema_version=1`、`source="host"`、`task_id`、`run_id`、`session_id`、`model="deepseek-v4.1-flash/max"`、`started_at`、`ended_at`、`minutes`、`rounds`、`step_count`、`tool_calls`、`isolation_status`、`infrastructure_failure`。

### judge 与 finalize

14 只读临时审计和 trace，结构完整后执行当前分卷唯一一次 judge，并把输出归档到 `<taskDir>/artifacts/13_answer/<runId>/`。judge 完成后必须调用 `finalize`，即使 `isolation_pass=false` 或评分报告已经 fail closed。

`finalize` 不重扫 13 会话、不重算输入或评分、不修改答卷，只执行：

1. 校验临时审计的身份、schema、结论字段和结构。
2. 校验 `<answerPackage>/host_trace.json` 的 hash 与临时审计记录一致。
3. 校验 `<taskDir>/artifacts/14_score/<runId>/评分.json` 的 `copy.destination` 正好是当前分卷归档目录。
4. 拒绝重定向目录；把临时审计复制到暂存文件，复核 hash 后原子改名为 `隔离审计.json`。
5. 允许归档 `pass=false` 的合法审计，以保留 C02 所需的 `first_invalid` 证据。已有相同 hash 的最终审计时幂等成功；内容不同则拒绝覆盖。

## 配置

```yaml
- name: dsh-plugin-authoring
  config:
    root: D:\高经出题流水线
    templateDir: 母版
    maxTasks: 200
    # sessionsDir: C:\Users\<用户>\.dsh\sessions
    # answerRoot: D:\高经作答区
    # isolationAllowPaths:
    #   - C:\approved\readonly-tool
```

不导出 `Config` schema，避免额外的 schema 依赖；配置在 `apply(ctx, config)` 中处理默认值。

## 安全边界

| 项 | 实现 |
|---|---|
| 路径越界 | 所有项目路径经 `safeJoin` 校验，拒绝解析后越出 root |
| taskId 注入 | 正则白名单，拒绝路径分隔符和 `..` |
| 覆盖已有题目 | `authoring_init` 遇已存在目录直接失败 |
| 失败残留 | 只回滚本次新建的 tasks 直接子目录 |
| 网络 | 不使用网络模块 |
| 凭据 | 不读取 `.env`、`.credentials.yaml` |
| 命令执行 | 不导入 `child_process` |

## 已知限制

1. 分卷评分、补卷判定、汇总与隔离审计按固定路径读取；其他节点根目录的通用结论提取仍是启发式，格式不符时可能没有结论。
2. `authoring_trace` 与 `authoring_isolate` 依赖 DSH 的 session v4 多帧 zstd 存储格式，以及 workflow 的 `tool-workflow/agent-start` 事件；格式变化后需要适配。
3. 两个 `authoring_init` 并发使用同一 `taskId` 时，依赖目录创建互斥，不提供额外锁。
4. `template` 校验能发现母版漂移，但 manifest 本身没有密码学签名，不防恶意伪造。
5. `authoring_isolate` 能审计工具参数中可见的路径，不能证明未经工具调用的外部读取；13 的实际隔离仍依赖 DSH 沙箱和运行契约。
6. Windows junction 的识别依赖 `lstat().isSymbolicLink()`；新增形式的文件系统重解析点需要在宿主版本升级时回归。
