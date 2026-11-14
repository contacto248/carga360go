import { getDb } from "../src/lib/db";
import { hashPassword, loginUser, registerUser, type RegisterInput } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";
import { todayChile } from "../src/lib/format";
import { createLoad, createTruck, type LoadInput, type TruckInput } from "../src/lib/listings";
import type { PublicUser } from "../src/lib/types";

if (process.env.SEED_DEV !== "1") {
  console.error("Define SEED_DEV=1 para cargar datos de desarrollo. No se ejecuta solo.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
  console.error("En producción este seed está bloqueado. No mezcles avisos DEMO con datos reales.");
  process.exit(1);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ensure(input: RegisterInput, password: string): PublicUser {
  const email = input.email.trim().toLowerCase();
  const existing = getDb().prepare(`SELECT id FROM users WHERE email = ?`).get(email) as { id: string } | undefined;
  if (!existing) {
    const created = registerUser(input).user;
    getDb().prepare(`UPDATE users SET verification_status = 'verificado' WHERE id = ?`).run(created.id);
    return { ...created, verificationStatus: "verificado" as const };
  }
  getDb()
    .prepare(`UPDATE users SET password_hash = ?, verification_status = 'verificado', login_failures = 0, locked_until = NULL WHERE id = ?`)
    .run(hashPassword(password), existing.id);
  return loginUser(email, password).user;
}

const today = todayChile();
const day = (offset: number) => addDays(today, offset);
const passT = process.env.SEED_PASSWORD_TRANSPORTISTA || "Demo-Trans-2026";
const passM = process.env.SEED_PASSWORD_MANDANTE || "Demo-Manda-2026";

const mandante = ensure(
  {
    role: "mandante",
    razonSocial: "Empresa con carga ejemplo (DEMO)",
    rut: "15.555.555-6",
    contactName: "Mandante demo",
    email: "mandante@demo.local",
    password: passM,
    whatsapp: "+56 9 2000 0001",
    city: "Calama",
  },
  passM,
);
const transportista = ensure(
  {
    role: "transportista",
    razonSocial: "Transportes ejemplo (DEMO)",
    rut: "20.111.222-2",
    contactName: "Transportista demo",
    email: "transportista@demo.local",
    password: passT,
    whatsapp: "+56 9 2000 0002",
    city: "Antofagasta",
  },
  passT,
);

getDb().prepare(`DELETE FROM loads WHERE is_demo = 1`).run();
getDb().prepare(`DELETE FROM trucks WHERE is_demo = 1`).run();

const loads: LoadInput[] = [
  {
    origin: "Calama",
    destination: "Antofagasta",
    pickupDate: day(2),
    equipment: "cama_baja",
    description: "Excavadora para mantención en taller",
    weightT: 38,
    specs: { maquina: "Excavadora", largoM: 11.5, anchoM: 3.4, altoM: 3.7, ejesMin: 3, requiereRampas: true, requiereAcreditacion: true },
  },
  {
    origin: "Antofagasta",
    destination: "Santiago",
    pickupDate: day(4),
    equipment: "rampla_plana",
    description: "Perfiles de acero estructural",
    weightT: 26,
    specs: { largoM: 12, anchoM: 2.5, requiereCarpa: true },
  },
  {
    origin: "Copiapó",
    destination: "Santiago",
    pickupDate: day(3),
    equipment: "refrigerado",
    description: "Uva de mesa embalada",
    weightT: 24,
    specs: { tempReq: 0, pallets: 22, producto: "Fruta fresca" },
  },
  {
    origin: "Calama",
    destination: "Mejillones",
    pickupDate: day(1),
    equipment: "tolva",
    description: "Concentrado de cobre",
    weightT: 30,
    specs: { volumenM3: 22, material: "Concentrados" },
  },
  {
    origin: "Iquique",
    destination: "Santiago",
    pickupDate: day(5),
    equipment: "sider",
    description: "Mercadería paletizada",
    weightT: 20,
    specs: { pallets: 24, cargaLateral: true },
  },
  {
    origin: "Mejillones",
    destination: "Calama",
    pickupDate: day(3),
    equipment: "estanque",
    description: "Combustible a planta industrial",
    weightT: 28,
    specs: { volumenM3: 30, producto: "Combustible", requiereBomba: true },
  },
  {
    origin: "San Antonio",
    destination: "Santiago",
    pickupDate: day(2),
    equipment: "portacontenedor",
    description: "Contenedor 40' desde puerto",
    weightT: 26,
    specs: { tamano: "40'", cantidad: 1 },
  },
  {
    origin: "Santiago",
    destination: "La Serena",
    pickupDate: day(6),
    equipment: "portaautos",
    description: "Camionetas 0 km",
    weightT: 12,
    specs: { vehiculos: 5, tipoVehiculo: "Camioneta" },
  },
  {
    origin: "Antofagasta",
    destination: "Calama",
    pickupDate: day(2),
    equipment: "peligrosa",
    description: "Ácido sulfúrico a granel (demo)",
    weightT: 25,
    specs: { clase: 8, onu: "1830" },
  },
];

const trucks: TruckInput[] = [
  {
    origin: "Calama",
    destination: "Antofagasta",
    availableFrom: day(1),
    availableTo: day(4),
    equipment: "cama_baja",
    tonnage: 45,
    specs: { ejes: 4, largoM: 13, anchoM: 3, anchoExtM: 3.6, alturaCamaCm: 95, rampas: true, winche: true },
  },
  {
    origin: "Antofagasta",
    destination: "Santiago",
    availableFrom: day(3),
    availableTo: day(7),
    equipment: "rampla_plana",
    tonnage: 28,
    specs: { largoM: 13.5, anchoM: 2.6, ejes: 3, carpa: true },
  },
  {
    origin: "Copiapó",
    destination: "Santiago",
    availableFrom: day(2),
    availableTo: day(5),
    equipment: "refrigerado",
    tonnage: 26,
    specs: { tempMin: -20, tempMax: 15, pallets: 24, grupoFrio: "Thermo King", resSanitaria: true },
  },
  {
    origin: "Calama",
    destination: "Mejillones",
    availableFrom: day(0),
    availableTo: day(3),
    equipment: "tolva",
    tonnage: 32,
    specs: { volumenM3: 25, material: "Concentrados", volcable: true },
  },
  {
    origin: "Iquique",
    destination: "Santiago",
    availableFrom: day(4),
    availableTo: day(8),
    equipment: "sider",
    tonnage: 27,
    specs: { largoM: 13.6, anchoM: 2.45, altoM: 2.7, pallets: 28, volumenM3: 90 },
  },
  {
    origin: "Mejillones",
    destination: "Calama",
    availableFrom: day(2),
    availableTo: day(4),
    equipment: "estanque",
    tonnage: 30,
    specs: { volumenM3: 32, producto: "Multiproducto", compartimentos: 3, bomba: true },
  },
  {
    origin: "San Antonio",
    destination: "Santiago",
    availableFrom: day(1),
    availableTo: day(3),
    equipment: "portacontenedor",
    tonnage: 30,
    specs: { tamano: "20' y 40'", twistlocks: true },
  },
  {
    origin: "Santiago",
    destination: "Coquimbo",
    availableFrom: day(5),
    availableTo: day(9),
    equipment: "portaautos",
    tonnage: 14,
    specs: { vehiculos: 6 },
  },
  {
    origin: "Antofagasta",
    destination: "Calama",
    availableFrom: day(2),
    availableTo: day(3),
    equipment: "peligrosa",
    tonnage: 27,
    specs: { clases: "3, 8", autorizacion: true, formato: "Estanque" },
  },
  {
    origin: "Santiago",
    destination: "Valparaíso",
    availableFrom: day(0),
    availableTo: day(2),
    equipment: "camion_34",
    tonnage: 3,
    specs: { carroceria: "Barandas", largoM: 4.2, volumenM3: 18 },
  },
];

try {
  for (const load of loads) createLoad(mandante, load, true);
  for (const truck of trucks) createTruck(transportista, truck, true);
} catch (error) {
  const message = error instanceof AppError || error instanceof Error ? error.message : "No se pudo sembrar";
  console.error(message);
  process.exit(1);
}

console.log("Seed de desarrollo listo. Los avisos llevan la marca DEMO y no deben usarse en producción.");
console.log(`Mandante: mandante@demo.local`);
console.log(`Transportista: transportista@demo.local`);
console.log("Contraseñas: SEED_PASSWORD_MANDANTE / SEED_PASSWORD_TRANSPORTISTA o los valores por defecto impresos en el README.");
