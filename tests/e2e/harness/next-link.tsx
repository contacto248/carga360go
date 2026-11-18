// Sustituto de next/link para la prueba de navegador.
import type { AnchorHTMLAttributes } from "react";

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
