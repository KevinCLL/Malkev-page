// Integración de los módulos de los otros hilos en la nave La Malkevnia.
// - Todos los módulos se descargan en paralelo al arrancar y se montan en orden.
// - Cada bloque va en su propio try/catch: si un módulo falla, la nave sigue funcionando.
// - El estado de carga se muestra en la pantalla de inicio (#loadStatus).
const base = new URL('./', import.meta.url).href;
const M = p => base + p;
const SHORT = { maquinas: 'Máquinas', recreativa: 'Recreativa', proyeccion: 'Cine', bitacora: 'Bitácora', juegos: 'Juegos', biblioteca: 'Biblioteca', ordenador: 'Ordenador', puente: 'Puente', pasillo: 'Pasillo' };
// dirección hacia la estrella del cielo; la comparten el cielo y el planeta del ventanal
const SUN_DIR = [0.85, 0.22, 0.48];

export default async function integrar(N) {
  const { THREE, scene, camera, player, rooms, interact, $ } = N;
  const ray = new THREE.Raycaster();
  const centerRay = () => { ray.setFromCamera({ x: 0, y: 0 }, camera); return ray; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fadeTo = async fn => { $('fade').style.opacity = 1; await wait(450); fn(); $('fade').style.opacity = 0; };
  const inRect = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
  const removeInteract = label => { for (let i = interact.length - 1; i >= 0; i--) if (!interact[i].module && interact[i].label === label) interact.splice(i, 1); };
  const fontsReady = list => Promise.race([Promise.all(list.map(f => document.fonts.load(f))).catch(() => {}), wait(2500)]);

  /* ---------- descarga en paralelo ---------- */
  const load = p => import(M(p));
  const json = p => fetch(M(p)).then(r => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
  const pre = {
    layout: json('layout.json'),
    audio: load('modulos/audio-nave/audio-nave.js'),
    mapa: load('modulos/mapa-nave/mapa-nave.js'),
    ctl: N.TOUCH ? load('modulos/controles-moviles/controles-moviles.js') : Promise.resolve(null),
    uni: load('universo-3d/universo.js'),
    ord: Promise.all([load('modulos/ordenador-abordo/ordenador-abordo.js'), load('modulos/ordenador-abordo/datos-malkevnia.js')]),
    bit: load('modulos/bitacora/bitacora.js'),
    lib: Promise.all([load('modulos/libreria-3d/libreria-3d.js'), load('modulos/libreria-3d/libreria-datos.js')]),
    kal: load('modulos/kallax-3d/kallax-3d.js'),
    cine: Promise.all([load('modulos/sala-cine/sala-cine.js'), load('modulos/sala-cine/peliculas-ejemplo.js')]),
    plan: load('modulos/planetas-procedurales/planetas.js'),
  };
  for (const p of Object.values(pre)) p.catch(() => {});   // los errores se tratan al montar cada uno

  const STEPS = 12; let done = 0; const failed = [];
  const status = (name, ok = true) => {
    done++; if (!ok) failed.push(name);
    const el = $('loadStatus'); if (!el) return;
    el.textContent = done < STEPS ? `Sistemas en línea: ${done} de ${STEPS} · ${name}`
      : failed.length ? `Sistemas en línea, salvo: ${failed.join(', ')}` : 'Todos los sistemas en línea';
  };
  const mount = async (name, fn) => { try { await fn(); status(name); } catch (e) { console.warn(name, e); status(name, false); } };

  let layout = null;
  try { layout = await pre.layout; } catch (e) { console.warn('layout', e); }
  if (layout) for (const r of layout.rooms) { const w = rooms[r.id]; if (w) { r.sub = w.sub; r.color = '#' + new THREE.Color(w.color).getHexString(); r.short = SHORT[r.id]; } }
  const spawnOf = id => layout?.rooms.find(r => r.id === id)?.spawn;
  const goRoom = id => { const sp = spawnOf(id); if (sp) fadeTo(() => { N.teleport(sp.x, sp.z, sp.yaw); player.pitch = 0; }); };

  // capturas de teclado encadenadas (terminal, butaca, bitácora…): la primera que devuelve true se queda la tecla
  const captures = [];
  N.setKeyCapture(e => captures.some(f => f(e)));

  // lo que necesitan las capas que se monten encima (window.MALKEVNIA_EXTRA)
  const modules = {};
  const mode = (m, id = null) => dispatchEvent(new CustomEvent('malkevnia:mode', { detail: { mode: m, id } }));
  Object.assign(N, { captures, centerRay, fadeTo, goRoom, spawnOf, layout, modules, mode,
    loading: (name, text, ok = true) => { const el = $('loadStatus'); if (el) el.textContent = text || name; if (!ok) failed.push(name); } });
  window.Malkevnia.modules = modules;
  window.Malkevnia.layout = layout;
  const DATA = window.MALKEVNIA_DATA || {};
  const cm = () => window.__cm;
  const useButton = () => cm()?.setButtons([{ id: 'act', label: 'Usar', onPress: () => N.useNearest() }]);

  /* ---------- Audio ambiental ---------- */
  await mount('Audio', async () => {
    const A = (await pre.audio).default;
    window.AudioNave = A;
    const start = async () => { try { await A.init({ room: N.lastRoom?.id || 'puente' }); N.setAudioOn(true); } catch (e) { console.warn('audio init', e); } };
    // init() necesita un gesto: si ya se embarcó antes de que llegara el módulo, lo arranca el botón Sonido
    if ($('start').hidden) N.setAudioOn(false); else addEventListener('malkevnia:start', start, { once: true });
    addEventListener('malkevnia:room', e => { A.setRoom(e.detail.id); if (e.detail.prev) A.playDoor('open'); });
  });

  /* ---------- Plano de la nave ---------- */
  await mount('Plano', async () => {
    if (!layout) throw new Error('sin layout');
    const { init } = await pre.mapa;
    const mini = $('mini'); mini.innerHTML = ''; mini.style.padding = '6px';
    const box = document.createElement('div'); box.className = 'mapa'; mini.appendChild(box);
    const mapa = init(box, { ...layout, name: 'La Malkevnia', deck: 'Cubierta principal' }, { releasePointer: true });
    mapa.onTeleport(({ x, z, yaw }) => fadeTo(() => { N.teleport(x, z, yaw); player.pitch = 0; }));
    mapa.onToggle(open => { N.setModal(open); cm()?.setEnabled(!open); if (!open) N.lock(); });
    N.setMapa(mapa); window.__mapa = mapa; modules.mapa = mapa;
  });

  /* ---------- Controles táctiles ---------- */
  await mount('Controles táctiles', async () => {
    const mod = await pre.ctl; if (!mod) return;
    const ctl = mod.init($('c'), {
      onMove: (x, y) => { N.joy.vx = x; N.joy.vy = -y; },
      onLook: (dy, dp) => { player.yaw += dy; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch + dp)); },
      buttons: [{ id: 'act', label: 'Usar', onPress: () => N.useNearest() }],
    });
    $('joy').style.display = 'none'; $('act').style.display = 'none';
    ctl.setEnabled($('start').hidden);
    addEventListener('malkevnia:start', () => ctl.setEnabled(true), { once: true });
    N.setMobile(ctl); window.__cm = ctl; modules.controles = ctl;
  });

  /* ---------- Cielo del universo en las ventanas ---------- */
  await mount('Cielo', async () => {
    const U = await pre.uni;
    if (!U.createSkybox) return;
    const before = new Set(scene.children);
    const sky = U.createSkybox(scene, { radius: 900, star: { dir: SUN_DIR, color: 0xffe2b0, intensity: 1 } });
    // que el cielo quede detrás de las paredes: con prueba de profundidad y dibujado antes que nada
    for (const o of scene.children) if (!before.has(o)) o.traverse(n => {
      for (const m of [].concat(n.material || [])) { m.depthTest = true; m.depthWrite = false; m.needsUpdate = true; }
      n.renderOrder = -10; n.userData.structural = true;
    });
    for (const l of N.starLayers) l.visible = false;
    for (const s of N.nebulas || []) s.visible = false;
    N.anim.push(t => sky.update(t, camera)); modules.cielo = sky;
  });

  /* ---------- Ordenador de a bordo ---------- */
  await mount('Ordenador de a bordo', async () => {
    const [{ init }, datos] = await pre.ord;
    await fontsReady(['32px VT323']);
    const r = rooms.ordenador;
    const tex = new THREE.CanvasTexture(document.createElement('canvas'));
    let seated = false;
    const hint = document.createElement('div'); hint.className = 'hud mode-hint'; hint.hidden = true;
    hint.textContent = 'Escribe órdenes (prueba «ayuda») · Esc para levantarte'; document.body.appendChild(hint);
    const ta = $('termIn');
    const stand = () => {
      if (!seated) return; seated = false; term.blur(); ta.blur(); N.setModal(false); hint.hidden = true; useButton();
    };
    const planets = [['thalassa', 'Thalassa'], ['verdalia', 'Verdalia'], ['brasa', 'Brasa Menor'], ['gelida', 'Gélida'], ['opalia', 'Opalia'], ['izaro', 'Izaro'], ['abismo', 'El Abismo']]
      .map(([id, name]) => ({ id, name, sub: 'destino de la ruta de navegación' }));
    const term = init(null, {
      headless: true, width: 1024, height: 640, data: { ...(datos.default || datos), planets }, room: 'ordenador', effects: false,
      onRender: () => { tex.needsUpdate = true; },
      onNavigate: id => { stand(); goRoom(id); },
      onCourse: id => { stand(); N.openUniverse(id === 'brasa-menor' ? 'brasa' : id); },
      onCommand: () => window.AudioNave?.beep?.('ok'),
      onOpenUrl: url => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); },
    });
    tex.image = term.canvas; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.125), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(r.cx, 1.42, r.cz + .62); scr.rotation.y = Math.PI; scene.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 1.24, .05), new THREE.MeshStandardMaterial({ color: 0x18122b, metalness: .6, roughness: .4 }));
    frame.position.set(r.cx, 1.42, r.cz + .66); scene.add(frame);
    ta.addEventListener('input', () => { if (seated && ta.value) { term.type(ta.value); ta.value = ''; } });
    captures.push(e => {
      if (!seated) return false;
      if (e.code === 'Escape') { stand(); return true; }
      const special = (e.key.length > 1 && e.key !== 'Dead') || e.ctrlKey || e.metaKey;
      if (special) { if (term.key(e)) e.preventDefault(); }
      else if (document.activeElement !== ta && e.key.length === 1) { term.key(e); e.preventDefault(); }
      return true;
    });
    // el cursor queda libre mientras escribes: Esc se levanta sin pasar por la pausa
    interact.push({ x: r.cx, z: r.cz - .3, r: 1.7, label: 'Sentarse en la consola del capitán', module: true, run: () => {
      seated = true; N.setModal(true); if (document.pointerLockElement) document.exitPointerLock();
      N.teleport(r.cx, r.cz - .55, Math.PI); player.pitch = -.06;
      ta.value = ''; ta.focus({ preventScroll: true }); term.focus(); hint.hidden = false;
      cm()?.setButtons([{ id: 'up', label: 'Levantarse', onPress: stand }]);
    } });
    removeInteract('Acceder a la consola del capitán');
    addEventListener('malkevnia:room', e => term.setRoom(e.detail.id));
    modules.terminal = term;
  });

  /* ---------- Bitácora ---------- */
  await mount('Bitácora', async () => {
    const B = await pre.bit;
    const posts = await B.loadPosts(M('modulos/bitacora/posts.json'));
    await fontsReady(['300 40px "Exo 2"', '600 40px "Exo 2"', '500 20px "JetBrains Mono"', '600 20px "JetBrains Mono"']);
    await window.Malkevnia.registerModule('bitacora', {
      mount(ctx) {
        const r = ctx.room;
        const wall = B.createHoloWall(THREE, { posts, radius: 2.2, rows: 2, perRow: 8, spacing: .5, panelWidth: 1.0, baseY: 1.0, rowGap: .72 });
        wall.group.position.set(r.cx, 0, r.cz + .4); ctx.group.add(wall.group);
        ctx.onFrame((t, dt) => wall.update(t, dt));
        const reader = B.createReader({ posts, onOpen: () => { ctx.suspend(); cm()?.setEnabled(false); }, onClose: () => { cm()?.setEnabled(true); ctx.resume(); } });
        ctx.addInteract({ x: r.cx, z: r.cz + .4, r: 1.9, label: 'Leer la entrada del holopanel', run: () => { const p = wall.pick(centerRay()) || posts[0]; wall.focus(p); reader.open(p); } });
        const inRoom = () => N.lastRoom?.id === 'bitacora';
        addEventListener('wheel', e => { if (inRoom() && !reader.isOpen) wall.spin(Math.sign(e.deltaY) * .06); }, { passive: true });
        captures.push(e => {
          if (!inRoom() || reader.isOpen) return false;
          if (e.code === 'PageUp' || e.code === 'KeyQ') { wall.prevPage(); return true; }
          if (e.code === 'PageDown' || e.code === 'KeyR') { wall.nextPage(); return true; }
          return false;
        });
        ctx.onFrame(() => { if (inRoom()) wall.hover(wall.pick(centerRay())); });
        modules.bitacora = { wall, reader, posts };
        // escritorio contra la pared norte, con la última entrada en el monitor
        const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, .78, .9), new THREE.MeshStandardMaterial({ color: 0x3a2a4f, roughness: .8 }));
        desk.position.set(r.cx, .39, r.z0 + 1.0); ctx.group.add(desk); ctx.addCollider(r.cx - 1.3, r.z0 + .55, r.cx + 1.3, r.z0 + 1.45);
        const monTex = new THREE.CanvasTexture(B.drawPanelCanvas(posts[0], { w: 640, h: 400 })); monTex.colorSpace = THREE.SRGBColorSpace;
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .75), new THREE.MeshBasicMaterial({ map: monTex, toneMapped: false }));
        mon.position.set(r.cx, 1.25, r.z0 + .6); ctx.group.add(mon);
      },
    });
  });

  /* ---------- Librería 3D ---------- */
  await mount('Biblioteca', async () => {
    const [{ crearLibreria }, { LIBROS, ATLAS }] = await pre.lib;
    await window.Malkevnia.registerModule('biblioteca', {
      mount(ctx) {
        const r = ctx.room;
        const lib = crearLibreria({ libros: LIBROS, atlas: ATLAS, atlasUrl: M('modulos/libreria-3d/portadas.jpg'), contenedor: document.body, luces: true,
          onSelect: libro => { if (libro) { ctx.suspend(); cm()?.setEnabled(false); } else { cm()?.setEnabled(true); ctx.resume(); } } });
        lib.init({ scene: ctx.group, camera, renderer: N.renderer, eventos: false });
        if (lib.group.parent !== ctx.group) ctx.group.add(lib.group);
        lib.group.position.set(r.x0 + .18, 0, r.cz - .2); lib.group.rotation.y = Math.PI / 2;
        ctx.addCollider(r.x0, r.cz - 1.65, r.x0 + .4, r.cz + 1.25);
        ctx.onFrame((t, dt) => lib.update(dt));
        removeInteract('Consultar la biblioteca');
        ctx.addInteract({ x: r.x0 + 1.4, z: r.cz - .2, r: 2.0, label: 'Sacar el libro de la mirilla', run: () => lib.usar(centerRay()) });
        modules.libreria = lib;
      },
    }, { replace: false });
  });

  /* ---------- Kallax 3D ---------- */
  await mount('Kallax', async () => {
    const { init } = await pre.kal;
    const r = rooms.juegos;
    for (const o of [...scene.children]) if (o.name === 'kallax-provisional') scene.remove(o);
    const k = init(scene, {
      camera, domElement: N.renderer.domElement, pointer: 'center', search: false, clickToPick: false,
      position: new THREE.Vector3(r.cx, 0, r.z1 - .21), rotationY: Math.PI, actionHint: N.TOUCH ? 'Usar para coger' : 'E para coger',
      onOpen: () => { N.suspend(); cm()?.setEnabled(false); },
      onClose: () => { cm()?.setEnabled(true); N.resume(); },
    });
    N.anim.push((t, dt) => k.update(dt));
    removeInteract('Revisar las Kallax');
    interact.push({ x: r.cx, z: r.z1 - 1.3, r: 2.4, label: 'Coger la caja de la mirilla', module: true, run: () => k.pickHovered() });
    window.__kallax = k; modules.kallax = k;
  });

  /* ---------- Sala de proyección ---------- */
  await mount('Sala de cine', async () => {
    const [{ init }, { PELIS_EJEMPLO }] = await pre.cine;
    await fontsReady(['700 60px Orbitron', '600 40px "Exo 2"', '500 20px "JetBrains Mono"']);
    await window.Malkevnia.registerModule('proyeccion', {
      mount(ctx) {
        const r = ctx.room;
        // la luz de techo de la sala baja con la proyección
        const lights = scene.children.filter(o => o.isPointLight && inRect(o.position, r));
        const panels = scene.children.filter(o => o.isMesh && o.position.y > N.H - .1 && inRect(o.position, r));
        const li = lights.map(l => l.intensity), pc = panels.map(p => p.material.color.clone());
        const A = () => window.AudioNave;
        const cine = init({
          scene: ctx.group, shell: false, films: DATA.films || PELIS_EJEMPLO, origin: new THREE.Vector3(r.cx, 0, r.cz), width: r.x1 - r.x0, depth: r.z1 - r.z0, height: N.H,
          onDim: L => { lights.forEach((l, i) => { l.intensity = li[i] * L; }); panels.forEach((p, i) => p.material.color.copy(pc[i]).multiplyScalar(Math.max(L, .04))); },
          onModeChange: mode => {
            // durante la proyección la música de la nave casi desaparece y suena el proyector
            const on = mode === 'proyeccion';
            try { if (A()?.getState?.().running) { A().setVolume('musica', on ? .08 : .6); cine.setSound(on && !A().getState().muted); } } catch {}
          },
        });
        modules.cine = cine;
        cine.colliders.forEach(c => ctx.addCollider(...c));
        cine.interactions.forEach(it => ctx.addInteract(it));
        const inRoom = () => N.lastRoom?.id === 'proyeccion';
        ctx.onFrame((t, dt) => { cine.update(dt); if (inRoom() && !player.seated) cine.hover(centerRay()); });

        // sentarse en la butaca libre más cercana, mirando a la pantalla
        const seats = cine.seats || [];
        if (seats.length) {
          const c = seats.reduce((a, s) => a.add(s), new THREE.Vector3()).multiplyScalar(1 / seats.length);
          let saved = null;
          const stand = () => { if (!player.seated) return; player.seated = false; player.eye = undefined; N.teleport(saved.x, saved.z); useButton(); seatHint.hidden = true; };
          const seatHint = document.createElement('div'); seatHint.className = 'hud mode-hint'; seatHint.hidden = true;
          seatHint.textContent = N.TOUCH ? 'Disfruta la sesión · Levantarse para salir' : 'Disfruta la sesión · Esc o WASD para levantarte'; document.body.appendChild(seatHint);
          ctx.addInteract({ x: c.x, z: c.z, r: 3.2, label: 'Sentarse en una butaca', run: () => {
            let best = seats[0], bd = 1e9;
            for (const s of seats) { const d = (s.x - player.x) ** 2 + (s.z - player.z) ** 2; if (d < bd) { bd = d; best = s; } }
            saved = { x: player.x, z: player.z };
            const sc = cine.screen?.center || new THREE.Vector3(r.cx, 1.6, r.z0);
            player.seated = true; player.eye = best.y; N.teleport(best.x, best.z, Math.atan2(-(sc.x - best.x), -(sc.z - best.z)));
            player.pitch = Math.atan2((sc.y ?? 1.6) - best.y, Math.hypot(sc.x - best.x, sc.z - best.z));
            seatHint.hidden = false;
            cm()?.setButtons([{ id: 'up', label: 'Levantarse', onPress: stand }, { id: 'proj', label: 'Proyector', onPress: () => cine.toggleProjection() }]);
          } });
          captures.push(e => {
            if (!player.seated) return false;
            if (e.code === 'Escape' || e.code === 'KeyE') { stand(); return true; }
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) stand();
            return false;
          });
        }
      },
    });
  });

  /* ---------- Planeta procedural por el ventanal ---------- */
  await mount('Sensores de proa', async () => {
    const { generatePlanet, randomSeed } = await pre.plan;
    const pl = generatePlanet(randomSeed(), { radius: 120, detail: N.TOUCH ? 'media' : 'alta', lightDirection: new THREE.Vector3(...SUN_DIR).normalize() });
    pl.group.position.copy(N.planet.position); scene.add(pl.group); N.planet.visible = false; N.moon.visible = false;
    pl.group.traverse(o => { o.userData.structural = true; });
    N.anim.push((t, dt) => pl.update(dt)); modules.planetaProa = pl;
    const m = pl.meta, b = rooms.puente;
    const num = v => typeof v === 'number' ? v.toLocaleString('es-ES') : v;
    interact.push({ x: b.x1 - 2.2, z: b.cz, r: 2.0, label: 'Escanear el planeta de proa', module: true, run: () =>
      N.showPanel('Sensores de proa · ' + (m.designacion || ''), m.nombre || 'Planeta sin nombre',
        `${m.tipoNombre || ''}. Radio ${num(m.radioKm)} km, gravedad ${num(m.gravedad)} g, ${num(m.temperatura)} °C. Atmósfera ${m.atmosfera || 'desconocida'}. ${m.lore || ''}`) });
  });

  /* ---------- Planetas por hobby: lanzadera ---------- */
  await mount('Lanzadera', async () => {
    const HOBBY = [['verdanza', 'Verdanza', 'Juegos de mesa'], ['carmesi', 'Carmesí', 'Videojuegos'], ['thalassa', 'Thalassa', 'Cine'], ['gelida', 'Gélida', 'Libros y manga'], ['izaro', 'Izaro', 'Rol · Proyecto Arca'], ['nix-aurea', 'Nix Áurea', 'Música'], ['lumen', 'Lumen', 'Bitácora']];
    const css = document.createElement('style');
    css.textContent = `#surf{position:fixed;inset:0;z-index:30;background:#000}#surf canvas{width:100%;height:100%;display:block;touch-action:none}
#surf .s-card{position:absolute;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;backdrop-filter:blur(6px)}
#surf .s-top{top:calc(14px + env(safe-area-inset-top,0px));left:max(16px,env(safe-area-inset-left,0px));max-width:min(420px,calc(100vw - 200px))}
#surf .s-top .eb{font:600 10px var(--f-mono);letter-spacing:.22em;color:var(--muted);text-transform:uppercase}
#surf .s-top h2{font:700 20px var(--f-display);margin:4px 0 2px;letter-spacing:.04em;text-wrap:balance}#surf .s-top p{margin:0;color:var(--muted);font-size:13px}
#surf .s-hitos{right:max(16px,env(safe-area-inset-right,0px));top:calc(70px + env(safe-area-inset-top,0px));display:grid;gap:6px}
#surf .s-hitos button,#surf .s-back{font:600 12px var(--f-mono);letter-spacing:.06em;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:999px;padding:7px 12px;cursor:pointer;text-align:left}
#surf .s-hitos button:hover,#surf .s-hitos button:focus-visible,#surf .s-back:hover,#surf .s-back:focus-visible{border-color:var(--accent);color:var(--glow);outline:none}
#surf .s-back{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:max(16px,env(safe-area-inset-right,0px));background:var(--panel)}
#surf .s-txt{left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));width:min(560px,calc(100vw - 32px));line-height:1.5;font-size:14px;max-height:40vh;overflow:auto}
#surf .s-txt b{font-family:var(--f-display);letter-spacing:.04em;display:block;margin-bottom:4px}
@media (max-width:640px){#surf .s-top{max-width:calc(100vw - 32px);top:calc(60px + env(safe-area-inset-top,0px))}#surf .s-hitos{top:auto;bottom:calc(150px + env(safe-area-inset-bottom,0px))}}`;
    document.head.appendChild(css);
    let PH = null;
    const descend = async id => {
      $('panel').hidden = true; N.setModal(false);
      try { PH = PH || await load('modulos/planetas-hobby/planetas-hobby.js'); }
      catch (e) { console.warn(e); N.showPanel('Lanzadera', 'Descenso cancelado', 'El módulo de aterrizaje no responde. Inténtalo más tarde.'); return; }
      $('fade').style.opacity = 1; await wait(600);
      if (document.pointerLockElement) document.exitPointerLock();
      N.setAway(true); cm()?.setEnabled(false); mode('superficie', id);
      const wrap = document.createElement('div'); wrap.id = 'surf';
      wrap.innerHTML = `<canvas></canvas><div class="s-card s-top"><div class="eb"></div><h2></h2><p></p></div><button class="s-back">⟵ Volver a la nave</button><div class="s-card s-hitos" aria-label="Hitos"></div><div class="s-card s-txt" hidden></div>`;
      document.body.appendChild(wrap);
      const txt = wrap.querySelector('.s-txt');
      let ctrl;
      try {
        ctrl = PH.init(wrap.querySelector('canvas'), id, { calidad: N.TOUCH ? 'media' : 'alta', onHito: h => { txt.hidden = false; txt.innerHTML = ''; const b = document.createElement('b'); b.textContent = h.nombre; txt.append(b, h.texto); } });
      } catch (e) { console.warn(e); wrap.remove(); N.setAway(false); cm()?.setEnabled(true); mode('nave', N.lastRoom?.id); $('fade').style.opacity = 0; N.showPanel('Lanzadera', 'Descenso cancelado', 'No se pudo aterrizar en ese planeta.'); return; }
      const pl = ctrl.planeta || PH.PLANETAS.find(p => p.id === id) || {};
      wrap.querySelector('.eb').textContent = `${pl.nombre || id} · ${pl.hobby || ''}`;
      wrap.querySelector('h2').textContent = pl.museo || pl.nombre || id;
      wrap.querySelector('p').textContent = pl.lema || '';
      const list = wrap.querySelector('.s-hitos');
      for (const h of ctrl.hitos || []) { const b = document.createElement('button'); b.textContent = h.nombre; b.onclick = () => ctrl.irAHito(h.id); list.appendChild(b); }
      let leaving = false;
      const leave = async () => {
        if (leaving) return; leaving = true;
        removeEventListener('keydown', onKey, true);
        $('fade').style.opacity = 1; await wait(600);
        try { ctrl.dispose(); } catch {}
        wrap.remove(); N.setAway(false); cm()?.setEnabled(true); mode('nave', N.lastRoom?.id); $('fade').style.opacity = 0; N.lock();
      };
      const onKey = e => { if (e.code === 'Escape') { e.stopPropagation(); leave(); } };
      addEventListener('keydown', onKey, true);
      wrap.querySelector('.s-back').onclick = leave;
      $('fade').style.opacity = 0;
    };
    const b = rooms.puente;
    interact.push({ x: b.cx + 1.2, z: b.z0 + 1.7, r: 2.0, label: 'Lanzadera · descender a un planeta', module: true, run: () => {
      const box = document.createElement('div'); box.className = 'extra row'; box.style.width = '100%';
      for (const [id, name, hobby] of HOBBY) { const bt = document.createElement('button'); bt.className = 'btn ghost'; bt.style.padding = '10px 14px'; bt.textContent = `${name} · ${hobby}`; bt.onclick = () => descend(id); box.appendChild(bt); }
      N.showPanel('Lanzadera', 'Elige destino', 'Cada planeta guarda el museo de una de tus aficiones. Desciende, recorre sus cuatro hitos y vuelve a bordo cuando quieras.', box);
    } });
    // consola de la lanzadera, a babor del puente
    const sh = new THREE.Group(); sh.position.set(b.cx + 1.2, 0, b.z0 + .9); scene.add(sh);
    const baseM = new THREE.Mesh(new THREE.BoxGeometry(1.6, .9, .7), new THREE.MeshStandardMaterial({ color: 0x18122b, metalness: .5, roughness: .5 })); baseM.position.y = .45; sh.add(baseM);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .4), N.glow(0xffc27a, .6)); scr.position.set(0, 1.05, .2); scr.rotation.x = -.5; sh.add(scr);
    N.addCol(b.cx + .4, b.z0 + .55, b.cx + 2.0, b.z0 + 1.25);
  });

  /* ---------- Vuelo libre desde el sillón del capitán ---------- */
  await mount('Vuelo libre', async () => {
    const RUTA = { '/juegos': 'juegos', '/cine': 'proyeccion', '/libros': 'biblioteca', '/manga': 'biblioteca', '/bitacora': 'bitacora', '/rol': 'juegos' };
    let V = null, flying = false;
    const fly = async () => {
      if (flying) return; flying = true;
      try { V = V || await load('modulos/vuelo-libre/vuelo-libre.js'); }
      catch (e) { flying = false; console.warn(e); N.showPanel('Mandos', 'Mandos bloqueados', 'El módulo de vuelo no responde. Inténtalo más tarde.'); return; }
      $('fade').style.opacity = 1; await wait(600);
      if (document.pointerLockElement) document.exitPointerLock();
      N.setAway(true); cm()?.setEnabled(false); window.AudioNave?.setMuted(true); mode('vuelo');
      const wrap = document.createElement('div'); wrap.id = 'uniWrap'; const c = document.createElement('canvas'); wrap.appendChild(c); document.body.appendChild(wrap);
      let v = null, leaving = false;
      const leave = async room => {
        if (leaving) return; leaving = true;
        $('fade').style.opacity = 1; await wait(600);
        try { v?.stop?.(); v?.dispose?.(); } catch {}
        wrap.remove(); N.setAway(false); cm()?.setEnabled(true); flying = false;
        mode('nave', room || N.lastRoom?.id);
        if (window.AudioNave && $('sound').textContent.endsWith('sí')) window.AudioNave.setMuted(false);
        const sp = room && spawnOf(room);
        if (sp) { N.teleport(sp.x, sp.z, sp.yaw); player.pitch = 0; }
        $('fade').style.opacity = 0; N.lock();
      };
      try {
        v = await V.createFlight({ canvas: c, onExit: () => leave(), onVisit: planet => leave(RUTA[planet?.ruta] || null), calidad: N.TOUCH ? 'media' : 'alta' });
        v.start();
      } catch (e) { console.warn(e); wrap.remove(); N.setAway(false); cm()?.setEnabled(true); flying = false; mode('nave', N.lastRoom?.id); N.showPanel('Mandos', 'Fallo de los mandos', 'No se pudo iniciar el vuelo libre.'); }
      $('fade').style.opacity = 0;
    };
    const b = rooms.puente;
    interact.push({ x: b.cx + 1.2, z: b.cz, r: 1.5, label: 'Tomar los mandos · vuelo libre', module: true, run: fly });
  });

  // capas extra (p. ej. la versión unificada): window.MALKEVNIA_EXTRA = ['./capa.js', …], cada una con export default (N) => {}
  for (const f of (window.MALKEVNIA_EXTRA || [])) {
    try { await (await import(new URL(f, document.baseURI).href)).default(N); } catch (e) { console.warn('extra', f, e); failed.push(String(f)); }
  }

  window.Malkevnia.loaded = true;
  window.Malkevnia.failed = failed;
  dispatchEvent(new CustomEvent('malkevnia:modules', { detail: { failed } }));
}
