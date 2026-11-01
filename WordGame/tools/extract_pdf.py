# Extract layout-mode text from the Cambridge YLE combined wordlist PDF.
import sys
from pypdf import PdfReader

src, dst = sys.argv[1], sys.argv[2]
reader = PdfReader(src)
out = []
for i, page in enumerate(reader.pages):
    out.append(f"===== PAGE {i+1} =====")
    try:
        out.append(page.extract_text(extraction_mode="layout") or "")
    except Exception as e:
        out.append(f"!!LAYOUT-FAIL {e}")
with open(dst, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print(f"pages={len(reader.pages)} chars={sum(len(x) for x in out)}")
