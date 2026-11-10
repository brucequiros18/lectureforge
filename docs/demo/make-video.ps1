# Builds the submission demo MP4 from the recorded WebM:
#   - WebM (VP9) -> H.264 MP4 with faststart
#   - adds the voiceover (your real recording if docs/demo/voiceover.wav
#     exists, otherwise the TTS placeholder composed from docs/demo/tts/)
#   - burns spoken subtitles at the bottom (from the narration lines) and
#     normalizes loudness
# Keep this file ASCII-only - PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Continue'

$root   = 'C:\Users\User\projects\lectureforge'
$ff     = Join-Path $root 'node_modules\ffmpeg-static\ffmpeg.exe'
$demo   = Join-Path $root 'docs\demo'
$webm   = Join-Path $demo 'lectureforge-demo.webm'
$real   = Join-Path $demo 'voiceover.wav'
$voice  = Join-Path $demo 'voiceover-tts.wav'
$srtOut = Join-Path $demo 'captions-narration.srt'
$outDir = Join-Path $root 'submission'
$out    = Join-Path $outDir 'Quiros_LectureForge_Demo.mp4'
New-Item -ItemType Directory -Force $outDir | Out-Null

function Get-DurSeconds($file) {
  $tmp = [System.IO.Path]::GetTempFileName()
  & $ff -hide_banner -i $file 2>$tmp | Out-Null
  $txt = Get-Content $tmp -Raw
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($txt -match 'Duration: (\d+):(\d+):(\d+\.\d+)') {
    return ([double]$Matches[1] * 3600) + ([double]$Matches[2] * 60) + [double]$Matches[3]
  }
  return 0.0
}
function Fmt-Time($sec) {
  $t = [Math]::Floor($sec)
  $ms = [int][Math]::Round(($sec - $t) * 1000)
  if ($ms -gt 999) { $ms = 999 }
  $h = [int][Math]::Floor($t / 3600)
  $m = [int][Math]::Floor(($t % 3600) / 60)
  $s = [int]($t % 60)
  return ('{0:00}:{1:00}:{2:00},{3:000}' -f $h, $m, $s, $ms)
}

$videoDur = Get-DurSeconds $webm
$lines = Get-Content (Join-Path $demo 'tts\lines.json') -Raw | ConvertFrom-Json

if (-not (Test-Path $real)) {
  Write-Output 'no voiceover.wav found - composing TTS placeholder (male)'
  $inputs = @('-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono:d=56')
  $filters = @()
  $prevEnd = 0.0
  $times = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $f = Join-Path $demo ("tts\line-{0}.wav" -f ($i + 1))
    $d = Get-DurSeconds $f
    $start = [Math]::Max([double]$lines[$i].start, $prevEnd + 0.15)
    $ms = [int][Math]::Round($start * 1000)
    $inputs += @('-i', $f)
    $filters += ("[{0}]adelay={1}[a{0}]" -f ($i + 1), $ms)
    $times += [pscustomobject]@{ start = $start; dur = $d; text = $lines[$i].text }
    $prevEnd = $start + $d
  }
  $mix = (1..($lines.Count) | ForEach-Object { "[a$_]" }) -join ''
  $fc = ($filters -join ';') + ';[0]' + $mix + ("amix=inputs={0}:normalize=0:duration=first[out]" -f ($lines.Count + 1))
  $log = [System.IO.Path]::GetTempFileName()
  & $ff @inputs -filter_complex $fc -map '[out]' -c:a pcm_s16le $voice 2>$log
  $code = $LASTEXITCODE
  if ($code -ne 0) { Get-Content $log -Tail 15; throw "voiceover compose failed ($code)" }
  Remove-Item $log -Force -ErrorAction SilentlyContinue
  Write-Output ('placeholder voiceover written: {0:N1}s' -f (Get-DurSeconds $voice))

  # build the spoken-subtitle SRT from the computed timing
  $srt = ''
  for ($i = 0; $i -lt $times.Count; $i++) {
    $start = $times[$i].start
    $nextStart = if ($i + 1 -lt $times.Count) { $times[$i + 1].start } else { $videoDur }
    $end = [Math]::Min($start + $times[$i].dur, $nextStart - 0.1)
    if ($end -gt $videoDur) { $end = $videoDur - 0.1 }
    $srt += ("{0}`r`n{1} --> {2}`r`n{3}`r`n`r`n" -f ($i + 1), (Fmt-Time $start), (Fmt-Time $end), $times[$i].text)
  }
  Set-Content -Path $srtOut -Value $srt -Encoding ASCII
  Write-Output "subtitles written: $srtOut"
} else {
  Write-Output 'using real voiceover.wav; subtitles from captions.srt'
  Copy-Item (Join-Path $demo 'captions.srt') $srtOut -Force
}

$audio = if (Test-Path $real) { $real } else { $voice }
Write-Output "building MP4 with audio: $audio"

$style = "FontName=Arial,FontSize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=44,Alignment=2"
$vf = "subtitles=captions-narration.srt:force_style='$style'"

$log2 = [System.IO.Path]::GetTempFileName()
Push-Location $demo
& $ff -y -i $webm -i $audio `
  -map '0:v:0' -map '1:a:0' `
  -vf $vf `
  -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -r 25 `
  -c:a aac -b:a 160k -ar 48000 -ac 2 -af 'loudnorm=I=-16:TP=-1.5:LRA=11' `
  -movflags +faststart -shortest $out 2>$log2
$code2 = $LASTEXITCODE
Pop-Location
if ($code2 -ne 0) { Get-Content $log2 -Tail 25; throw "mp4 build failed ($code2)" }
Remove-Item $log2 -Force -ErrorAction SilentlyContinue

Write-Output ('written: {0}' -f $out)
Write-Output ('duration: {0:N1}s, size {1:N1} MB' -f (Get-DurSeconds $out), ((Get-Item $out).Length / 1MB))
