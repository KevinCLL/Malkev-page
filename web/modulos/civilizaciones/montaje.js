// montaje.js · Extensión de La Malkevnia unificada: civilizaciones visibles
// Sigue /mnt/project-files/malkevnia-unificada/CONTRATO.md:
//  - un solo Three.js (civilizaciones.js importa 'three' por el import map de la nave),
//  - sin renderer ni bucle propios: la civilización se actualiza desde el bucle de quien la usa,
//  - texto en español.
//
// Qué hace:
//  1. Publica la API en M.civilizaciones para que los modos de vuelo (universo, vuelo libre,
//     superficies) le pongan civilización a cualquier planeta de planetas.js con una línea.
//  2. Cuando el puente escanea un planeta o se llega a uno (eventos scan / planet / land),
//     avisa con un toast si hay alguien viviendo allí (o si solo quedan ruinas).

import { createCivilization, civilizationSpec, rasgosPara, eraPara, ERAS, FEATURES } from './civilizaciones.js';

export default async function montar(M) {
  // planetas.js da la habitabilidad real del planeta, que decide si hay civilización.
  // Si no está a mano, la civilización se calcula solo con la semilla (sigue siendo determinista).
  const P = await import('../planetas-procedurales/planetas.js').catch(() => null);
  const metaDePlaneta = (seed, extra = {}) => {
    try { return { ...(P?.planetSpec?.(seed)?.meta || {}), ...extra }; } catch { return extra; }
  };
  const calidad = () => M.calidad?.() || 'alta';
  const vivas = new Set();

  const api = {
    createCivilization, civilizationSpec, rasgosPara, eraPara, ERAS, FEATURES,

    /**
     * Atajo para los modos de vuelo: crea la civilización de un planeta de generatePlanet(),
     * la cuelga de él y la devuelve. Hay que llamar a civ.update(dt) en tu bucle y civ.dispose() al salir.
     * opts: { seed?, nivel?, estado?, star?: { position, radius } | false, scene?, renderer? }
     */
    paraPlaneta(planet, opts = {}) {
      const { scene, renderer, ...rest } = opts;
      const civ = createCivilization(rest.seed ?? planet.meta?.seed, planet.meta, { detalle: calidad(), ...rest });
      civ.attach(planet, { scene, star: rest.star });
      const r = renderer || M.renderer;
      if (r?.getDrawingBufferSize && M.THREE) civ.setResolution(r.getDrawingBufferSize(new M.THREE.Vector2()).y);
      vivas.add(civ);
      const disposeOrig = civ.dispose;
      civ.dispose = () => { vivas.delete(civ); disposeOrig(); };
      return civ;
    },

    /** Datos de la civilización de una semilla (sin GPU). null si allí no hay ni hubo nadie. */
    ficha(seed, planetMeta) {
      const m = civilizationSpec(seed, planetMeta || metaDePlaneta(seed));
      return m.existe ? m : null;
    },
  };
  M.civilizaciones = api;

  // Avisos al escanear / llegar
  const avisados = new Set();
  const avisar = (d) => {
    const seed = d?.seed;
    if (!seed || avisados.has(seed)) return;
    avisados.add(seed);
    const m = api.ficha(seed, metaDePlaneta(seed, d.name ? { nombre: d.name } : {}));
    if (!m) return;
    const texto = m.estado === 'extinta'
      ? `Ruinas de ${m.nombre}: ${m.eraNombre.toLowerCase()}, extinta.`
      : `Señales de vida: ${m.nombre} · ${m.eraNombre} (${m.kardashev}).`;
    M.hud?.toast?.(texto, { icono: m.estado === 'extinta' ? '☖' : '✦', ms: 4200 });
  };
  const offs = [];
  if (M.bus?.on) for (const ev of ['scan', 'planet', 'land']) offs.push(M.bus.on(ev, (e) => avisar(e?.detail ?? e)));

  return {
    dispose() {
      for (const off of offs) try { off?.(); } catch { /* nada */ }
      for (const civ of [...vivas]) civ.dispose();
      if (M.civilizaciones === api) delete M.civilizaciones;
    },
  };
}
