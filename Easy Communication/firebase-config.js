// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBgcQQexhreb-k68wpHZMi_mjLk36x-NR0",
    authDomain: "enes-ozer.firebaseapp.com",
    databaseURL: "https://enes-ozer-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "enes-ozer",
    storageBucket: "enes-ozer.firebasestorage.app",
    messagingSenderId: "875215763332",
    appId: "1:875215763332:web:998e091db19db86741cfd1",
    measurementId: "G-5TJM9QHZDQ"
};

// Firebase servisleri için global değişkenler
let db = null;
let firebaseApp = null;

// Firebase'i başlat
async function initializeFirebase() {
    try {
        // Firebase SDK'yı dinamik olarak yükle
        if (typeof firebase === 'undefined') {
            await loadFirebaseSDK();
        }

        firebaseApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        console.log('✅ Firebase başarıyla bağlandı!');
        return true;
    } catch (error) {
        console.error('❌ Firebase bağlantı hatası:', error);
        return false;
    }
}

// Firebase SDK'yı yükle
function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
        const scripts = [
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
            'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
        ];

        let loaded = 0;
        scripts.forEach(src => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loaded++;
                if (loaded === scripts.length) resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    });
}

// Cihaz ekleme
async function addDevice(deviceData) {
    try {
        const docRef = await db.collection('devices').add({
            ...deviceData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Cihaz eklendi:', docRef.id);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('❌ Cihaz ekleme hatası:', error);
        return { success: false, error: error.message };
    }
}

// Cihaz güncelleme
async function updateDevice(deviceId, deviceData) {
    try {
        await db.collection('devices').doc(deviceId).update({
            ...deviceData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Cihaz güncellendi:', deviceId);
        return { success: true };
    } catch (error) {
        console.error('❌ Cihaz güncelleme hatası:', error);
        return { success: false, error: error.message };
    }
}

// Cihaz silme
async function deleteDevice(deviceId) {
    try {
        await db.collection('devices').doc(deviceId).delete();
        console.log('✅ Cihaz silindi:', deviceId);
        return { success: true };
    } catch (error) {
        console.error('❌ Cihaz silme hatası:', error);
        return { success: false, error: error.message };
    }
}

// Tüm cihazları getir
async function getAllDevices(username) {
    try {
        const snapshot = await db.collection('devices')
            .where('username', '==', username)
            .orderBy('createdAt', 'desc')
            .get();

        const devices = [];
        snapshot.forEach(doc => {
            devices.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ Cihazlar getirildi:', devices.length);
        return { success: true, devices };
    } catch (error) {
        console.error('❌ Cihazları getirme hatası:', error);
        return { success: false, error: error.message, devices: [] };
    }
}

// Cihaz arama
async function searchDevices(username, searchTerm) {
    try {
        // Tüm cihazları getir ve client-side filtrele
        const result = await getAllDevices(username);
        if (!result.success) return result;

        const searchLower = searchTerm.toLowerCase();
        const filteredDevices = result.devices.filter(device => {
            return (
                (device.imei1 && device.imei1.toLowerCase().includes(searchLower)) ||
                (device.imei2 && device.imei2.toLowerCase().includes(searchLower)) ||
                (device.deviceName && device.deviceName.toLowerCase().includes(searchLower)) ||
                (device.note && device.note.toLowerCase().includes(searchLower))
            );
        });

        return { success: true, devices: filteredDevices };
    } catch (error) {
        console.error('❌ Arama hatası:', error);
        return { success: false, error: error.message, devices: [] };
    }
}
