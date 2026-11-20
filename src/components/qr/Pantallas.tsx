"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export type VistaCliente = {
  loadId: string;
  rol: string;
  estado: string;
  folio: string | null;
  origen: string;
  destino: string;
  retiro: string;
  qrSvg: string | null;
  segundos: number;
  codigo: string | null;
  chofer: { nombre: string; empresa: string; patente: string; iniciales: string; foto: boolean } | null;
  esperandoConfirmacion: boolean;
  retiroValidado: boolean;
  puedeConfirmarTrato: boolean;
  puedeAsignar: boolean;
  puedeReasignar: boolean;
  puedeEscanear: boolean;
  delegadoHabilitado: boolean;
  camiones: { id: string; label: string; patente: string | null }[];
  viaje: string | null;
  enlace?: string | null;
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "No se pudo completar.");
  return data;
}

function Shell(props: { children: ReactNode }) {
  return (
    <div className="qr-app">
      <div className="qr-top">
        <span className="qr-brand">Carga360go</span>
        <span className="qr-muted">Retiro</span>
      </div>
      {props.children}
    </div>
  );
}

function Chofer(props: { chofer: NonNullable<VistaCliente["chofer"]>; loadId: string; fotoSrc?: string }) {
  return (
    <div className="qr-card">
      <div className="qr-person">
        {props.chofer.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="qr-avatar" alt="" src={props.fotoSrc || `/api/viajes/${props.loadId}/chofer-foto`} />
        ) : (
          <div className="qr-avatar" aria-hidden="true">
            {props.chofer.iniciales}
          </div>
        )}
        <div>
          <strong>{props.chofer.nombre} · chofer</strong>
          <div className="qr-muted">{props.chofer.empresa}</div>
        </div>
      </div>
      <div className="qr-row">
        <span className="qr-muted">Patente</span>
        <span>{props.chofer.patente}</span>
      </div>
      <div className="qr-row">
        <span className="qr-muted">Documentos</span>
        <span>Revisados por Carga360go</span>
      </div>
    </div>
  );
}

export function ComprobanteScreen(props: { initial: VistaCliente; pollUrl: string; confirmarUrl: string; fotoSrc?: string }) {
  const [vista, setVista] = useState(props.initial);
  const [segundos, setSegundos] = useState(props.initial.segundos);
  const [codigoVisible, setCodigoVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [enlace, setEnlace] = useState(props.initial.enlace || "");

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSegundos((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (segundos > 0 && !vista.esperandoConfirmacion) return;
    let cancel = false;
    fetch(props.pollUrl, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: VistaCliente) => {
        if (cancel || !data || data.estado == null) return;
        setVista(data);
        setSegundos(data.segundos || 30);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [segundos, vista.esperandoConfirmacion, props.pollUrl]);

  async function confirmar(decision: "entrego" | "no_coincide") {
    setPending(true);
    setError("");
    try {
      await postJson(props.confirmarUrl, { decision });
      const fresh = (await fetch(props.pollUrl, { cache: "no-store" }).then((response) => response.json())) as VistaCliente;
      setVista(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setPending(false);
    }
  }

  async function crearEnlace() {
    setPending(true);
    setError("");
    try {
      const data = (await postJson(`/api/viajes/${vista.loadId}/delegados`, {})) as { path?: string } | null;
      if (data?.path) setEnlace(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el enlace.");
    } finally {
      setPending(false);
    }
  }

  const estado =
    vista.retiroValidado ? "Retiro validado" : vista.esperandoConfirmacion ? "Chofer validado" : vista.estado === "cerrado" ? "Trato cerrado" : vista.estado === "pendiente_confirmacion" ? "Esperando confirmación" : "Trato no vigente";

  return (
    <Shell>
      <span className="qr-pill">{estado}</span>
      <h1 className="qr-folio">{vista.folio || "Sin folio todavía"}</h1>
      <div className="qr-row">
        <span className="qr-muted">Ruta</span>
        <span>
          {vista.origen} → {vista.destino}
        </span>
      </div>
      <div className="qr-row">
        <span className="qr-muted">Retiro</span>
        <span>{vista.retiro}</span>
      </div>
      {vista.estado === "pendiente_confirmacion" ? (
        <p>El transportista tiene que confirmar el trato. Recién ahí aparece el QR de retiro.</p>
      ) : null}
      {vista.qrSvg && !codigoVisible && !vista.esperandoConfirmacion ? (
        <>
          <div className="qr-qr" dangerouslySetInnerHTML={{ __html: vista.qrSvg }} />
          <p className="qr-muted" style={{ textAlign: "center" }}>
            Se renueva en {segundos} s · sirve una sola vez
          </p>
        </>
      ) : null}
      {codigoVisible && vista.codigo ? (
        <>
          <div className="qr-code">{formatCode(vista.codigo)}</div>
          <p className="qr-muted" style={{ textAlign: "center" }}>
            Cambia en {segundos} s. Díctalo solo al chofer asignado, después de comparar su foto y la patente.
          </p>
        </>
      ) : null}
      {vista.chofer ? <Chofer chofer={vista.chofer} loadId={vista.loadId} fotoSrc={props.fotoSrc} /> : <p className="qr-muted">Todavía no hay chofer asignado.</p>}
      {vista.esperandoConfirmacion ? (
        <>
          <p>El QR fue escaneado por el chofer asignado, en el camión asignado. ¿La persona y la patente coinciden con lo que ves?</p>
          <button className="qr-btn" type="button" disabled={pending} onClick={() => confirmar("entrego")}>
            Sí, entrego la carga
          </button>
          <button className="qr-btn sec" type="button" disabled={pending} onClick={() => confirmar("no_coincide")}>
            No coincide · reportar
          </button>
        </>
      ) : null}
      {vista.qrSvg ? (
        <button className="qr-btn sec" type="button" onClick={() => setCodigoVisible((value) => !value)}>
          {codigoVisible ? "Volver al QR" : "Usar código sin conexión"}
        </button>
      ) : null}
      {vista.folio ? (
        <a className="qr-btn sec" href={`/api/viajes/${vista.loadId}/comprobante/pdf`}>
          Descargar comprobante PDF
        </a>
      ) : null}
      {vista.delegadoHabilitado ? (
        <button className="qr-btn sec" type="button" disabled={pending} onClick={crearEnlace}>
          Enlace para quien entrega en bodega
        </button>
      ) : null}
      {enlace ? <p className="qr-muted">Enlace de un solo uso: {enlace}. Deja de servir cuando se confirma el retiro.</p> : null}
      <p className="qr-muted">Este comprobante no reemplaza la guía de despacho del SII. El QR no lleva nombres, RUT, teléfonos ni montos.</p>
      {error ? (
        <p className="qr-alert" role="alert">
          {error}
        </p>
      ) : null}
    </Shell>
  );
}

export function EscanerScreen(props: { initial: VistaCliente }) {
  const [vista, setVista] = useState(props.initial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [codigo, setCodigo] = useState(["", "", "", "", "", ""]);
  const [manual, setManual] = useState(false);
  const [reasignar, setReasignar] = useState(false);
  const [cameraNote, setCameraNote] = useState("");
  const [nombre, setNombre] = useState("");
  const [truckId, setTruckId] = useState(vista.camiones[0]?.id || "");
  const [patente, setPatente] = useState(vista.camiones[0]?.patente || "");
  const [otp, setOtp] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const chosen = vista.camiones.find((item) => item.id === truckId);
    if (chosen?.patente) setPatente(chosen.patente);
  }, [truckId, vista.camiones]);

  useEffect(() => {
    if (!vista.puedeEscanear || manual) return;
    let stop = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!video || !navigator.mediaDevices?.getUserMedia || !Detector) {
      setCameraNote("Este navegador no abre la cámara. Ingresa el código de 6 dígitos.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((media) => {
        if (stop) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        video.srcObject = media;
        return video.play();
      })
      .catch(() => setCameraNote("No pudimos usar la cámara. Ingresa el código de 6 dígitos."));
    const detector = new Detector({ formats: ["qr_code"] });
    const timer = window.setInterval(async () => {
      if (!video || video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        const raw = codes.find((item) => item.rawValue.startsWith("c360:r1."))?.rawValue;
        if (raw) {
          window.clearInterval(timer);
          await enviar({ token: raw, patente: vista.chofer?.patente || patente });
        }
      } catch {
        setCameraNote("No pudimos leer el QR con esta cámara. Ingresa el código de 6 dígitos.");
      }
    }, 700);
    return () => {
      stop = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // enviar se redefine; el efecto cubre el arranque de la cámara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.puedeEscanear, manual]);

  async function enviar(body: { token?: string; codigo?: string; patente: string; sinSenal?: boolean }) {
    setPending(true);
    setError("");
    const payload = { ...body, deviceTime: new Date().toISOString(), deviceId: "navegador" };
    try {
      await postJson(`/api/viajes/${vista.loadId}/retiro/validar`, payload);
      window.localStorage.removeItem(`c360-qr-${vista.loadId}`);
      setError("");
      setVista({ ...vista, puedeEscanear: false });
      setManual(false);
    } catch (err) {
      const offline = err instanceof TypeError;
      if (offline && body.codigo) {
        window.localStorage.setItem(`c360-qr-${vista.loadId}`, JSON.stringify({ ...payload, sinSenal: true }));
        setError("Sin conexión. Guardamos el código en este teléfono y lo verificamos cuando vuelva la señal.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo validar.");
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const raw = window.localStorage.getItem(`c360-qr-${vista.loadId}`);
    if (!raw) return;
    const flush = () => {
      const saved = window.localStorage.getItem(`c360-qr-${vista.loadId}`);
      if (!saved) return;
      postJson(`/api/viajes/${vista.loadId}/sync`, JSON.parse(saved) as unknown)
        .then(() => window.localStorage.removeItem(`c360-qr-${vista.loadId}`))
        .catch(() => undefined);
    };
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, [vista.loadId]);

  async function llegar() {
    setPending(true);
    setError("");
    try {
      await postJson(`/api/cargas/${vista.loadId}/viaje`, { status: "en_camino" });
      const fresh = (await fetch(`/api/viajes/${vista.loadId}/comprobante`, { cache: "no-store" }).then((r) => r.json())) as VistaCliente;
      setVista(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar la salida.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <span className="qr-pill">{vista.folio ? `Retiro · ${vista.folio}` : "Trato"}</span>
      {vista.puedeConfirmarTrato ? (
        <form
          className="qr-card"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            postJson(`/api/viajes/${vista.loadId}/trato/confirmar`, { codigo: otp })
              .then(() => fetch(`/api/viajes/${vista.loadId}/comprobante`, { cache: "no-store" }))
              .then((response) => response.json())
              .then((data: VistaCliente) => setVista(data))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo confirmar."))
              .finally(() => setPending(false));
          }}
        >
          <p>El mandante aceptó tu oferta. Confirma el trato con el código que te enviamos por correo.</p>
          <label className="f">
            Código de 6 dígitos
            <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required />
          </label>
          <button className="qr-btn" type="submit" disabled={pending}>
            Confirmar trato
          </button>
          <button
            className="qr-btn sec"
            type="button"
            disabled={pending}
            onClick={() => postJson(`/api/viajes/${vista.loadId}/trato/codigo`, {}).then(() => setError("")).catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo reenviar."))}
          >
            Enviar el código otra vez
          </button>
        </form>
      ) : null}
      {vista.puedeReasignar && !reasignar ? (
        <button className="qr-btn sec" type="button" onClick={() => setReasignar(true)}>
          Reasignar chofer o camión
        </button>
      ) : null}
      {vista.puedeAsignar || reasignar ? (
        <form
          className="qr-card"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            postJson(`/api/viajes/${vista.loadId}/asignacion`, { nombre, truckId, patente })
              .then(() => fetch(`/api/viajes/${vista.loadId}/comprobante`, { cache: "no-store" }))
              .then((response) => response.json())
              .then((data: VistaCliente) => setVista(data))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo asignar."))
              .finally(() => setPending(false));
          }}
        >
          <p>Asigna al chofer y al camión. Si cambias la patente, el QR anterior deja de servir.</p>
          <label className="f">
            Nombre del chofer
            <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Juan Pérez" required />
          </label>
          <label className="f">
            Camión
            <select value={truckId} onChange={(event) => setTruckId(event.target.value)} required>
              <option value="">Elige</option>
              {vista.camiones.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.label}
                  {truck.patente ? ` · ${truck.patente}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Patente
            <input value={patente} onChange={(event) => setPatente(event.target.value.toUpperCase())} placeholder="KJTR42" required />
          </label>
          <button className="qr-btn" type="submit" disabled={pending}>
            Asignar chofer y camión
          </button>
        </form>
      ) : null}
      {vista.chofer && vista.viaje !== "en_camino" && !vista.puedeConfirmarTrato ? (
        <button className="qr-btn" type="button" disabled={pending} onClick={llegar}>
          Llegué al origen
        </button>
      ) : null}
      {vista.puedeEscanear ? (
        <>
          <div className="qr-scan">
            <video ref={videoRef} muted playsInline />
            <span className="qr-corner a" />
            <span className="qr-corner b" />
            <span className="qr-corner c" />
            <span className="qr-corner d" />
            <p>Apunta al QR del comprobante</p>
          </div>
          <div className="qr-card">
            <div className="qr-row">
              <span className="qr-muted">Tu camión asignado</span>
              <span>{vista.chofer?.patente}</span>
            </div>
          </div>
          <p className="qr-muted">Solo funciona con la sesión del chofer asignado. Si cambia el camión, la empresa debe reasignar antes de escanear.</p>
          {cameraNote ? <p className="qr-alert">{cameraNote}</p> : null}
          <button className="qr-btn sec" type="button" onClick={() => setManual(true)}>
            Ingresar código de 6 dígitos
          </button>
        </>
      ) : null}
      {manual && vista.chofer ? (
        <form
          className="qr-card"
          onSubmit={(event) => {
            event.preventDefault();
            enviar({ codigo: codigo.join(""), patente: vista.chofer?.patente || patente });
          }}
        >
          <p>Código que te dicta quien entrega la carga</p>
          <div className="qr-digits">
            {codigo.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  boxes.current[index] = node;
                }}
                inputMode="numeric"
                maxLength={1}
                value={digit}
                aria-label={`Dígito ${index + 1}`}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(-1);
                  const copy = [...codigo];
                  copy[index] = next;
                  setCodigo(copy);
                  if (next) boxes.current[index + 1]?.focus();
                }}
              />
            ))}
          </div>
          <button className="qr-btn" type="submit" disabled={pending || codigo.join("").length < 6}>
            Registrar retiro
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="qr-alert" role="alert">
          {error}
        </p>
      ) : null}
    </Shell>
  );
}
