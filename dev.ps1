# Sobe server (:4000) e client (:5173) em duas janelas do PowerShell.
# Uso:  cd "C:\Users\marlo\OneDrive\Imagens\ide agente\swarm-ide" ;  .\dev.ps1
$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\server'; npm run dev`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\client'; npm run dev`""

Write-Output "Swarm IDE subindo: server em http://localhost:4000 | client em http://localhost:5173"
