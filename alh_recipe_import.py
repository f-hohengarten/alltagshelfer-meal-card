# alh_recipe_import.py
# Ablegen in: /config/python_scripts/alh_recipe_import.py
#
# Aufruf aus der alh-meal-card via:
#   hass.callService('python_script', 'alh_recipe_import', { url: '...' })
#
# Ergebnis wird in input_text.alh_recipe_import_result als JSON gespeichert.
# Die Card liest diesen Wert und befüllt das Rezeptformular automatisch.
#
# Voraussetzung in configuration.yaml:
#   python_script:
#   input_text:
#     alh_recipe_import_result:
#       name: ALH Recipe Import Result
#       max: 1000
#
# Unterstützte Seiten: alle Sites mit schema.org/Recipe JSON-LD
# (Chefkoch, Allrecipes, BBC Good Food, Lecker.de, Kitchenstories, u.v.m.)

import json
import re
import urllib.request

url = data.get("url", "").strip()

def fetch_url(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ALH-Importer/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_json_ld(html):
    """Extracts all schema.org/Recipe JSON-LD blocks from HTML."""
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.DOTALL | re.IGNORECASE
    )
    for match in pattern.finditer(html):
        try:
            obj = json.loads(match.group(1).strip())
            # Handle @graph arrays
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
    """
    Parse a raw ingredient string like "400 g Hackfleisch" into
    {name, amount, unit}.
    """
    raw = str(raw).strip()
    # Try: "400 g Hackfleisch" or "2 Stk Zwiebeln" or "1/2 TL Salz"
    m = re.match(
        r'^([\d,./]+)\s*'
        r'(g|kg|ml|l|L|EL|TL|Stk|Stück|Zehe|Bund|Pkg|Prise|cl|dl|oz|lb|cup|cups|tbsp|tsp)\.?\s+'
        r'(.+)$',
        raw, re.IGNORECASE
    )
    if m:
        amount_str = m.group(1).replace(',', '.').replace('/', ' / ')
        unit_map = {
            'stk': 'Stk', 'stück': 'Stk', 'zehe': 'Zehe', 'bund': 'Bund',
            'pkg': 'Pkg', 'prise': 'Prise', 'el': 'EL', 'tl': 'TL',
            'tbsp': 'EL', 'tsp': 'TL', 'cup': 'Stk', 'cups': 'Stk',
            'oz': 'g', 'lb': 'g', 'cl': 'ml', 'dl': 'ml', 'l': 'l',
        }
        unit = unit_map.get(m.group(2).lower(), m.group(2))
        return {"name": m.group(3).strip(), "amount": amount_str, "unit": unit}
    # Fallback: no amount/unit recognized
    return {"name": raw, "amount": "", "unit": "Stk"}

def clean_text(s):
    if isinstance(s, list):
        s = " ".join(str(i) for i in s)
    s = re.sub(r'<[^>]+>', '', str(s))  # strip HTML tags
    return s.strip()

result = {"title": "", "ingredients": [], "servings": 4, "error": ""}

if not url:
    result["error"] = "Keine URL angegeben."
else:
    try:
        html = fetch_url(url)
        recipe = extract_json_ld(html)

        if recipe:
            # Title
            result["title"] = clean_text(recipe.get("name", ""))

            # Servings
            srv = recipe.get("recipeYield", recipe.get("yield", "4"))
            if isinstance(srv, list):
                srv = srv[0] if srv else "4"
            srv_match = re.search(r'\d+', str(srv))
            result["servings"] = int(srv_match.group()) if srv_match else 4

            # Ingredients
            raw_ings = recipe.get("recipeIngredient", [])
            result["ingredients"] = [parse_ingredient(clean_text(i)) for i in raw_ings if i]

        else:
            result["error"] = "Kein schema.org/Recipe gefunden auf dieser Seite."

    except urllib.error.URLError as e:
        result["error"] = f"URL-Fehler: {e}"
    except Exception as e:
        result["error"] = f"Fehler: {e}"

# Truncate ingredients if JSON would exceed 990 chars
result_json = json.dumps(result, ensure_ascii=False)
while len(result_json) > 990 and result["ingredients"]:
    result["ingredients"].pop()
    result_json = json.dumps(result, ensure_ascii=False)

# Write result back to HA via REST API
# Token: Langjähriger Zugriffstoken aus HA-Profil → /config/scripts/.alh_token
import os

token_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".alh_token")
try:
    with open(token_file) as f:
        token = f.read().strip()
except FileNotFoundError:
    import sys
    print(f"Fehler: Token-Datei nicht gefunden: {token_file}", file=sys.stderr)
    raise SystemExit(1)

api_url = "http://localhost:8123/api/states/input_text.alh_recipe_import_result"
payload = json.dumps({"state": result_json}).encode("utf-8")
req = urllib.request.Request(
    api_url,
    data=payload,
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    },
    method="POST",
)
urllib.request.urlopen(req, timeout=10)
