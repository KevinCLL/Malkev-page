// Cliente con un WebSocket falso: comprobamos lo que envía y cómo interpreta lo que recibe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../client/multijugador.js';

class FakeWS {
  static last = null;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeWS.last = this;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(s) { this.sent.push(JSON.parse(s)); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  sentOf(t) { return this.sent.filter((m) => m.t === t); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function online(opts = {}, welcome = {}) {
  const c = connect('ws://x', 'Ana', { WebSocket: FakeWS, reconnect: false, interpDelay: 0, ...opts });
  await tick();
  const ws = FakeWS.last;
  ws.recv({ t: 'welcome', v: 1, id: 1, name: 'Ana', room: 'puente', tickHz: 10, rooms: { puente: 1 }, ...welcome });
  return { c, ws };
}

test('saluda con nombre, sala y clave', async () => {
  const { c, ws } = await online({ key: 'secreta', room: 'puente' });
  assert.deepEqual(ws.sent[0], { t: 'hello', v: 1, name: 'Ana', room: 'puente', key: 'secreta' });
  assert.equal(c.status, 'online');
  c.dispose();
});

test('no envía poses con NaN y limita las repetidas', async () => {
  const { c, ws } = await online();
  c.sendPose({ x: NaN, z: 1 });
  assert.equal(ws.sentOf('pose').length, 0);
  c.sendPose({ x: 1, z: 2, yaw: 7, anim: 'walk' });
  assert.deepEqual(ws.sentOf('pose')[0], { t: 'pose', p: [1, 0, 2], r: 0.72, a: 'walk' });
  c.sendPose({ x: 1, z: 2, yaw: 7, anim: 'walk' });
  c.sendPose({ x: 1, z: 2, yaw: 7, anim: 'walk' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(ws.sentOf('pose').length, 1);
  c.dispose();
});

test('cambiar a la misma sala no hace nada; si el servidor la rechaza, vuelve', async () => {
  const { c, ws } = await online();
  const errors = [];
  c.onError((e) => errors.push(e));
  c.setRoom('puente');
  assert.equal(ws.sentOf('room').length, 0);
  c.setRoom('Sala de cine');
  assert.equal(ws.sentOf('room').length, 1);
  assert.equal(c.room, 'Sala de cine');
  ws.recv({ t: 'error', code: 'room', room: 'puente' });
  assert.equal(c.room, 'puente');
  assert.deepEqual(errors, ['room']);
  c.dispose();
});

test('si el servidor nos pone en otra sala, pide la que queríamos', async () => {
  const { c, ws } = await online({ room: 'biblioteca' }, { room: 'puente' });
  assert.deepEqual(ws.sentOf('room'), [{ t: 'room', room: 'biblioteca' }]);
  c.dispose();
});

test('instantánea parcial: quien no aparece sigue quieto donde estaba', async () => {
  const { c, ws } = await online();
  let roster = [];
  c.onPlayers((l) => { roster = l; });
  ws.recv({ t: 'roster', room: 'puente', players: [{ i: 1, n: 'Ana' }, { i: 2, n: 'Bea' }, { i: 3, n: 'Malkev', c: 1 }] });
  assert.deepEqual(roster.map((p) => [p.name, p.captain]), [['Bea', false], ['Malkev', true]]);
  ws.recv({ t: 'snap', ts: 1000, room: 'puente', full: 1, players: [[1, 0, 0, 0, 0, 'idle'], [2, 0, 0, 0, 0, 'idle'], [3, 5, 0, 5, 1, 'idle']] });
  ws.recv({ t: 'snap', ts: 1100, room: 'puente', players: [[2, 1, 0, 0, 0, 'walk']] });
  ws.recv({ t: 'snap', ts: 1200, room: 'puente', players: [[2, 2, 0, 0, 0, 'walk']] });
  ws.recv({ t: 'snap', ts: 1300, room: 'puente', players: [[2, 2, 0, 0, 0, 'idle']] });
  const s = c.sample();
  const bea = s.find((p) => p.id === 2);
  const cap = s.find((p) => p.id === 3);
  assert.ok(Math.abs(bea.x - 2) < 1e-9, `Bea quieta en x=2, está en ${bea.x}`);
  assert.equal(cap.x, 5);
  assert.equal(cap.captain, true);
  assert.equal(s.some((p) => p.id === 1), false); // yo no salgo
  c.dispose();
});

test('ignora mensajes rotos sin romperse', async () => {
  const { c, ws } = await online();
  ws.onmessage({ data: 'null' });
  ws.onmessage({ data: '{"t":"roster","room":"puente","players":7}' });
  ws.onmessage({ data: '{"t":"snap","room":"puente","ts":5,"players":[null,[2,"x"]]}' });
  ws.onmessage({ data: 'no es json' });
  assert.deepEqual(c.sample(), []);
  c.dispose();
});
