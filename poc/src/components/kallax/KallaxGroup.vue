<script setup>
// Un grupo de cajas: una pila, una fila de pie, varios grupos con algo tumbado encima, una caja de frente
// o una decoración. Se llama a sí mismo para lo que va encima de cada pila.
import KallaxBox from './KallaxBox.vue'
import KallaxDeco from './KallaxDeco.vue'

defineOptions({ name: 'KallaxGroup' })
defineProps({
  group: { type: Object, required: true },
  items: { type: Map, required: true },
  mark: { type: Function, required: true },
  interactive: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])
const pick = (item) => emit('pick', item)
</script>

<template>
  <div v-if="group.type === 'stack'" class="g stack">
    <template v-for="(e, i) in group.items" :key="i">
      <KallaxDeco v-if="e.deco" :deco="e" />
      <KallaxBox v-else-if="items.has(e.id)" :entry="e" :item="items.get(e.id)" :state="mark(items.get(e.id))" :interactive="interactive" @pick="pick" />
    </template>
    <div v-if="group.above?.length" class="side-by-side">
      <KallaxGroup v-for="(a, i) in group.above" :key="i" :group="a" :items="items" :mark="mark" :interactive="interactive" @pick="pick" />
    </div>
  </div>

  <div v-else-if="group.type === 'row'" class="g">
    <div class="standing">
      <template v-for="(e, i) in group.items" :key="i">
        <KallaxDeco v-if="e.deco" :deco="e" />
        <KallaxBox v-else-if="items.has(e.id)" :entry="e" :item="items.get(e.id)" how="upright" :state="mark(items.get(e.id))" :interactive="interactive" @pick="pick" />
      </template>
    </div>
    <template v-for="(e, i) in group.on || []" :key="`on${i}`">
      <KallaxBox v-if="items.has(e.id)" :entry="e" :item="items.get(e.id)" :state="mark(items.get(e.id))" :interactive="interactive" @pick="pick" />
    </template>
  </div>

  <div v-else-if="group.type === 'bridge'" class="g">
    <div class="side-by-side">
      <KallaxGroup v-for="(p, i) in group.groups" :key="i" :group="p" :items="items" :mark="mark" :interactive="interactive" @pick="pick" />
    </div>
    <template v-for="(e, i) in group.on || []" :key="`on${i}`">
      <KallaxBox v-if="items.has(e.id)" :entry="e" :item="items.get(e.id)" :state="mark(items.get(e.id))" :interactive="interactive" @pick="pick" />
    </template>
  </div>

  <KallaxBox
    v-else-if="group.type === 'face' && items.has(group.items[0].id)"
    :entry="group.items[0]"
    :item="items.get(group.items[0].id)"
    how="face"
    :state="mark(items.get(group.items[0].id))"
    :interactive="interactive"
    @pick="pick"
  />

  <KallaxDeco v-else-if="group.type === 'deco'" :deco="group.items[0]" />
</template>

<style scoped>
.g {
  flex: none;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
}
.side-by-side,
.standing {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.side-by-side {
  gap: calc(var(--u) * 0.02);
}
</style>
