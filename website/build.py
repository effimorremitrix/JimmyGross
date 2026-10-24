#!/usr/bin/env python3
"""Builds the static Éclaira site into dist/.

  BASE=https://eclaira.health CONTACT=contact@eclaira.health python3 build.py

Pages in pages/ carry a header comment (TITLE, DESC, PATH, optional ROBOTS)
and share _head/_header/_footer partials, so metadata cannot drift.
"""
import html
import json
import os
import re
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).parent
PAGES = ROOT / "pages"
STATIC = ROOT / "site"
DIST = ROOT / "dist"
BASE = os.environ.get("BASE", "https://eclaira.pages.dev").rstrip("/")
CONTACT = os.environ.get("CONTACT", "contact@eclaira.health")
VERSION = str(int(time.time()))
TODAY = time.strftime("%Y-%m-%d")

FAQ = [
    (
        "Éclaira est-il connecté à Doctolib ?",
        [
            "Aujourd'hui, votre secrétariat dépose chaque semaine l'export de votre agenda. Éclaira reconnaît les colonnes et les motifs, puis programme tous les envois.",
            "Une connexion directe est à l'étude. Éclaira est un service indépendant, non affilié à Doctolib.",
        ],
    ),
    (
        "Et si mon patient n'a pas de smartphone ?",
        [
            "Le lien fonctionne aussi sur ordinateur, et peut être envoyé par e-mail. Au cabinet, le patient peut lire et signer sur une tablette avant le geste.",
        ],
    ),
    (
        "Quelle est la valeur juridique de la signature ?",
        [
            "Par défaut, une signature électronique simple confirmée par un code à usage unique. Pour les gestes qui le justifient, une signature avancée avec vérification de la pièce d'identité.",
            "Le niveau se règle par motif ; nous vous conseillons de le valider avec votre assureur en responsabilité civile professionnelle.",
        ],
    ),
    (
        "Puis-je utiliser mes propres documents ?",
        [
            "Oui. Vos fiches d'information et vos questionnaires sont repris mot pour mot et versionnés : chaque patient signe la version exacte qu'il a lue.",
            "Les résumés présentés au patient ne sont affichés qu'après votre validation.",
        ],
    ),
    (
        "Que se passe-t-il si le geste change le jour J ?",
        [
            "Vous confirmez le geste réalisé dans Éclaira. S'il diffère de celui accepté par le patient, Éclaira vous le signale et vous conseille un nouveau consentement.",
        ],
    ),
    (
        "Combien coûte Éclaira ?",
        [
            "89 € HT par praticien et par mois, consentements illimités ; 69 € HT par praticien dès 3 praticiens. Les cabinets pilotes démarrent gratuitement pendant 3 mois.",
        ],
    ),
]


def faq_html():
    out = []
    for q, answers in FAQ:
        body = "".join(f"<p>{html.escape(a, quote=False)}</p>" for a in answers)
        out.append(f'        <details><summary>{html.escape(q, quote=False)}</summary><div>{body}</div></details>')
    return "\n".join(out)


def faq_jsonld():
    return json.dumps(
        {
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": " ".join(a)}}
                for q, a in FAQ
            ],
        },
        ensure_ascii=False,
    )


def meta(src):
    m = re.match(r"\s*<!--(.*?)-->\s*", src, re.S)
    fields = dict(re.findall(r"^(\w+):\s*(.+)$", m.group(1), re.M)) if m else {}
    return fields, src[m.end():] if m else src


def check(fields, path):
    t, d = fields["TITLE"], fields["DESC"]
    assert 30 <= len(t) <= 65, f"{path}: title length {len(t)}"
    assert 110 <= len(d) <= 165, f"{path}: description length {len(d)}"


BRAND = re.compile(r"(?<![\w-])([ÉéE]claira)(?![\w-])")


def protect_brand(page):
    """Marks every visible "Éclaira" in the body translate="no", so browser
    translation keeps the name (Chrome otherwise renders it "illuminated").
    Only text between tags is touched: attributes, scripts and the head stay as is."""
    head, sep, body = page.partition("<body")
    if not sep:
        return page, 0
    parts = re.split(r"(<[^>]+>)", body)
    count = 0
    raw = None  # inside <script> or <style>
    for i, part in enumerate(parts):
        if part.startswith("<"):
            tag = re.match(r"</?\s*(\w+)", part)
            name = tag.group(1).lower() if tag else ""
            if name in ("script", "style"):
                raw = None if part.startswith("</") else name
            continue
        if raw or "laira" not in part:
            continue
        parts[i], n = BRAND.subn(r'<span translate="no">\1</span>', part)
        count += n
    return head + sep + "".join(parts), count


def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC, DIST)
    head = (PAGES / "_head.html").read_text()
    header = (PAGES / "_header.html").read_text()
    footer = (PAGES / "_footer.html").read_text()
    urls = []
    for page in sorted(PAGES.rglob("*.html")):
        if page.name.startswith("_"):
            continue
        fields, body = meta(page.read_text())
        check(fields, page)
        rel = page.relative_to(PAGES)
        robots = fields.get("ROBOTS", "index, follow")
        h = (
            head.replace("{{TITLE}}", html.escape(fields["TITLE"]))
            .replace("{{DESC}}", html.escape(fields["DESC"]))
            .replace("{{PATH}}", fields["PATH"])
            .replace("{{ROBOTS}}", robots)
        )
        out = (
            body.replace("{{HEAD}}", h.strip())
            .replace("{{HEADER}}", header.strip())
            .replace("{{FOOTER}}", footer.strip())
            .replace("{{FAQ_HTML}}", faq_html())
            .replace("{{FAQ_JSONLD}}", faq_jsonld())
            .replace("{{BASE}}", BASE)
            .replace("{{CONTACT}}", CONTACT)
            .replace("{{VERSION}}", VERSION)
        )
        assert "{{" not in out, f"unreplaced token in {page}"
        out, _ = protect_brand(out)
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', out, re.S):
            json.loads(block)
        dest = DIST / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(out)
        if "noindex" not in robots:
            urls.append(fields["PATH"])

    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{BASE}{u}</loc><lastmod>{TODAY}</lastmod></url>\n" for u in urls)
        + "</urlset>\n"
    )
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    (DIST / "site.webmanifest").write_text(
        json.dumps(
            {
                "name": "Éclaira",
                "short_name": "Éclaira",
                "lang": "fr",
                "start_url": "/",
                "display": "browser",
                "background_color": "#f3f5fa",
                "theme_color": "#1d2145",
                "icons": [
                    {"src": "/assets/img/icon-192.png", "sizes": "192x192", "type": "image/png"},
                    {"src": "/assets/img/icon-512.png", "sizes": "512x512", "type": "image/png"},
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    (DIST / "_headers").write_text(
        "/*\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
        "  X-Frame-Options: DENY\n"
        "  Strict-Transport-Security: max-age=31536000; includeSubDomains\n"
        "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
    )
    print(f"Built {len(urls)} indexable pages into {DIST} (BASE={BASE})")


if __name__ == "__main__":
    build()
