// Estado de la sesión de la consola, compartido por toda la app. Lo rellena api.auth() y lo vacía
// cualquier respuesta 401 del servidor (sesión caducada o cerrada en otro sitio).
import { reactive } from 'vue'

export const auth = reactive({
  loaded: false,
  configured: false,
  authenticated: false,
})

export function setAuth(state) {
  auth.loaded = true
  auth.configured = !!state.configured
  auth.authenticated = !!state.authenticated
}
