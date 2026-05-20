#!/usr/bin/env python3
# alh_recipe_import.py
# Ablegen in: /config/scripts/alh_recipe_import.py
#
# Aufruf via shell_command in configuration.yaml:
#   shell_command:
#     alh_recipe_import: python3 /config/scripts/alh_recipe_import.py "{{ url }}"
#
# Token-Datei: /config/scripts/.alh_token
# (Long-Lived Access Token aus HA-Profil einfügen)

import json
import os
import re
import sys
import urllib.request
import urllib.error

# ── URL aus Kommandozeile ─────────────────────────────────────────────────────

def read_ha_state(entity_id, token):
    req = urllib.request.Request(
        f"http://localhost:8123/api/states/{entity_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode())["state"]

LOG = "/config/scripts/alh_import.log"

def log(msg):
    with open(LOG, "a") as f:
        import datetime
        f.write(f"{datetime.datetime.now().isoformat()} {msg}\n")

log("=== Script gestartet ===")

script_dir = os.path.dirname(os.path.abspath(__file__))
token_file = os.path.join(script_dir, ".alh_token")
log(f"Token-Datei: {token_file}")

try:
    with open(token_file) as f:
        TOKEN = f.read().strip()
    log(f"Token geladen ({len(TOKEN)} Zeichen)")
except Exception as e:
    log(f"FEHLER Token lesen: {e}")
    sys.exit(1)

try:
    url = read_ha_state("sensor.alh_recipe_import_url", TOKEN).strip()
    log(f"URL gelesen: {url[:80]}")
except Exception as e:
    log(f"FEHLER URL lesen: {e}")
    sys.exit(1)

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_url(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ALH-Importer/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract_json_ld(html):
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.DOTALL | re.IGNORECASE
    )
    for match in pattern.finditer(html):
        try:
            obj = json.loads(match.group(1).strip())
            if isinstance(obj, dict) and obj.get("@graph"):
                for item in obj["@graph"]:
                    if isinstance(item, dict) and "Recipe" in str(item.get("@type", "")):
                        return item
            if isinstance(obj, list):
                for item in obj:
                    if isinstance(item, dict) and "Recipe" in str(item.get("@type", "")):
                        return item
            if isinstance(obj, dict) and "Recipe" in str(obj.get("@type", "")):
                return obj
        except Exception:
            pass
    return None


def parse_ingredient(raw):
    raw = str(raw).strip()
    m = re.match(
        r'^([\d,./½¼¾⅓⅔]+)\s*'
        r'(g|kg|ml|l|L|EL|TL|Stk|Stück|Zehe|Bund|Pkg|Prise|cl|dl|oz|lb|cup|cups|tbsp|tsp)\.?\s+'
        r'(.+)$',
        raw, re.IGNORECASE
    )
    if m:
        unit_map = {
            'stk': 'Stk', 'stück': 'Stk', 'zehe': 'Zehe', 'bund': 'Bund',
            'pkg': 'Pkg', 'prise': 'Prise', 'el': 'EL', 'tl': 'TL',
            'tbsp': 'EL', 'tsp': 'TL', 'cup': 'Stk', 'cups': 'Stk',
        }
        unit = unit_map.get(m.group(2).lower(), m.group(2))
        return {"name": m.group(3).strip(), "amount": m.group(1), "unit": unit}
    return {"name": raw, "amount": "", "unit": "Stk"}


def clean_text(s):
    if isinstance(s, list):
        s = " ".join(str(i) for i in s)
    s = re.sub(r'<[^>]+>', '', str(s))
    return s.strip()


def write_to_ha(result_json):
    # HA state field is limited to 255 chars; put full JSON in attributes
    import time
    payload = json.dumps({
        "state": str(int(time.time())),
        "attributes": {"result": result_json},
    }).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:8123/api/states/sensor.alh_recipe_import_result",
        data=payload,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    urllib.request.urlopen(req, timeout=10)

# ── Main ──────────────────────────────────────────────────────────────────────

result = {"title": "", "ingredients": [], "servings": 4, "error": ""}

if not url:
    result["error"] = "Keine URL angegeben."
else:
    try:
        log("Fetche URL...")
        html   = fetch_url(url)
        log(f"HTML geladen ({len(html)} Zeichen)")
        recipe = extract_json_ld(html)
        log(f"Recipe gefunden: {bool(recipe)}")

        if recipe:
            result["title"] = clean_text(recipe.get("name", ""))

            srv = recipe.get("recipeYield", recipe.get("yield", "4"))
            if isinstance(srv, list):
                srv = srv[0] if srv else "4"
            m = re.search(r'\d+', str(srv))
            result["servings"] = int(m.group()) if m else 4

            raw_ings = recipe.get("recipeIngredient", [])
            result["ingredients"] = [parse_ingredient(clean_text(i)) for i in raw_ings if i]
        else:
            result["error"] = "Kein Rezept auf dieser Seite gefunden."

    except urllib.error.URLError as e:
        result["error"] = f"URL-Fehler: {e}"
    except Exception as e:
        result["error"] = f"Fehler: {e}"

result_json = json.dumps(result, ensure_ascii=False)

log(f"Ergebnis: {result_json[:120]}")
try:
    write_to_ha(result_json)
    log("Ergebnis erfolgreich nach HA geschrieben.")
except Exception as e:
    log(f"FEHLER HA schreiben: {e}")
    print(f"HA-Schreibfehler: {e}", file=sys.stderr)
    sys.exit(1)
