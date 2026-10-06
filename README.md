# Court Dossier

Interactive true-crime and legal history reader. Wikidata SPARQL supplies the case directory; the MediaWiki Action API supplies only the narrative sections (Investigation, Arrest, Trial, Background, Discovery).

Zero build, zero API keys: vanilla HTML/CSS/ES modules, installable PWA.

## Deploy (Cloudflare Pages)
1. Push this folder to a GitHub repo.
2. Cloudflare Pages: connect the repo, framework preset **None**, build command empty, output directory `/`.

## Local preview
`python3 -m http.server 8000` then open http://localhost:8000 (service workers need http://localhost or https).

## Customising categories
Edit `CATEGORIES` in `app.js`. Types match by Wikidata QID or by exact English class label.

## Files
`index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`, plus `icons/` (PWA icons) and `preview.png` (Open Graph image).

Text from Wikipedia is CC BY-SA. Data from Wikidata is CC0.
