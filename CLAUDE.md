# HowToGolgi — note di progetto

**HowToGolgi** (nome deciso il 2026-10-07; in Silkscreen "HOWTO" + "GOLGI" in giallo): portale di guide
pratiche per esame (Medicina, Università di Pavia), scritte dai
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

Dominio: **https://howtogolgi.it** (registrato su GoDaddy, `site` in `astro.config.mjs`); il sito Netlify
resta `guide-pratiche` (anteprime su `*--guide-pratiche.netlify.app`).
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
- **Contenuti iniziali: le schede Notion** (export in `NOTION/`, non versionato), importate con
  `node scripts/importa-notion.mjs` (`--elenco`, `--dry`, `--solo "Titolo"`, `--rifai`, `--aggiorna`; chiave
  `OPENROUTER_API_KEY` in `.env`). Modello `deepseek/deepseek-v4.1-flash` via OpenRouter con schema
  JSON vincolato; anno, autore (`aggiornato_da`), `id` e date li decide il codice; validazione zod +
  controllo su numeri/link non presenti nella scheda; cache in `.cache/` (rilanci senza costi).
  Si importano solo le schede "Fatto" con contenuto e non ancora nel sito (con `--aggiorna` una guida
  esistente viene riscritta **mantenendo `id` e nome file**). Dopo l'import, le guide si modificano in Decap. I segnaposto del vecchio sito sono stati tolti; gli `id`
  di guide tolte ma con voti su Supabase stanno in `scripts/id-riservati.json` e l'import li riusa
  quando arriva la scheda con quel titolo. Non cancellare guide con voti senza riservarne gli `id`.
- **Documenti Word dei rappresentanti** (un .docx per anno, un esame per titolo in MAIUSCOLO, sezioni
  numerate 1–9): stessa pipeline con `--docx "III anno.docx" "IV anno.docx"` (+ `--aggiorna` per le guide
  esistenti; usa `textutil`, quindi macOS). Il modello non copia il syllabus ufficiale (poi
  `programmi-ufficiali.mjs` mette il Programma del catalogo e sposta le note in "Sul programma"), usa i
  nomi dei moduli esistenti (gli `id` dei voti si abbinano per nome) e trasforma "[DA INTEGRARE]" in
  "Informazioni da verificare". Titolo, codice ESSE3, CFU, autore e link restano quelli del sito.
  Dopo l'import: `node scripts/programmi-ufficiali.mjs`, poi rileggere le guide toccate.
- Tempo di studio e difficoltà **mostrati sono solo quelli votati dagli studenti** (feedback, extra):
  le stime scritte nelle guide (`study_time`, `fascia_studio`, `difficolta`) restano nei dati ma non si
  mostrano più (niente etichetta RAPPR. nell'istogramma). L'import continua a compilarle per modulo
  (`fascia_studio` calcolata dal codice con `fasciaDaGiorni`, mai dal modello); un tempo unico per un
  esame integrato va in `descrizione_generale`, mai copiato sui moduli.
- `id` guida `g-xxxxxxxx`, `id` modulo `m-xxxxxxxx`: stabili, immutabili, distinti da titolo/slug,
  chiave dei feedback. Unicità verificata in build (`assertUniqueIds`). In Decap li genera il
  widget `readonly-id` (`public/admin/index.html`).
- Le fasce del tempo di studio vanno tenute identiche in tre punti:
  `src/lib/fasce.ts`, `public/admin/config.yml` (`fascia_studio`), check SQL su `study_time_votes.fascia`.
- Il Markdown dei campi narrativi passa sempre da `SafeMarkdown` (whitelist ristretta).
- La lettera in home (`src/components/home/LetteraMission.astro`) si modifica **solo nel codice**,
  non da Decap: due temi, l'organizzazione che semplifica la vita e un progetto apolitico nato dalla collaborazione.

## Design system (pixel art)

- Token CSS su `:root` in `src/styles/global.css`; unità "pixel" = 4px: tutte le misure sono multipli interi.
- Font self-hosted (`@fontsource`): Pixelify Sans **500** per i titoli, Silkscreen per le etichette
  **solo a multipli di 8px** (16px; è una bitmap su griglia 8), Atkinson Hyperlegible Next 16px/1.5
  per il corpo. Il corpo del testo non è mai in font pixel.
- Nessun `border-radius`. Bordo a scalini con `.px-border` (+ `--off`, `--warn`), margine laterale 4px.
- **Mondi**: ogni anno è un "mondo" ispirato alle sue materie (I aula di anatomia, II fisiologia,
  III laboratorio, IV radiologia e farmaci, V reparto, VI sala operatoria e laurea), definito in
  `src/lib/mondi.ts`: colori (Sweetie 16 + lilla `#d59ef0`), icona, terreno e scena. I mondi **non
  hanno nomi visibili**: in pagina solo l'anno. `stileMondo(anno)` imposta `--mondo`, `--mondo-ink`
  (testo sul fondo, ≥ 5:1) e `--mondo-chiaro` (sul fondo pagina, ≥ 6:1; colora gli h2). Link,
  pulsanti e focus restano nel giallo accento ovunque. Anteprima di tutti i mondi: `/dev/mondi`.
- **Scene animate** (caselle in home e banner delle pagine anno): `node scripts/mondi/genera-scene.mjs`
  disegna in codice ogni scena su griglia di pixel vera (144×60, solo colori della palette; oggetti a
  destra, testo a sinistra) e scrive in `src/assets/mondi/` sprite sheet a 6 fotogrammi, versione
  spenta (anni senza guide) e fondale ripetibile 48×60. `ScenaMondo.astro` le mostra a 2× con
  `steps()`, solo mentre sono sullo schermo; testi sopra con `.testo-su-scena`. I terreni
  (`.terreno[data-terreno]`, striscia in testa alle guide) riprendono il pavimento della scena.
- Accessibilità: contrasto testo ≥ 4.5:1, focus visibile (outline 2px accento), target ≥ 44px,
  HTML semantico, stato mai affidato al solo colore, fallback `forced-colors` (i box-shadow spariscono:
  servono outline veri).
- Verifica visiva: Chrome headless via CDP a 375px (il `--window-size` headless non scende sotto 500px).

## Backend Supabase

- `public.module_feedback` — tutti i feedback per modulo: un voto per (`modulo_id`, `user_id`, `tipo`),
  `tipo` ∈ `tempo_studio` (valori = `FASCE_STUDIO`, `src/lib/fasce.ts`) | `difficolta` (valori = `LIVELLI`,
  `src/lib/difficolta.ts`); i valori ammessi sono anche in un check SQL. RLS: ognuno legge/scrive solo il
  proprio, e solo con email `@universitadipavia.it`. Grant minimi (insert `modulo_id, tipo, valore`;
  update `valore`). Un nuovo tipo di feedback = nuovo valore nel check + nuova UI, stessa tabella.
- `public.cast_feedback(modulo, tipo, valore)` — `SECURITY INVOKER`, insert o sovrascrittura.
- `public.feedback_counts(moduli[], tipo)` — `SECURITY DEFINER` **voluto**: solo conteggi per valore, per
  più moduli in una chiamata, solo a utenti autenticati d'ateneo. Lato client tutto passa da
  `src/lib/feedback.ts` (cache + evento `feedback:aggiornato`).
- `public.study_time_votes_legacy` — archivio chiuso dei primi voti (copiati in `module_feedback`).
- **Verdetti dei feedback** (`src/lib/verdetto.ts`): mediana superiore dei voti (in equilibrio pende verso
  più tempo / più difficile), solo da 5 risposte, con la distribuzione visibile. Difficoltà =
  Facile/Medio/Difficile/Estremo (1–4 teschietti). Pannello "Parere degli studenti" per modulo; scheda
  esame e card mostrano il verdetto con accesso (card: modulo "peggiore"), il lucchetto senza.
  Dopo il voto le altre scelte spariscono: restano quella fatta e "Cambia voto" (classe `.cambia-voto`).
- `public.elimina_account()` — `SECURITY DEFINER` **voluto** (l'utente non può cancellare `auth.users`):
  senza parametri, cancella solo `auth.uid()` e a cascata i suoi feedback; niente `anon`. Pulsante in
  `/privacy/#elimina` (`EliminaAccount.astro`, `eliminaAccount()` in `src/lib/auth.ts`).
- `public.hook_solo_account_ateneo(event)` — hook Auth "Before User Created": rifiuta domini diversi.
- **Regola: extra = feedback = solo per chi ha fatto l'accesso.** Ogni nuovo feedback segue lo stesso
  modello (dati su Supabase, niente accesso `anon`), non si nasconde contenuto statico via JS.
- Migrazioni: scrivere il file in `supabase/migrations/<timestamp>_<nome>.sql`, applicarlo con lo
  stesso SQL via MCP (`apply_migration`), poi `get_advisors` (security + performance). Non modificare
  migrazioni già applicate: se serve, una nuova migrazione.
- Test delle policy: blocco `DO` che simula ruoli con `set local role` + `request.jwt.claims` e chiude
  con `raise exception` per fare rollback (nessun dato di prova resta nel DB).
- Nel client solo la chiave **publishable** (`src/lib/supabase.ts`). Mai secret / service_role nel repo.

## Privacy

- Informativa in `src/pages/privacy.astro` (link nel footer e nella finestra di benvenuto). Descrive il
  funzionamento reale: **ogni modifica che tocca dati personali** (nuovo feedback, nuovo fornitore, cookie,
  statistiche, script esterni) si accompagna all'aggiornamento della pagina e di `AGGIORNATA_IL`.
- Solo strumenti tecnici (cookie di sessione `guide_benvenuto`, sessione Supabase in localStorage):
  niente banner. Niente script di terze parti per i visitatori: il widget Netlify Identity si scarica
  solo con un token d'invito nell'URL (`src/pages/index.astro`).
- Titolari: i due creatori. Supabase in UE.

## Accesso studenti (Google)

- `signInWithOAuth` Google con `hd=universitadipavia.it` (solo un suggerimento: il vincolo vero è
  hook + RLS), flusso PKCE, ritorno sulla pagina corrente. Tutto passa da `src/lib/auth.ts`.
- Accesso facoltativo, proposto una volta per sessione del browser (`BenvenutoAccesso`); necessario
  per vedere e dare feedback.
- Configurazione da dashboard (non versionata): provider Google (Client ID/secret da Google Cloud,
  app "In production"), Site URL `https://howtogolgi.it`, Redirect URLs `https://howtogolgi.it/**`,
  `https://www.howtogolgi.it/**`, `https://guide-pratiche.netlify.app/**`, `https://*--guide-pratiche.netlify.app/**`,
  `http://localhost:4321/**`, hook "Before User Created" → `public.hook_solo_account_ateneo`.

## Appelli d'esame (ESSE3)

- `scripts/appelli.mjs` legge la bacheca appelli pubblica di ESSE3 UniPV (CdS Medicina e Chirurgia
  Golgi) e scrive `src/data/appelli.json` (prossimi 12 mesi; data, ora, tipo di prova, aula, iscrizioni,
  link; **niente** commissione né iscritti). Il sito lo legge in build (`src/lib/appelli.ts`,
  `ProssimiAppelli.astro`, chip sulle card); date passate, conto alla rovescia e stato delle iscrizioni
  si calcolano nel browser.
- **Una volta alla settimana** (lunedì), non di più: `robots.txt` di ESSE3 chiede di non essere visitato da programmi
  (Disallow: /). GitHub Action `.github/workflows/appelli.yml` (ogni lunedì + avvio manuale) che
  committa il JSON su `main` (unica eccezione automatica alla regola "niente commit su main"). Mai
  lanciarlo nella build di Netlify (ogni salvataggio Decap = una build). In locale: `npm run appelli`,
  oppure `--riusa` per rielaborare i dati salvati senza rete. Le API REST ufficiali (e3rest) richiedono
  credenziali: se l'università le concede, sono la strada migliore.
- Abbinamento: guida ↔ esame ESSE3 per nome o con `esse3_codice` (codice attività, stabile fra gli anni);
  appello ↔ modulo: "Prova Parziale" → modulo dal nome dell'appello o da `esse3_appello` del modulo,
  "Prova Finale" → intero esame (verbalizzazioni, prove uniche). Entrambi i campi sono in Decap.
- Se ESSE3 non risponde o la pagina cambia (controlli espliciti), lo script esce con errore senza
  toccare il JSON: il sito resta con i dati precedenti.

## Programmi e CFU ufficiali (catalogo dei corsi)

- `src/data/programmi-ufficiali.json`: dati scaricati dal catalogo dei corsi UniPV (Cineca), uno per
  insegnamento (`codiceAttivita` = codice ESSE3, crediti, anno, programma, testi...).
- `node scripts/programmi-ufficiali.mjs` (`--dry`, `--solo=titolo`) scrive nelle guide `esse3_codice`,
  `cfu_totali`, `semestre` (I / II / Annuale, dal `periodo` di `src/data/syllabus.json`, generato da
  `scripts/syllabus.mjs`) e il **Programma** ufficiale (con link alla scheda). Lo si lancia a mano quando arriva il
  catalogo di un nuovo anno; poi i rappresentanti possono modificarlo da Decap.
- Il testo ufficiale non viene mai riscritto: solo ripulito (paragrafi duplicati) e convertito in Markdown.
  Esami a più moduli: divisione per intestazioni se ogni modulo ne ha una, altrimenti DeepSeek
  (OpenRouter) assegna solo i **numeri di riga** ai moduli o a "comune" (cache in `.cache/`). Modulo
  senza righe proprie: nota "il programma ufficiale non ha una parte dedicata" + link, non il programma
  degli altri moduli.
- Il semestre raggruppa le guide nelle pagine degli anni e in `/guide/` (`GuidePerSemestre.astro`,
  `perSemestre()` in `src/lib/guide.ts`); senza semestre nella guida vale quello comune dei moduli.
- **Docenti ed email** dal catalogo: `node scripts/docenti.mjs` (`--dry`, `--riusa`) scarica docenti, email
  istituzionali e moduli insegnati (API `insegnamento` + `docente` del catalogo) in `src/data/docenti.json` e li
  inserisce nelle guide: completa nome ed email dei docenti già presenti (la nota "Stile/Domande" resta),
  aggiunge i mancanti nel modulo che insegnano. Cognomi uguali (es. due Fusar Poli) = voce lasciata com'è e
  segnalata. Da rilanciare a inizio anno accademico.
- **Esami senza guida** (schede bloccate "Guida in arrivo"): `src/lib/in-arrivo.ts` li ricava dal catalogo
  (`syllabus.json`: voto finale, niente esami a scelta né tirocini) per gli anni in `ANNI_CON_SEGNAPOSTO`
  (ora IV e V). Spariscono da soli quando esiste una guida con lo stesso `esse3_codice` o lo stesso nome.
- Il vecchio "Programma" dei rappresentanti, se contiene consigli (non generico, non un semplice elenco
  di argomenti), finisce in testa a "Consigli e Materiale" sotto **Sul programma**. Le voci "Programma"
  di "Informazioni da verificare" vengono tolte; un anno di corso diverso dal catalogo **non** si
  cambia ma si segnala lì (es. Farmacologia 2: V anno nel catalogo, IV nella guida).

## Decap CMS (rappresentanti)

- **I rappresentanti hanno accesso solo a Decap** (non a Notion): **Decap è la fonte dei contenuti** delle
  guide pubblicate, testi compresi, e lì si creano anche le guide nuove. Notion serve solo all'import
  iniziale delle schede (fatto da chi sviluppa).
- L'import da Notion **aggiunge solo le guide nuove** e salta quelle già nel sito, per non sovrascrivere il
  lavoro fatto in Decap. `--aggiorna` riscrive da Notion una guida esistente (solo su richiesta esplicita),
  conservando comunque link, CFU, dati della scheda ed email dei docenti inseriti in Decap
  (`CAMPI_DECAP_GUIDA` / `CAMPI_DECAP_MODULO` in `scripts/importa-notion.mjs`).
- Pubblicazione diretta (`publish_mode: simple`): ogni salvataggio va su `main`, quindi in produzione.
- Lo schema accetta i campi facoltativi vuoti (`""`/`null` → non compilato, helper `opz()` in
  `src/content/config.ts`): Decap salva così i campi svuotati e altrimenti la build fallirebbe. La data
  è `z.coerce.date()` (YAML o stringa del selettore).
- Campi nello schema ma non più mostrati (`difficolta`, `study_time`, `fascia_studio`): in Decap sono
  `widget: hidden`, quindi invisibili ma conservati nei file. Anteprima di Decap disattivata.
- Ogni limite dello schema (lunghezze, formati) va riportato anche come `pattern` in
  `public/admin/config.yml`, così l'errore compare nell'editor invece di rompere la build.
- Decap è bloccato su una versione precisa con SRI (`public/admin/index.html`); per aggiornarlo:
  nuova versione + nuovo hash.
- Backend `git-gateway` + Netlify Identity: **Git Gateway è deprecato da Netlify** (funziona, ma senza
  correzioni). Per ora resta; alternative quando servirà: DecapBridge o backend GitHub.
- Prova in locale: `npm run cms:local` + `npm run dev`, poi `http://localhost:4321/admin/index.html`
  (in dev `/admin/` non serve l'index; in produzione sì, via redirect Netlify).

## Flusso di lavoro

- Branch + PR verso `main`; nessun commit diretto su `main`. Il merge su `main` = produzione.
- `npm run build` pulito prima di ogni commit.
- `.agents/`, `.claude/`, `.mcp.json`, `skills-lock.json` (skill e MCP installati in locale): non
  committarli senza chiedere.

## Aperto

- **Dati simulati da togliere prima del merge in produzione**: 23 utenti fittizi
  (`simulato-NN@universitadipavia.it`, `raw_app_meta_data.simulato = true`) con voti su Psichiatria
  (`m-0v8s8vwa`), inseriti il 2026-10-04 per vedere l'output. Si rimuovono con
  `delete from auth.users where raw_app_meta_data ->> 'simulato' = 'true';` (i voti vanno via in cascata).

- Email di contatto privacy (`CONTATTO` in `src/pages/privacy.astro`): per ora quella personale di Alessandro;
  da sostituire con un indirizzo sul dominio (es. `privacy@howtogolgi.it`).
- Configurazione Google + hook in dashboard Supabase, poi prova del voto reale sul deploy preview.
- Merge della PR #1 (`redesign-pixel`).
