"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";
import { BRAND } from "@/lib/catalog";

/**
 * Formulario de contacto de la tarjeta del agente.
 * No hay endpoint de captación de contactos en el repo (solo /api/chat, que recibe un mensaje de chat), y no se crea uno nuevo.
 * Al enviar se valida en el navegador y se abre el programa de correo del usuario con el mensaje ya redactado para BRAND.email:
 * los datos no salen del navegador hasta que la persona pulsa "enviar" en su propio correo.
 */
export function AgentLeadForm() {
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const body = [
      "Hola, quiero que me contacten.",
      "",
      `Nombre: ${String(data.get("nombre") || "").trim()}`,
      `Correo: ${String(data.get("correo") || "").trim()}`,
      `Teléfono: ${String(data.get("telefono") || "").trim()}`,
      "",
      "Acepto el tratamiento de estos datos según la Política de Privacidad.",
    ].join("\n");
    const subject = "Solicitud de contacto desde la portada";
    window.location.href = `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setDone(true);
  }

  return (
    <form className="bw-form" onSubmit={onSubmit} aria-labelledby="bw-form-h">
      <h4 id="bw-form-h">Deja tus datos y te contactamos</h4>
      <div className="bw-fields">
        <label>
          Nombre
          <input type="text" name="nombre" autoComplete="name" placeholder="Tu nombre" required />
        </label>
        <label>
          Correo
          <input type="email" name="correo" autoComplete="email" placeholder="tu@correo.cl" required />
        </label>
        <label>
          Teléfono
          <input type="tel" name="telefono" autoComplete="tel" placeholder="+56 9 …" required />
        </label>
      </div>
      <label className="bw-check">
        <input type="checkbox" name="consentimiento" required />
        <span>
          He leído la <Link href="/privacidad">Política de Privacidad</Link> y acepto que {BRAND.company} (RUT {BRAND.rut}) trate estos datos para
          responder mi solicitud.
        </span>
      </label>
      <p className="bw-note">
        Quién recibe los datos: {BRAND.company}, en {BRAND.email}. Al enviar se abre tu programa de correo con el mensaje listo; no enviamos tus datos
        a terceros ni a ningún otro servicio.
      </p>
      <button className="bw-btn bw-btn-light" type="submit">
        Preparar correo
      </button>
      <p className="bw-note" role="status" aria-live="polite">
        {done ? "Se abrió tu programa de correo. Revisa el mensaje y envíalo." : ""}
      </p>
    </form>
  );
}
