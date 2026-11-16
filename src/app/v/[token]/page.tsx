import type { Metadata } from "next";
import { publicCheckpoint } from "@/lib/bassam/ops";

export const metadata: Metadata = { title: "Punto de control", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckpointPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = publicCheckpoint(token);
  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <div className="card">
        <p>CARGA360GO</p>
        {view ? (
          <>
            <h1>{view.pointLabel}</h1>
            <p>
              {view.origin} → {view.destination}
            </p>
            <p>{view.tripLabel}</p>
          </>
        ) : (
          <p>sin datos</p>
        )}
      </div>
    </div>
  );
}
