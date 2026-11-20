import React from "react";

export type DataColumn = { id: string; label: string };
export type DataRow = { id: string; cells: string[] };

export function DataTable({
  columns,
  rows,
  caption = "Tabla",
}: {
  columns: DataColumn[];
  rows: DataRow[];
  caption?: string;
}) {
  return (
    <div className="ds-table-wrap">
      <table className="ds-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.length === 0 ? (
              <th scope="col">Registro</th>
            ) : (
              columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.label}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>Sin datos</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
