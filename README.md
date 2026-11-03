# Claycrown 👑

Echtzeit Strategiespiel als Webapp. Baue dein Reich aus Lehm, sammle Rohstoffe, führe dein Volk durch vier Zeitalter und erobere die Krone.

Optimiert für iPhone und iPad (Safari, Home-Bildschirm im Vollbild), läuft ebenso auf Android (Chrome) und am Desktop.

## Spielinhalt

* 4 Rohstoffe: Nahrung, Holz, Gold, Lehm
* 4 Zeitalter: Lehmzeit, Brennofenzeit, Bronzezeit, Kronenzeit
* 13 Gebäude, darunter Burg, Kaserne, Schießstand, Stall, Schmiede, Wachturm, Werkstatt und Kronenmonument
* 7 Einheiten mit Stärken und Schwächen: Arbeiter, Speerträger, Schwertkämpfer, Bogenschütze, Reiter, Rammbock, Tonkoloss
* 11 Technologien inklusive Zeitalteraufstieg
* 1 bis 3 KI Gegner in drei Schwierigkeitsstufen, zufällige Karten in drei Größen
* Nebel des Krieges für alle Seiten: Die KI muss erkunden und sieht nur auf Schwer die ganze Karte
* Minikarte, Sammelpunkte, Angriffsbewegung
* Sieg durch Eroberung oder durch das Kronenmonument (3 Minuten halten)
* Automatisches Speichern, offline spielbar als PWA

## Steuerung

Touch: Tippen wählt aus und gibt Befehle, gedrückt halten und ziehen zieht einen Rahmen, ein Finger verschiebt die Karte, zwei Finger zoomen, doppelt tippen wählt alle gleichen Einheiten.

Maus: Linksklick wählt, Ziehen zieht einen Rahmen, Rechtsklick gibt Befehle, Mausrad zoomt, WASD scrollt, Leertaste pausiert.

## Starten

Das Spiel besteht nur aus statischen Dateien ohne Build Schritt.

Lokal: `python3 -m http.server 8080` im Projektordner ausführen und `http://localhost:8080` öffnen.

Online (für iPhone nötig, da der Offline Modus HTTPS braucht): In GitHub unter Settings, Pages die Quelle „Deploy from a branch“ mit dem Branch `master` und dem Ordner `/ (root)` wählen. Danach ist das Spiel unter `https://laiken96.github.io/Claycrown/` erreichbar.

Auf dem iPhone die Seite in Safari öffnen, auf Teilen tippen und „Zum Home-Bildschirm“ wählen. Claycrown startet dann im Vollbild wie eine App.

## Entwicklung

* `js/world.js` Simulation: Karte, Wegfindung (A*), Wirtschaft, Kampf, Nebel, Speichern
* `js/ai.js` Computergegner
* `js/render.js` prozedurale Canvas Grafik, keine externen Bilder
* `js/input.js` Touch, Maus und Tastatur
* `js/ui.js` und `js/main.js` Oberfläche und Spielschleife
* `node tools/simtest.js 25 normal` simuliert KI gegen KI ohne Browser
