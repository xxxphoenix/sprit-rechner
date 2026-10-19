#!/bin/sh
# Baut eine einzelne Vorschau-Datei (Beispieldaten, ohne Live-Preise) für die Artifact-Vorschau.
cd "$(dirname "$0")"
{
  echo '<title>Sprit-Rechner</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap">'
  echo '<style>'; cat app.css; echo '</style>'
  echo '<div id="app"></div>'
  echo '<script>window.SPRIT_PREVIEW = true;</script>'
  echo '<script>'; cat app.js; echo '</script>'
} > "${1:-preview.html}"
