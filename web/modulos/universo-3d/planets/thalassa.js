// THALASSA — mundo oceánico. Módulo procedural (Three.js r160), sin texturas externas.
export default function create(THREE, { sunDir }) {
  const R = 60;                 // radio del planeta
  const R_CLOUD = R * 1.016;    // capa de nubes
  const R_ATM = R * 1.11;       // borde superior de la atmósfera
  const MOON_R = 7.5;
  const MOON_ORBIT = 150;

  const root = new THREE.Group();
  root.name = 'thalassa';
  const L = sunDir.clone().normalize();

  // ------------------------------------------------------------------ GLSL común
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
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p,int oct){
    float a=0.5,s=0.0;
    for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; }
    return s;
  }
  float ridged(vec3 p,int oct){
    float a=0.5,s=0.0,w=1.0;
    for(int i=0;i<6;i++){ if(i>=oct) break; float n=1.0-abs(snoise(p)); n*=n; s+=a*n*w; w=clamp(n*1.6,0.0,1.0); p=p*2.11+vec3(4.1,1.3,7.7); a*=0.5; }
    return s;
  }
  vec3 hash33(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
  `;

  // Nubes: fbm con deformación de dominio, bandas zonales y ciclones en espiral.
  const CLOUDS = /* glsl */`
  vec3 rotAxis(vec3 p, vec3 c, float a){ float s=sin(a), co=cos(a); return p*co+cross(c,p)*s+c*dot(c,p)*(1.0-co); }
  float cyclone(inout vec3 q, vec3 c, float strength, float size, inout float eye){
    float d=distance(q,c); float f=exp(-d*d/(size*size));
    q=rotAxis(q,c,strength*f*(3.2+2.2*f));
    eye=max(eye, exp(-d*d/(size*size*0.012)));
    return f;
  }
  float cloudField(vec3 p,int oct,float t){
    vec3 q=p; float eye=0.0; float cyc=0.0;
    cyc+=cyclone(q,normalize(vec3( 0.55, 0.36, 0.75)), 1.0,0.20,eye);
    cyc+=cyclone(q,normalize(vec3(-0.70,-0.30, 0.65)),-1.0,0.17,eye);
    cyc+=cyclone(q,normalize(vec3(-0.25, 0.48,-0.84)), 1.0,0.15,eye);
    cyc+=cyclone(q,normalize(vec3( 0.80,-0.42,-0.43)),-1.0,0.13,eye);
    float lat=p.y;
    vec3 s=q*vec3(2.3,3.7,2.3);
    vec3 w=vec3(snoise(s*0.6+vec3(0.0,0.0,t*0.012)),snoise(s*0.6+vec3(5.2,1.3,-t*0.010)),snoise(s*0.6+vec3(2.7,8.1,t*0.011)));
    float n=fbm(s*1.15+w*0.75+vec3(t*0.004,0.0,0.0),oct);
    if(oct>4){ n+=0.22*fbm(q*16.0+w*1.5,3)*smoothstep(-0.2,0.3,n); }
    float bands=0.5+0.5*cos(lat*3.14159*3.2);          // ITCZ + corrientes de latitudes medias
    float subtrop=smoothstep(0.15,0.35,abs(lat))*smoothstep(0.55,0.35,abs(lat)); // franja subtropical despejada
    float d=n*1.0+bands*0.20-subtrop*0.20+cyc*0.40-0.16;
    d-=eye*0.9;
    return smoothstep(0.0,0.55,d);
  }
  `;

  // ------------------------------------------------------------------ superficie
  const cloudInv = new THREE.Matrix3();
  const surfUniforms = {
    uSun: { value: L.clone() },
    uTime: { value: 0 },
    uCloudInv: { value: cloudInv },
    uRot: { value: new THREE.Matrix3() },
    uMoonPos: { value: new THREE.Vector3() },
    uMoonR: { value: MOON_R },
  };

  const surfVert = /* glsl */`
    varying vec3 vObj; varying vec3 vWorld; varying vec3 vCenter;
    void main(){
      vObj=normalize(position); vCenter=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`;

  const surfFrag = /* glsl */`
    uniform vec3 uSun; uniform float uTime; uniform mat3 uCloudInv; uniform mat3 uRot; uniform vec3 uMoonPos; uniform float uMoonR;
    varying vec3 vObj; varying vec3 vWorld; varying vec3 vCenter;
    ${NOISE}
    ${CLOUDS}
    const float RP=${R.toFixed(1)};

    float terrain(vec3 p, out float detail){
      vec3 q=p*1.7;
      vec3 w=vec3(snoise(q*0.9+3.1),snoise(q*0.9+7.7),snoise(q*0.9+1.3));
      q+=w*0.55;
      float c=fbm(q,6);
      float arcs=ridged(p*3.2+w*0.8,4);                 // arcos volcánicos de islas
      float h=c*0.85+arcs*0.55-0.62;
      detail=fbm(p*22.0,4);
      h+=detail*0.07;
      return h;
    }
    vec3 sunTint(float mu){
      float am=1.0/(max(mu,0.0)*0.92+0.08);
      return exp(-vec3(0.06,0.22,0.55)*(am-1.0)*0.55);
    }
    void main(){
      vec3 p=vObj;
      vec3 C=vCenter;
      vec3 Prel=vWorld-C;
      vec3 N=normalize(Prel);
      vec3 V=normalize(cameraPosition-vWorld);
      vec3 Ls=normalize(uSun);
      mat3 M=uRot;

      float det; float h=terrain(p,det);
      float land=smoothstep(-0.004,0.004,h);
      float mu0=dot(N,Ls);

      // ---- sombras: nubes y luna
      vec3 pc=normalize(Prel/RP+Ls*(0.016/max(mu0,0.22)));
      float cl=cloudField(uCloudInv*pc,4,uTime);
      float cloudShadow=1.0-0.62*cl;
      vec3 mv=uMoonPos-vWorld; float tca=dot(mv,Ls); float moonSh=1.0;
      if(tca>0.0){ float dd=sqrt(max(dot(mv,mv)-tca*tca,0.0)); moonSh=mix(0.12,1.0,smoothstep(uMoonR*0.55,uMoonR*1.25,dd)); }
      // cobertura nubosa directa (para luces nocturnas)
      float cover=cl;

      vec3 tint=sunTint(mu0);
      float lit=smoothstep(-0.06,0.08,mu0);
      vec3 sunCol=vec3(1.0,0.96,0.92)*2.7*tint*cloudShadow*moonSh;
      vec3 skyAmb=vec3(0.020,0.028,0.060)*smoothstep(-0.25,0.35,mu0)+vec3(0.003,0.002,0.006);

      vec3 col;
      // ==================== OCÉANO
      float depth=clamp(-h,0.0,1.0);
      vec3 deep=vec3(0.003,0.016,0.075);
      vec3 mid=vec3(0.004,0.045,0.150);
      vec3 shelf=vec3(0.020,0.200,0.230);
      vec3 reef=vec3(0.090,0.430,0.400);
      vec3 water=mix(mid,deep,smoothstep(0.05,0.45,depth));
      water=mix(water,mix(vec3(0.004,0.03,0.09),vec3(0.03,0.02,0.10),0.5),smoothstep(0.55,0.95,abs(p.y))*0.6);
      float shallow=smoothstep(0.16,0.0,depth);
      float reefPat=0.5+0.5*snoise(p*140.0);
      water=mix(water,shelf,shallow*0.9);
      water=mix(water,reef*(0.75+0.5*reefPat),smoothstep(0.06,0.0,depth)*0.85);
      // olas: normales animadas
      float fp=length(fwidth(vWorld));
      float f1=smoothstep(1.2,0.2,fp), f2=smoothstep(0.35,0.06,fp);
      vec3 wp=p*95.0; float tt=uTime*0.35;
      vec3 wn=f1*vec3(snoise(wp+vec3(tt,0.0,0.0)),snoise(wp+vec3(0.0,tt,5.2)),snoise(wp+vec3(9.1,0.0,tt)));
      vec3 wp2=p*330.0;
      wn+=0.55*f2*vec3(snoise(wp2+vec3(0.0,-tt,1.0)),snoise(wp2+vec3(3.3,tt,0.0)),snoise(wp2+vec3(tt,7.1,0.0)));
      vec3 big=vec3(snoise(p*18.0+uTime*0.02),snoise(p*18.0+11.0),snoise(p*18.0+23.0));
      wn=M*(wn+big*0.35);
      vec3 No=normalize(N+(wn-N*dot(wn,N))*0.09);
      float rough=1.0-0.75*f1;
      float NoL=max(dot(No,Ls),0.0);
      vec3 H=normalize(Ls+V);
      float NoH=max(dot(No,H),0.0);
      float NoV=max(dot(No,V),0.0);
      float F=0.02+0.98*pow(1.0-NoV,5.0);
      float e1=mix(1400.0,260.0,rough); float spec=pow(NoH,e1)*(e1*0.012)+pow(NoH,90.0)*0.35+pow(NoH,16.0)*0.02;
      vec3 oceanCol=water*(sunCol*max(mu0,0.0)*0.9+skyAmb*2.0);
      vec3 skyRefl=mix(vec3(0.05,0.08,0.22),vec3(0.20,0.12,0.30),pow(1.0-NoV,3.0))*lit*tint;
      oceanCol=mix(oceanCol,skyRefl,F*0.9);
      oceanCol+=sunCol*spec*(0.25+F)*step(0.0,mu0)*smoothstep(0.0,0.05,mu0);
      // espuma en arrecifes y costas
      float foam=smoothstep(0.012,0.0,depth)*(0.5+0.5*snoise(p*420.0+uTime*0.4));
      oceanCol+=foam*0.35*sunCol*max(mu0,0.0)*0.5;

      // ==================== TIERRA
      float elev=clamp(h,0.0,1.0);
      vec3 sand=vec3(0.50,0.42,0.28);
      vec3 jungle=vec3(0.020,0.075,0.035);
      vec3 violetFlora=vec3(0.075,0.035,0.090);
      vec3 rock=vec3(0.13,0.11,0.13);
      vec3 basalt=vec3(0.035,0.03,0.04);
      float floraMix=smoothstep(-0.2,0.4,snoise(p*9.0+4.0));
      vec3 landCol=mix(jungle,violetFlora,floraMix*0.7);
      landCol*=0.75+0.5*(0.5+0.5*det);
      landCol=mix(sand,landCol,smoothstep(0.0,0.035,elev));
      landCol=mix(landCol,rock,smoothstep(0.16,0.30,elev));
      landCol=mix(landCol,basalt,smoothstep(0.30,0.40,elev));
      // relieve via gradiente de pantalla
      vec3 dpx=dFdx(vWorld), dpy=dFdy(vWorld);
      float hx=dFdx(h), hy=dFdy(h);
      vec3 r1=cross(dpy,N), r2=cross(N,dpx); float dt=dot(dpx,r1);
      vec3 grad=sign(dt)*(hx*r1+hy*r2);
      vec3 Nl=normalize(abs(dt)*N-grad*2.6);
      float NlL=dot(Nl,Ls);
      vec3 landLit=landCol*(sunCol*max(NlL,0.0)+skyAmb*1.4);

      col=mix(oceanCol,landLit,land);

      // ==================== hielo polar
      float ice=smoothstep(0.86,0.93,abs(p.y)+snoise(p*12.0)*0.05);
      vec3 iceCol=vec3(0.62,0.70,0.85)*(sunCol*max(mu0,0.0)+skyAmb*2.0);
      col=mix(col,iceCol,ice);

      // ==================== lado nocturno
      float night=smoothstep(0.04,-0.22,mu0);
      // bioluminiscencia del plancton
      vec3 bq=p*3.3+vec3(snoise(p*2.0+uTime*0.01),snoise(p*2.0+9.0),snoise(p*2.0+19.0))*0.6;
      float blob=smoothstep(0.18,0.62,fbm(bq,4));
      float fil=pow(1.0-abs(snoise(p*36.0+vec3(0.0,uTime*0.03,0.0))),5.0);
      float fil2=pow(1.0-abs(snoise(p*90.0+3.3)),7.0);
      float coastal=smoothstep(0.14,0.0,depth)*0.9;
      float bloom=blob*(0.12+1.5*fil+0.9*fil2)+coastal*(0.10+1.1*fil2)*smoothstep(0.0,0.5,snoise(p*14.0));
      float hue=0.5+0.5*snoise(p*4.5+31.0);
      vec3 bioCol=mix(vec3(0.05,1.0,0.85),vec3(1.0,0.12,0.75),smoothstep(0.35,0.75,hue));
      bioCol=mix(bioCol,vec3(0.25,0.5,1.0),smoothstep(0.5,0.0,hue)*0.4);
      float pulse=0.72+0.28*sin(uTime*0.9+hue*14.0+blob*6.0);
      col+=bioCol*bloom*pulse*0.95*night*(1.0-land)*(1.0-ice)*(1.0-0.65*cover);
      // luces de asentamientos en las islas
      float coastBand=smoothstep(0.16,0.0,elev)*land;
      float pop=smoothstep(0.0,0.5,snoise(p*6.0+77.0));
      float cityA=smoothstep(0.55,0.95,snoise(p*260.0));
      float cityB=smoothstep(0.65,1.0,snoise(p*700.0+5.0));
      float cities=(cityA*0.6+cityB)*coastBand*(0.35+pop);
      col+=vec3(1.0,0.66,0.32)*cities*1.1*night*(1.0-0.7*cover);

      // ==================== bruma atmosférica sobre el disco
      float rim=pow(1.0-max(dot(N,V),0.0),3.0);
      col=mix(col,vec3(0.06,0.08,0.26)*tint*lit,rim*0.25);

      gl_FragColor=vec4(col,1.0);
    }`;

  const surfMat = new THREE.ShaderMaterial({ uniforms: surfUniforms, vertexShader: surfVert, fragmentShader: surfFrag });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), surfMat);
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = 0.36;
  tiltGroup.rotation.x = 0.12;
  planet.rotation.set(0, 1.2, 0);
  tiltGroup.add(planet);
  root.add(tiltGroup);

  // ------------------------------------------------------------------ nubes
  const cloudUniforms = { uSun: { value: L.clone() }, uTime: { value: 0 }, uRot: { value: new THREE.Matrix3() } };
  const cloudFrag = /* glsl */`
    uniform vec3 uSun; uniform float uTime; uniform mat3 uRot;
    varying vec3 vObj; varying vec3 vWorld; varying vec3 vCenter;
    ${NOISE}
    ${CLOUDS}
    void main(){
      vec3 C=vCenter;
      vec3 N=normalize(vWorld-C);
      vec3 V=normalize(cameraPosition-vWorld);
      vec3 Ls=normalize(uSun);
      float d=cloudField(vObj,6,uTime);
      if(d<0.004) discard;
      // auto-sombreado: desplazamos hacia el sol en espacio objeto
      vec3 Lo=normalize(transpose(uRot)*Ls);
      float d2=cloudField(normalize(vObj+Lo*0.012),3,uTime);
      float self=clamp(1.0-(d2-d)*1.6,0.45,1.15);
      float mu=dot(N,Ls);
      float am=1.0/(max(mu,0.0)*0.92+0.08);
      vec3 tint=exp(-vec3(0.06,0.22,0.55)*(am-1.0)*0.55);
      float wrap=clamp((mu+0.12)/1.12,0.0,1.0);
      float NoV=max(dot(N,V),0.0);
      float silver=pow(max(dot(-V,Ls),0.0),8.0)*(1.0-d)*1.5;
      vec3 col=vec3(1.0,0.98,1.0)*1.55*tint*wrap*self*(0.85+0.15*d);
      col+=vec3(1.0,0.85,0.75)*silver*tint*wrap;
      col+=vec3(0.025,0.03,0.07)*smoothstep(-0.3,0.3,mu)+vec3(0.004,0.003,0.009);
      float a=d*mix(0.92,1.0,pow(1.0-NoV,2.0));
      a*=smoothstep(0.0,0.08,NoV+0.02);
      gl_FragColor=vec4(col*a,a);
    }`;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms, vertexShader: surfVert, fragmentShader: cloudFrag,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R_CLOUD, 256, 128), cloudMat);
  clouds.renderOrder = 1;
  tiltGroup.add(clouds);

  // ------------------------------------------------------------------ atmósfera (dispersión simple integrada)
  const atmUniforms = { uSun: { value: L.clone() } };
  const atmVert = /* glsl */`
    varying vec3 vWorld; varying vec3 vCenter;
    void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vCenter=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
  const atmFrag = /* glsl */`
    uniform vec3 uSun; varying vec3 vWorld; varying vec3 vCenter;
    const float RP=${R.toFixed(2)}; const float RA=${R_ATM.toFixed(2)};
    const float HR=1.25; const float HM=0.55;
    const vec3 BR=vec3(0.036,0.058,0.165);   // Rayleigh azul-violeta
    const vec3 BM=vec3(0.020);
    vec2 rs(vec3 o, vec3 d, float r){ float b=dot(o,d); float c=dot(o,o)-r*r; float h=b*b-c; if(h<0.0) return vec2(1e9,-1e9); h=sqrt(h); return vec2(-b-h,-b+h); }
    void main(){
      vec3 C=vCenter;
      vec3 o=cameraPosition-C; vec3 d=normalize(vWorld-cameraPosition);
      vec3 Ls=normalize(uSun);
      vec2 ta=rs(o,d,RA); if(ta.x>ta.y) discard;
      float t0=max(ta.x,0.0), t1=ta.y;
      vec2 tp=rs(o,d,RP); bool hit=tp.x<tp.y && tp.x>0.0;
      if(hit) t1=min(t1,tp.x);
      const int NS=14; const int NL=5;
      float ds=(t1-t0)/float(NS);
      vec3 sumR=vec3(0.0), sumM=vec3(0.0); float odR=0.0, odM=0.0;
      for(int i=0;i<NS;i++){
        vec3 x=o+d*(t0+ds*(float(i)+0.5));
        float hh=length(x)-RP;
        float dr=exp(-hh/HR)*ds, dm=exp(-hh/HM)*ds;
        odR+=dr; odM+=dm;
        // sombra suave del planeta sobre el rayo de luz
        float xl=dot(x,Ls); float sh=1.0;
        if(xl<0.0){ float b=length(x-Ls*xl); sh=smoothstep(RP-0.6,RP+1.2,b); }
        if(sh<=0.0) continue;
        float tl=rs(x,Ls,RA).y; float dsl=tl/float(NL); float lR=0.0,lM=0.0;
        for(int j=0;j<NL;j++){ vec3 y=x+Ls*(dsl*(float(j)+0.5)); float hy=max(length(y)-RP,0.0); lR+=exp(-hy/HR)*dsl; lM+=exp(-hy/HM)*dsl; }
        vec3 att=exp(-(BR*(odR+lR)+BM*1.1*(odM+lM)));
        sumR+=dr*att*sh; sumM+=dm*att*sh;
      }
      float mu=dot(d,Ls);
      float pR=0.0597*(1.0+mu*mu);
      float g=0.76; float pM=0.1194*((1.0-g*g)*(1.0+mu*mu))/((2.0+g*g)*pow(1.0+g*g-2.0*g*mu,1.5));
      vec3 col=9.0*(sumR*BR*pR+sumM*BM*pM*0.6);
      // tono violáceo en la cara nocturna (resplandor del aire)
      vec3 trans=exp(-(BR*odR+BM*1.1*odM));
      float T=dot(trans,vec3(0.3333));
      gl_FragColor=vec4(col,1.0-T);
    }`;
  const atmMat = new THREE.ShaderMaterial({
    uniforms: atmUniforms, vertexShader: atmVert, fragmentShader: atmFrag,
    side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
  });
  const atm = new THREE.Mesh(new THREE.SphereGeometry(R_ATM, 160, 80), atmMat);
  atm.renderOrder = 2;
  root.add(atm);

  // ------------------------------------------------------------------ luna
  const moonUniforms = { uSun: { value: L.clone() }, uPlanetC: { value: new THREE.Vector3() } };
  const moonFrag = /* glsl */`
    uniform vec3 uSun; uniform vec3 uPlanetC;
    varying vec3 vObj; varying vec3 vWorld; varying vec3 vCenter;
    ${NOISE}
    float craters(vec3 p){
      vec3 i=floor(p), f=fract(p); float h=0.0;
      for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
        vec3 g=vec3(float(x),float(y),float(z)); vec3 o=hash33(i+g);
        if(o.y<0.35) continue;
        vec3 r=g+0.15+o*0.7-f; float dd=length(r);
        float rad=0.22+0.22*o.x; float q=dd/rad;
        float bowl=q<1.0?(q*q-1.0):0.0;
        float rim=exp(-pow((q-1.0)*3.5,2.0))*0.30;
        float ej=q>1.0?exp(-(q-1.0)*2.5)*0.05:0.0;
        h+=(bowl*0.9+rim+ej)*rad;
      }
      return h;
    }
    void main(){
      vec3 p=vObj;
      float h=craters(p*2.6)*0.9+craters(p*6.5+3.1)*0.45+craters(p*15.0+7.7)*0.22+craters(p*36.0+1.9)*0.09;
      h+=fbm(p*8.0,4)*0.05;
      float maria=smoothstep(0.05,0.35,fbm(p*1.6+2.0,4));
      vec3 C=vCenter;
      vec3 N=normalize(vWorld-C);
      vec3 dpx=dFdx(vWorld), dpy=dFdy(vWorld);
      float hx=dFdx(h), hy=dFdy(h);
      vec3 r1=cross(dpy,N), r2=cross(N,dpx); float dt=dot(dpx,r1);
      vec3 grad=sign(dt)*(hx*r1+hy*r2);
      vec3 Nb=normalize(abs(dt)*N-grad*1.6);
      vec3 Ls=normalize(uSun); vec3 V=normalize(cameraPosition-vWorld);
      float mu0=max(dot(Nb,Ls),0.0), mu=max(dot(Nb,V),0.0);
      float ls=mu0/(mu0+mu+1e-4)*2.0;                 // Lommel-Seeliger (regolito)
      ls=mix(mu0,ls,0.6);
      vec3 alb=mix(vec3(0.20,0.175,0.235),vec3(0.085,0.075,0.11),maria*0.9);
      alb*=0.85+0.3*(0.5+0.5*snoise(p*30.0));
      // eclipse: sombra del planeta
      vec3 m=uPlanetC-vWorld; float tca=dot(m,Ls); float sh=1.0;
      if(tca>0.0){ float dd=sqrt(max(dot(m,m)-tca*tca,0.0)); sh=smoothstep(${(R*0.96).toFixed(2)},${(R*1.1).toFixed(2)},dd); }
      vec3 col=alb*vec3(1.0,0.97,0.94)*2.8*ls*sh;
      // luz reflejada del planeta (azul)
      vec3 Pd=normalize(uPlanetC-vWorld);
      float pl=max(dot(Nb,Pd),0.0)*max(dot(-Pd,Ls)*0.5+0.5,0.0);
      col+=alb*vec3(0.06,0.10,0.22)*pl;
      gl_FragColor=vec4(col,1.0);
    }`;
  const moonMat = new THREE.ShaderMaterial({ uniforms: moonUniforms, vertexShader: surfVert, fragmentShader: moonFrag });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 128, 64), moonMat);
  const moonPivot = new THREE.Group();
  moonPivot.rotation.set(0.22, 0, -0.14);
  moonPivot.add(moon);
  root.add(moonPivot);
  let moonAng = 2.2;
  const tmpV = new THREE.Vector3();
  const tmpM4 = new THREE.Matrix4();

  function placeMoon() {
    moon.position.set(Math.cos(moonAng) * MOON_ORBIT, 0, Math.sin(moonAng) * MOON_ORBIT);
    moon.rotation.y = -moonAng; // acoplamiento de marea
  }
  function syncUniforms(t) {
    root.updateMatrixWorld(true);
    surfUniforms.uTime.value = t;
    cloudUniforms.uTime.value = t;
    cloudUniforms.uRot.value.setFromMatrix4(clouds.matrixWorld);
    cloudInv.copy(cloudUniforms.uRot.value).transpose();
    surfUniforms.uRot.value.setFromMatrix4(planet.matrixWorld);
    moon.getWorldPosition(surfUniforms.uMoonPos.value);
    root.getWorldPosition(moonUniforms.uPlanetC.value);
  }
  placeMoon();
  syncUniforms(0);

  return {
    object: root,
    radius: R,
    viewDistance: 245,
    info: {
      nombre: 'Thalassa',
      tipo: 'Mundo oceánico',
      descripcion: 'Un océano sin orillas cubre casi todo el planeta, salpicado de archipiélagos volcánicos y anillos de arrecifes turquesa. '
        + 'Cuando cae la noche, el plancton bioluminiscente enciende el mar en ríos de cian y magenta bajo ciclones lentos. '
        + 'Su pequeña luna lila, Ápside, vela las mareas desde un cielo violeta.',
      datos: [
        ['Gravedad', '0,94 g'],
        ['Superficie oceánica', '96 %'],
        ['Profundidad media', '11 km'],
        ['Día', '31 h 12 min'],
        ['Temperatura media', '22 °C'],
        ['Lunas', '1 (Ápside)'],
      ],
      estrella: { nombre: 'Anfitrite', color: 0xfff2e2 },
    },
    update(dt, t) {
      planet.rotation.y += dt * 0.012;
      clouds.rotation.y += dt * 0.0155;
      moonAng += dt * 0.018;
      placeMoon();
      syncUniforms(t);
    },
  };
}
