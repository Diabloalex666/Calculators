# Publishes one queued article on weekday mornings. Called by Windows Task Scheduler at 10:30 local time (Moscow).
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Log = "F:\AI\finpulse-drip.log"

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"), $Message
  Add-Content -Path $Log -Value $line -Encoding utf8
  Write-Output $line
}

Set-Location $Root
$dow = (Get-Date).DayOfWeek
if ($dow -eq "Saturday" -or $dow -eq "Sunday") {
  Write-Log "skip weekend $dow"
  exit 0
}

$env:GIT_TERMINAL_PROMPT = "0"
$env:FACTORY_DRIP = "1"
$env:FACTORY_WRITE = "1"
Remove-Item Env:CI -ErrorAction SilentlyContinue

Write-Log "start $Root"
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=25 fetch origin main
if ($LASTEXITCODE -ne 0) { Write-Log "fetch failed"; exit 1 }
git reset --hard origin/main
if ($LASTEXITCODE -ne 0) { Write-Log "reset failed"; exit 1 }

python scripts/factory.py --offline
$factoryCode = $LASTEXITCODE
Write-Log "factory exit $factoryCode"

git add -- seo-agent articles sitemap.xml
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Log "nothing to publish"
  exit 0
}

git -c user.name="finpulse-drip" -c user.email="finpulse-drip@users.noreply.github.com" commit -m "seo-factory: weekday article [skip ci]"
if ($LASTEXITCODE -ne 0) { Write-Log "commit failed"; exit 1 }
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=25 push origin HEAD:main
if ($LASTEXITCODE -ne 0) { Write-Log "push failed"; exit 1 }
Write-Log "pushed"
exit 0
