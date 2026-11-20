import type { Metadata } from "next";
import Link from "next/link";
import { OrbitaVideo } from "@/components/OrbitaVideo";
import { PortadaInicio } from "@/components/PortadaInicio";
import { getCurrentUser } from "@/lib/current-user";
import styles from "./portada.module.css";

export const metadata: Metadata = {
  title: { absolute: "Plataforma tecnológica de carga en Chile · ÓRBITA Carga360go" },
  description:
    "Carga disponible en Chile y retorno de camiones en una plataforma tecnológica de carga y retorno.",
  alternates: { canonical: "/" },
};

const MODULES = [
  {
    href: "/cargas/nueva",
    title: "Publica en minutos",
    text: "Indica origen, destino y tipo de equipo. Los transportistas te encuentran.",
  },
  {
    href: "/cargas",
    title: "Elige el equipo justo",
    text: "Rampla plana, sider, furgón, cama baja, tolva o frigorífico.",
  },
  {
    href: "/como-verificamos",
    title: "Perfiles verificados",
    text: "Correo, teléfono, cédula y padrón revisados antes de operar.",
  },
  {
    href: "/camiones",
    title: "Retornos con carga",
    text: "Encuentra viajes de vuelta y deja de rodar vacío.",
  },
] as const;

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div>
      <PortadaInicio sesion={Boolean(user)} />
      <section className={styles.modules} aria-label="Módulos">
        <ul>
          {MODULES.map((item) => {
            const href =
              item.href === "/cargas/nueva" && !user
                ? `/ingreso?next=${encodeURIComponent("/cargas/nueva")}`
                : item.href;
            return (
              <li key={item.title}>
                <Link href={href}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <OrbitaVideo />
    </div>
  );
}
