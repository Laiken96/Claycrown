# Claycrown 2.0 👑

Echtzeit Strategiespiel als Webapp. Baue dein Reich aus Lehm, sammle Rohstoffe, führe dein Volk durch vier Zeitalter und erobere die Krone.

Optimiert für iPhone und iPad (Safari, Home-Bildschirm im Vollbild), läuft ebenso auf Android (Chrome) und am Desktop.

## Spielinhalt

* 4 Rohstoffe: Nahrung, Holz, Gold, Lehm
* 4 Zeitalter: Lehmzeit, Brennofenzeit, Bronzezeit, Kronenzeit
* 20 Gebäude auf drei Bauseiten (Wirtschaft, Militär, Verteidigung)
  * neu in 2.0: Markt mit schwankenden Kursen, Brennofen, Zwinger, Festung (3 Pfeile pro Salve, +10 Bevölkerung), Geschützturm, Lehmmauern
* 16 Einheiten mit Stärken und Schwächen
  * neu in 2.0: Plänkler, Armbrustschütze, Reiterschütze, Ritter, Kriegshund, Balliste, Kronwächter
* 21 Technologien, darunter Daumenring, Pferdezucht, Bronzeklingen, Schuppenpanzer, Drill, Wehrpflicht, Gilden, Glutofen und Vorratskrüge
* KI nutzt alle neuen Gebäude, Einheiten und den Markt
* Bevölkerungsgrenze 150
* 1 bis 3 KI Gegner in drei Schwierigkeitsstufen, zufällige Karten in drei Größen, Nebel des Krieges für alle Seiten
* Sieg durch Zerstörung aller Burgen und Militärgebäude oder durch das Kronenmonument (3 Minuten halten)
* Ausführliche Endstatistik mit Verlaufsgrafik, automatisches Speichern, offline spielbar als PWA

## Grafik 2.0

* Terrain als weiches, gebackenes Gemälde mit Relief, organischen Uferlinien, Wassertiefe und Schaumkante
* Detailreiche Einheiten mit Lauf, Angriffs und Arbeitsanimationen, Pferde im Galopp, schwingende Belagerungswaffen
* Gebäude mit Materialtexturen (Lehm, Ziegel, Stein, Holz), Ziegeldächern in Spielerfarbe, wehenden Fahnen, Rauch aus Schornsteinen, Glut in Esse und Brennofen
* Tag und Nacht mit wanderndem Sonnenstand, Schatten, beleuchteten Fenstern, Fackeln und Glühwürmchen
* Partikel: Staub, Funken, Blut, Trümmer, Feuer und Rauch an beschädigten Gebäuden, Holzspäne, Goldglitzern, Einschlagwellen und Kamerawackeln
* Wolkenschatten, Vogelschwärme, wiegende Bäume, glitzerndes Wasser, Blumen, Schilf und Seerosen
* Grafikstufen Niedrig, Mittel und Hoch sowie Tag und Nacht abschaltbar (Hauptmenü und Pause)

## Fallback: klassische Version 1.0

Gefällt dir Version 2.0 nicht, bleibt Version 1.0 vollständig erhalten:

* Im Hauptmenü „Klassische Version 1.0 spielen“ wählen oder direkt `classic/index.html` öffnen. Sie hat einen eigenen Spielstand.
* Im Git Verlauf markiert der Tag `v1.0` den Stand vor 2.0. Mit `git checkout v1.0` lässt sich der alte Stand jederzeit vollständig wiederherstellen.

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
* `js/render.js` Renderer: Terrain backen, Licht, Schatten, Partikel, Nebel
* `js/gfx-units.js` und `js/gfx-buildings.js` prozedurale Einheiten und Gebäudegrafik, keine externen Bilder
* `js/input.js` Touch, Maus und Tastatur
* `js/ui.js` und `js/main.js` Oberfläche und Spielschleife
* `node tools/simtest.js 25 normal [seed] [kartengröße] [gegner]` simuliert KI gegen KI ohne Browser
* `classic/` enthält die unveränderte Version 1.0 (nur der Absturz beim Zeichnen des Tempels wurde behoben)
