# 12 冻结版本

## 任务

先复核上游判定，再冻结本版和模型输入快照，并写清 host 建立外部题包的运行契约。冻结后任何改动都必须新建版本。路径均相对 `taskDir`；不得猜测别名或缺省到历史目录。本节点不创建或清空外部题包，也不接触 `D:\高经作答区\`。

## 一、冻结前门禁

按顺序读取并解析：

1. `artifacts/07_metacheck/result.json`：顶层 `pass` 必须为布尔值 `true`。缺失、不可解析或不为 `true` 时拒绝冻结并路由 `07`。
2. `artifacts/10_difficulty/诊断.json`：`pass` 必须为 `true` 且 `route` 必须为 `null`。缺失、不可解析或未通过时，拒绝冻结并按其 `route`（`05|06|08|11`）返修。
3. `artifacts/11_rubric/校验结论.json`：顶层 `pass` 必须为 `true`，所有 `required=true` 的 check 必须是 `pass` 或带依据的 `not_applicable`，且 `issues` 中不得有 `fatal|major`。失败时按首个 fatal/major issue 的 `owner_node`（`04|05|06|08|09|11`）返修。
4. `artifacts/09_style/题面_最终.md` 必须非空；`字段映射差量.json.pass` 必须为 `true` 且 `changes=[]`；`附件问题.json.pass` 必须为 `true` 且 `issues=[]`，否则按各自 `route` 退回 `04`、`06` 或 `08`。`artifacts/06_build/` 必须存在且至少有一个 `A*` 附件。
5. `artifacts/11_rubric/rubric.json`、`难点覆盖.json`、`B索引.json`、`答案核验.md`、`易错点.md`、`作答思路.md` 必须存在且可解析/非空；每条 B 索引项必须指向实际可打开文件，覆盖 04 的全部交付文件。
6. rubric 中若含 `derived` item，必须有非空 `artifacts/11_rubric/rules.py`；若含 `manual` item，必须有完整的 `artifacts/11_rubric/人工复核.json`，其 `rubric_sha256`、全部 manual R ID 和 artifact hash 与 rubric/实际文件一致，且 `校验结论.json.checks[check_id="manual_items"].status` 必须为 `pass`，不得把待复核项宣称自动可判。

任何门禁失败时不得创建或更新 `冻结清单.json`，也不得留下一个看似已冻结的残缺目录。`校验结论.json` 的 `owner_node=04` 问题只按 04 返修；其它可执行问题按 `05|06|08|09|11` 返修。最终回复最后一行给出单行 JSON：`{"pass":false,"route":"04|07|10|11|05|06|08|09|null","reason":"..."}`。

## 二、冻结范围

冻结分三层，禁止把专家侧文件混入模型输入：

| 层 | 内容 | 允许后续消费者 |
|---|---|---|
| `question` | 09 最终题面、04 交付规格、A 系列附件事实快照、08 字段映射、09 字段映射差量 | 15/17/18 |
| `expert` | 10 难度诊断、rubric、rules.py、难点覆盖、11 校验结论、人工复核（manual 时）、B 索引/B 文件、答案核验、作答思路、易错点、项目门槛、规范摘录、05 附件清单、judge.py、运行契约 | 14/15/16/17/18 |
| `model_input` | 仅最终题面 + A 系列附件；由 host 逐文件复制到外部题包 `input/` | 13（只经题包副本） |

`frozen/` 下使用稳定路径：

- `artifacts/12_freeze/frozen/题面.md`
- `artifacts/12_freeze/frozen/交付规格.json`
- `artifacts/12_freeze/frozen/附件事实快照.json`
- `artifacts/12_freeze/frozen/字段映射.json`
- `artifacts/12_freeze/frozen/字段映射差量.json`
- `artifacts/12_freeze/frozen/诊断.json`
- `artifacts/12_freeze/frozen/rubric.json`
- `artifacts/12_freeze/frozen/难点覆盖.json`
- `artifacts/12_freeze/frozen/校验结论.json`
- `artifacts/12_freeze/frozen/人工复核.json`（仅 manual 时）
- `artifacts/12_freeze/frozen/rules.py`（仅 derived 时）
- `artifacts/12_freeze/frozen/项目门槛.json`
- `artifacts/12_freeze/frozen/规范摘录.md`
- `artifacts/12_freeze/frozen/附件清单.json`
- `artifacts/12_freeze/frozen/judge.py`
- `artifacts/12_freeze/frozen/B索引.json`
- `artifacts/12_freeze/frozen/B*`
- `artifacts/12_freeze/frozen/答案核验.md`
- `artifacts/12_freeze/frozen/作答思路.md`
- `artifacts/12_freeze/frozen/易错点.md`
- `artifacts/12_freeze/frozen/model_input/题面.md`
- `artifacts/12_freeze/frozen/model_input/A*`
- `artifacts/12_freeze/frozen/运行契约.json`

`运行契约.json` 是 C 批宿主接口的唯一声明，至少记录：

```json
{
  "schema_version": 1,
  "model": "deepseek-v4.1-flash/max",
  "rubric_schema_version": 3,
  "grading_mode": "automatic|manual_required",
  "required_output_files": ["作答说明.md", "运行记录.json", "进度断点.json"],
  "answer_package": {
    "root": "D:\\高经作答区",
    "layout": "<task_id>/<run_id>",
    "input": "input",
    "output": "output",
    "default_run_id": "C01",
    "supplement_run_id": "C02",
    "run_id_pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$",
    "brief_keys": ["runId", "answerPackage"],
    "forbidden_brief_keys": ["taskDir", "projectRoot", "frozenPath", "artifactsPath"]
  },
  "isolation_audit": {
    "path": "<taskDir>/artifacts/13_answer/<run_id>/隔离审计.json",
    "schema_version": 1,
    "producer": "authoring_isolate",
    "invocation": "authoring_isolate({taskId, runId, answerPackage, phase})；judge 前 phase=precheck，judge 完成归档后 phase=finalize",
    "checks": ["PACKAGE_OUTSIDE_TASK_DIR", "RUN_ID_MATCH", "INPUT_ALLOWLIST", "INPUT_HASH", "OUTPUT_EMPTY", "BRIEF_NO_TASKDIR"]
  },
  "host_trace_required": true,
  "host_trace_path": "<answerPackage>/host_trace.json",
  "host_trace_schema_version": 1,
  "host_trace_source": "host",
  "host_trace_fields": ["schema_version", "model", "started_at", "ended_at", "minutes", "rounds", "source"],
  "host_trace_optional_fields": ["task_id", "run_id"]
}
```

`required_output_files` 只列三份基础设施交付；题面声明的业务交付仍须全部产出。不得复制或记录 API key、环境凭据、DSH 配置或本机秘密。`answerPackage` 不在 `taskDir` 内；它的根目录名固定为 `D:\高经作答区`，任务子目录名严格取 `taskDir` 目录名。`runId`、题包路径和输入 hash 由 host 提供，13 不接收冻结路径。

`隔离审计.json` 由 14 的 `authoring_isolate` 生成，最终固定写到 `artifacts/13_answer/<runId>/隔离审计.json`；不得写到外部题包根或历史单卷根。当前 14 workflow 子会话必须通过 `exec` 定位同批 `phase/label=13` 的作答子会话。会话未解析或证据不足时，工具仍须尽力写出结构完整的 invalid 审计和 fail-closed trace，14 继续 judge 留证并把该卷记为 invalid；只有审计/trace 无法生成、不可解析、身份无法绑定或缺少判断所需结构时才 fail closed，禁止伪造审计。judge 前完成 precheck，judge 成功归档后 finalize 最终审计，14 再核验最终文件和内容。最小字段固定为 `schema_version=1,task_id,run_id,model,pass,package_root,input_dir,output_dir,frozen_version,input_files[{path,bytes,sha256}],output_was_empty,brief_contains_no_task_dir,checks[{check_id,status,evidence}],violations,audited_at`。`input_files.path` 相对 `input/`，集合必须与冻结清单中的 `model_input_files` 一一对应；六项 check 全部 `status=pass`、`violations=[]`、`brief_contains_no_task_dir=true` 时 `pass` 才能为 `true`。13 不读写该文件，14 只读核验，16 只读复核。

`host_trace.json` 由 14 的 `authoring_isolate` 在 judge 前写入 `<answerPackage>/host_trace.json`，最小字段为上表 `host_trace_fields`；`source` 必须为 `"host"`。可选写入 `task_id/run_id` 时，二者必须与题包目录一致；judge 会用显式 `--host-trace` 路径读取，并在字段存在时严格交叉校验，不一致即 runtime invalid。14 以该 trace 为分钟和轮次唯一权威来源，13 的 `运行记录.json` 只作自报对照。

## 三、冻结模型输入与外部题包协议

1. 在 `artifacts/12_freeze/frozen/model_input/` 下建立唯一允许进入作答的输入快照：
   - 将 `artifacts/12_freeze/frozen/题面.md` 冻结为 `model_input/题面.md`；
   - 将 `artifacts/06_build/A*` 按原文件名复制为 `model_input/A*`。
2. `model_input/` 只能含最终题面和 A 系列附件。不得复制 B 系列、rubric、答案核验、易错点、作答思路、项目门槛、运行契约、13 答卷、14 评分、运行记录、脚本、缓存或任何专家侧说明。
3. 逐文件计算 `model_input/` 的 bytes/sha256，写入冻结清单的 `model_input_files`。按 `path` 字典序构造数组 `[{"path","bytes","sha256"}]`，对其 UTF-8 canonical JSON 计算 SHA-256，得到 `model_input.allowlist_sha256`；14 用同一算法比对题包审计中的输入清单。
4. 外部题包不由 12 创建。host 在每卷启动前把 `model_input/` 逐文件复制到 `D:\高经作答区\<taskId>\<runId>\input/` 并创建空 `output/`；13 结束后，14 调用 `authoring_isolate` 独立重算实际输入 hash、核对题包位置和会话轨迹。precheck 生成外部题包根 `host_trace.json`，judge 成功归档后 finalize 分卷 `隔离审计.json`。不得调用 13 可写的脚本自证输入。
5. `runId` 默认 `C01`，最多补一次 `C02`，必须匹配运行契约中的 `run_id_pattern`。13 brief 只允许注入 `runId` 与 `answerPackage`，不得注入 `taskDir`、项目根、`frozen/` 路径或其它专家侧路径。
6. 13 只读题包 `input/`，只写题包 `output/`。`隔离审计.json` 和 `host_trace.json` 均为 host-owned 证据，13 不得创建、修改或替换；14 只通过 `authoring_isolate` 生成，在 judge 前核验 trace、归档完成后核验最终审计，16 只读复核。
7. 12 只写 `artifacts/12_freeze/`，不得写 `D:\高经作答区\`、`artifacts/13_answer/` 或 `artifacts/14_score/`。

## 四、冻结清单

`artifacts/12_freeze/冻结清单.json` 至少包含：

```json
{
  "schema_version": 3,
  "version": "v001",
  "created_at": "<UTC ISO-8601>",
  "model": "deepseek-v4.1-flash/max",
  "toolchain": {"python": "<实际版本>", "openpyxl": "<实际版本或 null>", "platform": "<实际平台>"},
  "gates": {
    "metacheck": {"path": "artifacts/07_metacheck/result.json", "pass": true},
    "difficulty": {"path": "artifacts/10_difficulty/诊断.json", "pass": true, "route": null},
    "rubric": {"path": "artifacts/11_rubric/校验结论.json", "pass": true, "grading_mode": "automatic|manual_required"}
  },
  "question_files": [],
  "expert_files": [],
  "model_input_files": [],
  "files": [],
  "model_input": {
    "root": "artifacts/12_freeze/frozen/model_input",
    "allowlist_sha256": "<64位小写十六进制>"
  },
  "answer_package": {
    "root": "D:\\高经作答区",
    "layout": "<task_id>/<run_id>",
    "default_run_id": "C01",
    "supplement_run_id": "C02"
  }
}
```

`question_files`、`expert_files`、`model_input_files` 每项至少包含：

```json
{"class":"prompt|delivery|attachment|attachment_manifest|mapping|mapping_diff|rubric|coverage|validation|manual_review|rules|gate|source_audit|judge|answer_key|answer_guidance|run_contract|model_input","source":"artifacts/...","path":"artifacts/12_freeze/frozen/...","bytes":0,"sha256":"<64 位小写十六进制>"}
```

规则：

- `created_at` 用实际 UTC 时间；`model` 固定为 `deepseek-v4.1-flash/max`；`toolchain` 写实际探测值。
- 每个冻结文件的 `bytes`、`sha256` 必须来自实际文件；源文件与冻结副本必须逐字节一致。
- `model_input_files` 与 `frozen/model_input/` 一一对应；每条 `path` 必须从 `artifacts/12_freeze/frozen/model_input/` 起算，`source` 记录原路径。`question_files`、`expert_files` 不得出现在模型输入中。
- `files` 必须等于 `question_files + expert_files + model_input_files` 的去重并集，不能只放一类；`难点覆盖.json` 的 class 必须为 `coverage`，`校验结论.json` 的 class 必须为 `validation`，`人工复核.json` 的 class 必须为 `manual_review`，两份字段映射的 class 分别为 `mapping`/`mapping_diff`。
- 若已有冻结清单，读取其 `version`，按 `vNNN` 递增；无法解析旧版本时停止，不得覆盖成 `v001`。
- 字节一致只证明版本一致；内容正确性由 07/10/11 负责。

## 五、输出

- `artifacts/12_freeze/冻结清单.json`
- `artifacts/12_freeze/版本说明.md`：本版变化、07/10/11 门禁值、question/expert/model_input 文件数
- `artifacts/12_freeze/frozen/` 下本节点契约列出的冻结文件
- `artifacts/12_freeze/frozen/model_input/题面.md`
- `artifacts/12_freeze/frozen/model_input/A*`
- `artifacts/12_freeze/frozen/运行契约.json`

成功后最终回复最后一行为单行 JSON：`{"pass":true,"route":null,"input_files":<模型输入文件数>,"expert_files":<专家冻结文件数>}`。失败时 `route` 可使用 `04`，因为 11 校验可由 04 业务字段缺口触发。输入 hash、runId 或题包结构不一致时 host 必须拒绝启动作答；14 发现隔离审计、trace 或归档不一致时必须 fail closed，不得以结果分数继续。
