# ====================================================================
# Edge-case tests voor WieKentWie.bas
#
# Draait Excel via COM, importeert de module in een verse werkmap en
# voert de macro's echt uit. Resultaat: PASS/FAIL per geval + exit-code.
#
#   powershell -ExecutionPolicy Bypass -File tests\edge_cases.ps1
#
# Vereist: Excel voor Windows. Het importeren van de .bas in het
# VBProject vereist tijdelijk "Toegang tot het VB-project toestaan";
# de script zet dat aan en herstelt de oude waarde aan het eind.
# ====================================================================
[CmdletBinding()]
param(
    [string]$BasPath,
    [switch]$KeepOpen
)
$ErrorActionPreference = 'Stop'
trap {
    Write-Host ("  [FOUT] " + $_.Exception.Message) -ForegroundColor Magenta
    Write-Host ("  [REGEL] " + $_.InvocationInfo.PositionMessage) -ForegroundColor Magenta
    break
}
if (-not $BasPath) { $BasPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'WieKentWie.bas' }
$BasPath = (Resolve-Path -LiteralPath $BasPath).Path
$dismiss = Join-Path $PSScriptRoot 'dismiss_dialog.ps1'

$script:Results = New-Object System.Collections.Generic.List[string]
$script:watchers = @()

function T([string]$Naam, $Cond, [string]$Detail = '') {
    if ([bool]$Cond) {
        $script:Results.Add("PASS`t$Naam")
        Write-Host ("  ok    " + $Naam) -ForegroundColor Green
    } else {
        $script:Results.Add("FAIL`t$Naam`t$Detail")
        Write-Host ("  FAIL  " + $Naam + "  --  " + $Detail) -ForegroundColor Red
    }
}
function TEq([string]$Naam, $Actual, $Expected) {
    $a = if ($null -eq $Actual) { '<null>' } else { [string]$Actual }
    $e = if ($null -eq $Expected) { '<null>' } else { [string]$Expected }
    T $Naam ($a -ceq $e) "verwacht [$e], kreeg [$a]"
}

function Start-Watcher([string]$Titel, [string]$Knop, [string]$OutFile, [int]$TimeoutSec = 600) {
    $ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $dismiss),
                 '-Title', ('"{0}"' -f $Titel), '-ButtonText', ('"{0}"' -f $Knop),
                 '-OutFile', ('"{0}"' -f $OutFile), '-TimeoutSec', $TimeoutSec)
    $p = Start-Process -FilePath $ps -ArgumentList $argList -WindowStyle Hidden -PassThru
    $script:watchers += , $p
    Start-Sleep -Milliseconds 300
}

# --- tijdelijk AccessVBOM aanzetten (en aan het eind herstellen) -------
$secKey = 'HKCU:\Software\Microsoft\Office\16.0\Excel\Security'
$hadKey = Test-Path $secKey
$oldProp = Get-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue
$hadAccess = $null -ne $oldProp
$oldAccess = if ($hadAccess) { $oldProp.AccessVBOM } else { $null }
$createdKey = $false
if (-not $hadKey) { New-Item -Path $secKey -Force | Out-Null; $createdKey = $true }
Set-ItemProperty -Path $secKey -Name AccessVBOM -Type DWord -Value 1

$xl = $null; $wb = $null
$tmpBase = Join-Path $env:TEMP ('wkw_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpBase -Force | Out-Null

try {
    Write-Host "Omgeving: cultuur=$(Get-Culture).Name systeemtaal=$((Get-WinSystemLocale).Name)  Excel=16.0"
    Write-Host "Module: $BasPath`n"

    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $true
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.ScreenUpdating = $false

    $wb = $xl.Workbooks.Add()
    $wbName = $wb.Name

    # ---- module importeren -------------------------------------------
    try {
        $null = $wb.VBProject.VBComponents.Import($BasPath)
        T 'Module importeert in een verse werkmap' $true
    } catch {
        T 'Module importeert in een verse werkmap' $false $_.Exception.Message
        throw 'Import mislukt; tests afgebroken.'
    }

    function Run-Macro([string]$Naam) {
        try { $null = $xl.Run("'$wbName'!$Naam"); return $null }
        catch { return $_.Exception.Message }
    }

    # ---- dialoog-sluiters: een modale melding blokkeert Application.Run ----
    $dlgFile = Join-Path $tmpBase 'dialoog.txt'
    Start-Watcher 'Wie kent wie?' 'OK' $dlgFile 600
    Start-Watcher 'Microsoft Excel' 'Einde' (Join-Path $tmpBase 'excel_fout.txt') 600

    # ---- Setup --------------------------------------------------------
    $err = Run-Macro 'Setup'
    Start-Sleep -Milliseconds 400
    T 'Setup draait zonder fout' ($null -eq $err) ([string]$err)
    if (Test-Path $dlgFile) { Write-Host ("       Setup-dialoog: " + (Get-Content -LiteralPath $dlgFile -Raw)) }

    function Haal-Bladen {
        $n = @()
        for ($i = 1; $i -le $wb.Worksheets.Count; $i++) { $n += $wb.Worksheets.Item($i).Name }
        , $n
    }
    function Laatste-Rij($ws) { $ws.Cells.Item($ws.Rows.Count, 1).End(-4162).Row }

    $namen = Haal-Bladen
    T 'Setup maakt Aanbod, Zoeken en Contacten' (($namen -contains 'Aanbod') -and ($namen -contains 'Zoeken') -and ($namen -contains 'Contacten')) ($namen -join ',')
    T 'Leeg standaardblad wordt verwijderd (3 tabbladen over)' ($wb.Worksheets.Count -eq 3) ("{0} tabbladen" -f $wb.Worksheets.Count)

    $wsC = $wb.Worksheets.Item('Contacten')
    $wsA = $wb.Worksheets.Item('Aanbod')
    $wsZ = $wb.Worksheets.Item('Zoeken')

    T 'Contacten is VeryHidden' ($wsC.Visible -eq 2) ("zichtbaarheid={0}" -f $wsC.Visible)
    $kop = "{0}|{1}|{2}|{3}|{4}" -f $wsC.Range('A1').Value2, $wsC.Range('B1').Value2, $wsC.Range('C1').Value2, $wsC.Range('D1').Value2, $wsC.Range('E1').Value2
    TEq 'Contacten heeft de kopregel' $kop 'Inzending ID|Naam|Bekende persoon of beroep|Beschikbaar tot|Toegevoegd op'
    T 'Aanbod is beveiligd' ([bool]$wsA.ProtectContents)
    T 'Zoeken is beveiligd' ([bool]$wsZ.ProtectContents)
    T 'Invoercel C5 Aanbod is ontgrendeld' (-not [bool]$wsA.Range('C5').Locked)
    T 'Labelcel B5 Aanbod is vergrendeld' ([bool]$wsA.Range('B5').Locked)
    T 'Lijstcellen C11:C60 zijn ontgrendeld' (-not [bool]$wsA.Range('C11').Locked)
    T 'Invoercel C5 Zoeken is ontgrendeld' (-not [bool]$wsZ.Range('C5').Locked)
    $vormen = @(); foreach ($sh in $wsA.Shapes) { $vormen += $sh.Name }
    T 'Knop Aanbod opslaan bestaat' ($vormen -contains 'btnOpslaan') ($vormen -join ',')
    $knopA = $null; $knopZ = $null
    try { $knopA = $wsA.Shapes.Item('btnOpslaan').OnAction } catch { }
    try { $knopZ = $wsZ.Shapes.Item('btnZoeken').OnAction } catch { }
    TEq 'Knop Aanbod roept OpslaanAanbod aan' $knopA 'OpslaanAanbod'
    TEq 'Knop Zoeken roept ZoekAanbod aan' $knopZ 'ZoekAanbod'

    # ---- Setup opnieuw: gegevens blijven staan ------------------------
    $wsC.Cells.Item(2, 1).NumberFormat = '@'
    $wsC.Cells.Item(2, 1).Value2 = 'id-behouder'
    $wsC.Cells.Item(2, 2).Value2 = 'Piet Pietersen'
    $wsC.Cells.Item(2, 3).Value2 = 'architect'
    $wsC.Cells.Item(2, 4).Value2 = [datetime]'2099-01-01'
    $wsC.Cells.Item(2, 5).Value2 = [datetime]'2026-01-01'
    $nVoor = $wb.Worksheets.Count
    $err = Run-Macro 'Setup'
    Start-Sleep -Milliseconds 400
    $wsC = $wb.Worksheets.Item('Contacten')
    $wsA = $wb.Worksheets.Item('Aanbod')
    $wsZ = $wb.Worksheets.Item('Zoeken')
    T 'Setup opnieuw draait zonder fout' ($null -eq $err) ([string]$err)
    T 'Setup opnieuw dupliceert geen tabbladen' ($wb.Worksheets.Count -eq $nVoor) ("{0} -> {1}" -f $nVoor, $wb.Worksheets.Count)
    TEq 'Setup opnieuw bewaart Contacten-gegevens' $wsC.Cells.Item(2, 1).Value2 'id-behouder'

    # ---- helpers ------------------------------------------------------
    function Reset-Alles {
        $c = $wb.Worksheets.Item('Contacten')
        $last = Laatste-Rij $c
        if ($last -ge 2) { $c.Range("A2:E$last").ClearContents() }
        $a = $wb.Worksheets.Item('Aanbod'); $a.Unprotect()
        $a.Range('C5:C7').ClearContents(); $a.Range('C9').ClearContents(); $a.Range('C11:C60').ClearContents()
        $a.Protect()
        $z = $wb.Worksheets.Item('Zoeken'); $z.Unprotect()
        $z.Range('C5').ClearContents(); $z.Range('C7').ClearContents(); $z.Range('B9:C60').ClearContents()
        $z.Protect()
        $script:wsC = $c; $script:wsA = $a; $script:wsZ = $z
    }

    function Vul-Aanbod([string]$Voornaam, $Achternaam, $Datum, [string[]]$Contacten, [switch]$EenCel) {
        $a = $wb.Worksheets.Item('Aanbod')
        if ($null -ne $Voornaam) { $a.Range('C5').Value2 = $Voornaam }
        if ($null -ne $Achternaam) { $a.Range('C6').Value2 = $Achternaam }
        if ($null -ne $Datum) {
            try { $a.Range('C7').Value2 = $Datum }
            catch {
                Write-Host ('       [debug] C7-set: ' + $_.Exception.Message) -ForegroundColor Magenta
                Write-Host ('       [debug] inner: ' + $_.Exception.InnerException) -ForegroundColor Magenta
                Write-Host ('       [debug] datum: ' + $Datum.GetType().FullName) -ForegroundColor Magenta
                try { $a.Range('C7').Value2 = [double]$Datum.ToOADate(); Write-Host '       [debug] OADate-set werkt' -ForegroundColor Magenta }
                catch { Write-Host ('       [debug] OADate-set faalt: ' + $_.Exception.Message) -ForegroundColor Magenta }
            }
        }
        if ($Contacten) {
            if ($EenCel) {
                $a.Range('C11').Value2 = ($Contacten -join "`n")
            } else {
                for ($i = 0; $i -lt $Contacten.Count; $i++) {
                    $a.Cells.Item(11 + $i, 3).Value2 = $Contacten[$i]
                }
            }
        }
    }
    function Melding-Aanbod { [string]$wb.Worksheets.Item('Aanbod').Range('C9').Value2 }
    function Melding-Zoeken { [string]$wb.Worksheets.Item('Zoeken').Range('C7').Value2 }

    function Opslaan {
        $err = Run-Macro 'OpslaanAanbod'
        if ($err) { Write-Host ("       (onverwachte fout: $err)") -ForegroundColor Yellow }
    }
    function Zoek([string]$Vraag) {
        $z = $wb.Worksheets.Item('Zoeken')
        $z.Unprotect()
        if ($null -ne $Vraag) { $z.Range('C5').Value2 = $Vraag }
        $z.Protect()
        $err = Run-Macro 'ZoekAanbod'
        if ($err) { Write-Host ("       (onverwachte fout: $err)") -ForegroundColor Yellow }
        $regels = @()
        for ($r = 9; $r -le 60; $r++) {
            $b = $z.Cells.Item($r, 2).Value2
            if ($null -ne $b -and [string]$b -ne '') {
                $regels += [pscustomobject]@{ Benader = [string]$b; Beschikbaar = [string]$z.Cells.Item($r, 3).Value2 }
            }
        }
        [pscustomobject]@{ Melding = [string]$z.Range('C7').Value2; Regels = $regels }
    }

    function Voeg-ContactToe([string]$Id, [string]$Naam, [string]$Persoon, $Tot, $Toegevoegd, [switch]$DatumAlsTekst) {
        $c = $wb.Worksheets.Item('Contacten')
        $last = Laatste-Rij $c
        $r = $last + 1
        if ($r -lt 2) { $r = 2 }
        $c.Cells.Item($r, 1).NumberFormat = '@'
        $c.Cells.Item($r, 2).NumberFormat = '@'
        $c.Cells.Item($r, 3).NumberFormat = '@'
        $c.Cells.Item($r, 1).Value2 = $Id
        $c.Cells.Item($r, 2).Value2 = $Naam
        $c.Cells.Item($r, 3).Value2 = $Persoon
        if ($DatumAlsTekst) {
            $c.Cells.Item($r, 4).NumberFormat = '@'
            $c.Cells.Item($r, 4).Value2 = [string]$Tot
        } else {
            $c.Cells.Item($r, 4).NumberFormat = 'yyyy-mm-dd'
            $c.Cells.Item($r, 4).Value2 = $Tot
        }
        $c.Cells.Item($r, 5).NumberFormat = 'yyyy-mm-dd hh:mm'
        $c.Cells.Item($r, 5).Value2 = $Toegevoegd
        $r
    }

    $vandaag = [datetime]::Today
    $morgen = $vandaag.AddDays(1)
    $verleden = $vandaag.AddDays(-1)
    $ver = [datetime]'2099-06-30'

    # ==================================================================
    # AANBOD
    # ==================================================================
    Write-Host "`n--- Aanbod opslaan ---"

    Reset-Alles; Vul-Aanbod '' 'de Vries' $morgen @('architect'); Opslaan
    TEq 'Lege voornaam geeft melding' (Melding-Aanbod) 'Vul je voornaam in.'

    Reset-Alles; Vul-Aanbod 'Jan' '' $morgen @('architect'); Opslaan
    TEq 'Lege achternaam geeft melding' (Melding-Aanbod) 'Vul je achternaam in.'

    Reset-Alles; Vul-Aanbod '   ' 'de Vries' $morgen @('architect'); Opslaan
    TEq 'Voornaam van alleen spatieen telt als leeg' (Melding-Aanbod) 'Vul je voornaam in.'

    Reset-Alles; Vul-Aanbod 'Jan' 'de Vries' $morgen @(); Opslaan
    TEq 'Geen contacten geeft melding' (Melding-Aanbod) 'Vul minimaal 1 persoon of beroep in.'

    Reset-Alles; Vul-Aanbod 'Jan' 'de Vries' $morgen @('!!!', '???') -EenCel; Opslaan
    TEq 'Contacten van alleen leestekens tellen niet' (Melding-Aanbod) 'Vul minimaal 1 persoon of beroep in.'

    Reset-Alles
    $bouw = @(); for ($i = 1; $i -le 51; $i++) { $bouw += "persoon $i" }
    Vul-Aanbod 'Jan' 'de Vries' $morgen @($bouw -join "`n") -EenCel; Opslaan
    TEq '51 regels wordt geweigerd' (Melding-Aanbod) 'Vul maximaal 50 regels in.'

    Reset-Alles
    $bouw = @(); for ($i = 1; $i -le 51; $i++) { $bouw += "persoon $i" }
    $bouw[50] = 'PERSOON 1'   # duplicate met andere hoofdletters
    Vul-Aanbod 'Jan' 'de Vries' $morgen @($bouw -join "`n") -EenCel; Opslaan
    TEq '51 regels met 1 duplicate wordt 50 (toegestaan)' (Melding-Aanbod) '50 contacten opgeslagen.'

    Reset-Alles; Vul-Aanbod 'Jan' 'de Vries' $null @('architect'); Opslaan
    TEq 'Lege einddatum geeft melding' (Melding-Aanbod) 'Kies een geldige einddatum.'

    Reset-Alles; Vul-Aanbod 'Jan' 'de Vries' $verleden @('architect'); Opslaan
    TEq 'Einddatum in het verleden wordt geweigerd' (Melding-Aanbod) 'Kies een datum van vandaag of later.'

    Reset-Alles; Vul-Aanbod 'Jan' 'de Vries' $vandaag @('architect'); Opslaan
    TEq 'Einddatum vandaag wordt geaccepteerd' (Melding-Aanbod) '1 contact opgeslagen.'

    Reset-Alles
    $laatsteRij = Laatste-Rij $wsC
    T 'Opslaan schrijft id, naam, contact en datums' (($laatsteRij -eq 2) -and ("{0}|{1}" -f $wsC.Cells.Item(2, 2).Value2, $wsC.Cells.Item(2, 3).Value2) -eq 'Jan de Vries|architect') ("laatste rij={0}" -f $laatsteRij)
    T 'Einddatum wordt een echte datum (getal)' ($wsC.Cells.Item(2, 4).Value2 -is [double]) ("type={0}" -f $wsC.Cells.Item(2, 4).Value2.GetType().Name)
    T 'Id lijkt op een uuid' ([string]$wsC.Cells.Item(2, 1).Value2 -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') ([string]$wsC.Cells.Item(2, 1).Value2)
    TEq 'Formulier wordt geleegd na opslaan' ([string]$wb.Worksheets.Item('Aanbod').Range('C5').Value2) ''

    # tekst-ISO-datum in het formulier
    Reset-Alles
    $a = $wb.Worksheets.Item('Aanbod'); $a.Unprotect(); $a.Range('C7').NumberFormat = '@'; $a.Protect()
    Vul-Aanbod 'Jan' 'de Vries' '2099-12-31' @('architect'); Opslaan
    TEq 'Tekstdatum ISO-vorm in formulier wordt herkend' (Melding-Aanbod) '1 contact opgeslagen.'

    # datums als tekst in Contacten (geplakt uit Google Sheets)
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' '2099-06-29' $ver
    $isTekst = ($wsC.Cells.Item(2, 4).Value2 -is [string])
    T 'Testopzet: geplakte ISO-datum blijft tekst' $isTekst ("type={0}" -f $wsC.Cells.Item(2, 4).Value2.GetType().Name)
    $r = Zoek 'architect'
    T 'ISO-tekstdatum in Contacten wordt herkend' (@($r.Regels).Count -eq 1) ("melding: $($r.Melding)")

    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' ([datetime]'2099-06-29') $ver
    $r = Zoek 'architect'
    T 'Gewone datum levert 1 resultaat' (@($r.Regels).Count -eq 1) ("melding: $($r.Melding)")
    TEq 'Resultaat toont naam' $r.Regels[0].Benader 'Benader Jan de Vries'
    TEq 'Resultaat toont einddatum dd-mm-jjjj' $r.Regels[0].Beschikbaar 'Beschikbaar tot en met 29-06-2099'

    # meerregelige cel + foutwaarde + dubbele
    Reset-Alles
    Vul-Aanbod 'Joke' 'Janssen' $morgen @("architect`nbouwvakker", "ARCHITECT!!") -EenCel
    $wb.Worksheets.Item('Aanbod').Cells.Item(12, 3).Formula = '=NA()'
    Opslaan
    TEq 'Meerregelige cel, leestekens en foutwaarde leveren 2 unieke contacten' (Melding-Aanbod) '2 contacten opgeslagen.'

    # lange waarden
    Reset-Alles
    $langeNaam = 'N' * 100
    $langContact = ('c' * 200)
    Vul-Aanbod $langeNaam 'Achternaam' $morgen @($langContact); Opslaan
    TEq 'Voornaam wordt afgekapt op 80 tekens' ([string]$wsC.Cells.Item(2, 2).Value2).Length (80 + 1 + 10)  # 80 + spatie + achternaam(10)
    T 'Contact wordt afgekapt op 150 tekens' (([string]$wsC.Cells.Item(2, 3).Value2).Length -le 150) ("lengte={0}" -f ([string]$wsC.Cells.Item(2, 3).Value2).Length)

    # ==================================================================
    # ZOEKEN
    # ==================================================================
    Write-Host "`n--- Zoeken ---"

    Reset-Alles
    TEq 'Lege zoekopdracht geeft melding' (Zoek '').Melding 'Typ minimaal twee tekens om te zoeken.'
    TEq 'Zoekopdracht van 1 teken geeft melding' (Zoek 'a').Melding 'Typ minimaal twee tekens om te zoeken.'
    TEq 'Zoekopdracht van alleen leestekens geeft melding' (Zoek '!!').Melding 'Typ minimaal twee letters of cijfers om te zoeken.'
    TEq 'Geen data geeft geen match' (Zoek 'architect').Melding 'Geen geldige match gevonden.'

    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect en stedenbouwkundige' ([datetime]$ver) $ver
    $r = Zoek 'ARChitect!!'
    TEq 'Zoeken is niet hoofdletter- en leesteken-gevoelig' (@($r.Regels).Count) 1
    $r = Zoek 'stedenbouw'
    TEq 'Deelwoorden worden gevonden' (@($r.Regels).Count) 1
    $r = Zoek 'architect aannemer'
    TEq 'Meerdere woorden moeten allemaal voorkomen' (@($r.Regels).Count) 0

    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' 'Eric de Groot, chauffeur' ([datetime]$ver) $ver
    $r = Zoek 'Eric de groot!'
    TEq 'Zoeken met accent in data matcht met accentloze zoekterm' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")

    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' $verleden $ver
    $r = Zoek 'architect'
    TEq 'Verlopen aanbod wordt niet getoond' (@($r.Regels).Count) 0
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' $vandaag $ver
    $r = Zoek 'architect'
    TEq 'Aanbod dat vandaag afloopt wordt nog getoond' (@($r.Regels).Count) 1

    # oude vs nieuwe inzending voor dezelfde aanbieder+contact
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' $morgen ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id2' 'Jan de Vries' 'architect' $verleden ([datetime]'2026-06-01')
    $r = Zoek 'architect'
    TEq 'Nieuwste inzending wint (nieuwste is verlopen)' (@($r.Regels).Count) 0
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Jan de Vries' 'architect' $verleden ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id2' 'Jan de Vries' 'architect' $morgen ([datetime]'2026-06-01')
    $r = Zoek 'architect'
    TEq 'Nieuwste inzending wint (nieuwste is geldig)' (@($r.Regels).Count) 1

    # alias: alleen voornaam met precies 1 kandidaat en >=2 gedeelde contacten
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Yannis' 'timmerman' ([datetime]$ver) ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id1' 'Yannis' 'schilder' ([datetime]$ver) ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id2' 'Yannis Raijmakers' 'timmerman' ([datetime]$ver) ([datetime]'2026-01-02')
    $null = Voeg-ContactToe 'id2' 'Yannis Raijmakers' 'schilder' ([datetime]$ver) ([datetime]'2026-01-02')
    $r = Zoek 'timmerman'
    TEq 'Alias koppelt voornaam aan volledige naam' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")
    if (@($r.Regels).Count -gt 0) { TEq 'Alias toont de volledige naam' $r.Regels[0].Benader 'Benader Yannis Raijmakers' }

    # alias met 2 kandidaten -> geen alias
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Yannis' 'timmerman' ([datetime]$ver) ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id1' 'Yannis' 'schilder' ([datetime]$ver) ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id2' 'Yannis Raijmakers' 'timmerman' ([datetime]$ver) ([datetime]'2026-01-02')
    $null = Voeg-ContactToe 'id2' 'Yannis Raijmakers' 'schilder' ([datetime]$ver) ([datetime]'2026-01-02')
    $null = Voeg-ContactToe 'id3' 'Yannis de Boer' 'timmerman' ([datetime]$ver) ([datetime]'2026-01-03')
    $null = Voeg-ContactToe 'id3' 'Yannis de Boer' 'schilder' ([datetime]$ver) ([datetime]'2026-01-03')
    $r = Zoek 'timmerman'
    TEq 'Twee kandidaten -> geen alias' (@($r.Regels).Count) 2 ("melding: $($r.Melding)")

    # verschillende schrijfwijzen van dezelfde naam -> 1 aanbieder
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'jan de vries' 'architect' ([datetime]$ver) ([datetime]'2026-01-01')
    $null = Voeg-ContactToe 'id2' 'Jan  De Vries' 'aannemer' ([datetime]$ver) ([datetime]'2026-01-02')
    $r = Zoek 'architect'
    TEq 'Dezelfde naam in andere schrijfwijze telt als 1 aanbieder' (@($r.Regels).Count) 1

    # maximaal 30 resultaten + oud resultaat wordt gewist
    Reset-Alles
    for ($i = 1; $i -le 40; $i++) {
        $null = Voeg-ContactToe ("id{0}" -f $i) ("Aanbieder {0}" -f $i) 'loodgieter' ([datetime]$ver) ([datetime]'2026-01-01')
    }
    $r = Zoek 'loodgieter'
    TEq 'Maximaal 30 resultaten' (@($r.Regels).Count) 30
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' 'loodgieter' ([datetime]$ver) ([datetime]'2026-01-01')
    $r = Zoek 'loodgieter'
    TEq 'Oude resultaatregels worden gewist' (@($r.Regels).Count) 1

    # Tekens buiten de accenttabel. Als [char]-codes, zodat het bestand
    # ASCII blijft en PowerShell 5.1 het niet vervormt.
    $metO = 'S' + [char]0x00F8 + 'ren Bakker'      ' S ren Bakker (o met streep)
    $metViet = 'Nguy' + [char]0x1EB4 + 'n'         ' Nguyen met diacriet
    $metAe = [char]0x00C6 + 'var ' + [char]0x00D8 + 'degaard'   ' A var O degaard
    $nietLatijn = [char]0x674E + [char]0x660E      ' twee Chinese tekens

    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' $metO ([datetime]$ver) ([datetime]'2026-01-01')
    $r = Zoek 'Soren'
    T 'Zoeken zonder o-met-streep matcht op data met o-met-streep' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' $metO ([datetime]$ver) ([datetime]'2026-01-01')
    $r = Zoek ('S' + [char]0x00F8 + 'ren')
    T 'Zoeken met o-met-streep matcht op data met o-met-streep' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' $metAe ([datetime]$ver) ([datetime]'2026-01-01')
    $r = Zoek 'Avar Odegaard'
    T 'Zoeken matcht op naam met ae- en oe-ligatuur' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")
    Reset-Alles
    $null = Voeg-ContactToe 'id1' 'Piet Pietersen' $metViet ([datetime]$ver) ([datetime]'2026-01-01')
    $r = Zoek $metViet
    T 'Naam met diacriet buiten de tabel wordt bewaard en met dezelfde schrijfwijze gevonden' (@($r.Regels).Count) 1 ("melding: $($r.Melding)")
    Reset-Alles
    Vul-Aanbod 'Jan' 'de Vries' $morgen @($nietLatijn); Opslaan
    T 'Contact dat volledig niet-Latijns is wordt bewaard' ((Melding-Aanbod) -eq '1 contact opgeslagen.') (Melding-Aanbod)

} finally {
    # ---- opruimen ------------------------------------------------------
    foreach ($w in @($script:watchers)) {
        try { if ($w -and -not $w.HasExited) { $w.Kill() } } catch { }
    }
    try {
        if ($wb) { $wb.Close($false) }
    } catch { }
    try {
        if ($xl) { $xl.Quit() }
    } catch { }
    try {
        if ($xl) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
    } catch { }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()

    if ($hadAccess) { Set-ItemProperty -Path $secKey -Name AccessVBOM -Type DWord -Value $oldAccess }
    elseif ($createdKey) { Remove-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue }
    if ($createdKey) {
        $rest = (Get-Item -Path $secKey).Property
        if (-not $rest -or $rest.Count -eq 0) { Remove-Item -Path $secKey -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item -LiteralPath $tmpBase -Recurse -Force -ErrorAction SilentlyContinue
}

# ---- samenvatting ------------------------------------------------------
$mislukt = @($script:Results | Where-Object { $_ -like "FAIL*" })
$kleur = if ($mislukt.Count -gt 0) { 'Red' } else { 'Green' }
Write-Host ""
Write-Host ("{0} tests geslaagd, {1} gefaald." -f ($script:Results.Count - $mislukt.Count), $mislukt.Count) -ForegroundColor $kleur
foreach ($f in $mislukt) { Write-Host ("  " + ($f -replace "`t", '  --  ')) -ForegroundColor Red }
if ($mislukt.Count -gt 0) { exit 1 } else { exit 0 }
