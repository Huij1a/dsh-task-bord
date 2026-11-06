# 14 评分（判定节点）

## 任务

用冻结的考点给 13 的答卷打分。**只评分，不修改答卷，不修改考点。**

## 做法

1. 读 `artifacts/11_rubric/rubric.json`
2. 读 `artifacts/13_answer/` 下的答卷
3. 逐条判 TRUE / FALSE / MISSING（答卷里找不到该项）
4. 输出得分与失分明细

如果项目里有判定脚本（如 `judge.py`），直接执行；没有就用手工核对，但必须逐条给依据。

## 判定纪律

- 一条只判一件事，不看整体印象
- 答卷没提到的，判 FALSE 或 MISSING，不要推测它想表达什么
- 条件写在正文但明细违反的，判 FALSE
- 同一错误在多处重复出现，只扣一次（对应的那条考点）
- 答卷里的数值与标答差在容差内算 TRUE

## 输出

`artifacts/14_score/评分.json`：

```json
{"score": 41, "total": 100, "true": 25, "false": 20, "missing": 15,
 "pass": true,
 "detail": [{"id": 1, "status": "TRUE", "got": 2400, "expect": 2400, "note": ""}]}
```

## 判定

- score ≤ 50：难度达标，`pass: true`
- score > 50：不达标，需要回 05/08/11 改难度
