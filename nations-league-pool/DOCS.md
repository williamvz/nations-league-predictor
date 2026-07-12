# Nations League Pool

Voorspellingenpool voor de **UEFA Nations League 2026/27 (League A)** voor familie en vrienden. Uitslagen, de stand, topscorers en bonusvragen worden **volledig automatisch** bijgewerkt — je hoeft als beheerder niets in te voeren.

## Installatie

1. Zet bij **Configuratie** een `jwt_secret`: een lange willekeurige tekst (bijv. het resultaat van `openssl rand -hex 32`). Zonder dit geheim start de add-on niet.
2. Optioneel: zet een `admin_password`. Laat je dit leeg, dan wordt er eenmalig een wachtwoord gegenereerd dat in het **Log** verschijnt.
3. Optioneel: zet een `invite_code`. Met deze code kunnen vrienden zélf een account aanmaken op de loginpagina. Leeg = registratie gesloten (jij maakt accounts aan via Beheer).
4. Start de add-on.

## Toegang

- **Via de zijbalk** (ingress): klik op *NL Pool* in het Home Assistant-menu. Werkt ook in de HA companion-app.
- **Direct via poort 8099**: `http://<ip-van-je-pi>:8099` — handig voor vrienden zonder Home Assistant-account. Op iPhone/Android: *Zet op beginscherm* voor de app-ervaring (PWA).

De eerste beheerder heet `william` (aanpasbaar met de omgevingsvariabele `ADMIN_USERNAME` bij standalone gebruik).

## Automatische synchronisatie

De add-on haalt zelf alles op — er is geen configuratie nodig:

| Wanneer | Wat |
|---|---|
| Elke 2 min (alleen rond wedstrijden) | Live scores + tussenstanden |
| Elke 20 min | Vangnet-sweep: gemiste uitslagen |
| Dagelijks 05:30 | Speelschema (aftraptijden, uitstellingen) |
| Bij het opstarten | Inhaalslag (voor als de Pi uit stond) |

Bronnen: ESPN (primair, incl. doelpuntenmakers) met TheSportsDB als reserve. Zodra een wedstrijd afgelopen is worden de punten berekend, de ranglijst bijgewerkt en krijgt iedereen een melding. Groepswinnaar- en topscorer-bonusvragen keren zichzelf automatisch uit.

Gaat er toch iets mis? In **Beheer → Status** zie je de synclog en kun je handmatig synchroniseren; onder **Uitslagen** kun je altijd handmatig een uitslag invoeren (die wordt nooit door de sync overschreven).

## Gegevens & back-up

Alle data staat in één SQLite-bestand op `/data/nlpool.db` en blijft bewaard bij updates en herstarten. Het valt automatisch binnen Home Assistant-back-ups van de add-on.

## Puntentelling

| Voorspelling | Punten |
|---|---|
| Exacte uitslag | **5** |
| Juiste winnaar + doelsaldo | **3** |
| Juiste winnaar (of gelijkspel) | **2** |
| 🃏 Joker (1 per speelronde) | **×2** |

Bonusvragen: groepswinnaars (4 × 5 pt), topscorer (5 pt), aantal punten van Nederland (5 pt, ±1 = 2 pt).
