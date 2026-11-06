import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generarSql, lit } from '../lib/sql.js'
import { crearFicha } from '../lib/modelo.js'

test('literales SQL escapados', () => {
  assert.equal(lit("L'Odyssée"), "'L''Odyssée'")
  assert.equal(lit(null), 'NULL')
  assert.equal(lit(true), 'true')
  assert.equal(lit('a\u0000b'), "'ab'")
})

test('el SQL es una transacción con upsert por (kind, slug)', () => {
  const sql = generarSql([crearFicha({ kind: 'film', title: "Ocean's Eleven", year: 2001, rating: 7, external_ids: { tmdb: 161 } })])
  assert.match(sql, /^BEGIN;$/m)
  assert.match(sql, /^COMMIT;$/m)
  assert.match(sql, /ON CONFLICT \(kind, slug\) DO NOTHING/)
  assert.match(sql, /'Ocean''s Eleven'/)
  assert.match(sql, /'\{"tmdb":161\}'::jsonb/)
  assert.doesNotMatch(generarSql([], {}), /INSERT INTO importacion/)
})
