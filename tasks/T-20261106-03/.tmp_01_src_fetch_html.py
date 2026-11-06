# -*- coding: utf-8 -*-
"""01_src: 抓取 HTML 来源并转纯文本，供逐字摘录使用。"""
import os, re, ssl, html, urllib.request

BASE = r"D:/高经出题流水线/tasks/T-20261106-03"
OUT = os.path.join(BASE, ".tmp_01_src_html")
os.makedirs(OUT, exist_ok=True)

PAGES = {
    "sid01_pay_reg": "https://www.gov.cn/zhengce/zhengceku/202312/content_6920725.htm",
    "sid02_risk_class": "https://www.gov.cn/gongbao/content/2023/content_5754542.htm",
    "sid03_consumer_fin": "https://www.gov.cn/gongbao/2024/issue_11346/202405/content_6951507.html",
    "sid06_ccb_penalty": "https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026021414194313885/index.html",
    "sid07_cgb_penalty": "https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026092418294123383/index.html",
    "sid08_cib_penalty": "https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081407/4081705/2026101617252582686/index.html",
}
HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
}
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def to_text(raw: bytes) -> str:
    s = raw.decode("utf-8", errors="replace")
    s = re.sub(r"(?is)<script.*?</script>", " ", s)
    s = re.sub(r"(?is)<style.*?</style>", " ", s)
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</(p|div|tr|h1|h2|h3|h4|li|table)>", "\n", s)
    s = re.sub(r"(?i)</t[dh]>", " | ", s)
    s = re.sub(r"(?s)<[^>]+>", "", s)
    s = html.unescape(s)
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    lines = []
    for ln in s.split("\n"):
        ln = re.sub(r"[ \t]+", " ", ln).strip()
        ln = re.sub(r"(\|\s*)+$", "", ln).strip()
        if ln:
            lines.append(ln)
    return "\n".join(lines)


for name, url in PAGES.items():
    try:
        req = urllib.request.Request(url, headers=HDR)
        raw = urllib.request.urlopen(req, timeout=60, context=ctx).read()
        open(os.path.join(OUT, name + ".html"), "wb").write(raw)
        txt = to_text(raw)
        open(os.path.join(OUT, name + ".txt"), "w", encoding="utf-8").write(txt)
        print(name, "http_ok bytes=", len(raw), "lines=", len(txt.splitlines()), "chars=", len(txt))
    except Exception as e:
        print(name, "FAIL", type(e).__name__, str(e)[:200])
