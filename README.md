# 高经出题流水线（DSH）

> **接手先读 `AGENTS.md`**（DSH 会自动加载）。现状看 `docs/进度.md`，待办看 `docs/问题登记表.md`。

用 DeepSeek Harness 的 workflow + subagent 跑 19 节点出题流程。每个节点是独立会话，节点之间只通过文件交接，父会话不累积子对话。


## 当前状态（2026-11-05）

| 项 | 状态 |
|---|---|
| 母版版本 | **v004**（4 条致命 + 8 条通用性问题已修） |
| 19 节点全量 | **未跑过**；只跑过两节点闭环（13→14） |
| 两节点闭环结果 | 1 小时 10 分，C01–C04 全齐，评分 50/100，父会话 63.5K tokens |
| 插件 | 已装，4 工具，包名解析通过；工具可见性待真实会话确认 |
| 问题登记 | 63 条，已修 13，未修 50 |

详情见 `docs/进度.md`；逐条销项见 `docs/问题登记表.md`。

## 为什么单独一个目录

- 不跟 DSH 默认工作区的日常会话混在一起
- 提示词母版、每题的副本、产物、判定器都在一起，方便备份和迁移
- 在 DSH 里作为**独立工作区**打开，切换过去就是出题，切回来就是日常

## 目录结构

```
D:\高经出题流水线\
  README.md                     ← 本文件
  .dsh/skills/19step/SKILL.md   ← DSH 自动发现的技能入口
  母版/                          ← 可复用资产，不要直接改
    prompts/00_master.md … 18_submit.md   19 份提示词
    workflow.js                 ← 18 节点编排（含 06↔07 返修环、16 闸门）
    workflow_s2.js              ← 两节点闭环（13 作答 → 14 评分），用于快速验证
    manifest.json               ← 母版哈希
    rubric.json                 ← 60 项考点示例
    judge.py                    ← 判定器
  tasks/
    T-demo/                     ← 已完成的一次示例（含 A01–A13 与 C01–C04）
    T-20261105-01/              ← 新题从这里开始
```

## 开一道新题

```bash
cd D:\高经出题流水线
cp -r 母版 tasks/T-20261105-01
cd tasks/T-20261105-01
rm -rf artifacts && mkdir artifacts
python -c "import hashlib,json,pathlib;d=[{'path':'prompts/'+p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(pathlib.Path('prompts').glob('*.md'))];pathlib.Path('manifest.json').write_text(json.dumps({'task':'T-20261105-01','version':'v001','files':d},ensure_ascii=False,indent=2),encoding='utf-8');print('frozen',len(d))"
```

然后按行业微调 `prompts/01_src.md` 到 `11_rubric.md` 里的例子（结构不要动）。

## 在 DSH 里怎么跑

1. 在 DSH 左侧「工作区」点加号，选 `D:\高经出题流水线`，切到该工作区。
2. 新建会话，模型选 `deepseek-v4.1-flash`（推理等级按需）。
3. 发这一段：

```
用 workflow 工具执行 tasks/T-20261105-01/workflow.js 的正文（原样作为 script，不要改写），
args 是 {"taskDir": "D:\\高经出题流水线\\tasks\\T-20261105-01"}。
行业：<你的 L1/L2 行业>
```

4. 前台会等全部节点跑完（约 1 小时/题，视节点数）；想后台跑就加 `run_in_background: true`，用 `job_output` 查进度。

## 按批跑，别一次跑完

workflow 不能断点续跑（官方明确不支持 pause），所以建议把 18 个节点拆成几批，失败只重跑一批：

| 批 | 节点 | 目的 |
|---|---|---|
| A | 01–07 | 素材到附件，元数据检查打回就返修 |
| B | 08–12 | 题面、润色、难度诊断、考点标答、冻结 |
| C | 13 | 独立作答（最重，30 分钟以上） |
| D | 14–18 | 评分、读卷、质检、打包、提交准备 |

## 成本参考（实测）

| 方式 | tokens | 四份交付物 |
|---|---|---|
| 单会话跑完整题 | 10,952,528 | 齐 |
| 分段跑 | 1,492,855 | 0 份 |
| **DSH workflow（subagent 隔离）** | **63,500** | **齐** |

父会话只记 63.5K，因为子会话的对话不进父上下文。这是省 token 的关键。

## 冻结规则

每题一份 `prompts/` 副本，`manifest.json` 记 SHA-256。节点执行前校验，不一致拒绝执行。改提示词必须新开版本，不能改已跑过的题。

## 已知问题

1. **交付结构必须写进题面**：只写在节点提示词里，模型会自己起表名，判定器大面积 MISSING。用 `artifacts/08_prompt/题面_v2.md` 那种写法。
2. **判定器要结构适配**：`judge.py` 按示范题的 sheet 名取数，换结构就 MISSING。
3. **13 节点太重**：单节点 30 分钟，建议拆成 13a 事件重放 / 13b 排程 / 13c 资金 / 13d 打包。

## DSH 自带能力（别再自己写）

DSH 内置了 office 技能，优先用它们，不要再用 WPS COM 或 python-docx 硬拼：

| 技能 | 用途 | 替代了原来的什么 |
|---|---|---|
| `office-xlsx` | 读写 xlsx、改单元格、公式 | openpyxl 手写 |
| `office-docx` | 读写 docx、校验 | python-docx |
| `office-export-pdf` | Office 转 PDF（LibreOffice Kit） | WPS COM 转 PDF |
| `office-recalculate` | 刷新公式缓存并核对计算值 | 之前 openpyxl 保存丢缓存那个坑 |
| `office-render` | 渲染成图片看版面 | 截屏核对 |
| `office` | 上面几个的总入口 | — |

所以在节点提示词里，06 附件制造和 07 元数据检查可以改成调用这些技能，比走 WPS 更稳、更快。

## 怎么调用

- 技能：输入框打 `/19` 出现 `19step-authoring`，选中后描述行业即可
- 单次跑：直接在会话里让模型用 `workflow` 工具提交 `tasks/<题ID>/workflow.js`
- 批量：把 18 节点拆成 A(01–07) / B(08–12) / C(13) / D(14–18) 四批，失败只重跑一批
