// IZARO — gigante gaseoso anillado. Módulo procedural (Three.js r160).
export default function create(THREE, { sunDir, renderer }) {
  const R = 140;
  const RIN = R * 1.22, ROUT = R * 2.95;
  const sun = sunDir.clone().normalize();

  // ---------- utilidades CPU ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(90210);
  const LAT = new Float32Array(8192); for (let i = 0; i < LAT.length; i++) LAT[i] = rnd();
  const vn = (x) => { const i = Math.floor(x), f = x - i; const a = LAT[((i % 8192) + 8192) % 8192], b = LAT[(((i + 1) % 8192) + 8192) % 8192]; const s = f * f * (3 - 2 * f); return a + (b - a) * s; };
  const fb = (x) => vn(x) * 0.5 + vn(x * 2.31 + 11.3) * 0.25 + vn(x * 5.13 + 37.1) * 0.15 + vn(x * 11.7 + 71.9) * 0.1;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const gauss = (x, m, s) => Math.exp(-((x - m) / s) * ((x - m) / s));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const enc = (v) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, v)) * 255)));

  // ---------- paleta de bandas (latitud -> color), codificada sqrt ----------
  const PAL_N = 1024;
  const pal = new Uint8Array(PAL_N * 4);
  const C = {
    cream: [0.90, 0.72, 0.54], ivory: [0.92, 0.85, 0.76], lilac: [0.62, 0.50, 0.86], violet: [0.34, 0.19, 0.60],
    plum: [0.24, 0.09, 0.30], teal: [0.13, 0.44, 0.52], tealL: [0.42, 0.70, 0.74], rose: [0.86, 0.42, 0.56],
    roseL: [0.96, 0.72, 0.76], mauve: [0.60, 0.36, 0.58], polar: [0.20, 0.22, 0.42]
  };
  const bands = [
    [-91, -72, 'polar'], [-72, -64, 'violet'], [-64, -58, 'lilac'], [-58, -52, 'teal'], [-52, -45, 'roseL'],
    [-45, -39, 'mauve'], [-39, -30, 'cream'], [-30, -17, 'rose'], [-17, -10, 'lilac'], [-10, -6, 'teal'],
    [-6, 7, 'ivory'], [7, 11, 'tealL'], [11, 22, 'violet'], [22, 29, 'cream'], [29, 35, 'rose'],
    [35, 41, 'lilac'], [41, 46, 'teal'], [46, 53, 'roseL'], [53, 60, 'violet'], [60, 67, 'mauve'], [67, 91, 'polar']
  ];
  const sines = []; for (let k = 0; k < 14; k++) sines.push([0.3 + rnd() * 3.5, rnd() * 6.28, 0.03 + rnd() * 0.04]);
  for (let i = 0; i < PAL_N; i++) {
    const lat = ((i + 0.5) / PAL_N - 0.5) * 180;
    let col = [0, 0, 0], wsum = 0;
    for (const [a, b, name] of bands) {
      const e = 1.4;
      const w = sstep(a - e, a + e, lat) * (1 - sstep(b - e, b + e, lat));
      if (w > 0) { const c = C[name]; col[0] += c[0] * w; col[1] += c[1] * w; col[2] += c[2] * w; wsum += w; }
    }
    col = col.map(v => v / Math.max(wsum, 1e-4));
    let m = 1; for (const [f, p, a] of sines) m += a * Math.sin(lat * f + p);
    const hue = 0.04 * Math.sin(lat * 0.37 + 1.3);
    pal[i * 4] = enc(col[0] * m * (1 + hue)); pal[i * 4 + 1] = enc(col[1] * m); pal[i * 4 + 2] = enc(col[2] * m * (1 - hue)); pal[i * 4 + 3] = 255;
  }
  const palTex = new THREE.DataTexture(pal, PAL_N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  palTex.magFilter = THREE.LinearFilter; palTex.minFilter = THREE.LinearFilter; palTex.wrapS = THREE.ClampToEdgeWrapping; palTex.needsUpdate = true;

  // ---------- perfil radial de los anillos ----------
  const RING_N = 4096;
  const ringData = new Uint8Array(RING_N * 4);
  const cRinglets = []; for (let k = 0; k < 9; k++) cRinglets.push([1.25 + rnd() * 0.26, 0.0015 + rnd() * 0.004, 0.15 + rnd() * 0.3]);
  const bGaps = []; for (let k = 0; k < 14; k++) bGaps.push([1.56 + rnd() * 0.37, 0.0008 + rnd() * 0.0025, 0.3 + rnd() * 0.5]);
  function ringAt(rr) {
    let a = 0, c = [0.8, 0.8, 0.8];
    const n1 = fb(rr * 60), n2 = fb(rr * 230 + 5), n3 = vn(rr * 900 + 9);
    if (rr < 1.52) { // anillo C: polvo rosado-gris, tenue
      const t = (rr - 1.22) / 0.30;
      a = 0.05 + 0.15 * t * t + 0.10 * sstep(0.55, 0.7, n1);
      a *= 0.7 + 0.6 * n2;
      for (const [m, s, h] of cRinglets) a += h * gauss(rr, m, s);
      a *= sstep(1.22, 1.235, rr);
      c = lerp3([0.58, 0.46, 0.52], [0.74, 0.62, 0.64], t);
    } else if (rr < 1.95) { // anillo B: denso, hielo crema
      const t = (rr - 1.52) / 0.43;
      a = 0.66 + 0.30 * n1;
      a *= 0.80 + 0.20 * sstep(0.35, 0.65, n2);
      a *= 0.92 + 0.08 * n3;
      for (const [m, s, h] of bGaps) a *= 1 - h * gauss(rr, m, s);
      a = Math.min(a, 0.97);
      const ramp = sstep(1.52, 1.535, rr); a = 0.25 + (a - 0.25) * ramp;
      c = lerp3([0.93, 0.78, 0.74], [0.98, 0.95, 0.91], Math.min(1, t * 1.4));
      const br = 0.86 + 0.24 * n2; c = c.map(v => v * br);
    } else if (rr < 2.03) { // división de Cassini
      a = 0.03 + 0.06 * gauss(rr, 1.968, 0.004) + 0.05 * gauss(rr, 1.992, 0.0025) + 0.045 * gauss(rr, 2.014, 0.003) + 0.02 * n2;
      c = [0.58, 0.60, 0.74];
    } else if (rr < 2.275) { // anillo A
      const t = (rr - 2.03) / 0.245;
      a = (0.60 - 0.16 * t) * (0.82 + 0.32 * n2);
      a *= 1 - 0.96 * gauss(rr, 2.215, 0.0035);
      a *= 1 - 0.9 * gauss(rr, 2.262, 0.0015);
      a *= sstep(2.03, 2.036, rr) * (1 - sstep(2.268, 2.275, rr));
      c = lerp3([0.91, 0.87, 0.92], [0.84, 0.80, 0.93], t);
      const br = 0.9 + 0.18 * n1; c = c.map(v => v * br);
    } else { // F, G y anillo E de polvo
      const f = 0.7 * gauss(rr, 2.335, 0.0022) + 0.18 * gauss(rr, 2.338, 0.008);
      const g = 0.07 * gauss(rr, 2.45, 0.028);
      const e = 0.055 * sstep(2.5, 2.62, rr) * (1 - sstep(2.7, 2.95, rr)) * (0.55 + 0.9 * n1);
      a = f + g + e;
      const tf = f / Math.max(a, 1e-4);
      c = lerp3([0.94, 0.58, 0.72], [0.98, 0.88, 0.92], tf);
    }
    return [Math.max(0, Math.min(1, a)), c];
  }
  for (let i = 0; i < RING_N; i++) {
    const rr = (RIN + (i + 0.5) / RING_N * (ROUT - RIN)) / R;
    const [a, c] = ringAt(rr);
    ringData[i * 4] = enc(c[0]); ringData[i * 4 + 1] = enc(c[1]); ringData[i * 4 + 2] = enc(c[2]); ringData[i * 4 + 3] = Math.round(a * 255);
  }
  const ringTex = new THREE.DataTexture(ringData, RING_N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  ringTex.generateMipmaps = true; ringTex.minFilter = THREE.LinearMipmapLinearFilter; ringTex.magFilter = THREE.LinearFilter;
  ringTex.wrapS = THREE.ClampToEdgeWrapping; ringTex.wrapT = THREE.ClampToEdgeWrapping;
  try { ringTex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1; } catch (e) { }
  ringTex.needsUpdate = true;

  // ---------- jerarquía e inclinación axial (~20°) ----------
  const object = new THREE.Group();
  object.name = 'Izaro';
  const tilt = new THREE.Group();
  object.add(tilt);
  const Y = new THREE.Vector3(0, 1, 0);
  const h = new THREE.Vector3(sun.x, 0, sun.z); if (h.lengthSq() < 1e-6) h.set(1, 0, 0); h.normalize();
  h.applyAxisAngle(Y, 0.5);
  const tiltAxis = new THREE.Vector3().crossVectors(Y, h).normalize();
  tilt.quaternion.setFromAxisAngle(tiltAxis, 0.35);
  tilt.updateMatrixWorld(true);
  const ringN = Y.clone().applyQuaternion(tilt.quaternion).normalize();

  // ---------- GLSL común ----------
  const NOISE = /* glsl */`
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm3(vec3 p){float s=0.0,a=0.5;for(int i=0;i<3;i++){s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
  float fbm4(vec3 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
  float fbm6(vec3 p){float s=0.0,a=0.5;for(int i=0;i<6;i++){s+=a*snoise(p);p=p*2.02+vec3(4.1,2.7,7.3);a*=0.5;}return s;}
  float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  vec3 hash33(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
  vec2 worley(vec3 p){vec3 ip=floor(p),fp=fract(p);float d1=8.0;float id=0.0;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
      vec3 o=vec3(float(x),float(y),float(z)); vec3 hh=hash33(ip+o+71.0); vec3 r=o+hh-fp; float d=dot(r,r);
      if(d<d1){d1=d;id=hh.z;}
    } return vec2(sqrt(d1),id);}
  float hg(float g,float c){float g2=g*g;return (1.0-g2)/pow(max(1.0+g2-2.0*g*c,1e-4),1.5);}
  `;

  // ---------- PLANETA ----------
  const NV = 8;
  // vórtices: lat, lon0, sx, sy
  const vortDefs = [
    [-0.62, 2.1, 0.075, 0.05], [-0.60, 2.65, 0.06, 0.042], [-0.665, -1.4, 0.085, 0.055], [0.335, 1.5, 0.055, 0.036],
    [0.46, -0.6, 0.095, 0.05], [0.75, 3.0, 0.065, 0.042], [-0.135, -2.4, 0.05, 0.034], [0.93, 0.2, 0.075, 0.05]
  ];
  const storm0 = [-0.384, 0.8, 0.36, 0.21];
  const om = (lat) => 0.010 * Math.cos(lat * 8.0) + 0.004 * Math.cos(lat * 15.0 + 0.7);
  const wrapPi = (x) => x - 2 * Math.PI * Math.floor((x + Math.PI) / (2 * Math.PI));

  const planetUniforms = {
    uTime: { value: 0 }, uR: { value: R }, uIn: { value: RIN }, uOut: { value: ROUT },
    uSun: { value: sun.clone() }, uCam: { value: new THREE.Vector3(0, 0, 1000) }, uRingN: { value: ringN.clone() },
    uPal: { value: palTex }, uRing: { value: ringTex },
    uMoon: { value: [new THREE.Vector4(1e5, 0, 0, 1), new THREE.Vector4(1e5, 0, 0, 1), new THREE.Vector4(1e5, 0, 0, 1)] },
    uVort: { value: vortDefs.map(v => new THREE.Vector4(...v)) },
    uStorm: { value: new THREE.Vector4(...storm0) }
  };

  const planetVS = /* glsl */`
  varying vec3 vLocal; varying vec3 vP;
  void main(){ vLocal=position; vP=mat3(modelMatrix)*position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

  const planetFS = /* glsl */`
  uniform float uTime,uR,uIn,uOut; uniform vec3 uSun,uCam,uRingN; uniform sampler2D uPal,uRing;
  uniform vec4 uMoon[3]; uniform vec4 uVort[${NV}]; uniform vec4 uStorm;
  varying vec3 vLocal; varying vec3 vP;
  ${NOISE}
  #define PI 3.14159265
  float om(float lat){ return 0.010*cos(lat*8.0)+0.004*cos(lat*15.0+0.7); }
  vec3 pal(float lat){ vec3 c=texture2D(uPal,vec2(clamp(lat/PI+0.5,0.0,1.0),0.5)).rgb; return c*c; }
  float wrapPi(float x){ return x-6.2831853*floor((x+PI)/6.2831853); }
  vec2 vwarp(vec2 ll, vec4 v, float twist, float spin, float ph, out float m){
    float dl=wrapPi(ll.y-v.y); float cl=max(cos(ll.x),0.05);
    vec2 q=vec2(dl*cl/v.z,(ll.x-v.x)/v.w);
    float r2=dot(q,q); m=0.0;
    if(r2>5.0) return ll;
    float fall=exp(-r2*1.6); m=fall;
    float a=(twist+spin*ph)*fall; float c=cos(a), s=sin(a);
    q=mat2(c,-s,s,c)*q;
    return vec2(v.x+q.y*v.w, v.y+q.x*v.z/cl);
  }
  // globals for storm local frame
  float gSr, gSth;
  vec4 clouds(vec2 ll0, float ph, out float nOut){
    vec2 ll=ll0; float ms; ll=vwarp(ll,uStorm,3.4,0.07,ph,ms);
    float mv=0.0, omv=0.0, vidx=0.0;
    for(int i=0;i<${NV};i++){ float mi; float sg=mod(float(i),2.0)<0.5?1.0:-1.0;
      ll=vwarp(ll,uVort[i],2.2*sg,0.08*sg,ph,mi);
      if(mi>mv){mv=mi; omv=om(uVort[i].x); vidx=float(i);} }
    float omE=mix(om(ll.x),om(uStorm.x),ms); omE=mix(omE,omv,mv);
    float lonS=ll.y+omE*ph; float la=ll.x;
    vec3 p=vec3(cos(la)*cos(lonS),sin(la)*2.4,cos(la)*sin(lonS));
    vec2 wq=vec2(fbm4(p*1.7),fbm4(p*1.7+vec3(5.2,1.3,2.8)));
    vec3 pw=p*3.3+vec3(wq.x,wq.y*0.3,wq.y)*2.2;
    float n=fbm6(pw);
    nOut=n;
    float latW=la+n*0.05+wq.x*0.065;
    vec3 c=pal(latW);
    c*=0.80+0.42*(n*0.5+0.5);
    float puff=smoothstep(0.30,0.70,n+wq.y*0.3);
    c=mix(c,vec3(0.96,0.90,0.84),puff*0.22);
    // small ovals
    if(mv>0.15){
      float isW=mod(vidx,2.0)<0.5?1.0:0.0;
      vec3 oc=isW>0.5?vec3(0.98,0.94,0.90):(mod(vidx,4.0)<2.0?vec3(0.30,0.12,0.34):vec3(0.10,0.36,0.44));
      float core=smoothstep(0.42,0.62,mv);
      float rim=smoothstep(0.18,0.32,mv)*(1.0-core);
      c=mix(c,oc*(0.85+0.3*n),core*0.9);
      c=mix(c,c*0.6,rim*0.5*isW);
    }
    // great storm
    if(ms>0.01){
      float r=gSr, th=gSth;
      float arms=sin(2.0*th-5.5*log(r+0.04)+uTime*0.12+n*3.2);
      vec3 sc=mix(vec3(0.70,0.22,0.36),vec3(0.99,0.80,0.70),smoothstep(-0.35,0.9,arms));
      sc*=0.85+0.3*n;
      sc=mix(sc,vec3(0.06,0.26,0.40),smoothstep(0.17,0.05,r));
      sc+=vec3(1.0,0.82,0.80)*0.35*exp(-pow((r-0.19)/0.05,2.0));
      float inside=smoothstep(1.02,0.72,r+n*0.12);
      c=mix(c,sc,inside);
      float collar=exp(-pow((r-1.08+n*0.15)/0.16,2.0));
      c=mix(c,vec3(0.98,0.88,0.80)*(0.82+0.35*n),collar*0.65);
    }
    return vec4(c,ms);
  }
  void main(){
    vec3 dir=normalize(vLocal);
    float lat=asin(clamp(dir.y,-1.0,1.0)); float lon=atan(dir.z,dir.x);
    // storm local frame (unwarped)
    { float dl=wrapPi(lon-uStorm.y); vec2 q=vec2(dl*cos(lat)/uStorm.z,(lat-uStorm.x)/uStorm.w); gSr=length(q); gSth=atan(q.y,q.x); }
    const float T=26.0;
    float f0=fract(uTime/T), f1=fract(uTime/T+0.5);
    float w=abs(f0-0.5)*2.0;
    float n0,n1;
    vec4 c0=clouds(vec2(lat,lon),(f0-0.5)*T,n0);
    vec4 c1=clouds(vec2(lat,lon),(f1-0.5)*T,n1);
    vec3 alb=mix(c0.rgb,c1.rgb,w); float n=mix(n0,n1,w);
    // fine detail (static, close-up)
    float det=snoise(dir*vec3(70.0,190.0,70.0))*0.5+snoise(dir*vec3(150.0,420.0,150.0))*0.25;
    alb*=1.0+det*0.06;
    // polar hexagon (north) + south polar vortex
    float colat=PI*0.5-lat;
    if(colat<0.75){
      float a=mod(lon+uTime*0.004+PI/6.0,PI/3.0)-PI/6.0;
      float hd=colat*cos(a)+n*0.012;
      float inside=smoothstep(0.35,0.31,hd);
      alb=mix(alb,vec3(0.16,0.30,0.52)*(0.8+0.5*(n*0.5+0.5)),inside*0.75);
      float edge=exp(-pow((hd-0.33)/0.016,2.0));
      alb=mix(alb,vec3(0.93,0.86,0.80),edge*0.55);
      float sp=sin(3.0*lon-9.0*log(colat+0.02)-uTime*0.2+n*2.0);
      alb*=1.0+0.18*sp*smoothstep(0.2,0.03,colat);
      alb=mix(alb,vec3(0.05,0.12,0.25),smoothstep(0.035,0.0,colat));
    }
    float scol=PI*0.5+lat;
    if(scol<0.4){
      float sp=sin(4.0*lon+10.0*log(scol+0.02)+uTime*0.15+n*2.0);
      alb=mix(alb,vec3(0.28,0.12,0.36)*(1.0+0.3*sp),smoothstep(0.38,0.12,scol)*0.7);
    }
    // ---- lighting ----
    vec3 P=vP; vec3 N=normalize(P); vec3 V=normalize(uCam-P);
    float NL=dot(N,uSun); float mu=clamp(dot(N,V),0.0,1.0);
    float soft=smoothstep(-0.12,0.20,NL);
    float I=soft*pow(max(NL,0.0)+0.03,0.72)*mix(1.0,pow(mu+0.02,0.3),0.55);
    vec3 tint=mix(vec3(1.05,0.50,0.62),vec3(1.0),smoothstep(0.0,0.42,NL));
    // shadows: rings
    float sh=1.0;
    float dn=dot(uSun,uRingN);
    if(abs(dn)>1e-4){ float tt=-dot(P,uRingN)/dn; if(tt>0.0){ vec3 hit=P+uSun*tt; float r=length(hit); float u=(r-uIn)/(uOut-uIn);
      if(u>0.0&&u<1.0){ float a=texture2D(uRing,vec2(u,0.5)).a; sh*=1.0-a*0.9; } } }
    // shadows: moons
    for(int i=0;i<3;i++){ vec3 d=uMoon[i].xyz-P; float b=dot(d,uSun); if(b>0.0){ float dp=length(d-uSun*b); sh*=mix(0.03,1.0,smoothstep(uMoon[i].w*0.75,uMoon[i].w*1.25,dp)); } }
    vec3 col=alb*I*tint*sh*0.92;
    // haze rim (Rayleigh-ish)
    float rim=pow(1.0-mu,3.5);
    col+=vec3(0.42,0.48,1.05)*rim*smoothstep(-0.25,0.5,NL)*0.5;
    col+=vec3(0.9,0.35,0.5)*rim*exp(-NL*NL*40.0)*0.35;
    // night side
    float night=1.0-smoothstep(-0.18,0.04,NL);
    float s=sign(dn);
    col+=alb*vec3(0.80,0.72,0.86)*max(dot(N,uRingN*s),0.0)*0.03*abs(dn)*night;
    col+=vec3(0.014,0.005,0.03)*(0.6+0.8*(n*0.5+0.5))*night;
    // lightning
    if(night>0.01&&abs(lat)<1.15){
      vec2 g=vec2((lon/6.2831853+0.5)*56.0,lat*18.0);
      vec2 cell=floor(g), f=fract(g);
      float h1=hash12(cell), h2=hash12(cell+17.3), h3=hash12(cell+41.7);
      if(h1>0.80){
        vec2 cc=0.4+0.2*vec2(h2,h3);
        float d=length(f-cc);
        float ph=fract(uTime*(0.12+0.3*h2)+h3*7.0);
        float fl=exp(-ph*38.0)+0.7*exp(-abs(ph-0.06)*80.0)+0.45*exp(-abs(ph-0.12)*95.0);
        float sp=smoothstep(0.38,0.0,d);
        col+=vec3(0.62,0.74,1.45)*fl*(sp*sp*1.6+pow(sp,10.0)*7.0)*(0.55+0.9*(n*0.5+0.5))*night;
      }
    }
    gl_FragColor=vec4(col,1.0);
  }`;

  const planetMat = new THREE.ShaderMaterial({ uniforms: planetUniforms, vertexShader: planetVS, fragmentShader: planetFS });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), planetMat);
  tilt.add(planet);

  // ---------- ATMÓSFERA (halo) ----------
  const RA = R * 1.05;
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: planetUniforms.uSun, uCam: planetUniforms.uCam, uR: { value: R }, uRA: { value: RA } },
    vertexShader: /* glsl */`varying vec3 vP; void main(){ vP=mat3(modelMatrix)*position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: /* glsl */`
      uniform vec3 uSun,uCam; uniform float uR,uRA; varying vec3 vP;
      float hg(float g,float c){float g2=g*g;return (1.0-g2)/pow(max(1.0+g2-2.0*g*c,1e-4),1.5);}
      void main(){
        vec3 D=normalize(vP-uCam);
        float tc=dot(-uCam,D); vec3 Pc=uCam+D*tc; float b=length(Pc);
        if(length(uCam)<uRA){ Pc=vP; b=length(Pc); }
        float hN=clamp((b-uR)/(uRA-uR),0.0,1.0);
        float chord=sqrt(max(uRA*uRA-b*b,0.0))/uR;
        float dens=chord*exp(-hN*4.0)*3.0;
        vec3 nC=Pc/max(b,1e-3); float m=dot(nC,uSun);
        float lit=smoothstep(-0.32,0.35,m);
        float cosT=dot(D,uSun);
        vec3 col=vec3(0.36,0.42,1.0)*0.75*(1.0+cosT*cosT)*dens*lit;
        col+=vec3(1.0,0.62,0.78)*hg(0.72,cosT)*0.035*dens*lit;
        col+=vec3(1.0,0.32,0.48)*dens*exp(-m*m*28.0)*0.45;
        gl_FragColor=vec4(col*0.9,1.0);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RA, 128, 64), atmoMat);
  atmo.renderOrder = 1;
  tilt.add(atmo);

  // ---------- ANILLOS ----------
  const ringGeo = new THREE.RingGeometry(RIN, ROUT, 720, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uRing: { value: ringTex }, uSun: planetUniforms.uSun, uCam: planetUniforms.uCam, uN: planetUniforms.uRingN,
      uR: { value: R }, uIn: { value: RIN }, uOut: { value: ROUT }, uTime: planetUniforms.uTime, uMoon: planetUniforms.uMoon
    },
    vertexShader: /* glsl */`varying vec3 vLocal; varying vec3 vP; void main(){ vLocal=position; vP=mat3(modelMatrix)*position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: /* glsl */`
      uniform sampler2D uRing; uniform vec3 uSun,uCam,uN; uniform float uR,uIn,uOut,uTime; uniform vec4 uMoon[3];
      varying vec3 vLocal; varying vec3 vP;
      float hash(float x){return fract(sin(x*127.1)*43758.5453);}
      float vn1(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(hash(i),hash(i+1.0),f);}
      float hg(float g,float c){float g2=g*g;return (1.0-g2)/pow(max(1.0+g2-2.0*g*c,1e-4),1.5);}
      void main(){
        float r=length(vLocal.xz);
        float u=(r-uIn)/(uOut-uIn);
        vec4 tx=texture2D(uRing,vec2(u,0.5));
        vec3 alb=tx.rgb*tx.rgb; float a=tx.a;
        float fw=fwidth(r);
        float fine=(vn1(r*2.3)-0.5)*0.32*smoothstep(0.5,0.05,fw*2.3)
                  +(vn1(r*9.0+7.0)-0.5)*0.26*smoothstep(0.5,0.05,fw*9.0)
                  +(vn1(r*37.0+3.0)-0.5)*0.20*smoothstep(0.5,0.05,fw*37.0);
        a=clamp(a*(1.0+fine),0.0,0.985);
        alb*=1.0+fine*0.35;
        // faint spokes in the B ring
        float ang=atan(vLocal.z,vLocal.x);
        float rr=r/uR;
        float spk=smoothstep(0.55,1.0,sin(ang*17.0+sin(ang*5.0+uTime*0.03)*2.5+rr*4.0))*smoothstep(1.58,1.66,rr)*(1.0-smoothstep(1.82,1.9,rr));
        vec3 V=normalize(uCam-vP);
        float sunSide=dot(uSun,uN), camSide=dot(V,uN);
        float mu0=abs(sunSide), mu=max(abs(camSide),0.03);
        float litFace=step(0.0,sunSide*camSide);
        // planet shadow (with reddened penumbra)
        vec3 P=vP; float b=dot(P,uSun); float sh=1.0;
        if(b<0.0){ float dp=length(P-uSun*b); sh=smoothstep(uR*0.985,uR*1.035,dp); }
        vec3 tint=mix(vec3(1.0),vec3(1.0,0.45,0.6),clamp(sh*(1.0-sh)*4.0,0.0,1.0)*0.7);
        for(int i=0;i<3;i++){ vec3 d=uMoon[i].xyz-P; float bb=dot(d,uSun); if(bb>0.0){ float dp=length(d-uSun*bb); sh*=mix(0.05,1.0,smoothstep(uMoon[i].w*0.8,uMoon[i].w*1.2,dp)); } }
        float cosT=-dot(uSun,V);
        float ls=mu0/(mu0+mu);
        float dust=clamp(1.0-a*1.15,0.0,1.0); dust=0.12+0.88*dust*dust;
        vec3 refl=alb*a*ls*0.72*(0.55+0.45*hg(-0.28,cosT))*litFace;
        vec3 trans=alb*a*(1.0-a)*ls*1.8*(1.0-litFace);
        vec3 fwd=alb*vec3(1.0,0.86,0.92)*dust*a*hg(0.74,cosT)*0.30*smoothstep(0.0,0.08,mu0);
        vec3 E=(refl+trans+fwd)*sh*tint*1.15;
        E*=1.0-0.18*spk*litFace; E+=alb*a*spk*0.25*hg(0.6,cosT)*0.08*sh;
        // planetshine
        float f=0.5+0.5*dot(normalize(P),uSun);
        E+=alb*a*vec3(0.62,0.52,0.82)*f*0.22*(uR*uR)/dot(P,P);
        E+=alb*a*vec3(0.010,0.008,0.016);
        gl_FragColor=vec4(E,a);
      }`,
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
  });
  const rings = new THREE.Mesh(ringGeo, ringMat);
  rings.renderOrder = 2;
  tilt.add(rings);

  // ---------- LUNAS ----------
  const moonVS = /* glsl */`varying vec3 vL; varying vec3 vP; void main(){ vL=normalize(position); vP=mat3(modelMatrix)*position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
  const moonCommon = /* glsl */`
    uniform vec3 uSun,uCam,uC; uniform float uR,uMR,uTime,uBump;
    varying vec3 vL; varying vec3 vP;
    ${NOISE}
    float crater(vec3 p,float sc,float dens){ vec2 w=worley(p*sc); float cr=0.22+0.22*w.y; float x=w.x/cr;
      float bowl=x<1.0?(x*x-1.0):0.0; float rim=exp(-pow((x-1.0)/0.22,2.0))*0.45;
      return (bowl*0.8+rim)*step(1.0-dens,fract(w.y*13.7)); }
    vec3 bumpN(vec3 pos,vec3 n,float h){ vec3 dpx=dFdx(pos),dpy=dFdy(pos); vec3 r1=cross(dpy,n),r2=cross(n,dpx);
      float det=dot(dpx,r1); vec2 dh=vec2(dFdx(h),dFdy(h)); vec3 grad=sign(det)*(dh.x*r1+dh.y*r2);
      return normalize(abs(det)*n-grad); }
  `;
  const moonMain = /* glsl */`
    void main(){
      vec3 alb; float h; vec3 em; float spc;
      surf(vL,alb,h,em,spc);
      vec3 N0=normalize(vP);
      vec3 N=bumpN(vP,N0,h*uBump);
      vec3 P=uC+vP; vec3 V=normalize(uCam-P);
      float NL=dot(N,uSun); float mu0=max(NL,0.0), mu=max(dot(N,V),0.0);
      float dif=mix(mu0,2.0*mu0/(mu0+mu+0.05),0.45)*smoothstep(-0.04,0.08,dot(N0,uSun));
      float sh=1.0; float b=dot(P,uSun);
      if(b<0.0){ float dp=length(P-uSun*b); sh=smoothstep(uR*0.98,uR*1.03,dp); }
      float f=0.5+0.5*dot(normalize(P),uSun);
      float ps=max(dot(N0,-normalize(P)),0.0)*f*0.6*(uR*uR)/dot(P,P);
      vec3 col=alb*(dif*sh*1.25+ps*vec3(0.75,0.62,0.95))+alb*vec3(0.006,0.004,0.01);
      col+=spc*pow(max(dot(reflect(-uSun,N),V),0.0),28.0)*0.5*sh*vec3(0.95,0.97,1.0);
      col+=em;
      gl_FragColor=vec4(col,1.0);
    }`;
  const surfIo = /* glsl */`
    void surf(vec3 d,out vec3 alb,out float h,out vec3 em,out float spc){
      float n=fbm4(d*3.0), n2=fbm4(d*8.0+3.0);
      alb=mix(vec3(0.80,0.66,0.18),vec3(0.93,0.89,0.62),smoothstep(-0.15,0.35,n));
      alb=mix(alb,vec3(0.80,0.40,0.10),smoothstep(0.2,0.55,n2)*0.75);
      alb=mix(alb,vec3(0.95,0.95,0.86),smoothstep(0.35,0.6,-n2)*0.5);
      alb=mix(alb,vec3(0.42,0.26,0.13),smoothstep(0.55,0.92,abs(d.y)+n*0.12));
      vec2 w=worley(d*4.2);
      float on=step(0.42,w.y);
      float cr=0.07+0.10*fract(w.y*7.3);
      float pat=smoothstep(cr,cr*0.75,w.x+n2*0.03)*on;
      float halo=exp(-pow((w.x-cr*2.4)/(cr*1.1),2.0))*on;
      vec3 haloC=fract(w.y*3.1)>0.5?vec3(0.72,0.17,0.05):vec3(0.96,0.95,0.86);
      alb=mix(alb,haloC,halo*0.65);
      alb=mix(alb,vec3(0.05,0.035,0.03),pat);
      float hot=step(0.62,w.y);
      float lava=smoothstep(cr*0.55,0.0,w.x)*hot;
      float edge=pat*smoothstep(cr*0.6,cr*0.95,w.x)*hot;
      float flick=0.75+0.25*sin(uTime*1.7+w.y*60.0);
      em=vec3(3.6,0.95,0.16)*lava*lava*flick+vec3(2.2,0.45,0.06)*edge*0.6*flick;
      h=n2*0.5-pat*0.6+halo*0.15;
      spc=0.0;
    }`;
  const surfIce = /* glsl */`
    void surf(vec3 d,out vec3 alb,out float h,out vec3 em,out float spc){
      float n=fbm4(d*2.4);
      alb=mix(vec3(0.88,0.90,0.93),vec3(0.80,0.70,0.58),smoothstep(0.1,0.55,n));
      alb=mix(alb,vec3(0.76,0.86,0.96),smoothstep(-0.15,-0.55,n)*0.6);
      float lines=0.0, ridge=0.0;
      for(int i=0;i<4;i++){ float fi=float(i);
        float l=abs(snoise(d*(1.6+fi*1.3)+vec3(fi*7.1,fi*3.3,fi*1.7)));
        lines=max(lines,smoothstep(0.028-fi*0.004,0.004,l));
        ridge=max(ridge,smoothstep(0.012,0.0,abs(l-0.02)));
      }
      alb=mix(alb,vec3(0.56,0.30,0.17),lines*0.8);
      alb=mix(alb,vec3(0.97,0.97,1.0),ridge*0.4);
      float ch=smoothstep(0.42,0.68,fbm4(d*5.0+11.0));
      float cn=snoise(d*38.0);
      alb=mix(alb,vec3(0.62,0.42,0.30)*(0.75+0.5*cn),ch*0.65);
      vec2 w=worley(d*6.0); float cr=0.1*step(0.85,w.y);
      float ray=smoothstep(cr*2.5,0.0,w.x)*step(0.85,w.y);
      alb=mix(alb,vec3(0.98,0.99,1.0),ray*0.5);
      h=-lines*0.4+ridge*0.3+ch*cn*0.35+fbm3(d*20.0)*0.12;
      em=vec3(0.0); spc=0.55*(1.0-ch);
    }`;
  const surfDark = /* glsl */`
    void surf(vec3 d,out vec3 alb,out float h,out vec3 em,out float spc){
      float n=fbm4(d*3.0);
      float side=d.z;
      float darkM=smoothstep(-0.22,0.12,side+n*0.35-pow(abs(d.y),1.5)*0.55);
      float c1=crater(d,3.2,0.75), c2=crater(d,7.5,0.7), c3=crater(d,17.0,0.65);
      float cr=c1*1.0+c2*0.55+c3*0.3;
      vec3 bright=vec3(0.70,0.66,0.60), dark=vec3(0.040,0.029,0.024);
      alb=mix(bright,dark,darkM);
      float floorD=smoothstep(-0.1,-0.5,c1+c2);
      alb=mix(alb,dark*2.0,floorD*(1.0-darkM)*0.7);
      alb*=0.85+0.3*(fbm3(d*30.0)*0.5+0.5);
      float ridge=exp(-pow((d.y+snoise(d*6.0)*0.01)/0.035,2.0))*smoothstep(-0.3,0.4,side+n*0.3);
      alb=mix(alb,alb*1.6+0.02,ridge*0.3);
      h=cr*0.55+ridge*1.4+n*0.2;
      em=vec3(0.0); spc=0.0;
    }`;

  const moonDefs = [
    { name: 'Calima', r: 11, orbit: 470, speed: 0.022, phase: 0.6, inc: 0.02, surf: surfIo, bump: 0.6 },
    { name: 'Nívea', r: 9, orbit: 575, speed: 0.015, phase: 2.9, inc: -0.04, surf: surfIce, bump: 0.35 },
    { name: 'Umbra', r: 8, orbit: 700, speed: 0.010, phase: 4.6, inc: 0.07, surf: surfDark, bump: 0.7 }
  ];
  const moons = moonDefs.map(def => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSun: planetUniforms.uSun, uCam: planetUniforms.uCam, uC: { value: new THREE.Vector3() }, uR: { value: R }, uMR: { value: def.r }, uTime: planetUniforms.uTime, uBump: { value: def.bump } },
      vertexShader: moonVS, fragmentShader: moonCommon + def.surf + moonMain
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.r, 96, 64), mat);
    mesh.name = def.name;
    tilt.add(mesh);
    return { def, mesh, mat };
  });

  // ---------- estado ----------
  const _o = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Vector3();
  function placeMoons(t) {
    for (const m of moons) {
      const a = m.def.phase + t * m.def.speed;
      m.mesh.position.set(Math.cos(a) * m.def.orbit, Math.sin(a) * Math.sin(m.def.inc) * m.def.orbit, Math.sin(a) * m.def.orbit);
      m.mesh.rotation.set(0, -a, 0);
    }
  }
  placeMoons(5);
  object.updateMatrixWorld(true);

  function update(dt, t, ctx) {
    planetUniforms.uTime.value = t;
    planet.rotation.y += dt * 0.012;
    placeMoons(t);
    object.updateMatrixWorld(true);
    object.getWorldPosition(_o);
    if (ctx && ctx.camera) { ctx.camera.getWorldPosition(_c); planetUniforms.uCam.value.copy(_c).sub(_o); }
    if (ctx && ctx.sunDir) planetUniforms.uSun.value.copy(ctx.sunDir).normalize();
    planetUniforms.uRingN.value.copy(Y).applyQuaternion(tilt.quaternion);
    for (let i = 0; i < 3; i++) {
      const m = moons[i];
      m.mesh.getWorldPosition(_m).sub(_o);
      m.mat.uniforms.uC.value.copy(_m);
      planetUniforms.uMoon.value[i].set(_m.x, _m.y, _m.z, m.def.r);
    }
    // vortices drift with their jet (mesh frame)
    for (let i = 0; i < NV; i++) {
      const v = vortDefs[i];
      planetUniforms.uVort.value[i].set(v[0], wrapPi(v[1] - om(v[0]) * t), v[2], v[3]);
    }
    planetUniforms.uStorm.value.set(storm0[0], wrapPi(storm0[1] - om(storm0[0]) * t), storm0[2], storm0[3]);
  }

  return {
    object,
    radius: R,
    viewDistance: 950,
    info: {
      nombre: 'Izaro',
      tipo: 'Gigante gaseoso anillado',
      descripcion: 'Un coloso de hidrógeno teñido de violeta, lila y crema, donde corrientes en chorro chocan a casi dos mil kilómetros por hora y un ojo de tormenta más grande que tres mundos gira desde hace milenios. Sus anillos de polvo rosado y hielo blanquecino se encienden como seda cuando la estrella queda detrás. En su cara nocturna, los relámpagos parpadean entre las nubes como faros lejanos.',
      datos: [
        ['Radio', '10,2 radios terrestres'],
        ['Gravedad en las nubes', '2,1 g'],
        ['Día', '10 h 14 min'],
        ['Vientos máximos', '1.900 km/h'],
        ['Anillos', 'Más de 900 anillos menores'],
        ['Lunas mayores', 'Calima, Nívea y Umbra']
      ],
      estrella: { nombre: 'Lirael', color: 0xfff0dd }
    },
    update
  };
}
