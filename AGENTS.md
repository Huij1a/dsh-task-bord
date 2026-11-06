# 接管说明（AGENTS.md）

这是「高经出题流水线」项目，用 DSH 的 workflow + subagent 跑 19 节点出题流程。DSH 会把本文件自动加载进上下文，所以先读完这一页再动手。

## 你要接手的是什么

- 19 个执行节点提示词（`00_spec` + `01`–`18`）和 `00_master` 主控契约，共 20 份提示词。
- `T-demo` 是历史证据，**冻结，不要改**。
- 一个 DSH 插件提供开题、状态、脚本、会话轨迹和隔离审计工具。
- 技能入口（用户输入 `/19` 触发）。完整目录见 [docs/目录说明.md](docs/目录说明.md)。

## 现在到哪一步了

| 项 | 状态 |
|---|---|
| 母版版本 | **v008**（v006 卡3 证据链层；stub harness 九场景已验证，真实全流程尚未跑） |
| 19 节点全量 | **一次没跑过** |
| 编排验证 | A/B/C/D 模拟 harness 通过（卡3 扩为九场景，含 01 摘录不匹配 / 06 repair / 18 重建包 / 18 counts 反例）；真实项目规范与新题全量仍待跑 |
| 卡3 证据链接口 | 已实现：01 摘录一一对应 + sha 机器门禁、02 逐来源脱敏映射、05 D→来源/附件承载溯源、06 initial/repair 固定契约、17→18 字段映射 roundtrip、18 后 `18_rebuild_upload` 重建上传包 |
| 13→14 闭环 | v004 历史结果只作参考，不代表 v006/v007 |
| 插件 | 源码与 desktop profile 已同步，包名解析通过 |
| 工具可见性 | **已验证**（2026-11-06：`cordis.patch.yml` 用 `- insert: [- name: dsh-plugin-authoring, config…]`，profile `package.json` 依赖 `file:` 指向 `插件\dsh-plugin-authoring`；`list_plugins` 显示 active） |

详细状态、已修项和未验证项看 `docs/进度.md`。

## 第一步：先读这些

1. `docs/进度.md`：现状、已验证项、未验证项和待办
2. `docs/问题登记表.md`：当前明细和统计
3. `docs/v006_卡3_证据链交接.md`：v008 证据链接口与验证
4. `docs/v006_卡2_编排层交接.md`：v007 编排契约与接口（卡3 在其上增量）
5. `docs/目录说明.md`：完整目录结构和外部作答题包布局

## 运行方式

统一用插件开题和按批取脚本，**不要手工复制 `tasks/T-demo`，也不要手工拼题录**：

```text
authoring_init(industry="<行业>", specPath="<当期规范文件或目录>")
  → 返回 taskDir
authoring_script(taskId, kind="batch")
  → 取得当前 workflow.js 原文及 taskDir/batch/specPath/industry 参数
  → 原样提交给 workflow
```

workflow 参数形状：

```json
{
  "taskDir": "<authoring_init 返回的绝对路径>",
  "batch": "A",
  "specPath": "<当期规范文件或目录>",
  "industry": "<L1 或 L1/L2 行业>"
}
```

四批按顺序执行，上一批检查通过后再执行下一批；`next` 返回的续批信息用于继续下一批：

| 批次 | 节点 |
|---|---|
| A | 00_spec + 01–07 |
| B | 08–12 |
| C | 13–16 |
| D | 17–18（+ `18_rebuild_upload` 编排步骤，无独立提示词） |

不要改写脚本中的节点顺序、隔离边界和返修条件。workflow 本身不能暂停续跑，因此用批次边界作为人工检查点，失败只重跑当前批。

## 硬约束（踩过的坑）

1. 挂本地插件要两步：① `cordis.patch.yml` 用 `- insert:` 包住 `- name: dsh-plugin-authoring`（裸 `- name:` 会被跳过并报 `id is required for non-insert patches`；写 id 不带 insert 报 entry not found）；② profile `package.json` 的 dependencies 加 `"dsh-plugin-authoring": "file:D:/高经出题流水线/插件/dsh-plugin-authoring"`，否则 DSH 启动清理 node_modules 后报 `ERR_MODULE_NOT_FOUND`。改插件源码后需重新安装到 profile 并重启 DSH。
2. **不要用 WPS COM 转 PDF**。DSH 内置 `office-export-pdf`、`office-xlsx`、`office-recalculate` 等技能（LibreOffice Kit），用它们。
3. **`tasks/T-demo/` 是已跑过的冻结副本，不要改**。它里面的 `prompts/` 和 `manifest.json` 是历史证据。
4. **不要改 `~/.dsh/.env` 和 `.credentials.yaml`**（里面有模型的 API key），除非用户明确要求。
5. **项目门槛只从 `artifacts/00_spec/项目门槛.json` 取**。行业、题型、平台字段、禁用项和截止时间均按当期规范；`04_scope/交付规格.json` 只负责交付结构，不能反过来写死平台字段。
6. **workflow 不能断点续跑**，必须按 A/B/C/D 四批执行。12 冻结后，13 只读项目外题包 `D:\高经作答区\<taskId>\<runId>\input\`、只写同包 `output\`；14 先用 `authoring_isolate` 从 13 会话生成题包根 `host_trace.json` 与临时审计，judge 唯一一次 `--copy-to` 归档后 finalize 最终 `隔离审计.json`。workflow 子代理不支持改 cwd，13 靠只读题包 + 路径审计隔离，不靠工作目录。

## 验证一件事算不算做完

- 改了提示词 → 用 `authoring_verify(against="template")` 查任务副本与当前母版差异；旧任务不要打补丁继续跑
- 每批结束 → 用 `authoring_status` 看产物、项目门槛和判定结论，再决定是否续下一批
- 说“全流程可用”之前 → A/B/C/D 四批都必须实际跑通，且 07/10/14/16 的判定均为通过；不能只凭两节点闭环或假 ctx 冒烟下结论
- 插件工具在模型工具列表可见只能证明加载成功，不能替代流水线运行验证

## 目录速查

完整结构见 [docs/目录说明.md](docs/目录说明.md)。关键边界如下：

```text
母版\                20 份提示词、workflow.js、judge.py、manifest.json、历史 workflow_s2.js
tasks\<题ID>\        prompts、artifacts、manifest；不再建 _answer_sandbox
D:\高经作答区\       13 的 input/output/host_trace；项目目录外
插件\                 DSH 插件源码与 profile 同步副本
docs\                进度、问题登记、审查、交接、目录说明、历史
```
