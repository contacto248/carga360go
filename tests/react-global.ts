// tsx compila el JSX con el runtime clásico (tsconfig jsx=preserve): los componentes necesitan `React` global para renderizarse en las pruebas.
import * as React from "react";

(globalThis as { React?: unknown }).React = React;
