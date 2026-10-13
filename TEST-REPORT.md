# Göztepe Stat Bot — Teslim kontrolü

Tarih: 23 Eylül 2026. Ortam: Node.js 24.19.0, Linux, SQLite (`node:sqlite`).

## Başarılı kontroller

- `npm install`: bağımlılıklar kuruldu; `package-lock.json` teslimde bulunuyor.
- `npm run check`: tüm kaynak/script/test JS dosyaları syntax kontrolünden geçti; **17 slash komut şeması** discord.js builder ile serileştirildi.
- `npm test`: **23 test, 23 başarılı, 0 başarısız**.
- `npm run migrate`: ayrı CLI ile boş test SQLite dosyası oluşturuldu; yeniden açma/idempotence ayrıca test edildi.
- `npm ls --depth=0`: eksik veya geçersiz doğrudan bağımlılık yok.
- `npm audit --omit=dev --audit-level=high`: çalıştırıldığı anda **0 bildirilen açık**. Bu gelecekteki açıklar için garanti değildir.
- Kaynaklar Prettier ile biçimlendirildi.

## Test kapsamı

1. Mesaj batching, bot/webhook filtresi, duplicate event, kanal toplamları ve sıralama.
2. Ses giriş/çıkış, kanal değişimi, gün sınırı, checkpoint ve çift sayım önleme.
3. Restartta kalıcı kayıtların korunması ve doğrulanamayan çevrimdışı sürenin dışlanması.
4. Transaction rollback ve privacy sonrasında bekleyen verinin geri yazılmaması.
5. `/stat`, `/top`, `/serverstat` ve tüm ek rapor handler'larının Discord payload üretimi.
6. 10/20 üyelik pagination, sahiplik kontrollü ve tek kullanımlık onay butonları.
7. Yönetici yetkisinin kritik onay sırasında tekrar doğrulanması.
8. Ayar türleri, IANA timezone, ID listeleri, eşik sırası ve DST gün sınırları.
9. Gerçek SQLite dosyasını kapatıp yeniden açma; migration idempotence.
10. Chart.js/native canvas ile gerçek PNG çıktısı; dönem kovaları.
11. Katılım/ayrılma sayımları; sunucu ve kullanıcı sınırlarıyla silme.
12. Gateway kopmasında voice event/checkpoint'in bilinmeyen süreyi saymaması.
13. Birden fazla ses üyesi için tek transaction ile idempotent checkpoint.
14. Gerçek discord.js Client nesnesine gateway handler'larının bağlanması (login yapılmadan).
15. HTTP seviyesinde OAuth state, taklit Discord yanıtlarıyla login ve altı dashboard veri endpoint'i.
16. CSRF zorunluluğu, başka sunucu erişiminin reddi, yetki kaldırılması, logout ve dashboard kapatma.
17. Production HTTP / zayıf session secret yapılandırmasının reddi.

## Henüz canlı doğrulanmamış alanlar

- Gerçek Discord tokenıyla Gateway login, gerçek slash deploy, gerçek kullanıcı mesajları ve ses olayları.
- Discord'un gerçek OAuth2 consent/redirect turu; testte uzak Discord API yanıtları taklit edildi.
- Gerçek sunucuda sayaç kanalı oluşturma/silme ve Discord rate-limit davranışı.
- Docker build, hosting sağlayıcısında kurulum, yoğun sunucu production yük testi.
- Tarayıcıda masaüstü/mobil görsel kontrol: ortamda Chromium yoktu ve indirme tamamlanamadı. Responsive CSS ve HTTP varlıkları mevcut; görsel doğrulama yapılmış kabul edilmemelidir.

README'deki canlı kabul adımları, kullanıcı kendi `.env` bilgilerini girdikten sonra uygulanmalıdır. Teslim kaynakları içinde gerçek token, client secret, kullanıcı verisi veya çalışan veritabanı bulunmaz.

## GitHub aktarımı öncesi kontrol — 14 Ekim 2026

- Proje adı: Göztepe Stat Bot (`goztepe-stat-bot`).
- Node.js 24.19.0 üzerinde `npm ci`, `npm run check`, `npm test` (23/23), `npm run format:check` başarılı.
- `npm start` giriş dosyasını çalıştırdı; kimlik bilgileri eksikken beklenen hata ve çıkış kodu 1 doğrulandı.
- Gerçek Discord tokenı kullanılmadı; canlı bağlantı doğrulanmadı.
