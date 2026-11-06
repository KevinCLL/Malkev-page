<script setup lang="ts">
import { nextTick, ref } from 'vue';

interface Destino { slug: string; ruta: string; nombre: string }
interface Entrada { slug: string; titulo: string }
const props = defineProps<{ salas: Destino[]; entradas: Entrada[] }>();

const lineas = ref<string[]>([
  'MALKEVNIA OS v0.1 · ordenador de a bordo',
  'Escribe «ayuda» para ver los comandos.',
]);
const orden = ref('');
const pantalla = ref<HTMLElement | null>(null);

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ejecutar() {
  const txt = orden.value.trim();
  orden.value = '';
  if (!txt) return;
  lineas.value.push(`> ${txt}`);
  const [cmd, ...resto] = txt.split(/\s+/);
  const arg = normal(resto.join(' '));
  switch (normal(cmd)) {
    case 'ayuda':
      lineas.value.push('salas · ir <sala> · buscar <texto> · bitacora · limpiar');
      break;
    case 'salas':
      props.salas.forEach((s) => lineas.value.push(`  ${s.slug.padEnd(20)} ${s.nombre}`));
      break;
    case 'ir': {
      const d = props.salas.find((s) => s.slug === arg || normal(s.nombre).includes(arg));
      if (d && arg) {
        lineas.value.push(`Rumbo a ${d.nombre}…`);
        window.location.href = d.ruta;
      } else lineas.value.push('No conozco esa sala. Prueba «salas».');
      break;
    }
    case 'bitacora':
      props.entradas.slice(0, 5).forEach((e) => lineas.value.push(`  ${e.titulo}`));
      lineas.value.push('Abre una con «buscar <texto>».');
      break;
    case 'buscar': {
      const r = props.entradas.filter((e) => normal(e.titulo).includes(arg)).slice(0, 8);
      if (!arg || !r.length) lineas.value.push('Sin resultados.');
      else if (r.length === 1) {
        lineas.value.push(`Abriendo «${r[0].titulo}»…`);
        window.location.href = `/bitacora/${r[0].slug}`;
      } else r.forEach((e) => lineas.value.push(`  ${e.titulo}`));
      break;
    }
    case 'limpiar':
      lineas.value = [];
      break;
    default:
      lineas.value.push(`Comando desconocido: ${cmd}`);
  }
  nextTick(() => pantalla.value?.scrollTo({ top: pantalla.value.scrollHeight }));
}
</script>

<template>
  <div class="terminal panel">
    <div ref="pantalla" class="pantalla" aria-live="polite">
      <p v-for="(l, i) in lineas" :key="i">{{ l }}</p>
    </div>
    <form @submit.prevent="ejecutar">
      <label for="orden" class="prompt">capitán@malkevnia:~$</label>
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
