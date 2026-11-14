"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap">
      <div className="empty">
        <h1>No pudimos cargar esta página</h1>
        <p>Intenta de nuevo. Si el problema sigue, escribe a contacto@carga360go.cl.</p>
        <button className="btn" type="button" onClick={() => reset()}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
