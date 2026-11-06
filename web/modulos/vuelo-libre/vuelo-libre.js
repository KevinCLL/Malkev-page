/* =====================================================================
   La Malkevnia · Modo vuelo libre
   Módulo ES autocontenido (Three.js r160). Pilota la nave por el sistema
   de Malkevnia, salta entre planetas y aterriza junto a sus museos.

   API:  const vuelo = init(canvas, { planets, onLand, onVisit, onTakeoff, onExit, hud, sonido, calidad })
         vuelo.start() · vuelo.stop() · vuelo.update(dt) · vuelo.dispose()
         vuelo.setTarget(id) · vuelo.landOn(id) · vuelo.takeoff() · vuelo.state
   Requiere un importmap con "three" y "three/addons/" (ver README.md).
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------------------------------------------------------------------
   Planetas por defecto: uno por afición de Malkev.
   tipo: 'oceano' | 'bosque' | 'hielo' | 'lava' | 'gas' | 'desierto'
   --------------------------------------------------------------------- */
export const PLANETAS_POR_DEFECTO = [
  { id: 'izaro', nombre: 'Izaro', tipo: 'bosque', tema: 'Juegos de mesa', museo: 'La Kallax',
    descripcion: 'Un mundo templado de bosques y mares someros. Bajo su cúpula descansan las 220 cajas de la Kallax, cubo a cubo.',
    radio: 520, posicion: [0, -200, -6500], colores: ['#0d2a4a', '#1f6f8b', '#3f7a3a', '#a7b56a'], atmosfera: '#7fc4ff', ruta: '/juegos' },
  { id: 'thalassa', nombre: 'Thalassa', tipo: 'oceano', tema: 'Cine', museo: 'Sala de proyección',
    descripcion: 'Océano infinito con archipiélagos dispersos. Su museo es una sala de cine flotando sobre el agua.',
    radio: 640, posicion: [13000, 2200, -21000], colores: ['#061a3d', '#1666a8', '#cdb88a', '#5f8f52'], atmosfera: '#8fd3ff', ruta: '/cine' },
  { id: 'gelida', nombre: 'Gélida', tipo: 'hielo', tema: 'Libros', museo: 'La gran biblioteca',
    descripcion: 'Glaciares azules y silencio. Una biblioteca enterrada en el hielo guarda novelas y ensayos.',
    radio: 470, posicion: [-15500, -2600, -24000], colores: ['#cfe6ff', '#8fb6e8', '#3b6fb0', '#ffffff'], atmosfera: '#bfe3ff', ruta: '/libros' },
  { id: 'brasa', nombre: 'Brasa Menor', tipo: 'lava', tema: 'Manga y cómic', museo: 'El taller de viñetas',
    descripcion: 'Corteza negra y ríos de lava. Entre volcanes, un archivo de tomos de manga y cómic.',
    radio: 400, posicion: [9500, -2400, 5200], colores: ['#1a0d0b', '#3a1f1a', '#ff6a1a', '#ffd27a'], atmosfera: '#ff7a3d', ruta: '/manga' },
  { id: 'aurea', nombre: 'Aurea', tipo: 'gas', tema: 'Bitácora', museo: 'La bitácora del capitán',
    descripcion: 'Gigante gaseoso de franjas doradas. En su estación orbital se escriben las entradas del blog.',
    radio: 1500, posicion: [-7000, 4200, -46000], colores: ['#e8c48a', '#b3804a', '#f3e2bd', '#8a5a3a'], atmosfera: '#ffd9a0', anillos: true, ruta: '/bitacora' },
  { id: 'duna', nombre: 'Duna Violeta', tipo: 'desierto', tema: 'Rol', museo: 'La cripta del rol',
    descripcion: 'Dunas malvas bajo dos lunas. Una cripta guarda los noventa libros de rol de la tripulación.',
    radio: 560, posicion: [-19500, 1400, 1500], colores: ['#6b4a8c', '#a77fb8', '#3a2652', '#e0b7d9'], atmosfera: '#d7a8ff', ruta: '/rol' },
];

const TIPOS = { oceano: 0, bosque: 1, hielo: 2, lava: 3, gas: 4, desierto: 5 };
const SUN_POS = new THREE.Vector3(62000, 26000, 24000);
const SUN_R = 2600;
const KM = 10; // 1 unidad = 10 km en el HUD

/* ---------------------------------------------------------------------
   GLSL compartido
   --------------------------------------------------------------------- */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int oct){float a=.5,s=0.;for(int i=0;i<9;i++){if(i>=oct)break;s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
`;

const VS_WORLD = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj; varying vec3 vW; varying vec3 vN;
void main(){
  vObj=position; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*w;
  #include <logdepthbuf_vertex>
}`;

const FS_PLANET = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun,uC1,uC2,uC3,uC4,uAtm,uCenter; uniform float uType,uSeed,uTime,uR,uDetail;
varying vec3 vObj; varying vec3 vW; varying vec3 vN;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p=normalize(vObj); vec3 N=normalize(vW-uCenter); vec3 L=normalize(uSun-vW); vec3 V=normalize(cameraPosition-vW);
  float camD=length(cameraPosition-vW); int oct=int(clamp(6.+uDetail*3.-log2(max(camD/uR,.02))*.9,5.,9.));
  vec3 q=p*2.1+uSeed; float h=fbm(q,oct); float h2=fbm(q*3.7+4.,4);
  vec3 col; vec3 emis=vec3(0.); float spec=0.; float rough=24.;
  int t=int(uType+.5);
  if(t==0||t==1){
    float sea=t==0?.16:-.04; float land=smoothstep(sea,sea+.015,h);
    vec3 water=mix(uC1,uC2,smoothstep(sea-.35,sea,h));
    vec3 ground=mix(uC3,uC4,smoothstep(sea,sea+.45,h+h2*.15));
    if(t==0){ground=mix(uC3,uC4,smoothstep(sea+.02,sea+.12,h+h2*.1));}
    col=mix(water,ground,land);
    float lat=abs(p.y)+h2*.12; float ice=smoothstep(.78,.86,lat); col=mix(col,vec3(.92,.95,1.),ice);
    spec=(1.-land)*(1.-ice)*.45; rough=70.;
  } else if(t==2){
    col=mix(uC2,uC1,smoothstep(-.4,.4,h));
    float r=1.-abs(snoise(q*5.)); float r2=1.-abs(snoise(q*13.+2.));
    col=mix(col,uC3,smoothstep(.93,.985,r)*.85); col=mix(col,uC3*.9,smoothstep(.95,.99,r2)*.5);
    col=mix(col,uC4,smoothstep(.25,.6,h2)*.6); spec=.35; rough=30.;
  } else if(t==3){
    col=mix(uC1,uC2,smoothstep(-.5,.5,h)); float r=1.-abs(fbm(q*1.3,5)); float r2=1.-abs(snoise(q*9.));
    float lava=smoothstep(.86,.97,r)+smoothstep(.95,.99,r2)*.5;
    float pulse=.75+.25*sin(uTime*1.3+h*20.);
    emis=mix(uC3,uC4,smoothstep(.93,1.,r))*lava*pulse*2.2; col*=1.-lava*.6; spec=.12;
  } else if(t==4){
    float w=fbm(vec3(p.x*1.5,p.y*7.,p.z*1.5)+uSeed+vec3(uTime*.006,0.,0.),6);
    float b=p.y*9.+w*2.2; float s=sin(b)*.5+.5; float s2=sin(b*2.3+1.)*.5+.5;
    col=mix(mix(uC1,uC2,s),mix(uC3,uC4,s2),smoothstep(.2,.8,sin(b*.5)*.5+.5));
    vec3 sp=vec3(.6,-.25,.76); float st=length(p-normalize(sp)); col=mix(col,uC4*.8+vec3(.15,.02,0.),smoothstep(.16,.05,st+w*.04)*.85);
    spec=.05;
  } else {
    col=mix(uC1,uC2,smoothstep(-.35,.45,h));
    vec3 dd=normalize(vec3(.8,.2,.5)); float dune=sin(dot(p,dd)*140.+h2*14.)*.5+.5;
    col*=.86+.14*dune; col=mix(col,uC3,smoothstep(-.2,-.45,h)*.9); col=mix(col,uC4,smoothstep(.45,.7,h)*.6); spec=.08;
  }
  float nl=dot(N,L); float diff=smoothstep(-.12,.7,nl);
  vec3 lit=col*(.025+diff*1.15);
  vec3 Hh=normalize(L+V); lit+=vec3(1.,.95,.85)*pow(max(dot(N,Hh),0.),rough)*spec*smoothstep(0.,.2,nl);
  float fres=pow(1.-max(dot(N,V),0.),3.); lit+=uAtm*fres*smoothstep(-.25,.5,nl)*.5;
  float alt=max(length(cameraPosition-uCenter)-uR,0.); float haze=smoothstep(uR*.02,0.,alt)*smoothstep(uR*.003,uR*.12,camD);
  lit=mix(lit,uAtm*(.06+diff*.45),haze*.28);
  gl_FragColor=vec4(lit+emis,1.);
}`;

const FS_CLOUDS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun,uCenter; uniform float uTime,uSeed,uCov,uFade;
varying vec3 vObj; varying vec3 vW; varying vec3 vN;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p=normalize(vObj); vec3 N=normalize(vW-uCenter); vec3 L=normalize(uSun-vW);
  float c=fbm(p*3.+vec3(uTime*.005,uSeed,0.),6); c=smoothstep(.05-uCov,.55-uCov,c);
  float diff=smoothstep(-.1,.6,dot(N,L));
  gl_FragColor=vec4(vec3(1.)*(.03+diff),c*.85*uFade);
}`;

const VS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNV; varying vec3 vW;
void main(){ vNV=normalize(normalMatrix*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;
  #include <logdepthbuf_vertex>
}`;
const FS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uAtm,uSun,uCenter; uniform float uInside,uPow,uR,uRs;
varying vec3 vNV; varying vec3 vW;
void main(){
  #include <logdepthbuf_fragment>
  vec3 n=normalize(vW-uCenter); float lit=smoothstep(-.35,.55,dot(n,normalize(uSun-vW)));
  vec3 dir=normalize(vW-cameraPosition); vec3 oc=uCenter-cameraPosition; float t=max(dot(oc,dir),0.);
  float h=length(cameraPosition+dir*t-uCenter);
  float a=clamp((uRs-h)/(uRs-uR),0.,1.); float outer=pow(a,uPow)*1.35;
  vec3 up=normalize(cameraPosition-uCenter); float el=dot(dir,up);
  float sky=(.12+.55*pow(1.-clamp(el,0.,1.),4.))*.9;
  float i=mix(outer,sky,uInside);
  gl_FragColor=vec4(uAtm*i*lit,1.);
}`;

const FS_RING = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun,uCenter,uC1,uC2; uniform float uR,uIn,uOut;
varying vec3 vObj; varying vec3 vW; varying vec3 vN;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float r=length(vObj.xy); float t=(r-uIn)/(uOut-uIn);
  float b=snoise(vec3(t*38.,0.,1.))*.5+.5; float b2=snoise(vec3(t*140.,3.,1.))*.5+.5;
  float a=smoothstep(0.,.06,t)*smoothstep(1.,.85,t)*(.25+.75*b)*(.6+.4*b2); a*=1.-smoothstep(.55,.6,t)*smoothstep(.66,.61,t)*.9;
  vec3 col=mix(uC1,uC2,b2);
  vec3 L=normalize(uSun-vW); vec3 oc=vW-uCenter; float bq=dot(oc,L); float c=dot(oc,oc)-uR*uR; float sh=(bq<0.&&bq*bq-c>0.)?.08:1.;
  gl_FragColor=vec4(col*sh*.95,a*.9);
}`;

const VS_DIR = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  #include <logdepthbuf_vertex>
}`;
const FS_NEBULA = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vDir;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 d=normalize(vDir);
  float band=exp(-pow(dot(d,normalize(vec3(.35,1.,.15)))*3.2,2.));
  float n=fbm(d*2.2,6)*.5+.5; float n2=fbm(d*4.5+7.,5)*.5+.5; float n3=fbm(d*9.+2.,4);
  vec3 base=vec3(.012,.008,.03);
  vec3 purple=vec3(.30,.12,.55)*smoothstep(.45,.85,n)*(.35+band*.9);
  vec3 teal=vec3(.05,.22,.35)*smoothstep(.55,.9,n2)*(.25+band*.6);
  vec3 pink=vec3(.45,.10,.35)*smoothstep(.62,.92,n*n2*1.5)*.5;
  vec3 col=base+purple+teal+pink; col*=.8+.25*n3; col+=vec3(.6,.5,.85)*band*.05;
  gl_FragColor=vec4(col*.55,1.);
}`;

const VS_STARS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uPR,uTime; varying vec3 vC; varying float vTw;
void main(){ vC=aColor; vTw=.75+.25*sin(uTime*(1.+aPhase*2.)+aPhase*40.);
  vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uPR;
  #include <logdepthbuf_vertex>
}`;
const FS_STARS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vC; varying float vTw;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a=a*a;
  gl_FragColor=vec4(vC*vTw*a*1.6,a);
}`;

const VS_SIMPLE = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vNV; varying vec3 vPos;
void main(){ vUv=uv; vPos=position; vNV=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  #include <logdepthbuf_vertex>
}`;
const FS_FLAME = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCore,uEdge; uniform float uTime,uPower; varying vec2 vUv; varying vec3 vNV;
void main(){
  #include <logdepthbuf_fragment>
  float t=vUv.y; float rim=pow(abs(vNV.z),1.5);
  float flick=.85+.15*sin(uTime*60.+t*12.);
  float a=pow(t,1.6)*rim*flick*uPower;
  vec3 col=mix(uEdge,uCore,pow(t,3.));
  gl_FragColor=vec4(col*a*2.2,a);
}`;
const FS_BEAM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uTime,uFade; varying vec2 vUv; varying vec3 vNV;
void main(){
  #include <logdepthbuf_fragment>
  float rim=pow(abs(vNV.z),2.); float a=pow(1.-vUv.y,2.2)*rim*(.6+.4*sin(uTime*2.-vUv.y*30.))*uFade;
  gl_FragColor=vec4(uColor*a*1.6,a);
}`;
const FS_HEAT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uI,uTime; varying vec3 vNV; varying vec3 vPos;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float f=pow(1.-abs(vNV.z),2.); float front=smoothstep(.2,-1.,normalize(vPos).z);
  float n=snoise(vPos*1.2+vec3(0.,0.,uTime*8.))*.5+.5;
  float a=(f*.7+front*.6)*uI*(.5+.5*n);
  gl_FragColor=vec4(mix(vec3(1.,.35,.08),vec3(1.,.85,.5),front)*a*2.,a);
}`;
const FS_SUN = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; varying vec2 vUv; varying vec3 vNV; varying vec3 vPos;
${NOISE}
void main(){
  #include <logdepthbuf_fragment>
  float n=fbm(normalize(vPos)*4.+vec3(uTime*.02),5)*.5+.5; float limb=pow(abs(vNV.z),.45);
  vec3 col=mix(vec3(1.,.55,.25),vec3(1.,.92,.75),n)*limb*3.2;
  gl_FragColor=vec4(col,1.);
}`;

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function bezier(p0, p1, p2, p3, t, out = V()) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function fmtDist(u) { const km = u * KM; return km >= 1e5 ? (km / 1e6).toFixed(2).replace('.', ',') + ' Mkm' : Math.round(km).toLocaleString('es-ES') + ' km'; }
function fmtTime(s) { if (!isFinite(s) || s > 5999) return '—'; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function textSprite(lines, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,8,32,.72)'; g.strokeStyle = color; g.lineWidth = 3;
  g.beginPath(); g.roundRect(6, 6, 500, 148, 18); g.fill(); g.stroke();
  g.fillStyle = color; g.font = '600 26px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(lines[0], 256, 58);
  g.fillStyle = '#f1ebff'; g.font = '700 44px "Orbitron", "Exo 2", sans-serif'; g.fillText(lines[1], 256, 118, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  return s;
}
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, inner); gr.addColorStop(.18, inner.replace(/[\d.]+\)$/, '.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); return t;
}

/* ---------------------------------------------------------------------
   La nave
   --------------------------------------------------------------------- */
function buildShip() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xdcd5f7, metalness: .6, roughness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6a58b0, metalness: .55, roughness: .38 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x241a46, metalness: .5, roughness: .55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x120a24, emissive: 0xb59bff, emissiveIntensity: 1.8 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x7fd6ff, emissiveIntensity: 1.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x150c33, metalness: .95, roughness: .06, emissive: 0x3d2c8c, emissiveIntensity: .55 });

  const prof = [[0, 0], [.18, .35], [.42, 1.1], [.66, 2.1], [.84, 3.3], [.92, 4.6], [.9, 5.8], [.78, 6.9], [.66, 7.5], [.5, 7.7]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 40); fus.rotateX(Math.PI / 2); fus.translate(0, 0, -3.9); fus.scale(1, .68, 1);
  const body = new THREE.Mesh(fus, hull); g.add(body);
  const keel = new THREE.Mesh(new THREE.BoxGeometry(.5, .35, 5.2), dark); keel.position.set(0, -.5, .6); g.add(keel);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(.32, .3, 4.2), dark); spine.position.set(0, .58, 1.4); g.add(spine);

  const canopyG = new THREE.SphereGeometry(.5, 32, 16); canopyG.scale(1, .62, 2.1);
  const canopy = new THREE.Mesh(canopyG, glass); canopy.position.set(0, .42, -1.55); g.add(canopy);

  // alas en flecha
  const ws = new THREE.Shape(); ws.moveTo(0, 0); ws.lineTo(3.9, 1.7); ws.lineTo(4.5, 2.7); ws.lineTo(4.4, 3.05); ws.lineTo(.6, 2.6); ws.lineTo(0, 2.4); ws.closePath();
  const wg = new THREE.ExtrudeGeometry(ws, { depth: .14, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 1 });
  wg.rotateX(Math.PI / 2); wg.translate(0, .07, 0);
  const wingMat = dark.clone(); wingMat.side = THREE.DoubleSide;
  const wingStripG = new THREE.BoxGeometry(3.2, .05, .07);
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(wg, wingMat); w.scale.x = s; w.position.set(.45 * s, -.18, -.2); w.rotation.z = s * .07; g.add(w);
    const st = new THREE.Mesh(wingStripG, accent); st.position.set(2.5 * s, -.08, 1.25); st.rotation.y = -s * .41; g.add(st);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.1, .9, 1.1), trim); fin.position.set(4.35 * s, .25, 2.6); fin.rotation.x = -.35; g.add(fin);
    const side = new THREE.Mesh(new THREE.BoxGeometry(.05, .08, 3.6), accent); side.position.set(.83 * s, .05, 1.2); g.add(side);
    for (let i = 0; i < 4; i++) { const win = new THREE.Mesh(new THREE.BoxGeometry(.04, .09, .18), cyan); win.position.set(.86 * s, .25, -.5 + i * .42); g.add(win); }
  }
  // cola
  const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.lineTo(1.6, 0); ts.lineTo(1.9, 1.35); ts.lineTo(1.3, 1.4); ts.closePath();
  const tg = new THREE.ExtrudeGeometry(ts, { depth: .1, bevelEnabled: false }); tg.rotateY(-Math.PI / 2); tg.translate(.05, .3, 2.1);
  g.add(new THREE.Mesh(tg, trim));

  // motores
  const nozzles = [];
  const flameMat = new THREE.ShaderMaterial({ vertexShader: VS_SIMPLE, fragmentShader: FS_FLAME, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCore: { value: new THREE.Color(1.2, 1.15, 1.4) }, uEdge: { value: new THREE.Color(.55, .3, 1.) }, uTime: { value: 0 }, uPower: { value: 1 } } });
  const flames = [];
  const engines = [[-1.35, -.12, 2.6, .44], [1.35, -.12, 2.6, .44], [0, .05, 3.55, .5]];
  for (const [x, y, z, r] of engines) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(r * .9, r, 3.0, 24).rotateX(Math.PI / 2), x ? hull : dark); nac.position.set(x, y, z - .6); g.add(nac);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * .92, .07, 10, 32), accent); ring.position.set(x, y, z + .9); g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * .82, 24), cyan); core.position.set(x, y, z + .88); g.add(core);
    const fg = new THREE.CylinderGeometry(r * .78, r * .25, 4, 20, 1, true); fg.translate(0, -2, 0); fg.rotateX(-Math.PI / 2);
    // uv.y: 1 en la tobera, 0 en la punta
    const f = new THREE.Mesh(fg, flameMat); f.position.set(x, y, z + .92); f.renderOrder = 5; g.add(f); flames.push(f);
    nozzles.push(V(x, y, z + 1));
  }
  // luces de navegación
  const navL = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, .3, .3) })); navL.position.set(-4.45, -.05, 2.9); g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 4, .6) })); navR.position.set(4.45, -.05, 2.9); g.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) })); navT.position.set(0, 1.72, 3.55); g.add(navT);

  // tren de aterrizaje
  const gear = new THREE.Group();
  for (const [x, z] of [[0, -2.2], [-1.4, 1.6], [1.4, 1.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 1, 8), trim); leg.position.set(x, -.5, z); gear.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .08, 12), trim); foot.position.set(x, -1, z); gear.add(foot);
  }
  gear.position.y = -.45; gear.scale.y = .01; gear.visible = false; g.add(gear);

  // escudo térmico (entrada atmosférica)
  const heatG = new THREE.SphereGeometry(1, 32, 16); heatG.scale(5.4, 2.6, 6.2);
  const heatMat = new THREE.ShaderMaterial({ vertexShader: VS_SIMPLE, fragmentShader: FS_HEAT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uI: { value: 0 }, uTime: { value: 0 } } });
  const heat = new THREE.Mesh(heatG, heatMat); heat.visible = false; heat.renderOrder = 6; g.add(heat);

  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return { group: g, canopy, nozzles, flames, flameMat, nav: [navL, navR, navT], gear, heat, heatMat };
}

/* ---------------------------------------------------------------------
   Planetas
   --------------------------------------------------------------------- */
function buildPlanet(def, i, quality) {
  const R = def.radio || 500;
  const seed = hashStr(def.id || def.nombre || String(i)) * 100;
  const cols = (def.colores || ['#223', '#446', '#668', '#99a']).map(c => new THREE.Color(c));
  const atm = new THREE.Color(def.atmosfera || '#b59bff');
  const center = V(...(def.posicion || [i * 9000, 0, -9000 * (i + 1)]));
  const group = new THREE.Group(); group.position.copy(center);
  const tilt = new THREE.Group(); tilt.rotation.z = (seed % 1 - .5) * .5 + (def.tipo === 'gas' ? .25 : 0); group.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);
  const segs = quality === 'baja' ? 96 : 192;
  const type = TIPOS[def.tipo] ?? 1;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_WORLD, fragmentShader: FS_PLANET, uniforms: {
    uSun: { value: SUN_POS }, uC1: { value: cols[0] }, uC2: { value: cols[1] }, uC3: { value: cols[2] }, uC4: { value: cols[3] }, uAtm: { value: atm },
    uCenter: { value: center }, uType: { value: type }, uSeed: { value: seed % 37 }, uTime: { value: 0 }, uR: { value: R }, uDetail: { value: quality === 'baja' ? 0 : 1 } } });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, segs, segs / 2), mat); spin.add(mesh);
  let clouds = null;
  if (type <= 2) {
    const cm = new THREE.ShaderMaterial({ vertexShader: VS_WORLD, fragmentShader: FS_CLOUDS, transparent: true, depthWrite: false,
      uniforms: { uSun: { value: SUN_POS }, uCenter: { value: center }, uTime: { value: 0 }, uSeed: { value: seed % 11 }, uCov: { value: type === 2 ? -.12 : 0 }, uFade: { value: 1 } } });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, segs, segs / 2), cm); tilt.add(clouds);
  }
  const am = new THREE.ShaderMaterial({ vertexShader: VS_ATM, fragmentShader: FS_ATM, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAtm: { value: atm }, uSun: { value: SUN_POS }, uCenter: { value: center }, uInside: { value: 0 }, uPow: { value: type === 4 ? 3 : 2.2 }, uR: { value: R * .985 }, uRs: { value: R * (type === 4 ? 1.06 : 1.13) } } });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * (type === 4 ? 1.06 : 1.13), 96, 48), am); group.add(atmo);
  let ring = null;
  if (def.anillos) {
    const rIn = R * 1.45, rOut = R * 2.5;
    const rm = new THREE.ShaderMaterial({ vertexShader: VS_WORLD, fragmentShader: FS_RING, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uSun: { value: SUN_POS }, uCenter: { value: center }, uC1: { value: cols[0] }, uC2: { value: cols[2] }, uR: { value: R }, uIn: { value: rIn }, uOut: { value: rOut } } });
    ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 256, 4), rm); ring.rotation.x = Math.PI / 2 - .12; tilt.add(ring);
  }

  // Lugar de aterrizaje: en la cara iluminada, algo por encima del ecuador
  const toSun = SUN_POS.clone().sub(center).normalize();
  const siteW = toSun.clone().add(V(-.45, .35, .55)).normalize();
  group.updateMatrixWorld(true);
  const siteL = spin.worldToLocal(center.clone().add(siteW)).normalize();
  const museum = buildMuseum(def, atm, R, type);
  museum.position.copy(siteL).multiplyScalar(R * (type === 4 ? 1.0 : 1));
  museum.quaternion.setFromUnitVectors(V(0, 1, 0), siteL);
  spin.add(museum);
  return { def, R, center, group, spin, mesh, mat, clouds, atmo, ring, siteL, museum, type, rotSpeed: (type === 4 ? .006 : .0035) * (seed % 2 > 1 ? 1 : -1), spinOn: true };
}

function buildMuseum(def, atm, R, type) {
  const m = new THREE.Group();
  const accent = new THREE.Color(def.atmosfera || '#b59bff');
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2148, metalness: .7, roughness: .35 });
  const light = new THREE.MeshStandardMaterial({ color: 0x0b0718, emissive: accent, emissiveIntensity: 3 });
  const cy = new THREE.MeshBasicMaterial({ color: new THREE.Color(.6, 2.2, 3) });
  if (type === 4) {
    // estación flotante en las nubes del gigante gaseoso
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(18, 12, 4, 48), metal); disk.position.y = 10; m.add(disk);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(3, 1.5, 20, 16), metal); stem.position.y = -2; m.add(stem);
    m.userData.padH = 12.2;
  } else {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(15, 16.5, 2.4, 48), metal); pad.position.y = -.6; m.add(pad);
    m.userData.padH = .62;
  }
  const h = m.userData.padH;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(13.2, .22, 8, 64), light); ring.rotation.x = Math.PI / 2; ring.position.y = h + .02; m.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(6, .12, 8, 48), light); ring2.rotation.x = Math.PI / 2; ring2.position.y = h + .02; m.add(ring2);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), cy); b.position.set(Math.cos(a) * 14.8, h + .15, Math.sin(a) * 14.8); m.add(b); }
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x1a1236, metalness: .9, roughness: .12, emissive: accent, emissiveIntensity: .35, transparent: true, opacity: .92 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.position.set(30, h - 1.6, -6); m.add(dome);
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(10.05, .3, 8, 64), light); domeRing.rotation.x = Math.PI / 2; domeRing.position.set(30, h - .4, -6); m.add(domeRing);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, .5, 3), metal); bridge.position.set(18.5, h - .3, -3); bridge.rotation.y = .3; m.add(bridge);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.45, .8, 24, 10), new THREE.MeshStandardMaterial({ color: 0x8a7cc4, metalness: .6, roughness: .35 })); tower.position.set(44, h + 11, -16); m.add(tower);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.9, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 5) })); beacon.position.set(44, h + 23.5, -16); m.add(beacon);
  const sign = textSprite(['MUSEO · ' + (def.tema || '').toUpperCase(), def.museo || def.nombre], '#' + accent.getHexString());
  sign.scale.set(26, 8.1, 1); sign.position.set(30, h + 16, -6); m.add(sign);
  // pilar de luz visible desde órbita
  const beamH = R * .9;
  const beamMat = new THREE.ShaderMaterial({ vertexShader: VS_SIMPLE, fragmentShader: FS_BEAM, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: accent }, uTime: { value: 0 }, uFade: { value: 1 } } });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, beamH, 24, 1, true), beamMat); beam.position.set(30, h + beamH / 2, -6); m.add(beam);
  const lamp = new THREE.PointLight(accent, 600, 120, 2); lamp.position.set(0, h + 10, 0); m.add(lamp);
  m.userData.beacon = beacon; m.userData.beamMat = beamMat;
  return m;
}

/* ---------------------------------------------------------------------
   HUD (DOM superpuesto, estilos con prefijo .vl-)
   --------------------------------------------------------------------- */
const CSS = `
.vl-root{position:absolute;inset:0;pointer-events:none;font-family:"Exo 2",system-ui,sans-serif;color:#e9e2ff;overflow:hidden;z-index:6;user-select:none;-webkit-user-select:none}
.vl-root.vl-fixed{position:fixed}
.vl-root *{box-sizing:border-box}
.vl-panel{background:rgba(16,10,34,.62);border:1px solid rgba(170,140,255,.28);border-radius:10px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.vl-eb{font:600 10px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:#a99cd6}
.vl-mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.vl-tl{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:max(16px,env(safe-area-inset-left,0px));padding:10px 14px;min-width:200px}
.vl-tl .vl-nm{font:700 16px "Orbitron","Exo 2",sans-serif;letter-spacing:.06em;margin-top:3px}
.vl-tl .vl-st{font:400 12px "JetBrains Mono",monospace;color:#a99cd6;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
.vl-tl .vl-st b{color:#e9e2ff;font-weight:600}
.vl-tr{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:max(16px,env(safe-area-inset-right,0px));padding:10px 14px;width:250px;max-width:calc(50vw - 24px)}
.vl-tr .vl-tn{font:700 18px "Orbitron","Exo 2",sans-serif;letter-spacing:.04em;margin:3px 0 2px}
.vl-tr .vl-tt{font:400 13px "Exo 2",sans-serif;color:#cbbff0}
.vl-tr .vl-row{display:flex;justify-content:space-between;font:400 12px "JetBrains Mono",monospace;color:#a99cd6;margin-top:6px}
.vl-tr .vl-row b{color:#e9e2ff;font-weight:600}
.vl-bc{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:18px;align-items:flex-end;padding:10px 18px}
.vl-spd{text-align:center;min-width:120px}
.vl-spd .vl-big{font:700 30px "Orbitron",sans-serif;letter-spacing:.02em;line-height:1;font-variant-numeric:tabular-nums}
.vl-spd .vl-u{font:500 10px "JetBrains Mono",monospace;color:#a99cd6;letter-spacing:.18em}
.vl-bar{width:120px}
.vl-bar .vl-track{height:6px;border-radius:3px;background:rgba(170,140,255,.18);overflow:hidden;margin-top:6px}
.vl-bar .vl-fill{height:100%;width:50%;background:linear-gradient(90deg,#8f6bff,#7fd6ff);border-radius:3px;transition:background .3s}
.vl-radar{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));padding:8px}
.vl-radar canvas{display:block;width:150px;height:150px}
.vl-help{position:absolute;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));padding:9px 12px;font:400 11px "JetBrains Mono",monospace;color:#a99cd6;line-height:1.75;letter-spacing:.02em}
.vl-help b{color:#e9e2ff;font-weight:600;display:inline-block;min-width:58px}
.vl-cross{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border:1.5px solid rgba(233,226,255,.55);border-radius:50%}
.vl-cross:after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#e9e2ff;box-shadow:0 0 8px #b59bff}
.vl-stick{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:1.5px solid #7fd6ff;border-radius:50%;box-shadow:0 0 8px #7fd6ff}
.vl-stickline{position:absolute;left:50%;top:50%;height:1.5px;background:linear-gradient(90deg,rgba(127,214,255,.0),rgba(127,214,255,.5));transform-origin:0 50%}
.vl-mk{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:500 11px "JetBrains Mono",monospace;color:#cbbff0;white-space:nowrap;text-align:center;will-change:transform}
.vl-mk .vl-d{width:9px;height:9px;border:1.5px solid currentColor;transform:rotate(45deg);margin:0 auto 4px;opacity:.85}
.vl-mk .vl-n{opacity:.75}
.vl-mk.vl-on{color:#fff}
.vl-mk.vl-on .vl-n{opacity:1;font-weight:600}
.vl-br{position:absolute;left:0;top:0;border:1.5px solid #b59bff;border-radius:8px;box-shadow:0 0 14px rgba(181,155,255,.45),inset 0 0 14px rgba(181,155,255,.18);transform:translate(-50%,-50%);display:none}
.vl-arrow{position:absolute;left:0;top:0;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid #b59bff;filter:drop-shadow(0 0 6px #b59bff);display:none}
.vl-prompts{position:absolute;left:50%;bottom:calc(112px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}
.vl-btn{pointer-events:auto;cursor:pointer;padding:9px 16px;background:rgba(16,10,34,.72);border:1px solid #b59bff;border-radius:999px;color:#e9e2ff;font:600 13px "JetBrains Mono",monospace;letter-spacing:.04em;white-space:nowrap;backdrop-filter:blur(6px);transition:background .2s,transform .2s}
.vl-btn:hover{background:rgba(70,48,140,.75);transform:translateY(-1px)}
.vl-btn:focus-visible{outline:2px solid #7fd6ff;outline-offset:2px}
.vl-btn kbd{display:inline-block;border:1px solid #b59bff;border-radius:4px;padding:0 6px;margin-right:8px;color:#7fd6ff;font:inherit}
.vl-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);font:600 13px "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#e9e2ff;text-shadow:0 0 12px #b59bff;opacity:0;transition:opacity .4s;text-align:center;max-width:calc(100vw - 32px)}
.vl-toast.vl-show{opacity:1}
.vl-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(240,230,255,.95),rgba(150,110,255,.5) 40%,rgba(20,10,40,0) 75%);opacity:0;transition:opacity .5s}
.vl-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(5,2,14,.55) 100%)}
.vl-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px));padding:22px 24px;pointer-events:auto;text-align:left;display:none}
.vl-card h2{font:700 24px "Orbitron",sans-serif;letter-spacing:.04em;margin:6px 0 4px;text-wrap:balance}
.vl-card .vl-sub{font:600 13px "JetBrains Mono",monospace;color:#7fd6ff;letter-spacing:.06em}
.vl-card p{font:400 15px/1.55 "Exo 2",sans-serif;color:#cbbff0;margin:12px 0 18px;text-wrap:pretty}
.vl-card .vl-btns{display:flex;gap:10px;flex-wrap:wrap}
.vl-card .vl-btn.vl-pri{background:rgba(120,90,230,.55)}
.vl-pause{position:absolute;inset:0;display:none;place-items:center;background:rgba(7,5,15,.55);pointer-events:auto}
.vl-pause .vl-card{display:block;position:static;transform:none;text-align:center}
.vl-pause .vl-btns{justify-content:center}
.vl-cine{position:absolute;left:0;right:0;height:0;background:#000;transition:height .8s ease}
.vl-cine.vl-t{top:0}.vl-cine.vl-b{bottom:0}
.vl-root.vl-cinema .vl-cine{height:9vh}
.vl-root.vl-cinema .vl-hide-cine{opacity:0}
.vl-hide-cine{transition:opacity .6s}
.vl-touch{position:absolute;inset:0;pointer-events:none;display:none}
.vl-touch .vl-tb{position:absolute;pointer-events:auto;width:68px;height:68px;border-radius:50%;display:grid;place-items:center;font:600 11px "JetBrains Mono",monospace;letter-spacing:.06em;background:rgba(16,10,34,.6);border:1px solid rgba(170,140,255,.5);color:#e9e2ff;touch-action:none}
.vl-touch .vl-tb.vl-act{background:rgba(120,90,230,.6)}
@media (max-width:720px){.vl-help{display:none}.vl-radar canvas{width:110px;height:110px}.vl-tr{width:190px}.vl-tl{min-width:0}.vl-bc{gap:12px;padding:8px 12px}.vl-bar{width:84px}}
@media (prefers-reduced-motion:reduce){.vl-flash,.vl-toast,.vl-cine{transition:none}}
`;

function buildHUD(parent, fixed) {
  if (!document.getElementById('vl-css')) { const s = document.createElement('style'); s.id = 'vl-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'vl-root' + (fixed ? ' vl-fixed' : '');
  root.innerHTML = `
  <div class="vl-vig"></div>
  <div class="vl-marks"></div>
  <div class="vl-br"></div><div class="vl-arrow"></div>
  <div class="vl-stickline vl-hide-cine"></div><div class="vl-cross vl-hide-cine"></div><div class="vl-stick vl-hide-cine"></div>
  <div class="vl-tl vl-panel vl-hide-cine"><div class="vl-eb">La Malkevnia</div><div class="vl-nm">Vuelo libre</div>
    <div class="vl-st"><span>Asist. <b data-k="asist">ON</b></span><span>Cámara <b data-k="cam">exterior</b></span><span>Sonido <b data-k="snd">sí</b></span></div></div>
  <div class="vl-tr vl-panel vl-hide-cine"><div class="vl-eb">Objetivo</div><div class="vl-tn" data-k="tn">—</div><div class="vl-tt" data-k="tt"></div>
    <div class="vl-row"><span>Distancia</span><b data-k="td">—</b></div><div class="vl-row"><span>Llegada</span><b data-k="te">—</b></div></div>
  <div class="vl-bc vl-panel vl-hide-cine">
    <div class="vl-bar"><div class="vl-eb">Empuje</div><div class="vl-track"><div class="vl-fill" data-k="thr"></div></div></div>
    <div class="vl-spd"><div class="vl-big" data-k="spd">0</div><div class="vl-u">KM/S</div></div>
    <div class="vl-bar"><div class="vl-eb">Turbo</div><div class="vl-track"><div class="vl-fill" data-k="nrg"></div></div></div></div>
  <div class="vl-radar vl-panel vl-hide-cine"><div class="vl-eb" style="margin:0 2px 6px">Radar</div><canvas width="300" height="300"></canvas></div>
  <div class="vl-help vl-panel vl-hide-cine">
    <div><b>Ratón</b>dirigir la nave</div><div><b>W / S</b>acelerar · frenar</div><div><b>A / D</b>desplazar · <b style="min-width:0">Q / E</b> girar</div>
    <div><b>Mayús</b>turbo · <b style="min-width:0">Espacio</b> freno</div><div><b>Tab</b>cambiar objetivo · <b style="min-width:0">J</b> salto</div>
    <div><b>L</b>aterrizar · <b style="min-width:0">C</b> cámara · <b style="min-width:0">X</b> asistencia</div><div><b>H</b>ocultar ayuda · <b style="min-width:0">Esc</b> pausa</div></div>
  <div class="vl-prompts"></div>
  <div class="vl-toast"></div>
  <div class="vl-cine vl-t"></div><div class="vl-cine vl-b"></div>
  <div class="vl-card vl-panel" data-k="land"><div class="vl-eb">Aterrizaje completado</div><h2 data-k="ln"></h2><div class="vl-sub" data-k="lm"></div><p data-k="ld"></p>
    <div class="vl-btns"><button class="vl-btn vl-pri" data-a="visit">Entrar al museo</button><button class="vl-btn" data-a="takeoff"><kbd>L</kbd>Despegar</button></div></div>
  <div class="vl-pause"><div class="vl-card vl-panel"><div class="vl-eb">Pausa</div><h2>Motores al ralentí</h2><p>La Malkevnia flota a la deriva, tranquila. Tómate tu tiempo.</p>
    <div class="vl-btns"><button class="vl-btn vl-pri" data-a="resume">Continuar</button><button class="vl-btn" data-a="exit" hidden>Volver a la nave</button></div></div></div>
  <div class="vl-flash"></div>
  <div class="vl-touch"><div class="vl-tb" data-t="thrust" style="right:24px;bottom:120px">EMPUJE</div><div class="vl-tb" data-t="boost" style="right:104px;bottom:150px">TURBO</div><div class="vl-tb" data-t="brake" style="right:110px;bottom:68px">FRENO</div></div>`;
  parent.appendChild(root);
  const q = s => root.querySelector(s);
  const k = {}; root.querySelectorAll('[data-k]').forEach(n => k[n.dataset.k] = n);
  return { root, k, q, marks: q('.vl-marks'), br: q('.vl-br'), arrow: q('.vl-arrow'), stick: q('.vl-stick'), stickLine: q('.vl-stickline'), prompts: q('.vl-prompts'),
    toast: q('.vl-toast'), flash: q('.vl-flash'), radar: q('.vl-radar canvas'), help: q('.vl-help'), pause: q('.vl-pause'), touch: q('.vl-touch') };
}

/* ---------------------------------------------------------------------
   Sonido (WebAudio, sin ficheros)
   --------------------------------------------------------------------- */
function buildAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ac = new AC(); const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
  const len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0); let l = 0;
  for (let i = 0; i < len; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; ch[i] = l * 3.5; }
  const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300; const ng = ac.createGain(); ng.gain.value = .5;
  noise.connect(nf).connect(ng).connect(out); noise.start();
  const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 42; const of = ac.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 160;
  const og = ac.createGain(); og.gain.value = .05; osc.connect(of).connect(og).connect(out); osc.start();
  const pad = ac.createOscillator(); pad.type = 'sine'; pad.frequency.value = 55; const pg = ac.createGain(); pg.gain.value = .04; pad.connect(pg).connect(out); pad.start();
  const pad2 = ac.createOscillator(); pad2.type = 'sine'; pad2.frequency.value = 82.4; const pg2 = ac.createGain(); pg2.gain.value = .02; pad2.connect(pg2).connect(out); pad2.start();
  const A = { ac, out, on: true, master: .55,
    set(thr, speed01, boost, warp) { const t = ac.currentTime;
      nf.frequency.setTargetAtTime(220 + speed01 * 500 + boost * 900 + warp * 2400, t, .15); ng.gain.setTargetAtTime(.35 + thr * .4 + boost * .4 + warp * .6, t, .15);
      osc.frequency.setTargetAtTime(38 + thr * 16 + boost * 20 + warp * 60, t, .2); og.gain.setTargetAtTime(.03 + thr * .05 + boost * .05, t, .2);
      out.gain.setTargetAtTime(this.on ? this.master : 0, t, .3); },
    thump() { const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .5);
      g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .6); o.connect(g).connect(out); o.start(t); o.stop(t + .7); },
    chime() { const t = ac.currentTime; [523.25, 659.25, 783.99].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * .09); g.gain.linearRampToValueAtTime(.08, t + i * .09 + .02); g.gain.exponentialRampToValueAtTime(.001, t + i * .09 + 1.2); o.connect(g).connect(out); o.start(t + i * .09); o.stop(t + i * .09 + 1.3); }); },
    dispose() { try { ac.close(); } catch { } } };
  return A;
}

/* ---------------------------------------------------------------------
   init
   --------------------------------------------------------------------- */
export function init(canvasOrOpts, maybeOpts = {}) {
  let canvas = canvasOrOpts, opts = maybeOpts;
  if (canvasOrOpts && !(canvasOrOpts instanceof HTMLCanvasElement)) { opts = canvasOrOpts; canvas = opts.canvas; }
  if (!canvas) throw new Error('vuelo-libre: hace falta un <canvas>');
  const quality = opts.calidad || (matchMedia('(pointer:coarse)').matches ? 'media' : 'alta');
  const planetDefs = (opts.planets && opts.planets.length) ? opts.planets : PLANETAS_POR_DEFECTO;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- render --- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'baja', logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, quality === 'alta' ? 1.75 : 1.25);
  renderer.setPixelRatio(PR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, .25, 4e6);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .7, .5, .78);
  if (quality !== 'baja') composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* --- cielo: nebulosa + estrellas (siguen a la cámara) --- */
  const sky = new THREE.Group(); scene.add(sky);
  const neb = new THREE.Mesh(new THREE.SphereGeometry(1.6e6, 64, 32), new THREE.ShaderMaterial({ vertexShader: VS_DIR, fragmentShader: FS_NEBULA, side: THREE.BackSide, depthWrite: false }));
  neb.renderOrder = -10; sky.add(neb);
  const NS = quality === 'baja' ? 5000 : 11000, sp = new Float32Array(NS * 3), ss = new Float32Array(NS), sc = new Float32Array(NS * 3), sph = new Float32Array(NS);
  const bandN = V(.35, 1, .15).normalize(); const tmp = V();
  const starCols = [[.75, .8, 1], [1, .95, .9], [1, .85, .7], [.85, .75, 1], [.7, .9, 1]];
  for (let i = 0; i < NS; i++) {
    tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    if (i < NS * .45) { tmp.addScaledVector(bandN, -tmp.dot(bandN) * (.85 + Math.random() * .15)).normalize(); }
    tmp.multiplyScalar(1.4e6); sp.set([tmp.x, tmp.y, tmp.z], i * 3);
    const r = Math.random(); ss[i] = r < .9 ? 1 + Math.random() * 1.6 : 2.6 + Math.random() * 2.8;
    const c = starCols[(Math.random() * starCols.length) | 0], b = .5 + Math.random() * .7; sc.set([c[0] * b, c[1] * b, c[2] * b], i * 3); sph[i] = Math.random();
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  sg.setAttribute('aColor', new THREE.BufferAttribute(sc, 3)); sg.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({ vertexShader: VS_STARS, fragmentShader: FS_STARS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPR: { value: PR }, uTime: { value: 0 } } });
  const stars = new THREE.Points(sg, starMat); stars.renderOrder = -9; stars.frustumCulled = false; sky.add(stars);

  /* --- sol --- */
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 32), new THREE.ShaderMaterial({ vertexShader: VS_SIMPLE, fragmentShader: FS_SUN, uniforms: { uTime: { value: 0 } } }));
  sun.position.copy(SUN_POS); scene.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,214,170,1)', 'rgba(255,140,90,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunGlow.scale.setScalar(SUN_R * 9); sunGlow.position.copy(SUN_POS); scene.add(sunGlow);
  const sunLight = new THREE.DirectionalLight(0xfff1e0, 2.6); scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(0x9c88e8, 0x1c1236, 1.1));

  // mapa de entorno para los metales de la nave, a partir de la nebulosa
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ vertexShader: VS_DIR, fragmentShader: FS_NEBULA.replace('gl_FragColor=vec4(col*.55,1.);', 'gl_FragColor=vec4(col*2.2+vec3(.05,.04,.09),1.);'), side: THREE.BackSide })));
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 10) })); envSun.position.copy(SUN_POS).normalize().multiplyScalar(80); envScene.add(envSun);
  const envRT = pmrem.fromScene(envScene, .02); scene.environment = envRT.texture;

  /* --- planetas --- */
  const planets = planetDefs.map((d, i) => buildPlanet(d, i, quality));
  planets.forEach(p => scene.add(p.group));

  /* --- nave --- */
  const S = buildShip();
  const ship = new THREE.Group(); const shipVis = new THREE.Group(); shipVis.add(S.group); ship.add(shipVis); scene.add(ship);
  const engineLight = new THREE.PointLight(0x9c7bff, 40, 30, 2); engineLight.position.set(0, 0, 5); ship.add(engineLight);

  /* --- túnel de salto --- */
  const tunnelMat = new THREE.ShaderMaterial({ vertexShader: VS_SIMPLE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uTime: { value: 0 }, uI: { value: 0 } },
    fragmentShader: `#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime,uI; varying vec2 vUv;
float h(float n){return fract(sin(n)*43758.5453);}
void main(){
#include <logdepthbuf_fragment>
  float col=floor(vUv.x*180.); float r=h(col); float sp=.6+r*1.4;
  float y=fract(vUv.y*(2.+r*3.)+uTime*sp*1.6+r*7.); float streak=smoothstep(.0,.05,y)*smoothstep(.55,.05,y);
  float lane=step(.55,r)*smoothstep(.5,.2,abs(fract(vUv.x*180.)-.5));
  float fade=smoothstep(0.,.25,vUv.y)*smoothstep(1.,.6,vUv.y);
  vec3 c=mix(vec3(.55,.35,1.),vec3(.6,.9,1.),h(col+3.));
  float a=streak*lane*fade*uI; gl_FragColor=vec4(c*a*2.4,a);
}` });
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(55, 30, 2600, 64, 1, true).rotateX(Math.PI / 2), tunnelMat);
  tunnel.position.z = -900; tunnel.visible = false; tunnel.frustumCulled = false; tunnel.renderOrder = 4; ship.add(tunnel);

  /* --- polvo espacial (sensación de velocidad) --- */
  const DUST = quality === 'baja' ? 260 : 520, BOX = 700;
  const dustOff = new Float32Array(DUST * 3); for (let i = 0; i < DUST * 3; i++) dustOff[i] = Math.random() * BOX;
  const dustPos = new Float32Array(DUST * 6), dustCol = new Float32Array(DUST * 6);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage)); dg.setAttribute('color', new THREE.BufferAttribute(dustCol, 3).setUsage(THREE.DynamicDrawUsage));
  const dustMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false });
  const dust = new THREE.LineSegments(dg, dustMat); dust.frustumCulled = false; scene.add(dust);

  /* --- estela de partículas --- */
  const TR = 420, trPos = new Float32Array(TR * 3), trVel = new Float32Array(TR * 3), trLife = new Float32Array(TR), trSize = new Float32Array(TR); let trHead = 0;
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('aLife', new THREE.BufferAttribute(trLife, 1).setUsage(THREE.DynamicDrawUsage));
  const trMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPR: { value: PR }, uScale: { value: 1 } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aLife; uniform float uPR,uScale; varying float vL; void main(){ vL=aLife; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(uScale*uPR*(3.5*aLife+1.)*(24./-mv.z),0.,18.);
#include <logdepthbuf_vertex>
}`,
    fragmentShader: `#include <common>
#include <logdepthbuf_pars_fragment>
varying float vL; void main(){
#include <logdepthbuf_fragment>
float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d)*vL*vL*.45; gl_FragColor=vec4(mix(vec3(.45,.25,1.),vec3(.7,.9,1.),vL)*a*1.2,a);}` });
  const trail = new THREE.Points(tg, trMat); trail.frustumCulled = false; scene.add(trail);

  /* --- estado --- */
  const st = {
    state: 'vuelo', running: false, paused: false, time: 0,
    vel: V(), ang: V(), stick: new THREE.Vector2(), mouse: new THREE.Vector2(), mouseIn: false,
    thr: 0, boost: 0, energy: 1, energyWait: 0, assist: true, cam: 'tercera', target: 0, help: true, hud: opts.hud !== false,
    shake: 0, fovKick: 0, warpVis: 0, cinema: false,
    seq: null, landed: null, warn: 0, lastNear: null,
  };
  // posición inicial: frente al primer planeta
  const p0 = planets[0];
  const startDir = V(.25, .18, 1).normalize();
  ship.position.copy(p0.center).addScaledVector(startDir, p0.R * 4.6);
  ship.lookAt(p0.center); ship.rotateY(Math.PI); // lookAt de Object3D mira con +Z; la nave apunta a -Z
  if (opts.startPosition) ship.position.fromArray(opts.startPosition);
  st.vel.set(0, 0, -40).applyQuaternion(ship.quaternion);
  const camRel = V(0, 3, 13).applyQuaternion(ship.quaternion);
  camera.position.copy(ship.position).add(camRel); camera.quaternion.copy(ship.quaternion);

  /* --- HUD --- */
  const parent = canvas.parentElement || document.body;
  const fixedHUD = parent === document.body;
  if (!fixedHUD && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const H = buildHUD(parent, fixedHUD);
  if (!st.hud) H.root.style.display = 'none';
  if (typeof opts.onExit === 'function') H.q('[data-a="exit"]').hidden = false;
  const isTouch = matchMedia('(pointer:coarse)').matches;
  if (isTouch) { H.touch.style.display = 'block'; H.help.style.display = 'none'; }
  const markEls = planets.map(p => { const d = document.createElement('div'); d.className = 'vl-mk'; d.innerHTML = `<div class="vl-d"></div><div class="vl-n">${p.def.nombre}</div><div class="vl-n vl-dd"></div>`; H.marks.appendChild(d); return { el: d, dd: d.querySelector('.vl-dd'), last: '' }; });
  const rg = H.radar.getContext('2d');
  let toastT = 0;
  function toast(msg, secs = 2.6) { H.toast.textContent = msg; H.toast.classList.add('vl-show'); toastT = secs; }
  function flash(o = 1) { H.flash.style.transition = 'none'; H.flash.style.opacity = o; requestAnimationFrame(() => { H.flash.style.transition = 'opacity 1.2s'; H.flash.style.opacity = 0; }); }
  function setCinema(on) { st.cinema = on; H.root.classList.toggle('vl-cinema', on); }
  const setK = (k, v) => { if (H.k[k] && H.k[k].textContent !== v) H.k[k].textContent = v; };

  /* --- audio --- */
  let audio = null;
  function ensureAudio() { if (audio || opts.sonido === false) return; try { audio = buildAudio(); } catch { audio = null; } }

  /* --- entrada --- */
  const keys = {};
  const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const down = e.type === 'keydown';
    if (!st.running) return;
    if (prevent.has(e.code)) e.preventDefault();
    keys[e.code] = down;
    if (!down || e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!st.paused); return; }
    if (st.paused) return;
    switch (e.code) {
      case 'KeyC': st.cam = st.cam === 'tercera' ? 'cabina' : 'tercera'; toast(st.cam === 'tercera' ? 'Cámara exterior' : 'Vista de cabina', 1.4); break;
      case 'KeyX': st.assist = !st.assist; toast(st.assist ? 'Asistencia de vuelo activada' : 'Asistencia desactivada · vuelo newtoniano', 2); break;
      case 'Tab': cycleTarget(e.shiftKey ? -1 : 1); break;
      case 'KeyT': targetCenter(); break;
      case 'KeyJ': startWarp(); break;
      case 'KeyL': if (st.state === 'aterrizado') api.takeoff(); else api.landOn(); break;
      case 'KeyH': st.help = !st.help; H.help.style.display = st.help && !isTouch ? '' : 'none'; break;
      case 'KeyM': ensureAudio(); if (audio) { audio.on = !audio.on; audio.ac.resume(); } break;
      case 'Enter': if (st.state === 'aterrizado') visit(); break;
    }
  }
  const onBlur = () => { for (const k in keys) keys[k] = false; };
  function onMove(e) {
    const r = canvas.getBoundingClientRect(); const s = Math.min(r.width, r.height) * .36;
    st.mouse.set((e.clientX - r.left - r.width / 2) / s, (e.clientY - r.top - r.height / 2) / s); st.mouseIn = true;
  }
  const onLeave = () => { st.mouseIn = false; };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onMove); document.addEventListener('mouseleave', onLeave);

  // táctil: arrastrar en la mitad izquierda = dirigir; botones a la derecha
  const touch = { id: null, ox: 0, oy: 0, thrust: false, boost: false, brake: false };
  function onTouchStart(e) { for (const t of e.changedTouches) { if (t.clientX < innerWidth * .55 && touch.id === null) { touch.id = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY; } } }
  function onTouchMove(e) { for (const t of e.changedTouches) if (t.identifier === touch.id) { const s = Math.min(innerWidth, innerHeight) * .22; st.mouse.set((t.clientX - touch.ox) / s, (t.clientY - touch.oy) / s); st.mouseIn = true; e.preventDefault(); } }
  function onTouchEnd(e) { for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.id = null; st.mouse.set(0, 0); } }
  canvas.addEventListener('touchstart', onTouchStart, { passive: true }); canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd); canvas.addEventListener('touchcancel', onTouchEnd);
  H.touch.querySelectorAll('[data-t]').forEach(b => {
    const k = b.dataset.t;
    const on = e => { e.preventDefault(); touch[k] = true; b.classList.add('vl-act'); };
    const off = () => { touch[k] = false; b.classList.remove('vl-act'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
  H.root.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'resume') setPaused(false);
    else if (a === 'exit') { setPaused(false); opts.onExit?.(); }
    else if (a === 'visit') visit();
    else if (a === 'takeoff') api.takeoff();
    else if (a === 'land') api.landOn();
    else if (a === 'warp') startWarp();
  });

  function setPaused(p) { st.paused = p; H.pause.style.display = p ? 'grid' : 'none'; if (p) onBlur(); if (p) H.q('[data-a="resume"]').focus(); }

  /* --- objetivos --- */
  function cycleTarget(d) { st.target = (st.target + d + planets.length) % planets.length; toast('Objetivo: ' + planets[st.target].def.nombre, 1.6); }
  function targetCenter() {
    const f = V(0, 0, -1).applyQuaternion(camera.quaternion); let best = -1, bi = st.target;
    planets.forEach((p, i) => { const d = p.center.clone().sub(camera.position).normalize().dot(f); if (d > best) { best = d; bi = i; } });
    st.target = bi; toast('Objetivo: ' + planets[bi].def.nombre, 1.6);
  }
  const nearestPlanet = () => { let b = null, bd = Infinity; for (const p of planets) { const d = p.center.distanceTo(ship.position) - p.R; if (d < bd) { bd = d; b = p; } } return { p: b, alt: bd }; };
  const siteWorld = (p, out = V()) => { p.group.updateMatrixWorld(true); return out.copy(p.siteL).multiplyScalar(p.R + (p.museum.userData.padH || 0)).applyMatrix4(p.spin.matrixWorld); };
  const siteNormal = (p, out = V()) => out.copy(p.siteL).transformDirection(p.spin.matrixWorld);

  /* --- salto (warp) --- */
  function startWarp() {
    if (st.state !== 'vuelo') return;
    const p = planets[st.target]; const dist = p.center.distanceTo(ship.position);
    if (dist < p.R * 7) { toast('Demasiado cerca para saltar', 1.8); return; }
    const dir = p.center.clone().sub(ship.position).normalize();
    // evitar atravesar otros planetas: se ignora (el salto es "hiperespacial")
    const end = p.center.clone().addScaledVector(dir, -p.R * 3.4).addScaledVector(V(0, 1, 0).applyQuaternion(ship.quaternion), p.R * .6);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, p.center, V(0, 1, 0).applyQuaternion(ship.quaternion)));
    st.state = 'salto'; st.seq = { t: 0, phase: 'carga', from: ship.position.clone(), end, q0: ship.quaternion.clone(), q1, dur: clamp(dist / 9000, 2.4, 5), p };
    toast('Calculando salto a ' + p.def.nombre + '…', 2);
  }
  function stepWarp(dt) {
    const s = st.seq; s.t += dt;
    if (s.phase === 'carga') {
      const k = clamp(s.t / 1.6, 0, 1);
      ship.quaternion.slerpQuaternions(s.q0, s.q1, ease(k)); st.vel.multiplyScalar(Math.exp(-2 * dt));
      ship.position.addScaledVector(st.vel, dt); st.warpVis = -k * .35; st.shake = k * .25; st.thr = k;
      if (k >= 1) { s.phase = 'viaje'; s.t = 0; s.from.copy(ship.position); flash(.55); }
    } else if (s.phase === 'viaje') {
      const k = clamp(s.t / s.dur, 0, 1), e = ease(k);
      const prev = ship.position.clone(); ship.position.lerpVectors(s.from, s.end, e);
      st.vel.copy(ship.position).sub(prev).divideScalar(Math.max(dt, 1e-4));
      st.warpVis = Math.sin(k * Math.PI); st.shake = .35 * st.warpVis; st.thr = 1;
      if (k >= 1) { st.state = 'vuelo'; st.seq = null; st.vel.set(0, 0, -160).applyQuaternion(ship.quaternion); st.warpVis = 0; flash(.85); toast('Llegada a ' + s.p.def.nombre, 2.4); audio?.chime(); }
    }
  }

  /* --- aterrizaje --- */
  function landOn(id) {
    if (st.state !== 'vuelo') return false;
    let p = id != null ? planets.find(x => x.def.id === id) : null;
    if (!p) { const n = nearestPlanet(); p = n.p; if (n.alt > p.R * 4 && id == null) { toast('Acércate más a un planeta para aterrizar', 2); return false; } }
    st.target = planets.indexOf(p);
    p.spinOn = false; p.group.updateMatrixWorld(true);
    const S0 = siteWorld(p), n = siteNormal(p);
    const P0 = ship.position.clone();
    // dirección de llegada: tangente desde la nave hacia el sitio
    const toSite = S0.clone().sub(P0); const f = toSite.clone().addScaledVector(n, -toSite.dot(n));
    if (f.lengthSq() < 1) f.set(1, 0, 0).addScaledVector(n, -n.x); f.normalize();
    const hover = S0.clone().addScaledVector(n, 55).addScaledVector(f, -30);
    const P1 = P0.clone().addScaledVector(V(0, 0, -1).applyQuaternion(ship.quaternion), Math.min(P0.distanceTo(hover) * .3, p.R * 1.2));
    const P2 = hover.clone().addScaledVector(n, p.R * .35).addScaledVector(f, -p.R * .55);
    const dist = P0.distanceTo(hover);
    st.state = 'aterrizaje';
    st.seq = { t: 0, phase: 'aprox', p, P0, P1, P2, hover, f, n, S0, dur: clamp(dist / 260, 5, 10), q0: ship.quaternion.clone(), qEnd: null, prev: P0.clone() };
    setCinema(true); toast('Piloto automático · aproximación a ' + p.def.nombre, 2.6);
    opts.onApproach?.(p.def);
    return true;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = V(), _w = V(), _u = V();
  // orientación de la nave (morro = -Z) mirando hacia fwd con 'up' como vertical
  function lookQuat(fwd, up, out = new THREE.Quaternion()) { _m.lookAt(V(), fwd, up); return out.setFromRotationMatrix(_m); }
  function stepLanding(dt) {
    const s = st.seq; s.t += dt; const p = s.p;
    if (s.phase === 'aprox') {
      const k = clamp(s.t / s.dur, 0, 1), e = ease(k);
      const pos = bezier(s.P0, s.P1, s.P2, s.hover, e, _v);
      const prev = ship.position.clone(); ship.position.copy(pos);
      st.vel.copy(pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
      const tang = bezier(s.P0, s.P1, s.P2, s.hover, clamp(e + .02, 0, 1), _w).sub(pos);
      const radial = ship.position.clone().sub(p.center).normalize();
      const fwd = k > .9 ? s.f.clone().lerp(tang.normalize(), (1 - k) * 10).normalize() : tang.normalize();
      const up = V(0, 1, 0).applyQuaternion(ship.quaternion).lerp(radial, smooth(.2, .8, k)).normalize();
      ship.quaternion.slerp(lookQuat(fwd, up, _q), damp(3.5, dt));
      const alt = ship.position.distanceTo(p.center) - p.R;
      const heat = p.type === 4 ? smooth(p.R * .25, p.R * .05, alt) * .6 : smooth(p.R * .22, p.R * .06, alt) * smooth(.95, .7, k);
      S.heat.visible = heat > .01; S.heatMat.uniforms.uI.value = heat; st.shake = heat * .5; st.thr = .4 + heat * .4;
      if (heat > .3 && !s.heatMsg) { s.heatMsg = true; toast('Entrada atmosférica', 2); }
      if (k >= 1) { s.phase = 'descenso'; s.t = 0; s.q0 = ship.quaternion.clone(); S.gear.visible = true; toast('Desplegando tren de aterrizaje', 2); }
    } else if (s.phase === 'descenso') {
      const T = 4.2, k = clamp(s.t / T, 0, 1), e = easeOut(k);
      const S0 = siteWorld(p, _u); const n = siteNormal(p, _w);
      const rest = S0.clone().addScaledVector(n, 1.45 + 0.0);
      ship.position.lerpVectors(s.hover, rest, e);
      st.vel.set(0, 0, 0);
      ship.quaternion.slerpQuaternions(s.q0, lookQuat(s.f, n, _q), smooth(0, .6, k));
      S.gear.scale.y = clamp(k * 2.2, .01, 1); S.heat.visible = false; st.thr = .35 * (1 - k); st.shake = (1 - k) * .04;
      if (k >= 1) { s.phase = 'fin'; st.state = 'aterrizado'; st.landed = p; st.shake = .25; audio?.thump(); showLanded(p); opts.onLand?.(p.def); }
    }
  }
  function showLanded(p) {
    const c = H.k.land; setK('ln', p.def.nombre); setK('lm', (p.def.museo || 'Museo') + ' · ' + (p.def.tema || ''));
    setK('ld', p.def.descripcion || ''); c.style.display = 'block';
    setTimeout(() => c.querySelector('[data-a="visit"]').focus({ preventScroll: true }), 50);
  }
  function visit() {
    const p = st.landed; if (!p) return;
    if (typeof opts.onVisit === 'function') opts.onVisit(p.def);
    else toast('El museo de ' + (p.def.tema || p.def.nombre).toLowerCase() + ' abrirá sus puertas muy pronto', 3);
  }
  function takeoff() {
    if (st.state !== 'aterrizado') return;
    const p = st.landed; H.k.land.style.display = 'none';
    const n = siteNormal(p); const f = V(0, 0, -1).applyQuaternion(ship.quaternion);
    st.state = 'despegue'; st.seq = { t: 0, p, n, f, P0: ship.position.clone() };
    toast('Despegando de ' + p.def.nombre, 2); opts.onTakeoff?.(p.def);
  }
  function stepTakeoff(dt) {
    const s = st.seq; s.t += dt; const p = s.p;
    if (s.t < 3) {
      const k = s.t / 3, e = k * k;
      ship.position.copy(s.P0).addScaledVector(s.n, 1 + e * 60);
      S.gear.scale.y = clamp(1 - k * 2, .01, 1); st.thr = .6; st.shake = .08 * (1 - k);
      if (k > .5) S.gear.visible = false;
      st.vel.copy(s.n).multiplyScalar(40 * k);
    } else {
      const k = clamp((s.t - 3) / 4.5, 0, 1);
      const dir = s.f.clone().multiplyScalar(1).add(s.n.clone().multiplyScalar(.9)).normalize();
      const fwd = s.f.clone().lerp(dir, smooth(0, .4, k)).normalize();
      ship.quaternion.slerp(lookQuat(fwd, s.n, _q), damp(2, dt));
      const speed = 30 + k * k * 380; st.vel.copy(V(0, 0, -1).applyQuaternion(ship.quaternion)).multiplyScalar(speed);
      ship.position.addScaledVector(st.vel, dt); st.thr = .5 + k * .5; st.shake = .05;
      if (k >= 1) { st.state = 'vuelo'; st.seq = null; st.landed = null; p.spinOn = true; setCinema(false); st.thr = 0; toast('Control manual', 1.6); }
    }
  }

  /* --- vuelo manual --- */
  function stepFlight(dt) {
    // palanca virtual: el ratón respecto al centro (zona muerta suave)
    const m = st.mouseIn ? st.mouse : _v.set(0, 0, 0);
    let sx = m.x, sy = m.y; const ml = Math.hypot(sx, sy);
    if (ml > 1) { sx /= ml; sy /= ml; }
    const dz = .06, scale = ml < dz ? 0 : (Math.min(ml, 1) - dz) / (1 - dz) / Math.max(Math.min(ml, 1), 1e-5);
    st.stick.set(sx * scale, sy * scale);
    const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    const yawIn = clamp(st.stick.x + kx, -1, 1), pitchIn = clamp(st.stick.y + ky, -1, 1);
    const rollIn = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
    const tgt = _w.set(-pitchIn * 1.25, -yawIn * 1.0, rollIn * 2.2);
    st.ang.lerp(tgt, damp(3.2, dt));
    _q.setFromEuler(new THREE.Euler(st.ang.x * dt, st.ang.y * dt, st.ang.z * dt, 'XYZ')); ship.quaternion.multiply(_q).normalize();

    const fwd = V(0, 0, -1).applyQuaternion(ship.quaternion), right = V(1, 0, 0).applyQuaternion(ship.quaternion), up = V(0, 1, 0).applyQuaternion(ship.quaternion);
    const thrustF = (keys.KeyW || touch.thrust ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), vert = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
    const wantBoost = (keys.ShiftLeft || keys.ShiftRight || touch.boost) && st.energy > .02;
    st.boost += ((wantBoost ? 1 : 0) - st.boost) * damp(5, dt);
    if (wantBoost) { st.energy = Math.max(0, st.energy - dt * .2); st.energyWait = 1.2; } else if ((st.energyWait -= dt) <= 0) st.energy = Math.min(1, st.energy + dt * .13);
    const A = 150 + st.boost * 560;
    const f = wantBoost ? Math.max(thrustF, 1) : thrustF;
    st.vel.addScaledVector(fwd, f * A * dt).addScaledVector(right, strafe * 70 * dt).addScaledVector(up, vert * 70 * dt);
    if (st.assist) {
      const vf = fwd.clone().multiplyScalar(st.vel.dot(fwd)); const vl = st.vel.clone().sub(vf);
      vl.multiplyScalar(Math.exp(-(strafe || vert ? .3 : 2.2) * dt)); if (!f) vf.multiplyScalar(Math.exp(-.25 * dt));
      st.vel.copy(vf).add(vl);
    } else st.vel.multiplyScalar(Math.exp(-.01 * dt));
    if (keys.Space || touch.brake) st.vel.multiplyScalar(Math.exp(-2.4 * dt));
    const maxSp = 340 + st.boost * 1260, sp = st.vel.length();
    if (sp > maxSp) st.vel.setLength(sp + (maxSp - sp) * damp(1.6, dt));
    st.thr += ((Math.max(f, 0) * (.6 + st.boost * .4)) - st.thr) * damp(6, dt);
    ship.position.addScaledVector(st.vel, dt);
    st.warpVis += (0 - st.warpVis) * damp(4, dt);

    // colisiones suaves con planetas y el sol
    for (const p of planets) {
      const d = _u.copy(ship.position).sub(p.center); const lim = p.R * (p.type === 4 ? 1.02 : 1) + 3.5;
      const dl = d.length();
      if (dl < lim) { d.normalize(); ship.position.copy(p.center).addScaledVector(d, lim); const vn = st.vel.dot(d); if (vn < 0) st.vel.addScaledVector(d, -vn * 1.4); st.shake = Math.max(st.shake, .5); if (st.warn <= 0) { toast('¡Superficie demasiado cerca! Pulsa L para aterrizar', 2.4); st.warn = 3; } }
    }
    const ds = ship.position.distanceTo(SUN_POS);
    if (ds < SUN_R * 1.6) { const d = ship.position.clone().sub(SUN_POS).normalize(); ship.position.copy(SUN_POS).addScaledVector(d, SUN_R * 1.6); st.vel.addScaledVector(d, -Math.min(st.vel.dot(d), 0) * 1.5); if (st.warn <= 0) { toast('Escudos térmicos al límite', 2.4); st.warn = 3; } }
    st.warn -= dt;
  }

  /* --- cámara --- */
  const camQ = camera.quaternion.clone();
  function stepCamera(dt) {
    const q = ship.quaternion;
    const spd01 = clamp(st.vel.length() / 1500, 0, 1);
    let fovT = 66 + st.boost * 12 + spd01 * 6 + st.warpVis * 38;
    if (st.state === 'aterrizaje' && st.seq.phase === 'descenso' || st.state === 'aterrizado' || (st.state === 'despegue' && st.seq.t < 3)) {
      // cámara cinemática orbitando el museo
      const p = st.landed || st.seq.p; const n = siteNormal(p, _w); const S0 = siteWorld(p, _u);
      const a = st.time * .07; const t1 = st.seq?.f || V(1, 0, 0); const t2 = n.clone().cross(t1).normalize();
      const dir = t1.clone().multiplyScalar(-Math.cos(a)).addScaledVector(t2, Math.sin(a));
      const want = S0.clone().addScaledVector(n, 21).addScaledVector(dir, 44);
      camera.position.lerp(want, damp(st.state === 'aterrizado' ? 1.2 : 1.8, dt));
      // no atravesar el suelo
      const cd = camera.position.clone().sub(p.center); if (cd.length() < p.R + 4) camera.position.copy(p.center).addScaledVector(cd.normalize(), p.R + 4);
      _m.lookAt(camera.position, ship.position.clone().addScaledVector(n, 2), n); camQ.slerp(_q.setFromRotationMatrix(_m), damp(3, dt));
      fovT = 56;
      S.canopy.visible = true; S.group.visible = true;
    } else if (st.cam === 'cabina' && st.state === 'vuelo') {
      camera.position.copy(ship.position).add(V(0, .82, -1.25).applyQuaternion(q));
      camQ.copy(q).multiply(_q.setFromEuler(new THREE.Euler(0, 0, shipVis.rotation.z * .4)));
      camRel.copy(camera.position).sub(ship.position);
      S.canopy.visible = false;
    } else {
      S.canopy.visible = true;
      const cine = st.state === 'aterrizaje' || st.state === 'despegue';
      const cp = cine ? (st.landed || st.seq?.p) : null;
      if (cp) {
        // cámara de aproximación: detrás y por encima respecto a la vertical del planeta, con el horizonte a la vista
        const radial = ship.position.clone().sub(cp.center).normalize();
        const fwd = V(0, 0, -1).applyQuaternion(q); const fl = fwd.clone().addScaledVector(radial, -fwd.dot(radial)); if (fl.lengthSq() < 1e-4) fl.copy(fwd); fl.normalize();
        const want = fl.clone().multiplyScalar(-26).addScaledVector(radial, 9);
        camRel.lerp(want, damp(1.6, dt)); camera.position.copy(ship.position).add(camRel);
        const look = ship.position.clone().addScaledVector(fl, 14).addScaledVector(radial, -5);
        _m.lookAt(camera.position, look, radial); camQ.slerp(_q.setFromRotationMatrix(_m), damp(2.5, dt));
        camera.quaternion.copy(camQ); camera.fov += (60 - camera.fov) * damp(3, dt); camera.updateProjectionMatrix(); st.shake *= Math.exp(-3 * dt);
        if (st.shake > .001 && !reduceMotion) { const s = st.shake * .35; camera.position.add(V((Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s)); }
        return;
      }
      const back = cine ? 24 : 15 + st.boost * 4 + spd01 * 3, height = cine ? 6 : 3.6 + st.boost * .4;
      const want = V(-st.stick.x * 1.2, height - st.stick.y * .8, back).applyQuaternion(q);
      camRel.lerp(want, damp(cine ? 2 : 5, dt));
      camera.position.copy(ship.position).add(camRel);
      const look = ship.position.clone().addScaledVector(V(0, 0, -1).applyQuaternion(q), 28).addScaledVector(V(0, 1, 0).applyQuaternion(q), 1.2);
      _m.lookAt(camera.position, look, V(0, 1, 0).applyQuaternion(q)); camQ.slerp(_q.setFromRotationMatrix(_m), damp(cine ? 3 : 7, dt));
    }
    camera.quaternion.copy(camQ);
    if (st.shake > .001 && !reduceMotion) { const s = st.shake * .35; camera.position.add(V((Math.random() - .5) * s, (Math.random() - .5) * s, (Math.random() - .5) * s)); camera.rotateZ((Math.random() - .5) * st.shake * .01); }
    st.shake *= Math.exp(-3 * dt);
    camera.fov += (fovT - camera.fov) * damp(4, dt); camera.updateProjectionMatrix();
  }

  /* --- efectos por frame --- */
  function stepEffects(dt) {
    const t = st.time;
    sky.position.copy(camera.position);
    starMat.uniforms.uTime.value = t; sun.material.uniforms.uTime.value = t;
    const wv = Math.max(st.warpVis, 0); tunnel.visible = wv > .02; tunnelMat.uniforms.uI.value = wv; tunnelMat.uniforms.uTime.value = t;
    // nave: alabeo visual, luces
    const bankT = st.state === 'vuelo' ? clamp(st.ang.y * .55 - st.ang.z * 0, -.8, .8) : 0;
    shipVis.rotation.z += (bankT - shipVis.rotation.z) * damp(4, dt);
    shipVis.rotation.x += ((st.state === 'vuelo' ? -st.ang.x * .08 : 0) - shipVis.rotation.x) * damp(4, dt);
    shipVis.position.y = st.state === 'aterrizado' ? 0 : Math.sin(t * 1.3) * .05;
    const blink = (t % 1.4) < .12; S.nav[0].visible = S.nav[1].visible = blink || (t % 1.4 > .25 && t % 1.4 < .3); S.nav[2].visible = (t % 2) < .08;
    const pw = st.state === 'aterrizado' ? .08 : .25 + st.thr * .9 + st.boost * .9 + Math.max(st.warpVis, 0) * 1.2;
    S.flameMat.uniforms.uTime.value = t; S.flameMat.uniforms.uPower.value = clamp(pw, 0, 1.6);
    S.flames.forEach((f, i) => { f.scale.set(1, 1, .25 + pw * 1.1 + Math.sin(t * 40 + i) * .04); });
    engineLight.intensity = 8 + pw * 22;
    S.heatMat.uniforms.uTime.value = t;
    // sol
    _v.copy(SUN_POS).sub(ship.position).normalize(); sunLight.position.copy(ship.position).addScaledVector(_v, 100); sunLight.target.position.copy(ship.position);
    // planetas
    for (const p of planets) {
      const near = p.center.distanceTo(ship.position) < p.R * 5;
      if (p.spinOn && !near) p.spin.rotation.y += p.rotSpeed * dt;
      p.mat.uniforms.uTime.value = t; if (p.clouds) { p.clouds.material.uniforms.uTime.value = t; if (p.spinOn && !near) p.clouds.rotation.y += p.rotSpeed * 1.3 * dt; }
      const cd = camera.position.distanceTo(p.center); p.atmo.material.uniforms.uInside.value = smooth(p.R * 1.13, p.R * 1.02, cd);
      if (p.clouds) p.clouds.material.uniforms.uFade.value = smooth(p.R * 1.02, p.R * 1.05, cd); // bajo las nubes no taparlas
      const mu = p.museum.userData; mu.beamMat.uniforms.uTime.value = t; mu.beamMat.uniforms.uFade.value = smooth(p.R * .6, p.R * 1.6, ship.position.distanceTo(p.center) - p.R) * .9 + .1;
      mu.beacon.visible = (t + p.R) % 1.6 < .9;
    }
    // polvo espacial
    const v = st.vel, spd = v.length(); const streak = clamp(.012 + spd / 1400 * .05 + Math.max(st.warpVis, 0) * .08, 0, .2);
    const cp = camera.position, half = BOX / 2;
    const bright = clamp(.15 + spd / 600, .15, 1) * (st.state === 'aterrizado' ? 0 : 1);
    for (let i = 0; i < DUST; i++) {
      const o = i * 3;
      const x = cp.x + (((dustOff[o] - cp.x) % BOX + BOX) % BOX) - half, y = cp.y + (((dustOff[o + 1] - cp.y) % BOX + BOX) % BOX) - half, z = cp.z + (((dustOff[o + 2] - cp.z) % BOX + BOX) % BOX) - half;
      const j = i * 6; dustPos[j] = x; dustPos[j + 1] = y; dustPos[j + 2] = z;
      dustPos[j + 3] = x - v.x * streak - .3; dustPos[j + 4] = y - v.y * streak; dustPos[j + 5] = z - v.z * streak;
      const d = Math.hypot(x - cp.x, y - cp.y, z - cp.z) / half; const a = Math.max(0, 1 - d) * bright;
      dustCol[j] = .8 * a; dustCol[j + 1] = .75 * a; dustCol[j + 2] = 1 * a; dustCol[j + 3] = .35 * a * .3; dustCol[j + 4] = .25 * a * .3; dustCol[j + 5] = .7 * a * .3;
    }
    dg.attributes.position.needsUpdate = true; dg.attributes.color.needsUpdate = true;
    // estela
    const emit = st.state === 'aterrizado' ? 0 : Math.round((st.thr * 2 + st.boost * 3) * 2);
    for (let e = 0; e < emit; e++) for (const nz of S.nozzles) {
      const w = nz.clone().applyMatrix4(S.group.matrixWorld); const i = trHead; trHead = (trHead + 1) % TR;
      trPos[i * 3] = w.x; trPos[i * 3 + 1] = w.y; trPos[i * 3 + 2] = w.z;
      const back = V(0, 0, 1).applyQuaternion(ship.quaternion).multiplyScalar(18 + Math.random() * 10);
      trVel[i * 3] = v.x * .92 + back.x + (Math.random() - .5) * 3; trVel[i * 3 + 1] = v.y * .92 + back.y + (Math.random() - .5) * 3; trVel[i * 3 + 2] = v.z * .92 + back.z + (Math.random() - .5) * 3;
      trLife[i] = 1;
    }
    for (let i = 0; i < TR; i++) { if (trLife[i] <= 0) continue; trLife[i] = Math.max(0, trLife[i] - dt * 1.6); trPos[i * 3] += trVel[i * 3] * dt; trPos[i * 3 + 1] += trVel[i * 3 + 1] * dt; trPos[i * 3 + 2] += trVel[i * 3 + 2] * dt; }
    tg.attributes.position.needsUpdate = true; tg.attributes.aLife.needsUpdate = true;
    trail.visible = st.cam === 'tercera' || st.state !== 'vuelo';
    // audio
    if (audio) audio.set(st.thr, clamp(spd / 1500, 0, 1), st.boost, Math.max(st.warpVis, 0));
  }

  /* --- HUD por frame --- */
  const _p = V();
  function stepHUD(dt) {
    if (!st.hud) return;
    const r = canvas.getBoundingClientRect(), W = r.width, Hh = r.height;
    const spd = st.vel.length() * KM;
    setK('spd', spd >= 10000 ? (spd / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(spd).toLocaleString('es-ES'));
    H.k.thr.style.width = (st.thr * 100).toFixed(1) + '%';
    H.k.nrg.style.width = (st.energy * 100).toFixed(1) + '%';
    H.k.nrg.style.background = st.energy < .2 ? 'linear-gradient(90deg,#ff6a8a,#ffb36a)' : '';
    setK('asist', st.assist ? 'ON' : 'OFF'); setK('cam', st.cam === 'tercera' ? 'exterior' : 'cabina'); setK('snd', audio && audio.on ? 'sí' : 'no');
    const T = planets[st.target]; const dist = Math.max(0, T.center.distanceTo(ship.position) - T.R);
    setK('tn', T.def.nombre); setK('tt', (T.def.tema ? T.def.tema + ' · ' : '') + (T.def.museo || ''));
    setK('td', fmtDist(dist));
    const closing = st.vel.dot(_v.copy(T.center).sub(ship.position).normalize());
    setK('te', closing > 5 ? fmtTime(dist / closing) : '—');
    // stick
    const sx = st.stick.x * Math.min(W, Hh) * .36, sy = st.stick.y * Math.min(W, Hh) * .36;
    const showStick = st.state === 'vuelo' && st.cam !== 'nada';
    H.stick.style.display = H.stickLine.style.display = showStick ? '' : 'none';
    H.stick.style.transform = `translate(${sx}px,${sy}px)`;
    const sl = Math.hypot(sx, sy); H.stickLine.style.width = sl + 'px'; H.stickLine.style.transform = `rotate(${Math.atan2(sy, sx)}rad)`;
    // marcadores de planetas
    const camF = V(0, 0, -1).applyQuaternion(camera.quaternion);
    planets.forEach((p, i) => {
      const m = markEls[i]; const isT = i === st.target;
      _p.copy(p.center); const toP = _p.clone().sub(camera.position); const front = toP.dot(camF) > 0; _p.project(camera);
      const x = (_p.x * .5 + .5) * W, y = (-_p.y * .5 + .5) * Hh; const on = front && x > -40 && x < W + 40 && y > -40 && y < Hh + 40;
      const d = toP.length(); const angR = Math.atan(p.R / Math.max(d, 1)) / (camera.fov * Math.PI / 360) * Hh / 2;
      let hid = false; for (const o of planets) { if (o === p) continue; const oc = _u.copy(o.center).sub(camera.position); const tt = oc.dot(toP) / d; if (tt > 0 && tt < d && oc.lengthSq() - tt * tt < o.R * o.R) { hid = true; break; } }
      const show = on && !hid && !st.cinema && angR < Hh * .35;
      m.el.style.display = show ? '' : 'none';
      if (show) { m.el.style.transform = `translate(${x}px,${y - (angR > 14 ? angR + 34 : 0)}px) translate(-50%,-50%)`; m.el.classList.toggle('vl-on', isT); const ds = fmtDist(Math.max(0, d - p.R)); if (ds !== m.last) { m.dd.textContent = ds; m.last = ds; } }
      if (isT) {
        if (on && !st.cinema) { const s = Math.max(angR * 2 + 16, 30); H.br.style.display = 'block'; H.br.style.width = H.br.style.height = s + 'px'; H.br.style.transform = `translate(${x - s / 2}px,${y - s / 2}px)`; H.arrow.style.display = 'none'; }
        else {
          H.br.style.display = 'none';
          if (st.cinema) { H.arrow.style.display = 'none'; return; }
          // flecha en el borde hacia el objetivo
          const loc = toP.clone().applyQuaternion(camera.quaternion.clone().invert()); let ax = loc.x, ay = -loc.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
          const R = Math.min(W, Hh) * .42; const ex = W / 2 + ax * R, ey = Hh / 2 + ay * R;
          H.arrow.style.display = 'block'; H.arrow.style.transform = `translate(${ex - 10}px,${ey - 9}px) rotate(${Math.atan2(ay, ax) + Math.PI / 2}rad)`;
        }
      }
    });
    // indicaciones contextuales
    let prompts = '';
    if (st.state === 'vuelo') {
      const n = nearestPlanet();
      if (n.alt < n.p.R * 4) prompts += `<button class="vl-btn" data-a="land"><kbd>L</kbd>Aterrizar en ${n.p.def.nombre}</button>`;
      const dT = T.center.distanceTo(ship.position);
      if (dT > T.R * 7) prompts += `<button class="vl-btn" data-a="warp"><kbd>J</kbd>Salto a ${T.def.nombre}</button>`;
      if (n.p !== st.lastNear && n.alt < n.p.R * 1.6) { st.lastNear = n.p; toast('Órbita de ' + n.p.def.nombre + ' · ' + (n.p.def.tema || ''), 2.4); }
      if (n.alt > n.p.R * 3) st.lastNear = null;
    }
    if (H.prompts.dataset.h !== prompts) { H.prompts.innerHTML = prompts; H.prompts.dataset.h = prompts; }
    if (toastT > 0 && (toastT -= dt) <= 0) H.toast.classList.remove('vl-show');
    drawRadar();
  }
  let radarT = 0;
  function drawRadar() {
    if ((radarT = (radarT + 1) % 3) !== 0) return;
    const c = H.radar, g = rg, w = c.width, h = c.height, cx = w / 2, cy = h / 2, R = w / 2 - 8;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,140,255,.28)'; g.lineWidth = 2;
    for (const k of [1, .66, .33]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
    const inv = ship.quaternion.clone().invert();
    planets.forEach((p, i) => {
      const l = p.center.clone().sub(ship.position).applyQuaternion(inv); const d = l.length();
      const rr = Math.min(1, Math.log10(1 + d / 150) / Math.log10(1 + 60000 / 150)) * R;
      const hz = Math.hypot(l.x, l.z) || 1; const x = cx + l.x / hz * rr, y = cy + l.z / hz * rr;
      const col = p.def.atmosfera || '#b59bff';
      const yo = clamp(-l.y / Math.max(d, 1), -1, 1) * 14;
      g.strokeStyle = col; g.globalAlpha = .6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + yo); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col; g.beginPath(); g.arc(x, y + yo, i === st.target ? 7 : 5, 0, Math.PI * 2); g.fill();
      if (i === st.target) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + yo, 11, 0, Math.PI * 2); g.stroke(); }
    });
    g.fillStyle = '#e9e2ff'; g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx + 6, cy + 6); g.lineTo(cx - 6, cy + 6); g.closePath(); g.fill();
  }

  /* --- tamaño --- */
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  /* --- bucle --- */
  let raf = 0, last = 0;
  function update(dt) {
    dt = clamp(dt ?? 1 / 60, 0, .05);
    if (!st.paused) {
      st.time += dt;
      if (st.running) {
        if (st.state === 'vuelo') stepFlight(dt);
        else if (st.state === 'salto') stepWarp(dt);
        else if (st.state === 'aterrizaje') stepLanding(dt);
        else if (st.state === 'despegue') stepTakeoff(dt);
      } else {
        ship.position.addScaledVector(st.vel, dt);
      }
      stepCamera(dt); stepEffects(dt);
    }
    stepHUD(dt);
    composer.render();
  }
  function frame(ts) { raf = requestAnimationFrame(frame); const dt = last ? (ts - last) / 1000 : 1 / 60; last = ts; update(dt); }

  const api = {
    get state() { return st.state; },
    get ship() { return ship; }, scene, camera, renderer, planets: planets.map(p => p.def),
    start() { st.running = true; ensureAudio(); audio?.ac.resume(); if (!raf) { last = 0; raf = requestAnimationFrame(frame); } toast('Control manual · buen viaje, capitán', 2.4); return api; },
    stop() { cancelAnimationFrame(raf); raf = 0; audio?.ac.suspend?.(); return api; },
    preview() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } return api; },
    update,
    pause(p = true) { setPaused(p); },
    setTarget(id) { const i = planets.findIndex(p => p.def.id === id); if (i >= 0) st.target = i; },
    landOn(id) { return landOn(id); },
    takeoff() { takeoff(); },
    warpTo(id) { api.setTarget(id); startWarp(); },
    setSound(on) { ensureAudio(); if (audio) { audio.on = on; audio.ac.resume(); } },
    dispose() {
      api.stop(); ro.disconnect();
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onMove); document.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove); canvas.removeEventListener('touchend', onTouchEnd); canvas.removeEventListener('touchcancel', onTouchEnd);
      H.root.remove(); audio?.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); });
      envRT.dispose(); pmrem.dispose(); composer.dispose?.(); renderer.dispose();
    },
  };
  return api;
}

/* Alias para el integrador de la nave (misma firma que el módulo del universo) */
export async function createFlight({ canvas, onExit, ...rest } = {}) { return init(canvas, { onExit, ...rest }); }
export default init;
