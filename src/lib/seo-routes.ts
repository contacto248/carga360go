import routes from "@/data/routes.json";

export type SeoRouteFaq = {
  q: string;
  a: string;
};

export type SeoRoute = {
  slug: string;
  origin: string;
  destination: string;
  title: string;
  description: string;
  intro: string;
  equipment: string;
  planning: string;
  faq: SeoRouteFaq[];
};

export const SEO_ROUTES = routes as SeoRoute[];

export function routeBySlug(slug: string): SeoRoute | undefined {
  return SEO_ROUTES.find((route) => route.slug === slug);
}
