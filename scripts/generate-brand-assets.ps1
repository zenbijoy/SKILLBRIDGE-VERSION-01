Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\24030\.gemini\antigravity-ide\brain\c91a31f9-a0e5-4085-9882-db1a1adc4434\.user_uploaded\media_1788592441962.jpg"
$destBrandingDir = "C:\Users\24030\source\skillbridge-final\frontend\assets\branding"
$destSplashDir = "C:\Users\24030\source\skillbridge-final\frontend\assets\splash"
$destAssetsDir = "C:\Users\24030\source\skillbridge-final\frontend\assets"

if (-not (Test-Path $destBrandingDir)) { New-Item -ItemType Directory -Path $destBrandingDir -Force | Out-Null }
if (-not (Test-Path $destSplashDir)) { New-Item -ItemType Directory -Path $destSplashDir -Force | Out-Null }

Write-Host "[1/6] Loading source logo..." -ForegroundColor Cyan
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

# Exact bounding box of the upper graphical symbol
# X in [219, 802], Y in [225, 598]
$minX = 219
$maxX = 802
$minY = 225
$maxY = 598

$symW = $maxX - $minX + 1 # 584
$symH = $maxY - $minY + 1 # 374

Write-Host "Symbol dimensions: $symW x $symH"

# Step 1: Create tight transparent symbol bitmap with precision alpha un-matting
Write-Host "[2/6] Extracting symbol with transparent background..." -ForegroundColor Cyan
$tightBmp = New-Object System.Drawing.Bitmap($symW, $symH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Background color in source is approximately R=254, G=254, B=254
$bgVal = 254.0

for ($y = 0; $y -lt $symH; $y++) {
    $srcY = $minY + $y
    for ($x = 0; $x -lt $symW; $x++) {
        $srcX = $minX + $x
        $p = $srcBmp.GetPixel($srcX, $srcY)

        $r = [double]$p.R
        $g = [double]$p.G
        $b = [double]$p.B

        # Calculate deviation from white
        $diffR = 255.0 - $r
        $diffG = 255.0 - $g
        $diffB = 255.0 - $b
        $maxDiff = [Math]::Max($diffR, [Math]::Max($diffG, $diffB))

        if ($maxDiff -le 3.0) {
            # Pure background pixel -> fully transparent
            $tightBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            # Compute alpha based on distance from white
            # If maxDiff >= 30, it is solid foreground; between 3 and 30, it is antialiased edge
            $alpha = 1.0
            if ($maxDiff -lt 28.0) {
                $alpha = [Math]::Min(1.0, ($maxDiff - 2.0) / 26.0)
            }

            # Un-multiply background to recover original foreground color without white wash
            if ($alpha -lt 1.0 -and $alpha -gt 0.01) {
                $unR = [Math]::Min(255.0, [Math]::Max(0.0, ($r - (1.0 - $alpha) * $bgVal) / $alpha))
                $unG = [Math]::Min(255.0, [Math]::Max(0.0, ($g - (1.0 - $alpha) * $bgVal) / $alpha))
                $unB = [Math]::Min(255.0, [Math]::Max(0.0, ($b - (1.0 - $alpha) * $bgVal) / $alpha))
            } else {
                $unR = $r
                $unG = $g
                $unB = $b
            }

            $intA = [int][Math]::Round($alpha * 255.0)
            $intA = [Math]::Max(0, [Math]::Min(255, $intA))
            $intR = [int][Math]::Round($unR)
            $intR = [Math]::Max(0, [Math]::Min(255, $intR))
            $intG = [int][Math]::Round($unG)
            $intG = [Math]::Max(0, [Math]::Min(255, $intG))
            $intB = [int][Math]::Round($unB)
            $intB = [Math]::Max(0, [Math]::Min(255, $intB))

            $tightBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($intA, $intR, $intG, $intB))
        }
    }
}

# Helper function to draw scaled centered bitmap
function Draw-CenteredScaled($targetBmp, $srcBmp, $targetWidth, $targetHeight, $bgBrush = $null) {
    $g = [System.Drawing.Graphics]::FromImage($targetBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($bgBrush -ne $null) {
        $g.FillRectangle($bgBrush, 0, 0, $targetBmp.Width, $targetBmp.Height)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # Maintain exact aspect ratio
    $scale = [Math]::Min([double]$targetWidth / [double]$srcBmp.Width, [double]$targetHeight / [double]$srcBmp.Height)
    $drawW = [int][Math]::Round($srcBmp.Width * $scale)
    $drawH = [int][Math]::Round($srcBmp.Height * $scale)
    $drawX = [int][Math]::Round(($targetBmp.Width - $drawW) / 2.0)
    $drawY = [int][Math]::Round(($targetBmp.Height - $drawH) / 2.0)

    $destRect = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawW, $drawH)
    $g.DrawImage($srcBmp, $destRect, 0, 0, $srcBmp.Width, $srcBmp.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
}

Write-Host "[3/6] Generating Master Assets..." -ForegroundColor Cyan

# 1. Master High-Resolution Symbol Asset (1024x1024 transparent)
$masterBmp = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $masterBmp $tightBmp 780 500
$masterPath = Join-Path $destBrandingDir "skillbridge-mark-master.png"
$masterBmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $masterPath"

# 2. Runtime Optimized In-App Loader Asset (512x512 transparent)
$loaderBmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $loaderBmp $tightBmp 420 270
$loaderPath = Join-Path $destBrandingDir "skillbridge-mark.png"
$loaderBmp.Save($loaderPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $loaderPath"

Write-Host "[4/6] Generating App Icons..." -ForegroundColor Cyan

# 3. Canonical / iOS App Icon (1024x1024 opaque white)
# iOS safe zone requires no transparency and sufficient margin (approx 680px width)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$iconBmp = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $iconBmp $tightBmp 720 460 $whiteBrush
$iconPath = Join-Path $destAssetsDir "icon.png"
$iconBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $iconPath"

# 4. Android Adaptive Icon Foreground (1024x1024 transparent)
# Android adaptive icons display inside a central 66% circle (radius ~338px).
# Using targetWidth = 620px ensures the entire figure & bridge is inside the safe zone with breathing room.
$adaptiveBmp = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $adaptiveBmp $tightBmp 620 396
$adaptivePath = Join-Path $destAssetsDir "adaptive-icon.png"
$adaptiveBmp.Save($adaptivePath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $adaptivePath"

# Also save copy into assets/branding for reference
$adaptiveBrandingPath = Join-Path $destBrandingDir "adaptive-icon.png"
$adaptiveBmp.Save($adaptiveBrandingPath, [System.Drawing.Imaging.ImageFormat]::Png)

# 5. Android Adaptive Icon Monochrome (1024x1024 white silhouette on transparent)
$monochromeBmp = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$monoTightBmp = New-Object System.Drawing.Bitmap($tightBmp.Width, $tightBmp.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $tightBmp.Height; $y++) {
    for ($x = 0; $x -lt $tightBmp.Width; $x++) {
        $p = $tightBmp.GetPixel($x, $y)
        if ($p.A -gt 0) {
            # Pure white with original antialiased alpha
            $monoTightBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, 255, 255, 255))
        } else {
            $monoTightBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        }
    }
}
Draw-CenteredScaled $monochromeBmp $monoTightBmp 620 396
$monochromePath = Join-Path $destAssetsDir "adaptive-icon-monochrome.png"
$monochromeBmp.Save($monochromePath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $monochromePath"

Write-Host "[5/6] Generating Splash Screen Assets..." -ForegroundColor Cyan

# 6. Splash mark (512x512 transparent)
$splashMarkBmp = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $splashMarkBmp $tightBmp 400 256
$splashMarkPath = Join-Path $destSplashDir "skillbridge-splash-mark.png"
$splashMarkBmp.Save($splashMarkPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $splashMarkPath"

# 7. Canonical Splash Image (1024x1024 white background, centered mark)
$splashBmp = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $splashBmp $tightBmp 560 358 $whiteBrush
$splashPath = Join-Path $destAssetsDir "splash.png"
$splashBmp.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $splashPath"

Write-Host "[6/6] Generating Favicon Assets..." -ForegroundColor Cyan

# 8. Web Favicon (192x192 transparent, crisp scaling)
$faviconBmp = New-Object System.Drawing.Bitmap(192, 192, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
Draw-CenteredScaled $faviconBmp $tightBmp 168 108
$faviconPath = Join-Path $destAssetsDir "favicon.png"
$faviconBmp.Save($faviconPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  -> Saved: $faviconPath"

# Clean up GDI+ resources
$srcBmp.Dispose()
$tightBmp.Dispose()
$monoTightBmp.Dispose()
$masterBmp.Dispose()
$loaderBmp.Dispose()
$iconBmp.Dispose()
$adaptiveBmp.Dispose()
$monochromeBmp.Dispose()
$splashMarkBmp.Dispose()
$splashBmp.Dispose()
$faviconBmp.Dispose()
$whiteBrush.Dispose()

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  ALL BRAND ASSETS SUCCESSFULLY GENERATED!         " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
