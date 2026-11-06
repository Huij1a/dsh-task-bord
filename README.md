# DSH 出题流水线任务看板

出题流水线的可视化任务看板，四栏布局 + 工作流画布 + 子代理会话跳转。

## 功能特性

- **四栏看板**：草稿、正在跑、已完成、异常中断
- **工作流可视化**：19 节点流程图（React Flow）
- **子代理会话跳转**：点击节点直接打开对应子代理会话
- **实时状态同步**：自动读取门禁结果和任务状态

## 插件结构

```
插件/dsh-plugin-authoring/
├── index.js           # DSH 插件入口（Node 端工具）
├── board-state.js     # 看板状态读取逻辑
├── client.jsx         # 浏览器端 UI（React + React Flow）
├── build-client.mjs   # esbuild 打包脚本
└── package.json       # 依赖配置
```

## 安装

1. 确保 DSH profile 的 `cordis.patch.yml` 包含：
```yaml
- insert:
    - name: dsh-plugin-authoring
      config:
        root: D:\高经出题流水线
        templateDir: 母版
        maxTasks: 200
```

2. 在 profile 的 `package.json` 添加依赖：
```json
{
  "dependencies": {
    "dsh-plugin-authoring": "file:D:/高经出题流水线/插件/dsh-plugin-authoring"
  }
}
```

3. 重启 DSH

## 开发

修改 `client.jsx` 后重新打包：

```bash
cd 插件/dsh-plugin-authoring
node build-client.mjs
```

## 技术栈

- **后端**：Node.js（纯内置模块，零依赖）
- **前端**：React 19 + React Flow 12
- **构建**：esbuild

## 出题流程

19 个节点按顺序执行：

1. `00_spec` - 读取项目规范
2. `01_src` - 摘录素材
3. `02_scrub` - 脱敏处理
4. `03_survey` - 初步勘测
5. `04_scope` - 确定交付规格
6. `05_evidence` - 构建证据链
7. `06_build` - 生成附件
8. `07_metacheck` - 元数据检查
9. `08_prompt` - 生成题面
10. `09_style` - 润色优化
11. `10_difficulty` - 难度标定
12. `11_rubric` - 生成标答和考点
13. `12_freeze` - 冻结题包
14. `13_answer` - 独立作答
15. `14_judge` - 自动评分
16. `15_review` - 人工读卷
17. `16_qc` - 质量检查
18. `17_pack` - 打包输出
19. `18_submit` - 提交交付

每个节点结束后写入 `artifacts/<节点>/_gate.json` 门禁结果。
