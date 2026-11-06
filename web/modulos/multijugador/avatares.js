// Avatares sencillos para los visitantes: cápsula con visor luminoso y placa
// con el nombre. No importa three: recibe el módulo THREE como parámetro
// para que use la misma copia que la escena de la nave.
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

function makeAvatar(THREE, id, name, opts) {
  const color = colorFor(id);
  const g = new THREE.Group();
  g.name = `visitante-${id}`;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4070, roughness: 0.45, metalness: 0.2, emissive: color, emissiveIntensity: 0.12 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 6, 14), bodyMat);
  body.position.y = 0.6 + 0.22;
  g.add(body);

  const visorMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.6, roughness: 0.2 });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.08), visorMat);
  visor.position.set(0, 1.18, 0.19); // mira hacia +Z local
  g.add(visor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.34, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  g.add(ring);

  const tag = makeTag(THREE, name, color);
  tag.position.y = 1.75;
  g.add(tag);

  g.userData = { id, name, body, tag, phase: Math.random() * 10, lastX: null, lastZ: null, speed: 0 };
  g.scale.setScalar(opts.scale);
  return g;
}

function disposeObject(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      if (n.material.map) n.material.map.dispose();
      n.material.dispose();
    }
  });
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
        u.phase += dt * (moving ? 9 : 2);
        a.position.set(p.x, p.y, p.z);
        a.rotation.y = p.yaw + o.yawOffset;
        u.body.position.y = 0.82 + (moving ? Math.abs(Math.sin(u.phase)) * 0.06 : Math.sin(u.phase) * 0.012);
        u.body.rotation.z = moving ? Math.sin(u.phase) * 0.05 : 0;
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
