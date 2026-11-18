// Monta los componentes REALES de consentimiento (AnalyticsConsent y ConsentPreferencesLink) sin Next ni base de datos.
import { createRoot } from "react-dom/client";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { ConsentPreferencesLink } from "@/components/ConsentPreferencesLink";

createRoot(document.getElementById("root")!).render(
  <>
    <AnalyticsConsent />
    <footer className="foot">
      <ConsentPreferencesLink />
    </footer>
  </>,
);
