#!/usr/bin/env node
/*
 * 看板门禁.js —— 任务看板逐步卡片模式的机器门禁（v009）。
 *
 * 复用 workflow.js 里的产物表、条件键与机器审计校验器（同一份真源，避免两套契约漂移）。
 * 节点卡片完成后把最终 JSON 写到 artifacts/<node>/_gate.json（13/14 等按卷节点写
 * artifacts/<node>/<runId>/_gate.json），然后运行：
 *
 *   node <taskDir>/看板门禁.js <taskDir> <node> [--run C01] [--answer-package D:/高经作答区/<taskId>/C01] [--mode initial|repair]
 *
 * 产物存在/非空/JSON/glob 计数一律以磁盘为准，覆盖卡片自报；条件键与 extra.audit 取卡片 _gate.json。
 * 判定节点的结论从判定真源文件读取（不是卡片回复）。
 * 退出码：0=门禁结构通过（结论见 decision）；1=门禁不通过；2=用法/环境错误。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function die(code, obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length < 2) die(2, { ok: false, error: "usage: 看板门禁.js <taskDir> <node> [--run C01] [--answer-package P] [--mode initial|repair]" });
const taskDir = path.resolve(argv[0]).replace(/\\/g, "/");
const node = argv[1];
const opt = {};
for (let i = 2; i < argv.length; i += 2) opt[String(argv[i]).replace(/^--/, "")] = argv[i + 1];

const wfPath = fs.existsSync(path.join(taskDir, "workflow.js")) ? path.join(taskDir, "workflow.js") : path.join(__dirname, "workflow.js");
const src = fs.readFileSync(wfPath, "utf8");
const cut = src.indexOf('phase("workflow");');
if (cut < 0) die(2, { ok: false, error: `cannot locate workflow body in ${wfPath}` });
const body = src.slice(0, cut) + "\nreturn {NODE_ARTIFACTS,NODE_CONDITIONS,ASSISTANT_CONDITIONS,DECISION_NODES,artifactSpecs,validateGate,validateExtraAudit,expandTemplate};";
// eslint-disable-next-line no-new-func
const wf = new Function("args", "agent", "phase", "log", body)(
  { taskDir, batch: "A", specPath: "board", industry: "board" }, () => null, () => {}, () => {}
);
if (!wf.NODE_ARTIFACTS[node]) die(2, { ok: false, error: `unknown node ${node}` });

const context = {};
if (opt.run) context.runId = opt.run;
if (opt["answer-package"]) context.answerPackage = String(opt["answer-package"]).replace(/\\/g, "/");
const specs = wf.artifactSpecs(node, context);

function abs(p) {
  return /^[A-Za-z]:\//.test(p) ? p : `${taskDir}/${p}`;
}
function globFiles(pattern) {
  const dir = path.dirname(pattern);
  const re = new RegExp("^" + path.basename(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => re.test(n) && fs.statSync(path.join(dir, n)).isFile()).map((n) => `${dir}/${n}`);
}
function diskArtifact(spec) {
  const p = abs(spec.path);
  const files = spec.glob ? globFiles(p) : fs.existsSync(p) && fs.statSync(p).isFile() ? [p] : [];
  const item = { id: spec.id, path: spec.path, exists: files.length > 0, nonempty: files.length > 0 && files.every((f) => fs.statSync(f).size > 0), matches: files.length };
  if (spec.json) {
    item.json_ok = files.length > 0 && files.every((f) => {
      try { JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); return true; } catch (_) { return false; }
    });
  }
  return item;
}

const gateDir = opt.run && ["13_answer", "14_score", "15_review"].includes(node) ? `${taskDir}/artifacts/${node}/${opt.run}` : `${taskDir}/artifacts/${node}`;
const gatePath = `${gateDir}/_gate.json`;
let cardGate = null;
try { cardGate = JSON.parse(fs.readFileSync(gatePath, "utf8").replace(/^\uFEFF/, "")); } catch (e) {
  die(1, { ok: false, node, gate_path: gatePath, failures: [`卡片未写出可解析的 _gate.json：${e.message}`] });
}
const g = cardGate.gate && typeof cardGate.gate === "object" ? cardGate.gate : cardGate;
const disk = specs.map(diskArtifact);
const gate = {
  summary: g.summary || "",
  artifacts: disk,
  conditions: g.conditions || {},
  file_conclusion: g.file_conclusion || null,
  reply_conclusion: g.reply_conclusion || null,
  extra: g.extra || {}
};

const failures = [];
const v = wf.validateGate(node, gate, specs);
if (!v.ok) failures.push(v.reason);
failures.push(...wf.validateExtraAudit(node, gate));
if (node === "06_build" && opt.mode) {
  const audit = (gate.extra && gate.extra.audit) || {};
  if (String(audit.mode) !== opt.mode) failures.push(`06 mode 应为 ${opt.mode}，实际 ${audit.mode}`);
  if (opt.mode === "initial" && Number(audit.findings_total) !== 0) failures.push("06 initial 模式不应有 findings");
  if (opt.mode === "repair" && !(Number(audit.findings_total) >= 1)) failures.push("06 repair 模式 findings_total 必须 >=1");
}

let decision = null;
const dn = wf.DECISION_NODES[node];
if (dn) {
  const dpath = abs(wf.expandTemplate(dn.path, context));
  try {
    const file = JSON.parse(fs.readFileSync(dpath, "utf8").replace(/^\uFEFF/, ""));
    decision = { path: dpath };
    for (const k of dn.keys) decision[k] = file[k];
    if (node === "09_style") {
      try {
        const issues = JSON.parse(fs.readFileSync(`${taskDir}/artifacts/09_style/附件问题.json`, "utf8").replace(/^\uFEFF/, ""));
        decision.attachment_issues_file = issues;
      } catch (_) { /* reported by artifact gate */ }
      for (const k of ["mapping_route", "attachment_route"]) if (g.file_conclusion && k in g.file_conclusion) decision[k] = g.file_conclusion[k];
    }
    if (node === "14_score") {
      for (const extraFile of ["补卷判定.json", "汇总.json"]) {
        const p = `${taskDir}/artifacts/14_score/${extraFile}`;
        if (fs.existsSync(p)) { try { decision[extraFile] = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); } catch (_) { failures.push(`${extraFile} 不可解析`); } }
      }
    }
    if (g.file_conclusion && typeof g.file_conclusion === "object") {
      const diff = dn.keys.filter((k) => JSON.stringify(g.file_conclusion[k]) !== JSON.stringify(file[k]));
      if (diff.length) decision.card_reply_conflict = diff; // 文件优先，仅记录
    }
  } catch (e) {
    failures.push(`判定真源不可读：${dpath}：${e.message}`);
  }
}

const sha = crypto.createHash("sha256").update(fs.readFileSync(gatePath)).digest("hex");
die(failures.length ? 1 : 0, {
  ok: failures.length === 0,
  node,
  run_id: opt.run || null,
  gate_path: gatePath,
  gate_sha256: sha,
  artifacts: disk.map((a) => `${a.exists && a.nonempty && a.json_ok !== false ? "OK " : "BAD"} ${a.id} ${a.path} matches=${a.matches}`),
  failures,
  decision
});
