# Solvaro Dealerportaal (testomgeving)

Fictief dealerportaal van een zonweringsleverancier, bedoeld om AI-agents en computer-use te testen op het invullen van productconfiguraties en orders.

- 6 producttypes: knikarmscherm, screen, rolluik, uitvalscherm, markies, lamellendak
- Configurator in 6 stappen: product, maten & montage, kleur & doek, bediening, opties, controle
- Realistische validatie (maximale maten, combinaties van bediening en sensoren, doeknummers, postcode, leverweek)
- Orderregels, ordergegevens en orderoverzicht (opgeslagen in de eigen browser via localStorage)
- Tabblad met kant-en-klare testscenario's, waarvan twee bewust moeten falen

Alles staat in één bestand (`index.html`), zonder build-stap. Open het lokaal in een browser of publiceer via GitHub Pages.

Solvaro is een verzonnen naam. Prijzen, doekcollecties en artikelcodes zijn fictief.

## Tweede portaal: Konfigo Order Entry (`/configurator/`)

Een tweede, los testportaal met de opbouw van een SaaS order-entry configurator zoals leveranciers die gebruiken: smalle topbalk, zijmenu, één lange configuratietabel met inklapbare onderdelen (Omschrijving / Aantal / Totaalprijs), een zijpaneel met navigatie, totaalprijs en de knoppen "Nieuwe offerte maken" en "Nieuwe configuratie toevoegen".

- Fictieve leverancier **Nordhaven Zonwering** op het fictieve platform **konfigo**
- Fictieve demo-producten (3 knikarmschermen, screen) met verzonnen prijzen
- Allround-assortiment uit het Ambiance prijsboek 2026: uitvalschermen Ambiance Carré 95, Carré 110 en Arcos (§5.0.1–5.0.3, complete prijstabellen, meer- en minderprijzen, doekprijsgroepen, koppelen met doorlopende kap, muursteunen) en kokers/hoeklijnen (§10.0.2, per meter, met verwerkingstoeslag per opdracht). Deze prijzen zijn consumentenadviesprijzen incl. btw en standaardmontage
- Zoekvelden voor kleur en doeknummer, afhankelijke velden (snoer/handzender/schakelaar per motortype) en realistische validatie
- Offertes (aanmaken, regels toevoegen/wijzigen, gegevens wijzigen, dupliceren, bestellen), CRM-accounts, sjablonen, eigenschappen, master data en instellingen
- Negen testscenario's op de homepagina, waarvan vier bewust moeten falen of een vraag moeten opleveren
- Gegevens blijven in de eigen browser (localStorage); via het gebruikersmenu zet je de testdata terug

Live: https://ambiance-organisatie.github.io/ambiance-testportaal/configurator/
