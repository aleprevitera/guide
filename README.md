# Guide Universitarie

Portale di guide pratiche per esame, compilato e mantenuto dai rappresentanti degli
studenti tramite un CMS git-based (Decap CMS), con layout e struttura dati immutabili
garantiti a livello di build.

## Stack

- **Astro** (static site generator) + **TypeScript**
- **Decap CMS** (git-based headless CMS) come interfaccia di editing
- **Netlify Identity + Git Gateway** per autenticazione/autorizzazione dei rappresentanti
- **Netlify** per hosting e deploy continuo da GitHub

## Sviluppo locale

```bash
npm install

# terminale 1 — sito Astro
npm run dev            # http://localhost:4321

# terminale 2 — proxy locale per Decap CMS (richiesto da local_backend: true)
npm run cms:local

# poi apri http://localhost:4321/admin/
```

`npm run build` esegue `astro check` prima di `astro build`: qualunque contenuto che
violi lo schema definito in `src/content/config.ts` fa fallire la build, anche se
generato bypassando l'interfaccia di Decap.

## Come funziona l'immutabilità del layout

1. **`src/content/config.ts`** — schema Zod che ogni entry `.yaml` in
   `src/content/guide/` deve rispettare (campi fissi, enum chiusi). Build bloccata se
   violato.
2. **`src/lib/markdown.ts`** — le uniche sezioni "narrative" (programma, consigli, ecc.)
   sono Markdown passato attraverso `rehype-sanitize` con una whitelist ristretta di tag
   (`p, br, strong, em, ul, ol, li, a`): niente heading, tabelle, HTML o componenti,
   indipendentemente da cosa contenga il sorgente.
3. **`src/layouts/GuideLayout.astro`** e i componenti in `src/components/guide/` —
   intestazioni di sezione, badge e struttura della pagina sono markup fisso; i
   rappresentanti forniscono solo dati tipizzati, mai markup.

## Setup Netlify Identity + Git Gateway (una tantum, da amministratore)

1. Collegare questo repository GitHub a un nuovo sito Netlify.
2. Netlify → **Identity → Enable Identity**.
3. Identity → **Registration → Invite only**.
4. Identity → **Services → Enable Git Gateway**.
5. Identity → **External providers**: lasciare disattivato.

## Turnover annuale dei rappresentanti

- **Nuovo rappresentante**: Netlify → Identity → *Invite users* → email istituzionale.
  Riceve un link, imposta la password, accede direttamente a `/admin`.
- **Rappresentante uscente**: Netlify → Identity → seleziona l'utente → *Delete user*.
  L'accesso è revocato immediatamente.

Non esistono ruoli differenziati: chi viene invitato è Editor a tutti gli effetti.
