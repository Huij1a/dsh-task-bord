/**
 * 任务看板数据源。
 *
 * 只依赖标准目录结构：
 *   tasks/<任务ID>/manifest.json          题目元数据（必需）
 *   tasks/<任务ID>/artifacts/<节点>/_gate.json   节点门禁（可选，存在则作为摘要/结论）
 *
 * 节点运行状态来自 DSH 会话事件流：workflow 父会话里每个子代理都会留下
 * `tool-workflow/agent-start` / `tool-workflow/agent-end`，label 即节点名。
 * 因此看板不需要 workflow 额外写 _session.json。
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

export const BOARD_NODES = Object.freeze([
  { name: "00_spec", label: "规范", batch: "A" },
  { name: "01_src", label: "素材", batch: "A" },
  { name: "02_scrub", label: "脱敏", batch: "A" },
  { name: "03_survey", label: "初勘", batch: "A" },
  { name: "04_scope", label: "定位", batch: "A" },
  { name: "05_evidence", label: "证据", batch: "A" },
  { name: "06_build", label: "附件", batch: "A" },
  { name: "07_metacheck", label: "元数据", batch: "A" },
  { name: "08_prompt", label: "题面", batch: "B" },
  { name: "09_style", label: "润色", batch: "B" },
  { name: "10_difficulty", label: "难度", batch: "B" },
  { name: "11_rubric", label: "考点标答", batch: "B" },
  { name: "12_freeze", label: "冻结", batch: "B" },
  { name: "13_answer", label: "独立作答", batch: "C" },
  { name: "14_score", label: "评分", batch: "C" },
  { name: "15_review", label: "读卷", batch: "C" },
  { name: "16_qc", label: "质检", batch: "C" },
  { name: "17_pack", label: "打包", batch: "D" },
  { name: "18_submit", label: "提交", batch: "D" },
  { name: "18_rebuild_upload", label: "重建上传包", batch: "D" },
]);

const NODE_INDEX = new Map(BOARD_NODES.map((node, index) => [node.name, index]));

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** 把 Windows 路径统一成可比较的形式。 */
function pathKey(value) {
  return String(value || "")
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLowerCase();
}

function findMagic(buf, from) {
  for (let i = from; i + 4 <= buf.length; i += 1) {
    if (buf[i] === ZSTD_MAGIC[0] && buf[i + 1] === ZSTD_MAGIC[1] && buf[i + 2] === ZSTD_MAGIC[2] && buf[i + 3] === ZSTD_MAGIC[3]) {
      return i;
    }
  }
  return -1;
}

/** DSH 会话是多帧 zstd，按 magic 分帧逐个解压再拼接。 */
function decodeSession(buf) {
  if (typeof zlib.zstdDecompressSync !== "function") {
    throw new Error("当前 Node 不支持 zstd（需要 Node 22.15+）");
  }
  const starts = [];
  let at = 0;
  for (;;) {
    const index = findMagic(buf, at);
    if (index < 0) break;
    starts.push(index);
    at = index + 4;
  }
  if (!starts.length) throw new Error("不是 zstd 帧文件");
  const parts = [];
  for (let k = 0; k < starts.length; k += 1) {
    const start = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8"));
    } catch {
      // magic 恰好出现在压缩数据内部时会切错，跳过该帧
    }
  }
  return parts.join("");
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseJsonLoose(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

/** 只解第一帧拿会话头，用于快速判断这个会话属不属于当前项目。 */
function decodeFirstLine(buf) {
  const second = findMagic(buf, 4);
  const end = second < 0 ? buf.length : second;
  try {
    const text = zlib.zstdDecompressSync(buf.subarray(0, end)).toString("utf8");
    return text.split(/\r?\n/)[0] || "";
  } catch {
    return "";
  }
}

const sessionCache = new Map();

/**
 * 把一个会话文件解析成看板需要的最小摘要。
 * @returns {Promise<null | {id:string, cwd:string, parentSession:string|null, runs:Array, starts:Array, ends:Array, lastTime:number}>}
 */
async function readSessionDigest(entry, rootKey) {
  const cached = sessionCache.get(entry.file);
  if (cached && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) return cached.digest;

  let digest = null;
  try {
    const buf = await fs.readFile(entry.file);
    const header = parseJsonLine(decodeFirstLine(buf));
    if (!header || header.type !== "session" || pathKey(header.cwd) !== rootKey) {
      sessionCache.set(entry.file, { mtimeMs: entry.mtimeMs, size: entry.size, digest: null });
      return null;
    }

    const events = decodeSession(buf)
      .split(/\r?\n/)
      .map((line) => (line.trim() ? parseJsonLine(line) : null))
      .filter(Boolean);

    const runs = [];
    const starts = [];
    const ends = [];
    const pendingCalls = [];
    let lastTime = header.createdAt || 0;

    for (const event of events) {
      const type = event.type || "";
      const data = event.data || {};
      if (typeof event.time === "number" && event.time > lastTime) lastTime = event.time;
      if (type === "tool/call" && data.name === "workflow") {
        const args = parseJsonLoose(data.arguments);
        const taskDir = args && args.args && args.args.taskDir;
        if (taskDir) pendingCalls.push(String(taskDir));
      } else if (type === "tool-workflow/run-start" && data.runId) {
        const taskDir = pendingCalls.shift();
        if (taskDir) runs.push({ runId: String(data.runId), taskDir, name: data.name || "" });
      } else if (type === "tool-workflow/agent-start" && data.runId) {
        starts.push({
          runId: String(data.runId),
          seq: Number(data.seq) || 0,
          label: String(data.label || ""),
          childId: String(data.childId || ""),
          order: Number(event.seq) || Number(data.seq) || 0,
          time: typeof event.time === "number" ? event.time : 0,
        });
      } else if (type === "tool-workflow/agent-end" && data.runId) {
        ends.push({ runId: String(data.runId), seq: Number(data.seq) || 0, outcome: String(data.outcome || "") });
      }
    }

    digest = {
      id: String(header.id || entry.id),
      cwd: String(header.cwd || ""),
      parentSession: header.parentSession ? String(header.parentSession) : null,
      runs,
      starts,
      ends,
      lastTime,
    };
  } catch {
    digest = null;
  }

  sessionCache.set(entry.file, { mtimeMs: entry.mtimeMs, size: entry.size, digest });
  return digest;
}

async function listSessionFiles(sessionsDir) {
  const out = [];
  const workspaces = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    const workspaceDir = path.join(sessionsDir, workspace.name);
    const sessions = await fs.readdir(workspaceDir, { withFileTypes: true }).catch(() => []);
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const file = path.join(workspaceDir, session.name, "session.v4.jsonl.zstd");
      try {
        const stat = await fs.stat(file);
        out.push({ file, id: session.name, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // 没有会话文件就跳过
      }
    }
  }
  return out;
}

/** 从 agent label 里认节点名：`deepseek-v4.1-flash/max | 01_src retry1` → `01_src`。 */
function nodeFromLabel(label) {
  const tail = String(label || "").split("|").pop().trim();
  const match = tail.match(/^(\d{2}_[a-z_]+)/);
  if (!match) return null;
  return NODE_INDEX.has(match[1]) ? match[1] : null;
}

async function readGate(taskDir, nodeName) {
  const file = path.join(taskDir, "artifacts", nodeName, "_gate.json");
  try {
    const stat = await fs.stat(file);
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return { data, mtime_ms: stat.mtimeMs };
  } catch {
    return null;
  }
}

/** 没有会话事件时，从 _gate.json 的 conditions 推断状态。 */
function statusFromGate(gate) {
  const conditions = gate && gate.data && gate.data.conditions;
  if (!conditions || typeof conditions !== "object") return null;
  const values = Object.values(conditions);
  if (!values.length) return null;
  if (values.some((value) => value === false)) return "failed";
  if (values.every((value) => value === true)) return "passed";
  return "running";
}

/**
 * 读取看板数据。
 * @param {object} options
 * @param {string} options.root          项目根目录
 * @param {string} [options.sessionsDir] DSH 会话目录
 */
export async function getBoardState(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const sessionsDir = options.sessionsDir || path.join(os.homedir(), ".dsh", "sessions");
  const tasksDir = path.join(root, "tasks");
  const rootKey = pathKey(root);

  const entries = await fs.readdir(tasksDir, { withFileTypes: true }).catch(() => []);
  const tasks = [];

  // taskId -> { parentSessionId, nodes: Map<nodeName, {childId, outcome, startedAt, endedAt}>, lastTime }
  const sessionByTask = new Map();
  if (entries.length) {
    const files = await listSessionFiles(sessionsDir);
    for (const file of files) {
      const digest = await readSessionDigest(file, rootKey);
      if (!digest) continue;
      for (const run of digest.runs) {
        const taskId = path.basename(run.taskDir.replace(/[\\/]+$/, ""));
        if (!taskId) continue;
        let aggregate = sessionByTask.get(taskId);
        if (!aggregate) {
          aggregate = { parentSessionId: digest.id, nodes: new Map(), lastTime: 0 };
          sessionByTask.set(taskId, aggregate);
        }
        if (digest.lastTime > aggregate.lastTime) aggregate.lastTime = digest.lastTime;
        for (const start of digest.starts) {
          if (start.runId !== run.runId) continue;
          const nodeName = nodeFromLabel(start.label);
          if (!nodeName) continue;
          const end = digest.ends.find((item) => item.runId === start.runId && item.seq === start.seq);
          const previous = aggregate.nodes.get(nodeName);
          if (!previous || start.order >= previous.order) {
            aggregate.nodes.set(nodeName, {
              childId: start.childId,
              parentSessionId: digest.id,
              outcome: end ? end.outcome : "",
              order: start.order,
              startedAt: start.time,
              endedAt: end ? digest.lastTime : 0,
            });
          }
        }
      }
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskId = entry.name;
    const taskDir = path.join(tasksDir, taskId);
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(taskDir, "manifest.json"), "utf8"));
    } catch {
      continue;
    }

    const aggregate = sessionByTask.get(taskId) || null;
    const nodes = [];
    let updatedAt = 0;
    let passed = 0;
    let failed = 0;
    let started = 0;

    for (const definition of BOARD_NODES) {
      const gate = await readGate(taskDir, definition.name);
      if (gate && gate.mtime_ms > updatedAt) updatedAt = gate.mtime_ms;

      const run = aggregate ? aggregate.nodes.get(definition.name) : null;
      const gateStatus = statusFromGate(gate);
      let status = "pending";
      let outcome = "";
      let sessionId = null;
      let parentSessionId = null;
      let startedAt = 0;

      if (run) {
        sessionId = run.childId || null;
        parentSessionId = run.parentSessionId || null;
        startedAt = run.startedAt || 0;
        outcome = run.outcome || "";
      }

      if (gateStatus) {
        // 门禁产物是节点自己交出的确定性结论，优先于事件流里的 cancelled（整批中断时节点可能已跑完）
        status = gateStatus;
      } else if (run) {
        if (outcome === "completed") status = "passed";
        else if (outcome === "failed" || outcome === "cancelled") status = "failed";
        else status = "running";
      }

      if (status === "passed") passed += 1;
      else if (status === "failed") failed += 1;
      if (status !== "pending") started += 1;

      nodes.push({
        name: definition.name,
        label: definition.label,
        batch: definition.batch,
        index: NODE_INDEX.get(definition.name),
        status,
        outcome,
        summary: gate && gate.data && typeof gate.data.summary === "string" ? gate.data.summary : "",
        failures: gate && gate.data && Array.isArray(gate.data.failures) ? gate.data.failures : [],
        sessionId,
        parentSessionId,
        startedAt,
      });
    }

    if (aggregate && aggregate.lastTime > updatedAt) updatedAt = aggregate.lastTime;
    const frozenAt = manifest.frozen_at ? Date.parse(manifest.frozen_at) : 0;
    if (Number.isFinite(frozenAt) && frozenAt > updatedAt) updatedAt = frozenAt;

    let status = "draft";
    if (failed > 0) status = "failed";
    else if (passed === BOARD_NODES.length) status = "completed";
    else if (started > 0) status = "running";

    tasks.push({
      taskId,
      industry: String(manifest.industry || ""),
      version: String(manifest.version || manifest.template_version || ""),
      frozenAt: manifest.frozen_at || "",
      status,
      passed,
      failed,
      total: BOARD_NODES.length,
      updatedAt,
      nodes,
    });
  }

  tasks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { tasks, nodes: BOARD_NODES, generatedAt: Date.now() };
}
