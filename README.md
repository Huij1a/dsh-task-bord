# dsh-task-board

通用的 DSH 任务看板 + 工作流画布插件

## 这是什么

一个通用的任务看板插件，用于可视化多节点 workflow 的执行状态。

**功能特性**：
- 四栏看板（草稿、正在跑、已完成、异常中断）
- React Flow 工作流画布（节点状态实时同步）
- 子代理会话跳转（点击节点直接打开对应会话）

**我们用它来做什么**：监控 19 节点出题流水线的执行状态

**你可以用它来做什么**：任何需要可视化多节点 workflow 执行状态的场景（数据处理、测试任务、文档生成等）

## 快速开始

### 1. 安装插件

```bash
cd 插件/dsh-plugin-authoring
pnpm install && pnpm run build

cd "C:\Users\Administrator\.dsh\profiles\desktop"
# 在 profile 的 package.json 里加软链，开发时改源码立即生效
# "dsh-plugin-authoring": "link:D:/你的项目目录/插件/dsh-plugin-authoring"
pnpm install
```

### 2. 配置插件

编辑 `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`：

```yaml
- insert:
  - name: dsh-plugin-authoring
    config:
      root: D:\你的项目目录
      templateDir: 母版
      maxTasks: 200
```

### 3. 热加载

DSH 会监听 profile 配置变化并自动热加载，侧边栏出现"任务看板"入口即可使用，无需重启。

## 数据格式

看板通过读取标准化的文件结构来展示状态：

```
tasks/<任务ID>/
├── manifest.json           # 任务元信息
└── artifacts/<节点>/
    └── _gate.json         # 门禁结果（必需）
```

节点对应的子代理会话从父会话事件流自动解析，不需要额外文件。只要你的 workflow 按这个结构输出产物，看板就能自动工作。详见 [插件/dsh-plugin-authoring/README.md](插件/dsh-plugin-authoring/README.md)。

## 项目结构

```
.
├── 插件/dsh-plugin-authoring/    # 通用任务看板插件
│   ├── index.js                  # DSH 插件入口
│   ├── board-state.js            # 看板状态读取
│   ├── client.jsx                # 客户端 UI
│   └── README.md                 # 插件文档
│
├── 母版/                         # 我们的出题 workflow 模板
│   ├── workflow.js               # 19 节点编排脚本
│   ├── prompts/                  # 节点提示词
│   └── ...
│
├── tasks/                        # 任务实例（看板数据源）
│   └── <任务ID>/
│       ├── manifest.json
│       └── artifacts/
│
└── docs/                         # 项目文档
```

## 开发

- [插件开发文档](插件/dsh-plugin-authoring/README.md) - 插件 API 和扩展指南
- [看板使用说明](docs/看板使用说明.md) - 用户指南和故障排查

## 技术栈

- **前端**：React + React Flow
- **后端**：DSH 插件（Node.js）
- **构建**：esbuild

## 许可

MIT
