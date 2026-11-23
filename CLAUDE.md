# CLAUDE.md – ohjeet projektin jatkamiseen

Tämä tiedosto on Claude Codelle (ja ihmiselle), joka jatkaa Cozy Fishing -pelin kehitystä.
Claude Code lukee tämän automaattisesti istunnon alussa. Lue lisäksi `README.md`: se on pelin
ajantasainen toiminnallinen kuvaus (kaikki mekaniikat, näppäimet ja luvut).

## Pikayhteenveto

- **Mikä**: isometrinen pikseligrafiikkainen kalastuspeli selaimessa. Puhdas JavaScript + canvas +
  Web Audio. Ei build-vaihetta, ei riippuvuuksia, ei kehyksiä. `index.html` aukeaa suoraan selaimessa.
- **Repo**: `DeTremolo/CozyFishing` (GitHub). Ainoa pysyvä haara on `main`: kehitys tehdään
  suoraan siihen (`lampi`-haara on poistettu). GitHub Pages julkaisee `main`-haaran juuren.
- **Omistaja ja julkaisija**: DeTremolo Games (detremologames@gmail.com). Käyttäjä kirjoittaa suomeksi ja vastaukset annetaan suomeksi.

## Työskentelytapa (käyttäjän toiveet)

1. Käyttäjä antaa pyynnöt suomeksi, usein useita muutoksia kerralla ja usein kuvan kanssa.
   Toteuta kaikki pyydetyt kohdat; jos jokin jää tekemättä, sano se suoraan.
2. **Testaa aina selaimessa** ennen commitia (ks. Testaus). Katso kuvakaappaukset itse – visuaaliset
   muutokset ovat tämän pelin ydin. Tarkista, ettei konsoliin tule virheitä ja että fps pysyy 60:ssä.
3. **Päivitä `README.md`** jokaisen ominaisuuden yhteydessä (suomeksi, samaan tyyliin kuin muu teksti).
   Näppäintaulukko ja aloitusruudun näppäinohje (`game.js`, aloitusruudun piirto `render()`-funktiossa)
   pidetään ajan tasalla. Kosketusnapit ovat `index.html`:ssä ja `touch.js`:ssä.
4. **Commit** `main`-haaraan ja **push** jokaisen valmiin kokonaisuuden jälkeen.
   - Commit-viesti englanniksi, lyhyt otsikko + tarvittaessa selittävä runko.
   - Tekijä (author): `DeTremolo Games <detremologames@gmail.com>`; committer: `Claude <noreply@anthropic.com>`
     (muuten GitHub näyttää commitin "Unverified"). Esim.
     `git -c user.name=Claude -c user.email=noreply@anthropic.com commit --author="DeTremolo Games <detremologames@gmail.com>" ...`
   - Viestin loppuun istunnon antamat attribuutiorivit (Co-Authored-By jne.), jos ympäristö niitä pyytää.
5. **Historiaa ei kirjoiteta uusiksi** (ei force-pushia) ilman erillistä pyyntöä; merge-committeja ei käytetä.
6. Raportoi lopuksi suomeksi lyhyesti: mitä muutettiin, miten testattiin, mitä jäi auki.

## Tiedostot

| Tiedosto | Sisältö |
|---|---|
| `game.js` | Koko peli (~5500 riviä): kartta, grafiikka (kaikki spritet piirretään koodissa), fysiikka, kalat, äänet, UI |
| `touch.js` | Kosketusohjaus: liiketikku ja tilan mukaan vaihtuvat napit (st-hand / st-ready / st-out: ROD, tee-painike, CAST/REEL IN, RELEASE LINE, LURE, − / +, CUT, AXE/KNIFE/STOW, CHOP, kolme tee-painiketta; LAMP ja WATER (veden piilotus, V) aina; II, ♪, ⛶) |
| `index.html`, `style.css` | Canvas, kosketusnapit, pystyasentokehote |
| `img/watch.png` | Rannekellon taulu (49×49), generoitu skriptillä `tools/mkwatch.py` |
| `fonts/` | Press Start 2P -fontti (OFL) |
| `tools/smoke.js` | Playwright-savutesti: käynnistää pelin, kuvakaappaus, virheet, fps |
| `tools/mkwatch.py` | Kellotaulun pikselikuvan generaattori (Python + Pillow) |
| `README.md` | Pelin kuvaus suomeksi – pidä ajan tasalla |

`shots/` on kuvakaappauksille, eikä sitä viedä gittiin.

## Koodin tyyli

- Kommentit **suomeksi**, pelin näkyvät tekstit (bannerit, ohjeet, napit) **englanniksi**.
- `'use strict'`, ES2020, ei moduuleja: kaikki on yhdessä globaalissa skriptissä, joten pelin
  muuttujat ovat käytettävissä suoraan Playwrightin `page.evaluate()`-kutsuissa.
- Funktiot ovat lyhyitä nimiltään (`isoX`, `pondR`, `shoreDist`, `noiseBurst` ...); osiot on erotettu
  `// -----` -otsikkokommenteilla. Noudata ympäröivän koodin tiheyttä ja nimeämistä.
- Kaikki grafiikka on pikseligrafiikkaa: piirrä kokonaislukukoordinaatteihin (`Math.round`), ei
  antialiasointia, rajattu paletti. Spritet tehdään `makeSprite(rows, pal)`-merkkijonoista tai
  piirretään proseduraalisesti canvakselle kerran valmiiksi.
- Äänet syntetisoidaan Web Audiolla (`SFX`-olio, `noiseBurst`, `softNoise`, `tone`, `droplet`). Ei äänitiedostoja.
- Suorituskyky: vältä `getImageData`-lukuja GPU-canvakselta joka ruudussa (romahdutti fps:n kerran).
  Raskaat asiat esilasketaan (maakuva, varjot, vesimaski) ja päivitetään harvoin.

## Arkkitehtuuri (game.js)

Osiot järjestyksessä (hae otsikkokommentilla):
Perusasetukset → Apufunktiot → Hahmosprite → Maaruudut/puut/kivet → Kartta → Maaston korkeus →
Lammen vesi → Syöte → Äänet → Pelin tila → Pelaaja, onki ja siima → Heitto ja kelaus → Vuorokausi →
Sää ja tuuli → Yö (valokartta) → Nuotio → Kalat → Sorsat → Metsän pikkueläimet → Taivaan linnut →
Nukkuminen → Päivitys (`update()`) → Piirto (`drawWorld()`, `render()`) → Moottorivene → Ajomalli →
Polttopuukatos → Tähtäin ja vieheet (`LURES`) → Pelisilmukka.

### Koordinaatit ja kartta
- Maailma on `N`×`N` = 112×112 ruutua, 1 ruutu = 1 m. Lammen keskipiste `C = 56`, keskisäde `POND_R = 25`.
- Isometrinen projektio: `isoX(x,y) = (x-y)*8 + N*8`, `isoY(x,y) = (x+y)*4`; korkeus `Z_PX = 100/9` px/m (hahmo ≈ 20 px = 180 cm; esineet pidetty pikselikoossa, syvyydet metreinä piirtyvät tällä).
- Ranta on epäsäännöllinen: `pondR(angle)` (satunnaiset vaiheet `shoreA..E`), `bankW(angle)` penkereen leveys.
  `shoreDist(x,y)` > 0 maalla, < 0 vedessä. `depthAt(x,y)` veden syvyys.
- Ruututyypit `type[cellIdx(x,y)]`: `T_BANK`, `T_FOREST`, `T_CLEAR`, `T_TENT`, `T_CAMP`, `T_SHED` ...
  `playerSolid(t)` kertoo, mihin pelaaja ei voi kävellä (myös metsä!). Eläimet saavat kulkea metsässä.
- Kiinteät paikat: `TENT`, `CAMP` (nuotio), `SHED` (polttopuukatos), laituri `DOCK_ANG`/`DOCK_LEN`/`dockLocal()`.

### Ruutu ja skaalaus
- Pelipuskuri `W`×`H` (vähintään 384×216) lasketaan ikkunan koosta `resize()`-funktiossa; pikselikoko `S`
  on kokonaisluku. `resizeBuffers()` luo ruudun kokoiset apucanvakset uudelleen.
- Kamera `cam`; piirrossa käytetään pyöristettyjä `camXr`, `camYr`.

### Piirtojärjestys (`drawWorld`)
1. Maakuva → lammen pohja (`basinCanvas`) → vesikivet → vesi (`water.show`)
2. `drawUnderwater` (kalat, varret, laiturin tolpat, veneen pohja; häivytys `underVis(z)`)
3. `snapStars('a')` → `drawReflections` (pelaaja, vene, sorsat yhdessä syvyyslajitellussa kerroksessa,
   maskattu `pondMaskCanvas`illa) → lumpeet, usva, laituri, viehe, varjot
4. Syvyyslajiteltu lista (`d = x + y`), tyypit `k`: 0 puu, 1 ruoho/kaisla, 2 teltta, 3 nuotio, 4 eläin,
   5 sorsa, 6 pelaaja, 7 vesikivi, 8 vene, 9 liiteri, 10 norppa. Pelaajan edessä olevat puut menevät `frontCtx`-
   kerrokseen, johon leikataan näkymäaukko pelaajan kohdalle.
5. Lentävät sorsat ja linnut → partikkelit → `snapStars('b')` → `drawWeather` (sää, yön valokartta,
   hehkut ja tähdet yöpeitteen päällä) → UI (kello, tuuliviiri, tähtäin, palkit).
- Tähtien peitto lasketaan GPU:lla erotuskuvana (`snapStars` a/b), ei pikselilukuna. Maski on puolella resoluutiolla ja päivittyy vain
  kameran liikkuessa tai `STAR_EVERY` (4) ruudun välein; muina ruutuina piirretään valmis `starCanvas`.
- Laatutaso: `gfxLow` (auto, kun ruudun aika on pitkään yli 22 ms; G vaihtaa käsin) harventaa veden, yön ja tähtien päivityksiä;
  ajoitusnäkymä `prof` (O) kertoo piirto-osien ms. Vesikuva (`drawWater`) käytetään uudelleen kameran ollessa paikallaan, ja etukerros
  + `viewHole` lasketaan vain kun etukerrokselle piirrettiin jotain (`frontDirty`). `text()` välimuistittaa toistuvat HUD-tekstit.
- Yön pimeyskerros (`drawNight`) lasketaan uudelleen kameran, hahmon tai valaistuksen muuttuessa, muuten `nightEvery` (4) ruudun välein;
  vain valojen rajauslaatikko luetaan ja rasteroidaan (muu ruutu on tasaista täyspimeyttä).

### Aika ja sää
- `time` = päivitysten määrä (60/s). `clock` = pelin kello, `CYCLE = 36000` yksikköä/vrk.
  `todNow()` (0–1) alkaa kello 4.30:sta; `START_TOD = 0.12`. `GAME_MIN = CYCLE/1440`.
- Nopeus 1x = todellinen aika (`CLOCK_REAL`); `timeScale` 1–10 (T / Shift+T); `L` kelaa selaimen kellonaikaan.
- Vaiheet `phaseOf(tod)`: NIGHT (tod < 0.03 tai ≥ 0.76, eli noin klo 22.45–5.15), MORNING, DAY, EVENING.
  Yöllä metsän eläimet, sorsien saapuminen ja taivaan linnut ovat poissa.
- Sää: päiväkohtainen suunnitelma `weatherPlan(day)` / `rainOf(day)` (noin 40 % päivistä sateisia),
  `weatherKindNow()`, `setWeatherKind()`. Auringon varjot `sunShear(hour)`, päivitys tunneittain ristihäivytyksellä
  (`tickSunShadows`, `sunA`/`sunB`).

### Kalastus
- Vieheet `LURES`: `bobber` (koho ja mato), `wobbler` (vaappu), `spoon` (lippa). `isArt(kind)` = keinotekoinen.
- Koho heitetään tähtäämällä (`aimCast()`, `castTarget()`, `castLureAt()`; tarkkuuskehä `CAST_SPREAD = 2.5`,
  enimmäispituus `CAST_AIM_MAX = 15`); muut vieheet voimapalkilla.
- Kalat: `SPECIES` (ahven `perch`, hauki `pike`, lahna `bream`) – energia, palautuminen, veto, viehemieltymykset. Lahnalla `bite: 'nibble'`: kala maistelee syöttiä (`nibbleBait`: koho painuu `L.sub` ≤ 0,2 m tai kellahtaa `L.flat`, pohjaongen kello) ennen `hookFish`ia; ikäkauden mukainen kuvasarja `fishSprKey(f)` (`bream`, `bream1`, `bream2`).
  Taistelussa siiman kireys `cast.lure.tension`; ≥ 1 katkaisee siiman (`cutLine(true)`).
- Huijaustila (V): vesi piiloon, kalat/pohja/debug-viivat näkyviin, `[` `]` sameus, `B` syvyyskäyrät, `H` kalan voimapalkki.

### Muut järjestelmät
- Vene: `boat`, `driveBoat`, `updateBoat`, `hullFree`; `player.boat`, `boat.rider` = `'drive'`/`'stand'`.
- Nuotio: `fire = { wood, emb, lit, barT }`, `burnFire(dt)`, `addFirewood()` (E), `lightFire()` (Z),
  `FIRE_MAX = 5`, uuden klapin voi lisätä kun puuta ≤ `FIRE_FULL` (4,5). Täysi nuotio palaa tunnin, hiillos 30 min.
- Eläimet: `ANIMAL_KINDS`, `spawnAnimal`, `updateAnimals` (tilat lurk → approach → forage → leave, flee, home);
  enintään 2 kerrallaan, uusi 800–2200 päivityksen välein.
- Sorsat: `makeDuck`, `updateDucks`, `takeOff`, `scramble`, `duckSplash`; ääni `SFX.duckWater(land, v)`.
- Työkalut ja polttopuut: `player.tool` (`'axe'`/`'knife'`), `player.wood` (inventaario), `player.chop` (hakkuu: hits, swing, cd), `SHED.logs`/`SHED.cap` (katos); `toggleTool`, `takeWood`, `storeWood`, `startChop`/`updateChop`, `eAction` (E-näppäimen lähin toiminto), `contextActions` (kosketuksen tee-painikkeet). Näppäimet X, K, Y, N, välilyönti/hiiri (isku).
- Heitetty pohjaonki: `rigPath(L, tf, d, p, tipH, bob)` (myös koho-ongen siima: `bobPts`, `drawBobLine`, `drawBobLineUnder`; pituus aina `L.out`), `rigState(L)` (siima yhtenä 3D-polkuna kärjestä puntille: kireänä suora, löysänä paraabelinotko kärjestä päähän, maahan/pohjaan osuva osa makaa sillä ja ylimäärä kiemurtelee; veden alla oleva osa uppoaa hitaasti (`L.sinkZ` jahtaa tavoitesyvyyttä nopeudella `SAG_SINK`; vapautettu siima purkautuu kasaksi pinnan läpäisykohtaan, uppoaa ja avautuu paraabeliksi; kasan amplitudi ratkaistaan niin, että pituus = `L.out`); haara polun pisteessä `L.dist` m puntista; `L.dist` = haaran etäisyys puntista = `rigVisPx(rigDist)/Z_PX` m, `RIG_ARM` = 3,2 px; `L.z` < 0 = puntti nostettu ilmaan; `zJ` < 0 = haara ilmassa), `rigScreen`, `drawRigLine` (ilmaosa), `drawRigUnder` (veden alla) ja `drawRigAir` (ilmassa); `baitPoint()` palauttaa null, kun syötti ei ole vedessä; pikakelaus vasta kun puntti ei ole vedessä (`updateCast`).
- Silkkiuikut: `grebes` (kaksi, eivät poistu pelistä), `updateGrebes`, `drawGrebe`, `GREBE_SPR`; tilat swim → dive (sukellus; veden alla uintikuva `GREBE_SPR.under`, `drawGrebeUnder`) tai takeoff → fly → lasku (swim); yöllä roost → sleep (kuten sorsilla, `roostSpot(d, pool)`); ääni `SONGS.grebe`. Piirtolistan tyyppi `k` 11, heijastukset `drawGrebeReflection`.
- Norppa: `seal` (tilat rest, hop, roll, swim, surf, haul, nap = yöuni pohjan lähellä, hengitys `SEAL_BREATH_T` = 40 s välein), `makeSeal`, `updateSeal`, `drawSeal` (laiturilla ja pää pinnalla), `drawSealUnder`
  (veden alla; pinnalle nouseva norppa piirretään `SEAL_SPR.surf`-kuvalla, jonka vesirajan yläpuolinen osa piirretään `drawSeal`issa ja vedenalainen `drawSealUnder`issa); äänet `SFX.sealSplash`, `SFX.sealBreath`. Kuvat `SEAL_SPR` piirretään koodissa.
- Ilmoitukset: `notify(text, t, key)` – sama `key` korvaa edellisen bannerin.

## Testaus

Ympäristössä tarvitaan Node ja Playwright + Chromium (Claude Coden pilviympäristössä valmiina;
Chromium on polussa `/opt/pw-browsers`, älä aja `playwright install`).

```bash
# Savutesti: keskipäivä ja yö, kuvakaappaus + virheet + fps
NODE_PATH=$(npm root -g) node tools/smoke.js 12 shots/paiva.png
NODE_PATH=$(npm root -g) node tools/smoke.js 23 shots/yo.png
node --check game.js   # pelkkä syntaksitarkistus
```

Omat testiskriptit kannattaa tehdä `tools/smoke.js`:n pohjalta (istunnon scratchpad-kansioon):
- Siirrä pelaaja ja aseta tila suoraan: `page.evaluate(() => { player.x = ...; clock = ...; fire.wood = 3; })`.
- Simuloi pitkiä aikoja nopeasti kutsumalla päivitysfunktioita silmukassa, esim.
  `for (let i = 0; i < 36000; i++) updateAnimals();`, ja kerää tilastoja.
- Rajaa kuvakaappaus kohteeseen: ruutukoordinaatti `isoX(x,y) - cam.x`, kerrottuna `S`:llä.
- Katso kuvat (Read-työkalu) ja vertaa käyttäjän pyyntöön.

## Muistettavia sudenkuoppia (aiemmin korjattuja)

- Muuttujanimi `W` on globaali puskurin leveys – älä varjosta sitä paikallisesti.
- Huojunta: käytä kertyvää vaihetta (`swayPh += ...`), ei `time * f(tuuli)` (aiheutti nykimistä).
- Tähtien peitto `getImageData`illa romahdutti fps:n → käytä GPU-erotusmaskia.
- `destination-out`-piirto pyyhki koko näkymän (kuu) → piirrä muodot suoraan pikseleinä.
- Eläinten liikkumistarkistus esti metsäruudut (`playerSolid`) → eläimet jumittuivat näkymättömiin.
  Tarkista uusien esteiden vaikutus myös eläimiin, sorsiin ja veneeseen.
- `noiseBurst` alkaa täydellä voimakkuudella (terävä isku); pehmeisiin ääniin `softNoise` (nouseva alku).
- `polyFill` täyttää pikselin, jonka keskipiste on monikulmion sisällä: oikeanpuoleisin pikselisarake w-1 vaatii reunan x = w (muuten
  esim. norpan nenä jäi irralleen).
- Heijastukset piirretään yhteen syvyyslajiteltuun kerrokseen; uudet heijastuvat asiat lisätään `drawReflections`iin.

## Avoimet / mahdolliset jatkot

- Android-/APK-kääntö ei ole mukana (pohjana oli Jungle Hunterin moottori `DeTremolo/JungleHunterMobile`).
- Yöeläimiä ei vielä ole (`ANIMAL_KINDS.night` on tyhjä).
- Puukolla ei voi vielä tehdä mitään (se vain otetaan käteen).
- Kalojen roiskeääni käyttää yhä vanhaa `SFX.splash`ia.
