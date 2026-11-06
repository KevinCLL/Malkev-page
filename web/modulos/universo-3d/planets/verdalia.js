// VERDALIA — mundo vivo exótico bajo una estrella dorada doble.
// Módulo procedural (Three.js r160). Sin imports: THREE se recibe como parámetro.

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
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int oct){float a=0.5,s=0.0;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
float ridged(vec3 p,int oct){float a=0.5,s=0.0,w=1.0;for(int i=0;i<8;i++){if(i>=oct)break;float n=1.0-abs(snoise(p));n*=n;n*=w;w=clamp(n*1.6,0.0,1.0);s+=a*n;p=p*2.11+vec3(4.1,1.3,7.7);a*=0.5;}return s;}
float hash13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
vec3 hash33(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
// sombra suave de una esfera (centro c, radio r) sobre el punto p iluminado en dirección L
float sphereShadow(vec3 p,vec3 L,vec3 c,float r){
  vec3 v=c-p; float tca=dot(v,L); if(tca<0.0) return 1.0;
  float d=length(v-L*tca); float w=r*0.06+tca*0.0093;
  return smoothstep(r-w,r+w,d);
}
`;

// Campo de nubes compartido (superficie lo usa para sombras, la capa de nubes para dibujarlas)
const CLOUDS = /* glsl */`
vec3 swirl(vec3 p,vec3 ax,float k,float fall){
  float d=1.0-dot(p,ax); float a=k*exp(-d*fall);
  float c=cos(a),s=sin(a);
  return p*c+cross(ax,p)*s+ax*dot(ax,p)*(1.0-c);
}
float cloudAlpha(vec3 p,float t,int oct){
  vec3 q=swirl(p,normalize(vec3(0.62,0.42,0.30)),3.6,16.0);
  q=swirl(q,normalize(vec3(-0.55,-0.38,0.72)),-3.2,14.0);
  q=swirl(q,normalize(vec3(-0.28,0.58,-0.78)),2.8,20.0);
  q=swirl(q,normalize(vec3(0.35,-0.62,-0.62)),-2.4,18.0);
  vec3 s=q*vec3(2.3,4.6,2.3);
  s+=0.45*vec3(snoise(q*1.7+vec3(t,0.0,0.0)),snoise(q*1.7+vec3(13.0,t,0.0)),snoise(q*1.7+vec3(0.0,27.0,t)));
  float n=fbm(s,oct);
  float lat=abs(q.y);
  float belt=0.5+0.5*cos(lat*3.0*3.14159);
  return smoothstep(0.14,0.44,n+0.20*belt-0.17);
}
`;

const ATMO_VERT = /* glsl */`
varying vec3 vWorld; varying vec3 vCenter;
void main(){
  vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vCenter=modelMatrix[3].xyz;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;

const ATMO_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uSunCol;
uniform float uR,uRa,uH,uInt,uMie,uMieG,uIri,uTime;
uniform vec3 uScat,uCyan,uViolet,uPink,uAirglow;
varying vec3 vWorld; varying vec3 vCenter;
vec2 raySphere(vec3 ro,vec3 rd,float r){
  float b=dot(ro,rd); float c=dot(ro,ro)-r*r; float h=b*b-c;
  if(h<0.0) return vec2(-1.0); h=sqrt(h); return vec2(-b-h,-b+h);
}
void main(){
  vec3 ro=cameraPosition-vCenter; vec3 rd=normalize(vWorld-cameraPosition);
  vec2 ta=raySphere(ro,rd,uRa); if(ta.y<=0.0) discard;
  float t0=max(ta.x,0.0), t1=ta.y;
  vec2 tp=raySphere(ro,rd,uR);
  if(tp.x>0.0) t1=min(t1,tp.x);
  const int N=14; float ds=(t1-t0)/float(N);
  vec3 sumR=vec3(0.0), sumM=vec3(0.0); float odV=0.0; float glow=0.0;
  for(int i=0;i<N;i++){
    vec3 pos=ro+rd*(t0+ds*(float(i)+0.5));
    float r=length(pos); float hgt=max(r-uR,0.0);
    float dens=exp(-hgt/uH);
    float dd=dens*ds; odV+=dd;
    float mu=dot(pos/r,uSun);
    // sombra del propio planeta (suave)
    float tca=dot(-pos,uSun); float sh=1.0;
    if(tca>0.0){ float d=length(pos+uSun*tca); sh=smoothstep(uR*0.985,uR*1.03,d); }
    float odL=dens*uH/(max(mu,0.0)*0.92+0.08);
    vec3 tr=exp(-uScat*(odV+odL));
    sumR+=dd*tr*sh; sumM+=dd*tr*sh;
    glow+=dd*(1.0-sh)*exp(-pow((hgt/uH-1.6),2.0));
  }
  float nu=dot(rd,uSun);
  float pR=0.0597*(1.0+nu*nu);
  float g=uMieG; float pM=0.1194*((1.0-g*g)*(1.0+nu*nu))/((2.0+g*g)*pow(max(1.0+g*g-2.0*g*nu,1e-4),1.5));
  vec3 col=uSunCol*uInt*(sumR*uScat*pR+sumM*uMie*pM);
  // iridiscencia: el borde vira de cian a violeta a rosa con el ángulo de visión
  vec3 nS=normalize(vWorld-vCenter);
  float f=1.0-abs(dot(rd,nS));
  float hue=clamp(f*0.85+0.32*nu+0.12*sin(uTime*0.05+nS.y*3.0),0.0,1.0);
  vec3 tint=hue<0.5?mix(uCyan,uViolet,hue*2.0):mix(uViolet,uPink,hue*2.0-1.0);
  col*=mix(vec3(1.0),tint,uIri);
  // resplandor nocturno (airglow) en el lado oscuro
  col+=uAirglow*glow;
  float trans=exp(-dot(uScat,vec3(0.3333))*odV);
  gl_FragColor=vec4(col,trans);
}`;

const PLANET_VERT = /* glsl */`
uniform vec3 uSun; uniform vec3 uMoonPos;
varying vec3 vPos; varying vec3 vSunObj; varying vec3 vCamObj; varying vec3 vMoonObj;
void main(){
  vPos=position; mat3 R=mat3(modelMatrix); vec3 T=modelMatrix[3].xyz; mat3 Ri=transpose(R);
  vSunObj=normalize(Ri*uSun); vCamObj=Ri*(cameraPosition-T); vMoonObj=Ri*(uMoonPos-T);
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);
}`;

const PLANET_FRAG = /* glsl */`
uniform float uTime; uniform float uCloudT; uniform mat3 uP2C; uniform float uMoonR; uniform vec3 uSunCol;
varying vec3 vPos; varying vec3 vSunObj; varying vec3 vCamObj; varying vec3 vMoonObj;
${NOISE}
${CLOUDS}
float relief(vec3 p,float mm){
  return mm*ridged(p*4.6,6)*0.95 + fbm(p*52.0,3)*0.10*(0.25+mm);
}
float ggx(vec3 N,vec3 H,float a){float a2=a*a;float d=max(dot(N,H),0.0);d=d*d*(a2-1.0)+1.0;return a2/(3.14159*d*d);}
void main(){
  vec3 p=normalize(vPos);
  vec3 L=normalize(vSunObj); vec3 V=normalize(vCamObj-vPos);
  float muG=dot(p,L);
  // ---- continentes
  vec3 q=p*1.55;
  vec3 w=vec3(snoise(q*1.25+vec3(3.1,0.0,0.0)),snoise(q*1.25+vec3(0.0,7.7,0.0)),snoise(q*1.25+vec3(0.0,0.0,1.9)));
  float c=0.55*snoise(p*1.1+0.25*w+vec3(2.0))+0.42*fbm(q*1.6+0.3*w,7)+0.03;
  float land=smoothstep(-0.004,0.012,c);
  // ---- relieve (cordilleras)
  float mm=smoothstep(0.02,0.2,c)*smoothstep(-0.35,0.25,snoise(p*2.1+vec3(5.0)));
  vec3 up=abs(p.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
  vec3 t1=normalize(cross(up,p)); vec3 t2=cross(p,t1);
  float e=0.0008;
  float m0=relief(p,mm), m1=relief(normalize(p+t1*e),mm), m2=relief(normalize(p+t2*e),mm);
  float k=0.018*land;
  vec3 N=normalize(p-k*((m1-m0)/e*t1+(m2-m0)/e*t2));
  float slope=1.0-dot(N,p);
  float mh=m0; // altura relativa de montaña
  // ---- biomas
  float lat=abs(p.y);
  float temp=1.0-pow(lat,1.4)*1.25-max(c,0.0)*0.9-mh*0.55+0.14*snoise(p*3.1+vec3(9.0));
  float moist=0.5+0.6*fbm(p*2.4+vec3(11.0),4)+0.25*smoothstep(0.08,0.0,c);
  float vn=snoise(p*7.0+vec3(1.0,4.0,2.0));
  vec3 cDesert=mix(vec3(0.42,0.15,0.055),vec3(0.62,0.27,0.10),0.5+0.5*sin(dot(p,vec3(90.0,40.0,70.0))+vn*6.0));
  float canopy=0.6+0.4*(0.5+0.5*snoise(p*140.0))*(0.7+0.3*snoise(p*420.0));
  vec3 cMagenta=mix(vec3(0.20,0.012,0.11),vec3(0.38,0.03,0.24),0.5+0.5*vn)*canopy;
  vec3 cViolet=mix(vec3(0.08,0.02,0.22),vec3(0.18,0.05,0.34),0.5+0.5*snoise(p*13.0))*canopy;
  vec3 cEmerald=mix(vec3(0.010,0.13,0.065),vec3(0.03,0.26,0.13),0.5+0.5*snoise(p*11.0+vec3(3.0)))*canopy;
  vec3 cTundra=vec3(0.20,0.16,0.26);
  vec3 cRock=mix(vec3(0.16,0.11,0.12),vec3(0.28,0.22,0.24),0.5+0.5*vn);
  vec3 cSnow=vec3(0.86,0.88,0.97);
  float desertness=1.0-smoothstep(0.36,0.52,moist);
  vec3 hot=mix(cMagenta,cDesert,desertness);
  vec3 mid=mix(cEmerald,cViolet,smoothstep(0.35,0.75,moist+0.35*vn));
  float hotW=smoothstep(0.62,0.80,temp+0.15*snoise(p*5.0+vec3(8.0)));
  vec3 col=mix(mid,hot,hotW);
  float tundraW=1.0-smoothstep(0.18,0.34,temp);
  col=mix(col,cTundra,tundraW);
  float rockW=smoothstep(0.12,0.32,mh)+smoothstep(0.02,0.08,slope)*0.6;
  rockW=clamp(rockW,0.0,1.0);
  col=mix(col,cRock,rockW*0.85);
  float snow=max(1.0-smoothstep(0.06,0.16,temp), smoothstep(0.30,0.42,mh+(0.45-temp)*0.3)*(1.0-smoothstep(0.03,0.09,slope)*0.5));
  col=mix(col,cSnow,snow);
  // ---- océanos
  float depth=max(-c,0.0);
  vec3 cPink=vec3(0.50,0.16,0.30), cTurq=vec3(0.02,0.30,0.32), cDeep=vec3(0.006,0.018,0.07);
  vec3 sea=mix(cPink,cTurq,smoothstep(0.0,0.018,depth+0.012*snoise(p*25.0)));
  sea=mix(sea,cDeep,smoothstep(0.015,0.14,depth));
  // sombras de las nubes
  vec3 pc=uP2C*normalize(p+L*0.012);
  float cs=cloudAlpha(pc,uCloudT,4);
  float cShadow=1.0-0.6*cs;
  float mShadow=sphereShadow(vPos,L,vMoonObj,uMoonR);
  float sh=cShadow*mShadow;
  // transmitancia: la luz se tiñe de oro-rosa en el terminador
  vec3 trans=exp(-vec3(0.03,0.12,0.09)/(max(muG,0.0)+0.12));
  float term=smoothstep(-0.1,0.06,muG);
  vec3 sunL=uSunCol*trans*term*sh;
  vec3 sky=vec3(0.32,0.30,0.55)*0.05*smoothstep(-0.25,0.4,muG);
  vec3 outC;
  // tierra
  vec3 landC=col*(sunL*max(dot(N,L),0.0)+sky);
  // agua
  vec3 Nw=p;
  if(land<0.999){
    vec3 wv=vec3(snoise(p*380.0+vec3(uTime*0.05)),snoise(p*380.0+vec3(19.0,uTime*0.05,0.0)),snoise(p*380.0+vec3(0.0,7.0,uTime*0.05)));
    vec3 wv2=vec3(snoise(p*90.0+vec3(uTime*0.02,3.0,1.0)),snoise(p*90.0+vec3(5.0,-uTime*0.02,8.0)),0.0);
    Nw=normalize(p+0.035*(wv-p*dot(wv,p))+0.03*(t1*wv2.x+t2*wv2.y));
  }
  vec3 H=normalize(L+V);
  float NdV=max(dot(Nw,V),0.0);
  float F=0.02+0.98*pow(1.0-NdV,5.0);
  float spec=ggx(Nw,H,0.075)*max(dot(Nw,L),0.0)*0.25;
  vec3 skyRefl=mix(vec3(0.15,0.5,0.75),vec3(0.75,0.35,0.7),pow(1.0-NdV,2.0))*0.25*term;
  vec3 seaC=sea*(sunL*max(dot(p,L),0.0)+sky)*(1.0-F)+F*skyRefl*sh+sunL*spec*F*4.0;
  outC=mix(seaC,landC,land);
  // ---- bioluminiscencia nocturna
  float night=smoothstep(0.06,-0.18,muG);
  float forest=land*(1.0-desertness*hotW)*(1.0-snow)*(1.0-rockW*0.8)*smoothstep(0.22,0.42,temp);
  float n1=snoise(p*16.0+vec3(2.0,5.0,1.0)), n2=snoise(p*64.0+vec3(7.0));
  float clus=smoothstep(-0.1,0.8,n1*0.8+n2*0.25+0.1);
  float wave=0.5+0.5*sin(uTime*0.45-dot(p,vec3(14.0,6.0,-9.0))+n1*2.5);
  float pulse=0.35+0.65*wave*wave;
  vec3 bioV=vec3(0.55,0.10,1.0), bioG=vec3(0.10,1.0,0.45);
  vec3 bio=mix(bioV,bioG,smoothstep(-0.35,0.35,snoise(p*3.5+vec3(20.0))));
  vec3 em=bio*forest*(0.10+clus*1.5)*pulse;
  // plancton luminoso en las costas
  float shore=(1.0-land)*smoothstep(0.05,0.0,depth)*smoothstep(-0.2,0.6,snoise(p*30.0+vec3(uTime*0.03)));
  em+=vec3(0.05,0.85,0.95)*shore*(0.4+0.6*(1.0-wave))*0.9;
  outC+=em*night*1.4;
  gl_FragColor=vec4(outC,1.0);
}`;

const CLOUD_VERT = PLANET_VERT;
const CLOUD_FRAG = /* glsl */`
uniform float uCloudT; uniform float uMoonR; uniform vec3 uSunCol;
varying vec3 vPos; varying vec3 vSunObj; varying vec3 vCamObj; varying vec3 vMoonObj;
${NOISE}
${CLOUDS}
void main(){
  vec3 p=normalize(vPos);
  vec3 L=normalize(vSunObj); vec3 V=normalize(vCamObj-vPos);
  float a=cloudAlpha(p,uCloudT,7);
  if(a<0.004) discard;
  float a2=cloudAlpha(normalize(p+L*0.018),uCloudT,3);
  float mu=dot(p,L);
  vec3 trans=exp(-vec3(0.03,0.12,0.09)/(max(mu,0.0)+0.12));
  float lit=smoothstep(-0.12,0.18,mu);
  float self=1.0-0.55*a2;
  float ms=sphereShadow(vPos,L,vMoonObj,uMoonR);
  float fw=pow(max(dot(-V,L),0.0),6.0)*(1.0-a)*0.8; // borde plateado a contraluz
  vec3 shade=mix(vec3(0.30,0.26,0.48),vec3(1.0,0.97,0.94),self);
  vec3 col=shade*uSunCol*trans*lit*ms*(0.18+0.82*max(mu*0.7+0.3,0.0))*0.85;
  col+=uSunCol*trans*lit*fw;
  col+=vec3(0.30,0.28,0.55)*0.025*lit;
  // tenue resplandor violeta desde abajo en la noche
  float night=smoothstep(0.05,-0.2,mu);
  col+=vec3(0.18,0.05,0.35)*0.05*night*(1.0-a2);
  float edge=smoothstep(0.0,0.25,dot(p,V));
  gl_FragColor=vec4(col,a*0.94*mix(0.75,1.0,edge));
}`;

const MOON_FRAG = /* glsl */`
uniform vec3 uSunCol; uniform float uPlanetR;
varying vec3 vPos; varying vec3 vSunObj; varying vec3 vCamObj; varying vec3 vMoonObj; // vMoonObj = planeta aquí
${NOISE}
float craterLayer(vec3 p,float sc){
  vec3 g=p*sc; vec3 i=floor(g); vec3 f=fract(g); float h=0.0;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 o=vec3(float(x),float(y),float(z)); vec3 r=hash33(i+o);
    if(r.z>0.55) continue;
    vec3 cpos=o+0.15+0.7*r-f; float d=length(cpos);
    float rad=0.18+0.32*hash13(i+o+7.0);
    float xx=d/rad;
    float bowl=xx<1.0?(xx*xx-1.0)*0.7:0.0;
    float rim=exp(-pow((xx-1.0)*3.5,2.0))*0.3;
    h+=(bowl+rim)*rad;
  }
  return h;
}
float moonH(vec3 p){
  return craterLayer(p,5.0)*0.9+craterLayer(p,13.0)*0.4+craterLayer(p,31.0)*0.15+fbm(p*40.0,3)*0.03;
}
void main(){
  vec3 p=normalize(vPos);
  vec3 L=normalize(vSunObj); vec3 V=normalize(vCamObj-vPos);
  vec3 up=abs(p.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
  vec3 t1=normalize(cross(up,p)); vec3 t2=cross(p,t1);
  float e=0.0015;
  float h0=moonH(p), h1=moonH(normalize(p+t1*e)), h2=moonH(normalize(p+t2*e));
  vec3 N=normalize(p-0.028*((h1-h0)/e*t1+(h2-h0)/e*t2));
  float maria=smoothstep(0.0,0.35,fbm(p*1.6+vec3(4.0),5));
  vec3 alb=mix(vec3(0.36,0.33,0.40),vec3(0.13,0.12,0.22),maria);
  alb*=0.85+0.3*snoise(p*20.0);
  alb+=vec3(0.15,0.17,0.2)*smoothstep(0.1,0.3,h0)*0.6; // eyecta brillante
  float mu=dot(p,L);
  float sh=sphereShadow(vPos,L,vMoonObj,uPlanetR);
  float diff=max(dot(N,L),0.0)*smoothstep(-0.05,0.08,mu);
  // reflejo del planeta (luz violácea-turquesa)
  vec3 toP=normalize(vMoonObj-vPos);
  vec3 ps=vec3(0.25,0.22,0.45)*0.04*max(dot(N,toP),0.0);
  vec3 col=alb*(uSunCol*diff*sh+ps);
  gl_FragColor=vec4(col,1.0);
}`;

const STATION_VERT = /* glsl */`
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vUv=uv;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const STATION_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uPlanetPos; uniform float uPlanetR; uniform float uTime; uniform float uKind;
uniform vec3 uMoonPos; uniform float uMoonR;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float sphereShadow(vec3 p,vec3 L,vec3 c,float r){
  vec3 v=c-p; float tca=dot(v,L); if(tca<0.0) return 1.0;
  float d=length(v-L*tca); float w=r*0.04+tca*0.0093;
  return smoothstep(r-w,r+w,d);
}
void main(){
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 L=uSun; vec3 V=normalize(cameraPosition-vWorld);
  float sh=sphereShadow(vWorld,L,uPlanetPos,uPlanetR*1.02)*sphereShadow(vWorld,L,uMoonPos,uMoonR);
  float seg=uKind<0.5?1400.0:(uKind<1.5?24.0:1.0);
  float pu=vUv.x*seg;
  float panel=1.0-0.35*(1.0-smoothstep(0.0,0.06,abs(fract(pu)-0.5)*2.0-0.9+0.06));
  vec3 base=vec3(0.11,0.10,0.14)*panel;
  if(uKind>1.5) base=vec3(0.09,0.09,0.12);
  vec3 H=normalize(L+V);
  float diff=max(dot(N,L),0.0);
  float spec=pow(max(dot(N,H),0.0),90.0)*0.6;
  vec3 col=(base*diff+vec3(0.9,0.85,0.8)*spec*0.25)*uSunCol*sh;
  vec3 toP=normalize(uPlanetPos-vWorld);
  col+=base*vec3(0.35,0.25,0.6)*0.08*max(dot(N,toP),0.0);
  // ventanas
  vec3 em=vec3(0.0);
  if(uKind<1.5){
    float rows=uKind<0.5?8.0:10.0;
    vec2 g=vec2(vUv.x*seg*2.0,vUv.y*rows);
    vec2 id=floor(g); vec2 f=fract(g);
    float r=hash21(id);
    float on=step(0.42,r)*(0.85+0.15*sin(uTime*(0.5+r*2.0)+r*40.0));
    float win=smoothstep(0.35,0.25,abs(f.x-0.5))*smoothstep(0.32,0.22,abs(f.y-0.5));
    vec2 fw=fwidth(g);
    float aa=smoothstep(0.25,0.9,max(fw.x,fw.y));
    float lightV=mix(win*on,0.06,aa);
    vec3 wc=mix(vec3(1.0,0.78,0.48),vec3(0.45,0.85,1.0),step(0.86,r));
    em+=wc*lightV*2.6;
    // franja luminosa y pulsos que recorren el anillo
    if(uKind<0.5){
      float vv=abs(fract(vUv.y+0.25)-0.5);
      float strip=smoothstep(0.035,0.0,abs(vv-0.25));
      float chase=pow(0.5+0.5*sin((vUv.x*24.0-uTime*0.08)*6.28318),24.0);
      em+=vec3(0.65,0.45,1.0)*strip*(0.6+2.5*chase);
    }
  } else {
    em+=vec3(0.45,0.6,1.0)*0.35;
  }
  // las luces de la cara nocturna destacan más
  float dayK=smoothstep(-0.1,0.3,dot(normalize(vWorld-uPlanetPos),L))*sh;
  em*=mix(1.25,0.7,dayK);
  gl_FragColor=vec4(col+em,1.0);
}`;

const POINTS_VERT = /* glsl */`
attribute float aSeed; attribute float aType;
uniform float uTime; uniform float uScale; uniform float uR0; uniform float uR1;
varying vec3 vCol; varying float vI;
void main(){
  vec3 pos=position;
  if(aType<0.5){
    float f=fract(aSeed*7.13+uTime*0.0045*(0.6+aSeed));
    if(fract(aSeed*91.7)>0.5) f=1.0-f;
    pos=position*(uR0+f*(uR1-uR0));
    vCol=mix(vec3(1.0,0.8,0.45),vec3(0.5,0.95,1.0),step(0.5,fract(aSeed*13.1)));
    vI=2.2;
  } else {
    float b=step(0.82,fract(uTime*0.35+aSeed));
    vCol=mix(vec3(1.0,0.25,0.35),vec3(1.0,1.0,1.0),step(0.5,fract(aSeed*5.3)));
    vI=b*5.0+0.15;
  }
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  gl_PointSize=clamp(0.9*uScale/-mv.z,2.0,22.0);
  gl_Position=projectionMatrix*mv;
}`;
const POINTS_FRAG = /* glsl */`
varying vec3 vCol; varying float vI;
void main(){
  vec2 d=gl_PointCoord-0.5; float r=dot(d,d);
  float a=exp(-r*28.0);
  gl_FragColor=vec4(vCol*vI*a,1.0);
}`;

export default function create(THREE, { sunDir, renderer }) {
  const R = 60;
  const ATMO_R = R * 1.07;
  const RING_R = 96;
  const MOON_R = 14;
  const MOON_ORBIT = 138;
  const sun = sunDir.clone().normalize();
  const sunCol = new THREE.Vector3(1.0, 0.86, 0.62).multiplyScalar(1.7);

  const root = new THREE.Group();
  root.name = 'Verdalia';

  const tilt = new THREE.Group();
  tilt.rotation.set(0.12, 0, 0.36);
  root.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);

  const moonPos = new THREE.Vector3();
  const planetPos = new THREE.Vector3();
  const P2C = new THREE.Matrix3();

  // ---------------- planeta
  const planetU = {
    uSun: { value: sun }, uSunCol: { value: sunCol }, uTime: { value: 0 }, uCloudT: { value: 0 },
    uP2C: { value: P2C }, uMoonPos: { value: moonPos }, uMoonR: { value: MOON_R },
  };
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(R, 256, 160),
    new THREE.ShaderMaterial({ uniforms: planetU, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG })
  );
  spin.add(planet);

  // ---------------- nubes
  const cloudU = {
    uSun: { value: sun }, uSunCol: { value: sunCol }, uCloudT: { value: 0 },
    uMoonPos: { value: moonPos }, uMoonR: { value: MOON_R },
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.012, 192, 128),
    new THREE.ShaderMaterial({
      uniforms: cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
      transparent: true, depthWrite: false,
    })
  );
  clouds.renderOrder = 1;
  tilt.add(clouds);

  // ---------------- atmósfera (shader genérico reutilizado para la luna)
  function makeAtmo(params) {
    const u = {
      uSun: { value: sun }, uSunCol: { value: sunCol }, uTime: { value: 0 },
      uR: { value: params.R }, uRa: { value: params.Ra }, uH: { value: params.H },
      uInt: { value: params.int }, uMie: { value: params.mie }, uMieG: { value: 0.76 },
      uIri: { value: params.iri }, uScat: { value: params.scat },
      uCyan: { value: params.cyan }, uViolet: { value: params.violet }, uPink: { value: params.pink },
      uAirglow: { value: params.airglow },
    };
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(params.Ra, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: u, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        transparent: true, depthWrite: false, side: THREE.FrontSide,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      })
    );
    m.renderOrder = 2;
    m.userData.Ra = params.Ra;
    return m;
  }
  const atmo = makeAtmo({
    R, Ra: ATMO_R, H: 1.1, int: 4.2, mie: 0.012, iri: 0.85,
    scat: new THREE.Vector3(0.046, 0.060, 0.072),
    cyan: new THREE.Vector3(0.35, 1.05, 1.25), violet: new THREE.Vector3(0.85, 0.55, 1.35), pink: new THREE.Vector3(1.45, 0.5, 0.95),
    airglow: new THREE.Vector3(0.10, 0.22, 0.12).multiplyScalar(0.05),
  });
  root.add(atmo);

  // ---------------- anillo orbital + ascensores espaciales
  const stationU = (kind) => ({
    uSun: { value: sun }, uSunCol: { value: sunCol }, uPlanetPos: { value: planetPos }, uPlanetR: { value: R },
    uTime: { value: 0 }, uKind: { value: kind }, uMoonPos: { value: moonPos }, uMoonR: { value: MOON_R },
  });
  const stationMats = [];
  const mkStationMat = (kind) => {
    const m = new THREE.ShaderMaterial({ uniforms: stationU(kind), vertexShader: STATION_VERT, fragmentShader: STATION_FRAG, side: kind > 1.5 ? THREE.FrontSide : THREE.DoubleSide });
    m.extensions = { derivatives: true };
    stationMats.push(m); return m;
  };
  const ringGeo = new THREE.TorusGeometry(RING_R, 0.55, 14, 900);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, mkStationMat(0));
  spin.add(ring);
  // anillo secundario fino (estructura de soporte)
  const ring2Geo = new THREE.TorusGeometry(RING_R + 2.2, 0.14, 6, 900);
  ring2Geo.rotateX(Math.PI / 2);
  spin.add(new THREE.Mesh(ring2Geo, mkStationMat(2)));

  const NT = 6;
  const hubMat = mkStationMat(1);
  const tetherMat = mkStationMat(2);
  const tetherLen = RING_R - R + 0.4;
  const tetherGeo = new THREE.CylinderGeometry(0.16, 0.22, tetherLen, 8, 1, true);
  const hubGeo = new THREE.CylinderGeometry(2.6, 2.6, 1.6, 48, 1, false);
  const hubGeo2 = new THREE.SphereGeometry(1.5, 32, 16);
  const pPos = [], pSeed = [], pType = [];
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * Math.PI * 2 + 0.3;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const tether = new THREE.Mesh(tetherGeo, tetherMat);
    tether.position.copy(dir).multiplyScalar(R + tetherLen / 2 - 0.2);
    tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spin.add(tether);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.copy(dir).multiplyScalar(RING_R);
    spin.add(hub);
    const hub2 = new THREE.Mesh(hubGeo2, hubMat);
    hub2.position.copy(dir).multiplyScalar(RING_R + 2.4);
    spin.add(hub2);
    // escaladores (suben y bajan por el cable)
    for (let k = 0; k < 5; k++) { pPos.push(dir.x, dir.y, dir.z); pSeed.push(Math.random()); pType.push(0); }
    // balizas
    const b1 = dir.clone().multiplyScalar(RING_R + 4.1);
    pPos.push(b1.x, b1.y, b1.z); pSeed.push(i * 0.17); pType.push(1);
    const b2 = dir.clone().multiplyScalar(RING_R).add(new THREE.Vector3(0, 1.0, 0));
    pPos.push(b2.x, b2.y, b2.z); pSeed.push(i * 0.17 + 0.5); pType.push(1);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
  pGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(pSeed, 1));
  pGeo.setAttribute('aType', new THREE.Float32BufferAttribute(pType, 1));
  const pointsU = { uTime: { value: 0 }, uScale: { value: 600 }, uR0: { value: R + 0.6 }, uR1: { value: RING_R - 0.8 } };
  const points = new THREE.Points(pGeo, new THREE.ShaderMaterial({
    uniforms: pointsU, vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.renderOrder = 3;
  spin.add(points);

  // ---------------- luna Lirien
  const moonPivot = new THREE.Group();
  moonPivot.rotation.set(0.16, 0, -0.08);
  root.add(moonPivot);
  const moonOrbit = new THREE.Group();
  moonPivot.add(moonOrbit);
  const moonU = { uSun: { value: sun }, uSunCol: { value: sunCol }, uMoonPos: { value: planetPos }, uPlanetR: { value: R * 1.02 } };
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_R, 160, 96),
    new THREE.ShaderMaterial({ uniforms: moonU, vertexShader: PLANET_VERT, fragmentShader: MOON_FRAG })
  );
  moon.position.set(MOON_ORBIT, 0, 0);
  moonOrbit.add(moon);
  const moonAtmo = makeAtmo({
    R: MOON_R, Ra: MOON_R * 1.07, H: 0.32, int: 3.5, mie: 0.002, iri: 0.6,
    scat: new THREE.Vector3(0.05, 0.065, 0.085),
    cyan: new THREE.Vector3(0.4, 1.0, 1.2), violet: new THREE.Vector3(0.7, 0.6, 1.3), pink: new THREE.Vector3(1.2, 0.6, 1.0),
    airglow: new THREE.Vector3(0, 0, 0),
  });
  moonAtmo.position.copy(moon.position);
  moonOrbit.add(moonAtmo);
  let moonAngle = 0.59;
  moonOrbit.rotation.y = moonAngle;

  let spinAngle = 0.0, cloudAngle = 0.0;
  const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
  const atmos = [atmo, moonAtmo];
  const sizeV = new THREE.Vector2();

  function update(dt, t, ctx) {
    spinAngle += dt * 0.006;
    cloudAngle += dt * 0.0078;
    moonAngle += dt * 0.0035;
    spin.rotation.y = spinAngle;
    clouds.rotation.y = cloudAngle;
    moonOrbit.rotation.y = moonAngle;

    root.updateMatrixWorld(true);
    planet.getWorldPosition(planetPos);
    moon.getWorldPosition(moonPos);
    // matriz espacio-planeta -> espacio-nubes (solo rotación)
    tmpM.copy(clouds.matrixWorld).invert().multiply(planet.matrixWorld);
    P2C.setFromMatrix4(tmpM);

    planetU.uTime.value = t;
    planetU.uCloudT.value = t * 0.004;
    cloudU.uCloudT.value = t * 0.004;
    for (const m of stationMats) m.uniforms.uTime.value = t;
    pointsU.uTime.value = t;
    const r = ctx && ctx.renderer ? ctx.renderer : renderer;
    if (r && ctx && ctx.camera) {
      r.getDrawingBufferSize(sizeV);
      pointsU.uScale.value = sizeV.y * 0.5 * ctx.camera.projectionMatrix.elements[5];
    }
    for (const a of atmos) {
      a.material.uniforms.uTime.value = t;
      if (ctx && ctx.camera) {
        a.getWorldPosition(tmpV);
        const inside = ctx.camera.position.distanceTo(tmpV) < a.userData.Ra * 1.002;
        const side = inside ? THREE.BackSide : THREE.FrontSide;
        if (a.material.side !== side) { a.material.side = side; a.material.needsUpdate = true; }
      }
    }
  }

  update(0, 0, null);

  return {
    object: root,
    radius: R,
    viewDistance: 300,
    info: {
      nombre: 'Verdalia',
      tipo: 'Mundo vivo · planeta jardín',
      descripcion: 'Selvas magenta y bosques violeta se derraman hacia mares rosados y turquesa bajo la luz dorada de una estrella doble. Al caer la noche, continentes enteros respiran en luz: los bosques bioluminiscentes laten despacio, como si el planeta soñara. Sobre su ecuador, un anillo orbital sostenido por seis ascensores espaciales brilla con las ventanas de quienes eligieron vivir mirándolo.',
      datos: [
        ['Gravedad', '0,94 g'],
        ['Día', '31 h 12 min'],
        ['Atmósfera', 'N₂, O₂ y neón iridiscente'],
        ['Temperatura media', '19 °C'],
        ['Luna', 'Lirien, con atmósfera tenue'],
        ['Anillo orbital', 'Corona de Vidrio · 6 ascensores'],
      ],
      estrella: { nombre: 'Áurea Gémina', color: 0xffd98a },
    },
    update,
  };
}
