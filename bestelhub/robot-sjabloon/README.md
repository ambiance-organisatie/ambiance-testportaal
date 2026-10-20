# Bestelhub – orders en bestelrobot (privé)

Deze repository bewaart de orders van de Bestelhub en bevat de robot die ze in het leveranciersportaal invult.

- `orders/HUB-xxxx.json` – één bestand per order (klant, regels, status, offerte-/ordernummer, notities).
- `robot/verwerk.mjs` – opent Chrome (Playwright) op een GitHub-server en laat Claude de order invullen of bestellen. Schrijft status en notities terug in het orderbestand.
- `.github/workflows/verwerk.yml` – de GitHub Action die de robot start. Wordt aangeroepen vanuit de hub.
- `state/portal-state.json` – de bewaarde browserstatus van het portaal (het testportaal bewaart offertes in de browser).

De hub zelf staat op https://ambiance-organisatie.github.io/ambiance-testportaal/bestelhub/ en bevat geen gegevens; die leest en schrijft hij hier met jouw toegangssleutel.

## Eenmalig instellen

1. **Secret voor Claude**: Settings → Secrets and variables → Actions → *New repository secret*: `ANTHROPIC_API_KEY` met een sleutel van console.anthropic.com.
2. Optioneel een **variabele** `ROBOT_MODEL` (zelfde scherm, tabblad *Variables*), bijvoorbeeld `claude-sonnet-5-5`. Zonder variabele gebruikt de robot `claude-sonnet-5-5`.
3. **Toegangssleutel voor de hub**: github.com → Settings → Developer settings → *Fine-grained tokens* → *Generate new token*. Repository access: alleen deze repository. Permissions: **Contents: Read and write** en **Actions: Read and write**. Vul hem in de hub in via *Instellingen*.

## Hoe een order loopt

1. In de hub: order invullen → *Controleren en klaarzetten* (status *Klaar voor leverancier*, bestand wordt hier opgeslagen).
2. *Robot laten invullen*: de hub zet de status op *Wordt ingevuld* en start de workflow met `actie=invullen`.
3. De robot vult de order in, maakt een offerte (bestelt niet) en zet status *Ingevuld bij leverancier* of *Probleem*, met notities en een link naar de run met schermafbeeldingen.
4. *Robot laten bestellen*: zelfde workflow met `actie=bestellen`; status wordt *Besteld* met ordernummer.

Handmatig starten kan ook: Actions → *Verwerk order* → *Run workflow*.

## Lokaal testen

```bash
cd robot && npm install && npx playwright install chromium
ANTHROPIC_API_KEY=... HEADLESS=0 node verwerk.mjs HUB-0001 invullen
```
