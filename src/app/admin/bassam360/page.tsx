import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "BASSAM 360", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Bassam360Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/ingreso?next=/admin/bassam360");
  if (user.role !== "admin") forbidden();
  redirect("/admin?seccion=bassam360");
}
