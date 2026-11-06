// libreria-3d.js · La biblioteca de La Malkevnia
// Estanterías 3D con lomos generados a partir de cada portada y una ficha al tocar un libro.
// Módulo ES autocontenido. Solo depende de 'three' (resuelto por el import map de la página, r160).
// API: crearLibreria(opciones) -> { group, init, update, pick, abrir, cerrar, filtrar, dispose }
import * as THREE from 'three';

const ESTADOS = {
  leido: { txt: 'Leído', c: '#9be7c4' },
  leyendo: { txt: 'Leyendo', c: '#7fd6ff' },
  pendiente: { txt: 'Pendiente', c: '#d9b8ff' },
  'en-estanteria': { txt: 'En la estantería', c: '#ffd59b' },
};
const ORDEN_ESTADO = { leyendo: 0, leido: 1, 'en-estanteria': 2, pendiente: 3 };

// Medidas en metros
const M = {
  anchoModulo: 0.92, altoModulo: 2.16, fondo: 0.30, grosorTabla: 0.025, lateral: 0.035,
  baldas: 5, zocalo: 0.09, separacionModulos: 0.06, holguraBalda: 0.02,
};

// Atlas de lomos (canvas)
const LOMO = { w: 64, h: 448, canvasW: 2048, canvasH: 4096 };

function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function apellido(autor) {
  if (!autor) return '';
  const limpio = autor.replace(/^(Dr\.|Dra\.|Sir)\s+/i, '').trim();
  const partes = limpio.split(/\s+/);
  return partes.length > 1 ? partes[partes.length - 1] : limpio;
}

function colorLomo(hex, tipo) {
  const c = new THREE.Color(hex || '#6b4fb3');
  const hsl = {}; c.getHSL(hsl);
  const s = THREE.MathUtils.clamp(hsl.s, 0.18, 0.62);
  const l = THREE.MathUtils.clamp(hsl.l, 0.2, tipo === 'manga' ? 0.62 : 0.5);
  c.setHSL(hsl.h, s, l);
  // empuja todo un poco hacia el púrpura de la nave
  return c.lerp(new THREE.Color('#5a3d9e'), 0.22);
}

function luminancia(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

function dibujarLomo(ctx, x, y, libro, color, fuentes) {
  const { w, h } = LOMO;
  const base = '#' + color.getHexString();
  const oscuro = color.clone().multiplyScalar(0.55);
  const claro = color.clone().lerp(new THREE.Color('#ffffff'), 0.18);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#' + oscuro.getHexString());
  g.addColorStop(0.18, base);
  g.addColorStop(0.42, '#' + claro.getHexString());
  g.addColorStop(0.7, base);
  g.addColorStop(1, '#' + oscuro.getHexString());
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);

  const textoClaro = luminancia(color) < 0.42;
  const tinta = textoClaro ? '#f4eeff' : '#1b1230';
  const filete = textoClaro ? 'rgba(255,214,150,.75)' : 'rgba(40,20,70,.6)';

  // filetes arriba y abajo
  ctx.fillStyle = filete;
  ctx.fillRect(x + 4, y + 18, w - 8, 2); ctx.fillRect(x + 4, y + 24, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 26, w - 8, 1); ctx.fillRect(x + 4, y + h - 20, w - 8, 2);

  const esManga = libro.tipo === 'manga';
  if (esManga) {
    // bloque de color arriba, típico de los tomos
    ctx.fillStyle = textoClaro ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)';
    ctx.fillRect(x + 4, y + 30, w - 8, 52);
    ctx.fillStyle = tinta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${fuentes.mono}`;
    const sigla = libro.origen === 'manhwa' ? '만화' : libro.origen === 'manhua' ? '漫画' : 'マンガ';
    ctx.fillText(libro.origen ? libro.origen.toUpperCase() : 'MANGA', x + w / 2, y + 46);
    ctx.font = `600 15px ${fuentes.cjk}`;
    ctx.fillText(sigla, x + w / 2, y + 66);
  }

  // texto vertical: título (abajo→arriba) y apellido del autor al pie
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tinta; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const autor = apellido(libro.autor).toUpperCase();
  ctx.font = `600 13px ${fuentes.mono}`;
  ctx.globalAlpha = 0.78;
  ctx.fillText(autor.slice(0, 14), 34, 0);
  const anchoAutor = Math.min(ctx.measureText(autor.slice(0, 14)).width, 120);
  ctx.globalAlpha = 1;
  const inicio = 34 + anchoAutor + 16;
  const fin = h - (esManga ? 92 : 36);
  const disponible = fin - inicio;
  let titulo = libro.titulo;
  let size = 26;
  ctx.font = `600 ${size}px ${fuentes.titulo}`;
  while (ctx.measureText(titulo).width > disponible && size > 17) { size -= 1; ctx.font = `600 ${size}px ${fuentes.titulo}`; }
  if (ctx.measureText(titulo).width > disponible) {
    while (titulo.length > 3 && ctx.measureText(titulo + '…').width > disponible) titulo = titulo.slice(0, -1);
    titulo = titulo.trimEnd() + '…';
  }
  ctx.fillText(titulo, inicio, 1);
  ctx.restore();
}

function texturaCantos() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#b9ac98'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { x.fillStyle = `rgba(120,95,70,${0.08 + hash(i) * 0.1})`; x.fillRect(0, i, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function setUV(geo, cara, u0, v0, u1, v1, girar = false) {
  // BoxGeometry: 4 vértices por cara en orden (0,1) (1,1) (0,0) (1,0)
  const uv = geo.attributes.uv; const i = cara * 4;
  if (!girar) {
    uv.setXY(i, u0, v1); uv.setXY(i + 1, u1, v1); uv.setXY(i + 2, u0, v0); uv.setXY(i + 3, u1, v0);
  } else {
    uv.setXY(i, u0, v0); uv.setXY(i + 1, u0, v1); uv.setXY(i + 2, u1, v0); uv.setXY(i + 3, u1, v1);
  }
}

const CSS = `
.lib3d-ficha{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);width:min(340px,calc(100% - 32px));
 max-height:calc(100% - 32px);overflow:auto;background:rgba(16,10,32,.86);border:1px solid rgba(170,140,255,.32);border-radius:14px;
 backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#ece4ff;font-family:'Exo 2',system-ui,sans-serif;
 box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 40px rgba(127,90,255,.15);padding:18px;display:grid;gap:12px;z-index:5;
 animation:lib3dIn .35s ease-out}
.lib3d-ficha[hidden]{display:none!important}
@keyframes lib3dIn{from{opacity:0;transform:translate(16px,-50%)}to{opacity:1;transform:translate(0,-50%)}}
.lib3d-ficha .cab{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:start}
.lib3d-ficha .por{width:96px;aspect-ratio:2/3;border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.5);background-repeat:no-repeat}
.lib3d-ficha .eti{font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#a99cd6}
.lib3d-ficha h3{margin:6px 0 4px;font:600 19px/1.2 'Exo 2',system-ui,sans-serif;text-wrap:balance}
.lib3d-ficha .ori{font-size:13px;color:#a99cd6;margin:0 0 4px}
.lib3d-ficha .aut{font-size:14px;color:#d8ccff;margin:0}
.lib3d-ficha .pill{display:inline-flex;align-items:center;gap:6px;font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;padding:5px 9px;border-radius:99px;
 border:1px solid currentColor;letter-spacing:.06em}
.lib3d-ficha .pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.lib3d-ficha dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:13px}
.lib3d-ficha dt{color:#a99cd6}.lib3d-ficha dd{margin:0;font-variant-numeric:tabular-nums}
.lib3d-ficha .acc{display:flex;gap:8px;flex-wrap:wrap}
.lib3d-ficha a,.lib3d-ficha button{font:600 12px/1 'Exo 2',system-ui,sans-serif;color:#ece4ff;background:rgba(181,155,255,.12);border:1px solid rgba(181,155,255,.35);
 border-radius:8px;padding:8px 12px;cursor:pointer;text-decoration:none}
.lib3d-ficha a:hover,.lib3d-ficha button:hover{background:rgba(181,155,255,.24)}
.lib3d-ficha :focus-visible{outline:2px solid #7fd6ff;outline-offset:2px}
.lib3d-ficha .x{position:absolute;top:10px;right:10px;padding:6px 9px}
@media (max-width:640px){.lib3d-ficha{top:auto;bottom:max(16px,env(safe-area-inset-bottom,0px));transform:none;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));width:auto;max-height:52%;animation:none}}
@media (prefers-reduced-motion:reduce){.lib3d-ficha{animation:none}}
`;

/**
 * @param {object} op
 * @param {Array}  op.libros     lista de libros/mangas (ver libreria-datos.js)
 * @param {object} op.atlas      { cols, rows, cellW, cellH } del atlas de portadas
 * @param {string} op.atlasUrl   URL de portadas.jpg
 * @param {HTMLElement} [op.contenedor] elemento donde montar la ficha HTML (si falta, no hay ficha y se usa onSelect)
 * @param {(libro|null)=>void} [op.onSelect]
 * @param {(libro|null)=>void} [op.onHover]
 * @param {boolean} [op.luces=true] añade luces puntuales propias
 */
export function crearLibreria(op) {
  const libros = op.libros.slice();
  const atlas = op.atlas;
  const group = new THREE.Group(); group.name = 'libreria-3d';
  const fuentes = {
    titulo: "'Exo 2', 'Segoe UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    cjk: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Malgun Gothic', sans-serif",
  };
  const desechables = [];
  const mallas = []; // una por libro
  const porMalla = new Map();
  let camara = null, dom = null, raycaster = new THREE.Raycaster();
  let hover = null, abierto = null, filtro = { tipo: 'todos', estado: 'todos', texto: '' };
  let ficha = null, estilo = null;
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpO = new THREE.Object3D();
  const rotPortada = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  // ---------- materiales ----------
  const cvs = document.createElement('canvas'); cvs.width = LOMO.canvasW; cvs.height = LOMO.canvasH;
  const texLomos = new THREE.CanvasTexture(cvs); texLomos.colorSpace = THREE.SRGBColorSpace; texLomos.anisotropy = 4;
  const texPortadas = new THREE.TextureLoader().load(op.atlasUrl); texPortadas.colorSpace = THREE.SRGBColorSpace; texPortadas.anisotropy = 4;
  const texCantos = texturaCantos();
  const matLomo = new THREE.MeshStandardMaterial({ map: texLomos, roughness: 0.62, metalness: 0.05, vertexColors: true });
  const matPortada = new THREE.MeshStandardMaterial({ map: texPortadas, roughness: 0.5, metalness: 0.02, vertexColors: true });
  const matCantos = new THREE.MeshStandardMaterial({ map: texCantos, roughness: 0.9, vertexColors: true });
  const matMadera = new THREE.MeshStandardMaterial({ color: '#1d1533', roughness: 0.45, metalness: 0.35 });
  const matBorde = new THREE.MeshStandardMaterial({ color: '#2b2050', roughness: 0.3, metalness: 0.6 });
  const matLed = new THREE.MeshStandardMaterial({ color: '#cbb6ff', emissive: '#a98bff', emissiveIntensity: 1.5 });
  const matLedCian = new THREE.MeshStandardMaterial({ color: '#bff0ff', emissive: '#7fd6ff', emissiveIntensity: 0.9 });
  // la portada del libro que tienes en la mano se ve sin depender de las luces de la sala
  const matPortadaMano = new THREE.MeshBasicMaterial({ map: texPortadas, color: '#d9d2e8' });
  desechables.push(matPortadaMano, texLomos, texPortadas, texCantos, matLomo, matPortada, matCantos, matMadera, matBorde, matLed, matLedCian);

  // ---------- reparto en estanterías ----------
  const ord = (a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9)
    || apellido(a.autor).localeCompare(apellido(b.autor), 'es') || (a.serie || a.titulo).localeCompare(b.serie || b.titulo, 'es', { numeric: true });
  const secciones = [
    { nombre: 'LIBROS', items: libros.filter(l => l.tipo !== 'manga').sort(ord) },
    { nombre: 'MANGA', items: libros.filter(l => l.tipo === 'manga').sort(ord) },
  ];
  const medidas = l => {
    if (l.tipo === 'manga') return { grosor: 0.021 + hash(l.id) * 0.008, alto: 0.178 + hash(l.id + 3) * 0.008, fondo: 0.118 };
    const p = l.paginas || 300;
    return { grosor: THREE.MathUtils.clamp(0.014 + p * 0.0001, 0.016, 0.075), alto: 0.2 + hash(l.id) * 0.06, fondo: 0.14 + hash(l.id + 7) * 0.03 };
  };
  const altoHueco = (M.altoModulo - M.zocalo - M.grosorTabla) / M.baldas;
  const anchoUtil = M.anchoModulo - 2 * M.lateral - 0.04;

  // calcula módulos por sección
  const huecos = []; // {modulo, balda, libros:[...] }
  let modulo = 0;
  const etiquetas = [];
  for (const sec of secciones) {
    const inicioModulo = modulo;
    sec.items.forEach(l => { l._m = medidas(l); l._hueco = 0.0012 + (hash(l.id + 11) < 0.05 ? 0.025 : 0); });
    const total = sec.items.reduce((s, l) => s + l._m.grosor + l._hueco, 0);
    const nMod = Math.max(1, Math.ceil(total / (anchoUtil * M.baldas * 0.93)));
    const objetivo = total / (nMod * M.baldas); // reparto parejo entre todas las baldas
    let i = 0;
    for (let mo = 0; mo < nMod; mo++) {
      for (let b = M.baldas - 1; b >= 0; b--) {
        const actual = { modulo: modulo + mo, balda: b, libros: [] }; huecos.push(actual);
        let x = 0;
        const ultima = mo === nMod - 1 && b === 0;
        while (i < sec.items.length) {
          const l = sec.items[i];
          if (x + l._m.grosor > anchoUtil) break;
          if (!ultima && x > 0 && x + l._m.grosor / 2 > objetivo) break;
          actual.libros.push({ l, x }); x += l._m.grosor + l._hueco; i++;
        }
      }
    }
    modulo += nMod;
    etiquetas.push({ nombre: sec.nombre, desde: inicioModulo, hasta: modulo - 1, total: sec.items.length });
  }
  const nModulos = modulo;
  const anchoTotal = nModulos * M.anchoModulo + (nModulos - 1) * M.separacionModulos;
  const xModulo = i => -anchoTotal / 2 + M.anchoModulo / 2 + i * (M.anchoModulo + M.separacionModulos);

  // ---------- muebles ----------
  const caja = (w, h, d, mat) => { const g = new THREE.BoxGeometry(w, h, d); desechables.push(g); return new THREE.Mesh(g, mat); };
  for (let i = 0; i < nModulos; i++) {
    const mod = new THREE.Group(); mod.position.x = xModulo(i); group.add(mod);
    const fondo = caja(M.anchoModulo, M.altoModulo, 0.02, matMadera); fondo.position.set(0, M.altoModulo / 2, -M.fondo / 2 + 0.01); mod.add(fondo);
    for (const s of [-1, 1]) {
      const lat = caja(M.lateral, M.altoModulo, M.fondo, matBorde); lat.position.set(s * (M.anchoModulo - M.lateral) / 2, M.altoModulo / 2, 0); mod.add(lat);
      const led = caja(0.01, M.altoModulo - 0.2, 0.01, matLedCian); led.position.set(s * (M.anchoModulo / 2 - M.lateral - 0.004), M.altoModulo / 2 + 0.03, M.fondo / 2 - 0.01); mod.add(led);
    }
    const techo = caja(M.anchoModulo, M.grosorTabla * 1.6, M.fondo, matBorde); techo.position.set(0, M.altoModulo, 0); mod.add(techo);
    const zocalo = caja(M.anchoModulo, M.zocalo, M.fondo, matBorde); zocalo.position.set(0, M.zocalo / 2, 0); mod.add(zocalo);
    for (let b = 0; b < M.baldas; b++) {
      const y = M.zocalo + b * altoHueco;
      const t = caja(M.anchoModulo - 2 * M.lateral, M.grosorTabla, M.fondo - 0.02, matMadera); t.position.set(0, y + M.grosorTabla / 2, 0.005); mod.add(t);
      // tira LED bajo la balda superior que ilumina los lomos
      const led = caja(M.anchoModulo - 2 * M.lateral - 0.04, 0.01, 0.012, matLed);
      led.position.set(0, y + altoHueco - 0.004, M.fondo / 2 - 0.03); mod.add(led);
    }
  }
  // placas de sección
  const placas = [];
  for (const e of etiquetas) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const x = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; desechables.push(t);
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }); desechables.push(mat);
    const ancho = Math.min(0.8, (e.hasta - e.desde + 1) * M.anchoModulo * 0.6);
    const p = caja(ancho, ancho / 8, 0.001, mat);
    p.position.set((xModulo(e.desde) + xModulo(e.hasta)) / 2, M.altoModulo + 0.12, M.fondo / 2 - 0.02); group.add(p);
    placas.push({ c, x, t, e });
  }
  const dibujarPlacas = () => placas.forEach(({ c, x, t, e }) => {
    x.clearRect(0, 0, 512, 64);
    x.fillStyle = 'rgba(20,12,40,.75)'; x.strokeStyle = 'rgba(181,155,255,.7)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(2, 2, 508, 60, 10); x.fill(); x.stroke();
    x.fillStyle = '#e9e2ff'; x.font = `600 28px 'Orbitron', ${fuentes.titulo}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`${e.nombre} · ${e.total}`, 256, 33); t.needsUpdate = true;
  });

  // ---------- libros ----------
  const colsLomo = Math.floor(LOMO.canvasW / LOMO.w);
  for (const h of huecos) {
    const baseY = M.zocalo + h.balda * altoHueco + M.grosorTabla;
    const totalAncho = h.libros.length ? h.libros.at(-1).x + h.libros.at(-1).l._m.grosor : 0;
    const x0 = xModulo(h.modulo) - anchoUtil / 2 + Math.max(0, (anchoUtil - totalAncho) * 0.15);
    for (const { l, x } of h.libros) {
      const m = l._m;
      const geo = new THREE.BoxGeometry(m.grosor, m.alto, m.fondo); desechables.push(geo);
      // caras: 0 +x portada, 1 -x contraportada, 2 +y, 3 -y, 4 +z lomo, 5 -z cantos
      const slot = mallas.length;
      const sx = (slot % colsLomo) * LOMO.w, sy = Math.floor(slot / colsLomo) * LOMO.h;
      const U = v => v / LOMO.canvasW, V = v => 1 - v / LOMO.canvasH;
      setUV(geo, 4, U(sx + 1), V(sy + LOMO.h - 1), U(sx + LOMO.w - 1), V(sy + 1));
      setUV(geo, 1, U(sx + 26), V(sy + 14), U(sx + 38), V(sy + 4)); // contraportada: color liso del lomo
      if (l.portada != null) {
        const cx = l.portada % atlas.cols, cy = Math.floor(l.portada / atlas.cols);
        const pu0 = cx / atlas.cols, pu1 = (cx + 1) / atlas.cols;
        const pv1 = 1 - cy / atlas.rows, pv0 = 1 - (cy + 1) / atlas.rows;
        setUV(geo, 0, pu0, pv0, pu1, pv1);
      } else setUV(geo, 0, U(sx + 26), V(sy + 14), U(sx + 38), V(sy + 4));
      geo.attributes.uv.needsUpdate = true;
      geo.clearGroups();
      geo.addGroup(0, 6, 1); geo.addGroup(6, 6, 0); geo.addGroup(12, 6, 2); geo.addGroup(18, 6, 2); geo.addGroup(24, 6, 0); geo.addGroup(30, 6, 2);
      const colores = new Float32Array(geo.attributes.position.count * 3).fill(1);
      geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
      const malla = new THREE.Mesh(geo, [matLomo, matPortada, matCantos]);
      const inclinado = hash(l.id + 23) < 0.025 && h.libros.length > 3;
      malla.position.set(x0 + x + m.grosor / 2, baseY + m.alto / 2, M.fondo / 2 - m.fondo / 2 - 0.02 - hash(l.id + 5) * 0.012);
      if (inclinado) { malla.rotation.z = -0.05; }
      malla.userData.libro = l;
      malla.userData.base = { pos: malla.position.clone(), quat: malla.quaternion.clone() };
      malla.userData.slot = slot; malla.userData.color = colorLomo(l.color, l.tipo);
      malla.userData.salida = 0; malla.userData.brillo = 1; malla.userData.brilloObj = 1;
      group.add(malla); mallas.push(malla); porMalla.set(malla, l);
    }
  }

  // detalles: sujetalibros y mini planeta en huecos libres
  const matPlaneta = new THREE.MeshStandardMaterial({ color: '#8a6cff', emissive: '#3d2a8a', emissiveIntensity: 0.6, roughness: 0.4 });
  const matAnillo = new THREE.MeshStandardMaterial({ color: '#d7c8ff', metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide });
  desechables.push(matPlaneta, matAnillo);
  for (const h of huecos) {
    const usado = h.libros.length ? h.libros.at(-1).x + h.libros.at(-1).l._m.grosor : 0;
    const libre = anchoUtil - usado;
    const baseY = M.zocalo + h.balda * altoHueco + M.grosorTabla;
    const x0 = xModulo(h.modulo) - anchoUtil / 2 + Math.max(0, (anchoUtil - usado) * 0.15);
    if ((libre > 0.16 && hash(h.modulo * 7 + h.balda) < 0.45) || !h.libros.length) {
      const g = new THREE.SphereGeometry(0.05, 32, 16); const r = new THREE.RingGeometry(0.068, 0.095, 48); desechables.push(g, r);
      const p = new THREE.Mesh(g, matPlaneta); const an = new THREE.Mesh(r, matAnillo); an.rotation.x = Math.PI / 2.4;
      const soporte = caja(0.06, 0.012, 0.06, matBorde);
      const cx = h.libros.length ? x0 + usado + Math.min(libre, 0.3) * 0.55 : xModulo(h.modulo);
      soporte.position.set(cx, baseY + 0.006, 0); p.position.set(cx, baseY + 0.075, 0); an.position.copy(p.position);
      p.userData.gira = true; an.userData.gira = true;
      group.add(soporte, p, an);
    } else if (h.libros.length && libre > 0.03) {
      const s = caja(0.012, 0.13, 0.11, matBorde); s.position.set(x0 + usado + 0.012, baseY + 0.065, M.fondo / 2 - 0.08); group.add(s);
    }
  }

  // luces propias (suaves)
  const luces = [];
  if (op.luces !== false) {
    for (let i = 0; i < nModulos; i++) {
      const l = new THREE.PointLight('#b59bff', 1.3, 2.4, 1.6); l.position.set(xModulo(i), M.altoModulo * 0.62, 0.75); group.add(l); luces.push(l);
    }
  }

  // ---------- pintar lomos (tras cargar fuentes) ----------
  const pintarLomos = () => {
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#2a1d4a'; ctx.fillRect(0, 0, cvs.width, cvs.height);
    for (const malla of mallas) {
      const s = malla.userData.slot;
      dibujarLomo(ctx, (s % colsLomo) * LOMO.w, Math.floor(s / colsLomo) * LOMO.h, malla.userData.libro, malla.userData.color, fuentes);
    }
    texLomos.needsUpdate = true;
    dibujarPlacas();
  };
  pintarLomos();
  if (document.fonts?.load) {
    Promise.all([
      document.fonts.load(`600 26px 'Exo 2'`), document.fonts.load(`600 13px 'JetBrains Mono'`), document.fonts.load(`600 28px 'Orbitron'`),
    ]).then(pintarLomos).catch(() => {});
  }

  // ---------- ficha HTML ----------
  function montarFicha(cont) {
    if (!document.getElementById('lib3d-css')) {
      estilo = document.createElement('style'); estilo.id = 'lib3d-css'; estilo.textContent = CSS; document.head.appendChild(estilo);
    }
    ficha = document.createElement('aside'); ficha.className = 'lib3d-ficha'; ficha.hidden = true;
    ficha.setAttribute('role', 'dialog'); ficha.setAttribute('aria-label', 'Ficha del libro');
    if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
    cont.appendChild(ficha);
    ficha.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrar(); });
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function pintarFicha(l) {
    if (!ficha) return;
    const est = ESTADOS[l.estado] || { txt: l.estado, c: '#ccc' };
    const cx = l.portada % atlas.cols, cy = Math.floor(l.portada / atlas.cols);
    const por = l.portada != null
      ? `background-image:url('${op.atlasUrl}');background-size:${atlas.cols * 100}% ${atlas.rows * 100}%;background-position:${cx / (atlas.cols - 1) * 100}% ${cy / (atlas.rows - 1) * 100}%`
      : `background:#${colorLomo(l.color, l.tipo).getHexString()}`;
    const filas = [];
    if (l.serie) filas.push(['Serie', esc(l.serie)]);
    if (l.anio) filas.push(['Año', l.anio]);
    if (l.paginas) filas.push(['Páginas', l.paginas.toLocaleString('es')]);
    if (l.capitulosLeidos) filas.push(['Capítulos leídos', l.capitulosLeidos + (l.capitulos ? ` de ${l.capitulos}` : '')]);
    if (l.origen) filas.push(['Origen', l.origen[0].toUpperCase() + l.origen.slice(1)]);
    if (l.nota) filas.push(['Mi nota', `${l.nota} / 10`]);
    const enlaces = [];
    if (l.goodreads) enlaces.push(`<a href="https://www.goodreads.com/book/show/${l.goodreads}" target="_blank" rel="noopener">Ver en Goodreads</a>`);
    if (l.anilist) enlaces.push(`<a href="https://anilist.co/manga/${l.anilist}" target="_blank" rel="noopener">Ver en AniList</a>`);
    ficha.innerHTML = `
      <button class="x" data-cerrar aria-label="Cerrar ficha">✕</button>
      <div class="cab"><div class="por" style="${por}" role="img" aria-label="Portada de ${esc(l.titulo)}"></div>
        <div><div class="eti">${l.tipo === 'manga' ? 'Manga' : 'Libro'}</div><h3>${esc(l.titulo)}</h3>
        ${l.tituloOriginal ? `<p class="ori" lang="ja">${esc(l.tituloOriginal)}</p>` : ''}
        <p class="aut">${esc(l.autor)}</p></div></div>
      <div><span class="pill" style="color:${est.c}">${est.txt}</span></div>
      ${filas.length ? `<dl>${filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : ''}
      <div class="acc">${enlaces.join('')}<button data-cerrar>Devolver a la estantería</button></div>`;
    ficha.hidden = false;
  }

  // ---------- interacción ----------
  const puntero = new THREE.Vector2();
  let pulsado = null;
  function pick(rc) {
    const hits = rc.intersectObjects(mallas, false);
    return hits.length ? hits[0].object : null;
  }
  function desdeEvento(e) {
    const r = dom.getBoundingClientRect();
    puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(puntero, camara);
    return pick(raycaster);
  }
  const onMove = e => {
    if (!camara || e.pointerType === 'touch') return;
    const m = desdeEvento(e);
    if (m !== hover) {
      hover = m; dom.style.cursor = m ? 'pointer' : '';
      op.onHover?.(m ? m.userData.libro : null);
    }
  };
  const onDown = e => { pulsado = { x: e.clientX, y: e.clientY }; };
  const onUp = e => {
    if (!pulsado || !camara) return;
    const mov = Math.hypot(e.clientX - pulsado.x, e.clientY - pulsado.y); pulsado = null;
    if (mov > 6) return; // era un arrastre de cámara
    const m = desdeEvento(e);
    if (m && m === abierto) { cerrar(); return; }
    if (m) abrirMalla(m); else if (abierto) cerrar();
  };
  const onKey = e => { if (e.key === 'Escape' && abierto) cerrar(); };

  function abrirMalla(m) {
    if (abierto && abierto !== m) abierto.userData.abierto = false;
    abierto = m; m.userData.abierto = true; m.userData.t = 0;
    m.material = [matLomo, matPortadaMano, matCantos];
    pintarFicha(m.userData.libro);
    op.onSelect?.(m.userData.libro);
  }
  function abrir(id) { const m = mallas.find(x => x.userData.libro.id === id); if (m) abrirMalla(m); return !!m; }
  function cerrar() {
    if (abierto) abierto.userData.abierto = false;
    abierto = null; if (ficha) ficha.hidden = true;
    op.onSelect?.(null);
  }

  function coincide(l) {
    if (filtro.tipo !== 'todos' && (filtro.tipo === 'manga') !== (l.tipo === 'manga')) return false;
    if (filtro.estado !== 'todos' && l.estado !== filtro.estado) return false;
    if (filtro.texto) {
      const q = filtro.texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      const t = `${l.titulo} ${l.autor} ${l.serie || ''} ${l.tituloOriginal || ''}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      if (!t.includes(q)) return false;
    }
    return true;
  }
  function filtrar(f = {}) {
    filtro = { ...filtro, ...f };
    let n = 0;
    const activo = filtro.tipo !== 'todos' || filtro.estado !== 'todos' || !!filtro.texto;
    for (const m of mallas) {
      const ok = coincide(m.userData.libro); if (ok) n++;
      m.userData.brilloObj = ok ? 1 : 0.16;
      m.userData.destacado = ok && activo;
    }
    return n;
  }

  // ---------- ciclo ----------
  function init({ scene, camera, renderer, domElement, contenedor, eventos = true } = {}) {
    if (scene && !group.parent) scene.add(group);
    camara = camera || null;
    if (camera) camara = camera;
    dom = domElement || renderer?.domElement || null;
    if (dom && eventos) {
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointerup', onUp);
      addEventListener('keydown', onKey);
    }
    const cont = contenedor || op.contenedor;
    if (cont && !ficha) montarFicha(cont);
    if (renderer) { const a = renderer.capabilities.getMaxAnisotropy(); texLomos.anisotropy = texPortadas.anisotropy = Math.min(8, a); }
    return api;
  }

  let reloj = 0;
  function update(dt = 1 / 60) {
    reloj += dt;
    const k = 1 - Math.pow(0.0008, dt); // suavizado independiente del fps
    for (const m of mallas) {
      const u = m.userData, base = u.base;
      // brillo por filtro (color de vértices)
      if (Math.abs(u.brillo - u.brilloObj) > 0.002) {
        u.brillo += (u.brilloObj - u.brillo) * k;
        const c = m.geometry.attributes.color; c.array.fill(u.brillo); c.needsUpdate = true;
      }
      if (u.abierto && camara) {
        // flota delante de la cámara enseñando la portada
        camara.getWorldPosition(tmpV);
        const dir = new THREE.Vector3(); camara.getWorldDirection(dir);
        const ancho = innerWidth < 640;
        const lateral = new THREE.Vector3().crossVectors(dir, camara.up).normalize();
        const destino = tmpV.clone().addScaledVector(dir, ancho ? 0.62 : 0.55).addScaledVector(lateral, ficha && !ancho ? -0.1 : 0).addScaledVector(camara.up, ancho && ficha ? 0.055 : 0);
        tmpO.position.copy(destino); tmpO.lookAt(tmpV); tmpO.updateMatrixWorld();
        const qMundo = tmpO.quaternion.clone().multiply(rotPortada);
        qMundo.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(reloj * 0.8) * 0.04, Math.sin(reloj * 0.6) * 0.12, 0)));
        // a espacio local del grupo
        group.updateMatrixWorld();
        const local = group.worldToLocal(destino.clone());
        group.getWorldQuaternion(tmpQ); const qLocal = tmpQ.invert().multiply(qMundo);
        m.position.lerp(local, k * 0.9);
        m.quaternion.slerp(qLocal, k * 0.9);
        u.salida = 0;
      } else {
        const objetivo = (m === hover ? 0.045 : 0) + (u.destacado ? 0.03 : 0);
        u.salida += (objetivo - u.salida) * k;
        tmpV.copy(base.pos); tmpV.z += u.salida;
        if (m.material[1] === matPortadaMano && m.position.distanceToSquared(tmpV) < 0.0004) m.material = [matLomo, matPortada, matCantos];
        if (m.position.distanceToSquared(tmpV) > 1e-8) m.position.lerp(tmpV, Math.min(1, k * 1.2));
        if (1 - Math.abs(m.quaternion.dot(base.quat)) > 1e-7) m.quaternion.slerp(base.quat, Math.min(1, k * 1.2));
      }
    }
    group.traverse(o => { if (o.userData.gira) o.rotation.y += dt * 0.3; });
    if (luces.length) luces.forEach((l, i) => { l.intensity = 1.25 + Math.sin(reloj * 0.7 + i) * 0.08; });
  }

  function dispose() {
    if (dom) {
      dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
      removeEventListener('keydown', onKey); dom.style.cursor = '';
    }
    ficha?.remove(); ficha = null;
    if (estilo && !document.querySelector('.lib3d-ficha')) { estilo.remove(); estilo = null; }
    group.parent?.remove(group);
    desechables.forEach(d => d.dispose());
    mallas.length = 0;
  }

  const api = {
    group,
    /** ancho total del mueble en metros (para colocarlo en la sala) */
    dimensiones: { ancho: anchoTotal, alto: M.altoModulo + 0.2, fondo: M.fondo },
    libros,
    init, update, dispose,
    /** Raycast externo (p. ej. punto de mira con pointer lock). Devuelve el libro o null. */
    pick: rc => { const m = pick(rc); return m ? m.userData.libro : null; },
    /** Igual que pick, pero además lo abre. */
    usar: rc => { const m = pick(rc); if (m) { m === abierto ? cerrar() : abrirMalla(m); } return m ? m.userData.libro : null; },
    abrir, cerrar, filtrar,
    get abierto() { return abierto ? abierto.userData.libro : null; },
  };
  return api;
}
