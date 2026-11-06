/**
 * controles-moviles.js · Malkevnia
 * Controles táctiles para escenas en primera persona (la nave) y de vuelo libre (el universo).
 *
 *  - Joystick virtual flotante: aparece donde apoyas el pulgar en la zona izquierda.
 *  - Mirar arrastrando: cualquier dedo fuera de la zona del joystick (o sobre ella si el joystick ya está ocupado).
 *  - Giroscopio opcional: gira el móvil para mirar. Usa la velocidad de giro (devicemotion.rotationRate),
 *    así que funciona igual en vertical y en horizontal y se suma al arrastre sin "pelearse" con él.
 *  - Botones opcionales a la derecha (acción, subir, bajar...).
 *
 * Sin dependencias. Módulo ES. Ver README.md para la API completa.
 */

const DEG = Math.PI / 180;

/** true si el dispositivo tiene pantalla táctil como entrada principal. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const anyCoarse = window.matchMedia?.('(any-pointer: coarse)').matches;
  const hover = window.matchMedia?.('(hover: hover)').matches;
  return !!(coarse || (anyCoarse && !hover) || (navigator.maxTouchPoints > 0 && !hover));
}

/** true si el navegador expone el giroscopio (no garantiza que haya permiso). */
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
  lookSensitivity: 0.005,// rad por px arrastrado
  gyroSensitivity: 1,    // multiplicador de la velocidad de giro
  invertY: false,        // invierte el eje vertical de mirar (arrastre y giroscopio)
  tapMaxMs: 220, tapMaxPx: 10,
  buttons: [],           // [{ id, label, onPress, onRelease, hold }]
  ui: true,              // dibuja joystick y botones
  zIndex: 20,
};

/**
 * Engancha los controles a un elemento (normalmente el <canvas> de Three.js).
 * @returns controlador { move, enableGyro, disableGyro, gyroState, setEnabled, setButtons, dispose }
 */
export function init(el, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const move = { x: 0, y: 0 };
  let enabled = true, gyroState = 'off', lastGyroT = 0, gyroWatchdog = 0;
  const joy = { id: null, x0: 0, y0: 0 };
  const looks = new Map(); // pointerId -> { x, y, t, x0, y0 }

  const prevTouchAction = el.style.touchAction;
  el.style.touchAction = 'none';
  el.style.webkitUserSelect = el.style.userSelect = 'none';

  /* ---------- UI ---------- */
  let root = null, base = null, knob = null, ghost = null, btnBox = null;
  if (o.ui) {
    root = document.createElement('div');
    root.className = 'cm-root';
    root.innerHTML = `<style>
      .cm-root{position:fixed;inset:0;pointer-events:none;z-index:${o.zIndex};
        --cm-c:var(--cm-color,#b9a3ff);--cm-bg:var(--cm-fill,rgba(40,24,80,.35))}
      .cm-base,.cm-ghost{position:absolute;width:${o.joystickRadius * 2}px;height:${o.joystickRadius * 2}px;margin:-${o.joystickRadius}px 0 0 -${o.joystickRadius}px;
        border-radius:50%;border:1.5px solid var(--cm-c);background:var(--cm-bg);box-shadow:0 0 18px rgba(150,110,255,.25) inset}
      .cm-ghost{left:calc(env(safe-area-inset-left,0px) + ${o.joystickRadius + 28}px);bottom:calc(env(safe-area-inset-bottom,0px) + ${o.joystickRadius + 28}px);top:auto;margin:0 0 -${o.joystickRadius}px -${o.joystickRadius}px;opacity:.35;transition:opacity .25s}
      .cm-base{opacity:0;transition:opacity .15s}
      .cm-base.on{opacity:1}
      .cm-knob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
        background:radial-gradient(circle at 35% 30%,#e9e0ff,var(--cm-c) 60%,#6b4fd8);box-shadow:0 0 14px rgba(185,163,255,.6)}
      .cm-btns{position:absolute;right:calc(env(safe-area-inset-right,0px) + 18px);bottom:calc(env(safe-area-inset-bottom,0px) + 22px);
        display:flex;flex-direction:column-reverse;gap:12px;align-items:flex-end;pointer-events:none}
      .cm-btn{pointer-events:auto;touch-action:none;min-width:64px;height:64px;padding:0 14px;border-radius:32px;border:1.5px solid var(--cm-c);
        background:var(--cm-bg);color:#efe9ff;font:600 12px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;
        -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
      .cm-btn.down{background:var(--cm-c);color:#160c33}
      .cm-hide .cm-ghost,.cm-hide .cm-base,.cm-hide .cm-btns{display:none}
    </style><div class="cm-ghost"></div><div class="cm-base"><div class="cm-knob"></div></div><div class="cm-btns"></div>`;
    document.body.appendChild(root);
    base = root.querySelector('.cm-base');
    knob = root.querySelector('.cm-knob');
    ghost = root.querySelector('.cm-ghost');
    btnBox = root.querySelector('.cm-btns');
  }

  /* ---------- Joystick y mirar ---------- */
  function setMove(x, y) {
    if (x === move.x && y === move.y) return;
    move.x = x; move.y = y;
    o.onMove?.(x, y);
  }

  function onDown(e) {
    if (!enabled || e.pointerType === 'mouse') return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch {}
    const r = el.getBoundingClientRect();
    const inJoyZone = e.clientX - r.left < r.width * o.joystickZone;
    if (inJoyZone && joy.id === null) {
      joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY;
      if (base) { base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('on'); ghost.style.opacity = 0; knob.style.transform = ''; }
    } else {
      looks.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    }
  }

  function onMovePtr(e) {
    if (!enabled) return;
    if (e.pointerId === joy.id) {
      e.preventDefault();
      let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0;
      const R = o.joystickRadius, len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      if (knob) knob.style.transform = `translate(${dx}px,${dy}px)`;
      const n = Math.min(len, R) / R;
      if (n < o.deadZone) return setMove(0, 0);
      // reescala para que el borde de la zona muerta valga 0 y el borde exterior 1
      const k = (n - o.deadZone) / (1 - o.deadZone) / (n || 1);
      setMove(round(dx / R * k), round(-dy / R * k));
      return;
    }
    const l = looks.get(e.pointerId);
    if (!l) return;
    e.preventDefault();
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY;
    o.onLook?.(-dx * o.lookSensitivity, (o.invertY ? dy : -dy) * o.lookSensitivity);
  }

  function onUp(e) {
    if (e.pointerId === joy.id) {
      joy.id = null; setMove(0, 0);
      if (base) { base.classList.remove('on'); knob.style.transform = ''; ghost.style.opacity = ''; }
      return;
    }
    const l = looks.get(e.pointerId);
    if (!l) return;
    looks.delete(e.pointerId);
    if (e.type === 'pointerup' && performance.now() - l.t < o.tapMaxMs && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < o.tapMaxPx) o.onTap?.(e.clientX, e.clientY);
  }

  const round = v => Math.round(v * 1000) / 1000;
  const noCtx = e => e.preventDefault();
  const noGesture = e => e.preventDefault(); // evita el zoom con pellizco de Safari

  el.addEventListener('pointerdown', onDown, { passive: false });
  el.addEventListener('pointermove', onMovePtr, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  el.addEventListener('contextmenu', noCtx);
  document.addEventListener('gesturestart', noGesture, { passive: false });

  function releaseAll() {
    joy.id = null; looks.clear(); setMove(0, 0);
    if (base) { base.classList.remove('on'); knob.style.transform = ''; ghost.style.opacity = ''; }
    btnBox?.querySelectorAll('.cm-btn.down').forEach(b => b.dispatchEvent(new Event('pointercancel')));
  }
  const onVis = () => { if (document.hidden) releaseAll(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', releaseAll);

  /* ---------- Botones ---------- */
  function setButtons(list) {
    if (!btnBox) return;
    btnBox.textContent = '';
    for (const b of list || []) {
      const n = document.createElement('button');
      n.type = 'button'; n.className = 'cm-btn'; n.textContent = b.label; if (b.id) n.dataset.id = b.id;
      n.setAttribute('aria-label', b.ariaLabel || b.label);
      let down = false;
      const press = e => { e.preventDefault(); e.stopPropagation(); if (!enabled || down) return; down = true; n.classList.add('down'); try { n.setPointerCapture(e.pointerId); } catch {} b.onPress?.(); };
      const release = e => { if (!down) return; down = false; n.classList.remove('down'); b.onRelease?.(); };
      n.addEventListener('pointerdown', press);
      n.addEventListener('pointerup', release);
      n.addEventListener('pointercancel', release);
      n.addEventListener('lostpointercapture', release);
      n.addEventListener('contextmenu', noCtx);
      // teclado / lector de pantalla
      n.addEventListener('click', e => { if (e.detail === 0) { b.onPress?.(); b.onRelease?.(); } });
      btnBox.appendChild(n);
    }
  }
  setButtons(o.buttons);

  /* ---------- Giroscopio ---------- */
  function setGyro(s) { if (gyroState !== s) { gyroState = s; o.onGyroChange?.(s); } }

  function screenAngle() {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }

  function onMotion(e) {
    const rr = e.rotationRate;
    if (!rr || (rr.alpha == null && rr.beta == null && rr.gamma == null)) return;
    const now = performance.now();
    const dt = lastGyroT ? Math.min((now - lastGyroT) / 1000, 0.1) : 0;
    lastGyroT = now;
    if (gyroState !== 'on') { clearTimeout(gyroWatchdog); setGyro('on'); }
    if (!dt || !enabled) return;
    const bx = (rr.beta || 0) * DEG, gy = (rr.gamma || 0) * DEG; // giro alrededor de los ejes x e y del dispositivo
    let yaw, pitch;
    switch (screenAngle()) {
      case 90:  yaw = bx;  pitch = -gy; break;
      case 180: yaw = -gy; pitch = -bx; break;
      case 270: yaw = -bx; pitch = gy;  break;
      default:  yaw = gy;  pitch = bx;
    }
    const k = o.gyroSensitivity * dt;
    o.onLook?.(yaw * k, (o.invertY ? -pitch : pitch) * k);
  }

  /**
   * Activa el giroscopio. En iOS hay que llamarlo desde un toque del usuario (pide permiso).
   * Resuelve con 'on' | 'denied' | 'unavailable'.
   */
  async function enableGyro() {
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
    lastGyroT = 0;
    window.addEventListener('devicemotion', onMotion);
    // si en 1,5 s no llega ningún dato, no hay sensor (escritorio) o el navegador lo bloquea (iframes)
    return new Promise(resolve => {
      const start = performance.now();
      const check = () => {
        if (gyroState === 'on') return resolve('on');
        if (performance.now() - start > 1500) { window.removeEventListener('devicemotion', onMotion); setGyro('unavailable'); return resolve('unavailable'); }
        gyroWatchdog = setTimeout(check, 100);
      };
      check();
    });
  }

  function disableGyro() {
    clearTimeout(gyroWatchdog);
    window.removeEventListener('devicemotion', onMotion);
    lastGyroT = 0;
    setGyro('off');
  }

  /* ---------- Ciclo de vida ---------- */
  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) releaseAll();
    root?.classList.toggle('cm-hide', !enabled);
  }

  function dispose() {
    disableGyro(); releaseAll();
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
