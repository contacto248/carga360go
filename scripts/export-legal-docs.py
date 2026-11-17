# Genera los PDF/DOCX de la Política de Privacidad y de los Términos de uso desde src/lib/privacy-policy.ts y src/lib/terms.ts.
# Uso:
#   npx tsx scripts/legal-json.ts privacy > /tmp/privacy.json && python3 scripts/export-legal-docs.py /tmp/privacy.json public carga360go-politica-privacidad
#   npx tsx scripts/legal-json.ts terms > /tmp/terms.json && python3 scripts/export-legal-docs.py /tmp/terms.json public carga360go-terminos-uso
# Requiere python-docx y LibreOffice (soffice).
import json, os, subprocess, sys
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

src, outdir, base = sys.argv[1], sys.argv[2], sys.argv[3]
logo = sys.argv[4] if len(sys.argv) > 4 else "public/brand/icon.png"
d = json.load(open(src)); M = d["meta"]
doc = Document()
sec = doc.sections[0]; sec.left_margin = sec.right_margin = Cm(2.2); sec.top_margin = sec.bottom_margin = Cm(2)
st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(10.5)
NAVY = RGBColor(0x0B, 0x16, 0x33); ORANGE = RGBColor(0xF2, 0x6B, 0x1D)
try:
    doc.add_picture(logo, width=Cm(2.2))
except Exception as e:
    print("logo skip", e)
h = doc.add_heading(M["title"], 0)
for r in h.runs: r.font.color.rgb = NAVY; r.font.size = Pt(20)
p = doc.add_paragraph(f'Versión {M["version"]} · vigente desde el {M["updated"]} · {M["site"]}{M["path"]}'); p.runs[0].font.color.rgb = RGBColor(0x5b, 0x67, 0x78)
for t in d["intro"]: doc.add_paragraph(t)
for s in d["sections"]:
    hh = doc.add_heading(s["title"], level=2)
    for r in hh.runs: r.font.color.rgb = ORANGE
    for b in s["blocks"]:
        if isinstance(b, str): doc.add_paragraph(b)
        elif "list" in b:
            for it in b["list"]: doc.add_paragraph(it, style="List Bullet")
        else:
            tb = doc.add_table(rows=0, cols=2); tb.style = "Light Grid Accent 1"
            for k, v in b["table"]:
                c = tb.add_row().cells; c[0].text = k; c[1].text = v
                c[0].paragraphs[0].runs[0].bold = True
                c[0].width = Cm(5); c[1].width = Cm(11.5)
            doc.add_paragraph()
foot = sec.footer.paragraphs[0]
foot.text = "CARGA360 GO SpA · RUT 78.553.352-6 · Chile · contacto@carga360go.cl · +56 9 5842 8693"
foot.alignment = WD_ALIGN_PARAGRAPH.CENTER; foot.runs[0].font.size = Pt(8)
out = os.path.join(outdir, base + ".docx"); doc.save(out)
subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", outdir, out], check=True, capture_output=True)
print("ok", out)
