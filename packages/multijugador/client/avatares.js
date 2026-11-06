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

const PALETTE = [0xb18cff, 0x8a7dff, 0xd38cff, 0x7fd6ff, 0x9fffd8, 0xff9fd2, 0xc2b0ff, 0x6fb7ff];

export function colorFor(id) {
  return PALETTE[Math.abs(Math.imul(id | 0, 2654435761)) % PALETTE.length];
}

function makeTag(THREE, text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(14, 10, 34, 0.72)';
  const r = 30;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(2, 2, w - 4, 68, r) : ctx.rect(2, 2, w - 4, 68);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f1eaff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const h = 0.22;
  sprite.scale.set(h * (w / 72), h, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Geometrías compartidas por todos los avatares (una copia por módulo THREE)
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
  g = {
    head: new THREE.SphereGeometry(0.115, 20, 16),
    neck: new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10),
    torso: new THREE.CapsuleGeometry(0.15, 0.36, 6, 16),
    hips: new THREE.CapsuleGeometry(0.12, 0.08, 4, 12),
    upperArm: new THREE.CapsuleGeometry(0.045, 0.24, 4, 10),
    foreArm: new THREE.CapsuleGeometry(0.038, 0.24, 4, 10),
    thigh: new THREE.CapsuleGeometry(0.068, 0.34, 4, 10),
    shin: new THREE.CapsuleGeometry(0.052, 0.34, 4, 10),
    floor: new THREE.PlaneGeometry(1.1, 1.1),
    blobTex: new THREE.CanvasTexture(blob),
  };
  SHARED.set(THREE, g);
  return g;
}

// Material "sombra": cuerpo casi negro y opaco, con un contorno luminoso del color del visitante
function shadowMaterial(THREE, color) {
  return new THREE.ShaderMaterial({
    uniforms: { glow: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 glow;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
        vec3 base = vec3(0.025, 0.018, 0.05);
        vec3 c = base + glow * (rim * 0.85 + 0.02);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// Una extremidad de dos segmentos que cuelga desde su articulación
function limb(THREE, mat, upperGeo, lowerGeo, len) {
  const root = new THREE.Group();
  const upper = new THREE.Mesh(upperGeo, mat);
  upper.position.y = -len / 2;
  root.add(upper);
  const joint = new THREE.Group();
  joint.position.y = -len;
  root.add(joint);
  const lower = new THREE.Mesh(lowerGeo, mat);
  lower.position.y = -len / 2;
  joint.add(lower);
  return { root, joint };
}

function makeAvatar(THREE, id, name, opts) {
  const color = colorFor(id);
  const G = shared(THREE);
  const mat = shadowMaterial(THREE, color);
  const g = new THREE.Group();
  g.name = `visitante-${id}`;

  // Todo el cuerpo cuelga de "pelvis" para poder balancearlo al andar
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.92;
  g.add(pelvis);

  const hips = new THREE.Mesh(G.hips, mat);
  hips.rotation.z = Math.PI / 2;
  hips.scale.set(1, 1, 0.8);
  pelvis.add(hips);

  const chest = new THREE.Group();
  chest.position.y = 0.06;
  pelvis.add(chest);
  const torso = new THREE.Mesh(G.torso, mat);
  torso.position.y = 0.3;
  torso.scale.set(1.18, 1, 0.68);
  chest.add(torso);
  const neck = new THREE.Mesh(G.neck, mat);
  neck.position.y = 0.6;
  chest.add(neck);
  const head = new THREE.Mesh(G.head, mat);
  head.position.y = 0.72;
  head.scale.set(0.92, 1.05, 1);
  chest.add(head);

  const arms = [-1, 1].map((side) => {
    const a = limb(THREE, mat, G.upperArm, G.foreArm, 0.3);
    a.root.position.set(side * 0.23, 0.5, 0);
    a.root.rotation.z = side * 0.08;
    chest.add(a.root);
    return a;
  });
  const legs = [-1, 1].map((side) => {
    const l = limb(THREE, mat, G.thigh, G.shin, 0.44);
    l.root.position.set(side * 0.095, -0.02, 0);
    pelvis.add(l.root);
    return l;
  });

  const blob = new THREE.Mesh(G.floor, new THREE.MeshBasicMaterial({ map: G.blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  g.add(blob);

  const tag = makeTag(THREE, name, color);
  tag.position.y = 2.0;
  g.add(tag);

  g.userData = { id, name, pelvis, chest, head, arms, legs, ownMaterials: [mat, blob.material, tag.material],
    phase: Math.random() * 10, lastX: null, lastZ: null, speed: 0 };
  g.scale.setScalar(opts.scale);
  return g;
}

// Pose de paseo: piernas y brazos en oposición, leve balanceo; quieto, respira
function animate(u, moving, dt) {
  u.phase += dt * (moving ? 7.5 : 1.6);
  const s = Math.sin(u.phase);
  const amt = u.blend = (u.blend || 0) + ((moving ? 1 : 0) - (u.blend || 0)) * Math.min(1, dt * 8);
  u.legs[0].root.rotation.x = s * 0.55 * amt;
  u.legs[1].root.rotation.x = -s * 0.55 * amt;
  u.legs[0].joint.rotation.x = Math.max(0, -Math.cos(u.phase)) * 0.7 * amt;
  u.legs[1].joint.rotation.x = Math.max(0, Math.cos(u.phase)) * 0.7 * amt;
  u.arms[0].root.rotation.x = -s * 0.45 * amt;
  u.arms[1].root.rotation.x = s * 0.45 * amt;
  u.arms[0].joint.rotation.x = -0.25 - 0.2 * amt;
  u.arms[1].joint.rotation.x = -0.25 - 0.2 * amt;
  u.pelvis.position.y = 0.92 + Math.abs(Math.cos(u.phase)) * 0.035 * amt;
  u.pelvis.rotation.y = s * 0.08 * amt;
  u.chest.rotation.y = -s * 0.14 * amt;
  u.chest.rotation.x = 0.04 * amt + (1 - amt) * Math.sin(u.phase) * 0.012;
}

function disposeObject(o) {
  for (const m of o.userData.ownMaterials || []) {
    if (m.map && m.isSpriteMaterial) m.map.dispose(); // la textura del nombre es propia; la de la sombra, compartida
    m.dispose();
  }
}

/**
 * @param {typeof import('three')} THREE
 * @param {import('three').Object3D} parent  escena o grupo de la sala
 * @param {{ scale?: number, yawOffset?: number }} [opts]
 *   yawOffset: suma este ángulo al yaw recibido si tu escena usa otro "frente".
 */
export function createAvatarLayer(THREE, parent, opts = {}) {
  const o = { scale: 1, yawOffset: 0, ...opts };
  const root = new THREE.Group();
  root.name = 'multijugador';
  parent.add(root);
  const avatars = new Map();

  return {
    root,
    /** @param {{id,name,x,y,z,yaw,anim}[]} players  salida de client.sample() */
    update(players, dt = 1 / 60) {
      const seen = new Set();
      for (const p of players) {
        seen.add(p.id);
        let a = avatars.get(p.id);
        if (a && a.userData.name !== p.name) { root.remove(a); disposeObject(a); a = null; }
        if (!a) {
          a = makeAvatar(THREE, p.id, p.name, o);
          a.position.set(p.x, p.y, p.z);
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
      for (const [id, a] of avatars) {
        if (!seen.has(id)) { root.remove(a); disposeObject(a); avatars.delete(id); }
      }
    },
    get count() { return avatars.size; },
    dispose() {
      for (const a of avatars.values()) disposeObject(a);
      avatars.clear();
      parent.remove(root);
    },
  };
}
