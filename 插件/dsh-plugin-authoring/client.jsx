/**
 * 出题看板客户端入口（未打包版本，需要 esbuild 打包）
 */
import React from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType } from '@xyflow/react';
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

/** 工作流画布（React Flow 可视化） */
function WorkflowCanvas({ task, onBack }) {
  const { nodes, edges } = React.useMemo(() => buildFlowGraph(task.nodes), [task.nodes]);
  
  const onNodeClick = React.useCallback((event, node) => {
    // 触发原 NodeRow 的 handleClick 逻辑
    console.log('[authoring-board] open node session:', task.taskId, node.id);
  }, [task.taskId]);

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    React.createElement(
      'div',
      { style: { padding: '1rem', borderBottom: '1px solid var(--dsw-alias-border-primary)' } },
      React.createElement(
        'button',
        { onClick: onBack, style: { padding: '0.5rem 1rem', cursor: 'pointer', marginRight: '1rem' } },
        '← 返回'
      ),
      React.createElement('span', { style: { fontSize: '1.25rem', fontWeight: 600 } }, task.taskId)
    ),
    React.createElement(
      'div',
      { style: { flex: 1, position: 'relative' } },
      React.createElement(ReactFlow, {
        nodes,
        edges,
        onNodeClick,
        fitView: true,
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: true,
        panOnScroll: true,
        zoomOnScroll: true,
        minZoom: 0.5,
        maxZoom: 1.5,
      }, [
        React.createElement(Background, { key: 'bg' }),
        React.createElement(Controls, { key: 'ctrl' })
      ])
    )
  );
}

/** 构建 React Flow 图结构 */
function buildFlowGraph(taskNodes) {
  const nodeSpacing = { x: 200, y: 100 };
  const nodesPerRow = 5;
  
  const nodes = taskNodes.map((node, index) => {
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;
    
    const statusColor = {
      pending: '#94a3b8',
      running: '#f59e0b',
      passed: '#10b981',
      failed: '#ef4444',
    }[node.status] || '#94a3b8';
    
    const statusBg = {
      pending: '#f1f5f9',
      running: '#fef3c7',
      passed: '#d1fae5',
      failed: '#fee2e2',
    }[node.status] || '#f1f5f9';

    return {
      id: node.name,
      type: 'default',
      position: { x: col * nodeSpacing.x, y: row * nodeSpacing.y },
      data: { label: node.name },
      style: {
        padding: '10px 15px',
        borderRadius: '6px',
        border: `2px solid ${statusColor}`,
        backgroundColor: statusBg,
        color: '#1e293b',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        minWidth: '120px',
        textAlign: 'center',
      },
    };
  });

  const edges = [];
  for (let i = 0; i < taskNodes.length - 1; i++) {
    edges.push({
      id: `e${i}-${i+1}`,
      source: taskNodes[i].name,
      target: taskNodes[i+1].name,
      type: 'smoothstep',
      animated: taskNodes[i].status === 'running',
      style: { stroke: '#64748b', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    });
  }

  return { nodes, edges };
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
