# Órbita — referencia de diseño

Maquetas estáticas del concepto Órbita. No forman parte del sitio Next.js.

Next publica rutas desde `src/app` y archivos desde `public/`. Esta carpeta está fuera de ambos, y `next.config.ts` no la reescribe. Abrir un HTML aquí no crea una ruta de carga360go.

| Carpeta | Qué es |
| --- | --- |
| `v1/` | Primera maqueta (HTML, CSS y JS). |
| `v2/` | Segunda maqueta. Negro, tipografía grande, geometría orbital. |
| `v3/` | Propuesta comercial revisada. Es la versión de referencia. |
| `SESSION.md` | Decisiones de dirección al 20-11-2026. |
| `README-original.md` | Notas que venían con la maqueta v3. |
| `SHA256.json` | Hashes de los archivos de esta carpeta. `SESSION.md` ya no coincide con el archivo del ZIP (`fdd8cd14…`): se quitó un correo antes de subirlo al repo público. |

Dirección: negro, blanco y gris. El naranjo queda solo para el agente. Las maquetas son demostración: no tienen backend, no publican cargas y no reemplazan la portada de la aplicación.

No desplegar estas carpetas. La capa que sí corre en la app es `src/app/orbita.module.css`, aplicada sobre la portada existente.
