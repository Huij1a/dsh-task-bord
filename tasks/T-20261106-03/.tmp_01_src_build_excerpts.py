# -*- coding: utf-8 -*-
"""01_src: 从已下载的原文文本逐字抽取摘录，写 artifacts/01_src/原文摘录/*.md。"""
import os, re, hashlib

BASE = r"D:/高经出题流水线/tasks/T-20261106-03"
HTML = os.path.join(BASE, ".tmp_01_src_html")
PDF = os.path.join(BASE, ".tmp_01_src_pdf")
OUT = os.path.join(BASE, "artifacts", "01_src", "原文摘录")
os.makedirs(OUT, exist_ok=True)

READ_AT = "2026-11-06"


def load(path):
    return open(path, encoding="utf-8").read().splitlines()


STOP = ("相关稿件", "链接：", "全国人大", "全国政协", "国家监察委员会", "最高人民法院",
        "最高人民检察院", "国务院部门网站", "地方政府网站", "驻港澳机构网站", "驻外机构",
        "扫一扫", "首页", "中国政府网", "主办单位", "版权所有", "网站标识码")


def articles(lines, wanted):
    blocks, cur = {}, None
    for ln in lines:
        if ln.strip() in STOP or any(ln.startswith(s) for s in STOP):
            cur = None
            continue
        if re.match(r"^第[一二三四五六七八九十百零]+章", ln):
            cur = None
            continue
        m = re.match(r"^(第[一二三四五六七八九十百零]+条)", ln)
        if m:
            cur = m.group(1)
            if cur in wanted:
                blocks[cur] = [ln]
            else:
                cur = None
            continue
        if cur:
            blocks[cur].append(ln)
    return blocks


def emit(sid, meta, body_parts):
    """meta: dict of key->value; body_parts: list of str blocks."""
    head = ["<!--"]
    for k in ("source_id", "source_url", "source_name", "institution", "publish_date", "read_at", "locator"):
        head.append(f"{k}: {meta[k]}")
    head.append("-->")
    txt = "\n".join(head) + "\n\n" + "\n\n".join(body_parts).strip() + "\n"
    path = os.path.join(OUT, sid + ".md")
    open(path, "w", encoding="utf-8", newline="\n").write(txt)
    raw = open(path, "rb").read()
    return path, len(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()


def art_block(title, blocks, wanted):
    out = [f"## {title}"]
    for a in wanted:
        if a in blocks and blocks[a]:
            out.append("\n".join(blocks[a]))
        else:
            out.append(f"（抽取失败：{a} 未在正文中定位到）")
    return "\n\n".join(out)


# ---------- SID01 非银行支付机构监督管理条例 ----------
lines = load(os.path.join(HTML, "sid01_pay_reg.txt"))
w1 = ["第二条", "第六条", "第八条", "第十七条", "第二十一条", "第二十二条",
      "第二十七条", "第三十四条", "第三十五条", "第五十条"]
b1 = articles(lines, w1)
body1 = [art_block("原文摘录（逐字，按条文顺序）：《非银行支付机构监督管理条例》", b1, w1)]
meta1 = dict(source_id="SID01",
             source_url="https://www.gov.cn/zhengce/zhengceku/202312/content_6920725.htm",
             source_name="非银行支付机构监督管理条例（国务院令第768号）",
             institution="国务院",
             publish_date="2023-12-17",
             read_at=READ_AT,
             locator="中国政府网政策文件库正文；第二条、第六条、第八条、第十七条、第二十一条、第二十二条、第二十七条、第三十四条、第三十五条、第五十条")
p1, n1, h1 = emit("SID01", meta1, body1)

# ---------- SID02 商业银行金融资产风险分类办法 ----------
lines = load(os.path.join(HTML, "sid02_risk_class.txt"))
w2 = ["第六条", "第七条", "第八条", "第十条", "第十一条", "第十二条", "第十三条",
      "第十四条", "第十七条", "第二十条", "第二十一条", "第二十二条", "第三十条", "第四十八条"]
b2 = articles(lines, w2)
body2 = [art_block("原文摘录（逐字，按条文顺序）：《商业银行金融资产风险分类办法》", b2, w2)]
meta2 = dict(source_id="SID02",
             source_url="https://www.gov.cn/gongbao/content/2023/content_5754542.htm",
             source_name="商业银行金融资产风险分类办法（银保监会、人民银行令2023年第1号）",
             institution="中国银行保险监督管理委员会、中国人民银行",
             publish_date="2023-02-10",
             read_at=READ_AT,
             locator="国务院公报2023年第13号正文；第六条、第七条、第八条、第十条至第十四条、第十七条、第二十条至第二十二条、第三十条、第四十八条")
p2, n2, h2 = emit("SID02", meta2, body2)

# ---------- SID03 消费金融公司管理办法 ----------
lines = load(os.path.join(HTML, "sid03_consumer_fin.txt"))
w3 = ["第二条", "第三条", "第十八条", "第四十一条", "第四十四条", "第四十六条",
      "第四十七条", "第五十三条", "第五十六条", "第六十条"]
b3 = articles(lines, w3)
body3 = [art_block("原文摘录（逐字，按条文顺序）：《消费金融公司管理办法》", b3, w3)]
meta3 = dict(source_id="SID03",
             source_url="https://www.gov.cn/gongbao/2024/issue_11346/202405/content_6951507.html",
             source_name="消费金融公司管理办法（国家金融监督管理总局令2024年第4号）",
             institution="国家金融监督管理总局",
             publish_date="2024-03-18",
             read_at=READ_AT,
             locator="国务院公报2024年第14号正文；第二条、第三条、第十八条、第四十一条、第四十四条、第四十六条、第四十七条、第五十三条、第五十六条、第六十条")
p3, n3, h3 = emit("SID03", meta3, body3)

# ---------- SID04 2025年支付体系运行总体情况（PDF） ----------
pdf4 = load(os.path.join(PDF, "pbc_2025_annual.txt"))
def seg(lines, a, b):  # 1-based inclusive
    return "\n".join(lines[a - 1:b])


body4 = [
    "## 原文摘录（逐字）：PDF 第1页",
    "### 一、银行账户\n" + seg(pdf4, 4, 7),
    "### 二、非现金支付业务（总）\n" + seg(pdf4, 9, 11),
    "### （一）银行卡\n" + seg(pdf4, 13, 22),
    "## 原文摘录（逐字）：PDF 第2页",
    "### （四）电子支付（含非银行支付机构网络支付业务）\n" + seg(pdf4, 44, 51),
    "### 第1页脚注 1、2、3、4\n" + seg(pdf4, 26, 31),
    "### 第2页脚注 7（非银行支付机构统计口径）\n" + seg(pdf4, 62, 64),
    "## 原文摘录（逐字）：PDF 第3页",
    "### 三、支付系统（总）\n" + seg(pdf4, 53, 55),
]
meta4 = dict(source_id="SID04",
             source_url="https://www.pbc.gov.cn/zhifujiesuansi/128525/128545/128643/2026021217345429754/2026021217343023236.pdf",
             source_name="2025年支付体系运行总体情况",
             institution="中国人民银行支付结算司",
             publish_date="2026-02-12",
             read_at=READ_AT,
             locator="PDF 共4页；第1页“一、银行账户”“二、非现金支付业务”“（一）银行卡”，第2页“（四）电子支付”与脚注1-4、脚注7，第3页“三、支付系统”")
p4, n4, h4 = emit("SID04", meta4, body4)

# ---------- SID05 2026年第二季度支付体系运行总体情况（PDF） ----------
pdf5 = load(os.path.join(PDF, "pbc_2026_q2.txt"))
body5 = [
    "## 原文摘录（逐字）：PDF 第1页",
    "### 一、银行账户\n" + seg(pdf5, 4, 7),
    "### 二、非现金支付业务（总）\n" + seg(pdf5, 9, 11),
    "### （一）银行卡\n" + seg(pdf5, 13, 22),
    "## 原文摘录（逐字）：PDF 第2页",
    "### （四）电子支付（含非银行支付机构网络支付业务）\n" + seg(pdf5, 44, 51),
    "### 第1页脚注 1、2、3、4\n" + seg(pdf5, 26, 31),
    "### 第2页脚注 7（非银行支付机构统计口径）\n" + seg(pdf5, 63, 64),
    "## 原文摘录（逐字）：PDF 第3页",
    "### 三、支付系统（总）\n" + seg(pdf5, 53, 55),
]
meta5 = dict(source_id="SID05",
             source_url="https://www.pbc.gov.cn/zhifujiesuansi/128525/128545/128643/2026090219081087604/2026090219072950269.pdf",
             source_name="2026年第二季度支付体系运行总体情况",
             institution="中国人民银行支付结算司",
             publish_date="2026-09-02",
             read_at=READ_AT,
             locator="PDF 共4页；第1页“一、银行账户”“二、非现金支付业务”“（一）银行卡”，第2页“（四）电子支付”与脚注1-4、脚注7，第3页“三、支付系统”")
p5, n5, h5 = emit("SID05", meta5, body5)

# ---------- 处罚公示：解析表格 ----------
from html.parser import HTMLParser


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.rows, self.cells = [], [], []
        self.in_td = False
        self.buf = []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.rows = []
        elif tag == "tr":
            self.cells = []
        elif tag in ("td", "th"):
            self.in_td = True
            self.buf = []
        elif tag == "br" and self.in_td:
            self.buf.append("\n")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.in_td:
            self.cells.append("".join(self.buf).strip())
            self.in_td = False
        elif tag == "tr":
            if any(c for c in self.cells):
                self.rows.append(self.cells)
        elif tag == "table":
            rows = [r for r in self.rows if len(r) >= 8]
            if rows:
                self.tables.append(rows)

    def handle_data(self, data):
        if self.in_td:
            self.buf.append(data)


def penalty_table(html_name):
    raw = open(os.path.join(HTML, html_name), "rb").read().decode("utf-8", "replace")
    tp = TableParser()
    tp.feed(raw)
    header, data, seen = None, [], set()
    for tb in tp.tables:
        for r in tb:
            key = r[0].strip()
            if key in ("序号", ""):
                if header is None:
                    header = r
                continue
            if key in seen:
                continue
            seen.add(key)
            data.append(r)
    if header is None:
        header = ["序号", "当事人名称", "行政处罚决定书文号", "违法行为类型", "行政处罚内容",
                  "作出行政处罚决定机关名称", "作出行政处罚决定日期", "公示期限", "备注"]
    md = ["| " + " | ".join(c.replace("\n", " ").replace("|", "／") for c in header) + " |",
          "|" + "|".join(["---"] * len(header)) + "|"]
    for r in data:
        cells = [c.replace("\n", "<br>").replace("|", "／") for c in r]
        md.append("| " + " | ".join(cells) + " |")
    return "\n".join(md), len(data)


md6, nr6 = penalty_table("sid06_ccb_penalty.html")
body6 = ["## 原文摘录（逐字）：行政处罚公示表（单位：万元）", md6]
meta6 = dict(source_id="SID06",
             source_url="https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026021414194313885/index.html",
             source_name="银罚决字〔2026〕5-26号（中国人民银行行政处罚公示，当事人含中国建设银行股份有限公司）",
             institution="中国人民银行",
             publish_date="2026-02-14",
             read_at=READ_AT,
             locator="中国人民银行官网“政府信息公开-行政执法信息-行政处罚公示”页面；《银罚决字〔2026〕5-26号》表格全部 22 条当事人记录")
p6, n6, h6 = emit("SID06", meta6, body6)

md7, nr7 = penalty_table("sid07_cgb_penalty.html")
body7 = ["## 原文摘录（逐字）：行政处罚公示表（单位：万元）", md7]
meta7 = dict(source_id="SID07",
             source_url="https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026092418294123383/index.html",
             source_name="银罚决字〔2026〕104-116号（中国人民银行行政处罚公示，当事人含广发银行股份有限公司）",
             institution="中国人民银行",
             publish_date="2026-09-24",
             read_at=READ_AT,
             locator="中国人民银行官网“政府信息公开-行政执法信息-行政处罚公示”页面；《银罚决字〔2026〕104-116号》表格全部 13 条当事人记录")
p7, n7, h7 = emit("SID07", meta7, body7)

md8, nr8 = penalty_table("sid08_cib_penalty.html")
body8 = ["## 原文摘录（逐字）：行政处罚公示表（单位：万元）", md8]
meta8 = dict(source_id="SID08",
             source_url="https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026101617252582686/index.html",
             source_name="银罚决字〔2026〕68-70号（中国人民银行行政处罚公示，当事人含兴业银行股份有限公司）",
             institution="中国人民银行",
             publish_date="2026-10-16",
             read_at=READ_AT,
             locator="中国人民银行官网“政府信息公开-行政执法信息-行政处罚公示”页面；《银罚决字〔2026〕68-70号》表格全部 3 条当事人记录")
p8, n8, h8 = emit("SID08", meta8, body8)

for sid, p, n, h in [("SID01", p1, n1, h1), ("SID02", p2, n2, h2), ("SID03", p3, n3, h3),
                     ("SID04", p4, n4, h4), ("SID05", p5, n5, h5), ("SID06", p6, n6, h6),
                     ("SID07", p7, n7, h7), ("SID08", p8, n8, h8)]:
    print(sid, os.path.basename(p), "chars=", n, "sha256=", h)
print("penalty_row_counts:", nr6, nr7, nr8)
