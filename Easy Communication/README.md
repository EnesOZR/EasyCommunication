# 📱 IMEI Cihaz Yöneticisi - Chrome Eklentisi

Firebase tabanlı telefon IMEI takip sistemi Chrome eklentisi.

## ✨ Özellikler

- 📱 **IMEI 1 & 2** desteği ile cihaz ekleme
- 📝 **Not bırakma** (isteğe bağlı)
- 🔍 **Arama** - IMEI, cihaz adı veya not ile arama
- 👤 **Kullanıcı sistemi** - Local storage'da saklanır
- 📐 **Açılır/Kapanır panel** - Siteyi etkilemeden yan panel
- 🎨 **Modern glassmorphism tasarım**

## 🚀 Kurulum

### 1. Firebase Projesi Oluşturun

1. [Firebase Console](https://console.firebase.google.com/) adresine gidin
2. "Proje Oluştur" butonuna tıklayın
3. Proje adını girin ve devam edin
4. **Firestore Database** oluşturun:
   - Sol menüden "Firestore Database" seçin
   - "Veritabanı Oluştur" butonuna tıklayın
   - "Üretim modunda başlat" seçin
   - Konum seçin

### 2. Firebase Yapılandırması

1. Proje ayarlarına gidin (dişli ikonu)
2. "Genel" sekmesinde aşağı kaydırın
3. "SDK kurulumu ve yapılandırması" bölümünden yapılandırma bilgilerini kopyalayın
4. `content.js` dosyasındaki `initFirebase()` fonksiyonunda aşağıdaki değerleri güncelleyin:

```javascript
const config = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "PROJE_ADI.firebaseapp.com",
  projectId: "PROJE_ID",
  storageBucket: "PROJE_ADI.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
```

### 3. Firestore Güvenlik Kuralları

Firebase Console'da Firestore > Kurallar sekmesine gidin ve şunları ekleyin:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /devices/{document=**} {
      allow read, write: if true;  // Geliştirme için
    }
  }
}
```

⚠️ **Not**: Üretim için daha güvenli kurallar kullanın!

### 4. Chrome'a Yükleyin

1. Chrome'da `chrome://extensions/` adresine gidin
2. Sağ üstten "Geliştirici modu"nu açın
3. "Paketlenmemiş öğe yükle" butonuna tıklayın
4. Bu klasörü seçin

## 📁 Dosya Yapısı

```
Easy Communication/
├── manifest.json       # Eklenti yapılandırması
├── content.js          # Ana içerik scripti
├── panel.css           # Panel stilleri
├── background.js       # Service worker
├── firebase-config.js  # Firebase yapılandırması (opsiyonel)
└── icons/
    ├── icon16.svg
    ├── icon48.svg
    └── icon128.svg
```

## 🎯 Kullanım

1. Herhangi bir web sitesini açın
2. Sağ tarafta mor butonla paneli açın/kapatın
3. İlk girişte kullanıcı adınızı girin
4. "Cihaz Ekle" ile yeni cihaz ekleyin
5. Arama kutusunda IMEI veya cihaz adı arayın

## 🔧 Geliştirme Notları

- Panel siteyi sola kaydırır, site içeriğine müdahale etmez
- `<` butonu ile panel açılır/kapanır
- `X` butonu paneli kapatır
- Kullanıcı adı Chrome local storage'da saklanır

## 📞 İletişim

Sorularınız için issue açabilirsiniz.
