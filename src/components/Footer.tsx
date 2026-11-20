import { Suspense } from "react";
import Link from "next/link";
import { AgenteAcreditacion } from "@/components/AgenteAcreditacion";
import { VoiceAgentLauncher } from "@/components/VoiceAgent";
import { BRAND } from "@/lib/catalog";

export function Footer() {
  const waNumber = BRAND.whatsapp;
  const waText = BRAND.infoMessage;
  return (
    <>
      <footer className="foot foot-short">
        <div className="wrap foot-row">
          <Link href="/" className="orbita-wordmark" aria-label="Carga360go">
            <span>
              Carga<b>360go</b>
            </span>
          </Link>
          <nav aria-label="Pie">
            <Link href="/cargas">Bolsa</Link>
            <Link href="/tecnologia">Tecnología</Link>
            <Link href="/guias">Guías</Link>
            <a href={BRAND.whatsappChannel} target="_blank" rel="noopener noreferrer">
              Canal de WhatsApp
            </a>
          </nav>
          <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          <Link className="foot-legal" href="/legal">
            Legal y privacidad
          </Link>
        </div>
      </footer>
      <Suspense fallback={null}>
        <AgenteAcreditacion />
      </Suspense>
      <VoiceAgentLauncher waNumber={waNumber} waText={waText} />
    </>
  );
}
