#!/usr/bin/env python3
"""
Ejemplo de estructura para procesar datos extraídos de carga360go.cl
y generar un resumen en Markdown + CSV.
Adaptar según los campos reales obtenidos del scraping.
"""

import csv
from datetime import datetime
from pathlib import Path

def generate_report(data: list[dict], output_dir: str = "/tmp"):
    """
    data: lista de dicts con campos como origen, destino, tipo, peso, precio, estado
    """
    fecha = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Markdown summary
    md = f"# Reporte Carga360go — {fecha}\n\n"
    md += f"**Total registros**: {len(data)}\n\n"
    if data:
        md += "| Origen | Destino | Tipo | Peso | Precio est. | Estado |\n"
        md += "|--------|---------|------|------|-------------|--------|\n"
        for row in data[:20]:  # limitar vista
            md += f"| {row.get('origen','')} | {row.get('destino','')} | {row.get('tipo','')} | {row.get('peso','')} | {row.get('precio','')} | {row.get('estado','')} |\n"
        if len(data) > 20:
            md += f"\n... y {len(data)-20} más.\n"
    else:
        md += "Sin datos extraídos.\n"

    md_path = out / f"reporte-carga360go-{fecha}.md"
    md_path.write_text(md, encoding="utf-8")

    # CSV
    if data:
        csv_path = out / f"reporte-carga360go-{fecha}.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)

    print(f"Reporte generado:\n- {md_path}")
    if data:
        print(f"- {csv_path}")
    return str(md_path)

if __name__ == "__main__":
    # Ejemplo de uso
    sample = [
        {"origen": "La Serena", "destino": "Santiago", "tipo": "General", "peso": "15 t", "precio": "$450.000", "estado": "Disponible"},
        {"origen": "Antofagasta", "destino": "Valparaíso", "tipo": "Minera", "peso": "28 t", "precio": "$1.200.000", "estado": "Oferta"},
    ]
    generate_report(sample)
