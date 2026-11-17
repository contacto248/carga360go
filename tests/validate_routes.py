import json, re, pathlib

# El paquete original leía data/routes.json en la raíz. En este repo /data
# está reservado a SQLite y archivos de runtime (y está en .gitignore),
# así que el JSON versionado vive en src/data/routes.json.
p = pathlib.Path(__file__).resolve().parents[1]
routes = json.loads((p / "src/data/routes.json").read_text())
assert len(routes) == 15
assert len({r["slug"] for r in routes}) == 15
for r in routes:
    assert re.fullmatch(r"[a-z-]+", r["slug"])
    assert all(r[k] for k in ("title", "description", "intro", "equipment", "planning"))
    assert len(r["faq"]) == 2
    assert not re.search(r"\$[0-9]|CLP|UF|precio por km", str(r), re.I)
print("OK: 15 rutas unicas, contenido y restricciones editoriales")
