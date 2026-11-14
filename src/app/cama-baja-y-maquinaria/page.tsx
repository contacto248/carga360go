import type { Metadata } from "next";
import { LandingRoute, landingMetadata } from "@/components/LandingRoute";

const SLUG = "/cama-baja-y-maquinaria";

export const metadata: Metadata = landingMetadata(SLUG);

export default function Page() {
  return <LandingRoute slug={SLUG} />;
}
