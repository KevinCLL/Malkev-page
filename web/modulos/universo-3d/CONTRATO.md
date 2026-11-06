# Contrato de módulo de planeta — "Viaje por el universo" (Three.js r160)

Workspace: /tmp/claude-0/-home-user-Malkev-page/63e4b83e-c90f-5c61-99b4-7584a8ce9e2e/scratchpad/universo
Your file: planets/<id>.js   (ONLY write this file, plus scratch files named <id>-*.* if needed. Never edit other files.)

## API
ES module, no imports (THREE is passed in). Everything procedural: shaders, CanvasTexture/DataTexture generated at runtime. No external textures/fonts/files.

export default function create(THREE, { sunDir, renderer }) {
  return {
    object,        // THREE.Object3D centered at origin. Main will only TRANSLATE it to its world position (no rotation/scale).
    radius,        // main body radius in world units
    viewDistance,  // good camera distance to frame the whole thing (incl. rings/moons/disk)
    info: {
      nombre, tipo,              // Spanish
      descripcion,               // 2-3 evocative Spanish sentences
      datos: [['Gravedad','1,3 g'], ...],   // 4-6 imaginary facts, Spanish
      estrella: { nombre: '...', color: 0xffe0b0 } // its star; main draws that star far away along sunDir
    },
    update(dt, t, ctx) {}        // ctx = { camera, sunDir, renderer, scene }; t in seconds
  };
}

- sunDir: world-space normalized Vector3 FROM the planet TOWARD its star. Constant. Use it for your own lighting in ShaderMaterials (pass as uniform). The scene also has a DirectionalLight along sunDir (intensity ~3) + weak ambient, so MeshStandardMaterial also works.
- Use built-in `cameraPosition` and `modelMatrix` in shaders (world space) — the object will be translated far from origin (up to ~20000 units).
- Color pipeline: output LINEAR HDR. After render: UnrealBloom (threshold ~0.85, strength ~0.6) then ACES filmic tone mapping + sRGB (OutputPass). Values >1 glow. Don't do your own tonemap/gamma.
- Scale: rocky planets radius 60 (giants up to ~150). Camera near=0.5, far=80000. Camera may come as close as 1.4*radius, so detail must hold up close (per-fragment noise, high-res spheres OK, e.g. 256x128).
- Transparent shells (atmosphere, clouds): depthWrite:false, sensible blending (additive or normal), correct side. Watch out for sorting with the ship (a small opaque mesh in front).
- Performance: must run ~60fps on a decent laptop GPU at 1080p. fbm up to ~6-8 octaves OK. Keep update() cheap; main sets object.visible=false when far.
- Creation time < ~1.5 s.
- Spanish text with proper accents (UTF-8).

## Testing (WebGL works headless via SwiftShader; slow but fine)
A static server is already running at http://localhost:8765 serving the workspace.
  cd <workspace> && node snap.js <id> [angle=0.6] [dist=viewDistance] [out.png]
Prints console errors/warnings. Then LOOK at the PNG with the Read tool. Iterate until it looks spectacular.
Check at least: day side (angle 0.6), terminator/night side (angle ~2.6 and ~3.8), close-up (dist = radius*1.7).
See test.html for how the module is mounted (it's the same way main mounts it). The planet's star itself is NOT drawn in the harness.

## Goal / quality bar
The user asked for "everything you've got": as realistic AND spectacular as possible, rich detail, gorgeous colors. Think physically plausible light (Rayleigh-ish atmospheric scattering rim, terminator softness, specular glints on liquids, night-side emissives, shadowing of rings by planet, etc.) combined with imaginative, vivid palettes. Overall art direction: calm, contemplative space sci-fi with purple undertones (the viewer flies the ship "La Malkevnia").

Time budget: aim to finish in ~20-25 minutes of work. When done, reply with a SHORT summary: file path, features, radius/viewDistance, anything main must know. Do not paste the code.
