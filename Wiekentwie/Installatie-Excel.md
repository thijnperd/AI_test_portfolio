# Wie kent wie? - Excel-versie (VBA)

Deze versie vervangt `Code.gs` en `Index.html`. Alles draait in een Excel-werkmap met één VBA-module: `WieKentWie.bas`. Er is geen Google-account, Apps Script of hosting nodig.

Vereist: **Excel voor Windows** (de module gebruikt `Scripting.Dictionary`, dat op Mac en in Excel voor het web niet bestaat).

## Installeren

1. Open een **lege werkmap** in Excel en sla die op als **Excel-werkmap met macro's (.xlsm)**, bijvoorbeeld `Wie kent wie.xlsm`.
2. Druk op **Alt+F11** om de VBA-editor te openen.
3. Kies **Bestand → Bestand importeren...** en selecteer `WieKentWie.bas`. (Plakken kan ook: maak via **Invoegen → Module** een lege module en plak de inhoud.)
4. Sluit de VBA-editor, druk op **Alt+F8**, kies `Setup` en klik op **Uitvoeren**.
5. Sla de werkmap opnieuw op.

`Setup` maakt drie tabbladen:

| Tabblad | Wat het doet |
|---|---|
| **Aanbod** | Formulier "Ik ken mensen" (voornaam, achternaam, einddatum, contacten) met knop **Aanbod opslaan** |
| **Zoeken** | Formulier "Ik zoek iemand" met knop **Zoeken** en de resultaten eronder |
| **Contacten** | De opgeslagen gegevens. Dit blad is verborgen (`VeryHidden`) |

`Setup` mag je opnieuw uitvoeren; de bestaande gegevens in `Contacten` blijven staan. De formulierbladen worden dan wel opnieuw opgebouwd.

## Macro's toestaan

Excel blokkeert macro's in bestanden die je downloadt of per mail ontvangt. Rechtsklik op het `.xlsm`-bestand in Verkenner, kies **Eigenschappen** en vink onderaan **Blokkering opheffen** aan. Klik daarna in Excel op **Inhoud inschakelen** als die balk verschijnt.

## Gebruik

**Aanbod:** vul voornaam, achternaam en de datum "beschikbaar tot en met" in. Zet in de lijst eronder één persoon of beroep per cel (of meerdere regels in één cel met Alt+Enter). Klik op **Aanbod opslaan**. Onder de knop verschijnt hoeveel contacten zijn opgeslagen, of wat er ontbreekt.

Voorbeeld van de lijst:

```text
Jan de Vries, architect
Fatima Bakker, aannemer
```

**Zoeken:** typ een beroep of naam (minimaal twee tekens) en klik op **Zoeken**. Je ziet `Benader [naam]` met `Beschikbaar tot en met dd-mm-jjjj`, zolang de einddatum niet voorbij is. De lijst met bekende personen van een aanbieder zie je niet.

De zoeklogica is hetzelfde gebleven als in de Google-versie:

- Hoofdletters, accenten, leestekens en extra spaties tellen niet mee.
- Ook tekens die niet in de standaardtabel staan (`ø`, `æ`, `ß`, `ł`, `š`, `ž`, `ć`, `đ`, `ŧ`, `ſ` ...) worden gelijkgetrokken: zoeken kan met of zonder die tekens.
- Namen in een ander schrift (Chinees, Cyrillisch, Koreaans, Vietnamees ...) worden bewaard in plaats van stil weggegooid, maar niet gelijkgetrokken: typ die namen exact zoals ze zijn ingevuld.
- Meerdere inzendingen met dezelfde volledige naam worden één persoon; per contact telt de nieuwste inzending.
- Een aanbieder met alleen een voornaam wordt gekoppeld aan de volledige naam als er minimaal twee exact gelijke contacten zijn en er maar één kandidaat is (`Yannis` + `Yannis Raijmakers`).
- Maximaal 30 resultaten en maximaal 50 contactregels per inzending.

## Bestaande gegevens overzetten uit Google Sheets

1. Kies in Google Sheets **Bestand → Downloaden → Microsoft Excel (.xlsx)** en open het bestand.
2. Selecteer in het tabblad `Contacten` de rijen **onder de kopregel**, kolommen A t/m E, en kopieer ze.
3. Druk in je Excel-werkmap op **Alt+F8** en voer `ToonContacten` uit.
4. Plak de rijen in `Contacten`, direct onder de kopregel (cel A2 als het blad leeg is, anders onder de laatste rij).
5. Voer `VerbergContacten` uit.

Datums die als tekst (`2029-06-29`, eventueel met tijd) binnenkomen worden ook herkend, los van de landinstelling van Windows.

## Beheer-macro's

| Macro | Doel |
|---|---|
| `Setup` | Bouwt de tabbladen op (eenmalig) |
| `ToonContacten` | Toont het verborgen tabblad `Contacten` |
| `VerbergContacten` | Verbergt `Contacten` weer |

Voer je `OpslaanAanbod` of `ZoekAanbod` uit voordat `Setup` is gedraaid (of als een tabblad is hernoemd of verwijderd), dan krijg je een nette melding in plaats van een onbegrijpelijke VBA-fout.

## Deze versie bijwerken

De `.xlsm` bevat een kopie van de code. Als `WieKentWie.bas` is gewijzigd:

1. Open de werkmap en druk op **Alt+F11**.
2. Verwijder in de navigator de bestaande module (rechtsklikken → **Verwijderen**, niet opslaan).
3. Kies **Bestand → Bestand importeren...** en selecteer `WieKentWie.bas`.
4. Sla de werkmap op. `Setup` hoeft niet opnieuw; de gegevens blijven staan.

## Testen

`tests\edge_cases.ps1` voert de macro's echt in Excel uit en controleert de randgevallen (opbouw van de tabbladen, opslaan, zoeken, datums, tekens en limieten):

```text
powershell -ExecutionPolicy Bypass -File tests\edge_cases.ps1
```

- Vereist Excel voor Windows en PowerShell. Er wordt een tijdelijke werkmap gebruikt; jouw `WieKentWie.xlsm` wordt niet gewijzigd.
- Om de `.bas` te kunnen importeren zet het script tijdelijk "Toegang tot het VB-project toestaan" aan en herstelt de oude waarde aan het eind.
- Modale meldingen (zoals die van `Setup`) worden automatisch afgesloten zodat het script niet blijft hangen.
- Exit-code 0 betekent: alle tests geslaagd.

## Beperkingen ten opzichte van de webapp

- **Eén gebruiker tegelijk.** Een Excel-bestand is geen webserver. Deel het niet als bestand met een groep en verwacht dat inzendingen samenkomen; iedereen krijgt zijn eigen kopie. Voor gezamenlijk gebruik moet één persoon het bestand beheren, of moet het op een gedeelde netwerkschijf staan waar telkens één persoon tegelijk in werkt.
- **Geen echte geheimhouding.** Wie het bestand heeft, kan met de VBA-editor het verborgen tabblad `Contacten` zichtbaar maken en alle contactlijsten lezen. Bladbeveiliging en `VeryHidden` zijn hier een drempel, geen slot. Deel het bestand dus alleen met mensen die alle gegevens mogen zien.
- **Geen directe links.** De `?view=offer` en `?view=search` uit de webapp bestaan niet; de tabbladen `Aanbod` en `Zoeken` vervangen ze.
- **Zoeken gaat via de knop.** Enter in het zoekveld start de zoekopdracht niet.
