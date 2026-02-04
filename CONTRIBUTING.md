# 📚 Guida per Contribuire

Benvenuto! Questa guida ti spiega come aggiungere nuove pagine alle Guide Pratiche, anche se non hai mai programmato in vita tua.

---

## 🎯 Cosa ti serve

1. **Un account GitHub** - Registrati su [github.com](https://github.com) se non l'hai già
2. **Un editor di testo** - Va bene anche Blocco Note, ma consiglio [VS Code](https://code.visualstudio.com/) (gratuito)
3. **5 minuti del tuo tempo**

---

## 📝 Come aggiungere una nuova pagina

### Passo 1: Crea il file Markdown

1. Vai nella cartella `docs/` del progetto
2. Entra nella cartella dell'anno corretto (es. `VI_Anno/`)
3. Crea un nuovo file con estensione `.md` (es. `neurologia.md`)

**Esempio di contenuto:**

```markdown
# Neurologia

## Introduzione

Scrivi qui una breve introduzione alla materia.

## Argomenti Principali

### Esame Neurologico
- Stato mentale
- Nervi cranici
- Sistema motorio
- Riflessi

### Patologie Comuni
- Ictus
- Epilessia
- Cefalee

## Note Importanti

!!! warning "Attenzione"
    Questa è una nota di avvertimento.

!!! tip "Suggerimento"
    Questo è un suggerimento utile.

## Risorse

- Link a risorse utili
- Libri consigliati
```

### Passo 2: Aggiungi la pagina al menu

1. Apri il file `mkdocs.yml` nella cartella principale
2. Trova la sezione `nav:`
3. Aggiungi la tua pagina sotto l'anno corretto

**Prima:**
```yaml
nav:
  - VI Anno:
    - Panoramica: VI_Anno/index.md
    - Clinica Medica: VI_Anno/clinica_medica.md
```

**Dopo:**
```yaml
nav:
  - VI Anno:
    - Panoramica: VI_Anno/index.md
    - Clinica Medica: VI_Anno/clinica_medica.md
    - Neurologia: VI_Anno/neurologia.md    # <-- Nuova riga!
```

**⚠️ IMPORTANTE:** Rispetta l'indentazione! Usa sempre **2 spazi** (non tab).

### Passo 3: Testa le modifiche (opzionale)

Se hai Python installato:

```bash
# Installa le dipendenze (solo la prima volta)
pip install -r requirements.txt

# Avvia il server di preview
mkdocs serve
```

Poi apri `http://127.0.0.1:8000` nel browser.

### Passo 4: Invia le modifiche

**Opzione A - Tramite GitHub Web (più facile):**
1. Vai su github.com nel repository
2. Naviga fino al file che vuoi modificare/creare
3. Clicca "Edit" (matita) o "Add file"
4. Fai le modifiche
5. Scrivi un messaggio di commit (es. "Aggiunta guida neurologia")
6. Clicca "Commit changes"

**Opzione B - Tramite Git (per utenti esperti):**
```bash
git add .
git commit -m "Aggiunta guida neurologia"
git push
```

---

## ✍️ Formattazione Markdown - Cheat Sheet

| Cosa vuoi fare | Scrivi | Risultato |
|----------------|--------|-----------|
| Titolo grande | `# Titolo` | Titolo H1 |
| Sottotitolo | `## Sottotitolo` | Titolo H2 |
| **Grassetto** | `**testo**` | **testo** |
| *Corsivo* | `*testo*` | *testo* |
| Lista puntata | `- elemento` | • elemento |
| Lista numerata | `1. elemento` | 1. elemento |
| Link | `[testo](url)` | link cliccabile |
| Immagine | `![alt](path)` | immagine |
| Codice inline | `` `codice` `` | `codice` |

### Box colorati (Admonitions)

```markdown
!!! note "Nota"
    Contenuto della nota

!!! warning "Attenzione"
    Contenuto dell'avviso

!!! tip "Suggerimento"
    Contenuto del suggerimento

!!! danger "Pericolo"
    Contenuto importante
```

---

## 🖥️ Setup per Windows (Generazione PDF)

Se vuoi generare il PDF localmente, devi installare GTK3:

### Installazione GTK3 Runtime

1. **Scarica l'installer** da: https://github.com/AyushSeliya/GTK-3-Installer-for-Windows-10-11
   - Oppure: https://github.com/nickvidal/gtk-3-runtime-installer/releases
   - Cerca `gtk3-runtime-*-win64.exe`

2. **Esegui l'installer** come amministratore

3. **Riavvia il terminale/PC**

4. **Verifica l'installazione:**
   ```bash
   python -c "from weasyprint import HTML; print('OK!')"
   ```

### Generare il PDF

```bash
# Imposta la variabile d'ambiente per abilitare il PDF
set ENABLE_PDF_EXPORT=1

# Builda il sito (il PDF sarà in site/pdf/)
mkdocs build
```

---

## ❓ Problemi Comuni

### "Il menu non mostra la mia pagina"
- Controlla che il percorso in `mkdocs.yml` sia corretto
- Verifica l'indentazione (2 spazi, non tab!)

### "Errore libgobject su Windows"
- Devi installare GTK3 (vedi sezione sopra)

### "mkdocs: command not found"
- Assicurati di aver fatto `pip install -r requirements.txt`

---

## 🤝 Contatti

Hai dubbi? Apri una Issue su GitHub o contatta i maintainer del progetto.

---

*Grazie per contribuire alle Guide Pratiche! 🎓*
