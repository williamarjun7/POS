# Run deduplication migration
# Reads SQL from file and passes it to insforge db query

$sqlFile = "C:\Users\pawan\OneDrive\Desktop\POS\migrations\20260727000100_deduplicate-invoices.sql"
$sql = Get-Content $sqlFile -Raw

Write-Host "Migration SQL length: $($sql.Length) characters"

# Write SQL to a temp file that can be read by the CLI
$tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
Set-Content -Path $tempFile -Value $sql

Write-Host "Temp file created: $tempFile"

# Try different approaches:
# Approach 1: Read file and pass as argument using PowerShell string building
Write-Host "`n=== Running migration ==="

# Use cmd.exe /c with input redirection - doesn't work for positional args

# Approach 2: Use insforge CLI with the SQL from a variable
# Build the command with proper escaping
$escapedSql = $sql -replace '"', '\"'
$command = "npx insforge db query `"$escapedSql`""
Write-Host "Executing via cmd.exe..."
cmd.exe /c "cd /d C:\Users\pawan\OneDrive\Desktop\POS && $command" 2>&1

Write-Host "`nExit code: $LASTEXITCODE"
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
