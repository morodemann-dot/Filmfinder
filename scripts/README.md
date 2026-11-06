# Preisträger-Liste aktualisieren

`src/data/awards.json` enthält alle Filme, die seit 1980 einen Oscar oder Golden Globe gewonnen haben.
Quelle: Wikidata (CC0, frei nutzbar). Abfrage: `awards-query.rq` auf https://query.wikidata.org ausführen.
Zum Aktualisieren (z. B. nach der nächsten Oscar-Verleihung) einfach Claude bitten, die Liste neu zu erzeugen.

## Weitere Listen (ebenfalls Wikidata, CC0)
- `src/data/festivals.json`: Goldene Palme, Goldener Löwe, Goldener Bär und BAFTA-Gewinner seit 1980 (`festivals-query.rq`, `bafta-query.rq`)
- `src/data/canon.json`: Criterion Collection und US National Film Registry, Filme ab 1980 (`canon-criterion-query.rq`, `canon-nfr-query.rq`)
