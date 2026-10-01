$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$narrationDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/assets/narration'))
$narrationJobs = Get-Content -LiteralPath (Join-Path $narrationDirectory 'jobs.json') -Raw -Encoding utf8 | ConvertFrom-Json
$narrationSpeaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $narrationSpeaker.SelectVoice('Microsoft Huihui Desktop')
    $narrationSpeaker.Rate = -1
    $narrationFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($narrationJob in $narrationJobs) {
        $narrationPath = Join-Path $narrationDirectory $narrationJob.file
        $narrationSpeaker.SetOutputToWaveFile($narrationPath, $narrationFormat)
        $narrationSpeaker.Speak($narrationJob.text)
        $narrationSpeaker.SetOutputToNull()
        Write-Output $narrationJob.file
    }
} finally { $narrationSpeaker.Dispose() }
