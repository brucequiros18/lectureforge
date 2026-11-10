$ErrorActionPreference = 'Stop'
$src = "C:\Users\User\projects\lectureforge\docs\LectureForge_Presentation.pptx"
$outDir = "C:\Users\User\projects\lectureforge\docs\deck-qa"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir | Out-Null
$pp = New-Object -ComObject PowerPoint.Application
try {
  $pres = $pp.Presentations.Open($src, $true, $false, $false)
  foreach ($slide in $pres.Slides) {
    $slide.Export((Join-Path $outDir ("slide-{0}.png" -f $slide.SlideIndex)), "PNG", 1280, 720)
  }
  $n = $pres.Slides.Count
  $pres.Close()
  "exported $n slides"
} finally {
  $pp.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp) | Out-Null
}
