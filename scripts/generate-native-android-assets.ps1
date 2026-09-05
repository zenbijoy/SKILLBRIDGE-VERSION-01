Add-Type -AssemblyName System.Drawing

$masterIconPath = "C:\Users\24030\source\skillbridge-final\frontend\assets\icon.png"
$masterSplashMarkPath = "C:\Users\24030\source\skillbridge-final\frontend\assets\splash\skillbridge-splash-mark.png"
$resDir = "C:\Users\24030\source\skillbridge-final\frontend\android\app\src\main\res"

$iconBmp = [System.Drawing.Bitmap]::FromFile($masterIconPath)
$splashBmp = [System.Drawing.Bitmap]::FromFile($masterSplashMarkPath)

function Save-Scaled($src, $destPath, $w, $h, $format = [System.Drawing.Imaging.ImageFormat]::Png) {
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $g.DrawImage($src, $destRect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $bmp.Save($destPath, $format)
    $bmp.Dispose()
    Write-Host "  -> Generated: $destPath ($w x $h)"
}

function Save-RoundIcon($src, $destPath, $size) {
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Clip to circle
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $g.SetClip($path)

    # Fill white background
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, 0, 0, $size, $size)
    $whiteBrush.Dispose()

    # Draw scaled icon inside
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $g.DrawImage($src, $destRect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $path.Dispose()
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  -> Generated Round: $destPath ($size x $size)"
}

Write-Host "Generating Android Native Launcher Icons & Splash Screens..." -ForegroundColor Cyan

$densities = @(
    @{ Name = "mdpi"; Icon = 48; Splash = 128 },
    @{ Name = "hdpi"; Icon = 72; Splash = 192 },
    @{ Name = "xhdpi"; Icon = 96; Splash = 256 },
    @{ Name = "xxhdpi"; Icon = 144; Splash = 384 },
    @{ Name = "xxxhdpi"; Icon = 192; Splash = 512 }
)

foreach ($d in $densities) {
    $mipmapDir = Join-Path $resDir "mipmap-$($d.Name)"
    $drawableDir = Join-Path $resDir "drawable-$($d.Name)"

    # Square / standard launcher icon
    $iconDest = Join-Path $mipmapDir "ic_launcher.png"
    Save-Scaled $iconBmp $iconDest $d.Icon $d.Icon

    # Round launcher icon
    $roundDest = Join-Path $mipmapDir "ic_launcher_round.png"
    Save-RoundIcon $iconBmp $roundDest $d.Icon

    # Splashscreen logo
    $splashDest = Join-Path $drawableDir "splashscreen_logo.png"
    Save-Scaled $splashBmp $splashDest $d.Splash $d.Splash
}

$iconBmp.Dispose()
$splashBmp.Dispose()

Write-Host "Android native assets updated successfully." -ForegroundColor Green
