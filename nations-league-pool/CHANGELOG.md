# Changelog

## 1.7.2

- Fix: ESPN weigerde de opvraag voor meerdere dagen tegelijk (fout 400). Daardoor viel de app terug op de reservebron, zonder minuut, doelpuntenmakers of wedstrijdcentrum. De app vraagt ESPN nu per wedstrijddag op zodra een reeks wordt geweigerd, en onthoudt dat voor de volgende keren.

## 1.7.1

- Fix: een live wedstrijd kon een leeg wedstrijdscherm tonen — geen minuut, geen doelpuntenmakers, geen statistieken.
  - Het wedstrijdcentrum gebruikt nu óók de gegevens van het ESPN-scorebord (balbezit, schoten, hoekschoppen, doelpunten, kaarten, stadion) en vult die aan met het uitgebreide ESPN-wedstrijdoverzicht. Lukt dat overzicht niet, dan zie je toch de basis.
  - Doelpuntenmakers verschijnen nu al tijdens de wedstrijd (niet pas na afloop), en een door de VAR afgekeurde goal verdwijnt weer.
  - De reservebron (TheSportsDB) wist de wedstrijdminuut niet meer, en levert zelf een minuut als die beschikbaar is.
  - De minuut wordt robuuster uitgelezen (inclusief "HT" in de rust).
- 🔧 Beheerders zien onderaan het wedstrijdscherm een **diagnose**: waar de score vandaan komt, of er een ESPN-koppeling is, wanneer de details voor het laatst zijn opgehaald en de laatste syncfout.

## 1.7.0

- 📊 **Wedstrijdcentrum**: tik op een wedstrijd voor veel meer dan de score, live bijgewerkt (elke 30 seconden terwijl je kijkt):
  - **Overzicht**: tijdlijn met doelpunten (+ assist), kaarten, wissels en VAR-momenten; stadion, scheidsrechter, toeschouwers en de onderlinge resultaten.
  - **Statistieken**: balbezit, schoten (op doel), hoekschoppen, overtredingen, kaarten, buitenspel, reddingen, passes en meer.
  - **Opstellingen**: basiself met formatie, rugnummers en de bank; ingevallen en gewisselde spelers zijn gemarkeerd.
  - **Live-verslag**: minuut-voor-minuut tekstverslag (van ESPN, in het Engels).
  - **Verslag**: het geschreven wedstrijdverslag, zodra dat na het laatste fluitsignaal verschijnt.
  - **Voorspellingen**: de consensus-heatmap en ieders voorspelling, zoals je gewend was.
  Tabbladen verschijnen alleen als er iets te tonen is — voor kleinere duels levert ESPN niet altijd een live-verslag of artikel. Alles werkt ook in demo-modus.
- Fix: `/api/meta` en `/api/health` gaven altijd "niet ingelogd" terug. Daardoor zag de loginpagina nooit of er een uitnodigingscode was (het veld ontbrak) en verscheen de demo-banner niet.
- 🧪 Testsuite uitgebreid: de hele API wordt nu over HTTP getest en er is een browsertest (Playwright) die de app in demo-modus opstart en doorklikt. Zie "Testen" in de README.

## 1.6.2

- Fix: als je de app op je iPhone-beginscherm hebt gezet, liep de bovenbalk onder de iOS-statusbalk door — de klok stond dwars door "Nations League Pool" heen en de 🔔 en je avatar verdwenen achter het wifi- en batterijpictogram. De app houdt nu afstand van de notch/Dynamic Island (en van de home-indicator onderaan). De speelronde-koppen op Wedstrijden blijven daarbij netjes onder de bovenbalk plakken.

## 1.6.1

- Fix: een aanmelding die je al had goedgekeurd of afgewezen kon in de 🔔-melding blijven staan (met de Goedkeuren/Afwijzen-knoppen nog actief) en dook zo telkens weer op — bij het opnieuw openen van de melding, na een herlaad of op een ander apparaat. Afgehandelde aanmeldingen verdwijnen nu voorgoed uit de melding.

## 1.6.0

- 🌍 **Meertalig**: de app is nu beschikbaar in het Nederlands, Engels, Frans, Spaans, Duits en Italiaans. Kies je taal op je profiel (of al op de loginpagina); de keuze wordt op je account bewaard en reist mee naar al je apparaten. Landnamen, datums, prestaties en bonusvragen worden meevertaald. De Sportkrant blijft — uiteraard — in het Nederlands verschijnen. 🇳🇱

## 1.5.0

- 📰 **De Sportkrant**: automatisch geschreven verslag na elke speelronde — dagwinnaar, joker-helden en -drama's, stijgers/dalers, de stunt van de ronde en wie er vergat in te vullen. Met pushmelding en deelknop.
- 🔮 **Kristallen Bol**: persoonlijke voorspelstatistieken — trefzekerheid, joker-rendement, "jouw klik" en "jouw blinde vlek" per land, gouden moment en pijnlijkste misser. Ook van medespelers te bekijken.
- 🌡️ **Consensus-heatmap** in het wedstrijddetail: wat de groep voorspelde als hittekaart, met ring om de echte uitslag (pas zichtbaar na de aftrap).
- ⚡ **Blitz-invullen**: alle open wedstrijden als kaarten achter elkaar — hele speelronde ingevuld in een halve minuut.
- Fix: een gestarte/afgelopen wedstrijd telt nu altijd als gesloten, ook als de geplande aftraptijd nog in de toekomst ligt.

## 1.4.0

- ⚽ **GOAL-flash**: fullscreen doelpunt-viering met confetti en trilsignaal tijdens live wedstrijden.
- 📺 **TV-modus** (`/#/tv`): fullscreen wedstrijddag-dashboard voor tv of HA-dashboard.
- 🏠 **Home Assistant events**: `nlpool_goal` en `nlpool_result` op de eventbus — bouw je eigen oranje lichtshow (voorbeeld in de documentatie). Werkt ook in demo-modus.

## 1.3.0

- 🇳🇱 Landvlaggen als profielavatar.
- 🔔 Meldingen en prestaties verschijnen direct na een actie (geen minuut vertraging meer).
- ⚙️ `admin_username` en `admin_password` als configuratie-opties; het configuratiewachtwoord wordt bij elke start afgedwongen (wachtwoordherstel). Bestaande installaties behouden hun beheerder.

## 1.2.0

- 🧪 **Demo-modus** (`demo_mode: true`): gesimuleerd seizoen in ±1 uur op een eigen database, met 3 bots — ideaal om alles te testen vóór september.
- Volledige-seizoen-simulatietest en upgrade-test in de testsuite.
- Fix: knock-outwedstrijd tussen landen uit dezelfde groep werd verward met hun groepswedstrijd.

## 1.1.0

- Open registratie met goedkeuring door de beheerder (in de app én vanuit de 🔔-melding, met badge).
- Pushmeldingen naar de beheerder via Home Assistant (`ha_notify_service`).
- Speelronde-herinneringen (±24u en ±3u voor de aftrap), webpush per apparaat, deelbare ranglijst-afbeelding.
- Volledig toernooi: kwartfinales en Final Four worden automatisch aangemaakt; bonusvraag "Wie wint de Nations League?".

## 1.0.0

- Eerste release: UEFA Nations League 2026/27 (League A, 48 wedstrijden), automatische uitslagen/stand/topscorers via ESPN + TheSportsDB, punten 5/3/2 met 🃏 joker, bonusvragen die zichzelf uitkeren, prestaties, live ranglijst, PWA in het Nederlands, HA-ingress.
