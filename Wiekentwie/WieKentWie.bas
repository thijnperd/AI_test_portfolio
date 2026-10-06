Option Explicit

' =====================================================================
' Wie kent wie? - Excel-versie (VBA)
' Vervangt Code.gs + Index.html van de Google Apps Script-versie.
' Vereist Excel voor Windows (gebruikt Scripting.Dictionary).
' Alle tekst in deze module is ASCII, dus importeren of plakken gaat goed.
' Importeren: VBA-editor (Alt+F11) > Bestand > Bestand importeren > dit .bas-bestand.
' Daarna Setup uitvoeren (Alt+F8) en opslaan als .xlsm.
' =====================================================================

Private Const TAB_NAME As String = "Contacten"
Private Const SHEET_OFFER As String = "Aanbod"
Private Const SHEET_SEARCH As String = "Zoeken"
Private Const NCOLS As Long = 5
Private Const FOUT_NR As Long = vbObjectError + 1000
Private Const CONTACT_RANGE As String = "C11:C60"
Private Const RESULT_FIRST_ROW As Long = 9
Private Const RESULT_RANGE As String = "B9:C60"
Private Const MAX_CONTACTS As Long = 50
Private Const MAX_RESULTS As Long = 30
Private Const SHAPE_ROUNDED_RECT As Long = 5

' ---------------------------------------------------------------------
' Eenmalig uitvoeren: maakt de tabbladen Aanbod, Zoeken en Contacten aan.
' ---------------------------------------------------------------------
Public Sub Setup()
    Dim wsC As Worksheet, wsA As Worksheet, wsZ As Worksheet
    Dim kop As Variant, gevonden As Variant, i As Long

    On Error GoTo Fout
    ThisWorkbook.Activate
    Application.ScreenUpdating = False
    kop = Array("Inzending ID", "Naam", "Bekende persoon of beroep", "Beschikbaar tot", "Toegevoegd op")

    Set wsC = ZoekBlad(TAB_NAME)
    If wsC Is Nothing Then
        Set wsC = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        wsC.Name = TAB_NAME
    End If
    wsC.Visible = xlSheetVisible

    If Application.WorksheetFunction.CountA(wsC.Cells) = 0 Then
        wsC.Range("A1:E1").Value2 = kop
    Else
        gevonden = wsC.Range("A1:E1").Value2
        For i = 0 To NCOLS - 1
            If TekstVan(gevonden(1, i + 1)) <> kop(i) Then
                Err.Raise FOUT_NR, , "Het tabblad Contacten heeft andere kolommen. Gebruik een lege werkmap."
            End If
        Next i
    End If

    With wsC
        .Columns("A:C").NumberFormat = "@"
        .Columns("D").NumberFormat = "yyyy-mm-dd"
        .Columns("E").NumberFormat = "yyyy-mm-dd hh:mm"
        With .Range("A1:E1")
            .Font.Bold = True
            .Interior.Color = RGB(220, 233, 247)
        End With
        .Columns("A").ColumnWidth = 26
        .Columns("B:C").ColumnWidth = 34
        .Columns("D").ColumnWidth = 18
        .Columns("E").ColumnWidth = 22
        .Activate
    End With
    ActiveWindow.FreezePanes = False
    wsC.Range("A2").Select
    ActiveWindow.FreezePanes = True

    Set wsA = HaalOfMaakBlad(SHEET_OFFER, wsC)
    Set wsZ = HaalOfMaakBlad(SHEET_SEARCH, wsC)
    BouwAanbodBlad wsA
    BouwZoekBlad wsZ
    VerwijderLegeStandaardbladen

    wsC.Visible = xlSheetVeryHidden
    wsA.Activate
    Application.ScreenUpdating = True
    MsgBox "Klaar. De tabbladen Aanbod en Zoeken staan klaar en Contacten is verborgen." & vbCrLf & _
           "Sla de werkmap op als .xlsm (Excel-werkmap met macro's).", vbInformation, "Wie kent wie?"
    Exit Sub

Fout:
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    MsgBox "Setup is niet gelukt: " & Err.Description, vbExclamation, "Wie kent wie?"
End Sub

' ---------------------------------------------------------------------
' Knop "Aanbod opslaan" (tabblad Aanbod)
' ---------------------------------------------------------------------
Public Sub OpslaanAanbod()
    Dim wsA As Worksheet, wsC As Worksheet
    Dim voornaam As String, achternaam As String, naam As String
    Dim expires As Date, nu As Date
    Dim contacten As Object, items As Variant
    Dim cel As Range, regel As Variant
    Dim melding As String
    Dim tekst As String, c As String, sleutel As String, id As String
    Dim rijen() As Variant
    Dim n As Long, start As Long, i As Long

    On Error GoTo Fout
    Set wsA = ZoekBlad(SHEET_OFFER)
    If wsA Is Nothing Then Err.Raise FOUT_NR, , "Het tabblad Aanbod ontbreekt. Voer eerst Setup uit (Alt+F8)."

    voornaam = Schoon(wsA.Range("C5").Value2, 80)
    achternaam = Schoon(wsA.Range("C6").Value2, 80)
    If Len(voornaam) = 0 Then Err.Raise FOUT_NR, , "Vul je voornaam in."
    If Len(achternaam) = 0 Then Err.Raise FOUT_NR, , "Vul je achternaam in."
    naam = voornaam & " " & achternaam
    expires = GeldigeDatum(wsA.Range("C7").Value2)

    ' Per cel mag ook meer dan een regel staan (Alt+Enter); dubbelen vallen weg.
    Set contacten = MaakDict()
    For Each cel In wsA.Range(CONTACT_RANGE).Cells
        tekst = Replace(Replace(TekstVan(cel.Value2), vbCrLf, vbLf), vbCr, vbLf)
        For Each regel In Split(tekst, vbLf)
            c = Schoon(regel, 150)
            sleutel = Normaliseer(c)
            If Len(sleutel) > 0 Then
                If Not contacten.Exists(sleutel) Then contacten.Add sleutel, c
            End If
        Next regel
    Next cel

    n = contacten.Count
    If n = 0 Then Err.Raise FOUT_NR, , "Vul minimaal 1 persoon of beroep in."
    If n > MAX_CONTACTS Then Err.Raise FOUT_NR, , "Vul maximaal " & MAX_CONTACTS & " regels in."
    If expires < Date Then Err.Raise FOUT_NR, , "Kies een datum van vandaag of later."

    Set wsC = OpenContacten()
    start = LaatsteRij(wsC) + 1
    nu = Now
    id = NieuwId()
    items = contacten.Items

    ReDim rijen(1 To n, 1 To NCOLS)
    For i = 1 To n
        rijen(i, 1) = id
        rijen(i, 2) = naam
        rijen(i, 3) = items(i - 1)
        rijen(i, 4) = CDbl(expires)
        rijen(i, 5) = CDbl(nu)
    Next i

    ' Tekstformaat voorkomt dat een cel die met = + - @ begint als formule wordt gelezen.
    wsC.Range(wsC.Cells(start, 1), wsC.Cells(start + n - 1, 3)).NumberFormat = "@"
    wsC.Range(wsC.Cells(start, 4), wsC.Cells(start + n - 1, 4)).NumberFormat = "yyyy-mm-dd"
    wsC.Range(wsC.Cells(start, 5), wsC.Cells(start + n - 1, 5)).NumberFormat = "yyyy-mm-dd hh:mm"
    wsC.Range(wsC.Cells(start, 1), wsC.Cells(start + n - 1, NCOLS)).Value2 = rijen

    wsA.Range("C5:C7").ClearContents
    wsA.Range(CONTACT_RANGE).ClearContents
    ZetBericht wsA, "C9", n & " contact" & IIf(n = 1, "", "en") & " opgeslagen.", False
    Exit Sub

Fout:
    melding = IIf(Err.Number = FOUT_NR, Err.Description, "Opslaan is niet gelukt: " & Err.Description)
    If wsA Is Nothing Then
        MsgBox melding, vbExclamation, "Wie kent wie?"
    Else
        ZetBericht wsA, "C9", melding, True
    End If
End Sub

' ---------------------------------------------------------------------
' Knop "Zoeken" (tabblad Zoeken)
' ---------------------------------------------------------------------
Public Sub ZoekAanbod()
    Dim wsZ As Worksheet, wsC As Worksheet
    Dim zoek As String, genorm As String, melding As String
    Dim tokens() As String
    Dim res As Collection
    Dim item As Variant
    Dim i As Long

    On Error GoTo Fout
    Set wsZ = ZoekBlad(SHEET_SEARCH)
    If wsZ Is Nothing Then Err.Raise FOUT_NR, , "Het tabblad Zoeken ontbreekt. Voer eerst Setup uit (Alt+F8)."

    wsZ.Unprotect
    wsZ.Range(RESULT_RANGE).ClearContents
    wsZ.Range("C7").ClearContents
    wsZ.Protect

    zoek = Schoon(wsZ.Range("C5").Value2, 100)
    If Len(zoek) < 2 Then Err.Raise FOUT_NR, , "Typ minimaal twee tekens om te zoeken."
    genorm = Normaliseer(zoek)
    If Len(genorm) = 0 Then Err.Raise FOUT_NR, , "Typ minimaal twee letters of cijfers om te zoeken."
    tokens = Split(genorm, " ")

    Set wsC = OpenContacten()
    Set res = ZoekAanbieders(wsC, tokens)

    wsZ.Unprotect
    If res.Count = 0 Then
        melding = "Geen geldige match gevonden."
    Else
        melding = res.Count & " " & IIf(res.Count = 1, "persoon kan", "personen kunnen") & " je helpen:"
        For i = 1 To res.Count
            item = res(i)
            wsZ.Cells(RESULT_FIRST_ROW + i - 1, 2).Value2 = "Benader " & item(0)
            wsZ.Cells(RESULT_FIRST_ROW + i - 1, 3).Value2 = "Beschikbaar tot en met " & item(1)
        Next i
    End If
    wsZ.Range("C7").Value2 = melding
    wsZ.Range("C7").Font.Color = RGB(25, 50, 76)
    wsZ.Protect
    Exit Sub

Fout:
    melding = IIf(Err.Number = FOUT_NR, Err.Description, "Zoeken is niet gelukt: " & Err.Description)
    If wsZ Is Nothing Then
        MsgBox melding, vbExclamation, "Wie kent wie?"
    Else
        ZetBericht wsZ, "C7", melding, True
    End If
End Sub

' ---------------------------------------------------------------------
' Beheer: tabblad Contacten tonen (bijvoorbeeld om oude data te plakken) en weer verbergen.
' ---------------------------------------------------------------------
Public Sub ToonContacten()
    Dim ws As Worksheet
    Set ws = OpenContacten()
    ws.Visible = xlSheetVisible
    ws.Activate
End Sub

Public Sub VerbergContacten()
    Dim ws As Worksheet, wsA As Worksheet
    Set ws = OpenContacten()
    Set wsA = ZoekBlad(SHEET_OFFER)
    If Not wsA Is Nothing Then wsA.Activate
    ws.Visible = xlSheetVeryHidden
End Sub

' =====================================================================
' Zoeklogica (1-op-1 overgenomen uit findOffers, inferAliases_ en preferredName_)
' =====================================================================

Private Function ZoekAanbieders(ByVal wsC As Worksheet, ByRef tokens() As String) As Collection
    Dim res As Collection
    Dim data As Variant
    Dim laatste As Long, n As Long, i As Long, t As Long, vorige As Long
    Dim aliassen As Object, weergave As Object, nieuwste As Object, perAanbieder As Object
    Dim naam As String, aKey As String, cKey As String, sleutel As String
    Dim verloop As Double, tijd As Double
    Dim k As Variant
    Dim passend As Boolean

    Set res = New Collection
    Set ZoekAanbieders = res
    laatste = LaatsteRij(wsC)
    If laatste < 2 Then Exit Function

    data = wsC.Range(wsC.Cells(2, 1), wsC.Cells(laatste, NCOLS)).Value2
    n = UBound(data, 1)

    Set aliassen = AfleidenAliassen(data)
    Set weergave = MaakDict()
    Set nieuwste = MaakDict()
    Set perAanbieder = MaakDict()

    ' Weergavenaam per aanbieder (voorkeur voor hoofdletters + kleine letters).
    For i = 1 To n
        naam = Schoon(data(i, 2), 100)
        If Len(naam) > 0 Then
            naam = CanoniekeNaam(aliassen, naam)
            aKey = Normaliseer(naam)
            If Len(aKey) > 0 Then
                If weergave.Exists(aKey) Then
                    weergave(aKey) = VoorkeursNaam(weergave(aKey), naam)
                Else
                    weergave.Add aKey, VoorkeursNaam("", naam)
                End If
            End If
        End If
    Next i

    ' Per aanbieder en contact telt de nieuwste regel (latere inzending wint).
    For i = 1 To n
        naam = Schoon(data(i, 2), 100)
        cKey = Normaliseer(data(i, 3))
        If Len(naam) > 0 And Len(cKey) > 0 Then
            aKey = Normaliseer(CanoniekeNaam(aliassen, naam))
            If Len(aKey) > 0 Then
                sleutel = aKey & "|" & cKey
                tijd = TijdWaarde(data(i, 5))
                If nieuwste.Exists(sleutel) Then
                    vorige = nieuwste(sleutel)
                    If tijd >= TijdWaarde(data(vorige, 5)) Then nieuwste(sleutel) = i
                Else
                    nieuwste.Add sleutel, i
                End If
            End If
        End If
    Next i

    ' Filter op einddatum en zoekwoorden; per aanbieder de laatste einddatum bewaren.
    For Each k In nieuwste.Keys
        i = nieuwste(k)
        verloop = Int(DatumWaarde(data(i, 4)))
        If verloop >= 1 Then
            If verloop >= CDbl(Date) Then
                cKey = Normaliseer(data(i, 3))
                passend = True
                For t = LBound(tokens) To UBound(tokens)
                    If InStr(cKey, tokens(t)) = 0 Then
                        passend = False
                        Exit For
                    End If
                Next t
                If passend Then
                    aKey = Normaliseer(CanoniekeNaam(aliassen, Schoon(data(i, 2), 100)))
                    If Not perAanbieder.Exists(aKey) Then
                        perAanbieder.Add aKey, verloop
                    ElseIf verloop > perAanbieder(aKey) Then
                        perAanbieder(aKey) = verloop
                    End If
                End If
            End If
        End If
    Next k

    For Each k In perAanbieder.Keys
        If res.Count >= MAX_RESULTS Then Exit For
        res.Add Array(weergave(k), Format(CDate(perAanbieder(k)), "dd-mm-yyyy"))
    Next k
End Function

' Voornaam-only inzendingen koppelen aan een volledige naam, alleen als er
' minimaal 2 exact gelijke contacten zijn en er precies 1 kandidaat is.
Private Function AfleidenAliassen(ByRef data As Variant) As Object
    Dim namen As Object, contacten As Object, aliassen As Object, deel As Object
    Dim kandidaten As Collection
    Dim i As Long, overlap As Long
    Dim naam As String, sleutel As String, cKey As String
    Dim kort As Variant, vol As Variant, c As Variant

    Set namen = MaakDict()
    Set contacten = MaakDict()
    Set aliassen = MaakDict()

    For i = 1 To UBound(data, 1)
        naam = Schoon(data(i, 2), 100)
        sleutel = Normaliseer(naam)
        cKey = Normaliseer(data(i, 3))
        If Len(sleutel) > 0 And Len(cKey) > 0 Then
            If Not namen.Exists(sleutel) Then
                namen.Add sleutel, naam
                contacten.Add sleutel, MaakDict()
            Else
                namen(sleutel) = VoorkeursNaam(namen(sleutel), naam)
            End If
            Set deel = contacten(sleutel)
            deel(cKey) = True
        End If
    Next i

    For Each kort In namen.Keys
        If InStr(kort, " ") = 0 Then
            Set kandidaten = New Collection
            For Each vol In namen.Keys
                If Left(vol, Len(kort) + 1) = kort & " " Then
                    overlap = 0
                    For Each c In contacten(kort).Keys
                        If contacten(vol).Exists(c) Then overlap = overlap + 1
                    Next c
                    If overlap >= 2 Then kandidaten.Add namen(vol)
                End If
            Next vol
            If kandidaten.Count = 1 Then aliassen(kort) = kandidaten(1)
        End If
    Next kort

    Set AfleidenAliassen = aliassen
End Function

Private Function CanoniekeNaam(ByVal aliassen As Object, ByVal naam As String) As String
    Dim sleutel As String
    sleutel = Normaliseer(naam)
    If aliassen.Exists(sleutel) Then
        CanoniekeNaam = aliassen(sleutel)
    Else
        CanoniekeNaam = naam
    End If
End Function

Private Function VoorkeursNaam(ByVal huidig As String, ByVal kandidaat As String) As String
    If Len(huidig) = 0 Then
        VoorkeursNaam = kandidaat
    ElseIf NaamScore(kandidaat) > NaamScore(huidig) Then
        VoorkeursNaam = kandidaat
    Else
        VoorkeursNaam = huidig
    End If
End Function

Private Function NaamScore(ByVal s As String) As Long
    Dim i As Long, code As Long
    Dim hoofd As Boolean, klein As Boolean
    For i = 1 To Len(s)
        code = AscW(Mid$(s, i, 1))
        If code < 0 Then code = code + 65536
        If (code >= 65 And code <= 90) Or (code >= 192 And code <= 222) Then hoofd = True
        If (code >= 97 And code <= 122) Or (code >= 224 And code <= 255) Then klein = True
    Next i
    If hoofd And klein Then
        NaamScore = 2
    ElseIf klein Then
        NaamScore = 1
    Else
        NaamScore = 0
    End If
End Function

' =====================================================================
' Hulpfuncties
' =====================================================================

' Kleine letters, accenten weg, alles behalve letters en cijfers wordt een
' enkele spatie. Tekens die niet in de tabel staan maar wel een letter zijn
' (bijv. een Chinese, Cyrillische of Koreaanse naam) blijven bewaard, zodat
' contacten niet stil verdwijnen; leestekens en symbolen vallen weg.
Private Function Normaliseer(ByVal waarde As Variant) As String
    Static bron As String
    Static doel As String
    Dim codes As Variant
    Dim s As String, ch As String, vervolg As String, uit As String
    Dim i As Long, k As Long, pos As Long
    Dim spatie As Boolean

    If Len(bron) = 0 Then
        codes = Array(224, 225, 226, 227, 228, 229, 231, 232, 233, 234, 235, 236, 237, 238, _
                      239, 241, 242, 243, 244, 245, 246, 249, 250, 251, 252, 253, 255)
        For k = 0 To UBound(codes)
            bron = bron & ChrW(codes(k))
        Next k
        doel = "aaaaaaceeeeiiiinooooouuuuyy"
    End If

    s = LCase$(TekstVan(waarde))
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        vervolg = ""
        If ch Like "[a-z0-9]" Then
            vervolg = ch
        Else
            pos = InStr(bron, ch)
            If pos > 0 Then
                vervolg = Mid$(doel, pos, 1)
            Else
                vervolg = ExtraVouw(ch)
                If Len(vervolg) = 0 Then
                    If IsBewaarTekst(ch) Then vervolg = ch
                End If
            End If
        End If
        If Len(vervolg) > 0 Then
            If spatie And Len(uit) > 0 Then uit = uit & " "
            uit = uit & vervolg
            spatie = False
        Else
            spatie = True
        End If
    Next i
    Normaliseer = uit
End Function

' Vouwt tekens die niet in de accenttabel hierboven staan alsnog naar
' gewone letters, zodat je een naam met zo'n extra tekens ook zonder die tekens kunt zoeken.
Private Function ExtraVouw(ByVal ch As String) As String
    Select Case AscW(ch)
        Case 223: ExtraVouw = "ss"     ' scharlach S
        Case 230: ExtraVouw = "ae"     ' ae-ligatuur
        Case 339: ExtraVouw = "oe"     ' oe-ligatuur
        Case 240: ExtraVouw = "d"      ' eth
        Case 254: ExtraVouw = "th"     ' thorn
        Case 248: ExtraVouw = "o"      ' o met streep
        Case 322: ExtraVouw = "l"      ' l met streep
        Case 271: ExtraVouw = "d"      ' d met haakje
        Case 273: ExtraVouw = "d"      ' d met streep
        Case 295: ExtraVouw = "h"      ' h met streep
        Case 305: ExtraVouw = "i"      ' puntloze i
        Case 269: ExtraVouw = "c"      ' c met haakje
        Case 324: ExtraVouw = "n"      ' n met acute
        Case 347: ExtraVouw = "s"      ' s met acute
        Case 357: ExtraVouw = "s"      ' s met haakje
        Case 359: ExtraVouw = "t"      ' t met streep
        Case 380: ExtraVouw = "s"      ' z met punt
        Case 382: ExtraVouw = "z"      ' z met haakje
        Case 384: ExtraVouw = "z"      ' z met streep
        Case 402: ExtraVouw = "f"      ' f met haakje
        Case Else: ExtraVouw = ""
    End Select
End Function

' Bepaalt of een onbekend teken een bewaard briefje is (een letter uit een
' ander schrift) of een leesteken/symbool. Symbolen worden scheidingsteken,
' letters blijven staan zodat de naam niet stil verdwijnt.
Private Function IsBewaarTekst(ByVal ch As String) As Boolean
    Dim code As Long
    code = AscW(ch)
    If code < 0 Then code = code + 65536
    Select Case code
        Case Is <= 255          ' Latijnse-1: alleen de accenttabel telt als letter
        Case 768 To 879         ' combinerende diacrieten
        Case 8192 To 11263      ' leestekens, valuta, pijlen, wiskunde, kaders
        Case 11904 To 12351     ' CJK-radicalen en -leestekens
        Case 55296 To 57343     ' surrogaten
        Case 57344 To 63743     ' eigen tekens (private use)
        Case 65024 To 65039     ' variatietekens
        Case 65532 To 65535     ' speciale tekens
        Case 127488 To 131071   ' emoji en aanverwante symbolen
        Case Else
            IsBewaarTekst = True
    End Select
End Function

' Stuurtekens weg, tab/enter wordt spatie, trimmen en afkappen op maxLen.
Private Function Schoon(ByVal waarde As Variant, ByVal maxLen As Long) As String
    Dim s As String, uit As String
    Dim i As Long, code As Long

    s = TekstVan(waarde)
    For i = 1 To Len(s)
        code = AscW(Mid$(s, i, 1))
        Select Case code
            Case 0 To 8, 11, 12, 14 To 31
                ' weglaten
            Case 9, 10, 13
                uit = uit & " "
            Case Else
                uit = uit & Mid$(s, i, 1)
        End Select
    Next i
    Schoon = Left$(Trim$(uit), maxLen)
End Function

Private Function TekstVan(ByVal waarde As Variant) As String
    If IsError(waarde) Then
        TekstVan = ""
    ElseIf IsNull(waarde) Then
        TekstVan = ""
    Else
        TekstVan = CStr(waarde)
    End If
End Function

Private Function TijdWaarde(ByVal waarde As Variant) As Double
    TijdWaarde = DatumWaarde(waarde)
End Function

' Geeft het serienummer van een datum(-tijd), ook als die als tekst is geplakt. 0 = ongeldig.
Private Function DatumWaarde(ByVal waarde As Variant) As Double
    If IsError(waarde) Then
        DatumWaarde = 0
    ElseIf VarType(waarde) = vbString Then
        DatumWaarde = TekstDatum(Trim$(waarde))
    ElseIf IsNumeric(waarde) Then
        DatumWaarde = CDbl(waarde)
    End If
End Function

Private Function TekstDatum(ByVal s As String) As Double
    If Len(s) = 0 Then Exit Function
    If IsDate(s) Then
        TekstDatum = CDbl(CDate(s))
    Else
        TekstDatum = IsoDatum(s)
    End If
End Function

' ISO-vorm 2029-06-29 (eventueel met tijd), los van de landinstelling van
' Windows: IsDate herkent die vorm niet in elke regio.
Private Function IsoDatum(ByVal s As String) As Double
    Dim j As Long, m As Long, d As Long, uren As Long, minuten As Long
    Dim tijd As String
    On Error GoTo Mislukt
    If Len(s) >= 10 Then
        If Mid$(s, 5, 1) = "-" And Mid$(s, 8, 1) = "-" And _
           IsNumeric(Left$(s, 4)) And IsNumeric(Mid$(s, 6, 2)) And IsNumeric(Mid$(s, 9, 2)) Then
            j = CLng(Left$(s, 4))
            m = CLng(Mid$(s, 6, 2))
            d = CLng(Mid$(s, 9, 2))
            If m >= 1 And m <= 12 And d >= 1 And d <= 31 Then
                IsoDatum = CDbl(DateSerial(j, m, d))
                tijd = Trim$(Mid$(s, 11))
                If Len(tijd) >= 5 And Mid$(tijd, 3, 1) = ":" And _
                   IsNumeric(Left$(tijd, 2)) And IsNumeric(Mid$(tijd, 4, 2)) Then
                    uren = CLng(Left$(tijd, 2))
                    minuten = CLng(Mid$(tijd, 4, 2))
                    If uren <= 23 And minuten <= 59 Then
                        IsoDatum = IsoDatum + (uren * 3600# + minuten * 60#) / 86400#
                    End If
                End If
            End If
        End If
    End If
    Exit Function
Mislukt:
    IsoDatum = 0
End Function

Private Function GeldigeDatum(ByVal v As Variant) As Date
    Dim d As Double
    d = DatumWaarde(v)
    If d < 1 Or d > 2958465 Then Err.Raise FOUT_NR, , "Kies een geldige einddatum."
    GeldigeDatum = CDate(Int(d))
End Function

Private Function NieuwId() As String
    Static geseed As Boolean
    Dim s As String, i As Long
    If Not geseed Then
        Randomize
        geseed = True
    End If
    For i = 1 To 32
        s = s & Hex(Int(Rnd * 16))
    Next i
    NieuwId = LCase$(Left$(s, 8) & "-" & Mid$(s, 9, 4) & "-" & Mid$(s, 13, 4) & "-" & Mid$(s, 17, 4) & "-" & Mid$(s, 21, 12))
End Function

Private Function MaakDict() As Object
    Set MaakDict = CreateObject("Scripting.Dictionary")
End Function

Private Function LaatsteRij(ByVal ws As Worksheet) As Long
    LaatsteRij = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
End Function

Private Function ZoekBlad(ByVal naam As String) As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If StrComp(ws.Name, naam, vbTextCompare) = 0 Then
            Set ZoekBlad = ws
            Exit Function
        End If
    Next ws
End Function

Private Function OpenContacten() As Worksheet
    Set OpenContacten = ZoekBlad(TAB_NAME)
    If OpenContacten Is Nothing Then
        Err.Raise FOUT_NR, , "Het tabblad Contacten ontbreekt. Laat de beheerder Setup uitvoeren."
    End If
End Function

Private Function HaalOfMaakBlad(ByVal naam As String, ByVal voor As Worksheet) As Worksheet
    Dim ws As Worksheet
    Set ws = ZoekBlad(naam)
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(Before:=voor)
        ws.Name = naam
    End If
    Set HaalOfMaakBlad = ws
End Function

Private Sub VerwijderLegeStandaardbladen()
    Dim ws As Worksheet, i As Long
    Application.DisplayAlerts = False
    For i = ThisWorkbook.Worksheets.Count To 1 Step -1
        Set ws = ThisWorkbook.Worksheets(i)
        Select Case ws.Name
            Case SHEET_OFFER, SHEET_SEARCH, TAB_NAME
                ' behouden
            Case Else
                If Application.WorksheetFunction.CountA(ws.Cells) = 0 And ws.Shapes.Count = 0 Then ws.Delete
        End Select
    Next i
    Application.DisplayAlerts = True
End Sub

' Bericht onder de knop tonen (bladen zijn beveiligd zonder wachtwoord).
Private Sub ZetBericht(ByVal ws As Worksheet, ByVal adres As String, ByVal tekst As String, ByVal isFout As Boolean)
    ws.Unprotect
    ws.Range(adres).Value2 = tekst
    If isFout Then
        ws.Range(adres).Font.Color = RGB(163, 45, 45)
    Else
        ws.Range(adres).Font.Color = RGB(25, 50, 76)
    End If
    ws.Protect
End Sub

' =====================================================================
' Opbouw van de formulierbladen
' =====================================================================

Private Sub BouwAanbodBlad(ByVal ws As Worksheet)
    ws.Unprotect
    ws.Cells.Clear
    VerwijderKnop ws, "btnOpslaan"
    BasisOpmaak ws, "Wie kent wie? - Ik kan helpen", "Bied een introductie aan. Je aanbod verschijnt alleen tot en met de opgegeven datum."
    ws.Cells.Locked = True

    ws.Range("B5").Value2 = "Voornaam"
    ws.Range("B6").Value2 = "Achternaam"
    ws.Range("B7").Value2 = "Beschikbaar tot en met (dd-mm-jjjj)"
    ws.Range("B10").Value2 = "Ik ken deze mensen"
    ws.Range("B5:B7,B10").Font.Bold = True
    ws.Range("C10").Value2 = "1 persoon of beroep per cel. Zet ook het beroep erbij als daarop gezocht mag worden."
    ws.Range("C10").Font.Italic = True
    ws.Range("C10").Font.Size = 9
    ws.Range("C10").Font.Color = RGB(83, 103, 121)

    MaakInvoer ws.Range("C5:C7")
    MaakInvoer ws.Range(CONTACT_RANGE)
    ws.Range("C7").NumberFormat = "dd-mm-yyyy"
    ' Extra invoercontrole; OpslaanAanbod controleert de datum sowieso ook.
    ' Als Excel de formule niet accepteert (taalinstelling), gaat Setup gewoon door.
    On Error Resume Next
    With ws.Range("C7").Validation
        .Delete
        .Add Type:=xlValidateDate, AlertStyle:=xlValidAlertStop, _
             Operator:=xlGreaterEqual, Formula1:="=TODAY()"
        .ErrorTitle = "Ongeldige datum"
        .ErrorMessage = "Kies een datum van vandaag of later."
    End With
    On Error GoTo 0

    ws.Rows("5:7").RowHeight = 22
    ws.Rows(8).RowHeight = 34
    ws.Rows(9).RowHeight = 36
    ws.Rows("11:60").RowHeight = 20
    With ws.Range("C9")
        .WrapText = True
        .VerticalAlignment = xlTop
    End With

    MaakKnop ws, "btnOpslaan", "Aanbod opslaan", ws.Range("C8"), "OpslaanAanbod"
    VriesRijen ws, 11
    ws.Range("C5").Select
    ws.Protect
End Sub

Private Sub BouwZoekBlad(ByVal ws As Worksheet)
    ws.Unprotect
    ws.Cells.Clear
    VerwijderKnop ws, "btnZoeken"
    BasisOpmaak ws, "Wie kent wie? - Ik zoek iemand", "Typ een persoon of beroep en klik op Zoeken. Je ziet wie je kan helpen."
    ws.Cells.Locked = True

    ws.Range("B5").Value2 = "Persoon of beroep"
    ws.Range("B5").Font.Bold = True
    MaakInvoer ws.Range("C5")

    ws.Rows(5).RowHeight = 22
    ws.Rows(6).RowHeight = 34
    ws.Rows(7).RowHeight = 24
    With ws.Range("C7")
        .WrapText = True
        .VerticalAlignment = xlTop
    End With
    With ws.Range("B9:B60")
        .Font.Bold = True
        .Font.Size = 12
    End With
    ws.Range("C9:C60").Font.Color = RGB(83, 103, 121)

    MaakKnop ws, "btnZoeken", "Zoeken", ws.Range("C6"), "ZoekAanbod"
    VriesRijen ws, 9
    ws.Range("C5").Select
    ws.Protect
End Sub

Private Sub BasisOpmaak(ByVal ws As Worksheet, ByVal titel As String, ByVal uitleg As String)
    ws.Activate
    ActiveWindow.DisplayGridlines = False
    With ws.Cells
        .Font.Name = "Arial"
        .Font.Size = 11
        .Font.Color = RGB(25, 50, 76)
        .Interior.Color = RGB(245, 248, 251)
        .VerticalAlignment = xlCenter
    End With
    ws.Columns("A").ColumnWidth = 3
    ws.Columns("B").ColumnWidth = 38
    ws.Columns("C").ColumnWidth = 52
    With ws.Range("B2")
        .Value2 = titel
        .Font.Size = 22
        .Font.Bold = True
    End With
    ws.Rows(2).RowHeight = 34
    ws.Range("B3").Value2 = uitleg
    ws.Range("B3").Font.Color = RGB(83, 103, 121)
End Sub

' Bevriest alle rijen boven eersteScrollRij (moet het actieve blad zijn).
Private Sub VriesRijen(ByVal ws As Worksheet, ByVal eersteScrollRij As Long)
    ws.Activate
    ActiveWindow.FreezePanes = False
    ActiveWindow.ScrollRow = 1
    ws.Cells(eersteScrollRij, 1).Select
    ActiveWindow.FreezePanes = True
End Sub

Private Sub MaakInvoer(ByVal rng As Range)
    With rng
        .Interior.Color = RGB(255, 255, 255)
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(170, 188, 202)
        .HorizontalAlignment = xlLeft
        .Locked = False
    End With
End Sub

Private Sub VerwijderKnop(ByVal ws As Worksheet, ByVal naam As String)
    On Error Resume Next
    ws.Shapes(naam).Delete
    On Error GoTo 0
End Sub

Private Sub MaakKnop(ByVal ws As Worksheet, ByVal naam As String, ByVal tekst As String, _
                     ByVal doel As Range, ByVal macro As String)
    Dim shp As Shape
    VerwijderKnop ws, naam
    Set shp = ws.Shapes.AddShape(SHAPE_ROUNDED_RECT, doel.Left, doel.Top + 3, 190, doel.Height - 6)
    With shp
        .Name = naam
        .Fill.ForeColor.RGB = RGB(20, 92, 168)
        .Line.Visible = msoFalse
        .Shadow.Visible = msoFalse
        .OnAction = macro
        .TextFrame2.VerticalAnchor = msoAnchorMiddle
        With .TextFrame2.TextRange
            .Text = tekst
            .Font.Size = 12
            .Font.Bold = msoTrue
            .Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        End With
    End With
End Sub
