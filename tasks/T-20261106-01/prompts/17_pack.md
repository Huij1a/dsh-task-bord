# 17 打包交付

## 任务

按显式白名单打包。只从指定源文件取件，禁止遍历整个题目录后“顺手打包”。本节点只写 `artifacts/17_pack/`；平台字段映射在本节点生成 canonical 草案（元数据逐字来自 00，值留空、状态 `pending_18`），最终取值与 NA 判定由 18 在草案基线上回填。

## 输入

1. `artifacts/12_freeze/frozen/项目门槛.json`：读取 `platform_fields`、`task_types`、`industry_tree`、`occupation_tree`、`forbidden`、`deadlines`、`quality_gates`、`attachment_policy` 及 `extraction_status`。
2. `artifacts/12_freeze/frozen/交付规格.json`
3. `artifacts/12_freeze/frozen/` 中的 A 系列与 `附件事实快照.json`
4. `artifacts/12_freeze/frozen/题面.md`
5. `artifacts/12_freeze/frozen/rubric.json`、`rules.py`（如有 derived）、`难点覆盖.json`、`校验结论.json`、`人工复核.json`（如有 manual）、`B索引.json`、`B*`、`答案核验.md`、`作答思路.md`、`易错点.md`
6. `artifacts/12_freeze/冻结清单.json` 及其 `frozen/` 副本：最终题面、A 附件、交付规格、字段映射、字段映射差量、rubric、rules、难点覆盖、11 校验结论、B 索引/B、答案核验、作答思路、易错点、项目门槛、judge、运行契约
7. `artifacts/16_qc/结论.json`：只有 `pass=true` 才能打包。

权威打包源必须是 `artifacts/12_freeze/frozen/`，不得从 00/06/09/11 的 live 目录取同名文件。所有源文件必须能在冻结清单中找到，且 bytes/sha256 与当前冻结副本一致；缺项或 hash 不一致即 `pass=false`。

`platform_fields` 只用于生成 `artifacts/17_pack/字段映射草案.json` 的栏位元数据，必须保留 `field_id`、`source_id` 和规范原文元数据；不得据此改题面、附件、B 或 rubric。`business_fields` 只从 04 和最终题面读取。

## 字段映射草案

`artifacts/17_pack/字段映射草案.json` 是 18 最终映射的 canonical 草案，只填元数据：

```json
{"schema_version":1,"canonical_target":"artifacts/18_submit/字段映射.json","spec_path":"artifacts/12_freeze/frozen/项目门槛.json","spec_sha256":"<64位小写sha256>","platform_fields_applicable":true,"platform_fields_na_basis":null,"fields":[{"field_id":"PF01","name":"<门槛原文名称>","order":1,"required":true,"value_type":"text","enum_values":null,"enum_source":null,"value_rule":null,"source_id":"<00 source_id>","status":"pending_18","value":null,"na_basis":null}],"counts":{"total":1,"pending":1,"ready":0,"missing":0,"invalid":0,"not_applicable":0}}
```

- 每项 `status` 固定 `pending_18`、`value=null`、`na_basis=null`；`field_id/name/order/required/value_type/enum_values/enum_source/value_rule/source_id` 必须逐字来自冻结门槛 `platform_fields` 原顺序，不得重排、增删、补值。
- `platform_fields=null + not_applicable` 时：`platform_fields_applicable=false`、`fields=[]`、`counts` 各项为 0，`platform_fields_na_basis={"extraction_status":"not_applicable","source_id":null,"quote":null,"reason":"规范未声明投稿平台栏位"}`。

## 三个包

### `完整题包.zip`

顶层目录固定为 `完整题包/`，成员只能来自：

- `题面/题面.md` ← `artifacts/12_freeze/frozen/题面.md`
- `附件/A*` ← 12 冻结的 A 系列副本
- `标答/B*` ← 11 的 B 系列
- `考点/rubric.json`
- `考点/难点覆盖.json`
- `考点/校验结论.json`
- `考点/B索引.json`
- `考点/易错点.md`
- `规则/rules.py`（存在时）
- `作答思路/作答思路.md`
- `核验/答案核验.md`
- `规范/项目门槛.json`（00 原样复制）
- `规范/交付规格.json`（04 原样复制）

### `仅模型输入.zip`

顶层目录固定为 `仅模型输入/`，只允许：

- `题面/题面.md`（12 冻结最终题面）
- `附件/A*`（12 冻结 A 系列）

打包后必须重新打开 zip 核对，成员集合必须严格等于白名单，不得有目录外文件、说明文件或隐藏文件。

### `填写上传.zip`

顶层目录固定为 `填写上传/`，包含：

- `平台/平台栏位映射.md`：按 `platform_fields` 原顺序列 `field_id/name/order/required/value_type/enum_source/value_rule/source_id`，每项状态固定 `pending_18`、`value` 留空；顶部注明“18 前草案，逐项待 18 回填”，不是最终提交值。
- `题面/题面.md`
- `附件/A*`
- `标答/B*`
- `考点/rubric.json`、`考点/难点覆盖.json`、`考点/校验结论.json`、`考点/B索引.json`、`考点/易错点.md`
- `规则/rules.py`（存在时）
- `作答思路/作答思路.md`
- `核验/答案核验.md`

18 通过后由编排 `18_rebuild_upload` 用最终 `字段映射.json` 重写该成员：只替换 `填写上传/平台/平台栏位映射.md`，其余成员字节不变、成员集合不变；17 不得把草案冒充最终平台结果。

## 绝对排除

三个包均不得包含：

- 旧版本地作答副本（历史目录名）、13 答卷、14 评分、15 问题表、16 结论、17/18 自身产物
- `work/`、`*.py`（11 明示的 `rules.py` 白名单除外）、`*.pkl`、`*.log`、运行日志
- `运行记录.json`、API key、环境凭据、本机绝对路径或缓存
- 标答、rubric、答案核验、作答思路、易错点在“仅模型输入”包中的任何副本

不要按目录递归收集后再排除；应从白名单逐项解析绝对源路径，并验证解析后的路径仍在 `taskDir` 内且不是符号链接。

## 做法

1. 读取 16 `结论.json`，`pass` 必须是布尔 `true`；否则停止。
2. 读取 12 冻结清单，逐项核验最终题面、交付规格、字段映射/差量、A 快照与 A、rubric、rules、难点覆盖、校验结论、B 索引/B、项目门槛、judge、运行契约的 `bytes/sha256` 与冻结副本一致。
3. 解析白名单；所有源文件路径必须指向 `artifacts/12_freeze/frozen/` 中的冻结副本，不得从 live 09/11 读取。
4. 按三个固定顶层目录复制到暂存区，不跟随或创建符号链接。
5. 生成 zip 后重新打开，逐成员重算 bytes、SHA-256，并核对固定顶层目录。
6. 对“仅模型输入”执行严格成员断言。
7. 扫描 `forbidden`、本机绝对路径、凭据与制作痕迹；`完整题包` 的 `规范/项目门槛.json`、`规范/交付规格.json` 是专家侧结构化元数据，不按业务正文扫描其 `forbidden`/`source` 等键值（扫描报告逐文件记录扫描范围），其余成员照常扫描；发现问题则删除不完整包并 fail closed。
8. 核对 B 集合：`B*` 文件集合必须与 11 `B索引.json` 的文件名集合、04 `交付规格.json` 的必需交付物一致，缺失/多余/改名均 fail。
9. 对照 `quality_gates`、`attachment_policy` 检查实际包成员；`null + not_applicable` 表示不适用，`unparseable`/`conflict` 阻断。

## 输出

- `artifacts/17_pack/完整题包.zip`
- `artifacts/17_pack/仅模型输入.zip`
- `artifacts/17_pack/填写上传.zip`
- `artifacts/17_pack/字段映射草案.json`
- `artifacts/17_pack/核对.json`
- `artifacts/17_pack/当前入口.txt`

`核对.json` 必须包含三个包，不能只记样例包：

```json
{
  "schema_version": 1,
  "pass": true,
  "source_freeze_sha256": "<冻结清单sha256>",
  "source_hash_check": "pass|fail",
  "mapping_draft": {
    "path": "artifacts/17_pack/字段映射草案.json",
    "sha256": "<64位小写sha256>",
    "field_count": 0,
    "platform_fields_applicable": true
  },
  "b_set_check": {
    "b_files": ["B01"],
    "index_files": ["B01"],
    "delivery_required": ["B01"],
    "pass": true
  },
  "packages": [
    {
      "name": "complete|model_input|upload",
      "path": "artifacts/17_pack/完整题包.zip",
      "root": "完整题包/",
      "members": [
        {"path": "完整题包/题面/题面.md", "bytes": 0, "sha256": "<64位小写sha256>"}
      ],
      "excluded_violations": [],
      "checked": true
    }
  ],
  "input_whitelist_relative": ["题面/题面.md", "附件/A*"],
  "checked_at": "<UTC ISO-8601>"
}
```

`members[].path` 是包含固定顶层目录的完整 ZIP 成员路径；`input_whitelist_relative` 是去掉顶层目录后的包内相对路径。两者不得混用，顶层目录必须分别严格等于 `完整题包/`、`仅模型输入/`、`填写上传/`。`packages` 必须恰好三项且各自 `checked=true`；只有三项均核对通过、全部成员 hash 来自实际解包结果、`excluded_violations=[]`、`source_hash_check="pass"` 时顶层 `pass=true`。`mapping_draft` 必须指向实际草案文件且 `sha256` 为磁盘重算值；B 集合核对不一致、`mapping_draft` 缺失或 hash 不符时 `pass=false`。18 只有在同时看到 `核对.json.pass=true` 与本字段为 `"pass"` 时才能继续。

`当前入口.txt` 必须用逐行 `key=value` 写：`artifact_dir`、三个包名、`generated_at`、各包成员数量、`change_scope`（`initial|repair`）、`previous_version`（无则 `null`）、`verification_status`（`16_passed|failed`）；不得写“已通过平台审核”等未发生事实。上述字段必须与本次实际运行一致，不得沿用旧入口。

## 硬要求

- `仅模型输入.zip` 不得出现标答、考点、作答思路、答卷、运行记录或脚本。
- 所有核对必须来自实际 zip 成员，不能只写“已核对”。
- 任一白名单源文件缺失时停止；不得用空文件、旧版本或其他目录文件顶替。
- 三包均不得包含 `platform_fields` 的猜测值；平台映射只保留门槛原文元数据、`pending_18` 状态与空值。
- 不把旧版本地作答副本、运行日志或制作脚本打进任何包。

## 最终回复

文件落盘后按编排 brief 的 JSON gate 返回，`artifacts` 逐项核对本节点产物。`conditions` 必须含 `three_packages_verified`、`source_hashes_verified`、`model_input_whitelist_verified`、`mapping_draft_schema_valid`、`mapping_draft_matches_platform_fields`，全部来自实际核对；`extra.audit` 必须按实际重算给出 `platform_field_count`、`draft_field_count`、`ids_equal`、`orders_equal`、`all_pending_18`、`all_values_null`、`draft_sha256`、`packages_checked`、`model_input_member_count`、`source_freeze_sha256`；`file_conclusion`/`reply_conclusion` 投影 `核对.json` 的 `pass`、`source_hash_check`。

只有三个 zip 均已生成、逐成员核对、草案与门槛一致且 16 已通过时才 `pass=true`；失败时保留失败记录并写明缺项。
