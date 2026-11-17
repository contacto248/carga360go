---
description: "Suggested folder structure for the Carga360go project. Adapt to the actual repository layout."
connections: [tech-stack, components-and-apis]
---

# Folder Structure — Carga360go

Estructura típica recomendada (ajustar al repo real):

```
carga360go/
├── app/                      # o src/app/ (Next.js App Router)
│   ├── (public)/             # páginas públicas
│   │   ├── page.tsx          # home
│   │   ├── cargas/
│   │   ├── camiones/
│   │   ├── herramientas/
│   │   │   └── calculadora/
│   │   └── contacto/
│   ├── (auth)/               # login, registro
│   ├── panel/                # Mi panel (protegido)
│   ├── api/                  # route handlers
│   └── layout.tsx
├── components/
│   ├── ui/                   # componentes base (botones, cards, forms)
│   ├── features/             # carga, camión, calculadora, verificación
│   └── layout/
├── lib/
│   ├── supabase/             # o cliente API
│   ├── calculations/         # flete, peajes, costos
│   └── utils/
├── types/
├── public/
├── scripts/                  # utilidades de desarrollo
└── docs/                     # o referencias de proyecto
```

## Convenciones

- Componentes por feature cuando crezcan.
- Separar lógica de cálculo (flete) de UI.
- Usar tipos estrictos para cargas, camiones, documentos y usuarios.
- Mantener rutas alineadas con la navegación pública observada.

Ver `components-and-apis.md` para componentes y endpoints clave.
