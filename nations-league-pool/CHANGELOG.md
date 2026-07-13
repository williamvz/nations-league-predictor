# Changelog

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
