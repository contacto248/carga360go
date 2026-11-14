import type { Metadata } from "next";
import Link from "next/link";
import { FreeBanner } from "@/components/FreeBanner";
import { RegisterForm } from "@/components/RegisterForm";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Registrar empresa o transportista", description: "Crea tu cuenta de transportista o de mandante en Carga360go y conecta con carga y camiones en todo Chile.", alternates: { canonical: "/registro" } };

export default async function RegistroPage() {
  const user = await getCurrentUser();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Registrar empresa o transportista</h1>
        <p>Valida tu RUT y luego sube tus documentos para el semáforo de vencimientos.</p>
      </div>
      <FreeBanner user={user} />
      <div className="notice" style={{ marginBottom: 12 }}>
        Las empresas que necesitan transporte se registran como mandante. Los transportistas confirman correo y teléfono y suben su documentación (cédula,
        licencia profesional, padrón, revisión técnica, SOAP y permiso de circulación); la cuenta se activa cuando un administrador la
        aprueba.
      </div>
      {user ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Ya tienes una sesión iniciada</h3>
          <p>
            Estás como {user.razonSocial}. Puedes ir al panel o salir para crear otra cuenta.
          </p>
          <Link className="btn" href={user.role === "transportista" && user.verificationStatus !== "verificado" ? "/cuenta-en-revision" : "/panel"}>
            Ir al panel
          </Link>
        </div>
      ) : (
        <RegisterForm />
      )}
    </div>
  );
}
