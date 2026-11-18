// Sustituto de next/script para la prueba de navegador: inserta el <script> (con src o en línea) una sola vez, como afterInteractive.
import { useEffect, type ReactNode } from "react";

export default function Script({ id, src, children }: { id?: string; src?: string; strategy?: string; children?: ReactNode }) {
  useEffect(() => {
    const key = id || src || "";
    if (key && document.querySelector(`script[data-e2e-key="${key}"]`)) return;
    const el = document.createElement("script");
    if (key) el.setAttribute("data-e2e-key", key);
    if (src) el.src = src;
    else el.text = String(children ?? "");
    document.body.appendChild(el);
  }, [id, src, children]);
  return null;
}
