import { Fragment, type ReactNode } from "react";
import { POLICY_INTRO, policySections, type PolicyBlock, type PolicySection } from "@/lib/privacy-policy";
import { TERMS_INTRO, termsSections } from "@/lib/terms";

const LINKABLE = /(contacto@carga360go\.cl|https:\/\/carga360go\.cl\/politica-de-pagos|https:\/\/carga360go\.cl\/privacidad|https:\/\/carga360go\.cl\/terminos|https:\/\/carga360go\.cl)/g;

function linkify(text: string): ReactNode {
  return text.split(LINKABLE).map((part, index) => {
    if (part === "contacto@carga360go.cl") return <a key={index} href={`mailto:${part}`}>{part}</a>;
    if (part.startsWith("https://carga360go.cl")) return <a key={index} href={part.replace("https://carga360go.cl", "") || "/"}>{part}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function Block({ block }: { block: PolicyBlock }) {
  if (typeof block === "string") return <p>{linkify(block)}</p>;
  if ("list" in block) {
    return (
      <ul>
        {block.list.map((item) => (
          <li key={item}>{linkify(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <table className="tbl legal-tbl">
      <tbody>
        {block.table.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{linkify(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Texto legal completo: introducción, índice y secciones. `prefix` evita ids repetidos si se muestran dos textos juntos. */
export function LegalBody({ intro, sections, prefix = "" }: { intro: string[]; sections: PolicySection[]; prefix?: string }) {
  return (
    <>
      {intro.map((text) => (
        <p key={text}>{linkify(text)}</p>
      ))}
      <nav aria-label="Índice" className="legal-toc">
        <strong>Contenido</strong>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${prefix}${section.id}`}>{section.title.replace(/^\d+\.\s*/, "")}</a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((section) => (
        <section key={section.id} id={`${prefix}${section.id}`}>
          <h3>{section.title}</h3>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}
    </>
  );
}

/** Texto completo de la Política de Privacidad (página /privacidad y aviso de aceptación). */
export function PolicyBody({ prefix = "" }: { prefix?: string }) {
  return <LegalBody intro={POLICY_INTRO} sections={policySections()} prefix={prefix} />;
}

/** Texto completo de los Términos de uso (página /terminos y aviso de aceptación). */
export function TermsBody({ prefix = "" }: { prefix?: string }) {
  return <LegalBody intro={TERMS_INTRO} sections={termsSections()} prefix={prefix} />;
}
