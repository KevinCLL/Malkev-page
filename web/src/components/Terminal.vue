<script setup lang="ts">
import { nextTick, ref } from 'vue';

interface Destino { slug: string; ruta: string; nombre: string }
interface Entrada { slug: string; titulo: string; ruta: string }
const props = defineProps<{
  salas: Destino[];
  entradas: Entrada[];
  /** Traducciones (español → idioma de la página) del espacio "terminal" de modulos/i18n/textos.json. */
  textos?: Record<string, string>;
}>();
const t = (es: string, vars: Record<string, string> = {}) =>
  (props.textos?.[es] ?? es).replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

const lineas = ref<string[]>([
  t('MALKEVNIA OS v0.1 · ordenador de a bordo'),
  t('Escribe «ayuda» para ver los comandos.'),
]);
const orden = ref('');
const pantalla = ref<HTMLElement | null>(null);

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cada comando en los dos idiomas: se entiende el que escribas. */
const COMANDOS: Record<string, string> = {
  ayuda: 'ayuda', help: 'ayuda',
  salas: 'salas', rooms: 'salas',
  ir: 'ir', go: 'ir',
  bitacora: 'bitacora', log: 'bitacora',
  buscar: 'buscar', search: 'buscar',
  limpiar: 'limpiar', clear: 'limpiar',
};

function ejecutar() {
  const txt = orden.value.trim();
  orden.value = '';
  if (!txt) return;
  lineas.value.push(`> ${txt}`);
  const [cmd, ...resto] = txt.split(/\s+/);
  const arg = normal(resto.join(' '));
  switch (COMANDOS[normal(cmd)]) {
    case 'ayuda':
      lineas.value.push(t('salas · ir <sala> · buscar <texto> · bitacora · limpiar'));
      break;
    case 'salas':
      props.salas.forEach((s) => lineas.value.push(`  ${s.slug.padEnd(20)} ${s.nombre}`));
      break;
    case 'ir': {
      const d = props.salas.find((s) => s.slug === arg || normal(s.nombre).includes(arg));
      if (d && arg) {
        lineas.value.push(t('Rumbo a {sala}…', { sala: d.nombre }));
        window.location.href = d.ruta;
      } else lineas.value.push(t('No conozco esa sala. Prueba «salas».'));
      break;
    }
    case 'bitacora':
      props.entradas.slice(0, 5).forEach((e) => lineas.value.push(`  ${e.titulo}`));
      lineas.value.push(t('Abre una con «buscar <texto>».'));
      break;
    case 'buscar': {
      const r = props.entradas.filter((e) => normal(e.titulo).includes(arg)).slice(0, 8);
      if (!arg || !r.length) lineas.value.push(t('Sin resultados.'));
      else if (r.length === 1) {
        lineas.value.push(t('Abriendo «{titulo}»…', { titulo: r[0].titulo }));
        window.location.href = r[0].ruta;
      } else r.forEach((e) => lineas.value.push(`  ${e.titulo}`));
      break;
    }
    case 'limpiar':
      lineas.value = [];
      break;
    default:
      lineas.value.push(t('Comando desconocido: {comando}', { comando: cmd }));
  }
  nextTick(() => pantalla.value?.scrollTo({ top: pantalla.value.scrollHeight }));
}
</script>

<template>
  <div class="terminal panel">
    <div ref="pantalla" class="pantalla" role="log" aria-live="polite">
      <p v-for="(l, i) in lineas" :key="i">{{ l }}</p>
    </div>
    <form @submit.prevent="ejecutar">
      <label for="orden" class="prompt">{{ t('capitán@malkevnia:~$') }}</label>
      <input id="orden" v-model="orden" autocomplete="off" spellcheck="false" autofocus />
    </form>
  </div>
</template>

<style scoped>
.terminal { font: 14px/1.6 var(--f-mono); padding: 16px; }
.pantalla { height: min(50vh, 420px); overflow-y: auto; color: #c9f5ff; }
.pantalla p { margin: 0; white-space: pre-wrap; }
form { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; margin-top: 10px; }
.prompt { color: var(--accent); white-space: nowrap; }
input { flex: 1; min-width: 0; background: transparent; border: 0; color: var(--text); font: inherit; outline: none; }
</style>
