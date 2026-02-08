import logging

def on_page_markdown(markdown, page, config, files):
    # 1. Filtro di sicurezza
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
- [:material-folder: Vai alle Sbobine]({meta['link_sbobine']}){{:target="_blank" .md-button .md-button--primary .btn-dashboard .btn-sbobine }}
        """
    
    if meta.get('link_whatsapp'):
        # Qui usiamo style inline per forzare il verde WhatsApp
        buttons_md += f"""

- [:material-whatsapp: Gruppo WhatsApp]({meta['link_whatsapp']}){{:target="_blank" .md-button .btn-dashboard .btn-whatsapp }}
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
<div class="grid cards" markdown>

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

    return header + "\n## 📝 Note Extra\n" + markdown