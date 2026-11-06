/*
 * v008 / v006 card 3 workflow
 *
 * This file is a DSH workflow guest script, not a Node program. The guest has
 * no fs/process/require. Node agents perform file operations and return a
 * machine-readable artifact gate; this script owns ordering, routing,
 * fail-closed decisions, retry limits, and call accounting.
 */

const TASK_DIR = String(args.taskDir || "").replace(/[\\/]+$/, "");
const BATCH = String(args.batch || "A").toUpperCase();
const SPEC_PATH = String(args.specPath || "");
const INDUSTRY = String(args.industry || "");
const MODEL_PROVIDER = "opencodego";
const MODEL = "deepseek-v4.1-flash";
const MODEL_SPEC = "deepseek-v4.1-flash/max";
const PROMPT_ROOT = `${TASK_DIR}/prompts`;
const ARTIFACT_ROOT = `${TASK_DIR}/artifacts`;
const ANSWER_ROOT = "D:/高经作答区";
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_AGENT_CALLS = 128;

if (!TASK_DIR) throw new Error("workflow: args.taskDir is required");
if (!SPEC_PATH) throw new Error("workflow: args.specPath is required");
if (!INDUSTRY) throw new Error("workflow: args.industry is required");
if (!["A", "B", "C", "D", "ALL"].includes(BATCH)) {
  throw new Error(`workflow: unsupported batch ${BATCH}`);
}

const NODE_ARTIFACTS = Object.freeze({
  "00_spec": [
    { id: "project_gate", path: "artifacts/00_spec/项目门槛.json", json: true },
    { id: "spec_excerpt", path: "artifacts/00_spec/规范摘录.md" }
  ],
  "01_src": [
    { id: "source_list", path: "artifacts/01_src/素材清单.md" },
    { id: "source_index", path: "artifacts/01_src/来源索引.csv" },
    { id: "source_excerpts", path: "artifacts/01_src/原文摘录/*.md", glob: true, min: 1 }
  ],
  "02_scrub": [
    { id: "scrub_copies", path: "artifacts/02_scrub/脱敏底稿/*.md", glob: true, min: 1 },
    { id: "scrub_body", path: "artifacts/02_scrub/脱敏底稿.md" },
    { id: "scrub_map", path: "artifacts/02_scrub/映射表.csv" },
    { id: "scrub_mapping_json", path: "artifacts/02_scrub/脱敏映射.json", json: true },
    { id: "scrub_check", path: "artifacts/02_scrub/脱敏检查.md" }
  ],
  "03_survey": [
    { id: "directions", path: "artifacts/03_survey/可用方向.md" },
    { id: "direction_scores", path: "artifacts/03_survey/方向评估.csv" }
  ],
  "04_scope": [
    { id: "scope_decision", path: "artifacts/04_scope/决定与交付.md" },
    { id: "delivery_spec", path: "artifacts/04_scope/交付规格.json", json: true },
    { id: "field_sources", path: "artifacts/04_scope/字段来源.md" },
    { id: "scope_boundary", path: "artifacts/04_scope/边界.md" }
  ],
  "05_evidence": [
    { id: "difficulty_list_json", path: "artifacts/05_evidence/难点清单.json", json: true },
    { id: "difficulty_list_csv", path: "artifacts/05_evidence/难点清单.csv" },
    { id: "difficulty_strategy", path: "artifacts/05_evidence/难点策略.json", json: true },
    { id: "relationship_graph", path: "artifacts/05_evidence/关系图.json", json: true },
    { id: "attachment_manifest_json", path: "artifacts/05_evidence/附件清单.json", json: true },
    { id: "attachment_manifest_csv", path: "artifacts/05_evidence/附件清单.csv" },
    { id: "field_semantics", path: "artifacts/05_evidence/字段口径.md" }
  ],
  "06_build": [
    { id: "attachments", path: "artifacts/06_build/A*", glob: true, min: 1 },
    { id: "build_record", path: "artifacts/06_build/制造记录.md" },
    { id: "build_validation", path: "artifacts/06_build/校验报告.json", json: true },
    { id: "attachment_facts", path: "artifacts/06_build/附件事实快照.json", json: true },
    { id: "repair_record", path: "artifacts/06_build/返修记录.json", json: true }
  ],
  "07_metacheck": [
    { id: "metacheck_result", path: "artifacts/07_metacheck/result.json", json: true }
  ],
  "08_prompt": [
    { id: "prompt", path: "artifacts/08_prompt/题面.md" },
    { id: "field_mapping_json", path: "artifacts/08_prompt/字段映射.json", json: true },
    { id: "field_mapping_md", path: "artifacts/08_prompt/字段映射.md" }
  ],
  "09_style": [
    { id: "final_prompt", path: "artifacts/09_style/题面_最终.md" },
    { id: "mapping_diff_json", path: "artifacts/09_style/字段映射差量.json", json: true },
    { id: "mapping_diff_md", path: "artifacts/09_style/字段映射差量.md" },
    { id: "style_notes", path: "artifacts/09_style/润色说明.md" },
    { id: "attachment_issues_json", path: "artifacts/09_style/附件问题.json", json: true },
    { id: "attachment_issues_md", path: "artifacts/09_style/附件问题.md" }
  ],
  "10_difficulty": [
    { id: "difficulty_diagnosis_json", path: "artifacts/10_difficulty/诊断.json", json: true },
    { id: "difficulty_diagnosis_md", path: "artifacts/10_difficulty/诊断.md" }
  ],
  "11_rubric": [
    { id: "rubric", path: "artifacts/11_rubric/rubric.json", json: true },
    { id: "coverage", path: "artifacts/11_rubric/难点覆盖.json", json: true },
    { id: "rubric_validation", path: "artifacts/11_rubric/校验结论.json", json: true },
    { id: "b_index", path: "artifacts/11_rubric/B索引.json", json: true },
    { id: "answer_check", path: "artifacts/11_rubric/答案核验.md" },
    { id: "answer_guidance", path: "artifacts/11_rubric/作答思路.md" },
    { id: "common_errors", path: "artifacts/11_rubric/易错点.md" },
    { id: "b_files", path: "artifacts/11_rubric/B*", glob: true, min: 1 },
    { id: "rules", path: "artifacts/11_rubric/rules.py", optional: true },
    { id: "manual_review", path: "artifacts/11_rubric/人工复核.json", json: true, optional: true }
  ],
  "12_freeze": [
    { id: "freeze_manifest", path: "artifacts/12_freeze/冻结清单.json", json: true },
    { id: "version_notes", path: "artifacts/12_freeze/版本说明.md" },
    { id: "frozen_prompt", path: "artifacts/12_freeze/frozen/题面.md" },
    { id: "frozen_delivery", path: "artifacts/12_freeze/frozen/交付规格.json", json: true },
    { id: "frozen_attachment_facts", path: "artifacts/12_freeze/frozen/附件事实快照.json", json: true },
    { id: "frozen_mapping", path: "artifacts/12_freeze/frozen/字段映射.json", json: true },
    { id: "frozen_mapping_diff", path: "artifacts/12_freeze/frozen/字段映射差量.json", json: true },
    { id: "frozen_diagnosis", path: "artifacts/12_freeze/frozen/诊断.json", json: true },
    { id: "frozen_rubric", path: "artifacts/12_freeze/frozen/rubric.json", json: true },
    { id: "frozen_coverage", path: "artifacts/12_freeze/frozen/难点覆盖.json", json: true },
    { id: "frozen_validation", path: "artifacts/12_freeze/frozen/校验结论.json", json: true },
    { id: "frozen_project_gate", path: "artifacts/12_freeze/frozen/项目门槛.json", json: true },
    { id: "frozen_spec_excerpt", path: "artifacts/12_freeze/frozen/规范摘录.md" },
    { id: "frozen_attachment_manifest", path: "artifacts/12_freeze/frozen/附件清单.json", json: true },
    { id: "frozen_judge", path: "artifacts/12_freeze/frozen/judge.py" },
    { id: "frozen_b_index", path: "artifacts/12_freeze/frozen/B索引.json", json: true },
    { id: "frozen_b_files", path: "artifacts/12_freeze/frozen/B*", glob: true, min: 1 },
    { id: "frozen_answer_check", path: "artifacts/12_freeze/frozen/答案核验.md" },
    { id: "frozen_answer_guidance", path: "artifacts/12_freeze/frozen/作答思路.md" },
    { id: "frozen_common_errors", path: "artifacts/12_freeze/frozen/易错点.md" },
    { id: "model_input_prompt", path: "artifacts/12_freeze/frozen/model_input/题面.md" },
    { id: "model_input_attachments", path: "artifacts/12_freeze/frozen/model_input/A*", glob: true, min: 1 },
    { id: "run_contract", path: "artifacts/12_freeze/frozen/运行契约.json", json: true },
    { id: "frozen_rules", path: "artifacts/12_freeze/frozen/rules.py", optional: true },
    { id: "frozen_manual_review", path: "artifacts/12_freeze/frozen/人工复核.json", json: true, optional: true }
  ],
  "13_answer": [
    { id: "answer_note", path: "<answerPackage>/output/作答说明.md" },
    { id: "answer_runtime", path: "<answerPackage>/output/运行记录.json", json: true },
    { id: "answer_checkpoint", path: "<answerPackage>/output/进度断点.json", json: true }
  ],
  "14_score": [
    { id: "score_report", path: "artifacts/14_score/<runId>/评分.json", json: true },
    { id: "isolation_audit", path: "artifacts/13_answer/<runId>/隔离审计.json", json: true },
    { id: "host_trace", path: "<answerPackage>/host_trace.json", json: true },
    { id: "supplement_decision", path: "artifacts/14_score/补卷判定.json", json: true, optional: true },
    { id: "score_summary", path: "artifacts/14_score/汇总.json", json: true, optional: true }
  ],
  "15_review": [
    { id: "review_issues", path: "artifacts/15_review/<runId>/问题表.csv", glob: false },
    { id: "review_record", path: "artifacts/15_review/<runId>/读卷记录.json", json: true },
    { id: "review_summary", path: "artifacts/15_review/汇总.json", json: true }
  ],
  "16_qc": [
    { id: "qc_conclusion", path: "artifacts/16_qc/结论.json", json: true }
  ],
  "17_pack": [
    { id: "complete_package", path: "artifacts/17_pack/完整题包.zip" },
    { id: "model_input_package", path: "artifacts/17_pack/仅模型输入.zip" },
    { id: "upload_package", path: "artifacts/17_pack/填写上传.zip" },
    { id: "mapping_draft_json", path: "artifacts/17_pack/字段映射草案.json", json: true },
    { id: "pack_check", path: "artifacts/17_pack/核对.json", json: true },
    { id: "current_entry", path: "artifacts/17_pack/当前入口.txt" }
  ],
  "18_submit": [
    { id: "submit_mapping_json", path: "artifacts/18_submit/字段映射.json", json: true },
    { id: "submit_mapping_md", path: "artifacts/18_submit/字段映射.md" },
    { id: "submit_status", path: "artifacts/18_submit/状态.md" },
    { id: "submit_todo", path: "artifacts/18_submit/待办.md" }
  ],
  "18_rebuild_upload": [
    { id: "upload_check", path: "artifacts/18_submit/上传包核对.json", json: true },
    { id: "upload_package", path: "artifacts/17_pack/填写上传.zip" }
  ]
});

const NODE_CONDITIONS = Object.freeze({
  "00_spec": ["spec_contract_ok"],
  "01_src": ["excerpts_one_to_one"],
  "02_scrub": ["redaction_complete"],
  "03_survey": ["directions_evidence_backed"],
  "04_scope": ["business_fields_complete", "delivery_outputs_complete", "parts_complete"],
  "05_evidence": ["canonical_tables_consistent", "attachment_manifest_complete"],
  "06_build": ["attachments_built", "attachment_checks_recorded"],
  "07_metacheck": ["result_schema_valid"],
  "08_prompt": ["mapping_complete", "prompt_uses_only_frozen_inputs"],
  "09_style": ["diff_files_valid", "attachment_issue_file_valid"],
  "10_difficulty": ["diagnosis_schema_valid"],
  "11_rubric": ["required_checks_covered", "issue_owners_valid", "b_index_resolves", "manual_rules_contract"],
  "12_freeze": ["freeze_schema_valid"],
  "13_answer": ["required_infrastructure_complete", "runtime_file_valid", "output_scope_valid"],
  "14_score": [
    "freeze_hash_ok",
    "isolation_precheck_completed",
    "judge_called_once",
    "copy_target_ok",
    "finalize_ok",
    "report_written"
  ],
  "15_review": ["all_runs_reviewed"],
  "16_qc": ["checks_have_file_evidence"],
  "17_pack": ["three_packages_verified", "source_hashes_verified", "model_input_whitelist_verified"],
  "18_submit": ["counts_recomputed", "mapping_file_consistent"],
  "18_rebuild_upload": [
    "upload_rebuilt",
    "member_set_unchanged",
    "member_hashes_recomputed",
    "mapping_reflected",
    "no_forbidden_members",
    "rebuild_recorded"
  ]
});

const ASSISTANT_CONDITIONS = Object.freeze({
  "00_spec": ["score_contract", "extraction_status_contract", "status_value_pairing", "platform_fields_contract", "source_resolvable"],
  "01_src": ["excerpt_metadata_complete", "excerpt_sha256_matches_index"],
  "02_scrub": ["per_source_mapping_complete", "residual_checks_recorded"],
  "04_scope": ["business_fields_array", "delivery_outputs", "parts_complete"],
  "05_evidence": ["canonical_json_consistent", "attachment_manifest_nonempty", "difficulty_source_traceable", "carrier_bindings_complete"],
  "06_build": ["all_manifest_attachments_built", "facts_and_checks_recorded", "repair_contract_ok"],
  "08_prompt": ["mapping_covers_delivery", "no_unsupported_fields"],
  "09_style": ["mapping_diff_schema", "attachment_issues_schema"],
  "10_difficulty": ["nine_criteria", "route_executable"],
  "11_rubric": ["required_check_ids", "owner_nodes", "b_index_resolves", "manual_rules_contract"],
  "12_freeze": ["freeze_hashes_ok", "model_input_allowlist_ok", "run_contract_ok"],
  "13_answer": ["infrastructure_files_ok", "outputs_inside_package", "answer_prompt_self_check"],
  "14_score": ["isolation_precheck_structurally_valid", "judge_once_completed", "copy_contract_ok", "finalize_evidence_preserved", "host_trace_file_written"],
  "15_review": ["one_record_per_run", "summary_covers_all_runs"],
  "16_qc": ["eight_checks", "evidence_paths"],
  "17_pack": ["three_archives", "member_hashes", "strict_model_input", "mapping_draft_schema_valid", "mapping_draft_matches_platform_fields"],
  "18_submit": ["five_counts", "mapping_roundtrip", "mapping_matches_draft"]
});

const DECISION_NODES = Object.freeze({
  "07_metacheck": { path: "artifacts/07_metacheck/result.json", keys: ["pass"] },
  "09_style": {
    path: "artifacts/09_style/字段映射差量.json",
    keys: ["pass", "route", "final_prompt", "mapping_changes", "attachment_issues"]
  },
  "10_difficulty": { path: "artifacts/10_difficulty/诊断.json", keys: ["pass", "route"] },
  "11_rubric": { path: "artifacts/11_rubric/校验结论.json", keys: ["pass", "issues"] },
  "12_freeze": { path: "artifacts/12_freeze/冻结清单.json", keys: ["pass", "route"] },
  "14_score": { path: "artifacts/14_score/<runId>/评分.json", keys: ["score", "difficulty_pass", "pass", "fail_closed"] },
  "16_qc": { path: "artifacts/16_qc/结论.json", keys: ["pass"] },
  "17_pack": { path: "artifacts/17_pack/核对.json", keys: ["pass", "source_hash_check"] },
  "18_submit": { path: "artifacts/18_submit/字段映射.json", keys: ["pass", "counts"] },
  "18_rebuild_upload": {
    path: "artifacts/18_submit/上传包核对.json",
    keys: ["pass", "upload_rebuilt", "member_set_unchanged", "member_hashes_recomputed", "mapping_reflected", "no_forbidden_members"]
  }
});

const BATCH_NODES = Object.freeze({
  A: ["00_spec", "01_src", "02_scrub", "03_survey", "04_scope", "05_evidence", "06_build", "07_metacheck"],
  B: ["08_prompt", "09_style", "10_difficulty", "11_rubric", "12_freeze"],
  C: ["13_answer", "14_score", "15_review", "16_qc"],
  D: ["17_pack", "18_submit", "18_rebuild_upload"]
});

const NODE_BATCH = Object.freeze(
  Object.keys(BATCH_NODES).reduce((acc, batch) => {
    for (const node of BATCH_NODES[batch]) acc[node] = batch;
    return acc;
  }, {})
);

/*
 * Static call forecast per batch, shown in the workflow result and the handoff.
 * normal = happy path; worst = every repair chain at its 2-round limit, including
 * nested 06->07 repairs. These are forecasts, not throttles; MAX_AGENT_CALLS is the
 * hard safety stop. The documented operating mode is one batch per invocation, so a
 * single batch always fits under the cap.
 */
const CALL_BUDGET = Object.freeze({
  A: { normal: 9, worst: 13 },
  B: { normal: 7, worst: 105 },
  C: { normal: 9, worst: 13 },
  D: { normal: 5, worst: 5 }
});

const state = {
  currentBatch: BATCH === "ALL" ? "A" : BATCH,
  calls: 0,
  callsByBatch: { A: 0, B: 0, C: 0, D: 0 },
  gateCache: {},
  runs: [],
  selectedRunId: null,
  conflicts: [],
  stops: [],
  repairs: [],
  gates: []
};

function npath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

function taskPath(path) {
  const value = npath(path);
  if (/^[A-Za-z]:\//.test(value)) return value;
  return `${TASK_DIR}/${value.replace(/^\.\//, "")}`;
}

function expandTemplate(path, context) {
  let out = String(path);
  if (context && context.answerPackage) out = out.replace(/<answerPackage>/g, npath(context.answerPackage));
  if (context && context.runId) out = out.replace(/<runId>/g, context.runId);
  if (context && context.taskId) out = out.replace(/<taskId>/g, context.taskId);
  if (out.includes("<")) throw new Error(`workflow: unresolved artifact placeholder ${out}`);
  return npath(out);
}

function isTaskRelative(path) {
  return !/^[A-Za-z]:\//.test(npath(path)) && !npath(path).startsWith("/");
}

function artifactSpecs(node, context) {
  const table = NODE_ARTIFACTS[node];
  if (!table) throw new Error(`workflow: no artifact table for ${node}`);
  return table.map((item) => {
    const expanded = expandTemplate(item.path, context || {});
    return {
      ...item,
      path: expanded,
      display_path: isTaskRelative(expanded) ? expanded : expanded
    };
  });
}

function allRunContexts() {
  return (state.runs || []).map((run) => ({
    runId: run.runId,
    answerPackage: run.answerPackage
  }));
}

function batchSpecs(batch, context) {
  if (batch === "C") {
    const runs = context && context.runs && context.runs.length ? context.runs : allRunContexts();
    if (!runs.length) throw new Error("workflow: C batch gate requires run context");
    const specs = [];
    for (const run of runs) {
      const local = { runId: run.runId, answerPackage: run.answerPackage };
      for (const node of ["13_answer", "14_score"]) {
        for (const spec of artifactSpecs(node, local)) {
          const requiredSpec = node === "14_score" && ["score_summary", "supplement_decision"].includes(spec.id)
            ? { ...spec, optional: false }
            : spec;
          specs.push({ ...requiredSpec, id: `${run.runId}_${node}_${spec.id}` });
        }
      }
      for (const spec of artifactSpecs("15_review", local)) {
        if (spec.id === "review_summary") continue;
        specs.push({ ...spec, id: `${run.runId}_15_review_${spec.id}` });
      }
    }
    for (const spec of artifactSpecs("15_review", { runId: runs[0].runId })) {
      if (spec.id === "review_summary") specs.push(spec);
    }
    for (const spec of artifactSpecs("16_qc", {})) specs.push(spec);
    return specs;
  }
  if (batch === "D") {
    return [...artifactSpecs("17_pack", {}), ...artifactSpecs("18_submit", {}), ...artifactSpecs("18_rebuild_upload", {})];
  }
  return BATCH_NODES[batch].flatMap((node) => artifactSpecs(node, context || {}));
}

function nodeOptions(label) {
  /*
   * DSH workflow-ptc 0.2.2-rc.1 accepts exactly label/phase/schema/provider/
   * model. reasoningEffort, effort, max, cwd, and tools terminate the workflow.
   * The desktop agent default is deepseek-v4.1-flash at max, so this script
   * preserves provider/model and relies on the deployment default. The host
   * limitation is recorded in docs/v006_卡2_编排层交接.md.
   */
  return {
    label: `${MODEL_SPEC} | ${label}`,
    provider: MODEL_PROVIDER,
    model: MODEL
  };
}

function parseLastJson(text) {
  if (text && typeof text === "object") return text;
  const source = String(text || "").trim();
  if (!source) return null;
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const value = JSON.parse(lines[i]);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch (_) {
      // Continue upward until a parsible final object is found.
    }
  }
  try {
    const value = JSON.parse(source);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch (_) {
    return null;
  }
  return null;
}

function firstNonEmptyText(raw) {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") return JSON.stringify(raw);
  return "";
}

function currentCallCount(batch) {
  return state.callsByBatch[batch] || 0;
}

function recordRepair(batch, node, reason, attempt, route) {
  state.repairs.push({
    batch,
    node,
    reason: String(reason || ""),
    attempt,
    route: route === undefined ? null : route,
    at_call: state.calls
  });
}

function recordConflict(node, path, fileConclusion, replyConclusion) {
  const compare = DECISION_NODES[node] ? DECISION_NODES[node].keys : null;
  let differs = false;
  let fileProjection = fileConclusion;
  let replyProjection = replyConclusion;
  if (compare) {
    fileProjection = {};
    replyProjection = {};
    for (const key of compare) {
      fileProjection[key] = fileConclusion ? fileConclusion[key] : undefined;
      replyProjection[key] = replyConclusion ? replyConclusion[key] : undefined;
    }
    differs = JSON.stringify(fileProjection) !== JSON.stringify(replyProjection);
  }
  const conflict = {
    node,
    file_path: path,
    file_conclusion: fileProjection,
    reply_conclusion: replyProjection,
    authoritative_source: "file",
    conflict: differs
  };
  state.conflicts.push(conflict);
  return conflict;
}

function normalizeGate(raw) {
  const parsed = parseLastJson(raw);
  if (!parsed) return null;
  if (parsed.gate && typeof parsed.gate === "object") {
    return {
      summary: parsed.gate.summary || parsed.summary || "",
      artifacts: parsed.gate.artifacts || parsed.artifacts || [],
      conditions: parsed.gate.conditions || parsed.conditions || {},
      file_conclusion: parsed.gate.file_conclusion || parsed.file_conclusion || null,
      reply_conclusion: parsed.gate.reply_conclusion || parsed.reply_conclusion || null,
      extra: parsed.gate.extra || parsed.extra || {}
    };
  }
  return {
    summary: parsed.summary || "",
    artifacts: parsed.artifacts || [],
    conditions: parsed.conditions || {},
    file_conclusion: parsed.file_conclusion || null,
    reply_conclusion: parsed.reply_conclusion || null,
    extra: parsed.extra || {}
  };
}

function artifactMap(gate) {
  const map = Object.create(null);
  for (const item of Array.isArray(gate && gate.artifacts) ? gate.artifacts : []) {
    if (item && item.id) map[String(item.id)] = item;
  }
  return map;
}

function bool(value) {
  return value === true;
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function sameStringSet(left, right) {
  const a = [...new Set(stringList(left))].sort();
  const b = [...new Set(stringList(right))].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function requireNumber(value, name, failures, min) {
  if (!Number.isFinite(Number(value)) || Number(value) < (min === undefined ? 0 : min)) {
    failures.push(`${name} must be a finite number${min === undefined ? "" : ` >= ${min}`}`);
  }
}

function allTrue(source, keys, failures) {
  for (const key of keys) {
    if (!source || source[key] !== true) failures.push(`${key} must be true`);
  }
}

function emptyList(value, name, failures) {
  if (!Array.isArray(value) || value.length !== 0) failures.push(`${name} must be an empty array`);
}

/*
 * Machine audit contract per node. Node agents return gate.extra.audit computed
 * from the files they actually wrote; this script cross-checks the internal
 * invariants (counts, id sets, sha256 shape and equality) that a text-only gate
 * could fake. All keys are mirrored verbatim in the node prompt and in the
 * workflow brief `EXTRA_AUDIT_HELP` line.
 */
const EXTRA_AUDIT_HELP = Object.freeze({
  "01_src": "extra.audit={index_rows,excerpt_files,one_to_one,index_source_ids[],excerpt_source_ids[],duplicate_source_ids[],missing_excerpts[],orphan_excerpts[],index_sha_matches_disk,excerpts[{source_id,path,index_sha256,actual_sha256,sha_match,has_source_metadata,metadata_fields{source_url,read_at,locator}}]}；两个 64 位十六进制 sha256 必须来自磁盘重算",
  "02_scrub": "extra.audit={index_source_ids[],mapped_source_ids[],total,scrubbed,blocked,one_to_one,sha_matches_disk,all_residual_pass,entries[{source_id,status,scrubbed_exists,scrubbed_nonempty,sha_match,residual_pass,rule_count,has_locations}]}",
  "05_evidence": "extra.audit={active_difficulty_ids[],difficulty_count,source_ids_used[],known_source_ids[],unknown_source_ids[],carrier_attachment_ids[],known_attachment_ids[],unknown_carrier_ids[],carrier_binding_ids[],binding_attachment_mismatch[],business_field_keys[],known_business_field_keys[],unknown_business_field_keys[],must_judge_keys[],uncovered_must_judge_keys[],every_active_has_source,every_active_has_carrier_or_reason,source_index_rows}",
  "06_build": "extra.audit={mode,findings_path,findings_total,findings_closed,findings_unrepairable,records_complete,unrelated_files_unchanged,changed_files_covered,facts_match_disk,report_mode_matches,changed_files[],unchanged_file_count}；mode 必须与编排传入一致",
  "17_pack": "extra.audit={platform_field_count,draft_field_count,ids_equal,orders_equal,all_pending_18,all_values_null,draft_sha256(64hex),packages_checked,model_input_member_count,source_freeze_sha256(64hex)}",
  "18_submit": "extra.audit={draft_field_count,draft_ids_equal,draft_orders_equal,draft_metadata_equal,total,ready,missing,invalid,not_applicable,counts_sum_ok,pass_formula_ok,all_checks_true,platform_fields_applicable}",
  "18_rebuild_upload": "extra.audit={member_set_unchanged,changed_members[],expected_mapping_member,mapping_reflected,mapping_pending_markers_remaining,member_hashes_recomputed,no_forbidden_members,other_packages_unchanged,member_count_before,member_count_after,members_with_hash_after,upload_package_sha256_before(64hex),upload_package_sha256_after(64hex),mapping_sha256(64hex)}"
});

const EXTRA_AUDIT_VALIDATORS = Object.freeze({
  "01_src": function validate01Audit(audit) {
    const failures = [];
    requireNumber(audit.index_rows, "index_rows", failures, 1);
    requireNumber(audit.excerpt_files, "excerpt_files", failures, 1);
    if (Number(audit.excerpt_files) !== Number(audit.index_rows)) failures.push("excerpt_files must equal index_rows");
    allTrue(audit, ["one_to_one", "index_sha_matches_disk"], failures);
    const indexIds = stringList(audit.index_source_ids);
    const excerptIds = stringList(audit.excerpt_source_ids);
    if (indexIds.length !== Number(audit.index_rows)) failures.push("index_source_ids length must equal index_rows");
    if (!sameStringSet(indexIds, excerptIds)) failures.push("index_source_ids and excerpt_source_ids must be the same set");
    if (new Set(indexIds).size !== indexIds.length) failures.push("index_source_ids must not contain duplicates");
    emptyList(audit.duplicate_source_ids, "duplicate_source_ids", failures);
    emptyList(audit.missing_excerpts, "missing_excerpts", failures);
    emptyList(audit.orphan_excerpts, "orphan_excerpts", failures);
    const excerpts = Array.isArray(audit.excerpts) ? audit.excerpts : [];
    if (excerpts.length !== indexIds.length) failures.push("excerpts length must equal index_source_ids length");
    for (const item of excerpts) {
      if (!item || !indexIds.includes(String(item.source_id))) failures.push(`excerpt ${item && item.source_id} is not in the index`);
      if (!isSha256(item && item.index_sha256)) failures.push(`excerpt ${item && item.source_id} index_sha256 must be 64 lowercase hex`);
      if (!isSha256(item && item.actual_sha256)) failures.push(`excerpt ${item && item.source_id} actual_sha256 must be 64 lowercase hex`);
      if (item && item.index_sha256 !== item.actual_sha256) failures.push(`excerpt ${item.source_id} sha256 differs from the index`);
      allTrue(item, ["sha_match", "has_source_metadata"], failures);
      const fields = item && item.metadata_fields;
      if (!fields || fields.source_url !== true || fields.read_at !== true || fields.locator !== true) {
        failures.push(`excerpt ${item && item.source_id} metadata_fields must mark source_url/read_at/locator`);
      }
    }
    return failures;
  },
  "02_scrub": function validate02Audit(audit) {
    const failures = [];
    const indexIds = stringList(audit.index_source_ids);
    requireNumber(audit.total, "total", failures, 1);
    requireNumber(audit.scrubbed, "scrubbed", failures, 0);
    requireNumber(audit.blocked, "blocked", failures, 0);
    if (indexIds.length !== Number(audit.total)) failures.push("index_source_ids length must equal total");
    if (!sameStringSet(indexIds, audit.mapped_source_ids)) failures.push("mapped_source_ids must equal index_source_ids");
    if (Number(audit.scrubbed) !== Number(audit.total)) failures.push("scrubbed must equal total");
    if (Number(audit.blocked) !== 0) failures.push("blocked must be 0");
    allTrue(audit, ["one_to_one", "sha_matches_disk", "all_residual_pass"], failures);
    const entries = Array.isArray(audit.entries) ? audit.entries : [];
    if (entries.length !== Number(audit.total)) failures.push("entries length must equal total");
    for (const entry of entries) {
      if (!entry || entry.status !== "scrubbed") failures.push(`entry ${entry && entry.source_id} status must be scrubbed`);
      allTrue(entry, ["scrubbed_exists", "scrubbed_nonempty", "sha_match", "residual_pass", "has_locations"], failures);
      if (!entry || !Number.isFinite(Number(entry.rule_count)) || Number(entry.rule_count) < 0) {
        failures.push(`entry ${entry && entry.source_id} rule_count must be a number >= 0`);
      }
    }
    return failures;
  },
  "05_evidence": function validate05Audit(audit) {
    const failures = [];
    requireNumber(audit.difficulty_count, "difficulty_count", failures, 1);
    if (stringList(audit.active_difficulty_ids).length !== Number(audit.difficulty_count)) {
      failures.push("active_difficulty_ids length must equal difficulty_count");
    }
    allTrue(audit, ["every_active_has_source", "every_active_has_carrier_or_reason"], failures);
    requireNumber(audit.source_index_rows, "source_index_rows", failures, 1);
    const knownSources = stringList(audit.known_source_ids);
    const unknownSources = stringList(audit.source_ids_used).filter((id) => !knownSources.includes(id));
    if (!sameStringSet(unknownSources, audit.unknown_source_ids)) failures.push("unknown_source_ids must equal the unknown subset");
    if (unknownSources.length) failures.push(`source_ids not present in 02 mapping: ${unknownSources.join(",")}`);
    const knownAttachments = stringList(audit.known_attachment_ids);
    const unknownCarriers = stringList(audit.carrier_attachment_ids).filter((id) => !knownAttachments.includes(id));
    if (!sameStringSet(unknownCarriers, audit.unknown_carrier_ids)) failures.push("unknown_carrier_ids must equal the unknown subset");
    if (unknownCarriers.length) failures.push(`carrier attachment ids not in 05 manifest: ${unknownCarriers.join(",")}`);
    if (!sameStringSet(audit.carrier_attachment_ids, audit.carrier_binding_ids)) failures.push("carrier_binding_ids must equal carrier_attachment_ids");
    emptyList(audit.binding_attachment_mismatch, "binding_attachment_mismatch", failures);
    const knownFields = stringList(audit.known_business_field_keys);
    for (const key of [...stringList(audit.business_field_keys), ...stringList(audit.must_judge_keys)]) {
      if (!knownFields.includes(key)) failures.push(`business field ${key} is not defined in 04`);
    }
    emptyList(audit.unknown_business_field_keys, "unknown_business_field_keys", failures);
    emptyList(audit.uncovered_must_judge_keys, "uncovered_must_judge_keys", failures);
    return failures;
  },
  "06_build": function validate06Audit(audit) {
    const failures = [];
    const mode = String(audit.mode || "");
    if (!["initial", "repair"].includes(mode)) failures.push("mode must be initial or repair");
    requireNumber(audit.findings_total, "findings_total", failures, 0);
    requireNumber(audit.findings_closed, "findings_closed", failures, 0);
    requireNumber(audit.findings_unrepairable, "findings_unrepairable", failures, 0);
    allTrue(audit, ["records_complete", "unrelated_files_unchanged", "changed_files_covered", "facts_match_disk", "report_mode_matches"], failures);
    if (!Array.isArray(audit.changed_files)) failures.push("changed_files must be an array");
    requireNumber(audit.unchanged_file_count, "unchanged_file_count", failures, 0);
    if (mode === "initial") {
      if (Number(audit.findings_total) !== 0 || Number(audit.findings_closed) !== 0) failures.push("initial mode must have zero findings");
    }
    if (mode === "repair") {
      if (Number(audit.findings_total) < 1) failures.push("repair mode requires at least one finding");
      if (Number(audit.findings_closed) !== Number(audit.findings_total)) failures.push("repair mode must close every finding");
      if (Number(audit.findings_unrepairable) !== 0) failures.push("repair mode must not leave unrepairable findings");
    }
    return failures;
  },
  "17_pack": function validate17Audit(audit) {
    const failures = [];
    requireNumber(audit.platform_field_count, "platform_field_count", failures, 0);
    requireNumber(audit.draft_field_count, "draft_field_count", failures, 0);
    if (Number(audit.platform_field_count) !== Number(audit.draft_field_count)) failures.push("draft_field_count must equal platform_field_count");
    allTrue(audit, ["ids_equal", "orders_equal", "all_pending_18", "all_values_null"], failures);
    if (!isSha256(audit.draft_sha256)) failures.push("draft_sha256 must be 64 lowercase hex");
    if (Number(audit.packages_checked) !== 3) failures.push("packages_checked must equal 3");
    requireNumber(audit.model_input_member_count, "model_input_member_count", failures, 1);
    if (!isSha256(audit.source_freeze_sha256)) failures.push("source_freeze_sha256 must be 64 lowercase hex");
    return failures;
  },
  "18_submit": function validate18Audit(audit) {
    const failures = [];
    if (typeof audit.platform_fields_applicable !== "boolean") failures.push("platform_fields_applicable must be boolean");
    const keys = ["total", "ready", "missing", "invalid", "not_applicable"];
    for (const key of keys) requireNumber(audit[key], key, failures, 0);
    const sum = Number(audit.ready) + Number(audit.missing) + Number(audit.invalid) + Number(audit.not_applicable);
    if (sum !== Number(audit.total)) failures.push("ready+missing+invalid+not_applicable must equal total");
    if (Number(audit.draft_field_count) !== Number(audit.total)) failures.push("draft_field_count must equal total");
    allTrue(audit, ["draft_ids_equal", "draft_orders_equal", "draft_metadata_equal", "counts_sum_ok", "pass_formula_ok"], failures);
    if (typeof audit.all_checks_true !== "boolean") failures.push("all_checks_true must be boolean");
    return failures;
  },
  "18_rebuild_upload": function validateRebuildAudit(audit) {
    const failures = [];
    allTrue(audit, ["member_set_unchanged", "mapping_reflected", "member_hashes_recomputed", "no_forbidden_members", "other_packages_unchanged"], failures);
    if (audit.mapping_pending_markers_remaining !== false) failures.push("mapping_pending_markers_remaining must be false");
    const expected = "填写上传/平台/平台栏位映射.md";
    if (audit.expected_mapping_member !== expected) failures.push(`expected_mapping_member must be ${expected}`);
    const changed = stringList(audit.changed_members);
    if (changed.length !== 1 || changed[0] !== expected) failures.push(`changed_members must be exactly [${expected}]`);
    requireNumber(audit.member_count_before, "member_count_before", failures, 1);
    requireNumber(audit.member_count_after, "member_count_after", failures, 1);
    if (Number(audit.member_count_before) !== Number(audit.member_count_after)) failures.push("member count must not change");
    if (Number(audit.members_with_hash_after) !== Number(audit.member_count_after)) failures.push("members_with_hash_after must equal member_count_after");
    if (!isSha256(audit.upload_package_sha256_before) || !isSha256(audit.upload_package_sha256_after)) {
      failures.push("upload_package sha256 before/after must be 64 lowercase hex");
    }
    if (audit.upload_package_sha256_before === audit.upload_package_sha256_after) failures.push("upload package sha256 must change after rebuild");
    if (!isSha256(audit.mapping_sha256)) failures.push("mapping_sha256 must be 64 lowercase hex");
    return failures;
  }
});

function validateExtraAudit(node, gate) {
  const validator = EXTRA_AUDIT_VALIDATORS[node];
  if (!validator) return [];
  const audit = gate && gate.extra && gate.extra.audit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return [`extra.audit must be an object for ${node}`];
  return validator(audit);
}

function validateArtifactResult(item, spec) {
  if (!item) {
    if (spec.optional) return { ok: true, skipped: true, reason: null };
    return { ok: false, reason: `missing artifact declaration: ${spec.id}` };
  }
  if (item.exists !== true) {
    if (spec.optional) return { ok: true, skipped: true, reason: null };
    return { ok: false, reason: `artifact does not exist: ${spec.id}` };
  }
  if (item.nonempty !== true) return { ok: false, reason: `artifact is empty: ${spec.id}` };
  if (spec.glob) {
    const matches = Number(item.matches);
    if (!Number.isFinite(matches) || matches < (spec.min || 1)) {
      return { ok: false, reason: `artifact glob has too few matches: ${spec.id}` };
    }
  }
  if (spec.json && item.json_ok !== true) return { ok: false, reason: `artifact JSON is not parseable: ${spec.id}` };
  return { ok: true, skipped: false, reason: null };
}

function validateGate(node, gate, specs) {
  if (!gate || typeof gate !== "object") return { ok: false, reason: `${node}: reply has no machine-readable gate object` };
  if (!String(gate.summary || "").trim()) return { ok: false, reason: `${node}: reply/gate summary is empty` };
  if (!Array.isArray(gate.artifacts)) return { ok: false, reason: `${node}: gate.artifacts must be an array` };
  const artifacts = artifactMap(gate);
  const failures = [];
  for (const spec of specs) failures.push(...[validateArtifactResult(artifacts[spec.id], spec)].filter((x) => !x.ok).map((x) => x.reason));
  const requiredConditions = [...(NODE_CONDITIONS[node] || []), ...(ASSISTANT_CONDITIONS[node] || [])];
  for (const id of requiredConditions) {
    if (!gate.conditions || typeof gate.conditions !== "object" || !(id in gate.conditions)) {
      failures.push(`condition declaration missing: ${id}`);
    } else if (gate.conditions[id] !== true) {
      failures.push(`condition is false: ${id}`);
    }
  }
  if (failures.length) return { ok: false, reason: `${node}: ${failures.join("; ")}` };
  return { ok: true, reason: null };
}

function requireConditions(node, gate, ids) {
  const missing = [];
  for (const id of ids) {
    if (!gate.conditions || gate.conditions[id] !== true) missing.push(id);
  }
  if (missing.length) return { ok: false, reason: `${node}: required conditions failed: ${missing.join(",")}` };
  return { ok: true, reason: null };
}

function getFileConclusion(node, gate, context) {
  const item = DECISION_NODES[node];
  if (!item) return null;
  if (!gate.file_conclusion || typeof gate.file_conclusion !== "object") {
    throw new Error(`workflow: ${node} did not return file_conclusion from ${expandTemplate(item.path, context || {})}`);
  }
  const path = expandTemplate(item.path, context || {});
  const conflict = recordConflict(node, path, gate.file_conclusion, gate.reply_conclusion);
  return { ...gate.file_conclusion, __conflict: conflict };
}

function artifactGateInstruction(specs, node) {
  const conditionIds = [...(NODE_CONDITIONS[node] || []), ...(ASSISTANT_CONDITIONS[node] || [])];
  const decision = DECISION_NODES[node];
  const lines = [
    "执行本节点。先读取对应提示词并真正完成文件产物，不得只描述计划。",
    `产物清单（路径已由编排展开）：${JSON.stringify(specs)}`,
    `必须返回的条件键：${JSON.stringify(conditionIds)}`,
    "最终回复必须是一个 JSON 对象（不要代码围栏），格式：",
    '{"summary":"非空完成摘要","artifacts":[{"id":"上表 id","path":"实际路径","exists":true,"nonempty":true,"json_ok":true,"matches":1}],"conditions":{"条件id":true},"file_conclusion":{},"reply_conclusion":{},"extra":{}}',
    "artifacts 必须逐项核对上表：普通文件给 matches=1；glob 给实际匹配数；.json 必须实际 JSON.parse 成功。optional 项不存在时 exists=false。",
    "文件是判定真源；reply_conclusion 只记录提示词要求的上游末行 JSON，不得覆盖文件。",
    "除完成节点提示词要求外，不读取无关专家材料；brief 不回述上游内容，只以上述路径取数。"
  ];
  if (EXTRA_AUDIT_HELP[node]) {
    lines.splice(3, 0, `机器审计：最终回复 extra.audit 必须按下列键返回，数字、sha256 与集合必须来自实际文件重算，不得照抄模板：${EXTRA_AUDIT_HELP[node]}`);
  }
  if (decision) {
    lines.splice(2, 0, `判定真源：${decision.path}；必须读取该 JSON，并把键 ${decision.keys.join(",")} 的投影放入 file_conclusion。`);
  }
  if (node === "09_style") {
    lines.splice(3, 0, "09 的 file_conclusion 必须综合字段映射差量.json 与附件问题.json：pass 为两者都通过；无问题时 route=null；字段映射失败时 route 只能是 04/08；附件问题非空时 route=06、attachment_issues 为正整数。冲突时文件优先。");
  }
  if (node === "12_freeze") {
    lines.splice(3, 0, "12 的 file_conclusion.pass 必须由冻结清单.json.gates 与 09/10/11/07 的真实文件共同推导：任一上游门禁不为 true 或冻结清单缺 gate 时为 false；route 取失败的上游 route（04/07/10/11/05/06/08/09/null）。reply_conclusion 只放提示词末行 JSON。");
  }
  return lines.join("\n");
}

async function callAgent(batch, label, prompt) {
  state.currentBatch = batch;
  state.calls += 1;
  state.callsByBatch[batch] = (state.callsByBatch[batch] || 0) + 1;
  if (state.calls > MAX_AGENT_CALLS) throw new Error(`workflow: agent call budget exhausted (${MAX_AGENT_CALLS})`);
  log(`[${batch}] ${label} (call ${state.calls}/${MAX_AGENT_CALLS})`);
  return agent(prompt, nodeOptions(label));
}

async function runNode(node, options) {
  const opts = options || {};
  const batch = NODE_BATCH[node];
  const context = opts.context || {};
  const label = opts.label || node;
  const specs = artifactSpecs(node, context);
  const promptPath = `${PROMPT_ROOT}/${node}.md`;
  const taskRelative = node !== "13_answer";
  const lines = [
    artifactGateInstruction(specs, node),
    `节点提示词：${promptPath}`,
    `taskDir：${TASK_DIR}`,
    `规范路径：${SPEC_PATH}`,
    `行业参数：${INDUSTRY}`,
    `上游产物根：${ARTIFACT_ROOT}`
  ];
  if (!taskRelative) {
    // The 13 gate is built by runAnswerNode; this branch is defensive only.
    throw new Error("workflow: use runAnswerNode for node 13");
  }
  if (opts.extra) lines.push(String(opts.extra));
  if (state.repairs.length) lines.push(`最近返修记录：${JSON.stringify(state.repairs.slice(-2))}`);
  const raw = await callAgent(batch, label, lines.join("\n\n"));
  const gate = normalizeGate(raw);
  const validation = validateGate(node, gate, specs);
  if (!validation.ok) {
    throw new Error(`workflow: ${node} artifact gate failed: ${validation.reason}`);
  }
  const auditFailures = validateExtraAudit(node, gate);
  if (auditFailures.length) {
    throw new Error(`workflow: ${node} machine audit failed: ${auditFailures.join("; ")}`);
  }
  const result = { node, batch, gate, fileConclusion: null };
  if (DECISION_NODES[node]) result.fileConclusion = getFileConclusion(node, gate, context);
  return result;
}

async function runDecision(node, options) {
  const opts = options || {};
  const result = await runNode(node, opts);
  return result;
}

function summaryValue(gateConclusion, key, fallback) {
  if (gateConclusion && gateConclusion[key] !== undefined) return gateConclusion[key];
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function issueOwners(conclusion) {
  const issues = asArray(conclusion && conclusion.issues);
  return [...new Set(issues.map((issue) => String(issue && issue.owner_node || "")).filter(Boolean))];
}

function validateRoute(node, route, allowed) {
  if (route === null || route === undefined || route === "") return { ok: true, route: null };
  const value = String(route);
  return allowed.includes(value) ? { ok: true, route: value } : { ok: false, reason: `${node}: route ${value} is not executable; allowed=${allowed.join("|")}` };
}

function assertInRange(name, value, min, max) {
  if (!Number.isFinite(Number(value))) throw new Error(`workflow: ${name} must be finite`);
  const number = Number(value);
  if (number < min || number > max) throw new Error(`workflow: ${name} out of range: ${number}`);
  return number;
}

function addRun(run) {
  const existing = state.runs.findIndex((item) => item.runId === run.runId);
  if (existing >= 0) state.runs[existing] = run;
  else state.runs.push(run);
  const decision = run && run.decision;
  if (decision && decision.selected_run_id) state.selectedRunId = decision.selected_run_id;
}

function ensureRuns() {
  if (!state.runs.length) throw new Error("workflow: no answer run context");
  return state.runs;
}

function ensureRun(runId) {
  return ensureRuns().find((run) => run.runId === runId) || null;
}

async function preparePackage(runId) {
  const safe = String(runId);
  if (!RUN_ID_RE.test(safe)) throw new Error(`workflow: invalid runId ${safe}`);
  const taskId = TASK_DIR.split(/[\\/]/).pop();
  const answerPackage = `${ANSWER_ROOT}/${taskId}/${safe}`;
  const prepared = await callAgent("C", `13_prepare_${safe}`, [
    "执行 host 侧外部题包准备并返回机器门禁。",
    `taskDir：${TASK_DIR}`,
    `runId：${safe}`,
    `answerPackage：${answerPackage}`,
    `冻结清单：${ARTIFACT_ROOT}/12_freeze/冻结清单.json`,
    `运行契约：${ARTIFACT_ROOT}/12_freeze/frozen/运行契约.json`,
    `13 提示词：${PROMPT_ROOT}/13_answer.md`,
    "题包根必须是 D:/高经作答区/<taskDir目录名>/<runId>，不得在 taskDir 内；先验证冻结清单全部 bytes/sha256 和 model_input.allowlist_sha256。",
    "将 frozen/model_input 白名单逐文件复制到题包 input（路径逐项校验，不允许 traversal、符号链接、额外文件），创建空 output；已存在旧题包时整卷拒绝，不得复用。",
    "读取 13 提示词并经占位替换生成完整 instructions 返回；instructions 不得包含 taskDir、项目根、冻结目录路径。",
    "最终只返回 JSON：",
    '{"summary":"非空","artifacts":[],"conditions":{"freeze_hash_ok":true,"package_outside_task_dir":true,"package_created":true,"input_allowlist_ok":true,"input_hash_ok":true,"output_empty":true,"brief_no_task_dir":true},"file_conclusion":{},"reply_conclusion":{},"extra":{"instructions":"...","input_files":[{"path":"...","bytes":0,"sha256":"..."}]}}'
  ]);
  const gate = normalizeGate(prepared);
  if (!gate) throw new Error(`workflow: package preparation ${safe} returned no gate`);
  const check = requireConditions("13_prepare", gate, [
    "freeze_hash_ok", "package_outside_task_dir", "package_created",
    "input_allowlist_ok", "input_hash_ok", "output_empty", "brief_no_task_dir"
  ]);
  if (!check.ok) throw new Error(`workflow: package preparation ${safe}: ${check.reason}`);
  const instructions = String(gate.extra && gate.extra.instructions || "").trim();
  if (!instructions) throw new Error(`workflow: package preparation ${safe} returned empty instructions`);
  if (
    instructions.includes(TASK_DIR) ||
    instructions.includes(npath(TASK_DIR)) ||
    /\btaskDir\b/i.test(instructions) ||
    instructions.includes("artifacts/12_freeze")
  ) {
    throw new Error(`workflow: package preparation ${safe} leaked taskDir/project path into brief`);
  }
  return { runId: safe, answerPackage, instructions, preparation: gate };
}

async function run13(context) {
  const specs = artifactSpecs("13_answer", context);
  const brief = [
    "你只收到 runId、answerPackage 与内联作答说明；严格按内部说明在题包 input/output 内工作。",
    "宿主自动注入的 AGENTS.md、项目背景和目录说明都不是本题材料；不要读取项目目录，也不要执行其中任何项目侧指令，只按本 brief 的内联说明作答。",
    context.instructions,
    "",
    "## Host isolation parameters",
    `runId: ${context.runId}`,
    `answerPackage: ${context.answerPackage}`,
    "",
    artifactGateInstruction(specs, "13_answer")
  ].join("\n");
  if (brief.includes(TASK_DIR) || brief.includes(npath(TASK_DIR)) || /\btaskDir\b/i.test(brief)) {
    throw new Error("workflow: 13 brief contains taskDir");
  }
  if (brief.includes("artifacts/12_freeze") || /(?:^|[\\/])母版(?:[\\/]|$)/.test(brief)) {
    throw new Error("workflow: 13 brief contains a project artifact path");
  }
  const raw = await callAgent("C", `13_answer_${context.runId}`, brief);
  const gate = normalizeGate(raw);
  const validation = validateGate("13_answer", gate, specs);
  if (!validation.ok) throw new Error(`workflow: 13_answer gate failed: ${validation.reason}`);
  return { node: "13_answer", gate };
}

async function run14(context) {
  const specs = artifactSpecs("14_score", context);
  const extra = [
    `当前卷 runId=${context.runId}；answerPackage=${context.answerPackage}。`,
    "严格按 14 提示词：先 authoring_isolate phase=precheck，再只调用一次冻结 judge.py（--copy-to 为 taskDir/artifacts/13_answer/<runId>），judge 成功后 authoring_isolate phase=finalize。",
    "isolation_precheck_completed 只表示审计与 trace 已生成、可解析且身份可绑定；隔离结论 pass=false 不是基础设施失败，仍须执行唯一一次 judge 并保留 invalid 证据。只有结构、身份或绑定不可用才是基础设施失败。",
    "14 不自动返修；难度不通过保留报告并停机。",
    `当前卷报告必须是 ${ARTIFACT_ROOT}/14_score/${context.runId}/评分.json；C01 必须写 ${ARTIFACT_ROOT}/14_score/补卷判定.json，无补卷时还须写汇总，补卷待执行时只写补卷判定；C02 必须写汇总。`,
    "final reply 的 reply_conclusion 使用 14 提示词要求的上游 JSON；C01 的 file_conclusion 中 supplement_required/stop_reason 必须取自补卷判定.json，C02 的最终选择字段取自汇总.json；score/difficulty_pass/pass/fail_closed 始终取自当前卷评分.json。"
  ].join("\n");
  const result = await runNode("14_score", { context, label: `14_score_${context.runId}`, extra });
  const file = result.fileConclusion || {};
  const reportCondition = await callAgent("C", `14_report_check_${context.runId}`, [
    "只读核验 14 当前卷产物，不修改任何文件。",
    `taskDir：${TASK_DIR}`,
    `runId：${context.runId}`,
    `answerPackage：${context.answerPackage}`,
    `报告：${ARTIFACT_ROOT}/14_score/${context.runId}/评分.json`,
    `补卷判定（C01）：${ARTIFACT_ROOT}/14_score/补卷判定.json`,
    `汇总（C01无补卷或C02必须）：${ARTIFACT_ROOT}/14_score/汇总.json`,
    `审计：${ARTIFACT_ROOT}/13_answer/${context.runId}/隔离审计.json`,
    `host trace：${context.answerPackage}/host_trace.json`,
    "结构核验与业务结论必须分开：审计内容 pass=false 或 trace 内容 invalid 只影响报告中的 valid/pass/fail_closed，不得把结构合法的无效卷当成工具故障；但缺文件、坏 JSON、身份无法绑定时结构检查必须 false。",
    "C01 还必须核验补卷判定与报告一致，且 supplement_required=false 时汇总存在；supplement_required=true 时汇总可暂缺。C02 必须核验汇总存在且覆盖 C01/C02。",
    '返回 JSON：{"summary":"非空","artifacts":[],"conditions":{"report_schema_ok":true,"isolation_audit_structurally_valid":true,"host_trace_identity_ok":true,"copy_manifest_ok":true,"summary_required_ok":true},"file_conclusion":{"score":0,"difficulty_pass":false,"pass":false,"fail_closed":true,"supplement_required":false,"selected_run_id":null,"stop_reason":"..."},"reply_conclusion":{"run_id":"...","pass":false},"extra":{}}'
  ]);
  const reportGate = normalizeGate(reportCondition);
  if (!reportGate) throw new Error(`workflow: 14 report check ${context.runId} returned no gate`);
  const reportCheck = requireConditions("14_report_check", reportGate, [
    "report_schema_ok", "isolation_audit_structurally_valid", "host_trace_identity_ok",
    "copy_manifest_ok", "summary_required_ok"
  ]);
  if (!reportCheck.ok) throw new Error(`workflow: 14 report check ${context.runId}: ${reportCheck.reason}`);
  if (!reportGate.file_conclusion || typeof reportGate.file_conclusion !== "object") throw new Error("workflow: 14 report check missing file_conclusion");
  const projected = { ...reportGate.file_conclusion };
  for (const key of ["score", "difficulty_pass", "pass", "fail_closed", "supplement_required", "selected_run_id", "stop_reason"]) {
    if (!(key in projected)) projected[key] = file[key];
  }
  if (typeof projected.supplement_required !== "boolean") {
    throw new Error(`workflow: 14 report check ${context.runId} must return boolean supplement_required`);
  }
  if (!Object.prototype.hasOwnProperty.call(projected, "score") || !Number.isFinite(Number(projected.score))) {
    throw new Error(`workflow: 14 report check ${context.runId} must return finite score`);
  }
  return { node: "14_score", gate: result.gate, report_gate: reportGate, fileConclusion: projected, context };
}

async function gateBatch(batch, context) {
  const cacheKey = `${batch}:${JSON.stringify(context || {})}`;
  if (state.gateCache[cacheKey]) return state.gateCache[cacheKey];
  state.currentBatch = batch;
  const specs = batchSpecs(batch, context || {});
  const requirements = [];
  if (batch === "A") {
    requirements.push("07 result.pass=true");
    requirements.push("00 SPEC_GATE: score_max/score_rule finite and extracted; extraction_status complete and status/pairing legal; platform_fields null+not_applicable or non-empty extracted with sources");
  }
  if (batch === "B") {
    requirements.push("10 诊断.json.pass=true route=null");
    requirements.push("11 校验结论.json.pass=true with no fatal/major issues");
    requirements.push("12 冻结清单.json/运行契约.json parse and freeze hashes verified");
  }
  if (batch === "C") {
    requirements.push("14 汇总.json.pass=true, selected run difficulty_pass=true, selected run isolation audit pass=true, host trace verified");
    requirements.push("16 结论.json.pass=true");
  }
  if (batch === "D") {
    requirements.push("17 核对.json.pass=true and source_hash_check=pass; exactly three validated archives");
    requirements.push("18 字段映射.json.pass=true and five counts internally consistent");
    requirements.push("18 后上传包已重建：上传包核对.json.pass=true 且 upload_rebuilt/member_set_unchanged/member_hashes_recomputed/mapping_reflected/no_forbidden_members 全为 true；填写上传.zip 平台映射成员已替换为 18 最终值，成员集合未变，成员 hash 全部重算");
  }
  const prompt = [
    `只读执行 ${batch} 批 GATE，不修改文件。`,
    `taskDir：${TASK_DIR}`,
    `规范：${SPEC_PATH}`,
    `nodeOptions 仅支持 provider/model；部署模型=${MODEL_SPEC}。`,
    `逐项核验以下产物表，不能只看节点回复：${JSON.stringify(specs)}`,
    `本批硬条件：${JSON.stringify(requirements)}`,
    "返回 JSON：",
    '{"summary":"非空","artifacts":[{"id":"上表id","path":"实际路径","exists":true,"nonempty":true,"json_ok":true,"matches":1}],"conditions":{"batch_artifact_table_ok":true},"file_conclusion":{},"reply_conclusion":{},"extra":{"requirements":{}}}',
    "artifacts 必须逐项真实检查；glob 给 matches；.json 必须 parse。任一必需项缺失/空/JSON坏或硬条件 false，均不得返回 pass。"
  ].join("\n");
  const raw = await callAgent(batch, `GATE_${batch}`, prompt);
  const gate = normalizeGate(raw);
  const validation = validateGate(`GATE_${batch}`, gate, specs);
  if (!validation.ok) throw new Error(`workflow: ${batch} GATE failed: ${validation.reason}`);
  if (!gate.conditions || gate.conditions.batch_artifact_table_ok !== true) {
    throw new Error(`workflow: ${batch} GATE artifact table did not pass`);
  }
  const extraReq = gate.extra && gate.extra.requirements;
  if (!extraReq || typeof extraReq !== "object") throw new Error(`workflow: ${batch} GATE did not return requirements`);
  for (const [key, value] of Object.entries(extraReq)) {
    if (value !== true) throw new Error(`workflow: ${batch} GATE requirement failed: ${key}`);
  }
  const result = { batch, gate };
  state.gates.push({
    batch,
    call: state.callsByBatch[batch],
    summary: gate.summary,
    requirements: extraReq
  });
  state.gateCache[cacheKey] = result;
  return result;
}

async function runBuildInitial(label, reason) {
  const result = await runNode("06_build", {
    label: label || "06_build",
    extra: `mode=initial；findings_path=null。${reason || "按 05 附件清单从零生成全部附件。"} 必须写 mode=initial 的 返修记录.json。`
  });
  const audit = result.gate.extra && result.gate.extra.audit ? result.gate.extra.audit : {};
  if (String(audit.mode) !== "initial") throw new Error(`workflow: ${label} did not run in initial mode`);
  if (Number(audit.findings_total) !== 0) throw new Error(`workflow: ${label} initial mode reported findings`);
  return result;
}

async function runBuildRepair(label, findingsPath, reason) {
  const result = await runNode("06_build", {
    label,
    extra: `mode=repair；findings_path=${findingsPath}。${reason} 只修复 findings 指向的问题；未被 finding 引用的文件 hash 必须不变；按 返修记录.json 契约逐条写 finding_id→fix→evidence。`
  });
  const audit = result.gate.extra && result.gate.extra.audit ? result.gate.extra.audit : {};
  if (String(audit.mode) !== "repair") throw new Error(`workflow: ${label} did not run in repair mode`);
  if (Number(audit.findings_total) < 1) throw new Error(`workflow: ${label} repair mode reported no findings`);
  return result;
}

async function runMetadataCheck(options) {
  const opts = options || {};
  let result = await runDecision("07_metacheck", opts);
  let attempts = 0;
  while (result.fileConclusion.pass !== true) {
    if (attempts >= 2) {
      recordRepair("A", "07_metacheck", "metadata retry limit reached", attempts, "06");
      throw new Error("workflow: 07 metadata check still failed after 2 06->07 repairs");
    }
    attempts += 1;
    recordRepair("A", "07_metacheck", result.fileConclusion, attempts, "06");
    await runBuildRepair(
      `06_build_repair_07_${attempts}`,
      "artifacts/07_metacheck/result.json",
      "07 result.json 未通过；只修 findings 指向的元数据/制作痕迹问题，不读取答案 rubric。"
    );
    result = await runDecision("07_metacheck", { label: `07_metacheck_after_repair_${attempts}` });
  }
  return result;
}

async function runRepairChain(route, target, round) {
  const chainMap = {
    "04": ["04_scope", "05_evidence", "06_build", "07_metacheck", "08_prompt", "09_style", "10_difficulty", "11_rubric"],
    "05": ["05_evidence", "06_build", "07_metacheck", "08_prompt", "09_style", "10_difficulty", "11_rubric"],
    "06": ["06_build", "07_metacheck", "08_prompt", "09_style", "10_difficulty", "11_rubric"],
    "07": ["07_metacheck", "08_prompt", "09_style", "10_difficulty", "11_rubric"],
    "08": ["08_prompt", "09_style", "10_difficulty", "11_rubric"],
    "09": ["09_style", "10_difficulty", "11_rubric"],
    "10": ["10_difficulty", "11_rubric"],
    "11": ["11_rubric"]
  };
  let chain = chainMap[String(route)] || null;
  if (!chain) throw new Error(`workflow: repair route ${route} is not executable`);
  if (target === "09_style") {
    chain = chain.slice(0, chain.indexOf("09_style") + 1);
  } else if (target === "10_difficulty") {
    chain = chain.slice(0, chain.indexOf("10_difficulty") + 1);
  } else if (target === "11_rubric") {
    chain = chain.slice(0, chain.indexOf("11_rubric") + 1);
  }
  for (const node of chain) {
    if (node === "07_metacheck") {
      await runMetadataCheck({ label: `07_metacheck_repair_${round}` });
    } else if (node === "06_build") {
      await runBuildInitial(
        `06_build_rebuild_${round}`,
        `上游 ${target} 返修已更新 04/05；按最新 05 附件清单重建全部附件，不读取 13 答卷或评分。`
      );
    } else {
      await runNode(node, { label: `${node}_repair_${round}`, extra: `返修目标=${target}；原因来自上游文件。` });
    }
  }
  return chain;
}

async function run09WithRepair(options) {
  let result = await runDecision("09_style", options || {});
  let attempts = 0;
  while (result.fileConclusion.pass !== true) {
    if (attempts >= 2) throw new Error("workflow: 09 style/mapping still failed after 2 repairs");
    attempts += 1;
    const mappingRoute = result.fileConclusion.mapping_route;
    const attachmentRoute = result.fileConclusion.attachment_route;
    const mapping = validateRoute("09 mapping", mappingRoute, ["04", "08"]);
    if (!mapping.ok) throw new Error(`workflow: ${mapping.reason}`);
    const attachment = validateRoute("09 attachment", attachmentRoute, ["06"]);
    if (!attachment.ok) throw new Error(`workflow: ${attachment.reason}`);
    const attachmentIssues = result.fileConclusion.attachment_issues === true || attachment.route === "06";
    if (attachmentIssues) {
      recordRepair("B", "09_style", "attachment issue route 06", attempts, "06");
      await runBuildRepair(
        `06_build_from_09_attachment_${attempts}`,
        "artifacts/09_style/附件问题.json",
        "只能按 附件问题.json issues 修复附件问题；不得读取 13/14/15/16。"
      );
      await runMetadataCheck({ label: `07_metacheck_from_09_attachment_${attempts}` });
      await runNode("08_prompt", { label: `08_prompt_from_09_attachment_${attempts}` });
    } else if (mapping.route === "04") {
      recordRepair("B", "09_style", "mapping issue route 04", attempts, "04");
      await runRepairChain("04", "09_style", attempts);
    } else if (mapping.route === "08") {
      recordRepair("B", "09_style", "mapping issue route 08", attempts, "08");
      await runNode("08_prompt", { label: `08_prompt_from_09_mapping_${attempts}` });
    } else {
      throw new Error("workflow: 09 failed without executable route and is not a terminal blocker");
    }
    result = await runDecision("09_style", { label: `09_style_after_repair_${attempts}` });
  }
  return result;
}

async function run10WithRepair(options) {
  let result = await runDecision("10_difficulty", options || {});
  let attempts = 0;
  while (result.fileConclusion.pass !== true) {
    const route = validateRoute("10", result.fileConclusion.route, ["05", "06", "08", "11"]);
    if (!route.ok) throw new Error(`workflow: ${route.reason}`);
    if (route.route === null) throw new Error("workflow: 10 difficulty failed with terminal blocker route=null; stop");
    if (attempts >= 2) throw new Error("workflow: 10 difficulty still failed after 2 repairs");
    attempts += 1;
    recordRepair("B", "10_difficulty", result.fileConclusion, attempts, route.route);
    if (route.route === "11") {
      await runNode("11_rubric", { label: `11_rubric_from_10_${attempts}` });
    } else {
      await runRepairChain(route.route, "10_difficulty", attempts);
    }
    result = await runDecision("10_difficulty", { label: `10_difficulty_after_repair_${attempts}` });
  }
  return result;
}

async function run11WithRepair(options) {
  let result = await runDecision("11_rubric", options || {});
  let attempts = 0;
  while (result.fileConclusion.pass !== true) {
    const owners = issueOwners(result.fileConclusion);
    const allowed = ["04", "05", "06", "08", "09", "11"];
    if (!owners.length || owners.some((owner) => !allowed.includes(owner))) {
      throw new Error(`workflow: 11 issues have missing/unknown owner_node: ${JSON.stringify(owners)}`);
    }
    if (attempts >= 2) throw new Error("workflow: 11 rubric failed after 2 owner repairs");
    attempts += 1;
    const owner = allowed.find((value) => owners.includes(value));
    recordRepair("B", "11_rubric", `owner_node=${owner}`, attempts, owner);
    await runRepairChain(owner, "11_rubric", attempts);
    result = await runDecision("11_rubric", { label: `11_rubric_after_owner_${owner}_${attempts}` });
  }
  return result;
}

async function run12WithRepair(options) {
  let result = await runDecision("12_freeze", options || {});
  let attempts = 0;
  while (result.fileConclusion.pass !== true) {
    const route = validateRoute("12", result.fileConclusion.route, ["04", "07", "10", "11", "05", "06", "08", "09"]);
    if (!route.ok) throw new Error(`workflow: ${route.reason}`);
    if (route.route === null) throw new Error("workflow: 12 freeze failed with terminal blocker route=null; stop");
    if (attempts >= 2) throw new Error("workflow: 12 freeze still failed after 2 repairs");
    attempts += 1;
    recordRepair("B", "12_freeze", result.fileConclusion, attempts, route.route);
    await runRepairChain(route.route, "11_rubric", attempts);
    result = await runDecision("12_freeze", { label: `12_freeze_after_repair_${attempts}` });
  }
  return result;
}

async function runA() {
  await runNode("00_spec", {
    extra: "先做 SPEC_GATE：score_max/score_rule 非空且 extracted，extraction_status 状态词合法且与值配对，platform_fields 为 null+not_applicable 或非空 extracted 且每项 source 可定位。"
  });
  for (const node of ["01_src", "02_scrub", "03_survey", "04_scope", "05_evidence"]) {
    await runNode(node);
  }
  await runBuildInitial("06_build", "按 05 附件清单从零生成全部附件。");
  const final07 = await runMetadataCheck({ label: "07_metacheck_final_a" });
  if (final07.fileConclusion.pass !== true) throw new Error("workflow: final A 07 gate failed");
  const gate = await gateBatch("A");
  return {
    batch: "A",
    status: "done",
    gate: gate.gate.summary,
    calls: state.callsByBatch.A,
    budget: CALL_BUDGET.A,
    conflicts: state.conflicts.filter((item) => NODE_BATCH[item.node] === "A"),
    repairs: state.repairs.filter((item) => item.batch === "A")
  };
}

async function runB() {
  await gateBatch("A");
  await runNode("08_prompt");
  await run09WithRepair();
  await run10WithRepair();
  await run11WithRepair();
  await run12WithRepair();
  const gate = await gateBatch("B");
  return {
    batch: "B",
    status: "done",
    gate: gate.gate.summary,
    calls: state.callsByBatch.B,
    budget: CALL_BUDGET.B,
    conflicts: state.conflicts.filter((item) => NODE_BATCH[item.node] === "B"),
    repairs: state.repairs.filter((item) => item.batch === "B")
  };
}

async function runC() {
  await gateBatch("A");
  await gateBatch("B");
  if (!state.runs.length) {
    const first = await preparePackage("C01");
    const answer = await run13(first);
    const score = await run14(first);
    addRun({
      runId: "C01",
      answerPackage: first.answerPackage,
      preparation: first.preparation,
      answer,
      score,
      decision: score.fileConclusion
    });
    if (score.fileConclusion.supplement_required === true) {
      const second = await preparePackage("C02");
      const answer2 = await run13(second);
      const score2 = await run14(second);
      addRun({
        runId: "C02",
        answerPackage: second.answerPackage,
        preparation: second.preparation,
        answer: answer2,
        score: score2,
        decision: score2.fileConclusion
      });
      if (score2.fileConclusion.supplement_required === true) {
        throw new Error("workflow: 14 requested a third run; only C01/C02 are allowed");
      }
    }
  } else if (state.runs.some((run) => run.runId === "C01") && !state.runs.some((run) => run.runId === "C02")) {
    const first = state.runs.find((run) => run.runId === "C01");
    if (!first.decision || first.decision.supplement_required === true) {
      const second = await preparePackage("C02");
      const answer2 = await run13(second);
      const score2 = await run14(second);
      addRun({
        runId: "C02",
        answerPackage: second.answerPackage,
        preparation: second.preparation,
        answer: answer2,
        score: score2,
        decision: score2.fileConclusion
      });
    }
  }
  ensureRuns();
  await runNode("15_review", { context: { runId: "C01" }, extra: "按 14 汇总.json.run_ids 覆盖全部卷；每卷写问题表/读卷记录，并写 15 汇总。不得只读根目录评分。" });
  await runNode("16_qc", { extra: "按 14 汇总.json.run_ids 和 15_review/汇总.json 做八项文件证据检查；失败不得进入 17。双卷时逐卷列出。" });
  await gateBatch("C", { runs: allRunContexts() });
  return {
    batch: "C",
    status: "done",
    gate: "C batch passed",
    calls: state.callsByBatch.C,
    budget: CALL_BUDGET.C,
    runs: state.runs.map((run) => ({ run_id: run.runId, answer_package: run.answerPackage })),
    conflicts: state.conflicts.filter((item) => NODE_BATCH[item.node] === "C"),
    repairs: state.repairs.filter((item) => item.batch === "C")
  };
}

function assert18Counts(result) {
  const audit = result.gate.extra && result.gate.extra.audit ? result.gate.extra.audit : {};
  const counts = result.fileConclusion && result.fileConclusion.counts ? result.fileConclusion.counts : {};
  const keys = ["total", "ready", "missing", "invalid", "not_applicable"];
  for (const key of keys) {
    if (!Number.isFinite(Number(counts[key]))) throw new Error(`workflow: 18 字段映射.json.counts.${key} must be finite`);
    if (Number(counts[key]) !== Number(audit[key])) throw new Error(`workflow: 18 counts.${key} disagrees with the recomputed audit`);
  }
  const total = Number(counts.total);
  const sum = Number(counts.ready) + Number(counts.missing) + Number(counts.invalid) + Number(counts.not_applicable);
  if (sum !== total) throw new Error("workflow: 18 counts do not sum to total");
  const expectedPass = Number(counts.missing) === 0
    && Number(counts.invalid) === 0
    && Number(counts.ready) + Number(counts.not_applicable) === total
    && audit.all_checks_true === true;
  if (result.fileConclusion.pass !== true || expectedPass !== true) {
    throw new Error("workflow: 18 pass formula is not satisfied by recomputed counts/checks");
  }
}

async function run18RebuildUpload() {
  const specs = artifactSpecs("18_rebuild_upload", {});
  const conditionIds = [...(NODE_CONDITIONS["18_rebuild_upload"] || []), ...(ASSISTANT_CONDITIONS["18_rebuild_upload"] || [])];
  const brief = [
    "执行 18 后的上传包重建（host 侧编排步骤，不是独立提示词节点）。只读写下列路径，不修改其他文件。",
    `taskDir：${TASK_DIR}`,
    `17 核对：${ARTIFACT_ROOT}/17_pack/核对.json`,
    `17 底包：${ARTIFACT_ROOT}/17_pack/填写上传.zip`,
    `18 字段映射：${ARTIFACT_ROOT}/18_submit/字段映射.json`,
    `18 字段映射人读表：${ARTIFACT_ROOT}/18_submit/字段映射.md`,
    `输出核对：${ARTIFACT_ROOT}/18_submit/上传包核对.json`,
    "前置：18 字段映射.json.pass=true；冻结清单可解析；底包成员集合以当前 zip 实际解包为准。",
    "步骤：1) 打开底包，记录全部成员 path/bytes/sha256；2) 只替换成员 填写上传/平台/平台栏位映射.md，用 18 最终字段映射重写（逐字段 field_id/name/order/required/value_type/value/status/source_id/na_basis，不得残留 pending_18 或待18回填）；3) 其余成员保持字节不变；4) 重新打开 zip，逐成员重算 bytes/sha256，成员集合必须与底包完全相同；5) 核对 完整题包.zip、仅模型输入.zip 的 sha256 与 17 核对.json 记录一致（未变）；6) 扫描确认包内没有答案/rubric/13-16 产物或禁止成员。",
    "写 上传包核对.json（schema_version=1），键：pass/upload_rebuilt/member_set_unchanged/member_hashes_recomputed/mapping_reflected/no_forbidden_members/other_packages_unchanged/expected_mapping_member/changed_members/member_count_before/member_count_after/members_with_hash_after/mapping_sha256/upload_package_sha256_before/upload_package_sha256_after/members_before/members_after/checked_at。",
    `产物清单（路径已由编排展开）：${JSON.stringify(specs)}`,
    `必须返回的条件键：${JSON.stringify(conditionIds)}`,
    "最终回复必须是一个 JSON 对象（不要代码围栏）：",
    '{"summary":"非空","artifacts":[{"id":"upload_check","path":"实际路径","exists":true,"nonempty":true,"json_ok":true,"matches":1},{"id":"upload_package","path":"实际路径","exists":true,"nonempty":true,"matches":1}],"conditions":{"条件id":true},"file_conclusion":{"pass":true,"upload_rebuilt":true,"member_set_unchanged":true,"member_hashes_recomputed":true,"mapping_reflected":true,"no_forbidden_members":true},"reply_conclusion":{},"extra":{"audit":{...}}}',
    `extra.audit 必须按下列键返回且来自实际 zip 成员重算：${EXTRA_AUDIT_HELP["18_rebuild_upload"]}`,
    "任一必需项不成立时不得返回 pass=true；不得在 18 未 pass 时重建。"
  ].join("\n");
  const raw = await callAgent("D", "18_rebuild_upload", brief);
  const gate = normalizeGate(raw);
  const validation = validateGate("18_rebuild_upload", gate, specs);
  if (!validation.ok) throw new Error(`workflow: 18_rebuild_upload artifact gate failed: ${validation.reason}`);
  const auditFailures = validateExtraAudit("18_rebuild_upload", gate);
  if (auditFailures.length) throw new Error(`workflow: 18_rebuild_upload machine audit failed: ${auditFailures.join("; ")}`);
  const decision = getFileConclusion("18_rebuild_upload", gate, {});
  if (decision.pass !== true) throw new Error("workflow: 18 rebuild upload package check failed");
  for (const key of ["upload_rebuilt", "member_set_unchanged", "member_hashes_recomputed", "mapping_reflected", "no_forbidden_members"]) {
    if (decision[key] !== true) throw new Error(`workflow: 18 rebuild upload check is false: ${key}`);
  }
  return { gate, decision, summary: gate.summary };
}

async function runD() {
  const cCheckRaw = await callAgent("D", "D_upstream_C_check", [
    "只读核验 C 批终态，不修改任何文件；D 批即使单独调用也必须先确认上一批已经通过。",
    `taskDir：${TASK_DIR}`,
    `14 汇总：${ARTIFACT_ROOT}/14_score/汇总.json`,
    `15 汇总：${ARTIFACT_ROOT}/15_review/汇总.json`,
    `16 结论：${ARTIFACT_ROOT}/16_qc/结论.json`,
    "核验：14 汇总.json 可解析、pass=true、selected_run_id 属于 run_ids 且该卷 difficulty_pass=true；该卷隔离审计与 host trace 可用；15 汇总 run_ids 覆盖 14 run_ids；16 结论.json.pass=true。",
    "必须返回的条件键：[\"c_summary_pass\",\"c_selected_run_valid\",\"c_audit_and_trace_ok\",\"c_qc_pass\",\"c_review_covers_runs\"]",
    '返回 JSON：{"summary":"非空","artifacts":[],"conditions":{"c_summary_pass":true,"c_selected_run_valid":true,"c_audit_and_trace_ok":true,"c_qc_pass":true,"c_review_covers_runs":true},"file_conclusion":{},"reply_conclusion":{},"extra":{}}'
  ]);
  const cCheckGate = normalizeGate(cCheckRaw);
  if (!cCheckGate) throw new Error("workflow: D upstream C check returned no gate");
  const cCheck = requireConditions("D_upstream_C_check", cCheckGate, [
    "c_summary_pass", "c_selected_run_valid", "c_audit_and_trace_ok", "c_qc_pass", "c_review_covers_runs"
  ]);
  if (!cCheck.ok) throw new Error(`workflow: D upstream C check: ${cCheck.reason}`);
  const p17 = await runDecision("17_pack", {});
  if (p17.fileConclusion.pass !== true) throw new Error("workflow: 17 pack failed; D batch stops");
  const p18 = await runDecision("18_submit", {});
  if (p18.fileConclusion.pass !== true) throw new Error("workflow: 18 submit failed; D batch stops");
  assert18Counts(p18);
  const rebuild = await run18RebuildUpload();
  await gateBatch("D");
  return {
    batch: "D",
    status: "done",
    gate: "D batch passed",
    upload_rebuild: rebuild.summary,
    calls: state.callsByBatch.D,
    budget: CALL_BUDGET.D,
    conflicts: state.conflicts.filter((item) => NODE_BATCH[item.node] === "D"),
    repairs: state.repairs.filter((item) => item.batch === "D")
  };
}

phase("workflow");
log(`taskDir=${TASK_DIR} batch=${BATCH} model=${MODEL_SPEC} options=provider/model-only`);

let batchResult = null;
if (BATCH === "A") batchResult = await runA();
else if (BATCH === "B") batchResult = await runB();
else if (BATCH === "C") batchResult = await runC();
else if (BATCH === "D") batchResult = await runD();
else {
  await runA();
  await runB();
  await runC();
  await runD();
  batchResult = {
    batch: "ALL",
    status: "done",
    calls: state.calls,
    calls_by_batch: state.callsByBatch,
    budgets: CALL_BUDGET,
    gates: state.gates,
    runs: state.runs.map((run) => ({ run_id: run.runId, answer_package: run.answerPackage })),
    conflicts: state.conflicts,
    repairs: state.repairs
  };
}

return {
  schema_version: 1,
  workflow: "v006-card3-v008",
  status: batchResult && batchResult.status || "done",
  task_dir: TASK_DIR,
  batch: BATCH,
  model: MODEL_SPEC,
  node_options: ["provider", "model", "label"],
  reasoning_effort_contract: "deployment-default-max; workflow-ptc does not accept reasoningEffort",
  calls: state.calls,
  calls_by_batch: state.callsByBatch,
  call_budget: CALL_BUDGET,
  result: batchResult,
  gates: state.gates,
  conflicts: state.conflicts,
  repairs: state.repairs,
  runs: state.runs.map((run) => ({
    run_id: run.runId,
    answer_package: run.answerPackage,
    decision: run.decision
  }))
};
