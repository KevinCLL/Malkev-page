// LA MALKEVNIA — procedural exploration vessel (Three.js r160)
// export default createShip(THREE) -> { object, length, update(dt, t, { speed }) }
// Forward = -Z, up = +Y, centred at origin, ~12.4 units long.

export default function createShip(THREE) {
  const root = new THREE.Group();
  root.name = 'LaMalkevnia';
  const disposables = [];

  // ---------------------------------------------------------------- utils
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hdr = (r, g, b) => new THREE.Color(r, g, b);

  // ------------------------------------------------------------ hull shape
  const Z0 = -5.75, Z1 = 4.55;           // hull body extent along Z
  // keyframes along s = (z-Z0)/(Z1-Z0): [s, rx, ry, yOffset]
  const KF = [
    [0.000, 0.015, 0.012, -0.12],
    [0.025, 0.17, 0.11, -0.11],
    [0.070, 0.36, 0.24, -0.08],
    [0.150, 0.58, 0.40, -0.04],
    [0.260, 0.78, 0.56, 0.00],
    [0.400, 0.90, 0.67, 0.02],
    [0.560, 0.94, 0.70, 0.02],
    [0.720, 0.90, 0.68, 0.01],
    [0.860, 0.80, 0.62, 0.00],
    [1.000, 0.68, 0.54, 0.00],
  ];
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function section(z) {
    const s = clamp((z - Z0) / (Z1 - Z0), 0, 1);
    let i = 0;
    while (i < KF.length - 2 && s > KF[i + 1][0]) i++;
    const k0 = KF[Math.max(0, i - 1)], k1 = KF[i], k2 = KF[i + 1], k3 = KF[Math.min(KF.length - 1, i + 2)];
    const t = (s - k1[0]) / (k2[0] - k1[0]);
    return {
      rx: catmull(k0[1], k1[1], k2[1], k3[1], t),
      ry: catmull(k0[2], k1[2], k2[2], k3[2], t),
      yo: catmull(k0[3], k1[3], k2[3], k3[3], t),
      n: 2.6,
    };
  }
  // a in [0,1): 0 = keel (bottom), 0.25 = starboard (+X), 0.5 = dorsal, 0.75 = port (-X)
  function surf(z, a, scale = 1, out = new THREE.Vector3()) {
    const S = section(z);
    const th = -Math.PI / 2 + a * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const e = 2 / S.n;
    const x = S.rx * scale * Math.sign(c) * Math.pow(Math.abs(c), e);
    const y = S.yo + S.ry * scale * Math.sign(s) * Math.pow(Math.abs(s), e);
    return out.set(x, y, z);
  }
  function surfNormal(z, a) {
    const p = surf(z, a), pz = surf(z + 0.01, a), pa = surf(z, a + 0.002);
    const dz = pz.sub(p), da = pa.sub(p);
    const n = new THREE.Vector3().crossVectors(da, dz).normalize();
    // make sure it points outward
    const S = section(z); const radial = new THREE.Vector3(p.x, p.y - S.yo, 0);
    if (n.dot(radial) < 0) n.negate();
    return n;
  }

  // generic grid geometry: fn(i/nu, j/nv) -> Vector3, uv(i,j) -> [u,v]
  function gridGeo(nu, nv, fn, uvfn) {
    const pos = [], uv = [], idx = [];
    const v = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      fn(i / nu, j / nv, v); pos.push(v.x, v.y, v.z);
      const t = uvfn(i / nu, j / nv); uv.push(t[0], t[1]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const hullUV = (z, a) => [(z - Z0) / (Z1 - Z0), 1 - a];

  // -------------------------------------------------------- canvas textures
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    disposables.push(t); return t;
  }

  // Panel texture set: colour, roughness, bump, emissive
  function panelSet(opts) {
    const W = opts.w || 2048, H = opts.h || 1024;
    const cC = canvas(W, H), cR = canvas(W, H), cB = canvas(W, H), cE = canvas(W, H);
    const xC = cC.getContext('2d'), xR = cR.getContext('2d'), xB = cB.getContext('2d'), xE = cE.getContext('2d');
    xC.fillStyle = opts.base; xC.fillRect(0, 0, W, H);
    xR.fillStyle = `rgb(${opts.rough},${opts.rough},${opts.rough})`; xR.fillRect(0, 0, W, H);
    xB.fillStyle = '#808080'; xB.fillRect(0, 0, W, H);
    xE.fillStyle = '#000'; xE.fillRect(0, 0, W, H);
    // panel columns along length
    let x = 0;
    const cols = [];
    while (x < W) { const w = (opts.colMin || 40) + rnd() * (opts.colVar || 90); cols.push([x, Math.min(W, x + w)]); x += w; }
    for (const [x0, x1] of cols) {
      let y = 0;
      const rowH = (opts.rowMin || 30) + rnd() * (opts.rowVar || 70);
      while (y < H) {
        const h = rowH * (0.5 + rnd() * 1.1);
        const y1 = Math.min(H, y + h);
        const k = (rnd() - 0.5) * (opts.tone || 14);
        const [r, g, b] = opts.baseRGB;
        xC.fillStyle = `rgb(${clamp(r + k, 0, 255)},${clamp(g + k, 0, 255)},${clamp(b + k * 1.05, 0, 255)})`;
        xC.fillRect(x0, y, x1 - x0, y1 - y);
        const rr = clamp(opts.rough + (rnd() - 0.5) * 50, 10, 250);
        xR.fillStyle = `rgb(${rr},${rr},${rr})`; xR.fillRect(x0, y, x1 - x0, y1 - y);
        // slightly raised panels
        const bb = 128 + (rnd() - 0.3) * 30; xB.fillStyle = `rgb(${bb},${bb},${bb})`; xB.fillRect(x0 + 2, y + 2, x1 - x0 - 4, y1 - y - 4);
        // panel seams
        xC.strokeStyle = opts.line; xC.lineWidth = 2; xC.strokeRect(x0 + 0.5, y + 0.5, x1 - x0, y1 - y);
        xB.strokeStyle = '#202020'; xB.lineWidth = 3; xB.strokeRect(x0 + 0.5, y + 0.5, x1 - x0, y1 - y);
        xR.strokeStyle = '#d0d0d0'; xR.lineWidth = 2; xR.strokeRect(x0 + 0.5, y + 0.5, x1 - x0, y1 - y);
        // hatches / greebles
        if (rnd() < 0.18) {
          const hw = 8 + rnd() * 22, hh = 6 + rnd() * 16;
          const hx = x0 + 4 + rnd() * Math.max(1, x1 - x0 - hw - 8), hy = y + 4 + rnd() * Math.max(1, y1 - y - hh - 8);
          xC.strokeStyle = opts.line; xC.lineWidth = 1.5; xC.strokeRect(hx, hy, hw, hh);
          xB.fillStyle = '#5a5a5a'; xB.fillRect(hx, hy, hw, hh);
          xB.strokeStyle = '#303030'; xB.strokeRect(hx, hy, hw, hh);
        }
        // rivet lines
        if (rnd() < 0.3) {
          xB.fillStyle = '#c8c8c8'; xC.fillStyle = opts.line;
          for (let rx = x0 + 5; rx < x1 - 4; rx += 7) { xB.fillRect(rx, y + 4, 2, 2); xC.globalAlpha = 0.35; xC.fillRect(rx, y + 4, 2, 2); xC.globalAlpha = 1; }
        }
        y = y1;
      }
    }
    if (opts.extra) opts.extra({ xC, xR, xB, xE, W, H });
    // grime / subtle noise
    const id = xC.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    xC.putImageData(id, 0, 0);
    return { map: tex(cC, true), roughnessMap: tex(cR, false), bumpMap: tex(cB, false), emissiveMap: tex(cE, true) };
  }

  // Hull (pearl white) texture with violet accent stripes and the name
  const hullTex = panelSet({
    base: '#e9e6ef', baseRGB: [233, 230, 239], line: '#6f6a7c', rough: 125, tone: 12,
    extra: ({ xC, xR, xB, xE, W, H }) => {
      // graphite keel band (a near 0 / 1 -> canvas y near H / 0)
      const keel = (y0, y1) => {
        xC.fillStyle = 'rgba(46,44,56,0.93)'; xC.fillRect(0, y0, W, y1 - y0);
        xR.fillStyle = 'rgba(120,120,120,0.9)'; xR.fillRect(0, y0, W, y1 - y0);
      };
      keel(0, H * 0.085); keel(H * 0.915, H);
      // violet accent stripes on lower flanks (a = 0.19 & 0.81)
      for (const a of [0.19, 0.81]) {
        const y = (1 - a) * H; // texture v = 1 - a, flipY -> canvas y = a*H ... see below
        const yy = a * H;
        void y;
        const x0 = W * 0.06, x1 = W * 0.97;
        const g = xC.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(120,70,200,0)'); g.addColorStop(0.1, '#7a4fd0'); g.addColorStop(1, '#5d34a8');
        xC.fillStyle = g; xC.fillRect(x0, yy - 9, x1 - x0, 18);
        xC.fillStyle = '#b89cf0'; xC.fillRect(x0 + 40, yy + 13, x1 - x0 - 40, 3);
        xC.fillRect(x0 + 40, yy - 16, x1 - x0 - 40, 3);
        const ge = xE.createLinearGradient(x0, 0, x1, 0);
        ge.addColorStop(0, 'rgba(150,90,255,0)'); ge.addColorStop(0.15, 'rgb(150,90,255)'); ge.addColorStop(1, 'rgb(110,60,220)');
        xE.fillStyle = ge; xE.fillRect(x0, yy - 2, x1 - x0, 4);
        xR.fillStyle = '#404040'; xR.fillRect(x0, yy - 9, x1 - x0, 18);
      }
      // ship name, both flanks (a = 0.27 starboard, 0.73 port)
      const name = 'LA MALKEVNIA';
      const drawName = (a, flip) => {
        xC.save();
        xC.translate(W * 0.30, a * H);
        if (flip) xC.rotate(Math.PI);
        xC.scale(1, 0.95);
        xC.font = '600 34px "Inter Display", Inter, "DejaVu Sans", sans-serif';
        xC.textAlign = 'center'; xC.textBaseline = 'middle';
        if (xC.letterSpacing !== undefined) xC.letterSpacing = '10px';
        xC.fillStyle = '#3b2a63'; xC.fillText(name, 0, 0);
        xC.restore();
        // registry mark
        xC.save(); xC.translate(W * 0.52, a * H); if (flip) xC.rotate(Math.PI);
        xC.font = '500 18px "Inter", "DejaVu Sans", sans-serif'; xC.textAlign = 'center'; xC.textBaseline = 'middle';
        xC.fillStyle = '#6b6480'; xC.fillText('MKV-01  ·  EXPLORACIÓN PROFUNDA', 0, 0);
        xC.restore();
      };
      // canvas y = a*H because uv.v = 1-a and CanvasTexture flipY = true
      drawName(0.27, true);
      drawName(0.73, false);
      // dorsal centre line
      xC.fillStyle = 'rgba(120,90,190,0.6)'; xC.fillRect(W * 0.05, H * 0.5 - 2, W * 0.2, 4);
    },
  });
  // Graphite plating
  const plateTex = panelSet({
    base: '#4a4855', baseRGB: [74, 72, 85], line: '#1e1c26', rough: 120, tone: 10, colMin: 60, colVar: 120,
    extra: ({ xC, xE, W, H }) => {
      // fine violet pin-stripes
      for (const f of [0.18, 0.82]) {
        xC.fillStyle = '#6a49b0'; xC.fillRect(0, f * H - 2, W, 4);
        xE.fillStyle = 'rgb(120,70,230)'; xE.fillRect(0, f * H - 1, W, 2);
      }
    },
  });
  // Pearl secondary plating (slightly warmer)
  const pearl2Tex = panelSet({ base: '#f1eef2', baseRGB: [241, 238, 242], line: '#7a7484', rough: 110, tone: 10, colMin: 80, colVar: 140, w: 1024, h: 512 });

  // ------------------------------------------------------------- materials
  const M = {};
  M.hull = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: hullTex.map, roughness: 1, roughnessMap: hullTex.roughnessMap,
    bumpMap: hullTex.bumpMap, bumpScale: 1.2, metalness: 0.12,
    clearcoat: 0.45, clearcoatRoughness: 0.38,
    iridescence: 0.35, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    emissive: 0xffffff, emissiveMap: hullTex.emissiveMap, emissiveIntensity: 1.6,
  });
  M.plate = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: plateTex.map, roughness: 1, roughnessMap: plateTex.roughnessMap,
    bumpMap: plateTex.bumpMap, bumpScale: 1.0, metalness: 0.28,
    clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: plateTex.emissiveMap, emissiveIntensity: 1.4,
  });
  M.pearl = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: pearl2Tex.map, roughness: 1, roughnessMap: pearl2Tex.roughnessMap,
    bumpMap: pearl2Tex.bumpMap, bumpScale: 1.0, metalness: 0.1,
    clearcoat: 0.4, clearcoatRoughness: 0.4, side: THREE.DoubleSide,
    iridescence: 0.4, iridescenceIOR: 1.3, iridescenceThicknessRange: [200, 450],
  });
  M.graphite = new THREE.MeshStandardMaterial({ color: 0x3c3a47, roughness: 0.42, metalness: 0.4 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x15141b, roughness: 0.35, metalness: 0.7 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0x9a96a8, roughness: 0.22, metalness: 0.85 });
  M.violet = new THREE.MeshStandardMaterial({ color: 0x5b3a9e, roughness: 0.3, metalness: 0.4, emissive: 0x7a4cff, emissiveIntensity: 0.25 });
  M.trim = new THREE.MeshBasicMaterial({ color: hdr(1.0, 0.45, 2.3) });
  M.trimSoft = new THREE.MeshBasicMaterial({ color: hdr(0.55, 0.28, 1.2) });
  for (const k in M) disposables.push(M[k]);

  const add = (geo, mat, parent = root) => { const m = new THREE.Mesh(geo, mat); parent.add(m); disposables.push(geo); return m; };

  // ------------------------------------------------------------------ hull
  const hullGeo = gridGeo(160, 96,
    (u, v, out) => surf(lerp(Z0, Z1, u), v, 1, out),
    (u, v) => hullUV(lerp(Z0, Z1, u), v));
  add(hullGeo, M.hull);
  // aft bulkhead cap
  {
    const S = section(Z1);
    const shape = new THREE.Shape();
    for (let i = 0; i <= 64; i++) { const p = surf(Z1, i / 64, 0.999); if (i === 0) shape.moveTo(p.x, p.y); else shape.lineTo(p.x, p.y); }
    const g = new THREE.ShapeGeometry(shape, 1); g.translate(0, 0, Z1);
    add(g, M.graphite); void S;
  }

  // ---------------------------------------------------- layered armour plates
  // plate: z range, angular centre & half-width functions, thickness
  function plate({ z0, z1, ac, hw, h = 0.035, mat, nz = 60, na = 20, trim = 0, chamfer = 0.4 }) {
    const g = new THREE.Group(); root.add(g);
    const hwz = (z) => {
      const tz = (z - z0) / (z1 - z0);
      const f = smooth(0, chamfer, tz) * (1 - 0.35 * smooth(1 - chamfer * 0.5, 1, tz));
      return typeof hw === 'function' ? hw(tz) : hw * (0.25 + 0.75 * f);
    };
    const A0 = (z) => ac - hwz(z), A1 = (z) => ac + hwz(z);
    const outerF = (u, v, out) => { const z = lerp(z0, z1, u); return surf(z, lerp(A0(z), A1(z), v), 1 + h / 0.8, out); };
    add(gridGeo(nz, na, outerF, (u, v) => { const z = lerp(z0, z1, u); return [(z - Z0) / (Z1 - Z0), lerp(A0(z), A1(z), v)]; }), mat, g);
    // side walls
    const wall = (edgeFn) => add(gridGeo(nz, 1, (u, v, out) => {
      const z = lerp(z0, z1, u); return surf(z, edgeFn(z), v ? 0.995 : 1 + h / 0.8, out);
    }, (u, v) => [u, v * 0.02]), mat, g);
    wall(A0); wall(A1);
    // front & back walls
    for (const zz of [z0, z1]) add(gridGeo(na, 1, (u, v, out) => surf(zz, lerp(A0(zz), A1(zz), u), v ? 0.995 : 1 + h / 0.8, out), (u, v) => [u, v * 0.02]), mat, g);
    if (trim) {
      for (const edge of [A0, A1]) {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const z = lerp(z0 + 0.05, z1 - 0.02, i / 40); pts.push(surf(z, edge(z) + (edge === A0 ? 0.004 : -0.004), 1 + h / 0.8 + 0.004)); }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, trim, 5, false), M.trim, g);
      }
    }
    return g;
  }
  // dorsal spine armour (graphite) with violet light-lines
  plate({ z0: -3.0, z1: 4.3, ac: 0.5, hw: 0.085, h: 0.05, mat: M.plate, trim: 0.007, chamfer: 0.35 });
  // forward dorsal cowl (pearl) layered over spine front
  plate({ z0: -4.6, z1: -2.2, ac: 0.5, hw: 0.11, h: 0.075, mat: M.pearl, chamfer: 0.7 });
  // lateral aft armour (pearl, layered twice)
  for (const side of [0.25, 0.75]) {
    plate({ z0: -0.6, z1: 4.45, ac: side, hw: 0.075, h: 0.045, mat: M.pearl, chamfer: 0.3 });
    plate({ z0: 1.6, z1: 4.5, ac: side + (side < 0.5 ? -0.01 : 0.01), hw: 0.05, h: 0.08, mat: M.plate, chamfer: 0.4, trim: 0.006 });
    // forward cheek plates
    plate({ z0: -4.2, z1: -1.4, ac: side + (side < 0.5 ? -0.035 : 0.035), hw: 0.035, h: 0.035, mat: M.plate, chamfer: 0.6, trim: 0.005 });
  }
  // ventral keel
  plate({ z0: -3.8, z1: 4.4, ac: 0.0001, hw: 0.07, h: 0.06, mat: M.plate, chamfer: 0.3 });

  // ------------------------------------------------------- observation bridge
  const bridge = new THREE.Group(); root.add(bridge);
  {
    const zb = -3.25; const top = surf(zb, 0.5, 1 + 0.075 / 0.8);
    bridge.position.set(0, top.y - 0.06, zb);
    // window grid emissive texture for the canopy
    const c = canvas(512, 256), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 256);
    const ce = canvas(512, 256), xe = ce.getContext('2d');
    xe.fillStyle = '#000'; xe.fillRect(0, 0, 512, 256);
    // sphere uv: u around (0..1), v from top(1) to bottom(0) -> canvas y 0 = top
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 3; j++) {
        const x0 = i * 512 / 32 + 2, y0 = 76 + j * 17;
        const warm = 0.4 + 0.6 * (j / 2);
        const lit = rnd() < 0.8;
        const g = xe.createLinearGradient(0, y0, 0, y0 + 13);
        g.addColorStop(0, `rgba(255,${150 + 40 * warm | 0},${70 + 30 * warm | 0},${lit ? 0.2 + 0.5 * warm : 0.04})`);
        g.addColorStop(1, `rgba(255,170,90,${lit ? 0.5 + 0.5 * warm : 0.06})`);
        xe.fillStyle = g; xe.fillRect(x0, y0, 512 / 32 - 4, 13);
      }
    }
    // faint starlight reflections on the clear crown
    xe.fillStyle = 'rgba(120,90,200,0.08)'; xe.fillRect(0, 0, 512, 70);
    // canopy crown is clear (dark) to look out at the stars
    const emTex = tex(ce, true);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0c0a14, roughness: 0.06, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.03,
      emissive: 0xffffff, emissiveMap: emTex, emissiveIntensity: 1.5, iridescence: 0.6, iridescenceIOR: 1.6,
      specularIntensity: 1, specularColor: 0xd8c8ff,
    });
    disposables.push(glass);
    const dome = add(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5), glass, bridge);
    dome.scale.set(0.34, 0.24, 0.85);
    // mullions: one longitudinal spine + transverse hoops
    const spine = add(new THREE.TorusGeometry(1.0, 0.016, 6, 64, Math.PI), M.graphite, bridge);
    spine.scale.set(0.855, 0.245, 1); spine.rotation.y = Math.PI / 2;
    for (const zz of [-0.5, -0.15, 0.2, 0.52]) {
      const k = Math.sqrt(1 - (zz / 0.85) ** 2);
      const hoop = add(new THREE.TorusGeometry(1.0, 0.014, 6, 48, Math.PI), M.graphite, bridge);
      hoop.scale.set(0.345 * k, 0.245 * k, 1); hoop.position.z = zz;
    }
    // base collar
    const collar = add(new THREE.TorusGeometry(1, 0.035, 8, 64), M.chrome, bridge);
    collar.rotation.x = Math.PI / 2; collar.scale.set(0.35, 0.865, 1);
    // interior warm glow (seen through the glass at grazing angles)
    const inner = add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshBasicMaterial({ color: hdr(0.9, 0.5, 0.25) }), bridge);
    inner.scale.set(0.25, 0.1, 0.65); disposables.push(inner.material);
  }

  // ------------------------------------------------------------ window lights
  const lights = [];
  function windowRow({ z0, z1, a, step, w = 0.07, h = 0.035, chance = 0.85, scale = 1.012, warm = true }) {
    const list = [];
    for (let z = z0; z <= z1; z += step) {
      if (rnd() > chance) continue;
      const p = surf(z, a, scale), n = surfNormal(z, a);
      list.push({ p, n });
    }
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1);
    const col = new THREE.Color();
    list.forEach((o, i) => {
      // plane +Z -> normal; plane +X -> along hull (z axis)
      const zAxis = o.n.clone();
      const xAxis = new THREE.Vector3(0, 0, 1).sub(zAxis.clone().multiplyScalar(zAxis.z)).normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
      mtx.makeBasis(xAxis, yAxis, zAxis); mtx.setPosition(o.p);
      im.setMatrixAt(i, mtx);
      const r = rnd();
      if (!warm || r < 0.12) col.setRGB(0.9, 1.1, 1.7);       // cool lab light
      else if (r < 0.2) col.setRGB(0.25, 0.18, 0.15);          // dark cabin
      else col.setRGB(1.7 + rnd() * 0.5, 1.0 + rnd() * 0.2, 0.45); // warm
      im.setColorAt(i, col);
    });
    void q; void up;
    root.add(im); disposables.push(geo, mat);
    return im;
  }
  for (const s of [1, -1]) {
    const A = (a) => (s > 0 ? a : 1 - a);
    windowRow({ z0: -3.9, z1: 2.2, a: A(0.335), step: 0.16 });
    windowRow({ z0: -3.4, z1: 1.6, a: A(0.30), step: 0.16, chance: 0.7 });
    windowRow({ z0: -1.2, z1: 1.0, a: A(0.13), step: 0.22, chance: 0.6, w: 0.05, h: 0.03 });
  }

  // ------------------------------------------------------------- habitat ring
  const ringZ = 0.75, ringR = 2.3;
  const ringPivotDummy = 0;
  const ringPivot = new THREE.Group(); ringPivot.position.z = ringZ; root.add(ringPivot);
  {
    // cross-section: rounded rectangle (radial thickness 0.26, axial width 0.58)
    const prof = [];
    const rw = 0.29, rh = 0.13, rr = 0.07;
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * Math.PI / 2; prof.push(new THREE.Vector2(ringR + cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } };
    corner(rh - rr, rw - rr, 0); corner(-rh + rr, rw - rr, Math.PI / 2); corner(-rh + rr, -rw + rr, Math.PI); corner(rh - rr, -rw + rr, Math.PI * 1.5);
    prof.push(prof[0].clone());
    // lathe around Y; we rotate so the ring axis is Z. Profile y -> axial
    const lg = new THREE.LatheGeometry(prof.reverse(), 192);
    lg.rotateX(Math.PI / 2);
    // remap uv for nicer panelling
    const uv = lg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 0.25 + 0.4);
    add(lg, M.pearl, ringPivot);
    // violet light band on the outer rim
    for (const zz of [-0.2, 0.2]) {
      const t = add(new THREE.TorusGeometry(ringR + rh + 0.004, 0.009, 6, 256), M.trim, ringPivot); t.position.z = zz;
    }
    // graphite inner track
    const tr = add(new THREE.TorusGeometry(ringR - rh - 0.01, 0.05, 8, 192), M.graphite, ringPivot); tr.scale.z = 2.0;
    // spokes
    const nSp = 4;
    for (let i = 0; i < nSp; i++) {
      const ang = (i / nSp) * Math.PI * 2 + Math.PI / 4;
      const spoke = new THREE.Group(); spoke.rotation.z = ang; ringPivot.add(spoke);
      const len = ringR - rh - 0.9;
      const c = add(new THREE.CylinderGeometry(0.055, 0.075, len, 12), M.graphite, spoke); c.position.x = 0.9 + len / 2; c.rotation.z = Math.PI / 2;
      const c2 = add(new THREE.CylinderGeometry(0.03, 0.03, len, 8), M.chrome, spoke); c2.position.set(0.9 + len / 2, 0, 0.12); c2.rotation.z = Math.PI / 2;
      const c3 = c2.clone(); c3.position.z = -0.12; spoke.add(c3);
      // little lit pod mid-spoke
      const pod = add(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 14), M.pearl, spoke); pod.position.x = 0.9 + len * 0.55; pod.rotation.z = Math.PI / 2;
    }
    // hub collar on hull
    const hub = add(new THREE.CylinderGeometry(1.0, 1.0, 0.42, 64, 1, true), M.plate, ringPivot); hub.rotation.x = Math.PI / 2; hub.scale.set(1.0, 1, 0.78);
    for (const zz of [-0.22, 0.22]) { const h = add(new THREE.TorusGeometry(1.0, 0.035, 8, 96), M.chrome, ringPivot); h.position.z = zz; h.scale.set(1, 0.78, 1); }
    // windows: two rows on the outer face, plus a row on each flat side
    const geo = new THREE.PlaneGeometry(0.075, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const items = [];
    const N = 96;
    for (let i = 0; i < N; i++) for (const zz of [-0.09, 0.09]) if (rnd() < 0.8) items.push({ ang: (i / N) * Math.PI * 2, z: zz, outer: true });
    for (let i = 0; i < 64; i++) for (const zz of [-1, 1]) if (rnd() < 0.4) items.push({ ang: (i / 90) * Math.PI * 2 + 0.01, z: zz * (rw + 0.003), outer: false });
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    items.forEach((o, i) => {
      const c = Math.cos(o.ang), s = Math.sin(o.ang);
      if (o.outer) {
        const n = new THREE.Vector3(c, s, 0), xA = new THREE.Vector3(-s, c, 0), yA = new THREE.Vector3(0, 0, 1);
        m4.makeBasis(xA, yA.clone().negate().cross(xA).cross(xA).normalize().negate(), n);
        m4.makeBasis(xA, new THREE.Vector3().crossVectors(n, xA), n);
        m4.setPosition(c * (ringR + rh + 0.006), s * (ringR + rh + 0.006), o.z);
      } else {
        const n = new THREE.Vector3(0, 0, Math.sign(o.z)), xA = new THREE.Vector3(-s, c, 0);
        m4.makeBasis(xA, new THREE.Vector3().crossVectors(n, xA), n);
        m4.setPosition(c * (ringR + 0.03), s * (ringR + 0.03), o.z);
      }
      im.setMatrixAt(i, m4);
      const r = rnd();
      if (r < 0.1) col.setRGB(0.8, 1.0, 1.6); else if (r < 0.3) col.setRGB(0.12, 0.09, 0.08); else col.setRGB(1.5 + rnd() * 0.6, 0.9 + rnd() * 0.2, 0.42);
      im.setColorAt(i, col);
    });
    ringPivot.add(im); disposables.push(geo, mat);
  }

  // ------------------------------------------------------------ radiator fins
  const radiators = [];
  {
    // heat-pipe texture
    const c = canvas(256, 512), x = c.getContext('2d');
    x.fillStyle = '#26252e'; x.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 256; i += 16) { x.fillStyle = '#34323e'; x.fillRect(i + 2, 0, 10, 512); x.fillStyle = '#18171d'; x.fillRect(i, 0, 2, 512); }
    for (let j = 0; j < 512; j += 64) { x.fillStyle = '#1c1b22'; x.fillRect(0, j, 256, 3); }
    const ce = canvas(256, 512), xe = ce.getContext('2d'); xe.fillStyle = '#000'; xe.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 256; i += 16) { const g = xe.createLinearGradient(0, 512, 0, 0); g.addColorStop(0, 'rgba(160,80,255,0.9)'); g.addColorStop(0.6, 'rgba(90,40,200,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); xe.fillStyle = g; xe.fillRect(i + 5, 0, 4, 512); }
    const rmat = new THREE.MeshStandardMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(ce, true), emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide });
    disposables.push(rmat);
    // swept trapezoid panel: root chord along z, extends outward
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1.75, 0); shape.lineTo(1.6, 0.55); shape.lineTo(0, 1.25); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    // uv in shape space -> normalise
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.8, uv.getY(i) / 1.3);
    geo.translate(0, 0, -0.015);
    disposables.push(geo);
    for (const side of [1, -1]) for (const up of [1, -1]) {
      const zAft = 4.25;
      const a = side > 0 ? (up > 0 ? 0.37 : 0.14) : (up > 0 ? 0.63 : 0.86);
      const p = surf(zAft - 0.8, a, 0.96);
      const d = new THREE.Vector3(p.x, p.y - section(zAft).yo, 0).normalize();
      const fin = new THREE.Mesh(geo, rmat); root.add(fin);
      const xA = new THREE.Vector3(0, 0, -1), zA = new THREE.Vector3().crossVectors(xA, d);
      const sy = up > 0 ? 1.0 : 0.7;
      const m4 = new THREE.Matrix4().makeBasis(xA, d.clone().multiplyScalar(sy), zA);
      m4.setPosition(p.x, p.y, zAft);
      fin.matrixAutoUpdate = false; fin.matrix.copy(m4);
      const tip = new THREE.Vector3(p.x, p.y, zAft).addScaledVector(d, 1.25 * sy + 0.03).add(new THREE.Vector3(0, 0, -0.05));
      radiators.push({ side, up, tip, d });
      // root fairing
      const f = add(new THREE.BoxGeometry(0.1, 0.1, 1.9), M.graphite);
      f.position.set(p.x, p.y, zAft - 0.9);
      f.lookAt(f.position.clone().add(new THREE.Vector3(0, 0, 1)));
    }
  }

  // ---------------------------------------------------------------- engines
  const engineGroup = new THREE.Group(); root.add(engineGroup);
  const nozzleGlowMats = [], throatMats = [], plumes = [], glowSprites = [];
  // radial glow texture
  const glowTex = (() => {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = tex(c, false); return t;
  })();

  const plumeVS = /* glsl */`
    uniform float uEnd; uniform float uTime; uniform float uSpeed;
    varying float vT; varying vec3 vN; varying vec3 vV; varying vec2 vXY;
    void main(){
      vec3 p = position;
      vT = clamp(p.z, 0.0, 1.0);
      float bulge = 1.0 + 0.35*sin(vT*3.14159)*(1.0-uSpeed);
      p.xy *= mix(1.0, uEnd, vT) * bulge;
      vXY = normalize(position.xy + 1e-5);
      vec4 wp = modelMatrix * vec4(p,1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const plumeFS = /* glsl */`
    uniform float uTime; uniform float uSpeed; uniform float uIntensity; uniform float uSeed;
    uniform vec3 uCore; uniform vec3 uEdge;
    varying float vT; varying vec3 vN; varying vec3 vV; varying vec2 vXY;
    float h(float n){ return fract(sin(n)*43758.5453); }
    float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(h(i),h(i+1.0),f); }
    void main(){
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float core = pow(facing, 2.2);
      float t = vT;
      float fall = pow(1.0 - t, mix(3.0, 1.15, uSpeed)) * smoothstep(0.0, 0.03, t + 0.01);
      float flick = 0.8 + 0.2*n1(uTime*18.0 + uSeed*7.0) + 0.1*n1(uTime*37.0 - t*9.0 + uSeed);
      // streaming turbulence
      float ang = atan(vXY.y, vXY.x);
      float stream = 0.75 + 0.25*n1(ang*3.0 + t*14.0 - uTime*(8.0+30.0*uSpeed) + uSeed*13.0);
      // shock diamonds at higher thrust
      float shock = 1.0 + uSpeed*0.55*pow(0.5+0.5*cos(t*mix(18.0,60.0,uSpeed) - uTime*2.0), 6.0) * (1.0 - t);
      vec3 col = mix(uEdge, uCore, clamp(core*(1.0-t*0.8)*1.2, 0.0, 1.0));
      float a = core * fall * flick * stream * shock * uIntensity;
      gl_FragColor = vec4(col * a, 1.0);
    }`;

  function makePlume(radius, layer) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 40, 48, true);
    g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); // axis +Z, z in [0,1]
    const mat = new THREE.ShaderMaterial({
      vertexShader: plumeVS, fragmentShader: plumeFS,
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: 0 }, uIntensity: { value: 1 }, uEnd: { value: 1 }, uSeed: { value: rnd() * 10 },
        uCore: { value: new THREE.Color(1, 1, 1) }, uEdge: { value: new THREE.Color(0.5, 0.2, 1) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 10; m.frustumCulled = false;
    m.userData = { radius, layer };
    disposables.push(g, mat);
    return m;
  }

  function engine({ x, y, zFront, zNozzle, r, nozzleLen, main }) {
    const g = new THREE.Group(); engineGroup.add(g); g.position.set(x, y, 0);
    // nacelle body (lathe)
    if (!main) {
      const prof = [];
      const L = zNozzle - zFront;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24; const z = zFront + t * L;
        const rr = r * (t < 0.25 ? Math.sqrt(1 - Math.pow(1 - t / 0.25, 2)) * 0.95 + 0.05 : 1 - 0.12 * smooth(0.7, 1, t));
        prof.push(new THREE.Vector2(Math.max(0.001, rr), z));
      }
      const lg = new THREE.LatheGeometry(prof, 48); lg.rotateX(Math.PI / 2);
      // after rotateX(+90): lathe y(=z param) -> z ; ok
      const uv = lg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.5 + 0.1, uv.getX(i) * 0.4 + 0.3);
      add(lg, M.pearl, g);
      // violet intake ring & bands
      for (const tz of [0.32, 0.36, 0.8]) {
        const band = add(new THREE.TorusGeometry(r * (tz > 0.7 ? 0.97 : 1.0) + 0.006, tz > 0.7 ? 0.02 : 0.008, 6, 48), tz > 0.7 ? M.graphite : M.trim, g);
        band.position.z = zFront + L * tz;
      }
    } else {
      // main engine housing emerging from the aft bulkhead
      const prof = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(r * (1.12 - 0.15 * t), zFront + t * (zNozzle - zFront))); }
      const lg = new THREE.LatheGeometry(prof, 64); lg.rotateX(Math.PI / 2);
      add(lg, M.plate, g);
      for (let k = 0; k < 3; k++) { const band = add(new THREE.TorusGeometry(r * (1.1 - 0.05 * k), 0.022, 6, 64), M.chrome, g); band.position.z = zFront + 0.12 + k * 0.22; }
    }
    // nozzle bell: outer + inner surfaces
    const bellR = (t) => r * (0.72 + 0.28 * Math.pow(t, 1.6));
    const outer = [], inner = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20; const z = zNozzle + t * nozzleLen;
      outer.push(new THREE.Vector2(bellR(t) + 0.025, z));
      inner.push(new THREE.Vector2(bellR(t), z));
    }
    const og = new THREE.LatheGeometry(outer, 48); og.rotateX(Math.PI / 2);
    add(og, M.darkMetal, g);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x1a1622, roughness: 0.4, metalness: 0.6, emissive: new THREE.Color(0.6, 0.3, 1.0), emissiveIntensity: 0.6, side: THREE.BackSide });
    disposables.push(nozzleMat); nozzleGlowMats.push(nozzleMat);
    const ig = new THREE.LatheGeometry(inner, 48); ig.rotateX(Math.PI / 2);
    add(ig, nozzleMat, g);
    // emissive inner ribs (cooling channels)
    for (let k = 1; k < 5; k++) {
      const tt = k / 5;
      const rib = add(new THREE.TorusGeometry(bellR(tt) - 0.004, 0.006, 4, 48), nozzleMat, g); rib.position.z = zNozzle + tt * nozzleLen;
    }
    // lip
    const lip = add(new THREE.TorusGeometry(bellR(1) + 0.013, 0.02, 8, 48), M.chrome, g); lip.position.z = zNozzle + nozzleLen;
    // throat (hot plate)
    const throatMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 2), map: glowTex });
    disposables.push(throatMat); throatMats.push(throatMat);
    const th = add(new THREE.CircleGeometry(bellR(0) + 0.01, 40), throatMat, g); th.position.z = zNozzle + 0.01;
    // throat core ring (brighter)
    const core = add(new THREE.RingGeometry(0, bellR(0) * 0.45, 32), throatMat, g); core.position.z = zNozzle + 0.02;
    // plumes: 3 nested layers
    const exitZ = zNozzle + nozzleLen * 0.45;
    for (let L = 0; L < 3; L++) {
      const pl = makePlume(bellR(1), L); pl.position.z = exitZ;
      g.add(pl); plumes.push(pl);
    }
    // glow sprite at the exit
    const sm = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.6, 2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(sm); sp.position.z = zNozzle + nozzleLen + 0.08; sp.userData.base = r * 3.2; sp.renderOrder = 11;
    g.add(sp); glowSprites.push(sp); disposables.push(sm);
    return g;
  }
  const mainEngine = engine({ x: 0, y: 0.0, zFront: 4.3, zNozzle: 5.05, r: 0.46, nozzleLen: 0.8, main: true });
  for (const s of [1, -1]) {
    engine({ x: s * 1.3, y: -0.22, zFront: 1.7, zNozzle: 5.0, r: 0.27, nozzleLen: 0.55, main: false });
    // pylons joining nacelles to hull
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1.9, 0); shape.lineTo(1.55, 0.06); shape.lineTo(0.35, 0.06); shape.closePath();
    const pg = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    const py = add(pg, M.plate);
    // shape x -> along z (aft), extrude depth -> along x (span)
    py.rotation.set(0, -Math.PI / 2, 0);
    py.position.set(s > 0 ? 1.18 : -0.58, -0.25, 4.4);
    py.rotation.y = -Math.PI / 2;
    // simpler: orient via matrix
    py.rotation.set(0, Math.PI / 2, 0); py.position.set(s > 0 ? 0.55 : -1.15, -0.25, 4.5);
    py.scale.set(1, 1, 1);
  }

  // ------------------------------------------------- antennas & sensor array
  {
    // forward sensor spike
    const spike = add(new THREE.CylinderGeometry(0.008, 0.03, 0.75, 10), M.chrome); spike.rotation.x = -Math.PI / 2; spike.position.set(0, -0.12, Z0 - 0.3);
    const tip = add(new THREE.SphereGeometry(0.022, 12, 8), M.trim); tip.position.set(0, -0.12, Z0 - 0.68);
    // sensor ring near the nose
    for (let i = 0; i < 16; i++) {
      const a = i / 16; const z = -4.75; const p = surf(z, a, 1.0), n = surfNormal(z, a);
      const b = add(new THREE.BoxGeometry(0.05, 0.05, 0.12), i % 4 === 0 ? M.violet : M.graphite);
      b.position.copy(p).addScaledVector(n, 0.012); b.lookAt(b.position.clone().add(n)); b.rotateX(Math.PI / 2);
    }
    // dorsal mast cluster behind bridge
    const mastBase = surf(-1.8, 0.5, 1 + 0.05 / 0.8);
    const mast = add(new THREE.CylinderGeometry(0.012, 0.022, 0.8, 8), M.chrome); mast.position.set(0, mastBase.y + 0.4, -1.8);
    const mast2 = add(new THREE.CylinderGeometry(0.008, 0.014, 0.55, 8), M.chrome); mast2.position.set(0.06, mastBase.y + 0.27, -1.6);
    const mast3 = add(new THREE.CylinderGeometry(0.008, 0.014, 0.45, 8), M.chrome); mast3.position.set(-0.06, mastBase.y + 0.22, -1.62);
    for (const [h, w] of [[0.55, 0.28], [0.68, 0.18]]) { const bar = add(new THREE.CylinderGeometry(0.006, 0.006, w, 6), M.chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, mastBase.y + h, -1.8); }
    // dish on a gimbal (dorsal, aft of the mast)
    const dishG = new THREE.Group(); root.add(dishG);
    const db = surf(-0.6, 0.5, 1 + 0.05 / 0.8);
    dishG.position.set(0, db.y + 0.08, -0.85);
    const dprof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; dprof.push(new THREE.Vector2(t * 0.26, t * t * 0.09)); }
    const dish = add(new THREE.LatheGeometry(dprof, 32), M.pearl, dishG); dish.rotation.x = -0.9; dish.position.y = 0.12;
    const feed = add(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), M.chrome, dish); feed.position.y = 0.09;
    const ped = add(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 10), M.graphite, dishG); ped.position.y = 0.05;
    root.userData.dish = dishG;
    // ventral sensor blister
    const blister = add(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.darkMetal); blister.rotation.x = Math.PI;
    const vb = surf(-2.6, 0.0, 1 + 0.06 / 0.8); blister.position.set(0, vb.y + 0.02, -2.6); blister.scale.set(1, 0.7, 1.6);
    // whip antennas on the ring-hub? keep: aft dorsal fin
    const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(1.3, 0); finShape.lineTo(1.25, 0.12); finShape.lineTo(0.75, 0.42); finShape.lineTo(0.55, 0.42); finShape.closePath();
    const fg = new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
    const df = add(fg, M.plate); const dfb = surf(3.0, 0.5, 1 + 0.05 / 0.8);
    df.rotation.y = Math.PI / 2; df.position.set(-0.02, dfb.y - 0.03, 4.15);
    root.userData.dorsalFinTopY = dfb.y + 0.39;
  }

  // RCS thruster quads (fore and aft)
  for (const [z, as] of [[-3.9, [0.2, 0.8]], [3.7, [0.06, 0.94]]]) for (const a of as) {
    const p = surf(z, a, 1.0), n = surfNormal(z, a);
    const blk = new THREE.Group(); root.add(blk);
    blk.position.copy(p); blk.lookAt(p.clone().add(n));
    const body = add(new THREE.BoxGeometry(0.16, 0.12, 0.08), M.graphite, blk); body.position.z = 0.02;
    for (const [dx, dy, rx, ry] of [[0.09, 0, 0, Math.PI / 2], [-0.09, 0, 0, -Math.PI / 2], [0, 0.07, -Math.PI / 2, 0]]) {
      const nz = add(new THREE.CylinderGeometry(0.012, 0.022, 0.04, 8, 1, true), M.darkMetal, blk);
      nz.position.set(dx, dy, 0.03); nz.rotation.set(rx, 0, ry ? -ry : 0);
      if (!rx) nz.rotation.z = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
  }

  // -------------------------------------------------------- navigation lights
  const navs = [];
  function navLight(pos, color, kind, size = 0.035) {
    const g = new THREE.Group(); g.position.copy(pos); root.add(g);
    const mat = new THREE.MeshBasicMaterial({ color: color.clone() });
    const bulb = add(new THREE.SphereGeometry(size, 12, 8), mat, g);
    const sm = new THREE.SpriteMaterial({ map: glowTex, color: color.clone(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(sm); sp.scale.setScalar(size * 9); g.add(sp); sp.renderOrder = 12;
    disposables.push(mat, sm);
    navs.push({ mat, sm, sp, base: color.clone(), kind, phase: rnd(), size });
  }
  // radiator tips (upper fins) -> port red, starboard green
  for (const r of radiators) {
    if (r.up < 0) continue;
    navLight(r.tip, r.side > 0 ? hdr(0.3, 5, 0.8) : hdr(6, 0.25, 0.25), 'nav', 0.035);
  }
  // ring outer rim lights (on the non-rotating frame? attach to ring -> rotates)
  // forward port/starboard running lights
  for (const s of [1, -1]) navLight(surf(-3.7, s > 0 ? 0.25 : 0.75, 1.03), s > 0 ? hdr(0.3, 5, 0.7) : hdr(6, 0.2, 0.2), 'nav', 0.025);
  // white strobes: dorsal fin top, ventral keel, tail
  navLight(new THREE.Vector3(0, root.userData.dorsalFinTopY + 0.02, 3.5), hdr(6, 6, 7), 'strobe', 0.03);
  navLight(surf(1.5, 0.0, 1 + 0.09 / 0.8), hdr(6, 6, 7), 'strobe2', 0.025);
  navLight(surf(-5.25, 0.5, 1.03), hdr(3, 2, 7), 'beacon', 0.02);
  // ring markers (rotate with the ring)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const g = new THREE.Group(); ringPivot.add(g); g.position.set(Math.cos(a) * (ringR + 0.15), Math.sin(a) * (ringR + 0.15), 0);
    const mat = new THREE.MeshBasicMaterial({ color: hdr(3, 1.4, 7) }); add(new THREE.SphereGeometry(0.022, 8, 6), mat, g);
    const sm = new THREE.SpriteMaterial({ map: glowTex, color: hdr(3, 1.4, 7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(sm); sp.scale.setScalar(0.2); g.add(sp);
    disposables.push(mat, sm);
    navs.push({ mat, sm, sp, base: hdr(3, 1.4, 7), kind: 'ring', phase: i * 0.25, size: 0.022 });
  }

  // engine wash light (lights the aft structure)
  const washLight = new THREE.PointLight(0x9a6bff, 0, 7, 2);
  washLight.position.set(0, 0, 6.3); root.add(washLight);

  // floodlight pools on the hull name (subtle)
  // (done through emissive trims; keeps the dark side readable)

  // ------------------------------------------------------------------ state
  let cur = 0;
  const length = 12.4;
  const cIdleCore = new THREE.Color(0.9, 0.7, 1.6), cIdleEdge = new THREE.Color(0.35, 0.18, 0.9);
  const cWarpCore = new THREE.Color(2.3, 2.0, 3.3), cWarpEdge = new THREE.Color(0.9, 0.32, 2.2);
  const tmpC = new THREE.Color();

  function update(dt, t, opts = {}) {
    const target = clamp(opts.speed ?? 0, 0, 1);
    cur += (target - cur) * Math.min(1, dt * 2.5);
    const s = cur;
    const sE = s * s * (3 - 2 * s);

    // habitat ring slow rotation
    ringPivot.rotation.z += dt * 0.12;
    if (root.userData.dish) root.userData.dish.rotation.y = Math.sin(t * 0.13) * 1.2;

    // engines
    const flick = 0.92 + 0.08 * Math.sin(t * 31.0) * Math.sin(t * 17.3);
    for (const m of nozzleGlowMats) {
      m.emissive.setRGB(lerp(0.55, 1.4, sE), lerp(0.28, 0.9, sE), lerp(1.0, 2.2, sE));
      m.emissiveIntensity = lerp(0.12, 1.2, sE) * flick;
    }
    for (const m of throatMats) m.color.setRGB(lerp(1.2, 4, sE) * flick, lerp(0.6, 3.4, sE) * flick, lerp(2.6, 5.5, sE) * flick);
    for (const sp of glowSprites) {
      sp.material.color.setRGB(lerp(0.3, 0.8, sE) * flick, lerp(0.16, 0.55, sE) * flick, lerp(0.6, 1.4, sE) * flick);
      sp.scale.setScalar(sp.userData.base * lerp(0.8, 1.0, sE));
    }
    for (const pl of plumes) {
      const u = pl.material.uniforms; const L = pl.userData.layer, r = pl.userData.radius;
      u.uTime.value = t; u.uSpeed.value = sE;
      // layer 0: inner core, 1: main body, 2: outer haze
      const rad = r * [0.4, 0.8, 1.15][L];
      const len = [lerp(0.6, 13.0, sE), lerp(1.0, 9.5, sE), lerp(1.4, 5.5, sE)][L] * (r / 0.46 * 0.6 + 0.4);
      pl.scale.set(rad, rad, len);
      u.uEnd.value = [lerp(0.6, 0.35, sE), lerp(0.9, 0.55, sE), lerp(1.3, 1.1, sE)][L];
      u.uIntensity.value = [lerp(0.5, 0.9, sE), lerp(0.25, 0.3, sE), lerp(0.1, 0.03, sE)][L];
      tmpC.copy(cIdleCore).lerp(cWarpCore, sE); u.uCore.value.copy(tmpC);
      tmpC.copy(cIdleEdge).lerp(cWarpEdge, sE); u.uEdge.value.copy(tmpC);
    }
    washLight.intensity = lerp(0.08, 2.2, sE) * flick;

    // nav lights
    for (const n of navs) {
      let k = 1;
      if (n.kind === 'nav') { const ph = (t * 0.5 + n.phase * 0.1) % 1; k = ph < 0.65 ? 1 : 0.08; }
      else if (n.kind === 'strobe' || n.kind === 'strobe2') { const ph = (t / 1.6 + (n.kind === 'strobe2' ? 0.5 : 0)) % 1; k = (ph < 0.04 || (ph > 0.1 && ph < 0.14)) ? 1.4 : 0.03; }
      else if (n.kind === 'beacon') { k = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.0), 3); }
      else if (n.kind === 'ring') { k = 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.2 + n.phase * 6.28), 2); }
      n.mat.color.copy(n.base).multiplyScalar(Math.max(0.05, k));
      n.sm.color.copy(n.base).multiplyScalar(k * 0.3);
      n.sp.scale.setScalar(n.size * (3 + 5 * k));
    }
  }
  update(0, 0, { speed: 0 });

  root.userData.dispose = () => { for (const d of disposables) d.dispose && d.dispose(); };
  return { object: root, length, update };
}
