# Guide Universitarie — note di progetto

Portale di guide pratiche per esame (Medicina, Università di Pavia), scritte dai
rappresentanti degli studenti. Sito statico Astro con contenuti YAML gestiti da
Decap CMS; feedback degli studenti (oggi: tempo di studio) su Supabase.
Utenti in gran parte da telefono: **mobile first**. Tutto il codice, i commenti
e i testi sono in italiano.

## Stack e comandi

- Astro 5 (`output: 'static'`) + TypeScript, deploy su Netlify (Node 22, vedi `netlify.toml`).
- Decap CMS (`/admin/`) + Netlify Identity + Git Gateway: solo i rappresentanti, su invito.
- Supabase (progetto `zbdovlgoincjtjvmesft`): auth Google degli studenti e dati dei feedback.

```bash
npm run dev        # http://localhost:4321  (anche /dev/istogramma)
npm run build      # astro check + astro build + pagefind: deve chiudersi con 0 errori/warning
npm run preview    # serve dist/: l'unico modo per provare la ricerca in locale
npm run cms:local  # proxy Decap per /admin/ in locale
```

Contesti Netlify (`process.env.CONTEXT`): `production`, `deploy-preview`, `branch-deploy`.
Le pagine in `src/pages/dev/` esistono in dev e nelle anteprime, mai in produzione.

## Mappa del codice

- `src/content/config.ts` — schema Zod della collection `guide` (YAML in `src/content/guide/`).
- `src/lib/` — logica condivisa: `fasce.ts` (fasce tempo di studio, usabile anche nel
  browser), `histogram.ts`, `guide.ts` (CFU, tipi esame, tempo breve), `ids.ts`
  (unicità id, ancore moduli), `anni.ts` (slug degli anni), `supabase-config.ts` (URL,
  chiave publishable, dominio: senza dipendenze), `supabase.ts` (client, importato solo
  dinamicamente), `auth.ts` (accesso Google: non scarica supabase-js se non c'è una sessione),
  `fx.ts` (micro-animazioni), `markdown.ts` (sanitizzazione).
- `src/components/common/` — header, footer, icone pixel, account, benvenuto.
- `src/components/guide/` — intestazione guida, schede moduli, scheda esame, sezioni, `GuideList` (pannelli guida per `/guide/` e `/anni/`).
- `src/components/feedback/` — `StudyTimeHistogram.astro` (modalità collegata o statica).
- `src/components/home/` — caselle degli anni, lettera dei creatori.
- `src/pages/` — home, `/guide/`, `/guide/[slug]/`, `/anni/[anno]/`, `/dev/[page]/`.
- Ricerca: Pagefind (`SearchBox.astro`, in home e `/guide/`). Indicizza solo `data-pagefind-body`
  (l'`article` delle guide); escludere con `data-pagefind-ignore` ciò che non è contenuto (schede,
  istogramma, info da verificare). Metadato `anno` per il chip colorato. L'indice esiste solo dopo
  la build: in `npm run dev` la ricerca risponde "non disponibile".
- `supabase/migrations/` — SQL applicato al progetto, in ordine.

## Regole sui contenuti

- Ogni nuovo campo dello schema è **opzionale**: gli YAML esistenti devono continuare a validare.
- **Fonte dei contenuti: le schede Notion** (export in `NOTION/`, non versionato), importate con
  `node scripts/importa-notion.mjs` (`--elenco`, `--dry`, `--solo "Titolo"`, `--rifai`; chiave
  `OPENROUTER_API_KEY` in `.env`). Modello `deepseek/deepseek-v4.1-flash` via OpenRouter con schema
  JSON vincolato; anno, autore (`aggiornato_da`), `id` e date li decide il codice; validazione zod +
  controllo su numeri/link non presenti nella scheda; cache in `.cache/` (rilanci senza costi).
  Si importano solo le schede "Fatto" con contenuto; le guide esistenti con lo stesso titolo vengono
  sostituite **mantenendo `id` e nome file**. I segnaposto del vecchio sito sono stati tolti; gli `id`
  di guide tolte ma con voti su Supabase stanno in `scripts/id-riservati.json` e l'import li riusa
  quando arriva la scheda con quel titolo. Non cancellare guide con voti senza riservarne gli `id`.
- Tempo di studio = istogramma, **sempre per modulo**: `study_time` per modulo solo se la scheda lo dà per
  quel modulo; un tempo unico per un esame integrato va in `descrizione_generale`, mai copiato sui moduli.
  `fascia_studio` (etichetta RAPPR.) la calcola il codice con `fasciaDaGiorni` (`src/lib/fasce.ts`),
  mai il modello.
- `id` guida `g-xxxxxxxx`, `id` modulo `m-xxxxxxxx`: stabili, immutabili, distinti da titolo/slug,
  chiave dei feedback. Unicità verificata in build (`assertUniqueIds`). In Decap li genera il
  widget `readonly-id` (`public/admin/index.html`).
- Le fasce del tempo di studio vanno tenute identiche in tre punti:
  `src/lib/fasce.ts`, `public/admin/config.yml` (`fascia_studio`), check SQL su `study_time_votes.fascia`.
- Il Markdown dei campi narrativi passa sempre da `SafeMarkdown` (whitelist ristretta).
- La lettera in home (`src/components/home/LetteraMission.astro`) si modifica **solo nel codice**,
  non da Decap. Il testo definitivo lo forniscono i creatori.

## Design system (pixel art)

- Token CSS su `:root` in `src/styles/global.css`; unità "pixel" = 4px: tutte le misure sono multipli interi.
- Font self-hosted (`@fontsource`): Pixelify Sans **500** per i titoli, Silkscreen per le etichette
  **solo a multipli di 8px** (16px; è una bitmap su griglia 8), Atkinson Hyperlegible Next 16px/1.5
  per il corpo. Il corpo del testo non è mai in font pixel.
- Nessun `border-radius`. Bordo a scalini con `.px-border` (+ `--off`, `--warn`), margine laterale 4px.
- **Mondi**: ogni anno è un "mondo" con palette, icona e terreno propri (I prato, II deserto,
  III mare, IV ghiaccio, V vulcano, VI castello = laurea), definito solo in `src/lib/mondi.ts`
  (colori Sweetie 16 + lilla `#d59ef0`). I mondi **non hanno nomi visibili**: in pagina solo l'anno.
  `stileMondo(anno)` imposta `--mondo` (fondo), `--mondo-ink` (testo sul fondo, ≥ 5:1) e
  `--mondo-chiaro` (sul fondo pagina, ≥ 6:1; colora gli h2). Terreno pixel: `.terreno[data-terreno]`
  in `global.css`. Link, pulsanti e focus restano nel giallo accento ovunque. Anteprima: `/dev/mondi`.
- Animazioni sempre a scatti (`steps()`), mai fluide; tutte spente con `prefers-reduced-motion`.
  Le micro-animazioni di feedback passano da `src/lib/fx.ts` (anche `vibra()`, solo Android).
- **Animazioni pensate per il telefono**: mai affidare un effetto al solo `:hover`. Gli effetti di
  passaggio del mouse stanno sempre in `@media (hover: hover) and (pointer: fine)`; sul telefono
  valgono `:active` (pressione 4px), la comparsa allo scorrimento (`data-rivela`, `src/lib/rivela.ts`)
  e le View Transitions fra pagine (nomi condivisi: `vtMondo()` casella↔banner, `guida-<id>`
  card↔titolo; nomi unici per pagina). Su desktop i loop infiniti si fermano dopo pochi giri.
- Accessibilità: contrasto testo ≥ 4.5:1, focus visibile (outline 2px accento), target ≥ 44px,
  HTML semantico, stato mai affidato al solo colore, fallback `forced-colors` (i box-shadow spariscono:
  servono outline veri).
- Verifica visiva: Chrome headless via CDP a 375px (il `--window-size` headless non scende sotto 500px).

## Backend Supabase

- `public.study_time_votes` — un voto per (`modulo_id`, `user_id`), RLS: ognuno legge/scrive solo il
  proprio, e solo con email `@universitadipavia.it`. Grant minimi (insert `modulo_id, fascia`; update `fascia`).
- `public.cast_study_time_vote(modulo, fascia)` — `SECURITY INVOKER`, insert o sovrascrittura.
- `public.study_time_counts(modulo)` — `SECURITY DEFINER` **voluto**: restituisce solo i conteggi per
  fascia, solo a utenti autenticati d'ateneo.
- `public.hook_solo_account_ateneo(event)` — hook Auth "Before User Created": rifiuta domini diversi.
- **Regola: extra = feedback = solo per chi ha fatto l'accesso.** Ogni nuovo feedback segue lo stesso
  modello (dati su Supabase, niente accesso `anon`), non si nasconde contenuto statico via JS.
- Migrazioni: scrivere il file in `supabase/migrations/<timestamp>_<nome>.sql`, applicarlo con lo
  stesso SQL via MCP (`apply_migration`), poi `get_advisors` (security + performance). Non modificare
  migrazioni già applicate: se serve, una nuova migrazione.
- Test delle policy: blocco `DO` che simula ruoli con `set local role` + `request.jwt.claims` e chiude
  con `raise exception` per fare rollback (nessun dato di prova resta nel DB).
- Nel client solo la chiave **publishable** (`src/lib/supabase.ts`). Mai secret / service_role nel repo.

## Accesso studenti (Google)

- `signInWithOAuth` Google con `hd=universitadipavia.it` (solo un suggerimento: il vincolo vero è
  hook + RLS), flusso PKCE, ritorno sulla pagina corrente. Tutto passa da `src/lib/auth.ts`.
- Accesso facoltativo, proposto una volta per sessione del browser (`BenvenutoAccesso`); necessario
  per vedere e dare feedback.
- Configurazione da dashboard (non versionata): provider Google (Client ID/secret da Google Cloud,
  app "In production"), Site URL `https://guide-pratiche.netlify.app`, Redirect URLs
  `https://guide-pratiche.netlify.app/**`, `https://*--guide-pratiche.netlify.app/**`,
  `http://localhost:4321/**`, hook "Before User Created" → `public.hook_solo_account_ateneo`.

## Flusso di lavoro

- Branch + PR verso `main`; nessun commit diretto su `main`. Il merge su `main` = produzione.
- `npm run build` pulito prima di ogni commit.
- `.agents/`, `.claude/`, `.mcp.json`, `skills-lock.json` (skill e MCP installati in locale): non
  committarli senza chiedere.

## Aperto

- Testo della lettera (firme già inserite: Francesco Ruspino, Alessandro Gavino Previtera).
- Configurazione Google + hook in dashboard Supabase, poi prova del voto reale sul deploy preview.
- Merge della PR #1 (`redesign-pixel`).
