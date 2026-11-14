import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/PasswordForms";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function RecuperarPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>¿Olvidaste tu contraseña?</h1>
        <p>
          Escribe el correo de tu cuenta. Si está registrado, te enviamos un enlace para elegir una nueva. El enlace dura una hora y las
          sesiones anteriores se cierran al usarlo.
        </p>
      </div>
      <ForgotForm />
      <p className="meta" style={{ marginTop: 12 }}>
        ¿Recordaste la clave? <Link href="/ingreso">Volver a ingresar</Link>
      </p>
    </div>
  );
}
