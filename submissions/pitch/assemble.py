"""Assemble the 19 slide files into one printable HTML page (one 1920x1080 page per slide)."""
import json, re, pathlib

here = pathlib.Path(__file__).parent
deck = json.loads((here / "project/deck.json").read_text())
BLOB = {
    "bf51c11d2c715967db672cbc965e1127": "img/home.png",
    "e48dcf6d871b6917cf54e2f8fc871d3f": "img/result.png",
    "0c3f334ebfe14724b69b0532cbd774a0": "img/live.png",
    "d91b158e9e9e6fac68c02465a5ebd311": "img/live-drawer.png",
    "9704765d926bd26fa07cd4a5353e9c51": "img/live-map-selected.png",
    "c92878c1c26d03c78d594c59906a2446": "img/live-detail.png",
}

def convert(html: str) -> str:
    html = re.sub(r'src="/_blob/([0-9a-f]{32})"', lambda m: f'src="{BLOB[m.group(1)]}"', html)
    # Connectors between cards → an amber arrow glyph of the same width.
    html = re.sub(r'<x-connector style="width:(\d+)px[^"]*"></x-connector>',
                  lambda m: f'<div style="width:{m.group(1)}px;align-self:center;text-align:center;color:#F2A84A;font-size:44px;line-height:1">&#8594;</div>', html)
    html = re.sub(r"<aside>.*?</aside>", "", html, flags=re.S)  # speaker notes are not printed
    return html

slides = "\n".join(convert((here / f"project/slides/{sid}.html").read_text()) for sid in deck["order"])
fonts = "&".join(f["href"].split("?", 1)[1].replace("&display=swap", "") for f in deck["faces"].values())
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{deck['title']}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<style>
@page {{ size: 1920px 1080px; margin: 0 }}
html, body {{ margin: 0; padding: 0; background: #1C1510 }}
section {{ width: 1920px; height: 1080px; position: relative; box-sizing: border-box; overflow: hidden; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
h1, h2, h3, p {{ margin: 0 }}
h1 {{ font-size: 96px }} h2 {{ font-size: 64px }} h3 {{ font-size: 44px; font-weight: 600 }}
table {{ border-collapse: collapse }}
th {{ font-family: 'Geist Mono', monospace; font-weight: 500; font-size: 24px; color: #CBB9A1; text-transform: uppercase; letter-spacing: 2px; padding: 18px 22px; border-bottom: 2px solid #F2A84A }}
td {{ padding: 14px 22px; border-bottom: 1px solid #4A3B2F }}
div {{ box-sizing: border-box }}
</style></head><body>
{slides}
</body></html>"""
(here / "deck.html").write_text(page)
print(f"assembled {len(deck['order'])} slides")
