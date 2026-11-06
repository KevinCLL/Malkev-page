// Avatares de los visitantes: siluetas humanas oscuras, como sombras, con un
// contorno luminoso de su color, sombra en el suelo y placa con el nombre.
// No importa three: recibe el módulo THREE como parámetro para que use la
// misma copia que la escena de la nave.
//
//   import * as THREE from 'three';
//   import { createAvatarLayer } from './avatares.js';
//   const avatars = createAvatarLayer(THREE, scene);
//   // cada frame:
//   avatars.update(mj.sample(), dt);
//   // al salir:
//   avatars.dispose();
//
// Rendimiento: todas las siluetas comparten 9 mallas instanciadas, así que da
// igual que haya 2 o 64 visitantes (9 llamadas de dibujo + 1 por placa).

const PALETTE = [0xb18cff, 0x8a7dff, 0xd38cff, 0x7fd6ff, 0x9fffd8, 0xff9fd2, 0xc2b0ff, 0x6fb7ff];
export const CAPTAIN_COLOR = 0xffd59a;

/** Color de un visitante por su id (número 0xRRGGBB). */
export function colorFor(id) {
  return PALETTE[Math.abs(Math.imul(id | 0, 2654435761)) % PALETTE.length];
}

/**
 * Color con el que se pinta el avatar de p ({ id, captain }), para que el
 * minimapa, las listas y el avatar coincidan. Número 0xRRGGBB.
 */
export function avatarColor(p) {
  return p && p.captain ? CAPTAIN_COLOR : colorFor(p && p.id);
}

// ---------- placa con el nombre ----------
function makeTag(THREE, text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.min(1024, Math.ceil(ctx.measureText(text).width) + 48);
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(14, 10, 34, 0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(2, 2, w - 4, 68, 30); else ctx.rect(2, 2, w - 4, 68);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f1eaff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 38, w - 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const h = 0.22;
  sprite.scale.set(h * (w / 72), h, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---------- recursos compartidos (uno por copia de THREE) ----------
const SHARED = new WeakMap();
function shared(THREE) {
  let g = SHARED.get(THREE);
  if (g) return g;
  const blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  const bctx = blob.getContext('2d');
  const grad = bctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 128, 128);
  const floor = new THREE.PlaneGeometry(1.1, 1.1);
  floor.rotateX(-Math.PI / 2);
  g = {
    geo: {
      hips: new THREE.CapsuleGeometry(0.12, 0.08, 4, 12),
      torso: new THREE.CapsuleGeometry(0.15, 0.36, 6, 16),
      neck: new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10),
      head: new THREE.SphereGeometry(0.115, 20, 16),
      upperArm: new THREE.CapsuleGeometry(0.045, 0.24, 4, 10),
      foreArm: new THREE.CapsuleGeometry(0.038, 0.24, 4, 10),
      thigh: new THREE.CapsuleGeometry(0.068, 0.34, 4, 10),
      shin: new THREE.CapsuleGeometry(0.052, 0.34, 4, 10),
      blob: floor,
    },
    blobTex: new THREE.CanvasTexture(blob),
  };
  SHARED.set(THREE, g);
  return g;
}

// Partes del cuerpo y cuántas lleva cada silueta
const PARTS = { hips: 1, torso: 1, neck: 1, head: 1, upperArm: 2, foreArm: 2, thigh: 2, shin: 2 };

// Material "sombra": cuerpo casi negro y opaco, con un contorno luminoso del
// color de cada visitante (instanceColor). Respeta la niebla y el tono de la escena.
function shadowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vGlow;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
        vN = normalize(transformedNormal);
        vV = normalize(-mvPosition.xyz);
        #ifdef USE_INSTANCING_COLOR
          vGlow = instanceColor;
        #else
          vGlow = vec3(0.45, 0.3, 1.0);
        #endif
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vGlow;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
        vec3 c = vec3(0.0016, 0.0012, 0.004) + vGlow * (rim * 0.9 + 0.004);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function node(THREE, parent, part, list) {
  const n = new THREE.Object3D();
  parent.add(n);
  if (part) list.push([part, n]);
  return n;
}

// Esqueleto invisible: solo transformaciones. Las mallas instanciadas copian
// la matriz de cada nudo en cada frame.
function makeAvatar(THREE, p, opts) {
  const color = avatarColor(p);
  const parts = [];
  const g = new THREE.Group();
  g.name = `visitante-${p.id}`;

  const pelvis = node(THREE, g, null, parts);
  pelvis.position.y = 0.92;
  const hips = node(THREE, pelvis, 'hips', parts);
  hips.rotation.z = Math.PI / 2;
  hips.scale.set(1, 1, 0.8);

  const chest = node(THREE, pelvis, null, parts);
  chest.position.y = 0.06;
  const torso = node(THREE, chest, 'torso', parts);
  torso.position.y = 0.3;
  torso.scale.set(1.18, 1, 0.68);
  node(THREE, chest, 'neck', parts).position.y = 0.6;
  const head = node(THREE, chest, 'head', parts);
  head.position.y = 0.72;
  head.scale.set(0.92, 1.05, 1);

  const limb = (parent, upper, lower, len) => {
    const root = node(THREE, parent, null, parts);
    node(THREE, root, upper, parts).position.y = -len / 2;
    const joint = node(THREE, root, null, parts);
    joint.position.y = -len;
    node(THREE, joint, lower, parts).position.y = -len / 2;
    return { root, joint };
  };
  const arms = [-1, 1].map((side) => {
    const a = limb(chest, 'upperArm', 'foreArm', 0.3);
    a.root.position.set(side * 0.23, 0.5, 0);
    a.root.rotation.z = side * 0.08;
    return a;
  });
  const legs = [-1, 1].map((side) => {
    const l = limb(pelvis, 'thigh', 'shin', 0.44);
    l.root.position.set(side * 0.095, -0.02, 0);
    return l;
  });

  const blob = node(THREE, g, null, parts);
  blob.position.y = 0.012;

  const tag = makeTag(THREE, p.captain ? `✦ ${p.name}` : p.name, color);
  tag.position.y = 2.0;
  g.add(tag);

  g.scale.setScalar(opts.scale);
  g.userData = {
    key: `${p.name}|${p.captain ? 1 : 0}`,
    color: new THREE.Color(color),
    parts, blob, tag, pelvis, chest, arms, legs,
    phase: Math.random() * 10, blend: 0, lastX: null, lastZ: null, speed: 0,
  };
  return g;
}

// Paso: piernas y brazos en oposición, rodillas y codos, leve balanceo; quieto, respira
function animate(u, moving, dt) {
  u.phase += dt * (moving ? 7.5 : 1.6);
  const s = Math.sin(u.phase);
  const c = Math.cos(u.phase);
  u.blend += ((moving ? 1 : 0) - u.blend) * Math.min(1, dt * 8);
  const amt = u.blend;
  u.legs[0].root.rotation.x = s * 0.55 * amt;
  u.legs[1].root.rotation.x = -s * 0.55 * amt;
  u.legs[0].joint.rotation.x = Math.max(0, -c) * 0.7 * amt;
  u.legs[1].joint.rotation.x = Math.max(0, c) * 0.7 * amt;
  u.arms[0].root.rotation.x = -s * 0.45 * amt;
  u.arms[1].root.rotation.x = s * 0.45 * amt;
  u.arms[0].joint.rotation.x = -0.25 - 0.2 * amt;
  u.arms[1].joint.rotation.x = -0.25 - 0.2 * amt;
  u.pelvis.position.y = 0.92 + Math.abs(c) * 0.035 * amt;
  u.pelvis.rotation.y = s * 0.08 * amt;
  u.chest.rotation.y = -s * 0.14 * amt;
  u.chest.rotation.x = 0.04 * amt + (1 - amt) * Math.sin(u.phase) * 0.012;
}

/**
 * @param {typeof import('three')} THREE
 * @param {import('three').Object3D} parent  escena o grupo de la sala
 * @param {{ scale?: number, yawOffset?: number }} [opts]
 *   scale: si la nave no está en metros. yawOffset: suma este ángulo al yaw
 *   recibido si tu escena usa otro "frente" (el avatar mira a +Z local).
 */
export function createAvatarLayer(THREE, parent, opts = {}) {
  const o = { scale: 1, yawOffset: 0, ...opts };
  const G = shared(THREE);
  const root = new THREE.Group();
  root.name = 'multijugador';
  parent.add(root);

  const bodyMat = shadowMaterial(THREE);
  const blobMat = new THREE.MeshBasicMaterial({ map: G.blobTex, transparent: true, depthWrite: false });
  const avatars = new Map();
  let capacity = 0;
  let meshes = {};
  const tmp = new THREE.Matrix4();
  const inv = new THREE.Matrix4();

  function allocate(n) {
    for (const m of Object.values(meshes)) { root.remove(m); m.dispose(); }
    capacity = n;
    meshes = {};
    for (const [part, per] of Object.entries(PARTS)) {
      const m = new THREE.InstancedMesh(G.geo[part], bodyMat, n * per);
      for (let i = 0; i < n * per; i++) m.setColorAt(i, new THREE.Color(0)); // activa instanceColor antes de compilar
      meshes[part] = m;
    }
    meshes.blob = new THREE.InstancedMesh(G.geo.blob, blobMat, n);
    for (const m of Object.values(meshes)) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; // las instancias se mueven; la caja de la malla no sirve
      m.count = 0;
      root.add(m);
    }
  }
  allocate(8);

  function removeAvatar(id, a) {
    root.remove(a);
    a.userData.tag.material.map.dispose();
    a.userData.tag.material.dispose();
    avatars.delete(id);
  }

  return {
    root,
    /** @param {{id,name,captain?,x,y,z,yaw,anim}[]} players  salida de client.sample() */
    update(players, dt = 1 / 60) {
      const seen = new Set();
      for (const p of players) {
        seen.add(p.id);
        let a = avatars.get(p.id);
        if (a && a.userData.key !== `${p.name}|${p.captain ? 1 : 0}`) { removeAvatar(p.id, a); a = null; }
        if (!a) {
          a = makeAvatar(THREE, p, o);
          root.add(a);
          avatars.set(p.id, a);
        }
        const u = a.userData;
        const dx = u.lastX === null ? 0 : p.x - u.lastX;
        const dz = u.lastZ === null ? 0 : p.z - u.lastZ;
        u.lastX = p.x; u.lastZ = p.z;
        const v = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
        u.speed += (v - u.speed) * Math.min(1, dt * 10);
        const moving = u.speed > 0.15 || p.anim === 'walk' || p.anim === 'run';
        a.position.set(p.x, p.y, p.z);
        a.rotation.y = p.yaw + o.yawOffset;
        animate(u, moving, dt);
      }
      for (const [id, a] of avatars) if (!seen.has(id)) removeAvatar(id, a);

      if (avatars.size > capacity) {
        let n = capacity;
        while (n < avatars.size) n *= 2;
        allocate(n);
      }

      // Copia las matrices del esqueleto a las mallas instanciadas
      root.updateWorldMatrix(true, true);
      inv.copy(root.matrixWorld).invert();
      const used = {};
      for (const k of Object.keys(meshes)) used[k] = 0;
      for (const a of avatars.values()) {
        const u = a.userData;
        for (const [part, n] of u.parts) {
          const m = meshes[part];
          const i = used[part]++;
          m.setMatrixAt(i, tmp.multiplyMatrices(inv, n.matrixWorld));
          m.setColorAt(i, u.color);
        }
        meshes.blob.setMatrixAt(used.blob++, tmp.multiplyMatrices(inv, u.blob.matrixWorld));
      }
      for (const [k, m] of Object.entries(meshes)) {
        m.count = used[k];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
    get count() { return avatars.size; },
    dispose() {
      for (const [id, a] of [...avatars]) removeAvatar(id, a);
      for (const m of Object.values(meshes)) m.dispose();
      bodyMat.dispose();
      blobMat.dispose();
      parent.remove(root);
    },
  };
}
