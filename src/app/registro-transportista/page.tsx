import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/RegisterForm";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = {
  title: "Postular como transportista",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegistroTransportistaPage() {
  const user = await getCurrentUser();
  return (
    <div className="wrap" style={{ padding: "24px 0 40px" }}>
      <h1>Postular a sus cargas</h1>
      <p>Registro de transportista para postular a las cargas de las empresas.</p>
      {user ? (
        <p>
          Ya tienes una sesión iniciada. <Link href="/panel">Ir al panel</Link>
        </p>
      ) : (
        <RegisterForm />
      )}
    </div>
  );
}
