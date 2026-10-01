$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$countdownDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/assets/countdown'))
New-Item -ItemType Directory -Path $countdownDirectory -Force | Out-Null
$countdownSpeaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $countdownSpeaker.SelectVoice('Microsoft Kangkang')
    $countdownSpeaker.Rate = 2
    $countdownFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $countdownWords = @('零','一','二','三','四','五','六','七','八','九','十')
    $countdownCues = @{}
    foreach ($countdownNumber in 1..10) { $countdownCues['count-' + $countdownNumber] = $countdownWords[$countdownNumber] }
    $countdownCues['ignition'] = '点火！'
    $countdownCues['liftoff'] = '起飞！'
    foreach ($countdownCue in $countdownCues.GetEnumerator()) {
        $countdownSpeaker.SetOutputToWaveFile((Join-Path $countdownDirectory ($countdownCue.Key + '.wav')), $countdownFormat)
        $countdownSpeaker.Speak($countdownCue.Value)
        $countdownSpeaker.SetOutputToNull()
        Write-Output $countdownCue.Key
    }
} finally { $countdownSpeaker.Dispose() }
