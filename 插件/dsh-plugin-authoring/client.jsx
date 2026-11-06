/**
 * 任务看板客户端（浏览器侧）。
 *
 * 打包约束：DSH 的浏览器插件必须是 `window.__ModuleLoader__.load({ id, factory })`
 * 的 lazy-CJS 形态，`factory(require)` 里才能 require("react")。构建脚本
 * build-client.mjs 负责把本文件打成 CJS 再套上这层壳。
 */
import React from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
} from '@xyflow/react';
import xyflowStyles from '@xyflow/react/dist/style.css';
import styles from './styles.gen.js';

const PANEL_ID = 'authoring-board';
const PANEL_ORDER = 25;
const POLL_MS = 5000;

const STATUS_LABEL = {
  draft: '草稿',
  running: '正在跑',
  completed: '已完成',
  failed: '异常中断',
};

const NODE_STATUS_LABEL = {
  pending: '待执行',
  running: '运行中',
  passed: '已通过',
  failed: '失败',
};

let pluginCtx = null;

function injectStyles() {
  const existing = document.querySelector('style[data-plugin="dsh-plugin-authoring"]');
  if (existing) return () => {};
  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-plugin-authoring';
  tag.textContent = `${xyflowStyles}\n${styles}`;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

async function fetchBoard() {
  const response = await fetch(`/api/authoring/board?t=${Date.now()}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - Number(value);
  if (!Number.isFinite(diff) || diff < 0) return '';
  const minute = 60 * 1000;
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
}

function StatusDot({ status }) {
  return <span className={`ab-dot ab-dot--${status}`} aria-hidden="true" />;
}

function BoardIcon({ size = 16 }) {
  return (
    <svg
      data-dsh-panel-entry={PANEL_ID}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <path d="M4.6 6h2.2M4.6 9h2.2M9.2 6h2.2M9.2 9h2.2" />
    </svg>
  );
}

function useBoardData() {
  const [data, setData] = React.useState({ tasks: [], loading: true, error: null });

  const load = React.useCallback(async (silent) => {
    try {
      const payload = await fetchBoard();
      setData({ tasks: payload.tasks || [], loading: false, error: null });
    } catch (error) {
      setData((previous) => ({
        tasks: silent ? previous.tasks : [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  React.useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { ...data, reload: () => load(false) };
}

function BoardPage() {
  const { tasks, loading, error, reload } = useBoardData();
  const [selectedId, setSelectedId] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const toastTimer = React.useRef(null);

  const notify = React.useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const selected = tasks.find((task) => task.taskId === selectedId) || null;

  return (
    <div className="ab-root">
      {selected ? (
        <TaskCanvas task={selected} onBack={() => setSelectedId(null)} onRefresh={reload} notify={notify} />
      ) : (
        <BoardHome tasks={tasks} loading={loading} error={error} onRefresh={reload} onSelect={setSelectedId} />
      )}
      {toast ? <div className="ab-toast">{toast}</div> : null}
    </div>
  );
}

function BoardHome({ tasks, loading, error, onRefresh, onSelect }) {
  const columns = [
    { key: 'draft', label: '草稿', hint: '还没开始' },
    { key: 'running', label: '正在跑', hint: '有节点在跑' },
    { key: 'completed', label: '已完成', hint: '全流程通过' },
    { key: 'failed', label: '异常中断', hint: '需要处理' },
  ];
  const grouped = { draft: [], running: [], completed: [], failed: [] };
  for (const task of tasks) {
    (grouped[task.status] || grouped.draft).push(task);
  }

  const running = grouped.running.length;
  const total = tasks.length;

  return (
    <>
      <header className="ab-header">
        <div className="ab-header-text">
          <div className="ab-title">任务看板</div>
          <div className="ab-subtitle">
            {loading && !total ? '加载中…' : `${total} 个任务${running ? ` · ${running} 个正在跑` : ''}`}
          </div>
        </div>
        <div className="ab-header-actions">
          <button type="button" className="ab-btn" onClick={onRefresh}>
            刷新
          </button>
        </div>
      </header>
      {error ? <div className="ab-error">看板数据读取失败：{error}</div> : null}
      <div className="ab-board">
        {columns.map((column) => (
          <section className="ab-column" key={column.key}>
            <div className="ab-column-head">
              <StatusDot status={column.key} />
              <span className="ab-column-title">{column.label}</span>
              <span className="ab-column-count">{grouped[column.key].length}</span>
            </div>
            <div className="ab-column-body">
              {grouped[column.key].length === 0 ? (
                <div className="ab-empty">{column.hint}</div>
              ) : (
                grouped[column.key].map((task) => (
                  <TaskCard key={task.taskId} task={task} onClick={() => onSelect(task.taskId)} />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function TaskCard({ task, onClick }) {
  return (
    <button type="button" className={`ab-card ab-card--${task.status}`} onClick={onClick}>
      <div className="ab-card-head">
        <StatusDot status={task.status} />
        <span className="ab-card-id">{task.taskId}</span>
        <span className="ab-card-arrow">→</span>
      </div>
      <div className="ab-card-industry" title={task.industry}>
        {task.industry || '未填写行业'}
      </div>
      <div className="ab-segs" aria-hidden="true">
        {task.nodes.map((node) => (
          <span key={node.name} className={`ab-seg ab-seg--${node.status}`} title={`${node.label} ${NODE_STATUS_LABEL[node.status]}`} />
        ))}
      </div>
      <div className="ab-card-foot">
        <span>
          {task.passed}/{task.total} 节点
        </span>
        <span>{relativeTime(task.updatedAt)}</span>
      </div>
    </button>
  );
}

function FlowNode({ data }) {
  return (
    <div className={`ab-node ab-node--${data.status}`}>
      <Handle type="target" position={Position.Top} className="ab-handle" />
      <div className="ab-node-top">
        <span className="ab-node-index">{String(data.index).padStart(2, '0')}</span>
        <span className={`ab-node-status ab-node-status--${data.status}`}>{NODE_STATUS_LABEL[data.status]}</span>
      </div>
      <div className="ab-node-label">{data.label}</div>
      <div className="ab-node-name">{data.name}</div>
      <Handle type="source" position={Position.Bottom} className="ab-handle" />
    </div>
  );
}

const NODE_TYPES = { authoringNode: FlowNode };

function buildFlowGraph(taskNodes) {
  const perRow = 5;
  const gapX = 212;
  const gapY = 118;
  const nodes = taskNodes.map((node, index) => {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    return {
      id: node.name,
      type: 'authoringNode',
      position: {
        x: (row % 2 === 0 ? column : perRow - 1 - column) * gapX,
        y: row * gapY,
      },
      data: node,
    };
  });
  const edges = [];
  for (let index = 0; index < taskNodes.length - 1; index += 1) {
    edges.push({
      id: `edge-${index}`,
      source: taskNodes[index].name,
      target: taskNodes[index + 1].name,
      type: 'straight',
      animated: taskNodes[index + 1].status === 'running',
    });
  }
  return { nodes, edges };
}

function TaskCanvas({ task, onBack, onRefresh, notify }) {
  const { nodes, edges } = React.useMemo(() => buildFlowGraph(task.nodes), [task.nodes]);

  const openSession = React.useCallback(
    (node) => {
      if (!node.sessionId) {
        notify(`${node.label}（${node.name}）还没有运行记录`);
        return;
      }
      const workspace = pluginCtx && typeof pluginCtx.get === 'function' ? pluginCtx.get('uiWorkspace') : null;
      if (!workspace || typeof workspace.openSession !== 'function') {
        notify('当前版本不支持打开子代理会话');
        return;
      }
      try {
        const address = {
          parentSessionId: node.parentSessionId,
          childSessionId: node.sessionId,
          mode: 'continuable',
        };
        if (node.parentSessionId) {
          // 先把父会话加载为在线会话，否则子代理会话会以「父会话不在线」只读打开。
          workspace.openSession(node.parentSessionId);
          window.setTimeout(() => {
            try {
              workspace.openSession(address);
            } catch (error) {
              notify(`打开会话失败：${error instanceof Error ? error.message : String(error)}`);
            }
          }, 150);
          return;
        }
        workspace.openSession(address);
      } catch (error) {
        notify(`打开会话失败：${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [notify]
  );

  return (
    <div className="ab-canvas-page">
      <header className="ab-canvas-head">
        <button type="button" className="ab-back" onClick={onBack} aria-label="返回看板">
          ←
        </button>
        <div className="ab-canvas-title">
          <div className="ab-canvas-id">{task.taskId}</div>
          <div className="ab-canvas-meta">{task.industry}</div>
        </div>
        <span className={`ab-badge ab-badge--${task.status}`}>
          <StatusDot status={task.status} />
          {STATUS_LABEL[task.status]}
        </span>
        <div className="ab-canvas-progress">
          {task.passed}/{task.total} 节点
        </div>
        <button type="button" className="ab-btn" onClick={onRefresh}>
          刷新
        </button>
      </header>
      <div className="ab-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_event, node) => openSession(node.data)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.3}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1.4} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="ab-canvas-hint">点节点打开对应子代理会话，可直接继续对话</div>
    </div>
  );
}

function registerBoardPanel(ctx) {
  const disposers = [];
  disposers.push(
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: '任务看板',
        },
        BoardIcon
      )
    )
  );
  disposers.push(
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: PANEL_ID,
        },
        () => (
          <ReactFlowProvider>
            <BoardPage />
          </ReactFlowProvider>
        )
      )
    )
  );
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        // 注册清理失败不影响其它槽位
      }
    }
  };
}

export const inject = ['slots'];

export function apply(ctx) {
  pluginCtx = ctx;
  ctx.effect(() => injectStyles(), 'authoring-board: styles');
  ctx.effect(() => registerBoardPanel(ctx), 'authoring-board: panel');
}
