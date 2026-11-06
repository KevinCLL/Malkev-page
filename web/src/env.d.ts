declare namespace App {
  interface Locals {
    /** Idioma de la página: 'es' (por defecto) o 'en' (rutas /en/…). Lo pone src/middleware/idioma.ts. */
    idioma: import('./i18n').Idioma;
  }
}

interface ImportMetaEnv {
  /** Versión del build (fecha o commit): renueva las cachés del service worker en cada despliegue. */
  readonly VERSION_NAVE: string;
}
