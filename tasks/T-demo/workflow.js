// 19 节点出题流水线（DSH workflow 脚本）
// 用法：主会话调用 workflow 工具，args = { taskDir: "<绝对路径>/tasks/T-xxx" }
// 每个 agent() 是独立 subagent，子对话不进父上下文，节点之间只通过 artifacts/ 文件交接。

const base = String(args.taskDir).replace(/[\\/]+$/, "")
const P = (n, name) => `${base}/prompts/${n}_${name}.md`
const A = (n, name) => `${base}/artifacts/${n}_${name}`
const done = []

// 通用节点：读提示词文件 → 执行 → 只回报产物清单
async function node(n, name, extra) {
  phase(`${n} ${name}`)
  const brief = [
    `读取并严格执行 ${P(n, name)}。`,
    `本节点产物目录：${A(n, name)}（需要时自行创建）。`,
    `上游产物根目录：${base}/artifacts/。`,
    extra || "",
    `完成后只回报：产物文件名清单 + 一句话结论。不要复述过程。`,
  ].filter(Boolean).join("\n")
  const r = await agent(brief)
  done.push({ node: `${n}_${name}`, ok: true, summary: String(r).slice(0, 400) })
  return r
}

// 判定节点：要求返回结构化 JSON
async function judge(n, name) {
  phase(`${n} ${name}（判定）`)
  const brief = [
    `读取并严格执行 ${P(n, name)}。`,
    `本节点产物目录：${A(n, name)}。`,
    `被检查对象在 ${base}/artifacts/ 下。只读，不修改任何文件。`,
    `必须把结论写入指定 JSON 文件，并在回复里只给出该 JSON 的取值。`,
  ].join("\n")
  const r = await agent(brief)
  done.push({ node: `${n}_${name}`, ok: true, summary: String(r).slice(0, 400) })
  return r
}

// 01–05 出题前端
await node("01", "src")
await node("02", "scrub")
await node("03", "survey")
await node("04", "scope")
await node("05", "evidence")

// 06 附件制造 → 07 元数据检查（带一次自动返修）
await node("06", "build")
let meta = await judge("07", "metacheck")
if (/false|不通过|fail/i.test(String(meta))) {
  phase("06 返修（07 打回）")
  await agent([
    `读取 ${P("06", "build")} 与 ${A("07", "metacheck")}/result.json。`,
    `按 findings 逐条修复 ${A("06", "wps")} 下的文件，只改元数据和残留痕迹，不动业务内容。`,
    `修完写 ${A("06", "wps")}/返修记录.md。`,
  ].join("\n"))
  meta = await judge("07", "metacheck")
  done.push({ node: "07_复检", ok: true, summary: String(meta).slice(0, 300) })
}

// 08–11
await node("08", "prompt")
await node("09", "style")
const diff = await judge("10", "difficulty")
await node("11", "rubric")
await node("12", "freeze")

// 13 独立作答：只给题面和附件，不给标答与考点
phase("13 独立作答")
const answer = await agent([
  `读取并严格执行 ${P("13", "answer")}。`,
  `题面在 ${base}/artifacts/08_prompt/题面.md。`,
  `输入附件在 ${base}/artifacts/06_wps/（只读）。`,
  `交付物写到 ${A("13", "answer")}。`,
  `不要读取 11_rubric、12_freeze、14_score、15_review 等专家侧目录。`,
  `完成后只回报交付文件名与关键数字。`,
].join("\n"))
done.push({ node: "13_answer", ok: true, summary: String(answer).slice(0, 400) })

// 14 评分
const score = await judge("14", "score")
await node("15", "review")
const qc = await judge("16", "qc")

// 17–18：只有在 16 通过时才打包
if (!/不通过|fail/i.test(String(qc))) {
  await node("17", "pack")
  await node("18", "submit")
} else {
  done.push({ node: "17_pack", ok: false, summary: "16 质检不通过，未打包" })
}

return {
  taskDir: base,
  nodes: done,
  meta_check: String(meta).slice(0, 300),
  difficulty: String(diff).slice(0, 300),
  score: String(score).slice(0, 300),
  qc: String(qc).slice(0, 300),
}
