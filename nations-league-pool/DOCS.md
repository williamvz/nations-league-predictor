# Nations League Pool

Voorspellingenpool voor de **UEFA Nations League 2026/27 (League A)** voor familie en vrienden. Uitslagen, de stand, topscorers en bonusvragen worden **volledig automatisch** bijgewerkt — je hoeft als beheerder niets in te voeren.

## Installatie

1. Zet bij **Configuratie** een `jwt_secret`: een lange willekeurige tekst (bijv. het resultaat van `openssl rand -hex 32`). Zonder dit geheim start de add-on niet.
2. Kies een `admin_username` (standaard `admin`) en een `admin_password`. Zolang het wachtwoord in de configuratie staat is het **leidend**: bij elke start wordt het afgedwongen — handig als wachtwoordherstel. Laat je het leeg, dan wordt er eenmalig een wachtwoord gegenereerd dat in het **Log** verschijnt en beheer je het daarna in de app. Wijzig je later de `admin_username`, dan wordt dat account als extra beheerder aangemaakt (het oude kun je in de app aanpassen of verwijderen).
3. Optioneel: zet een `invite_code`. Iedereen kan zich altijd aanmelden via de loginpagina — nieuwe accounts wachten op jouw goedkeuring in **Beheer → Gebruikers** (je krijgt een melding 🔔). Wie de uitnodigingscode invult slaat de wachtrij over en doet direct mee.
4. Optioneel: zet `ha_notify_service` op een notify-service van Home Assistant, bijv. `notify.mobile_app_telefoon_van_william`. Nieuwe aanmeldingen komen dan als **pushmelding op je telefoon** binnen (via de HA companion-app). Laat je dit leeg, dan verschijnt er een melding in het Home Assistant-dashboard (persistent notification). De beschikbare services vind je in HA onder *Ontwikkelhulpmiddelen → Acties → notify.*
5. Start de add-on.

## 🧪 Proefdraaien (demo-modus)

Het echte seizoen begint pas op 24 september — maar je kunt het hele systeem nú testen. Zet in de configuratie `demo_mode: true` en herstart de add-on:

- Er draait een **gesimuleerd seizoen in ±1 uur**: alle 48 groepswedstrijden gaan live (met tussenstanden, doelpuntenmakers en een tikkende klok), daarna volgen automatisch de kwartfinales en de Final Four t/m de kampioen.
- **3 bots** doen mee zodat de ranglijst, dagwinnaars en bonusuitslagen leven. Doe zelf mee: voorspellingen invullen kan tot elke (gesimuleerde) aftrap.
- Alles gedraagt zich als in het echt: meldingen, pushberichten, prestaties, deelknop — ideaal om ook de HA-koppeling en pushmeldingen op je telefoon te testen.
- De demo gebruikt een **eigen database** (`nlpool-demo.db`); je echte pool blijft onaangeroerd. Bij elke herstart in demo-modus begint een vers seizoen.
- Klaar? Zet `demo_mode: false` en herstart — de app pakt de echte database weer op. Een paarse banner in de app maakt altijd duidelijk dat je naar de demo kijkt.

## 🎇 Wedstrijddag-spektakel

- **⚽ GOAL-flash**: valt er een doelpunt tijdens een live wedstrijd, dan neemt de app even het scherm over — vlag, doelpuntenmaker, nieuwe stand, confetti en een trilsignaal op je telefoon.
- **📺 TV-modus** (*Meer → TV-modus*, of direct `/#/tv`): een fullscreen wedstrijddag-dashboard voor de tv of een muurtablet — grote live scoreborden met doelpuntenmakers en tikkende klok, de familieranglijst die live herschikt, en het komende programma. Ververst zichzelf; ideaal als Webpage-kaart in een Home Assistant-dashboard.
- **🏠 Automatiseringen**: de add-on vuurt events af op de Home Assistant-eventbus — bouw er je eigen lichtshow mee! Events: `nlpool_goal` (met `team_code`, `team`, `player`, `minute`, `score`) en `nlpool_result` (met `home`, `away`, `score`, `stage`). Voorbeeld — woonkamer oranje bij een goal van Nederland:

```yaml
automation:
  - alias: "Oranje lichtshow bij goal Nederland"
    trigger:
      - platform: event
        event_type: nlpool_goal
        event_data:
          team_code: NED
    action:
      - service: light.turn_on
        target:
          area_id: woonkamer
        data:
          rgb_color: [255, 122, 0]
          brightness: 255
          flash: long
```

Tip: in **demo-modus** vuren deze events ook — test je lichtshow dus gewoon vandaag met een gesimuleerd seizoen. 🧪

## Aanmeldingen & goedkeuring

Iedereen kan zich aanmelden via de loginpagina. Zo verloopt de communicatie:

1. **Aanmelding** → jij krijgt een 🔔-melding in de app én (indien ingesteld) een push op je telefoon via Home Assistant. De aanmelder ziet: *"Zodra William je goedkeurt kun je inloggen."*
2. **Goedkeuren/afwijzen** → rechtstreeks vanuit de 🔔-melding, of via Beheer → Gebruikers (badge toont het aantal wachtenden). Afwijzen verwijdert de aanmelding en maakt de gebruikersnaam weer vrij.
3. **Na goedkeuring** → probeert de speler in te loggen, dan lukt dat direct; bij de eerste login staat er een welkomstmelding klaar. (Er is bewust geen e-mail nodig — geen mailserver, niets te onderhouden.)

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

Knock-outfase: kwartfinale ×1,5 · halve finale ×2 · troostfinale ×2 · finale ×2,5.

Bonusvragen: groepswinnaars (4 × 5 pt), topscorer (5 pt), aantal punten van Nederland (5 pt, ±1 = 2 pt), Nations League-kampioen (10 pt). Er valt niets te winnen behalve **eeuwige roem**. 😤

## Volledige toernooi

De pool loopt door tot en met de finale in juni 2027. De kwartfinales (maart 2027, heen + terug) en de Final Four (juni 2027) worden **automatisch toegevoegd** zodra de loting bekend is en de wedstrijden bij de databronnen verschijnen — iedereen krijgt een melding dat er nieuwe wedstrijden te voorspellen zijn. Eindigt een knock-outwedstrijd gelijk, dan wordt de strafschoppenwinnaar automatisch geregistreerd (punten tellen over de uitslag na 90 minuten).

## Meldingen naar spelers

- **Pushmeldingen** (aan te zetten via Profiel, per apparaat): uitslagen, dagwinnaar, speelronde-herinneringen en "laatste kans"-alerts als je nog niet alles hebt ingevuld. Werkt op telefoon en desktop zodra de app via HTTPS of Home Assistant wordt geopend; de sleutels worden automatisch gegenereerd, er is niets te configureren.
- **Speelronde-herinneringen**: ±24 uur vóór elke speelronde (iedereen) en ±3 uur ervoor (alleen wie nog gaten heeft). Jij krijgt via Home Assistant een overzichtje van wie er nog niet klaar is.
- **Deelknop** op de ranglijst: maakt een deelbare afbeelding van de stand voor in de familie-app. 📤
