---
layout: post
title: "Bienvenidos a Malkevnia"
date: 2026-05-21 12:00:00 +0100
description: "Primera entrada del blog: presentación, intenciones, ejemplos de formato y reglas básicas de la casa."
tags: [meta, bienvenida]
---

Hola viajero. Si has llegado hasta aquí desde la portada estrellada, ya sabes dónde estás. Bienvenido a **Malkevnia**.

![Logo de Malkevnia](/assets/img/Malkevnia.png)

## ¿Qué es esto?

Este blog es el rincón donde voy a soltar — sin ningún orden particular — cosas que me interesan: *videojuegos*, *juegos de mesa*, *libros*, *películas y series*, *fotografía* y lo que se tercie. A veces serán reseñas, otras veces solo notas sueltas o pensamientos a medio hacer. **No esperes una línea editorial muy estricta.**

> El plan es no tener plan. Cuanto más rígido lo haga, menos voy a escribir.

## ¿Quién escribe?

Yo, Malkev. El mismo de los enlaces de la portada: Steam, Goodreads, Filmaffinity, BoardGameGeek… aquí encontrarás el "por qué" detrás de muchas de esas valoraciones.

Si quieres saber dónde sigo cada cosa, puedes ver los enlaces en la [portada](/).

## De qué irá esto

A modo de carta de intenciones — no de promesa — espero ir cubriendo:

1. **Videojuegos**
   - Reseñas cortas tras terminar algo.
   - Listas de "esto me ha enganchado este mes".
   - Algún post largo cuando algo me marque de verdad.
2. **Juegos de mesa**
   - Partidas memorables (buenas o desastrosas).
   - Reglas caseras y *house rules*.
3. **Libros, cine y series** — sin orden ni periodicidad.
4. **Fotografía** — fotos sueltas con un par de líneas de contexto.

## Cómo comentar

Al final de cada entrada hay una caja de comentarios. **No hace falta registrarse**: basta con escribir un nombre (puede ser inventado) y dejar el mensaje. Tampoco pido email obligatorio. La idea es bajar lo máximo posible la fricción para que cualquiera pueda aportar.

Eso sí: yo modero. Si algo es spam, insulto gratuito o ruido, vuela. Si discrepas con argumentos, eres bienvenido aunque me dejes mal.

### Atajos útiles

| Acción | Atajo |
|---|---|
| Volver al inicio | Clic en el logo MALKEVNIA |
| Filtrar por etiqueta | Clic en cualquier `#tag` |
| Buscar entradas | <kbd>Ctrl</kbd> + <kbd>F</kbd> dentro de `/blog/` |
| Suscribirse | Feed RSS en `/feed.xml` |

## Probando el formato

Por si en algún momento alguien me pregunta: *¿pero esto soporta X?*, aquí dejo el muestrario.

### Código inline y bloques

Una variable así, `const galaxia = "Malkevnia"`, queda en código inline. Y un bloque entero:

```javascript
function abrirPortal(destino) {
  if (destino !== "Malkevnia") {
    throw new Error("Coordenadas inválidas");
  }
  return { estrellas: Infinity, lectores: "ojalá" };
}

const portal = abrirPortal("Malkevnia");
console.log(portal);
```

```bash
# Cómo añadir un post nuevo
cd ~/repos/Malkev-page
echo "..." > _posts/$(date +%F)-mi-titulo.md
git add . && git commit -m "Nuevo post"
git push
```

### Citas anidadas

> Hay tres clases de mentiras: las mentiras, las malditas mentiras y las estadísticas.
>
> — Atribuida a Disraeli, popularizada por Mark Twain.

### Una lista mezclada

- Cosas que **funcionan**:
  - Markdown completo
  - Imágenes con caption
  - Tablas, código y citas
- Cosas que **están en pruebas**:
  - Comentarios sin registro
  - Filtro de etiquetas en `/blog/`
- Cosas que *quizás* vengan luego:
  1. Sección de fotos con galería
  2. Archivo histórico por año
  3. Enlaces "anteriores/siguientes" entre posts

### Separadores

A veces conviene cortar el flujo del texto:

---

Y volver con un párrafo nuevo. Como este, que cierra el ejemplo y ya está.

## Qué esperar

- Entradas cortas y largas, sin calendario fijo.
- Cero analíticas invasivas, cero publicidad.
- Markdown puro: nada de pop-ups ni newsletters.

Si quieres saber cuándo hay algo nuevo, puedes suscribirte al [feed RSS]({{ '/feed.xml' | relative_url }}) o pasarte de vez en cuando.

Gracias por venir. Nos leemos en los comentarios.
