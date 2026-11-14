import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo para textos legales propios (no para contenido de usuarios):
 * títulos #, ##, ###; párrafos; listas - y 1.; tablas |; **negrita**, *cursiva*, `código` y [enlace](url).
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+?\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*[^*\s][^*]*?\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(<Fragment key={`${key}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${key}-b${i++}`}>{inline(tok.slice(2, -2), i)}</strong>);
    else if (tok.startsWith("`")) out.push(<em key={`${key}-c${i++}`}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      const safe = /^(https:\/\/|mailto:|\/)/.test(href) ? href : "#";
      out.push(<a key={`${key}-a${i++}`} href={safe}>{label}</a>);
    } else out.push(<em key={`${key}-i${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}-t${i++}`}>{text.slice(last)}</Fragment>);
  return out;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line === "---") {
      if (line === "---") nodes.push(<hr key={k++} />);
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const id = slug(text);
      nodes.push(level === 1 ? <h2 key={k++} id={id}>{inline(text)}</h2> : level === 2 ? <h3 key={k++} id={id}>{inline(text)}</h3> : <h4 key={k++} id={id}>{inline(text)}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      nodes.push(
        <table key={k++} className="tbl legal-tbl">
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^- /.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\.\s/ : /^- /).test(lines[i].trim())) {
        items.push(lines[i].trim().replace(ordered ? /^\d+\.\s+/ : /^- /, ""));
        i++;
      }
      const lis = items.map((it, j) => <li key={j}>{inline(it, j)}</li>);
      nodes.push(ordered ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||- |\d+\.\s|---$)/.test(lines[i].trim())) {
      para.push(lines[i].trim().replace(/\s{2,}$/, ""));
      i++;
    }
    nodes.push(<p key={k++}>{inline(para.join(" "))}</p>);
  }
  return <>{nodes}</>;
}
