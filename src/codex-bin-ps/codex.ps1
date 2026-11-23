# Keep PowerShell arguments away from cmd.exe, including on Windows PowerShell 5.1.
function ConvertTo-WmuxCodexArg([string]$Value) {
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
}
$wmuxCodexPreviousArgs = $env:WMUX_CODEX_ARGLINE
# A script's pipeline input lands in $input, not in a native child's stdin (T-1181):
# `'prompt' | codex exec -` reached codex with an empty stdin. Re-pipe it when present.
$wmuxCodexPiped = $MyInvocation.ExpectingInput
# Windows PowerShell 5.1 encodes text piped to a native process with an ASCII
# $OutputEncoding, so a piped 'cafe' with an accent reached codex as 'caf?'.
# Use BOM-less UTF-8 for the call, and restore the session's value afterwards.
# It must be the global variable: a script-scope copy is not what the pipe reads.
$wmuxCodexPreviousEncoding = $global:OutputEncoding
if ($wmuxCodexPiped) { $global:OutputEncoding = New-Object System.Text.UTF8Encoding $false }
try {
    $argPassing = Get-Variable -Name PSNativeCommandArgumentPassing -ValueOnly -ErrorAction Ignore
    if ($argPassing -and "$argPassing" -ne 'Legacy') {
        if ($wmuxCodexPiped) { $input | & $env:WMUX_CODEX_RUNTIME $env:WMUX_CODEX_LAUNCHER @args }
        else { & $env:WMUX_CODEX_RUNTIME $env:WMUX_CODEX_LAUNCHER @args }
    } else {
        $env:WMUX_CODEX_ARGLINE = (@($env:WMUX_CODEX_LAUNCHER) + @($args) | ForEach-Object { ConvertTo-WmuxCodexArg ([string]$_) }) -join ' '
        # `--%` swallows the rest of its line, so each call ends its own line.
        if ($wmuxCodexPiped) {
            $input | & $env:WMUX_CODEX_RUNTIME --% %WMUX_CODEX_ARGLINE%
        } else {
            & $env:WMUX_CODEX_RUNTIME --% %WMUX_CODEX_ARGLINE%
        }
    }
    $wmuxCodexExit = $LASTEXITCODE
} finally {
    $env:WMUX_CODEX_ARGLINE = $wmuxCodexPreviousArgs
    $global:OutputEncoding = $wmuxCodexPreviousEncoding
}
exit $wmuxCodexExit
