import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLanding } from "@/components/SeoLanding";
import { landingBySlug } from "@/lib/seo-landings";

export function landingMetadata(slug: string): Metadata {
  const landing = landingBySlug(slug);
  if (!landing) throw new Error(`Landing desconocida: ${slug}`);
  return {
    title: { absolute: landing.titleTag },
    description: landing.meta,
    alternates: { canonical: landing.slug },
  };
}

export function LandingRoute({ slug }: { slug: string }) {
  const landing = landingBySlug(slug);
  if (!landing) notFound();
  return <SeoLanding landing={landing} />;
}
