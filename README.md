# 高经出题流水线 - 19 节点工作流

这是一套完整的高经济价值题目出题流水线，使用 DSH (DeepSeek Harness) 的 workflow + subagent 框架，19 个执行节点自动化完成从素材采集到最终提交的全流程。

## 项目结构

```
母版/                    # 流水线核心
├── workflow.js         # 编排脚本（v008，1461 行）
├── judge.py            # 评分脚本
├── manifest.json       # 母版清单
└── prompts/            # 20 个提示词（00_spec + 01–18 + 00_master）

插件/                    # DSH 任务看板插件
└── dsh-plugin-authoring/
    ├── index.js        # 服务端入口
    ├── board-state.js  # 状态管理
    ├── client.jsx      # React 看板 UI
    ├── client.js       # 打包后的客户端
    └── package.json

docs/                    # 文档
├── 目录说明.md
├── 进度.md
├── 问题登记表.md
├── 看板使用说明.md
├── v006_卡2_编排层交接.md
└── v006_卡3_证据链交接.md

tasks/                   # 任务实例（.gitignore）
└── T-demo/             # 历史证据任务（冻结副本，仅 manifest + prompts）
```

## 19 节点流程

### A 批（00_spec + 01–07）
- **00_spec**：规范摘录 - 提取项目规范、职业树、平台字段、门槛条件
- **01_src**：素材采集 - 从权威来源抓取原文、计算 SHA-256、建立来源索引
- **02_scrub**：脱敏 - 映射敏感信息、检查残留
- **03_survey**：初勘 - 提出可用方向、证据支持度评估
- **04_scope**：定位 - 决定交付内容、业务字段、边界
- **05_evidence**：证据 - 难点清单、关系图、附件清单、字段口径
- **06_build**：附件制作 - 按清单生成全部附件（Excel/Word/PDF/图片）
- **07_metacheck**：元数据检查 - 校验附件制作痕迹与一致性

### B 批（08–12）
- **08_prompt**：题面 - 生成初版题面、字段映射
- **09_style**：润色 - 修正题面、字段映射差量、附件问题
- **10_difficulty**：难度诊断 - 九项标准评估难度
- **11_rubric**：考点标答 - 生成 rubric.json、B 附件索引、易错点
- **12_freeze**：冻结 - 冻结全部产物、生成运行契约

### C 批（13–16）
- **13_answer**：独立作答 - 隔离环境作答（只读冻结包，只写 output/）
- **14_score**：评分 - 用 judge.py 评分、隔离审计、补卷判定
- **15_review**：读卷 - 逐卷分析问题、汇总
- **16_qc**：质检 - 八项文件证据检查

### D 批（17–18）
- **17_pack**：打包 - 生成三个 zip（完整题包、仅模型输入、填写上传）
- **18_submit**：提交 - 最终字段映射、五项计数检查
- **18_rebuild_upload**：重建上传包 - 替换平台映射成员、重算 hash

## 安装与使用

### 1. 安装插件

**方法 1：通过 `link:` 引用（推荐）**

编辑 `~/.dsh/profiles/desktop/package.json`，添加：

```json
{
  "dependencies": {
    "dsh-plugin-authoring": "link:D:/高经出题流水线/插件/dsh-plugin-authoring"
  }
}
```

然后在 profile 目录执行：
```bash
pnpm install
```

编辑 `~/.dsh/profiles/desktop/cordis.patch.yml`，添加：

```yaml
- insert:
  - name: dsh-plugin-authoring
    config:
      root: D:\高经出题流水线
      templateDir: 母版
      maxTasks: 200
```

重启 DSH。

**方法 2：通过 npm 安装**

将 `插件/dsh-plugin-authoring` 发布到 npm 或私有 registry，然后：

```bash
cd ~/.dsh/profiles/desktop
pnpm add dsh-plugin-authoring
```

配置同上（`cordis.patch.yml`）。

### 2. 验证插件

打开 DSH，在侧边栏应该能看到"任务看板"按钮。点击后显示四栏看板（草稿/正在跑/已完成/异常中断）。

### 3. 开题

```javascript
// 在 DSH 会话里调用
authoring_init({
  industry: "金融服务",
  specPath: "D:\\字节项目\\高经济价值【八期】任务说明文档LANCER.V1_"
})
```

返回 `taskDir`（例如 `D:\高经出题流水线\tasks\T-20261106-03`）。

### 4. 按批执行

取得 workflow 脚本：

```javascript
authoring_script({
  taskId: "T-20261106-03",
  kind: "batch"
})
```

返回完整 `workflow.js` 原文及参数说明。

提交 workflow：

```javascript
workflow({
  args: {
    taskDir: "D:\\高经出题流水线\\tasks\\T-20261106-03",
    batch: "A",  // 或 B / C / D
    specPath: "D:\\字节项目\\高经济价值【八期】任务说明文档LANCER.V1_",
    industry: "金融服务"
  },
  meta: {
    name: "batch-a",
    description: "A批流水线：00_spec + 01–07"
  },
  script: "<从 authoring_script 获取的 workflow.js 完整内容>"
})
```

**执行顺序**：A → B → C → D，上一批通过再跑下一批。

### 5. 查看状态

```javascript
authoring_status({ taskId: "T-20261106-03" })
```

返回：
- 各节点产物文件
- 项目门槛
- 评分/隔离审计（C 批后）
- 补卷判定/汇总（C 批后）

或在任务看板里点击任务/节点，直接查看对应子代理会话。

## 核心特性

### 卡3 证据链（v008）
- **01 摘录一一对应**：来源索引 CSV 与原文摘录 `*.md` 的 `source_id` 必须一一对应，SHA-256 磁盘重算验证
- **02 逐来源脱敏映射**：每个 `source_id` 必须有独立的脱敏映射记录
- **05 D→来源/附件承载**：每个活跃难点必须关联 `source_id` 和 `carrier_attachment_id`
- **06 initial/repair 固定契约**：`mode=initial` 零 findings、`mode=repair` 只修复 findings 引用的文件
- **17→18 字段映射 roundtrip**：17 草案 → 18 最终映射，五项计数（total/ready/missing/invalid/not_applicable）内部一致
- **18 后重建上传包**：替换平台映射成员、成员集合不变、成员 hash 全部重算

### 编排返修链
- **07 元数据检查失败** → 06 repair → 07 重检（最多 2 轮）
- **09 润色失败** → 按 route 返修（04/08 字段映射，06 附件问题）
- **10 难度诊断失败** → 按 route 返修（05/06/08/11）
- **11 考点标答失败** → 按 `issue.owner_node` 返修（04/05/06/08/09/11）
- **12 冻结失败** → 按 route 返修（04/07/10/11/05/06/08/09）

全部返修限 2 轮；超过抛出异常停止。

### 任务看板插件
- **四栏布局**：草稿/正在跑/已完成/异常中断
- **20 节点 React Flow 画布**：5×4 布局，颜色表示状态（绿=已通过，红=失败，灰=待执行）
- **点节点打开子代理会话**：自动扫描 `~/.dsh/sessions` 映射会话 ID
- **会话跳转**：直接调用 `ctx.uiWorkspace.openSession({ parentSessionId, childSessionId, mode: 'continuable' })`

## 已验证项（2026-11-06）

### 插件
- [x] 服务端加载（`plugin_manager` 显示 active）
- [x] 看板 API 正常（`GET /api/authoring/board` HTTP 200）
- [x] 客户端 bundle 可执行（`node --check` 通过，导出 apply/inject）
- [x] UI 渲染（四栏看板、20 节点画布、节点点击跳转成功打开子会话）
- [x] 会话历史完整（点击后能看到完整对话、工具调用、token 统计）

### 流水线
- [x] 00_spec 产物（规范摘录.md 40893B、项目门槛.json 68287B）
- [x] 01_src 产物（素材清单.md、来源索引.csv、原文摘录/*.md 8个文件）
- [x] 01_src 门禁（`excerpts_one_to_one=true`、`excerpt_sha256_matches_index=true`、8 个 source_id 一一对应、SHA-256 全部 match）
- [ ] B/C/D 批（尚未跑通）

## 待验证项

- [ ] B 批完整执行（08–12）
- [ ] C 批完整执行（13–16，含隔离作答、评分、读卷、质检）
- [ ] D 批完整执行（17–18，含三个 zip 打包、字段映射、上传包重建）
- [ ] 返修链（09/10/11/12 的 route 返修）
- [ ] 补卷流程（C01 → C02）

## 模型配置

当前母版（v008）硬编码：

```javascript
const MODEL_PROVIDER = "magpie";
const MODEL = "auto/deepseek-v4.1-flash";
const MODEL_SPEC = "deepseek-v4.1-flash/max";
```

DSH workflow-ptc 0.2.2-rc.1 只接受 `provider`/`model`/`label`，不接受 `reasoningEffort`。脚本依赖部署的默认推理强度（max）。

## 技术栈

- **DSH**: DeepSeek Harness 0.2.2-rc.1（workflow guest 环境）
- **模型**: DeepSeek V4.1 Flash（通过 Magpie 路由）
- **插件**: Cordis 插件系统 + React 18 + @xyflow/react 12
- **语言**: JavaScript（workflow guest script）、Python 3.12（judge.py）、Node.js 20+（插件）

## 约束与限制

1. **workflow.js 不是 Node 程序**：它是 DSH workflow guest script，没有 `fs`/`process`/`require`/`import()`，必须在 `workflow` 工具的专有环境执行。
2. **不能断点续跑**：workflow 不支持暂停/恢复，必须按 A/B/C/D 四批执行；批内失败只能从头重跑该批。
3. **13 步隔离**：13_answer 只读项目外题包 `D:\高经作答区\<taskId>\<runId>\input\`、只写 `output\`，不能访问 `tasks/<taskId>` 或其他路径。
4. **14 步两阶段隔离审计**：precheck 写 `.host-audit` 临时审计 + `host_trace.json`；judge 成功后 finalize 归档 `隔离审计.json`；两阶段之间不能改文件。

## 许可

本项目供内部使用，不对外发布。包含的模型提示词、工作流脚本、评分脚本均为项目资产。

---

**最后更新**: 2026-11-06  
**版本**: v008  
**维护**: @大小姐
