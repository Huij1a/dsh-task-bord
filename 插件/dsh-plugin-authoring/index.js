/**
 * @module dsh-plugin-authoring
 *
 * DSH 插件：19 节点出题流水线所需工具（零依赖，只用 Node 内置模块）。
 *
 * 设计原则：
 * 1. 只做确定性的文件操作（建目录、复制模板、算哈希、读状态），不调用模型、不执行外部命令、不联网。
 * 2. 所有路径先 resolve 再校验前缀，拒绝越出 root。
 * 3. 不读写凭据。失败返回结构化错误，不抛裸异常。
 */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

export const name = "plugin-authoring";

/** 依赖的工具注册服务；未挂载时插件不激活。webServer 在 apply 里用 ctx.get 取，不阻塞启动。 */
export const inject = ["tools"];

const DEFAULT_ROOT = "D:\\高经出题流水线";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

function text(s) {
  return [{ type: "text", text: s }];
}

/** 把 {k:{type,required,description}} 转成 JSON Schema。 */
function paramSchema(spec) {
  const properties = {};
  const required = [];
  for (const [k, v] of Object.entries(spec || {})) {
    properties[k] = { type: v.type, description: v.description };
    if (v.required) required.push(k);
  }
  return { type: "object", properties, additionalProperties: false, ...(required.length ? { required } : {}) };
}

/** 把输出字段声明转成 JSON Schema。 */
function outSchema(props) {
  const properties = {};
  const required = [];
  for (const [k, v] of Object.entries(props || {})) {
    const t = v.type === "array"
      ? { type: "array", ...(v.items ? { items: v.items } : {}) }
      : { type: v.type };
    properties[k] = t;
    if (v.required) required.push(k);
  }
  return { type: "object", properties, additionalProperties: false, ...(required.length ? { required } : {}) };
}

function actualType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number" && !Number.isFinite(v)) return "number";
  return typeof v;
}

function matchesType(v, type) {
  if (type === "integer") return typeof v === "number" && Number.isInteger(v);
  if (type === "number") return typeof v === "number" && Number.isFinite(v);
  if (type === "array") return Array.isArray(v);
  if (type === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
  return typeof v === type;
}

/** 按工具参数声明做统一校验，所有失败都由 execute 包装层转成结构化返回值。 */
function validateArgs(spec, args) {
  if (args == null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return "参数必须是对象";
  for (const [key, rule] of Object.entries(spec || {})) {
    const provided = Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined;
    const blank = rule.type === "string" && provided && typeof args[key] === "string" && !args[key].trim();
    if (rule.required && (!provided || args[key] === null)) return `缺少必填参数 ${key}`;
    if (!provided) continue;
    if (blank) return `${key} 不能为空字符串`;
    if (!matchesType(args[key], rule.type)) {
      return `${key} 应为 ${rule.type}，实际为 ${actualType(args[key])}`;
    }
  }
  return null;
}

function tool(def) {
  const execute = def.execute;
  return {
    name: def.name,
    description: def.description,
    parameters: paramSchema(def.parameters),
    output: { schema: outSchema(def.output), render: def.render },
    async execute(args, ...rest) {
      const invalid = validateArgs(def.parameters, args);
      if (invalid) return { ok: false, error: `参数错误：${invalid}` };
      try {
        return await execute(args || {}, ...rest);
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
    ...(def.presentCall ? { presentCall: def.presentCall } : {}),
  };
}

function safeJoin(root, ...parts) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, ...parts);
  const rel = path.relative(rootAbs, abs);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`路径越界：${abs}`);
  }
  return abs;
}

async function fileDigest(file) {
  const buf = await fs.readFile(file);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

async function sha256(file) {
  return (await fileDigest(file)).sha256;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function pathKey(p) {
  const abs = path.resolve(p);
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

function samePath(a, b) {
  return pathKey(a) === pathKey(b);
}

function withinPath(parent, child, options = {}) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  if (rel === "") return !options.strict;
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return false;
  return true;
}

async function lstatMaybe(p) {
  try { return await fs.lstat(p); } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
}

async function isRedirectPath(p) {
  try {
    const st = await fs.lstat(p);
    return st.isSymbolicLink();
  } catch {
    return false;
  }
}

async function writeJsonAtomic(file, value) {
  const parent = path.dirname(file);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(parent, `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function slashPath(p) {
  return String(p).replace(/\\/g, "/");
}

function manifestEntries(manifest, label) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.files)) {
    throw new Error(`${label} 缺少 files 数组`);
  }
  const seen = new Set();
  return manifest.files.map((entry, index) => {
    if (!entry || typeof entry.path !== "string" || !entry.path.trim()) {
      throw new Error(`${label} files[${index}] 缺少 path`);
    }
    const rel = slashPath(entry.path);
    const normalized = path.posix.normalize(rel);
    if (
      normalized !== rel ||
      path.posix.isAbsolute(rel) ||
      path.win32.isAbsolute(rel) ||
      rel.split("/").some((part) => !part || part === "." || part === "..") ||
      (process.platform === "win32" &&
        rel.split("/").some((part) => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    ) {
      throw new Error(`${label} 包含非法路径：${entry.path}`);
    }
    // Windows 文件系统大小写不敏感，大小写不同的两个清单项会落到同一目标文件。
    const collisionKey = process.platform === "win32" ? rel.toLowerCase() : rel;
    if (seen.has(collisionKey)) throw new Error(`${label} 包含重复路径：${rel}`);
    seen.add(collisionKey);
    const hash = String(entry.sha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`${label} 的 ${rel} 缺少有效 sha256`);
    return { ...entry, path: rel, sha256: hash };
  });
}

async function readManifest(file, label) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`读取 ${label} 失败：${String((e && e.message) || e)}`);
  }
  return { manifest, files: manifestEntries(manifest, label) };
}

async function scanDirFiles(baseDir, relDir) {
  const found = [];
  async function walk(absDir, relBase) {
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch (e) {
      if (e && e.code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      const rel = slashPath(path.posix.join(relBase, entry.name));
      if (entry.isDirectory()) await walk(path.join(absDir, entry.name), rel);
      else if (entry.isFile()) found.push(rel);
    }
  }
  await walk(safeJoin(baseDir, relDir), relDir);
  return found;
}

/**
 * 默认扫描 manifest 声明文件所在的子目录，避免把题目 artifacts/ 等运行产物
 * 误报为新增。模板校验传 scanRoot 以核对整个母版目录，并单独排除 manifest.json，
 * 因为它的变化由 template_sha 判断。
 */
async function hashManagedFiles(baseDir, declaredPaths, options = {}) {
  const candidates = new Set(declaredPaths);
  if (options.scanRoot) {
    for (const rel of await scanDirFiles(baseDir, ".")) candidates.add(rel);
  } else {
    const dirs = new Set();
    for (const rel of declaredPaths) {
      const dir = path.posix.dirname(rel);
      if (dir !== ".") dirs.add(dir);
    }
    for (const dir of [...dirs].sort()) {
      for (const rel of await scanDirFiles(baseDir, dir)) candidates.add(rel);
    }
  }
  for (const rel of options.exclude || []) candidates.delete(rel);

  const hashes = new Map();
  for (const rel of [...candidates].sort()) {
    const abs = safeJoin(baseDir, rel);
    let st;
    try {
      st = await fs.stat(abs);
    } catch (e) {
      if (e && e.code === "ENOENT") continue;
      throw e;
    }
    if (st.isFile()) hashes.set(rel, await sha256(abs));
  }
  return hashes;
}

async function rollbackTaskDir(taskDir, tasksDir) {
  const taskAbs = path.resolve(taskDir);
  const tasksAbs = path.resolve(tasksDir);
  if (path.dirname(taskAbs) !== tasksAbs) {
    throw new Error(`拒绝回滚非 tasks 直接子目录：${taskAbs}`);
  }
  await fs.rm(taskAbs, { recursive: true, force: true });
}

const BUILD_DIR_CANDIDATES = ["06_build", "06_wps"];

function valueText(value) {
  return value && typeof value === "object" ? JSON.stringify(value) : String(value);
}

function runText(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return `run：${valueText(run)}`;
  const keys = Object.keys(run).filter((key) => run[key] !== undefined);
  const roundKey = keys.find((key) => /round|turn|step|轮/i.test(key));
  const durationKey = keys.find((key) => /duration|elapsed|minutes|seconds|time|时长|耗时/i.test(key));
  if (roundKey || durationKey) {
    const parts = [];
    if (roundKey) parts.push(`轮数 ${valueText(run[roundKey])}（${roundKey}）`);
    if (durationKey) parts.push(`时长 ${valueText(run[durationKey])}（${durationKey}）`);
    return `run：${parts.join("，")}`;
  }
  return `run：${truncate(JSON.stringify(run), 240)}`;
}

function gateVerdict(gate) {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return valueText(gate);
  const rows = [];
  function collect(value, prefix, depth) {
    if (value && typeof value === "object" && !Array.isArray(value) && depth < 4) {
      for (const [key, child] of Object.entries(value)) {
        collect(child, prefix ? `${prefix}.${key}` : key, depth + 1);
      }
      return;
    }
    rows.push([prefix || "value", value]);
  }
  collect(gate, "", 0);
  const isScore = ([key]) => /score|分数|threshold|阈值|门槛/i.test(key);
  const isOtherGate = ([key]) => /pass|limit|max|min|难度|轮|时长|duration|round|time/i.test(key);
  const ranked = [
    ...rows.filter(isScore),
    ...rows.filter((row) => !isScore(row) && isOtherGate(row)),
    ...rows.filter((row) => !isScore(row) && !isOtherGate(row)),
  ];
  return truncate(ranked.map(([key, value]) => `${key}=${valueText(value)}`).join("；"), 1200);
}

function scoreVerdict(score, label = "14_score/评分.json") {
  if (!score || typeof score !== "object" || Array.isArray(score)) {
    return `${label}：${valueText(score)}`;
  }
  const parts = [];
  for (const key of ["score", "total", "pass", "difficulty_pass", "fail_closed"]) {
    if (score[key] !== undefined) parts.push(`${key}=${valueText(score[key])}`);
  }
  if (score.run !== undefined) parts.push(runText(score.run));
  return `${label}：${parts.join("；")}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstField(objects, keys) {
  for (const value of objects) {
    if (!isPlainObject(value)) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) {
        return { found: true, value: value[key] };
      }
    }
  }
  return { found: false, value: undefined };
}

function flagValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "pass", "passed", "ok", "success", "isolated", "clean", "是", "通过", "已隔离"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "fail", "failed", "violated", "dirty", "leaked", "否", "失败", "不通过", "未隔离"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function isolationState(audit) {
  if (!isPlainObject(audit)) {
    return { status: "缺失", pass: null, violations: 0 };
  }
  const containers = [
    audit,
    firstField([audit], ["result", "summary", "audit"]).value,
  ];
  const passHit = firstField(containers, [
    "pass", "passed", "isolated", "isolation_pass", "isolation_ok", "ok", "通过", "隔离通过",
  ]);
  let pass = passHit.found ? flagValue(passHit.value) : null;
  const violationHit = firstField(containers, [
    "violations", "findings", "issues", "breaches", "违规", "隔离违规",
  ]);
  const violations = Array.isArray(violationHit.value) ? violationHit.value : [];
  if (violations.length) pass = false;
  const statusHit = firstField(containers, [
    "status", "result", "verdict", "isolation_status", "结论", "状态",
  ]);
  let status = "已记录";
  if (pass === true) status = "通过";
  else if (pass === false) status = "失败";
  else if (statusHit.found && statusHit.value !== undefined) status = truncate(valueText(statusHit.value), 120);
  if (violations.length) status += `（${violations.length} 条违规）`;
  return { status, pass, violations: violations.length };
}

const RUN_ID_RE = /^[A-Za-z0-9_-]+$/;

function validRunId(value) {
  return typeof value === "string" && RUN_ID_RE.test(value) && safeVolumeSegment(value);
}

function volumeLabelOf(value) {
  if (!isPlainObject(value)) return "";
  const hit = firstField([value], ["run_id", "runId", "volume", "volume_id", "volumeId", "卷号", "卷"]);
  return hit.found && hit.value !== null ? String(hit.value) : "";
}

function relTaskPath(taskDir, abs) {
  return slashPath(path.relative(taskDir, abs));
}

async function readJsonStatus(file) {
  try {
    return { data: JSON.parse(await fs.readFile(file, "utf8")), error: "" };
  } catch (e) {
    return { data: null, error: String((e && e.message) || e) };
  }
}

function safeVolumeSegment(value) {
  const s = String(value || "");
  return Boolean(s) && s !== "." && s !== ".." && path.basename(s) === s && !s.includes("/") && !s.includes("\\") && !s.includes("\0");
}

function triggerDisplay(value) {
  if (typeof value === "string") return truncate(value, 240);
  if (!isPlainObject(value)) return truncate(valueText(value), 240);
  const parts = [];
  for (const key of ["kind", "actual", "threshold", "upper", "evidence", "reason"]) {
    if (value[key] !== undefined) parts.push(`${key}=${valueText(value[key])}`);
  }
  return truncate(parts.length ? parts.join("，") : JSON.stringify(value), 240);
}

function decisionStatus(read, relPath) {
  if (!read.exists) {
    return {
      exists: false,
      path: relPath,
      status: "尚未判定",
      error: "",
      firstRunId: null,
      supplementRequired: null,
      supplementRunId: null,
      selectedRunId: null,
      selectionRule: "",
      selectionReason: "",
      triggerReasons: [],
    };
  }
  if (read.error || !isPlainObject(read.data)) {
    return {
      exists: true,
      path: relPath,
      status: "判定文件不可用",
      error: read.error || "顶层必须是 JSON 对象",
      firstRunId: null,
      supplementRequired: null,
      supplementRunId: null,
      selectedRunId: null,
      selectionRule: "",
      selectionReason: "",
      triggerReasons: [],
    };
  }
  const data = read.data;
  const triggers = Array.isArray(data.first_triggers)
    ? data.first_triggers
    : Array.isArray(data.trigger_reasons) ? data.trigger_reasons : [];
  const supplementRequired = flagValue(data.supplement_required);
  return {
    exists: true,
    path: relPath,
    status: supplementRequired === true ? "需要补卷" : supplementRequired === false ? "无需补卷" : "已记录（补卷字段缺失）",
    error: "",
    firstRunId: validRunId(data.first_run_id) ? data.first_run_id : null,
    supplementRequired,
    supplementRunId: validRunId(data.supplement_run_id) ? data.supplement_run_id : null,
    selectedRunId: validRunId(data.selected_run_id) ? data.selected_run_id : null,
    selectionRule: data.selection_rule ? truncate(valueText(data.selection_rule), 160) : "",
    selectionReason: data.selection_reason ? truncate(valueText(data.selection_reason), 300) : "",
    triggerReasons: triggers.map(triggerDisplay).filter(Boolean),
  };
}

function summaryRunIds(data) {
  const ids = [];
  const add = (value) => {
    if (validRunId(value) && !ids.includes(value)) ids.push(value);
  };
  if (!isPlainObject(data)) return ids;
  if (Array.isArray(data.run_ids)) data.run_ids.forEach(add);
  if (Array.isArray(data.runs)) {
    for (const run of data.runs) {
      if (isPlainObject(run)) add(run.run_id ?? run.runId);
    }
  }
  return ids;
}

function summaryStatus(read, relPath) {
  if (!read.exists) {
    return {
      exists: false,
      path: relPath,
      error: "",
      runIds: [],
      selectedRunId: null,
      selectionRule: "",
      selectionEvidence: "",
      pass: null,
      stopReason: "",
    };
  }
  if (read.error || !isPlainObject(read.data)) {
    return {
      exists: true,
      path: relPath,
      error: read.error || "顶层必须是 JSON 对象",
      runIds: [],
      selectedRunId: null,
      selectionRule: "",
      selectionEvidence: "",
      pass: null,
      stopReason: "",
    };
  }
  const data = read.data;
  return {
    exists: true,
    path: relPath,
    error: "",
    runIds: summaryRunIds(data),
    selectedRunId: validRunId(data.selected_run_id) ? data.selected_run_id : null,
    selectionRule: data.selection_rule ? truncate(valueText(data.selection_rule), 160) : "",
    selectionEvidence: data.selection_evidence ? truncate(valueText(data.selection_evidence), 300) : "",
    pass: flagValue(data.pass),
    stopReason: data.stop_reason ? truncate(valueText(data.stop_reason), 240) : "",
  };
}

async function readStatusMetadata(taskDir) {
  const decisionPath = "artifacts/14_score/补卷判定.json";
  const summaryPath = "artifacts/14_score/汇总.json";
  const decisionAbs = safeJoin(taskDir, decisionPath);
  const summaryAbs = safeJoin(taskDir, summaryPath);
  const decisionRead = await exists(decisionAbs)
    ? { exists: true, ...(await readJsonStatus(decisionAbs)) }
    : { exists: false, data: null, error: "" };
  const summaryRead = await exists(summaryAbs)
    ? { exists: true, ...(await readJsonStatus(summaryAbs)) }
    : { exists: false, data: null, error: "" };
  const decision = decisionStatus(decisionRead, decisionPath);
  const summary = summaryStatus(summaryRead, summaryPath);
  const selectedRunId = summary.selectedRunId || decision.selectedRunId;
  const summarySupplementRunId = summary.runIds.includes("C01") && summary.runIds.includes("C02")
    ? "C02"
    : null;
  const supplementRunId = decision.supplementRunId || summarySupplementRunId;
  const runIds = [...new Set([
    ...(decision.firstRunId ? [decision.firstRunId] : []),
    ...(decision.supplementRunId ? [decision.supplementRunId] : []),
    ...(selectedRunId ? [selectedRunId] : []),
    ...summary.runIds,
  ])].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  return {
    status: summary.exists ? "汇总终态" : decision.exists ? decision.status : "尚未判定",
    decision,
    summary,
    firstRunId: decision.firstRunId || (summary.runIds.includes("C01") ? "C01" : summary.runIds[0] || null),
    supplementRequired: decision.supplementRequired !== null
      ? decision.supplementRequired
      : supplementRunId ? true : null,
    supplementRunId,
    selectedRunId,
    selectionRule: summary.selectionRule || decision.selectionRule,
    selectionEvidence: summary.selectionEvidence || decision.selectionReason,
    triggerReasons: decision.triggerReasons,
    pass: summary.pass,
    stopReason: summary.stopReason,
    runIds,
  };
}

function rerunVolumeStatus(runId, metadata, allRunIds, legacyLayout, hasScore) {
  if (legacyLayout && !validRunId(runId)) {
    return { isRerun: null, display: "不适用（旧版单卷）" };
  }
  let supplementRunId = metadata.supplementRunId;
  const source = metadata.decision.exists ? "补卷判定" : metadata.summary.exists ? "汇总" : "目录兼容";
  if (!metadata.decision.exists && !metadata.summary.exists &&
      !supplementRunId && allRunIds.includes("C01") && allRunIds.includes("C02")) {
    supplementRunId = "C02";
  }
  if (runId === supplementRunId) {
    const scoreText = hasScore ? "已出分" : "待出分";
    return {
      isRerun: true,
      display: `是（补跑卷，${scoreText}${metadata.selectedRunId === runId ? "，已选" : ""}；来源=${source}）`,
    };
  }
  if (runId === metadata.firstRunId || runId === "C01") {
    let suffix = "";
    if (metadata.supplementRequired === true) suffix = "，已触发补卷";
    else if (metadata.supplementRequired === false) suffix = "，无需补卷";
    else if (!metadata.decision.exists) suffix = "，尚未判定";
    return { isRerun: false, display: `否（首卷${suffix}）` };
  }
  return { isRerun: null, display: "未记录" };
}

async function statusVolumes(taskDir, metadata) {
  const scoreDir = safeJoin(taskDir, "artifacts", "14_score");
  const answerDir = safeJoin(taskDir, "artifacts", "13_answer");
  const scoreFiles = new Map();
  const auditFiles = new Map();

  const scoreDirs = (await fs.readdir(scoreDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && validRunId(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  for (const entry of scoreDirs) {
    const file = safeJoin(scoreDir, entry.name, "评分.json");
    if (await exists(file)) scoreFiles.set(entry.name, file);
  }

  const auditDirs = (await fs.readdir(answerDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && validRunId(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  for (const entry of auditDirs) {
    const file = safeJoin(answerDir, entry.name, "隔离审计.json");
    if (await exists(file)) auditFiles.set(entry.name, file);
  }

  const runIds = new Set([...metadata.runIds, ...scoreFiles.keys(), ...auditFiles.keys()]);
  const rootScore = safeJoin(scoreDir, "评分.json");
  const rootAudit = safeJoin(answerDir, "隔离审计.json");
  const hasRootScore = await exists(rootScore);
  const hasRootAudit = await exists(rootAudit);
  let legacyLayout = false;

  if (!runIds.size && (hasRootScore || hasRootAudit)) {
    legacyLayout = true;
    const rootRead = hasRootScore ? await readJsonStatus(rootScore) : { data: null, error: "" };
    const declared = validRunId(volumeLabelOf(rootRead.data)) ? volumeLabelOf(rootRead.data) : "单卷";
    runIds.add(declared);
    if (hasRootScore) scoreFiles.set(declared, rootScore);
    if (hasRootAudit) auditFiles.set(declared, rootAudit);
  } else if (runIds.size) {
    if (!scoreFiles.size && hasRootScore) {
      const target = runIds.has(metadata.selectedRunId)
        ? metadata.selectedRunId
        : runIds.has(metadata.firstRunId) ? metadata.firstRunId
          : runIds.size === 1 ? [...runIds][0] : null;
      if (target) scoreFiles.set(target, rootScore);
    }
    if (!auditFiles.size && hasRootAudit && runIds.size === 1) {
      auditFiles.set([...runIds][0], rootAudit);
    }
  }

  const allRunIds = [...runIds].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  const volumes = [];
  for (const runId of allRunIds) {
    const scoreFile = scoreFiles.get(runId) || "";
    let score = null;
    let scoreError = "";
    if (!scoreFile) {
      scoreError = "文件缺失";
    } else {
      const read = await readJsonStatus(scoreFile);
      score = read.data;
      scoreError = read.error;
    }

    const auditFile = auditFiles.get(runId) ||
      (validRunId(runId) ? safeJoin(answerDir, runId, "隔离审计.json") : rootAudit);
    let isolation = isolationState(null);
    if (await exists(auditFile)) {
      const read = await readJsonStatus(auditFile);
      isolation = read.error
        ? { status: `解析失败：${truncate(read.error, 120)}`, pass: false, violations: 0 }
        : isolationState(read.data);
    }

    const scorePath = scoreFile
      ? relTaskPath(taskDir, scoreFile)
      : legacyLayout ? "artifacts/14_score/评分.json" : `artifacts/14_score/${runId}/评分.json`;
    const isolationPath = relTaskPath(taskDir, auditFile);
    const rerun = rerunVolumeStatus(runId, metadata, allRunIds, legacyLayout, Boolean(scoreFile));
    volumes.push({
      volume: runId,
      runId: validRunId(runId) ? runId : null,
      scorePath,
      isolationPath,
      score: isPlainObject(score) ? {
        score: score.score ?? null,
        total: score.total ?? null,
        pass: score.pass ?? null,
        difficultyPass: score.difficulty_pass ?? null,
        failClosed: score.fail_closed ?? null,
      } : null,
      scoreError,
      isolation,
      rerun,
      selected: runId === metadata.selectedRunId,
      scoreVerdict: scoreError ? `${scorePath}：${scoreError}` : scoreVerdict(score, scorePath),
    });
  }
  return { volumes, legacyLayout };
}

function displayBoolean(value, yes = "通过", no = "未通过") {
  if (value === true) return yes;
  if (value === false) return no;
  return "-";
}

function volumeDisplay(volume) {
  const score = volume.score || {};
  const scoreText = volume.scoreError
    ? `评分缺失（${volume.scoreError}）`
    : `${score.score ?? "-"}/${score.total ?? "-"}`;
  return `${volume.volume}：分数 ${scoreText}；难度 ${displayBoolean(score.difficultyPass)}；` +
    `整体 ${displayBoolean(score.pass)}；隔离 ${volume.isolation.status}；补跑 ${volume.rerun.display}`;
}

async function listMd(dir) {
  const names = await fs.readdir(dir).catch(() => []);
  return names.filter((n) => n.endsWith(".md")).sort();
}

async function countFiles(dir) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(cur, e.name));
      else if (e.name !== "_cell.py" && !e.name.endsWith(".pyc")) n += 1;
    }
  }
  return n;
}

async function nextTaskId(tasksDir) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const used = new Set(await fs.readdir(tasksDir).catch(() => []));
  for (let i = 1; i <= 99; i += 1) {
    const id = `T-${ymd}-${String(i).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  throw new Error("当天题目数已达上限 99");
}


// ── 会话记录解析（监管中间节点）─────────────────────────────
/** 在 sessions 目录下找会话文件；无 sessionId 时取最近修改的。 */
async function findSessionFile(sessionsDir, sessionId) {
  if (sessionId !== null) {
    const id = String(sessionId);
    if (
      !id ||
      id !== path.basename(id) ||
      id === "." ||
      id === ".." ||
      id.includes("/") ||
      id.includes("\\") ||
      id.includes("\0")
    ) {
      throw new Error(`session 不合法：${id}`);
    }
    sessionId = id;
  }
  const dirs = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const wsDir = path.join(sessionsDir, d.name);
    if (sessionId) {
      const f = path.join(wsDir, sessionId, "session.v4.jsonl.zstd");
      try {
        const st = await fs.stat(f);
        return { file: f, id: sessionId, mtime: st.mtimeMs, size: st.size, workspace: d.name };
      } catch {
        continue;
      }
    }
    const subs = await fs.readdir(wsDir, { withFileTypes: true }).catch(() => []);
    for (const s of subs) {
      if (!s.isDirectory()) continue;
      const f = path.join(wsDir, s.name, "session.v4.jsonl.zstd");
      try {
        const st = await fs.stat(f);
        candidates.push({ file: f, id: s.name, mtime: st.mtimeMs, size: st.size, workspace: d.name });
      } catch { /* 跳过 */ }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0];
}

/**
 * DSH 的会话文件是多帧 zstd（append 写入），Node 的 zstdDecompressSync 只解第一帧，
 * 所以按 magic number 分帧逐个解压再拼接。
 */
function decodeSession(buf) {
  if (typeof zlib.zstdDecompressSync !== "function") {
    throw new Error("当前 Node 不支持 zstd（需要 Node 22.15+）");
  }
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
  const starts = [];
  for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) {
      starts.push(i);
    }
  }
  if (!starts.length) throw new Error("不是 zstd 帧文件");
  const parts = [];
  for (let k = 0; k < starts.length; k += 1) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(s, e)).toString("utf8"));
    } catch {
      // magic 恰好出现在压缩数据内部时会切错，跳过该帧
    }
  }
  return parts.join("");
}

function truncate(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** 从工具入参里挑最可读的一项做摘要。 */
function summarizeArgs(args) {
  let a = args;
  if (typeof a === "string") {
    try { a = JSON.parse(a); } catch { return truncate(a, 90); }
  }
  if (!a || typeof a !== "object") return "";
  const pick = a.command || a.file_path || a.path || a.code
    || a.pattern || a.query || a.selector || a.url;
  if (pick) {
    const first = String(pick).split("\n")[0];
    return truncate(first, 90);
  }
  return truncate(JSON.stringify(a), 90);
}

/** 失败时优先展示 stderr，而不是 stdout 的开头。 */
function errorHead(text) {
  const i = String(text).indexOf("[stderr]");
  const body = i >= 0 ? String(text).slice(i + 8).trim() : String(text).trim();
  return truncate(body.split("\n").slice(0, 3).join(" "), 200);
}

function readToolText(message) {
  const parts = (message && message.content) || [];
  return parts.map((c) => (c && typeof c === "object" && c.text) || "").join("\n");
}

/** 把事件流压成可读的进度摘要。 */
function summarizeEvents(events, opts) {
  const lastN = opts.lastN || 15;
  const subagents = [];
  const toolCounts = {};
  const calls = new Map();
  const errors = [];
  const recent = [];
  let steps = 0;
  let lastTime = "";

  for (const e of events) {
    const type = e.type || e.kind || "";
    if (e.time) lastTime = typeof e.time === "number" ? new Date(e.time).toISOString() : String(e.time);
    const d = e.data || {};

    if (type === "subagent/descriptor") {
      subagents.push({
        label: d.label || "",
        model: d.agentModel || "",
        effort: d.agentReasoningEffort || "",
        provider: d.agentProvider || "",
        mode: d.mode || "",
      });
    } else if (type === "step/start") {
      steps += 1;
    } else if (type === "tool/call") {
      const name = d.name || "?";
      toolCounts[name] = (toolCounts[name] || 0) + 1;
      calls.set(d.callId, { turn: d.turn, step: d.step, name, args: summarizeArgs(d.arguments) });
    } else if (type === "tool/result") {
      const msg = d.message || {};
      const text = readToolText(msg);
      const failed = /^Error[:：]|^\[error\]|^错误[:：]/.test(text.trim()) || text.includes("[stderr]");
      const rec = calls.get(msg.toolCallId) || { turn: d.turn, step: d.step, name: "?", args: "" };
      const row = { turn: rec.turn, step: rec.step, tool: rec.name, args: rec.args, result: failed ? errorHead(text) : truncate(text, 120), failed };
      if (failed) errors.push({ turn: rec.turn, step: rec.step, tool: rec.name, error: errorHead(text) });
      recent.push(row);
    }
  }

  return {
    steps,
    subagents,
    tools: toolCounts,
    errorCount: errors.length,
    errors: errors.slice(-10),
    recent: recent.slice(-lastN),
    lastActivity: lastTime,
  };
}

// ── 13 会话隔离审计 ──────────────────────────────────────────
const ISOLATION_MODEL = "deepseek-v4.1-flash/max";
const ISOLATION_CHECKS = [
  "PACKAGE_OUTSIDE_TASK_DIR",
  "RUN_ID_MATCH",
  "INPUT_ALLOWLIST",
  "INPUT_HASH",
  "OUTPUT_EMPTY",
  "BRIEF_NO_TASKDIR",
];

function normalizeSessionRef(value) {
  const id = String(value || "").trim();
  return id.startsWith("session-") ? id.slice("session-".length) : id;
}

function executionSessionId(exec) {
  const session = exec && exec.agent && exec.agent.session;
  const id = (session && session.id) || (session && typeof session === "string" ? session : null);
  return id ? normalizeSessionRef(id) : "";
}

async function findSessionRef(sessionsDir, ref) {
  const raw = String(ref || "");
  if (!raw) return null;
  let hit = await findSessionFile(sessionsDir, raw);
  if (!hit && normalizeSessionRef(raw) !== raw) hit = await findSessionFile(sessionsDir, normalizeSessionRef(raw));
  return hit;
}

async function loadSessionEvents(hit) {
  const buf = await fs.readFile(hit.file);
  if (buf.length > 80 * 1024 * 1024) throw new Error(`会话文件过大（${(buf.length / 1048576).toFixed(1)}MB）`);
  const raw = decodeSession(buf);
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* 跳过坏行 */ }
  }
  return events;
}

function sessionHeader(events) {
  for (const event of events) {
    if (event && event.type === "session") return event;
    const data = event && event.data;
    if (data && data.header && typeof data.header === "object") return data.header;
    if (data && data.session && data.session.header && typeof data.session.header === "object") return data.session.header;
  }
  return null;
}

function isolationPhase13(start) {
  const label = String((start && start.label) || "");
  const phase = String((start && start.phase) || "");
  return /13_answer|(?:^|[^0-9])13(?:[^0-9]|$)|独立作答/.test(`${label} ${phase}`);
}

async function resolveIsolationSession(sessionsDir, explicitSession, currentSessionId) {
  if (explicitSession) {
    const hit = await findSessionRef(sessionsDir, explicitSession);
    if (!hit) throw new Error(`显式 session 不存在：${explicitSession}`);
    return {
      hit,
      events: await loadSessionEvents(hit),
      resolution: { method: "explicit-session", currentSessionId: currentSessionId || null, parentSessionId: null, workflowChildId: hit.id },
    };
  }
  if (!currentSessionId) throw new Error("执行上下文没有 agent.session.id，且未提供显式 session");

  const currentHit = await findSessionRef(sessionsDir, currentSessionId);
  if (!currentHit) throw new Error(`找不到当前 14 会话：${currentSessionId}`);
  const currentEvents = await loadSessionEvents(currentHit);
  const currentHeader = sessionHeader(currentEvents) || {};
  const parentRef = currentHeader.parentSession;
  if (!parentRef) throw new Error(`当前 14 会话没有 parentSession：${currentHit.id}`);

  const parentHit = await findSessionRef(sessionsDir, parentRef);
  if (!parentHit) throw new Error(`找不到 workflow 父会话：${parentRef}`);
  const parentEvents = await loadSessionEvents(parentHit);
  const starts = [];
  for (const event of parentEvents) {
    if (event && (event.type === "tool-workflow/agent-start" || event.type === "workflow/agent-start")) {
      starts.push({ ...(event.data || {}), eventSeq: event.seq });
    }
  }
  if (!starts.length) throw new Error(`workflow 父会话没有 agent-start 事件：${parentHit.id}`);

  const normalizedCurrent = normalizeSessionRef(currentHit.id);
  const currentIndex = starts.findIndex((start) => normalizeSessionRef(start.childId) === normalizedCurrent);
  if (currentIndex < 0) throw new Error(`workflow 父会话找不到当前 14 子会话 ${currentHit.id} 的 agent-start`);
  let chosen = null;
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    if (isolationPhase13(starts[i])) { chosen = starts[i]; break; }
  }
  if (!chosen) throw new Error("当前 14 节点之前找不到同批 phase/label=13 的 agent-start");
  const childId = normalizeSessionRef(chosen.childId);
  if (!childId) throw new Error("13 agent-start 缺少 childId");
  const childHit = await findSessionRef(sessionsDir, childId);
  if (!childHit) throw new Error(`找不到 13 子会话：${chosen.childId}`);
  return {
    hit: childHit,
    events: await loadSessionEvents(childHit),
    resolution: {
      method: "workflow-parent",
      currentSessionId: currentHit.id,
      parentSessionId: parentHit.id,
      workflowRunId: chosen.runId || null,
      workflowSeq: chosen.seq ?? null,
      workflowChildId: chosen.childId,
    },
  };
}

function eventData(event) {
  return event && event.data && typeof event.data === "object" ? event.data : {};
}

function eventTime(event) {
  const values = [event && event.time, eventData(event).time, eventData(event).timestamp];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function stringsWithin(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) stringsWithin(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringsWithin(item, output);
  }
  return output;
}

function userTexts(events) {
  const values = [];
  for (const event of events) {
    const type = String((event && event.type) || "");
    if (type !== "user/message" && type !== "message/user" && eventData(event).role !== "user") continue;
    const data = eventData(event);
    const content = (data.message && data.message.content) || data.content || data.text;
    if (content !== undefined) values.push(...stringsWithin(content));
  }
  return values;
}

function parseToolArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isFileTool(name) {
  return /^(read|read_image|grep|glob|write|edit|apply_patch|office_[a-z0-9_]+)$/i.test(String(name || ""));
}

function collectPathArguments(value, key, output) {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && /^(file_path|path|cwd|workdir|input_path|output_path)$/i.test(key)) {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPathArguments(item, key, output);
  } else if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) collectPathArguments(childValue, childKey, output);
  }
}

function shellWriteIntent(command) {
  const source = String(command || "");
  return /\b(?:Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Remove-Item|Rename-Item|Move-Item|Copy-Item|tee|mkdir|md|ni|rm|del|erase|copy|xcopy|robocopy)\b|(?:^|[^<])>{1,2}/i.test(source);
}

function shellPaths(command) {
  const clean = String(command || "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, " ")
    .replace(/file:\/\/\/[^\s"'<>]+/gi, " ");
  const paths = [];
  const seen = new Set();
  const add = (raw) => {
    const value = String(raw || "").replace(/^[("'`]+|[)"'`,;]+$/g, "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    paths.push(value);
  };
  for (const match of clean.matchAll(/[A-Za-z]:[\\/][^\s"'<>|;]+/g)) add(match[0]);
  for (const match of clean.matchAll(/\\\\[^\\/\s"'<>|;]+[\\/][^\s"'<>|;]+/g)) add(match[0]);
  for (const match of clean.matchAll(/(?:^|\s)(\/(?:[A-Za-z0-9_.~-]+\/)+[A-Za-z0-9_.~-]*)/g)) add(match[1]);
  return paths;
}

function pathClass(absPath, context) {
  if (withinPath(context.inputDir, absPath)) return { allowed: true, kind: "answer-input", writable: false };
  if (withinPath(context.outputDir, absPath)) return { allowed: true, kind: "answer-output", writable: true };
  for (const root of context.readOnlyRoots) {
    if (withinPath(root.path, absPath)) return { allowed: true, kind: root.kind, writable: false };
  }
  return { allowed: false, kind: "outside", writable: true };
}

function auditToolCalls(events, context) {
  const reads = [];
  const violations = [];
  const counts = {};
  const calls = [];
  for (const event of events) {
    if (!event || event.type !== "tool/call") continue;
    const data = eventData(event);
    const name = String(data.name || "?");
    const args = parseToolArguments(data.arguments);
    counts[name] = (counts[name] || 0) + 1;
    calls.push({ callId: data.callId || null, turn: data.turn ?? null, step: data.step ?? null, name });
    const observed = [];
    const shell = /^pwsh$/i.test(name);
    const shellWrites = shell && shellWriteIntent(args.command);
    if (isFileTool(name)) collectPathArguments(args, "", observed);
    if (shell) {
      for (const key of ["cwd", "workdir"]) if (typeof args[key] === "string") observed.push(args[key]);
      for (const value of shellPaths(args.command)) observed.push(value);
      if (/(^|[\\/])\.\.([\\/]|$)/.test(String(args.command || ""))) {
        violations.push({ kind: "shell_parent_traversal", tool: name, path: ".." });
      }
    }
    for (const raw of observed) {
      if (!raw || /^[a-z]+:\/\//i.test(raw)) continue;
      let abs;
      try {
        abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(context.sessionCwd || context.packageRoot, raw);
      } catch {
        violations.push({ kind: "invalid_path", tool: name, path: truncate(raw, 300) });
        continue;
      }
      const cls = pathClass(abs, context);
      const write = /^(write|edit|apply_patch|office_[a-z0-9_]+)$/i.test(name) || shellWrites;
      const allowed = cls.allowed && (!write || cls.writable);
      const row = { tool: name, path: abs, kind: cls.kind, allowed };
      reads.push(row);
      if (!allowed) violations.push({ kind: write ? "write_outside_output" : "read_outside_allowlist", tool: name, path: abs });
    }
  }
  return { reads, violations, counts, calls };
}

function validInputRel(rel) {
  const normalized = path.posix.normalize(String(rel || "").replace(/\\/g, "/"));
  return Boolean(rel) && normalized === String(rel).replace(/\\/g, "/") &&
    !path.posix.isAbsolute(normalized) && !path.win32.isAbsolute(normalized) &&
    !normalized.split("/").some((part) => !part || part === "." || part === "..");
}

async function inspectFrozenInput(taskDir, inputDir) {
  const result = {
    expected: [],
    actual: [],
    violations: [],
    allowlistPass: false,
    hashPass: false,
    frozenVersion: null,
    manifestError: "",
  };
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(safeJoin(taskDir, "artifacts", "12_freeze", "冻结清单.json"), "utf8"));
    result.frozenVersion = manifest.version || null;
  } catch (e) {
    result.manifestError = `冻结清单不可读：${String((e && e.message) || e)}`;
    result.violations.push({ kind: "frozen_manifest", detail: result.manifestError });
    return result;
  }
  if (!manifest || !Array.isArray(manifest.model_input_files)) {
    result.manifestError = "冻结清单缺少 model_input_files 数组";
    result.violations.push({ kind: "frozen_manifest", detail: result.manifestError });
    return result;
  }

  const expected = [];
  for (const [index, entry] of manifest.model_input_files.entries()) {
    if (!entry || !validInputRel(entry.path) || !Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ""))) {
      result.violations.push({ kind: "frozen_manifest_entry", detail: `model_input_files[${index}] 字段不合法` });
      continue;
    }
    expected.push({ path: entry.path.replace(/\\/g, "/"), bytes: entry.bytes, sha256: String(entry.sha256).toLowerCase() });
  }
  expected.sort((a, b) => a.path.localeCompare(b.path));
  result.expected = expected;

  const actualPaths = (await scanDirFiles(inputDir, ".")).sort((a, b) => a.localeCompare(b));
  for (const rel of actualPaths) {
    try {
      const digest = await fileDigest(safeJoin(inputDir, rel));
      result.actual.push({ path: rel, bytes: digest.bytes, sha256: digest.sha256 });
    } catch (e) {
      result.violations.push({ kind: "input_unreadable", path: rel, detail: String((e && e.message) || e) });
    }
  }
  const expectedMap = new Map(expected.map((entry) => [entry.path, entry]));
  const actualMap = new Map(result.actual.map((entry) => [entry.path, entry]));
  for (const entry of expected) {
    const actual = actualMap.get(entry.path);
    if (!actual) {
      result.violations.push({ kind: "input_missing", path: entry.path });
    } else if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) {
      result.violations.push({ kind: "input_hash_mismatch", path: entry.path });
    }
  }
  for (const entry of result.actual) {
    if (!expectedMap.has(entry.path)) result.violations.push({ kind: "input_extra", path: entry.path });
  }
  result.allowlistPass = result.violations.every((item) => item.kind !== "frozen_manifest" &&
    item.kind !== "frozen_manifest_entry" && item.kind !== "input_missing" && item.kind !== "input_extra");
  result.hashPass = result.violations.every((item) => item.kind !== "input_hash_mismatch" &&
    item.kind !== "input_missing" && item.kind !== "input_unreadable" && item.kind !== "frozen_manifest_entry");
  return result;
}

async function outputEmptyEvidence(outputDir, sessionStartedMs) {
  const paths = await scanDirFiles(outputDir, ".");
  if (!paths.length) {
    return {
      pass: Number.isFinite(sessionStartedMs),
      evidence: Number.isFinite(sessionStartedMs)
        ? "output 当前为空；未发现 13 启动前遗留文件"
        : "output 当前为空，但缺少 13 启动时间，无法排除启动前遗留",
    };
  }
  if (!Number.isFinite(sessionStartedMs)) {
    return { pass: false, evidence: `output 有 ${paths.length} 个文件，但缺少 13 启动时间` };
  }
  let earliest = null;
  for (const rel of paths) {
    const st = await fs.stat(safeJoin(outputDir, rel));
    const born = st.birthtimeMs;
    if (!Number.isFinite(born) || born <= 0) {
      return { pass: false, evidence: `output/${rel} 没有可用的创建时间，无法证明 13 启动时为空` };
    }
    if (earliest === null || born < earliest) earliest = born;
  }
  const pass = earliest >= sessionStartedMs - 5000;
  return {
    pass,
    evidence: pass
      ? `output 内 ${paths.length} 个文件均在 13 启动后创建（最早 ${new Date(earliest).toISOString()}）`
      : `output 存在 13 启动前创建的文件（最早 ${new Date(earliest).toISOString()}）`,
  };
}

function modelOf(events) {
  const descriptors = events.filter((event) => event && event.type === "subagent/descriptor");
  const descriptor = descriptors.length ? eventData(descriptors[descriptors.length - 1]) : {};
  const provider = String(descriptor.agentProvider || "");
  const model = String(descriptor.agentModel || "");
  const effort = String(descriptor.agentReasoningEffort || "");
  return { provider, model, effort, value: model && effort ? `${model}/${effort}` : "" };
}

function isolationWindow(events, header) {
  const times = events.map(eventTime).filter((value) => Number.isFinite(value));
  const created = Number(header && header.createdAt);
  if (Number.isFinite(created) && created > 0) times.push(created);
  if (!times.length) return null;
  return { start: Math.min(...times), end: Math.max(...times) };
}

function checkRow(checkId, pass, evidence) {
  return { check_id: checkId, status: pass ? "pass" : "fail", evidence };
}

function auditPass(audit) {
  const checkIds = new Set(audit.checks.map((check) => check.check_id));
  return checkIds.size === ISOLATION_CHECKS.length &&
    ISOLATION_CHECKS.every((checkId) => checkIds.has(checkId)) &&
    audit.checks.every((check) => check.status === "pass" && ISOLATION_CHECKS.includes(check.check_id)) &&
    audit.violations.length === 0;
}

function asIso(ms) {
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

function auditRender(phase, audit) {
  const passed = audit && audit.pass === true;
  const checks = audit && Array.isArray(audit.checks)
    ? audit.checks.map((check) => `${check.check_id}=${check.status}`).join("；")
    : "-";
  const violations = audit && Array.isArray(audit.violations) && audit.violations.length
    ? `\n违规：\n${audit.violations.map((item) => `  ${item.kind || "violation"}：${item.path || item.detail || ""}`).join("\n")}`
    : "";
  return text(`隔离 ${phase}：${passed ? "PASS" : "FAIL"}；会话 ${(audit && audit.session_id) || "-"}；${checks}${violations}`);
}

export function apply(ctx, config) {
  const root = path.resolve((config && config.root) || DEFAULT_ROOT);
  const templateName = (config && config.templateDir) || "母版";
  const templateDir = safeJoin(root, templateName);
  const maxTasks = (config && Number(config.maxTasks)) || 200;
  const sessionsDir = (config && config.sessionsDir) || path.join(homedir(), ".dsh", "sessions");
  const answerRoot = path.resolve((config && config.answerRoot) || "D:\\高经作答区");
  const isolationReadOnlyRoots = [
    { path: safeJoin(root, ".dsh", "skills"), kind: "project-skills" },
    { path: path.join(homedir(), ".dsh", "skills"), kind: "user-skills" },
    { path: path.dirname(process.execPath), kind: "node-runtime" },
    ...(Array.isArray(config && config.isolationAllowPaths)
      ? config.isolationAllowPaths
        .filter((item) => typeof item === "string" && path.isAbsolute(item))
        .map((item) => ({ path: path.resolve(item), kind: "configured-system" }))
      : []),
  ];

  function isolationPaths(taskId, runId, answerPackage) {
    const taskDir = safeJoin(root, "tasks", taskId);
    const expectedRoot = safeJoin(answerRoot, taskId, runId);
    const packageRoot = expectedRoot;
    const inputDir = safeJoin(packageRoot, "input");
    const outputDir = safeJoin(packageRoot, "output");
    const archiveBase = safeJoin(taskDir, "artifacts", "13_answer");
    const temporaryAudit = safeJoin(archiveBase, ".host-audit", `${runId}.json`);
    const finalAudit = safeJoin(archiveBase, runId, "隔离审计.json");
    const reportPath = safeJoin(taskDir, "artifacts", "14_score", runId, "评分.json");
    const tracePath = safeJoin(packageRoot, "host_trace.json");
    const suppliedMatch = typeof answerPackage === "string" && path.isAbsolute(answerPackage) && samePath(answerPackage, packageRoot);
    return { taskDir, packageRoot, inputDir, outputDir, archiveBase, temporaryAudit, finalAudit, reportPath, tracePath, suppliedMatch };
  }

  async function precheckIsolation(args, exec) {
    const taskId = String(args.taskId);
    const runId = String(args.runId);
    if (!ID_RE.test(taskId)) return { ok: false, phase: "precheck", error: "taskId 不合法" };
    if (!validRunId(runId)) return { ok: false, phase: "precheck", error: "runId 不合法" };
    if (!path.isAbsolute(String(args.answerPackage || ""))) {
      return { ok: false, phase: "precheck", error: "answerPackage 必须是规范绝对路径" };
    }

    const paths = isolationPaths(taskId, runId, String(args.answerPackage));
    const taskStat = await lstatMaybe(paths.taskDir);
    if (!taskStat || !taskStat.isDirectory()) return { ok: false, phase: "precheck", error: `题目目录不存在：${paths.taskDir}` };
    const packageStat = await lstatMaybe(paths.packageRoot);
    if (!packageStat || !packageStat.isDirectory()) {
      return { ok: false, phase: "precheck", error: `答案题包不存在：${paths.packageRoot}` };
    }

    const violations = [];
    const addViolation = (kind, detail, extra = {}) => violations.push({ kind, detail, ...extra });
    if (!paths.suppliedMatch) {
      addViolation("answer_package_path_mismatch", "answerPackage 与 answerRoot/taskId/runId 规范路径不一致", {
        supplied: String(args.answerPackage || ""),
        expected: paths.packageRoot,
      });
    }

    let session = null;
    let events = [];
    let header = {};
    let resolution = {};
    const currentSessionId = executionSessionId(exec);
    try {
      session = await resolveIsolationSession(sessionsDir, args.session ? String(args.session) : null, currentSessionId);
      events = session.events;
      header = sessionHeader(events) || {};
      resolution = session.resolution;
    } catch (e) {
      addViolation("session_unresolved", String((e && e.message) || e));
      resolution = { method: "unresolved", currentSessionId: currentSessionId || null, error: String((e && e.message) || e) };
    }

    const model = modelOf(events);
    if (session && model.value !== ISOLATION_MODEL) {
      addViolation("model_mismatch", `13 会话模型应为 ${ISOLATION_MODEL}，实际为 ${model.value || "缺失"}`);
    }
    const window = session ? isolationWindow(events, header) : null;
    const stepStarts = events.filter((event) => event && event.type === "step/start");
    const infrastructureFailure = !session || events.length === 0 || stepStarts.length === 0;
    if (session && !events.length) addViolation("session_events_missing", "13 会话没有可审计事件");
    if (session && !stepStarts.length) addViolation("session_steps_missing", "13 会话没有 step/start 事件");
    if (session && (!window || !(window.end >= window.start))) addViolation("session_time_invalid", "13 会话缺少有序起止时间");

    const sessionCwd = header && header.cwd ? String(header.cwd) : "";
    const context = {
      packageRoot: paths.packageRoot,
      inputDir: paths.inputDir,
      outputDir: paths.outputDir,
      readOnlyRoots: isolationReadOnlyRoots,
      sessionCwd,
    };
    const toolAudit = auditToolCalls(events, context);
    for (const item of toolAudit.violations) {
      addViolation(item.kind, item.tool ? `工具 ${item.tool} 访问 ${item.path}` : item.path, {
        tool: item.tool || null,
        path: item.path || null,
      });
    }

    const inputStat = await lstatMaybe(paths.inputDir);
    const outputStat = await lstatMaybe(paths.outputDir);
    const packageRedirect = await isRedirectPath(paths.packageRoot);
    const inputRedirect = inputStat ? await isRedirectPath(paths.inputDir) : false;
    const outputRedirect = outputStat ? await isRedirectPath(paths.outputDir) : false;
    const packageOutside = paths.suppliedMatch && !withinPath(paths.taskDir, paths.packageRoot) &&
      !withinPath(paths.packageRoot, paths.taskDir) && !packageRedirect;
    if (!packageOutside) addViolation("package_boundary", "题包必须是不重叠、非重定向的规范外部路径");

    const runMatch = packageOutside && path.basename(paths.packageRoot) === runId &&
      path.basename(path.dirname(paths.packageRoot)) === taskId;
    if (!runMatch) addViolation("run_id_mismatch", "题包最后两级目录必须严格等于 taskId/runId");

    const frozenInput = await inspectFrozenInput(paths.taskDir, paths.inputDir);
    for (const item of frozenInput.violations) addViolation(item.kind, item.detail || item.path || "冻结输入校验失败", item.path ? { path: item.path } : {});
    if (!inputStat || !inputStat.isDirectory() || inputRedirect) {
      addViolation("input_directory", "input 必须是非重定向普通目录");
    }
    if (!outputStat || !outputStat.isDirectory() || outputRedirect) {
      addViolation("output_directory", "output 必须是非重定向普通目录");
    }
    if (toolAudit.violations.length) addViolation("tool_path_boundary", `13 会话有 ${toolAudit.violations.length} 次越界路径访问`);

    const outputCheck = outputStat && outputStat.isDirectory() && !outputRedirect
      ? await outputEmptyEvidence(paths.outputDir, window && window.start)
      : { pass: false, evidence: "output 目录不存在或为重定向目录" };
    if (!outputCheck.pass) addViolation("output_not_initially_empty", outputCheck.evidence);

    const briefs = userTexts(events);
    const forbiddenBriefPaths = [paths.taskDir, root, safeJoin(paths.taskDir, "artifacts", "12_freeze")];
    const forbidden = briefs.flatMap((value) => forbiddenBriefPaths
      .filter((needle) => value.toLowerCase().includes(String(needle).toLowerCase()))
      .map((needle) => ({ needle, sample: truncate(value, 300) })));
    const briefPass = Boolean(session) && briefs.length > 0 && forbidden.length === 0;
    if (!briefs.length && session) addViolation("brief_missing", "13 会话没有可审计的 user/message brief");
    for (const hit of forbidden) addViolation("brief_path_leak", `13 brief 泄漏题包外路径 ${hit.needle}`, { sample: hit.sample });

    const startedMs = window ? window.start : Date.now();
    const endedMs = window ? window.end : startedMs;
    const rounds = stepStarts.length;
    const counts = toolAudit.counts;
    const toolCalls = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
    const trace = {
      schema_version: 1,
      source: "host",
      task_id: taskId,
      run_id: runId,
      session_id: session ? session.hit.id : null,
      model: ISOLATION_MODEL,
      started_at: asIso(startedMs),
      ended_at: asIso(endedMs),
      minutes: +Math.max(0, (endedMs - startedMs) / 60000).toFixed(6),
      rounds,
      step_count: rounds,
      tool_calls: toolCalls,
      isolation_status: "invalid",
      infrastructure_failure: infrastructureFailure,
      session_resolution: resolution,
      created_at: new Date().toISOString(),
    };

    const checks = [
      checkRow("PACKAGE_OUTSIDE_TASK_DIR", packageOutside, packageOutside ? "题包位于 taskDir 外且无目录重定向" : "题包路径越界、与 taskDir 重叠或为重定向目录"),
      checkRow("RUN_ID_MATCH", runMatch, runMatch ? `taskId=${taskId}, runId=${runId}` : "题包目录名与注入参数不一致"),
      checkRow("INPUT_ALLOWLIST", frozenInput.allowlistPass && inputStat?.isDirectory() && !inputRedirect && toolAudit.violations.length === 0,
        frozenInput.allowlistPass ? `输入清单一致；工具路径越界 ${toolAudit.violations.length} 次` : "输入文件集合与冻结清单不一致"),
      checkRow("INPUT_HASH", frozenInput.hashPass, frozenInput.hashPass ? "输入 bytes/sha256 全部匹配冻结清单" : "输入缺失、不可读或 hash 不匹配"),
      checkRow("OUTPUT_EMPTY", outputCheck.pass, outputCheck.evidence),
      checkRow("BRIEF_NO_TASKDIR", briefPass, briefPass ? `已审计 ${briefs.length} 条 user brief，无题包外路径` : `brief 缺失或包含题包外路径 ${forbidden.length} 处`),
    ];
    const audit = {
      schema_version: 1,
      task_id: taskId,
      run_id: runId,
      phase: "precheck",
      model: ISOLATION_MODEL,
      pass: false,
      status: "invalid",
      infrastructure_failure: infrastructureFailure,
      answer_package: paths.packageRoot,
      package_root: paths.packageRoot,
      input_dir: paths.inputDir,
      output_dir: paths.outputDir,
      frozen_version: frozenInput.frozenVersion,
      input_files: frozenInput.actual.length ? frozenInput.actual : frozenInput.expected,
      output_was_empty: outputCheck.pass,
      brief_contains_no_task_dir: briefPass,
      session_id: session ? session.hit.id : null,
      session_resolution: resolution,
      steps: rounds,
      rounds_source: "trace",
      rounds,
      started_at: asIso(startedMs),
      ended_at: asIso(endedMs),
      minutes: trace.minutes,
      checks,
      violations,
      read_paths: toolAudit.reads,
      whitelist: [
        { path: paths.inputDir, access: "read" },
        { path: paths.outputDir, access: "read-write" },
        ...isolationReadOnlyRoots.map((item) => ({ path: item.path, access: "read", kind: item.kind })),
      ],
      host_trace_path: paths.tracePath,
      audited_at: new Date().toISOString(),
    };
    audit.pass = auditPass(audit);
    audit.status = audit.pass ? "pass" : "invalid";
    trace.isolation_status = audit.status;

    await writeJsonAtomic(paths.tracePath, trace);
    audit.host_trace_sha256 = await sha256(paths.tracePath);
    const tempParent = path.dirname(paths.temporaryAudit);
    await fs.mkdir(tempParent, { recursive: true });
    if (await isRedirectPath(tempParent)) {
      return { ok: false, phase: "precheck", error: `临时审计目录是重定向路径：${tempParent}` };
    }
    await writeJsonAtomic(paths.temporaryAudit, audit);
    return {
      ok: true,
      phase: "precheck",
      taskId,
      runId,
      answerPackage: paths.packageRoot,
      auditPath: paths.temporaryAudit,
      tracePath: paths.tracePath,
      hostTraceSha256: audit.host_trace_sha256,
      pass: audit.pass,
      isolation_pass: audit.pass,
      isolationStatus: audit.status,
      infrastructure_failure: infrastructureFailure,
      checks,
      violations,
      session: session ? { id: session.hit.id, resolution } : { id: null, resolution },
      message: infrastructureFailure
        ? "隔离证据不足，已写 fail-closed 审计与 host trace；停止评分并人工处理"
        : audit.pass
          ? "隔离预检通过；judge 成功后执行 finalize"
          : "隔离预检结论为 invalid，证据已保留；judge 成功后执行 finalize 并绑定 C02",
    };
  }

  async function finalizeIsolation(args) {
    const taskId = String(args.taskId);
    const runId = String(args.runId);
    if (!ID_RE.test(taskId)) return { ok: false, phase: "finalize", error: "taskId 不合法" };
    if (!validRunId(runId)) return { ok: false, phase: "finalize", error: "runId 不合法" };
    if (!path.isAbsolute(String(args.answerPackage || ""))) {
      return { ok: false, phase: "finalize", error: "answerPackage 必须是规范绝对路径" };
    }
    const paths = isolationPaths(taskId, runId, String(args.answerPackage));
    if (!paths.suppliedMatch) return { ok: false, phase: "finalize", error: "answerPackage 不符合规范路径" };

    let audit;
    try {
      audit = JSON.parse(await fs.readFile(paths.temporaryAudit, "utf8"));
    } catch (e) {
      return { ok: false, phase: "finalize", error: `临时审计不可读：${String((e && e.message) || e)}` };
    }
    if (!isPlainObject(audit) || audit.schema_version !== 1 || audit.task_id !== taskId || audit.run_id !== runId || audit.phase !== "precheck") {
      return { ok: false, phase: "finalize", error: "临时审计身份或 schema 不匹配" };
    }
    if (typeof audit.pass !== "boolean" || typeof audit.infrastructure_failure !== "boolean" ||
      !Array.isArray(audit.violations) || (audit.status !== "pass" && audit.status !== "invalid")) {
      return { ok: false, phase: "finalize", error: "临时审计缺少合法结论、infrastructure_failure 或 violations" };
    }
    const isolationPass = audit.pass === true && audit.status === "pass" &&
      !audit.infrastructure_failure && audit.violations.length === 0;
    const isolationStatus = isolationPass ? "pass" : "invalid";
    if (!samePath(audit.package_root || "", paths.packageRoot) || !samePath(audit.input_dir || "", paths.inputDir) ||
      !samePath(audit.output_dir || "", paths.outputDir)) {
      return { ok: false, phase: "finalize", error: "临时审计题包路径不匹配" };
    }
    const traceHash = await sha256(paths.tracePath).catch(() => "");
    if (!traceHash || traceHash !== audit.host_trace_sha256) {
      return { ok: false, phase: "finalize", error: "host_trace 缺失或 hash 与临时审计不一致" };
    }

    let report;
    try {
      report = JSON.parse(await fs.readFile(paths.reportPath, "utf8"));
    } catch (e) {
      return { ok: false, phase: "finalize", error: `评分报告不可读：${String((e && e.message) || e)}` };
    }
    const copy = report && report.copy;
    if (!isPlainObject(copy) || !copy.destination || !samePath(copy.destination, path.dirname(paths.finalAudit))) {
      return { ok: false, phase: "finalize", error: "评分报告没有指向当前分卷的目标归档" };
    }
    if (copy.error) return { ok: false, phase: "finalize", error: `judge 归档失败：${truncate(copy.error, 300)}` };

    const finalDir = path.dirname(paths.finalAudit);
    if (path.dirname(finalDir) !== paths.archiveBase || !samePath(path.dirname(finalDir), paths.archiveBase)) {
      return { ok: false, phase: "finalize", error: "最终审计目标不是 13_answer 的直接子目录" };
    }
    const finalStat = await lstatMaybe(finalDir);
    if (!finalStat || !finalStat.isDirectory() || await isRedirectPath(finalDir)) {
      return { ok: false, phase: "finalize", error: "judge 归档目录不存在或是重定向目录" };
    }

    const tempDigest = await sha256(paths.temporaryAudit);
    if (await exists(paths.finalAudit)) {
      const currentDigest = await sha256(paths.finalAudit).catch(() => "");
      if (currentDigest === tempDigest) {
        return {
          ok: true,
          phase: "finalize",
          taskId,
          runId,
          answerPackage: paths.packageRoot,
          auditPath: paths.finalAudit,
          temporaryAuditPath: paths.temporaryAudit,
          auditSha256: tempDigest,
          pass: isolationPass,
          isolationStatus,
          infrastructure_failure: audit.infrastructure_failure,
          message: isolationPass
            ? "最终隔离审计已存在且 hash 一致；隔离结论 PASS"
            : "最终失败隔离审计已存在且 hash 一致；隔离结论 INVALID",
        };
      }
      return { ok: false, phase: "finalize", error: "最终隔离审计已存在且内容不同，拒绝覆盖" };
    }

    const staging = safeJoin(finalDir, `.隔离审计.json.tmp-${process.pid}-${Date.now()}`);
    try {
      await fs.copyFile(paths.temporaryAudit, staging);
      const copiedHash = await sha256(staging);
      if (copiedHash !== tempDigest) throw new Error("临时审计复制后 hash 不一致");
      await fs.rename(staging, paths.finalAudit);
      const finalHash = await sha256(paths.finalAudit);
      if (finalHash !== tempDigest) throw new Error("最终隔离审计落盘后 hash 不一致");
      const finalData = JSON.parse(await fs.readFile(paths.finalAudit, "utf8"));
      if (finalData.schema_version !== 1 || finalData.task_id !== taskId ||
        finalData.run_id !== runId || finalData.phase !== "precheck") {
        throw new Error("最终隔离审计身份或 schema 不一致");
      }
      return {
        ok: true,
        phase: "finalize",
        taskId,
        runId,
        answerPackage: paths.packageRoot,
        auditPath: paths.finalAudit,
        temporaryAuditPath: paths.temporaryAudit,
        auditSha256: finalHash,
        pass: isolationPass,
        isolationStatus,
        infrastructure_failure: audit.infrastructure_failure,
        message: isolationPass
          ? "最终隔离审计已归档；隔离结论 PASS"
          : "最终隔离审计已归档；隔离结论 INVALID，作为 C02 首轮失败证据",
      };
    } catch (e) {
      await fs.rm(staging, { force: true }).catch(() => {});
      return { ok: false, phase: "finalize", error: String((e && e.message) || e) };
    }
  }

  // ── 1. 开新题 ──────────────────────────────────────────────
  ctx.tools.register(tool({
    name: "authoring_init",
    description:
      "为 19 节点出题流水线开一道新题：按母版 manifest.json 的 files 列表复制模板文件，" +
      "重算 SHA-256 并冻结。不覆盖已存在的题目；复制失败会回滚本次新建的题目目录。",
    parameters: {
      industry: { type: "string", required: true, description: "行业，L1 或 L1/L2，例如「电商、消费品与零售」" },
      taskId: { type: "string", description: "题目 ID，字母数字连字符下划线，2–64 字符；省略时自动生成 T-YYYYMMDD-NN" },
      specPath: { type: "string", description: "可选：当期项目规范文件或目录路径，写入任务 manifest 的 spec 字段" },
    },
    output: {
      ok: { type: "boolean", required: true },
      taskId: { type: "string" },
      taskDir: { type: "string" },
      prompts: { type: "integer" },
      files: { type: "integer" },
      manifestPath: { type: "string" },
      workflowPath: { type: "string" },
      templateVersion: { type: "string" },
      templateSha: { type: "string" },
      next: { type: "string" },
      error: { type: "string" },
    },
    render: (_a, v) => text(v.ok
      ? `已开题 ${v.taskId}：按 ${v.templateVersion} 清单冻结 ${v.files} 个文件（${v.prompts} 份提示词）。\n目录：${v.taskDir}\n${v.next}`
      : `开题失败：${v.error}`),
    async execute(args) {
      const tasksDir = safeJoin(root, "tasks");
      const taskId = args.taskId ? String(args.taskId) : await nextTaskId(tasksDir);
      if (!ID_RE.test(taskId)) return { ok: false, error: `taskId 不合法：${taskId}` };

      const count = (await fs.readdir(tasksDir).catch(() => [])).length;
      if (count >= maxTasks) return { ok: false, error: `题目数已达上限 ${maxTasks}` };

      const taskDir = safeJoin(tasksDir, taskId);
      if (await exists(taskDir)) return { ok: false, error: `题目目录已存在，不覆盖：${taskDir}` };

      const templateManifestPath = safeJoin(templateDir, "manifest.json");
      const templateManifestRaw = await fs.readFile(templateManifestPath);
      const templateSha = createHash("sha256").update(templateManifestRaw).digest("hex");
      let templateManifest;
      try {
        templateManifest = JSON.parse(templateManifestRaw.toString("utf8"));
      } catch (e) {
        return { ok: false, error: `母版 manifest.json 不是有效 JSON：${String((e && e.message) || e)}` };
      }
      const templateFiles = manifestEntries(templateManifest, "母版 manifest.json");
      const version = typeof templateManifest.version === "string" ? templateManifest.version.trim() : "";
      if (!version) return { ok: false, error: "母版 manifest.json 缺少 version" };

      let createdTaskDir = false;
      try {
        await fs.mkdir(tasksDir, { recursive: true });
        await fs.mkdir(taskDir, { recursive: false });
        createdTaskDir = true;
        await fs.mkdir(path.join(taskDir, "artifacts"), { recursive: true });

        const files = [];
        for (const entry of templateFiles) {
          const from = safeJoin(templateDir, entry.path);
          const to = safeJoin(taskDir, entry.path);
          await fs.mkdir(path.dirname(to), { recursive: true });
          await fs.copyFile(from, to);
          const digest = await fileDigest(to);
          files.push({ path: entry.path, ...digest });
        }

        const manifest = {
          task: taskId,
          industry: args.industry,
          spec: args.specPath ?? null,
          version,
          template_version: version,
          template_sha: templateSha,
          frozen_at: new Date().toISOString(),
          files,
          rule: "节点执行前校验 SHA-256；改提示词必须新开版本，不能改已跑过的题。",
        };
        const manifestPath = path.join(taskDir, "manifest.json");
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        const prompts = files.filter((f) => f.path.startsWith("prompts/") && f.path.endsWith(".md")).length;
        const workflowArgs = {
          taskDir,
          batch: "A",
          specPath: args.specPath || "<调用 workflow 前填写当期项目规范文件或目录路径>",
          industry: args.industry,
        };
        return {
          ok: true,
          taskId,
          taskDir,
          prompts,
          files: files.length,
          manifestPath,
          workflowPath: path.join(taskDir, "workflow.js"),
          templateVersion: version,
          templateSha,
          next:
            `下一步：调用 authoring_script 取脚本，按批次提交 workflow，args = ${JSON.stringify(workflowArgs)}。` +
            "批次 A=00_spec+01–07、B=08–12、C=13–16、D=17–18；上一批通过再跑下一批。",
        };
      } catch (e) {
        let rollbackError = "";
        if (createdTaskDir) {
          try {
            await rollbackTaskDir(taskDir, tasksDir);
          } catch (rollbackFailure) {
            rollbackError = `；回滚失败：${String((rollbackFailure && rollbackFailure.message) || rollbackFailure)}`;
          }
        }
        return { ok: false, error: `复制母版失败：${String((e && e.message) || e)}${rollbackError}` };
      }
    },
    presentCall: (a) => ({ card: "generic", title: `开新题${a.taskId ? "：" + a.taskId : ""}`, kind: "other", rawInput: a }),
  }));

  // ── 2. 校验冻结 ─────────────────────────────────────────────
  ctx.tools.register(tool({
    name: "authoring_verify",
    description:
      "校验任务 manifest 列出的全部文件。against=task 时对照任务自己的 manifest；" +
      "against=template 时对照当前母版文件及母版 manifest，报出新增、删除、变更。只读。",
    parameters: {
      taskId: { type: "string", required: true, description: "题目 ID" },
      against: { type: "string", description: "task（默认，对照任务 manifest）或 template（对照当前母版）" },
    },
    output: {
      ok: { type: "boolean", required: true },
      clean: { type: "boolean" },
      against: { type: "string" },
      changed: { type: "array", items: { type: "string" } },
      missing: { type: "array", items: { type: "string" } },
      deleted: { type: "array", items: { type: "string" } },
      added: { type: "array", items: { type: "string" } },
      templateVersion: { type: "string" },
      taskVersion: { type: "string" },
      error: { type: "string" },
    },
    render: (_a, v) => {
      if (!v.ok) return text(`校验失败：${v.error}`);
      if (v.clean) {
        return text(`校验通过（${v.against === "template" ? "任务副本与当前母版一致" : "任务副本与自身 manifest 一致"}）。`);
      }
      const details = [];
      if (v.changed.length) details.push(`变更：${v.changed.join("、")}`);
      if (v.missing.length) details.push(`缺失：${v.missing.join("、")}`);
      if (v.deleted.length) details.push(`删除：${v.deleted.join("、")}`);
      if (v.added.length) details.push(`新增：${v.added.join("、")}`);
      return text(
        `校验不一致（${v.against}）：改 ${v.changed.length}、缺 ${v.missing.length}、` +
        `删 ${v.deleted.length}、增 ${v.added.length}` +
        (v.templateVersion ? `；任务 ${v.taskVersion || "-"} / 母版 ${v.templateVersion}` : "") +
        (details.length ? `\n${details.join("\n")}` : ""),
      );
    },
    async execute(args) {
      if (!ID_RE.test(String(args.taskId))) return { ok: false, error: "taskId 不合法" };
      const against = args.against || "task";
      if (against !== "task" && against !== "template") {
        return { ok: false, error: `参数错误：against 必须为 task 或 template，实际为 ${against}` };
      }

      const taskDir = safeJoin(root, "tasks", String(args.taskId));
      try {
        const taskManifestPath = path.join(taskDir, "manifest.json");
        const taskRead = await readManifest(taskManifestPath, "任务 manifest.json");
        const taskDeclaredMap = new Map(taskRead.files.map((f) => [f.path, f.sha256]));

        if (against === "task") {
          const actual = await hashManagedFiles(taskDir, [...taskDeclaredMap.keys()]);
          const changed = [], missing = [];
          for (const [rel, expected] of taskDeclaredMap) {
            if (!actual.has(rel)) missing.push(rel);
            else if (actual.get(rel) !== expected) changed.push(rel);
          }
          const added = [...actual.keys()].filter((rel) => !taskDeclaredMap.has(rel));
          const clean = !changed.length && !missing.length && !added.length;
          return {
            ok: true,
            clean,
            against,
            changed: changed.sort(),
            missing: missing.sort(),
            deleted: missing.sort(),
            added: added.sort(),
            templateVersion: String(taskRead.manifest.template_version || ""),
            taskVersion: String(taskRead.manifest.version || ""),
          };
        }

        const templateManifestPath = safeJoin(templateDir, "manifest.json");
        const templateManifestRaw = await fs.readFile(templateManifestPath);
        const templateSha = createHash("sha256").update(templateManifestRaw).digest("hex");
        let templateManifest;
        try {
          templateManifest = JSON.parse(templateManifestRaw.toString("utf8"));
        } catch (e) {
          return { ok: false, error: `母版 manifest.json 不是有效 JSON：${String((e && e.message) || e)}` };
        }
        const templateFiles = manifestEntries(templateManifest, "母版 manifest.json");
        const templateDeclaredMap = new Map(templateFiles.map((f) => [f.path, f.sha256]));

        // 整个母版目录按实际内容扫描，未登记到 manifest 的物理新增文件（包括根目录
        // rubric.json 一类文件）也会进入差异，不会被“只遍历 manifest”掩盖。
        const templateScope = [...templateDeclaredMap.keys()];
        const actualTemplate = await hashManagedFiles(templateDir, templateScope, {
          scanRoot: true,
          exclude: ["manifest.json"],
        });
        const currentTemplatePaths = new Set([
          ...templateDeclaredMap.keys(),
          ...actualTemplate.keys(),
        ]);
        const taskScope = new Set([...taskDeclaredMap.keys(), ...currentTemplatePaths]);
        const actualTask = await hashManagedFiles(taskDir, [...taskScope]);
        const taskPaths = new Set([...taskDeclaredMap.keys(), ...actualTask.keys()]);

        const changedSet = new Set();
        for (const rel of taskPaths) {
          if (!actualTask.has(rel) || !actualTemplate.has(rel)) continue;
          const taskHash = actualTask.get(rel);
          const templateHash = actualTemplate.get(rel);
          const taskDeclaredHash = taskDeclaredMap.get(rel);
          const templateDeclaredHash = templateDeclaredMap.get(rel);
          if (
            taskHash !== templateHash ||
            taskHash !== taskDeclaredHash ||
            templateHash !== templateDeclaredHash
          ) {
            changedSet.add(rel);
          }
        }
        if (taskRead.manifest.template_sha !== templateSha) changedSet.add("manifest.json");

        // added/deleted 表示把任务副本同步到当前母版所需的变化；missing 专门表示
        // 任务 manifest 已冻结但任务目录中物理缺失的文件，避免同一路径重复归入 added。
        const addedSet = new Set([...currentTemplatePaths].filter((rel) => !taskPaths.has(rel)));
        const deletedSet = new Set([...taskPaths].filter((rel) => !actualTemplate.has(rel)));
        const missingSet = new Set(
          [...taskDeclaredMap.keys()].filter((rel) => !actualTask.has(rel)),
        );
        const changed = [...changedSet].sort();
        const missing = [...missingSet].sort();
        const deleted = [...deletedSet].sort();
        const added = [...addedSet].sort();
        const clean = !changed.length && !missing.length && !deleted.length && !added.length;
        return {
          ok: true,
          clean,
          against,
          changed,
          missing,
          deleted,
          added,
          templateVersion: String(templateManifest.version || ""),
          taskVersion: String(taskRead.manifest.version || ""),
        };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
  }));

  // ── 3. 查进度 ───────────────────────────────────────────────
  ctx.tools.register(tool({
    name: "authoring_status",
    description:
      "查看某题跑到哪一步：按 C01/C02 卷列出 14 评分、13 隔离审计、是否补跑与选择结果，" +
      "并读取 14 补卷判定/汇总终态；兼容旧版根评分单卷布局。只读。",
    parameters: { taskId: { type: "string", required: true, description: "题目 ID" } },
    output: {
      ok: { type: "boolean", required: true },
      taskDir: { type: "string" },
      nodes: { type: "array", items: { type: "object" } },
      buildDirs: { type: "array", items: { type: "string" } },
      volumes: { type: "array", items: { type: "object" } },
      rerun: { type: "object" },
      summary: { type: "object" },
      verdicts: { type: "array", items: { type: "string" } },
      error: { type: "string" },
    },
    render: (_a, v) => {
      if (!v.ok) return text(`查询失败：${v.error}`);
      const volumeRows = v.volumes.length
        ? v.volumes.map((volume) => `  ${volume.volumeDisplay || volumeDisplay(volume)}`).join("\n")
        : "  未发现评分或隔离审计";
      const rerunBits = [`状态=${v.rerun.status}`];
      if (v.rerun.firstRunId) rerunBits.push(`首卷=${v.rerun.firstRunId}`);
      if (v.rerun.supplementRequired !== null) {
        rerunBits.push(`需要补卷=${v.rerun.supplementRequired ? "是" : "否"}`);
      }
      if (v.rerun.supplementRunId) rerunBits.push(`补卷=${v.rerun.supplementRunId}`);
      if (v.rerun.selectedRunId) rerunBits.push(`选择=${v.rerun.selectedRunId}`);
      if (v.rerun.selectionRule) rerunBits.push(`规则=${v.rerun.selectionRule}`);
      const triggerText = v.rerun.triggerReasons.length
        ? `\n  触发：${v.rerun.triggerReasons.join("；")}`
        : "";
      const decisionError = v.rerun.decisionError ? `\n  补卷判定错误：${v.rerun.decisionError}` : "";
      const summaryBits = [`exists=${v.summary.exists ? "是" : "否"}`];
      if (v.summary.selectedRunId) summaryBits.push(`选择=${v.summary.selectedRunId}`);
      if (v.summary.pass !== null) summaryBits.push(`pass=${v.summary.pass}`);
      if (v.summary.stopReason) summaryBits.push(`停止原因=${v.summary.stopReason}`);
      if (v.summary.error) summaryBits.push(`错误=${v.summary.error}`);
      return text(
        `进度（${v.nodes.length} 个节点目录）：\n` +
        v.nodes.map((n) => `  ${n.node}：${n.files} 文件，${n.updatedAt || "-"}`).join("\n") +
        `\n06 产物目录：${v.buildDirs.length ? v.buildDirs.join("、") : "未发现"}` +
        `\n按卷：\n${volumeRows}` +
        `\n补卷：${rerunBits.join("；")}${triggerText}${decisionError}` +
        `\n汇总终态：${summaryBits.join("；")}` +
        (v.verdicts.length ? `\n判定：${v.verdicts.join("；")}` : ""),
      );
    },
    async execute(args) {
      if (!ID_RE.test(String(args.taskId))) return { ok: false, error: "taskId 不合法" };
      const taskDir = safeJoin(root, "tasks", String(args.taskId));
      const artDir = path.join(taskDir, "artifacts");
      const names = (await fs.readdir(artDir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory()).map((e) => e.name).sort();
      const nodes = [], verdicts = [];
      const handled = new Set();

      const gatePath = path.join(artDir, "00_spec", "项目门槛.json");
      if (await exists(gatePath)) {
        handled.add("00_spec/项目门槛.json");
        try {
          const gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
          verdicts.push(`00_spec/项目门槛.json：${gateVerdict(gate)}`);
        } catch (e) {
          verdicts.push(`00_spec/项目门槛.json：解析失败 ${truncate((e && e.message) || e, 180)}`);
        }
      }

      const metadata = await readStatusMetadata(taskDir);
      const statusData = await statusVolumes(taskDir, metadata);
      handled.add("14_score/评分.json");
      for (const volume of statusData.volumes) verdicts.push(volume.scoreVerdict);
      if (!statusData.volumes.length) verdicts.push("artifacts/14_score：未发现评分");

      const decision = metadata.decision;
      if (!decision.exists) {
        verdicts.push(`${decision.path}：尚未判定`);
      } else if (decision.error) {
        verdicts.push(`${decision.path}：不可用（${decision.error}）`);
      } else {
        const parts = [decision.status];
        if (decision.supplementRunId) parts.push(`补卷=${decision.supplementRunId}`);
        if (decision.selectedRunId) parts.push(`选择=${decision.selectedRunId}`);
        if (decision.triggerReasons.length) parts.push(`触发=${decision.triggerReasons.join("；")}`);
        verdicts.push(`${decision.path}：${parts.join("；")}`);
      }
      if (metadata.summary.exists) {
        const parts = [];
        if (metadata.summary.error) parts.push(`不可用（${metadata.summary.error}）`);
        else {
          if (metadata.summary.selectedRunId) parts.push(`选择=${metadata.summary.selectedRunId}`);
          if (metadata.summary.pass !== null) parts.push(`pass=${metadata.summary.pass}`);
          if (metadata.summary.stopReason) parts.push(`停止原因=${metadata.summary.stopReason}`);
        }
        verdicts.push(`${metadata.summary.path}：${parts.join("；") || "已记录"}`);
      }

      for (const n of names) {
        const dir = path.join(artDir, n);
        const files = await countFiles(dir);
        let updatedAt = "";
        try { updatedAt = (await fs.stat(dir)).mtime.toISOString(); } catch { /* 忽略 */ }
        nodes.push({ node: n, files, updatedAt });
        for (const cand of ["result.json", "评分.json", "诊断.md", "结论.md"]) {
          if (handled.has(`${n}/${cand}`)) continue;
          const f = path.join(dir, cand);
          if (!(await exists(f))) continue;
          const body = await fs.readFile(f, "utf8").catch(() => "");
          const m = body.match(/"pass"\s*:\s*(true|false)|"score"\s*:\s*(\d+)|结论[:：]\s*(通过|不通过)/);
          if (m) verdicts.push(`${n}/${cand}：${m[0].replace(/\s+/g, " ")}`);
        }
      }
      const buildDirs = BUILD_DIR_CANDIDATES.filter((name) => names.includes(name));
      const volumes = statusData.volumes.map((volume) => ({
        ...volume,
        volumeDisplay: volumeDisplay(volume),
      }));
      return {
        ok: true,
        taskDir,
        nodes,
        buildDirs,
        volumes,
        rerun: {
          status: metadata.status,
          firstRunId: metadata.firstRunId,
          supplementRequired: metadata.supplementRequired,
          supplementRunId: metadata.supplementRunId,
          selectedRunId: metadata.selectedRunId,
          selectionRule: metadata.selectionRule,
          selectionEvidence: metadata.selectionEvidence,
          triggerReasons: metadata.triggerReasons,
          decisionPath: decision.path,
          decisionError: decision.error,
          legacyLayout: statusData.legacyLayout,
        },
        summary: {
          exists: metadata.summary.exists,
          path: metadata.summary.path,
          selectedRunId: metadata.summary.selectedRunId,
          pass: metadata.summary.pass,
          stopReason: metadata.summary.stopReason,
          error: metadata.summary.error,
        },
        verdicts,
      };
    },
  }));

  // ── 4. 取编排脚本 ───────────────────────────────────────────
  ctx.tools.register(tool({
    name: "authoring_script",
    description:
      "返回某题的 workflow 编排脚本正文，供模型原样提交给 workflow 工具，避免模型改写脚本。" +
      "kind=batch 返回当前 workflow.js 并附单批 args 说明；kind=full 保持全量说明；" +
      "kind=short 取 13 作答→14 评分两节点。只读。",
    parameters: {
      taskId: { type: "string", required: true, description: "题目 ID" },
      kind: { type: "string", description: "batch、full 或 short，默认 full；已删除 range" },
    },
    output: {
      ok: { type: "boolean", required: true },
      kind: { type: "string" },
      script: { type: "string" },
      taskDir: { type: "string" },
      workflowArgs: { type: "object" },
      note: { type: "string" },
      error: { type: "string" },
    },
    render: (_a, v) => text(v.ok ? `${v.note}\n\`\`\`js\n${v.script}\n\`\`\`` : `取脚本失败：${v.error}`),
    async execute(args) {
      if (!ID_RE.test(String(args.taskId))) return { ok: false, error: "taskId 不合法" };
      const kind = args.kind || "full";
      if (kind === "range") {
        return {
          ok: false,
          error: "参数错误：range 模式已删除（按行截取会截断代码块），请改用 kind=batch 配合 workflow args.batch",
        };
      }
      if (kind !== "full" && kind !== "batch" && kind !== "short") {
        return { ok: false, error: `参数错误：kind 必须为 batch、full 或 short，实际为 ${kind}` };
      }

      const taskDir = safeJoin(root, "tasks", String(args.taskId));
      const file = kind === "short" ? "workflow_s2.js" : "workflow.js";
      const script = await fs.readFile(path.join(taskDir, file), "utf8");
      const workflowArgs = kind === "short" ? undefined : {
        taskDir,
        batch: "A",
        specPath: "<当期项目规范文件或目录>",
        industry: "<L1 或 L1/L2 行业>",
      };
      let note;
      if (kind === "short") {
        note = `把上面的脚本原样作为 workflow 工具的 script 提交；args 示例：` +
          `{"taskDir": ${JSON.stringify(taskDir)}, "specPath": "<当期项目规范>", "industry": "<行业>"}。` +
          `taskDir、specPath、industry 均必须非空。`;
      } else if (kind === "batch") {
        note = `已返回当前 workflow.js 原文。每次只提交一个批次，args 示例：${JSON.stringify(workflowArgs)}；` +
          `batch 可为 A=00_spec+01–07、B=08–12、C=13–16、D=17–18、all=全量。` +
          `taskDir、batch、specPath、industry 均必须非空；上一批通过再跑下一批。`;
      } else {
        note = `把上面的脚本原样作为 workflow 工具的 script 提交。full 脚本按 args.batch 分批执行：` +
          `A=00_spec+01–07、B=08–12、C=13–16、D=17–18、all=全量。args 示例：` +
          `{"taskDir": ${JSON.stringify(taskDir)}, "batch": "A", "specPath": "<当期项目规范>", "industry": "<行业>"}；` +
          `四项均必须非空。init 未传 specPath 时，须在实际调用 workflow 前补齐。上一批通过再跑下一批。`;
      }
      return { ok: true, kind, script, taskDir, ...(workflowArgs ? { workflowArgs } : {}), note };
    },
  }));
  // ── 5. 监管中间节点 ────────────────────────────────────────
  ctx.tools.register(tool({
    name: "authoring_trace",
    description:
      "读取 DSH 的会话记录（session.v4.jsonl.zstd），还原 workflow 里每个 subagent 的进度与错误：" +
      "步数、工具调用分布、失败的调用、最近 N 次调用的参数与结果摘要。只读，不解密任何凭据。",
    parameters: {
      taskId: { type: "string", required: true, description: "题目 ID，用于附带该题 artifacts 的进度" },
      session: { type: "string", description: "会话 ID；省略时取最近修改的会话" },
      lastN: { type: "integer", description: "返回最近多少次工具调用，默认 15" },
      errorsOnly: { type: "boolean", description: "true 时 recent 只含失败的调用" },
    },
    output: {
      ok: { type: "boolean", required: true },
      session: { type: "object" },
      steps: { type: "integer" },
      subagents: { type: "array", items: { type: "object" } },
      tools: { type: "object" },
      errorCount: { type: "integer" },
      errors: { type: "array", items: { type: "object" } },
      recent: { type: "array", items: { type: "object" } },
      artifacts: { type: "array", items: { type: "object" } },
      lastActivity: { type: "string" },
      error: { type: "string" },
    },
    render: (_a, v) => {
      if (!v.ok) return text(`读取失败：${v.error}`);
      const head = `会话 ${v.session.id.slice(0, 8)}（${v.session.workspace}，${v.session.sizeMB}MB，最后活动 ${v.lastActivity || "-"}）\n` +
        `步数 ${v.steps}｜工具 ${Object.entries(v.tools).map(([k, n]) => `${k}×${n}`).join(" ")}｜失败 ${v.errorCount}`;
      const sub = v.subagents.map((s) => `  ${s.label}：${s.model} / ${s.effort}`).join("\n");
      const errs = v.errors.length ? `\n最近错误：\n` + v.errors.map((e) => `  [${e.turn}.${e.step}] ${e.tool} → ${e.error}`).join("\n") : "";
      const rec = v.recent.length ? `\n最近调用：\n` + v.recent.map((r) => `  [${r.turn}.${r.step}] ${r.tool}${r.failed ? " ✗" : ""} ${r.args}`).join("\n") : "";
      const art = v.artifacts.length ? `\n产物：\n` + v.artifacts.map((a) => `  ${a.node}：${a.files} 文件，${a.updatedAt || "-"}`).join("\n") : "";
      return text(head + (sub ? "\nsubagent：\n" + sub : "") + errs + rec + art);
    },
    async execute(args) {
      try {
        if (!ID_RE.test(String(args.taskId))) return { ok: false, error: "taskId 不合法" };
        const hit = await findSessionFile(sessionsDir, args.session ? String(args.session) : null);
        if (!hit) return { ok: false, error: `在 ${sessionsDir} 下没找到会话记录` };

        const buf = await fs.readFile(hit.file);
        if (buf.length > 80 * 1024 * 1024) return { ok: false, error: `会话文件过大（${(buf.length / 1048576).toFixed(1)}MB）` };
        const raw = decodeSession(buf);

        const events = [];
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try { events.push(JSON.parse(line)); } catch { /* 跳过坏行 */ }
        }

        const sum = summarizeEvents(events, { lastN: args.lastN || 15 });
        if (args.errorsOnly) sum.recent = sum.recent.filter((r) => r.failed);

        const artDir = safeJoin(root, "tasks", String(args.taskId), "artifacts");
        const names = (await fs.readdir(artDir, { withFileTypes: true }).catch(() => []))
          .filter((e) => e.isDirectory()).map((e) => e.name).sort();
        const artifacts = [];
        for (const n of names) {
          const dir = path.join(artDir, n);
          let updatedAt = "";
          try { updatedAt = (await fs.stat(dir)).mtime.toISOString(); } catch { /* 忽略 */ }
          artifacts.push({ node: n, files: await countFiles(dir), updatedAt });
        }

        return {
          ok: true,
          session: {
            id: hit.id,
            workspace: hit.workspace,
            sizeMB: +(hit.size / 1048576).toFixed(2),
            path: hit.file,
          },
          steps: sum.steps,
          subagents: sum.subagents,
          tools: sum.tools,
          errorCount: sum.errorCount,
          errors: sum.errors,
          recent: sum.recent,
          artifacts,
          lastActivity: sum.lastActivity,
        };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
  }));

  // ── 6. 13 隔离审计（precheck → judge → finalize）───────────
  ctx.tools.register(tool({
    name: "authoring_isolate",
    description:
      "13 作答的 host-owned 两阶段隔离审计。phase=precheck 从当前 14 会话定位同批 13 子会话，" +
      "校验外部题包、输入白名单/hash、初始输出与工具路径，写题包 host_trace.json 和 .host-audit 临时审计；" +
      "judge 成功后 phase=finalize 只把临时审计归档为 13_answer/<runId>/隔离审计.json。" +
      "无法取得 workflow 父会话时可传 session 显式指定 13 会话；证据不足始终 fail closed。只读 ~/.dsh。",
    parameters: {
      taskId: { type: "string", required: true, description: "题目 ID，必须等于 taskDir 目录名" },
      runId: { type: "string", required: true, description: "卷号，C01 或 C02（按运行契约 pattern 校验）" },
      answerPackage: { type: "string", required: true, description: "规范绝对路径：<answerRoot>/<taskId>/<runId>" },
      phase: { type: "string", description: "precheck（默认）或 finalize" },
      session: { type: "string", description: "precheck fallback：直接指定 13 会话 ID；正常应由 exec.agent 自动定位" },
    },
    output: {
      ok: { type: "boolean", required: true },
      phase: { type: "string" },
      taskId: { type: "string" },
      runId: { type: "string" },
      answerPackage: { type: "string" },
      auditPath: { type: "string" },
      temporaryAuditPath: { type: "string" },
      tracePath: { type: "string" },
      hostTraceSha256: { type: "string" },
      auditSha256: { type: "string" },
      pass: { type: "boolean" },
      isolation_pass: { type: "boolean" },
      isolationStatus: { type: "string" },
      infrastructure_failure: { type: "boolean" },
      checks: { type: "array", items: { type: "object" } },
      violations: { type: "array", items: { type: "object" } },
      session: { type: "object" },
      message: { type: "string" },
      error: { type: "string" },
    },
    render: (_a, v) => {
      if (v.phase === "finalize") {
        if (!v.ok) return text(`隔离 finalize：MECHANISM FAIL；${v.error || "未知错误"}`);
        return text(`隔离 finalize：${v.isolationStatus === "pass" ? "PASS" : "INVALID"}；${v.message}`);
      }
      return auditRender("precheck", {
        pass: v.pass === true,
        session_id: v.session && v.session.id,
        checks: v.checks || [],
        violations: v.violations || [],
      });
    },
    async execute(args, exec) {
      const phase = args.phase || "precheck";
      if (phase !== "precheck" && phase !== "finalize") {
        return { ok: false, phase, error: "phase 必须为 precheck 或 finalize" };
      }
      try {
        return phase === "finalize" ? await finalizeIsolation(args) : await precheckIsolation(args, exec);
      } catch (e) {
        return { ok: false, phase, error: String((e && e.message) || e) };
      }
    },
  }));

  // 注册看板接口：webServer 是可选服务，用 ctx.get 取，不写进 inject 以免启动被拖住
  ctx.effect(() => {
    const webServer = typeof ctx.get === "function" ? ctx.get("webServer") : null;
    if (!webServer || typeof webServer.register !== "function") return;
    return webServer.register({
      kind: "exact",
      path: "/api/authoring/board",
      handler: async (req, res) => {
        const method = (req && req.method) || "GET";
        if (method !== "GET" && method !== "HEAD") {
          res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, HEAD" });
          res.end(JSON.stringify({ error: "method not allowed" }));
          return;
        }
        try {
          const stateFile = fileURLToPath(new URL("./board-state.js", import.meta.url));
        const stateUrl = new URL("./board-state.js", import.meta.url);
        stateUrl.searchParams.set("v", String((await fs.stat(stateFile)).mtimeMs));
        const { getBoardState } = await import(stateUrl.href);
          const data = await getBoardState({ root, sessionsDir });
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify(data));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: String((e && e.message) || e) }));
        }
      },
    });
  }, "authoring: board api");
}
