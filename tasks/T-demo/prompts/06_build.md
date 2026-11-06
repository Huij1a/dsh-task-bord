# 06 附件制造

## 任务

按 05 的附件清单，造出全部输入附件（A 系列）。用 `officecli` 和 Python 生成，不用手写。

## 工具

```bash
officecli create A01_xxx.xlsx
officecli batch A01_xxx.xlsx --input cmds.json     # 批量加 sheet/cell/formula/格式
officecli validate A01_xxx.xlsx
officecli add A13_xxx.docx / --type markdown --prop src=src.md   # Markdown 转原生 Word
```

- xlsx：cell 支持 `value`/`formula`/`numberformat`，写公式会自动求值
- docx：先写 Markdown（含 GFM 表格），再 `--type markdown` 展开成原生 Word
- PDF：`reportlab` 直出，或用 WPS COM 导出

## 制造纪律

1. **数据必须程序生成**：几千行明细靠脚本保证自洽，手写必错。
2. 每份附件先想清"谁产生它、字段为什么长这样"，再决定列名。
3. 埋错点必须落在**明细行**上，不能写在说明里。
4. 不要在附件里写"注意""不要""正确做法"。
5. 生成后立刻校验：行数、主键唯一、跨表勾稽、公式可算。

## 输出

- `artifacts/06_wps/A*.xlsx`、`A*.docx`、`A*.pdf`
- `artifacts/06_wps/制造记录.md`：每份文件的行数、字段、校验结果
- `artifacts/06_wps/build_*.py`：生成脚本（保留可复现）

## 硬要求

- 文件能打开、能读、字段非空。
- 数字要能对上：主表行数 = 各分类之和；金额 = 明细求和。
- 不要留 officecli 默认的 `OfficeCLI` 作者名（07 会查）。
