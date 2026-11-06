# dsh-task-board

通用的 DSH 任务看板 + 工作流画布插件。

## 功能

### 四栏看板
- 草稿 / 正在跑 / 已完成 / 异常中断
- 自动读取 `tasks/<任务ID>/manifest.json` 与 `artifacts/<节点>/_gate.json`
- 每张任务卡显示任务号、行业、20 段节点进度条、相对更新时间
- 5 秒轮询刷新

### 工作流画布
- React Flow 画布，20 个节点蛇形布局（5×4）
- 节点状态着色：待执行 / 运行中 / 已通过 / 失败
- 缩放、平移、自动适配视口

### 点节点打开子代理会话
- 会话映射自动从父会话事件流 `tool-workflow/agent-start` 解析，无需节点自己写 `_session.json`
- 点击节点先加载父会话，再以 `continuable` 模式打开对应的子代理会话，可以直接继续对话

## 数据来源

```
tasks/<任务ID>/
├── manifest.json               # 任务元信息（必需）
└── artifacts/<节点>/
    └── _gate.json             # 门禁结果（必需）
```

节点状态判定优先级：

1. `_gate.json` 的 `conditions`：全 true → 已通过；有 false → 失败
2. 没有 `_gate.json` 时，按会话事件流里的 `tool-workflow/agent-end`：`completed` → 通过，`failed` / `cancelled` → 失败，没有结束事件 → 运行中

任务状态：有失败节点 → 异常中断；20 个节点全部通过 → 已完成；有节点启动 → 正在跑；否则 → 草稿。

## 配置

```yaml
- insert:
    - name: dsh-plugin-authoring
      config:
        root: D:\你的项目目录    # 包含 tasks/ 子目录
        templateDir: 母版        # authoring_init 用的模板目录
        maxTasks: 200
```

可选配置：`sessionsDir`（默认 `~/.dsh/sessions`）、`answerRoot`（默认 `D:\高经作答区`）、`isolationAllowPaths`。

## 安装

```bash
cd 插件/dsh-plugin-authoring
pnpm install          # 安装 esbuild / @xyflow/react 等开发依赖
pnpm run build        # 生成 client.js（已提交，可跳过）
```

在 DSH profile 的 `package.json` 里声明本地软链（开发时改源码立即生效）：

```json
"dsh-plugin-authoring": "link:D:/你的项目目录/插件/dsh-plugin-authoring"
```

然后 `pnpm install`，DSH 会自动热加载，无需重启。

## 开发

### 目录结构

```
插件/dsh-plugin-authoring/
├── index.js            # 服务端插件入口（工具 + /api/authoring/board）
├── board-state.js      # 看板数据：tasks + artifacts + 会话事件流
├── client.jsx          # 客户端 UI（React + React Flow）
├── client.css          # 客户端样式（DSH 设计令牌）
├── styles.gen.js       # 构建时由 client.css 生成，勿手改
├── build-client.mjs    # esbuild 构建脚本
├── client.js           # 构建产物，DSH 浏览器端实际加载
└── package.json
```

### 客户端打包格式（重要）

DSH 浏览器端插件不是普通 ESM，必须打成：

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-authoring",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // ...CJS 代码，通过 require("react") 取平台模块...
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
```

`build-client.mjs` 已处理：esbuild 输出 CJS → 套 ModuleLoader 壳 → 把 `client.css` 与 React Flow 基础样式以字符串形式注入。

### 改代码后

- 客户端：`pnpm run build`，DSH 客户端会自动重载
- 服务端：DSH 的 HMR 会监听 profile 的 `cordis.patch.yml` / `package.json`；改完源码后 touch 一下 `cordis.patch.yml` 即可热重载
- `board-state.js` 采用 mtime 缓存穿透导入，改完下次请求即生效

## API

**GET /api/authoring/board**

```json
{
  "tasks": [
    {
      "taskId": "T-20261106-03",
      "industry": "金融服务/银行、支付与消费金融",
      "status": "running",
      "passed": 2,
      "failed": 0,
      "total": 20,
      "nodes": [
        {
          "name": "00_spec",
          "label": "规范",
          "batch": "A",
          "index": 0,
          "status": "passed",
          "outcome": "completed",
          "summary": "",
          "failures": [],
          "sessionId": "838b2200-205d-4d20-be96-45381b1915df",
          "parentSessionId": "session-64245646-3abc-47cd-b91f-9b1fa3100269",
          "startedAt": 1793938297719
        }
      ]
    }
  ],
  "nodes": ["..."],
  "generatedAt": 1793957000000
}
```

## 依赖

- `@xyflow/react` — 工作流画布
- `esbuild` — 客户端打包

React / React DOM 由 DSH 宿主提供（`factory(require)` 的 require 可直接取）。
