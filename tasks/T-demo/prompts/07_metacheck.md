# 07 元数据检查（判定节点）

## 任务

检查 `artifacts/06_wps/` 下所有 Office 文件的元数据与制作痕迹。**只读，不修改任何文件。**

## 检查项

1. `docProps/core.xml`：creator / lastModifiedBy 是否为工具名（OfficeCLI、python-docx、openpyxl、WPS 默认值）
2. `docProps/app.xml`：Application / Company 是否暴露生成工具
3. 自定义属性 `docProps/custom.xml`
4. 正文/页眉/页脚/批注/备注里是否残留"AI生成""模拟材料""教师专用""出题""python"等字样
5. 是否有指向本机路径的链接（`file://`、`C:\`、`sandbox:`）
6. 隐藏工作表、隐藏行列、修订痕迹

## 输出

只输出一个 JSON 文件 `artifacts/07_metacheck/result.json`：

```json
{"pass": false, "checked": 13,
 "findings": [{"file": "A01_xxx.xlsx", "part": "docProps/core.xml",
               "field": "creator", "value": "OfficeCLI", "fix": "改为业务岗位署名或清空"}]}
```

## 判定

- 任一文件 creator/lastModifiedBy 是工具名 → `pass: false`
- 正文出现制作痕迹字样 → `pass: false`
- 只有本机路径链接 → `pass: false`
- 全部干净 → `pass: true`

## 禁止

不要自己改文件、不要重新生成附件。修由 06 负责。
