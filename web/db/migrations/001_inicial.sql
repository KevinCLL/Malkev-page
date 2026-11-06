-- Esquema inicial de La Malkevnia.

-- Bitácora (blog)
create table entradas (
  id            bigserial primary key,
  slug          text not null unique,
  titulo        text not null,
  descripcion   text not null default '',
  html          text not null default '',
  -- Documento del editor enriquecido (TipTap/ProseMirror) cuando se escriba desde la consola
  documento     jsonb,
  etiquetas     text[] not null default '{}',
  portada       text,
  minutos       integer,
  url_antigua   text,
  publicado_en  timestamptz,           -- null = borrador
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index entradas_publicado_en on entradas (publicado_en desc);

create table comentarios (
  id          bigserial primary key,
  entrada_id  bigint not null references entradas (id) on delete cascade,
  autor       text not null,
  texto       text not null,
  aprobado    boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index comentarios_entrada on comentarios (entrada_id, aprobado);

-- Colecciones: juegos de mesa, videojuegos, películas, series, libros, manga
create table piezas (
  id          bigserial primary key,
  tipo        text not null check (tipo in ('juego-de-mesa', 'videojuego', 'pelicula', 'serie', 'libro', 'manga')),
  slug        text not null,
  titulo      text not null,
  autoria     text,                    -- autor, director, editorial…
  anyo        integer,
  portada     text,
  estado      text,                    -- p. ej. pendiente, jugado, visto, leído
  nota        numeric(3, 1) check (nota between 0 and 10),
  resena      text,
  -- Dónde está en la nave: { "mueble": "kallax-1", "cubo": "B3" }, estantería, etc.
  ubicacion   jsonb,
  -- Datos de la fuente externa (BGG, TMDB, Open Library…) y lo que no tenga columna propia
  datos       jsonb not null default '{}',
  fuente      text,
  fuente_id   text,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tipo, slug)
);
create index piezas_tipo on piezas (tipo, titulo);
