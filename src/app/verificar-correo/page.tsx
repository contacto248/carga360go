import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerification } from "@/components/ResendVerification";
import { getCurrentUser } from "@/lib/current-user";
import { firstParam } from "@/lib/format";
import { emailTokenState } from "@/lib/verification";

export const metadata: Metadata = { title: "Confirmar correo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerificarCorreoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = firstParam(sp.token);
  const estado = firstParam(sp.estado);
  // Abrir el enlace (GET) no consume el token: los antivirus del correo lo abren antes que la persona.
  const state = estado === "ok" ? "verificado" : estado === "error" ? "invalido" : token ? emailTokenState(token) : "sin-token";
  const user = await getCurrentUser();
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="page-title">
        <h1>Verificación de correo</h1>
      </div>
      <div className="card">
        {state === "valido" ? (
          <>
            <h3>Confirma tu correo</h3>
            <p>Presiona el botón para terminar de confirmar tu correo en Carga360go.</p>
            <form method="post" action="/api/verificacion/correo/confirmar">
              <input type="hidden" name="token" value={token} />
              <button className="btn" type="submit">
                Confirmar mi correo
              </button>
            </form>
          </>
        ) : state === "verificado" ? (
          <>
            <h3>✓ Correo verificado</h3>
            <p>Gracias. Tu correo quedó confirmado en Carga360go.</p>
            <Link className="btn" href={user ? "/cuenta-en-revision" : "/ingreso?next=/cuenta-en-revision"}>
              {user ? "Ir a mi cuenta" : "Ingresar"}
            </Link>
          </>
        ) : (
          <>
            <h3>{state === "sin-token" ? "Reenviar correo de verificación" : "El enlace no es válido o ya venció"}</h3>
            <p>
              {state === "sin-token"
                ? "Escribe el correo con que te registraste y te enviamos un enlace nuevo (vale 48 horas)."
                : "Pide un enlace nuevo: vale 48 horas. Si pediste varios, usa el más reciente."}
            </p>
            {user && !user.emailVerifiedAt ? (
              <ResendVerification email={user.email} loggedIn />
            ) : user ? (
              <p className="okmsg">Tu correo {user.email} ya está verificado.</p>
            ) : (
              <ResendVerification />
            )}
          </>
        )}
      </div>
    </div>
  );
}
