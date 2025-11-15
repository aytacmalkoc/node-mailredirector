# Changelog - Geliştirmeler

## [1.1.0] - 2024-12-XX

### ✨ Yeni Özellikler

#### 1. Gelişmiş Hata Yönetimi
- **Exponential Backoff Mekanizması**: IMAP bağlantı hatalarında otomatik yeniden bağlanma
  - Jitter desteği ile thundering herd problemini önler
  - Yapılandırılabilir retry sayısı ve gecikme süreleri
  - Maksimum retry sonrası uzatılmış gecikme ile tekrar deneme
- **SMTP Retry Mekanizması**: E-posta gönderim hatalarında otomatik yeniden deneme
  - Retryable ve non-retryable hata ayrımı
  - Exponential backoff ile akıllı yeniden deneme
  - Ağ, timeout ve geçici hatalar için otomatik retry

#### 2. Log Rotasyonu
- **Günlük Log Dosyaları**: Winston Daily Rotate File entegrasyonu
  - `errors-YYYY-MM-DD.log`: Hata logları
  - `system-YYYY-MM-DD.log`: Sistem logları
  - `forwarded-YYYY-MM-DD.log`: Yönlendirilen e-postalar
- **Otomatik Arşivleme**: Eski logların otomatik sıkıştırılması
- **Yapılandırılabilir Saklama**: 14 gün varsayılan, yapılandırılabilir

#### 3. Ek Dosya Yönlendirme İyileştirmesi
- **Mailparser-Nodemailer Dönüşümü**: Otomatik format dönüşümü
- **Inline Görseller**: Content-ID desteği ile inline görsellerin korunması
- **Detaylı Loglama**: Ek dosya bilgilerinin loglara eklenmesi

#### 4. API Altyapısı
- **Express REST API**: RESTful API endpoint'leri
  - `GET /health`: Sağlık kontrolü
  - `GET /api/status`: Uygulama durumu ve istatistikler
  - `GET /api/keywords`: Anahtar kelime listesi
  - `GET /api/emails/processed`: İşlenen e-postalar
  - `GET /api/database/stats`: Veritabanı istatistikleri
  - `POST /api/config/reload`: Yapılandırma yeniden yükleme
- **Yapılandırılabilir Port**: `API_PORT` environment variable ile port ayarlama
- **Opsiyonel API**: `API_ENABLED=false` ile API'yi devre dışı bırakma

#### 5. Gelişmiş Kural Motoru
- **Regex Desteği**: Anahtar kelimeler için regex pattern desteği
  - Basit string: `"keyword"`
  - Regex pattern: `{ "pattern": "/regex/", "regex": true }`
- **Zaman Bazlı Kurallar**: 
  - Haftanın günleri filtreleme
  - Saat aralığı filtreleme (örn: 09:00-17:00)
- **Gönderen Filtresi**: `fromFilter` ile gönderen adresine göre filtreleme
- **Konu Filtresi**: `subjectFilter` ile konu satırına göre filtreleme
- **Regex Filtreler**: Filtrelerde regex pattern desteği (`/pattern/`)

### 🔧 Yapılandırma

#### Yeni Environment Variables

```bash
# IMAP Retry Ayarları
MAX_RETRY_ATTEMPTS=10          # Maksimum retry sayısı (varsayılan: 10)
BASE_RETRY_DELAY=5000         # Başlangıç gecikme süresi (ms, varsayılan: 5000)
MAX_RETRY_DELAY=300000        # Maksimum gecikme süresi (ms, varsayılan: 300000)

# SMTP Retry Ayarları
SMTP_MAX_RETRY_ATTEMPTS=3     # SMTP maksimum retry sayısı (varsayılan: 3)
SMTP_BASE_RETRY_DELAY=2000    # SMTP başlangıç gecikme (ms, varsayılan: 2000)
SMTP_MAX_RETRY_DELAY=30000    # SMTP maksimum gecikme (ms, varsayılan: 30000)

# Log Ayarları
LOG_MAX_SIZE=20m              # Log dosyası maksimum boyutu (varsayılan: 20m)
LOG_MAX_FILES=14d             # Log saklama süresi (varsayılan: 14d)
LOG_ZIP_ARCHIVE=true           # Eski logları sıkıştır (varsayılan: false)

# API Ayarları
API_ENABLED=true              # API'yi etkinleştir (varsayılan: true)
API_PORT=3000                 # API port numarası (varsayılan: 3000)
```

#### Gelişmiş Keywords.json Formatı

```json
{
  "keywordGroups": [
    {
      "description": "Acil E-postalar",
      "keywords": [
        "acil",
        "urgent",
        {
          "pattern": "/\\b(acil|urgent|critical)\\b/i",
          "regex": true
        }
      ],
      "recipients": ["manager@company.com"],
      "fromFilter": ["boss@company.com", "/.*@important-domain\\.com/"],
      "subjectFilter": ["/^\\[URGENT\\]/i"],
      "timeConditions": {
        "daysOfWeek": [1, 2, 3, 4, 5],
        "timeRange": {
          "start": "09:00",
          "end": "17:00"
        }
      }
    }
  ],
  "caseSensitive": false,
  "matchWholeWord": false,
  "defaultRecipients": ["default@company.com"]
}
```

### 📦 Yeni Bağımlılıklar

- `express`: ^4.18.2 - REST API için
- `winston-daily-rotate-file`: ^5.0.0 - Log rotasyonu için

### 🔄 Geriye Dönük Uyumluluk

- Mevcut `keywords.json` formatı hala destekleniyor
- Tüm yeni özellikler opsiyonel
- Varsayılan davranışlar korunuyor

### 📝 Notlar

- API varsayılan olarak etkin, `API_ENABLED=false` ile kapatılabilir
- Log rotasyonu otomatik olarak çalışır
- Exponential backoff mekanizması tüm retry işlemlerinde aktif

