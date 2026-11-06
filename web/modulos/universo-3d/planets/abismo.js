// EL ABISMO — agujero negro supermasivo (gran final del viaje).
// Volumen raymarcheado con geodésicas de Schwarzschild aproximadas:
// horizonte negro, anillo de fotones, disco de acreción grueso y turbulento
// con gradiente de temperatura, beaming Doppler relativista, imagen lensada
// del disco por encima y por debajo, fondo estelar lensado y chorros polares.
//
// Unidades internas del shader: 1 = radio de Schwarzschild (rs = 40 unidades de mundo).

export default function create(THREE /* , { sunDir, renderer } */) {
  const RS = 40;            // horizonte de sucesos (unidades de mundo)
  const RP = 35;            // radio del volumen proxy en rs  (= 1400 unidades)

  const vertexShader = /* glsl */`
    varying vec3 vWorld;
    varying vec3 vCenter;
    void main() {
      vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;

  const fragmentShader = /* glsl */`
    precision highp float;
    uniform float uTime;
    uniform float uRs;
    uniform float uRp;
    uniform mat4 projectionMatrix;
    varying vec3 vWorld;
    varying vec3 vCenter;

    // ---------- ruido ----------
    float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    float vnoise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash13(i);
      float b = hash13(i + vec3(1,0,0));
      float c = hash13(i + vec3(0,1,0));
      float d = hash13(i + vec3(1,1,0));
      float e = hash13(i + vec3(0,0,1));
      float g = hash13(i + vec3(1,0,1));
      float h = hash13(i + vec3(0,1,1));
      float k = hash13(i + vec3(1,1,1));
      return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y),
                 mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
    }
    float fbm4(vec3 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
      return s / 0.9375;
    }
    float fbm3(vec3 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + vec3(5.3, 1.1, 7.7); a *= 0.5; }
      return s / 0.875;
    }

    // ---------- paleta de temperatura (violeta frío -> blanco-azul caliente) ----------
    vec3 palette(float x) {
      vec3 c0 = vec3(0.22, 0.04, 0.42);   // violeta
      vec3 c1 = vec3(0.85, 0.12, 0.55);   // magenta
      vec3 c2 = vec3(1.00, 0.36, 0.10);   // naranja
      vec3 c3 = vec3(1.00, 0.70, 0.30);   // oro
      vec3 c4 = vec3(1.00, 0.93, 0.80);   // blanco cálido
      vec3 c5 = vec3(0.72, 0.85, 1.15);   // blanco-azul
      x = clamp(x, 0.0, 1.25);
      if (x < 0.25) return mix(c0, c1, x / 0.25);
      if (x < 0.45) return mix(c1, c2, (x - 0.25) / 0.20);
      if (x < 0.65) return mix(c2, c3, (x - 0.45) / 0.20);
      if (x < 0.85) return mix(c3, c4, (x - 0.65) / 0.20);
      return mix(c4, c5, (x - 0.85) / 0.40);
    }

    // ---------- disco de acreción ----------
    // Capa de turbulencia que gira kepleriana; dos capas desfasadas en el tiempo
    // para evitar el enrollamiento infinito de la cizalla.
    float diskLayer(float phi, float lr, float yn, float tl, float seed) {
      float om = 1.5 * exp(-1.5 * lr);          // ~ r^-1.5
      float ph = phi - om * tl;
      vec3 q = vec3(cos(ph) * 2.4, sin(ph) * 2.4, lr * 7.5 + yn * 0.35) + seed;
      float n = fbm3(q);
      // carriles finos y brillantes
      float lanes = vnoise(vec3(cos(ph) * 1.2 + seed, sin(ph) * 1.2, lr * 34.0));
      return n * (0.45 + 1.1 * lanes * lanes);
    }

    void diskSample(vec3 p, vec3 dir, float dt, inout vec3 col, inout float T, float t) {
      float rho = length(p.xz);
      if (rho < 2.2 || rho > 12.5) return;
      float H = 0.045 * rho + 0.05;
      float yn = p.y / H;
      if (abs(yn) > 2.6) return;
      float prof = smoothstep(2.35, 3.4, rho) * (1.0 - smoothstep(7.0, 12.0, rho));
      if (prof <= 0.0 || prof * exp(-yn * yn / 1.96) < 0.004) return;

      float phi = atan(p.z, p.x);
      float lr = log(rho);
      const float P = 16.0;
      float f = fract(t / P);
      float w = 1.0 - abs(2.0 * f - 1.0);
      float nA = diskLayer(phi, lr, yn, f * P, 0.0);
      float nB = diskLayer(phi, lr, yn, fract(t / P + 0.5) * P, 13.7);
      float n = mix(nB, nA, w);

      // grosor turbulento
      float Hn = 0.6 + 0.8 * n;
      float vert = exp(-yn * yn / (Hn * Hn));
      float dens = prof * vert * pow(smoothstep(0.12, 0.95, n), 1.5) * 9.0;
      if (dens < 1e-4) return;

      // relatividad: Doppler + corrimiento gravitacional
      float beta = min(sqrt(0.5 / max(rho - 1.0, 0.3)), 0.62);
      vec3 vdir = normalize(vec3(-p.z, 0.0, p.x));          // giro antihorario visto desde +y
      float cosT = dot(vdir, -dir);                         // hacia el observador
      float gam = inversesqrt(1.0 - beta * beta);
      float D = 1.0 / (gam * (1.0 - beta * cosT));
      float g = sqrt(max(1.0 - 1.0 / length(p), 0.05));
      float shift = D * g;

      float temp = pow(2.7 / rho, 0.8) * shift;
      float I = min(3.0 * pow(temp, 3.0) * pow(shift, 0.8), 4.0) + 0.15 * prof;
      // núcleos calientes en las crestas de turbulencia
      I *= 0.6 + 0.8 * smoothstep(0.45, 0.85, n);
      vec3 em = palette(temp) * I;

      float a = dens * dt;
      col += T * em * a;
      T *= exp(-a * 1.35);
    }

    // ---------- chorros relativistas ----------
    vec3 jetSample(vec3 p, float t) {
      float y = abs(p.y);
      if (y < 1.2 || y > 31.0) return vec3(0.0);
      float rho = length(p.xz);
      float w = 0.18 + 0.075 * y;
      float q = rho / w;
      if (q > 3.0) return vec3(0.0);
      float core = exp(-q * q * 2.2);
      float sheath = exp(-q * q * 0.6) * 0.35;
      float n = vnoise(vec3(p.x * 0.9, y * 0.45 - t * 2.6, p.z * 0.9));
      float knots = 0.45 + 0.9 * n * n;
      float fade = smoothstep(1.2, 4.0, y) * (1.0 - smoothstep(18.0, 31.0, y)) / (1.0 + 0.05 * y);
      return (vec3(0.45, 0.55, 1.6) * core + vec3(0.55, 0.22, 1.0) * sheath * 0.6) * knots * fade * 0.11;
    }

    // ---------- fondo procedural (estrellas + nebulosa violeta) ----------
    vec3 background(vec3 d) {
      vec3 c = vec3(0.0006, 0.0003, 0.0026);
      float neb = fbm3(d * 2.6 + vec3(3.0, 1.0, 7.0));
      float neb2 = fbm3(d * 6.0 + vec3(neb * 2.0));
      c += vec3(0.035, 0.010, 0.075) * pow(neb, 3.0) * 2.2;
      c += vec3(0.010, 0.012, 0.050) * pow(neb2, 4.0) * 2.0;
      for (int l = 0; l < 2; l++) {
        float S = l == 0 ? 90.0 : 210.0;
        vec3 gp = d * S;
        vec3 id = floor(gp);
        vec3 fp = fract(gp) - 0.5;
        float h = hash13(id + float(l) * 17.0);
        if (h > (l == 0 ? 0.90 : 0.86)) {
          vec3 o = (vec3(hash13(id + 1.3), hash13(id + 2.7), hash13(id + 5.1)) - 0.5) * 0.6;
          float dist = length(fp - o);
          float br = (l == 0 ? 2.6 : 0.9) * pow(hash13(id + 9.9), 3.0) + 0.15;
          float tint = hash13(id + 4.4);
          vec3 sc = mix(vec3(1.0, 0.75, 0.55), vec3(0.65, 0.75, 1.0), tint);
          c += sc * br * smoothstep(0.16, 0.0, dist);
        }
      }
      return c;
    }

    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

    void main() {
      vec3 C = vCenter;
      vec3 ro = (cameraPosition - C) / uRs;
      vec3 rd = normalize(vWorld - cameraPosition);
      float t = uTime;

      vec3 p = ro;
      float b0 = dot(ro, rd);
      float c0 = dot(ro, ro) - uRp * uRp;
      if (c0 > 0.0) {
        float disc = b0 * b0 - c0;
        if (disc < 0.0) discard;
        float te = -b0 - sqrt(disc);
        if (te < 0.0) discard;
        p = ro + rd * te;
      }
      vec3 v = rd;
      vec3 hv = cross(p, v);
      float h2 = dot(hv, hv);
      float bImp = sqrt(h2);

      vec3 col = vec3(0.0);
      float T = 1.0;
      bool captured = false;
      bool hit = false;
      vec3 hitP = p;
      float jit = ign(gl_FragCoord.xy + vec2(fract(t * 7.13) * 61.0, 0.0));

      for (int i = 0; i < 140; i++) {
        float r = length(p);
        if (r < 1.0) { captured = true; break; }
        float rv = dot(p, v);
        if (rv > 0.0 && (r > 13.5 || r > uRp)) break;
        if (T < 0.01) break;

        float dt = 0.09 * r;
        float rho = length(p.xz);
        if (rho < 13.0) {
          float H = 0.045 * rho + 0.05;
          float ds = abs(p.y) - 2.4 * H;
          dt = min(dt, max(ds, 0.38 * H));
        }
        dt = max(dt, 0.025);
        if (i == 0) dt *= 0.2 + jit;

        vec3 dn = normalize(v);
        float T0 = T;
        diskSample(p, dn, dt, col, T, t);
        col += T * jetSample(p, t) * dt;
        if (!hit && T < 0.5) { hit = true; hitP = p; }

        // geodésica: a = -1.5 h^2 x / r^5  (integración semi-implícita)
        float r2 = r * r;
        vec3 acc = -1.5 * h2 * p / (r2 * r2 * r);
        v += acc * dt;
        p += v * dt;
      }

      if (!captured && T > 0.01) {
        vec3 dirOut = normalize(v);
        // chorros más allá del radio de seguimiento: tramo recto
        float r = length(p);
        if (r < uRp) {
          float bq = dot(p, dirOut);
          float cq = dot(p, p) - uRp * uRp;
          float tex = -bq + sqrt(max(bq * bq - cq, 0.0));
          float st = tex / 12.0;
          vec3 q = p + dirOut * st * jit;
          for (int k = 0; k < 12; k++) {
            col += T * jetSample(q, t) * st;
            q += dirOut * st;
          }
        }
        // anillo de fotones (rayos que rozan la esfera de fotones b ~ 3√3/2)
        float bc = 2.598;
        float ringX = max(bImp - bc, 0.0);
        float ring = exp(-ringX * 10.0) * 1.8 + exp(-ringX * 3.0) * 0.12;
        col += T * vec3(1.0, 0.72, 0.42) * ring;

        // fondo lensado, se desvanece hacia el borde del proxy
        float bgA = 1.0 - smoothstep(7.0, 19.0, bImp);
        col += T * background(dirOut) * bgA;
        T *= 1.0 - bgA;
      }
      if (captured) {
        if (!hit) { hit = true; hitP = p; }
        T = 0.0;
      }

      if (hit) {
        vec4 cp = projectionMatrix * viewMatrix * vec4(C + hitP * uRs, 1.0);
        gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
      } else {
        gl_FragDepth = gl_FragCoord.z;
      }
      gl_FragColor = vec4(col, 1.0 - T);
    }
  `;

  const uniforms = {
    uTime: { value: 0 },
    uRs: { value: RS },
    uRp: { value: RP },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
  });

  const proxy = new THREE.Mesh(new THREE.SphereGeometry(RS * RP, 48, 24), mat);
  proxy.frustumCulled = false;
  proxy.renderOrder = 10;

  const object = new THREE.Group();
  object.name = 'abismo';
  object.add(proxy);

  return {
    object,
    radius: RS,
    viewDistance: 900,
    info: {
      nombre: 'El Abismo',
      tipo: 'Agujero negro supermasivo',
      descripcion:
        'Aquí termina el viaje: un pozo de noche absoluta rodeado de un anillo de fuego que gira a una fracción de la velocidad de la luz. ' +
        'La luz del disco se curva sobre sí misma y dibuja arcos imposibles por encima y por debajo del horizonte, ' +
        'mientras las estrellas del fondo se deforman en lentes de cristal. Nada que cruce esa frontera vuelve a ser visto.',
      datos: [
        ['Masa', '4,1 millones de soles'],
        ['Horizonte de sucesos', '40 unidades'],
        ['Disco de acreción', '120 – 460 unidades'],
        ['Velocidad interior del disco', '0,41 c'],
        ['Temperatura interior', '≈ 9 millones K'],
        ['Dilatación temporal (ISCO)', '× 1,22'],
      ],
      estrella: { nombre: '—', color: 0xffb070 },
    },
    update(dt, t) {
      uniforms.uTime.value = t;
    },
  };
}
