// Viaje por el universo · La Malkevnia
// Módulo autocontenido (three@0.160.0, importado como 'three').
// API: createUniverse({ canvas, container, onExit, intro }) y createSkybox(scene, opts). Ver README.md.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = new URL('.', import.meta.url);

// ============================================================ shared GLSL
const NOISE = /* glsl */`
vec3 hash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
float noise3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  vec3 a=hash3(i), b=hash3(i+vec3(1,0,0)), c=hash3(i+vec3(0,1,0)), d=hash3(i+vec3(1,1,0));
  vec3 e=hash3(i+vec3(0,0,1)), g=hash3(i+vec3(1,0,1)), h=hash3(i+vec3(0,1,1)), k=hash3(i+vec3(1,1,1));
  return mix(mix(mix(a.x,b.x,f.x),mix(c.x,d.x,f.x),f.y), mix(mix(e.x,g.x,f.x),mix(h.x,k.x,f.x),f.y), f.z); }
float fbm(vec3 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

// ============================================================ sky (nebula + stars + galaxies + star glare)
// Builds a group of radius ~1500 meant to be drawn "at infinity" (depthWrite off). Returns uniforms to drive it.
function buildSky({ starCount = 26000, dpr = 1 } = {}) {
  const group = new THREE.Group();
  const u = {
    uTime: { value: 0 }, uWarp: { value: 0 },
    uA: { value: new THREE.Color(0x5a2bd0) }, uB: { value: new THREE.Color(0x1fb6c9) }, uC: { value: new THREE.Color(0xff4fa8) },
  };
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: u,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + /* glsl */`
      varying vec3 vDir; uniform float uTime, uWarp; uniform vec3 uA, uB, uC;
      void main(){
        vec3 d = normalize(vDir);
        vec3 gN = normalize(vec3(0.25, 1.0, 0.35));
        float band = exp(-pow(dot(d, gN) * 3.2, 2.0));
        vec3 q = d * 2.2;
        float w = fbm(q + vec3(0., 0., uTime*0.002));
        vec3 r = q + 1.8 * vec3(fbm(q + w + 3.1), fbm(q + w + 7.7), fbm(q + w + 1.3));
        float n = fbm(r);
        float n2 = fbm(r * 2.7 + 11.0);
        float dust = smoothstep(0.42, 0.75, fbm(d * 6.0 + r * 0.6));
        vec3 col = mix(uA, uB, smoothstep(0.35, 0.75, n));
        col = mix(col, uC, smoothstep(0.55, 0.85, n2) * 0.7);
        float dens = pow(smoothstep(0.3, 0.9, n), 1.6) * (0.25 + 1.2 * band);
        vec3 neb = col * dens * 0.55;
        neb += vec3(1.0, 0.82, 0.95) * pow(band, 6.0) * pow(n2, 2.0) * 0.35;
        neb *= 1.0 - dust * 0.75 * band;
        neb += vec3(0.03, 0.015, 0.06) * (0.6 + 0.4 * n);
        neb *= 1.0 + uWarp * 0.6;
        gl_FragColor = vec4(neb, 1.0);
      }`,
  }));
  nebula.renderOrder = -10;
  group.add(nebula);

  const makeStars = (count, radius, bandBias) => {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
    const gN = new THREE.Vector3(0.25, 1.0, 0.35).normalize();
    const v = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (Math.random() < bandBias) { const h = v.dot(gN); v.addScaledVector(gN, -h * (0.85 + Math.random() * 0.15)).normalize(); }
      v.multiplyScalar(radius); pos.set([v.x, v.y, v.z], i * 3);
      const t = Math.random();
      if (t < 0.12) c.setRGB(0.62, 0.72, 1.0); else if (t < 0.5) c.setRGB(0.92, 0.92, 1.0);
      else if (t < 0.75) c.setRGB(1.0, 0.93, 0.8); else if (t < 0.9) c.setRGB(1.0, 0.78, 0.6); else c.setRGB(0.95, 0.7, 1.0);
      const m = Math.pow(Math.random(), 6.0);
      c.multiplyScalar(0.5 + m * 5.0);
      col.set([c.r, c.g, c.b], i * 3);
      sz[i] = 1.0 + m * 4.5; ph[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const p = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: u.uTime, uPx: { value: dpr }, uWarp: u.uWarp },
      vertexShader: `attribute float size; attribute float phase; varying vec3 vC; varying float vTw; uniform float uTime, uPx, uWarp;
        void main(){ vC = color; vTw = 0.75 + 0.25*sin(uTime*(1.5+fract(phase)*3.0) + phase);
          gl_PointSize = size * uPx * (1.0 + uWarp*0.8); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 vC; varying float vTw;
        void main(){ vec2 p = gl_PointCoord*2.-1.; float r = dot(p,p); float a = exp(-r*5.0);
          float spike = max(0., 1.-abs(p.x)*12.)*max(0.,1.-abs(p.y)) + max(0., 1.-abs(p.y)*12.)*max(0.,1.-abs(p.x));
          gl_FragColor = vec4(vC * (a + spike*0.25) * vTw, 1.0); }`,
    }));
    p.renderOrder = -9; p.frustumCulled = false;
    return p;
  };
  group.add(makeStars(starCount, 1200, 0.55));
  group.add(makeStars(Math.round(starCount / 18), 1190, 0.2));

  const galaxyMat = (seed, tint) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uSeed: { value: seed }, uTint: { value: new THREE.Color(tint) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.-1.; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: NOISE + `varying vec2 vUv; uniform float uSeed; uniform vec3 uTint;
      void main(){ vec2 p = vUv; float r = length(p); float a = atan(p.y,p.x);
        float arms = 0.5+0.5*cos(2.0*(a - log(r+0.02)*3.2) + uSeed);
        float n = fbm(vec3(p*6.0, uSeed));
        float disk = exp(-r*4.0) * (0.35 + 0.9*arms*n);
        float core = exp(-r*r*90.0)*2.0;
        vec3 c = mix(uTint, vec3(1.0,0.9,0.8), exp(-r*6.0)) * (disk + core);
        gl_FragColor = vec4(c * smoothstep(1.0, 0.6, r), 1.0); }`,
  });
  [[0.6, 0.3, -0.75, 0x9b7bff, 60, 0.6], [-0.7, -0.25, -0.4, 0x63d6ff, 45, 2.1], [0.2, -0.6, 0.77, 0xff86c8, 52, 4.0], [-0.3, 0.75, 0.6, 0xd2b0ff, 38, 5.3]].forEach(([x, y, z, c, s, seed]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), galaxyMat(seed, c));
    m.position.set(x, y, z).normalize().multiplyScalar(1100); m.lookAt(0, 0, 0);
    m.rotateZ(seed); m.rotateX(0.9 + seed * 0.2);
    m.renderOrder = -8;
    group.add(m);
  });

  const starU = { uColor: { value: new THREE.Color(0xffe2b0) }, uTime: u.uTime, uI: { value: 1 } };
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: starU,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.-1.; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uTime, uI;
      void main(){ vec2 p = vUv; float r = length(p);
        float core = smoothstep(0.035, 0.02, r) * 30.0;
        float halo = exp(-r*9.0)*3.5 + exp(-r*3.0)*0.5;
        float a = atan(p.y,p.x);
        float rays = pow(abs(cos(a*3.0)), 60.0)*exp(-r*3.5)*2.5 + pow(abs(cos(a*2.0 + 0.4)), 120.0)*exp(-r*2.2)*1.2;
        rays *= 0.85 + 0.15*sin(uTime*0.7 + a*7.0);
        vec3 c = mix(uColor, vec3(1.0), clamp(core*0.05 + exp(-r*20.0), 0.0, 1.0)) * (core + halo + rays);
        gl_FragColor = vec4(c * smoothstep(1.0, 0.7, r) * uI, 1.0); }`,
  }));
  glare.renderOrder = -7;
  glare.scale.setScalar(520);
  group.add(glare);

  const dirTmp = new THREE.Vector3();
  return {
    group, u, starU, glare,
    setPalette(a, b, c) { u.uA.value.copy(a); u.uB.value.copy(b); u.uC.value.copy(c); },
    setStar(dir, color, intensity = 1) { dirTmp.copy(dir).normalize(); glare.position.copy(dirTmp).multiplyScalar(1000); starU.uColor.value.copy(color); starU.uI.value = intensity; },
    faceCamera(cam) { glare.quaternion.copy(cam.quaternion); },
    dispose() { group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); },
  };
}

/**
 * Lightweight skybox for other scenes (e.g. the bridge windows of La Malkevnia).
 * Adds stars + nebula + galaxies + a distant star glare to `scene`; follows the camera every update.
 * opts: { radius = 1500 (keep below camera.far), starCount = 12000, palette: [hexA, hexB, hexC], star: { dir:[x,y,z], color, intensity } }
 */
export function createSkybox(scene, opts = {}) {
  const radius = opts.radius ?? 1500;
  const sky = buildSky({ starCount: opts.starCount ?? 12000, dpr: Math.min(window.devicePixelRatio || 1, 2) });
  sky.group.scale.setScalar(radius / 1500);
  const pal = (opts.palette || [0x5a2bd0, 0x1fb6c9, 0xff4fa8]).map((h) => new THREE.Color(h));
  sky.setPalette(...pal);
  const st = opts.star || { dir: [0.85, 0.22, 0.48], color: 0xffe2b0, intensity: 1 };
  sky.setStar(new THREE.Vector3(...st.dir), new THREE.Color(st.color), st.intensity ?? 1);
  scene.add(sky.group);
  return {
    object: sky.group,
    update(t, camera) { sky.u.uTime.value = t; if (camera) { camera.getWorldPosition(sky.group.position); const q = new THREE.Quaternion(); camera.getWorldQuaternion(q); sky.glare.quaternion.copy(q); } },
    setPalette(a, b, c) { sky.setPalette(new THREE.Color(a), new THREE.Color(b), new THREE.Color(c)); },
    dispose() { scene.remove(sky.group); sky.dispose(); },
  };
}

// ============================================================ route (order of the tour)
export const ROUTE_IDS = ['thalassa', 'verdalia', 'brasa', 'gelida', 'opalia', 'izaro', 'abismo'];
const ROUTE_DEF = [
  { id: 'thalassa', ly: 4.2,  sun: [0.85, 0.22, 0.48], view: [-0.25, 0.18, 1.0], sky: [0x3b2bd0, 0x18a7d4, 0x9a4fff] },
  { id: 'verdalia', ly: 11.7, sun: [-0.6, 0.3, 0.75],  view: [0.55, 0.12, 0.85], sky: [0x6b26b8, 0x22c49a, 0xff5fb0] },
  { id: 'brasa',    ly: 26.3, sun: [0.3, 0.15, -1.0],  view: [0.9, 0.2, -0.15],  sky: [0x7a1f6a, 0xd2602a, 0xff3d6e] },
  { id: 'gelida',   ly: 38.9, sun: [-0.9, 0.35, -0.2], view: [0.25, 0.22, 1.0],  sky: [0x2a3fb0, 0x5fd8ff, 0xb18cff] },
  { id: 'opalia',   ly: 57.0, sun: [0.7, -0.2, 0.7],   view: [-0.4, 0.25, 0.9],  sky: [0x3a1890, 0x3ad0ff, 0xff7ae0] },
  { id: 'izaro',    ly: 81.5, sun: [1.0, 0.18, 0.15],  view: [-0.2, 0.32, 1.0],  sky: [0x4f22b0, 0x2fa6c9, 0xe07dff] },
  { id: 'abismo',   ly: 1240, sun: [0.0, 1.0, 0.0],    view: [0.15, 0.16, 1.0],  sky: [0x40136e, 0xb0502a, 0x7a2cff] },
];

// ============================================================ HUD (scoped DOM + CSS)
const CSS = `
.uv-root{position:absolute;inset:0;pointer-events:none;font-family:"Jura","Segoe UI",system-ui,sans-serif;color:#ece6ff;-webkit-font-smoothing:antialiased;
  --uv-glass:rgba(18,10,38,.52);--uv-edge:rgba(190,160,255,.18);--uv-ink:#ece6ff;--uv-dim:#a89cc8;--uv-lilac:#b99cff;--uv-cyan:#7fe3ff;
  --uv-display:"Michroma","Eurostile","Segoe UI",sans-serif;--uv-data:"JetBrains Mono",ui-monospace,Consolas,monospace}
.uv-root *{box-sizing:border-box}
.uv-root[hidden],.uv-root [hidden]{display:none!important}
.uv-hud{position:absolute;inset:0;pointer-events:none;transition:opacity .6s ease}
.uv-hud.uv-off{opacity:0}
.uv-hud>*{pointer-events:auto}
.uv-glass{background:var(--uv-glass);border:1px solid var(--uv-edge);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border-radius:14px}
.uv-brand{position:absolute;top:calc(18px + env(safe-area-inset-top,0px));left:max(18px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:4px;pointer-events:none!important}
.uv-brand b{font-family:var(--uv-display);font-weight:400;font-size:13px;letter-spacing:.32em;text-shadow:0 0 18px rgba(185,156,255,.6)}
.uv-brand span{font-family:var(--uv-data);font-size:11px;color:var(--uv-dim);letter-spacing:.08em}
.uv-card{position:absolute;left:max(18px,env(safe-area-inset-left,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));width:min(380px,calc(100% - 36px));padding:18px 20px 16px;transition:opacity .7s ease,transform .7s ease}
.uv-card.uv-hide{opacity:0;transform:translateY(14px);pointer-events:none}
.uv-tipo{font-family:var(--uv-data);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--uv-cyan)}
.uv-card h1{font-family:var(--uv-display);font-weight:400;font-size:clamp(22px,3.2vw,34px);letter-spacing:.08em;margin:6px 0 8px;text-wrap:balance;text-shadow:0 0 30px rgba(185,156,255,.45)}
.uv-card p{margin:0 0 12px;font-size:15px;line-height:1.5;color:#d7cff0}
.uv-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-family:var(--uv-data);font-size:12px}
.uv-card dt{color:var(--uv-dim)}
.uv-card dd{margin:0;font-variant-numeric:tabular-nums}
.uv-star{margin-top:12px;display:flex;align-items:center;gap:8px;font-family:var(--uv-data);font-size:11px;color:var(--uv-dim);letter-spacing:.06em}
.uv-star i{width:9px;height:9px;border-radius:50%;box-shadow:0 0 10px currentColor;background:currentColor}
.uv-route{position:absolute;right:max(18px,env(safe-area-inset-right,0px));top:calc(18px + env(safe-area-inset-top,0px));padding:12px 10px;display:flex;flex-direction:column;gap:2px}
.uv-route h2{font-family:var(--uv-data);font-weight:400;font-size:10px;letter-spacing:.2em;color:var(--uv-dim);margin:0 8px 6px;text-transform:uppercase}
.uv-route button{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;font-size:13px;color:var(--uv-dim);letter-spacing:.04em}
.uv-route button:hover{background:rgba(185,156,255,.1);color:var(--uv-ink)}
.uv-route button:focus-visible,.uv-dock button:focus-visible{outline:1px solid var(--uv-lilac)}
.uv-route button i{width:8px;height:8px;border-radius:50%;border:1px solid currentColor;flex:none}
.uv-route button.uv-on{color:var(--uv-ink)}
.uv-route button.uv-on i{background:var(--uv-lilac);border-color:var(--uv-lilac);box-shadow:0 0 10px var(--uv-lilac)}
.uv-dock{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));display:flex;gap:6px;padding:7px;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 36px)}
.uv-dock button{all:unset;cursor:pointer;font-weight:600;font-size:13px;letter-spacing:.06em;padding:10px 14px;border-radius:9px;color:var(--uv-ink);white-space:nowrap}
.uv-dock button:hover{background:rgba(185,156,255,.14)}
.uv-dock button[aria-pressed="true"]{background:rgba(185,156,255,.22);color:#fff}
.uv-dock .uv-main{background:linear-gradient(180deg,rgba(185,156,255,.34),rgba(130,90,230,.28))}
.uv-warp{position:absolute;left:50%;top:16%;transform:translateX(-50%);text-align:center;pointer-events:none!important;opacity:0;transition:opacity .5s}
.uv-warp.uv-on{opacity:1}
.uv-warp .uv-k{font-family:var(--uv-data);font-size:11px;letter-spacing:.4em;color:var(--uv-cyan)}
.uv-warp .uv-d{font-family:var(--uv-display);font-size:clamp(18px,2.6vw,26px);letter-spacing:.12em;margin-top:8px;text-shadow:0 0 24px rgba(127,227,255,.6)}
.uv-warp .uv-s{font-family:var(--uv-data);font-size:12px;color:var(--uv-dim);margin-top:6px;font-variant-numeric:tabular-nums}
.uv-hint{position:absolute;right:max(18px,env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));font-family:var(--uv-data);font-size:11px;color:var(--uv-dim);text-align:right;line-height:1.7;pointer-events:none!important}
.uv-intro{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:radial-gradient(ellipse at 50% 60%,rgba(60,30,120,.55),rgba(5,3,12,.96) 70%);transition:opacity 1.2s ease;padding:0 max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))}
.uv-intro.uv-gone{opacity:0;pointer-events:none}
.uv-intro .uv-box{text-align:center;max-width:560px;display:flex;flex-direction:column;align-items:center;gap:18px}
.uv-intro .uv-k{font-family:var(--uv-data);font-size:11px;letter-spacing:.45em;color:var(--uv-cyan)}
.uv-intro h1{font-family:var(--uv-display);font-weight:400;font-size:clamp(26px,5vw,48px);letter-spacing:.14em;margin:0;line-height:1.25;text-shadow:0 0 40px rgba(185,156,255,.6);text-wrap:balance}
.uv-intro p{margin:0;color:#cfc6ea;font-size:16px;line-height:1.55}
.uv-bar{width:min(320px,80vw);height:2px;background:rgba(185,156,255,.15);border-radius:2px;overflow:hidden}
.uv-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--uv-lilac),var(--uv-cyan));transition:width .3s;box-shadow:0 0 12px var(--uv-lilac)}
.uv-status{font-family:var(--uv-data);font-size:12px;color:var(--uv-dim);min-height:1.4em}
.uv-go{all:unset;cursor:pointer;font-family:var(--uv-display);font-size:13px;letter-spacing:.3em;padding:16px 28px;border-radius:999px;border:1px solid rgba(185,156,255,.55);background:rgba(130,90,230,.22);box-shadow:0 0 30px rgba(130,90,230,.35),inset 0 0 20px rgba(185,156,255,.15);transition:background .3s,box-shadow .3s,opacity .4s}
.uv-go:hover{background:rgba(130,90,230,.4);box-shadow:0 0 46px rgba(150,110,255,.6),inset 0 0 20px rgba(185,156,255,.25)}
.uv-go:disabled{opacity:.3;cursor:default}
.uv-go:focus-visible{outline:1px solid var(--uv-cyan);outline-offset:4px}
@media (max-width:720px){.uv-route,.uv-hint{display:none}.uv-card{bottom:calc(118px + env(safe-area-inset-bottom,0px));padding:14px 16px}.uv-card p{font-size:14px}.uv-dock button{padding:9px 10px;font-size:12px}}
@media (max-height:760px){.uv-card p{display:none}.uv-card{padding:14px 16px}}
@media (prefers-reduced-motion:reduce){.uv-card,.uv-hud,.uv-intro{transition:none}}
`;
const HUD_HTML = (withExit, withIntro) => `
<div class="uv-hud${withIntro ? ' uv-off' : ''}" data-k="hud">
  <div class="uv-brand"><b>LA MALKEVNIA</b><span data-k="coords">Diario de navegación · rumbo libre</span></div>
  <nav class="uv-route uv-glass" aria-label="Ruta"><h2>Ruta de navegación</h2><div data-k="route"></div></nav>
  <section class="uv-card uv-glass uv-hide" data-k="card" aria-live="polite">
    <div class="uv-tipo" data-k="tipo"></div><h1 data-k="nombre"></h1><p data-k="desc"></p><dl data-k="datos"></dl>
    <div class="uv-star" data-k="star"><i></i><span></span></div>
  </section>
  <div class="uv-warp" data-k="warp"><div class="uv-k">SALTO HIPERESPACIAL</div><div class="uv-d" data-k="warpTo"></div><div class="uv-s" data-k="warpS"></div></div>
  <div class="uv-dock uv-glass" role="toolbar" aria-label="Controles de vuelo">
    ${withExit ? '<button data-k="exit" title="Volver a la nave (Esc)">⟵ Volver a la nave</button>' : ''}
    <button data-k="prev" title="Planeta anterior (←)">◀ Anterior</button>
    <button data-k="next" class="uv-main" title="Siguiente planeta (→)">Siguiente ▶</button>
    <button data-k="auto" aria-pressed="false" title="Recorrido automático (espacio)">Piloto automático</button>
    <button data-k="ship" aria-pressed="true" title="Mostrar u ocultar la nave (N)">Nave</button>
    <button data-k="snd" aria-pressed="false" title="Sonido ambiente (M)">Sonido</button>
    <button data-k="fs" title="Pantalla completa (F)">Pantalla completa</button>
  </div>
  <div class="uv-hint">Arrastra para mirar · rueda para acercarte<br>← → cambia de rumbo · H oculta la interfaz</div>
</div>
${withIntro ? `<div class="uv-intro" data-k="intro"><div class="uv-box">
  <div class="uv-k">BITÁCORA DE LA MALKEVNIA</div>
  <h1>Viaje por el universo</h1>
  <p>Siete mundos que no salen en ningún mapa. Una nave, el silencio del espacio y todo el tiempo del cosmos.</p>
  <div class="uv-bar"><i data-k="bar"></i></div>
  <div class="uv-status" data-k="status">Preparando la nave…</div>
  <button class="uv-go" data-k="go" disabled>Encender motores</button>
</div></div>` : ''}`;

function ensureFonts() {
  if (document.querySelector('link[data-uv-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.dataset.uvFonts = '1';
  l.href = 'https://fonts.googleapis.com/css2?family=Michroma&family=Jura:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
  document.head.appendChild(l);
}

// ============================================================ ambient sound
function startAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6; lp.connect(master);
  const delay = ac.createDelay(2); delay.delayTime.value = 0.9; const fb = ac.createGain(); fb.gain.value = 0.45;
  delay.connect(fb); fb.connect(delay); delay.connect(lp);
  [55, 82.4, 110, 164.8, 220, 277.2].forEach((f, i) => {
    [-6, 6].forEach((det) => {
      const o = ac.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det + i;
      const g = ac.createGain(); g.gain.value = 0.05 / (1 + i * 0.6);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.03 + i * 0.017; const lg = ac.createGain(); lg.gain.value = g.gain.value * 0.8;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(g); g.connect(lp); g.connect(delay); o.start();
    });
  });
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = buf.getChannelData(0);
  let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3; }
  const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300; nf.Q.value = 0.8;
  const ng = ac.createGain(); ng.gain.value = 0.0;
  noise.connect(nf); nf.connect(ng); ng.connect(master); noise.start();
  master.gain.setTargetAtTime(0.55, ac.currentTime, 2.0);
  return { ac, master, lp, nf, ng };
}

// ============================================================ the universe
/**
 * createUniverse({ canvas, container, onExit, intro, baseUrl })
 *  canvas    – <canvas> to render into (required). Sized from its own client box (ResizeObserver).
 *  container – element (position: relative/fixed) where the HUD is mounted; default canvas.parentElement.
 *  onExit    – if given, shows "Volver a la nave" and Esc calls it.
 *  intro     – show the title/loading screen with "Encender motores" (default: true when no onExit).
 *  baseUrl   – where planets/ and ship.js live (default: folder of this module).
 * Returns { ready: Promise, start(), stop(), dispose(), goToPlanet(idOrIndex), planets(), isRunning() }
 */
export function createUniverse({ canvas, container, onExit, intro, baseUrl } = {}) {
  if (!canvas) throw new Error('createUniverse: falta canvas');
  container = container || canvas.parentElement || document.body;
  const base = baseUrl ? new URL(baseUrl, location.href) : BASE;
  const withIntro = intro ?? !onExit;

  // ---------- DOM
  ensureFonts();
  if (!document.querySelector('style[data-uv]')) { const st = document.createElement('style'); st.dataset.uv = '1'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.className = 'uv-root';
  root.innerHTML = HUD_HTML(!!onExit, withIntro);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(root);
  const $ = (k) => root.querySelector(`[data-k="${k}"]`);

  // ---------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const size = () => ({ w: Math.max(1, canvas.clientWidth || container.clientWidth || innerWidth), h: Math.max(1, canvas.clientHeight || container.clientHeight || innerHeight) });
  let { w: W, h: H } = size();
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 80000);
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.PerspectiveCamera(55, W / H, 1, 3000);
  const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(0x7a6cff, 0x1a0b2a, 0.35));

  const sky = buildSky({ starCount: 26000, dpr: DPR });
  bgScene.add(sky.group);

  // ---------- dust + warp streaks (wrap around camera)
  const DUST = 2200, BOX = 600;
  const dustGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(DUST * 6), e = new Float32Array(DUST * 2), r = new Float32Array(DUST * 2);
    for (let i = 0; i < DUST; i++) {
      const x = Math.random() * BOX, y = Math.random() * BOX, z = Math.random() * BOX, rr = Math.random();
      p.set([x, y, z, x, y, z], i * 6); e[i * 2] = 0; e[i * 2 + 1] = 1; r[i * 2] = r[i * 2 + 1] = rr;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    dustGeo.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
    dustGeo.setAttribute('aRnd', new THREE.BufferAttribute(r, 1));
  }
  const dustU = { uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uWarp: { value: 0 } };
  const dust = new THREE.LineSegments(dustGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: dustU,
    vertexShader: `attribute float aEnd; attribute float aRnd; uniform vec3 uCam, uVel; uniform float uWarp; varying float vA; varying float vR;
      void main(){ vec3 p = mod(position - uCam, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        p -= uVel * aEnd * (0.02 + 0.06*uWarp) * (0.5 + aRnd);
        float d = length(p);
        vA = smoothstep(${(BOX / 2).toFixed(1)}, 60.0, d) * smoothstep(2.0, 12.0, d); vR = aRnd;
        gl_Position = projectionMatrix * viewMatrix * vec4(uCam + p, 1.0); }`,
    fragmentShader: `uniform float uWarp; varying float vA; varying float vR;
      void main(){ vec3 c = mix(vec3(0.75,0.6,1.0), vec3(0.6,0.95,1.0), vR); gl_FragColor = vec4(c * vA * (0.25 + uWarp*2.4), 1.0); }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  // ---------- post
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(bgScene, bgCamera));
  const mainPass = new RenderPass(scene, camera);
  mainPass.clear = false; mainPass.clearDepth = true;
  composer.addPass(mainPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 0.85);
  composer.addPass(bloom);
  const lensPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uWarp: { value: 0 }, uTime: { value: 0 }, uAspect: { value: W / H } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarp, uTime, uAspect; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - 0.5; float r = length(c * vec2(uAspect, 1.0));
        float ab = 0.0018 + uWarp * 0.012 * r;
        vec3 col = vec3(texture2D(tDiffuse, vUv - c*ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + c*ab).b);
        if (uWarp > 0.01) {
          vec3 acc = vec3(0.); float wsum = 0.;
          for (int i = 1; i <= 14; i++) { float k = float(i)/14.0; float s = 1.0 - k * uWarp * 0.22 * smoothstep(0.05, 0.6, r);
            float w = 1.0 - k*0.6; acc += texture2D(tDiffuse, 0.5 + c * s).rgb * w; wsum += w; }
          col = mix(col, acc / wsum, smoothstep(0.0, 0.5, uWarp));
          col += vec3(0.35, 0.25, 0.9) * uWarp * uWarp * smoothstep(0.2, 0.9, r) * 0.25;
        }
        col *= 1.0 - smoothstep(0.55, 1.25, r) * 0.55;
        col += (h(vUv*1000.0 + uTime) - 0.5) * 0.012;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`,
  });
  composer.addPass(lensPass);
  composer.addPass(new OutputPass());

  // ---------- route
  const ROUTE = ROUTE_DEF.map((d, i) => ({
    ...d,
    sunDir: new THREE.Vector3(...d.sun).normalize(),
    viewDir: new THREE.Vector3(...d.view).normalize(),
    pos: new THREE.Vector3(Math.sin(i * 1.35) * 4200, Math.cos(i * 0.9) * 900 - 300, -i * 5200),
    skyCols: d.sky.map((h) => new THREE.Color(h)),
    p: null,
  }));
  const stops = () => ROUTE.filter((s) => s.p);

  // ---------- controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.22;
  controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.7; controls.enablePan = false;
  controls.enabled = false;
  let lastInteract = -999;
  controls.addEventListener('start', () => { lastInteract = performance.now(); });

  // ---------- state
  let shipApi = null;
  let current = -1, travel = null, warp = 0, cruise = 0, arrivedAt = 0;
  let running = false, disposed = false, T = 0, autoPilot = false, audio = null;
  const clock = new THREE.Clock();
  const UP = new THREE.Vector3(0, 1, 0), tmpM = new THREE.Matrix4(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  const lookQ = (from, to) => { tmpM.lookAt(from, to, UP); return new THREE.Quaternion().setFromRotationMatrix(tmpM); };
  const bez = (p0, p1, p2, p3, u, out) => { const a = 1 - u; return out.set(0, 0, 0).addScaledVector(p0, a * a * a).addScaledVector(p1, 3 * a * a * u).addScaledVector(p2, 3 * a * u * u).addScaledVector(p3, u * u * u); };
  const trap = (tau, ramp) => { const vmax = 1 / (1 - ramp);
    if (tau < ramp) return [vmax * tau * tau / (2 * ramp), tau / ramp];
    if (tau < 1 - ramp) return [vmax * (ramp / 2 + (tau - ramp)), 1];
    const r = 1 - tau; return [1 - vmax * r * r / (2 * ramp), r / ramp]; };
  const arrivalPos = (s) => s.pos.clone().addScaledVector(s.viewDir, s.p.viewDistance);

  // ---------- HUD helpers
  function buildRoute() {
    const el = $('route'); el.innerHTML = '';
    stops().forEach((s, i) => {
      const b = document.createElement('button');
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('span').textContent = s.p.info?.nombre || s.id;
      b.onclick = () => { setAuto(false); travelTo(i); };
      el.appendChild(b);
    });
  }
  const markRoute = (i) => [...$('route').children].forEach((b, k) => b.classList.toggle('uv-on', k === i));
  function showCard(s) {
    const inf = s.p.info || {};
    $('tipo').textContent = inf.tipo || '';
    $('nombre').textContent = inf.nombre || s.id;
    $('desc').textContent = inf.descripcion || '';
    const dl = $('datos'); dl.innerHTML = '';
    (inf.datos || []).forEach(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); });
    const st = $('star');
    if (inf.estrella && inf.estrella.nombre && inf.estrella.nombre !== '—') {
      st.hidden = false;
      st.style.color = '#' + new THREE.Color(inf.estrella.color ?? 0xffffff).getHexString();
      st.querySelector('span').textContent = 'Estrella: ' + inf.estrella.nombre;
    } else st.hidden = true;
    $('card').classList.remove('uv-hide');
    $('coords').textContent = 'Diario de navegación · ' + s.ly.toLocaleString('es-ES') + ' años luz de casa';
  }

  // ---------- travel
  function travelTo(i) {
    const list = stops(); if (!list.length) return;
    i = ((i % list.length) + list.length) % list.length;
    if (travel || i === current) return;
    const to = list[i], from = list[current];
    $('card').classList.add('uv-hide');
    markRoute(i);
    controls.enabled = false;
    const S = camera.position.clone(), A = arrivalPos(to), D = S.distanceTo(A);
    const dirSA = A.clone().sub(S).normalize();
    const side = new THREE.Vector3().crossVectors(dirSA, UP).normalize();
    const P1 = S.clone().addScaledVector(dirSA, D * 0.3).addScaledVector(side, D * 0.08).addScaledVector(UP, D * 0.04);
    const P2 = A.clone().addScaledVector(to.viewDir, D * 0.22).addScaledVector(UP, D * 0.03);
    const first = current < 0;
    travel = { to, from, i, S, P1, P2, A, t: 0, turn: first ? 0.01 : 1.6, dur: first ? 6.5 : Math.min(9.5, 5.5 + D / 2600),
      q0: camera.quaternion.clone(), qStart: lookQ(S, P1), ly: to.ly - (from ? from.ly : 0) };
    to.p.object.visible = true;
    $('warpTo').textContent = 'Rumbo a ' + (to.p.info?.nombre || to.id);
  }
  function arrive(i) {
    const s = stops()[i];
    current = i; travel = null;
    controls.target.copy(s.pos);
    controls.minDistance = s.id === 'abismo' ? 420 : s.p.radius * 1.6;
    controls.maxDistance = s.p.viewDistance * 2.6;
    controls.enabled = true;
    controls.update();
    stops().forEach((o, k) => { o.p.object.visible = k === current; });
    showCard(s);
    markRoute(i);
    arrivedAt = performance.now();
  }
  function jumpTo(i) { // instant, no warp
    const s = stops()[i]; if (!s) return;
    travel = null;
    camera.position.copy(arrivalPos(s)); camera.lookAt(s.pos);
    lastCam.copy(camera.position);
    arrive(i);
  }

  // ---------- ship follow
  const shipState = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), init: false, show: true };
  const offTravel = new THREE.Vector3(0, -2.4, -19), offOrbit = new THREE.Vector3(6.5, -3.8, -30);
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), eul = new THREE.Euler();
  let shipBlend = 1;
  function updateShip(dt, t) {
    if (!shipApi) return;
    const o = shipApi.object;
    o.visible = shipState.show;
    const tgt = travel && travel.t > travel.turn ? 0 : 1;
    shipBlend += (tgt - shipBlend) * (1 - Math.exp(-dt * 1.5));
    const off = tmpV.copy(offTravel).lerp(offOrbit, shipBlend);
    off.y += Math.sin(t * 0.7) * 0.35; off.x += Math.sin(t * 0.43) * 0.4;
    const wp = off.applyQuaternion(camera.quaternion).add(camera.position);
    yawQ.setFromEuler(eul.set(Math.sin(t * 0.5) * 0.03, 0.42 * shipBlend, Math.sin(t * 0.6) * 0.05 - 0.1 * shipBlend));
    tmpQ.copy(camera.quaternion).multiply(yawQ);
    if (!shipState.init || shipState.pos.distanceToSquared(wp) > 40000) { shipState.pos.copy(wp); shipState.q.copy(tmpQ); shipState.init = true; }
    shipState.pos.lerp(wp, travel ? 1 - Math.exp(-dt * 8) : 1 - Math.exp(-dt * 2.2));
    shipState.q.slerp(tmpQ, 1 - Math.exp(-dt * 3));
    o.position.copy(shipState.pos);
    o.quaternion.copy(shipState.q);
    try { shipApi.update(dt, t, { speed: Math.max(0.06, cruise), boost: warp }); } catch (e) { console.error('ship', e); shipApi.update = () => {}; }
  }

  // ---------- frame
  const camVel = new THREE.Vector3(), lastCam = new THREE.Vector3();
  const lightDir = new THREE.Vector3(0, 0, 1), lightCol = new THREE.Color(1, 1, 1);
  const ca = new THREE.Color(), cb = new THREE.Color(), sA = new THREE.Color(), sB = new THREE.Color(), sC = new THREE.Color();
  const ctx = { camera, sunDir: new THREE.Vector3(), renderer, scene };
  const tmpAhead = new THREE.Vector3();
  let holeI = 1, viewShift = 0;

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    T += dt;
    let mix = 1, a = null, b = null;
    if (travel) {
      travel.t += dt;
      const { S, P1, P2, A } = travel;
      a = travel.from || travel.to; b = travel.to;
      if (travel.t < travel.turn) {
        const k = travel.t / travel.turn, e = k * k * (3 - 2 * k);
        camera.quaternion.slerpQuaternions(travel.q0, travel.qStart, e);
        warp = 0; cruise = e * 0.35; mix = 0;
      } else {
        const tau = Math.min(1, (travel.t - travel.turn) / travel.dur);
        const [u, v] = trap(tau, 0.26);
        bez(S, P1, P2, A, u, camera.position);
        if (u < 0.985) bez(S, P1, P2, A, Math.min(1, u + 0.015), tmpAhead); else tmpAhead.copy(A).add(A.clone().sub(P2).normalize());
        qA.copy(lookQ(camera.position, tmpAhead));
        qB.copy(lookQ(camera.position, travel.to.pos));
        camera.quaternion.slerpQuaternions(qA, qB, THREE.MathUtils.smoothstep(u, 0.55, 0.97));
        warp = THREE.MathUtils.smoothstep(v, 0.25, 1.0) * (travel.from ? 1 : 0.55);
        cruise = Math.max(0.35 * (1 - tau), v);
        mix = u;
        const rem = (1 - u) * travel.ly;
        $('warpS').textContent = (rem < 1 ? rem.toFixed(2) : rem.toFixed(1)).replace('.', ',') + ' años luz · ' + (v * 9.8).toFixed(1).replace('.', ',') + ' × c';
        if (tau >= 1) { warp = 0; arrive(travel.i); }
      }
    } else {
      warp *= Math.exp(-dt * 4);
      cruise += (0.06 - cruise) * (1 - Math.exp(-dt * 1.5));
      if (controls.enabled) { controls.autoRotate = performance.now() - lastInteract > 6000; controls.update(); }
      if (autoPilot && current >= 0 && performance.now() - arrivedAt > 22000) travelTo(current + 1);
    }
    $('warp').classList.toggle('uv-on', warp > 0.25);

    const list = stops();
    const sa = a || list[current] || ROUTE[0], sb = b || sa;
    const m = THREE.MathUtils.smoothstep(mix, 0.3, 0.8);
    lightDir.copy(sa.sunDir).lerp(sb.sunDir, m).normalize();
    ca.set(sa.p?.info?.estrella?.color ?? 0xffffff); cb.set(sb.p?.info?.estrella?.color ?? 0xffffff);
    lightCol.copy(ca).lerp(cb, m);
    sunLight.color.copy(lightCol);
    sunLight.position.copy(camera.position).addScaledVector(lightDir, 1000); sunLight.target.position.copy(camera.position);
    const isHole = (sa.id === 'abismo' && m < 0.5) || (sb.id === 'abismo' && m >= 0.5);
    holeI += ((isHole ? 0 : 1) - holeI) * (1 - Math.exp(-dt * 2));
    sky.setStar(lightDir, lightCol, holeI);
    sky.faceCamera(camera);
    sA.copy(sa.skyCols[0]).lerp(sb.skyCols[0], m); sB.copy(sa.skyCols[1]).lerp(sb.skyCols[1], m); sC.copy(sa.skyCols[2]).lerp(sb.skyCols[2], m);
    sky.setPalette(sA, sB, sC);
    ctx.sunDir.copy(lightDir);

    camVel.copy(camera.position).sub(lastCam).divideScalar(Math.max(dt, 1e-4)); lastCam.copy(camera.position);
    if (camVel.length() > 20000) camVel.setLength(20000);
    dustU.uCam.value.copy(camera.position);
    dustU.uVel.value.copy(camVel).multiplyScalar(warp > 0.02 ? 1 : 0.15);
    dustU.uWarp.value = warp;

    sky.u.uTime.value = T; sky.u.uWarp.value = warp;
    lensPass.uniforms.uWarp.value = warp; lensPass.uniforms.uTime.value = T;
    bloom.strength = 0.6 + warp * 0.6;
    const wantShift = (!travel && current >= 0 && W > 900 && !$('card').classList.contains('uv-hide')) ? 1 : 0;
    viewShift += (wantShift - viewShift) * (1 - Math.exp(-dt * 1.2));
    const sx = -W * 0.13 * viewShift;
    if (Math.abs(sx) > 0.5) { camera.setViewOffset(W, H, sx, 0, W, H); bgCamera.setViewOffset(W, H, sx, 0, W, H); }
    else { camera.clearViewOffset(); bgCamera.clearViewOffset(); }
    camera.fov = 55 + warp * 22; camera.updateProjectionMatrix();
    bgCamera.fov = camera.fov; bgCamera.aspect = camera.aspect; bgCamera.updateProjectionMatrix();
    bgCamera.quaternion.copy(camera.quaternion);

    for (const s of ROUTE) if (s.p && s.p.object.visible) { try { s.p.update(dt, T, ctx); } catch (e) { console.error(s.id, e); s.p.update = () => {}; } }
    updateShip(dt, T);
    if (audio) {
      const at = audio.ac.currentTime;
      audio.lp.frequency.setTargetAtTime(500 + warp * 2600, at, 0.3);
      audio.ng.gain.setTargetAtTime(0.04 + warp * 0.5, at, 0.3);
      audio.nf.frequency.setTargetAtTime(220 + warp * 1600, at, 0.3);
    }
    composer.render();
  }

  // ---------- input (only while running)
  function setAuto(on) { autoPilot = on; $('auto').setAttribute('aria-pressed', String(on)); if (on) arrivedAt = performance.now() - 14000; }
  function toggleSound() {
    if (!audio) { audio = startAudio(); $('snd').setAttribute('aria-pressed', String(!!audio)); return; }
    const on = audio.ac.state !== 'running';
    on ? audio.ac.resume() : audio.ac.suspend();
    $('snd').setAttribute('aria-pressed', String(on));
  }
  $('next').onclick = () => travelTo(current + 1);
  $('prev').onclick = () => { setAuto(false); travelTo(current - 1); };
  $('auto').onclick = () => setAuto(!autoPilot);
  $('ship').onclick = () => { shipState.show = !shipState.show; $('ship').setAttribute('aria-pressed', String(shipState.show)); };
  $('snd').onclick = toggleSound;
  $('fs').onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen?.().catch(() => {}); } catch (e) {} };
  if ($('exit')) $('exit').onclick = () => onExit && onExit();
  const onKey = (e) => {
    if (e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable]')) return;
    if (e.key === 'ArrowRight') travelTo(current + 1);
    else if (e.key === 'ArrowLeft') { setAuto(false); travelTo(current - 1); }
    else if (e.key === ' ') { e.preventDefault(); setAuto(!autoPilot); }
    else if (e.key === 'h' || e.key === 'H') $('hud').classList.toggle('uv-off');
    else if (e.key === 'n' || e.key === 'N') $('ship').click();
    else if (e.key === 'm' || e.key === 'M') toggleSound();
    else if (e.key === 'f' || e.key === 'F') $('fs').click();
    else if (e.key === 'Escape' && onExit) onExit();
  };
  const resize = () => {
    const s = size(); if (s.w === W && s.h === H) return; W = s.w; H = s.h;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H, false); composer.setSize(W, H);
    lensPass.uniforms.uAspect.value = W / H;
  };
  const ro = new ResizeObserver(resize);

  // ---------- loading
  camera.position.set(-2600, 700, 3800);
  camera.lookAt(ROUTE[0].pos);
  lastCam.copy(camera.position);
  const ready = (async () => {
    const total = ROUTE.length + 1; let done = 0;
    const step = (msg) => { done++; if ($('bar')) $('bar').style.width = (done / total * 100) + '%'; if ($('status')) $('status').textContent = msg; };
    try {
      const mod = await import(new URL('ship.js', base).href);
      shipApi = mod.default(THREE);
      scene.add(shipApi.object);
      step('Nave lista. Calibrando sensores…');
    } catch (e) { console.error('ship', e); step('Nave sin casco visible, seguimos.'); }
    for (const s of ROUTE) {
      if (disposed) return;
      if ($('status')) $('status').textContent = 'Cartografiando ' + s.id + '…';
      try {
        const mod = await import(new URL('planets/' + s.id + '.js', base).href);
        const p = mod.default(THREE, { sunDir: s.sunDir.clone(), renderer });
        p.object.position.copy(s.pos);
        scene.add(p.object);
        s.p = p;
        step((p.info?.nombre || s.id) + ' en el mapa');
      } catch (e) { console.error(s.id, e); step('Sin datos de ' + s.id); }
      await new Promise((r) => setTimeout(r, 0));
    }
    if ($('status')) $('status').textContent = 'Compilando la luz de siete soles…';
    await new Promise((r) => setTimeout(r, 30));
    stops().forEach((s) => (s.p.object.visible = true));
    try { renderer.compile(scene, camera); renderer.compile(bgScene, bgCamera); } catch (e) {}
    stops().forEach((s) => (s.p.object.visible = false));
    buildRoute();
    if ($('status')) $('status').textContent = stops().length + ' mundos cartografiados. Todo listo, capitán.';
    if ($('go')) {
      $('go').disabled = false;
      $('go').onclick = () => { if (!audio) toggleSound(); launch(); };
    }
  })();
  function launch() {
    if ($('intro')) $('intro').classList.add('uv-gone');
    $('hud').classList.remove('uv-off');
    setTimeout(() => { if (current < 0 && !travel) travelTo(0); }, 400);
  }

  // ---------- public API
  const api = {
    ready,
    start() {
      if (running || disposed) return;
      running = true; clock.getDelta();
      addEventListener('keydown', onKey);
      ro.observe(canvas); resize();
      if (current >= 0) controls.enabled = !travel;
      renderer.setAnimationLoop(frame);
      if (audio && $('snd').getAttribute('aria-pressed') === 'true') audio.ac.resume();
      root.hidden = false;
    },
    stop() {
      if (!running) return;
      running = false;
      renderer.setAnimationLoop(null);
      removeEventListener('keydown', onKey);
      ro.disconnect();
      controls.enabled = false;
      if (audio) audio.ac.suspend();
      root.hidden = true;
    },
    dispose() {
      api.stop(); disposed = true;
      controls.dispose();
      if (audio) audio.ac.close();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { for (const k in x) x[k]?.isTexture && x[k].dispose(); x.dispose(); }); });
      sky.dispose(); composer.dispose?.(); renderer.dispose();
      root.remove();
    },
    /** Fly (warp) to a planet by id ('izaro') or index. `{ instant: true }` teleports. Waits for loading. */
    async goToPlanet(idOrIndex, { instant = false } = {}) {
      await ready;
      const list = stops();
      const i = typeof idOrIndex === 'number' ? idOrIndex : list.findIndex((s) => s.id === idOrIndex);
      if (i < 0 || i >= list.length) return;
      if ($('intro')) $('intro').classList.add('uv-gone');
      $('hud').classList.remove('uv-off');
      if (instant) jumpTo(i); else travelTo(i);
    },
    /** Starts the tour (same as pressing "Encender motores"). */
    async launch() { await ready; launch(); },
    planets: () => stops().map((s) => ({ id: s.id, nombre: s.p.info?.nombre, tipo: s.p.info?.tipo, info: s.p.info })),
    isRunning: () => running,
    get current() { return current; },
  };
  return api;
}
