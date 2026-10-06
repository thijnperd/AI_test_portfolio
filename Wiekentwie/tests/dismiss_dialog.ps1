# Wacht tot een dialoogvenster (MsgBox) met een van de opgegeven titel
# verschijnt, klikt de gewenste knop en bewaart de dialoogtekst.
# Blijft draaien tot de timeout, zodat ook een tweede of derde melding
# tijdens dezelfde testronde wordt afgesloten.
# Wordt door edge_cases.ps1 als achtergrondproces gestart, omdat een modale
# MsgBox anders Application.Run blokkeert.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Title,
    [string]$ButtonText = 'OK',
    [string]$OutFile,
    [int]$TimeoutSec = 600,
    [int]$PollMs = 150
)

$null = Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WkwWin {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@

$ouder = $PID
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    # Eigenaar weg? Dan is de testronde voorbij; niet langer meeklikken.
    if (-not (Get-Process -Id $ouder -ErrorAction SilentlyContinue)) { break }

    $dlg = [WkwWin]::FindWindow('#32770', $Title)
    if ($dlg -ne [IntPtr]::Zero) {
        # Tekst van alle kind-vensters vastleggen (de melding zelf).
        $teksten = New-Object System.Collections.Generic.List[string]
        $child = [IntPtr]::Zero
        while ($true) {
            $child = [WkwWin]::FindWindowEx($dlg, $child, $null, $null)
            if ($child -eq [IntPtr]::Zero) { break }
            $sb = New-Object System.Text.StringBuilder 1024
            $null = [WkwWin]::GetWindowText($child, $sb, 1024)
            if ($sb.Length -gt 0) { $teksten.Add($sb.ToString()) }
        }
        if ($OutFile) {
            try { Add-Content -LiteralPath $OutFile -Value ($teksten -join ' | ') -Encoding UTF8 } catch { }
        }

        # Knop zoeken: eerst de gevraagde knoptekst, anders de eerste knop.
        $knoppen = New-Object System.Collections.Generic.List[object]
        $child = [IntPtr]::Zero
        while ($true) {
            $child = [WkwWin]::FindWindowEx($dlg, $child, 'Button', $null)
            if ($child -eq [IntPtr]::Zero) { break }
            $sb = New-Object System.Text.StringBuilder 256
            $null = [WkwWin]::GetWindowText($child, $sb, 256)
            $knoppen.Add([pscustomobject]@{ Handle = $child; Tekst = $sb.ToString() })
        }
        $pick = $null
        foreach ($k in $knoppen) { if ($k.Tekst -eq $ButtonText) { $pick = $k; break } }
        if (-not $pick -and $knoppen.Count -gt 0) { $pick = $knoppen[0] }
        if ($pick) {
            $null = [WkwWin]::SendMessage($pick.Handle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
        }
        Start-Sleep -Milliseconds 500
    } else {
        Start-Sleep -Milliseconds $PollMs
    }
}
if ($OutFile -and -not (Test-Path -LiteralPath $OutFile)) {
    try { Set-Content -LiteralPath $OutFile -Value 'GEEN DIALOOG GEZIEN' -Encoding UTF8 } catch { }
}
exit 0
