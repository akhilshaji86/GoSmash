# GoSmash HD Angular Icon Set

High-quality dark GoSmash icon set for Angular, favicon, Apple touch icon, and PWA usage.

## Included

- `gosmash-icon-2048.png` — HD master
- `gosmash-icon-1024.png` — app-store style master
- `favicon.ico`
- PNG favicons: 16, 32, 48
- PWA/app icons: 72, 96, 128, 144, 152, 180, 192, 256, 384, 512
- WebP versions: 192, 512, 1024
- `manifest.webmanifest`

## Recommended Angular placement

Copy PNG/WebP icon files into:

```text
src/assets/icons/
```

Copy `favicon.ico` to:

```text
src/favicon.ico
```

Copy `manifest.webmanifest` to:

```text
src/manifest.webmanifest
```

## Add/update `src/index.html`

```html
<link rel="icon" type="image/x-icon" href="favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="assets/icons/favicon-16x16.png">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#C6FF2E">
```

## Angular assets config

Check that `angular.json` includes:

```json
"assets": [
  "src/favicon.ico",
  "src/assets",
  "src/manifest.webmanifest"
]
```
