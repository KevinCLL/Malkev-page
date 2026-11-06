// Integración de los módulos de los otros hilos en la nave.
// Cada bloque va en su propio try/catch: si un módulo falla, la nave sigue funcionando.
const base = new URL('./', import.meta.url).href;
const M = p => base + p;

export default async function integrar(N) {
  const { THREE, scene, camera, player, rooms, interact, $ } = N;
  const ray = new THREE.Raycaster();
  const centerRay = () => { ray.setFromCamera({ x: 0, y: 0 }, camera); return ray; };
  const fadeTo = async fn => { $('fade').style.opacity = 1; await new Promise(r => setTimeout(r, 450)); fn(); $('fade').style.opacity = 0; };
  let layout = null;
  try { layout = await (await fetch(M('layout.json'))).json(); } catch (e) { console.warn('layout', e); }
  if (layout) for (const r of layout.rooms) { const w = rooms[r.id]; if (w) { r.sub = w.sub; r.color = '#' + new THREE.Color(w.color).getHexString(); } }
  const spawnOf = id => layout?.rooms.find(r => r.id === id)?.spawn;
  const goRoom = id => { const sp = spawnOf(id); if (sp) fadeTo(() => { N.teleport(sp.x, sp.z, sp.yaw); player.pitch = 0; }); };

  // capturas de teclado encadenadas (terminal sentado, bitácora…)
  const captures = [];
  N.setKeyCapture(e => captures.some(f => f(e)));

  /* ---------- Audio ambiental ---------- */
  try {
    const A = (await import(M('modulos/audio-nave/audio-nave.js'))).default;
    window.AudioNave = A;
    const start = async () => {
      try { await A.init({ room: N.lastRoom?.id || 'puente' }); N.setAudioOn(true); } catch (e) { console.warn('audio init', e); }
    };
    addEventListener('malkevnia:start', start, { once: true });
    addEventListener('malkevnia:room', e => { A.setRoom(e.detail.id); if (e.detail.prev) A.playDoor('open'); });
  } catch (e) { console.warn('audio-nave', e); }

  /* ---------- Plano de la nave ---------- */
  try {
    if (!layout) throw new Error('sin layout');
    const { init } = await import(M('modulos/mapa-nave/mapa-nave.js'));
    const mini = $('mini'); mini.innerHTML = ''; mini.style.padding = '6px';
    const box = document.createElement('div'); box.className = 'mapa'; mini.appendChild(box);
    const mapa = init(box, { ...layout, name: 'La Malkevnia', deck: 'Cubierta principal' }, { releasePointer: true });
    mapa.onTeleport(({ x, z, yaw }) => fadeTo(() => { N.teleport(x, z, yaw); player.pitch = 0; }));
    mapa.onToggle(open => { N.setModal(open); window.__cm?.setEnabled(!open); if (!open) N.lock(); });
    N.setMapa(mapa);
    window.__mapa = mapa;
  } catch (e) { console.warn('mapa-nave', e); }

  /* ---------- Controles táctiles ---------- */
  if (N.TOUCH) try {
    const { init } = await import(M('modulos/controles-moviles/controles-moviles.js'));
    const ctl = init($('c'), {
      onMove: (x, y) => { N.joy.vx = x; N.joy.vy = -y; },
      onLook: (dy, dp) => { player.yaw += dy; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch + dp)); },
      buttons: [{ id: 'act', label: 'Usar', onPress: () => N.useNearest() }],
    });
    $('joy').style.display = 'none'; $('act').style.display = 'none';
    ctl.setEnabled(false);
    addEventListener('malkevnia:start', () => ctl.setEnabled(true), { once: true });
    if (!$('start').hidden) {} else ctl.setEnabled(true);
    N.setMobile(ctl); window.__cm = ctl;
  } catch (e) { console.warn('controles-moviles', e); }

  /* ---------- Cielo del universo en las ventanas ---------- */
  let uniMod = null;
  try {
    uniMod = await import(M('universo-3d/universo.js'));
    if (uniMod.createSkybox) {
      const sky = uniMod.createSkybox(scene, { radius: 900 });
      for (const l of N.starLayers) l.visible = false;
      N.anim.push(t => sky.update(t, camera));
    }
  } catch (e) { console.warn('skybox', e); }

  /* ---------- Ordenador de a bordo ---------- */
  try {
    const [{ init }, datos] = await Promise.all([import(M('modulos/ordenador-abordo/ordenador-abordo.js')), import(M('modulos/ordenador-abordo/datos-malkevnia.js'))]);
    await document.fonts.load('32px VT323').catch(() => {});
    const r = rooms.ordenador;
    const tex = new THREE.CanvasTexture(document.createElement('canvas'));
    let seated = false;
    const stand = () => {
      if (!seated) return; seated = false; term.blur(); $('termIn').blur(); N.setModal(false);
      window.__cm?.setButtons([{ id: 'act', label: 'Usar', onPress: () => N.useNearest() }]);
      hint.hidden = true;
    };
    const planets = [['thalassa', 'Thalassa'], ['verdalia', 'Verdalia'], ['brasa', 'Brasa Menor'], ['gelida', 'Gélida'], ['opalia', 'Opalia'], ['izaro', 'Izaro'], ['abismo', 'El Abismo']].map(([id, name]) => ({ id, name, sub: 'destino de la ruta' }));
    const term = init(null, {
      headless: true, width: 1024, height: 640, data: { ...(datos.default || datos), planets }, room: 'ordenador', effects: false,
      onRender: () => { tex.needsUpdate = true; },
      onNavigate: id => { stand(); goRoom(id); },
      onCourse: id => { stand(); N.openUniverse(id === 'brasa-menor' ? 'brasa' : id); },
      onCommand: () => window.AudioNave?.beep?.('ok'),
      onOpenUrl: url => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); },
    });
    tex.image = term.canvas; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.125), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(r.cx, 1.42, r.cz + .62); scr.rotation.y = Math.PI; scene.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.24, .05), new THREE.MeshStandardMaterial({ color: 0x18122b, metalness: .6, roughness: .4 }));
    frame.position.set(r.cx, 1.42, r.cz + .66); scene.add(frame);
    const hint = document.createElement('div'); hint.className = 'hud'; hint.hidden = true;
    hint.style.cssText = 'left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);padding:8px 14px;background:var(--panel);border:1px solid var(--line);border-radius:999px;font:500 12px var(--f-mono);color:var(--muted)';
    hint.textContent = 'Escribe órdenes (prueba «ayuda») · Esc para levantarte'; document.body.appendChild(hint);
    const ta = $('termIn');
    ta.addEventListener('input', () => { if (seated && ta.value) { term.type(ta.value); ta.value = ''; } });
    captures.push(e => {
      if (!seated) return false;
      if (e.code === 'Escape') { stand(); return true; }
      const special = e.key.length > 1 && e.key !== 'Dead' || e.ctrlKey || e.metaKey;
      if (special && term.key(e)) e.preventDefault();
      else if (document.activeElement !== ta && e.key.length === 1) { term.key(e); e.preventDefault(); }
      return true;
    });
    interact.push({ x: r.cx, z: r.cz - .3, r: 1.7, label: 'Sentarse en la consola del capitán', module: true, run: () => {
      seated = true; N.setModal(true); N.teleport(r.cx, r.cz - .55, Math.PI); player.pitch = -.06;
      ta.value = ''; ta.focus({ preventScroll: true }); term.focus(); hint.hidden = false;
      window.__cm?.setButtons([{ id: 'up', label: 'Levantarse', onPress: stand }]);
    } });
    // el panel provisional de esa sala sobra
    for (let i = interact.length - 1; i >= 0; i--) if (interact[i].label === 'Acceder a la consola del capitán') interact.splice(i, 1);
    addEventListener('malkevnia:room', e => term.setRoom(e.detail.id));
  } catch (e) { console.warn('ordenador-abordo', e); }

  /* ---------- Bitácora ---------- */
  try {
    const B = await import(M('modulos/bitacora/bitacora.js'));
    const posts = await B.loadPosts(M('modulos/bitacora/posts.json'));
    await Promise.all(['300 40px "Exo 2"', '600 40px "Exo 2"', '500 20px "JetBrains Mono"', '600 20px "JetBrains Mono"'].map(f => document.fonts.load(f))).catch(() => {});
    await window.Malkevnia.registerModule('bitacora', {
      mount(ctx) {
        const r = ctx.room;
        const wall = B.createHoloWall(THREE, { posts, radius: 2.2, rows: 2, perRow: 8, spacing: .5, panelWidth: 1.0, baseY: 1.0, rowGap: .72 });
        wall.group.position.set(r.cx, 0, r.cz + .4); ctx.group.add(wall.group);
        ctx.onFrame((t, dt) => wall.update(t, dt));
        const reader = B.createReader({ posts, onOpen: () => { ctx.suspend(); window.__cm?.setEnabled(false); }, onClose: () => { window.__cm?.setEnabled(true); ctx.resume(); } });
        ctx.addInteract({ x: r.cx, z: r.cz + .4, r: 1.9, label: 'Leer la entrada del holopanel', run: () => { const p = wall.pick(centerRay()) || posts[0]; wall.focus(p); reader.open(p); } });
        const inRoom = () => N.lastRoom?.id === 'bitacora';
        addEventListener('wheel', e => { if (inRoom() && !reader.isOpen) wall.spin(Math.sign(e.deltaY) * .06); }, { passive: true });
        captures.push(e => {
          if (!inRoom() || reader.isOpen) return false;
          if (e.code === 'PageUp' || e.code === 'KeyQ') { wall.prevPage(); return true; }
          if (e.code === 'PageDown' || e.code === 'KeyR') { wall.nextPage(); return true; }
          return false;
        });
        // hover: resalta el panel bajo la mirilla
        ctx.onFrame(() => { if (inRoom()) wall.hover(wall.pick(centerRay())); });
        // escritorio de vuelta, contra la pared norte
        const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, .78, .9), new THREE.MeshStandardMaterial({ color: 0x3a2a4f, roughness: .8 }));
        desk.position.set(r.cx, .39, r.z0 + 1.0); ctx.group.add(desk); ctx.addCollider(r.cx - 1.3, r.z0 + .55, r.cx + 1.3, r.z0 + 1.45);
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(B.drawPanelCanvas(posts[0], { w: 640, h: 400 })), toneMapped: false }));
        mon.material.map.colorSpace = THREE.SRGBColorSpace; mon.position.set(r.cx, 1.25, r.z0 + .6); ctx.group.add(mon);
      },
    });
  } catch (e) { console.warn('bitacora', e); }

  /* ---------- Librería 3D ---------- */
  try {
    const [{ crearLibreria }, { LIBROS, ATLAS }] = await Promise.all([import(M('modulos/libreria-3d/libreria-3d.js')), import(M('modulos/libreria-3d/libreria-datos.js'))]);
    await window.Malkevnia.registerModule('biblioteca', {
      mount(ctx) {
        const r = ctx.room;
        const lib = crearLibreria({ libros: LIBROS, atlas: ATLAS, atlasUrl: M('modulos/libreria-3d/portadas.jpg'), contenedor: document.body, luces: true });
        lib.init({ scene: ctx.group, camera, renderer: N.renderer, eventos: false });
        if (lib.group.parent !== ctx.group) ctx.group.add(lib.group);
        lib.group.position.set(r.x0 + .18, 0, r.cz - .2); lib.group.rotation.y = Math.PI / 2;
        ctx.addCollider(r.x0, r.cz - 1.65, r.x0 + .4, r.cz + 1.25);
        ctx.onFrame((t, dt) => lib.update(dt));
        ctx.addInteract({ x: r.x0 + 1.4, z: r.cz - .2, r: 2.0, label: 'Sacar el libro de la mirilla', run: () => lib.usar(centerRay()) });
      },
    }, { replace: false });
  } catch (e) { console.warn('libreria-3d', e); }

  window.Malkevnia.loaded = true;
  dispatchEvent(new CustomEvent('malkevnia:modules'));
}
