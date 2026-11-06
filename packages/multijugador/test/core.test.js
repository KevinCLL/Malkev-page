import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, sanitizeName, sanitizeRoom, CLOSE } from '../src/core.js';

function fakeConn() {
  const c = { out: [], closed: null };
  c.send = (s) => c.out.push(JSON.parse(s));
  c.close = (code, reason) => { c.closed = { code, reason }; };
  c.last = (t) => [...c.out].reverse().find((m) => m.t === t);
  return c;
}

test('sanea nombres y salas', () => {
  assert.equal(sanitizeName('  Malkev\u0000  el\n capitán '), 'Malkev el capitán');
  assert.equal(sanitizeName('x'.repeat(50)).length, 20);
  assert.equal(sanitizeName('‮evil'), 'evil');
  assert.equal(sanitizeName(''), null);
  assert.equal(sanitizeName(42), null);
  assert.equal(sanitizeRoom('Biblioteca'), 'biblioteca');
  assert.equal(sanitizeRoom('sala de cine'), null);
  assert.equal(sanitizeRoom('../etc'), null);
});

test('hello, roster, snap y recuentos', () => {
  const hub = createHub();
  const a = fakeConn(); const b = fakeConn();
  const { id: ia } = hub.join({ ip: '1', ...a, now: 0 });
  const { id: ib } = hub.join({ ip: '2', ...b, now: 0 });
  hub.message(ia, JSON.stringify({ t: 'hello', v: 1, name: 'Ana', room: 'puente' }), 0);
  hub.message(ib, JSON.stringify({ t: 'hello', v: 1, name: 'Bea', room: 'puente' }), 0);
  assert.equal(a.last('welcome').id, ia);
  hub.message(ia, JSON.stringify({ t: 'pose', p: [1, 0, 2.3456], r: 7, a: 'walk' }), 10);
  hub.tick(100);
  const roster = b.last('roster');
  assert.deepEqual(roster.players.map((p) => p.n).sort(), ['Ana', 'Bea']);
  const snap = b.last('snap');
  const ana = snap.players.find((p) => p[0] === ia);
  assert.deepEqual(ana.slice(1, 4), [1, 0, 2.35]);
  assert.ok(ana[4] < Math.PI * 2);
  assert.equal(ana[5], 'walk');
  assert.deepEqual(b.last('rooms').counts, { puente: 2 });
});

test('las salas separan a los visitantes', () => {
  const hub = createHub();
  const a = fakeConn(); const b = fakeConn();
  const { id: ia } = hub.join({ ip: '1', ...a });
  const { id: ib } = hub.join({ ip: '2', ...b });
  hub.message(ia, JSON.stringify({ t: 'hello', name: 'Ana', room: 'puente' }));
  hub.message(ib, JSON.stringify({ t: 'hello', name: 'Bea', room: 'biblioteca' }));
  hub.tick();
  b.out.length = 0;
  hub.message(ia, JSON.stringify({ t: 'pose', p: [5, 0, 5], r: 0 }));
  hub.tick();
  assert.ok(!b.out.some((m) => m.t === 'snap' && m.players.some((q) => q[0] === ia)));
  hub.message(ib, JSON.stringify({ t: 'room', room: 'puente' }));
  hub.tick();
  assert.equal(b.last('room').room, 'puente');
  assert.equal(b.last('roster').players.length, 2);
});

test('límites: sala llena, IP y conexiones por minuto', () => {
  const hub = createHub({ maxPlayers: 2, maxPerIp: 1, connectsPerMinute: 3 });
  assert.ok(hub.join({ ip: 'a', ...fakeConn(), now: 0 }).id);
  assert.equal(hub.join({ ip: 'a', ...fakeConn(), now: 0 }).code, CLOSE.TOO_MANY_FROM_IP);
  assert.ok(hub.join({ ip: 'b', ...fakeConn(), now: 0 }).id);
  assert.equal(hub.join({ ip: 'c', ...fakeConn(), now: 0 }).code, CLOSE.FULL);
  const h2 = createHub({ connectsPerMinute: 2 });
  const x = h2.join({ ip: 'z', ...fakeConn(), now: 0 }); h2.leave(x.id);
  const y = h2.join({ ip: 'z', ...fakeConn(), now: 1 }); h2.leave(y.id);
  assert.equal(h2.join({ ip: 'z', ...fakeConn(), now: 2 }).code, CLOSE.RATE_LIMIT);
  assert.ok(h2.join({ ip: 'z', ...fakeConn(), now: 61000 }).id);
});

test('expulsa a quien inunda de mensajes o manda basura', () => {
  const hub = createHub({ msgRate: 10, msgBurst: 10, maxStrikes: 5 });
  const a = fakeConn();
  const { id } = hub.join({ ip: '1', ...a, now: 0 });
  hub.message(id, JSON.stringify({ t: 'hello', name: 'Spam' }), 0);
  for (let i = 0; i < 30; i++) hub.message(id, JSON.stringify({ t: 'pose', p: [0, 0, 0], r: 0 }), 0);
  assert.equal(a.closed.code, CLOSE.RATE_LIMIT);
  assert.equal(hub.stats().players, 0);

  const b = fakeConn();
  const hub2 = createHub({ maxStrikes: 2 });
  const { id: ib2 } = hub2.join({ ip: '1', ...b });
  hub2.message(ib2, JSON.stringify({ t: 'hello' }));
  hub2.message(ib2, '{nope');
  hub2.message(ib2, JSON.stringify({ t: 'pose', p: [NaN, 0, 0], r: 0 }));
  hub2.message(ib2, JSON.stringify({ t: 'pose', p: [1e9, 0], r: 0 }));
  assert.equal(b.closed.code, CLOSE.RATE_LIMIT);
});

test('limita coordenadas y echa a los inactivos', () => {
  const hub = createHub({ bounds: 50, idleMs: 1000 });
  const a = fakeConn();
  const { id } = hub.join({ ip: '1', ...a, now: 0 });
  hub.message(id, JSON.stringify({ t: 'hello', name: 'Lejos' }), 0);
  hub.message(id, JSON.stringify({ t: 'pose', p: [999, -999, 3], r: -1 }), 0);
  hub.tick(10);
  const me = a.last('snap').players[0];
  assert.deepEqual(me.slice(1, 4), [50, -50, 3]);
  assert.ok(me[4] > 0);
  hub.tick(5000);
  assert.equal(a.closed.code, CLOSE.IDLE);
});

test('una instantánea extra al pararse', () => {
  const hub = createHub();
  const a = fakeConn();
  const { id } = hub.join({ ip: '1', ...a });
  hub.message(id, JSON.stringify({ t: 'hello', name: 'A' }));
  hub.tick(0);
  hub.message(id, JSON.stringify({ t: 'pose', p: [1, 0, 0], r: 0 }));
  hub.tick(100);
  hub.tick(200);
  hub.tick(300);
  const snaps = a.out.filter((m) => m.t === 'snap').map((m) => m.ts);
  assert.deepEqual(snaps, [0, 100, 200]);
});

function hubWith(opts = {}) {
  const hub = createHub(opts);
  const add = (name, room = 'puente', extra = {}) => {
    const c = fakeConn();
    const { id } = hub.join({ ip: String(Math.random()), ...c, now: 0 });
    hub.message(id, JSON.stringify({ t: 'hello', name, room, ...extra }), 0);
    return { id, c };
  };
  return { hub, add };
}

test('instantáneas parciales: solo va quien se mueve', () => {
  const { hub, add } = hubWith();
  const a = add('Ana'); const b = add('Bea');
  hub.tick(0);
  const first = a.c.last('snap');
  assert.equal(first.full, 1);
  assert.equal(first.players.length, 2);
  hub.message(a.id, JSON.stringify({ t: 'pose', p: [2, 0, 0], r: 0, a: 'walk' }), 50);
  hub.tick(100);
  const delta = b.c.last('snap');
  assert.equal(delta.full, undefined);
  assert.deepEqual(delta.players.map((p) => p[0]), [a.id]);
  // repetir la misma pose (señal de vida) no genera más instantáneas
  hub.tick(200); // la del alto
  const n = b.c.out.filter((m) => m.t === 'snap').length;
  hub.message(a.id, JSON.stringify({ t: 'pose', p: [2, 0, 0], r: 0, a: 'walk' }), 250);
  hub.tick(300);
  assert.equal(b.c.out.filter((m) => m.t === 'snap').length, n);
});

test('un segundo hello es una falta y no cambia nada', () => {
  const { hub, add } = hubWith({ maxStrikes: 0 });
  const a = add('Ana');
  hub.message(a.id, JSON.stringify({ t: 'hello', name: 'Otra' }), 1);
  assert.equal(a.c.closed.code, CLOSE.RATE_LIMIT);
});

test('sala rechazada: error con la sala buena y lista reenviada', () => {
  const { hub, add } = hubWith();
  const a = add('Ana');
  hub.tick(0);
  a.c.out.length = 0;
  hub.message(a.id, JSON.stringify({ t: 'room', room: 'Sala de cine' }), 10);
  assert.deepEqual(a.c.last('error'), { t: 'error', code: 'room', room: 'puente' });
  hub.tick(100);
  assert.equal(a.c.last('roster').room, 'puente');
  assert.equal(a.c.last('snap').full, 1);
});

test('nombres reservados solo con la clave de capitán', () => {
  const key = 'k'.repeat(32);
  const { hub, add } = hubWith({ reservedNames: ['Malkev'], captainKey: key });
  const fake = add('Ma1kev');
  assert.match(fake.c.last('welcome').name, /^Viajero-/);
  assert.equal(fake.c.last('error').code, 'name');
  const cyr = add('Маlkev el capi');
  assert.match(cyr.c.last('welcome').name, /^Viajero-/);
  const wrong = add('Malkev', 'puente', { key: 'x'.repeat(32) });
  assert.match(wrong.c.last('welcome').name, /^Viajero-/);
  assert.equal(wrong.c.last('welcome').captain, undefined);
  const real = add('Malkev', 'puente', { key });
  assert.equal(real.c.last('welcome').name, 'Malkev');
  assert.equal(real.c.last('welcome').captain, true);
  const other = add('Ana');
  assert.equal(other.c.last('welcome').name, 'Ana');
  hub.tick(0);
  const cap = other.c.last('roster').players.find((p) => p.i === real.id);
  assert.equal(cap.c, 1);
});

test('sin clave configurada nadie usa los nombres reservados', () => {
  const { add } = hubWith({ reservedNames: ['Malkev'] });
  assert.match(add('Malkev', 'puente', { key: '' }).c.last('welcome').name, /^Viajero-/);
});

test('las faltas se olvidan con el tiempo', () => {
  const hub = createHub({ maxStrikes: 3 });
  const a = fakeConn();
  const { id } = hub.join({ ip: '1', ...a, now: 0 });
  hub.message(id, JSON.stringify({ t: 'hello', name: 'A' }), 0);
  for (let i = 1; i <= 20; i++) hub.message(id, 'basura', i * 2000);
  assert.equal(a.closed, null);
  for (let i = 0; i < 5; i++) hub.message(id, 'basura', 50000);
  assert.equal(a.closed.code, CLOSE.RATE_LIMIT);
});
