import Link from "next/link";

export function AdminDenied({ next }: { next: string }) {
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="card">
        <h1>Sin acceso</h1>
        <p>Esta sección es solo para administradores de Carga360go.</p>
        <Link className="btn" href={`/ingreso?next=${next}`}>
          Ingresar
        </Link>
      </div>
    </div>
  );
}
