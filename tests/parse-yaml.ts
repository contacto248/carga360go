export type Yaml = null | boolean | number | string | Yaml[] | { [key: string]: Yaml };

type Line = { indent: number; content: string; line: number };

/** Subconjunto de YAML 1.2 suficiente para docs/ops/openapi-v1.yaml. Sin anclas ni bloques |. */
export function parseYaml(source: string): Yaml {
  const lines: Line[] = [];
  for (const [index, rawLine] of source.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const raw = rawLine.replace(/\t/g, "  ");
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    lines.push({ indent, content: raw.slice(indent), line: index + 1 });
  }

  let cursor = 0;

  function parseBlock(minIndent: number): Yaml {
    const first = lines[cursor];
    if (!first || first.indent < minIndent) return null;
    if (first.content.startsWith("- ")) return parseSeq(first.indent);
    return parseMap(first.indent);
  }

  function parseMap(indent: number): { [key: string]: Yaml } {
    const map: { [key: string]: Yaml } = {};
    while (cursor < lines.length) {
      const current = lines[cursor];
      if (!current || current.indent !== indent || current.content.startsWith("- ")) break;
      cursor += 1;
      const sep = splitKey(current.content, current.line);
      map[sep.key] = sep.rest === "" ? parseBlock(indent + 1) : parseScalar(sep.rest);
    }
    return map;
  }

  function parseSeq(indent: number): Yaml[] {
    const list: Yaml[] = [];
    while (cursor < lines.length) {
      const current = lines[cursor];
      if (!current || current.indent !== indent || !current.content.startsWith("- ")) break;
      const rest = current.content.slice(2).trim();
      cursor += 1;
      if (rest === "") {
        list.push(parseBlock(indent + 1));
        continue;
      }
      if (rest.includes(":") && !rest.startsWith('"') && !rest.startsWith("'")) {
        const item: { [key: string]: Yaml } = {};
        const sep = splitKey(rest, current.line);
        item[sep.key] = sep.rest === "" ? parseBlock(indent + 2) : parseScalar(sep.rest);
        while (cursor < lines.length) {
          const nested = lines[cursor];
          if (!nested || nested.indent <= indent || nested.content.startsWith("- ")) break;
          cursor += 1;
          const key = splitKey(nested.content, nested.line);
          item[key.key] = key.rest === "" ? parseBlock(nested.indent + 1) : parseScalar(key.rest);
        }
        list.push(item);
        continue;
      }
      list.push(parseScalar(rest));
    }
    return list;
  }

  const document = parseBlock(0);
  if (cursor < lines.length) {
    const leftover = lines[cursor];
    throw new Error(`YAML sin cerrar en la línea ${leftover?.line ?? cursor}: ${leftover?.content ?? ""}`);
  }
  return document;
}

function splitKey(content: string, line: number): { key: string; rest: string } {
  const sep = content.indexOf(":");
  if (sep <= 0) throw new Error(`Falta una clave en la línea ${line}: ${content}`);
  return { key: scalarKey(content.slice(0, sep).trim(), line), rest: content.slice(sep + 1).trim() };
}

function scalarKey(text: string, line: number): string {
  const value = parseScalar(text);
  if (typeof value === "string" || typeof value === "number") return String(value);
  throw new Error(`Clave inválida en la línea ${line}: ${text}`);
}

function parseScalar(text: string): Yaml {
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "[]") return [];
  if (text === "{}") return {};
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  return text;
}
