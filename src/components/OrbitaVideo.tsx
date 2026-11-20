/** Video oficial pendiente. Sin archivo no se monta un reproductor. */
export const VIDEO_OFICIAL_SRC = "";

export function OrbitaVideo() {
  return (
    <section className="video-oficial" aria-labelledby="video-oficial">
      <p id="video-oficial">Mira cómo ÓRBITA ordena la carga de Chile en un solo lugar.</p>
      {VIDEO_OFICIAL_SRC ? (
        <video controls preload="metadata" playsInline poster="/brand/orbita-carga360go.jpg">
          <source src={VIDEO_OFICIAL_SRC} type="video/mp4" />
        </video>
      ) : null}
    </section>
  );
}
