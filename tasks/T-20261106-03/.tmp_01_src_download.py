import os, sys, urllib.request, ssl
import fitz
base = r"D:/高经出题流水线/tasks/T-20261106-03"
out = os.path.join(base, ".tmp_01_src_pdf")
os.makedirs(out, exist_ok=True)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
urls = {
 "pbc_2025_annual": "https://www.pbc.gov.cn/zhifujiesuansi/128525/128545/128643/2026021217345429754/2026021217343023236.pdf",
 "pbc_2026_q2": "https://www.pbc.gov.cn/zhifujiesuansi/128525/128545/128643/2026090219081087604/2026090219072950269.pdf",
}
hdr = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36","Referer":"https://www.pbc.gov.cn/"}
for name,u in urls.items():
    p = os.path.join(out, name + ".pdf")
    try:
        req = urllib.request.Request(u, headers=hdr)
        data = urllib.request.urlopen(req, timeout=60, context=ctx).read()
        open(p,"wb").write(data)
        doc = fitz.open(p)
        txt = "\n".join(page.get_text() for page in doc)
        open(os.path.join(out, name + ".txt"), "w", encoding="utf-8").write(txt)
        print(name, "bytes=", len(data), "pages=", doc.page_count, "chars=", len(txt))
        print(repr(txt[:300]))
    except Exception as e:
        print(name, "FAIL", type(e).__name__, str(e)[:200])
