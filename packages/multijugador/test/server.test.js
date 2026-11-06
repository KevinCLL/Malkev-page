// Prueba de extremo a extremo: servidor real + dos clientes reales (WebSocket nativo de Node 22).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.js';
import { connect } from '../client/multijugador.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
  throw new Error('timeout');
}

test('dos visitantes se ven, se mueven y cambian de sala', async () => {
  const srv = startServer({ port: 0, host: '127.0.0.1', quiet: true, allowedOrigins: [] });
  const port = await srv.ready;
  const url = `ws://127.0.0.1:${port}/ws`;
  const a = connect(url, 'Ana', { room: 'puente', reconnect: false, interpDelay: 0 });
  const b = connect(url, 'Bea', { room: 'puente', reconnect: false, interpDelay: 0 });
  try {
    let rosterB = [];
    b.onPlayers((l) => { rosterB = l; });
    let roomsB = {};
    b.onRooms((c) => { roomsB = c; });
    await until(() => a.status === 'online' && b.status === 'online');
    await until(() => rosterB.some((p) => p.name === 'Ana'));
    await until(() => roomsB.puente === 2);

    for (let i = 1; i <= 5; i++) { a.sendPose({ x: i, y: 0, z: -i, yaw: 1, anim: 'walk' }); await wait(80); }
    const seen = await until(() => b.sample().find((p) => p.name === 'Ana' && p.x > 2));
    assert.ok(seen.z < 0);
    assert.equal(seen.anim, 'walk');

    const stats = await (await fetch(`http://127.0.0.1:${port}/stats`)).json();
    assert.equal(stats.players, 2);

    a.setRoom('biblioteca');
    await until(() => rosterB.length === 0);
    await until(() => roomsB.biblioteca === 1 && roomsB.puente === 1);
  } finally {
    a.dispose(); b.dispose();
    await srv.close();
  }
});

test('rechaza orígenes no permitidos', async () => {
  const srv = startServer({ port: 0, host: '127.0.0.1', quiet: true, allowedOrigins: ['https://malkevnia.com'] });
  const port = await srv.ready;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(await res.text(), 'ok');
  // El WebSocket de Node no envía Origin, así que la conexión debe fallar
  const c = connect(`ws://127.0.0.1:${port}/ws`, 'Intruso', { reconnect: false });
  await until(() => c.status === 'closed');
  c.dispose();
  await srv.close();
});

test('IP del cliente: última de X-Forwarded-For y IPv6 por /64', async () => {
  const { clientIp, ipKey } = await import('../src/server.js');
  const req = (xff, remote = '127.0.0.1') => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: remote } });
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4'), true), '1.2.3.4');
  assert.equal(clientIp(req('6.6.6.6'), false), '127.0.0.1');
  assert.equal(clientIp(req(null, '::ffff:10.0.0.7'), true), '10.0.0.7');
  assert.equal(ipKey('2001:db8:abcd:12:1:2:3:4'), ipKey('2001:db8:abcd:12:ffff::9'));
  assert.notEqual(ipKey('2001:db8:abcd:12::1'), ipKey('2001:db8:abcd:13::1'));
});

test('la clave de capitán corta se rechaza al arrancar', async () => {
  assert.throws(() => startServer({ port: 0, quiet: true, hub: { captainKey: 'corta' } }), /24 caracteres/);
});
