<#
TuniShop - Plateforme vue 360
scripts/mettre_a_jour.ps1 : met à jour les données des deux versions après une exécution de la chaîne.

  1. Export Parquet de la version Streamlit (exporter_demo.py, lit SQL Server)
  2. Tests de la version Streamlit (70 tests, mode démo compris)
  3. Export JSON de la version HTML (exporter_web.py, lit le Parquet de l'étape 1)
  4. Test de fumée du site, servi en local
  5. Envoi sur GitHub des seules données (demo_data/ et site/data/) : la démo Streamlit redémarre,
     le site HTML se republie ; tes autres modifications en cours ne sont pas envoyées

Le script s'arrête à la première erreur : rien n'est envoyé si un export ou un test échoue.

À lancer depuis le dossier de la version HTML, dans PowerShell :
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\scripts\mettre_a_jour.ps1                     # tout, envoi compris
    .\scripts\mettre_a_jour.ps1 -SansEnvoi          # tout, sauf l'envoi sur GitHub
    .\scripts\mettre_a_jour.ps1 -Streamlit "C:\...\5-Platforme Streamlit\Platforme"

Par défaut, la version Streamlit est cherchée dans ..\..\5-Platforme Streamlit\Platforme.
Le Python utilisé est celui du .venv de la version Streamlit (il a pandas, DuckDB et pytest).

Auteure : Sarra Abdeljaouad
#>
param(
    [string]$Streamlit = "",
    [switch]$SansEnvoi
)

# Les programmes externes (git, python) écrivent leur progression sur la sortie d'erreur :
# on ne s'arrête pas sur ces messages, mais sur leur code de retour.
$ErrorActionPreference = "Continue"
$debut = Get-Date
$Web = Split-Path -Parent $PSScriptRoot
if (-not $Streamlit) {
    $Streamlit = Join-Path (Split-Path -Parent (Split-Path -Parent $Web)) "5-Platforme Streamlit\Platforme"
}
$Py = Join-Path $Streamlit ".venv\Scripts\python.exe"
$env:PYTHONUTF8 = "1"

function Etape([string]$numero, [string]$texte) {
    Write-Host ""
    Write-Host "[$numero] $texte" -ForegroundColor Cyan
}

function Arreter([string]$message) {
    Write-Host ""
    Write-Host "ARRÊT : $message" -ForegroundColor Red
    Write-Host "Rien n'a été envoyé sur GitHub." -ForegroundColor Red
    exit 1
}

function Verifier([int]$code, [string]$quoi) {
    if ($code -ne 0) { Arreter "$quoi a échoué (code $code)." }
}

# --- Contrôles préalables ----------------------------------------------------------------------
Etape "0/5" "Contrôles"
if (-not (Test-Path (Join-Path $Web "scripts\exporter_web.py"))) { Arreter "lance le script depuis le dossier de la version HTML." }
if (-not (Test-Path (Join-Path $Streamlit "scripts\exporter_demo.py"))) {
    Arreter "version Streamlit introuvable dans « $Streamlit ». Indique-la avec -Streamlit `"chemin`"."
}
if (-not (Test-Path $Py)) { Arreter "pas de .venv dans « $Streamlit » (attendu : $Py)." }
Write-Host "  Version HTML      : $Web"
Write-Host "  Version Streamlit : $Streamlit"
Write-Host "  Python            : $Py"

& $Py -c "import playwright" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Playwright absent du .venv : installation (le test utilisera le Chrome du poste)."
    & $Py -m pip install --quiet playwright
    Verifier $LASTEXITCODE "L'installation de Playwright"
}

# --- 1. Export Parquet (version Streamlit) ----------------------------------------------------
Etape "1/5" "Export Parquet de la version Streamlit (lit SQL Server)"
Push-Location $Streamlit
& $Py scripts\exporter_demo.py
$code = $LASTEXITCODE
Pop-Location
Verifier $code "L'export Parquet"

# --- 2. Tests de la version Streamlit ---------------------------------------------------------
Etape "2/5" "Tests de la version Streamlit"
Push-Location $Streamlit
& $Py -m pytest -q --ignore=tests/test_fumee.py
$code = $LASTEXITCODE
Pop-Location
Verifier $code "Les tests de la version Streamlit"

# --- 3. Export JSON (version HTML) ------------------------------------------------------------
Etape "3/5" "Export JSON de la version HTML"
Push-Location $Web
& $Py scripts\exporter_web.py --source (Join-Path $Streamlit "demo_data")
$code = $LASTEXITCODE
Pop-Location
Verifier $code "L'export JSON"

# --- 4. Test de fumée du site, en local -------------------------------------------------------
Etape "4/5" "Test de fumée du site (local)"
$port = 8611
$options = @{ FilePath = $Py; ArgumentList = @("scripts\serveur_local.py", "$port"); WorkingDirectory = $Web; PassThru = $true }
if ($PSVersionTable.PSEdition -eq "Desktop" -or $IsWindows) { $options.WindowStyle = "Hidden" }
$serveur = Start-Process @options
if (-not $serveur) { Arreter "le serveur local n'a pas démarré." }
$pret = $false
for ($i = 0; $i -lt 20 -and -not $pret; $i++) {          # jusqu'à 10 s pour que le serveur réponde
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$port/index.html" | Out-Null; $pret = $true } catch { }
}
if (-not $pret) { Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue; Arreter "le serveur local ne répond pas sur le port $port." }
Push-Location $Web
& $Py tests\test_fumee_web.py "http://localhost:$port/"
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
Verifier $code "Le test de fumée du site"

# --- 5. Envoi sur GitHub ----------------------------------------------------------------------
$jour = Get-Date -Format "dd/MM/yyyy"
if ($SansEnvoi) {
    Etape "5/5" "Envoi sur GitHub : ignoré (-SansEnvoi)"
} else {
    Etape "5/5" "Envoi sur GitHub"
    foreach ($depot in @(
            @{ Dossier = $Streamlit; Donnees = "demo_data"; Nom = "version Streamlit"; Message = "Données de démonstration : export du $jour" },
            @{ Dossier = $Web; Donnees = "site/data"; Nom = "version HTML"; Message = "Données du site : export du $jour" })) {
        Push-Location $depot.Dossier
        git add -A -- $depot.Donnees          # seulement les données : le reste du dossier n'est pas touché
        git diff --cached --quiet -- $depot.Donnees
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  $($depot.Nom) : aucune donnée changée, rien à envoyer."
        } else {
            git commit -q -m $depot.Message -- $depot.Donnees
            $code = $LASTEXITCODE
            if ($code -eq 0) { git push -q; $code = $LASTEXITCODE }
            Pop-Location
            Verifier $code "L'envoi de la $($depot.Nom)"
            Push-Location $depot.Dossier
            Write-Host "  $($depot.Nom) : envoyée." -ForegroundColor Green
        }
        Pop-Location
    }
}

$duree = [math]::Round(((Get-Date) - $debut).TotalMinutes, 1)
Write-Host ""
Write-Host "Mise à jour terminée en $duree min." -ForegroundColor Green
if (-not $SansEnvoi) {
    Write-Host "Le site se republie en 1 à 2 minutes ; la démo Streamlit redémarre toute seule."
}
