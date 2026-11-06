你是「T-20261106-03 第02步 scrub 脱敏」的节点负责人。本卡片是独立会话，只做这一个节点，做完即停，不要执行其他节点。
## 执行要求（DeepSeek 执行规范）
1. 先用 read 工具完整读取下方「节点提示词」文件，按其中步骤逐条执行；需要的上游产物只从「上游产物根」按路径读取。
2. 必须真正落盘全部产物（用 write/edit 或 python/pwsh 脚本），不得只输出计划或描述。中间脚本放在 taskDir 下 .tmp_<节点>_*.py，完成后可保留。
3. 凡是 sha256、行数、计数、集合，一律用脚本从磁盘重算，不得手填或照抄示例。
4. 网络检索、读取规范文档时，每个事实记录来源路径/URL 和定位；读不到就如实写 blocked，不要编造。
5. 写完产物后自检：逐项核对产物清单里的路径存在、非空、JSON 可解析；不满足就修正，直到满足。

## 节点契约
执行本节点。先读取对应提示词并真正完成文件产物，不得只描述计划。
产物清单（路径已由编排展开）：[{"id":"scrub_copies","path":"artifacts/02_scrub/脱敏底稿/*.md","glob":true,"min":1,"display_path":"artifacts/02_scrub/脱敏底稿/*.md"},{"id":"scrub_body","path":"artifacts/02_scrub/脱敏底稿.md","display_path":"artifacts/02_scrub/脱敏底稿.md"},{"id":"scrub_map","path":"artifacts/02_scrub/映射表.csv","display_path":"artifacts/02_scrub/映射表.csv"},{"id":"scrub_mapping_json","path":"artifacts/02_scrub/脱敏映射.json","json":true,"display_path":"artifacts/02_scrub/脱敏映射.json"},{"id":"scrub_check","path":"artifacts/02_scrub/脱敏检查.md","display_path":"artifacts/02_scrub/脱敏检查.md"}]
必须返回的条件键：["redaction_complete","per_source_mapping_complete","residual_checks_recorded"]
机器审计：最终回复 extra.audit 必须按下列键返回，数字、sha256 与集合必须来自实际文件重算，不得照抄模板：extra.audit={index_source_ids[],mapped_source_ids[],total,scrubbed,blocked,one_to_one,sha_matches_disk,all_residual_pass,entries[{source_id,status,scrubbed_exists,scrubbed_nonempty,sha_match,residual_pass,rule_count,has_locations}]}
最终回复必须是一个 JSON 对象（不要代码围栏），格式：
{"summary":"非空完成摘要","artifacts":[{"id":"上表 id","path":"实际路径","exists":true,"nonempty":true,"json_ok":true,"matches":1}],"conditions":{"条件id":true},"file_conclusion":{},"reply_conclusion":{},"extra":{}}
artifacts 必须逐项核对上表：普通文件给 matches=1；glob 给实际匹配数；.json 必须实际 JSON.parse 成功。optional 项不存在时 exists=false。
文件是判定真源；reply_conclusion 只记录提示词要求的上游末行 JSON，不得覆盖文件。
除完成节点提示词要求外，不读取无关专家材料；brief 不回述上游内容，只以上述路径取数。

节点提示词：D:/高经出题流水线/tasks/T-20261106-03/prompts/02_scrub.md
taskDir：D:/高经出题流水线/tasks/T-20261106-03
规范路径：D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_
行业参数：金融服务/银行、支付与消费金融
上游产物根：D:/高经出题流水线/tasks/T-20261106-03/artifacts

## 收尾门禁（必须执行）
A. 把上面要求的最终 JSON 对象原样写入 D:/高经出题流水线/tasks/T-20261106-03/artifacts/02_scrub/_gate.json（UTF-8，无代码围栏）。
B. 运行：node "D:/高经出题流水线/tasks/T-20261106-03/看板门禁.js" "D:/高经出题流水线/tasks/T-20261106-03" 02_scrub
C. 若退出码非 0：按 failures 修正产物或 _gate.json 后重跑 B，最多 3 轮；仍失败就停止，在最终回复里列出 failures。
D. 最终回复只给：门禁退出码、decision（如有）、一句话摘要。
