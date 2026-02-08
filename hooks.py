import os
import logging
from pathlib import Path
import pandas as pd
import plotly.express as px
import yaml
from mkdocs.structure.files import File

YEAR_FOLDERS = {"I_Anno", "II_Anno", "III_Anno", "IV_Anno", "V_Anno", "VI_Anno"}
INFO_FILENAME = "index.md"


def _get_exam_display_name(folder_path):
    """Legge integrated_exam dal primo .md nella cartella; fallback: title-case del nome."""
    for f in sorted(Path(folder_path).iterdir()):
        if f.suffix == ".md" and f.name != INFO_FILENAME:
            try:
                text = f.read_text(encoding="utf-8")
                if text.startswith("---"):
                    end = text.index("---", 3)
                    meta = yaml.safe_load(text[3:end])
                    if meta and meta.get("integrated_exam"):
                        return meta["integrated_exam"]
            except Exception:
                continue
    return Path(folder_path).name.replace("-", " ").title()


def _generate_info_content(display_name):
    return (
        f'---\ntitle: "{display_name}"\n'
        f'type: "scheda_integrato"\n'
        f'---\n\n'
        f"Informazioni generali sull'esame integrato.\n"
    )


def on_files(files, config):
    docs_dir = config["docs_dir"]
    use_directory_urls = config.get("use_directory_urls", True)
    site_dir = config["site_dir"]

    # Set di percorsi già presenti nella collezione files
    existing_paths = {f.src_path.replace("\\", "/") for f in files}

    for year in YEAR_FOLDERS:
        year_path = Path(docs_dir) / year
        if not year_path.is_dir():
            continue
        for entry in sorted(year_path.iterdir()):
            if not entry.is_dir():
                continue
            # entry è una sottocartella = esame integrato
            index_src = f"{year}/{entry.name}/{INFO_FILENAME}".replace("\\", "/")
            if index_src in existing_paths:
                continue

            # Genera il file su disco
            abs_path = Path(docs_dir) / index_src
            display_name = _get_exam_display_name(entry)
            abs_path.write_text(_generate_info_content(display_name), encoding="utf-8")

            # Aggiunge alla collezione MkDocs
            new_file = File(index_src, docs_dir, site_dir, use_directory_urls)
            files.append(new_file)
            logging.info(f"[hooks] Generato {index_src} per esame integrato '{display_name}'")

    return files


def _render_scheda_integrato(markdown, meta):
    # --- SLIDER DIFFICOLTA ---
    try:
        score = int(str(meta.get('difficulty', '1')).strip())
    except (ValueError, TypeError):
        score = 1

    width = score * 20
    if score <= 2: color = "#4caf50"
    elif score == 3: color = "#ff9800"
    else: color = "#f44336"

    slider_html = f"""
    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px; margin-bottom: 20px;">
        <b style="min-width: 70px;">Difficoltà:</b>
        <div style="background: #e0e0e0; height: 10px; width: 150px; border-radius: 5px;">
            <div style="width: {width}%; background: {color}; height: 100%; border-radius: 5px;"></div>
        </div>
        <span>{score}/5</span>
    </div>
    """

    # --- BADGE ---
    cfu_badge = f'<span class="badge-cfu">{meta.get("cfu")} CFU</span>' if meta.get('cfu') else ""
    semestre_badge = f'<span class="badge-semestre">{meta.get("semestre")} SEMESTRE</span>' if meta.get('semestre') else ""
    modalita_badge = f'<span class="badge-modalita">{meta.get("exam_type")}</span>' if meta.get('exam_type') else ""

    # --- BOTTONI ---
    buttons_md = ""
    if meta.get('link_sbobine'):
        buttons_md += f"""
[:material-folder: Vai alle Sbobine]({meta['link_sbobine']}){{:target="_blank" .md-button .md-button--primary .btn-dashboard .btn-sbobine }}
        """
    if meta.get('link_whatsapp'):
        buttons_md += f"""

[:material-whatsapp: Gruppo WhatsApp]({meta['link_whatsapp']}){{:target="_blank" .md-button .btn-dashboard .btn-whatsapp }}
        """

    # --- HEADER ---
    header = f"""
# {meta.get('title')}

# {cfu_badge} {semestre_badge} {modalita_badge}

!!! abstract "Scheda Sintetica"
    * **Tipologia:** {meta.get('exam_type', 'N/D')}
    * **Semestre:** {meta.get('semestre', 'N/D')}
    {slider_html}
<div class="grid" markdown>

{buttons_md}

</div>
"""

    if meta.get('exam_details'):
        header += f"""
## :fontawesome-solid-user-gear: Modalità d'Esame
{meta.get('exam_details')}

---
"""

    if markdown.strip():
        header += f"\n## :material-note-text: Note Generali\n{markdown}\n"

    return header

# LOGICA STATISTICHE DOMANDE
def _generate_chart_html(sheet_url, exam_title):
    """Scarica il CSV e genera l'HTML del grafico Plotly."""
    if not sheet_url:
        return "_Nessun foglio statistiche collegato._"

    try:
        df = pd.read_csv(sheet_url)
        
        # Raggruppamento dati
        distribuzione = df.groupby('MACROARGOMENTO')['DOMANDA'].count().reset_index()
        distribuzione.columns = ['Argomento', 'Frequenza']
        distribuzione = distribuzione.sort_values('Frequenza', ascending=True)

        # Creazione Plotly
        fig = px.bar(distribuzione, 
                        x='Frequenza', 
                        y='Argomento', 
                        orientation='h', 
                        text='Frequenza',
                        title="",
                        color='Frequenza',
                        color_continuous_scale=px.colors.sequential.Teal)

# --- UPDATE DEL DESIGN ---
        fig.update_traces(
            textposition='outside', # Numeri FUORI dalle barre
            textfont_color='#777',  # Colore grigio neutro (leggibile su bianco e nero)
            cliponaxis=False,       # Evita che i numeri lunghi vengano tagliati
            marker_line_width=0,    # Nessun bordo alle barre
            width=0.8             # Barre leggermente più sottili per dare spazio
        )

        fig.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(family="Noto Sans, sans-serif", size=14, color = "#777"),
            margin=dict(l=0, r=40, t=40, b=0),
            xaxis_title="",
            yaxis_title="",
            
            # Pulisci Asse X
            xaxis=dict(
                showgrid=False,
                showticklabels=False,
                zeroline=False,
                visible=False
            ),
            
            # Pulisci Asse Y (Niente linee, solo etichette)
            yaxis=dict(
                showgrid=False,
                showline=False,
                showticklabels=True,
                zeroline=False,
                ticksuffix=" "  # Aggiunge un po' di spazio tra testo e barra
            ),
            
            # Nascondi la barra colori laterale
            coloraxis_showscale=False,
            
            # Altezza dinamica (opzionale, per evitare grafici giganti con poche barre)
            height=300 + (len(distribuzione) * 30)
        )
        
        return fig.to_html(full_html=False, include_plotlyjs='cdn', config={'displayModeBar': False})

    except Exception as e:
        logging.error(f"Errore grafico per {exam_title}: {e}")
        return f"⚠️ _Impossibile caricare il grafico: {e}_"


def on_page_markdown(markdown, page, config, files):
    # 1. Check per scheda_integrato
    if page.meta.get('type') == 'scheda_integrato':
        return _render_scheda_integrato(markdown, page.meta)

    # 2. Filtro di sicurezza
    if page.meta.get('type') != 'scheda_esame':
        return markdown

    meta = page.meta
    
    # --- LOGICA SLIDER DIFFICOLTA ---
    try:
        score = int(str(meta.get('difficulty', '1')).strip())
    except (ValueError, TypeError):
        score = 1
    
    width = score * 20
    if score <= 2: color = "#4caf50" 
    elif score == 3: color = "#ff9800" 
    else: color = "#f44336" 

    # Lo slider richiede ancora HTML perché non esiste in Markdown
    slider_html = f"""
    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px; margin-bottom: 20px;">
        <b style="min-width: 70px;">Difficoltà:</b>
        <div style="background: #e0e0e0; height: 10px; width: 150px; border-radius: 5px;">
            <div style="width: {width}%; background: {color}; height: 100%; border-radius: 5px;"></div>
        </div>
        <span>{score}/5</span>
    </div>
    """

    # --- LOGICA BADGE CFU ---
    cfu_val = meta.get('cfu')
    cfu_badge = ""
    if cfu_val:
        # Creiamo un tag con classe custom 'badge-cfu'
        cfu_badge = f'<span class="badge-cfu">{cfu_val} CFU</span>'

    # --- LOGICA BADGE SEMESTRE ---
    semestre_val = meta.get('semestre')
    semestre_badge = ""
    if semestre_val:
        # Creiamo un tag con classe custom 'badge-cfu'
        semestre_badge = f'<span class="badge-semestre">{semestre_val} SEMESTRE</span>'

    # --- LOGICA BADGE MODALITà ---
    modalita_val = meta.get('exam_type')
    modalita_badge = ""
    if modalita_val:
        # Creiamo un tag con classe custom 'badge-cfu'
        modalita_badge = f'<span class="badge-modalita">{modalita_val}</span>'

    # --- LOGICA BOTTONI (MARKDOWN PURO) ---
    buttons_md = ""
    
    if meta.get('link_sbobine'):
        # .md-button--primary fa il bottone colorato (Teal/Blu)
        # Nota le doppie graffe {{ }} per scappare la sintassi
        buttons_md += f"""
[:material-folder: Vai alle Sbobine]({meta['link_sbobine']}){{:target="_blank" .md-button .md-button--primary .btn-dashboard .btn-sbobine }}
        """
    
    if meta.get('link_whatsapp'):
        # Qui usiamo style inline per forzare il verde WhatsApp
        buttons_md += f"""

[:material-whatsapp: Gruppo WhatsApp]({meta['link_whatsapp']}){{:target="_blank" .md-button .btn-dashboard .btn-whatsapp }}
        """

    # --- COSTRUZIONE HEADER ---
    header = f"""
# {meta.get('title')} 

# {cfu_badge} {semestre_badge} {modalita_badge}

!!! abstract "Scheda Sintetica"
    * **Tipologia:** {meta.get('exam_type', 'N/D')}
    * **Tempo Studio:** {meta.get('study_time', 'N/D')}
    * **Semestre:** {meta.get('semester', 'N/D')}
    {slider_html}
<div class="grid" markdown>

{buttons_md}

</div>
"""

    if meta.get('exam_details'):
        header += f"""
## :fontawesome-solid-user-gear: Modalità d'Esame
{meta.get('exam_details')}

---
"""

    header += f"""
##  :octicons-checklist-16: Programma
<div class="programma-lista" markdown>
{meta.get('program', 'Nessun programma.')}
</div>

---

## :material-bookshelf: Consigli e Materiale
{meta.get('material_tips', 'Nessun consiglio.')}

"""

    # --- PROFESSORI ---
    if meta.get('professors'):
        header += "\n## 👨‍🏫 Docenti\n"
        header += "| Docente | Contatti | Focus & Stile |\n| :--- | :--- | :--- |\n"
        for prof in meta['professors']:
            nome = str(prof.get('name', '')).replace('|', '-')
            style = str(prof.get('style', '')).replace('|', '-')
            email = prof.get('email', '')
            contatto = f"[{email}](mailto:{email})" if email else "-"
            header += f"| **{nome}** | {contatto} | {style} |\n"
        header += "\n---\n"

# GRAFICO
    if meta.get('google_sheet_CSV'):
        header += "\n## :fontawesome-solid-chart-line: Domande precedenti\n"
        header += f'\n[:octicons-question-16: Vai alle Domande]({meta["google_sheet_URL"]}){{:target="_blank" .md-button .md-button--primary .btn-dashboard .btn-sbobine }}\n'
        header += _generate_chart_html(meta['google_sheet_CSV'], meta['title'])
        header += "\n---\n"

    return header + "\n## :fontawesome-solid-notes-medical: Note Extra\n" + markdown


    








    