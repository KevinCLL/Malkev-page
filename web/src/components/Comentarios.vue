<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

/**
 * Comentarios de una entrada, contra la API del catálogo (/api/v1, mismo origen:
 * en producción lo publica el proxy; en desarrollo, el proxy de Vite de astro.config).
 * Todo comentario nuevo queda pendiente hasta que el capitán lo aprueba en /admin.
 */
const props = defineProps<{ slug: string }>();

interface Comentario {
  id: number;
  parent_id: number | null;
  author: string;
  website: string | null;
  body: string;
  is_captain: boolean;
  created_at: string;
}

const base = `/api/v1/posts/${encodeURIComponent(props.slug)}/comments`;
const estado = ref<'cargando' | 'listo' | 'error'>('cargando');
const abiertos = ref(true);
const lista = ref<Comentario[]>([]);
const token = ref('');
const autor = ref('');
const texto = ref('');
const web = ref('');
const trampa = ref('');
const respondiendoA = ref<Comentario | null>(null);
const enviando = ref(false);
const aviso = ref<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

const fmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' });
/**
 * Hilos de un nivel: cada comentario cuelga de su raíz, aunque responda a una respuesta
 * (el panel deja contestar a cualquiera). Si su padre no es visible, pasa a ser raíz.
 */
const porId = computed(() => new Map(lista.value.map((c) => [c.id, c])));
function raizDe(c: Comentario): number {
  let actual = c;
  const vistos = new Set<number>();
  while (actual.parent_id && porId.value.has(actual.parent_id) && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    actual = porId.value.get(actual.parent_id)!;
  }
  return actual.id;
}
const raices = computed(() => lista.value.filter((c) => raizDe(c) === c.id));
const respuestas = (id: number) => lista.value.filter((c) => c.id !== id && raizDe(c) === id);
const webSegura = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

async function cargar() {
  try {
    const r = await fetch(base, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    lista.value = d.comments ?? [];
    token.value = d.token ?? '';
    abiertos.value = d.allow_comments !== false;
    estado.value = 'listo';
  } catch {
    estado.value = 'error';
  }
}

async function enviar() {
  if (enviando.value) return;
  enviando.value = true;
  aviso.value = null;
  try {
    const r = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        author: autor.value.trim(),
        body: texto.value.trim(),
        website: web.value.trim() || undefined,
        parent_id: respondiendoA.value?.id ?? null,
        token: token.value,
        url_trampa: trampa.value,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? 'No se ha podido enviar el comentario.');
    aviso.value = { tipo: 'ok', texto: d.message ?? 'Recibido. Aparecerá cuando el capitán lo apruebe.' };
    texto.value = '';
    respondiendoA.value = null;
  } catch (e) {
    aviso.value = { tipo: 'error', texto: (e as Error).message };
  } finally {
    enviando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <section class="comentarios" aria-labelledby="t-comentarios">
    <h2 id="t-comentarios" class="etiqueta">Transmisiones de la tripulación</h2>
    <p v-if="estado === 'cargando'" class="tenue">Sintonizando…</p>
    <p v-else-if="estado === 'error'" class="tenue">Los comentarios no están disponibles ahora mismo.</p>
    <template v-else>
      <p v-if="!lista.length" class="tenue">Aún no hay comentarios.</p>
      <ol class="hilo">
        <li v-for="c in raices" :key="c.id">
          <article class="comentario" :class="{ capitan: c.is_captain }">
            <header>
              <a v-if="webSegura(c.website)" :href="webSegura(c.website)!" rel="nofollow ugc noopener" target="_blank">{{ c.author }}</a>
              <strong v-else>{{ c.author }}</strong>
              <span v-if="c.is_captain" class="insignia">capitán</span>
              <time :datetime="c.created_at">{{ fmt.format(new Date(c.created_at)) }}</time>
            </header>
            <p class="cuerpo">{{ c.body }}</p>
            <button v-if="abiertos" type="button" class="responder" @click="respondiendoA = c">Responder</button>
          </article>
          <ol v-if="respuestas(c.id).length" class="hilo respuestas">
            <li v-for="r in respuestas(c.id)" :key="r.id">
              <article class="comentario" :class="{ capitan: r.is_captain }">
                <header>
                  <a v-if="webSegura(r.website)" :href="webSegura(r.website)!" rel="nofollow ugc noopener" target="_blank">{{ r.author }}</a>
                  <strong v-else>{{ r.author }}</strong>
                  <span v-if="r.is_captain" class="insignia">capitán</span>
                  <time :datetime="r.created_at">{{ fmt.format(new Date(r.created_at)) }}</time>
                </header>
                <p class="cuerpo">{{ r.body }}</p>
              </article>
            </li>
          </ol>
        </li>
      </ol>

      <form v-if="abiertos" class="formulario panel" @submit.prevent="enviar">
        <p v-if="respondiendoA" class="respondiendo">
          Respondiendo a <strong>{{ respondiendoA.author }}</strong>
          <button type="button" @click="respondiendoA = null">cancelar</button>
        </p>
        <label><span>Nombre</span><input v-model="autor" required maxlength="80" autocomplete="name" /></label>
        <label><span>Web <span class="tenue">(opcional)</span></span><input v-model="web" type="url" maxlength="200" autocomplete="url" /></label>
        <label class="trampa" aria-hidden="true">No rellenar<input v-model="trampa" tabindex="-1" autocomplete="off" /></label>
        <label><span>Comentario</span><textarea v-model="texto" required maxlength="5000" rows="4"></textarea></label>
        <div class="acciones">
          <button type="submit" :disabled="enviando">{{ enviando ? 'Transmitiendo…' : 'Enviar' }}</button>
          <p v-if="aviso" :class="['aviso', aviso.tipo]" role="status">{{ aviso.texto }}</p>
        </div>
      </form>
      <p v-else class="tenue">Los comentarios de esta entrada están cerrados.</p>
    </template>
  </section>
</template>

<style scoped>
.comentarios { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--line); }
.tenue { color: var(--muted); }
.hilo { list-style: none; padding: 0; margin: 12px 0; display: grid; gap: 12px; }
.respuestas { margin: 10px 0 0 20px; padding-left: 14px; border-left: 2px solid var(--line); }
.comentario header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.comentario time { color: var(--muted); font: 12px var(--f-mono); }
.comentario.capitan strong { color: var(--glow); }
.insignia { font: 600 10px var(--f-mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--glow); border: 1px solid currentColor; border-radius: 99px; padding: 1px 7px; }
.cuerpo { margin: 4px 0; white-space: pre-line; overflow-wrap: anywhere; }
button { font: 600 13px var(--f-body); cursor: pointer; border-radius: 8px; }
.responder, .respondiendo button { background: none; border: 0; color: var(--accent); padding: 0; }
.formulario { display: grid; gap: 12px; padding: 16px; margin-top: 20px; }
label { display: grid; gap: 4px; font-size: 14px; color: var(--muted); }
input, textarea { font: 15px var(--f-body); color: var(--text); background: rgba(7, 5, 15, 0.6); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
textarea { resize: vertical; }
.trampa { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.acciones button { background: var(--accent); color: #140c26; border: 0; padding: 9px 18px; }
.acciones button:disabled { opacity: 0.6; cursor: progress; }
.aviso { margin: 0; font-size: 14px; }
.aviso.ok { color: #9ff0c4; }
.aviso.error { color: #ffb3c1; }
</style>
