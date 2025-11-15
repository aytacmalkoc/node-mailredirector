# 📍 Node-MailRedirector Roadmap

Bu döküman, projenin gelecekte alabileceği yönü ve eklenmesi planlanan iyileştirmeleri detaylı şekilde listeler. Amaç; uygulamayı daha kararlı, kullanıcı dostu ve üretim ortamına hazır hale getirmektir.

---

## ✅ 1. Temel İyileştirmeler

### **1.1 E-posta İçerik İşleme Geliştirmeleri**

* MIME desteğinin genişletilmesi
* Ek dosyaların (attachments) yönlendirilmesi
* HTML + inline görsellerin daha kararlı parse edilmesi

### **1.2 Çoklu Hesap Desteği**

* Birden fazla IMAP/SMTP hesabı tanımlanabilmesi
* Her hesap için ayrı kurallar (rule set) oluşturulması

### **1.3 Gelişmiş Hata Yönetimi**

* Otomatik yeniden bağlanma (IMAP reconnect)
* Exponential backoff mekanizması
* SMTP retry özelliği
* Hata durumlarında e-posta veya webhook bildirimleri

---

## 🛠️ 2. Yapılandırma ve Yönetim

### **2.1 Web Paneli (Dashboard)**

* Anahtar kelimeleri görsel arayüzden yönetme
* IMAP/SMTP durumunu gösteren sağlık ekranı
* "Son yönlendirilen e-postalar" tablosu
* Log görüntüleyici

### **2.2 API Desteği**

* Yönetim paneli veya dış uygulamalar için REST API
* /logs, /rules, /status gibi endpoint'ler

### **2.3 Yapılandırma Dosyası Şifreleme**

* .env dosyasındaki şifrelerin güvenli saklanması
* Dotenv-vault veya basit AES ile config.encrypt.json

---

## 🧩 3. Filtreleme Yetenekleri

### **3.1 Gelişmiş Kural Motoru**

* Gönderen adresine göre filtre (from)
* Konuya göre filtre (subject)
* Regex desteği
* Saat/dönem bazlı kurallar
* "Eğer X ise Y yap" mantığında Gmail benzeri rule engine

### **3.2 Anahtar Kelime Yönetimi Geliştirmeleri**

* Anahtar kelime ağırlıkları ve öncelikleri
* Bir kelimenin birden fazla kuralda geçmesi durumunda öncelik yönetimi

---

## 📊 4. Loglama ve Raporlama

### **4.1 Web Log Viewer**

* Filtrelenebilir log tablosu
* "Başarısız gönderimler" sayfası

### **4.2 Periyodik Raporlama**

* Günlük / haftalık özet e-postaları:

  * Kaç e-posta yönlendirildi
  * Hangi kelimeler tetiklendi
  * Hangi adreslere iletildi

### **4.3 Log Rotasyonu**

* Logların günlük/haftalık otomatik arşivlenmesi
* Eski logları sıkıştırma

---

## 🧠 5. Akıllı Özellikler (Opsiyonel)

### **5.1 AI Destekli İçerik Analizi**

* "Bu e-posta hangi departmana ait olmalı?" sınıflandırması
* Önemli/önemsiz e-posta tespiti
* Spam / hata tespiti

### **5.2 Kelime Bulutu & Analitik**

* En sık tetiklenen kelimeleri gösteren grafikler
* Gün/saat bazlı yönlendirme yoğunluğu

---

## 🐳 6. DevOps / Üretim Hazırlığı

### **6.1 Docker Geliştirmeleri**

* Lightweight imaj optimizasyonu
* Multi-stage build

### **6.2 Monitoring Entegrasyonları**

* Prometheus metrikleri
* Grafana dashboard örneği

### **6.3 CI/CD Entegrasyonu**

* GitHub Actions ile test + build pipeline
* Otomatik sürüm numaralandırma

---

## 🧪 7. Test Altyapısı

### **7.1 Unit Test Genişletme**

* IMAP modül mock testleri
* SMTP gönderim testleri
* Rule-engine testleri

### **7.2 Senaryo Testleri**

* "Fatura kelimesi geçince X’e yönlendir" senaryosu
* "Ek dosya varsa farklı kişiye yönlendir" senaryosu

---

## 📅 8. Yol Haritası Zaman Çizelgesi

### **Kısa Vadede (0–2 ay)**

* Log viewer
* Gelişmiş hata yönetimi
* Multi-account altyapı hazırlığı

### **Orta Vadede (2–6 ay)**

* Web paneli
* API desteği
* Gelişmiş filtre motoru

### **Uzun Vadede (6+ ay)**

* AI destekli sınıflandırma
* Prometheus/Grafana entegrasyonu
* Kurumsal ortam için cluster desteği

---