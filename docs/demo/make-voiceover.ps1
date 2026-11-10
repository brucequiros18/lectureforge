# Generates the placeholder voiceover for the demo video, timed to the
# on-screen captions. Male voice (Microsoft David). Each line is synthesized
# to its own WAV and the line text + caption start time is written to
# tts/lines.json so the video step can build matching subtitles.
# Keep this file ASCII-only - PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$demo = "C:\Users\User\projects\lectureforge\docs\demo"
$ttsDir = Join-Path $demo "tts"
if (Test-Path $ttsDir) { Remove-Item $ttsDir -Recurse -Force }
New-Item -ItemType Directory -Path $ttsDir | Out-Null

# start = on-screen caption start time (seconds); line enters a moment later
$lines = @(
  @{ start = 2.3;  text = "This is LectureForge, my Multimedia project. It makes lecture recordings shorter." },
  @{ start = 7.3;  text = "I drop in a sample lecture. Nothing gets uploaded." },
  @{ start = 11.3; text = "The app finds the silent parts by itself. Six gaps in this file." },
  @{ start = 17.3; text = "Every gap is listed. I can keep one with a single click." },
  @{ start = 23.3; text = "Now I speed it up to one and a half times. Pitch stays natural." },
  @{ start = 28.3; text = "Then I export. It cuts, stretches, and encodes an MP3, all inside the browser." },
  @{ start = 45.3; text = "Done. A smaller MP3, saved straight to my computer." },
  @{ start = 50.3; text = "Offline, private, and free. Thanks for watching." }
)

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
if ($voices -contains 'Microsoft David Desktop') {
  $synth.SelectVoice('Microsoft David Desktop')
  Write-Output 'voice: Microsoft David Desktop (male)'
} elseif ($voices -contains 'Microsoft David') {
  $synth.SelectVoice('Microsoft David')
} else {
  Write-Output "voice: default ($($synth.Voice.VoiceInfo.Name))"
}
$synth.Rate = 1
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  24000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)

for ($i = 0; $i -lt $lines.Count; $i++) {
  $path = Join-Path $ttsDir ("line-{0}.wav" -f ($i + 1))
  $synth.SetOutputToWaveFile($path, $fmt)
  $synth.Speak($lines[$i].text)
  $synth.SetOutputToNull()
}
$synth.Dispose()

$lines | ConvertTo-Json | Set-Content -Path (Join-Path $ttsDir 'lines.json') -Encoding UTF8
Write-Output ("synthesized {0} lines to {1}" -f $lines.Count, $ttsDir)
