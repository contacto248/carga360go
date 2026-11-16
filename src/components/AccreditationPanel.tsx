import Link from "next/link";
import type { Accreditation } from "@/lib/accreditation";

const ACTION: Record<string, { href: string; text: string }> = {
  privacidad: { href: "/privacidad", text: "Leer y aceptar" },
  correo: { href: "/cuenta-en-revision#mis-datos", text: "Revisar mi correo" },
  telefono: { href: "/cuenta-en-revision", text: "Confirmar teléfono" },
  documentos: { href: "/mi-cuenta", text: "Subir documentos" },
  identidad: { href: "/verificar-identidad", text: "Verificar identidad" },
};

/** Estado de acreditación 100%: qué está listo y qué falta para publicar, ofertar y recibir contactos. */
export function AccreditationPanel({ acc, role, compact = false }: { acc: Accreditation; role: string; compact?: boolean }) {
  if (role === "admin") return null;
  const percent = acc.total ? Math.round((acc.done / acc.total) * 100) : 100;
  return (
    <section className={`card accreditation ${acc.accredited ? "ok" : ""}`} id="acreditacion" aria-label="Acreditación">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Acreditación</h3>
        <span className={`pill ${acc.accredited ? "ok" : "warn"}`}>{acc.accredited ? (acc.grace?.active ? "Plazo de gracia" : "✔ Cuenta verificada") : `${percent}% · falta completar`}</span>
      </div>
      <div className="acc-bar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="meta" style={{ marginTop: 6 }}>
        {acc.accredited
          ? acc.grace?.active
            ? `Tu cuenta sigue activa durante el plazo de gracia (${acc.grace.daysLeft} ${acc.grace.daysLeft === 1 ? "día" : "días"}). Completa la verificación de teléfono e identidad para no perder el acceso.`
            : role === "transportista"
              ? "Tu cuenta cumple todo: puedes publicar camiones y ofertar. Los contactos se comparten solo al adjudicar una oferta."
              : "Tu cuenta cumple todo: puedes publicar cargas y elegir ofertas. Los contactos se comparten solo al adjudicar una oferta."
          : `Para ${role === "transportista" ? "publicar camiones y ofertar" : "publicar cargas"} tu cuenta debe estar verificada. Esto es lo que falta:`}
      </p>
      {compact && acc.accredited && !acc.grace?.active ? null : (
        <ul className="acc-list">
          {acc.items.map((item) => (
            <li key={item.key} className={item.ok ? "done" : "todo"}>
              <span className="acc-mark" aria-hidden="true">
                {item.ok ? "✓" : "✗"}
              </span>
              <div>
                <strong>{item.label}</strong>
                {item.ok ? null : (
                  <div className="meta">
                    {item.hint}
                    {ACTION[item.key] ? (
                      <>
                        {" "}
                        <Link href={ACTION[item.key].href}>{ACTION[item.key].text}</Link>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
