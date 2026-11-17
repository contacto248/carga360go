import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AgenteAcreditacion } from "@/components/AgenteAcreditacion";
import { ControlCenter } from "@/components/control/ControlCenter";
import { ModuloBassam360 } from "@/components/control/ModuloBassam360";
import { ModuloPanelBassam } from "@/components/control/ModuloPanelBassam";
import { ModuloUsuarios } from "@/components/control/ModuloUsuarios";
import { getCurrentUser } from "@/lib/current-user";
import { controlSnapshot } from "@/lib/control/snapshot";
import { seccionInterna, vistaControl, type SeccionInterna } from "@/lib/control/secciones";
import type { Company } from "@/lib/control/types";

export const metadata: Metadata = { title: "Administración · Centro de control inteligente", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Modulo({ seccion }: { seccion: SeccionInterna }) {
  switch (seccion) {
    case "agente":
      return (
        <Suspense fallback={<p>Cargando la conversación…</p>}>
          <AgenteAcreditacion modo="conversacion" />
        </Suspense>
      );
    case "panel":
      return <ModuloPanelBassam />;
    case "bassam360":
      return <ModuloBassam360 />;
    case "usuarios":
      return <ModuloUsuarios />;
    default: {
      const nunca: never = seccion;
      return nunca;
    }
  }
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Administración</h1>
          <p>Ingresa con una cuenta administradora.</p>
          <Link className="btn" href="/ingreso?next=/admin">
            Ingresar
          </Link>
        </div>
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <div className="card">
          <h1>Sin acceso</h1>
          <p>Esta sección es solo para administradores de Carga360go.</p>
          <Link className="btn" href="/panel">
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }
  const params = await searchParams;
  const company: Company = params.empresa === "bassam" ? "bassam" : "carga360go";
  const seccion = seccionInterna(params.seccion);
  const vista = vistaControl(params.vista);
  const data = controlSnapshot(user, company);
  return (
    <ControlCenter key={`${company}-${seccion ?? vista}`} initial={data} seccion={seccion} vista={vista}>
      {seccion ? <Modulo seccion={seccion} /> : null}
    </ControlCenter>
  );
}
