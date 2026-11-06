// GÉLIDA — mundo de hielo bajo una estrella blanco-azulada.
// Módulo procedural (Three.js r160). Sin imports: THREE llega por parámetro.

export default function create(THREE, { sunDir }) {
  const R = 60;
  const SUN_COL = new THREE.Color(0.86, 0.93, 1.0); // estrella blanco-azulada (lineal)
  const sun = sunDir.clone().normalize();

  // ---------------------------------------------------------------- GLSL común
  const NOISE = /* glsl */`
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
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
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p, int oct){
    float a=0.5, s=0.0;
    for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
    return s;
  }
  float ridged(vec3 p, int oct){
    float a=0.5, s=0.0, w=1.0;
    for(int i=0;i<6;i++){ if(i>=oct) break; float n=1.0-abs(snoise(p)); n*=n; n*=w; w=clamp(n*1.6,0.0,1.0); s+=a*n; p=p*2.1+vec3(3.3,1.1,7.7); a*=0.5; }
    return s;
  }
  vec3 hash33(vec3 p){
    p=fract(p*vec3(0.1031,0.1030,0.0973));
    p+=dot(p,p.yxz+33.33);
    return fract((p.xxy+p.yxx)*p.zyx);
  }
  float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
  // Voronoi F2-F1: distancia al borde de celda (grietas)
  float cellEdge(vec3 p){
    vec3 i=floor(p), f=fract(p); float d1=8.0, d2=8.0;
    for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec3 g=vec3(float(x),float(y),float(z));
      vec3 r=g+hash33(i+g)-f; float d=dot(r,r);
      if(d<d1){d2=d1;d1=d;} else if(d<d2){d2=d;}
    }
    return sqrt(d2)-sqrt(d1);
  }
  `;

  // ---------------------------------------------------------------- jerarquía
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.42;       // eje inclinado: los polos (y sus auroras) se ven bien
  tilt.rotation.z = -0.18;
  root.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);

  // ---------------------------------------------------------------- superficie
  const surfUniforms = {
    uSun: { value: sun.clone() },
    uSunCol: { value: SUN_COL.clone() },
    uR: { value: R },
    uTime: { value: 0 },
    uSpin: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
  };
  const surfMat = new THREE.ShaderMaterial({
    uniforms: surfUniforms,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN;
      void main(){
        vObj = position;
        vec4 w = modelMatrix*vec4(position,1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform vec3 uSunCol; uniform float uR; uniform float uTime; uniform float uSpin; uniform vec3 uCenter;
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN;
      ${NOISE}
      vec3 perturb(vec3 P, vec3 N, float h){
        vec3 sx=dFdx(P), sy=dFdy(P);
        vec3 r1=cross(sy,N), r2=cross(N,sx);
        float det=dot(sx,r1);
        float dBs=dFdx(h), dBt=dFdy(h);
        vec3 g=sign(det)*(dBs*r1+dBt*r2);
        return normalize(abs(det)*N-g);
      }
      void main(){
        vec3 p = normalize(vObj);           // esfera unidad, marco del planeta
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 Ng = normalize(vN);
        vec3 L = normalize(uSun);
        float camDist = length(cameraPosition - vWorld);
        float px = camDist * 0.0012;         // tamaño aprox. de píxel en unidades de mundo
        float lat = p.y;

        // ----- relieve global
        vec3 q = p*2.1;
        vec3 warp = vec3(fbm(q+vec3(0.0,3.1,0.0),4), fbm(q+vec3(5.2,1.3,0.0),4), fbm(q+vec3(2.2,0.0,7.7),4));
        float h = fbm(q + warp*0.55, 7);                 // [-1,1] aprox
        float sea = smoothstep(-0.10, -0.16, h);         // mares de metano helado
        float coast = smoothstep(-0.06,-0.13,h) - sea;
        float polar = smoothstep(0.62, 0.80, abs(lat) + fbm(p*6.0,3)*0.08);

        // ----- glaciares: bandas de flujo
        vec3 fq = p*vec3(3.0,14.0,3.0) + warp*1.8;
        float flow = snoise(fq)*0.5+0.5;

        // ----- red de grietas (dos escalas + micro)
        vec3 cw = p*7.0 + warp*0.9 + vec3(fbm(p*18.0,3))*0.25;
        float e1 = cellEdge(cw);
        float crackField = smoothstep(-0.05, 0.35, fbm(p*3.3+vec3(9.0),3)) * (1.0-sea) * (1.0-polar*0.7);
        float w1 = 0.055 + 0.03*snoise(p*30.0);
        float f1 = fwidth(e1);
        float c1 = (1.0-smoothstep(0.0, w1+f1, e1)) * (w1/(w1+f1)) * crackField;
        vec3 cw2 = p*26.0 + warp*2.0 + vec3(snoise(p*60.0))*0.18;
        float e2 = cellEdge(cw2);
        float f2 = fwidth(e2);
        float c2 = (1.0-smoothstep(0.0, 0.07+f2, e2)) * (0.07/(0.07+f2)) * crackField * smoothstep(0.1,0.7,fbm(p*9.0+3.0,2)+0.5);
        float microFade = 1.0 - smoothstep(0.08, 0.35, px);
        float c3 = 0.0;
        if(microFade>0.0){
          float e3 = cellEdge(p*95.0 + warp*3.0);
          float f3 = fwidth(e3);
          c3 = (1.0-smoothstep(0.0,0.09+f3,e3)) * (0.09/(0.09+f3)) * microFade * (1.0-sea) * 0.8;
        }
        // grandes cañones (chasmata) visibles desde lejos
        float eB = cellEdge(p*2.6 + warp*0.6 + vec3(fbm(p*9.0,3))*0.12);
        float fB = fwidth(eB);
        float chasma = (1.0-smoothstep(0.0, 0.035+fB, eB)) * (0.035/(0.035+fB)) * (1.0-sea);
        float halo = (1.0-smoothstep(0.0, 0.22, eB)) * (1.0-sea) * (1.0-polar*0.5);
        float crack = clamp(max(max(c1, c2*0.85), chasma) + c3*0.5, 0.0, 1.0);

        // ----- sastrugi / dunas de nieve (detalle cercano)
        float sast = 0.0;
        if(microFade>0.0) sast = snoise(p*vec3(220.0,60.0,220.0)+warp*4.0)*microFade;

        // ----- altura para bump (en unidades de mundo)
        float hb = h*1.6 + flow*0.25 - crack*0.9 - halo*0.6 - chasma*1.2 - c3*0.35 + sast*0.06 - sea*0.4;
        vec3 N = perturb(vWorld, Ng, hb*mix(0.22, 0.03, sea)*smoothstep(1.2,0.25,px));

        // ----- materiales
        vec3 iceA = vec3(0.62,0.80,0.92);
        vec3 iceB = vec3(0.80,0.90,0.97);
        vec3 snow = vec3(0.86,0.90,0.95);
        vec3 blueIce = vec3(0.28,0.62,0.85);
        vec3 alb = mix(iceA, iceB, flow);
        alb = mix(alb, blueIce, smoothstep(0.25,0.75, snoise(p*11.0+warp)*0.5+0.5)*0.35*(1.0-polar));
        float snowMask = clamp(smoothstep(0.18,0.5,h + fbm(p*20.0,3)*0.15) + polar, 0.0, 1.0);
        alb = mix(alb, snow, snowMask);
        alb = mix(alb, vec3(0.72,0.86,0.94), coast*0.8);   // escarcha en la orilla
        vec3 crackCol = vec3(0.0,0.42,0.62);
        alb = mix(alb, vec3(0.30,0.66,0.86), halo*0.55);   // hielo azul junto a los cañones
        alb = mix(alb, crackCol*0.6, crack*0.85);

        // ----- iluminación
        float ndl = dot(N, L);
        float ndlG = dot(Ng, L);
        float term = smoothstep(-0.08, 0.25, ndlG);          // terminador suave
        float diff = max(ndl,0.0) * smoothstep(-0.05,0.12,ndlG);
        // dispersión subsuperficial: luz que atraviesa el hielo
        float sssWrap = smoothstep(-0.25, 0.6, ndlG);
        vec3 sss = vec3(0.05,0.45,0.65) * sssWrap * (0.10 + 0.9*crack) * (1.0-sea);

        vec3 col = alb * uSunCol * diff * 0.74;
        col += alb * vec3(0.10,0.09,0.22) * smoothstep(0.35,0.0,ndl) * term * 0.35; // sombras lavanda (cielo)
        col += sss * uSunCol * 0.55;
        // grietas: el hielo profundo resplandece cian cuando el sol pega rasante
        col += vec3(0.02,0.55,0.75) * crack * pow(max(ndlG,0.0),0.6) * 0.35;

        // especular del hielo (ancho)
        vec3 H = normalize(L+V);
        float spec = pow(max(dot(N,H),0.0), 60.0) * term;
        col += uSunCol * spec * 0.25 * (1.0-sea);

        // ----- mares de metano helado: vidrio profundo
        if(sea > 0.0){
          vec3 refr = refract(-V, Ng, 0.76);
          vec3 inner = p + refr*0.012;
          float layers = fbm(inner*14.0 + warp, 4);
          float bubbles = smoothstep(0.55,0.9, snoise(inner*90.0)*0.5+0.5);
          float fissure = 1.0 - smoothstep(0.0, 0.04, cellEdge(inner*12.0 + warp));
          vec3 deep = mix(vec3(0.004,0.02,0.06), vec3(0.02,0.13,0.24), layers*0.5+0.5);
          deep += vec3(0.15,0.5,0.75)*fissure*0.22 + vec3(0.5,0.8,1.0)*bubbles*0.08;
          float sssSea = smoothstep(-0.2, 0.7, ndlG);
          vec3 seaCol = deep * uSunCol * (0.15 + 0.9*sssSea);
          float fres = 0.04 + 0.96*pow(1.0-max(dot(Ng,V),0.0), 5.0);
          vec3 sky = mix(vec3(0.02,0.03,0.08), vec3(0.35,0.65,0.85), pow(1.0-max(dot(Ng,V),0.0),2.0)) * term;
          vec3 Ns = normalize(mix(Ng, N, 0.25));
          float glint = pow(max(dot(Ns,H),0.0), 900.0) * 40.0 + pow(max(dot(Ns,H),0.0), 120.0)*0.8;
          seaCol = mix(seaCol, sky, fres*0.5) + uSunCol*glint*term;
          col = mix(col, seaCol, sea);
        }

        // ----- destellos de cristales de hielo (glitter)
        {
          float lvl = clamp(floor(log2(max(px,0.002)*3.0)), -6.0, 4.0);
          float cs = exp2(lvl);                     // tamaño de celda ~ 3 px
          vec3 wp = p*uR/cs;
          vec3 ci = floor(wp);
          vec3 rnd = hash33(ci);
          vec3 rn = normalize(N + (rnd-0.5)*0.9);
          float s = pow(max(dot(reflect(-L, rn), V), 0.0), 220.0);
          float keep = step(0.84, hash13(ci+17.0));
          keep *= smoothstep(0.32, 0.0, length(fract(wp) - (0.2+0.6*rnd)));
          float tw = 0.6+0.4*sin(uTime*(2.0+rnd.x*5.0)+rnd.y*30.0);
          vec3 sc = mix(vec3(0.7,0.9,1.0), vec3(1.0,0.85,1.0), rnd.z);
          col += sc * s * keep * tw * 14.0 * term * (1.0-sea) * (0.4+0.6*snowMask);
        }

        // ----- lado nocturno: luz de auroras sobre el hielo + luz cenicienta
        vec3 tp = vec3(p.x*cos(uSpin)+p.z*sin(uSpin), p.y, -p.x*sin(uSpin)+p.z*cos(uSpin));
        float alat = abs(tp.y);
        float ang = atan(tp.z, tp.x);
        float band = exp(-pow((alat-0.935)/0.045, 2.0));
        band *= 0.55 + 0.45*sin(ang*5.0 + uTime*0.25 + sign(tp.y)*2.0);
        band *= 0.7 + 0.3*sin(uTime*0.9 + ang*13.0);
        float night = 1.0 - smoothstep(-0.25, 0.1, ndlG);
        vec3 auroraGlow = mix(vec3(0.05,0.9,0.4), vec3(0.45,0.25,1.0), 0.5+0.5*sin(ang*2.0+uTime*0.1));
        col += auroraGlow * band * 0.11 * (0.3+0.7*night) * (0.6+0.4*snowMask);
        col += vec3(0.0025,0.003,0.008) * night * (0.4+0.6*alb.b);  // luz estelar/lunas

        // ----- bruma atmosférica (Rayleigh) en el limbo
        float mu = max(dot(Ng,V),0.0);
        float rim = pow(1.0-mu, 3.0);
        float atmLit = smoothstep(-0.3, 0.4, ndlG);
        vec3 rayleigh = vec3(0.30,0.68,0.95);
        col = mix(col, rayleigh*atmLit*0.55, rim*0.55);
        col += vec3(0.25,0.18,0.55)*rim*smoothstep(-0.45,0.0,ndlG)*smoothstep(0.25,-0.05,ndlG)*0.25; // franja violeta del crepúsculo

        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), surfMat);
  spin.add(surface);

  // ---------------------------------------------------------------- atmósfera (cáscara)
  const ATM_R = R * 1.06;
  const atmMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun.clone() }, uR: { value: R }, uAR: { value: ATM_R }, uSunCol: { value: SUN_COL.clone() } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vCenter;
      void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vCenter=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uR; uniform float uAR; uniform vec3 uSunCol;
      varying vec3 vWorld; varying vec3 vCenter;
      void main(){
        vec3 C = vCenter;
        vec3 ro = cameraPosition - C;
        vec3 rd = normalize(vWorld - cameraPosition);
        float tca = -dot(ro, rd);
        vec3 cp = ro + rd*max(tca,0.0);
        float b = length(cp);
        if(tca < 0.0) b = length(ro);
        float alt = clamp((b - uR)/(uAR-uR), 0.0, 1.0);
        float dens = exp(-alt*4.2) * (1.0 - smoothstep(0.85,1.0,alt));
        // longitud de cuerda en la cáscara
        float chord = 2.0*sqrt(max(uAR*uAR - b*b, 0.0)) / (uAR*2.0);
        vec3 n = normalize(cp);
        float lit = smoothstep(-0.35, 0.35, dot(n, normalize(uSun)));
        float cosT = dot(rd, normalize(uSun));
        float mie = pow(max(cosT,0.0), 16.0)*0.9;
        vec3 ray = vec3(0.30,0.70,1.0);
        vec3 col = ray * dens * chord * lit * 2.2 + uSunCol*mie*dens*chord*lit*0.8;
        // franja crepuscular violeta
        col += vec3(0.4,0.25,0.8) * dens*chord * smoothstep(-0.5,-0.05,dot(n,normalize(uSun))) * (1.0-lit) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(ATM_R, 128, 64), atmMat);
  root.add(atmosphere);

  // ---------------------------------------------------------------- auroras
  const auroraUniforms = { uTime: { value: 0 }, uSun: { value: sun.clone() } };
  function makeCurtainGeo(segs, rows) {
    const g = new THREE.BufferGeometry();
    const uv = new Float32Array((segs + 1) * (rows + 1) * 2);
    const pos = new Float32Array((segs + 1) * (rows + 1) * 3);
    let k = 0;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= segs; i++) { uv[k++] = i / segs; uv[k++] = j / rows; }
    const idx = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('auv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
    return g;
  }
  const curtainGeo = makeCurtainGeo(420, 28);
  function makeCurtain(pole, theta0, height, seed, gain, hue) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: auroraUniforms.uTime, uSun: auroraUniforms.uSun,
        uPole: { value: pole }, uTheta: { value: theta0 }, uH: { value: height },
        uSeed: { value: seed }, uGain: { value: gain }, uHue: { value: hue }, uR: { value: R },
      },
      vertexShader: /* glsl */`
        attribute vec2 auv;
        uniform float uTime, uPole, uTheta, uH, uSeed, uR;
        varying vec2 vUv; varying vec3 vWorld; varying float vPhi; varying vec3 vCenter;
        void main(){
          float u = auv.x, v = auv.y;
          float phi = u*6.2831853;
          float t = uTime;
          float wob = sin(phi*3.0 + uSeed + t*0.05)*0.045
                    + sin(phi*7.0 - t*0.11 + uSeed*2.3)*0.022
                    + sin(phi*15.0 + t*0.35 + uSeed)*0.009
                    + sin(phi*31.0 - t*0.8 + uSeed*4.0)*0.0035;
          // pliegues ondulantes que viajan a lo largo de la cortina
          float fold = sin(phi*46.0 + t*0.9 + sin(phi*5.0+t*0.3)*2.0)*0.004;
          float lean = v*0.035*sin(phi*4.0 + t*0.13 + uSeed);
          float th = uTheta + wob + fold + lean;
          float r = uR + 1.6 + v*uH*(0.85+0.15*sin(phi*9.0+t*0.4+uSeed));
          vec3 pos = r*vec3(sin(th)*cos(phi), uPole*cos(th), sin(th)*sin(phi));
          vUv = auv; vPhi = phi; vCenter = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
          vec4 w = modelMatrix*vec4(pos,1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uSeed, uGain, uHue; uniform vec3 uSun;
        varying vec2 vUv; varying vec3 vWorld; varying float vPhi; varying vec3 vCenter;
        float h11(float x){ return fract(sin(x*127.1+uSeed*13.7)*43758.5453); }
        float vn(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(h11(i),h11(i+1.0),f); }
        void main(){
          float u = vUv.x, v = vUv.y, t = uTime;
          // rayos verticales finos (estrías)
          float rays = vn(u*260.0 + t*0.7)*0.55 + vn(u*640.0 - t*1.6)*0.30 + vn(u*1500.0 + t*2.5)*0.15;
          rays = pow(rays, 2.2)*2.2 + 0.12;
          // paquetes de brillo que viajan por la cortina
          float pulse = 0.25 + 0.75*smoothstep(0.25, 0.9, 0.5+0.5*sin(u*6.2831853*5.0 - t*0.35 + uSeed) * (0.6+0.4*vn(u*18.0 + t*0.25)) + 0.25*vn(u*40.0 - t*0.5));
          // perfil vertical: borde inferior nítido, desvanecimiento hacia arriba
          float bottom = smoothstep(0.0, 0.06, v);
          float prof = bottom * (exp(-v*2.4)*1.0 + 0.35*smoothstep(1.0,0.45,v)) * smoothstep(1.0, 0.7, v);
          // color: verde abajo -> cian -> violeta -> rosa arriba
          vec3 green = vec3(0.10, 1.00, 0.38);
          vec3 cyan  = vec3(0.05, 0.85, 1.00);
          vec3 viol  = vec3(0.55, 0.22, 1.00);
          vec3 pink  = vec3(1.00, 0.25, 0.65);
          float hv = clamp(v + uHue*0.35 + 0.18*(vn(u*9.0 + t*0.1)-0.5), 0.0, 1.0);
          vec3 col = mix(green, cyan, smoothstep(0.10, 0.38, hv));
          col = mix(col, viol, smoothstep(0.38, 0.66, hv));
          col = mix(col, pink, smoothstep(0.66, 0.95, hv));
          // borde inferior con un toque rosado intenso (emisión de N2)
          col = mix(col, vec3(1.0,0.35,0.7), (1.0-smoothstep(0.0,0.05,v))*0.6);
          // brillo extra cuando la lámina se ve de canto
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          vec3 V = normalize(cameraPosition - vWorld);
          float facing = abs(dot(n, V));
          float edge = clamp(1.0/(facing*1.4 + 0.35), 0.6, 2.6);
          // más visibles en la noche
          vec3 C = vCenter;
          float sd = dot(normalize(vWorld - C), normalize(uSun));
          float night = mix(1.0, 0.38, smoothstep(-0.25, 0.45, sd));
          float I = rays * pulse * prof * edge * night * uGain;
          gl_FragColor = vec4(col*I, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(curtainGeo, mat);
    m.frustumCulled = false;
    m.renderOrder = 2;
    return m;
  }
  const auroras = new THREE.Group();
  for (const pole of [1, -1]) {
    const s = pole > 0 ? 0 : 10;
    auroras.add(makeCurtain(pole, 0.37, 20.0, 1.3 + s, 1.8, 0.0));
    auroras.add(makeCurtain(pole, 0.30, 14.0, 4.7 + s, 1.1, 0.2));
    auroras.add(makeCurtain(pole, 0.45, 28.0, 8.1 + s, 0.7, 0.5));
  }
  tilt.add(auroras);

  // ---------------------------------------------------------------- géiseres criovolcánicos
  const geyserUniforms = { uTime: { value: 0 }, uSun: { value: sun.clone() } };
  {
    const vents = [
      [-0.78, 0.4], [-0.82, 0.9], [-0.75, 1.5], [-0.85, 2.1], // "rayas de tigre" australes
      [0.15, 3.6], [-0.2, 5.1],
    ];
    const per = 700;
    const n = vents.length * per;
    const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    let k = 0;
    for (const [la, lo] of vents) {
      const latA = Math.asin(la);
      const base = new THREE.Vector3(Math.cos(latA) * Math.cos(lo), Math.sin(latA), Math.cos(latA) * Math.sin(lo));
      for (let i = 0; i < per; i++, k++) {
        pos.set([base.x * R, base.y * R, base.z * R], k * 3);
        dir.set([base.x, base.y, base.z], k * 3);
        rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], k * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('adir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('arnd', new THREE.BufferAttribute(rnd, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.4);
    const mat = new THREE.ShaderMaterial({
      uniforms: geyserUniforms,
      vertexShader: /* glsl */`
        attribute vec3 adir; attribute vec4 arnd;
        uniform float uTime; uniform vec3 uSun;
        varying float vA; varying float vLit;
        void main(){
          float life = fract(uTime*0.06*(0.7+0.6*arnd.w) + arnd.x);
          vec3 up = normalize(adir);
          vec3 t1 = normalize(cross(up, vec3(0.3,1.0,0.2)));
          vec3 t2 = cross(up, t1);
          float a = arnd.y*6.2831853;
          float spread = life*(0.9 + 3.2*arnd.z);
          float hgt = life*(9.0 + 7.0*arnd.w) - life*life*3.0;
          vec3 p = position + up*(0.3 + hgt) + (t1*cos(a)+t2*sin(a))*spread;
          vec4 w = modelMatrix*vec4(p,1.0);
          vec4 mv = viewMatrix*w;
          gl_Position = projectionMatrix*mv;
          gl_PointSize = clamp(260.0*(0.35+life*1.4)/(-mv.z), 1.0, 40.0);
          vA = (1.0-life)*smoothstep(0.0,0.08,life);
          vec3 C = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
          vec3 wn = normalize(w.xyz - C);
          // el penacho brilla al sol incluso más allá del terminador (está alto)
          vLit = smoothstep(-0.35, 0.2, dot(wn, normalize(uSun)));
          // dispersión hacia delante
          vec3 V = normalize(cameraPosition - w.xyz);
          vLit *= 1.0 + 2.5*pow(max(dot(-V, normalize(uSun)),0.0), 6.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying float vLit;
        void main(){
          vec2 c = gl_PointCoord-0.5; float d = dot(c,c)*4.0;
          float a = exp(-d*3.0)*vA;
          gl_FragColor = vec4(vec3(0.55,0.80,1.0)*a*0.05*(vLit+0.03), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const geysers = new THREE.Points(g, mat);
    geysers.frustumCulled = false;
    geysers.renderOrder = 1;
    spin.add(geysers);
  }

  // ---------------------------------------------------------------- lunas heladas
  const planetCenter = new THREE.Vector3();
  function makeMoon(radius, seed, tintA, tintB, style) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: sun.clone() }, uSunCol: { value: SUN_COL.clone() }, uSeed: { value: seed },
        uPC: { value: planetCenter }, uPR: { value: R }, uA: { value: tintA }, uB: { value: tintB }, uStyle: { value: style },
      },
      vertexShader: /* glsl */`
        varying vec3 vObj; varying vec3 vWorld; varying vec3 vN;
        void main(){ vObj=position; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSun, uSunCol, uPC, uA, uB; uniform float uSeed, uPR, uStyle;
        varying vec3 vObj; varying vec3 vWorld; varying vec3 vN;
        ${NOISE}
        vec3 perturb(vec3 P, vec3 N, float h){
          vec3 sx=dFdx(P), sy=dFdy(P); vec3 r1=cross(sy,N), r2=cross(N,sx);
          float det=dot(sx,r1); vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
          return normalize(abs(det)*N-g);
        }
        void main(){
          vec3 p = normalize(vObj) + uSeed;
          float base = fbm(p*3.0, 6);
          vec3 alb = mix(uA, uB, smoothstep(-0.4,0.5,base));
          float hgt = base*0.3;
          if(uStyle < 0.5){
            // lineae tipo Europa
            float l1 = 1.0 - smoothstep(0.0, 0.06, abs(snoise(p*vec3(2.0,6.0,2.0)+fbm(p*4.0,3))));
            float l2 = 1.0 - smoothstep(0.0, 0.04, abs(snoise(p*vec3(7.0,3.0,5.0)+3.0)));
            float lin = max(l1, l2*0.8);
            alb = mix(alb, vec3(0.45,0.30,0.32), lin*0.6);
            hgt += lin*0.15;
          } else {
            // cráteres
            float cr = 0.0;
            for(int i=0;i<3;i++){
              float s = 4.0*pow(2.2,float(i));
              vec3 q = p*s; vec3 ci=floor(q), f=fract(q);
              vec3 o = hash33(ci)*0.6+0.2; float d = length(f-o);
              float rr = 0.18+0.2*hash13(ci+5.0);
              float bowl = smoothstep(rr, rr*0.6, d);
              float rim = smoothstep(rr*0.7, rr, d)*smoothstep(rr*1.35, rr, d);
              cr += (rim*0.6 - bowl*0.8)/(1.0+float(i));
              alb *= 1.0 - bowl*0.08 + rim*0.06;
            }
            hgt += cr*0.4;
          }
          vec3 Ng = normalize(vN);
          vec3 N = perturb(vWorld, Ng, hgt);
          vec3 L = normalize(uSun);
          float d = max(dot(N,L),0.0)*smoothstep(-0.05,0.1,dot(Ng,L));
          // eclipse: sombra del planeta
          vec3 oc = vWorld - uPC; float b = dot(oc, L); float c = dot(oc,oc) - uPR*uPR;
          float disc = b*b - c; float shadow = 1.0;
          if(b < 0.0 && disc > 0.0){
            float closest = sqrt(max(dot(oc,oc)-b*b,0.0));
            shadow = smoothstep(uPR*0.96, uPR*1.06, closest);
          }
          vec3 V = normalize(cameraPosition - vWorld);
          float rim = pow(1.0-max(dot(Ng,V),0.0),4.0);
          vec3 col = alb*uSunCol*d*shadow*0.9;
          col += vec3(0.05,0.3,0.45)*smoothstep(-0.2,0.5,dot(Ng,L))*0.06*shadow; // subsuperficie
          col += vec3(0.004,0.006,0.012); // luz reflejada por Gélida
          col += vec3(0.3,0.6,0.8)*rim*0.05*smoothstep(-0.2,0.4,dot(Ng,L));
          gl_FragColor = vec4(col,1.0);
        }`,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  }
  const moonA = makeMoon(5.2, 3.7, new THREE.Color(0.62, 0.72, 0.80), new THREE.Color(0.88, 0.92, 0.95), 0);
  const moonB = makeMoon(3.4, 11.2, new THREE.Color(0.45, 0.50, 0.60), new THREE.Color(0.75, 0.80, 0.88), 1);
  const orbitA = new THREE.Group(); orbitA.rotation.z = 0.06;
  const orbitB = new THREE.Group(); orbitB.rotation.z = -0.12; orbitB.rotation.x = 0.05;
  orbitA.add(moonA); orbitB.add(moonB);
  tilt.add(orbitA, orbitB);
  const MOON_A = { r: 112, w: 0.045, ph: 2.1 }; // fase elegida para que se vean de inicio
  const MOON_B = { r: 152, w: -0.028, ph: 4.0 };

  // ---------------------------------------------------------------- update
  const tmp = new THREE.Vector3();
  function update(dt, t) {
    const spinA = t * 0.012;
    spin.rotation.y = spinA;
    surfUniforms.uTime.value = t;
    surfUniforms.uSpin.value = spinA;
    auroraUniforms.uTime.value = t;
    geyserUniforms.uTime.value = t;
    const a = MOON_A.ph + t * MOON_A.w, b = MOON_B.ph + t * MOON_B.w;
    moonA.position.set(Math.cos(a) * MOON_A.r, 0, Math.sin(a) * MOON_A.r);
    moonB.position.set(Math.cos(b) * MOON_B.r, 0, Math.sin(b) * MOON_B.r);
    moonA.rotation.y = -a; moonB.rotation.y = -b; // acoplamiento de marea
    root.getWorldPosition(tmp); planetCenter.copy(tmp);
  }
  update(0, 0);

  return {
    object: root,
    radius: R,
    viewDistance: 290,
    info: {
      nombre: 'Gélida',
      tipo: 'Mundo helado con auroras',
      descripcion: 'Un planeta de glaciares sin fin, surcado por grietas de un cian profundo donde la luz se hunde y vuelve a salir convertida en resplandor. Sus mares de metano congelado brillan como vidrio oscuro, y en ambos polos danzan cortinas de aurora verdes, violetas y rosadas que tiñen la noche eterna del hielo.',
      datos: [
        ['Gravedad', '0,82 g'],
        ['Temperatura media', '−188 °C'],
        ['Día', '31 h 12 min'],
        ['Atmósfera', 'Nitrógeno y neón, tenue'],
        ['Espesor del hielo', '≈ 140 km'],
        ['Lunas', 'Nívea y Escarcha'],
      ],
      estrella: { nombre: 'Albor Pálido', color: 0xdbe8ff },
    },
    update,
  };
}
