/**
 * 出题看板客户端入口（未打包版本，需要 esbuild 打包）
 */
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const BOARD_PANEL_ID = 'authoring-board';
const PANEL_ORDER = 25;

/** 看板主界面 */
function AuthoringBoard() {
  const [tasks, setTasks] = React.useState([]);
  const [selectedTask, setSelectedTask] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchBoard();
  }, []);

  async function fetchBoard() {
    try {
      const res = await fetch('/api/authoring/board');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error('[authoring-board] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return React.createElement('div', { style: { padding: '2rem' } }, '加载中...');
  }

  if (selectedTask) {
    return React.createElement(WorkflowCanvas, {
      task: selectedTask,
      onBack: () => setSelectedTask(null),
    });
  }

  return React.createElement(BoardColumns, { tasks, onSelectTask: setSelectedTask });
}

/** 四栏看板 */
function BoardColumns({ tasks, onSelectTask }) {
  const columns = [
    { key: 'draft', label: '草稿', status: 'draft' },
    { key: 'running', label: '正在跑', status: 'running' },
    { key: 'completed', label: '已完成', status: 'completed' },
    { key: 'failed', label: '异常中断', status: 'failed' },
  ];

  const byStatus = {};
  for (const col of columns) byStatus[col.status] = [];
  for (const task of tasks) {
    const list = byStatus[task.status];
    if (list) list.push(task);
  }

  return React.createElement(
    'div',
    { style: { display: 'flex', gap: '1rem', padding: '1rem', height: '100%', overflow: 'auto' } },
    ...columns.map((col) =>
      React.createElement(
        'div',
        { key: col.key, style: { flex: 1, minWidth: 0 } },
        React.createElement('h3', { style: { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 } }, col.label),
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } },
          ...byStatus[col.status].map((task) =>
            React.createElement(TaskCard, { key: task.taskId, task, onClick: () => onSelectTask(task) })
          )
        )
      )
    )
  );
}

/** 任务卡片 */
function TaskCard({ task, onClick }) {
  const statusDot = {
    draft: '⚪',
    running: '🟡',
    completed: '🟢',
    failed: '🔴',
  }[task.status] || '⚪';

  const passed = task.nodes.filter((n) => n.status === 'passed').length;
  const total = task.nodes.length;
  const summary = `${passed}/${total} 节点完成`;

  return React.createElement(
    'div',
    {
      onClick,
      style: {
        padding: '0.75rem',
        border: '1px solid var(--dsw-alias-border-primary)',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: 'var(--dsw-alias-bg-primary)',
      },
    },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' } },
      React.createElement('span', null, statusDot),
      React.createElement('span', { style: { fontWeight: 600, fontSize: '0.875rem' } }, task.taskId)
    ),
    React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--dsw-alias-label-tertiary)' } }, task.industry),
    React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--dsw-alias-label-secondary)', marginTop: '0.25rem' } }, summary)
  );
}

/** 工作流画布（暂时用简单列表，后续补 React Flow） */
function WorkflowCanvas({ task, onBack }) {
  return React.createElement(
    'div',
    { style: { padding: '1rem', height: '100%', overflow: 'auto' } },
    React.createElement(
      'button',
      { onClick: onBack, style: { marginBottom: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' } },
      '← 返回'
    ),
    React.createElement('h2', { style: { margin: '0 0 1rem', fontSize: '1.25rem' } }, task.taskId),
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } },
      ...task.nodes.map((node) => React.createElement(NodeRow, { key: node.name, node, taskId: task.taskId }))
    )
  );
}

/** 节点行 */
function NodeRow({ node, taskId }) {
  const statusColor = {
    pending: '#999',
    running: '#f59e0b',
    passed: '#10b981',
    failed: '#ef4444',
  }[node.status] || '#999';

  const summary = node.failures.length > 0 ? node.failures[0] : node.summary || '待运行';

  function handleClick() {
    // 后续补：打开子代理会话
    console.log('[authoring-board] open node session:', taskId, node.name);
  }

  return React.createElement(
    'div',
    {
      onClick: handleClick,
      style: {
        padding: '0.75rem',
        border: '1px solid var(--dsw-alias-border-primary)',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: 'var(--dsw-alias-bg-primary)',
      },
    },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
      React.createElement('span', { style: { color: statusColor } }, '●'),
      React.createElement('span', { style: { fontWeight: 600, fontSize: '0.875rem' } }, node.name)
    ),
    React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--dsw-alias-label-secondary)', marginTop: '0.25rem' } }, summary)
  );
}

/** 看板图标 */
function BoardPanelIcon({ size }) {
  return React.createElement(
    'svg',
    {
      'data-dsh-panel-entry': BOARD_PANEL_ID,
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.3',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('rect', { x: '2', y: '2.5', width: '12', height: '11', rx: '1.5' }),
    React.createElement('path', { d: 'M2 6.5h12M6.5 6.5v7M10.5 6.5v7' })
  );
}

/** 注册看板面板 */
function registerBoardPanel(ctx) {
  const slots = ctx.slots;
  const disposers = [];

  disposers.push(
    slots.inject('sidebar.panellist', () =>
      slots.register(
        {
          name: 'sidebar.panellist',
          id: BOARD_PANEL_ID,
          order: PANEL_ORDER,
          label: () => '出题看板',
        },
        BoardPanelIcon
      )
    )
  );

  disposers.push(
    slots.inject('main', () =>
      slots.register(
        {
          name: 'main',
          key: BOARD_PANEL_ID,
          inject: () => ({}),
        },
        () => React.createElement(ReactFlowProvider, null, React.createElement(AuthoringBoard))
      )
    )
  );

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}

export const inject = ['slots'];

export function apply(ctx) {
  ctx.effect(() => registerBoardPanel(ctx), 'authoring-board: register panel');
}
