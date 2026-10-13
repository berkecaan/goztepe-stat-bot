# Göztepe Stat Bot

Özgün isim ve arayüzle Discord mesaj/ses istatistikleri. Node.js + discord.js v14, SQLite, Chart.js ve Express. Türkçe bot yanıtları; koyu, mobil uyumlu OAuth2 dashboard.

## Hızlı kurulum

**Önerilen ortam: Node.js 24 LTS, kalıcı disk ve tek çalışan bot süreci.** Minimum Node.js 22.13.0; `node:sqlite` kullanılır. Eski Node 18/20 panellerinde çalışmaz. Grafik için `@napi-rs/canvas` platforma uygun hazır native paketi kurar. Docker dosyası Debian tabanlıdır.

1. ZIP'i açın; `package.json` dosyasının bulunduğu klasöre geçin.
2. `npm ci`
3. `.env.example` dosyasını `.env` olarak kopyalayıp doldurun.
4. `npm start`

```bash
npm ci
cp .env.example .env
# .env içindeki DISCORD_TOKEN, CLIENT_ID ve tercihen GUILD_ID'yi doldurun.
npm start
```

**GitHub üzerinden hosting:** Depoyu klonladıktan sonra çalışma dizinini depo kökü olarak seçin. Kurulum komutu `npm ci --omit=dev`, başlatma komutu `npm start`, Node.js sürümü `24` olmalıdır. Hosting ortam değişkenlerine `DISCORD_TOKEN` ve `CLIENT_ID` ekleyin. SQLite verilerinin yeniden başlatmalarda korunması için `DATABASE_PATH` değerini kalıcı diskteki bir yola ayarlayın. Tek bot süreci çalıştırın.

Migration ve slash deploy başlangıçta otomatik çalışır. Dashboard kullanmayacaksanız `DASHBOARD_ENABLED=false` kalabilir; CLIENT_SECRET / SESSION_SECRET gerekmez.

**iPhone / hosting paneli:** ZIP'i panelin dosya yöneticisine yükleyin ve çıkartın. `package.json` sunucunun çalışma klasöründe olsun; gereksiz iç içe klasör bırakmayın. `.env.example` → `.env` kopyalayın, token ve ID'leri panelden girin. Node.js 24 imajı seçin; başlangıç komutu `npm start`. Tokenı sohbete göndermeniz gerekmez.

## Discord Developer Portal

1. <https://discord.com/developers/applications> adresinde bir application oluşturun: **Göztepe Stat Bot**.
2. Bot bölümünde bot tokenını alın; yalnızca `.env` içindeki `DISCORD_TOKEN` alanına yazın. Token sızarsa resetleyin.
3. General Information → Application ID = `CLIENT_ID`.
4. Bot → Privileged Gateway Intents → **Server Members Intent** açın.
5. OAuth2 URL Generator: `bot` ve `applications.commands` scope'ları.
6. Bot izinleri: **View Channels, Send Messages, Embed Links, Attach Files**. Thread içinde yanıt için **Send Messages in Threads**. `/stat-channel setup/remove` için ayrıca **Manage Channels**. Administrator vermek gerekmez. Botun istatistik tutacağı kanalları görebilmesi gerekir.
7. Discord → Gelişmiş → Geliştirici Modu; sunucuya basılı tutup Sunucu ID'sini kopyalayın → `GUILD_ID`.
8. Oluşturduğunuz bot davet bağlantısıyla botu sunucuya ekleyin.

Gerekli Gateway intents:

| Intent | Neden | Portal ayrıcalıklı anahtarı |
|---|---|---|
| Guilds | Sunucular, kanallar, roller ve slash işlemleri | Gerekmez |
| GuildMembers | Katılım/ayrılma, rol üyeleri, üye sayımları | **Server Members Intent** |
| GuildMessages | Yeni mesaj olaylarının sayımı | Gerekmez |
| GuildVoiceStates | Ses giriş/çıkış/kanal değişimi | Gerekmez |

**MessageContent kullanılmaz.** Mesaj metni, ek içerikleri veya konuşma sesi okunmaz/kaydedilmez. Presence intent de gerekmez: “aktif” çevrimiçi anlamına gelmez, son 7 günde kaydedilmiş mesaj veya ses aktivitesi demektir.

## .env alanları

Eksiksiz örnek `.env.example` içindedir.

| Alan | Açıklama |
|---|---|
| DISCORD_TOKEN | Bot tokenı; gerekli |
| CLIENT_ID | Application ID; gerekli |
| GUILD_ID | Doluysa bu sunucuya hızlı deploy; boşsa global deploy |
| AUTO_DEPLOY | Varsayılan true; false için `npm run deploy` kullanın |
| DATABASE_PATH | Varsayılan `./data/stats.sqlite` |
| DASHBOARD_ENABLED | Web sunucusunu açmak için true |
| PORT | Panelin izin verdiği port, varsayılan 3000 |
| BASE_URL | Kullanıcının açtığı kök adres; üretimde `https://stats.example.com` |
| CLIENT_SECRET | Developer Portal OAuth2 client secret; token ile aynı değildir |
| SESSION_SECRET | En az 32 karakter rastgele gizli değer |
| NODE_ENV | HTTPS üretimde production, yerel testte development |
| TRUST_PROXY | Güvenilir reverse proxy sayısı; doğrudan erişimde 0, tek proxy arkasında 1 |

`GUILD_ID` bir erişim kısıtı değildir, **deploy hedefidir**. Bot eklendiği diğer sunucularda da ayrı kayıt tutabilir. Göztepe'ye özel kullanım için botu yalnızca kendi sunucunuza ekleyin. Global ve guild deploy arasında geçiş yaparken eski kapsamın komutlarını Discord API üzerinden temizleyin; iki kapsamda aynı komut adları görünebilir. Deploy, bu application'ın hedef kapsamdaki komut listesini değiştirir; başka botun application/tokenını kullanmayın.

## Komutlar

| Komut | İşlev |
|---|---|
| `/stat [user]` | Tüm zamanlar, bugün, 7/30 gün mesaj ve ses; sıralama; en aktif kanallar; son aktivite; katılım zamanı |
| `/top messages [size]` | Tüm zamanlar mesaj sıralaması |
| `/top voice [size]` | Tüm zamanlar ses sıralaması |
| `/top weekly-messages`, `/top weekly-voice` | Son 7 günlük sıralama |
| `/top monthly-messages`, `/top monthly-voice` | Son 30 günlük sıralama |
| `/serverstat` | Üye/bot/aktif üye, mesaj/ses toplamları, 24 saat/7 gün, kanal/üye liderleri, haftalık mesaj değişimi |
| `/channelstat channel` | Kanalın toplam ve dönemsel mesaj veya ses raporu, aktif üyeler |
| `/rolestat role` | Rolün **mevcut** üyelerinin geçmiş toplamları, kişi başı ortalamalar ve liderleri |
| `/graph type period` | messages/voice; 7d/30d/24h, PNG grafik |
| `/memberstats` | Katılan/ayrılan, 7/30 gün net değişim, 30 günlük grafik |
| `/activity [user]` | Son mesaj/ses, 7 günlük miktar, değiştirilebilir eşiklerle aktivite durumu |
| `/compare user1 user2` | İki üyeyi karşılaştırır |
| `/rank` | Kendi mesaj/ses sıranız |
| `/mystats` | Kendi aktivite kartınız |
| `/daily`, `/weekly`, `/monthly` | Sunucu dönem raporları |
| `/settings view` | Ayarlar (yönetici) |
| `/settings set key value` | Ayar değişikliği (yönetici) |
| `/stat-channel setup` | 3 otomatik ses sayacı kanalı oluşturur (yönetici) |
| `/stat-channel remove` | Onay sonrası yalnızca kayıtlı sayaç kanallarını kaldırır (yönetici) |
| `/privacy delete-my-data` | Onay sonrası bu sunucudaki kendi geçmiş verilerini siler |
| `/privacy server-reset` | Yetki kontrolü + ekstra onay sonrası sunucu istatistiklerini sıfırlar |

Top sayfa boyutu 10 veya 20; sonraki/önceki butonları vardır. Butonlar yalnızca komutu başlatan kullanıcı içindir, 5 dakika geçerlidir ve restartta geçersiz olur. Eşit puanlarda `/rank` ortak sıra verir; leaderboard ID ile kararlı sıralanır. Yetki değiştiren komutlarda **ManageGuild veya Administrator** gerekir; kritik onay anında yetki tekrar kontrol edilir. Görüntüleme herkese açıktır. Ayar/gizlilik yanıtları yalnızca komutu kullanan kişiye görünür.

## Ayarlar ve zaman tanımları

Örnekler:

```text
/settings set key:timezone value:Europe/Istanbul
/settings set key:resetHour value:4
/settings set key:countBots value:false
/settings set key:leaderboardSize value:20
/settings set key:excludedChannels value:["123456789012345678","234567890123456789"]
/settings set key:excludedRoles value:["345678901234567890"]
/settings set key:dashboardEnabled value:false
/settings set key:activityThresholds value:{"veryActive":1000,"active":300,"medium":100,"low":1}
```

- Varsayılan gün başlangıcı Europe/Istanbul 00:00. `resetHour:4` günü 04:00'te başlatır; o saatten önce önceki istatistik günü sürer.
- **Bugün:** en son reset saatinden şimdiye. **Haftalık:** içinde bulunulan istatistik günü + önceki 6 gün. **Aylık:** içinde bulunulan gün + önceki 29 gün. Takvim ayı/Pazartesi başlangıçlı hafta değildir.
- `/serverstat` son 24 saat / son 7 gün alanları kayan penceredir. Önceki 7 günde mesaj yoksa yüzde hesaplanmaz.
- Zaman serileri dakikalık UTC kovalarında tutulur; kayan pencere başlangıçları dakikaya aşağı yuvarlanır (en çok 59 saniye fark). Ses toplamı milisaniyeyle birikir. Dönemsel gün sınırları timezone ve DST dikkate alınarak hesaplanır.
- Saatlik grafik mevcut saat dahil son 24 **saat kovası**; günlük grafik mevcut gün dahil 7/30 gün. Son kova kısmi olabilir.
- Reset veriyi **silmez**. Timezone/reset ayarı değişikliği, geçmiş dakikalık verileri yeni sınırlarla yeniden gruplar.
- En fazla yaklaşık 5 saniyelik kayıt gecikmesi vardır. Komut ve dashboard sorgularından önce bekleyen mesajlar yazılır.
- Webhook mesajları her zaman dışlanır. Botlar varsayılan dışarıdadır; `countBots` mesaj ve ses için uygulanır.
- Kanal hariç tutma doğrudan kanal ID'sini ve parent ID'sini kontrol eder (örn. bir yazı kanalının thread'leri). Rol hariç tutma kayıt anındaki rollere göre çalışır. Değişiklik geçmiş veriyi silmez.
- Ses süresi “kanalda bulunma”dır: yalnız, AFK, muted/deafened üyeler de sayılır. İstenmeyen AFK kanallarını hariç tutun. Bot ses kanalına bağlanmaz, ses kaydetmez.
- Rol raporu rolün şu anki üyelerinin tüm geçmişini toplar; geçmişte o role sahip oldukları süreye özel bir rol geçmişi sistemi değildir.
- Bot/rol üye sayımları Discord üye listesi yüklemesine bağlıdır. Başlangıçta tüm üyeler çekilir; bu başarısız olursa log uyarı verir ve bot sayısı kısmi olabilir.

Aktivite puanı = **son 7 gün mesaj + son 7 gün ses dakikası / 5**. Varsayılan: ≥1000 Çok Aktif, ≥300 Aktif, ≥100 Orta, ≥1 Düşük; altında Pasif. Eşikler settings komutundan veya dashboard'dan değişir.

## Ses kayıtları ve restart

Giriş zamanı ve son checkpoint `voice_sessions` içinde kalıcıdır. Her 5 saniyede ses süreleri dakika sınırlarına bölünür; sayaçlar ve checkpoint **aynı transaction** içinde yazılır. Kanal değişiminde eski oturum kapanır, yenisi açılır. Periyodik ses kayıtları tek toplu transaction kullanır.

Normal kapanışta son flush yapılır. Ani kapanışta son commit'e kadar olan kayıtlar korunur; en fazla flush aralığındaki mesaj/ses kaydı kaybolabilir. Yeni başlangıçta mevcut Discord voice state'leriyle oturumlar kurulur. **Botun kapalı veya gateway bağlantısının kopuk olduğu süre sayılmaz:** üyelerin o aralıkta çıkıp tekrar girdiği bilinemez. Bu süreyi tahmin ederek şişirmek yerine kayıt dışı bırakırız. Discord geçmiş mesajları veya geçmiş ses oturumları kendiliğinden geri doldurulmaz.

## Dashboard kurulumu

1. `DASHBOARD_ENABLED=true`.
2. Developer Portal → OAuth2 → Redirects:
   - Yerel: `http://localhost:3000/auth/callback`
   - Üretim: `https://stats.example.com/auth/callback`
3. `.env`: aynı kök adresi `BASE_URL`, uygun `PORT`, `CLIENT_SECRET` ve güçlü `SESSION_SECRET`.
4. Üretimde HTTPS reverse proxy arkasında `NODE_ENV=production`; tek güvenilir proxy varsa `TRUST_PROXY=1`.
5. `npm start`, ardından BASE_URL'yi açıp Discord ile giriş.

Secret oluşturmak için:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

OAuth scope'ları `identify guilds`. Login state kontrolü, oturum kimliği yenileme, SQLite oturum deposu, HttpOnly/SameSite cookie, üretimde Secure cookie, CSRF ve rate limit uygulanır. Discord OAuth access tokenı oturumda saklanmaz. Oturum 1 saat; yeni sunucu/yetki listesi için yeniden giriş yapın. Her sunucu API çağrısında bot aracılığıyla üye yeniden getirilir ve yönetim yetkisi doğrulanır; başka bir sunucu ID'si yazmak erişim sağlamaz.

Sayfalar: **Overview, Members, Channels, Leaderboards, Activity, Settings**. Members mesaj liderleri üzerinden sayfalanır; Channels iki ayrı mesaj/ses listesi gösterir. Tam üye dizini veya kullanıcı adı arama ekranı içermez. Chart.js yerelden sunulur; harici font/JS CDN bağımlılığı yoktur. Dashboard UI Türkçedir, menü başlıkları istekteki isimlerle korunmuştur.

Sunucu ayarı `dashboardEnabled=false` o sunucunun tüm veri/ayar API'lerini kapatır. Yeniden açmak için Discord `/settings set key:dashboardEnabled value:true` gerekir. `.env` içindeki ana anahtar tüm web sunucusunu kapatır. Panelde dışarı açılabilir HTTP portu yoksa dashboard çalışmaz; bot komutları çalışır.

## Mimari ve veri

```text
src/
  index.js                   # Bağlantı, servis bileşimi, yaşam döngüsü
  commands/                  # core, reports, admin; slash tanımları ve yürütücüler
  events/                    # Gateway ve interaction handler kayıtları
  database/
    sqlite.js                # Parametreli prepared sorgular / repository
    migrations/              # Sürüm numaralı SQL migration'lar
  services/                  # Tracker, stats, settings cache, charts, sayaçlar
  utils/                     # Zaman, embed, yetki ve log yardımcıları
  dashboard/                 # Express/OAuth2/session + özgün statik arayüz
  config/                    # dotenv ve varsayılan ayarlar
scripts/                     # Deploy, migration ve kontrol araçları
test/                        # Node test runner + HTTP entegrasyon testleri
```

Tablolar:

| Tablo | İçerik |
|---|---|
| totals | Sunucu/üye/kanal tüm zamanlar mesaj, ses ve son aktivite |
| activity_buckets | Sunucu/üye/kanal/dakika ayrıntısı; tarih aralıkları ve grafikler |
| voice_sessions | Aktif oturum başlangıcı ve kalıcı checkpoint |
| member_events | Üye katılım/ayrılma olayları ve zamanı |
| settings | Sunucuya özgü doğrulanmış JSON ayarları |
| web_sessions | Süreli dashboard oturumları |
| migrations | Uygulanmış migration adları |

Üye/kanal adları Discord'dan okunur; ID'ler metin olarak tutulur (JavaScript sayı hassasiyeti kaybı yok). Mesaj metni/sesi saklanmaz. Toplamlar ve dakika kovaları aynı transaction içinde güncellenir. Başlangıçta yeni migration dosyaları sıralı uygulanır. Dağıtılmış bir migration dosyasını değiştirmeyin, yeni numaralı dosya ekleyin.

PostgreSQL'e geçiş için SQL'in tek sınırı `SQLiteRepository`'dir; command, tracker ve stats katmanında raw SQL yoktur. Metot grupları: ayarlar; `addBatch/aggregate/top/rank/userTotals/active/series`; ses oturumları ve `checkpointVoices`; üye olayları; privacy; web session CRUD. PostgreSQL adapterında `$1` parametreleri, BIGINT zaman/süre, UPSERT, migration kilidi ve transaction semantiği korunmalı; çoklu worker için oturum sahipliği eklenmelidir. **Hazır PostgreSQL sürücüsü bu pakette yoktur.** Mevcut SQLite API senkron olduğundan PostgreSQL'e geçerken repository çağrıları async/await'e taşınmalı ve aynı testler çalıştırılmalıdır.

## Performans ve işletim

- Mesaj başına SQL sorgusu yapılmaz: settings cache + bellek içi dakika/üye/kanal toplaması; her 5 saniyede veya 10.000 farklı bekleyen kovada flush.
- Hazır sorgular, WAL, indeksler ve transaction kullanılır. Başarısız mesaj flush'ı kuyruğu silmez.
- Duplicate message event'leri son 50.000 ID'de süzülür; bu pencere restartta sıfırlanır. Aynı canlı event normal gateway replay'de iki kez sayılmaz.
- Ses oturumları checkpoint'lenir; periyodik checkpoint'ler tek transaction'da yazılır.
- İstatistikler süresiz tutulur; yoğun sunucularda dakika kovaları büyür. Disk/latency izleyin. Ağır sıralama/rol raporları senkron SQLite sorgularıdır; çok büyük sunucularda bir worker/async PostgreSQL mimarisine geçiş gerekir. Sınırsız ölçek veya production yük testi iddiası yoktur.
- Discord kullanıcı başına 3 saniye komut bekleme; web API genel 120 istek/dk/IP; OAuth 15 istek/dk/IP.
- Stat kanalları yaklaşık 10 dakikada bir, sadece değer değiştiğinde güncellenir. Discord'un rate-limit kuyruğu ayrıca uygulanır.
- Bir SQLite dosyasını **tek bot süreci** yönetsin. PM2 cluster/çoklu replika/sharding süreçlerini aynı dosyayla açmayın; çift sayım yapabilir.

## Hosting

### Pterodactyl / bot hosting paneli

Node.js 24 egg/image seçin. Dosyaları açın, `npm install`, `.env` ayarlayın; startup `npm start` veya `node src/index.js`. Panel paketleri otomatik kuruyorsa tekrar özel kurulum komutu gerekmez. `data/` yazılabilir ve yeniden başlatmada kalıcı olmalı. Dashboard için panelin size tahsis ettiği portu ve varsa HTTPS proxy adresini kullanın. Node 18/20'ye sabitlenmiş host bu proje için uygun değildir.

### VPS

Aynı üç adım. Process manager/systemd ile tek süreç ve hata durumunda restart ayarlayın. HTTPS için Nginx/Caddy gibi reverse proxy kullanın. Çalışma dizini proje kökü olmalı; SQLite yolu relative olduğu için farklı dizinden başlatmayın veya mutlak DATABASE_PATH kullanın.

### Railway benzeri ortamlar

Build: `npm ci`; Start: `npm start`; Node.js 24. Gizli değerleri ortam değişkenlerine girin. `/app/data` gibi kalıcı bir volume bağlayın ve `DATABASE_PATH=/app/data/stats.sqlite` yapın. PORT platform tarafından veriliyorsa onu kullanır. BASE_URL herkese açık HTTPS domain olmalı. Geçici dosya sistemiyle yeniden deploy veriyi kaybettirir. Ücretsiz plan veya 7/24 süre garantisi verilmez.

### Docker

```bash
docker build -t goztepe-stat-bot .
docker run --name goztepe-stat-bot --restart unless-stopped --env-file .env \
  -p 3000:3000 -v goztepe-stat-bot-data:/app/data goztepe-stat-bot
```

Docker imajı root olmayan `node` kullanıcısıyla çalışır. Named volume kalıcı veriyi tutar. Host klasörü bind mount ederseniz yazma izinlerini bu kullanıcıya göre ayarlayın.

## Veri silme ve yedek

`delete-my-data`: bu sunucudaki kullanıcının toplamları, dakika kovaları, ses oturumu, katılım/ayrılma kayıtları ve bekleyen mesajları silinir. Sunucu toplamları bu veriyle birlikte azalır. **Kalıcı opt-out değildir**; sonraki aktivite tekrar sayılır. Aktif ses yeni başlangıçtan sayılmaya devam eder. `server-reset` bütün sunucu istatistiklerini siler, ayarları ve sayaç kanallarını korur.

Yedek için botu durdurun, `data/` klasörünün tamamını güvenli bir yere kopyalayın, sonra yeniden başlatın. Çalışan SQLite'ın yalnız `.sqlite` dosyasını kopyalamak WAL'daki veriyi kaçırabilir. Yedekler `.env` dosyanızdan ayrı tutulmalı; erişimini sınırlandırın. Privacy silmeleri eski harici yedekleri otomatik silmez; saklama politikanızı buna göre belirleyin. Silme uygulama düzeyindedir, diskte güvenli fiziksel üzerine yazma garantisi değildir.

## Kontroller ve durum

```bash
npm test          # repository, komutlar, ses, grafik, OAuth/CSRF/izin testleri
npm run check     # tüm JS syntax kontrolü + 17 slash şeması serileştirme
npm run migrate   # bağımsız migration (start zaten yapar)
npm run deploy    # bağımsız slash yükleme
npm run dev       # geliştirmede watch
```

MVP önce ayrı testlerle doğrulandı; ardından diğer özellikler eklendi. Testlerde gerçek SQLite ve PNG üretimi kullanılır; Discord API bağlantıları taklit edilir. Gerçek bot tokenı ve OAuth credentials verilmediği için **canlı Discord bağlantısı, gerçek slash deploy ve gerçek OAuth giriş turu burada çalıştırılmadı**. Docker build / üretim yük testi de yapılmış kabul edilmemelidir. `TEST-REPORT.md` teslim sırasında yapılan kontrolleri belirtir.

Canlı kurulum sonrası kısa kabul testi:

1. Bot konsolunda bağlandı ve komutlar yüklendi logları.
2. İki mesaj → `/stat` mesaj sayısı +2; webhook/bot mesajı varsayılan artmamalı.
3. Ses kanalında 1–2 dakika → kanal değiştir → çık; `/stat` ve `/channelstat` süreleri.
4. Ses kanalındayken restart; eski süre korunmalı, kapalı süre eklenmemeli.
5. `/top`, `/serverstat`, `/graph`, `/memberstats` yanıtları.
6. Yetkisiz hesabın ayar değiştirememesi; resetin onaysız çalışmaması.
7. Dashboard login; yetkili sunucu görünsün, yetki kaldırılınca erişim reddedilsin.

## Sık karşılaşılan hatalar

- **`node:sqlite` bulunamadı:** Node.js 24 seçin; Node 18/20 desteklenmez. Node 22 bazı sürümlerinde SQLite experimental uyarısı normaldir.
- **401 / invalid token:** Bot tokenı yanlış/yenilenmiş; Application ID token değildir. `.env` adı ve çalışma dizinini kontrol edin.
- **Used disallowed intents / 4014:** Server Members Intent açın; büyük/doğrulanmış botlarda Discord onayı gerekebilir.
- **Slash görünmüyor:** CLIENT_ID ve GUILD_ID doğruluğu, davette applications.commands, uygulama komut izinleri ve `npm run deploy`. Global deploy görünürlüğü gecikebilir; kendi sunucunuz için GUILD_ID kullanın.
- **Mesaj sayılmıyor:** View Channels, GuildMessages; dışlanan kanal/rol; bot/webhook filtresi. MessageContent açmanız gerekmez.
- **Ses sıfır:** Bot bağlı olmalı; kayıt gecikmesi 5 saniye; hariç kanal/rol ayarlarını kontrol edin. Önceki günlerin sesi geriye dönük yüklenmez.
- **Missing Permissions:** Embed Links/Attach Files veya sayaçlar için Manage Channels. Özel kanal overwrite'larını kontrol edin.
- **Grafikte yazı görünmüyor:** Sistem fontu kurun (`fonts-dejavu-core`); Docker imajında hazırdır.
- **Native canvas yüklenemiyor:** Kilit dosyasıyla normal `npm install` yapın, optional dependencies'i kapatmayın. Debian Node 24 Docker imajını deneyin.
- **SQLite locked/read-only:** Tek bot süreci çalıştırın; data dizini yazılabilir olsun. Ağ sürücüsü yerine yerel kalıcı disk kullanın.
- **OAuth redirect mismatch:** Portal redirect ile BASE_URL + `/auth/callback` birebir aynı olmalı (http/https/port dahil).
- **Dashboard giriş döngüsü:** Production HTTPS, proxy ve Secure cookie ayarlarını kontrol edin. HTTP yerel testte NODE_ENV=development.
- **403 dashboard:** Gerçek ManageGuild/Administrator yetkisi, botun sunucuda olması ve sunucu dashboard ayarı kontrol edilir.
- **429:** Rate limit; daha yavaş deneyin. Çok kullanıcı aynı proxy/IP arkasındaysa yalnız güvenilir proxy topolojinize göre ayarlayın.

Log biçimi `[ISO tarih] [LEVEL] Mesaj`. Event ve command hataları yakalanır, normal API hataları botu kapatmaz. Unhandled rejection loglanır. **Uncaught exception** bilinmeyen süreç durumu anlamına geldiği için son kayıt denenip kontrollü kapanılır; hosting supervisor yeniden başlatmalıdır. Veri bütünlüğü bozulmuş süreçte çalışmaya devam edilmez.

## Resmî teknik kaynaklar

- discord.js v14: <https://discord.js.org/docs/packages/discord.js/14>
- Discord OAuth2: <https://discord.com/developers/docs/topics/oauth2>
- Discord gateway intents: <https://discord.com/developers/docs/topics/gateway#gateway-intents>
- Node SQLite: <https://nodejs.org/api/sqlite.html>

Statbot marka, logo veya arayüzü kullanılmamıştır. Göztepe Stat Bot isimlendirmesi, renk uygulaması ve dashboard düzeni bu proje için hazırlanmıştır.
