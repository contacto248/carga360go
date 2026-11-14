import type { Metadata } from "next";
import { Unsubscribe } from "@/components/Alerts";
import { firstParam } from "@/lib/format";

export const metadata: Metadata = { title: "Dejar de recibir alertas", robots: { index: false, follow: false } };

export default async function BajaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="wrap narrow" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Alertas por correo</h1>
        <p>Confirma si quieres dejar de recibir avisos de cargas y camiones que calzan.</p>
      </div>
      <Unsubscribe token={firstParam(sp.t)} />
    </div>
  );
}
