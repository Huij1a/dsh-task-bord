import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROOT = "D:\\高经出题流水线";

/**
 * 读取所有题目的状态，返回看板数据。
 * @param {string} root - 项目根目录
 * @returns {Promise<object>} { tasks: [{ taskId, industry, status, nodes: [...] }] }
 */
export async function getBoardState(root = DEFAULT_ROOT) {
  const tasksDir = path.join(root, "tasks");
  let entries;
  try {
    entries = await fs.readdir(tasksDir, { withFileTypes: true });
  } catch {
    return { tasks: [] };
  }

  const tasks = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const taskId = ent.name;
    const taskDir = path.join(tasksDir, taskId);
    const manifestPath = path.join(taskDir, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }

    const industry = manifest.industry || "";
    const nodes = [];
    const nodeNames = [
      "00_spec", "01_src", "02_scrub", "03_survey", "04_scope",
      "05_evidence", "06_build", "07_metacheck", "08_prompt", "09_style",
      "10_difficulty", "11_rubric", "12_freeze", "13_answer", "14_judge",
      "15_review", "16_qc", "17_pack", "18_submit"
    ];

    let anyRunning = false;
    let anyFailed = false;
    let allDone = true;
    let anyStarted = false;

    for (const nodeName of nodeNames) {
      const gatePath = path.join(taskDir, "artifacts", nodeName, "_gate.json");
      let gate;
      try {
        gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
      } catch {
        gate = null;
      }

      let nodeStatus = "pending";
      if (gate) {
        anyStarted = true;
        if (gate.pass === true) {
          nodeStatus = "passed";
        } else if (gate.pass === false) {
          nodeStatus = "failed";
          anyFailed = true;
          allDone = false;
        } else {
          nodeStatus = "running";
          anyRunning = true;
          allDone = false;
        }
      } else {
        allDone = false;
      }

      nodes.push({
        name: nodeName,
        status: nodeStatus,
        pass: gate?.pass,
        failures: gate?.failures || [],
        summary: gate?.summary || "",
      });
    }

    let taskStatus = "draft";
    if (anyRunning) {
      taskStatus = "running";
    } else if (anyFailed) {
      taskStatus = "failed";
    } else if (allDone && anyStarted) {
      taskStatus = "completed";
    }

    tasks.push({ taskId, industry, status: taskStatus, nodes });
  }

  return { tasks };
}
