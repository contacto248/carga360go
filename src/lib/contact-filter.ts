const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// Secuencias de 8 o más dígitos (con espacios, puntos, guiones o +): teléfonos chilenos y similares.
const PHONE_RE = /(?<![$\d])\+?\d(?:[\s.\-()]*\d){7,}/g;

/** Quita correos, teléfonos y enlaces de textos libres para que el contacto no se filtre antes de adjudicar. */
export function stripContacts(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return text.replace(EMAIL_RE, "[contacto oculto]").replace(URL_RE, "[contacto oculto]").replace(PHONE_RE, "[contacto oculto]");
}
