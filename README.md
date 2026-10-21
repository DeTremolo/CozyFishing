# Cozy Fishing

Selaimessa pyörivä isometrinen pikseligrafiikkapeli. © 2026 DeTremolo Games.

Peli täyttää koko selainikkunan: pikselikoko valitaan niin, että ikkunaan mahtuu vähintään 384 x 216
pelipikseliä, ja leveämmässä tai korkeammassa ikkunassa näkyy enemmän maisemaa. Näppäinohjeet ovat
aloitusruudulla.

Retkeilijä on lähtenyt kalaan pienelle metsälammelle synkän kuusimetsän siimekseen.
Pohjana on Jungle Hunterin selainmoottori (`DeTremolo/JungleHunterMobile`); Android-/APK-kääntö ei ole vielä mukana.

## Ohjaus

| Tietokone | Kosketusnäyttö | Toiminto |
|---|---|---|
| WASD / nuolinäppäimet | vedä sormella missä tahansa | kävely |
| hiiri | – | tähtäin: hahmo ja otsalamppu kääntyvät sen suuntaan |
| hiiren nappi pohjassa | CAST / REEL | onki kädessä: heiton lataus (heitto lähtee napin vapautuessa) tai siiman kelaus |
| R | ROD | onki käteen / takaisin repun kylkeen |
| F | LAMP | otsalamppu päälle / pois |
| E (teltan ovella) | SLEEP | nukkumaan aamuun kello 7.00 asti; mikä tahansa näppäin herättää |
| hiiren oikea nappi pohjassa | – | vapauta siimaa kelalta (enintään 30 m ulkona) |
| Q | LURE | vaihda viehe: koho ja mato / vaappu (vain kun siima on kelattu sisään) |
| hiiren rulla tai - / + | – | koholla koukun syvyys 0,1–1,5 m (vain kun siima on kelattu sisään); vaapulla kelausnopeus 10–100 cm/s |
| T / Shift+T | – | ajan nopeus 1x–10x todelliseen aikaan verrattuna (nopeampi / hitaampi) |
| L | – | kelaa kello nopeasti (60 min/s) selaimen paikalliseen kellonaikaan; perillä nopeus palaa 1x:ään |
| V | – | huijaustila (cheat mode) päälle / pois: vesi piilotetaan, kalat ja pohja näkyvät, debug-viivat |
| [ ja ] | – | veden sameus pienemmäksi / suuremmaksi (vain huijaustilassa) |
| B | – | syvyyskäyrät (1 m välein) päälle / pois (vain huijaustilassa) |
| C | CUT | katkaise siima (kun siima on ulkona) |
| H | – | kalan voimapalkki näkyviin / piiloon |
| P | II | tauko |
| M | ♪ | äänet päälle / pois |

Tähtäin vaihtuu sen mukaan, mitä hahmolla on kädessä: ilman esinettä se on risti, ongen kanssa
siimassa olevan vieheen muotoinen (nyt keinuva koho, jonka alla oleva rengas sinertää veden päällä).
Kun koho kelluu vedessä, tähtäimenä on ongen kela, jonka kampi pyörii kelattaessa ja välillä
satunnaisesti muulloinkin.

**Heitto**: kun nappia pidetään pohjassa, hahmon alle tulee voimapalkki. Voima nousee täyteen, laskee
nollaan ja nousee taas. Heitto (2,5–16 m) lähtee tähtäimen suuntaan napin vapautuessa. Veteen osuva
koho jättää renkaan ja jää kellumaan. Jos pelaaja loittonee, siima kiristyy ja vetää kohoa perässään;
lähestyessä siima jää löysälle kasalle. Nappi pohjassa siima kelataan sisään (kelattava koho jättää
vanaveden), ja koko heitetty siima pitää kelata ennen kuin onkea voi laittaa selkään tai heittää uudelleen.

Hahmolla on kuvat kahdeksaan suuntaan (viisi piirrettyä suuntaa ja niiden peilikuvat).

## Maailma

- **Lampi**: epäsäännöllisen muotoinen, halkaisijaltaan noin 45–55 m (1 ruutu = 1 m); rannassa on lahtia ja niemiä,
  ja muoto arvotaan joka pelissä uudelleen. Pinnassa heijastuvat taivas ja kauimman rannan puut.
  Tyynellä vesi on lähes peilityyni, tuulella pinta väreilee ja heijastus vääristyy. Pohjaa ei näe.
  Rantavedessä on kiviä.
- **Rantapenger**: noin 3–4 m leveä, kiertää koko lammen; penkereellä ja aukealla kasvaa ruohotuppaita ja
  tiheämmin lyhyttä ruohoa. Ruohoa ei häivytetä pelaajan ympärillä, vaan se peittää sen takana seisovan hahmon.
  Metsään ja veteen ei voi kävellä.
- **Metsä**: enimmäkseen eri muotoisia kuusia (kapea, suippo latvus yksittäisistä riippuvista oksista ja
  niiden alta roikkuvista neulasverhoista), joukossa harvakseltaan mäntyjä ja koivuja. Puiden latvukset
  huojuvat tuulessa rauhallisesti, kukin puu omassa tahdissaan. Rantavedessä kasvavassa
  kaislikossa on järviruokoa,
  osmankäämiä ja saraa, jotka taipuvat tuulessa sulavasti. Kaislikon väleissä on avoimia
  rantakohtia, joista pääsee kalastamaan vapaasti. Matalassa rantavedessä kelluu lumpeita ja ulpukoita.
  Lumpeiden varret ja kaislojen vedenalaiset varret ulottuvat lammen pohjaan asti; kaislikko huojuu rauhallisesti.
- **Aukea** lammen vasemmalla rannalla: teltta, palava nuotio (savu kulkee tuulen mukana; välillä ritisten
  nousevat hehkuvat kipinät leijailevat savun mukana ja hohtavat pimeällä) ja
  noin 8 m pitkä laituri, jolle voi kävellä.
- **Vuorokausi** (1x nopeudella 24 h, kuten oikea kello): aamu, päivä, ilta ja yö. Kellonaika näkyy vasemmassa yläkulmassa rannekellosta
  (pikseligrafiikkana piirretty kellotaulu `img/watch.png`, viisarit piirretään ohjelmallisesti). Kirkkaana yönä tähdet heijastuvat vedestä; tyynellä ne vain tuikkivat, aallokossa ne heiluvat pikselin tai kaksi. Ajan
  nopeutta voi muuttaa 1x–10x (T), ja nopeus näkyy kellon vieressä. Kellon voi kelata nopeasti
  selaimen kellonaikaan (L, 60 min sekunnissa), jonka jälkeen se kulkee oikeassa ajassa. Yöllä valoa antavat nuotio ja hatussa oleva otsalamppu
  (noin 10 m keila tähtäimen suuntaan pään korkeudelta; lampun valkoinen piste näkyy hatussa, kun hahmo
  ei katso poispäin). Hahmon ympäriltä ja katsesuuntaan keilan muotoiselta alueelta edessä olevat puut
  häivytetään pehmeästi ditheröiden, mutta vain penkereen, aukean ja lammen kohdalta: metsän pohjaa ei paljasteta.
  Kaisloja ja kiviä ei häivytetä, ja niiden takana seisova hahmo jää niiden taakse.
- **Uni**: teltan ovella voi mennä nukkumaan. Ruutu pimenee ja aika kuluu nopeasti aamuun kello 7.00 asti.
- **Sää**: selkeä, tihkusade, kova sade tai usva. Sää määräytyy pelin kellon mukaan: noin 40 %:na päivistä
  sataa kerran (0,7–4 tuntia), muina päivinä ei lainkaan. Usvaa voi olla vain aamulla 3.30–9.30 ja illalla
  19.30–23.30, ja se on todennäköisempää sateen jälkeen. Sadepisarat jättävät lammen pintaan renkaita.
  Tuulen suunta ja voimakkuus vaihtelevat ja kallistavat sadetta. Sään ja ajan vaihtumisesta ei tule
  ilmoituksia; kellon vieressä on sääkuvake (aurinko tai yöllä kuu, pilvi ja pisarat, usvajuovat),
  sen alla kompassi, jonka nuoli näyttää tuulen suunnan, ja palkit tuulen voimakkuudelle (0–3).
- **Eläimet**: oravat, jänikset ja hiiret liikkuvat metsän laidassa ja tulevat välillä penkereelle.
  Ne pakenevat, jos pelaaja tulee liian lähelle; paikallaan pysyvän pelaajan luo ne uskaltautuvat lähemmäs.
  Sinisorsat uivat lammella ja jättävät vanaveden, pyrähtävät lentoon ja laskeutuvat takaisin.
  Taivaalla lentää lintuja, ja metsästä kuuluu linnunlaulua.
- **Yö**: sorsat nukkuvat rantakaislikossa ja pakenevat säikähtäessään siipiä räpyttäen veden pintaa pitkin.
  Metsän eläimet ja lentävät linnut nukkuvat, joten niitä ei näe (yöllä kuuluu vain huuhkajan huhuilu).
  Yöeläimiä voi lisätä `ANIMAL_KINDS.night`-listaan.

## Lammen syvyys

Lammen pohja on mallinnettu syvyyskartaksi (`depthModel` ja `depthAt` tiedostossa `game.js`):

- rantaterassi: rannasta noin 3 m matkalla loivasti noin 0,8 m syvyyteen, pohjassa hiekkaa ja soraa
- rinne: syvenee pehmeästi noin 4 metriin
- keskipohja: lähes tasainen (noin 4–4,5 m) pienine kumpuiluineen ja liejuisena
- syvänne: epämääräisen muotoinen kuoppa (pääosa noin 8 m syvä ja sen vieressä matalampi lohko),
  jonka reunat ovat jyrkemmät; paikka ja muoto arvotaan

Syvyys on illuusio ilman 3D-mallia: maaston korkeus (`terrainZ`) siirtää kohtaa ruudulla
pystysuunnassa (`Z_PX` = 5 px/m). Pohja piirretään kerran valmiiksi sarake kerrallaan kaukaa
lähelle, jolloin lähemmät rinteet peittävät taaemmat, ja rinteet varjostetaan valon suunnan mukaan.
Pohjaan asetettavat asiat (kivet, viehe, laiturin paalut) käyttävät samaa korkeutta.

Vesi piirretään läpinäkyvänä kerroksena pohjan päälle. Jokaisen kohdan läpi näkyvän pohjan
syvyys tiedetään, ja sameus (`water.turb`, valon vaimeneminen metriä kohden, oletuksena 2,5) ratkaisee, kuinka
paljon pohjaa näkyy: matalikolla pohja näkyy, syvässä ja sameassa vedessä ei. Pintaan heijastuvat
taivas ja rannan puut. Veden piirron voi piilottaa (V), jolloin pohja, kalat ja syötti näkyvät
täysin ja sorsat uivat näkymättömällä pinnalla. Tämä on huijaustila (cheat mode): jokaisesta kalasta piirretään
pystyviiva pintaan ja pohjaan (pinnalla rengas; ahvenet keltaisella, hauet vihreällä, vedessä oleva
vaappu violetilla), ja tähtäimen kohdalta
viiva lammen pohjaan. Vesi piilotettuna tähtäimen vieressä näytetään veden syvyys siinä pinnan kohdassa, johon tähtäin osuu.

## Kalastus

Kohon alla riippuu koukku ja syöttinä mato. Koukun syvyys (0,1–1,5 m) säädetään, kun siima on
kelattu sisään. Vedessä syötti ja koukku riippuvat kohon alla tällä syvyydellä (tai pohjassa).

Kalalajit ovat `SPECIES`-taulussa. Ensimmäinen laji on **ahven**: lampeen arvotaan 24 ahventa,
joiden paino noudattaa lognormaalijakaumaa (mediaani noin 80 g, harvoin yli 300 g, enintään
1,6 kg); pituus lasketaan painosta. Kalat uivat veden alla ja vaihtavat välillä uintisyvyyttä. Ahvenet
uivat vilkkaasti paikasta toiseen. Kalat piirretään kahdeksaan ruudun suuntaan (sivulta, viistosti ja
ylhäältä lyhentyneenä).

Toinen laji on **hauki** (5 kpl, mediaani noin 1,1 kg, enintään 12 kg). Hauki on pitkä ja kapea, ja sillä
on vaaleita täpliä. Kaislikon hauki (noin kaksi kolmesta) vaanii pienellä alueella pitkiä aikoja paikallaan
ja palaa aina kaislikon suojaan. Syvänteen hauki partioi syvännettä koko ajan uiden. Hauki huomaa syötin kauempaa, hiipii lähemmäs ja
iskee viimeiset puolitoista metriä nopealla syöksyllä. Se taistelee ahventa voimakkaammin.

Syötin lähelle osuva ja suunnilleen samalla syvyydellä uiva kala voi kiinnostua syötistä
(melko harvoin). Ahven nielaisee syötin heti. Koukkuun tarttunut kala yrittää pakoon ja kuluttaa
energiaansa (palkki hahmon yläpuolella); se voi vetää kohon veden alle, mikä vie enemmän voimia,
ja se voi viedä siimaa vain ulkona olevan määrän verran. Väsynyt kala ui hetken rauhassa ja jatkaa
taistelua, kun yli puolet voimista on palautunut. Ahvenella on nelinkertaiset voimat ja kaksinkertainen
palautuminen. Hauella on kolminkertaiset voimat ja nelinkertainen palautuminen. Pelaajan lähelle kelattu kala nousee
roikkumaan ongen kärkeen ja kerätään talteen (saalis näkyy vasemmassa yläkulmassa). Kuivalle
maalle vedetty kala sätkii satunnaisiin suuntiin, ja jos se pääsee veteen, se jatkaa uintia. Kuivalla
maalla yli minuutin (1x nopeudella; nopeammalla ajalla vastaavasti lyhyemmän) ollut kala lakkaa liikkumasta. Kuivalla maalla olevan kalan
voi kerätä talteen kävelemällä sen päälle (myös siiman katkaisun jälkeen maalle jääneen).

### Vieheet

Vieheen voi vaihtaa (Q), kun siima on kelattu sisään.

- **Koho ja mato**: koukku riippuu kohon alla säädetyllä syvyydellä. Kohon kärjessä on neonvihreä valopiste, joka hehkuu
  pimeällä; kun kala vetää kohon pinnan alle, valo himmenee.
- **Vaappu**: pieni (noin 3 px) harmaansininen viehe. Se kelluu ja pyrkii koko ajan nousemaan pintaa
  kohti (12 cm/s). Kelattaessa se sukeltaa sitä nopeammin, mitä kovempaa kelataan (40 cm sukellusta
  kuljettua metriä kohden), ja painuu kelauksen jatkuessa yhä syvemmälle, lopulta pohjaa pitkin.
  Noin 30 cm/s nopeudella sukellus ja nousu ovat tasapainossa, jolloin vaappu ui samalla syvyydellä;
  hitaammin kelattuna se nousee ja nopeammin kelattuna se sukeltaa. Vedettäessä vaappu heiluttaa pyrstöään (wiggle). Kelausnopeus 10–100 cm/s
  säädetään hiiren rullalla. Vaappua kelattaessa siima kulkee ongen kärjestä lähes suorana (pieni notko)
  vaappuun asti myös veden alla, toisin kuin koho-onginnassa. Vedessä olevan vaapun syvyys (cm) näkyy vasemmassa
  yläkulmassa, ja vesi piilotettuna myös matka pohjaan. Jos viehe on pohjassa (vaappu pohjaa pitkin tai koho-ongen
  syötti pohjassa) tai kuivalla maalla, syvyysrivin perään tulee teksti ON BOTTOM tai ON LAND. Liikkumaton vaappu kiinnostaa kaloja vain vähän, ja liikkuvaa vaappua kala
  jahtaa nopeasti.

Kala ui syötin luo niin, että sen suu osuu syöttiin, ja siima kulkee kalan suuhun.

Lajit pitävät eri vieheistä: ahven pitää madosta (vaappu noin 0,3-kertaisesti), hauki iskee
mieluummin vaappuun (1,6-kertaisesti) kuin matoon (0,35-kertaisesti). Tähtäin on valitun vieheen
näköinen; kun viehe on vedessä, tähtäimenä on kela, jonka kampi pyörii.

Kala voi päästä irti koukusta. Irtoaminen on satunnaista, ja sen todennäköisyys kasvaa kalan
voimien ja siiman kireyden mukaan: kelaaminen tai siiman vetäminen kävelemällä lisää sitä.
Kun kala vetää kireää siimaa, kela ritisee (kelan lukon luistoa ei vielä ole). Siiman voi
katkaista (C): koukussa ollut kala ui lopun siiman ja kohon kanssa hetken ja katoaa sitten,
ja ongen kärkeen tulee uusi koho ja koukku. Saaliiksi saadun tai siiman mukana kadonneen kalan
tilalle syntyy lampeen heti uusi, satunnainen kala.

## Pelaaminen

Avaa `index.html` selaimessa. Puhelimella peli pitää avata http(s)-osoitteesta,
esim. GitHub Pagesista (*Settings → Pages → Deploy from a branch*, haara `main`, kansio `/`).

## Tiedostot

- `index.html`, `style.css`
- `game.js` – peli (grafiikka piirretään koodissa, äänet syntetisoidaan Web Audiolla)
- `touch.js` – kosketusohjaimet puhelimille
- `img/watch.png` – rannekellon taulu
- `fonts/` – Press Start 2P -fontti ja sen lisenssi (`OFL.txt`)

Lisenssi: ks. [`LICENSE`](LICENSE) ja [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
