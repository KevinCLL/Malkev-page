// BRASA MENOR — mundo volcánico de lava junto a una enana roja-anaranjada.
// Módulo procedural (Three.js r160). Sin imports: THREE llega por parámetro.

export default function create(THREE, { sunDir }) {
  const R = 60;
  const RING_IN = 1.55, RING_OUT = 2.35;          // en radios planetarios
  const ATM_R = R * 1.12, ATM_H = R * 0.04;
  const NV = 7;                                    // número de volcanes activos

  // ---------- RNG determinista ----------
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const sun = sunDir.clone().normalize();
  const SUN_COL = new THREE.Vector3(1.0, 0.56, 0.33).multiplyScalar(2.7);

  // ---------- Volcanes ----------
  const volcDirs = [];
  const volcParams = [];
  for (let i = 0; i < NV; i++) {
    const v = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.8, rnd() * 2 - 1).normalize();
    volcDirs.push(v);
    volcParams.push({ w: 0.25 + rnd() * 0.5, ph: rnd() * 6.283, base: 0.25 + rnd() * 0.45 });
  }
  // asegurar un volcán claramente visible desde las vistas típicas y otro en el lado nocturno
  volcDirs[0].set(0.55, 0.35, 0.76).normalize();
  volcDirs[1].set(-0.75, 0.15, -0.55).normalize();
  volcDirs[2].set(0.1, -0.25, 0.96).normalize();
  volcParams[0].base = 0.8; volcParams[1].base = 0.75;
  const volcUniform = volcDirs.map(v => new THREE.Vector4(v.x, v.y, v.z, 1));

  // ---------- GLSL compartido ----------
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
  float fbm3(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<3;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5;} return s; }
  float fbm4(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5;} return s; }
  float fbm6(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*snoise(p); p=p*2.07+vec3(5.3,1.1,7.7); a*=0.5;} return s; }
  float ridged4(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ float n=1.0-abs(snoise(p)); s+=a*n*n; p=p*2.11+vec3(3.3,7.1,1.9); a*=0.5;} return s; }
  vec3 hash33(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
  float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
  // Voronoi: x=F1, y=F2, z=id hash
  vec3 voronoi(vec3 x){
    vec3 i=floor(x), f=fract(x); float F1=8.0, F2=8.0; vec3 id=vec3(0.0);
    for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int l=-1;l<=1;l++){
      vec3 g=vec3(float(l),float(j),float(k)); vec3 o=hash33(i+g);
      vec3 r=g+o-f; float d=dot(r,r);
      if(d<F1){F2=F1;F1=d;id=i+g;} else if(d<F2){F2=d;}
    }
    return vec3(sqrt(F1),sqrt(F2),hash13(id));
  }
  // rampa de cuerpo negro (HDR lineal)
  vec3 lavaCol(float T){
    T=clamp(T,0.0,1.2);
    vec3 c=mix(vec3(0.0), vec3(0.45,0.02,0.005), smoothstep(0.0,0.22,T));
    c=mix(c, vec3(1.7,0.26,0.02), smoothstep(0.18,0.5,T));
    c=mix(c, vec3(3.2,1.1,0.14), smoothstep(0.45,0.8,T));
    c=mix(c, vec3(5.5,3.8,1.6), smoothstep(0.8,1.1,T));
    return c;
  }
  float ringDensity(float r){ // r en radios planetarios
    float base=smoothstep(${RING_IN.toFixed(3)},${(RING_IN + 0.07).toFixed(3)},r)*smoothstep(${RING_OUT.toFixed(3)},${(RING_OUT - 0.2).toFixed(3)},r);
    float b=0.5+0.5*sin(r*83.0+sin(r*21.0)*3.0);
    float b2=0.5+0.5*sin(r*211.0+sin(r*57.0)*2.0);
    float d=base*(0.25+0.55*b*b+0.35*b2);
    d*=1.0-0.88*exp(-pow((r-1.93)/0.022,2.0));
    d*=1.0-0.5*exp(-pow((r-1.72)/0.012,2.0));
    d*=mix(1.0,0.45,smoothstep(2.05,2.3,r));
    return clamp(d,0.0,1.0);
  }
  `;

  const object = new THREE.Group();
  const spin = new THREE.Group();   // rotación propia lenta
  spin.rotation.z = 0.18;
  object.add(spin);

  // Ring orientation (top-level, no spin)
  const ringGroup = new THREE.Group();
  ringGroup.rotation.set(-Math.PI / 2 + 0.42, 0.0, 0.22);
  object.add(ringGroup);
  ringGroup.updateMatrixWorld(true);
  const ringNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(ringGroup.quaternion).normalize();

  // ================= SUPERFICIE =================
  const surfUniforms = {
    uTime: { value: 0 },
    uSun: { value: sun },
    uSunCol: { value: SUN_COL },
    uVolc: { value: volcUniform },
    uRingN: { value: ringNormal },
    uR: { value: R },
  };
  const surfMat = new THREE.ShaderMaterial({
    uniforms: surfUniforms,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter;
      void main(){
        vObj = normalize(position); vCenter = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vec4 w = modelMatrix*vec4(position,1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec4 uVolc[${NV}];
      uniform vec3 uRingN; uniform float uR;
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter;
      ${NOISE}
      void main(){
        vec3 p = normalize(vObj);
        float t = uTime;
        vec3 center = vCenter;

        // --- deformación de dominio para placas orgánicas ---
        vec3 q = p*1.7;
        vec3 warp = vec3(fbm3(q+vec3(0.0,3.1,7.2)), fbm3(q+vec3(5.2,1.3,2.8)), fbm3(q+vec3(9.1,4.7,0.4)));
        vec3 pc = p*3.2 + warp*0.55;

        // --- grietas mayores (bordes de placa) ---
        vec3 vo = voronoi(pc);
        float edge = vo.y - vo.x;
        float plateId = vo.z;
        // --- grietas secundarias ---
        vec3 vo2 = voronoi(pc*2.6 + vec3(11.0,3.0,7.0) + warp*0.6);
        float edge2 = vo2.y - vo2.x;
        float fracMask = smoothstep(-0.15, 0.25, snoise(p*2.3+vec3(4.0)) + (plateId-0.5)*0.6);
        // --- microgrietas (detalle cercano) ---
        vec3 vo3 = voronoi(pc*8.5 + vec3(2.0,9.0,1.0));
        float edge3 = vo3.y - vo3.x;

        // ancho de grieta variable a lo largo del borde
        float wN = snoise(pc*2.2 + vec3(0.0,0.0,t*0.01));
        float w1 = 0.028 + 0.022*wN;
        float crack1 = 1.0 - smoothstep(0.0, max(w1,0.012), edge);
        float glow1 = exp(-edge/0.035);
        float crack2 = (1.0 - smoothstep(0.0, 0.026, edge2)) * fracMask;
        float glow2 = exp(-edge2/0.02) * fracMask;
        float crack3 = (1.0 - smoothstep(0.0, 0.035, edge3)) * fracMask * 0.6;

        // --- lagos de lava ---
        float lakeN = fbm4(p*1.25 + vec3(7.0,2.0,5.0));
        float lake = smoothstep(0.36, 0.40, lakeN);
        float shore = smoothstep(0.33, 0.37, lakeN) - lake;

        // --- volcanes ---
        float cone = 0.0, caldera = 0.0, channels = 0.0, sulfur = 0.0, ash = 0.0;
        for(int i=0;i<${NV};i++){
          vec3 vd = uVolc[i].xyz; float act = uVolc[i].w;
          float d = length(p - vd);
          cone += exp(-d*d/0.012) * 1.0;
          caldera += (1.0 - smoothstep(0.018, 0.034, d)) * (0.45 + 0.65*act);
          // canales radiales en los flancos
          vec3 tg = normalize(cross(vd, abs(vd.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
          vec3 bt = cross(vd, tg);
          vec3 lp = p - vd;
          float ang = atan(dot(lp,bt), dot(lp,tg));
          float rr = d;
          float ch = pow(abs(sin(ang*4.5 + snoise(vec3(ang*1.3, rr*14.0, float(i)))*1.6 + rr*9.0)), 28.0);
          channels += ch * smoothstep(0.30, 0.03, d) * smoothstep(0.015, 0.04, d) * (0.4 + 0.6*act);
          sulfur += smoothstep(0.11, 0.05, d) * smoothstep(0.03, 0.06, d);
          ash += smoothstep(0.42, 0.08, d);
        }

        // --- flujo animado (lava viva) ---
        vec3 fp = pc*3.0;
        float flowA = snoise(fp + vec3(t*0.10, -t*0.07, t*0.05));
        float flowB = snoise(fp*2.3 + vec3(-t*0.13, t*0.11, -t*0.06));
        float flow = 0.5 + 0.32*flowA + 0.18*flowB;
        float shimmer = 0.04*snoise(p*60.0 + vec3(0.0, t*1.7, 0.0));

        // --- temperatura ---
        float T = 0.0;
        float seg = smoothstep(0.25, 0.6, flow);
        T = max(T, crack1 * (0.38 + 0.55*seg) + shimmer);
        T = max(T, glow1 * 0.2);
        T = max(T, crack2 * (0.22 + 0.45*seg));
        T = max(T, glow2 * 0.16);
        T = max(T, crack3 * (0.16 + 0.2*flow));
        // lago: costras flotantes que derivan
        vec3 lk = p*9.0 + vec3(t*0.035, t*0.012, -t*0.028) + warp*0.8;
        float skinN = fbm4(lk);
        vec3 vlk = voronoi(lk*0.9 + vec3(0.0, t*0.02, 0.0));
        float skin = smoothstep(0.02, 0.22, vlk.y - vlk.x) * smoothstep(-0.25, 0.25, skinN);
        float lakeT = mix(0.84 + 0.12*flowA, 0.30 + 0.15*flowB, skin);
        T = mix(T, max(T,lakeT), lake);
        T = max(T, shore * 0.55);
        T = max(T, clamp(caldera,0.0,1.0) * (0.95 + 0.15*flowA));
        T = max(T, channels * (0.55 + 0.35*flow));

        // --- altura para relieve ---
        float detail = fbm6(p*22.0 + warp);
        float ridge = ridged4(p*7.0 + warp*1.3);
        float h = 0.0;
        h += (plateId-0.5)*0.35;                  // placas a distinta altura
        h += smoothstep(0.0, 0.18, edge)*0.9;     // borde elevado, grieta hundida
        h += smoothstep(0.0, 0.08, edge2)*0.35*fracMask;
        h += smoothstep(0.0, 0.06, edge3)*0.15*fracMask;
        h += ridge*0.55 + detail*0.22;
        h += cone*2.2 - clamp(caldera,0.0,1.0)*1.6;
        h = mix(h, 0.05 + skin*0.25, lake);

        // --- normal perturbada (bump por derivadas de pantalla) ---
        vec3 N = normalize(vN);
        vec3 dpdx = dFdx(vWorld), dpdy = dFdy(vWorld);
        float dhdx = dFdx(h), dhdy = dFdy(h);
        vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
        float det = dot(dpdx, r1);
        vec3 grad = sign(det)*(dhdx*r1 + dhdy*r2);
        vec3 Nb = normalize(abs(det)*N - grad*0.35);

        // --- albedo ---
        vec3 basalt = mix(vec3(0.014,0.012,0.014), vec3(0.042,0.034,0.034), smoothstep(-0.4,0.6,detail+ridge*0.6));
        basalt *= 0.75 + 0.5*plateId;
        basalt = mix(basalt, vec3(0.035,0.026,0.045), smoothstep(0.3,0.9,ridge)*0.6); // ceniza violácea
        vec3 sulfurC = vec3(0.30,0.24,0.05);
        float sulfurAmt = clamp(sulfur,0.0,1.0) * smoothstep(-0.2,0.5,detail) * 0.75;
        sulfurAmt += smoothstep(0.55,0.9, snoise(p*5.0+vec3(3.0))) * 0.25 * (1.0-lake); // fumarolas dispersas
        vec3 albedo = mix(basalt, sulfurC, clamp(sulfurAmt,0.0,1.0));
        albedo = mix(albedo, vec3(0.02,0.015,0.02), clamp(ash,0.0,1.0)*0.35); // tefra oscura
        albedo = mix(albedo, vec3(0.06,0.03,0.02), lake*skin); // costra del lago
        albedo *= (1.0 - smoothstep(0.35,0.7,T));               // donde hay lava, no hay roca reflejante

        // --- iluminación ---
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uSun);
        float ndlGeom = dot(N, L);
        float terminator = smoothstep(-0.12, 0.22, ndlGeom);
        float diff = max(dot(Nb, L), 0.0);
        // sombra de los anillos sobre el planeta
        vec3 P = vWorld - center;
        float denom = dot(L, uRingN);
        float ringShadow = 1.0;
        if(abs(denom) > 1e-3){
          float s = -dot(P, uRingN)/denom;
          if(s > 0.0){
            vec3 Q = P + s*L;
            float rr = length(Q)/uR;
            ringShadow = 1.0 - 0.75*ringDensity(rr);
          }
        }
        vec3 Hh = normalize(L + V);
        float gloss = mix(40.0, 140.0, lake);
        float specAmt = mix(0.06, 0.35, lake*skin) * (1.0 - smoothstep(0.3,0.6,T));
        float spec = pow(max(dot(Nb,Hh),0.0), gloss) * specAmt * (gloss+8.0)/25.0;
        float fres = pow(1.0 - max(dot(N,V),0.0), 5.0);

        vec3 col = albedo * uSunCol * diff * terminator * ringShadow;
        col += uSunCol * spec * terminator * ringShadow;
        // luz ambiente: reflejo violáceo del cielo + resplandor rojo de la propia lava
        col += albedo * vec3(0.05,0.025,0.07);
        float localHeat = clamp(exp(-edge/0.1)*0.5 + glow2*0.3 + shore + clamp(ash*0.3,0.0,0.5)*0.3, 0.0, 1.5);
        col += albedo * vec3(1.0,0.25,0.06) * localHeat * 0.9;

        // --- emisión ---
        vec3 em = lavaCol(T);
        // menor contraste en el lado diurno (la luz del sol compite), pero siempre ardiente
        em *= mix(1.0, 0.7, terminator);
        // los bordes de grietas vistos de canto se ocultan un poco
        em *= mix(1.0, 0.65, fres);
        col += em;

        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  surfMat.extensions = { derivatives: true };
  const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), surfMat);
  spin.add(surface);

  // ================= ERUPCIONES (partículas) =================
  const PER_V = 420, SMOKE_PER_V = 48;
  const totalE = NV * (PER_V + SMOKE_PER_V);
  const ePos = new Float32Array(totalE * 3);
  const eDir = new Float32Array(totalE * 3);
  const eSeed = new Float32Array(totalE * 4);
  const eMeta = new Float32Array(totalE * 2); // x: volcán, y: tipo (0 bomba, 1 humo)
  let k = 0;
  for (let v = 0; v < NV; v++) {
    for (let j = 0; j < PER_V + SMOKE_PER_V; j++, k++) {
      const d = volcDirs[v];
      eDir.set([d.x, d.y, d.z], k * 3);
      ePos.set([d.x * R, d.y * R, d.z * R], k * 3);
      eSeed.set([rnd(), rnd(), rnd(), rnd()], k * 4);
      eMeta.set([v, j < PER_V ? 0 : 1], k * 2);
    }
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('aDir', new THREE.BufferAttribute(eDir, 3));
  eGeo.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 4));
  eGeo.setAttribute('aMeta', new THREE.BufferAttribute(eMeta, 2));
  eGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.6);
  const eUniforms = {
    uTime: { value: 0 }, uR: { value: R }, uPx: { value: 600 },
    uVolc: { value: volcUniform }, uSun: { value: sun },
  };
  const eMat = new THREE.ShaderMaterial({
    uniforms: eUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aDir; attribute vec4 aSeed; attribute vec2 aMeta;
      uniform float uTime, uR, uPx; uniform vec4 uVolc[${NV}];
      varying float vHeat; varying float vAlpha; varying float vType;
      void main(){
        int vi = int(aMeta.x + 0.5);
        float act = uVolc[vi].w;
        vec3 up = normalize(aDir);
        vec3 t1 = normalize(cross(up, abs(up.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
        vec3 t2 = cross(up, t1);
        float a = aSeed.z*6.28318;
        vec3 lat = cos(a)*t1 + sin(a)*t2;
        vec3 pos; float size; float heat; float alpha;
        vType = aMeta.y;
        if(aMeta.y < 0.5){
          // bombas de lava balísticas
          float P = 2.2 + aSeed.x*2.6;
          float tau = fract(uTime/P + aSeed.y);
          float T = tau*P;
          float v0 = (5.0 + 13.0*pow(aSeed.w,1.6)) * (0.55 + 0.6*act);
          float spread = 0.08 + 0.45*fract(aSeed.x*17.31);
          vec3 vel = up*v0 + lat*v0*spread;
          float g = 9.5;
          pos = up*(uR*0.992) + vel*T - up*(0.5*g*T*T);
          float hgt = dot(pos, up) - uR*0.99;
          alpha = smoothstep(0.0, 0.4, hgt) * smoothstep(0.0, 0.05, tau);
          float alive = step(fract(aSeed.x*13.7 + aSeed.w*3.1), act*1.1);
          alpha *= alive;
          heat = 1.05 - tau*0.75;
          size = 0.35 + 0.9*fract(aSeed.w*7.7);
        } else {
          // columna de gas y ceniza iluminada desde abajo
          float P = 7.0 + aSeed.x*5.0;
          float tau = fract(uTime/P + aSeed.y);
          float hgt = (3.0 + 20.0*act) * pow(tau, 0.6);
          float rad = (0.5 + 7.0*tau*tau) * (0.4 + aSeed.w);
          float sw = uTime*0.3 + aSeed.z*6.28;
          vec3 lat2 = cos(a+sw*0.2)*t1 + sin(a+sw*0.2)*t2;
          pos = up*(uR + hgt) + lat2*rad;
          alpha = smoothstep(0.0, 0.15, tau) * (1.0 - smoothstep(0.5, 1.0, tau)) * (0.3 + 0.7*act);
          heat = 0.55 - tau*0.4;
          size = 3.0 + 9.0*tau;
        }
        vHeat = heat; vAlpha = alpha;
        vec4 mv = modelViewMatrix*vec4(pos,1.0);
        float ps = size*uPx/max(-mv.z, 1.0);
        // evitar parpadeo subpíxel: compensar con brillo
        vAlpha *= clamp(ps/1.5, 0.0, 1.0) * clamp(ps/1.5, 0.0, 1.0) * 0.5 + 0.5*min(ps/1.5,1.0);
        gl_PointSize = max(ps, 1.5);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vHeat; varying float vAlpha; varying float vType;
      vec3 lavaC(float T){
        T=clamp(T,0.0,1.2);
        vec3 c=mix(vec3(0.0), vec3(0.45,0.02,0.005), smoothstep(0.0,0.22,T));
        c=mix(c, vec3(1.7,0.26,0.02), smoothstep(0.18,0.5,T));
        c=mix(c, vec3(3.2,1.1,0.14), smoothstep(0.45,0.8,T));
        c=mix(c, vec3(5.5,3.8,1.6), smoothstep(0.8,1.1,T));
        return c;
      }
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c,c)*4.0;
        if(r2 > 1.0) discard;
        float a;
        vec3 col;
        if(vType < 0.5){
          a = exp(-r2*3.5);
          col = lavaC(vHeat) * 0.6;
        } else {
          a = exp(-r2*2.5) * 0.12;
          col = mix(vec3(0.9,0.22,0.06), vec3(0.35,0.12,0.25), 1.0 - vHeat*1.6);
        }
        gl_FragColor = vec4(col * a * vAlpha, 1.0);
      }`,
  });
  const eruptions = new THREE.Points(eGeo, eMat);
  eruptions.frustumCulled = false;
  eruptions.renderOrder = 3;
  spin.add(eruptions);

  // ================= ATMÓSFERA (ceniza y azufre) =================
  const atmUniforms = {
    uSun: { value: sun }, uSunCol: { value: SUN_COL }, uTime: { value: 0 },
    uR: { value: R }, uRa: { value: ATM_R }, uH: { value: ATM_H },
  };
  const atmMat = new THREE.ShaderMaterial({
    uniforms: atmUniforms,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vCenter;
      void main(){ vCenter = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uSun, uSunCol; uniform float uTime, uR, uRa, uH;
      varying vec3 vWorld; varying vec3 vCenter;
      float vhash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(vhash(i),vhash(i+vec3(1,0,0)),f.x),mix(vhash(i+vec3(0,1,0)),vhash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(vhash(i+vec3(0,0,1)),vhash(i+vec3(1,0,1)),f.x),mix(vhash(i+vec3(0,1,1)),vhash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 center = vCenter;
        vec3 ro = cameraPosition - center;
        vec3 rd = normalize(vWorld - cameraPosition);
        float b = dot(ro, rd);
        float c = dot(ro,ro) - uRa*uRa;
        float disc = b*b - c;
        if(disc <= 0.0) discard;
        float sq = sqrt(disc);
        float t0 = max(-b - sq, 0.0), t1 = -b + sq;
        float cp = dot(ro,ro) - uR*uR; float dp = b*b - cp;
        bool hitP = false;
        if(dp > 0.0){ float tp = -b - sqrt(dp); if(tp > 0.0){ t1 = min(t1, tp); hitP = true; } }
        if(t1 <= t0) discard;
        vec3 L = normalize(uSun);
        float mu = dot(rd, L);
        float phaseM = 0.35*(1.0-0.55*0.55)/pow(1.0+0.55*0.55-2.0*0.55*mu, 1.5)/12.566;
        float phaseR = 0.0597*(1.0+mu*mu);
        const int STEPS = 12;
        float ds = (t1 - t0)/float(STEPS);
        vec3 acc = vec3(0.0); float tau = 0.0;
        for(int i=0;i<STEPS;i++){
          vec3 pos = ro + rd*(t0 + (float(i)+0.5)*ds);
          float r = length(pos);
          float h = max(r - uR, 0.0);
          vec3 up = pos/r;
          float turb = 0.75 + 0.5*vnoise(up*9.0 + vec3(uTime*0.05, -uTime*0.03, uTime*0.04));
          float dens = exp(-h/uH) * turb;
          float sunVis = smoothstep(-0.28, 0.25, dot(up, L));
          // color: ceniza ámbar-carmesí abajo, velo violáceo en altura
          float hn = clamp(h/(uRa-uR), 0.0, 1.0);
          vec3 sc = mix(vec3(1.0,0.36,0.12), vec3(0.55,0.20,0.55), smoothstep(0.15,0.8,hn));
          vec3 sunS = uSunCol * sc * (phaseR*1.4 + phaseM*2.2) * sunVis;
          // resplandor de lava reflejado por la ceniza (lado nocturno incluido)
          vec3 lavaGlow = vec3(1.0,0.22,0.04) * 0.055 * exp(-h/(uH*0.55));
          vec3 trans = vec3(exp(-tau));
          acc += (sunS + lavaGlow) * dens * ds * trans;
          tau += dens * ds * 0.035;
        }
        acc *= 0.022;
        float alpha = (1.0 - exp(-tau)) * 0.35;
        gl_FragColor = vec4(acc, alpha);
      }`,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(ATM_R, 128, 64), atmMat);
  atmosphere.renderOrder = 2;
  object.add(atmosphere);

  // ================= ANILLO DE EYECTA =================
  const ringUniforms = {
    uSun: { value: sun }, uSunCol: { value: SUN_COL }, uR: { value: R }, uTime: { value: 0 },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vCenter;
      void main(){ vCenter = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vLocal = position; vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uSun, uSunCol; uniform float uR, uTime;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vCenter;
      ${NOISE}
      void main(){
        float r = length(vLocal.xy)/uR;
        float ang = atan(vLocal.y, vLocal.x);
        float dens = ringDensity(r);
        // grumos azimutales lentos
        float omega = 0.02*pow(r, -1.5);
        float clump = 0.75 + 0.5*snoise(vec3(cos(ang-uTime*omega)*r*6.0, sin(ang-uTime*omega)*r*6.0, r*30.0));
        dens *= clump;
        if(dens < 0.003) discard;
        vec3 center = vCenter;
        vec3 P = vWorld - center;
        vec3 L = normalize(uSun);
        // sombra del planeta
        float along = dot(P, L);
        float perp = length(P - along*L);
        float shadow = along < 0.0 ? smoothstep(uR*0.97, uR*1.06, perp) : 1.0;
        vec3 V = normalize(cameraPosition - vWorld);
        float mu = dot(-V, L);
        float forward = 0.5 + 1.6*pow(max(mu,0.0), 6.0);
        vec3 dust = mix(vec3(0.32,0.17,0.13), vec3(0.24,0.14,0.26), smoothstep(1.8,2.3,r));
        vec3 col = dust * uSunCol * 0.45 * forward * shadow;
        // calor residual: eyecta todavía incandescente cerca del borde interior
        float hot = smoothstep(1.85, 1.56, r);
        col += lavaCol(0.25 + 0.2*hot) * 0.25 * hot;
        col += vec3(0.04,0.012,0.006);  // luz rojiza del planeta
        float alpha = clamp(dens*0.62, 0.0, 0.85);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(R * RING_IN, R * RING_OUT, 384, 12), ringMat);
  ringMesh.renderOrder = 1;
  ringGroup.add(ringMesh);

  // brasas orbitales (puntos incandescentes keplerianos)
  const NE = 5000;
  const emb = new Float32Array(NE * 4);
  for (let i = 0; i < NE; i++) {
    let r;
    do { r = RING_IN + rnd() * (RING_OUT - RING_IN); } while (Math.abs(r - 1.93) < 0.03 && rnd() < 0.9);
    emb.set([r, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.012, rnd()], i * 4);
  }
  const embGeo = new THREE.BufferGeometry();
  embGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NE * 3), 3));
  embGeo.setAttribute('aEmb', new THREE.BufferAttribute(emb, 4));
  embGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * RING_OUT * 1.1);
  const embUniforms = { uTime: { value: 0 }, uR: { value: R }, uPx: { value: 600 }, uSun: { value: sun } };
  const embMat = new THREE.ShaderMaterial({
    uniforms: embUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aEmb; uniform float uTime, uR, uPx;
      varying vec3 vCol; varying float vA;
      void main(){
        float r = aEmb.x;
        float ang = aEmb.y + uTime*0.035*pow(r, -1.5);
        vec3 pos = vec3(cos(ang)*r*uR, sin(ang)*r*uR, aEmb.z*uR);
        float heat = pow(aEmb.w, 3.0);
        // titileo lento de brasas que se enfrían y reavivan
        float flick = 0.7 + 0.3*sin(uTime*(0.6+aEmb.w*2.0) + aEmb.y*40.0);
        float T = 0.22 + 0.6*heat*flick + 0.15*smoothstep(1.9, 1.55, r);
        T = clamp(T, 0.0, 1.0);
        vec3 c = mix(vec3(0.35,0.03,0.01), vec3(2.4,0.5,0.06), smoothstep(0.2,0.55,T));
        c = mix(c, vec3(5.0,2.2,0.5), smoothstep(0.55,0.9,T));
        vCol = c;
        vec4 mv = modelViewMatrix*vec4(pos,1.0);
        float size = 0.18 + 0.35*aEmb.w;
        float ps = size*uPx/max(-mv.z,1.0);
        vA = min(ps/1.4, 1.0);
        gl_PointSize = max(ps, 1.4);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main(){
        vec2 c = gl_PointCoord-0.5; float r2 = dot(c,c)*4.0; if(r2>1.0) discard;
        gl_FragColor = vec4(vCol*exp(-r2*3.0)*vA*0.55, 1.0);
      }`,
  });
  const embers = new THREE.Points(embGeo, embMat);
  embers.frustumCulled = false;
  embers.renderOrder = 4;
  ringGroup.add(embers);

  // ================= API =================
  const tmp = new THREE.Vector2();
  const info = {
    nombre: 'Brasa Menor',
    tipo: 'Mundo volcánico de lava',
    descripcion: 'Una corteza de basalto negro se resquebraja en placas que flotan sobre un océano de roca fundida, y por cada grieta asoma el fuego del interior. En su cara nocturna, el planeta entero se convierte en una telaraña incandescente bajo un cielo de ceniza ámbar y carmesí. Un anillo de eyecta todavía tibia lo rodea: los restos de erupciones que escaparon a su gravedad.',
    datos: [
      ['Temperatura superficial', '1.180 °C en las grietas · 420 °C en las placas'],
      ['Gravedad', '0,83 g'],
      ['Periodo orbital', '61 horas'],
      ['Volcanes activos', 'más de 2.400 catalogados'],
      ['Atmósfera', 'dióxido de azufre, ceniza y vapor de sodio'],
      ['Anillo', 'eyecta volcánica, radio 93–141 mil km'],
    ],
    estrella: { nombre: 'Rescoldo', color: 0xff8a4a },
  };

  return {
    object,
    radius: R,
    viewDistance: 340,
    info,
    update(dt, t, ctx) {
      spin.rotation.y = t * 0.012;
      surfUniforms.uTime.value = t;
      eUniforms.uTime.value = t;
      atmUniforms.uTime.value = t;
      ringUniforms.uTime.value = t;
      embUniforms.uTime.value = t;
      for (let i = 0; i < NV; i++) {
        const p = volcParams[i];
        const s = 0.5 + 0.5 * Math.sin(t * p.w + p.ph);
        volcUniform[i].w = Math.min(1, p.base + (1 - p.base) * s * s);
      }
      if (ctx && ctx.camera && ctx.renderer) {
        ctx.renderer.getDrawingBufferSize(tmp);
        const fov = (ctx.camera.fov || 50) * Math.PI / 180;
        const px = tmp.y / (2 * Math.tan(fov / 2));
        eUniforms.uPx.value = px;
        embUniforms.uPx.value = px;
      }
    },
  };
}
