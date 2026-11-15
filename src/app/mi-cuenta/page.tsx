import type { Metadata } from "next";
import Link from "next/link";
import { MiCuentaUpload } from "@/components/MiCuentaUpload";
import styles from "@/components/mi-cuenta.module.css";
import { vistaCuenta, type VistaCuenta } from "@/lib/bassam/acreditacion";
import { DOCUMENTOS_POR_CLIENTE } from "@/lib/bassam/tipos-cliente";
import type { FilaAcreditacion } from "@/lib/bassam/types";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const VACIA: VistaCuenta = { estado: "Sin datos", transportistas: [], mandantes: [], timeline: "sin datos" };

const ESTADO: Record<FilaAcreditacion["estado"], string> = {
  pendiente: "En revisión",
  aprobado: "Acreditado",
  rechazado: "Rechazado",
  renovacion: "Renovación",
};

function Tarjeta({ titulo, pedidos, filas }: { titulo: string; pedidos: readonly { id: string; label: string }[]; filas: FilaAcreditacion[] }) {
  return (
    <section className={styles.card}>
      <h2>{titulo}</h2>
      {pedidos.map((doc) => {
        const propios = filas.filter((fila) => fila.tipo === doc.id);
        return (
          <div key={doc.id}>
            <h3>{doc.label}</h3>
            {propios.length === 0 ? (
              <p>Sin datos</p>
            ) : (
              propios.map((fila) => (
                <p key={fila.id}>
                  Fecha: {fila.fecha}. Estado: {ESTADO[fila.estado]}.
                </p>
              ))
            )}
          </div>
        );
      })}
    </section>
  );
}

function rolPedido(value: string | string[] | undefined): "mandante" | "transportista" | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "mandante" || raw === "transportista") return raw;
  return null;
}

export default async function MiCuentaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const pedido = rolPedido(params.rol);
  const user = await getCurrentUser();
  const nombre = user ? user.contactName.trim() || user.razonSocial.trim() : "";
  const vista = user ? vistaCuenta(user.id) : VACIA;
  const destino = pedido ? `/mi-cuenta?rol=${pedido}` : "/mi-cuenta";
  const puedeSubir = Boolean(pedido && user?.role === pedido);
  return (
    <div className={`wrap ${styles.page}`}>
      <h1>{nombre ? `Hola ${nombre}` : "Mi cuenta"}</h1>
      <p className={styles.estado}>Estado: {vista.estado}</p>
      {!pedido ? (
        <div className={styles.grid}>
          <Link className={styles.card} href="/mi-cuenta?rol=transportista">
            <h2>Transportista</h2>
          </Link>
          <Link className={styles.card} href="/mi-cuenta?rol=mandante">
            <h2>Mandante con carga</h2>
          </Link>
        </div>
      ) : (
        <>
          {!user ? (
            <p>
              <Link href={`/ingreso?next=${encodeURIComponent(destino)}`}>Ingresa</Link> para subir tus documentos.
            </p>
          ) : null}
          <MiCuentaUpload cliente={pedido} puedeSubir={puedeSubir} />
          <Tarjeta
            titulo={pedido === "mandante" ? "Mandante con carga" : "Transportista"}
            pedidos={DOCUMENTOS_POR_CLIENTE[pedido]}
            filas={pedido === "mandante" ? vista.mandantes : vista.transportistas}
          />
        </>
      )}
      <section className={styles.timeline}>
        <h2>Línea de tiempo</h2>
        {vista.timeline === "sin datos" ? (
          <p>Sin datos</p>
        ) : (
          vista.timeline.map((event) => (
            <p key={event.id}>
              {event.fecha} · {event.origen} · {event.accion}. {event.comentario}
            </p>
          ))
        )}
      </section>
    </div>
  );
}
