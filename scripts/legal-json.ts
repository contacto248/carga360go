// Exporta en JSON el texto de la Política de Privacidad ("privacy") o de los Términos de uso ("terms") para scripts/export-legal-docs.py.
import { POLICY_INTRO, policyMeta, policySections } from "../src/lib/privacy-policy";
import { TERMS_INTRO, termsMeta, termsSections } from "../src/lib/terms";

const which = process.argv[2];
const data =
  which === "terms"
    ? { meta: termsMeta(), intro: TERMS_INTRO, sections: termsSections() }
    : { meta: { ...policyMeta(), path: "/privacidad" }, intro: POLICY_INTRO, sections: policySections() };
console.log(JSON.stringify(data));
