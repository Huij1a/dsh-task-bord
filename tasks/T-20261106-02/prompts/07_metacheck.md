# 07 元数据检查（判定节点）

## 前置读取

读取 `artifacts/00_spec/项目门槛.json`、`artifacts/00_spec/规范摘录.md`、05 的 `附件清单.json`、`artifacts/06_build/附件事实快照.json` 和 `artifacts/06_build/校验报告.json`，核对声明、快照与实际文件三者一致。项目门槛、05 canonical 清单、06 校验报告或附件快照缺失、不可解析时直接判失败。

## 任务

检查 `artifacts/06_build/` 下所有 Office 文件和 PDF 的元数据与制作痕迹。**只读，不修改任何文件。**

## 检查项

1. 枚举 `artifacts/06_build/` 的最终附件文件，并与 05 `附件清单.json`、06 `附件事实快照.json`、06 `校验报告.json` 对账。缺文件、多文件、文件名/格式与 05 不一致或任一份报告未覆盖的文件都记 finding。`build_*.py`、`制造记录.md`、两份机器报告是 06 的辅助产物，不当作业务附件；同一路径只按一个角色登记。
2. Office OOXML（`.docx/.xlsx/.pptx`）逐文件读取：
   - `docProps/core.xml`：`creator`、`lastModifiedBy`
   - `docProps/app.xml`：**必须实际读取 `Application` 和 `Company` 的原始值**，不得只看文件是否存在
   - `docProps/custom.xml`：自定义属性名和值
3. PDF 逐文件读取可获得的 `Author`、`Creator`、`Producer` 等元数据。
4. 通用工具名黑名单（大小写不敏感，包含即命中）：`OfficeCLI`、`python-docx`、`openpyxl`、`xlsxwriter`、`WPS`、`LibreOffice`、`reportlab`、`Aspose`、`Apache POI`。
5. 正文、页眉、页脚、批注、备注、文档属性中是否残留 `AI生成`、`模拟材料`、`教师专用`、`出题`、`python` 等制作痕迹字样。
6. 是否含指向本机路径的链接：`file://`、盘符绝对路径、`sandbox:`。
7. 对可能暴露生成过程的隐藏项逐项取证：xlsx 的隐藏工作表、隐藏行列、`xl/calcChain.xml` 与不再被引用的 `xl/sharedStrings.xml` 残留；docx 的修订痕迹和批注作者；PDF 的隐藏层或附件。只有这些对象携带工具/制作痕迹、未清理内容或与业务结构不一致时才失败；正常业务隐藏项不得只因“隐藏”就误杀，finding 必须写实际证据和业务合理性判断。
8. 06 `校验报告.json` 中声称通过的检查是否能从实际文件和记录复核；复核不一致时判失败。

## 输出

只输出一个 JSON 文件 `artifacts/07_metacheck/result.json`，顶层 `pass` 必须是布尔值。必须逐文件记录检查证据，不能只写总数：

```json
{
  "pass": false,
  "checked": 1,
  "files": [
    {
      "file": "<附件文件名>",
      "format": "<xlsx|docx|pdf>",
      "sha256": "<对当前实际附件重算的64位小写sha256>",
      "inspection_status": "checked",
      "core": {"creator": "<原始值或null>", "lastModifiedBy": "<原始值或null>"},
      "app": {"Application": "<原始值或null>", "Company": "<原始值或null>"},
      "custom": [],
      "pdf": {"Author": "<原始值或null>", "Creator": "<原始值或null>", "Producer": "<原始值或null>"},
      "findings": []
    }
  ],
  "findings": [
    {
      "finding_id": "07#1",
      "file": "<附件文件名>",
      "part": "<docProps/app.xml 等具体位置>",
      "field": "<Application 等字段>",
      "value": "<实际读取值>",
      "reason": "<命中规则>",
      "fix": "<06 应执行的具体修复>"
    }
  ]
}
```

不适用的块使用 `null` 或空数组，不得伪造字段值。例如 PDF 没有 `docProps/app.xml` 时，`app` 必须为 `null`，不能写成已检查且干净。

`findings` 每条必须有唯一 `finding_id`：`07#<n>`（n 为 findings 数组 1-based 序号）或稳定业务 ID；06 repair 会原样引用，不得重复或留空。

## 判定

- 任一文件 `sha256` 缺失、不是 64 位小写十六进制，或与实际附件重算值不一致 → `pass: false`。
- 任一文件 `creator`、`lastModifiedBy`、`Application`、`Company`、PDF `Author/Creator/Producer` 的值或含值片段命中工具名黑名单 → `pass: false`。
- Office OOXML 的 `Application` 无法读取、`app.xml` 缺失或 `inspection_status` 不是 `checked` → `pass: false`，并单列无法核验原因。PDF 不要求存在 `app.xml`，但 PDF 可读取的元数据必须实际检查，读取失败同样判失败。
- 正文中的工具词只有结合上下文能证明是制作痕迹时才记 finding；正常业务正文合法提到某个工具名时，应保留原文并写明为何不判为生成痕迹。
- 正文或文档属性出现制作痕迹字样 → `pass: false`。
- 存在本机路径链接、隐藏内容或修订痕迹暴露生成过程 → `pass: false`。
- 06 报告与实际文件不一致 → `pass: false`。
- 每个实际附件都已逐项检查、证据落盘、且没有 finding → 才可 `pass: true`。

## 禁止

- 不要自己改文件、不要重新生成附件、不要删除 finding。修复由 06 负责，修完必须重跑本节点。
- 不得因为文件名像业务附件、06 报告写了通过或抽查了一部分，就声称所有文件已检查。
- 不得伪造 `Application`、元数据值、检查数量或正文扫描结果；无法读取就如实记 `inspection_status: "unreadable"` 并判失败。

## 最终回复

文件落盘后，最终回复只给结论摘要；最后一行必须输出与 `result.json` 顶层 `pass` 完全一致的单行 JSON，例如 `{"pass":false}` 或 `{"pass":true}`。不要在 JSON 前后添加 Markdown 代码围栏、句号或其他文本；无法解析时视为本节点不通过。
