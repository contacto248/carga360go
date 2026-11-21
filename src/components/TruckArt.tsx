/**
 * Ilustraciones propias (SVG, línea plana) de cada tipo de equipo, vista lateral.
 * Paleta pública: trazo del texto, naranjo #FF5001 y gris. Sin azul.
 */
const NAVY = "#f4f4f4";
const ORANGE = "#FF5001";
const CYAN = "#8a8a8a";
const SOFT = "none";
const W = 2;

function Wheel({ x }: { x: number }) {
  return (
    <g>
      <circle cx={x} cy={47} r={5.5} fill={NAVY} />
      <circle cx={x} cy={47} r={2} fill={CYAN} />
    </g>
  );
}

/** Tracto (cabina) mirando a la derecha, desde x hasta x+26. */
function Tractor({ x = 90 }: { x?: number }) {
  return (
    <g>
      <path d={`M${x} 41 V24 Q${x} 20 ${x + 4} 20 H${x + 15} L${x + 24} 30 V41 Z`} fill="#fff" stroke={NAVY} strokeWidth={W} strokeLinejoin="round" />
      <path d={`M${x + 13} 23 H${x + 16} L${x + 21} 30 H${x + 13} Z`} fill={CYAN} />
      <rect x={x + 2} y={33} width={21} height={3} fill={ORANGE} />
      <Wheel x={x + 17} />
      <Wheel x={x + 5} />
    </g>
  );
}

function Chassis({ from = 6, to = 92 }: { from?: number; to?: number }) {
  return <line x1={from} y1={41} x2={to} y2={41} stroke={NAVY} strokeWidth={W + 1} strokeLinecap="round" />;
}

function TrailerWheels() {
  return (
    <>
      <Wheel x={16} />
      <Wheel x={29} />
    </>
  );
}

function Box({ fill, children }: { fill: string; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={6} y={12} width={82} height={27} rx={2} fill={fill} stroke={NAVY} strokeWidth={W} />
      {children}
    </g>
  );
}

function Body({ id }: { id: string }) {
  switch (id) {
    case "rampla_plana":
      return (
        <g>
          <rect x={6} y={35} width={84} height={5} rx={1} fill={ORANGE} stroke={NAVY} strokeWidth={W} />
          {[14, 34, 54, 74].map((x) => (
            <line key={x} x1={x} y1={35} x2={x} y2={28} stroke={NAVY} strokeWidth={W} strokeLinecap="round" />
          ))}
          <rect x={22} y={24} width={40} height={11} rx={1} fill={SOFT} stroke={CYAN} strokeWidth={W} />
        </g>
      );
    case "sider":
      return (
        <Box fill={SOFT}>
          {[16, 26, 36, 46, 56, 66, 76].map((x) => (
            <path key={x} d={`M${x} 14 q3 12 0 23`} fill="none" stroke={CYAN} strokeWidth={1.6} />
          ))}
          <line x1={6} y1={15} x2={88} y2={15} stroke={NAVY} strokeWidth={W} />
        </Box>
      );
    case "furgon_seco":
      return (
        <Box fill="#fff">
          <rect x={6} y={30} width={82} height={4} fill={ORANGE} />
          <line x1={20} y1={14} x2={20} y2={37} stroke={CYAN} strokeWidth={1.4} />
        </Box>
      );
    case "refrigerado":
      return (
        <Box fill="#fff">
          <rect x={86} y={15} width={6} height={13} rx={1} fill={CYAN} stroke={NAVY} strokeWidth={1.5} />
          <g stroke={CYAN} strokeWidth={2} strokeLinecap="round">
            <line x1={47} y1={17} x2={47} y2={35} />
            <line x1={39} y1={21} x2={55} y2={31} />
            <line x1={39} y1={31} x2={55} y2={21} />
          </g>
        </Box>
      );
    case "tolva":
      return (
        <g>
          <path d="M8 14 H88 L80 38 H16 Z" fill={ORANGE} stroke={NAVY} strokeWidth={W} strokeLinejoin="round" />
          <path d="M14 14 Q48 6 82 14" fill="#C98A4B" stroke={NAVY} strokeWidth={1.5} />
          <line x1={48} y1={18} x2={48} y2={34} stroke="#fff" strokeWidth={1.4} opacity={0.7} />
        </g>
      );
    case "estanque":
      return (
        <g>
          <rect x={8} y={15} width={80} height={23} rx={11.5} fill={SOFT} stroke={NAVY} strokeWidth={W} />
          <rect x={8} y={25} width={80} height={3} fill={CYAN} />
          <rect x={44} y={11} width={8} height={4} fill={NAVY} />
        </g>
      );
    case "peligrosa":
      return (
        <g>
          <rect x={8} y={15} width={80} height={23} rx={11.5} fill="#fff" stroke={NAVY} strokeWidth={W} />
          <path d="M48 17 L57 26.5 L48 36 L39 26.5 Z" fill={ORANGE} stroke={NAVY} strokeWidth={1.5} />
          <text x={48} y={29.5} textAnchor="middle" fontSize={8} fontWeight={800} fill={NAVY}>
            !
          </text>
        </g>
      );
    case "portacontenedor":
      return (
        <g>
          <rect x={8} y={13} width={78} height={24} rx={1.5} fill={ORANGE} stroke={NAVY} strokeWidth={W} />
          {[16, 24, 32, 40, 48, 56, 64, 72, 80].map((x) => (
            <line key={x} x1={x} y1={15} x2={x} y2={35} stroke="#fff" strokeWidth={1.3} opacity={0.75} />
          ))}
          <rect x={6} y={37} width={84} height={3} fill={NAVY} />
        </g>
      );
    case "portaautos":
      return (
        <g>
          <line x1={6} y1={24} x2={88} y2={20} stroke={NAVY} strokeWidth={W + 0.5} strokeLinecap="round" />
          {[12, 50].map((x) => (
            <path key={`t${x}`} d={`M${x} ${21 - (x - 6) * 0.05} q3 -7 12 -7 h8 q6 0 9 6 v2 h-29 z`} fill={CYAN} stroke={NAVY} strokeWidth={1.4} />
          ))}
          {[12, 50].map((x) => (
            <path key={`b${x}`} d={`M${x} 38 q3 -7 12 -7 h8 q6 0 9 6 v2 h-29 z`} fill={ORANGE} stroke={NAVY} strokeWidth={1.4} />
          ))}
          {[8, 46, 86].map((x) => (
            <line key={x} x1={x} y1={22} x2={x} y2={40} stroke={NAVY} strokeWidth={1.4} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function CamaBaja() {
  return (
    <g>
      <path d="M4 33 H26 L32 39 H74 L80 33 H92" fill="none" stroke={NAVY} strokeWidth={W + 1} strokeLinejoin="round" />
      <rect x={32} y={36} width={42} height={4} fill={ORANGE} stroke={NAVY} strokeWidth={1.5} />
      {/* maquinaria sobre la cama */}
      <rect x={40} y={26} width={22} height={9} rx={2} fill={CYAN} stroke={NAVY} strokeWidth={1.5} />
      <rect x={52} y={19} width={8} height={7} rx={1} fill="#fff" stroke={NAVY} strokeWidth={1.5} />
      <path d="M44 26 L36 16 L28 22" fill="none" stroke={ORANGE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Wheel x={10} />
      <Wheel x={21} />
      <Tractor x={92} />
    </g>
  );
}

function Rigid({ children }: { children?: React.ReactNode }) {
  return (
    <g transform="translate(-8 0)">
      <rect x={26} y={16} width={56} height={23} rx={2} fill="#fff" stroke={NAVY} strokeWidth={W} />
      {children}
      <line x1={26} y1={41} x2={100} y2={41} stroke={NAVY} strokeWidth={W + 1} strokeLinecap="round" />
      <path d="M84 41 V26 Q84 22 88 22 H96 L104 31 V41 Z" fill="#fff" stroke={NAVY} strokeWidth={W} strokeLinejoin="round" />
      <path d="M94 25 H96 L101 31 H94 Z" fill={CYAN} />
      <Wheel x={38} />
      <Wheel x={95} />
    </g>
  );
}

export function TruckArt({ id, className, title }: { id: string; className?: string; title?: string }) {
  let art: React.ReactNode;
  if (id === "cama_baja") art = <CamaBaja />;
  else if (id === "camion_34")
    art = (
      <Rigid>
        <rect x={26} y={30} width={56} height={4} fill={ORANGE} />
      </Rigid>
    );
  else if (id === "otro")
    art = (
      <Rigid>
        <text x={54} y={33} textAnchor="middle" fontSize={14} fontWeight={800} fill={ORANGE}>
          ?
        </text>
      </Rigid>
    );
  else
    art = (
      <g>
        <Body id={id} />
        <Chassis />
        <TrailerWheels />
        <Tractor />
      </g>
    );
  return (
    <svg viewBox="0 0 120 56" className={className ?? "truck-art"} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <line x1={2} y1={53} x2={118} y2={53} stroke="#3a3a3a" strokeWidth={1.5} strokeLinecap="round" />
      {art}
    </svg>
  );
}
