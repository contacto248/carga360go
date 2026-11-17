import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hrefAdmin, seccionInterna, vistaControl } from "@/lib/control/secciones";

export const metadata: Metadata = { title: "Administración · Centro de control inteligente", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const empresa = params.empresa === "bassam" ? "bassam" : "carga360go";
  redirect(hrefAdmin(empresa, { seccion: seccionInterna(params.seccion), vista: vistaControl(params.vista) }));
}
