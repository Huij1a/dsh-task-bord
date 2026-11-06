// 两节点闭环：13 独立作答 → 14 评分（用现成示范题的 A01–A13 与 60 项考点）
const base = String(args.taskDir).replace(/[\/]+$/, "")
const P = (n, name) => `${base}/prompts/${n}_${name}.md`

phase('13 独立作答')
const ans = await agent([
  `读取并严格执行 ${P('13', 'answer')}。`,
  `题面：${base}/artifacts/08_prompt/题面.md`,
  `输入附件：${base}/artifacts/06_wps/（13 份 A 系列，只读，不要修改）`,
  `交付物写到 ${base}/artifacts/13_answer/，文件名与题面完全一致。`,
  `不得读取 11_rubric、14_score 目录。`,
  `节奏：前 6 轮摸清结构并写好加载脚本，之后每 8 轮至少落盘一份交付物。`,
  `完成后只回报交付文件名与关键数字。`,
].join('\n'))

phase('14 评分')
const score = await agent([
  `读取并严格执行 ${P('14', 'score')}。`,
  `考点：${base}/artifacts/11_rubric/rubric.json`,
  `答卷目录：${base}/artifacts/13_answer/`,
  `判定脚本：${base}/artifacts/11_rubric/judge.py（可用 python 执行，参数：答卷 xlsx、--rubric rubric.json、--inputs 指向 06_wps）`,
  `把结果写成 ${base}/artifacts/14_score/评分.json，并在回复里只给出 score/total/pass 三个值。`,
].join('\n'))

return { answer: String(ans).slice(0, 600), score: String(score).slice(0, 600) }
