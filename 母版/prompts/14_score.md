# 14 评分（固定脚本判定与分卷汇总）

## 任务

用冻结 rubric 对 13 当前卷的独立答卷执行一次可复现评分，并按当期冻结门槛判定难度。默认只跑首卷 `C01`；只有满足本文件精确定义的补卷条件时，才允许 host 新建补卷 `C02` 并再执行一次本节点。14 只执行冻结脚本、核验题包证据、写分卷报告和汇总；不修改答卷、题包元数据、rubric、门槛或运行记录，不凭印象改分，也不另起人工评分。

## 输入

`taskDir` 内路径相对 `taskDir`。当前卷固定使用以下对象：

1. `artifacts/12_freeze/冻结清单.json`：冻结真源和 `model_input.allowlist_sha256`。
2. `artifacts/12_freeze/frozen/rubric.json`：冻结后的逐项评分契约。
3. `artifacts/12_freeze/frozen/项目门槛.json`：冻结后的唯一难度门槛。
4. `artifacts/12_freeze/frozen/judge.py`：冻结后的确定性评分脚本。
5. `artifacts/12_freeze/frozen/运行契约.json`：校验外部题包布局、输入白名单、隔离审计和宿主 trace 契约；声明不一致时 fail closed。
6. `artifacts/12_freeze/frozen/诊断.json` 与 `artifacts/12_freeze/frozen/校验结论.json`：仅在两卷同分且没有可比较数值下界时用于离线选卷；不得据此改分。
7. `artifacts/12_freeze/frozen/rules.py`：仅当 rubric 含 `derived` 项时必需；由 11 产出、12 冻结。
8. `artifacts/12_freeze/frozen/人工复核.json`：仅当 rubric 含 `manual` 项时必需；其 hash 也必须在冻结清单中。
9. 当前卷 `<answerPackage>/output/`：13 的全部交付物；`<answerPackage>/output/运行记录.json` 只作自报对照。
10. 当前卷 `<answerPackage>/host_trace.json`：host 生成，是 `started_at/ended_at/minutes/rounds` 的唯一权威来源。
11. 当前卷 `artifacts/13_answer/<runId>/隔离审计.json`：最终由 host-owned `authoring_isolate` 在 judge 成功后落盘，证明题包在 `taskDir` 外、输入白名单和 hash、初始输出为空、brief 无项目路径并绑定同批 13 会话。该文件只在任务侧分卷归档，不在外部题包根。

`answerPackage` 固定为 `D:\高经作答区\<taskId>\<runId>`，其中 `taskId` 严格等于 `taskDir` 目录名；首卷 `runId=C01`，唯一补卷 `runId=C02`。`runId` 必须匹配 `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`。首卷和补卷各自使用独立题包，不能从 `taskDir` 内的历史本地副本、旧归档或上一卷输出取数。

模型固定为 `deepseek-v4.1-flash/max`。缺少冻结文件、输入 hash 或字段不一致时 fail closed，不得改读活目录中的旧副本。宿主 trace 至少包含 `schema_version=1`、`model`、`started_at`、`ended_at`、`minutes`、`rounds`、`source="host"`；可选含 `task_id/run_id`，一旦出现必须分别等于当前 `taskId/runId`。缺字段、模型不符、时间倒置或与自报值不一致时 `runtime_valid=false/fail_closed=true`。v006 不接受仅凭自报运行记录通过。

## 执行顺序

1. 解析当前卷 `runId` 和 `answerPackage`；拒绝相对路径、父目录、符号链接/junction、与 `taskDir` 重叠或不符合固定布局的题包。首卷只能是 `C01`，补卷只能是 `C02`。
2. 校验冻结清单中的专家侧文件及 `model_input_files` 存在、`bytes/sha256` 匹配；任何重算不一致即 fail closed，不重跑 13。
3. 在当前 14 workflow 子会话通过 `exec` 定位同批 `phase/label=13` 的作答子会话，调用 `authoring_isolate({taskId, runId, answerPackage, phase:"precheck"})`。该调用必须尽力生成题包根 `host_trace.json`，并把审计写到归档目标之外的固定临时路径 `artifacts/13_answer/.host-audit/<runId>.json`；不得直接把审计写到 `artifacts/13_answer/<runId>/`。`authoring_isolate` 应返回结构化 `isolation_pass`：审计结论为 fail 时仍返回该字段，不得把“审计不通过”本身当作基础设施异常；`ok=false` 或 `isolation_pass=false` 也不能替代对已落盘临时审计与 trace 的结构核验。14 必须区分结构可用性与隔离结论：只有临时审计和 trace 都无法生成、不可解析、身份无法绑定或缺少判断所需结构时，才是隔离机制失效，立即 fail closed 交人，不得调用 judge 或启动 C02；会话证据缺失但工具仍写出了结构完整的 invalid 审计与 trace 时，继续按第 4 步处理。
4. 只读校验 `artifacts/13_answer/.host-audit/<runId>.json`：先核对结构完整性，根字段齐全，`schema_version=1`、`task_id=<taskId>`、`run_id=<runId>`、`model=deepseek-v4.1-flash/max`、`package_root/input_dir/output_dir` 与当前题包一致，`checks` 恰好覆盖 `PACKAGE_OUTSIDE_TASK_DIR/RUN_ID_MATCH/INPUT_ALLOWLIST/INPUT_HASH/OUTPUT_EMPTY/BRIEF_NO_TASKDIR` 六项且每项含 `status`，`input_files` 数组及 `violations` 数组可读；结构不完整或身份不一致即 fail closed 停人。再判断隔离结论：仅当 `pass=true`、`output_was_empty=true`、`brief_contains_no_task_dir=true`、六项 `status=pass`、`violations=[]`，且 `input_files` 与冻结清单的 `model_input_files` 逐路径、逐 bytes、逐 sha256 相等并与题包实际 input 一致时，`isolation_valid=true`；任一内容条件不满足只记 `isolation_valid=false`，不得跳过 judge。随后只读核验 `<answerPackage>/host_trace.json` 的 7 个必需字段、`source="host"`、可选身份和自报一致性；文件必须可解析且身份可绑定，否则按结构故障停人。14 不修改审计或 trace。`isolation_valid=false` 或 trace 内容校验失败时把当前卷记为 invalid，但只要题包路径安全且 13 题包仍可读取，仍执行本卷唯一一次 judge 以留下评分/归档证据，judge 分数不得把该卷救回有效卷。
5. 校验 `<answerPackage>/output/` 是目录且 `运行记录.json`、`作答说明.md`、`进度断点.json` 存在；题面要求的其它交付物存在性由 judge/rubric 判定。必需交付缺失同样把当前卷记为 invalid，不跳过 judge；judge 必须对缺失 fail closed，不得由 14 补造文件或默认值。
6. 在调用 judge 前只做归档路径预检：解析 `artifacts/13_answer/<runId>/` 的绝对路径，确认它是 `taskDir/artifacts/13_answer` 的直接子目录且不是 symlink/junction；若目录已存在，仅确认它是普通目录，不手工删除、清空或写入。清空旧内容由 judge 的 `--copy-to` 在受控路径内通过 staging 生成完整副本后原子替换目标完成；目标最终不得合并任何旧文件。预检失败即停，不调用 judge，也不得用 C02 绕过归档路径错误。
7. 对当前卷执行且只执行一次固定命令：

```text
python "$taskDir/artifacts/12_freeze/frozen/judge.py" \
  --answers "$answerPackage/output" \
  --rubric "$taskDir/artifacts/12_freeze/frozen/rubric.json" \
  --gate "$taskDir/artifacts/12_freeze/frozen/项目门槛.json" \
  --runtime "$answerPackage/output/运行记录.json" \
  --inputs "$answerPackage/input" \
  --host-trace "$answerPackage/host_trace.json" \
  --task-dir "$taskDir" \
  --run-id "$runId" \
  --copy-to "$taskDir/artifacts/13_answer/$runId" \
  --json "$taskDir/artifacts/14_score/$runId/评分.json"
```

8. 只接受 `artifacts/14_score/<runId>/评分.json` 作为当前卷评分结果。`--copy-to` 是本节点对答卷的唯一归档动作，目标必须解析为 `taskDir/artifacts/13_answer/<runId>`；judge 必须原子清空并替换该目标，14 不再手工复制、预删、补项或合并旧文件。报告中的 `copy.files` 必须逐文件记录相对 `path/bytes/sha256`，且与 judge 归档时的题包输出及目标答卷文件完全一致；之后 finalize 新增的唯一 host-owned 文件是 `隔离审计.json`，不得混入 `copy.files`。`host_trace_sha256` 只能采用 judge 对当前 trace 的计算值，14 不自行改写。
9. judge 进程完成且 `评分.json` 落盘后，在同一 14 会话调用 `authoring_isolate({taskId, runId, answerPackage, phase:"finalize"})`；即使临时审计本身 `pass=false`、该卷已记为 invalid 或报告 `fail_closed=true`，只要临时审计结构完整、judge 已写出可解析报告并完成归档，也必须 finalize，保留无效证据。finalize 必须接受结构合法但隔离结论为 fail 的审计；它只把已核验的临时审计 `.host-audit/<runId>.json` 复制/移动为 `artifacts/13_answer/<runId>/隔离审计.json`，不得重扫 13 会话、重算输入/评分或触碰答卷其它文件。随后只读确认最终审计存在、内容/hash 与临时审计一致且题包输入未变化。缺少评分、目标归档、临时审计或复制失败即 fail closed；不得由 14 手工伪造最终审计。
10. 仅 `runId=C01` 时，报告完成后写 `artifacts/14_score/补卷判定.json`，按下文规则决定是否需要 `C02`。若不需要补卷，直接按唯一卷生成 `汇总.json`；若需要，当前 14 会话结束并交回编排，host 新建 C02 题包、执行 13，然后再以 `runId=C02` 调用 14。`runId=C02` 时只读既有 `补卷判定.json`，必须核对 `first_run_id=C01`、`supplement_required=true`、`supplement_run_id=C02` 且 `frozen_input_sha256` 与当前冻结清单一致；任一不符即停人，不得改判触发事实或补跑。C02 完成前不得提前写“两卷通过”的汇总。隔离机制失效、题包路径不安全、归档目标不可用或 judge 无法写出报告属于流程故障，不满足正常补卷条件，必须停人处理，不得借 C02 重试。
11. C02 评分完成后汇总 `C01` 和 `C02`（首卷若 invalid 也保留），写出 `汇总.json`。报告写好后不得再改分、抽项、补项或按整体质量调分；不得有第三次作答、第三卷或同一卷二次 judge。

## rubric 执行契约

脚本必须逐条读取 rubric 并按下表执行：

- `TRUE`：实际值满足 `expect`；按 item 分值得分。数值按 item 的 `unit`、显式 `tol` 比较，`tol=0` 也必须执行。
- `FALSE`：值存在且明确不满足；不得分，但属于有效判定。
- `MISSING`：交付文件、part、key、行、单元格或 anchor 找不到；单列到 `missing_items`，不得分。
- `UNJUDGED`、`ERROR`：没有可执行判定结果或解析失败；单列并 fail closed。
- `cell`、`summary`、`row`：仅支持 `.xlsx`。
- `section`：仅支持 `.md`、`.txt`，必须用 `start_anchor/end_anchor` 截取唯一区段；不得对全文判定。
- `derived`：仅在冻结 `rules.py` 返回该 item 的独立复算结果时可判；没有结果时 `UNJUDGED`。
- `manual`：judge 读取与冻结 rubric 同目录的 `人工复核.json`，核对 `rubric_sha256`、manual R ID 一一对应及每个证据文件的 `artifact_path/artifact_sha256`；`pass/fail` 分别计 TRUE/FALSE，缺文件、缺项、重复项或 hash 不符时 `UNJUDGED/ERROR` 并 fail closed。

`match_mode` 必须显式并严格执行：`numeric`、`boolean`、`exact`、`contains_all`、`contains_any`、`regex`、`derived_rule`、`manual_review`。新 rubric 不得使用隐式双向子串；`exact` 是归一后完全相等，包含匹配只能由 `contains_all/contains_any` 在已截取的坐标或受控区段内完成。

## 运行记录与门槛

`运行记录.json` 必须能解析且满足：

```json
{
  "run_id": "<当前 runId>",
  "model": "deepseek-v4.1-flash/max",
  "started_at": "<带时区 ISO-8601>",
  "ended_at": "<带时区 ISO-8601>",
  "minutes": 0,
  "rounds": 0,
  "natural_finish": true,
  "rounds_source": "self-report",
  "host_trace_status": "not_available"
}
```

`score_max`、`score_rule` 必须非 `null` 且 `extraction_status` 为 `extracted`；否则 fail closed。可选门槛 `any_of` 的规则固定为：

- 规范未写：`any_of=null` 且 `extraction_status.any_of="not_applicable"`，`any_of_applicable=false`、`any_of_ok=true`，不参与难度判定。
- 规范已写且成功提取：`any_of` 为非空数组且状态为 `extracted`；OR 条件至少一个成立才 `any_of_ok=true`。
- `any_of=[]`、`null` 但状态不是 `not_applicable`、`unparseable`、`conflict` 均 fail closed。
- `freebie_ratio_max` 不在 14 判定范围；14 不得自行读取或重算。

`score`、`total`、`true`、`false`、`missing`、`unjudged`、`error` 取 judge 评分计数；`minutes`、`rounds` 必须取当前卷宿主 trace，并用自报值做一致性核对，报告 `runtime_source="host_trace"`、`host_trace_status="verified"`。`host_trace.json` 缺失、不可解析或自报值不一致时 fail closed；不得把自报值写成宿主已验证。任何来源都不做单位换算、不补默认值。`any_of.metric` 只能使用这九个键，未知 metric、非法 op、非有限数字或所需指标缺失均 fail closed。

计算规则固定为：

```text
score_ok = compare(score, score_rule, score_max)
any_of_ok = true                                   if any_of_status == not_applicable
any_of_ok = any(compare(actual[m], op, value) ...) if any_of_status == extracted
difficulty_pass = score_ok AND any_of_ok AND NOT fail_closed
pass = difficulty_pass AND runtime_valid AND natural_finish
```

`missing`、`unjudged`、`error`、rubric 校验失败、隔离审计失败、冻结 hash 不一致、运行记录缺失或任一所读文件解析失败，均令该卷 `fail_closed=true`，此时该卷 `difficulty_pass=false`、`pass=false`。`natural_finish=false` 保留可读评分和门槛结论，但该卷 `pass=false` 且无资格进入最终比较。

## 补卷判定

首卷 `C01` 评分完成后，必须先判断“是否需要唯一补卷”，不得凭主观感觉补跑。`补卷判定.json` 的计算口径固定为：

```text
score_trigger =
  score 是有限数 AND score_max 是有限数 AND score_max-10 <= score <= score_max

rounds_trigger =
  ∃ frozen any_of 条目，metric=rounds，op ∈ {>=,>,gte,ge}，
  其 value=t 为有限数且 t>=0，
  且 t <= run.rounds <= t*1.2

minutes_trigger =
  ∃ frozen any_of 条目，metric=minutes，op ∈ {>=,>,gte,ge}，
  其 value=t 为有限数且 t>=0，
  且 t <= run.minutes <= t+5

first_invalid =
  隔离审计 pass!=true OR host trace/runtime invalid OR
  13 必需交付缺失 OR 13 natural_finish!=true OR judge fail_closed=true

frozen_input_stable =
  当前 frozen/model_input 逐文件 bytes/sha256 与冻结清单一致
  AND model_input.allowlist_sha256 可由该清单重算一致

supplement_required =
  frozen_input_stable AND (score_trigger OR rounds_trigger OR minutes_trigger OR first_invalid)
```

解释与限制：

- `score_max-10`、`t*1.2`、`t+5` 是本流程固定补卷规则，不是业务门槛；不得再写死其它分数、轮数或分钟阈值。
- rounds/minutes 只认冻结 `any_of` 中明确的下界条目；`<=`、`<`、`lte`、`le` 等上界条目、未知 metric 或非法值都不得生成补卷触发。无对应下界条目时该 trigger 为 `false`，不能自行补出“默认 1 轮”或固定分钟数。
- `first_invalid` 时保留首卷题包、答卷、trace、隔离审计和评分报告原样作为无效证据；不得覆盖 C01、删除证据或把无效卷当低分卷。C02 是新题包，不是同一卷的续跑。
- 若 `supplement_required=true`，host 必须用同一冻结输入新建 `D:\高经作答区\<taskId>\C02`，执行独立 13，完成后以 `C02` 再调用本节点。C01 的 `补卷判定.json` 先落盘，之后不得修改其触发事实。
- 最多补一次，`supplement_run_id` 只能是 `C02`；C02 无效、低分或仍不达标均不再生成 C03，直接进入最终汇总并交人。
- `frozen_input_stable=false` 时即使 trigger 为 true 也不得补卷；写 `supplement_required=false`、`stop_reason="frozen_input_changed"`，停在首卷报告交人处理。不得自动改 12、题面、附件、rubric 或门槛。

`补卷判定.json` 至少包含：

```json
{
  "schema_version": 1,
  "first_run_id": "C01",
  "supplement_required": false,
  "supplement_run_id": "C02|null",
  "trigger_reasons": ["score_near_max|rounds_near_lower_bound|minutes_near_lower_bound|first_invalid"],
  "frozen_input_stable": true,
  "frozen_input_sha256": "<model_input.allowlist_sha256>",
  "first_run": {
    "score": 0,
    "score_max": 0,
    "minutes": 0,
    "rounds": 0,
    "isolation_audit_pass": true,
    "host_trace_status": "verified",
    "natural_finish": true,
    "fail_closed": false,
    "difficulty_pass": false,
    "pass": false
  },
  "stop_reason": "supplement_required|no_supplement_trigger|frozen_input_changed"
}
```

## 两卷汇总与选卷

最终 `run_ids` 只能是 `["C01"]` 或 `["C01","C02"]`。先判定每卷的有效性：`隔离审计 pass=true`、输入/冻结 hash 一致、host trace verified、必需交付齐全、`natural_finish=true`、报告可解析且 `fail_closed=false` 才是有效卷。无效卷必须保留证据，但不参与分数高低比较。

- 有效卷只有一卷时选择该卷；两卷均无效时 `selected_run_id=null`，汇总 `pass=false`，`stop_reason="no_valid_run"`。
- 两卷均有效时先选 `score` 更高者，不因卷号或运行先后改分。同分时按冻结 `any_of` 的既有顺序逐条比较数值下界：先比较是否满足，满足者优先；双方满足或双方不满足时，比较 `abs(actual-threshold)`，距离更小者优先。不得临时新增权重、门槛或指标。
- 冻结 `any_of` 没有可比较的数值下界时，同分只用冻结离线证据比较：先比较 `artifacts/12_freeze/frozen/诊断.json.blocking` 数量，再比较其中 `fail/pending` 数量，再比较 `artifacts/12_freeze/frozen/校验结论.json` 的 fatal、major、issue 数量；数值小者更接近通过。该比较只可读取冻结文件并记录原路径、字段和值，不得读取未冻结的 10/11 活文件。
- 若上述离线证据仍完全相同，保留首卷 `C01`，并在 `selection_evidence.tie_break="stable_first_run"` 中说明。选卷规则和全部比较值必须写入 `汇总.json`，不得只给结论。

`汇总.json` 至少包含：

```json
{
  "schema_version": 1,
  "run_ids": ["C01"],
  "runs": [
    {
      "run_id": "C01",
      "answer_package": "D:\\高经作答区\\<taskId>\\C01",
      "report_path": "artifacts/14_score/C01/评分.json",
      "score": 0,
      "score_max": 0,
      "rounds": 0,
      "minutes": 0,
      "isolation_audit_pass": true,
      "host_trace_status": "verified",
      "natural_finish": true,
      "difficulty_pass": false,
      "pass": false,
      "fail_closed": false,
      "valid": true
    }
  ],
  "supplement": {
    "required": false,
    "decision_path": "artifacts/14_score/补卷判定.json"
  },
  "selected_run_id": "C01|null",
  "selection_rule": "higher_score_then_frozen_offline_closest",
  "selection_evidence": {},
  "pass": false,
  "stop_reason": "complete|difficulty_not_met|no_valid_run|frozen_input_changed|supplement_pending"
}
```

`runs[]` 必须逐卷原样记录外部题包根 `answer_package`，其值只能是 `D:\高经作答区\<taskId>\<runId>`；16 用它定位该卷隔离审计和 host trace，不得从目录名另造路径。只有 `selected_run_id` 非空、所选卷 `difficulty_pass=true` 且其 `pass=true` 时，汇总 `pass` 才能为 `true`、`stop_reason="complete"`。所选卷难度不达标时 `stop_reason="difficulty_not_met"`，14 默认停机交人，自动返修次数为 0。补卷尚待执行时不得写通过汇总；只能写 `supplement_pending`。

## 分卷报告与输出

每卷评分报告固定写到 `artifacts/14_score/<runId>/评分.json`，至少包含：

```json
{
  "score": 0,
  "total": 100,
  "run": {
    "minutes": 0,
    "rounds": 0,
    "runtime_source": "host_trace",
    "host_trace_status": "verified",
    "host_trace_sha256": "<64位小写十六进制>"
  },
  "score_ok": false,
  "any_of_applicable": false,
  "any_of_status": "not_applicable",
  "any_of_ok": true,
  "difficulty_pass": false,
  "pass": false,
  "fail_closed": false,
  "threshold": {
    "score_max": 100,
    "score_rule": ">=",
    "any_of": null,
    "extraction_status": {"score_max": "extracted", "score_rule": "extracted", "any_of": "not_applicable"}
  },
  "true": 0,
  "false": 0,
  "missing": 0,
  "unjudged": 0,
  "error": 0,
  "missing_items": [],
  "unjudged_items": [],
  "error_items": [],
  "validation_errors": [],
  "copy": {
    "source": "<answerPackage/output 绝对路径>",
    "destination": "<taskDir/artifacts/13_answer/<runId> 绝对路径>",
    "files": [{"path": "<相对路径>", "bytes": 0, "sha256": "<64位小写十六进制>"}]
  },
  "detail": []
}
```

其中 `score`、`total`、`run.minutes`、`run.rounds`、`run.host_trace_sha256`、`score_ok`、`any_of_applicable`、`any_of_status`、`any_of_ok`、`difficulty_pass`、`pass`、`fail_closed`、`copy` 为必备字段。`copy.files` 必须与 judge 归档时的答卷文件逐文件深等，并可排除 finalize 后新增的 `隔离审计.json`；归档复制失败、目标合并旧文件、归档路径不是当前卷或 hash 无法核验时 `fail_closed=true`、`pass=false`。MISSING 同时出现在计数、ID 列表与逐项 `detail.status` 中，不得当 FALSE 混算或给分。`detail` 中每个 item 必须保留 rubric `difficulty_id`、`match_mode`、状态、实际值和证据定位。

14 只写：
- `artifacts/14_score/<runId>/评分.json`
- `artifacts/14_score/补卷判定.json`（首卷后）
- `artifacts/14_score/汇总.json`（所有允许的卷结束后）

## 失败处理

- 14 失败后停在报告，不自动返修、不自行改 rubric、门槛、冻结或题包；难度不达标默认停机人工。
- 隔离审计、题包结构、输入 hash 或 `host_trace.json` 不一致时写 fail-closed 报告，不以结果分数覆盖证据。`host_trace.json` 缺失或与自报值不一致时由 host 修复 trace，14 不得用自报值补造。
- 不读取 B 系列、答案核验、作答思路等专家材料来改判 13 的答案。
- 不以“整体合理”“关键结论正确”“人工复核可给分”等理由覆盖脚本判定。
- 最后一行为单行合法 JSON，字段必须与本次 `评分.json` 或 `汇总.json` 的当前结论一致；补卷待执行时须明确 `supplement_pending`，不得伪报通过：

```json
{"run_id":"C01","score":0,"run":{"minutes":0,"rounds":0},"difficulty_pass":false,"pass":false,"supplement_required":false,"stop_reason":"difficulty_not_met"}
```
