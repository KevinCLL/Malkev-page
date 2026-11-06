// OPALIA — mundo geoda cristalino. Módulo de planeta (Three.js r160), todo procedural.
export default function create(THREE, { sunDir }) {
  const R = 60;
  const BELT_IN = 92, BELT_OUT = 148;
  const ATM_R = R * 1.075;
  const SUN = sunDir.clone().normalize();

  // ---------- deterministic RNG ----------
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };

  // ---------- shared GLSL ----------
  const NOISE = /* glsl */`
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p, int oct){
    float a=0.5, s=0.;
    for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
    return s;
  }
  vec3 hash33(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
  float hash13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
  // cellular: returns (F1,F2), nearest cell id
  vec2 voronoi(vec3 x, out vec3 id){
    vec3 p=floor(x), f=fract(x); float d1=8., d2=8.; id=p;
    for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
      vec3 b=vec3(float(i),float(j),float(k));
      vec3 r=b+hash33(p+b)*0.85+0.075-f; float d=dot(r,r);
      if(d<d1){ d2=d1; d1=d; id=p+b; } else if(d<d2){ d2=d; }
    }
    return vec2(sqrt(d1), sqrt(d2));
  }
  // thin-film interference (opal / soap-film), d in nm
  vec3 thinFilm(float d, float cosV){
    float n=1.42; float sinT2=(1.-cosV*cosV)/(n*n); float cosT=sqrt(max(1.-sinT2,0.));
    vec3 ph=12.566370*n*d*cosT/vec3(650.,532.,450.);
    vec3 c=0.5-0.5*cos(ph);
    return c*c*(3.-2.*c);
  }
  // radial density of the debris belt (shared by belt dust, shadow on planet)
  float beltDensity(float r){
    float x=(r-${BELT_IN.toFixed(1)})/${(BELT_OUT - BELT_IN).toFixed(1)};
    if(x<0.||x>1.) return 0.;
    float d=smoothstep(0.,0.12,x)*smoothstep(1.,0.7,x);
    d*=0.62+0.38*sin(x*38.+sin(x*11.)*2.);
    float g1=(x-0.43)*30.; d*=1.-0.85*exp(-g1*g1);   // Cassini-like gap
    float g2=(x-0.78)*45.; d*=1.-0.6*exp(-g2*g2);
    return clamp(d,0.,1.);
  }
  `;

  const root = new THREE.Group();
  const planetPivot = new THREE.Group();   // spins (planet + spires)
  root.add(planetPivot);

  // ---------- spire cluster centres (object space unit dirs) ----------
  const clusterDirs = [];
  for (let i = 0; i < 8; i++) {
    const v = new THREE.Vector3(gauss(), gauss() * 0.7, gauss()).normalize();
    clusterDirs.push(v);
  }
  // make sure one cluster sits near the initial day side & limb for nice framing
  clusterDirs[0].set(0.55, 0.45, 0.7).normalize();
  clusterDirs[1].set(0.95, -0.15, 0.2).normalize();
  clusterDirs[2].set(-0.2, 0.6, 0.78).normalize();

  // ---------- belt orientation ----------
  const beltGroup = new THREE.Group();
  beltGroup.rotation.set(0.34, 0, 0.16);
  root.add(beltGroup);
  beltGroup.updateMatrix();
  const beltN = new THREE.Vector3(0, 1, 0).applyQuaternion(beltGroup.quaternion).normalize();

  const uTime = { value: 0 };
  const uSun = { value: SUN };
  const uRot = { value: new THREE.Matrix3() };

  // =====================================================================
  // PLANET SURFACE
  // =====================================================================
  const planetMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime, uSun, uRot,
      uBeltN: { value: beltN },
      uClusters: { value: clusterDirs },
    },
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter;
      void main(){
        vObj = position;
        vec4 w = modelMatrix*vec4(position,1.);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix)*normal);
        vCenter = (modelMatrix*vec4(0.,0.,0.,1.)).xyz;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun; uniform mat3 uRot; uniform vec3 uBeltN; uniform vec3 uClusters[8];
      varying vec3 vObj; varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter;
      ${NOISE}
      void main(){
        vec3 p = normalize(vObj);
        vec3 Ng = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = uSun;
        float camDist = length(cameraPosition - vWorld);

        // ---- domain warp & regions ----
        vec3 q = p*1.9;
        vec3 w = vec3(fbm(q+1.7,4), fbm(q+9.2,4), fbm(q+4.4,4));
        vec3 pw = p + 0.16*w;
        float region = fbm(p*1.5 + w*0.7 + 3.3, 5);
        float cryst = smoothstep(0.0, 0.3, region);
        float spireNear = 0.;
        for(int i=0;i<8;i++){ spireNear = max(spireNear, smoothstep(0.42, 0.02, distance(p, uClusters[i]))); }
        cryst = max(cryst, spireNear);

        // ---- cellular layers ----
        vec3 id0; vec2 v0 = voronoi(pw*3.1, id0);
        float rift = v0.y - v0.x;
        vec3 id1; vec2 v1 = voronoi(pw*10.5 + w*0.8, id1);
        float e1 = v1.y - v1.x;
        vec3 id2; vec2 v2 = voronoi(p*34.0 + w*0.3, id2);
        float e2 = v2.y - v2.x;
        float h0 = hash13(id0*1.37), h1 = hash13(id1), h2 = hash13(id2+7.1);

        // ---- faceted normal (flat per cell) ----
        vec3 r1 = hash33(id1*1.31+2.)*2.-1.;
        vec3 r2 = hash33(id2*0.77+5.)*2.-1.;
        float tilt1 = mix(0.10, 0.55, cryst);
        float tilt2 = mix(0.05, 0.18, cryst);
        // fade micro-facets with distance to avoid shimmer
        float far = smoothstep(260., 520., camDist);
        vec3 pert = uRot*(r1*tilt1 + r2*tilt2*(1.-far));
        vec3 N = normalize(Ng + pert - Ng*dot(pert,Ng)*0.6);
        if(dot(N,Ng) < 0.25) N = normalize(N + Ng*0.6);
        // grooves along crack edges
        float groove = 1. - smoothstep(0.0, 0.09, rift);

        // ---- albedo ----
        float grain = fbm(p*90., 3)*0.5+0.5;
        vec3 obsidian = mix(vec3(0.012,0.010,0.022), vec3(0.035,0.020,0.055), grain);
        vec3 amethyst = mix(vec3(0.07,0.025,0.15), vec3(0.18,0.07,0.32), h1);
        amethyst = mix(amethyst, vec3(0.12,0.10,0.28), smoothstep(0.75,1.,h2)*0.6);
        float facetEdge = 1. - smoothstep(0.0, 0.05, e1);
        vec3 alb = mix(obsidian, amethyst, cryst*(0.55+0.45*h1));
        alb *= 1. - 0.5*facetEdge*cryst;
        alb *= 1. - 0.6*groove;

        // ---- lighting ----
        float geo = dot(Ng, L);
        float term = smoothstep(-0.08, 0.22, geo);
        float NdL = max(dot(N, L), 0.);
        float diff = mix(NdL, max(geo,0.)*0.8+NdL*0.2, 0.25) * term;

        // belt shadow on surface
        float bShadow = 0.;
        float den = dot(L, uBeltN);
        if(abs(den) > 1e-3){
          float tt = dot(vCenter - vWorld, uBeltN)/den;
          if(tt > 0.){
            vec3 hp = vWorld + L*tt;
            float rr = length(hp - vCenter);
            bShadow = beltDensity(rr)*0.55;
          }
        }
        vec3 sunCol = vec3(0.82,0.9,1.12)*2.6*(1.-bShadow);

        vec3 H = normalize(L+V);
        float NdV = clamp(dot(N,V),0.,1.);
        float NdH = max(dot(N,H),0.);
        float VdH = clamp(dot(V,H),0.,1.);
        float filmD = 260. + 520.*fract(h1*3.7 + h2*0.35) + 120.*w.x;
        vec3 filmV = thinFilm(filmD, NdV);
        vec3 filmH = thinFilm(filmD, VdH);
        float F = 0.045 + 0.955*pow(1.-NdV, 5.);

        vec3 col = alb * sunCol * diff;
        // opalescent play-of-colour (diffuse-ish iridescence inside crystal fields)
        float opalMask = cryst*(0.35+0.65*smoothstep(0.3,0.9,h1));
        col += filmV * sunCol * diff * 0.11 * opalMask;
        // sharp crystal glints
        float specPow = mix(90., 700., cryst);
        float spec = pow(NdH, specPow) * (specPow+8.)/25.;
        col += sunCol * filmH * spec * mix(0.04, 0.22, cryst) * term;
        // broad obsidian sheen
        col += sunCol * pow(max(dot(Ng,H),0.), 40.) * 0.06 * F * 6. * term * (1.-cryst*0.5);
        // fresnel environment: lavender sky haze + dark space
        vec3 env = mix(vec3(0.010,0.006,0.022), vec3(0.06,0.04,0.12), smoothstep(-0.3,0.6,geo));
        col += env * F * mix(filmV, vec3(1.), 0.4) * 1.4;

        // ---- energy veins ----
        float flowN = snoise(p*4.0 + vec3(0., uTime*0.03, 0.));
        float pulse = 0.55 + 0.45*sin(dot(p, normalize(hash33(id0)-0.5))*26. - uTime*1.1 + h0*6.283);
        pulse *= 0.75 + 0.25*sin(uTime*0.45 + h0*12.);
        vec3 violet = vec3(0.62,0.18,1.0), cyan = vec3(0.16,0.85,1.0);
        vec3 vcol = mix(violet, cyan, smoothstep(-0.4,0.6,flowN + (h0-0.5)));
        float veinW = 0.030*(0.7+0.6*snoise(p*9.+5.));
        float vein = 1. - smoothstep(0.0, veinW, rift);
        float core = 1. - smoothstep(0.0, veinW*0.3, rift);
        float halo = 1. - smoothstep(0.0, 0.16, rift);
        float riftOn = smoothstep(-0.35, 0.1, snoise(id0*0.7 + 2.));  // some rifts dormant
        // small veins between facets in crystal fields
        float subOn = smoothstep(0.35, 0.75, snoise(pw*6. + 11.)) * (0.4 + 0.6*cryst);
        float sub = (1. - smoothstep(0.0, 0.022, e1)) * subOn;
        float subPulse = 0.5+0.5*sin(uTime*0.8 + h1*30. + dot(p,vec3(13.,7.,-9.)));
        vec3 emis = vcol * (vein*0.9 + core*3.2) * pulse * riftOn;
        emis += vcol * halo*halo * 0.10 * riftOn * (0.6+0.4*pulse);
        emis += mix(vcol, vec3(0.7,0.5,1.0), 0.4) * sub * (0.35 + 0.9*subPulse);
        // glow pooled around spire clusters
        emis += vec3(0.35,0.22,0.9) * pow(spireNear, 3.) * 0.10 * (0.8+0.2*sin(uTime*0.6));
        // dimming of emission in direct daylight looks better (contrast)
        emis *= mix(1., 0.75, term);
        col += emis;

        // faint night airglow so the dark side is not pitch black
        col += alb * vec3(0.10,0.07,0.22) * 0.15 * (1.-term);

        if(any(isnan(col))) col = vec3(0.);
        gl_FragColor = vec4(min(col, vec3(14.)), 1.);
      }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), planetMat);
  planetPivot.add(planet);

  // =====================================================================
  // CRYSTAL SPIRES (instanced hexagonal prisms)
  // =====================================================================
  const lathePts = [
    new THREE.Vector2(0, -0.6), new THREE.Vector2(1, -0.6), new THREE.Vector2(1, 1.0),
    new THREE.Vector2(0.55, 1.22), new THREE.Vector2(0, 1.38),
  ];
  let spireGeo = new THREE.LatheGeometry(lathePts, 6);
  spireGeo = spireGeo.toNonIndexed();
  spireGeo.computeVertexNormals();

  const spireList = [];
  const up = new THREE.Vector3(0, 1, 0);
  function addSpire(dir, h, wRatio, tiltAxisHint, tiltAng) {
    const n = dir.clone().normalize();
    let t = tiltAxisHint.clone().sub(n.clone().multiplyScalar(tiltAxisHint.dot(n)));
    if (t.lengthSq() < 1e-6) t = new THREE.Vector3(1, 0, 0).cross(n);
    t.normalize();
    const axis = n.clone().multiplyScalar(Math.cos(tiltAng)).add(t.multiplyScalar(Math.sin(tiltAng))).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, axis);
    const twist = new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI);
    q.multiply(twist);
    const w = h * wRatio;
    const pos = n.clone().multiplyScalar(R - 0.15);
    spireList.push({ m: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(w, h, w)), seed: rnd() });
  }
  function randTangentOffset(n, ang) {
    const a = new THREE.Vector3(gauss(), gauss(), gauss());
    a.sub(n.clone().multiplyScalar(a.dot(n))).normalize();
    return n.clone().multiplyScalar(Math.cos(ang)).add(a.multiplyScalar(Math.sin(ang))).normalize();
  }
  clusterDirs.forEach((c, ci) => {
    const big = ci < 3 ? 1.25 : 1.0;
    const nBig = 6 + Math.floor(rnd() * 6);
    for (let i = 0; i < nBig; i++) {
      const d = randTangentOffset(c, Math.abs(gauss()) * 0.035);
      const out = d.clone().sub(c);
      const h = (i === 0 ? 11 + rnd() * 4 : 3.5 + rnd() * 7.5) * big;
      addSpire(d, h, 0.13 + rnd() * 0.07, out.lengthSq() > 1e-8 ? out : new THREE.Vector3(gauss(), gauss(), gauss()),
        i === 0 ? rnd() * 0.12 : 0.15 + rnd() * 0.55);
    }
    const nSmall = 40 + Math.floor(rnd() * 30);
    for (let i = 0; i < nSmall; i++) {
      const d = randTangentOffset(c, Math.abs(gauss()) * 0.13);
      const out = d.clone().sub(c);
      addSpire(d, 0.5 + Math.pow(rnd(), 2) * 3.2, 0.16 + rnd() * 0.1,
        out.lengthSq() > 1e-8 ? out : new THREE.Vector3(1, 0, 0), 0.1 + rnd() * 0.7);
    }
  });
  // scattered lone crystals
  for (let i = 0; i < 260; i++) {
    const d = new THREE.Vector3(gauss(), gauss(), gauss()).normalize();
    addSpire(d, 0.35 + Math.pow(rnd(), 3) * 2.2, 0.18 + rnd() * 0.1, new THREE.Vector3(gauss(), gauss(), gauss()), rnd() * 0.8);
  }

  const spireMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSun },
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vSeed; varying vec3 vAxis; varying vec3 vCenter;
      void main(){
        vLocal = position; vSeed = aSeed;
        mat3 im = mat3(instanceMatrix);
        vec3 s2 = vec3(dot(im[0],im[0]), dot(im[1],im[1]), dot(im[2],im[2]));
        vec3 n = im*(normal/s2);
        vec4 w = modelMatrix*instanceMatrix*vec4(position,1.);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix)*n);
        vAxis = normalize(mat3(modelMatrix)*im[1]);
        vCenter = (modelMatrix*vec4(0.,0.,0.,1.)).xyz;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vSeed; varying vec3 vAxis; varying vec3 vCenter;
      vec3 thinFilm(float d, float cosV){
        float n=1.42; float sinT2=(1.-cosV*cosV)/(n*n); float cosT=sqrt(max(1.-sinT2,0.));
        vec3 ph=12.566370*n*d*cosT/vec3(650.,532.,450.);
        vec3 c=0.5-0.5*cos(ph); return c*c*(3.-2.*c);
      }
      float interior(vec3 r, float sunlit){
        float trans = pow(max(dot(r, uSun)*0.5+0.5, 0.), 6.)*1.6*sunlit;
        float bands = 0.5+0.5*sin(dot(r, vAxis)*14. + vSeed*40.);
        float bands2 = 0.5+0.5*sin(dot(r, cross(vAxis, vec3(0.3,0.9,0.1)))*9. + vSeed*17.);
        return trans + 0.25*bands*bands2 + 0.06;
      }
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if(dot(N,V) < 0.) N = -N;
        vec3 L = uSun;
        vec3 up = normalize(vWorld - vCenter);
        float sunlit = smoothstep(-0.12, 0.2, dot(up, L));
        float NdV = clamp(dot(N,V), 0., 1.);
        float F = 0.04 + 0.96*pow(1.-NdV, 5.);
        float y = vLocal.y;
        // fake refraction with dispersion
        vec3 rR = refract(-V, N, 1./1.47);
        vec3 rG = refract(-V, N, 1./1.50);
        vec3 rB = refract(-V, N, 1./1.54);
        vec3 inside = vec3(interior(rR,sunlit), interior(rG,sunlit), interior(rB,sunlit));
        float hN = clamp(y/1.38, 0., 1.);
        vec3 tint = mix(vec3(0.30,0.07,0.75), vec3(0.62,0.82,1.0), smoothstep(0.15, 1.0, hN));
        tint = mix(tint, vec3(0.85,0.55,1.0), 0.25*fract(vSeed*7.3));
        vec3 sunCol = vec3(0.82,0.9,1.12)*2.6;
        vec3 col = tint * inside * sunCol * 0.32;
        // internal energy: slow pulse rising towards the tip
        float rise = fract(hN*0.8 - uTime*0.12 + vSeed);
        float energy = pow(1.-abs(rise-0.5)*2., 6.);
        vec3 eCol = mix(vec3(0.55,0.2,1.0), vec3(0.2,0.9,1.0), hN);
        col += eCol * (0.05 + 0.5*energy*smoothstep(0.1,0.9,hN) + 0.7*pow(hN,8.)) * (0.6+0.4*sin(uTime*0.5+vSeed*20.));
        // base glow where it emerges from the rock
        col += vec3(0.5,0.2,1.0) * smoothstep(0.05, -0.55, y) * 0.6;
        // hex edges & ridge highlight
        float ang = atan(vLocal.z, vLocal.x + 1e-5);
        float e = abs(fract(ang/1.0471976 + 0.5) - 0.5)*2.;
        float edge = smoothstep(0.88, 1.0, 1.-e) ;
        float ridge = 1. - smoothstep(0., 0.035, abs(y-1.0));
        col += vec3(0.7,0.8,1.0) * (edge*0.25 + ridge*0.35) * (0.25 + sunlit*0.8);
        // reflection: environment + sun glint with thin-film
        vec3 Rf = reflect(-V, N);
        vec3 env = mix(vec3(0.012,0.008,0.03), vec3(0.08,0.06,0.16), smoothstep(-0.2, 0.8, dot(Rf, up)));
        vec3 H = normalize(L+V);
        float film = 300. + 450.*fract(vSeed*13.1);
        vec3 tf = thinFilm(film, clamp(dot(V,H),0.,1.));
        float spec = pow(max(dot(N,H),0.), 420.)*5.;
        col = mix(col, env*mix(tf,vec3(1.),0.5)*2., F*0.7);
        col += sunCol * spec * mix(vec3(1.), tf*1.6, 0.6) * sunlit;
        col += tf * F * 0.12 * (0.2+sunlit);
        if(any(isnan(col)) || any(isinf(col))) col = vec3(0.);
        gl_FragColor = vec4(clamp(col, 0., 2.5), 1.);
      }`,
  });
  const spires = new THREE.InstancedMesh(spireGeo, spireMat, spireList.length);
  const seedArr = new Float32Array(spireList.length);
  spireList.forEach((s, i) => { spires.setMatrixAt(i, s.m); seedArr[i] = s.seed; });
  spireGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedArr, 1));
  spires.instanceMatrix.needsUpdate = true;
  spires.frustumCulled = false;
  planetPivot.add(spires);

  // =====================================================================
  // ATMOSPHERE (faint lavender halo)
  // =====================================================================
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun, uR: { value: R }, uRa: { value: ATM_R } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vCenter;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vWorld=w.xyz; vCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uR; uniform float uRa;
      varying vec3 vWorld; varying vec3 vCenter;
      void main(){
        vec3 ro = cameraPosition; vec3 rd = normalize(vWorld - ro);
        vec3 oc = vCenter - ro; float tca = dot(oc, rd); float b2 = dot(oc,oc) - tca*tca;
        float Ra2 = uRa*uRa, R2 = uR*uR;
        if(b2 > Ra2) discard;
        float b = sqrt(max(b2,0.));
        float L; vec3 pos;
        if(b < uR){ L = sqrt(Ra2-b2) - sqrt(R2-b2); pos = ro + rd*(tca - sqrt(R2-b2)); }
        else { L = 2.*sqrt(Ra2-b2); pos = ro + rd*tca; }
        vec3 n = normalize(pos - vCenter);
        float h = clamp((length(pos - vCenter) - uR)/(uRa - uR), 0., 1.);
        float dens = exp(-h*3.2);
        float depth = 1. - exp(-L*dens*0.045);
        if(b < uR) depth *= 0.08 + 0.92*pow(smoothstep(uR*0.8, uR, b), 2.);
        float mu = dot(n, uSun);
        float lit = smoothstep(-0.35, 0.45, mu);
        float cosT = dot(rd, uSun);
        float rayl = 0.75*(1.+cosT*cosT);
        float g = 0.72; float mie = (1.-g*g)/pow(1.+g*g-2.*g*cosT, 1.5)*0.08;
        vec3 lav = mix(vec3(0.62,0.48,1.0), vec3(0.42,0.52,1.0), h);
        vec3 col = lav * depth * (lit*(rayl*0.75 + mie) + 0.05);
        // twilight band at terminator: warmer magenta
        col += vec3(0.8,0.35,0.9) * depth * exp(-mu*mu*25.) * 0.25;
        gl_FragColor = vec4(col*0.5, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(ATM_R, 128, 64), atmoMat);
  root.add(atmo);

  // =====================================================================
  // DEBRIS BELT — dust sheet
  // =====================================================================
  const ringGeo = new THREE.RingGeometry(BELT_IN - 2, BELT_OUT + 4, 256, 8);
  ringGeo.rotateX(-Math.PI / 2);
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uSun, uTime },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vCenter;
      void main(){ vLocal=position; vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; vCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uTime;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vCenter;
      ${NOISE}
      void main(){
        float r = length(vLocal.xz);
        float d = beltDensity(r);
        if(d <= 0.001) discard;
        float ang = atan(vLocal.z, vLocal.x);
        vec3 sp = vec3(cos(ang)*r, 0., sin(ang)*r);
        float clump = 0.55 + 0.45*fbm(vec3(r*0.18, cos(ang)*2.5, sin(ang)*2.5), 4);
        float fine = 0.75 + 0.25*sin(r*3.1 + snoise(vec3(r*0.5,0.,0.))*3.);
        d *= clump*fine;
        // planet shadow
        vec3 oc = vCenter - vWorld; float tca = dot(oc, uSun);
        float sh = 1.;
        if(tca > 0.){ float b = sqrt(max(dot(oc,oc)-tca*tca,0.)); sh = smoothstep(${(R * 0.97).toFixed(1)}, ${(R * 1.04).toFixed(1)}, b); }
        vec3 rd = normalize(vWorld - cameraPosition);
        float cosT = dot(rd, uSun);
        float g = 0.6; float phase = 0.35 + (1.-g*g)/pow(1.+g*g-2.*g*cosT,1.5)*0.25;
        vec3 col = mix(vec3(0.55,0.45,0.85), vec3(0.75,0.8,1.0), smoothstep(0.3,1.,clump));
        col *= d * sh * phase * 0.16;
        col += vec3(0.25,0.12,0.5)*d*0.006; // faint self-glow from energised dust
        if(any(isnan(col))) col = vec3(0.);
        gl_FragColor = vec4(min(col, vec3(14.)), 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const dust = new THREE.Mesh(ringGeo, dustMat);
  beltGroup.add(dust);

  // =====================================================================
  // DEBRIS BELT — instanced crystal shards
  // =====================================================================
  function beltDensityJS(r) {
    const x = (r - BELT_IN) / (BELT_OUT - BELT_IN);
    if (x < 0 || x > 1) return 0;
    const ss = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
    let d = ss(0, 0.12, x) * ss(1, 0.7, x);
    d *= 0.62 + 0.38 * Math.sin(x * 38 + Math.sin(x * 11) * 2);
    d *= 1 - 0.85 * Math.exp(-Math.pow((x - 0.43) * 30, 2));
    d *= 1 - 0.6 * Math.exp(-Math.pow((x - 0.78) * 45, 2));
    return Math.max(0, Math.min(1, d));
  }
  const shardMat = new THREE.ShaderMaterial({
    uniforms: { uSun, uTime },
    vertexShader: /* glsl */`
      attribute vec4 aOrb; // x: orbital angular speed, y: spin speed, z: seed, w: glowing
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter; varying vec4 vOrb;
      uniform float uTime;
      mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
      void main(){
        vOrb = aOrb;
        mat3 spin = rotY(aOrb.y*uTime + aOrb.z*40.);
        vec3 lp = spin*position; vec3 ln = spin*normal;
        mat3 im = mat3(instanceMatrix);
        vec3 s2 = vec3(dot(im[0],im[0]), dot(im[1],im[1]), dot(im[2],im[2]));
        vec3 ip = (instanceMatrix*vec4(lp,1.)).xyz;
        vec3 inr = im*(ln/s2);
        mat3 orb = rotY(mod(aOrb.x*uTime, 6.2831853));
        vec4 w = modelMatrix*vec4(orb*ip, 1.);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix)*(orb*inr));
        vCenter = (modelMatrix*vec4(0.,0.,0.,1.)).xyz;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCenter; varying vec4 vOrb;
      vec3 thinFilm(float d, float cosV){
        float n=1.42; float sinT2=(1.-cosV*cosV)/(n*n); float cosT=sqrt(max(1.-sinT2,0.));
        vec3 ph=12.566370*n*d*cosT/vec3(650.,532.,450.);
        vec3 c=0.5-0.5*cos(ph); return c*c*(3.-2.*c);
      }
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if(dot(N,V) < 0.) N = -N;
        vec3 L = uSun;
        vec3 oc = vCenter - vWorld; float tca = dot(oc, L);
        float sh = 1.;
        if(tca > 0.){ float b = sqrt(max(dot(oc,oc)-tca*tca,0.)); sh = smoothstep(${(R * 0.98).toFixed(1)}, ${(R * 1.03).toFixed(1)}, b); }
        float seed = vOrb.z;
        vec3 sunCol = vec3(0.82,0.9,1.12)*2.6*sh;
        float NdL = max(dot(N,L),0.);
        float NdV = clamp(dot(N,V),0.,1.);
        vec3 H = normalize(L+V);
        float F = 0.04 + 0.96*pow(1.-NdV,5.);
        vec3 alb = mix(vec3(0.09,0.04,0.17), vec3(0.22,0.18,0.32), fract(seed*5.3));
        alb = mix(alb, vec3(0.02,0.015,0.035), step(0.7, fract(seed*11.7)));   // obsidian chips
        float film = 280. + 480.*fract(seed*23.1);
        vec3 tf = thinFilm(film, clamp(dot(V,H),0.,1.));
        vec3 tfv = thinFilm(film, NdV);
        vec3 col = alb*sunCol*NdL;
        col += tfv*sunCol*NdL*0.10;
        // transmitted light (backlit crystal glows)
        float back = pow(max(dot(-V, L), 0.), 6.)*sh;
        col += mix(vec3(0.5,0.3,1.0), tfv, 0.5)*back*0.35;
        float spec = pow(max(dot(N,H),0.), 160.);
        col += sunCol*mix(vec3(1.), tf*1.7, 0.7)*spec*3.;
        col += mix(vec3(0.03,0.02,0.07), tfv*0.12, 0.5)*F;
        // a few energised shards
        float gl = vOrb.w;
        col += mix(vec3(0.6,0.2,1.0), vec3(0.2,0.9,1.0), fract(seed*3.1)) * gl * (0.9+0.6*sin(uTime*1.3+seed*50.));
        col += vec3(0.04,0.02,0.08)*0.25; // ambient
        if(any(isnan(col))) col = vec3(0.);
        gl_FragColor = vec4(min(col, vec3(14.)),1.);
      }`,
  });

  function makeShardGeo(base, jitter) {
    const g = base.index ? base.toNonIndexed() : base;
    const pos = g.attributes.position;
    // jitter shared vertices consistently
    const map = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!map.has(k)) map.set(k, [1 + (rnd() - 0.5) * jitter, 1 + (rnd() - 0.5) * jitter, 1 + (rnd() - 0.5) * jitter]);
      const j = map.get(k);
      pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1], pos.getZ(i) * j[2]);
    }
    g.computeVertexNormals();
    return g;
  }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function buildBelt(geo, count, sizeFn, thick, glowFrac) {
    const mesh = new THREE.InstancedMesh(geo, shardMat, count);
    const orb = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      let r;
      for (let k = 0; k < 30; k++) { r = BELT_IN + rnd() * (BELT_OUT - BELT_IN); if (rnd() < beltDensityJS(r)) break; }
      const a = rnd() * Math.PI * 2;
      tmpP.set(Math.cos(a) * r, gauss() * thick, Math.sin(a) * r);
      tmpE.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
      tmpQ.setFromEuler(tmpE);
      const s = sizeFn();
      tmpS.set(s * (0.35 + rnd() * 0.4), s * (0.9 + rnd() * 1.1), s * (0.3 + rnd() * 0.45));
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      orb[i * 4] = 30 * Math.pow(r, -1.5) * 1.0;   // ≈0.02 rad/s at r=120... scaled below
      orb[i * 4 + 1] = (rnd() - 0.5) * 1.2;
      orb[i * 4 + 2] = rnd();
      orb[i * 4 + 3] = rnd() < glowFrac ? 0.5 + rnd() : 0;
    }
    geo.setAttribute('aOrb', new THREE.InstancedBufferAttribute(orb, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
  const shardGeoA = makeShardGeo(new THREE.OctahedronGeometry(1, 0), 0.5);
  const shardGeoB = makeShardGeo(new THREE.TetrahedronGeometry(1, 0), 0.5);
  const chunkGeo = makeShardGeo(new THREE.IcosahedronGeometry(1, 1), 0.45);
  beltGroup.add(buildBelt(shardGeoA, 6500, () => 0.12 + Math.pow(rnd(), 3) * 1.3, 1.6, 0.012));
  beltGroup.add(buildBelt(shardGeoB, 4000, () => 0.08 + Math.pow(rnd(), 4) * 0.6, 2.4, 0.004));
  beltGroup.add(buildBelt(chunkGeo, 70, () => 1.2 + Math.pow(rnd(), 2) * 3.0, 0.8, 0.0));

  // =====================================================================
  const rotM4 = new THREE.Matrix4();
  return {
    object: root,
    radius: R,
    viewDistance: 400,
    info: {
      nombre: 'Opalia',
      tipo: 'Mundo geoda cristalino',
      descripcion: 'Una geoda del tamaño de un planeta: llanuras de obsidiana quebradas por campos de amatista y ópalo que cambian de color según desde dónde se las mire. Por sus grietas late despacio una energía violeta y cian, y agujas de cristal de kilómetros de altura atrapan la luz de su estrella azul. A su alrededor giran los restos de Iris, la luna que se hizo añicos.',
      datos: [
        ['Gravedad', '0,84 g'],
        ['Duración del día', '31 h 12 min'],
        ['Temperatura media', '−71 °C'],
        ['Composición', 'Sílice opalino, obsidiana y amatista'],
        ['Agujas más altas', '≈ 9 km'],
        ['Cinturón de Iris', '≈ 10 500 esquirlas cartografiadas'],
      ],
      estrella: { nombre: 'Vélira', color: 0xcfdcff },
    },
    update(dt, t) {
      uTime.value = t;
      planetPivot.rotation.y += dt * 0.006;
      planetPivot.updateMatrixWorld();
      rotM4.extractRotation(planetPivot.matrixWorld);
      uRot.value.setFromMatrix4(rotM4);
    },
  };
}
