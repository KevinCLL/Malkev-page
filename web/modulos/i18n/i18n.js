/*
 * La Malkevnia · idiomas y preferencias para los módulos de la nave.
 *
 * La web lo mete sola al principio de cada página HTML de /modulos/ (no hace falta tocar
 * nada para que funcione), pero también se puede incluir a mano:
 *   <script src="../i18n/i18n.js"></script>
 *
 * Qué hace:
 *  1. Idioma: ?lang=en en la URL (lo pone la web), si no el último elegido en la web
 *     (localStorage "malkevnia:idioma") y si no español. En español no cambia nada.
 *  2. Traducción automática: en inglés, cambia por su traducción cada texto en español que
 *     esté en textos.json, tal cual: texto de la página, atributos (title, aria-label,
 *     placeholder, alt), lo que se añada después (MutationObserver) y el texto que se
 *     dibuja en un <canvas> (fillText, strokeText y measureText).
 *  3. Movimiento reducido ("modo calma"): prefers-reduced-motion o el botón Calma de la web
 *     (localStorage "malkevnia:movimiento"). Corta las animaciones CSS y avisa al módulo.
 *  4. Lectores de pantalla: anuncia la sala o el modo al cambiar (eventos malkevnia:room y
 *     malkevnia:mode de la nave) y ofrece anunciar(texto).
 *
 * API en window.MalkevniaI18n:
 *   idioma                      'es' | 'en'
 *   t('Texto en español', vars) traducción (con {variables}); en español, el mismo texto
 *   traducir(texto)             como t() pero sin variables y con las reglas automáticas
 *   aplicar(nodo)               vuelve a traducir un trozo del DOM
 *   preferencias()              { idioma, movimientoReducido }
 *   alCambiar(fn)               fn(preferencias) cuando cambian; devuelve la baja
 *   anunciar(texto)             mensaje para lectores de pantalla
 *   listo                       promesa: textos cargados
 * Y el evento "malkevnia:preferencias" en window con las preferencias en detail.
 */
(function () {
  'use strict';
  if (window.MalkevniaI18n) return;

  var IDIOMAS = ['es', 'en'];
  var CLAVE_IDIOMA = 'malkevnia:idioma';
  var CLAVE_MOVIMIENTO = 'malkevnia:movimiento';
  var ATRIBUTOS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext'];
  var IGNORAR = 'script,style,textarea,code,pre,noscript,template,[translate="no"],.notranslate,[data-i18n-no],[contenteditable=""],[contenteditable="true"]';
  var LETRA = /[A-Za-zÀ-ÿ]/;

  var script = document.currentScript;
  var rutaModulo = location.pathname.match(/\/modulos\/([a-z0-9-]+)\//);
  var moduloActual = (script && script.dataset.modulo) || (rutaModulo ? rutaModulo[1] : '');
  var leer = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };

  var precargado = window.MALKEVNIA_TEXTOS || null;
  var idioma = [new URLSearchParams(location.search).get('lang'), precargado && precargado.idioma, leer(CLAVE_IDIOMA), 'es']
    .filter(function (x) { return x && IDIOMAS.indexOf(x) >= 0; })[0];

  /* ------------------------------------------------------------------ diccionario */
  var claves = new Map();    // clave tal cual (normalizada) → traducción, para t()
  var exactas = new Map();   // texto → traducción
  var plegadas = new Map();  // texto en minúsculas → traducción (EMBARCAR ≈ Embarcar)
  var html = new Map();      // innerHTML normalizado → traducción (textos con etiquetas)
  var patrones = [];         // textos con {variables}
  var memoria = new Map();

  var normalizar = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };
  var escapar = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var rellenar = function (s, vars) {
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? String(vars[k]) : m; }) : s;
  };
  var serializar = function (fragmento) {
    var tpl = document.createElement('template');
    tpl.innerHTML = fragmento;
    return normalizar(tpl.innerHTML);
  };

  function cargar(bloque) {
    if (!bloque) return;
    var espacios = Object.keys(bloque);
    // Prioridad: el módulo actual, luego los demás módulos, salas y por último comun.
    var orden = [moduloActual].concat(espacios.filter(function (e) { return e !== moduloActual && e !== 'comun' && e !== 'salas'; }), ['salas', 'comun']);
    orden.reverse().forEach(function (e) {
      var d = bloque[e];
      if (!d || typeof d !== 'object') return;
      Object.keys(d).forEach(function (es) {
        var en = d[es];
        if (typeof en !== 'string' || !en || es.charAt(0) === '$') return;
        var k = normalizar(es);
        claves.set(k, en);
        if (/\{\w+\}/.test(k)) {
          var nombres = [];
          var re = k.split(/(\{\w+\})/).map(function (p) {
            var m = p.match(/^\{(\w+)\}$/);
            if (m) { nombres.push(m[1]); return '(.+?)'; }
            return escapar(p);
          }).join('');
          patrones.push({ re: new RegExp('^' + re + '$'), en: en, nombres: nombres, peso: k.replace(/\{\w+\}/g, '').length });
        } else if (/<[a-z][^>]*>/i.test(k)) {
          html.set(serializar(k), en);
        } else {
          exactas.set(k, en);
          plegadas.set(k.toLowerCase(), en);
        }
      });
    });
    patrones.sort(function (a, b) { return b.peso - a.peso; });
    memoria.clear();
  }

  function mayusculas(original, traduccion) {
    var letras = original.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letras.length > 1 && letras === letras.toUpperCase()) return traduccion.toUpperCase();
    return traduccion;
  }

  function buscar(k) {
    var r = exactas.get(k);
    if (r !== undefined) return r;
    r = plegadas.get(k.toLowerCase());
    if (r !== undefined) return mayusculas(k, r);
    for (var i = 0; i < patrones.length; i++) {
      var p = patrones[i];
      var m = k.match(p.re);
      if (!m) continue;
      var vars = {};
      p.nombres.forEach(function (n, j) { var v = m[j + 1]; vars[n] = exactas.has(v) ? exactas.get(v) : v; });
      return rellenar(p.en, vars);
    }
    // "◂ Puente", "Cargando…", "1. Biblioteca": se traduce el núcleo y se conservan los bordes.
    var bordes = k.match(/^([^A-Za-zÀ-ÿ]*)(.*?)([^A-Za-zÀ-ÿ]*)$/);
    if (bordes && (bordes[1] || bordes[3]) && bordes[2] && bordes[2] !== k) {
      var nucleo = exactas.get(bordes[2]);
      if (nucleo === undefined) {
        nucleo = plegadas.get(bordes[2].toLowerCase());
        if (nucleo !== undefined) nucleo = mayusculas(bordes[2], nucleo);
      }
      if (nucleo !== undefined) return bordes[1] + nucleo + bordes[3];
    }
    return null;
  }

  function traducir(texto) {
    if (idioma === 'es' || typeof texto !== 'string' || !LETRA.test(texto)) return texto;
    var k = normalizar(texto);
    var r;
    if (memoria.has(k)) r = memoria.get(k);
    else {
      r = buscar(k);
      if (memoria.size > 5000) memoria.clear();
      memoria.set(k, r);
    }
    if (r == null || r === k) return texto;
    return texto.match(/^\s*/)[0] + r + texto.match(/\s*$/)[0];
  }

  function t(es, vars) {
    if (idioma === 'es') return rellenar(es, vars);
    var r = claves.get(normalizar(es));
    return r !== undefined ? rellenar(r, vars) : rellenar(traducir(es), vars);
  }

  /* ------------------------------------------------------------------ DOM */
  function ignorado(el) { return !el || (el.closest && el.closest(IGNORAR)); }

  function procesarTexto(nodo) {
    if (ignorado(nodo.parentElement)) return;
    var antes = nodo.nodeValue;
    var despues = traducir(antes);
    if (despues !== antes) nodo.nodeValue = despues;
  }

  function procesarHtml(el) {
    if (!html.size || !el.childElementCount || el.innerHTML.length > 4000 || ignorado(el)) return false;
    var r = html.get(normalizar(el.innerHTML));
    if (r === undefined) return false;
    el.innerHTML = r;
    return true;
  }

  function procesarElemento(el) {
    if (ignorado(el)) return;
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var v = el.getAttribute(ATRIBUTOS[i]);
      if (v) {
        var n = traducir(v);
        if (n !== v) el.setAttribute(ATRIBUTOS[i], n);
      }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      var nv = traducir(el.value);
      if (nv !== el.value) el.value = nv;
    }
  }

  function aplicar(raiz) {
    if (idioma === 'es' || !raiz) return;
    if (raiz.nodeType === 3) return procesarTexto(raiz);
    if (raiz.nodeType === 1) {
      if (procesarHtml(raiz)) return;
      procesarElemento(raiz);
    } else if (raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) procesarTexto(n);
      else if (!procesarHtml(n)) procesarElemento(n);
    }
  }

  var observando = false;
  function observar() {
    if (observando || idioma === 'es') return;
    observando = true;
    new MutationObserver(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var m = lista[i];
        if (m.type === 'characterData') procesarTexto(m.target);
        else if (m.type === 'attributes') procesarElemento(m.target);
        else {
          if (m.target.nodeType === 1 && procesarHtml(m.target)) continue;
          for (var j = 0; j < m.addedNodes.length; j++) aplicar(m.addedNodes[j]);
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  // Texto dibujado en canvas (HUD, carteles de las salas, el plano…).
  function parchearCanvas(proto) {
    if (!proto || proto.__malkevniaI18n) return;
    proto.__malkevniaI18n = true;
    ['fillText', 'strokeText', 'measureText'].forEach(function (metodo) {
      var original = proto[metodo];
      if (typeof original !== 'function') return;
      proto[metodo] = function (texto) {
        var args = Array.prototype.slice.call(arguments);
        if (typeof texto === 'string') args[0] = traducir(texto);
        return original.apply(this, args);
      };
    });
  }

  /* ------------------------------------------------------------------ preferencias */
  var consultaMovimiento = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var suscritos = [];
  var estiloCalma = null;

  function movimientoReducido() {
    var v = leer(CLAVE_MOVIMIENTO);
    if (v === 'reducido') return true;
    if (v === 'normal') return false;
    return !!(consultaMovimiento && consultaMovimiento.matches);
  }
  function preferencias() { return { idioma: idioma, movimientoReducido: movimientoReducido() }; }

  function aplicarMovimiento() {
    var reducido = movimientoReducido();
    document.documentElement.setAttribute('data-movimiento', reducido ? 'reducido' : 'normal');
    if (reducido && !estiloCalma) {
      estiloCalma = document.createElement('style');
      estiloCalma.setAttribute('data-malkevnia-calma', '');
      // Duración casi cero (no "none"): lo que aparece con una animación queda en su estado final.
      estiloCalma.textContent = '*,*::before,*::after{animation-duration:.001ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0s!important;scroll-behavior:auto!important}';
      (document.head || document.documentElement).appendChild(estiloCalma);
    } else if (!reducido && estiloCalma) {
      estiloCalma.remove();
      estiloCalma = null;
    }
  }

  function avisar() {
    aplicarMovimiento();
    var p = preferencias();
    suscritos.slice().forEach(function (fn) { try { fn(p); } catch (e) { console.error(e); } });
    window.dispatchEvent(new CustomEvent('malkevnia:preferencias', { detail: p }));
  }
  function alCambiar(fn) {
    suscritos.push(fn);
    return function () { suscritos = suscritos.filter(function (x) { return x !== fn; }); };
  }

  window.addEventListener('storage', function (e) { if (e.key === CLAVE_MOVIMIENTO) avisar(); });
  if (consultaMovimiento && consultaMovimiento.addEventListener) consultaMovimiento.addEventListener('change', avisar);
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.origin === location.origin && d && d.fuente === 'malkevnia' && d.evento === 'preferencias') avisar();
  });

  /* ------------------------------------------------------------------ lectores de pantalla */
  var region = null;
  function anunciar(texto) {
    if (!texto || !document.body) return;
    if (!region) {
      region = document.createElement('div');
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('data-i18n-no', '');
      region.style.cssText = 'position:fixed;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0';
      document.body.appendChild(region);
    }
    region.textContent = '';
    setTimeout(function () { region.textContent = texto; }, 60);
  }

  var MODOS = { universo: 'Modo universo', superficie: 'En la superficie del planeta', vuelo: 'Modo de vuelo', nave: 'De vuelta en la nave' };
  window.addEventListener('malkevnia:room', function (e) {
    var d = e.detail;
    var id = d && typeof d === 'object' ? d.id : d;
    var sala = window.Malkevnia && window.Malkevnia.rooms && window.Malkevnia.rooms[id];
    var nombre = (sala && sala.name) || '';
    if (nombre) anunciar(t('Estás en: {sala}', { sala: traducir(nombre) }));
  });
  window.addEventListener('malkevnia:mode', function (e) {
    var m = e.detail && MODOS[e.detail.mode];
    if (m) anunciar(t(m));
  });

  /* ------------------------------------------------------------------ arranque */
  var listo;
  if (idioma === 'es') {
    listo = Promise.resolve();
  } else {
    document.documentElement.lang = idioma;
    parchearCanvas(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype);
    parchearCanvas(window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype);
    if (precargado && precargado.idioma === idioma && precargado.textos) {
      cargar(precargado.textos);
      listo = Promise.resolve();
    } else {
      // Sin los textos precargados (módulo abierto suelto): se piden y se traduce al llegar.
      var url = new URL('textos.json', (script && script.src) || location.href);
      listo = fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (datos) {
        if (datos) cargar(datos[idioma]);
      }).catch(function (e) { console.warn('[i18n]', e); });
    }
    observar();
    listo.then(function () { aplicar(document); });
  }
  aplicarMovimiento();

  window.MalkevniaI18n = {
    version: 1,
    idioma: idioma,
    t: t,
    traducir: traducir,
    aplicar: function (nodo) { aplicar(nodo || document); },
    preferencias: preferencias,
    alCambiar: alCambiar,
    anunciar: anunciar,
    listo: listo,
  };
})();
