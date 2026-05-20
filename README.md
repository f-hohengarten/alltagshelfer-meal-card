# Alltagshelfer Meal Card

Mahlzeitenplaner für Home Assistant — Wochenplan, Rezeptverwaltung mit Nutri-Score und Einkaufsliste.

## Features

- **Wochenansicht** — 7-Tage-Kalender, Mahlzeiten per Klick einplanen, Wochennavigation
- **Rezeptbrowser** — Suche, Kategoriefilter, Nutri-Score (A–E), Portionen
- **Rezeptformular** — Zutaten mit Menge und Einheit, automatischer Nutri-Score-Vorschlag
- **URL-Import** — Rezepte von Chefkoch, Allrecipes & Co. importieren (mit Begleit-Script)
- **Einkaufsassistent** — Zutaten aus mehreren Mahlzeiten aggregieren, Portionen skalieren, direkt zu Bring! senden

## Voraussetzungen

### 1. HA-Hilfseinträge anlegen

Unter **Einstellungen → Geräte & Dienste → Hilfsprogramme** zwei Todo-Listen anlegen:

| Name | Entity-ID |
|------|-----------|
| ALH Rezepte | `todo.alh_rezepte` |
| ALH Mahlzeitenplan | `todo.alh_mahlzeitenplan` |

### 2. Card installieren

**Option A – manuell:**
```
/config/www/alh-meal-card.js
```
Danach unter **Einstellungen → Dashboards → Ressourcen** hinzufügen:
```
/local/alh-meal-card.js  (Typ: JavaScript-Modul)
```

**Option B – HACS:**  
Repository als benutzerdefiniertes Repository hinzufügen → Frontend → `alh-meal-card` installieren.

## Konfiguration (Lovelace YAML)

```yaml
type: custom:alh-meal-card
recipe_entity: todo.alh_rezepte
plan_entity: todo.alh_mahlzeitenplan
shopping_entity: todo.einkaufsliste   # Bring!-Entity oder andere Todo-Liste
title: Mahlzeitenplaner               # optional, default: "Mahlzeitenplaner"
```

| Option | Pflicht | Beschreibung |
|--------|---------|--------------|
| `recipe_entity` | ✓ | Todo-Entity für Rezepte |
| `plan_entity` | ✓ | Todo-Entity für den Wochenplan |
| `shopping_entity` | — | Todo-Entity für die Einkaufsliste (Bring! o. ä.) |
| `title` | — | Titel der Card |

## URL-Import (optional)

Um Rezepte direkt von Webseiten zu importieren, ist ein kleines Begleit-Script nötig.

### 1. `python_script` aktivieren

In `configuration.yaml`:
```yaml
python_script:

input_text:
  alh_recipe_import_result:
    name: ALH Recipe Import Result
    max: 1000
```

### 2. Script installieren

Datei `alh_recipe_import.py` in `/config/python_scripts/` legen (Inhalt: im Projekt-Repository unter `alh_recipe_import.py`).

### 3. HA neu starten

Nach einem Neustart erscheint im Rezeptformular das URL-Importfeld.

## Nutri-Score

Der Nutri-Score (A–E) kann manuell gesetzt werden. Beim Eingeben von Zutaten wird automatisch ein Score vorgeschlagen — basierend auf dem Zutaten-Keyword-Matching:

| Score | Beispiele |
|-------|-----------|
| A | Salat, Spinat, Brokkoli, Linsen, Kichererbsen |
| B | Hühnchen, Fisch, Vollkorn, Joghurt |
| C | Nudeln, Reis, Kartoffeln, Käse |
| D | Hackfleisch, Sahne, Wurst |
| E | Zucker, Schokolade, Chips |

Der Vorschlag ist nicht bindend — der Nutzer wählt den endgültigen Score selbst.

## Datenspeicherung

Alle Rezepte und Planungseinträge werden als HA-Todo-Items gespeichert — kein externer Server, kein localStorage. Die Daten sind auf allen Geräten synchronisiert, auf denen HA genutzt wird.

**Encoding-Format (intern):**
```
Rezept:   "[ALH cat:pasta;score:B;srv:4] Optionale Notiz|Zutat1:400:g,Zutat2:2:Stk"
Plan:     "[ALH recipe_id:HA-UID;srv:4]"
```
