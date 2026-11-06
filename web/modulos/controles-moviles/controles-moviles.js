/**
 * controles-moviles.js · Malkevnia · v2
 * Controles táctiles para escenas en primera persona (la nave) y de vuelo libre (el universo).
 *
 *  - Joystick virtual flotante: aparece donde apoyas el pulgar en la zona izquierda y te sigue
 *    si te pasas del borde, así nunca "pierdes" el mando.
 *  - Mirar arrastrando: cualquier dedo fuera de la zona del joystick (o dentro, si el joystick ya está ocupado).
 *  - Giroscopio opcional: gira el móvil para mirar. Usa la velocidad de giro (devicemotion.rotationRate)
 *    proyectada sobre la vertical real (gravedad), así que girar sobre ti mismo es "rumbo" puro
 *    sostengas el móvil como lo sostengas, en vertical o en horizontal. Se suma al arrastre.
 *  - Botones opcionales a la derecha (usar, saltar, subir, bajar...), con vibración corta en Android.
 *
 * Sin dependencias. Módulo ES. API estable desde v1; ver README.md.
 */

const DEG = Math.PI / 180;

/** true si el dispositivo tiene pantalla táctil como entrada principal. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const mq = q => window.matchMedia?.(q).matches;
  const hover = mq('(hover: hover)');
  return !!(mq('(pointer: coarse)') || (mq('(any-pointer: coarse)') && !hover) || (navigator.maxTouchPoints > 0 && !hover));
}

/** true si el navegador expone el giroscopio (no garantiza que haya sensor ni permiso). */
export function hasGyro() {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

const DEFAULTS = {
  onMove: null,          // (x, y) => {}   x: derecha +, y: adelante +, ambos en [-1, 1]
  onLook: null,          // (dYaw, dPitch) => {}   radianes; dYaw + = girar a la izquierda, dPitch + = mirar arriba
  onTap: null,           // (x, y) => {}   toque corto en la zona de mirar (coordenadas de cliente)
  onGyroChange: null,    // (estado) => {}   'on' | 'off' | 'denied' | 'unavailable'
  joystickZone: 0.45,    // fracción del ancho (desde la izquierda) que lanza el joystick
  joystickRadius: 56,    // px de recorrido máximo del pomo
  deadZone: 0.12,        // fracción del radio que se ignora
  followThumb: true,     // el joystick se desplaza con el pulgar si este se sale del borde
  lookSensitivity: 0.005,// rad por px arrastrado
  gyroSensitivity: 1,    // multiplicador de la velocidad de giro
  invertY: false,        // invierte el eje vertical de mirar (arrastre y giroscopio)
  tapMaxMs: 250, tapMaxPx: 10,
  buttons: [],           // [{ id, label, ariaLabel, onPress, onRelease }]
  haptics: true,         // vibración corta al pulsar un botón (donde el navegador lo permita)
  ui: 'auto',            // 'auto': dibuja joystick y botones solo en táctiles (o tras el primer toque); true: siempre; false: nunca
  zIndex: 20,
};

/**
 * Engancha los controles a un elemento (normalmente el <canvas> de Three.js).
 * @returns controlador { move, enableGyro, disableGyro, gyroState, setEnabled, setButtons, dispose }
 */
export function init(el, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const move = { x: 0, y: 0 };
  let enabled = true, disposed = false;
  const joy = { id: null, x0: 0, y0: 0 };
  const looks = new Map(); // pointerId -> { x, y, x0, y0, t }

  const prevTouchAction = el.style.touchAction;
  el.style.touchAction = 'none';
  el.style.webkitUserSelect = el.style.userSelect = 'none';
  el.style.webkitTouchCallout = 'none';

  /* ---------- UI ---------- */
  let root = null, base = null, knob = null, ghost = null, btnBox = null;
  if (o.ui) {
    const R = o.joystickRadius;
    root = document.createElement('div');
    root.className = 'cm-root';
    root.innerHTML = `<style>
      .cm-root{position:fixed;inset:0;pointer-events:none;z-index:${o.zIndex};
        --cm-c:var(--cm-color,#b9a3ff);--cm-bg:var(--cm-fill,rgba(40,24,80,.35));--cm-ink:var(--cm-text,#efe9ff)}
      .cm-root.cm-idle{display:none}
      .cm-base,.cm-ghost{position:absolute;width:${R * 2}px;height:${R * 2}px;border-radius:50%;
        border:1.5px solid var(--cm-c);background:var(--cm-bg);box-shadow:0 0 18px rgba(150,110,255,.25) inset}
      .cm-ghost{left:calc(env(safe-area-inset-left,0px) + 28px);bottom:calc(env(safe-area-inset-bottom,0px) + 28px);opacity:.35;transition:opacity .25s}
      .cm-base{left:0;top:0;margin:-${R}px 0 0 -${R}px;opacity:0;transition:opacity .15s;will-change:transform}
      .cm-base.on{opacity:1}
      .cm-knob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;will-change:transform;
        background:radial-gradient(circle at 35% 30%,#e9e0ff,var(--cm-c) 60%,#6b4fd8);box-shadow:0 0 14px rgba(185,163,255,.6)}
      .cm-btns{position:absolute;right:calc(env(safe-area-inset-right,0px) + 18px);bottom:calc(env(safe-area-inset-bottom,0px) + 22px);
        display:flex;flex-direction:column-reverse;gap:12px;align-items:flex-end}
      .cm-btn{pointer-events:auto;touch-action:none;min-width:64px;height:64px;padding:0 14px;border-radius:32px;border:1.5px solid var(--cm-c);
        background:var(--cm-bg);color:var(--cm-ink);font:600 12px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
      .cm-btn.down{background:var(--cm-c);color:#160c33}
      .cm-btn:focus-visible{outline:2px solid var(--cm-c);outline-offset:3px}
      .cm-off .cm-ghost,.cm-off .cm-base,.cm-off .cm-btns{display:none}
      @media (prefers-reduced-motion:reduce){.cm-ghost,.cm-base{transition:none}}
    </style><div class="cm-ghost"></div><div class="cm-base"><div class="cm-knob"></div></div><div class="cm-btns"></div>`;
    if (o.ui === 'auto' && !isTouchDevice()) root.classList.add('cm-idle');
    document.body.appendChild(root);
    base = root.querySelector('.cm-base');
    knob = root.querySelector('.cm-knob');
    ghost = root.querySelector('.cm-ghost');
    btnBox = root.querySelector('.cm-btns');
  }
  const wake = () => root?.classList.remove('cm-idle'); // equipos híbridos: aparece al primer toque

  /* ---------- Joystick y mirar ---------- */
  const round = v => Math.round(v * 1000) / 1000;
  function setMove(x, y) {
    if (x === move.x && y === move.y) return;
    move.x = x; move.y = y;
    o.onMove?.(x, y);
  }
  function placeBase() { if (base) base.style.transform = `translate(${joy.x0}px,${joy.y0}px)`; }
  function resetJoyUI() { if (base) { base.classList.remove('on'); knob.style.transform = ''; ghost.style.opacity = ''; } }

  function onDown(e) {
    if (!enabled || e.pointerType === 'mouse') return;
    e.preventDefault();
    wake();
    try { el.setPointerCapture(e.pointerId); } catch {}
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left < r.width * o.joystickZone && joy.id === null) {
      joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY;
      if (base) { placeBase(); base.classList.add('on'); ghost.style.opacity = 0; knob.style.transform = ''; }
    } else {
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    }
  }

  function onMovePtr(e) {
    if (!enabled) return;
    if (e.pointerId === joy.id) {
      e.preventDefault();
      const R = o.joystickRadius;
      let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0, len = Math.hypot(dx, dy);
      if (len > R) {
        if (o.followThumb) { // arrastra el centro para que el pomo se quede en el borde, bajo el pulgar
          joy.x0 = e.clientX - dx * R / len; joy.y0 = e.clientY - dy * R / len; placeBase();
        }
        dx *= R / len; dy *= R / len; len = R;
      }
      if (knob) knob.style.transform = `translate(${dx}px,${dy}px)`;
      const n = len / R;
      if (n < o.deadZone) return setMove(0, 0);
      const k = (n - o.deadZone) / (1 - o.deadZone) / n; // el borde de la zona muerta vale 0 y el exterior 1
      setMove(round(dx / R * k), round(-dy / R * k));
      return;
    }
    const l = looks.get(e.pointerId);
    if (!l) return;
    e.preventDefault();
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY;
    if (dx || dy) o.onLook?.(-dx * o.lookSensitivity, (o.invertY ? dy : -dy) * o.lookSensitivity);
  }

  function onUp(e) {
    if (e.pointerId === joy.id) { joy.id = null; setMove(0, 0); resetJoyUI(); return; }
    const l = looks.get(e.pointerId);
    if (!l) return;
    looks.delete(e.pointerId);
    if (e.type === 'pointerup' && enabled && performance.now() - l.t < o.tapMaxMs && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < o.tapMaxPx) o.onTap?.(e.clientX, e.clientY);
  }

  const noCtx = e => e.preventDefault();
  const noGesture = e => e.preventDefault(); // evita el zoom con pellizco de Safari

  el.addEventListener('pointerdown', onDown, { passive: false });
  el.addEventListener('pointermove', onMovePtr, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  el.addEventListener('contextmenu', noCtx);
  document.addEventListener('gesturestart', noGesture, { passive: false });

  const btnReleases = new Set();
  function releaseAll() {
    joy.id = null; looks.clear(); setMove(0, 0); resetJoyUI();
    for (const r of [...btnReleases]) r();
  }
  const onVis = () => { if (document.hidden) releaseAll(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', releaseAll);

  /* ---------- Botones ---------- */
  function setButtons(list) {
    for (const r of [...btnReleases]) r(); // suelta lo que estuviera pulsado antes de cambiar
    if (!btnBox) return;
    btnBox.textContent = '';
    for (const b of list || []) {
      const n = document.createElement('button');
      n.type = 'button'; n.className = 'cm-btn'; n.textContent = b.label; if (b.id) n.dataset.id = b.id;
      n.setAttribute('aria-label', b.ariaLabel || b.label);
      let down = false;
      const release = () => { if (!down) return; down = false; btnReleases.delete(release); n.classList.remove('down'); b.onRelease?.(); };
      const press = e => {
        e.preventDefault(); e.stopPropagation();
        if (!enabled || down) return;
        down = true; btnReleases.add(release); n.classList.add('down');
        try { n.setPointerCapture(e.pointerId); } catch {}
        if (o.haptics) try { navigator.vibrate?.(8); } catch {}
        b.onPress?.();
      };
      n.addEventListener('pointerdown', press);
      n.addEventListener('pointerup', release);
      n.addEventListener('pointercancel', release);
      n.addEventListener('lostpointercapture', release);
      n.addEventListener('contextmenu', noCtx);
      n.addEventListener('click', e => { if (e.detail === 0 && enabled) { b.onPress?.(); b.onRelease?.(); } }); // teclado y lectores de pantalla
      btnBox.appendChild(n);
    }
  }
  setButtons(o.buttons);

  /* ---------- Giroscopio ---------- */
  let gyroState = 'off', lastGyroT = 0, watchdog = 0, pending = null, settle = null;
  const grav = { x: 0, y: 0, z: 0, ok: false };
  // Signo de la gravedad: la spec dice que, con el móvil de pie, y ≈ +9,8; iOS la da con el signo contrario.
  // Partimos de lo esperado por plataforma y lo confirmamos con los datos cuando el móvil está claramente de pie.
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let gravSign = IOS ? -1 : 1;
  function setGyro(s) { if (gyroState !== s) { gyroState = s; o.onGyroChange?.(s); } }

  function screenAngle() {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }
  // ejes "arriba" y "derecha" de la pantalla, en coordenadas del dispositivo, según la rotación de la pantalla
  const AXES = {
    0:   { up: [0, 1, 0],  right: [1, 0, 0] },
    90:  { up: [1, 0, 0],  right: [0, -1, 0] },
    180: { up: [0, -1, 0], right: [-1, 0, 0] },
    270: { up: [-1, 0, 0], right: [0, 1, 0] },
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const DZ = 0.6 * DEG; // ignora el temblor de la mano (rad/s)
  const soft = v => Math.abs(v) < DZ ? 0 : v - Math.sign(v) * DZ;

  function onMotion(e) {
    const rr = e.rotationRate;
    if (!rr || (rr.alpha == null && rr.beta == null && rr.gamma == null)) return;
    const now = performance.now();
    const dt = lastGyroT ? Math.min((now - lastGyroT) / 1000, 0.1) : 0;
    lastGyroT = now;
    if (gyroState !== 'on') { setGyro('on'); settle?.('on'); }

    const ax = AXES[screenAngle()] || AXES[0];
    // gravedad filtrada: dice dónde está la vertical real respecto al móvil
    const g = e.accelerationIncludingGravity;
    if (g && g.x != null) {
      const a = grav.ok ? 0.15 : 1;
      grav.x += (g.x - grav.x) * a; grav.y += (g.y - grav.y) * a; grav.z += (g.z - grav.z) * a; grav.ok = true;
      const gl = Math.hypot(grav.x, grav.y, grav.z), s = dot([grav.x, grav.y, grav.z], ax.up) / (gl || 1);
      if (gl > 4 && Math.abs(s) > 0.6) gravSign = Math.sign(s); // móvil claramente de pie: la parte de arriba es "arriba"
    }
    if (!dt || !enabled) return;

    // velocidad angular en ejes del dispositivo (spec: alpha = z, beta = x, gamma = y), en rad/s
    const w = [(rr.beta || 0) * DEG, (rr.gamma || 0) * DEG, (rr.alpha || 0) * DEG];
    let up = ax.up, right = ax.right;
    const gl = Math.hypot(grav.x, grav.y, grav.z);
    if (grav.ok && gl > 4) {
      up = [gravSign * grav.x / gl, gravSign * grav.y / gl, gravSign * grav.z / gl];
      // derecha = (hacia dentro de la pantalla) × arriba = (-z) × up; no depende de cómo esté rotada la pantalla
      const rl = Math.hypot(up[0], up[1]);
      if (rl > 0.25) right = [up[1] / rl, -up[0] / rl, 0];
    }
    const yaw = soft(dot(w, up)), pitch = soft(dot(w, right));
    if (!yaw && !pitch) return;
    const k = o.gyroSensitivity * dt;
    o.onLook?.(yaw * k, (o.invertY ? -pitch : pitch) * k);
  }

  /**
   * Activa el giroscopio. En iOS hay que llamarlo desde un toque del usuario (pide permiso).
   * Resuelve con 'on' | 'denied' | 'unavailable' (u 'off' si se apaga antes de saberlo).
   */
  async function enableGyro() {
    if (disposed) return 'off';
    if (gyroState === 'on') return 'on';
    if (pending) return pending;
    if (!hasGyro()) { setGyro('unavailable'); return 'unavailable'; }
    try {
      const req = window.DeviceMotionEvent.requestPermission;
      if (typeof req === 'function') {
        const r = await req.call(window.DeviceMotionEvent);
        // iOS responde 'granted' o 'denied'; algunos Chromium responden 'prompt' sin preguntar nada,
        // así que solo 'denied' corta aquí y el resto lo decide el vigilante de abajo.
        if (r === 'denied') { setGyro('denied'); return 'denied'; }
      }
    } catch (e) {
      // NotAllowedError = no se llamó desde un toque o el usuario dijo que no
      const s = e?.name === 'NotAllowedError' ? 'denied' : 'unavailable';
      setGyro(s); return s;
    }
    if (disposed) return 'off';
    if (gyroState === 'on') return 'on';
    lastGyroT = 0; grav.ok = false;
    pending = new Promise(resolve => {
      settle = r => { clearTimeout(watchdog); settle = null; pending = null; resolve(r); };
      // si en 1,5 s no llega ningún dato, no hay sensor (escritorio) o el navegador lo bloquea (iframes)
      watchdog = setTimeout(() => {
        window.removeEventListener('devicemotion', onMotion);
        setGyro('unavailable'); settle?.('unavailable');
      }, 1500);
    });
    window.addEventListener('devicemotion', onMotion);
    return pending;
  }

  function disableGyro() {
    clearTimeout(watchdog);
    window.removeEventListener('devicemotion', onMotion);
    lastGyroT = 0; grav.ok = false;
    setGyro('off');
    settle?.('off');
  }

  /* ---------- Ciclo de vida ---------- */
  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) releaseAll();
    root?.classList.toggle('cm-off', !enabled);
  }

  function dispose() {
    if (disposed) return;
    disableGyro(); releaseAll(); disposed = true;
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMovePtr);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('lostpointercapture', onUp);
    el.removeEventListener('contextmenu', noCtx);
    document.removeEventListener('gesturestart', noGesture);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', releaseAll);
    el.style.touchAction = prevTouchAction;
    root?.remove();
  }

  return {
    move,                       // { x, y } siempre actualizado, para leerlo en el bucle de render
    enableGyro, disableGyro,
    get gyroState() { return gyroState; },
    setEnabled, setButtons, dispose,
  };
}

export default init;
