// HISTORICAL / DO NOT USE FOR v006+: 旧版 13→14 两节点闭环。
// v006 的主流程、外部题包、隔离审计和分卷评分统一由 workflow.js 执行。
// 本文件仅保留历史审计，不再适配新契约。
// args = { taskDir, specPath, industry }

const MODEL_ROUTE = Object.freeze({
  provider: "opencode-go",
  model: "deepseek-v4.1-flash",
})
const MODEL_LABEL = "deepseek-v4.1-flash/max"

function cleanRoot(value) {
  let text = String(value || "").trim().replace(/\\/g, "/")
  while (text.endsWith("/")) text = text.slice(0, -1)
  return text
}

function short(value, limit) {
  return String(value == null ? "" : value).slice(0, limit || 500)
}

const base = cleanRoot(args && args.taskDir)
const specPath = String((args && args.specPath) || "").trim()
const industry = String((args && args.industry) || "").trim()

if (!base || !specPath || !industry) {
  return {
    ok: false,
    reason: "args.taskDir、args.specPath、args.industry 均为必填",
    taskDir: base,
    model: MODEL_LABEL,
    next: null,
  }
}

const P = (n, name) => `${base}/prompts/${n}_${name}.md`
const THRESHOLDS = `${base}/artifacts/00_spec/项目门槛.json`
const sandbox = `${base}/_answer_sandbox`

function options(label) {
  return {
    label: `${MODEL_LABEL} | ${label}`,
    provider: MODEL_ROUTE.provider,
    model: MODEL_ROUTE.model,
  }
}

function common() {
  return [
    `模型固定为 ${MODEL_LABEL}；不得切换模型。`,
    `当前行业：${industry}`,
    `当期规范：${specPath}`,
    `项目门槛：${THRESHOLDS}`,
  ].join("\n")
}

function lastLineJson(value) {
  const lines = String(value == null ? "" : value).split(/\r?\n/)
  let line = ""
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim()) {
      line = lines[i].trim()
      break
    }
  }
  if (!line) {
    return {
      pass: false,
      parse_error: true,
      reason: "agent 没有返回可解析的最后一行 JSON",
    }
  }
  try {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        pass: false,
        parse_error: true,
        reason: "最后一行不是 JSON 对象",
        raw_last_line: short(line, 1000),
      }
    }
    return parsed
  } catch (e) {
    return {
      pass: false,
      parse_error: true,
      reason: `最后一行 JSON 解析失败：${String((e && e.message) || e)}`,
      raw_last_line: short(line, 1000),
    }
  }
}

phase("s2 前置检查（只读）")
const gateRaw = await agent([
  common(),
  "你是只读门禁检查员，不得写入、移动或删除任何文件。",
  "检查以下条件：",
  "- artifacts/00_spec/项目门槛.json 存在且可解析",
  "- artifacts/08_prompt/题面.md 存在且非空",
  "- artifacts/11_rubric/rubric.json 与 artifacts/11_rubric/作答思路.md 存在且非空",
  "- artifacts/12_freeze/冻结清单.json 存在且可解析",
  `- _answer_sandbox/input/ 已由 12 冻结节点准备好，含题面和全部 A 系列附件`,
  "- _answer_sandbox/input/ 中的文件哈希与冻结清单一致",
  "回复最后一行必须是单行合法 JSON：{\"pass\":true,\"missing\":[],\"reason\":\"\"}；失败时 pass=false。",
].join("\n"), options("s2_gate"))
const gate = lastLineJson(gateRaw)
if (gate.pass !== true) {
  return {
    ok: false,
    reason: `s2 前置检查不通过：${short(gate.reason || gate.missing || "未知原因", 400)}`,
    taskDir: base,
    gate,
    next: null,
    model: MODEL_LABEL,
  }
}

phase("13 独立作答（隔离）")
const answerStartedAt = new Date()
const answerRaw = await agent([
  `模型固定为 ${MODEL_LABEL}；不得切换模型。`,
  `当前行业：${industry}`,
  "当期规范已由上游转换为冻结输入；作答者不得读取、推断或索取规范原文及其路径。",
  "项目门槛已由上游锁定，作答者不得读取、推断或索取其内部表示。",
  `读取并严格执行 ${P("13", "answer")}。`,
  `任务根目录：${base}`,
  `唯一允许读取的模型输入：${sandbox}/input/`,
  `唯一允许写入的位置：${sandbox}/`,
  `交付物写到：${sandbox}/output/`,
  "不得读取专家侧的考点、标答、评分、质检或冻结审计材料。",
  "开始和结束时间写入交付目录的 运行记录.json；中途终止也要如实写 natural_finish=false 和自报 rounds。",
  "不得增加题面之外的节奏、轮数、每几轮落盘或本机软件约束。",
  "完成后只回报交付文件名、关键数字和自然结束状态。",
].join("\n"), options("13_answer_isolated"))
const answerEndedAt = new Date()
const answerTiming = {
  started_at: answerStartedAt.toISOString(),
  ended_at: answerEndedAt.toISOString(),
  minutes: Math.max(0, (answerEndedAt.getTime() - answerStartedAt.getTime()) / 60000),
}

if (answerRaw == null) {
  return {
    ok: false,
    reason: "13 独立作答未返回结果",
    taskDir: base,
    gate,
    answer_timing: answerTiming,
    next: null,
    model: MODEL_LABEL,
  }
}

phase("14 评分（判定）")
const scoreRaw = await agent([
  common(),
  `读取并严格执行 ${P("14", "score")}。`,
  "评分前先把 _answer_sandbox/output/ 完整复制到 artifacts/13_answer/，包括 运行记录.json。",
  "只使用 artifacts/11_rubric/rubric.json、artifacts/00_spec/项目门槛.json 和 运行记录.json。",
  `workflow 在 13 前后的观测计时：${JSON.stringify(answerTiming)}。只用于与运行记录交叉核验；run 的最终取值仍来自 运行记录.json。`,
  "MISSING 单列且不得分；输出 artifacts/14_score/评分.json。",
  "回复最后一行必须是单行合法 JSON，包含 score、run、difficulty_pass、pass。",
  "最后一行不得使用代码围栏；解析失败按不通过处理。",
].join("\n"), options("14_score_judge"))
const score = lastLineJson(scoreRaw)
const scoreOk = scoreRaw != null && score.difficulty_pass === true && score.pass === true

phase("s2 收尾报告")
log(scoreOk ? "13→14 闭环通过" : `13→14 闭环未通过：${short(score.reason || score.summary || "未通过", 240)}`)

return {
  ok: scoreOk,
  reason: scoreOk ? "13→14 闭环通过" : "14 未通过；停在报告，由人决定是否返修",
  taskDir: base,
  gate,
  answer: short(answerRaw, 600),
  answer_timing: answerTiming,
  score,
  next: null,
  model: MODEL_LABEL,
}
