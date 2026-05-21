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

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

def fetch_url_curl(url):
    """Fetch via curl — different TLS fingerprint, bypasses most bot detection."""
    import subprocess, shutil
    curl = shutil.which("curl") or "/usr/bin/curl"
    result = subprocess.run([
        curl, "-s", "-L", "--compressed",
        "--max-time", "15",
        "--cookie-jar", "/tmp/alh_cookies.txt",
        "--cookie",    "/tmp/alh_cookies.txt",
        "-A", BROWSER_UA,
        "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "-H", "Accept-Language: de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "-H", "Sec-Fetch-Dest: document",
        "-H", "Sec-Fetch-Mode: navigate",
        "-H", "Sec-Fetch-Site: none",
        "-H", "Sec-Fetch-User: ?1",
        "-H", "Cache-Control: max-age=0",
        "-H", "Referer: https://www.google.de/",
        url,
    ], capture_output=True, timeout=20)
    if result.returncode != 0:
        raise Exception(f"curl exit {result.returncode}: {result.stderr.decode(errors='replace')[:200]}")
    html = result.stdout.decode("utf-8", errors="replace")
    if not html.strip():
        raise Exception("curl returned empty body")
    return html


def fetch_url_urllib(url):
    """Fallback: urllib with browser-like headers."""
    import gzip, zlib, ssl, http.cookiejar
    jar    = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    )
    req = urllib.request.Request(url)
    req.add_header("User-Agent", BROWSER_UA)
    req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    req.add_header("Accept-Language", "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7")
    req.add_header("Accept-Encoding", "gzip, deflate")
    req.add_header("Sec-Fetch-Dest", "document")
    req.add_header("Sec-Fetch-Mode", "navigate")
    req.add_header("Sec-Fetch-Site", "none")
    req.add_header("Sec-Fetch-User", "?1")
    req.add_header("Cache-Control", "max-age=0")
    with opener.open(req, timeout=15) as resp:
        raw = resp.read()
        enc = resp.headers.get("Content-Encoding", "")
        if enc == "gzip":
            raw = gzip.decompress(raw)
        elif enc == "deflate":
            raw = zlib.decompress(raw)
        return raw.decode("utf-8", errors="replace")


def fetch_url(url):
    try:
        html = fetch_url_curl(url)
        log("Fetch via curl erfolgreich")
        return html
    except Exception as e:
        log(f"curl fehlgeschlagen ({e}), versuche urllib …")
        return fetch_url_urllib(url)


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
    unit_map = {
        'stk': 'Stk', 'stück': 'Stk', 'zehe': 'Zehe', 'bund': 'Bund',
        'pkg': 'Pkg', 'prise': 'Prise', 'el': 'EL', 'tl': 'TL',
        'tbsp': 'EL', 'tsp': 'TL', 'cup': 'Stk', 'cups': 'Stk',
    }
    # Pattern 1: NUMBER UNIT NAME  e.g. "400 g Hackfleisch", "2 EL Olivenöl"
    m = re.match(
        r'^([\d,./½¼¾⅓⅔]+)\s*'
        r'(g|kg|ml|l|L|EL|TL|Stk|Stück|Zehe|Bund|Pkg|Prise|cl|dl|oz|lb|cup|cups|tbsp|tsp)\.?\s+'
        r'(.+)$',
        raw, re.IGNORECASE
    )
    if m:
        unit = unit_map.get(m.group(2).lower(), m.group(2))
        return {"name": m.group(3).strip(), "amount": m.group(1), "unit": unit}
    # Pattern 2: NUMBER NAME  e.g. "2 Paprikaschote(n) (rot)", "6 Knoblauchzehe(n)"
    m2 = re.match(r'^([\d,./½¼¾⅓⅔]+)\s+(.+)$', raw)
    if m2:
        return {"name": m2.group(2).strip(), "amount": m2.group(1), "unit": "Stk"}
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

result = {"title": "", "ingredients": [], "servings": 4, "img": "", "error": ""}

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

            img_raw = recipe.get("image", "")
            if isinstance(img_raw, list): img_raw = img_raw[0] if img_raw else ""
            if isinstance(img_raw, dict): img_raw = img_raw.get("url", "")
            result["img"] = str(img_raw).split("?")[0]  # strip query params
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
