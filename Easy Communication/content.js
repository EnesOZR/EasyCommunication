// IMEI Cihaz Yöneticisi - Pro Chat (Strict Limits & UI Fix)
(function () {
    'use strict';
    // Versiyon kontrolü için konsola log basalım
    console.log('%c Easy Communication v1.0 - Limitler Aktif ', 'background: #00a884; color: #fff; padding: 5px; border-radius: 3px;');

    if (document.getElementById('imei-panel-container')) return;

    const icons = {
        phone: '<svg viewBox="0 0 24 24"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>',
        user: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
        send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        arrow: '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
        chat: '<svg viewBox="0 0 24 24"><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/></svg>'
    };

    let state = {
        username: null,
        messages: [],
        currentPage: 'login',
        pendingIMEI1: null,
        searchTerm: '',
        trackedIMEIs: [], // Local tracking storage
        expandedTechs: {}, // Group visibility state
        targetUrl: '', // Target URL filter
        panelCollapsed: true // Panel state
    };

    let db = null;
    let unsubSnapshot = null;
    let trackingInterval = null;

    async function init() {
        try {
            const data = await chrome.storage.local.get(['imei_username', 'tracked_imeis', 'expanded_techs', 'target_url', 'panel_collapsed']);
            state.username = data.imei_username || null;
            state.trackedIMEIs = data.tracked_imeis || [];
            state.expandedTechs = data.expanded_techs || {};
            state.targetUrl = data.target_url || '';
            state.panelCollapsed = data.panel_collapsed !== undefined ? data.panel_collapsed : true;

            createPanel();
            applyPanelState(); // İlk uygulama

            // Sayfa yüklenirken birkaç kez kontrol et (SPAs ve ağır siteler için)
            const retryTimes = [100, 500, 1000, 2000, 5000];
            retryTimes.forEach(ms => setTimeout(applyPanelState, ms));

            window.addEventListener('load', () => {
                applyPanelState();
                window.dispatchEvent(new Event('resize'));
            });

            attachEventListeners();
            initFirebase();
            startTracking(); // Start background tracking logic

            if (state.username) goToChat();
            else showPage('login');
        } catch (err) {
            console.error('IMEI Error:', err);
        }

        // Sekmeler arası senkronizasyon (Storage Listener)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.imei_username) {
                const newUser = changes.imei_username.newValue;
                if (newUser) {
                    // Başka sekmede giriş yapıldı
                    state.username = newUser;
                    goToChat();
                    startTracking();
                } else {
                    // Başka sekmede çıkış yapıldı
                    state.username = null;
                    // handleLogout UI işlemlerini tekrar yapmasın diye basit versiyon:
                    if (unsubSnapshot) unsubSnapshot();
                    state.messages = [];
                    showPage('login');
                    // UI Gizle
                    const nav = document.getElementById('imei-nav-bar');
                    if (nav) nav.style.display = 'none';
                    const userBar = document.getElementById('imei-user-bar');
                    if (userBar) userBar.style.display = 'none';
                    const search = document.getElementById('imei-search-container');
                    if (search) search.style.display = 'none';
                    const inputArea = document.getElementById('imei-chat-input-area');
                    if (inputArea) inputArea.style.display = 'none';
                }
            }

            if (namespace === 'local' && changes.tracked_imeis) {
                state.trackedIMEIs = changes.tracked_imeis.newValue || [];
                if (state.currentPage === 'quantity') {
                    renderTrackingList();
                } else if (state.currentPage === 'chat') {
                    // Sayacı header veya başka yerde göstermiyorsanız sadece veriyi güncellemek yeterli
                    const countEl = document.getElementById('imei-count-display');
                    if (countEl) countEl.textContent = state.trackedIMEIs.length;
                }
            }
        });
    }

    function createPanel() {
        const c = document.createElement('div');
        c.id = 'imei-panel-container';
        c.innerHTML = `
      <button id="imei-toggle-btn" title="Paneli Aç/Kapat">${icons.arrow}</button>
      <div id="imei-main-panel">
        <div id="imei-panel-header">
          <div class="panel-title"><h1>Easy Communication </h1></div>
          <button id="imei-close-btn">${icons.close}</button>
        </div>

        <!-- Yeni Navigasyon Barı (Login olunca görünür) -->
        <div id="imei-nav-bar" style="display:none;">
            <div class="nav-tab active" data-tab="chat">Sohbet</div>
            <div class="nav-tab" data-tab="quantity">Adet</div>
        </div>
        
        <div id="imei-user-bar" style="display:none">
          <div class="user-info">
            <div class="user-avatar">${icons.user}</div>
            <span id="imei-current-user" class="user-name"></span>
          </div>
          <button id="imei-logout-btn">Çıkış Yap</button>
        </div>
        
        <div id="imei-search-container" style="display:none">
          <div id="imei-search-wrapper">
            <span class="search-icon">${icons.search}</span>
            <input type="text" id="imei-search-input" placeholder="Mesaj veya IMEI ara..." maxlength="50">
          </div>
        </div>
        
        <div id="imei-content">
          <div id="imei-login-page" class="page-container">
            <h2 class="login-title">Hoş Geldiniz</h2>
            <p class="login-subtitle">Lütfen isminizi girin (Maks 15 Karakter)</p>
            <div style="position:relative; width:100%;">
                <input type="text" id="imei-username-input" placeholder="Kullanıcı Adı" maxlength="15">
                <span id="imei-login-counter" style="position:absolute; right:10px; bottom:25px; font-size:10px; color:#888;">0/15</span>
            </div>
            <button id="imei-login-btn">Başlat</button>
          </div>
          
          <div id="imei-chat-page" class="page-container">
            <div id="imei-messages-list"></div>
          </div>

          <!-- Adet Sayfası -->
          <div id="imei-quantity-page" class="page-container" style="display:none; flex-direction:column; background:#f0f2f5;">
             <div style="background:#00a884; color:white; padding:20px; text-align:center; border-bottom-left-radius:20px; border-bottom-right-radius:20px; box-shadow:0 4px 10px rgba(0,168,132,0.2); position:relative;">
                
                <!-- Ayarlar (Link) Butonu -->
                <button id="imei-settings-btn" style="position:absolute; right:15px; top:15px; background:rgba(255,255,255,0.2); border:none; color:white; width:30px; height:30px; border-radius:50%; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Hedef Link Ayarı">🔗</button>


                <div style="display:flex; align-items:center; justify-content:center; margin-bottom:5px;">
                    <div id="imei-status-dot" style="width:12px; height:12px; border-radius:50%; background:#ccc; box-shadow:0 0 5px rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.3);" title="Durum"></div>
                </div>
                <div id="imei-count-display" style="font-size:48px; font-weight:700; line-height:1.2;">0</div>
                <div style="font-size:11px;">Cihaz</div>
             </div>

             <div style="flex:1; overflow-y:auto; padding:15px;">
                <h4 style="font-size:13px; color:#667781; margin-bottom:10px; text-transform:uppercase;">Kayıt Geçmişi</h4>
                <div id="imei-tracking-list" style="display:flex; flex-direction:column; gap:8px;"></div>
             </div>

             <div style="padding:15px; background:white; border-top:1px solid #e9edef;">
                <button id="imei-reset-btn" class="btn-secondary" style="width:100%; border-color:#ea0038; color:#ea0038;">Sıfırla</button>
             </div>
          </div>

          <!-- Reset Onay Modalı -->
          <div id="imei-reset-modal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width:280px; padding:20px;">
                <h3 style="color:#111b21;">Sıfırlansın mı?</h3>
                <p style="text-align:center; color:#667781; font-size:13px; margin-bottom:20px;">Tüm adet sayacı ve IMEI geçmişi silinecek.</p>
                <div class="modal-footer">
                    <button id="imei-reset-no" class="btn-secondary">Hayır</button>
                    <button id="imei-reset-yes" class="btn-primary" style="background:#ea0038;">Evet, Sil</button>
                </div>
            </div>
          </div>

          <!-- Link Ayarları Modalı -->
           <div id="imei-settings-modal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width:280px; padding:20px;">
                <h3 style="color:#111b21;">Hedef Site</h3>
                <p style="text-align:center; color:#667781; font-size:12px; margin-bottom:15px;">Otomatik takip sadece bu linki içeren sayfalarda çalışır. Boş bırakırsanız her yerde çalışır.</p>
                <input type="text" id="imei-target-url-input" placeholder="Örn: youtube.com/abc" style="width:100%; padding:10px; margin-bottom:15px; border:1px solid #ddd; border-radius:8px;">
                <div class="modal-footer">
                    <button id="imei-settings-cancel" class="btn-secondary">İptal</button>
                    <button id="imei-settings-save" class="btn-primary">Kaydet</button>
                </div>
            </div>
          </div>
        </div>
        
        <div id="imei-chat-input-area" style="display:none">
            <div id="imei-word-counter" style="font-size:10px; color:#8696a0; margin-bottom:4px; text-align:right;">0 / 400 Karakter</div>
            <div id="imei-chat-input-wrapper">
                <input type="text" id="imei-chat-input" placeholder="Bir mesaj veya imei yazın..." maxlength="400">
                <button id="imei-send-btn" title="Mesaj Gönder">${icons.send}</button>
            </div>
        </div>
        
        <div id="imei-modal" class="modal-overlay" style="display:none">
          <div class="modal-content">
            <h3>📱 IMEI 2 Girişi</h3>
            <div class="modal-imei-info">IMEI 1: <strong id="imei-modal-imei1"></strong></div>
            <input type="text" id="imei-imei2-input" placeholder="15 haneli IMEI 2" maxlength="15">
            <p id="imei-modal-error" class="modal-error"></p>
            <div class="modal-footer">
              <button id="imei-modal-cancel" class="btn-secondary">İptal</button>
              <button id="imei-modal-confirm" class="btn-primary">Gönder</button>
            </div>
          </div>
        </div>
      </div>`;
        document.body.appendChild(c);
    }

    function applyPanelState() {
        const container = document.getElementById('imei-panel-container');
        if (!container) return;

        if (state.panelCollapsed) {
            container.classList.add('collapsed');
            document.body.classList.remove('imei-panel-open');
        } else {
            container.classList.remove('collapsed');
            document.body.classList.add('imei-panel-open');
        }

        // Eğer panel açıksa body styles'ın uygulandığından emin ol
        // Bazı siteler body class'ını silebilir, bu yüzden inline kontrol de ekleyebiliriz
        if (!state.panelCollapsed) {
            if (!document.body.classList.contains('imei-panel-open')) {
                document.body.classList.add('imei-panel-open');
            }
        }
    }

    function attachEventListeners() {
        const toggleBtn = document.getElementById('imei-toggle-btn');
        const closeBtn = document.getElementById('imei-close-btn');
        const loginBtn = document.getElementById('imei-login-btn');
        const logoutBtn = document.getElementById('imei-logout-btn');
        const sendBtn = document.getElementById('imei-send-btn');
        const chatInput = document.getElementById('imei-chat-input');
        const searchInput = document.getElementById('imei-search-input');
        const loginInput = document.getElementById('imei-username-input');

        if (toggleBtn) toggleBtn.onclick = async () => {
            state.panelCollapsed = !state.panelCollapsed;
            applyPanelState();

            // Durumu kaydet
            await chrome.storage.local.set({ 'panel_collapsed': state.panelCollapsed });

            // Sayfa layoutunu tetikle
            window.dispatchEvent(new Event('resize'));
        };

        if (closeBtn) closeBtn.onclick = async () => {
            state.panelCollapsed = true;
            applyPanelState();
            await chrome.storage.local.set({ 'panel_collapsed': true });
            window.dispatchEvent(new Event('resize'));
        };

        if (loginBtn) loginBtn.onclick = handleLogin;
        if (loginInput) {
            loginInput.oninput = (e) => {
                const len = e.target.value.length;
                document.getElementById('imei-login-counter').textContent = `${len}/15`;
            };
            loginInput.onkeypress = e => { if (e.key === 'Enter') handleLogin(); };
        }

        if (logoutBtn) logoutBtn.onclick = handleLogout;

        if (chatInput) {
            chatInput.oninput = (e) => {
                const value = e.target.value;
                const count = value.length; // Boşluk dahil her şey
                const counterEl = document.getElementById('imei-word-counter');
                counterEl.textContent = `${count} / 400 Karakter`;
                counterEl.style.color = count >= 400 ? '#ff5e5e' : '#8696a0';

                // IMEI Algılama
                const trimmedValue = value.trim();
                if (isIMEI(trimmedValue) && trimmedValue.length === 15) {
                    state.pendingIMEI1 = trimmedValue;
                    e.target.value = '';
                    document.getElementById('imei-word-counter').textContent = '0 / 400 Karakter';
                    showIMEI2Modal(state.pendingIMEI1);
                }
            };
            chatInput.onkeypress = e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleChatSend();
                }
            };
        }
        if (sendBtn) sendBtn.onclick = handleChatSend;

        if (searchInput) {
            searchInput.oninput = e => {
                state.searchTerm = e.target.value;
                renderMessages();
            };
        }

        const modalCancel = document.getElementById('imei-modal-cancel');
        const modalConfirm = document.getElementById('imei-modal-confirm');
        const imei2Input = document.getElementById('imei-imei2-input');

        if (modalCancel) modalCancel.onclick = closeModal;
        if (modalConfirm) modalConfirm.onclick = handleIMEI2Submit;
        if (imei2Input) imei2Input.onkeypress = e => { if (e.key === 'Enter') handleIMEI2Submit(); };

        // Tab Click Listeners
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                const target = tab.getAttribute('data-tab');
                switchTab(target);
            };
        });

        // Kopyalama için delegasyon
        const list = document.getElementById('imei-messages-list');
        if (list) {
            list.onclick = (e) => {
                const btn = e.target.closest('.copy-btn');
                if (btn) {
                    const imei = btn.getAttribute('data-imei');
                    copyToClipboard(imei, btn);
                }
            };
        }
        // Reset Logic
        const resetBtn = document.getElementById('imei-reset-btn');
        const resetModal = document.getElementById('imei-reset-modal');
        const resetNo = document.getElementById('imei-reset-no');
        const resetYes = document.getElementById('imei-reset-yes');

        if (resetBtn) resetBtn.onclick = () => { resetModal.style.display = 'flex'; };
        if (resetNo) resetNo.onclick = () => { resetModal.style.display = 'none'; };
        if (resetYes) resetYes.onclick = handleResetTracking;

        // Settings Logic
        const settingsBtn = document.getElementById('imei-settings-btn');
        const settingsModal = document.getElementById('imei-settings-modal');
        const settingsCancel = document.getElementById('imei-settings-cancel');
        const settingsSave = document.getElementById('imei-settings-save');

        if (settingsBtn) settingsBtn.onclick = () => {
            document.getElementById('imei-target-url-input').value = state.targetUrl || '';
            settingsModal.style.display = 'flex';
        };
        if (settingsCancel) settingsCancel.onclick = () => { settingsModal.style.display = 'none'; };
        if (settingsSave) settingsSave.onclick = handleSaveSettings;
    }

    async function handleSaveSettings() {
        const input = document.getElementById('imei-target-url-input');
        const val = input.value.trim();
        state.targetUrl = val;
        await chrome.storage.local.set({ 'target_url': val });

        document.getElementById('imei-settings-modal').style.display = 'none';
        showToast('✅ Ayar Kaydedildi');

        // Takibi yeniden başlat (yeni URL ile)
        startTracking();
    }

    // --- TRACKING LOGIC ---
    function startTracking() {
        if (trackingInterval) clearInterval(trackingInterval);

        console.log('IMEI Takibi Başlatıldı (1sn)...');

        trackingInterval = setInterval(() => {
            if (!state.username) return;

            const techEl = document.getElementById('imei-tech-name-display');
            const dotEl = document.getElementById('imei-status-dot');

            // 1. URL Kontrolü (Dinamik)
            const currentUrl = window.location.href;

            // Eğer hedef URL belirlenmişse
            if (state.targetUrl && state.targetUrl.trim() !== '') {
                if (!currentUrl.includes(state.targetUrl)) {
                    // URL UYUMSUZ
                    if (techEl) techEl.textContent = 'Site Bekleniyor';
                    if (dotEl) dotEl.style.background = '#e9edef'; // Gri
                    return;
                }
            }

            // 2. DOM Okuma
            const imeiInput = document.getElementById('CagriMerkeziKayitGetirDto_CihazImei1');
            const technicianCell = document.querySelector('.table-container table tbody tr td:nth-child(2)');

            if (!imeiInput || !technicianCell) {
                // Inputlar YOK (Yanlış sayfa veya yüklenmedi)
                if (techEl) techEl.textContent = 'Veri Aranıyor...';
                if (dotEl) dotEl.style.background = '#ffd700'; // Sarı (Bekleme)
                return;
            }

            // Inputlar bulundu - Yeşil Işık
            const imei = imeiInput.value ? imeiInput.value.trim() : '';
            const pageUser = technicianCell ? technicianCell.textContent.trim() : '';

            // Teknisyen adını güncelle (Canlı)
            if (techEl && pageUser) techEl.textContent = pageUser;
            if (dotEl) dotEl.style.background = '#00ff00'; // Yeşil (Aktif)

            if (!imei || !pageUser) return;

            // 3. Eşleşme ve Kayıt
            // Herkesi kaydet (Filtresiz)
            const exists = state.trackedIMEIs.some(item => item.imei === imei);

            if (!exists) {
                console.log(`✅ Yeni Kayıt Bulundu: ${imei}`);
                addTrackedIMEI(imei, pageUser);
                // Yeni kayıt anında yeşil yanıp sönme efekti verilebilir (isteğe bağlı)
            }
        }, 1000);
    }

    async function addTrackedIMEI(imei, techName) {
        const newItem = {
            imei: imei,
            name: techName || state.username, // Sayfadan gelen isim öncelikli
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        };

        state.trackedIMEIs.unshift(newItem); // En başa ekle

        // Kaydet
        await chrome.storage.local.set({ 'tracked_imeis': state.trackedIMEIs });

        // UI Güncelle
        renderTrackingList();
        showToast(`✅ Eklendi`);
    }

    async function handleResetTracking() {
        state.trackedIMEIs = [];
        await chrome.storage.local.remove('tracked_imeis');
        renderTrackingList();
        document.getElementById('imei-reset-modal').style.display = 'none';
        showToast('🗑️ Sayaç Sıfırlandı');
    }

    // Grupları açıp kapama fonksiyonu (Global erişim için window'a atıyoruz)
    // window.toggleTechGroup = async (name) => { // This function is no longer needed
    //     state.expandedTechs[name] = !state.expandedTechs[name];
    //     await chrome.storage.local.set({ 'expanded_techs': state.expandedTechs });
    //     renderTrackingList();
    // };

    function renderTrackingList() {
        // Toplam sayıyı güncelle
        const countEl = document.getElementById('imei-count-display');
        if (countEl) countEl.textContent = state.trackedIMEIs.length;

        const listEl = document.getElementById('imei-tracking-list');
        if (!listEl) return;

        if (state.trackedIMEIs.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; color:#8696a0; font-size:13px; margin-top:20px;">Henüz kayıt yok.</div>';
            return;
        }

        // 1. Veriyi Grupla
        const groups = {};
        // Son eklenen en üstte olduğu için, veriyi olduğu gibi kullanıyoruz
        state.trackedIMEIs.forEach(item => {
            const rawName = item.name || 'Bilinmeyen';
            const name = rawName.replace(' (Manuel)', '').trim();
            if (!groups[name]) groups[name] = [];
            groups[name].push(item);
        });

        // 2. HTML Oluştur (Native Details/Summary)
        listEl.innerHTML = Object.keys(groups).map(name => {
            const items = groups[name];
            const count = items.length;

            // Grup Başlığı
            const headerHtml = `
                <summary class="tech-group-header">
                    <div class="tech-group-info">
                        <span class="tech-name-title">${name}</span>
                        <span class="tech-count-badge">${count} Adet</span>
                    </div>
                    <svg class="tech-arrow" viewBox="0 0 24 24"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>
                </summary>
            `;

            // Grup İçeriği (Liste)
            const itemsHtml = items.map((item, index) => {
                // Grup içi sıra numarası (Toplamdan geriye doğru)
                const groupIndex = count - index;
                return `
                <div class="tech-item">
                    <div class="tech-item-index">#${groupIndex}</div>
                    <div class="tech-item-imei">📱 ${item.imei}</div>
                    <span class="tech-item-time">${item.time}</span>
                </div>
                `;
            }).join('');

            return `
                <details class="tech-group">
                    ${headerHtml}
                    <div class="tech-group-body">
                        ${itemsHtml}
                    </div>
                </details>
            `;
        }).join('');
    }

    async function handleLogin() {
        const input = document.getElementById('imei-username-input');
        const val = input.value.trim();
        if (!val) return;
        if (val.length > 15) {
            showToast('⚠️ İsim en fazla 15 karakter olabilir!');
            return;
        }
        await chrome.storage.local.set({ 'imei_username': val });
        state.username = val;

        // Inputu ve counterı temizle
        input.value = '';
        const counter = document.getElementById('imei-login-counter');
        if (counter) counter.textContent = '0/15';

        goToChat();
        startTracking(); // Takip hemen başlasın
    }

    async function handleLogout() {
        if (unsubSnapshot) unsubSnapshot();
        await chrome.storage.local.remove('imei_username');
        state.username = null;
        state.messages = [];
        showPage('login');

        // UI Gizle
        const nav = document.getElementById('imei-nav-bar');
        if (nav) nav.style.display = 'none';

        document.getElementById('imei-user-bar').style.display = 'none';
        document.getElementById('imei-search-container').style.display = 'none';
        document.getElementById('imei-chat-input-area').style.display = 'none';
        document.getElementById('imei-quantity-page').style.display = 'none';

        renderMessages();
    }

    function goToChat() {
        // Kullanıcı adını güncelle
        const userEl = document.getElementById('imei-current-user');
        if (userEl) userEl.textContent = state.username;

        // Login sayfasını gizle
        const loginPage = document.getElementById('imei-login-page');
        if (loginPage) {
            loginPage.classList.remove('active');
            loginPage.style.setProperty('display', 'none', 'important');
        }

        // UI Göster
        const nav = document.getElementById('imei-nav-bar');
        if (nav) nav.style.display = 'flex';

        // Varsayılan olarak sohbete git ve UI'ı güncelle
        switchTab('chat');
        loadMessages();
    }

    function switchTab(tabName) {
        // Tab aktifliği
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
        });

        const isChat = tabName === 'chat';

        // Ortak UI elemanları
        const userBar = document.getElementById('imei-user-bar');
        const search = document.getElementById('imei-search-container');
        const inputArea = document.getElementById('imei-chat-input-area');

        if (userBar) userBar.style.display = isChat ? 'flex' : 'none';
        if (search) search.style.display = isChat ? 'block' : 'none';
        if (inputArea) inputArea.style.display = isChat ? 'block' : 'none';

        // Sayfa gösterimi - Login'i karıştırmadan sadece içerik sayfalarını yönet
        const chatPage = document.getElementById('imei-chat-page');
        const qtyPage = document.getElementById('imei-quantity-page');

        if (chatPage) chatPage.style.setProperty('display', isChat ? 'flex' : 'none', 'important');
        if (qtyPage) qtyPage.style.setProperty('display', isChat ? 'none' : 'flex', 'important');

        if (isChat) scrollToBottom();
        else renderTrackingList();
    }

    function showPage(page) {
        state.currentPage = page;

        // Tüm sayfaları gizle
        document.querySelectorAll('.page-container').forEach(p => {
            p.classList.remove('active');
            p.style.setProperty('display', 'none', 'important');
        });

        // İstenen sayfayı göster
        const active = document.getElementById(`imei-${page}-page`);
        if (active) {
            active.classList.add('active');
            active.style.setProperty('display', 'flex', 'important');
        }
    }

    function isIMEI(text) { return /^\d{15}$/.test(text.trim()); }

    function handleChatSend() {
        const input = document.getElementById('imei-chat-input');
        const value = input.value; // Trim yapma ki boşluklar sayılsın
        if (!value.trim()) return;

        const charCount = value.length;

        if (charCount > 400) {
            showToast(`⚠️ Hata: Mesajınız ${charCount} karakter. Maksimum 400 karakter gönderebilirsiniz!`);
            return;
        }

        const trimmed = value.trim();
        if (isIMEI(trimmed) && trimmed.length === 15) {
            state.pendingIMEI1 = trimmed;
            showIMEI2Modal(trimmed);
            input.value = '';
            input.style.height = 'auto';
            document.getElementById('imei-word-counter').textContent = '0 / 400 Karakter';
        } else {
            sendMessage({ type: 'text', content: trimmed });
            input.value = '';
            input.style.height = 'auto';
            document.getElementById('imei-word-counter').textContent = '0 / 400 Karakter';
        }
    }

    function showIMEI2Modal(imei1) {
        document.getElementById('imei-modal-imei1').textContent = imei1;
        document.getElementById('imei-imei2-input').value = '';
        document.getElementById('imei-modal-error').textContent = '';
        document.getElementById('imei-modal').style.display = 'flex';
        setTimeout(() => {
            const el = document.getElementById('imei-imei2-input');
            if (el) el.focus();
        }, 150);
    }

    function closeModal() {
        document.getElementById('imei-modal').style.display = 'none';
        state.pendingIMEI1 = null;
    }

    function handleIMEI2Submit() {
        const input = document.getElementById('imei-imei2-input');
        const val = input.value.trim();
        if (!isIMEI(val)) {
            document.getElementById('imei-modal-error').textContent = '⚠️ Hata: 15 haneli IMEI 2 gerekli!';
            return;
        }
        sendMessage({ type: 'device', imei1: state.pendingIMEI1, imei2: val });
        closeModal();
    }

    async function sendMessage(data) {
        if (!db || !state.username) return;
        try {
            await db.collection('messages').add({
                ...data,
                username: state.username,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Send Error:', err);
            showToast('❌ Mesaj iletilemedi!');
        }
    }

    function loadMessages() {
        if (!db) { setTimeout(loadMessages, 1000); return; }
        if (unsubSnapshot) unsubSnapshot();

        unsubSnapshot = db.collection('messages')
            .orderBy('createdAt', 'asc')
            .limitToLast(100)
            .onSnapshot(snap => {
                state.messages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderMessages();
                setTimeout(scrollToBottom, 100);
            }, err => {
                console.error('Listen Error:', err);
            });
    }

    function renderMessages() {
        const list = document.getElementById('imei-messages-list');
        if (!list) return;

        let msgs = state.messages;
        if (state.searchTerm && state.searchTerm.trim() !== '') {
            const s = state.searchTerm.toLocaleLowerCase('tr').trim();
            msgs = msgs.filter(m => {
                // Gönderen isminde de ara
                const username = (m.username || '').toLocaleLowerCase('tr');
                if (username.includes(s)) return true;

                if (m.type === 'device') {
                    // IMEI'lerde ara
                    const i1 = (m.imei1 || '').toString();
                    const i2 = (m.imei2 || '').toString();
                    return i1.includes(s) || i2.includes(s);
                }

                // Mesaj içeriğinde ara
                const content = (m.content || '').toLocaleLowerCase('tr');
                return content.includes(s);
            });
        }

        if (msgs.length === 0) {
            list.innerHTML = `<div class="empty-state">${icons.chat}<p>Her hangi bir mesaj yok.</p></div>`;
            return;
        }

        list.innerHTML = msgs.map(m => renderMessage(m)).join('');
        // Arama yaparken scroll'u direkt aşağı atmayalım, kullanıcı sonuçları inceliyor olabilir
        // Ama ilk yüklemede veya arama temizlendiğinde atabiliriz. Şimdilik sabit kalsın.
    }

    function renderMessage(msg) {
        const isOwn = msg.username === state.username;
        const timeStr = msg.createdAt ? formatTime(msg.createdAt.toDate()) : '--:--';
        const displayUsername = (msg.username || 'Anonim').toUpperCase();

        const messageHeader = `
            <div class="msg-header">
                <span class="sender-name">${displayUsername}</span>
                <span class="header-time">${timeStr}</span>
            </div>
        `;

        if (msg.type === 'device') {
            return `
            <div class="message-bubble ${isOwn ? 'own' : 'other'} device-message">
                <div class="device-inner-content">
                    ${messageHeader}
                    <div class="device-body">
                        <div class="imei-row">
                            <label>IMEI 1</label>
                            <div class="val">
                                <span>${msg.imei1}</span>
                                <div class="copy-btn" data-imei="${msg.imei1}">${icons.copy}</div>
                            </div>
                        </div>
                        <div class="imei-row">
                            <label>IMEI 2</label>
                            <div class="val">
                                <span>${msg.imei2}</span>
                                <div class="copy-btn" data-imei="${msg.imei2}">${icons.copy}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        return `
        <div class="message-bubble ${isOwn ? 'own' : 'other'}">
            ${messageHeader}
            <div class="msg-text">${escapeHtml(msg.content)}</div>
        </div>`;
    }

    async function copyToClipboard(imei, btn) {
        try {
            await navigator.clipboard.writeText(imei);
            const originalIcon = btn.innerHTML;
            btn.innerHTML = icons.check;
            btn.style.color = '#00a884';
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.style.color = '';
            }, 2000);
            showToast('Kopyalandı');
        } catch (err) {
            console.error('Copy Error:', err);
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatTime(d) {
        try {
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
        } catch (e) { return '--:--'; }
    }

    function scrollToBottom() {
        const content = document.getElementById('imei-content');
        if (content) {
            content.scrollTo({
                top: content.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    function showToast(m) {
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(t => t.remove());

        const t = document.createElement('div');
        t.className = 'toast';
        t.innerText = m;
        document.body.appendChild(t);
        setTimeout(() => { if (t) t.remove(); }, 3000);
    }

    function initFirebase() {
        if (db) return;
        const config = {
            apiKey: "AIzaSyBgcQQexhreb-k68wpHZMi_mjLk36x-NR0",
            authDomain: "enes-ozer.firebaseapp.com",
            databaseURL: "https://enes-ozer-default-rtdb.europe-west1.firebasedatabase.app",
            projectId: "enes-ozer",
            storageBucket: "enes-ozer.firebasestorage.app",
            messagingSenderId: "875215763332",
            appId: "1:875215763332:web:998e091db19db86741cfd1",
            measurementId: "G-5TJM9QHZDQ"
        };
        try {
            if (!firebase.apps.length) firebase.initializeApp(config);
            db = firebase.firestore();
            console.log('IMEI: Firebase Connected.');
        } catch (err) {
            console.error('Firebase Init Error:', err);
        }
    }

    init();
})();
