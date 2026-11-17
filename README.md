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
| hiiren nappi pohjassa | CAST / REEL IN (pidä pohjassa) | onki kädessä: heiton lataus (heitto lähtee napin vapautuessa) tai siiman kelaus |
| R | TAKE ROD / STOW ROD | onki käteen / takaisin repun kylkeen |
| F | LAMP | otsalamppu päälle / pois |
| E (teltan ovella) | SLEEP (tee-painike) | nukkumaan aamuun kello 7.00 asti; mikä tahansa näppäin herättää |
| E (nuotion vieressä) | ADD WOOD (tee-painike) | lisää nuotioon klapi repusta (kun nuotio ei ole täynnä ja reppu ei ole tyhjä) |
| E (katoksen edessä) | TAKE WOOD (tee-painike) | ota katoksesta klapi reppuun (katoksen kuva päivittyy) |
| Y (katoksen edessä) | STORE WOOD (tee-painike) | vie repun klapi takaisin katokseen (katokseen mahtuu 20) |
| X | AXE / STOW AXE | kirves oikeaan käteen / pois (onki menee samalla repun kylkeen; ei voi ottaa, jos viehe on heitetty) |
| K | KNIFE / STOW KNIFE | puukko oikeaan käteen / pois (puukolla ei voi vielä tehdä mitään) |
| N (metsän laidassa, kirves kädessä) | MAKE WOOD (tee-painike) | aloita polttopuun teko: hahmo kääntyy metsään päin |
| välilyönti tai hiiren vasen nappi | CHOP | iske kirveellä (hakkuu käynnissä; enintään kerran sekunnissa, 5 iskua = 1 klapi) |
| Z (nuotion vieressä) | LIGHT FIRE (tee-painike) | sytytä sammunut nuotio (kun siinä on puita) |
| hiiren oikea nappi pohjassa | RELEASE LINE (pidä pohjassa) | vapauta siimaa kelalta (enintään 30 m ulkona) |
| Q | LURE | vaihda viehe: koho ja mato / vaappu / lippa / pohjaonki ja mato / pohjaonki ja boilie (vain kun siima on kelattu sisään) |
| hiiren rulla tai - / + | − / + | koholla koukun syvyys 0,1–1,5 m ja pohjaongella syötin etäisyys puntista 20–120 cm (vain kun siima on kelattu sisään); uistimilla kelausnopeus 10–100 cm/s |
| T / Shift+T | – | ajan nopeus 1x–10x todelliseen aikaan verrattuna (nopeampi / hitaampi) |
| L | – | kelaa kello nopeasti (60 min/s) selaimen paikalliseen kellonaikaan; perillä nopeus palaa 1x:ään |
| V | – | huijaustila (cheat mode) päälle / pois: vesi piilotetaan, kalat ja pohja näkyvät, debug-viivat |
| [ ja ] | – | veden sameus pienemmäksi / suuremmaksi (vain huijaustilassa) |
| B | – | syvyyskäyrät (1 m välein) päälle / pois (vain huijaustilassa) |
| C | CUT | katkaise siima (kun siima on ulkona) |
| H | – | kalan voimapalkki näkyviin / piiloon (vain huijaustilassa) |
| G | – | grafiikka kevyeksi / normaaliksi käsin (hitaalla laitteella peli siirtyy kevyeen tilaan itsekseen, ks. alla) |
| O | napautus FPS-lukemaan | ajoitusnäkymä päälle / pois: piirto-osien ruudun aika millisekunteina |
| P | II | tauko |
| M | ♪ | äänet päälle / pois |
| – | ⛶ | koko näyttö (vain kosketusnäytöllä) |

**Kosketusohjaus:** liiketikku syntyy siihen, mihin sormi painetaan. Oikean reunan napit vaihtuvat tilan mukaan, ja otsalampun
nappi (LAMP) on vasemmassa alakulmassa kaikissa tiloissa; tauko, ääni ja koko näyttö ovat ylälaidassa.
- *Ei onkea eikä työkalua kädessä:* TAKE ROD, AXE ja KNIFE sekä enintään kolme tee-painiketta, jotka näkyvät vain kun jotain voi
  tehdä ja vaihtuvat tilanteen mukaan (SLEEP teltalla, ADD WOOD ja LIGHT FIRE nuotiolla, TAKE WOOD ja STORE WOOD katoksella,
  MAKE WOOD metsän laidassa kirves kädessä, BOAT veneen luona, GO ASHORE veneestä rantaan).
- *Työkalu kädessä:* STOW AXE / STOW KNIFE, tee-painikkeet sekä hakatessa CHOP (isku).
- *Onki kädessä, ei heitetty:* CAST (pidä pohjassa, heitto lähtee irrotettaessa), LURE (vieheen vaihto), − / + (koho: koukun
  syvyys HOOK, pohjaonki: syötin etäisyys BAIT, uistin: kelausnopeus SPEED; pidä pohjassa toistaaksesi) ja STOW ROD.
- *Heitetty:* REEL IN (pidä pohjassa), RELEASE LINE (pidä pohjassa), CUT sekä uistimilla kelausnopeuden − / +.

Oikeassa yläkulmassa näkyy jatkuvasti ruudunpäivitysnopeus ja yhden ruudun laskenta-aika (esim. `60 FPS  4.2 MS`; päivitykset ja
piirtokomennot, keskiarvo puolen sekunnin ajalta).

Tähtäin vaihtuu sen mukaan, mitä hahmolla on kädessä: ilman esinettä se on risti, ongen kanssa
siimassa olevan vieheen muotoinen (nyt keinuva koho, jonka alla oleva rengas sinertää veden päällä).
Kun koho kelluu vedessä, tähtäimenä on ongen kela, jonka kampi pyörii kelattaessa ja välillä
satunnaisesti muulloinkin.

**Koho-ongen heitto** (hiirellä): tähtäin osoittaa paikan vedenpinnalla, johon koho laskeutuu. Kun nappia
pidetään pohjassa, tähtäimen ympärillä oleva keltainen tarkkuuskehä pienenee suurimmasta koostaan (halkaisija
5 m) pisteeksi 0,5 sekunnissa ja kasvaa taas, vuorotellen. Napin vapautuessa koho laskeutuu kehän kokoiselle ympyrälle
tähtäimen ympärille: pienimmällä kehällä täsmälleen tähtäimen kohdalle, epätarkimmillaan 2,5 m ohi. Tähtäimen vieressä näkyy etäisyys metreinä.
Heiton enimmäispituus on 15 m: kauempana tähtäimen päällä on kieltomerkki ja teksti TOO FAR, ja napin
vapauttaminen peruu heiton.

**Muiden vieheiden heitto** (ja kosketusohjaus): kun nappia pidetään pohjassa, hahmon alle tulee voimapalkki.
Voima nousee täyteen, laskee nollaan ja nousee taas. Heitto (2,5–16 m) lähtee tähtäimen suuntaan napin
vapautuessa. Veteen osuva
koho jättää renkaan ja jää kellumaan. Jos pelaaja loittonee, siima kiristyy ja vetää kohoa perässään;
lähestyessä siima jää löysälle kasalle. Nappi pohjassa siima kelataan sisään (kelattava koho jättää
vanaveden), ja koko heitetty siima pitää kelata ennen kuin onkea voi laittaa selkään tai heittää uudelleen.

Hahmolla on kuvat kahdeksaan suuntaan (viisi piirrettyä suuntaa ja niiden peilikuvat). Onki ei peilaudu
mukana: selässä se on kaikissa suunnissa repun oikeassa reunassa (hahmon oma oikea puoli; länteen päin katsottaessa se
jää repun ja hahmon taakse) ja kädessä aina oikeassa kädessä (`ROD_BACK`, `HAND`). Kun onki on kädessä, kuvan
roikkuvat kädet poistetaan (`HELD_ARMS`) ja molemmat kädet piirretään koukistettuina (`drawArms`): oikea käsi pitää
ongen kahvasta hieman hahmon edessä (ei suorana alaspäin) ja vasen käsi pitää kelasta. Käsivarret ovat kaksiosaisia
(olkapää → kyynärpää → käsi, `SHOULDER_R` / `SHOULDER_L`), ja kameran puolelta katsottaessa kauempi käsi piirretään ongen
taakse (`ARM_DEPTH`), jolloin esim. itään katsottaessa vasen käsi ei näy ongen läpi. Kelatessa (hiiri pohjassa, viehe
vedessä) vasen käsi kiertää kampea samaa vauhtia kuin tähtäimen kela. Kampi pyörii pystytasossa ongen suuntaan: oikealle
katsoessa kierto on myötäpäivään, vasemmalle katsoessa vastapäivään ja kameraa kohti (tai siitä poispäin) katsoessa taso
on sivuttain, jolloin käsi liikkuu vain ylös ja alas (viistosti katsoessa liike on litistynyt ellipsi). Kameraa kohti katsoessa
kelaava kämmen on siirretty hahmon vasemmalle puolelle (ruudulla oikealle, `REEL_HAND_OFF`) oikean käden viereen, jotta kämmenet eivät ole päällekkäin; oikea käsi piirretään aina vasemman
käden päälle. Poispäin katsottaessa (NE, N, NW) kädet ovat
hahmon edessä, joten kämmeniä ei näy: sivuilla näkyy vain olkavarsi kiinni kehon kyljessä, ja kyynärtaipeessa käsi kääntyy sisään vatsan taakse piiloon
(kelatessa vasen kyynärpää liikkuu hieman).
Pohjakuvissa ei ole ihonvärisiä käsipikseleitä, koska roikkuvat kädet poistetaan (SE ja SW:ssä myös repun takaa pilkistävä käsi).

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
  huojuvat tuulessa rauhallisesti, kukin puu omassa tahdissaan. Metsän reunassa (2 ruutua) puu on
  jokaisessa ruudussa (`FOREST_FULL_DEPTH`), sen takana (3–7 ruutua) vain joka kolmannessa ja yli 7 ruudun syvyydessä vain joka
  neljännessä (`FOREST_SPARSE_DEPTH`), mikä keventää piirtoa.
  Reuna mitataan ruutuina lähimmästä metsättömästä ruudusta (penger, aukea, vesi), ei pelkästä lammesta. Auringon varjot
  piirretään vain reunan puille, koska syvässä metsässä niitä ei näe. Rantavedessä kasvavassa
  kaislikossa on järviruokoa,
  osmankäämiä ja saraa, jotka taipuvat tuulessa sulavasti. Kaislikon väleissä on avoimia
  rantakohtia, joista pääsee kalastamaan vapaasti. Matalassa rantavedessä kelluu lumpeita ja ulpukoita.
  Lumpeiden varret ja kaislojen vedenalaiset varret ulottuvat lammen pohjaan asti; kaislikko huojuu rauhallisesti.
- **Nuotio**: nuotioon lisätään klapeja yksi kerrallaan (E), enintään 5; uuden klapin voi lisätä vain, kun
  puuta on enintään 4,5 (täyteen nuotioon lisääminen ei tee mitään); klapi kuluu repun polttopuista
  (ks. Työkalut ja polttopuut). Täysi nuotio palaa loppuun tunnissa pelin aikaa ja sen liekit ovat tavallista 20 %
  korkeammat; liekit, valo, savu ja kipinät pienenevät puiden kuluessa. Kun puut loppuvat, jää punaisena hehkuva
  hiillos, joka sammuu 30 minuutissa; sen jälkeen nuotio on täysin pimeä. Hiillokseen lisätty klapi syttyy
  itsestään ja nostaa kipinöitä, mutta sammunut nuotio pitää sytyttää erikseen (Z). Klapin lisäämisen jälkeen
  nuotion yläpuolella näkyy hetken puumäärän palkki (0–5).
- **Aukea** lammen vasemmalla rannalla: teltta, palava nuotio (savu kulkee tuulen mukana; välillä ritisten
  nousevat hehkuvat kipinät leijailevat savun mukana ja hohtavat pimeällä) ja
  noin 8 m pitkä laituri, jolle voi kävellä. Aukean takareunassa lähes teltan takana (hieman oikealla) on vanha polttopuukatos,
  jonka avoin puoli osoittaa oikealle eteen (säässä haalistunut, halkeillut lautapuu, tolpat suoraan maassa,
  ruosteinen ja sammaloitunut peltikatto). Katokseen mahtuu
  20 klapia (4 riviä x 5), jotka piirretään kukin erikseen: avoimella puolella näkyy päätyleikkaus ja sen takana klapin runko (kaarnapintainen, vaaleampi yläreuna), joten katoksen kuva muuttuu klapien määrän
  mukaan; aluksi klapeja on 10 (`SHED.logs`). Laiturin paalujen vedenpäällinen osa näkyy reunapalkin alla, ja veden alla
  oleva osa häipyy syvyyden ja sameuden mukaan.
- **Moottorivene**: laiturin katsojan puoleisessa kyljessä on kiinni pieni vaalea vene (keula oikealle),
  jonka perässä on perämoottori. Veneestä on valmiit kuvat 16 suuntaan, sen vedenpäällinen osa heijastuu
  vedestä ja veden alle jäävä pohja ja moottorin vetolaite häipyvät syvyyden mukaan. Valmiina ovat myös
  kuvat kyydissä olevasta hahmosta: kuljettaja istuu perässä kasvot menosuuntaan ja ohjaa perämoottoria
  oikealla kädellä (onki on laskettu veneen pohjalle kärki keulan yli), ja pysäytetyssä veneessä hahmo voi seistä kalastamassa (`boat.rider`). Veneellä ei
  voi vielä ajaa.
- **Heijastus**: pelaajan hahmo, vene ja sorsat heijastuvat vedenpinnasta (matalalla lentävän sorsan heijastus
  himmenee korkeuden mukaan); tähtiä ei näy heijastusten kohdalla.
- **Aurinko ja valo**: aurinko nousee koillisesta, on keskipäivällä etelässä ja laskee luoteeseen, ja puiden,
  hahmon ja eläinten varjot kääntyvät ja pitenevät sen mukaan (varjojen suunta päivitetään kerran tunnissa
  pelin kellon mukaan ja vaihdetaan pehmeästi). Aamurusko, kultainen aamu, kultainen hetki ja auringonlasku
  sävyttävät maiseman kultaiseksi ja oranssiksi; vedenpinnalla sävytys on miedompi ja vesi heijastaa
  värikästä taivasta voimakkaammin.
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
  19.30–23.30, ja se on todennäköisempää sateen jälkeen. Usvan aikana lammen pinnalla leijuu ohut usvakerros ja
  tuulen mukana ajelehtivia usvalauttoja; muualla usva on kevyempää. Sadepisarat jättävät lammen pintaan renkaita.
  Tuulen suunta ja voimakkuus vaihtelevat ja kallistavat sadetta. Sään ja ajan vaihtumisesta ei tule
  ilmoituksia; kellon vieressä on sääkuvake (aurinko tai yöllä kuu, pilvi ja pisarat, usvajuovat),
  sen alla kompassi, jonka nuoli näyttää tuulen suunnan, ja palkit tuulen voimakkuudelle (0–3).
- **Norppa** (saimaannorppa): lepää pelin alussa laiturin nokassa naama oikealle. Jos pelaaja tulee lähelle, se hypähtelee
  makuultaan laiturin nokkaan ja sukeltaa veteen pää edellä (taipuu ensin laiturin reunalla, putoaa pää alaspäin ja painuu pinnan alle); vedessä kuuluu läsähdys, roiskuu pisaroita ja lammelle leviää pyöreitä
  aaltoja. Se voi lähteä uimaan myös ilman, että pelaaja menee sen lähelle (keskimäärin parin minuutin välein), ja se hypähtelee
  välillä pienen matkan laiturilla. Vedessä norppa uiskentelee veden alla (näkyy tummana hahmona; huijaustilassa tarkemmin) ja
  tulee välillä pinnalle hengittämään, jolloin vain sen pää näkyy veden päällä; liian lähelle tuleva pelaaja saa sen sukeltamaan
  takaisin. Kun pelaaja ei ole lähellä laiturin nokkaa, norppa voi hypähtää takaisin laiturin nokkaan lepäämään, mutta se ei koskaan
  nouse maalle (`seal`, `updateSeal`).
- **Eläimet**: oravat, jänikset ja hiiret liikkuvat metsän laidassa ja tulevat välillä penkereelle.
  Niitä on liikkeellä kerrallaan enintään kaksi, ja uusia tulee harvakseltaan.
  Ne pakenevat, jos pelaaja tulee liian lähelle; paikallaan pysyvän pelaajan luo ne uskaltautuvat lähemmäs.
  Sinisorsat uivat lammella ja jättävät vanaveden, pyrähtävät lentoon ja laskeutuvat takaisin. Niiden kvaakuminen on mallinnettu ääninäytteen mukaan (~240 Hz:n karhea ääni, jonka energia on alueella 1,3-2,5 kHz, terävä alku ja hiipuva häntä ilman surinaa, 2-4 kvaakin sarja noin 0,29 s välein).
  Laskeutumisesta ja lentoonlähdöstä kuuluu pehmeä veden kohahdus ja pisaroiden ropina.
  Taivaalla lentää lintuja, ja metsästä kuuluu linnunlaulua (käen kuukkuu on mallinnettu oikean käen kutsun mukaan: kaksi puhdasta sävelkorkeutta, metsän kaiku; käki kukkuu aamulla ja illalla vain yksi kerrallaan, harvoin ja muita lintuja hiljaisemmin).
  **Silkkiuikut**: lammella uiskentelee pari silkkiuikkuja (sorsan kokoisia, pitkä valkoinen kaula, tupsupää ja ruskea
  kaulus). Ne pysyvät lähekkäin, sukeltavat välillä (pää edellä: pää taipuu nokka alas, painuu veden alle peräpää kohoten ja uikku uppoaa) ja nousevat pinnalle kauempana (pää ilmestyy ensin, kaula ja vartalo kohoavat perässä aaltorenkaiden ja pisaroiden kera) ja huutelevat käheää "rak-rak-rak"-kutsua
  (äänimalli pohjautuu ääninäytteeseen, ääni syntetisoidaan Web Audiolla). Kun pelaaja tulee kävellen tai veneellä (veneen
  pitää liikkua) liian lähelle, uikut juoksevat siivet räpyttäen veden pintaa pitkin lentoon, lentävät noin 10 sekunnin
  kaaren ja laskeutuvat johonkin muuhun kohtaan lampea; ne eivät poistu pelistä. Yöllä uikut säikähtäessään vain sukeltavat
  (`grebes`, `updateGrebes`, `drawGrebe`).
- **Yö**: sorsat nukkuvat rantakaislikossa ja pakenevat säikähtäessään siipiä räpyttäen veden pintaa pitkin.
  Metsän eläimet ja lentävät linnut nukkuvat, joten niitä ei näe (yöllä kuuluu vain huuhkajan huhuilu).
  Yöeläimiä voi lisätä `ANIMAL_KINDS.night`-listaan.

## Työkalut ja polttopuut

- **Reppu ja polttopuut**: pelaajalla on polttopuuinventaario (`player.wood`, näkyy vasemmalla ylhäällä rivillä `WOOD n`); reppuun mahtuu enintään 5 klapia (`MAX_WOOD`): kun reppu on täynnä, katoksesta ei voi ottaa lisää eikä MAKE WOOD näy, ja viidennen klapin valmistuminen päättää hakkuun. Klapeja
  otetaan polttopuukatoksesta (E katoksen avoimen puolen edessä), viedään takaisin katokseen (Y; katokseen mahtuu 20) ja lisätään
  nuotioon (E nuotion vieressä), jolloin klapi poistuu repusta. Katoksen kuva näyttää aina tarkan klapimäärän.
- **Työkalut**: kirves (X) ja puukko (K) otetaan oikeaan käteen; onki menee silloin aina repun kylkeen eikä työkalua voi ottaa,
  jos viehe on heitetty. Ongen ottaminen (R) laittaa työkalun pois, ja kädessä olevan työkalun voi laittaa takaisin reppuun
  milloin tahansa (silloin kädet ovat tyhjät). Kirves roikkuu repun vasemmassa reunassa (ongen vastakkaisella puolella), kun se ei
  ole kädessä; puukkoa ei piirretä muulloin kuin kädessä. Kirves on metsästyskirves (lämpimän ruskea, hieman kaareva kahva ja
  leveä harmaa teräspää kirkkaalla terällä) ja puukko lyhytteräinen ja puukahvainen. Työkalua pidetään oikeassa kädessä, ja iskun
  aikana oikea käsi heiluu kyynärtaipeesta: olkapää pysyy paikallaan, kyynärvarsi kääntyy kyynärpäästä (nosto taakse, isku, palautus)
  ja työkalu jatkaa kyynärvarren suuntaa. Kun oikea puoli on vartalon takana (länteen ja lounaaseen katsottaessa), käsi ja työkalu piirretään vartalon taakse, jolloin vartalo peittää ne iskun aikana osittain; kirveen varsi näkyy kädestä 8 px. Vasen käsi roikkuu rentona sivulla. Puukkoa voi heilauttaa samalla tavalla (välilyönti,
  hiiren vasen nappi tai SLASH-nappi), mutta liike on pienempi ja siitä kuuluu vain hiljainen suhahdus; puukolla ei voi vielä
  tehdä mitään.
- **Polttopuiden teko**: kirves kädessä metsän laidassa (lähin metsäruutu enintään noin 1,9 m päässä) valitaan MAKE WOOD (N).
  Hahmo kääntyy metsään päin, ja hänen päällään näkyy viisiosainen edistymispalkki. Kirveellä iskeä saa välilyönnillä, hiiren
  vasemmalla napilla tai CHOP-napilla enintään kerran sekunnissa. Isku on animoitu (nosto taakse, isku ja palautus; osuma
  iskun puolivälin jälkeen, ja siitä kuuluu puun hakkaamisen ääni ja lentää lastuja; heilautuksesta kuuluu pieni hiljainen
  suhahdus). Viisi iskua täyttää palkin ja repun lisätään yksi polttopuu, minkä jälkeen palkki alkaa alusta. Iskun aikana hahmoa
  ei voi liikuttaa; kävely (iskujen välillä) keskeyttää hakkuun ja palkki nollautuu. Koodissa `startChop`, `updateChop`,
  `toolAngle`, `drawHeldTool`, `drawBackAxe`, `contextActions`.

## Pieniä yksityiskohtia

- Pelaaja kävelee 0,0525 ruutua päivityksessä (3,15 m/s); kävelyanimaatio ja askeläänet on mitoitettu sen mukaan.
- Kelauksen lopussa kaikki vieheet (koho, vaappu, lippa) nousevat siimaa pitkin ongen kärkeen ja jäävät roikkumaan siitä,
  kuten pohjaongella; siima lähtee aina ongen kärjestä, ei hahmon jaloista.
- Sorsat ja silkkiuikut roiskivat, synnyttävät aallon ja äännähtävät samalla hetkellä, kun ne osuvat veteen.

## Suorituskyky

Oikeassa yläkulmassa näkyy FPS ja yhden ruudun laskenta-aika (päivitykset ja piirtokomennot). Jos ruudun aika on kolmesti
(1,5 s) peräkkäin yli 22 ms (tai fps alle 40 ja aika yli 12 ms, tai fps alle 50 ja aika yli 7 ms), peli siirtyy automaattisesti **kevyeen tilaan** (teksti LOW):
sävykerros ja yön valokerros päivittyvät liikkuessa harvemmin; vesi päivitetään joka 4. ruudussa (normaalisti joka 2.), yön valokerros ja tähtimaski joka 8. (normaalisti joka 4.),
heijastukset joka toisessa ruudussa eikä lammen päällä leijuvaa usvakerrosta piirretä. G-näppäin vaihtaa tilaa käsin (silloin
automatiikka ei enää vaihda sitä). Ajoitusnäkymä (O tai FPS-lukeman napautus) listaa suurimmat piirto-osat ja niiden ruudun ajan
ms (keskiarvo 30 ruudusta, sisäkkäiset kutsut mukana), jolla löytyy hitaan laitteen pullonkaula. Piirtoa on kevennetty muuten
näin: vesikuva käytetään uudelleen, kun kamera ei liiku; pelaajan näkymäaukko ja etukerros lasketaan vain tarvittaessa; yön
valokerros ja tähtimaski päivittyvät harvemmin paikallaan; HUD-tekstit piirretään valmiista kuvista.

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
energiaansa (voimapalkki veden pinnalla kalan kohdalla); se voi vetää kohon veden alle, mikä vie enemmän
voimia, ja se voi viedä siimaa vain ulkona olevan määrän verran. Kala taistelee ainakin, kunnes alle
puolet voimista on jäljellä; sen jälkeen se voi lopettaa satunnaisella hetkellä, viimeistään kun voimat
loppuvat. Väsynyt kala ui rauhassa ja aloittaa taistelun uudelleen satunnaisesti, kun voimista on
palautunut vähintään puolet (joskus vasta täysin palauduttuaan). Ahvenella on nelinkertaiset voimat ja kaksinkertainen
palautuminen. Hauella on kolminkertaiset voimat ja nelinkertainen palautuminen. Pelaajan lähelle kelattu kala nousee
roikkumaan ongen kärkeen ja kerätään talteen (saalis näkyy vasemmassa yläkulmassa). Kuivalle
maalle vedetty kala sätkii satunnaisiin suuntiin, ja jos se pääsee veteen, se jatkaa uintia. Kuivalla
maalla yli minuutin (1x nopeudella; nopeammalla ajalla vastaavasti lyhyemmän) ollut kala lakkaa liikkumasta. Kuivalla maalla olevan kalan
voi kerätä talteen kävelemällä sen päälle (myös siiman katkaisun jälkeen maalle jääneen).

### Vieheet

Vieheen voi vaihtaa (Q: koho ja mato → vaappu → lippa → pohjaonki ja mato → pohjaonki ja boilie), kun siima on kelattu sisään.

- **Koho ja mato**: koukku riippuu kohon alla säädetyllä syvyydellä. Kohon kärjessä on neonvihreä valopiste, joka hehkuu
  pimeällä; kun kala vetää kohon pinnan alle, valo himmenee.
- **Vaappu**: pieni (noin 3 px) harmaansininen viehe. Se kelluu ja pyrkii koko ajan nousemaan pintaa
  kohti (15,6 cm/s). Kelattaessa se sukeltaa sitä nopeammin, mitä kovempaa kelataan (52 cm sukellusta
  kuljettua metriä kohden), ja painuu kelauksen jatkuessa yhä syvemmälle, lopulta pohjaa pitkin.
  Noin 30 cm/s nopeudella sukellus ja nousu ovat tasapainossa, jolloin vaappu ui samalla syvyydellä;
  hitaammin kelattuna se nousee ja nopeammin kelattuna se sukeltaa. Vedettäessä vaappu heiluttaa pyrstöään (wiggle). Kelausnopeus 10–100 cm/s
  säädetään hiiren rullalla. Vaappua kelattaessa siima kulkee ongen kärjestä lähes suorana (pieni notko)
  vaappuun asti myös veden alla, toisin kuin koho-onginnassa. Vedessä olevan vaapun syvyys (cm) näkyy vasemmassa
  yläkulmassa, ja vesi piilotettuna myös matka pohjaan. Jos viehe on pohjassa (vaappu pohjaa pitkin tai koho-ongen
  syötti pohjassa) tai kuivalla maalla, syvyysrivin perään tulee teksti ON BOTTOM tai ON LAND. Liikkumaton vaappu kiinnostaa kaloja vain vähän, ja liikkuvaa vaappua kala
  jahtaa nopeasti.

Kala ui syötin luo niin, että sen suu osuu syöttiin, ja siima kulkee kalan suuhun.

- **Lippa**: pieni vihreä-oranssi lippa, joka kiepsahtelee ja välkkyy vedettäessä. Se uppoaa (30 cm/s) ja
  painuu pohjaan, jos sitä ei kelata. Kelattaessa kireä siima vetää sitä ongen kärkeä kohti, jolloin lippa
  nousee siiman kulman mukaan; vedossa (noin 0,5 m/s) se ei enää uppoa. Kelaamisen loputtua lippa painuu
  pohjaan ja jää paikalleen. Kelausnopeus säädetään kuten vaapulla. Tähtäimenä on metallinharmaa lippa.

- **Pohjaonki** (bottom rig; kaksi syöttiä Q:lla: mato ja boilie): siiman päässä on puntti, ja siitä säädettävän matkan
  (20–120 cm, hiiren rulla) päässä siimaa ylöspäin on 10 cm pitkä sivuhaara, jonka päässä on koukku ja syötti. Mato näyttää
  samalta kuin koho-ongessa; boilie on ruskea noin 3 cm:n syöttipallo (kuvassa suurennettu kahteen pikseliin).
  Mato ja boilie eivät kellu, joten ne roikkuvat sivuhaaran mukana alaspäin kohti pohjaa. Sivuhaara on mallinnettu
  pääsiimasta erillään (oma siimaketju), joten onkea heiluteltaessa haara ja syötti heiluvat vapaasti. Pohjaonki heitetään
  kauemmas kuin muut vieheet (enintään 24 m, lippa 16 m).
  Siima roikkuu ongen kärjestä suoraan alas: siiman vaakaetäisyydet mitataan ongen kärjen kohdalta maan pinnalta (hahmon
  edestä), ei hahmon jalkojen kohdalta, joten aivan hahmon eteen päästetty puntti roikkuu kärjen alla.
  Puntti painuu pohjaan melko nopeasti (1 m/s). Siiman pituus otetaan huomioon: siima kulkee ongen kärjestä (3 m
  vedenpinnan yläpuolella) puntille, ja jos siimaa ei ole riittävästi, puntti ei painu suoraan alas vaan kaartuu kireän
  siiman varassa kohti vapaa; siimaa voi päästää kelalta oikealla hiirennapilla. Kelattaessa (1,2 m/s) puntti
  kulkee pohjaa pitkin kohti ongen kärkeä ja painuu taas pohjaan, kun kelaus loppuu. Kun puntti on pohjassa, siima pitää kelata
  kireälle (löysää alle 0,5 m), jotta sivuhaara nousee pois pohjasta: löysä siima makaa pohjalla ja syötti sen mukana, ja
  pohjassa makaava syötti kiinnostaa kaloja vain vähän (HUD varoittaa: BAIT ON BOTTOM - REEL IN TO TIGHTEN). Siima on kireällä
  kulmassa, joten pitkä sivuhaara (120 cm) nostaa syötin pohjasta enemmän kuin lyhyt. Tiedoissa näytetään puntin syvyys
  (SINKER). Pohjaonki nousee vedestä vasta, kun puntti on kelattu pintaan aivan pelaajan lähelle (alle 1,5 m); puntin voi siis
  päästää pohjaan myös aivan pelaajan edestä, eikä sitä nosteta ylös ilman kelausta. Kun kala nappaa pohjaonkeen, vavan päässä
  oleva pieni kilikello soi (ja heiluu). Ahven pitää madosta (0,75-kertaisesti) mutta boilie ei kelpaa sille juuri (0,12-kertaisesti);
  hauki ei välitä pohjaongesta (0,2 ja 0,04).

Vain liikkuva uistin (vaappu tai lippa) kiinnostaa kaloja.

Lajit pitävät eri vieheistä: ahven pitää madosta (vaappu noin 0,3-kertaisesti), hauki iskee
mieluummin vaappuun (1,6-kertaisesti) ja lippaan (1,3-kertaisesti) kuin matoon (0,35-kertaisesti); ahvenelle
lippa kelpaa 0,7-kertaisesti. Tähtäin on valitun vieheen
näköinen; kun viehe on vedessä, tähtäimenä on kela, jonka kampi pyörii.

Hahmon yläpuolella on siiman kestopalkki. Jos kalaa kelataan tai vedetään (kävellen tai veneellä)
samaan aikaan kun se taistelee vastaan, siiman rasitus kasvaa sitä nopeammin, mitä painavampi, voimakkaampi
ja vetävämpi laji kala on (hauki vetää ahventa enemmän). Kun palkki täyttyy, siima katkeaa samoin kuin
katkaistessa. Kun kala ei taistele tai vetoa ei ole, rasitus laskee: väsynyttä kalaa voi kelata turvallisesti.
Voimakas kala (painava, vetävä laji, paljon voimia jäljellä) rasittaa kireää siimaa myös ilman kelausta.
Silloin siimaa pitää päästää kelalta hiiren oikealla napilla, mikä keventää kuormaa. Kun kaikki 30 m siimaa
on ulkona, siimaa ei voi enää päästää, ja rasitus kasvaa, kunnes siima katkeaa.
Kun kala vetää kireää siimaa, kela ritisee (kelan lukon luistoa ei vielä ole). Siiman voi
katkaista (C): koukussa ollut kala ui lopun siiman ja kohon kanssa hetken ja katoaa sitten,
ja ongen kärkeen tulee uusi koho ja koukku. Saaliiksi saadun tai siiman mukana kadonneen kalan
tilalle syntyy lampeen heti uusi, satunnainen kala.

## Pelaaminen

Avaa `index.html` selaimessa. Puhelimella peli pitää avata http(s)-osoitteesta,
esim. GitHub Pagesista (*Settings → Pages → Deploy from a branch*, haara `main`, kansio `/`).

## Kehityksen jatkaminen (myös toisella Claude-tilillä)

Kehittäjän ohjeet ovat tiedostossa [`CLAUDE.md`](CLAUDE.md): työtapa, haarat, commit-käytännöt,
koodin rakenne, testaus ja tunnetut sudenkuopat. Claude Code lukee sen automaattisesti.

Uudella tilillä:
1. Yhdistä GitHub-tili osoitteessa https://claude.ai/connect-github ja varmista, että Claude GitHub App
   on asennettu repoon `DeTremolo/CozyFishing` (samalta sivulta).
2. Aloita uusi Claude Code -istunto (claude.ai/code) ja valitse repoksi `DeTremolo/CozyFishing`.
   Repo valitaan istunnon alussa.
3. Pyydä ensin esim.: *"Lue CLAUDE.md ja README.md, siirry main-haaraan ja aja savutesti."*
   Sen jälkeen jatka pyynnöillä kuten ennenkin.

Paikallisesti: `python3 -m http.server` repon juuressa ja selaimella http://localhost:8000
(tai avaa `index.html` suoraan). Savutesti: `NODE_PATH=$(npm root -g) node tools/smoke.js`.

## Tiedostot

- `index.html`, `style.css`
- `game.js` – peli (grafiikka piirretään koodissa, äänet syntetisoidaan Web Audiolla)
- `touch.js` – kosketusohjaimet puhelimille
- `img/watch.png` – rannekellon taulu
- `fonts/` – Press Start 2P -fontti ja sen lisenssi (`OFL.txt`)
- `tools/smoke.js` – Playwright-savutesti; `tools/mkwatch.py` – kellotaulun generaattori
- `CLAUDE.md` – kehittäjän ja Claude Coden ohjeet

Lisenssi: ks. [`LICENSE`](LICENSE) ja [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
Yhteystiedot: DeTremolo Games, detremologames@gmail.com.
