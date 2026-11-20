import Link from "next/link";
import { comprobantesDe } from "@/lib/qr/vista";

const LABEL: Record<string, string> = {
  pendiente_confirmacion: "Por confirmar",
  cerrado: "Trato cerrado",
  anulado: "Anulado",
  expirado: "Plazo vencido",
};

export function ComprobantesPanel({ userId }: { userId: string }) {
  const rows = comprobantesDe(userId);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="comprobantes-trato">
      <h2 id="comprobantes-trato" style={{ marginTop: 22 }}>
        Comprobantes del trato
      </h2>
      <div className="grid c2">
        {rows.map((row) => (
          <article key={row.loadId} className="qr-panel-card">
            <strong>{row.folio || "Sin folio todavía"}</strong>
            <span>
              {row.origin} → {row.destination}
            </span>
            <span>{LABEL[row.status] || row.status}</span>
            <Link href={`/viajes/${row.loadId}/comprobante`}>Ver comprobante</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
