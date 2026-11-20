"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { REGIONS, citiesInRegion } from "@/lib/catalog";
import {
  LLAVE_BORRADOR,
  equiposDe,
  ingresoRetomando,
  inicioDePerfil,
  rutaConBorrador,
  serializarBorrador,
  validarBorrador,
  type BorradorPortada,
  type RolPortada,
} from "@/lib/portada-intencion";
import styles from "@/app/portada.module.css";

function guardar(borrador: BorradorPortada) {
  try {
    window.sessionStorage.setItem(LLAVE_BORRADOR, serializarBorrador(borrador));
  } catch {
    /* el enlace ya lleva la ruta */
  }
}

function destino(rol: RolPortada, resumen: BorradorPortada | null, sesion: boolean): string {
  const path = resumen && resumen.rol === rol ? rutaConBorrador(resumen) : inicioDePerfil(rol);
  return sesion ? path : ingresoRetomando(path);
}

export function PortadaInicio({ sesion }: { sesion: boolean }) {
  const [rol, setRol] = useState<RolPortada>("carga");
  const [origen, setOrigen] = useState("");
  const [destinoCiudad, setDestinoCiudad] = useState("");
  const [equipo, setEquipo] = useState("");
  const [resumen, setResumen] = useState<BorradorPortada | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const opciones = equiposDe(rol);

  useEffect(() => {
    setResumen(null);
  }, [rol, origen, destinoCiudad, equipo]);

  function elegirRol(next: RolPortada) {
    setRol(next);
    setEquipo("");
    setError("");
    setAviso("");
  }

  function intercambiar() {
    setOrigen(destinoCiudad);
    setDestinoCiudad(origen);
    setError("");
    if (resumen) setAviso("Intercambiaste origen y destino. El resumen anterior ya no vale: revísalo de nuevo.");
  }

  function revisar(event: React.FormEvent) {
    event.preventDefault();
    const parsed = validarBorrador({ rol, origen, destino: destinoCiudad, equipo });
    if ("error" in parsed) {
      setError(parsed.error);
      setResumen(null);
      return;
    }
    setError("");
    setAviso("");
    setResumen(parsed);
  }

  const hrefCarga = destino("carga", resumen, sesion);
  const hrefTransporte = destino("transporte", resumen, sesion);

  return (
    <>
      <section className={`hero-fold ${styles.hero}`} id="inicio">
        <div className={styles.heroGrid}>
          <div>
            <p className={`brand-hero ${styles.eyebrow}`}>El siguiente movimiento</p>
            <h1 className={styles.title}>
              Menos ruido.
              <br />
              <span>Más claridad.</span>
            </h1>
            <p className={styles.mission}>Que ningún camión vuelva vacío en Chile</p>
            <p className={styles.lead}>Conectamos tu carga con transporte verificado.</p>
            <p className={styles.support}>
              Tu carga. La ruta correcta, en un solo inicio. Carga360go conecta a mandantes y transportistas. No es transportista y no garantiza el viaje.
            </p>
            <div className={styles.ctaRow}>
              <Link className={styles.cta} href={hrefCarga} onClick={() => resumen?.rol === "carga" && guardar(resumen)}>
                Necesito transportar carga
              </Link>
              <Link
                className={styles.cta}
                href={hrefTransporte}
                onClick={() => resumen?.rol === "transporte" && guardar(resumen)}
              >
                Soy transportista
              </Link>
            </div>
            <p className={styles.estimate}>
              <Link href="/herramientas/calculadora">Estimar un flete</Link>
              <span>Es una referencia de costo, no una tarifa ni una contratación.</span>
            </p>
            <p className={styles.under}>
              <span>Diseñada para Chile</span>
              <span>Dos caminos. Una plataforma.</span>
            </p>
          </div>
          <div className={styles.visual} aria-label="Visualización conceptual de una ruta">
            <div className={styles.visualTop}>
              <span>Una ruta. Un nuevo comienzo.</span>
              <span className={styles.demoTag}>Demostración</span>
            </div>
            <img
              className={styles.logo}
              src="/brand/orbita-carga360go.jpg"
              alt="ORBITA - CARGA360GO"
              width={280}
              height={280}
            />
            <DiagramaRuta />
            <p className={styles.routeNote}>Visualización ilustrativa, no es GPS real.</p>
          </div>
        </div>
      </section>

      <section id="soluciones" className={styles.start}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Menos pasos. Más claridad.</p>
            <h2>Comienza con tu ruta.</h2>
          </div>
          <p>Elige perfil, origen, destino y tipo. Puedes revisar el resumen antes de continuar. Nada se publica ni se envía.</p>
        </div>
        <div className={styles.workspace}>
          <form className={styles.form} onSubmit={revisar} lang="es-CL">
            <div className={styles.tabs} role="tablist" aria-label="Perfil">
              <button type="button" role="tab" aria-selected={rol === "carga"} onClick={() => elegirRol("carga")}>
                Tengo carga
              </button>
              <button type="button" role="tab" aria-selected={rol === "transporte"} onClick={() => elegirRol("transporte")}>
                Tengo transporte
              </button>
            </div>
            <div className={styles.formHead}>
              <h3>{rol === "carga" ? "¿De dónde a dónde?" : "¿Dónde quieres operar?"}</h3>
              <span>Vista previa</span>
            </div>
            <div className={styles.fields}>
              <label>
                Origen
                <Ciudades id="origen" value={origen} onChange={setOrigen} />
              </label>
              <button className={styles.swap} type="button" onClick={intercambiar} aria-label="Intercambiar origen y destino">
                ⇄
              </button>
              <label>
                Destino
                <Ciudades id="destino" value={destinoCiudad} onChange={setDestinoCiudad} />
              </label>
            </div>
            <fieldset className={styles.equipos}>
              <legend>{rol === "carga" ? "Tipo de carga" : "Tipo de equipo"}</legend>
              <div role="radiogroup" aria-label={rol === "carga" ? "Tipo de carga" : "Tipo de equipo"}>
                {opciones.map((item) => {
                  const on = equipo === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={on ? styles.equipoOn : styles.equipo}
                      onClick={() => setEquipo(item.id)}
                    >
                      <EquipoIcon id={item.id} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <button className={styles.cta} type="submit">
              Ver mi resumen
            </button>
            <p id="error-ruta" className={styles.error} role="alert">
              {error}
            </p>
            {aviso ? <p className={styles.aviso}>{aviso}</p> : null}
            <p className={styles.privacy}>Solo se anota en este navegador para retomar el formulario. Nada se publica, almacena en el servidor ni envía.</p>
          </form>
          <aside className={styles.summary} aria-live="polite">
            <span className={styles.kicker}>Tu próximo movimiento</span>
            {resumen ? (
              <>
                <p className={styles.routeValue}>
                  {resumen.origen} / {resumen.destino}
                </p>
                <span className={styles.tag}>{equiposDe(resumen.rol).find((item) => item.id === resumen.equipo)?.label}</span>
                <p>
                  {resumen.rol === "carga"
                    ? "Al continuar entras al formulario de carga, con estos datos. Si no hay sesión, primero ingresas y después se retoma."
                    : "Al continuar entras al formulario de camión, con estos datos. Si no hay sesión, primero ingresas y después se retoma."}
                </p>
                <p>
                  <strong>Nada se ha publicado ni enviado.</strong>
                </p>
                <Link className={styles.cta} href={destino(resumen.rol, resumen, sesion)} onClick={() => guardar(resumen)}>
                  Continuar con estos datos
                </Link>
              </>
            ) : (
              <>
                <h3>Una solicitud clara empieza aquí.</h3>
                <p>Elige tu perfil y tu ruta. Podrás revisar todo antes de dar el siguiente paso.</p>
              </>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

function DiagramaRuta() {
  return (
    <svg className={styles.diagram} viewBox="0 0 360 72" role="img" aria-label="Origen, carga y destino">
      <title>Origen, carga y destino</title>
      <line x1="28" y1="22" x2="332" y2="22" stroke="#fff" strokeWidth="2" />
      <circle cx="28" cy="22" r="6" fill="#fff" />
      <circle cx="180" cy="22" r="7" fill="#ff7822" />
      <circle cx="332" cy="22" r="6" fill="#fff" />
      <text x="28" y="52" textAnchor="middle" fill="#fff" fontSize="14">
        Origen
      </text>
      <text x="180" y="52" textAnchor="middle" fill="#ff7822" fontSize="14">
        Carga
      </text>
      <text x="332" y="52" textAnchor="middle" fill="#fff" fontSize="14">
        Destino
      </text>
    </svg>
  );
}

function EquipoIcon({ id }: { id: string }) {
  return (
    <svg className={styles.icon} viewBox="0 0 64 36" aria-hidden="true">
      <rect x="4" y="14" width="18" height="12" rx="2" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path d="M22 18h10l6 8H22" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="28" r="3" fill="#ff7822" />
      <circle cx="30" cy="28" r="3" fill="#fff" />
      {id === "cama_baja" ? <line x1="8" y1="22" x2="20" y2="22" stroke="#ff7822" strokeWidth="2" /> : null}
      {id === "tolva" ? <path d="M8 14 L14 8 H20 L22 14" fill="none" stroke="#ff7822" strokeWidth="1.6" /> : null}
      {id === "refrigerado" ? <rect x="8" y="17" width="8" height="5" fill="#ff7822" /> : null}
      {id === "sider" ? <line x1="8" y1="16" x2="8" y2="24" stroke="#ff7822" strokeWidth="2" /> : null}
      {id === "furgon_seco" ? <rect x="6" y="12" width="14" height="14" fill="none" stroke="#ff7822" strokeWidth="1.4" /> : null}
    </svg>
  );
}

function Ciudades({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">Selecciona una ciudad</option>
      {REGIONS.map((region) => (
        <optgroup key={region.id} label={region.name}>
          {citiesInRegion(region.id).map((city) => (
            <option key={city.name} value={city.name}>
              {city.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
