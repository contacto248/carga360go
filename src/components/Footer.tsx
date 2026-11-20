"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BRAND } from "@/lib/catalog";

const AgenteAcreditacion = dynamic(
  () => import("@/components/AgenteAcreditacion").then((mod) => mod.AgenteAcreditacion),
  { ssr: false },
);
const VoiceAgentLauncher = dynamic(
  () => import("@/components/VoiceAgent").then((mod) => mod.VoiceAgentLauncher),
  { ssr: false },
);

function DockTardio({ waNumber, waText }: { waNumber: string; waText: string }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const mostrar = () => setListo(true);
    const espera = window.requestIdleCallback(mostrar, { timeout: 2000 });
    return () => window.cancelIdleCallback(espera);
  }, []);
  if (!listo) return null;
  return (
    <>
      <Suspense fallback={null}>
        <AgenteAcreditacion />
      </Suspense>
      <VoiceAgentLauncher waNumber={waNumber} waText={waText} />
    </>
  );
}

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
          <span>© {new Date().getFullYear()} Carga360go</span>
          <Link className="foot-legal" href="/legal">
            Legal y privacidad
          </Link>
        </div>
      </footer>
      <DockTardio waNumber={waNumber} waText={waText} />
    </>
  );
}
