import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { controlSnapshot } from "@/lib/control/snapshot";
import { ControlCenter } from "@/components/control/ControlCenter";

export const metadata: Metadata = { title: "BASSAM 360 · Centro de control inteligente", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function ControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return <div className="wrap card"><h1>BASSAM 360 · Acceso administrativo</h1><p>{user ? "Tu cuenta no tiene permisos de administración." : "Ingresa con tu cuenta administradora y su verificación habitual."}</p><Link className="btn" href={user ? "/panel" : "/ingreso?next=/admin/control"}>{user ? "Volver a mi panel" : "Ingresar"}</Link></div>;
  const params = await searchParams;
  const company = params.empresa === "bassam" ? "bassam" : "carga360go";
  const data = controlSnapshot(user, company);
  return <ControlCenter key={company} initial={data} />;
}
