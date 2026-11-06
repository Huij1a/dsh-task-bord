# dsh-task-board

通用的 DSH 任务看板 + 工作流画布插件

## 功能

### 任务看板
- **四栏布局**：草稿、正在跑、已完成、异常中断
- 自动读取任务目录的 `manifest.json` 和产物门禁
- 支持自定义任务根目录和节点配置

### 工作流画布
- React Flow 可视化流程图
- 节点状态实时同步（pending/running/passed/failed）
- 节点间连线自动生成，running 状态带动画效果
- 支持缩放、平移和自动适配视口

### 子代理会话跳转
- 点击节点打开对应子代理会话
- 支持 `continuable` 模式，可继续对话
- 自动读取 `_session.json` 获取会话 ID

## 设计理念

这是一个**通用的任务看板插件**，不绑定特定业务场景。它通过读取任务目录的标准化文件结构来展示状态：

```
tasks/<任务ID>/
├── manifest.json           # 任务元信息（必需）
├── artifacts/<节点>/
│   ├── _gate.json         # 门禁结果（必需）
│   └── _session.json      # 会话 ID（可选）
└── ...
```

只要你的 workflow 按这个结构输出产物，看板就能自动工作。

## 使用场景

- ✅ 多节点 workflow 执行监控
- ✅ 子代理编排可视化
- ✅ 长时间运行任务的进度追踪
- ✅ 团队协作的任务状态共享

**我们用它来做什么**：19 节点出题流水线的任务监控

**你可以用它来做什么**：
- 数据处理流水线
- 多阶段测试任务
- 文档生成 workflow
- 任何需要可视化多节点执行状态的场景

## 配置

### 插件配置（cordis.patch.yml）

```yaml
- insert:
  - name: dsh-plugin-authoring
    config:
      # 任务根目录（包含 tasks/ 子目录）
      root: D:\你的项目目录
      
      # 模板目录（可选，用于 authoring_init 工具）
      templateDir: 母版
      
      # 最大任务数量（看板列表上限）
      maxTasks: 200
      
      # 节点名称列表（自定义你的 workflow 节点）
      nodes:
        - node_01
        - node_02
        - node_03
```

### 数据格式

#### manifest.json（必需）

```json
{
  "taskId": "task-001",
  "title": "任务标题",
  "description": "任务描述",
  "industry": "分类标签"  // 可选，用于看板展示
}
```

#### _gate.json（必需）

每个节点执行后写入 `artifacts/<节点>/_gate.json`：

```json
{
  "ok": true,
  "pass": true,           // true=通过, false=失败, null/undefined=运行中
  "failures": [],         // 失败原因列表
  "summary": "节点摘要"
}
```

#### _session.json（可选）

如果需要会话跳转功能，写入 `artifacts/<节点>/_session.json`：

```json
{
  "childSessionId": "会话ID",
  "parentSessionId": "父会话ID",  // 可选
  "timestamp": "2026-11-06T08:00:00Z"
}
```

## 安装

### 1. 安装依赖

```bash
cd 插件/dsh-plugin-authoring
pnpm install
```

### 2. 构建客户端

```bash
pnpm run build
```

### 3. 安装到 DSH profile

```bash
cd "C:\Users\Administrator\.dsh\profiles\desktop"
pnpm add "file:D:/你的项目目录/插件/dsh-plugin-authoring"
```

### 4. 配置插件

编辑 `cordis.patch.yml`，添加插件配置（见上文）。

### 5. 重启 DSH

## 开发

### 目录结构

```
插件/dsh-plugin-authoring/
├── index.js              # 服务端插件入口
├── board-state.js        # 看板状态读取逻辑
├── client.jsx            # 客户端 UI (React + React Flow)
├── client.css            # 客户端样式
├── build-client.mjs      # esbuild 构建脚本
├── package.json          # 插件配置
└── README.md             # 本文件
```

### 修改客户端代码后

```bash
pnpm run build
```

然后在 DSH 中刷新页面（Ctrl+R）。

### 修改服务端代码后

重新安装插件并重启 DSH：

```bash
cd "C:\Users\Administrator\.dsh\profiles\desktop"
pnpm add "file:D:/你的项目目录/插件/dsh-plugin-authoring" --force
# 然后重启 DSH
```

## API

### 服务端接口

**GET /api/authoring/board**

返回格式：

```json
{
  "tasks": [
    {
      "taskId": "task-001",
      "industry": "分类标签",
      "status": "running",  // draft | running | completed | failed
      "nodes": [
        {
          "name": "node_01",
          "status": "passed",  // pending | running | passed | failed
          "pass": true,
          "failures": [],
          "summary": "节点摘要",
          "sessionId": "会话ID"  // 可能为 null
        }
      ]
    }
  ]
}
```

### 客户端组件

- `BoardView` - 四栏看板主视图
- `WorkflowCanvas` - React Flow 工作流画布
- `buildFlowGraph` - 构建 React Flow 图结构

## 扩展

### 自定义节点渲染

修改 `client.jsx` 的 `buildFlowGraph` 函数，自定义节点的位置、样式和数据。

### 自定义看板分栏逻辑

修改 `board-state.js` 的状态判断逻辑，改变任务如何归类到四个栏。

### 添加自定义工具

在 `index.js` 中添加新的工具定义，通过 `ctx.tools.register` 注册。

## 依赖

- `@xyflow/react@^12.3.5` - React Flow 工作流可视化
- `esbuild@^0.24.2` - 客户端构建

DSH 提供的 external 依赖：
- `react` / `react-dom` / `react/jsx-runtime`
- `@deepseek-ai/dsh-client-ui-*`

## 许可

MIT
