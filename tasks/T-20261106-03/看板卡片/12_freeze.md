你是「T-20261106-03 第12步 freeze 冻结」的节点负责人。本卡片是独立会话，只做这一个节点，做完即停，不要执行其他节点。
## 执行要求（DeepSeek 执行规范）
1. 先用 read 工具完整读取下方「节点提示词」文件，按其中步骤逐条执行；需要的上游产物只从「上游产物根」按路径读取。
2. 必须真正落盘全部产物（用 write/edit 或 python/pwsh 脚本），不得只输出计划或描述。中间脚本放在 taskDir 下 .tmp_<节点>_*.py，完成后可保留。
3. 凡是 sha256、行数、计数、集合，一律用脚本从磁盘重算，不得手填或照抄示例。
4. 网络检索、读取规范文档时，每个事实记录来源路径/URL 和定位；读不到就如实写 blocked，不要编造。
5. 写完产物后自检：逐项核对产物清单里的路径存在、非空、JSON 可解析；不满足就修正，直到满足。

## 节点契约
执行本节点。先读取对应提示词并真正完成文件产物，不得只描述计划。
产物清单（路径已由编排展开）：[{"id":"freeze_manifest","path":"artifacts/12_freeze/冻结清单.json","json":true,"display_path":"artifacts/12_freeze/冻结清单.json"},{"id":"version_notes","path":"artifacts/12_freeze/版本说明.md","display_path":"artifacts/12_freeze/版本说明.md"},{"id":"frozen_prompt","path":"artifacts/12_freeze/frozen/题面.md","display_path":"artifacts/12_freeze/frozen/题面.md"},{"id":"frozen_delivery","path":"artifacts/12_freeze/frozen/交付规格.json","json":true,"display_path":"artifacts/12_freeze/frozen/交付规格.json"},{"id":"frozen_attachment_facts","path":"artifacts/12_freeze/frozen/附件事实快照.json","json":true,"display_path":"artifacts/12_freeze/frozen/附件事实快照.json"},{"id":"frozen_mapping","path":"artifacts/12_freeze/frozen/字段映射.json","json":true,"display_path":"artifacts/12_freeze/frozen/字段映射.json"},{"id":"frozen_mapping_diff","path":"artifacts/12_freeze/frozen/字段映射差量.json","json":true,"display_path":"artifacts/12_freeze/frozen/字段映射差量.json"},{"id":"frozen_diagnosis","path":"artifacts/12_freeze/frozen/诊断.json","json":true,"display_path":"artifacts/12_freeze/frozen/诊断.json"},{"id":"frozen_rubric","path":"artifacts/12_freeze/frozen/rubric.json","json":true,"display_path":"artifacts/12_freeze/frozen/rubric.json"},{"id":"frozen_coverage","path":"artifacts/12_freeze/frozen/难点覆盖.json","json":true,"display_path":"artifacts/12_freeze/frozen/难点覆盖.json"},{"id":"frozen_validation","path":"artifacts/12_freeze/frozen/校验结论.json","json":true,"display_path":"artifacts/12_freeze/frozen/校验结论.json"},{"id":"frozen_project_gate","path":"artifacts/12_freeze/frozen/项目门槛.json","json":true,"display_path":"artifacts/12_freeze/frozen/项目门槛.json"},{"id":"frozen_spec_excerpt","path":"artifacts/12_freeze/frozen/规范摘录.md","display_path":"artifacts/12_freeze/frozen/规范摘录.md"},{"id":"frozen_attachment_manifest","path":"artifacts/12_freeze/frozen/附件清单.json","json":true,"display_path":"artifacts/12_freeze/frozen/附件清单.json"},{"id":"frozen_judge","path":"artifacts/12_freeze/frozen/judge.py","display_path":"artifacts/12_freeze/frozen/judge.py"},{"id":"frozen_b_index","path":"artifacts/12_freeze/frozen/B索引.json","json":true,"display_path":"artifacts/12_freeze/frozen/B索引.json"},{"id":"frozen_b_files","path":"artifacts/12_freeze/frozen/B*","glob":true,"min":1,"display_path":"artifacts/12_freeze/frozen/B*"},{"id":"frozen_answer_check","path":"artifacts/12_freeze/frozen/答案核验.md","display_path":"artifacts/12_freeze/frozen/答案核验.md"},{"id":"frozen_answer_guidance","path":"artifacts/12_freeze/frozen/作答思路.md","display_path":"artifacts/12_freeze/frozen/作答思路.md"},{"id":"frozen_common_errors","path":"artifacts/12_freeze/frozen/易错点.md","display_path":"artifacts/12_freeze/frozen/易错点.md"},{"id":"model_input_prompt","path":"artifacts/12_freeze/frozen/model_input/题面.md","display_path":"artifacts/12_freeze/frozen/model_input/题面.md"},{"id":"model_input_attachments","path":"artifacts/12_freeze/frozen/model_input/A*","glob":true,"min":1,"display_path":"artifacts/12_freeze/frozen/model_input/A*"},{"id":"run_contract","path":"artifacts/12_freeze/frozen/运行契约.json","json":true,"display_path":"artifacts/12_freeze/frozen/运行契约.json"},{"id":"frozen_rules","path":"artifacts/12_freeze/frozen/rules.py","optional":true,"display_path":"artifacts/12_freeze/frozen/rules.py"},{"id":"frozen_manual_review","path":"artifacts/12_freeze/frozen/人工复核.json","json":true,"optional":true,"display_path":"artifacts/12_freeze/frozen/人工复核.json"}]
判定真源：artifacts/12_freeze/冻结清单.json；必须读取该 JSON，并把键 pass,route 的投影放入 file_conclusion。
12 的 file_conclusion.pass 必须由冻结清单.json.gates 与 09/10/11/07 的真实文件共同推导：任一上游门禁不为 true 或冻结清单缺 gate 时为 false；route 取失败的上游 route（04/07/10/11/05/06/08/09/null）。reply_conclusion 只放提示词末行 JSON。
必须返回的条件键：["freeze_schema_valid","freeze_hashes_ok","model_input_allowlist_ok","run_contract_ok"]
最终回复必须是一个 JSON 对象（不要代码围栏），格式：
{"summary":"非空完成摘要","artifacts":[{"id":"上表 id","path":"实际路径","exists":true,"nonempty":true,"json_ok":true,"matches":1}],"conditions":{"条件id":true},"file_conclusion":{},"reply_conclusion":{},"extra":{}}
artifacts 必须逐项核对上表：普通文件给 matches=1；glob 给实际匹配数；.json 必须实际 JSON.parse 成功。optional 项不存在时 exists=false。
文件是判定真源；reply_conclusion 只记录提示词要求的上游末行 JSON，不得覆盖文件。
除完成节点提示词要求外，不读取无关专家材料；brief 不回述上游内容，只以上述路径取数。

节点提示词：D:/高经出题流水线/tasks/T-20261106-03/prompts/12_freeze.md
taskDir：D:/高经出题流水线/tasks/T-20261106-03
规范路径：D:\字节项目\高经济价值【八期】任务说明文档LANCER.V1_
行业参数：金融服务/银行、支付与消费金融
上游产物根：D:/高经出题流水线/tasks/T-20261106-03/artifacts

## 收尾门禁（必须执行）
A. 把上面要求的最终 JSON 对象原样写入 D:/高经出题流水线/tasks/T-20261106-03/artifacts/12_freeze/_gate.json（UTF-8，无代码围栏）。
B. 运行：node "D:/高经出题流水线/tasks/T-20261106-03/看板门禁.js" "D:/高经出题流水线/tasks/T-20261106-03" 12_freeze
C. 若退出码非 0：按 failures 修正产物或 _gate.json 后重跑 B，最多 3 轮；仍失败就停止，在最终回复里列出 failures。
D. 最终回复只给：门禁退出码、decision（如有）、一句话摘要。
