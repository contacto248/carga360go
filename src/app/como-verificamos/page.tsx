import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Cómo verificamos cuentas y documentos",
  description:
    "Qué revisa Carga360go en una cuenta verificada y qué no garantiza esa revisión. Documentos, vigencia y límites claros.",
  alternates: { canonical: "/como-verificamos" },
};

export default function ComoVerificamosPage() {
  return (
    <div className="wrap legal" style={{ paddingBottom: 40 }}>
      <div className="page-title">
        <h1>Cómo verificamos cuentas y documentos</h1>
        <p>
          Verificado es una revisión documental y de contacto, hecha por un administrador. No es un sello de solvencia, de
          seguridad operacional ni de cumplimiento del transporte.
        </p>
      </div>

      <section>
        <h2>Qué pedimos para crear una cuenta</h2>
        <p>
          Pedimos datos verdaderos: nombre o razón social, RUT, correo, teléfono o WhatsApp, y región. Pedimos aceptar los{" "}
          <Link href="/terminos">Términos de uso</Link> y la <Link href="/privacidad">Política de privacidad</Link>. El
          correo se confirma con un código o enlace. Los transportistas, además, confirman su teléfono y suben cédula de
          identidad, licencia de conducir profesional, padrón, revisión técnica, SOAP y permiso de circulación. Si suben
          otros documentos (seguro de carga, certificados o cursos), también quedan sujetos a vigencia, pero no todos son
          requisito mínimo para abrir la cuenta.
        </p>
      </section>

      <section>
        <h2>Qué revisa un administrador</h2>
        <p>
          Un administrador revisa que los archivos sean legibles, que coincidan entre sí (por ejemplo, patente, RUT o
          nombre) y que no estén vencidos. El semáforo de documentos avisa 30 días antes del vencimiento. Documentos al día
          significa que los documentos aprobados de esa cuenta no están vencidos. Si un documento vence o es rechazado, la
          cuenta puede perder la facultad de publicar, ofertar o recibir contactos hasta regularizar.
        </p>
        <p>
          La aprobación de la cuenta es humana: no queda entregada solo a un sistema automático ni a una conversación por
          chat. Hoy no validamos en línea cada documento ante un registro oficial.
        </p>
      </section>

      <section>
        <h2>Qué no significa «verificado»</h2>
        <p>Una cuenta verificada no significa que Carga360go:</p>
        <ul>
          <li>certifique la situación financiera de una empresa o de un transportista;</li>
          <li>audite su sistema de gestión de calidad, seguridad o medio ambiente;</li>
          <li>inspeccione el camión en terreno ni la aptitud del conductor para una faena específica;</li>
          <li>valide en línea, por ahora, cada documento ante un registro oficial;</li>
          <li>garantice que el viaje se ejecute, que la carga llegue o que el pago se cumpla.</li>
        </ul>
        <p>
          Esas diligencias corresponden a las partes antes de contratar. La verificación de Carga360go no reemplaza
          permisos, seguros ni controles que exija la normativa o el mandante.
        </p>
      </section>

      <section>
        <h2>Contacto protegido</h2>
        <p>
          El contacto (WhatsApp, teléfono y correo) no se muestra en el listado. Se entrega solo al mandante y al
          transportista elegido cuando se adjudica una oferta. Si detectamos suplantación, documentos falsos o uso
          indebido, podemos rechazar, suspender o cerrar cuentas, según los términos.
        </p>
      </section>

      <p className="meta">
        {BRAND.company} · RUT {BRAND.rut} · <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
      </p>
    </div>
  );
}
