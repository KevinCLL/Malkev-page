<script setup>
// Pantalla de entrada a la consola. La primera vez no hay contraseña y aquí mismo se crea.
import { ref } from 'vue'
import { api } from '../../api.js'
import { auth, setAuth } from '../../auth.js'
import AppIcon from '../../components/AppIcon.vue'

const password = ref('')
const again = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (!auth.configured && password.value !== again.value) {
    error.value = 'Las dos contraseñas no coinciden.'
    return
  }
  busy.value = true
  try {
    setAuth(auth.configured ? await api.login(password.value) : await api.setup(password.value))
    password.value = ''
    again.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page login-page">
    <form class="login panel" @submit.prevent="submit">
      <span class="lock"><AppIcon name="lock" :size="26" /></span>
      <p class="eyebrow">Consola de mando</p>
      <template v-if="auth.configured">
        <h1 class="login-title">Identifícate, capitán</h1>
        <p class="muted">La consola es solo para quien pilota la nave.</p>
      </template>
      <template v-else>
        <h1 class="login-title">Primer acceso</h1>
        <p class="muted">La consola todavía no tiene contraseña. Elige una (8 caracteres como mínimo): será la que te pida a partir de ahora.</p>
      </template>
      <label class="field">
        <span>Contraseña</span>
        <input v-model="password" class="input" type="password" minlength="8" required autocomplete="current-password" autofocus />
      </label>
      <label v-if="!auth.configured" class="field">
        <span>Repítela</span>
        <input v-model="again" class="input" type="password" minlength="8" required autocomplete="new-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn btn-primary" :disabled="busy">
        <AppIcon name="arrow-right" :size="16" /> {{ busy ? 'Un momento…' : auth.configured ? 'Entrar' : 'Crear y entrar' }}
      </button>
      <p v-if="auth.configured" class="hint">¿Olvidada? Desde el terminal: <code>npm run consola:clave</code></p>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  min-height: 70vh;
}
.login {
  width: min(420px, 100%);
  padding: 36px 32px;
  display: grid;
  gap: 14px;
  justify-items: start;
}
.lock {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  color: var(--violet);
  background: rgba(161, 132, 255, 0.12);
  border: 1px solid rgba(161, 132, 255, 0.35);
  margin-bottom: 6px;
}
.login .eyebrow {
  margin: 0;
}
.login-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 0;
}
.login .muted {
  margin: 0;
  font-size: 15px;
}
.field {
  width: 100%;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}
.hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
}
code {
  font-family: var(--font-mono);
  color: var(--text-soft);
}
</style>
