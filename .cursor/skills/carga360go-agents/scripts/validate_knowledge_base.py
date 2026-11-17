#!/usr/bin/env python3
"""Valida un JSONL de la base de conocimiento de CARGA360GO.

Uso:
  python3 validate_knowledge_base.py
  python3 validate_knowledge_base.py ruta/al/archivo.jsonl

Sin argumentos valida assets/knowledge-base-sample.jsonl de este skill.
Cada línea es un objeto con los campos de references/customer-service-knowledge-base.md.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQUIRED = (
    "id",
    "intencion",
    "audiencia",
    "preguntas_variantes",
    "respuesta_aprobada",
    "fuente",
    "fecha_validacion",
    "requisitos",
    "accion_permitida",
    "escalamiento",
    "idioma",
    "version",
)

STRING_FIELDS = (
    "id",
    "intencion",
    "audiencia",
    "respuesta_aprobada",
    "fuente",
    "fecha_validacion",
    "accion_permitida",
    "escalamiento",
    "idioma",
    "version",
)


def default_jsonl() -> Path:
    return Path(__file__).resolve().parent.parent / "assets" / "knowledge-base-sample.jsonl"


def check_entry(entry: object, line_no: int, seen_ids: set[str]) -> list[str]:
    errors: list[str] = []
    where = f"línea {line_no}"
    if not isinstance(entry, dict):
        return [f"{where}: se esperaba un objeto JSON"]
    unknown = sorted(set(entry) - set(REQUIRED))
    if unknown:
        errors.append(f"{where}: campos no previstos: {', '.join(unknown)}")
    missing = [key for key in REQUIRED if key not in entry]
    if missing:
        errors.append(f"{where}: faltan campos: {', '.join(missing)}")
        return errors
    for key in STRING_FIELDS:
        value = entry[key]
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{where}: {key} debe ser texto no vacío")
    variants = entry["preguntas_variantes"]
    if not isinstance(variants, list) or not variants or not all(isinstance(item, str) and item.strip() for item in variants):
        errors.append(f"{where}: preguntas_variantes debe ser una lista de textos no vacíos")
    requirements = entry["requisitos"]
    if not isinstance(requirements, list) or not all(isinstance(item, str) and item.strip() for item in requirements):
        errors.append(f"{where}: requisitos debe ser una lista de textos")
    entry_id = entry["id"]
    if isinstance(entry_id, str):
        if entry_id in seen_ids:
            errors.append(f"{where}: id duplicado {entry_id}")
        seen_ids.add(entry_id)
    fecha = entry["fecha_validacion"]
    if isinstance(fecha, str) and fecha != "pendiente" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha) is None:
        errors.append(f"{where}: fecha_validacion debe ser 'pendiente' o YYYY-MM-DD")
    if isinstance(entry.get("idioma"), str) and entry.get("idioma") != "es-CL":
        errors.append(f"{where}: idioma debe ser es-CL")
    version = entry.get("version")
    if isinstance(version, str) and re.fullmatch(r"\d+\.\d+", version) is None:
        errors.append(f"{where}: version debe ser mayor.menor")
    return errors


def validate(path: Path) -> list[str]:
    if not path.is_file():
        return [f"no existe el archivo: {path}"]
    errors: list[str] = []
    seen_ids: set[str] = set()
    count = 0
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        count += 1
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError as exc:
            errors.append(f"línea {line_no}: JSON inválido ({exc.msg})")
            continue
        errors.extend(check_entry(entry, line_no, seen_ids))
    if count == 0:
        errors.append("el archivo no tiene entradas")
    return errors


def main(argv: list[str]) -> int:
    path = Path(argv[1]).resolve() if len(argv) > 1 else default_jsonl()
    errors = validate(path)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"FAIL {path}", file=sys.stderr)
        return 1
    print(f"OK {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
