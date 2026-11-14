/**
 * Generador de PDF mínimo, sin dependencias: texto en Helvetica / Helvetica-Bold (fuentes estándar del PDF,
 * codificación WinAnsi para tildes y ñ), rectángulos y líneas. Suficiente para comprobantes de una o dos páginas.
 */

type Color = [number, number, number];
type Font = "F1" | "F2";

export const A4 = { width: 595.28, height: 841.89 };

/** Ancho aproximado por carácter (en milésimas de em) de Helvetica, para cortar líneas sin salirse del margen. */
function charWidth(ch: string, bold: boolean): number {
  if ("il.,:;'|!".includes(ch)) return 278;
  if ("fjtrI()[]".includes(ch)) return 333;
  if (ch === " ") return 278;
  if ("mwMW".includes(ch)) return bold ? 889 : 833;
  if (/[A-Z0-9ÁÉÍÓÚÑ]/.test(ch)) return bold ? 722 : 667;
  return bold ? 611 : 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const ch of text) total += charWidth(ch, bold);
  return (total / 1000) * size;
}

export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Codifica a WinAnsi (Latin-1 para los caracteres usados en español) como cadena literal PDF escapada. */
function pdfString(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    let code = ch.codePointAt(0) ?? 63;
    if (ch === "—" || ch === "–") code = 0x96;
    else if (ch === "•") code = 0x95;
    else if (ch === "“" || ch === "”") code = 0x22;
    else if (ch === "‘" || ch === "’") code = 0x27;
    else if (ch === "€") code = 0x80;
    else if (code > 0xff) code = 63; // "?" para lo que no existe en WinAnsi
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 0x20 || code > 0x7e) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(code);
  }
  return `(${out})`;
}

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

export class SimplePdf {
  private pages: string[][] = [[]];

  get pageCount() {
    return this.pages.length;
  }

  addPage() {
    this.pages.push([]);
  }

  private get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  text(x: number, y: number, text: string, opts: { size?: number; bold?: boolean; color?: Color } = {}) {
    const font: Font = opts.bold ? "F2" : "F1";
    const [r, g, b] = opts.color ?? [0.1, 0.1, 0.12];
    this.ops.push(`BT /${font} ${num(opts.size ?? 10)} Tf ${num(r)} ${num(g)} ${num(b)} rg ${num(x)} ${num(y)} Td ${pdfString(text)} Tj ET`);
  }

  rect(x: number, y: number, w: number, h: number, color: Color) {
    this.ops.push(`${num(color[0])} ${num(color[1])} ${num(color[2])} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Color = [0.8, 0.8, 0.82], width = 0.6) {
    this.ops.push(`${num(color[0])} ${num(color[1])} ${num(color[2])} RG ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  toBuffer(meta: { title?: string; author?: string } = {}): Buffer {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length;
    };
    const catalogId = add("");
    const pagesId = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];
    for (const ops of this.pages) {
      const content = ops.join("\n");
      const contentId = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      );
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    const infoId = add(
      `<< /Title ${pdfString(meta.title ?? "Documento")} /Author ${pdfString(meta.author ?? "CARGA360GO SpA")} /Producer (carga360go.cl) >>`,
    );
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(out, "latin1"));
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }
}
