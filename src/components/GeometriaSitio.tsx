"use client";

/** Trazos orbitales del film ÓRBITA. Un solo SVG, sin imágenes. */
export function GeometriaSitio() {
  return (
    <div className="geo-capa" aria-hidden="true">
      <svg className="geo-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <g className="geo-orbita" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1">
          <ellipse cx="920" cy="160" rx="240" ry="72" />
          <ellipse cx="920" cy="160" rx="150" ry="46" transform="rotate(-16 920 160)" />
          <circle cx="1160" cy="160" r="2.2" fill="#FF5001" stroke="none" />
        </g>
        <g fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1">
          <path d="M48 640 C 200 560, 280 720, 460 620 S 760 470, 980 560" />
          <path d="M80 180 H 220 L 280 240 H 420" />
        </g>
        <g fill="rgba(255,255,255,0.18)">
          {[
            [90, 180], [220, 180], [280, 240], [420, 240], [160, 420], [240, 510],
            [700, 620], [860, 560], [980, 560], [120, 700], [300, 80], [540, 140],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />
          ))}
        </g>
        <g stroke="rgba(255,255,255,0.12)" strokeWidth="1">
          <line x1="160" y1="420" x2="240" y2="510" />
          <line x1="240" y1="510" x2="360" y2="470" />
          <circle cx="160" cy="420" r="2.5" fill="none" />
          <circle cx="360" cy="470" r="2.5" fill="#FF5001" stroke="none" />
        </g>
      </svg>
    </div>
  );
}
