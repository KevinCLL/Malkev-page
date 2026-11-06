// Planetas temáticos por hobby · La Malkevnia
//
// Cada planeta de la travesía guarda el "museo" de un hobby de Malkev. Este módulo trae:
//   - PLANETAS: la lista de mundos con su hobby, paleta y lore.
//   - crearPlanetaOrbital(id): el planeta visto desde el espacio (para el selector o el universo).
//   - crearSuperficie(id): la escena de superficie con sus hitos, para meterla en otro renderer.
//   - init(canvas, id, opts): todo montado (renderer, cámara, controles, bloom, aterrizaje).
//
// Necesita en la página el mismo importmap que la nave:
//   {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
//               "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ───────────────────────────── Catálogo ─────────────────────────────
// Nombres, tipos y paletas son los de la travesía de la POC (poc/src/travesia.js), para que el
// planeta que se ve por el ventanal sea el mismo en el que se aterriza.

export const PLANETAS = [
  {
    id: 'verdanza', nombre: 'Verdanza', hobby: 'Juegos de mesa', museo: 'El Prado de las Kallax',
    tipo: 'gas', paleta: ['#0f3a30', '#2f8a6c', '#cfeedd', '#7bbf9a'], atmo: '#9fe3b4', anillos: null, luna: 1.1, semilla: 61.9,
    lema: 'Un tablero del tamaño de una meseta.',
    descripcion: 'En la alta atmósfera de Verdanza flota una meseta de hierba con un tablero en medio. Allí están las dos Kallax convertidas en monumento, un corro de meeples gigantes y dados que nunca terminan de caer.',
  },
  {
    id: 'carmesi', nombre: 'Carmesí', hobby: 'Videojuegos', museo: 'El Salón de Neón',
    tipo: 'gas', paleta: ['#3d0f2a', '#a3306e', '#f3c6dc', '#d4648f'], atmo: '#ff9ccf', anillos: [1.4, 1.9, 0.34], luna: 0.7, semilla: 73.4,
    lema: 'Un sol a rayas y una partida que no se acaba.',
    descripcion: 'Una plataforma de rejilla de neón bajo el anillo de Carmesí. Recreativas encendidas, sprites a la deriva y un portal que siempre te lleva a la pantalla siguiente.',
  },
  {
    id: 'thalassa', nombre: 'Thalassa', hobby: 'Cine', museo: 'El Autocine del Fin del Mundo',
    tipo: 'rock', paleta: ['#0f2d5c', '#2f7fa8', '#d9e6ea', '#6a8a3f'], atmo: '#8ecbff', anillos: null, luna: 0.8, semilla: 14.2,
    lema: 'Una isla, una pantalla y el mar de público.',
    descripcion: 'En una de las tres islas del océano de Thalassa alguien montó un autocine. Siempre es de noche, el proyector nunca se apaga y los carretes que sobran se los quedó la playa.',
  },
  {
    id: 'gelida', nombre: 'Gélida', hobby: 'Libros y manga', museo: 'La Biblioteca de Hielo',
    tipo: 'ice', paleta: ['#3b4f7a', '#8aa5d6', '#eef3ff', '#b7c9ea'], atmo: '#cfe2ff', anillos: [1.3, 1.75, 0.22], luna: 0.9, semilla: 40.6,
    lema: 'Estanterías de hielo bajo la aurora.',
    descripcion: 'El frío conserva bien el papel. En Gélida las estanterías son de hielo, los tomos de manga se apilan en espiral y los libros abiertos vuelan en círculos esperando lector.',
  },
  {
    id: 'izaro', nombre: 'Izaro', hobby: 'Rol · Proyecto Arca', museo: 'Las Islas del Narrador',
    tipo: 'gas', paleta: ['#302645', '#70619a', '#ccc5d6', '#87698a'], atmo: '#9e99ff', anillos: null, luna: 1, semilla: 9.7,
    lema: 'El gigante violeta donde empezó todo.',
    descripcion: 'Izaro es también el mundo de Proyecto Arca, la partida de rol que acabó en novela. Sobre su mar de nubes flotan islas con un círculo de piedras, cristales de Éter y las ruinas de la Academia.',
  },
  {
    id: 'nix-aurea', nombre: 'Nix Áurea', hobby: 'Música', museo: 'El Escenario Dorado',
    tipo: 'gas', paleta: ['#5a3c1a', '#b7843c', '#f1dfb0', '#c9a05c'], atmo: '#ffd9a0', anillos: [1.35, 2.2, 0.28], luna: 0.6, semilla: 21.5,
    lema: 'Sus anillos suenan como un vinilo.',
    descripcion: 'Un escenario flotante sobre nubes de miel. Los anillos de Nix Áurea giran como un disco, el ecualizador sigue un ritmo que nadie toca y las notas se escapan hacia arriba.',
  },
  {
    id: 'lumen', nombre: 'Lumen', hobby: 'Bitácora', museo: 'El Faro de la Bitácora',
    tipo: 'ice', paleta: ['#5a5470', '#a89fc4', '#fbf7ff', '#d9ccf2'], atmo: '#e8dcff', anillos: [1.25, 1.55, 0.18], luna: 0.4, semilla: 97.2,
    lema: 'La última escala antes de volver: aquí se escribe.',
    descripcion: 'Una llanura pálida y en silencio, con un faro que ilumina lo escrito. Las entradas del blog flotan en holopaneles y las páginas sueltas se las lleva el viento.',
  },
];

const porId = (id) => PLANETAS.find((p) => p.id === id) || PLANETAS[0];

// Entradas reales de malkevnia.com que se ven en Lumen si no se pasan otras (opts.posts).
const POSTS_POR_DEFECTO = [
  { titulo: 'Bienvenidos a Malkevnia', fecha: '2026-05-21', tags: ['meta', 'bienvenida'], min: 3, url: 'https://malkevnia.com/blog/2026/05/21/bienvenida/' },
  { titulo: 'Proyecto Arca — El mundo de Izaro', fecha: '2026-05-25', tags: ['proyecto-arca', 'rol', 'izaro'], min: 26, url: 'https://malkevnia.com/blog/2026/05/25/proyecto-arca-trasfondo/' },
  { titulo: 'Ressaca', fecha: '2018-08-01', tags: ['poesía', 'català'], min: 1, url: 'https://malkevnia.com/blog/2018/08/01/ressaca/' },
  { titulo: '15M', fecha: '2018-05-14', tags: ['diario'], min: 1, url: 'https://malkevnia.com/blog/2018/05/14/15m/' },
  { titulo: 'El trascender del momento', fecha: '2015-10-24', tags: ['poesía'], min: 1, url: 'https://malkevnia.com/blog/2015/10/24/nostalgia/' },
  { titulo: 'Manual de instrucciones', fecha: '2015-10-07', tags: ['relatos', 'humor'], min: 4, url: 'https://malkevnia.com/blog/2015/10/07/manual-de-instrucciones/' },
  { titulo: 'Siete sueños II', fecha: '2013-05-01', tags: ['sueños'], min: 6, url: 'https://malkevnia.com/blog/2013/05/01/siete-suenos-ii/' },
  { titulo: 'Alta fidelidad (High Fidelity)', fecha: '2012-07-07', tags: ['cine'], min: 3, url: 'https://malkevnia.com/blog/2012/07/07/alta-fidelidad/' },
];

// ───────────────────────────── Utilidades ─────────────────────────────

const TAU = Math.PI * 2;
const col = (h) => new THREE.Color(h);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let s = (Math.floor(seed * 9973) >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

const GLSL_NOISE = /* glsl */`
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }
`;

function texturaCanvas(w, h, dibujar) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); dibujar(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redibujar = (fn) => { g.clearRect(0, 0, w, h); fn(g, w, h); t.needsUpdate = true; };
  return t;
}

let _punto = null;
function texturaPunto() {
  if (_punto) return _punto;
  _punto = texturaCanvas(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  _punto.userData.compartida = true;
  return _punto;
}

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, flatShading: o.flat ?? false,
    emissive: o.em ?? 0x000000, emissiveIntensity: o.emI ?? 1, transparent: o.opacity != null, opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide, map: o.map ?? null, depthWrite: o.depthWrite ?? true,
  });
}
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: !!(o.opacity != null || o.add), opacity: o.opacity ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add && o.depthWrite !== false, side: o.side ?? THREE.FrontSide, map: o.map ?? null, fog: o.fog ?? true });

// ───────────────────────────── Planeta visto desde órbita ─────────────────────────────

const KIND = { gas: 0, rock: 1, ice: 2 };

/**
 * Planeta esférico con shader propio, atmósfera y anillos (si los tiene).
 * Devuelve un THREE.Group; group.userData.update(t) anima nubes y bandas;
 * group.userData.luz (Vector3) es la dirección de la luz en mundo.
 */
export function crearPlanetaOrbital(id, { radio = 1, luz = new THREE.Vector3(-1, 0.4, 0.6), segmentos = 96 } = {}) {
  const P = porId(id);
  const g = new THREE.Group(); g.name = `planeta-${P.id}`;
  const pal = P.paleta.map(col);
  const atmo = col(P.atmo);
  const uniforms = {
    c0: { value: pal[0] }, c1: { value: pal[1] }, c2: { value: pal[2] }, c3: { value: pal[3] },
    uAtmo: { value: atmo }, uKind: { value: KIND[P.tipo] }, uSeed: { value: P.semilla }, uTime: { value: 0 },
    uLight: { value: luz.clone().normalize() },
  };
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(radio, segmentos, segmentos * 0.75 | 0), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      void main(){ vPos = position; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 c0,c1,c2,c3,uAtmo,uLight; uniform float uKind,uSeed,uTime;
      varying vec3 vPos; varying vec3 vN; varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec3 p = normalize(vPos); vec3 col;
        if(uKind < .5){
          float w = fbm3(vec3(p.x*2., p.y*7., p.z*2.) + uSeed + vec3(uTime*.015,0.,0.));
          float b = sin(p.y*13. + w*7.)*.5+.5;
          col = mix(c0, c1, b); col = mix(col, c2, smoothstep(.55,.85,w)*.85);
          col = mix(col, c3, smoothstep(.5,.75, fbm3(p*5.+uSeed))*.35);
        } else if(uKind < 1.5){
          float n = fbm3(p*2.4 + uSeed);
          col = n > .53 ? mix(c3, c2*.85, smoothstep(.62,.8,n)) : mix(c0, c1, smoothstep(.28,.53,n));
          float cl = fbm3(p*4. + uSeed*2. + vec3(uTime*.02,0.,0.));
          col = mix(col, c2, smoothstep(.55,.78,cl)*.75);
        } else {
          float n = fbm3(p*3. + uSeed);
          col = mix(c1, c2, smoothstep(.32,.7,n));
          col = mix(col, c0, smoothstep(.58,.8, fbm3(p*8.+uSeed))*.45);
          col = mix(col, c2, smoothstep(.72,.95, abs(p.y)));
        }
        vec3 N = normalize(vN); float d = dot(N, normalize(uLight));
        col *= smoothstep(-.18, .65, d)*1.05 + .035;
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1. - max(dot(N, V), 0.), 3.);
        col += uAtmo * fr * .9 * smoothstep(-.35, .4, d);
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  g.add(esfera);

  const halo = new THREE.Mesh(new THREE.SphereGeometry(radio * 1.1, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uAtmo: { value: atmo }, uLight: uniforms.uLight },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vNW; void main(){ vN = normalize(normalMatrix*normal); vNW = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`uniform vec3 uAtmo, uLight; varying vec3 vN; varying vec3 vNW;
      void main(){ float i = pow(clamp(.72 - dot(vN, vec3(0.,0.,1.)), 0., 1.), 3.2); float lit = smoothstep(-.4,.5, dot(vNW, normalize(uLight)));
        gl_FragColor = vec4(uAtmo * i * (lit*1.6+.08), 1.); }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  g.add(halo);

  if (P.anillos) {
    const [ri, ro, alpha] = P.anillos;
    const anillo = new THREE.Mesh(new THREE.RingGeometry(radio * ri, radio * ro, 160, 1), new THREE.ShaderMaterial({
      uniforms: { c2: uniforms.c2, c3: uniforms.c3, uA: { value: alpha }, ri: { value: radio * ri }, ro: { value: radio * ro }, uLight: uniforms.uLight },
      vertexShader: /* glsl */`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */`uniform vec3 c2,c3; uniform float uA, ri, ro; varying vec3 vP;
        float h(float x){ return fract(sin(x*12.9898)*43758.5453); }
        void main(){ float t = (length(vP.xy)-ri)/(ro-ri);
          float band = .35 + .65*h(floor(t*70.)); band *= .6 + .4*sin(t*180.);
          float a = uA * 2.4 * band * smoothstep(0.,.06,t) * smoothstep(1.,.9,t);
          gl_FragColor = vec4(mix(c3, c2, h(floor(t*23.))), a); }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
    }));
    anillo.rotation.x = Math.PI / 2 - 0.35; anillo.rotation.y = 0.25;
    g.add(anillo);
  }
  g.rotation.z = 0.18;
  g.userData.update = (t) => { uniforms.uTime.value = t; esfera.rotation.y = t * 0.03; };
  g.userData.luz = uniforms.uLight.value;
  g.userData.planeta = P;
  return g;
}

// ───────────────────────────── Piezas comunes de superficie ─────────────────────────────

function cielo(ctx, o) {
  const u = {
    uTop: { value: col(o.top) }, uMid: { value: col(o.mid) }, uHor: { value: col(o.hor) }, uTime: { value: 0 },
    uStars: { value: o.estrellas ?? 0.8 }, uAur: { value: o.aurora ?? 0 }, uAurA: { value: col(o.auroraA ?? '#7dffcf') }, uAurB: { value: col(o.auroraB ?? '#c08cff') },
    uSunDir: { value: new THREE.Vector3(...(o.solDir ?? [0, 0.2, -1])).normalize() }, uSunCol: { value: col(o.sol ?? '#ffffff') },
    uSunSize: { value: o.solTam ?? 0.0015 }, uStripes: { value: o.rayas ? 1 : 0 },
  };
  const m = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop,uMid,uHor,uAurA,uAurB,uSunDir,uSunCol; uniform float uTime,uStars,uAur,uSunSize,uStripes; varying vec3 vD;
      float hs(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uMid, smoothstep(-.04, .28, h)); c = mix(c, uTop, smoothstep(.28, .95, h));
        vec3 p = d*260.; vec3 id = floor(p); float r = hs(id);
        float st = step(.9965, r) * smoothstep(.5, .1, length(fract(p)-.5)) * smoothstep(.02, .3, h);
        c += st * uStars * (.55 + .45*sin(uTime*1.7 + r*60.)) * mix(vec3(1.), vec3(.8,.85,1.2), hs(id+3.));
        float sd = dot(d, uSunDir);
        float disc = smoothstep(1.-uSunSize, 1.-uSunSize*.82, sd);
        if(uStripes > .5){ float below = step(d.y, uSunDir.y + .02); float k = (uSunDir.y + .02 - d.y)*60.; disc *= mix(1., step(.18 + clamp((uSunDir.y-d.y)*9.,0.,.7), fract(k)), below); c += disc * mix(uSunCol, vec3(1.,.35,.6), smoothstep(uSunDir.y+.12, uSunDir.y-.12, d.y)) * .95; }
        else c += disc * uSunCol * 2.2;
        c += uSunCol * pow(max(sd, 0.), 18.) * .3*(1.-uStripes*.6) + uSunCol * pow(max(sd,0.), 4.) * .08*(1.-uStripes*.7);
        if(uAur > 0.){
          float w = sin(d.x*5. + uTime*.25 + sin(d.z*3.7 + uTime*.18)*2.3) * .5 + .5;
          float w2 = sin(d.z*7. - uTime*.21 + sin(d.x*2.9)*1.7) * .5 + .5;
          float band = smoothstep(.08, .3, h) * smoothstep(.8, .38, h);
          float cortina = pow(w, 3.) * (.6 + .4*sin(d.x*90. + d.z*40. + uTime));
          c += mix(uAurA, uAurB, w2) * (cortina + pow(w2,5.)*.5) * band * uAur * .9;
        }
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  m.renderOrder = -10; m.frustumCulled = false;
  ctx.scene.add(m);
  ctx.alActualizar((t) => { u.uTime.value = t; });
  return u;
}

function luces(ctx, o) {
  const hemi = new THREE.HemisphereLight(o.cielo, o.suelo, o.hemi ?? 0.7); ctx.scene.add(hemi);
  const sol = new THREE.DirectionalLight(o.sol ?? '#ffffff', o.solI ?? 1.4);
  // La luz apunta al centro del museo; la posición solo da la dirección.
  sol.position.copy(new THREE.Vector3(...(o.solPos ?? [-40, 60, -30])).normalize().multiplyScalar(140));
  sol.target.position.set(0, 0, 0); ctx.scene.add(sol, sol.target);
  if (ctx.sombras) {
    sol.castShadow = true; const sc = sol.shadow.camera; const L = o.sombraLado ?? 58;
    sc.left = -L; sc.right = L; sc.top = L; sc.bottom = -L; sc.near = 20; sc.far = 300;
    sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.05; sol.shadow.radius = 3;
  }
  return { hemi, sol };
}

function niebla(ctx, color, cerca, lejos) { ctx.scene.fog = new THREE.Fog(color, cerca, lejos); }

// Terreno: un plano subdividido con altura y color por vértice.
function suelo(ctx, { tam = 360, seg = 220, altura, color, rough = 0.95, flat = true, metal = 0, y = 0, x = 0, z = 0 }) {
  const geo = new THREE.PlaneGeometry(tam, tam, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const cols = new Float32Array(pos.count * 3); const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + x, pz = pos.getZ(i) + z; const h = altura(px, pz); // muestreo en coordenadas de mundo
    pos.setY(i, h + y); color(px, pz, h, c); c.toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, flatShading: flat }));
  geo.translate(x, 0, z); m.userData.suelo = true;
  ctx.scene.add(m); return m;
}

// Partículas con movimiento: flotar, caer, subir.
function particulas(ctx, { n = 300, centro = [0, 6, 0], area = [80, 20, 80], color = '#ffffff', tam = 0.5, modo = 'flotar', vel = 1, opacidad = 0.9, padre = null }) {
  const r = ctx.rnd; const pos = new Float32Array(n * 3); const base = new Float32Array(n * 3); const fase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    base[i * 3] = centro[0] + (r() - 0.5) * area[0]; base[i * 3 + 1] = centro[1] + (r() - 0.5) * area[1]; base[i * 3 + 2] = centro[2] + (r() - 0.5) * area[2];
    fase[i] = r() * 100;
  }
  pos.set(base);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: tam, map: texturaPunto(), transparent: true, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  m.frustumCulled = false; (padre ?? ctx.scene).add(m); // con padre, el centro va en coordenadas locales (p. ej. una isla que flota)
  const y0 = centro[1] - area[1] / 2;
  ctx.alActualizar((t) => {
    for (let i = 0; i < n; i++) {
      const f = fase[i], k = i * 3;
      if (modo === 'flotar') {
        pos[k] = base[k] + Math.sin(t * 0.3 * vel + f) * 1.4; pos[k + 1] = base[k + 1] + Math.sin(t * 0.5 * vel + f * 1.3) * 0.9; pos[k + 2] = base[k + 2] + Math.cos(t * 0.27 * vel + f) * 1.4;
      } else if (modo === 'caer') {
        pos[k + 1] = y0 + ((base[k + 1] - y0 - t * vel * (0.6 + (f % 1)) * 2) % area[1] + area[1]) % area[1];
        pos[k] = base[k] + Math.sin(t * 0.6 + f) * 1.2; pos[k + 2] = base[k + 2] + Math.cos(t * 0.5 + f) * 1.2;
      } else {
        pos[k + 1] = y0 + ((base[k + 1] - y0 + t * vel * (0.5 + (f % 1))) % area[1] + area[1]) % area[1];
        pos[k] = base[k] + Math.sin(t * 0.8 + f) * 0.5;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
  return m;
}

// Un planeta vecino colgado en el cielo.
function planetaEnCielo(ctx, id, dir, radio, distancia = 900) {
  const p = crearPlanetaOrbital(id, { radio, luz: new THREE.Vector3(-0.8, 0.5, 0.6), segmentos: 64 });
  p.position.copy(new THREE.Vector3(...dir).normalize().multiplyScalar(distancia));
  p.traverse((o) => { if (o.material) { o.material.fog = false; } o.renderOrder = -9; });
  ctx.scene.add(p); ctx.alActualizar((t) => p.userData.update(t));
  return p;
}

// Mar de nubes animado (para mundos gaseosos).
function marDeNubes(ctx, { y = -30, a = '#302645', b = '#ccc5d6', luz = '#ffffff', tam = 2400 }) {
  const u = { uA: { value: col(a) }, uB: { value: col(b) }, uL: { value: col(luz) }, uTime: { value: 0 }, fogColor: { value: ctx.scene.fog?.color ?? col('#000') }, fogNear: { value: ctx.scene.fog?.near ?? 1 }, fogFar: { value: ctx.scene.fog?.far ?? 1000 } };
  const geo = new THREE.PlaneGeometry(tam, tam, 1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: u, fog: true, transparent: false,
    vertexShader: `varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform vec3 uA,uB,uL; uniform float uTime; varying vec3 vW;\n#include <fog_pars_fragment>\n${GLSL_NOISE}
      void main(){ vec2 p = vW.xz*.012; float n = fbm3(vec3(p + vec2(uTime*.012, uTime*.006), uTime*.02));
        float n2 = fbm3(vec3(p*3. - vec2(uTime*.02,0.), 4.));
        vec3 c = mix(uA, uB, smoothstep(.3,.75,n)); c += uL * smoothstep(.55,.8,n2*n*1.6) * .25;
        gl_FragColor = vec4(c,1.);\n#include <fog_fragment>\n}`,
  }));
  m.position.y = y; ctx.scene.add(m);
  ctx.alActualizar((t) => { u.uTime.value = t; });
  return m;
}

// Isla flotante: tapa con terreno y panza de roca.
function islaFlotante(ctx, { x = 0, y = 0, z = 0, r = 20, prof = 18, cesped = '#6f8f5a', roca = '#4a3d63', semilla = 1 }) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const top = new THREE.CylinderGeometry(r, r * 0.92, 1.6, 48, 1); top.translate(0, -0.8, 0);
  const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) { const px = tp.getX(i), pz = tp.getZ(i); const rr = Math.hypot(px, pz); if (rr > r * 0.9) { const k = 1 + (vnoise(px * 0.3 + semilla, pz * 0.3) - 0.5) * 0.12; tp.setX(i, px * k); tp.setZ(i, pz * k); } }
  top.computeVertexNormals();
  g.add(new THREE.Mesh(top, mat(cesped, { flat: true, rough: 0.95 })));
  const panza = new THREE.ConeGeometry(r * 0.95, prof, 28, 6, true); panza.rotateX(Math.PI); panza.translate(0, -1.6 - prof / 2, 0);
  const pp = panza.attributes.position;
  for (let i = 0; i < pp.count; i++) { const px = pp.getX(i), py = pp.getY(i), pz = pp.getZ(i); const k = 1 + (vnoise(px * 0.25 + semilla * 3, py * 0.25 + pz * 0.2) - 0.5) * 0.5; pp.setX(i, px * k); pp.setZ(i, pz * k); }
  panza.computeVertexNormals();
  g.add(new THREE.Mesh(panza, mat(roca, { flat: true, rough: 1 })));
  ctx.scene.add(g);
  const fase = semilla * 1.7;
  ctx.alActualizar((t) => { g.position.y = y + Math.sin(t * 0.35 + fase) * 0.35; });
  return g;
}

function anilloEnCielo(ctx, { radioIn = 700, radioOut = 980, centro = [0, -380, -200], inclinacion = 0.32, a = '#f3c6dc', b = '#d4648f', alpha = 0.5, surcos = false }) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radioIn, radioOut, 256, 1), new THREE.ShaderMaterial({
    uniforms: { cA: { value: col(a) }, cB: { value: col(b) }, uA: { value: alpha }, ri: { value: radioIn }, ro: { value: radioOut }, uS: { value: surcos ? 1 : 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`uniform vec3 cA,cB; uniform float uA,ri,ro,uS,uTime; varying vec3 vP;
      float h(float x){ return fract(sin(x*12.9898)*43758.5453); }
      void main(){ float t = (length(vP.xy)-ri)/(ro-ri);
        float band = .35 + .65*h(floor(t*60.)); band *= .65 + .35*sin(t*260.);
        if(uS > .5){ float ang = atan(vP.y, vP.x); band *= .7 + .3*sin(t*900.); band += .5*pow(max(0., sin(ang*2. - uTime*.6 + t*6.)), 30.); }
        float a = uA * band * smoothstep(0.,.05,t) * smoothstep(1.,.93,t);
        gl_FragColor = vec4(mix(cB, cA, h(floor(t*17.))), a); }`,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
  }));
  m.position.set(...centro); m.rotation.x = -Math.PI / 2 + inclinacion; m.renderOrder = -8;
  ctx.scene.add(m);
  ctx.alActualizar((t) => { m.material.uniforms.uTime.value = t; });
  return m;
}

function instanciado(ctx, geo, material, n, dinamico = false) {
  const m = new THREE.InstancedMesh(geo, material, n);
  if (dinamico) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; }
  ctx.scene.add(m); return m;
}
const _o = new THREE.Object3D();
function colocar(im, i, pos, rot = [0, 0, 0], esc = [1, 1, 1]) { _o.position.set(...pos); _o.rotation.set(...rot); _o.scale.set(...esc); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); }

function luzPunto(ctx, color, intensidad, distancia, pos) { const l = new THREE.PointLight(color, intensidad, distancia, 2); l.position.set(...pos); ctx.scene.add(l); return l; }

// ───────────────────────────── Escenas por planeta ─────────────────────────────
// Cada escena recibe ctx y devuelve { camara: {pos, objetivo}, bloom: {fuerza, radio, umbral}, exposicion }.
// Los hitos se registran con ctx.hito({ id, nombre, texto, objeto, foco, vista }).

const ESCENAS = {};

// ── Verdanza · Juegos de mesa ──
ESCENAS.verdanza = (ctx) => {
  cielo(ctx, { top: '#0b2430', mid: '#2f6f6a', hor: '#f3dca4', estrellas: 0.35, solDir: [-0.55, 0.1, -0.8], sol: '#ffd9a0', solTam: 0.0022 });
  niebla(ctx, '#a8c9a6', 70, 360);
  luces(ctx, { cielo: '#cfeedd', suelo: '#2f5a3a', hemi: 0.9, sol: '#ffe0b0', solI: 2.2, solPos: [-55, 30, -80] });
  planetaEnCielo(ctx, 'nix-aurea', [0.55, 0.32, -0.75], 150);

  const TAB = 22;
  const altura = (x, z) => { const r = Math.hypot(x, z); const f = smooth(32, 90, r); return (fbm(x * 0.018, z * 0.018) * 26 - 9) * f + fbm(x * 0.2, z * 0.2) * 0.4 * f; };
  const pr = col('#2f8a6c'), cl = col('#7bbf9a'), am = col('#d8c98a'), crema = col('#efe6cc'), verde = col('#2b5f4f');
  suelo(ctx, {
    altura, color: (x, z, h, c) => {
      if (Math.abs(x) < TAB + 1 && Math.abs(z) < TAB + 1) { c.copy(verde); return; }
      c.copy(pr).lerp(cl, fbm(x * 0.05, z * 0.05)); c.lerp(am, smooth(0.62, 0.8, fbm(x * 0.02 + 9, z * 0.02)) * 0.6);
    },
  });
  // Tablero: un plano con textura nítida (casillas de 4,4 m) encima de la hierba, y su marco de madera.
  const tabTex = texturaCanvas(1024, 1024, (g, w, h) => {
    const n = 10, cs = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#2b5f4f' : '#efe6cc'; g.fillRect(i * cs, j * cs, cs, cs);
      // veta suave de madera pintada
      g.globalAlpha = 0.07; g.fillStyle = (i + j) % 2 ? '#0f3a30' : '#c9b48a';
      for (let k = 0; k < 6; k++) g.fillRect(i * cs, j * cs + ((k * 37 + i * 13 + j * 7) % cs), cs, 2 + (k % 3));
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(20,40,32,.55)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, h); g.stroke(); g.beginPath(); g.moveTo(0, i * cs); g.lineTo(w, i * cs); g.stroke(); }
    // rosa de los vientos en el centro, como en los tableros de exploración
    g.save(); g.translate(w / 2, h / 2); g.fillStyle = 'rgba(201,163,92,.85)';
    for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(0, -(k % 2 ? 70 : 130)); g.lineTo(18, 0); g.lineTo(-18, 0); g.fill(); }
    g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fillStyle = '#6b4a2e'; g.fill(); g.restore();
  });
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(TAB * 2, TAB * 2), mat('#ffffff', { map: tabTex, rough: 0.8 }));
  tablero.rotation.x = -Math.PI / 2; tablero.position.y = 0.04; tablero.userData.suelo = true; ctx.scene.add(tablero);
  const maderaMarco = mat('#6b4a2e', { rough: 0.7 });
  [[0, -TAB - 0.5, TAB * 2 + 2, 1], [0, TAB + 0.5, TAB * 2 + 2, 1], [-TAB - 0.5, 0, 1, TAB * 2], [TAB + 0.5, 0, 1, TAB * 2]].forEach(([x, z, w, d]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), maderaMarco); b.position.set(x, 0.2, z); ctx.scene.add(b);
  });

  // La Gran Kallax
  const kx = new THREE.Group(); kx.position.set(0, 0, -15); ctx.scene.add(kx);
  const celda = 4.4, gros = 0.4, prof = 3.8, N = 4; const blanco = mat('#f4f1ea', { rough: 0.55 });
  const ancho = N * celda + gros;
  for (let i = 0; i <= N; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(gros, ancho, prof), blanco); v.position.set(-ancho / 2 + gros / 2 + i * celda, ancho / 2 + 0.6, 0); kx.add(v);
    const h = new THREE.Mesh(new THREE.BoxGeometry(ancho, gros, prof), blanco); h.position.set(0, gros / 2 + 0.6 + i * celda, 0); kx.add(h);
  }
  const fondo = new THREE.Mesh(new THREE.BoxGeometry(ancho, ancho, 0.1), mat('#ddd6c8')); fondo.position.set(0, ancho / 2 + 0.6, -prof / 2); kx.add(fondo);
  const coloresCaja = ['#d9534f', '#f0ad4e', '#5bc0de', '#3a7bd5', '#8e5ad6', '#2e8b57', '#e86fa3', '#f5e6c4', '#2d2a32', '#c0392b', '#16a085', '#f1c40f'];
  const cajas = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { rough: 0.6 }), 120); kx.add(cajas);
  let ci = 0; const r = ctx.rnd;
  for (let fx = 0; fx < N; fx++) for (let fy = 0; fy < N; fy++) {
    const x0 = -ancho / 2 + gros + fx * celda, y0 = gros + 0.6 + fy * celda;
    if (r() < 0.5) { // pila tumbada
      let y = y0; while (y < y0 + celda - 1.2 && ci < 120) { const hh = 0.45 + r() * 0.6; const w = celda - 0.5 - r() * 0.6; colocar(cajas, ci, [x0 + (celda - gros) / 2 + (r() - 0.5) * 0.2, y + hh / 2, 0.15], [0, (r() - 0.5) * 0.1, 0], [w, hh, prof - 0.5 - r() * 0.5]); cajas.setColorAt(ci++, col(coloresCaja[(r() * coloresCaja.length) | 0])); y += hh + 0.02; }
    } else { // de pie
      let x = x0 + 0.1; while (x < x0 + celda - 1.0 && ci < 120) { const w = 0.6 + r() * 0.6; const hh = celda - 0.6 - r() * 1.0; colocar(cajas, ci, [x + w / 2, y0 + hh / 2, 0.15], [0, 0, 0], [w, hh, prof - 0.4 - r() * 0.6]); cajas.setColorAt(ci++, col(coloresCaja[(r() * coloresCaja.length) | 0])); x += w + 0.04; }
    }
  }
  cajas.count = ci;
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), basic('#ffffff', { map: texturaCanvas(640, 100, (g, w, h) => { g.fillStyle = '#1b3a32'; g.fillRect(0, 0, w, h); g.fillStyle = '#f3dca4'; g.font = '600 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('220 cajas · 90 libros de rol', w / 2, h / 2); }) }));
  placa.position.set(0, 0.35, prof / 2 + 1.4); placa.rotation.x = -0.5; kx.add(placa);
  ctx.hito({ id: 'kallax', nombre: 'La Gran Kallax', objeto: kx, foco: [0, 8, -15], vista: [10, 11, 6],
    texto: 'Las dos Kallax de casa, transcritas cubo a cubo: 220 cajas y 90 libros de rol. Aquí cada cubo es una vitrina del museo, desde la colección GIPF hasta La Guerra del Anillo.' });

  // Corro de meeples
  const s = new THREE.Shape();
  s.moveTo(-1, 0); s.lineTo(-0.28, 0); s.lineTo(0, 0.42); s.lineTo(0.28, 0); s.lineTo(1, 0); s.lineTo(0.55, 1.0);
  s.quadraticCurveTo(1.25, 1.25, 1.12, 1.52); s.lineTo(0.38, 1.62); s.quadraticCurveTo(0.62, 2.45, 0, 2.48); s.quadraticCurveTo(-0.62, 2.45, -0.38, 1.62);
  s.lineTo(-1.12, 1.52); s.quadraticCurveTo(-1.25, 1.25, -0.55, 1.0); s.lineTo(-1, 0);
  const meepleGeo = new THREE.ExtrudeGeometry(s, { depth: 0.62, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3 }); meepleGeo.translate(0, 0, -0.31);
  const corro = new THREE.Group(); corro.position.set(-32, 0, 10); ctx.scene.add(corro);
  const cm = ['#d9534f', '#f0c419', '#3a7bd5', '#2e8b57', '#f4f1ea', '#2d2a32', '#e8743b', '#8e5ad6'];
  const meeples = cm.map((c, i) => {
    const m = new THREE.Mesh(meepleGeo, mat(c, { rough: 0.55 })); const a = (i / cm.length) * TAU; m.position.set(Math.cos(a) * 7, 0, Math.sin(a) * 7); m.scale.setScalar(2.1);
    m.lookAt(corro.position.x, 0, corro.position.z); m.rotateY(Math.PI / 2); m.userData.a = a; corro.add(m); return m;
  });
  const centro = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 6), mat('#c9a35c', { rough: 0.6 })); centro.position.y = altura(-32, 10) + 0.25; corro.add(centro);
  meeples.forEach((m) => { m.position.y = altura(corro.position.x + m.position.x, corro.position.z + m.position.z); });
  ctx.alActualizar((t) => meeples.forEach((m, i) => { m.position.y = Math.max(0, altura(corro.position.x + m.position.x, corro.position.z + m.position.z)) + Math.abs(Math.sin(t * 2 + i * 0.8)) * 0.6; }));
  ctx.hito({ id: 'meeples', nombre: 'El corro de meeples', objeto: corro, foco: [-32, 3, 10], vista: [-17, 8, 22],
    texto: 'Ocho meeples de colores dando saltitos alrededor de una ficha de madera. Están esperando a que alguien saque la siguiente caja de la Kallax.' });

  // Dados errantes
  const caras = [1, 2, 3, 4, 5, 6].map((n) => texturaCanvas(128, 128, (g) => {
    g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, 128, 128); g.fillStyle = n === 1 ? '#c0392b' : '#2d2a32';
    const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] }[n];
    P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, n === 1 ? 16 : 11, 0, TAU); g.fill(); });
  }));
  const dadoMats = [caras[0], caras[5], caras[1], caras[4], caras[2], caras[3]].map((t) => mat('#ffffff', { map: t, rough: 0.4 }));
  const dados = [[22, 9, -4, 3.2], [27, 13, 4, 2.4], [17, 15, 6, 1.8]].map(([x, y, z, e], i) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(e, e, e), dadoMats); d.position.set(x, y, z); d.userData.y = y; d.userData.i = i; ctx.scene.add(d); return d;
  });
  ctx.alActualizar((t) => dados.forEach((d) => { d.rotation.x = t * (0.3 + d.userData.i * 0.12); d.rotation.y = t * (0.21 + d.userData.i * 0.07); d.position.y = d.userData.y + Math.sin(t * 0.8 + d.userData.i * 2) * 1.2; }));
  const grupoDados = new THREE.Group(); dados.forEach((d) => grupoDados.add(d)); ctx.scene.add(grupoDados);
  ctx.hito({ id: 'dados', nombre: 'Dados errantes', objeto: grupoDados, foco: [22, 11, 2], vista: [8, 12, 20],
    texto: 'Tres dados que se lanzaron hace mucho y todavía no han decidido qué número sale. Si alguno cae, la partida empieza.' });

  // Jardín de los abstractos (hexágono con fichas blancas y negras)
  const jardin = new THREE.Group(); jardin.position.set(24, 0, -14); ctx.scene.add(jardin);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.9, 0.8, 6), mat('#8d8a80', { rough: 0.9, flat: true })); hex.position.y = 0.4 + Math.max(0, altura(24, -14)); jardin.add(hex);
  const y0 = hex.position.y + 0.4;
  const ficha = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 20);
  const negras = new THREE.InstancedMesh(ficha, mat('#1d1b22', { rough: 0.3 }), 80), blancas = new THREE.InstancedMesh(ficha, mat('#f4f1ea', { rough: 0.3 }), 80);
  let nn = 0, nb = 0;
  for (let q = -6; q <= 6; q++) for (let rr = -6; rr <= 6; rr++) {
    const x = (q + rr / 2) * 1.05, z = rr * 0.91; if (Math.hypot(x, z) > 6.4) continue;
    const pila = r() < 0.4 ? 0 : 1 + ((r() * 3) | 0);
    for (let k = 0; k < pila; k++) { const negra = r() < 0.5; const im = negra ? negras : blancas; const idx = negra ? nn++ : nb++; if (idx >= 80) continue; colocar(im, idx, [x, y0 + 0.13 + k * 0.27, z]); }
  }
  negras.count = Math.min(nn, 80); blancas.count = Math.min(nb, 80); jardin.add(negras, blancas);
  ctx.hito({ id: 'abstractos', nombre: 'El jardín de los abstractos', objeto: jardin, foco: [24, 1, -14], vista: [32, 9, -2],
    texto: 'Un tablero hexagonal en homenaje a la colección GIPF que vive encima de la Kallax 1: GIPF, TZAAR, ZÈRTZ, DVONN, PÜNCT, YINSH, LYNGK, MATRX y TAMSK.' });

  // Camino de losetas hexagonales hacia la cámara y bosquecillo
  const tierras = ['#e6c34d', '#2f6b3a', '#b5532f', '#8e8e8e', '#a9d27a', '#d9b38c'];
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.35, 6), mat(tierras[i % 6], { flat: true })); l.position.set(Math.sin(i * 0.7) * 3, 0.5, TAB + 4 + i * 4.2); l.position.y = Math.max(0.3, altura(l.position.x, l.position.z) + 0.2); ctx.scene.add(l); }
  const arbol = new THREE.ConeGeometry(1.6, 5, 6); arbol.translate(0, 3.2, 0);
  const arboles = instanciado(ctx, arbol, mat('#1f5a43', { flat: true }), 160);
  for (let i = 0; i < 160; i++) { const a = r() * TAU, d = 40 + r() * 110; const x = Math.cos(a) * d, z = Math.sin(a) * d; const e = 0.7 + r() * 1.2; colocar(arboles, i, [x, altura(x, z), z], [0, r() * 3, 0], [e, e * (0.8 + r() * 0.6), e]); }
  particulas(ctx, { n: 260, centro: [0, 6, 0], area: [110, 14, 110], color: '#ffe9a8', tam: 0.35, modo: 'flotar', opacidad: 0.8 });

  return { camara: { pos: [0, 16, 44], objetivo: [0, 5, -4] }, bloom: { fuerza: 0.35, radio: 0.5, umbral: 0.85 }, exposicion: 1.0 };
};

// ── Carmesí · Videojuegos ──
ESCENAS.carmesi = (ctx) => {
  cielo(ctx, { top: '#0e0420', mid: '#3d0f2a', hor: '#ff5fa2', estrellas: 1, solDir: [0, 0.13, -1], sol: '#ffc06b', solTam: 0.022, rayas: true });
  niebla(ctx, '#2a0a2c', 60, 420);
  luces(ctx, { cielo: '#ff9ccf', suelo: '#1a0622', hemi: 0.55, sol: '#ff8fc8', solI: 1.0, solPos: [0, 30, -100] });
  anilloEnCielo(ctx, { a: '#f3c6dc', b: '#d4648f', alpha: 0.42, centro: [100, -420, -300], inclinacion: 0.38 });
  planetaEnCielo(ctx, 'lumen', [-0.6, 0.45, -0.4], 55);

  // Rejilla de neón
  const gu = { uTime: { value: 0 }, cA: { value: col('#ff4fd8') }, cB: { value: col('#6f3cff') }, fogColor: { value: col('#2a0a2c') }, fogNear: { value: 60 }, fogFar: { value: 420 } };
  const gg = new THREE.PlaneGeometry(1600, 1600, 1, 1); gg.rotateX(-Math.PI / 2);
  const rejilla = new THREE.Mesh(gg, new THREE.ShaderMaterial({
    uniforms: gu, fog: true,
    vertexShader: `varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uTime; uniform vec3 cA,cB; varying vec3 vW;\n#include <fog_pars_fragment>\nvoid main(){ vec2 p = vW.xz/4.; vec2 g = abs(fract(p-.5)-.5)/fwidth(p); float l = 1.-min(min(g.x,g.y),1.);
      float r = length(vW.xz); float pulso = .5+.5*sin(r*.15 - uTime*2.);
      vec3 c = vec3(.05,.01,.08) + mix(cB, cA, pulso) * l * 1.6;
      gl_FragColor = vec4(c,1.);\n#include <fog_fragment>\n}`,
  }));
  ctx.scene.add(rejilla); ctx.alActualizar((t) => { gu.uTime.value = t; });

  // Montañas de alambre
  const r = ctx.rnd; const montaMat = mat('#1a0626', { flat: true, rough: 1 }); const lineaMat = new THREE.LineBasicMaterial({ color: '#ff5fd1', transparent: true, opacity: 0.8 });
  for (let i = 0; i < 28; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6; const d = 180 + r() * 90; const h = 30 + r() * 70; const geo = new THREE.ConeGeometry(25 + r() * 30, h, 4 + ((r() * 3) | 0), 3);
    const m = new THREE.Mesh(geo, montaMat); m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); m.rotation.y = r() * 3; ctx.scene.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineaMat); e.position.copy(m.position); e.rotation.copy(m.rotation); ctx.scene.add(e);
  }

  // Salón recreativo
  const salon = new THREE.Group(); ctx.scene.add(salon);
  const nombres = ['NEBULA RUN', 'PIXEL KNIGHT', 'VOID PONG', 'ASTRO GOLF', 'ZOMBINOIA', 'STAR TAXI', 'GLITCH CAT'];
  const neon = ['#ff4fd8', '#5ef0ff', '#ffd25e', '#8cff6b', '#ff6b6b', '#a97bff', '#ff9f43'];
  const pantallaFrag = `uniform float uTime, uSeed; uniform vec3 cA, cB; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 p = floor(vUv*vec2(28.,34.)); float t = uTime*(.8+uSeed*.15);
      float st = step(.965, h(p + vec2(0., floor(t*7.+uSeed*9.))));
      float bar = step(abs(p.x - (14. + 10.*sin(t*1.3+uSeed*5.))), 2.5) * step(p.y, 2.);
      vec2 b = vec2(14.+11.*sin(t*2.1+uSeed), 17.+13.*sin(t*1.7+uSeed*2.)); float ball = step(length(p - b), 1.2);
      float filas = step(22.,p.y)*step(p.y,29.)*step(.45, fract(p.x*.25 + floor(t*1.5)*.25))*step(.25, h(vec2(p.x, uSeed)));
      vec3 c = cA*bar*1.4 + vec3(1.)*ball*1.3 + cB*filas*1.2 + vec3(st)*.8;
      c *= .78 + .22*sin(vUv.y*420.); c += cB*.05;
      float v = smoothstep(.75,.35,length(vUv-.5)); gl_FragColor = vec4(c*v*1.25, 1.); }`;
  const muebles = [];
  nombres.forEach((nom, i) => {
    const a = -Math.PI / 2 + (i - 3) * 0.32; const R = 13; const m = new THREE.Group(); m.position.set(Math.cos(a) * R, 0, Math.sin(a) * R - 4); m.lookAt(0, 0, 4);
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 2), mat('#1c0d2e', { rough: 0.5 })); cuerpo.position.y = 2.3; m.add(cuerpo);
    [-1.22, 1.22].forEach((x) => { const lado = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.7, 2.1), mat(neon[i], { em: neon[i], emI: 0.6 })); lado.position.set(x, 2.35, 0); m.add(lado); });
    const pant = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.55), new THREE.ShaderMaterial({ uniforms: { uTime: ctx.tiempo, uSeed: { value: i * 1.37 }, cA: { value: col(neon[i]) }, cB: { value: col(neon[(i + 3) % 7]) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: pantallaFrag }));
    pant.position.set(0, 3.0, 1.02); pant.rotation.x = -0.12; m.add(pant);
    const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), basic('#ffffff', { map: texturaCanvas(256, 64, (g, w, h) => { g.fillStyle = '#12051d'; g.fillRect(0, 0, w, h); g.fillStyle = neon[i]; g.shadowColor = neon[i]; g.shadowBlur = 14; g.font = '700 30px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nom, w / 2, h / 2 + 2); }) }));
    rotulo.position.set(0, 4.35, 1.02); m.add(rotulo);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.9), mat('#2b1640')); panel.position.set(0, 1.9, 1.3); panel.rotation.x = 0.3; m.add(panel);
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), mat('#222')); palo.position.set(-0.5, 2.2, 1.35); m.add(palo);
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat('#ff3355', { em: '#ff3355', emI: 0.4 })); bola.position.set(-0.5, 2.42, 1.35); m.add(bola);
    [0.2, 0.5, 0.8].forEach((x, k) => { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), basic(neon[(i + k) % 7])); bt.position.set(x, 2.08, 1.42); m.add(bt); });
    salon.add(m); muebles.push(m);
  });
  luzPunto(ctx, '#ff4fd8', 60, 40, [0, 6, -6]);
  ctx.hito({ id: 'recreativas', nombre: 'Salón recreativo', objeto: salon, foco: [0, 3, -12], vista: [0, 6, 6],
    texto: 'Siete recreativas encendidas a la vez, cada una con su partida. Una se llama Zombinoia, como la entrada de 2012 en la que Malkev confesaba su debilidad por los zombis.' });

  // Sprites a la deriva
  const sprites = {
    corazon: ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
    gato: ['X.......X', 'XX.....XX', 'XXXXXXXXX', 'XX.XXX.XX', 'XXXXXXXXX', 'XXX...XXX', '.XXXXXXX.', '..X...X..'],
    medusa: ['..XXXXX..', '.XXXXXXX.', 'XX.XXX.XX', 'XXXXXXXXX', 'X.X.X.X.X', 'X.X.X.X.X', '.X.X.X.X.', 'X...X...X'],
    cohete: ['...X...', '..XXX..', '..X.X..', '..XXX..', '.XXXXX.', '.XXXXX.', 'XX.X.XX', 'X..X..X'],
    estrella: ['....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '.XX...XX.', 'X.......X'],
  };
  const deriva = new THREE.Group(); ctx.scene.add(deriva);
  const cubo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  Object.entries(sprites).forEach(([k, mapa], i) => {
    const celdas = []; mapa.forEach((fila, y) => [...fila].forEach((c, x) => { if (c === 'X') celdas.push([x - fila.length / 2, mapa.length / 2 - y]); }));
    const im = new THREE.InstancedMesh(cubo, basic(neon[(i * 2) % 7]), celdas.length);
    celdas.forEach(([x, y], j) => colocar(im, j, [x * 0.66, y * 0.66, 0]));
    const g = new THREE.Group(); g.add(im); const a = (i / 5) * TAU; g.userData = { a, y: 11 + (i % 3) * 3 };
    deriva.add(g);
  });
  ctx.alActualizar((t) => deriva.children.forEach((g, i) => { const a = g.userData.a + t * 0.08; g.position.set(Math.cos(a) * 20, g.userData.y + Math.sin(t * 1.4 + i) * 0.8, Math.sin(a) * 20 - 2); g.rotation.y = -a + Math.PI / 2 + Math.sin(t + i) * 0.2; }));
  ctx.hito({ id: 'sprites', nombre: 'Sprites a la deriva', objeto: deriva, foco: [0, 13, 0], vista: [-14, 9, 26],
    texto: 'Un corazón, un gato, una medusa, un cohete y una estrella de píxeles que se escaparon de sus juegos y ahora orbitan el salón.' });

  // Cartucho monolito
  const cart = new THREE.Group(); cart.position.set(-24, 0, 4); cart.rotation.y = 0.6; ctx.scene.add(cart);
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(8, 10, 1.6), mat('#3b3348', { rough: 0.45, metal: 0.2 })); cuerpo.position.y = 6; cart.add(cuerpo);
  for (let i = 0; i < 5; i++) { const ra = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 1.7), mat('#2a2434')); ra.position.set(0, 10.4 - i * 0.35, 0); cart.add(ra); }
  const pines = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 0.8), mat('#d4a640', { metal: 0.8, rough: 0.3, em: '#5a3a00', emI: 0.4 })); pines.position.y = 0.9; cart.add(pines);
  const etiqueta = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5.6), basic('#ffffff', { map: texturaCanvas(512, 448, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b0631'); gr.addColorStop(0.55, '#a3306e'); gr.addColorStop(1, '#ffb36b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,79,216,.6)'; g.lineWidth = 2; for (let y = 300; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#ffd25e'; g.beginPath(); g.arc(w / 2, 250, 90, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.font = '700 54px "Courier New", monospace'; g.textAlign = 'center'; g.fillText('MALKEVNIA', w / 2, 90); g.font = '700 26px "Courier New", monospace'; g.fillText('CARTUCHO 01 · 1 JUGADOR', w / 2, 135);
  }) }));
  etiqueta.position.set(0, 6.3, 0.81); cart.add(etiqueta);
  ctx.alActualizar((t) => { cart.position.y = 0.5 + Math.sin(t * 0.7) * 0.4; });
  ctx.hito({ id: 'cartucho', nombre: 'El cartucho monolito', objeto: cart, foco: [-24, 6, 4], vista: [-12, 8, 16],
    texto: 'Diez metros de cartucho clavados en la rejilla. Cuando la colección de videojuegos entre en la base de datos, cada juego tendrá aquí su ranura.' });

  // Portal de warp
  const portal = new THREE.Group(); portal.position.set(24, 8, -2); portal.rotation.y = -0.9; ctx.scene.add(portal);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 20, 80), basic('#5ef0ff')); portal.add(aro);
  const pu = { uTime: ctx.tiempo };
  const disco = new THREE.Mesh(new THREE.CircleGeometry(4.7, 64), new THREE.ShaderMaterial({
    uniforms: pu, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ vec2 p = vUv-.5; float r = length(p)*2.; float a = atan(p.y,p.x);
      float s = sin(a*6. + log(r+.001)*9. - uTime*3.)*.5+.5; vec3 c = mix(vec3(.37,.94,1.), vec3(1.,.3,.85), s) * (1.-r) * (0.6+s*.8);
      gl_FragColor = vec4(c, 1.); }`,
  }));
  portal.add(disco);
  ctx.alActualizar((t) => { aro.rotation.z = t * 0.4; portal.position.y = 8 + Math.sin(t * 0.9) * 0.5; });
  luzPunto(ctx, '#5ef0ff', 40, 30, [24, 8, 0]);
  ctx.hito({ id: 'portal', nombre: 'Portal de warp', objeto: portal, foco: [24, 8, -2], vista: [12, 10, 14],
    texto: 'Atajo a la pantalla siguiente. Nadie sabe adónde lleva, pero todos los mundos de la Malkevnia tienen uno escondido.' });

  particulas(ctx, { n: 220, centro: [0, 12, -4], area: [80, 28, 60], color: '#ff7ce0', tam: 0.45, modo: 'subir', vel: 1.2 });
  return { camara: { pos: [0, 8, 24], objetivo: [0, 5, -8] }, bloom: { fuerza: 0.9, radio: 0.5, umbral: 0.68 }, exposicion: 0.95 };
};

// ── Thalassa · Cine ──
ESCENAS.thalassa = (ctx) => {
  cielo(ctx, { top: '#040a1c', mid: '#0f2d5c', hor: '#3a6f9a', estrellas: 1, solDir: [0.6, 0.35, -0.7], sol: '#d9e6ea', solTam: 0.0012 });
  niebla(ctx, '#0b2240', 90, 520);
  luces(ctx, { cielo: '#7fafe0', suelo: '#1f4d6c', hemi: 0.9, sol: '#cfe3ff', solI: 0.8, solPos: [60, 50, -70] });
  planetaEnCielo(ctx, 'gelida', [0.62, 0.4, -0.68], 110);

  // Océano
  const ou = { uTime: ctx.tiempo, cHondo: { value: col('#061a33') }, cAlto: { value: col('#2f7fa8') }, cLuz: { value: col('#bfe0ff') }, fogColor: { value: col('#0b2240') }, fogNear: { value: 90 }, fogFar: { value: 520 } };
  const og = new THREE.PlaneGeometry(1400, 1400, 200, 200); og.rotateX(-Math.PI / 2);
  const oceano = new THREE.Mesh(og, new THREE.ShaderMaterial({
    uniforms: ou, fog: true,
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;\n#include <fog_pars_vertex>\nvoid main(){ vec3 p = position; float h = sin(p.x*.05 + uTime*.8)*.6 + sin(p.z*.07 + uTime*1.1)*.5 + sin((p.x+p.z)*.13 + uTime*1.7)*.25; p.y += h; vH = h;
      vec4 w = modelMatrix*vec4(p,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform vec3 cHondo,cAlto,cLuz; uniform float uTime; varying vec3 vW; varying float vH;\n#include <fog_pars_fragment>\nvoid main(){ vec3 n = normalize(vec3(-cos(vW.x*.05+uTime*.8)*.03 - cos((vW.x+vW.z)*.13+uTime*1.7)*.032, 1., -cos(vW.z*.07+uTime*1.1)*.035));
      vec3 v = normalize(cameraPosition - vW); float fr = pow(1.-max(dot(n,v),0.), 4.);
      vec3 c = mix(cHondo, cAlto, smoothstep(-1.,1.2,vH)*.5 + fr*.6);
      vec3 l = normalize(vec3(.6,.35,-.7)); vec3 hv = normalize(l+v); c += cLuz * pow(max(dot(n,hv),0.), 120.) * 1.5;
      vec3 l2 = normalize(vec3(0., .25, -1.)); c += vec3(.6,.7,1.) * pow(max(dot(n, normalize(l2+v)),0.), 60.) * .6;
      float d = length(vW.xz); c += vec3(.8,.9,1.) * smoothstep(1.,0.,abs(d-47.+vH*1.5)) * .35;
      gl_FragColor = vec4(c,1.);\n#include <fog_fragment>\n}`,
  }));
  oceano.position.y = -0.6; ctx.scene.add(oceano);

  // Isla
  const altura = (x, z) => { const r = Math.hypot(x * 0.9, z); const f = 1 - smooth(18, 50, r + (fbm(x * 0.05, z * 0.05) - 0.5) * 14); return f * (2.2 + fbm(x * 0.04 + 3, z * 0.04) * 3.5 * smooth(10, 30, r)) - 2.4 * (1 - f); };
  const arena = col('#d9c9a0'), hierba = col('#3f6b3a'), hierba2 = col('#6a8a3f');
  suelo(ctx, { tam: 140, seg: 180, altura, color: (x, z, h, c) => { if (h < 1.1) c.copy(arena).multiplyScalar(0.7 + 0.3 * smooth(-1, 1, h)); else c.copy(hierba).lerp(hierba2, fbm(x * 0.1, z * 0.1)); } });

  // Autocine
  const cine = new THREE.Group(); cine.position.set(0, 0, -16); ctx.scene.add(cine);
  const marcoMat = mat('#1d2633', { rough: 0.8 });
  [-11.5, 11.5].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16, 0.8), marcoMat); p.position.set(x, 8 + altura(x, -16) - 0.5, 0); cine.add(p); });
  const trasera = new THREE.Mesh(new THREE.BoxGeometry(23.6, 11.4, 0.5), marcoMat); trasera.position.set(0, 10, -0.4); cine.add(trasera);
  const tarjetas = [
    ['LA MALKEVNIA', 'presenta'], ['SESIÓN DE MEDIANOCHE', 'en el autocine de Thalassa'], ['PRIMER', 'reseñada en la bitácora, 2011'],
    ['ALTA FIDELIDAD', 'reseñada en la bitácora, 2012'], ['CASTAWAY ON THE MOON', 'reseñada en la bitácora, 2013'], ['MR. NOBODY', 'Juno Temple, 2011'], ['PRÓXIMAMENTE', 'tu filmoteca entera'],
  ];
  const tex = texturaCanvas(1024, 480, () => {});
  const dibujarTarjeta = (k) => tex.userData.redibujar((g, w, h) => {
    g.fillStyle = '#0d0b10'; g.fillRect(0, 0, w, h);
    const [a, b] = tarjetas[k];
    g.strokeStyle = '#e8dcc0'; g.lineWidth = 6; g.strokeRect(40, 40, w - 80, h - 80);
    g.fillStyle = '#f4ecd8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${a.length > 16 ? 64 : 84}px Georgia, "Times New Roman", serif`; g.fillText(a, w / 2, h / 2 - 30);
    g.font = 'italic 38px Georgia, serif'; g.fillStyle = '#cdbf9c'; g.fillText(b, w / 2, h / 2 + 55);
  });
  dibujarTarjeta(0);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(22, 10.3), new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.tiempo, uMap: { value: tex }, uCorte: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D uMap; uniform float uTime, uCorte; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec2 uv = vUv; uv.y += (h(vec2(floor(uTime*24.),1.))-.5)*.004;
        vec3 c = texture2D(uMap, uv).rgb;
        float grano = h(uv*vec2(800.,400.) + floor(uTime*24.)); c += (grano-.5)*.12;
        float ray = step(.997, h(vec2(floor(uv.x*300.), floor(uTime*8.)))); c = mix(c, vec3(.9), ray*.5);
        float flick = .88 + .12*h(vec2(floor(uTime*18.), 3.));
        float vig = smoothstep(.95, .25, length((vUv-.5)*vec2(1.,1.6)));
        c *= flick * vig * mix(vec3(1.), vec3(1.05,.95,.82), .6) * (1.-uCorte);
        gl_FragColor = vec4(c*1.35, 1.); }`,
  }));
  pantalla.position.set(0, 10, -0.1); cine.add(pantalla);
  let tarjeta = 0, ultimo = 0;
  ctx.alActualizar((t) => { if (t - ultimo > 4.2) { ultimo = t; tarjeta = (tarjeta + 1) % tarjetas.length; dibujarTarjeta(tarjeta); } pantalla.material.uniforms.uCorte.value = smooth(4.0, 4.2, t - ultimo) + (1 - smooth(0, 0.2, t - ultimo)); });
  luzPunto(ctx, '#e8e0ff', 50, 40, [0, 8, -8]);
  // Cabina y haz del proyector
  const cabina = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.6), mat('#c9b48a', { rough: 0.9 })); cabina.position.set(0, altura(0, 24) + 1.3, 24); ctx.scene.add(cabina);
  const techo = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.2), mat('#7a3b2e')); techo.position.set(0, cabina.position.y + 1.45, 24); ctx.scene.add(techo);
  const ventana = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), basic('#fff6dc')); ventana.position.set(0, cabina.position.y + 0.5, 24 - 1.31); ventana.rotation.y = Math.PI; ctx.scene.add(ventana);
  const origen = new THREE.Vector3(0, cabina.position.y + 0.5, 22.6), destino = new THREE.Vector3(0, 10, -16);
  const largo = origen.distanceTo(destino);
  const hazGeo = new THREE.ConeGeometry(7.5, largo, 48, 1, true); hazGeo.translate(0, -largo / 2, 0);
  const haz = new THREE.Mesh(hazGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.tiempo, uL: { value: largo } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uTime, uL; varying float vY; void main(){ float k = -vY/uL; float a = (1.-k)*.16 + .02; a *= .85+.15*sin(uTime*23.); gl_FragColor = vec4(vec3(.75,.8,1.)*a, 1.); }',
  }));
  haz.position.copy(origen); haz.lookAt(destino); haz.rotateX(-Math.PI / 2); ctx.scene.add(haz);
  ctx.hito({ id: 'autocine', nombre: 'Autocine del fin del mundo', objeto: cine, foco: [0, 9, -16], vista: [0, 7, 12],
    texto: 'La pantalla pasa los títulos que Malkev reseñó en la bitácora: Primer, Alta fidelidad, Castaway on the Moon, Mr. Nobody. Cuando la filmoteca esté en la base de datos, el programa será infinito.' });

  // Butacas
  const butacas = new THREE.Group(); ctx.scene.add(butacas);
  const asiento = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.35, 1.1), mat('#9a1f2e', { rough: 0.7 }), 60);
  const respaldo = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.3, 0.25), mat('#b0263a', { rough: 0.7 }), 60);
  let bi = 0;
  for (let f = 0; f < 5; f++) for (let c = 0; c < 10; c++) {
    const x = (c - 4.5) * 1.6, z = 1 + f * 2.6; const y = altura(x, z) + 0.2 * f;
    colocar(asiento, bi, [x, y + 0.7, z]); colocar(respaldo, bi, [x, y + 1.3, z + 0.55], [-0.12, 0, 0]); bi++;
  }
  asiento.count = respaldo.count = bi; butacas.add(asiento, respaldo);
  ctx.hito({ id: 'butacas', nombre: 'Patio de butacas', objeto: butacas, foco: [0, 2, 6], vista: [14, 8, 18],
    texto: 'Cincuenta butacas rojas sobre la hierba. Siempre hay una libre en la quinta fila, que es la buena.' });

  // Carretes varados y cinta
  const carretes = new THREE.Group(); ctx.scene.add(carretes);
  const plata = mat('#c8ccd6', { metal: 0.85, rough: 0.3 });
  const carrete = (R) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 10, 64), plata));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.5, 24), plata); hub.rotation.x = Math.PI / 2; g.add(hub);
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(R * 1.9, 0.5, 0.18), plata); s.rotation.z = (i / 3) * Math.PI; g.add(s); }
    const rollo = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, 0.42, 48), mat('#2b2420', { rough: 0.5 })); rollo.rotation.x = Math.PI / 2; g.add(rollo);
    return g;
  };
  const c1 = carrete(4.2); c1.position.set(-27, altura(-27, 12) + 4.2, 12); c1.rotation.y = 0.9; carretes.add(c1);
  const c2 = carrete(3); c2.position.set(-33, altura(-33, 20) + 2.2, 20); c2.rotation.set(0.35, 1.3, 0.15); carretes.add(c2);
  ctx.alActualizar((t) => { c1.rotation.z = t * 0.15; });
  const curva = new THREE.CatmullRomCurve3([[-27, 1.2, 12], [-22, 0.6, 18], [-16, 0.8, 24], [-12, 0.5, 30], [-5, 0.2, 36], [2, -0.5, 44]].map(([x, y, z]) => new THREE.Vector3(x, Math.max(y, altura(x, z) + 0.15), z)));
  const cintaTex = texturaCanvas(256, 64, (g, w, h) => { g.fillStyle = '#1a1512'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9c9a0'; for (let x = 6; x < w; x += 22) { g.fillRect(x, 6, 10, 9); g.fillRect(x, h - 15, 10, 9); } g.fillStyle = '#3a2c22'; for (let x = 0; x < w; x += 64) g.fillRect(x + 6, 20, 52, 24); });
  cintaTex.wrapS = THREE.RepeatWrapping; cintaTex.repeat.set(30, 1);
  const cinta = new THREE.Mesh(new THREE.TubeGeometry(curva, 200, 0.6, 2, false), mat('#ffffff', { map: cintaTex, side: THREE.DoubleSide, rough: 0.5 }));
  carretes.add(cinta);
  ctx.hito({ id: 'carretes', nombre: 'Carretes varados', objeto: carretes, foco: [-27, 4, 14], vista: [-14, 7, 26],
    texto: 'Dos carretes que la marea dejó en la playa, con la película desenrollada hasta el agua. Nadie ha conseguido ver qué había grabado.' });

  // Claqueta
  const claq = new THREE.Group(); claq.position.set(24, altura(24, 4) + 0.2, 4); claq.rotation.y = -0.7; ctx.scene.add(claq);
  const pizarra = new THREE.Mesh(new THREE.BoxGeometry(7, 5.4, 0.5), mat('#ffffff', { map: texturaCanvas(512, 400, (g, w, h) => {
    g.fillStyle = '#16141a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#efe9dc'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.moveTo(14, 150); g.lineTo(w - 14, 150); g.moveTo(14, 270); g.lineTo(w - 14, 270); g.moveTo(w / 2, 150); g.lineTo(w / 2, 270); g.stroke();
    g.fillStyle = '#efe9dc'; g.font = '700 58px Georgia, serif'; g.textAlign = 'center'; g.fillText('MALKEVNIA', w / 2, 100);
    g.font = '28px Georgia, serif'; g.fillText('ESCENA', w / 4, 190); g.fillText('TOMA', (w * 3) / 4, 190); g.font = '700 48px Georgia, serif'; g.fillText('1', w / 4, 245); g.fillText('∞', (w * 3) / 4, 245);
    g.font = 'italic 30px Georgia, serif'; g.fillText('dir. el capitán', w / 2, 330);
  }) }));
  pizarra.position.y = 2.9; pizarra.rotation.z = 0.05; claq.add(pizarra);
  const rayas = texturaCanvas(256, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2efe9' : '#16141a'; g.beginPath(); g.moveTo(i * 36, 0); g.lineTo(i * 36 + 36, 0); g.lineTo(i * 36 + 18, h); g.lineTo(i * 36 - 18, h); g.fill(); } });
  const barraFija = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 0.5), mat('#ffffff', { map: rayas })); barraFija.position.y = 5.95; claq.add(barraFija);
  const bisagra = new THREE.Group(); bisagra.position.set(-3.5, 6.3, 0); claq.add(bisagra);
  const brazo = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 0.5), mat('#ffffff', { map: rayas })); brazo.position.set(3.5, 0.35, 0); bisagra.add(brazo);
  ctx.alActualizar((t) => { const c = t % 5; bisagra.rotation.z = c < 4.4 ? 0.45 * smooth(0, 1.2, c) : 0.45 * (1 - smooth(4.4, 4.5, c)); });
  ctx.hito({ id: 'claqueta', nombre: 'La claqueta', objeto: claq, foco: [24, 4, 4], vista: [14, 6, 16],
    texto: 'Escena 1, toma infinita. Cada cinco segundos alguien grita acción y la claqueta se cierra.' });

  // Palmeras
  const tronco = mat('#7a5a3a', { flat: true }), hoja = mat('#2f6b3a', { flat: true, side: THREE.DoubleSide });
  [[-14, -2], [16, -6], [26, 18], [-10, 26], [30, -18], [-30, -8]].forEach(([x, z], i) => {
    const p = new THREE.Group(); p.position.set(x, altura(x, z), z); ctx.scene.add(p);
    let y = 0, dx = 0; for (let s = 0; s < 7; s++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - s * 0.02, 0.32 - s * 0.02, 1.3, 7), tronco); dx = Math.sin(s * 0.25 + i) * s * 0.18; seg.position.set(dx, y + 0.65, 0); p.add(seg); y += 1.25; }
    for (let k = 0; k < 7; k++) { const hj = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.2, 4), hoja); hj.scale.z = 0.15; hj.position.set(dx, y, 0); hj.rotation.set(0, (k / 7) * TAU, 1.9); hj.translateY(2); p.add(hj); }
  });

  particulas(ctx, { n: 120, centro: [0, 3, 6], area: [70, 6, 50], color: '#fff2a0', tam: 0.35, modo: 'flotar' });
  particulas(ctx, { n: 140, centro: [0, 7, 3], area: [10, 6, 34], color: '#cfd8ff', tam: 0.18, modo: 'flotar', vel: 0.3, opacidad: 0.6 });
  return { camara: { pos: [8, 17, 50], objetivo: [0, 6, -8] }, bloom: { fuerza: 0.75, radio: 0.6, umbral: 0.62 }, exposicion: 1.1 };
};

// ── Gélida · Libros y manga ──
ESCENAS.gelida = (ctx) => {
  cielo(ctx, { top: '#060c26', mid: '#26375e', hor: '#9fb6e0', estrellas: 1, aurora: 1.1, auroraA: '#6dffc4', auroraB: '#c08cff', solDir: [-0.4, 0.06, -0.9], sol: '#eef3ff', solTam: 0.001 });
  niebla(ctx, '#8ea3cf', 70, 400);
  luces(ctx, { cielo: '#bcd2ff', suelo: '#3b4f7a', hemi: 1.0, sol: '#dfeaff', solI: 1.4, solPos: [-40, 40, -60] });
  planetaEnCielo(ctx, 'thalassa', [-0.5, 0.42, -0.75], 85);

  const altura = (x, z) => { const r = Math.hypot(x, z); return fbm(x * 0.05, z * 0.05) * 3 - 1.4 + smooth(80, 220, r) * fbm(x * 0.012 + 4, z * 0.012) * 120 * (0.6 + 0.4 * vnoise(x * 0.05, z * 0.05)); };
  const nieve = col('#eef3ff'), sombra = col('#8aa5d6'), roca = col('#3b4f7a');
  suelo(ctx, { altura, color: (x, z, h, c) => { c.copy(nieve).lerp(sombra, smooth(0.35, 0.7, fbm(x * 0.08, z * 0.08)) * 0.55); if (h > 25) c.lerp(roca, smooth(25, 60, h) * 0.6); }, rough: 0.6 });

  const r = ctx.rnd;
  const hielo = mat('#bfe3ff', { opacity: 0.55, rough: 0.15, metal: 0.1, em: '#3a6ea8', emI: 0.35, depthWrite: false });
  const lomos = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#e84393', '#f5e6c4', '#2d3436', '#d35400', '#16a085', '#fd79a8'];

  // Biblioteca de hielo: arco de estanterías
  const bib = new THREE.Group(); bib.position.set(0, 0, -8); ctx.scene.add(bib);
  const libros = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { rough: 0.7 }), 600); bib.add(libros);
  let li = 0;
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI; const est = new THREE.Group(); est.position.set(Math.cos(a) * 17, 0, Math.sin(a) * 17 * 0.8); est.lookAt(0, 0, 4); bib.add(est);
    const W = 4.6, H = 12, D = 1.1;
    [-W / 2, W / 2].forEach((x) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, H, D), hielo); l.position.set(x, H / 2, 0); est.add(l); });
    for (let b = 0; b <= 5; b++) {
      const bal = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), hielo); bal.position.set(0, 0.1 + b * (H - 0.2) / 5, 0); est.add(bal);
      if (b === 5) break;
      let x = -W / 2 + 0.2; const yb = 0.2 + b * (H - 0.2) / 5;
      while (x < W / 2 - 0.4 && li < 600) { const w = 0.16 + r() * 0.22, h = 1.2 + r() * 0.8; est.updateMatrixWorld(); _o.position.set(x + w / 2, yb + h / 2, 0); _o.rotation.set(0, 0, r() < 0.08 ? 0.25 : 0); _o.scale.set(w, h, 0.8); _o.updateMatrix();
        const m = new THREE.Matrix4().compose(est.position, est.quaternion, new THREE.Vector3(1, 1, 1)).multiply(_o.matrix); libros.setMatrixAt(li, m); libros.setColorAt(li++, col(lomos[(r() * lomos.length) | 0])); x += w + 0.02; }
    }
  }
  libros.count = li;
  luzPunto(ctx, '#9fe8ff', 40, 40, [0, 8, -6]);
  ctx.hito({ id: 'biblioteca', nombre: 'La biblioteca de hielo', objeto: bib, foco: [0, 6, -12], vista: [0, 7, 10],
    texto: 'Siete estanterías de hielo en semicírculo. Aquí irá la biblioteca de Malkev cuando pase a la base de datos de la web, sin Goodreads de por medio.' });

  // Torre de tomos
  const torre = new THREE.Group(); torre.position.set(20, altura(20, 8), 8); ctx.scene.add(torre);
  const tomos = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.42, 2.5), mat('#ffffff', { rough: 0.6 }), 70); torre.add(tomos);
  const series = ['#e84393', '#0984e3', '#fdcb6e', '#00b894', '#d63031', '#6c5ce7', '#fab1a0'];
  for (let i = 0; i < 70; i++) { colocar(tomos, i, [Math.cos(i * 0.32) * 0.5, 0.21 + i * 0.43, Math.sin(i * 0.32) * 0.5], [0, i * 0.19, (r() - 0.5) * 0.04]); tomos.setColorAt(i, col(series[Math.floor(i / 10) % series.length])); }
  ctx.alActualizar((t) => { torre.rotation.y = t * 0.12; });
  ctx.hito({ id: 'torre', nombre: 'La torre de tomos', objeto: torre, foco: [20, 14, 8], vista: [6, 16, 28],
    texto: 'Setenta tomos de manga apilados en espiral, diez por serie, como en la estantería de casa cuando ya no cabe nada más.' });

  // Libros en vuelo
  const vuelo = new THREE.Group(); ctx.scene.add(vuelo);
  const pagina = texturaCanvas(128, 160, (g, w, h) => { g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a8f7a'; for (let y = 18; y < h - 12; y += 9) g.fillRect(12, y, w - 24 - ((y * 7) % 30), 3); });
  const pagMat = mat('#ffffff', { map: pagina, side: THREE.DoubleSide, em: '#ffffff', emI: 0.12 });
  const voladores = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(); const tapa = mat(lomos[(i * 3) % lomos.length], { side: THREE.DoubleSide });
    const izq = new THREE.Group(), der = new THREE.Group();
    const ti = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.2), tapa); ti.position.x = -0.8; izq.add(ti); const pi = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), pagMat); pi.rotation.x = -Math.PI / 2; pi.position.set(-0.78, 0.05, 0); izq.add(pi);
    const td = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.2), tapa); td.position.x = 0.8; der.add(td); const pd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), pagMat); pd.rotation.x = -Math.PI / 2; pd.position.set(0.78, 0.05, 0); der.add(pd);
    b.add(izq, der); b.userData = { izq, der, f: i * 0.7, rr: 18 + (i % 3) * 4, y: 9 + (i % 4) * 1.6 }; vuelo.add(b); voladores.push(b);
  }
  ctx.alActualizar((t) => voladores.forEach((b) => { const u = b.userData; const a = t * 0.18 + u.f; b.position.set(Math.cos(a) * u.rr, u.y + Math.sin(t * 0.9 + u.f) * 1.2, Math.sin(a) * u.rr * 0.8 - 2);
    b.rotation.set(0.25, -a, 0); const ab = 0.5 + Math.sin(t * 3 + u.f * 2) * 0.45; u.izq.rotation.z = ab; u.der.rotation.z = -ab; }));
  ctx.hito({ id: 'vuelo', nombre: 'Libros en vuelo', objeto: vuelo, foco: [0, 11, -2], vista: [-22, 6, 22],
    texto: 'Nueve libros abiertos que vuelan en círculos batiendo las tapas. Dicen que bajan cuando alguien se sienta a leer.' });

  // Atril de cristal
  const atril = new THREE.Group(); atril.position.set(-18, altura(-18, 10), 10); atril.rotation.y = 0.7; ctx.scene.add(atril);
  const col1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 4, 6), hielo); col1.position.y = 2; atril.add(col1);
  const tapa = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 3.6), hielo); tapa.position.set(0, 4.2, 0); tapa.rotation.x = 0.45; atril.add(tapa);
  const abierto = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3), basic('#ffffff', { map: texturaCanvas(640, 440, (g, w, h) => {
    g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#e6dcc4'; g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = '#3b2f2a'; g.font = 'italic 30px Georgia, serif'; g.fillText('Capítulo I', 40, 60); g.fillText('Capítulo II', w / 2 + 30, 60);
    g.font = '19px Georgia, serif'; const l1 = ['Nadie elige el libro que', 'le cambia la vida. Te', 'encuentra él, en una', 'estantería cualquiera,', 'cuando ya habías dejado', 'de buscar.']; const l2 = ['El hielo no deja que el', 'papel amarillee. Por eso', 'la nave trae aquí cada', 'libro terminado, para', 'que siga como el día en', 'que se leyó.'];
    l1.forEach((s, i) => g.fillText(s, 40, 110 + i * 34)); l2.forEach((s, i) => g.fillText(s, w / 2 + 30, 110 + i * 34));
  }) }));
  abierto.position.set(0, 0.17, 0); abierto.rotation.x = -Math.PI / 2; tapa.add(abierto);
  const brillo = luzPunto(ctx, '#ffe9b0', 14, 12, [-18, 7, 10]);
  ctx.alActualizar((t) => { brillo.intensity = 12 + Math.sin(t * 2) * 3; });
  ctx.hito({ id: 'atril', nombre: 'El atril de cristal', objeto: atril, foco: [-18, 4, 10], vista: [-12, 8, 18],
    texto: 'Un libro abierto que nunca se cierra. Cada vez que Malkev termine uno, la página que más le haya gustado acabará aquí.' });

  // Agujas de hielo
  const aguja = new THREE.ConeGeometry(0.8, 5, 5); aguja.translate(0, 2.2, 0);
  const agujas = instanciado(ctx, aguja, mat('#cfefff', { opacity: 0.7, rough: 0.1, em: '#5aa0e0', emI: 0.4, flat: true }), 90);
  for (let i = 0; i < 90; i++) { const a = r() * TAU, d = 30 + r() * 60; const x = Math.cos(a) * d, z = Math.sin(a) * d; const e = 0.5 + r() * 1.6; colocar(agujas, i, [x, altura(x, z) - 0.5, z], [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4], [e, e * (1 + r()), e]); }

  particulas(ctx, { n: 900, centro: [0, 20, 0], area: [140, 40, 140], color: '#ffffff', tam: 0.3, modo: 'caer', vel: 0.9, opacidad: 0.85 });
  return { camara: { pos: [0, 10, 36], objetivo: [0, 6, -6] }, bloom: { fuerza: 0.65, radio: 0.6, umbral: 0.72 }, exposicion: 1.0 };
};

// ── Izaro · Rol (Proyecto Arca) ──
ESCENAS.izaro = (ctx) => {
  cielo(ctx, { top: '#0e0a22', mid: '#3a2d63', hor: '#8f84d6', estrellas: 0.8, solDir: [0.7, 0.18, -0.6], sol: '#f2e6ff', solTam: 0.0016 });
  niebla(ctx, '#8f84d6', 70, 380);
  luces(ctx, { cielo: '#c9c0ff', suelo: '#302645', hemi: 0.8, sol: '#efe2ff', solI: 1.6, solPos: [70, 40, -60] });
  planetaEnCielo(ctx, 'verdanza', [-0.65, 0.35, -0.65], 120);
  planetaEnCielo(ctx, 'carmesi', [0.3, 0.6, 0.7], 50);
  marDeNubes(ctx, { y: -34, a: '#3d3166', b: '#d8cff0', luz: '#ffffff' });

  const principal = islaFlotante(ctx, { r: 22, prof: 26, cesped: '#5f7d5a', roca: '#4a3d63', semilla: 1 });
  const eterIsla = islaFlotante(ctx, { x: -36, y: 7, z: -16, r: 9, prof: 14, cesped: '#4f6d6a', roca: '#3d3358', semilla: 2 });
  const acaIsla = islaFlotante(ctx, { x: 34, y: -3, z: -20, r: 12, prof: 16, cesped: '#6d7f5a', roca: '#4a3d63', semilla: 3 });
  const r = ctx.rnd;

  // Círculo del narrador
  const circulo = new THREE.Group(); principal.add(circulo);
  const piedra = mat('#8a84a0', { flat: true, rough: 0.95 });
  const runaMat = basic('#9fe8ff');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU; const h = 5 + r() * 2.5; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, h, 4, 1), piedra);
    m.position.set(Math.cos(a) * 10, h / 2, Math.sin(a) * 10); m.rotation.set((r() - 0.5) * 0.12, a + Math.PI / 4, (r() - 0.5) * 0.12); circulo.add(m);
    const runa = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4), runaMat); runa.position.set(Math.cos(a) * 9.05, h * 0.55, Math.sin(a) * 9.05); runa.lookAt(0, h * 0.55, 0); circulo.add(runa);
  }
  const hoguera = new THREE.Group(); circulo.add(hoguera);
  for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2), mat('#4a3426')); l.rotation.set(1.2, (i / 8) * TAU, 0); l.position.set(Math.cos((i / 8) * TAU) * 0.4, 0.4, Math.sin((i / 8) * TAU) * 0.4); hoguera.add(l); }
  const llama = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), basic('#ff9a3c')); llama.position.y = 1.1; hoguera.add(llama);
  const fuego = luzPunto(ctx, '#ff9a3c', 60, 26, [0, 2.2, 0]);
  ctx.alActualizar((t) => { const k = 0.85 + Math.sin(t * 13) * 0.07 + Math.sin(t * 7.3) * 0.08; fuego.intensity = 60 * k; llama.scale.set(k, 1.2 * k + 0.2, k); fuego.position.y = 2.2 + principal.position.y; });
  particulas(ctx, { n: 80, centro: [0, 4, 0], area: [2.5, 8, 2.5], color: '#ffb35c', tam: 0.25, modo: 'subir', vel: 1.8, padre: principal });
  ctx.hito({ id: 'circulo', nombre: 'El círculo del narrador', objeto: circulo, foco: [0, 3, 0], vista: [14, 9, 18],
    texto: 'Nueve menhires con runas alrededor de la hoguera, donde se sentaba el narrador. De aquí salieron las 36 sesiones de Proyecto Arca que luego se convirtieron en novela en la bitácora.' });

  // d20 del destino
  const d20 = new THREE.Group(); d20.position.set(0, 15, 0); ctx.scene.add(d20);
  const icoGeo = new THREE.IcosahedronGeometry(3.6, 0);
  d20.add(new THREE.Mesh(icoGeo, mat('#3a2b6e', { flat: true, metal: 0.6, rough: 0.25, em: '#21134a', emI: 0.6 })));
  d20.add(new THREE.LineSegments(new THREE.EdgesGeometry(icoGeo), new THREE.LineBasicMaterial({ color: '#9fe8ff' })));
  const veinte = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), basic('#ffffff', { map: texturaCanvas(128, 128, (g, w, h) => { g.fillStyle = '#e8f8ff'; g.font = '700 70px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('20', w / 2, h / 2 + 4); }), opacity: 1, depthWrite: false }));
  veinte.position.set(0, 0, 3.0); d20.add(veinte);
  ctx.alActualizar((t) => { d20.rotation.x = t * 0.31; d20.rotation.y = t * 0.23; d20.position.y = 15 + Math.sin(t * 0.7) * 1.1; });
  luzPunto(ctx, '#9fe8ff', 30, 30, [0, 15, 0]);
  ctx.hito({ id: 'd20', nombre: 'El d20 del destino', objeto: d20, foco: [0, 15, 0], vista: [-12, 16, 16],
    texto: 'Lleva girando desde la primera tirada de la campaña. Cuando se detenga en el 20, Arca volverá a despertar.' });

  // Cristales de Éter
  const cristales = new THREE.Group(); eterIsla.add(cristales);
  const eterMat = mat('#7fd6ff', { em: '#3fb7ff', emI: 1.4, opacity: 0.85, rough: 0.1, flat: true });
  const cris = [];
  for (let i = 0; i < 16; i++) { const h = 1.5 + r() * 4.5; const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), eterMat); c.scale.set(0.5 + r() * 0.5, h, 0.5 + r() * 0.5); const a = r() * TAU, d = r() * 6; c.position.set(Math.cos(a) * d, h * 0.7, Math.sin(a) * d); c.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5); cristales.add(c); cris.push(c); }
  const luzEter = luzPunto(ctx, '#7fd6ff', 50, 30, [-36, 12, -16]);
  ctx.alActualizar((t) => { eterMat.emissiveIntensity = 1.2 + Math.sin(t * 1.6) * 0.5; luzEter.position.y = eterIsla.position.y + 5; });
  particulas(ctx, { n: 160, centro: [0, 7, 0], area: [18, 16, 18], color: '#9fe8ff', tam: 0.3, modo: 'subir', vel: 0.8, padre: eterIsla });
  ctx.hito({ id: 'eter', nombre: 'Cristales de Éter', objeto: cristales, foco: [-36, 10, -16], vista: [-22, 14, 4],
    texto: 'El Éter es la energía que quedó en Izaro después del Cataclismo, según el trasfondo de Proyecto Arca. Aquí crece en cristales que laten despacio.' });

  // Ruinas de la Academia
  const academia = new THREE.Group(); acaIsla.add(academia);
  const marmol = mat('#d6d0e4', { rough: 0.8, flat: true });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const roto = i % 3 === 1; const h = roto ? 2 + r() * 3 : 8; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, h, 10), marmol); c.position.set(Math.cos(a) * 7, h / 2, Math.sin(a) * 7); academia.add(c); if (!roto) { const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), marmol); cap.position.set(c.position.x, h + 0.25, c.position.z); academia.add(cap); } }
  const arco = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.6, 8, 24, Math.PI), marmol); arco.position.set(0, 6, -4); academia.add(arco);
  [-3.5, 3.5].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 1.2), marmol); p.position.set(x, 3, -4); academia.add(p); });
  for (let i = 0; i < 4; i++) { const e = new THREE.Mesh(new THREE.BoxGeometry(6 - i, 0.4, 2), marmol); e.position.set(0, 0.2 + i * 0.4, 2 - i * 0.6); academia.add(e); }
  ctx.hito({ id: 'academia', nombre: 'Las ruinas de la Academia', objeto: academia, foco: [34, 2, -20], vista: [26, 8, -2],
    texto: 'Lo que queda de la Academia, el escenario del segundo capítulo de Proyecto Arca. Columnas rotas, un arco en pie y escaleras que no llevan a ningún sitio.' });

  // Rocas flotantes
  const rocas = instanciado(ctx, new THREE.DodecahedronGeometry(1, 0), mat('#5a4a7a', { flat: true }), 40, true);
  const datos = Array.from({ length: 40 }, () => ({ a: r() * TAU, d: 28 + r() * 40, y: -8 + r() * 26, e: 0.4 + r() * 1.6, v: 0.02 + r() * 0.04 }));
  ctx.alActualizar((t) => { datos.forEach((q, i) => { const a = q.a + t * q.v; colocar(rocas, i, [Math.cos(a) * q.d, q.y + Math.sin(t * 0.5 + i) * 0.6, Math.sin(a) * q.d], [t * 0.2 + i, t * 0.1, 0], [q.e, q.e, q.e]); }); rocas.instanceMatrix.needsUpdate = true; });

  return { camara: { pos: [0, 14, 44], objetivo: [0, 4, -4] }, bloom: { fuerza: 0.9, radio: 0.6, umbral: 0.6 }, exposicion: 1.05 };
};

// ── Nix Áurea · Música ──
ESCENAS['nix-aurea'] = (ctx) => {
  cielo(ctx, { top: '#1e1238', mid: '#8a4f2a', hor: '#d9a066', estrellas: 0.4, solDir: [0.55, 0.08, -0.83], sol: '#ffe6b0', solTam: 0.004 });
  niebla(ctx, '#d9a066', 80, 400);
  luces(ctx, { cielo: '#ffd9a8', suelo: '#5a3c1a', hemi: 0.55, sol: '#ffd59a', solI: 1.3, solPos: [50, 25, -80] });
  anilloEnCielo(ctx, { a: '#f1dfb0', b: '#7a5320', alpha: 0.7, centro: [0, -260, -420], inclinacion: 0.5, radioIn: 520, radioOut: 1000, surcos: true });
  planetaEnCielo(ctx, 'izaro', [0.7, 0.35, 0.4], 70);
  marDeNubes(ctx, { y: -26, a: '#6a3f1c', b: '#e2b47a', luz: '#ffe9c0' });

  const BPM = 92; const pulso = (t) => Math.exp(-((t * BPM / 60) % 1) * 5);
  // Escenario
  const esc = new THREE.Group(); ctx.scene.add(esc);
  const disco = new THREE.Mesh(new THREE.CylinderGeometry(26, 25, 2, 64), mat('#5a3d52', { rough: 0.35, metal: 0.25 })); disco.position.y = -1; esc.add(disco);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(26, 0.25, 8, 128), basic('#ffd27a')); borde.rotation.x = Math.PI / 2; esc.add(borde);
  const panza = new THREE.Mesh(new THREE.ConeGeometry(25, 18, 48, 1, true), mat('#3a2717', { flat: true, side: THREE.DoubleSide })); panza.rotation.x = Math.PI; panza.position.y = -11; esc.add(panza);
  const tarima = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 8), mat('#3d2a3e', { rough: 0.5 })); tarima.position.set(0, 0.5, -10); esc.add(tarima);
  const anillosSuelo = []; for (let i = 1; i < 6; i++) { const a = new THREE.Mesh(new THREE.RingGeometry(i * 4 - 0.08, i * 4 + 0.08, 128), basic('#c9803a', { add: true, side: THREE.DoubleSide })); a.rotation.x = -Math.PI / 2; a.position.y = 0.02; esc.add(a); anillosSuelo.push(a); }

  // Ecualizador
  const NB = 48; const eq = instanciado(ctx, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#b0a0a0' }), NB, true);
  const cA = col('#ffd27a'), cB = col('#ff4fa0');
  for (let i = 0; i < NB; i++) eq.setColorAt(i, cA.clone().lerp(cB, Math.abs(Math.sin(i / NB * Math.PI))));
  ctx.alActualizar((t) => { const p = pulso(t); for (let i = 0; i < NB; i++) { const a = (i / NB) * TAU; const h = 0.6 + (Math.abs(Math.sin(t * (1.3 + (i % 7) * 0.31) + i * 0.6)) * 4 + p * 3) * (0.5 + 0.5 * Math.sin(i * 0.4 + t * 0.5) ** 2); colocar(eq, i, [Math.cos(a) * 22.5, h / 2, Math.sin(a) * 22.5], [0, -a, 0], [0.9, h, 0.9]); } eq.instanceMatrix.needsUpdate = true; eq.boundingSphere = null;
    anillosSuelo.forEach((a, i) => { a.material.opacity = 0.25 + pulso(t - i * 0.08) * 0.7; }); });
  ctx.hito({ id: 'ecualizador', nombre: 'El ecualizador', objeto: eq, foco: [0, 2, 0], vista: [0, 14, 30],
    texto: 'Cuarenta y ocho barras alrededor del escenario que siguen un ritmo de 92 pulsaciones por minuto. Nadie está tocando, pero el planeta sigue el compás.' });

  // Vinilo gigante
  const vin = new THREE.Group(); vin.position.set(0, 11, -14); ctx.scene.add(vin);
  const etiquetaVin = texturaCanvas(512, 512, (g, w, h) => {
    g.fillStyle = '#0d0b0f'; g.fillRect(0, 0, w, h);
    for (let rr = 250; rr > 90; rr -= 3) { g.strokeStyle = `rgba(255,255,255,${0.04 + ((rr * 7) % 5) * 0.012})`; g.beginPath(); g.arc(256, 256, rr, 0, TAU); g.stroke(); }
    const gr = g.createLinearGradient(0, 160, 0, 352); gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, '#e0702f'); g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 88, 0, TAU); g.fill();
    g.fillStyle = '#3a1f0a'; g.textAlign = 'center'; g.font = '700 24px Georgia, serif'; g.fillText('MALKEVNIA', 256, 236); g.font = 'italic 18px Georgia, serif'; g.fillText('Cara A · 33⅓', 256, 290);
    g.fillStyle = '#0d0b0f'; g.beginPath(); g.arc(256, 256, 6, 0, TAU); g.fill();
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 96), basic('#ffffff', { map: etiquetaVin, side: THREE.DoubleSide })); vin.add(disc);
  const brilloV = new THREE.Mesh(new THREE.RingGeometry(3.2, 7.9, 96, 1, 0, 0.5), basic('#ffe9c0', { add: true, opacity: 0.25, side: THREE.DoubleSide })); brilloV.position.z = 0.02; vin.add(brilloV);
  ctx.alActualizar((t) => { disc.rotation.z = -t * 1.2; brilloV.rotation.z = 0.6 + Math.sin(t * 0.3) * 0.1; });
  ctx.hito({ id: 'vinilo', nombre: 'El vinilo gigante', objeto: vin, foco: [0, 11, -14], vista: [0, 11, 6],
    texto: 'Gira a 33⅓ revoluciones encima del escenario. En la bitácora hay unas cuantas entradas con la etiqueta música, desde una versión de Bob Esponja hasta Despiértame cada día.' });

  // Torres de sonido
  const torres = new THREE.Group(); ctx.scene.add(torres); const conos = [];
  [-15, 15].forEach((x) => {
    const tg = new THREE.Group(); tg.position.set(x, 0, -10); tg.rotation.y = -Math.sign(x) * 0.35; torres.add(tg);
    const caja = new THREE.Mesh(new THREE.BoxGeometry(5, 13, 4), mat('#1c1418', { rough: 0.6 })); caja.position.y = 6.5; tg.add(caja);
    [[3, 2], [7.2, 1.4], [10.8, 0.9]].forEach(([y, R]) => { const cg = new THREE.Group(); cg.position.set(0, y, 2.02); tg.add(cg);
      const aro = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.25, 48), basic('#ffd27a')); cg.add(aro);
      const cono = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mat('#2a2226', { rough: 0.3, metal: 0.4 })); cg.add(cono);
      const centro = new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 16, 8), mat('#3d3036', { metal: 0.6, rough: 0.3 })); centro.scale.z = 0.5; cg.add(centro); conos.push(cg); });
  });
  ctx.alActualizar((t) => { const p = pulso(t); conos.forEach((c) => { c.scale.setScalar(1 + p * 0.12); c.position.z = 2.02 + p * 0.25; }); });
  ctx.hito({ id: 'altavoces', nombre: 'Torres de sonido', objeto: torres, foco: [15, 7, -10], vista: [28, 9, 6],
    texto: 'Dos torres de altavoces con los conos latiendo a cada golpe de bombo. Cuando se active el audio de la nave, aquí sonará la música de la sala.' });

  // Notas sueltas
  const notas = new THREE.Group(); ctx.scene.add(notas); const oro = mat('#ffd27a', { em: '#ff9f2c', emI: 0.5, metal: 0.5, rough: 0.3 });
  for (let i = 0; i < 16; i++) {
    const n = new THREE.Group(); const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), oro); cabeza.scale.set(1.25, 0.85, 0.7); cabeza.rotation.z = 0.4; n.add(cabeza);
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6), oro); palo.position.set(0.6, 1.3, 0); n.add(palo);
    if (i % 2) { const ban = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.12), oro); ban.position.set(1.0, 2.35, 0); ban.rotation.z = -0.6; n.add(ban); }
    n.userData = { a: (i / 16) * TAU, d: 8 + (i % 4) * 4, y: 6 + (i % 5) * 2.2, v: 0.12 + (i % 3) * 0.05 }; notas.add(n);
  }
  ctx.alActualizar((t) => notas.children.forEach((n, i) => { const u = n.userData; const a = u.a + t * u.v; n.position.set(Math.cos(a) * u.d, u.y + ((t * 0.6 + i) % 8) - 4 + Math.sin(t + i) * 0.4, Math.sin(a) * u.d); n.rotation.y = -a; const s = 1 + pulso(t) * 0.15; n.scale.setScalar(s); }));
  ctx.hito({ id: 'notas', nombre: 'Notas sueltas', objeto: notas, foco: [0, 9, 0], vista: [-20, 12, 20],
    texto: 'Corcheas y negras que se escapan del escenario y suben hasta perderse entre los anillos.' });

  particulas(ctx, { n: 300, centro: [0, 10, 0], area: [90, 24, 90], color: '#ffe2a0', tam: 0.32, modo: 'flotar' });
  return { camara: { pos: [0, 12, 40], objetivo: [0, 6, -6] }, bloom: { fuerza: 0.6, radio: 0.55, umbral: 0.82 }, exposicion: 0.85 };
};

// ── Lumen · Bitácora ──
ESCENAS.lumen = (ctx, opts) => {
  cielo(ctx, { top: '#120f26', mid: '#4d4670', hor: '#e6dbff', estrellas: 0.85, aurora: 0.35, auroraA: '#e8dcff', auroraB: '#9fd8ff', solDir: [-0.7, 0.1, -0.7], sol: '#fff4e6', solTam: 0.0014 });
  niebla(ctx, '#a99fc8', 70, 420);
  luces(ctx, { cielo: '#e8dcff', suelo: '#5a5470', hemi: 0.9, sol: '#fff0e0', solI: 1.4, solPos: [-60, 30, -60] });
  planetaEnCielo(ctx, 'izaro', [0.4, 0.3, -0.85], 190);

  const altura = (x, z) => fbm(x * 0.03, z * 0.03) * 4 - 2 + smooth(70, 200, Math.hypot(x, z)) * fbm(x * 0.01, z * 0.01) * 50;
  const n1 = col('#fbf7ff'), n2 = col('#a89fc4');
  suelo(ctx, { altura, color: (x, z, h, c) => c.copy(n1).lerp(n2, smooth(0.35, 0.75, fbm(x * 0.06 + 3, z * 0.06)) * 0.6), rough: 0.7 });
  const r = ctx.rnd;

  // Faro
  const faro = new THREE.Group(); faro.position.set(-22, altura(-22, -26), -26); ctx.scene.add(faro);
  const franjas = texturaCanvas(64, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f7f2ff' : '#7c6aa8'; g.fillRect(0, (i * h) / 8, w, h / 8); } });
  const torre = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 18, 32), mat('#ffffff', { map: franjas, rough: 0.6 })); torre.position.y = 9; faro.add(torre);
  const balcon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 32), mat('#3d3358')); balcon.position.y = 18.2; faro.add(balcon);
  const baranda = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.07, 6, 48), mat('#3d3358')); baranda.rotation.x = Math.PI / 2; baranda.position.y = 19; faro.add(baranda);
  const linterna = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 16), basic('#fff1c8')); linterna.position.y = 19.6; faro.add(linterna);
  const cupula = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.8, 16), mat('#3d3358')); cupula.position.y = 21.7; faro.add(cupula);
  const haces = new THREE.Group(); haces.position.y = 19.6; faro.add(haces);
  const hazGeo = new THREE.ConeGeometry(5, 60, 32, 1, true); hazGeo.translate(0, -30, 0); hazGeo.rotateZ(Math.PI / 2);
  const hazMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying float vX; void main(){ float k = abs(vX)/60.; gl_FragColor = vec4(vec3(1.,.93,.75)*(1.-k)*.22, 1.); }' });
  const h1 = new THREE.Mesh(hazGeo, hazMat); const h2 = new THREE.Mesh(hazGeo, hazMat); h2.rotation.y = Math.PI; haces.add(h1, h2);
  ctx.alActualizar((t) => { haces.rotation.y = t * 0.5; });
  luzPunto(ctx, '#fff1c8', 60, 40, [-22, 20, -26]);
  ctx.hito({ id: 'faro', nombre: 'El faro de la bitácora', objeto: faro, foco: [-22, 12, -26], vista: [-6, 13, -2],
    texto: 'El faro alumbra todo lo escrito. Malkevnia lleva publicando desde 2010; en la bitácora hay cien entradas, de poemas en catalán a los 36 capítulos de Proyecto Arca.' });

  // Holopaneles con entradas reales
  const posts = (opts.posts && opts.posts.length ? opts.posts : POSTS_POR_DEFECTO).slice(0, 8);
  const holo = new THREE.Group(); ctx.scene.add(holo); const paneles = [];
  posts.forEach((p, i) => {
    const tex = texturaCanvas(512, 300, (g, w, h) => {
      g.fillStyle = 'rgba(30,22,60,.82)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(200,180,255,.9)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#bfb2ff'; g.font = '600 20px "Courier New", monospace'; g.fillText(`${p.fecha}  ·  ${p.min} min`, 28, 46);
      g.fillStyle = '#fbf7ff'; g.font = '700 38px Georgia, serif';
      const palabras = p.titulo.split(' '); let linea = '', y = 104; const lineas = [];
      palabras.forEach((pw) => { const prueba = linea ? `${linea} ${pw}` : pw; if (g.measureText(prueba).width > w - 56) { lineas.push(linea); linea = pw; } else linea = prueba; }); lineas.push(linea);
      lineas.slice(0, 3).forEach((l) => { g.fillText(l, 28, y); y += 46; });
      g.fillStyle = '#9fd8ff'; g.font = '20px "Courier New", monospace'; g.fillText((p.tags || []).map((t) => '#' + t).join('  '), 28, h - 30);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    const a = Math.PI * 1.15 + (i / (posts.length - 1)) * Math.PI * 0.7; m.position.set(Math.cos(a) * 18, 6 + (i % 2) * 2.4, Math.sin(a) * 18 + 2); m.lookAt(0, m.position.y, 6);
    m.userData = { y: m.position.y, f: i, url: p.url, titulo: p.titulo }; holo.add(m); paneles.push(m);
  });
  ctx.alActualizar((t) => paneles.forEach((m) => { m.position.y = m.userData.y + Math.sin(t * 0.8 + m.userData.f) * 0.3; m.material.opacity = 0.85 + Math.sin(t * 3 + m.userData.f * 2) * 0.05; }));
  ctx.hito({ id: 'holopaneles', nombre: 'Holopaneles', objeto: holo, foco: [0, 7, -12], vista: [0, 8, 10], enlaces: posts.map((p) => ({ titulo: p.titulo, url: p.url })),
    texto: 'Entradas reales de malkevnia.com flotando en holopaneles, de la bienvenida de 2026 a los poemas de 2015. Cuando el blog nuevo tenga base de datos, aquí saldrán las últimas.' });

  // Escritorio del capitán
  const esc = new THREE.Group(); esc.position.set(17, altura(17, 6), 6); esc.rotation.y = -0.9; ctx.scene.add(esc);
  const madera = mat('#6b4a3a', { rough: 0.6 });
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 2.6), madera); tablero.position.y = 2.2; esc.add(tablero);
  [[-2.3, -1.1], [2.3, -1.1], [-2.3, 1.1], [2.3, 1.1]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 0.2), madera); p.position.set(x, 1.05, z); esc.add(p); });
  const cuaderno = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), basic('#ffffff', { map: texturaCanvas(256, 180, (g, w, h) => { g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9c0e6'; for (let y = 20; y < h; y += 14) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); } g.fillStyle = '#3b2f5a'; g.font = 'italic 16px Georgia, serif'; ['Día 1 de la travesía.', 'Lumen a la vista. Todo', 'en calma. Escribo antes', 'de que se me olvide…'].forEach((s, i) => g.fillText(s, 12, 17 + i * 28)); g.fillStyle = '#e6dcc4'; g.fillRect(w / 2 - 1, 0, 2, h); }) }));
  cuaderno.rotation.x = -Math.PI / 2; cuaderno.position.set(-0.3, 2.34, 0.2); esc.add(cuaderno);
  for (let i = 0; i < 4; i++) { const lb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 1.9), mat(['#7c6aa8', '#c0392b', '#3a7bd5', '#e0b04a'][i])); lb.position.set(1.7, 2.45 + i * 0.23, -0.4); lb.rotation.y = (r() - 0.5) * 0.3; esc.add(lb); }
  const pluma = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6, 6), mat('#fbf7ff', { flat: true })); pluma.position.set(0.6, 2.5, 0.3); pluma.rotation.set(0, 0, -1.2); esc.add(pluma);
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6), mat('#2d2738', { metal: 0.6 })); pie.position.set(-2, 3.1, -0.8); esc.add(pie);
  const pantallaL = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.6, 16, 1, true), mat('#3d3358', { side: THREE.DoubleSide })); pantallaL.position.set(-2, 3.9, -0.8); esc.add(pantallaL);
  const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), basic('#ffe2a0')); bombilla.position.set(-2, 3.7, -0.8); esc.add(bombilla);
  const lampara = new THREE.PointLight('#ffd9a0', 20, 10, 2); lampara.position.set(-2, 3.5, -0.8); esc.add(lampara);
  ctx.hito({ id: 'escritorio', nombre: 'El escritorio del capitán', objeto: esc, foco: [17, 3, 6], vista: [24, 6, 14],
    texto: 'Un cuaderno abierto, una pluma y la lámpara encendida. Aquí se escriben las entradas antes de subirlas a la bitácora.' });

  // Páginas al viento
  const hojas = new THREE.Group(); ctx.scene.add(hojas);
  const hojaMat = mat('#fbf7ff', { side: THREE.DoubleSide, em: '#fff4e0', emI: 0.25 });
  const datos = Array.from({ length: 50 }, () => ({ x: (r() - 0.5) * 120, y: 2 + r() * 14, z: (r() - 0.5) * 80, f: r() * 10, v: 3 + r() * 4 }));
  datos.forEach(() => hojas.add(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), hojaMat)));
  ctx.alActualizar((t) => hojas.children.forEach((h, i) => { const d = datos[i]; const x = ((d.x + t * d.v + 60) % 120 + 120) % 120 - 60; h.position.set(x, d.y + Math.sin(t * 1.3 + d.f) * 1.4, d.z + Math.sin(t * 0.7 + d.f) * 3); h.rotation.set(t * 1.7 + d.f, t * 1.1 + d.f, Math.sin(t * 2 + d.f)); }));
  ctx.hito({ id: 'paginas', nombre: 'Páginas al viento', objeto: hojas, foco: [-10, 7, 4], vista: [-24, 8, 22],
    texto: 'Borradores que no llegaron a publicarse. El viento de Lumen se los lleva, pero siempre vuelven a pasar por delante del faro.' });

  // Farolillos del camino
  for (let i = 0; i < 8; i++) { const z = 30 - i * 5.5, x = Math.sin(i * 0.8) * 4 + (i % 2 ? 3.5 : -3.5); const y = altura(x, z);
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4), mat('#3d3358')); poste.position.set(x, y + 1.2, z); ctx.scene.add(poste);
    const luz = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), basic('#ffe2a8')); luz.position.set(x, y + 2.5, z); ctx.scene.add(luz); }

  particulas(ctx, { n: 400, centro: [0, 15, 0], area: [130, 30, 130], color: '#fff6ea', tam: 0.28, modo: 'caer', vel: 0.35, opacidad: 0.8 });
  return { camara: { pos: [0, 10, 40], objetivo: [0, 7, -6] }, bloom: { fuerza: 0.7, radio: 0.6, umbral: 0.7 }, exposicion: 1.05 };
};

// ───────────────────────────── Superficie (sin renderer) ─────────────────────────────

/**
 * Construye la escena de superficie de un planeta.
 * Devuelve { planeta, scene, hitos, camara, bloom, exposicion, update(t, dt), dispose() }.
 * Cada hito: { id, nombre, texto, foco: Vector3, vista: Vector3, objeto: Object3D, enlaces? }.
 */
export function crearSuperficie(id, opts = {}) {
  const P = porId(id);
  const scene = new THREE.Scene();
  const fns = [];
  const ctx = {
    scene, planeta: P, rnd: rng(P.semilla), tiempo: { value: 0 }, hitos: [], sombras: opts.sombras !== false,
    alActualizar: (fn) => fns.push(fn),
    hito: (h) => {
      const hito = { ...h, foco: new THREE.Vector3(...h.foco), vista: new THREE.Vector3(...h.vista) };
      h.objeto.traverse((o) => { o.userData.hitoId = h.id; });
      ctx.hitos.push(hito);
    },
  };
  const cfg = ESCENAS[P.id](ctx, opts);
  // Sombras: los sólidos opacos proyectan y reciben; el terreno solo recibe. Cielo, agua, neón y partículas, nada.
  if (ctx.sombras) scene.traverse((o) => {
    if (!o.isMesh || o.userData.sinSombra) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.isShaderMaterial || m.isMeshBasicMaterial || m.transparent) return;
    o.receiveShadow = true; o.castShadow = !o.userData.suelo;
  });
  scene.updateMatrixWorld(true);
  return {
    planeta: P, scene, hitos: ctx.hitos, camara: { pos: new THREE.Vector3(...cfg.camara.pos), objetivo: new THREE.Vector3(...cfg.camara.objetivo) },
    bloom: cfg.bloom, exposicion: cfg.exposicion ?? 1,
    update(t, dt) { ctx.tiempo.value = t; for (const f of fns) f(t, dt); },
    dispose() {
      const texs = new Set();
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose(); else o.geometry?.dispose();
        if (o.isInstancedMesh) o.geometry?.dispose();
        if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => { Object.values(m).forEach((v) => { if (v?.isTexture) texs.add(v); }); Object.values(m.uniforms || {}).forEach((u) => { if (u.value?.isTexture) texs.add(u.value); }); m.dispose(); });
      });
      texs.forEach((t) => { if (!t.userData.compartida) t.dispose(); });
      fns.length = 0;
    },
  };
}

// ───────────────────────────── Todo montado ─────────────────────────────

let _ultimo = null;

/**
 * Monta el planeta en un <canvas> con su propio renderer, cámara orbital, bloom y aterrizaje.
 * opts: { bucle = true, aterrizaje = true, calidad = 'alta'|'media'|'baja', sombras, adaptativo = true, posts,
 *         onHito(hito), onPlaneta(planeta), onCalidad({ pixelRatio, sombras, bloom }) }
 * Devuelve un controlador: { planeta, hitos, update(dt), irAHito(id), setPlaneta(id), hitosEnPantalla(), resize(), pausar(), reanudar(), dispose() }.
 */
export function init(canvas, planetId = 'verdanza', opts = {}) {
  const calidad = opts.calidad ?? 'alta';
  const reducido = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sombras = opts.sombras ?? calidad !== 'baja';
  const optsSup = { ...opts, sombras };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: calidad !== 'baja', powerPreference: 'high-performance' });
  let pr = Math.min(window.devicePixelRatio || 1, calidad === 'alta' ? 2 : calidad === 'media' ? 1.5 : 1);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = sombras; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, maxPolarAngle: Math.PI * 0.49, minDistance: 4, maxDistance: 110, autoRotate: !reducido, autoRotateSpeed: 0.35, enablePan: true, panSpeed: 0.6 });
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), camera); composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.7); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  bloom.enabled = calidad !== 'baja';

  let sup = null, t = 0, vuelo = null, raf = 0, ultimoT = performance.now(), pausado = false;
  let muestras = 0, acumulado = 0, calentando = 1.5; // para la calidad adaptable
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();

  // En pantallas estrechas (móvil en vertical) la cámara se aleja para que el hito quepa a lo ancho.
  const alejar = (pos, objetivo) => { const a = camera.aspect || 1; if (a >= 1) return pos.clone(); const k = 1 / Math.max(a, 0.45) ** 0.85; return objetivo.clone().add(pos.clone().sub(objetivo).multiplyScalar(k)); };
  function volarA(pos, objetivo, dur = 1.8) {
    pos = alejar(pos, objetivo);
    if (reducido) { camera.position.copy(pos); controls.target.copy(objetivo); vuelo = null; return; }
    vuelo = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: objetivo.clone(), k: 0, dur };
  }
  function setPlaneta(id) {
    sup?.dispose();
    sup = crearSuperficie(id, optsSup);
    renderPass.scene = sup.scene;
    bloom.strength = sup.bloom.fuerza; bloom.radius = sup.bloom.radio; bloom.threshold = sup.bloom.umbral;
    renderer.toneMappingExposure = sup.exposicion;
    controls.autoRotate = !reducido;
    if (opts.aterrizaje !== false && !reducido) {
      camera.position.copy(sup.camara.pos).add(new THREE.Vector3(0, 70, 40)); controls.target.copy(sup.camara.objetivo).add(new THREE.Vector3(0, 30, 0));
      volarA(sup.camara.pos, sup.camara.objetivo, 3.2);
    } else { camera.position.copy(alejar(sup.camara.pos, sup.camara.objetivo)); controls.target.copy(sup.camara.objetivo); vuelo = null; }
    muestras = 0; acumulado = 0; calentando = 1.5;
    api.planeta = sup.planeta; api.hitos = sup.hitos;
    opts.onPlaneta?.(sup.planeta);
  }
  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  // Calidad adaptable: si tras calentar va por debajo de ~28 fps, baja la resolución y, en último caso, quita sombras.
  function adaptar(crudo, dt) {
    if (opts.adaptativo === false || crudo > 0.25) return;
    if (calentando > 0) { calentando -= dt; return; }
    acumulado += crudo; if (++muestras < 120) return;
    const lento = acumulado / muestras > 1 / 28; muestras = 0; acumulado = 0;
    if (!lento) return;
    if (pr > 1) { pr = Math.max(1, pr - 0.5); renderer.setPixelRatio(pr); resize(); }
    else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; sup.scene.traverse((o) => { if (o.isLight) o.castShadow = false; }); }
    else if (bloom.enabled) bloom.enabled = false;
    opts.onCalidad?.({ pixelRatio: pr, sombras: renderer.shadowMap.enabled, bloom: bloom.enabled });
  }

  controls.addEventListener('start', () => { controls.autoRotate = false; vuelo = null; });
  let abajo = null;
  const onDown = (e) => { abajo = [e.clientX, e.clientY]; };
  const pick = (e) => {
    const rc = canvas.getBoundingClientRect(); ptr.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ptr, camera); const objs = sup.hitos.map((h) => h.objeto);
    const hit = ray.intersectObjects(objs, true).find((i) => i.object.userData.hitoId);
    return hit ? sup.hitos.find((h) => h.id === hit.object.userData.hitoId) : null;
  };
  const onUp = (e) => { const a = abajo; abajo = null; if (!a || Math.hypot(e.clientX - a[0], e.clientY - a[1]) > 6) return; const h = pick(e); if (h) irAHito(h.id); };
  let ultimoHover = 0;
  const onMove = (e) => { if (e.pointerType !== 'mouse' || abajo || performance.now() - ultimoHover < 80) return; ultimoHover = performance.now(); canvas.style.cursor = pick(e) ? 'pointer' : ''; };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointermove', onMove);

  function irAHito(id) {
    const h = sup.hitos.find((x) => x.id === id) || sup.hitos[id]; if (!h) return;
    controls.autoRotate = false;
    // En vertical la ficha del hito tapa la parte baja de la pantalla: se baja un poco el objetivo para que el hito quede más arriba.
    let foco = h.foco;
    if ((camera.aspect || 1) < 1 && opts.subirHitoEnMovil !== false) foco = h.foco.clone().add(new THREE.Vector3(0, -alejar(h.vista, h.foco).distanceTo(h.foco) * 0.16, 0));
    volarA(h.vista.clone().add(foco).sub(h.foco), foco, 1.8); opts.onHito?.(h);
  }
  const _v = new THREE.Vector3();
  function hitosEnPantalla() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return sup.hitos.map((x) => { _v.copy(x.foco); _v.y += 2.5; _v.project(camera); const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; return { id: x.id, nombre: x.nombre, x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, visible: vis, distancia: camera.position.distanceTo(x.foco) }; });
  }
  function update(dt = 1 / 60) {
    const crudo = dt; dt = Math.min(dt, 0.1); t += dt;
    if (vuelo) { vuelo.k = Math.min(1, vuelo.k + dt / vuelo.dur); const e = vuelo.k < 0.5 ? 4 * vuelo.k ** 3 : 1 - (-2 * vuelo.k + 2) ** 3 / 2;
      camera.position.lerpVectors(vuelo.p0, vuelo.p1, e); controls.target.lerpVectors(vuelo.t0, vuelo.t1, e); if (vuelo.k >= 1) vuelo = null; }
    controls.update(dt); sup.update(t, dt); composer.render(dt);
    adaptar(crudo, dt);
  }
  function bucle(now) { raf = requestAnimationFrame(bucle); const dt = (now - ultimoT) / 1000; ultimoT = now; update(dt); }
  function pausar() { pausado = true; cancelAnimationFrame(raf); raf = 0; }
  function reanudar() { if (!pausado) return; pausado = false; if (opts.bucle !== false) { ultimoT = performance.now(); raf = requestAnimationFrame(bucle); } }
  function dispose() {
    cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointermove', onMove);
    sup?.dispose(); sup = null; composer.dispose?.(); bloom.dispose?.(); renderer.dispose(); renderer.forceContextLoss(); if (_ultimo === api) _ultimo = null;
  }
  const api = { planeta: null, hitos: [], renderer, camera, controls, update, irAHito, setPlaneta, hitosEnPantalla, resize, pausar, reanudar, dispose, get superficie() { return sup; }, get pausado() { return pausado; } };
  resize(); setPlaneta(planetId);
  if (opts.bucle !== false) raf = requestAnimationFrame((n) => { ultimoT = n; bucle(n); });
  _ultimo = api;
  return api;
}

/** Atajos sobre el último init(): avanzar un fotograma y liberarlo todo. */
export function update(dt) { _ultimo?.update(dt); }
export function dispose() { _ultimo?.dispose(); }
