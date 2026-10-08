// Las dos Kallax reales de Malkev, leídas de sus fotos del 8 de octubre de 2026.
// Cada hueco se describe tal cual está:
//  - stack: cajas tumbadas en pila, de abajo arriba (y "above": lo que hay encima, de izquierda a derecha),
//  - row: cajas o libros de pie, de izquierda a derecha (y "on": lo que está tumbado encima),
//  - bridge: varios grupos uno al lado del otro con algo tumbado por encima de todos,
//  - face: una caja de frente, enseñando la portada,
//  - deco: lo que no es un juego (la tele, peluches, estuches…).
// Las medidas [ancho, alto] son fracciones del hueco de un cubo (33 cm), estimadas a ojo en las fotos.
// "doubt" marca lo que no se pudo leer bien, "note" copia los pósits y "dot" las pegatinas de colores.

const G = (title, w, h, extra = {}) => ({ kind: 'boardgame', title, w, h, ...extra })
const D = (deco, label, w, h, extra = {}) => ({ deco, label, w, h, ...extra })
// Los libros de rol rondan los 30 cm de alto, así que casi todos miden lo mismo.
const B = (title, w, color, extra = {}) => ({ kind: 'rpg', title, w, h: 0.88, color, ...extra })

const stack = (...items) => ({ type: 'stack', items })
const stackOn = (items, ...above) => ({ type: 'stack', items, above })
const row = (...items) => ({ type: 'row', items })
const rowUnder = (on, ...items) => ({ type: 'row', items, on: [].concat(on) })
const bridge = (on, ...groups) => ({ type: 'bridge', groups, on: [].concat(on) })
const face = (item) => ({ type: 'face', items: [item] })
const deco = (item) => ({ type: 'deco', items: [item] })
const gap = (w) => deco(D('gap', '', w, 0.01))

// Un hueco de la Kallax. "rows"/"cols" > 1 cuando se ha quitado una balda o un tabique;
// "rods" son las barras de apoyo que sujetan esos huecos grandes (posición de 0 a 1);
// "tiers" son las baldas de un organizador metido dentro del cubo, de arriba abajo, y "aside"
// lo que queda de pie al lado del organizador.
const cube = (r, c, groups, opts = {}) => ({
  row: r,
  col: c,
  rows: opts.rows || 1,
  cols: opts.cols || 1,
  rods: opts.rods || [],
  organizer: !!opts.tiers,
  tierSizes: opts.tierSizes || null,
  tiers: opts.tiers || [groups],
  aside: opts.aside || null,
})

export const furniture = [
  {
    key: 'kallax-1',
    name: 'Kallax 1 · la de la tele',
    rows: 5,
    cols: 5,
    top: [
      stack(
        G("Santorini: Pantheon Collector's", 1.04, 0.37, { color: '#f4f1ea' }),
        G('Santorini: Riddle of the Sphinx', 1.0, 0.11, { color: '#2f4f8f' }),
        G('That Time You Killed Me', 0.94, 0.22, { color: '#e8643a' }),
        G('War Chest', 0.84, 0.4, { color: '#6b4524' }),
      ),
      rowUnder(
        G('TAMSK', 1.36, 0.13, { color: '#f0c4b0' }),
        G('GIPF', 0.215, 0.94, { color: '#2e4fa0' }),
        G('TZAAR', 0.215, 0.94, { color: '#e3b04b' }),
        G('ZÈRTZ', 0.215, 0.94, { color: '#5b9bd5' }),
        G('DVONN', 0.215, 0.94, { color: '#d9443a' }),
        G('PÜNCT', 0.215, 0.94, { color: '#3e8f4f' }),
        G('YINSH', 0.215, 0.94, { color: '#b9bfd1' }),
        G('LYNGK', 0.215, 0.94, { color: '#efe8d4' }),
        G('MATRX', 0.215, 0.94, { color: '#e4e4ea' }),
      ),
      stack(
        G('Double 12 Dominoes', 0.36, 0.34, { color: '#1c1c1c' }),
        G('Onitama', 0.33, 0.34, { color: '#7b6bc4', dot: '2' }),
      ),
      stack(
        G('Tak', 0.85, 0.18, { color: '#7fb0a0', dot: '2' }),
        G('Laser Chess', 0.82, 0.22, { color: '#1f3f6a' }),
        G('Mr. Jack in New York', 0.8, 0.12, { color: '#e09a3c', doubt: 'La caja lleva el sello de Nueva York 1889: creo que es Mr. Jack in New York y no el de Londres.' }),
        G('Squadro', 0.62, 0.13, { color: '#f3f3f3' }),
        G('Quoridor', 0.6, 0.14, { color: '#f3f3f3' }),
        G('Mr. Jack Pocket', 0.5, 0.12, { color: '#5a2a4a' }),
      ),
      stackOn(
        [
          G('Azul', 0.85, 0.23, { color: '#e9e2d0' }),
          G('Caja de madera (encima del Azul)', 0.8, 0.12, { color: '#c89a62', doubt: 'Una caja de madera lisa sobre el Azul: no sé qué juego guarda.' }),
        ],
        stack(G('Caja pequeña oscura', 0.28, 0.12, { color: '#2a2a3a', doubt: 'Una cajita oscura al lado del Totoro, sin título a la vista.' })),
        stack(G('Mi vecino Totoro: Totoro & Kurosuke Reversi', 0.44, 0.14, { color: '#7d7a2e' })),
      ),
      deco(D('case', 'Maletín negro', 0.5, 0.8, { color: '#16161c' })),
    ],
    cubes: [
      // Fila 1
      cube(1, 1, [
        stack(
          G('La Guerra del Anillo (2ª edición)', 0.85, 0.28, { color: '#2a2f3a', note: 'inserto · 5 expansiones · minis' }),
          G('Star Wars: Rebellion', 0.9, 0.41, { color: '#1b1f2b', dot: '2' }),
          G('La Guerra del Anillo (caja roja)', 0.74, 0.17, { color: '#8a3b33', doubt: 'Caja roja de la Guerra del Anillo, más fina que la 2ª edición: ¿la primera edición o una expansión?' }),
        ),
      ]),
      cube(1, 2, null, {
        tierSizes: [0.25, 0.3, 0.2, 0.25],
        tiers: [
          [stack(G('Minotaurus (LEGO)', 0.86, 0.2, { color: '#f2f2f2' }))],
          [stack(G('Fog of Love', 0.86, 0.26, { color: '#f4f2ef' }))],
          [stack(G('París: La Cité de la Lumière', 0.6, 0.15, { color: '#3b4a8a' })), stack(G('Mindbug: Primer Contacto', 0.22, 0.15, { color: '#232946' }))],
          [gap(0.55), stack(G('Two Rooms and a Boom', 0.33, 0.09, { color: '#3c2f5c' }), G('Regicide', 0.3, 0.08, { color: '#c9d6cf' }))],
        ],
      }),
      cube(1, 3, null, {
        tierSizes: [0.47, 0.22, 0.31],
        tiers: [
          [stack(G('Spirit Island', 0.86, 0.36, { color: '#2f8ac4', note: '2 expansiones · arreglar traducciones' }))],
          [stack(G('Kelp', 0.8, 0.19, { color: '#1f6f6a' }))],
          [bridge(
            G('Cold Case: Una pizca de asesinato', 0.86, 0.06, { color: '#2b2b2b' }),
            stack(G('Caja negra del cerebro en la tele', 0.36, 0.22, { color: '#1d1d1d', doubt: 'Caja negra con un cerebro dentro de una tele en la tapa: no veo el título.' })),
            deco(D('case', 'Estuche rojo', 0.14, 0.22, { color: '#b8232b' })),
            stack(
              G('Caja de rayas pastel', 0.42, 0.09, { color: '#f0d98a', doubt: 'Caja de franjas pastel (amarillo, blanco, naranja y rosa) con siluetas de animales, debajo del Parade.' }),
              G('Parade', 0.32, 0.1, { color: '#5b2a6e' }),
            ),
          )],
        ],
      }),
      cube(1, 4, [
        stack(
          G('Tail Feathers', 0.83, 0.34, { color: '#4a3a2f', dot: '2', note: '2º core' }),
          G('Onus! Traianus', 0.72, 0.26, { color: '#ecebe6', note: 'expansiones' }),
          G('Onus! Terrenos y Fortalezas', 0.72, 0.1, { color: '#ecebe6' }),
          G('Scope: Stalingrad', 0.5, 0.12, { color: '#b5231f' }),
        ),
      ]),
      cube(1, 5, [
        stack(
          G('Help Arrives!', 0.7, 0.18, { color: '#a9c8e0' }),
          G('Sekigahara', 0.67, 0.22, { color: '#f4f2ec' }),
          G('Twilight Struggle', 0.66, 0.21, { color: '#24366b' }),
          G('BattleTech: Beginner Box', 0.68, 0.16, { color: '#3a4f8a', note: 'escenografía' }),
          G('BattleTech (Diseños Orbitales)', 0.68, 0.1, { color: '#1d1d1d' }),
        ),
        deco(D('papers', 'Mapas y reglamentos de pie', 0.24, 0.72)),
      ]),
      // Fila 2
      cube(2, 1, [
        stack(
          G('Street Fighter: The Miniatures Game', 0.95, 0.3, { color: '#1e1e22' }),
          G('Street Fighter: The Miniatures Game (2ª caja)', 0.95, 0.29, { color: '#1e1e22' }),
          G('Cthulhu Wars: Duel', 0.95, 0.21, { color: '#33303a' }),
          G('7 Wonders Duel', 0.72, 0.15, { color: '#26323a', dot: '2' }),
        ),
      ]),
      cube(2, 2, [deco(D('tv', 'La tele, con las gafas de realidad virtual en la balda de arriba', 1.64, 1.9))], { rows: 2, cols: 2 }),
      cube(2, 4, [
        stack(
          G('A Study in Emerald', 0.68, 0.16, { color: '#ece6d6' }),
          G('The Thing: La Cosa', 0.83, 0.24, { color: '#1c2430' }),
          G('Battlestar Galactica', 0.82, 0.22, { color: '#2a2224', note: 'inserto · 3 expansiones' }),
          G('Stationfall', 0.82, 0.24, { color: '#1f3355' }),
        ),
      ]),
      cube(2, 5, [
        stackOn(
          [
            G('Sonar Family', 0.85, 0.16, { color: '#2f6a8a' }),
            G('Captain Sonar', 0.85, 0.21, { color: '#2a4a6a' }),
            G('Ciudadelas', 0.78, 0.14, { color: '#4f6aa0' }),
          ],
          stack(
            G('Human Punishment', 0.36, 0.17, { color: '#1c1c22' }),
            G('El Hombre Lobo: Artefactos', 0.36, 0.07, { color: '#4a2f5a' }),
            G('El Hombre Lobo: Edición Definitiva', 0.36, 0.07, { color: '#2f3f7a' }),
            G('Arkham Horror: Lovecraft Letter', 0.36, 0.08, { color: '#e8ddd0' }),
          ),
          stack(
            G('Secret Hitler', 0.52, 0.15, { color: '#e8643a' }),
            G('Mascarade', 0.48, 0.12, { color: '#9b2b2b' }),
            G('¡BANG! El juego de dados', 0.5, 0.1, { color: '#8a5a2f' }),
          ),
        ),
      ]),
      // Fila 3
      cube(3, 1, null, {
        tierSizes: [0.17, 0.36, 0.27, 0.2],
        tiers: [
          [stack(G('Caja azul brillante', 0.42, 0.11, { color: '#1f6fa8', doubt: 'Caja azul brillante arriba del organizador, sin título a la vista.' }))],
          [
            stack(
              G('Caja con aspecto de libro antiguo', 0.46, 0.14, { color: '#8a6a3f', doubt: 'Una caja que imita un libro antiguo de páginas amarillentas.' }),
              G('Caja de la calavera mexicana', 0.4, 0.17, { color: '#23305a', doubt: 'Caja azul con una calavera mexicana y rosas rojas.' }),
            ),
            face(G('Virus!', 0.21, 0.28, { color: '#9b6bd8' })),
          ],
          [stack(
            G('Caja roja (debajo de la de Devir)', 0.6, 0.05, { color: '#c8332b', doubt: 'Una caja roja fina debajo de la de Devir.' }),
            G('Caja de Devir vista por detrás', 0.6, 0.18, { color: '#e8a24a', doubt: 'Se ve la trasera de una caja de Devir (código de barras 8436589622326).' }),
          )],
          [stack(G('SET', 0.42, 0.14, { color: '#8a2f1f' })), stack(G('Caja amarilla', 0.3, 0.14, { color: '#f2b624', doubt: 'Caja amarilla de cartas, al lado del SET.' }))],
        ],
        // Fuera del organizador, a la derecha: una caja morada de pie y el Taco encima.
        aside: stack(
          G('Caja morada de pie', 0.16, 0.34, { color: '#3a2f7a', upright: true, doubt: 'Caja morada oscura de pie, a la derecha del organizador.' }),
          G('Taco Vuelta Cabra Queso Pizza', 0.13, 0.34, { color: '#e0306f', upright: true }),
        ),
      }),
      cube(3, 4, [
        stack(
          G('Caja grande de los insectos guerreros', 0.69, 0.74, { color: '#3a6a7a', face: true, doubt: 'Caja grande de frente, con insectos guerreros y bichos de colores; el título no se ve.' }),
          G('DropMix', 0.76, 0.22, { color: '#2a2a2a' }),
          G('Wavelength', 0.79, 0.26, { color: '#f0a0a0' }),
          G('Fun Facts', 0.69, 0.2, { color: '#2a3f8a' }),
          G('Sound Box', 0.53, 0.22, { color: '#f4f4f4' }),
        ),
        deco(D('plush', 'Peluche rojo', 0.36, 0.44, { color: '#c8302a', front: true })),
      ], { rows: 2 }),
      cube(3, 5, [
        stack(
          G('Caja negra y dorada de los esqueletos piratas', 0.83, 0.31, { color: '#141a2a', doubt: 'Caja negra con dorados y esqueletos: 2-6 jugadores, 40-60 min, "modular game, endless variations". No veo el nombre.' }),
          G('Sheriff de Nottingham (2ª edición)', 0.76, 0.27, { color: '#3a5aa0' }),
          G('QE', 0.55, 0.13, { color: '#1f3f5a' }),
          G('Tabú', 0.66, 0.22, { color: '#4b2f8a' }),
        ),
      ]),
      // Fila 4
      cube(4, 1, [
        stack(
          G('Onus! … Pack', 0.72, 0.2, { color: '#ecebe6', note: 'tunear caja código secreto', doubt: 'El pósit tapa el nombre: se lee "Onus! … Pack".' }),
          G('Imagine Family', 0.73, 0.16, { color: '#f4f4f4' }),
          G('Macedonia de Letras', 0.72, 0.16, { color: '#f4f4f4' }),
          G('Decrypto', 0.55, 0.16, { color: '#f0f0f0' }),
          G('Sospechosos Inusuales', 0.55, 0.19, { color: '#23306a' }),
        ),
        deco(D('board', 'Pizarras Dry Erase (16)', 0.19, 0.8)),
      ]),
      cube(4, 2, [
        stackOn(
          [G('Subbuteo: UEFA Champions League', 0.85, 0.17, { color: '#1c2a5a' })],
          stack(
            G('Escuela de Pingüinos 2', 0.57, 0.16, { color: '#f6f6f6' }),
            G('Escuela de Pingüinos', 0.57, 0.16, { color: '#f6f6f6' }),
            G('Caja de Brain Games', 0.55, 0.12, { color: '#2a5aa0', doubt: 'Trasera de una caja de Brain Games (2023, de Brian Gomez y Reinis Pētersons).' }),
            G('Strike', 0.55, 0.16, { color: '#2a6fd0' }),
            G('Klüster', 0.35, 0.09, { color: '#2a2a2a' }),
          ),
          stack(
            G('Jenga Fortnite', 0.33, 0.22, { color: '#6a3fa0' }),
            G('Tetra Tower', 0.3, 0.22, { color: '#1c1c1c' }),
            G('Geistesblitz', 0.35, 0.12, { color: '#2a2f6a' }),
            G('Dobble Catan', 0.37, 0.14, { color: '#b8232b' }),
          ),
        ),
      ]),
      cube(4, 3, [
        row(
          G('Cocoslocos', 0.27, 0.88, { color: '#5ab0e8' }),
          G('Rhino Hero: Super Battle', 0.16, 0.9, { color: '#f2dc2a' }),
          G('Tuki', 0.17, 0.86, { color: '#b9a8e0' }),
          G('Ubongo', 0.19, 0.85, { color: '#e2502a' }),
          G('Stonehenge and the Sun', 0.12, 0.8, { color: '#6ab0a8' }),
        ),
      ]),
      cube(4, 5, [
        stack(
          G('Nictofobia', 0.82, 0.17, { color: '#1a1a1a' }),
          G('Kling Klang Klunker', 0.8, 0.17, { color: '#c8508a' }),
          G('Burger Mania', 0.79, 0.2, { color: '#f2c23a' }),
          G('Ice Game Penguin', 0.74, 0.2, { color: '#5ab0e8' }),
          G('Magic Mandala', 0.3, 0.12, { color: '#4a9ae0' }),
        ),
      ]),
      // Fila 5: los libros de rol
      cube(5, 1, [
        row(
          B('Vampiro: La Mascarada (5ª edición)', 0.1, '#d8d6d0', { doubt: 'El blanco con la cinta roja: creo que es la 5ª edición.' }),
          B('Vampiro: La Mascarada 20º Aniversario', 0.11, '#1e1e1e'),
          B('Gehena', 0.05, '#3f7a4a'),
          B('Mago: La Ascensión 20º Aniversario', 0.12, '#1c1c1c'),
          B('Ascensión', 0.05, '#4a2f7a'),
          B('Changeling: El Ensueño', 0.065, '#141414'),
          B('Demonio: La Caída', 0.055, '#1f3f8a'),
          B('Apocalipsis', 0.045, '#8a2f1f'),
          B('Hombre Lobo: Salvaje Oeste', 0.07, '#6a4a2a'),
          B('Hombre Lobo: El Apocalipsis', 0.075, '#2a3a6a'),
          B('Cazador: La Venganza', 0.07, '#e8742a'),
          B('Wraith: El Olvido', 0.075, '#3a4a42'),
        ),
      ]),
      cube(5, 2, [
        row(
          B('Momia: La Resurrección', 0.06, '#7a4a2f'),
          B('Libro morado sin título', 0.065, '#3a2a6a', { doubt: 'Un libro grande morado sin título en el lomo, al lado de Momia.' }),
          B('La Hora del Juicio', 0.035, '#b8301f', { h: 0.82 }),
          B('Reflejos Oscuros: Espectros', 0.03, '#1c1c1c', { h: 0.82 }),
          B('El Libro del Clan Malkavian', 0.03, '#1c1c1c', { h: 0.82 }),
          B('Legión de Monstruos', 0.03, '#2a2a2a', { h: 0.82, doubt: 'Lomo muy fino: leo "Legión de Monstruos", pero no estoy seguro.' }),
          B('Combate', 0.03, '#2a2a2a', { h: 0.82 }),
          B('Orpheus', 0.045, '#d0d0d0', { h: 0.84 }),
          B('Estirpe de Oriente', 0.045, '#d8402a', { h: 0.84 }),
          B('Hengeyokai', 0.04, '#f4f0e0', { h: 0.84 }),
          B('Suplementos finos sin título', 0.04, '#2f5a5a', { h: 0.84, doubt: 'Dos o tres suplementos muy finos sin título visible.' }),
          B('Libro azul oscuro sin título', 0.055, '#1f2a3a', { doubt: 'Tapa dura azul oscuro sin título en el lomo.' }),
          B('Edad Oscura: Vampiro', 0.055, '#2a1f2a'),
          B('Momia (2º libro)', 0.035, '#2a2a1f', { doubt: 'Un segundo lomo de "Momia", más fino.' }),
          B('Mago: La Cruzada', 0.055, '#2a1f2f'),
          B('Edad Oscura: Hadas', 0.04, '#3a3a4a'),
          B('La Tierra de los Ocho Millones de Sueños', 0.04, '#2a3a5a'),
          B('Edad Oscura: Mago', 0.045, '#3a1f2a'),
          B('Edad Oscura (lomo verde)', 0.045, '#3a5a2a', { doubt: 'Edad Oscura de lomo verde; no leo el subtítulo.' }),
          B('La Mascarada: El Juego de Rol en Vivo', 0.06, '#1f2a1f', { h: 0.8 }),
        ),
      ]),
      cube(5, 3, [
        rowUnder(
          B('Caja de D&D tumbada', 0.6, '#151515', { h: 0.05, doubt: 'Una caja de D&D tumbada encima de los libros; no leo cuál es.' }),
          B('D&D: Guía del Dungeon Master', 0.065, '#1c1416', { h: 0.82 }),
          B('D&D: Manual del Jugador', 0.065, '#1c1416', { h: 0.82 }),
          B('D&D: Manual de Monstruos', 0.065, '#1c1416', { h: 0.82 }),
          B('La Maldición de Strahd', 0.06, '#1c1c24', { h: 0.84 }),
          B('Los Mitos de Cthulhu de Sandy Petersen', 0.07, '#23264a'),
          B('Fanhunter: Barcelofia by Night', 0.025, '#3a6a6a', { h: 0.7, doubt: 'Lomo fino de Fanhunter; creo que pone "Barcelofia by Night".' }),
          B('Fanhunter: Guía del Jugador', 0.025, '#3a6a6a', { h: 0.7 }),
          B('Fanhunter: Guía del Jugador II', 0.025, '#3a6a6a', { h: 0.7 }),
          B('Fanpiro (2ª edición)', 0.025, '#2a2a3a', { h: 0.7 }),
          B('Fanhunter (Devir)', 0.05, '#2a3260', { h: 0.72 }),
          B('Anima: Beyond Fantasy', 0.07, '#3a4a6a'),
          B('Anima: Beyond Fantasy (2º)', 0.07, '#3a3a50'),
          B('Suplementos finos de Anima', 0.04, '#5a3a8a', { doubt: 'Dos lomos finos sin título claro, junto a los de Anima.' }),
          B('Gaïa: Más allá de los sueños', 0.05, '#3a3a5a'),
          B('Anima Tactics: Saga I y II', 0.045, '#2a2a2a'),
          B('Arcana Exxet: Secretos de lo Sobrenatural', 0.045, '#3a3a7a'),
          B('Pantalla de Anima', 0.02, '#4a3a6a', { doubt: 'Algo muy fino que parece una pantalla del máster.' }),
          B('Dominus Exxet: Los Dominios del Ki', 0.045, '#8a2a1f'),
          B('Los que Caminaron con Nosotros', 0.045, '#f0eee6'),
        ),
      ]),
      cube(5, 4, [
        rowUnder(
          [
            B('Mutants & Masterminds: El Juego de Rol', 0.9, '#1c1c1c', { h: 0.05 }),
            B('Mutants & Masterminds: Freedom City', 0.9, '#2a2a30', { h: 0.05 }),
          ],
          B('Linajes de sangre: los ocultos', 0.03, '#6a2a2a', { doubt: 'Lomo fino a la izquierda de Hombre Lobo: El Exilio; no lo leo bien.' }),
          B('Hombre Lobo: El Exilio', 0.055, '#8a4a2a'),
          B('Vampiro: El Réquiem', 0.055, '#6a3a2a'),
          B('Mundo de Tinieblas: Antagonistas', 0.04, '#5a5a5a'),
          B('Mundo de Tinieblas', 0.05, '#2a2f3a'),
          B('Mago: El Despertar', 0.055, '#4a9ad8'),
          B('Ghouls', 0.03, '#6a2a1f'),
          B('Suplementos rojos finos', 0.035, '#8a1f1f', { doubt: 'Dos lomos rojos finos sin título visible.' }),
          B('Secretos Salvajes vol. 2', 0.025, '#5a8ad0', { h: 0.72 }),
          B('Secretos Salvajes vol. 1', 0.025, '#5a8ad0', { h: 0.72 }),
          B('Savage Worlds: Libro Básico', 0.03, '#5a9ad8', { h: 0.72 }),
          B('Hora de Aventuras: Juego de Rol', 0.04, '#f2f2f2', { h: 0.8 }),
          B('RuneQuest: Aventuras en Glorantha', 0.055, '#1c1c1c'),
          B('Mundodisco: El Juego de Rol', 0.05, '#2a5a7a'),
          B('Star Wars: Ultimate Alien Anthology', 0.03, '#f0f0f0'),
          B('Aquelarre', 0.05, '#1c1c1c'),
          B('La Llamada de Cthulhu: manual para jugadores y guardianes', 0.05, '#1c1c1c'),
          B('De Profundis', 0.03, '#2a2a2a', { h: 0.84 }),
        ),
      ]),
      cube(5, 5, [
        row(
          B('Eclipse Phase', 0.065, '#141414'),
          B('Alien: El Juego de Rol', 0.06, '#1c1c1c'),
          B('Degenesis: Atlas', 0.05, '#ece9e2'),
          B('Libro blanco sin título', 0.035, '#f4f4f0', { doubt: 'Un libro blanco junto al Atlas de Degenesis, sin título visible.' }),
          B('Libro negro con cinta naranja', 0.04, '#1c1c1c', { doubt: 'Lomo negro con una cinta naranja; no veo el título.' }),
          B('Degenesis: Punk Primordial', 0.065, '#8a2a24'),
          B('Degenesis: Katarsis', 0.065, '#8a2a24'),
          B('Degenesis: Artefactos', 0.055, '#2f3448'),
          B('Degenesis: En tu sangre', 0.035, '#f4f4f0'),
          B('Degenesis: Frequenze', 0.035, '#f4f4f0'),
          B('Degenesis: Sangre en la fortaleza', 0.035, '#8a3a3a'),
          B('Degenesis: Hibris', 0.035, '#f0ede0'),
          B('Degenesis: Nuestras cenizas + La caída de Ferropol', 0.035, '#1c1c1c'),
          B('Degenesis: Excavadores de la tierra', 0.04, '#c86a2a'),
          B('Libro azul marino sin título', 0.04, '#2a3060', { doubt: 'Tapa azul marino sin título, antes del de estilo cómic.' }),
          B('Aberrant', 0.03, '#5aa03a', { h: 0.72, doubt: 'Lomo de estilo cómic; leo "Aberrant" pero está medio tapado.' }),
          B('El Fin del Mundo: Invasión Alienígena', 0.06, '#5aa86a', { h: 0.7 }),
        ),
      ]),
    ],
  },
  {
    key: 'kallax-2',
    name: 'Kallax 2',
    rows: 5,
    cols: 5,
    top: [
      stack(
        G('Vampiro: Chapters', 1.05, 0.41, { color: '#1c1c1e', note: 'expansiones · fundas · monedas · falta el KS final' }),
        G('Caja negra sin título (encima de Chapters)', 1.05, 0.26, { color: '#232326', doubt: 'Caja negra sin título justo encima de Chapters; ¿la segunda caja de Chapters?' }),
        G('Nemesis: Represalia', 0.9, 0.48, { color: '#2a1f1f' }),
        G('Nemesis: Represalia (caja alargada)', 0.9, 0.14, { color: '#151515', doubt: 'Caja alargada encima de Nemesis: Represalia, con algo de "...de la campaña" en la tapa.' }),
      ),
      stack(
        G('Cthulhu Wars', 0.92, 0.41, { color: '#1f1f1f', doubt: 'Caja negra muy gastada sin título a la vista: supongo que el Cthulhu Wars base.' }),
        G('Caja negra fina (Cthulhu Wars)', 0.9, 0.11, { color: '#222226', doubt: 'Caja negra fina sin título entre las de Cthulhu Wars.' }),
        G('Cthulhu Wars: Shaggai Map', 0.95, 0.24, { color: '#232323' }),
        G('Cthulhu Wars: Library at Celaeno Map', 0.78, 0.28, { color: '#232323' }),
      ),
      stack(
        G('Glorantha: The Gods War', 1.12, 0.43, { color: '#8aa0c8' }),
        G('Cthulhu Wars: Primigenio verde', 0.91, 0.45, { color: '#1c1f1c', doubt: 'Caja de Cthulhu Wars "Actual size!" con una figura verde alada; no leo de qué Primigenio es.' }),
        G('Cthulhu Wars: Primigenio gris', 0.79, 0.27, { color: '#1c1c1f', doubt: 'Otra caja "Actual size!" con una figura gris de tentáculos.' }),
      ),
      stack(
        G('Batman: Gotham City Chronicles', 0.88, 0.36, { color: '#2a3a5a', note: 'inserto' }),
        G('Batman: Gotham City Chronicles (2ª caja)', 0.88, 0.36, { color: '#2a3550' }),
        G('Batman: Gotham City Chronicles (3ª caja)', 1.0, 0.34, { color: '#2a2a30' }),
      ),
      stackOn(
        [G('Caja de metal oxidado con una chica azul', 1.15, 0.53, { color: '#7a4a3a', note: 'arreglar traducción', doubt: 'Caja marrón que imita metal oxidado, con una chica azul pintada como un grafiti; no tiene el título a la vista.' })],
        deco(D('organizer', 'Organizador de madera', 0.85, 0.22)),
      ),
    ],
    cubes: [
      // Fila 1
      cube(1, 1, [
        stack(
          G('Nemesis', 0.95, 0.46, { color: '#1c1c22', dot: '4' }),
          G('Nemesis: Lockdown', 0.95, 0.46, { color: '#1c1f22' }),
        ),
      ]),
      cube(1, 2, [
        stack(
          G('Twilight Imperium (4ª edición)', 0.92, 0.42, { color: '#1f2a5a', note: 'expansión · mejoras 3D' }),
          G('Cosmic Frog', 0.9, 0.21, { color: '#c84a2a' }),
          G('Spartacus', 0.83, 0.24, { color: '#7a1f1f', dot: '6' }),
        ),
        stackOn(
          [
            G('A Song of Ice and Fief', 0.88, 0.23, { color: '#3a3a30' }),
            G('Caja de madera con cierre', 0.97, 0.25, { color: '#d8b884', doubt: 'Caja de madera con cierre metálico entre Dune y A Song of Ice and Fief; no sé qué guarda.' }),
            G('Dune (Gale Force Nine)', 0.8, 0.2, { color: '#3a3226' }),
          ],
          deco(D('pouch', 'Bolsa morada', 0.42, 0.1, { color: '#3a2a6a' })),
        ),
        deco(D('birdhouse', 'Casita de pájaros de madera', 0.36, 0.5)),
        stack(
          G('Root', 0.7, 0.21, { color: '#3a5a3a', dot: '4' }),
          G('Root: Los Merodeadores', 0.7, 0.17, { color: '#c8c8d8' }),
          G('Root: Caja de Secuaces', 0.56, 0.16, { color: '#c86a3a' }),
        ),
      ], { cols: 3, rods: [0.5] }),
      cube(1, 5, [
        stack(
          G('Scythe (caja de las campesinas)', 0.85, 0.28, { color: '#8a7a5a', doubt: 'Caja con el cuadro de las campesinas y el mecha: ¿Scythe base o una expansión?' }),
          G('Caja roja de Scythe', 0.85, 0.11, { color: '#9a2a24', doubt: 'Caja roja con adornos dorados entre las dos de Scythe; ¿una expansión?' }),
          G('Scythe', 0.85, 0.3, { color: '#8a8a88', note: 'arreglar inserto · mejoras 3D' }),
          G('Dune: Imperium – Insurrección', 0.82, 0.26, { color: '#7a8a7a', note: 'inserto · mezclar cartas' }),
        ),
      ]),
      // Fila 2
      cube(2, 1, [
        stackOn(
          [D('case', 'Estuche morado', 0.38, 0.24, { color: '#5a3a9a' })],
          row(
            G('Cryptid', 0.2, 0.58, { color: '#1f6a6a', dot: '4', note: '★' }),
            G('Caja azul de pie', 0.18, 0.66, { color: '#2f3a8a', doubt: 'Caja azul de tela de pie, detrás del Cryptid.' }),
          ),
        ),
        stack(
          G('Canvas (Big Box)', 0.78, 0.31, { color: '#7ab0d8' }),
          G('Splendor', 0.67, 0.2, { color: '#f2d84a', note: '2 expansiones' }),
          G('Magic Maze', 0.76, 0.2, { color: '#f4f4f4' }),
          G('Hormigas', 0.52, 0.16, { color: '#d84a3a' }),
        ),
        stack(
          G('Potion Explosion', 0.85, 0.23, { color: '#4a3a2a' }),
          G('El Dorado', 0.84, 0.21, { color: '#2a6fd0', dot: '2/4' }),
          G('Monkey Palace (LEGO)', 0.75, 0.15, { color: '#2a4a2a' }),
          G('Sagrada', 0.65, 0.22, { color: '#e8e0d0', dot: '2' }),
        ),
      ], { cols: 2, rods: [0.5] }),
      cube(2, 3, [
        stack(
          G('Odyssey: La Ira de Poseidón', 0.78, 0.15, { color: '#d0d4d0' }),
          G('Attack on Titan: La Última Batalla', 0.72, 0.17, { color: '#3a2a2a' }),
          G('Tiburón', 0.74, 0.24, { color: '#2a7ac8', dot: '4' }),
          G('La Furia de Drácula', 0.83, 0.2, { color: '#2a3a3a' }),
          G('Tragedy Looper', 0.62, 0.14, { color: '#6a2a1f' }),
        ),
        row(G('Not Alone', 0.13, 0.45, { color: '#1c2a5a' })),
      ]),
      cube(2, 4, [
        stack(
          G('On Mars', 0.84, 0.23, { color: '#7a2424' }),
          G('On Mars: Invasión Alien', 0.74, 0.15, { color: '#9a2a24' }),
          G('Underwater Cities', 0.66, 0.2, { color: '#1f3a5a', dot: '3', note: 'inserto · expansión (2)' }),
          G('SETI', 0.72, 0.22, { color: '#4ab0c8' }),
        ),
        row(G('Bios: Mesofauna', 0.26, 0.5, { color: '#2a2f3a', tilt: true })),
        stackOn(
          [
            G('Ark Nova', 0.83, 0.2, { color: '#4ac0b0', note: 'inserto · expansión y mapas · ¿3D?' }),
            G('High Frontier 4 All', 0.88, 0.22, { color: '#1c2430' }),
            G('Bios: Origins', 0.75, 0.18, { color: '#3a3f8a' }),
          ],
          stack(G('Bios: Genesis', 0.42, 0.2, { color: '#5a6ad0', tilt: true })),
          stack(G('Bios: Megafauna', 0.45, 0.19, { color: '#2a3a2a' })),
        ),
      ], { cols: 2, rods: [0.5] }),
      // Fila 3
      cube(3, 1, [
        stack(
          G('Windward', 0.97, 0.4, { color: '#e8e4dc', note: '★' }),
          G('Harry Potter: Catch the Snitch', 0.98, 0.33, { color: '#f0eee6' }),
          G('Oath', 0.88, 0.26, { color: '#3a8a7a' }),
        ),
      ]),
      cube(3, 2, [
        rowUnder(
          G('Alice ha desaparecido', 0.42, 0.18, { color: '#2a2a2a' }),
          G('Harry Potter: Hogwarts Battle', 0.33, 0.66, { color: '#5a3a2a' }),
        ),
        stack(
          G('Metal Gear Solid: El Juego de Mesa', 0.91, 0.28, { color: '#e8302a' }),
          G('Dead of Winter: La Larga Noche', 0.88, 0.2, { color: '#3a3a3a' }),
          G('Dead of Winter', 0.86, 0.26, { color: '#4a4a4a' }),
        ),
        row(
          G('Dead of Winter: Colonias en Guerra', 0.16, 0.8, { color: '#2a2a2a' }),
          G('El Bucle (librojuego)', 0.09, 0.62, { color: '#f0eee6' }),
          G('En las Cenizas', 0.09, 0.76, { color: '#1c1c22' }),
          G('Too Many Bones: Gearloc Miniatures', 0.14, 0.8, { color: '#4a4a4a' }),
        ),
        face(G('Gloomhaven', 0.95, 0.91, { color: '#5a4630', note: 'traducción · insertos 3D' })),
        row(G('Too Many Bones: The Automaton of Shale', 0.22, 0.82, { color: '#1c1c1c' })),
      ], { cols: 3 }),
      cube(3, 5, [
        stack(
          G('Wingspan: Nesting Box', 0.86, 0.55, { color: '#f0d8d0' }),
          G('Oceans', 0.84, 0.31, { color: '#2a3a8a', dot: '3-4' }),
        ),
      ]),
      // Fila 4
      cube(4, 1, [
        stack(
          G('504', 0.83, 0.19, { color: '#3a8a6a' }),
          G('Adrenalina', 0.82, 0.22, { color: '#2a4a8a', dot: '4-5' }),
          G('Juego de Rick y Morty', 0.75, 0.2, { color: '#1c1c1c', doubt: 'Caja negra de Rick y Morty con un gato y un portal; no leo el nombre del juego.' }),
          G('Garabatos y Mazmorras', 0.72, 0.19, { color: '#f4f4f4' }),
        ),
      ]),
      cube(4, 2, [
        stack(
          G('Nemesis: Constructs Pack', 0.78, 0.45, { color: '#1c1c22' }),
          G('Nemesis: Terrain Expansion', 0.38, 0.34, { color: '#1c1c22' }),
        ),
      ]),
      cube(4, 3, [
        stackOn(
          [
            G('Twilight Imperium: El Confín del Trueno', 0.88, 0.38, { color: '#1f2a5a' }),
            G('La Guerra del Anillo: Reyes de la Tierra Media', 0.82, 0.13, { color: '#8a4a3a' }),
            G('La Guerra del Anillo: Guerreros de la Tierra Media', 0.82, 0.17, { color: '#8a4a3a' }),
          ],
          bridge(
            G('Caja de cartón (encima de todo)', 0.9, 0.15, { color: '#c8a070', doubt: 'Caja de cartón de envío encima de todo; ¿un pedido sin abrir?' }),
            stack(G('Ark Nova: Mundo Marino', 0.45, 0.13, { color: '#4ab0d8' })),
            stack(G('La Guerra del Anillo: Señores de la Tierra Media', 0.38, 0.14, { color: '#8a4a3a' })),
          ),
        ),
      ]),
      cube(4, 4, [
        stack(
          G('Caja de cartón grande', 0.67, 0.38, { color: '#c8a070', doubt: 'Caja de cartón precintada debajo del Tail Feathers.' }),
          G('Tail Feathers (2ª caja)', 0.78, 0.2, { color: '#4a3a2f' }),
          G('Caja blanca precintada', 0.62, 0.12, { color: '#f0f0ee', doubt: 'Caja blanca con plástico, sin título.' }),
          G('Underwater Cities: Data Era', 0.45, 0.14, { color: '#4a3a8a' }),
          G('Caja oscura precintada', 0.45, 0.1, { color: '#2a2f2a', doubt: 'Caja oscura con plástico encima de Data Era; sin título visible.' }),
        ),
        deco(D('holders', 'Soportes impresos en 3D', 0.18, 0.35)),
      ]),
      cube(4, 5, [
        gap(0.3),
        stack(
          G('Caja amarilla de Space Cowboys', 0.55, 0.14, { color: '#e8c83a', doubt: 'Dos cajas amarillas iguales (código SCSPL…): ¿expansiones de Splendor?' }),
          G('Caja amarilla de Space Cowboys (2ª)', 0.55, 0.3, { color: '#e8c83a', tilt: true }),
        ),
      ]),
      // Fila 5
      cube(5, 1, []),
      cube(5, 2, [
        stack(B('Historias no contadas 4', 0.55, '#2f4a3a', { h: 0.08, doubt: 'Un libro tumbado, "Historias no contadas 4"; ¿de Nemesis?' })),
        deco(D('plush', 'Peluche de gato astronauta', 0.4, 0.6, { color: '#2a3a6a' })),
      ]),
      cube(5, 3, [
        stackOn(
          [
            G('Dune: Imperium', 0.85, 0.24, { color: '#3a2a2f' }),
            G('Dune: Imperium – Linajes', 0.85, 0.18, { color: '#3a2a2f' }),
            G('Caja fina sin título', 0.6, 0.04, { color: '#2a2a2a', doubt: 'Caja muy fina entre Linajes y Naturaleza Encarnada.' }),
            G('Spirit Island: Naturaleza Encarnada', 0.85, 0.2, { color: '#4a7a5a' }),
          ],
          stack(G('Spirit Island: Pluma y Llama', 0.5, 0.24, { color: '#e8a02a' })),
          stack(G('Mazo de cartas blanco', 0.24, 0.24, { color: '#f0f0f0', doubt: 'Un mazo de cartas suelto en una caja blanca.' })),
          deco(D('pouch', 'Bolsa de dados', 0.14, 0.2, { color: '#8a6a2a' })),
        ),
      ]),
      cube(5, 4, [
        stack(
          G('Vampiro: Chapters – Lasombra', 0.7, 0.14, { color: '#1c1c1e' }),
          G('Vampiro: Chapters – Hecata', 0.7, 0.12, { color: '#1c1c1e' }),
          G('Vampiro: Chapters – The Ministry', 0.7, 0.12, { color: '#1c1c1e' }),
          G('Vampiro: Chapters – Banu Haqim', 0.7, 0.12, { color: '#1c1c1e' }),
          G('Vampiro: Chapters – personajes', 0.6, 0.16, { color: '#1c1c1e', doubt: 'Caja de Chapters sin nombre de clan; ¿un pack de personajes?' }),
          G('Vampiro: Chapters – miniaturas', 0.6, 0.2, { color: '#1c1c1e', doubt: 'Otra caja de Chapters con miniaturas pintadas a la vista.' }),
        ),
        deco(D('boxes', 'Cajas blancas de pie', 0.22, 0.75)),
      ]),
      cube(5, 5, [
        stackOn(
          [
            G('Battlestar Galactica: Amanecer', 0.82, 0.21, { color: '#2a2a2e' }),
            G('Battlestar Galactica: Éxodo', 0.82, 0.2, { color: '#2a2a2e' }),
            G('Battlestar Galactica: Pegasus', 0.82, 0.22, { color: '#2a2a2e' }),
          ],
          stack(G('Cajita azul', 0.12, 0.16, { color: '#2a3a8a', doubt: 'Cajita azul con plástico.' })),
          stack(G('Onus!', 0.48, 0.11, { color: '#ecebe6' }), G('Dos cajitas rojas', 0.36, 0.07, { color: '#8a1f24', doubt: 'Dos cajitas rojas precintadas encima de Onus!.' })),
        ),
      ]),
    ],
  },
]
