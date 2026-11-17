# AI.CARGA360

Único agente visible de Carga360go. La ruta `/agente-360go` es AI.CARGA360. La conversación queda en el dispositivo y se puede borrar desde la pantalla. No hace falta la clave para abrir la pantalla.

La consulta usa la misma sesión del sitio. Sin sesión, la API responde 401. El cupo diario persiste en la base. El historial que acepta el servidor es de 6 turnos y cada mensaje, de 400 caracteres.

## iPhone 14 Pro

1. Abra Safari y entre a `https://www.carga360go.cl/agente-360go`.
2. Toque Compartir.
3. Elija Agregar a inicio.
4. Abra AI.CARGA360 desde el inicio. La pantalla usa el área segura del iPhone 14 Pro (393×852).

## Windows 11 con Edge

1. Abra Microsoft Edge y entre a `https://www.carga360go.cl/agente-360go`.
2. En la barra de direcciones, use el icono de instalar aplicación. Si no aparece: menú … → Aplicaciones → Instalar AI.CARGA360.
3. Confirme Instalar. La app queda en el menú Inicio.

## Servidor

La clave se lee al atender cada mensaje. Si el proyecto ya apunta `AI_BASE_URL` a `https://api.x.ai` y define `AI_API_KEY`, se usa esa variable. Si no, se usa `XAI_API_KEY`. No escriba el valor en el repositorio.

Si la clave no está, la pantalla avisa que falta configurarla y el chat no se cae.

WhatsApp usa el token que la plataforma ya tiene. Si no está, el chat sigue y no se inventan credenciales.
