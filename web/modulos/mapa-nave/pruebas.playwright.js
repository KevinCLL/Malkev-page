const { chromium } = require('playwright');
const results = []; const ok = (name, cond, info = '') => { results.push([cond ? 'OK ' : 'FALLO', name, info]); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8765/test.html'); await p.waitForFunction(() => window.ready);

  // 1. init con el contenedor oculto (como la nave antes de embarcar)
  await p.evaluate(() => {
    window.ev = { tp: [], room: [], tog: [] };
    window.mapa = init(document.querySelector('#mini'), layout, {});
    mapa.onTeleport(e => ev.tp.push(e)); mapa.onRoomChange(e => ev.room.push(e)); mapa.onToggle((o, i) => ev.tog.push([o, i.via]));
  });
  ok('marcador oculto antes del primer setPlayer', await p.evaluate(() => document.querySelector('.mn-player').getAttribute('visibility') === 'hidden'));
  // M con el mapa oculto no hace nada
  await p.keyboard.press('KeyM');
  ok('M ignorada con el minimapa oculto', !(await p.evaluate(() => mapa.isExpanded())));
  await p.evaluate(() => { document.querySelector('#mini').hidden = false; mapa.setPlayer(44.4, 12, -Math.PI / 2); });
  await p.waitForTimeout(300);
  ok('estancia inicial = puente', await p.evaluate(() => mapa.currentRoom()?.id === 'puente'));
  // ajuste de nombres tras mostrarse (ResizeObserver)
  const overflow = await p.evaluate(() => { const bad = []; for (const t of document.querySelectorAll('.mn--compact text.mn-name-short')) { const g = t.closest('.mn-room'); const r = g.querySelector('rect').getBBox(); const tb = t.getBBox(); if (tb.width > r.width + 0.01) bad.push(g.dataset.room + ':' + tb.width.toFixed(2) + '>' + r.width.toFixed(2)); } return bad; });
  ok('nombres cortos caben en su sala (compacto)', overflow.length === 0, overflow.join(' '));

  // 2. clic en el minimapa con padre pointer-events:none
  await p.click('.mn-frame');
  ok('clic en minimapa abre el plano aunque el padre tenga pointer-events:none', await p.evaluate(() => mapa.isExpanded()));
  ok('onToggle(true, click)', await p.evaluate(() => JSON.stringify(ev.tog.at(-1)) === '[true,"click"]'));
  ok('foco en la sala actual', await p.evaluate(() => document.activeElement?.dataset?.room === 'puente'));
  const ovl = await p.evaluate(() => { const bad = []; for (const t of document.querySelectorAll('.mn--expanded text.mn-name-long, .mn--expanded text.mn-sub')) { const g = t.closest('.mn-room'); const r = g.querySelector('rect').getBBox(); const tb = t.getBBox(); if (tb.x + tb.width > r.x + r.width + 0.01) bad.push(g.dataset.room + ':' + t.textContent); } return bad; });
  ok('nombres largos y subtítulos caben (ampliado)', ovl.length === 0, ovl.join(' | '));
  // flechas
  await p.keyboard.press('ArrowLeft'); const a1 = await p.evaluate(() => document.activeElement?.dataset?.room);
  await p.keyboard.press('ArrowUp'); const a2 = await p.evaluate(() => document.activeElement?.dataset?.room);
  await p.keyboard.press('ArrowDown'); const a3 = await p.evaluate(() => document.activeElement?.dataset?.room);
  ok('flechas navegan entre salas', a1 && a2 && a3 && a1 !== 'puente', `${a1} → ${a2} → ${a3}`);
  // Tab atrapado
  for (let i = 0; i < 15; i++) await p.keyboard.press('Tab');
  ok('Tab no sale del plano', await p.evaluate(() => !!document.activeElement.closest('.mn-overlay')));
  // Intro teletransporta
  await p.evaluate(() => document.querySelector('[data-room="biblioteca"]').focus());
  await p.keyboard.press('Enter');
  const tp = await p.evaluate(() => ev.tp.at(-1));
  ok('Intro teletransporta con el spawn del layout', tp && tp.roomId === 'biblioteca' && tp.x === 27 && tp.z === 16 && Math.abs(tp.yaw - 3.14159) < 1e-6 && tp.via === 'key' && tp.from?.x === 44.4, JSON.stringify(tp && { id: tp.roomId, x: tp.x, z: tp.z, yaw: tp.yaw, via: tp.via }));
  await p.waitForTimeout(400);
  ok('se cierra tras teletransporte', await p.evaluate(() => !mapa.isExpanded() && JSON.stringify(ev.tog.at(-1)) === '[false,"teleport"]'));
  ok('el módulo no mueve al jugador (autoMove:false)', await p.evaluate(() => mapa.currentRoom()?.id === 'puente'));

  // 3. Esc
  await p.keyboard.press('KeyM'); ok('M abre', await p.evaluate(() => mapa.isExpanded()));
  await p.keyboard.press('Escape'); ok('Esc cierra con via=escape', await p.evaluate(() => !mapa.isExpanded() && ev.tog.at(-1)[1] === 'escape'));
  // clic en el fondo
  await p.keyboard.press('KeyM'); await p.mouse.click(5, 795);
  ok('clic en el fondo cierra', await p.evaluate(() => !mapa.isExpanded() && ev.tog.at(-1)[1] === 'backdrop'));
  // escribiendo
  await p.click('#inp'); await p.keyboard.press('KeyM');
  ok('M ignorada al escribir en un input', !(await p.evaluate(() => mapa.isExpanded())));
  await p.click('#outside');
  // tapado por el universo
  await p.evaluate(() => { const c = document.createElement('div'); c.id = 'cover'; document.body.appendChild(c); });
  await p.keyboard.press('KeyM');
  ok('M ignorada con otra capa encima (universo)', !(await p.evaluate(() => mapa.isExpanded())));
  await p.evaluate(() => document.getElementById('cover').remove());
  // defaultPrevented por una captura del host
  await p.evaluate(() => { window.cap = e => { if (window.capturing) e.preventDefault(); }; addEventListener('keydown', cap, true); window.capturing = true; });
  await p.keyboard.press('KeyM');
  ok('M ignorada si el host ya la consumió (preventDefault)', !(await p.evaluate(() => mapa.isExpanded())));
  await p.evaluate(() => { window.capturing = false; });

  // 4. puertas: sin parpadeo
  await p.evaluate(() => { ev.room.length = 0; for (const z of [12, 13.4, 13.8, 14.2, 14.6, 15.2, 16]) mapa.setPlayer(16.5, z, Math.PI); });
  const seq = await p.evaluate(() => ev.room.map(e => e.room?.id ?? 'null'));
  ok('cruzar una puerta: pasillo → juegos sin "en tránsito"', JSON.stringify(seq) === '["pasillo","juegos"]', JSON.stringify(seq));

  // 5. setPlayer sin cambios no toca el DOM
  const muts = await p.evaluate(async () => {
    mapa.setPlayer(16.5, 16, 1); let n = 0; const mo = new MutationObserver(l => { n += l.length; });
    mo.observe(document.querySelector('.mn-svg'), { subtree: true, attributes: true, childList: true });
    for (let i = 0; i < 100; i++) mapa.setPlayer(16.5, 16, 1);
    await new Promise(r => setTimeout(r, 30)); mo.disconnect(); return n;
  });
  ok('setPlayer repetido no muta el DOM', muts === 0, 'mutaciones: ' + muts);
  const perf = await p.evaluate(() => { const t = performance.now(); for (let i = 0; i < 20000; i++) mapa.setPlayer(12 + (i % 300) / 10, 12, i / 100); return performance.now() - t; });
  ok('20 000 setPlayer en < 400 ms', perf < 400, perf.toFixed(1) + ' ms (' + (perf / 20000 * 1000).toFixed(1) + ' µs/llamada)');
  ok('estela acotada a 24 puntos', await p.evaluate(() => document.querySelectorAll('.mn-trail circle').length === 24));

  // 6. visitantes
  await p.evaluate(() => { mapa.setOthers([{ id: 'a', name: 'Ana', x: 20, z: 12, yaw: 0 }, { id: 'b', x: 27, z: 18 }]); mapa.setRoomCounts({ biblioteca: 1, pasillo: 1, puente: 0 }); });
  ok('visitantes dibujados', await p.evaluate(() => document.querySelectorAll('.mn-other').length === 2));
  await p.evaluate(() => mapa.setOthers([{ id: 'b', x: 28, z: 18, yaw: 1 }]));
  ok('visitante que se va desaparece', await p.evaluate(() => document.querySelectorAll('.mn-other').length === 1));
  await p.keyboard.press('KeyM');
  ok('insignia de visitantes en el plano', await p.evaluate(() => [...document.querySelectorAll('.mn-badge--on text')].map(t => t.textContent).join('|') === '1 visitante|1 visitante'));
  ok('leyenda cuenta visitantes', await p.evaluate(() => document.querySelector('.mn-lg-others').textContent.trim() === '1 visitante' && !document.querySelector('.mn-lg-others').hidden));
  await p.keyboard.press('KeyM');

  // 7. segunda instancia: ids únicos
  await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'width:200px;position:fixed;left:0;top:60px'; document.body.appendChild(d); window.m2 = init(d, layout); });
  ok('gradientes con id único por instancia', await p.evaluate(() => new Set([...document.querySelectorAll('radialGradient')].map(g => g.id)).size === 2));
  ok('un solo <style> compartido', await p.evaluate(() => document.querySelectorAll('#mapa-nave-css').length === 1));
  await p.evaluate(() => m2.dispose());
  ok('dispose de una instancia conserva el estilo de la otra', await p.evaluate(() => !!document.getElementById('mapa-nave-css')));

  // 8. dispose abierto
  await p.keyboard.press('KeyM');
  await p.evaluate(() => mapa.dispose());
  ok('dispose abierto emite toggle(false, dispose) y limpia', await p.evaluate(() => ev.tog.at(-1)[1] === 'dispose' && !document.querySelector('.mn') && !document.querySelector('.mn-overlay') && !document.getElementById('mapa-nave-css')));
  await p.keyboard.press('KeyM');
  ok('sin listeners tras dispose', await p.evaluate(() => !document.querySelector('.mn')));
  await p.evaluate(() => { mapa.dispose(); mapa.setPlayer(1, 1, 0); mapa.teleportTo('puente'); });
  ok('llamadas tras dispose no fallan', true);

  // 9. layout sin ship/spawn/colores (formato corto) y validación
  const r9 = await p.evaluate(() => { const d = document.createElement('div'); document.body.appendChild(d);
    const m = init(d, { rooms: [{ id: 'pasillo', x: 0, z: 4, w: 20, d: 2 }, { id: 'a', name: 'Sala de pruebas', x: 0, z: 0, w: 6, d: 4 }], doors: [{ x: 2, z: 3.5, w: 2, d: 1, a: 'a', b: 'pasillo' }] });
    const s = m.getRoom('a').spawn; m.dispose();
    let err = ''; try { init(d, { rooms: [{ id: 'x', x: 0, z: 0 }] }); } catch (e) { err = e.message; }
    return { s, err }; });
  ok('spawn calculado dentro de la sala mirando hacia dentro', r9.s.z < 4 && r9.s.z > 0 && Math.abs(Math.abs(r9.s.yaw) - 0) < 1e-9, JSON.stringify(r9.s));
  ok('layout inválido da un error claro', /ancho y fondo/.test(r9.err), r9.err);

  // 10. datos tal como llegan del multijugador
  const r10 = await p.evaluate(() => { const d = document.createElement('div'); d.style.width = '320px'; document.body.appendChild(d);
    const m = init(d, layout); m.setPlayer(27, 18, 0);
    m.setOthers([{ id: 7, name: 'Malkev', captain: true, x: 26.5, z: 18.2, y: 0, yaw: 6.3, anim: 'walk', color: 0xffc27a }, { id: 8, name: 'Nadie', x: 16, z: 18, yaw: -0.02 }]);
    m.setRoomCounts({ biblioteca: 2, juegos: 1 }, { self: 'biblioteca' }); m.expand();
    const badges = [...d.ownerDocument.querySelectorAll('.mn-badge--on text')].map(t => t.textContent);
    const cap = document.querySelector('.mn-other--captain circle');
    const out = { badges, capFill: cap && cap.style.fill, capTitle: document.querySelector('.mn-other--captain title')?.textContent, n: document.querySelectorAll('.mn-other').length };
    m.dispose(); return out; });
  ok('recuento con self resta al jugador local', JSON.stringify(r10.badges) === '["1 visitante","1 visitante"]', JSON.stringify(r10.badges));
  ok('color numérico 0xRRGGBB, ids numéricos y capitán', r10.n === 2 && /255, 194, 122|#ffc27a/i.test(r10.capFill) && r10.capTitle === 'Malkev (capitán)', JSON.stringify(r10));

  ok('sin errores de consola', errs.length === 0, errs.join(' | '));
  for (const r of results) console.log(r.join('  '));
  console.log(results.filter(r => r[0] !== 'OK ').length + ' fallos de ' + results.length);
  await b.close();
})();
