/**
 * Solo afecta a `npm run dev`.
 *
 * Las URL /modulos/… coinciden con la carpeta web/modulos/ del proyecto y el servidor de
 * desarrollo las intercepta antes de que lleguen al endpoint que las sirve:
 * - Vite transforma los .js como si fueran código de la web (y falla con `import 'three'`,
 *   que en los módulos resuelve el import map del navegador).
 * - Astro tiene un guardián que responde 404 a las peticiones de página (Accept: text/html,
 *   justo lo que manda un iframe) de ficheros que están fuera de src/ y public/.
 *
 * Aquí se reescriben a /modulos-dev/…, que no existe en disco, para que lleguen intactas al
 * mismo endpoint que en producción (src/pages/modulos/[...ruta].ts, re-exportado en
 * src/pages/modulos-dev/). El navegador sigue viendo /modulos/…, así que las rutas
 * relativas de los módulos no cambian. En producción nada de esto existe.
 */
const reescribir = (req, _res, next) => {
  if (req.url?.startsWith('/modulos/')) req.url = `/modulos-dev/${req.url.slice('/modulos/'.length)}`;
  next();
};

export default function modulosEnDesarrollo() {
  return {
    name: 'malkevnia:modulos-en-desarrollo',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        if (command !== 'dev') return;
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'malkevnia:modulos-en-desarrollo',
                // 'post': su gancho corre después del de Astro, que mete sus middlewares
                // (guardián incluido) al principio de la pila. Así este queda el primero.
                enforce: 'post',
                configureServer(server) {
                  return () => {
                    server.middlewares.stack.unshift({ route: '', handle: reescribir });
                  };
                },
              },
            ],
            // Miles de ficheros de módulos que Vite no necesita vigilar.
            server: { watch: { ignored: ['**/modulos/**'] } },
          },
        });
      },
    },
  };
}
