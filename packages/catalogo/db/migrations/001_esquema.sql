-- Malkevnia · catálogo y bitácora · esquema inicial (PostgreSQL 16)
--
-- Una sola tabla `items` para todo lo coleccionable (juegos de mesa, rol, pelis, series, libros,
-- manga y videojuegos), muebles/colecciones que los colocan (las Kallax, la estantería, la librería),
-- etiquetas compartidas por items y posts, historial de notas, posts del blog con comentarios
-- moderados, ficheros subidos y la cuenta del capitán para el panel.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() no es IMMUTABLE y no sirve en columnas generadas ni índices; esta envoltura sí.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

/* ------------------------------------------------------------------ catálogo */

CREATE TYPE item_kind AS ENUM ('boardgame', 'rpg', 'film', 'series', 'book', 'manga', 'videogame');

-- owned: lo tengo · wishlist: lo quiero · reading/watching/playing: en curso
-- done: terminado/visto/jugado · paused: aparcado · dropped: abandonado
CREATE TYPE item_status AS ENUM ('owned', 'wishlist', 'reading', 'watching', 'playing', 'done', 'paused', 'dropped');

CREATE TABLE items (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind           item_kind   NOT NULL,
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title          text        NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  original_title text,
  creator        text        NOT NULL DEFAULT '',            -- autor, director, diseñador, estudio…
  year           smallint    CHECK (year BETWEEN 1000 AND 2200),
  synopsis       text        NOT NULL DEFAULT '',
  cover_url      text,
  color          text        CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),  -- color dominante: lomos y cajas generadas
  rating         smallint    CHECK (rating BETWEEN 0 AND 10),  -- nota actual; el historial va en item_ratings
  status         item_status NOT NULL DEFAULT 'owned',
  notes          text        NOT NULL DEFAULT '',            -- notas propias, en Markdown
  featured       boolean     NOT NULL DEFAULT false,
  hidden         boolean     NOT NULL DEFAULT false,         -- oculto en la web pública
  started_on     date,
  finished_on    date,
  -- Identificadores en otras webs: tmdb, imdb, filmaffinity, openlibrary, isbn, goodreads, anilist, bgg, steam, launchbox…
  external_ids   jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(external_ids) = 'object'),
  -- Datos propios de cada tipo: páginas, tomos, plataforma, jugadores, duración…
  meta           jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(meta) = 'object'),
  search         tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A') ||
                   setweight(to_tsvector('simple', f_unaccent(coalesce(original_title, ''))), 'A') ||
                   setweight(to_tsvector('simple', f_unaccent(coalesce(creator, ''))), 'B') ||
                   setweight(to_tsvector('spanish', f_unaccent(coalesce(synopsis, ''))), 'D')
                 ) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);
CREATE INDEX items_kind_status ON items (kind, status) WHERE NOT hidden;
CREATE INDEX items_search ON items USING gin (search);
CREATE INDEX items_title_trgm ON items USING gin (f_unaccent(lower(title)) gin_trgm_ops);
CREATE INDEX items_external_ids ON items USING gin (external_ids jsonb_path_ops);
CREATE TRIGGER items_touch BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Historial de notas: cada vez que cambia items.rating queda apuntado (con reseña opcional).
CREATE TABLE item_ratings (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id   bigint      NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  score     smallint    NOT NULL CHECK (score BETWEEN 0 AND 10),
  review    text        NOT NULL DEFAULT '',
  rated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_ratings_item ON item_ratings (item_id, rated_at DESC);

CREATE OR REPLACE FUNCTION log_item_rating() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rating IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.rating IS DISTINCT FROM OLD.rating) THEN
    INSERT INTO item_ratings (item_id, score) VALUES (NEW.id, NEW.rating);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER items_rating_log AFTER INSERT OR UPDATE OF rating ON items
  FOR EACH ROW EXECUTE FUNCTION log_item_rating();

/* --------------------------------------------------------------- etiquetas */

CREATE TABLE tags (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug  text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name  text NOT NULL,
  color text CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TABLE item_tags (
  item_id bigint NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  tag_id  bigint NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX item_tags_tag ON item_tags (tag_id);

/* ----------------------------------------------------- colecciones y muebles */

-- Una colección es un mueble de la nave (una Kallax, la estantería de pelis, la librería…) o una lista
-- temática ("favoritos de 2026"). `layout` guarda cómo está colocado todo cuando hace falta más detalle
-- que filas y columnas (pilas, cajas de pie, decoración); las cajas se referencian por id de items.
CREATE TYPE collection_kind AS ENUM ('kallax', 'shelf', 'bookcase', 'list');

CREATE TABLE collections (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  kind        collection_kind NOT NULL DEFAULT 'list',
  description text NOT NULL DEFAULT '',
  room        text,                         -- estancia de la nave: sala-recreativa, proyeccion, biblioteca…
  rows        smallint CHECK (rows BETWEEN 1 AND 50),
  cols        smallint CHECK (cols BETWEEN 1 AND 50),
  layout      jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(layout) = 'object'),
  position    integer NOT NULL DEFAULT 0,
  is_public   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER collections_touch BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE collection_items (
  collection_id bigint   NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  item_id       bigint   NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  position      integer  NOT NULL DEFAULT 0,      -- orden dentro de la colección (o del hueco)
  row           smallint,                         -- hueco del mueble (1 = arriba), si aplica
  col           smallint,                         -- 1 = izquierda
  placement     text NOT NULL DEFAULT '',         -- "de pie, segunda por la izquierda", "encima de la pila"…
  note          text NOT NULL DEFAULT '',
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX collection_items_item ON collection_items (item_id);
CREATE INDEX collection_items_order ON collection_items (collection_id, row, col, position);

/* ------------------------------------------------------------------- blog */

CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'published');

CREATE TABLE posts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',       -- entradilla / meta description
  content_html  text NOT NULL DEFAULT '',       -- lo que se pinta
  content_json  jsonb,                          -- documento de TipTap, para volver a editar sin pérdidas
  cover_url     text,
  category      text NOT NULL DEFAULT 'Bitácora',
  status        post_status NOT NULL DEFAULT 'draft',
  published_at  timestamptz,                    -- para scheduled: cuándo sale
  legacy_path   text UNIQUE,                    -- /blog/2026/05/25/slug/ de Jekyll, para no romper enlaces
  allow_comments boolean NOT NULL DEFAULT true,
  word_count    integer NOT NULL DEFAULT 0,
  search        tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('spanish', f_unaccent(coalesce(title, ''))), 'A') ||
                  setweight(to_tsvector('spanish', f_unaccent(coalesce(description, ''))), 'B') ||
                  setweight(to_tsvector('spanish', f_unaccent(regexp_replace(coalesce(content_html, ''), '<[^>]+>', ' ', 'g'))), 'D')
                ) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX posts_published ON posts (published_at DESC) WHERE status <> 'draft';
CREATE INDEX posts_search ON posts USING gin (search);
CREATE TRIGGER posts_touch BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE post_tags (
  post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  tag_id  bigint NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX post_tags_tag ON post_tags (tag_id);

-- Un post se puede enlazar a cosas del catálogo ("la reseña de este libro").
CREATE TABLE post_items (
  post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  item_id bigint NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, item_id)
);
CREATE INDEX post_items_item ON post_items (item_id);

CREATE TYPE comment_status AS ENUM ('pending', 'visible', 'hidden', 'spam');

CREATE TABLE comments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id     bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  parent_id   bigint REFERENCES comments (id) ON DELETE CASCADE,
  author      text NOT NULL CHECK (length(author) BETWEEN 1 AND 80),
  email       text,                              -- nunca sale por la API pública
  website     text,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  status      comment_status NOT NULL DEFAULT 'pending',
  is_captain  boolean NOT NULL DEFAULT false,    -- respuestas escritas desde el panel
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post ON comments (post_id, created_at) WHERE status = 'visible';
CREATE INDEX comments_pending ON comments (created_at) WHERE status = 'pending';

/* ------------------------------------------------------- ficheros y panel */

CREATE TABLE media (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path        text NOT NULL UNIQUE,              -- relativa a UPLOADS_DIR; se sirve en /uploads/<path>
  mime        text NOT NULL,
  bytes       integer NOT NULL,
  width       integer,
  height      integer,
  alt         text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Una sola cuenta (el capitán), pero en tabla por si algún día hay tripulación.
CREATE TABLE admin_users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  token_hash  text PRIMARY KEY,                   -- sha256 del token de la cookie
  user_id     bigint NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  user_agent  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions (expires_at);

/* ------------------------------------------------------------------ vistas */

-- Lo que puede ver cualquiera: posts publicados (incluidos los programados cuya hora ya pasó).
CREATE VIEW public_posts AS
  SELECT p.*, coalesce(p.legacy_path,
           '/blog/' || to_char(p.published_at AT TIME ZONE 'Europe/Madrid', 'YYYY/MM/DD') || '/' || p.slug || '/') AS path
  FROM posts p
  WHERE p.status <> 'draft' AND p.published_at <= now();
