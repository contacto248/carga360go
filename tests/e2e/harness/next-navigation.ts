// Sustituto de next/navigation para la prueba de navegador: solo lo que usa AnalyticsConsent.
export function usePathname(): string {
  return window.location.pathname;
}
