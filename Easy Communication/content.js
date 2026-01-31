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
        panelCollapsed: true, // Panel state
        // Dinamik element selector'ları
        imeiSelector: '', // IMEI input/element selector
        techSelector: '', // Teknisyen adı element selector
        pickerMode: null, // 'imei' veya 'tech' - aktif seçim modu
        pendingDeleteIMEI: null // Silinecek IMEI
    };

    let db = null;
    let unsubSnapshot = null;
    let trackingInterval = null;
    let pickerOverlay = null; // Element picker overlay

    // Uzantı hala geçerli mi kontrol et
    function isExtensionValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    // Güvenli storage erişimi
    async function safeStorageGet(keys) {
        if (!isExtensionValid()) return null;
        try {
            return await chrome.storage.local.get(keys);
        } catch (e) {
            console.warn('Storage erişim hatası:', e.message);
            return null;
        }
    }

    async function safeStorageSet(data) {
        if (!isExtensionValid()) return false;
        try {
            await chrome.storage.local.set(data);
            return true;
        } catch (e) {
            console.warn('Storage yazma hatası:', e.message);
            return false;
        }
    }

    async function init() {
        try {
            const data = await safeStorageGet([
                'imei_username', 'tracked_imeis', 'expanded_techs',
                'target_url', 'panel_collapsed', 'imei_selector', 'tech_selector'
            ]);

            // Uzantı geçersizse çık
            if (!data) {
                console.warn('Extension context invalidated, stopping...');
                return;
            }

            state.username = data.imei_username || null;
            state.trackedIMEIs = data.tracked_imeis || [];
            state.expandedTechs = data.expanded_techs || {};
            state.targetUrl = data.target_url || '';
            state.panelCollapsed = data.panel_collapsed !== undefined ? data.panel_collapsed : true;
            state.imeiSelector = data.imei_selector || '';
            state.techSelector = data.tech_selector || '';

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

            if (state.username) {
                goToChat();
                loadTracking(); // Takip verilerini yükle
            }
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

                <!-- Geçmiş Butonu -->
                <button id="imei-history-btn" style="position:absolute; left:15px; top:15px; background:rgba(255,255,255,0.2); border:none; color:white; width:30px; height:30px; border-radius:50%; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Geçmiş Günler">📅</button>

                <div style="display:flex; align-items:center; justify-content:center; margin-bottom:5px; gap:10px;">
                    <div id="imei-status-dot" style="width:12px; height:12px; border-radius:50%; background:#ccc; box-shadow:0 0 5px rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.3);" title="Durum"></div>
                    <div id="imei-tech-name-display" style="font-size:12px; font-weight:500; opacity:0.95; font-style:italic; letter-spacing:0.5px;">
                        ✨ Created By <span style="font-weight:700; font-size:13px; background:linear-gradient(90deg, #fff, #ffd700, #fff, #ffd700, #fff); background-size:200% 100%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:shimmer 2.5s linear infinite;">Enes</span>
                    </div>
                </div>
                <style>
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                </style>
                <div id="imei-date-display" style="font-size:10px; opacity:0.8; margin-bottom:5px;">Bugün</div>
                <div id="imei-count-display" style="font-size:48px; font-weight:700; line-height:1.2;">0</div>
                <div style="font-size:11px;">Cihaz</div>
             </div>

             <div style="flex:1; overflow-y:auto; padding:15px;">
                <h4 style="font-size:13px; color:#667781; margin-bottom:10px; text-transform:uppercase;">Kayıt Geçmişi</h4>
                <div id="imei-tracking-list" style="display:flex; flex-direction:column; gap:8px;"></div>
             </div>

             <div style="padding:15px; background:white; border-top:1px solid #e9edef;">
                <button id="imei-reset-btn" class="btn-secondary" style="width:100%; border-color:#ea0038; color:#ea0038;">Bugünü Sıfırla</button>
             </div>
          </div>

          <!-- Geçmiş Günler Modalı -->
          <div id="imei-history-modal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width:320px; padding:20px; max-height:80vh; overflow-y:auto;">
                <h3 style="color:#111b21; margin-bottom:15px;">📅 Geçmiş Günler</h3>
                <div id="imei-history-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                <div class="modal-footer" style="margin-top:15px;">
                    <button id="imei-history-close" class="btn-primary" style="width:100%;">Kapat</button>
                </div>
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

          <!-- IMEI Silme Onay Modalı -->
          <div id="imei-delete-modal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width:300px; padding:20px;">
                <h3 style="color:#111b21;">🗑️ Kayıt Silinsin mi?</h3>
                <div id="imei-delete-info" style="background:#f8f9fa; border:1px solid #e9edef; border-radius:10px; padding:12px; margin:15px 0; text-align:center;">
                    <div style="font-size:11px; color:#8696a0; margin-bottom:4px;">SİLİNECEK IMEI</div>
                    <div id="imei-delete-value" style="font-family:'Roboto Mono', monospace; font-size:15px; color:#111b21; font-weight:600;"></div>
                </div>
                <p style="text-align:center; color:#667781; font-size:12px; margin-bottom:15px;">Bu işlem geri alınamaz.</p>
                <div class="modal-footer">
                    <button id="imei-delete-no" class="btn-secondary">İptal</button>
                    <button id="imei-delete-yes" class="btn-primary" style="background:#ea0038;">Sil</button>
                </div>
            </div>
          </div>

          <!-- Ayarlar Modalı (Geliştirilmiş) -->
           <div id="imei-settings-modal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width:320px; padding:20px;">
                <h3 style="color:#111b21; margin-bottom:15px;">⚙️ Takip Ayarları</h3>
                
                <!-- URL Ayarı -->
                <div style="margin-bottom:15px;">
                    <label style="font-size:12px; color:#667781; display:block; margin-bottom:5px;">Hedef URL (opsiyonel)</label>
                    <input type="text" id="imei-target-url-input" placeholder="Örn: site.com/sayfa" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:13px;">
                </div>

                <!-- IMEI Element Seçici -->
                <div style="margin-bottom:15px; padding:12px; background:#f0f2f5; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; color:#111b21; font-weight:600;">📱 IMEI Alanı</span>
                        <button id="imei-pick-imei-btn" class="btn-primary" style="padding:6px 12px; font-size:11px;">Seç</button>
                    </div>
                    <div id="imei-selector-display" style="font-size:10px; color:#667781; word-break:break-all; background:white; padding:6px 8px; border-radius:6px; min-height:20px;">
                        Henüz seçilmedi
                    </div>
                </div>

                <!-- Teknisyen Element Seçici -->
                <div style="margin-bottom:15px; padding:12px; background:#f0f2f5; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; color:#111b21; font-weight:600;">👤 Teknisyen Alanı</span>
                        <button id="imei-pick-tech-btn" class="btn-primary" style="padding:6px 12px; font-size:11px;">Seç</button>
                    </div>
                    <div id="imei-tech-selector-display" style="font-size:10px; color:#667781; word-break:break-all; background:white; padding:6px 8px; border-radius:6px; min-height:20px;">
                        Henüz seçilmedi
                    </div>
                </div>

                <p style="font-size:10px; color:#8696a0; text-align:center; margin-bottom:15px;">
                    💡 "Seç" butonuna tıklayıp sayfadan ilgili alanı seçin.
                </p>

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
            await safeStorageSet({ 'panel_collapsed': state.panelCollapsed });

            // Panel açıldıysa mesajları yükle, kapandıysa durdur
            if (!state.panelCollapsed) {
                loadMessages();
            } else {
                stopMessages();
            }

            // Sayfa layoutunu tetikle
            window.dispatchEvent(new Event('resize'));
        };

        if (closeBtn) closeBtn.onclick = async () => {
            state.panelCollapsed = true;
            applyPanelState();
            await safeStorageSet({ 'panel_collapsed': true });

            // Mesaj dinlemeyi durdur
            stopMessages();

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
            // Mevcut değerleri göster
            document.getElementById('imei-target-url-input').value = state.targetUrl || '';
            document.getElementById('imei-selector-display').textContent = state.imeiSelector || 'Henüz seçilmedi';
            document.getElementById('imei-tech-selector-display').textContent = state.techSelector || 'Henüz seçilmedi';
            settingsModal.style.display = 'flex';
        };
        if (settingsCancel) settingsCancel.onclick = () => {
            settingsModal.style.display = 'none';
            cancelPicker(); // Picker aktifse kapat
        };
        if (settingsSave) settingsSave.onclick = handleSaveSettings;

        // Element Picker Butonları
        const pickImeiBtn = document.getElementById('imei-pick-imei-btn');
        const pickTechBtn = document.getElementById('imei-pick-tech-btn');

        if (pickImeiBtn) pickImeiBtn.onclick = () => startPicker('imei');
        if (pickTechBtn) pickTechBtn.onclick = () => startPicker('tech');

        // History (Geçmiş) Logic
        const historyBtn = document.getElementById('imei-history-btn');
        const historyClose = document.getElementById('imei-history-close');

        if (historyBtn) historyBtn.onclick = showHistoryModal;
        if (historyClose) historyClose.onclick = () => {
            document.getElementById('imei-history-modal').style.display = 'none';
        };

        // IMEI Silme Modalı Logic
        const deleteModal = document.getElementById('imei-delete-modal');
        const deleteNo = document.getElementById('imei-delete-no');
        const deleteYes = document.getElementById('imei-delete-yes');

        if (deleteNo) deleteNo.onclick = () => {
            deleteModal.style.display = 'none';
            state.pendingDeleteIMEI = null;
        };

        if (deleteYes) deleteYes.onclick = async () => {
            if (state.pendingDeleteIMEI) {
                await deleteTrackedIMEI(state.pendingDeleteIMEI);
                state.pendingDeleteIMEI = null;
            }
            deleteModal.style.display = 'none';
        };

        // Silme butonları için event delegation (tracking list üzerinde)
        const trackingList = document.getElementById('imei-tracking-list');
        if (trackingList) {
            trackingList.onclick = (e) => {
                const deleteBtn = e.target.closest('.imei-delete-btn');
                if (deleteBtn) {
                    e.stopPropagation(); // Grup açılmasını engelle
                    const imei = deleteBtn.getAttribute('data-imei');
                    showDeleteConfirm(imei);
                }
            };
        }
    }

    // IMEI Silme onay modalını göster
    function showDeleteConfirm(imei) {
        state.pendingDeleteIMEI = imei;
        document.getElementById('imei-delete-value').textContent = imei;
        document.getElementById('imei-delete-modal').style.display = 'flex';
    }

    // IMEI'yi sil
    async function deleteTrackedIMEI(imei) {
        // state.trackedIMEIs'den sil
        state.trackedIMEIs = state.trackedIMEIs.filter(item => item.imei !== imei);

        // Storage'ı güncelle
        await safeStorageSet({ 'tracking_today': state.trackedIMEIs });

        // Listeyi yeniden render et
        renderTrackingList();

        showToast(`🗑️ IMEI silindi`);
    }

    async function handleSaveSettings() {
        const input = document.getElementById('imei-target-url-input');
        const val = input.value.trim();
        state.targetUrl = val;

        // Tüm ayarları kaydet
        await chrome.storage.local.set({
            'target_url': val,
            'imei_selector': state.imeiSelector,
            'tech_selector': state.techSelector
        });

        document.getElementById('imei-settings-modal').style.display = 'none';
        cancelPicker(); // Picker'ı kapat
        showToast('✅ Ayarlar Kaydedildi');

        // Takibi yeniden başlat
        startTracking();
    }

    // --- ELEMENT PICKER SİSTEMİ ---

    // Unique CSS selector oluştur
    function getUniqueSelector(element) {
        if (!element || element === document.body) return '';

        // ID varsa en kısa yol
        if (element.id) {
            return `#${element.id}`;
        }

        // Class + nth-child kombinasyonu
        let path = [];
        let current = element;

        while (current && current !== document.body && path.length < 5) {
            let selector = current.tagName.toLowerCase();

            // Benzersiz class varsa kullan
            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
                if (classes.length > 0) {
                    selector += '.' + classes.slice(0, 2).join('.');
                }
            }

            // nth-child ekle (aynı selector'a sahip kardeşler varsa)
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(el => {
                    if (el.tagName !== current.tagName) return false;
                    if (current.className && el.className !== current.className) return false;
                    return true;
                });
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-child(${index})`;
                }
            }

            path.unshift(selector);
            current = parent;
        }

        return path.join(' > ');
    }

    // Element picker başlat
    function startPicker(mode) {
        state.pickerMode = mode;

        // Modal'ı gizle
        document.getElementById('imei-settings-modal').style.display = 'none';

        // Overlay oluştur (sadece bilgi göstermek için, pointer-events: none)
        if (!pickerOverlay) {
            pickerOverlay = document.createElement('div');
            pickerOverlay.id = 'imei-picker-overlay';
            pickerOverlay.innerHTML = `
                <div id="imei-picker-tooltip" style="
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #111b21;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 10px;
                    font-size: 14px;
                    z-index: 2147483647;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                ">
                    🎯 <strong>${mode === 'imei' ? 'IMEI' : 'Teknisyen'}</strong> alanını tıklayın | <span style="opacity:0.7">ESC: İptal</span>
                </div>
            `;
            pickerOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2147483646;
                pointer-events: none;
            `;
            document.body.appendChild(pickerOverlay);
        } else {
            pickerOverlay.querySelector('#imei-picker-tooltip strong').textContent = mode === 'imei' ? 'IMEI' : 'Teknisyen';
            pickerOverlay.style.display = 'block';
        }

        // Body'ye cursor style ekle
        document.body.style.cursor = 'crosshair';

        // Highlight box (TIKLANABİLİR)
        let highlightBox = document.getElementById('imei-picker-highlight');
        if (!highlightBox) {
            highlightBox = document.createElement('div');
            highlightBox.id = 'imei-picker-highlight';
            highlightBox.style.cssText = `
                position: fixed;
                border: 3px solid #00a884;
                background: rgba(0, 168, 132, 0.3);
                z-index: 2147483645;
                transition: all 0.1s ease;
                border-radius: 4px;
                cursor: pointer;
            `;
            document.body.appendChild(highlightBox);

            // Highlight box'a tıklama
            highlightBox.addEventListener('click', () => {
                if (state.pickerMode && state.lastHoveredElement) {
                    selectElement(state.lastHoveredElement);
                }
            });
        }
        highlightBox.style.display = 'block';

        // Event listener'ları ekle
        console.log('🎯 Picker başlatıldı, mode:', mode);
        document.addEventListener('mousemove', handlePickerMove, true);
        document.addEventListener('keydown', handlePickerKeydown, true);
    }

    // Son hover edilen elementi sakla
    state.lastHoveredElement = null;

    // Mouse hareket - elementi highlight et
    function handlePickerMove(e) {
        if (!state.pickerMode) return;

        const highlightBox = document.getElementById('imei-picker-highlight');
        if (!highlightBox) return;

        const target = e.target;

        // Panel ve overlay elementlerini atla
        if (target.closest('#imei-panel-container') ||
            target.closest('#imei-picker-overlay') ||
            target.id === 'imei-picker-highlight') {
            return;
        }

        // Son hover edilen elementi sakla
        state.lastHoveredElement = target;

        const rect = target.getBoundingClientRect();
        highlightBox.style.display = 'block';
        highlightBox.style.left = rect.left + 'px';
        highlightBox.style.top = rect.top + 'px';
        highlightBox.style.width = rect.width + 'px';
        highlightBox.style.height = rect.height + 'px';
    }

    // Element seçim işlemi
    function selectElement(element) {
        if (!state.pickerMode || !element) return;

        // Panel elementlerini atla
        if (element.closest('#imei-panel-container') || element.closest('#imei-picker-overlay')) {
            return;
        }

        console.log('🎯 Element seçildi:', element);
        const selector = getUniqueSelector(element);
        console.log('🎯 Selector:', selector);

        const currentMode = state.pickerMode;

        if (currentMode === 'imei') {
            state.imeiSelector = selector;
            document.getElementById('imei-selector-display').textContent = selector || 'Seçilemedi';
        } else if (currentMode === 'tech') {
            state.techSelector = selector;
            document.getElementById('imei-tech-selector-display').textContent = selector || 'Seçilemedi';
        }

        // Picker'ı kapat ve modal'ı aç
        cancelPicker();
        document.getElementById('imei-settings-modal').style.display = 'flex';

        showToast(`✅ ${currentMode === 'imei' ? 'IMEI' : 'Teknisyen'} alanı seçildi`);
    }

    // ESC tuşu ile iptal
    function handlePickerKeydown(e) {
        if (e.key === 'Escape') {
            cancelPicker();
            document.getElementById('imei-settings-modal').style.display = 'flex';
        }
    }

    // Picker'ı kapat
    function cancelPicker() {
        state.pickerMode = null;

        // Cursor'ı normale döndür
        document.body.style.cursor = '';

        if (pickerOverlay) {
            pickerOverlay.style.display = 'none';
        }

        const highlightBox = document.getElementById('imei-picker-highlight');
        if (highlightBox) {
            highlightBox.style.display = 'none';
        }

        // lastHoveredElement'i temizle
        state.lastHoveredElement = null;

        document.removeEventListener('mousemove', handlePickerMove, true);
        document.removeEventListener('keydown', handlePickerKeydown, true);
    }

    // --- LOKAL TRACKING LOGIC (Firebase bağımsız) ---

    // Türkiye saatine göre bugünün tarihini al (YYYY-MM-DD)
    function getTurkeyDate() {
        const now = new Date();
        const turkeyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const year = turkeyTime.getFullYear();
        const month = String(turkeyTime.getMonth() + 1).padStart(2, '0');
        const day = String(turkeyTime.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Türkiye saatini al (HH:MM)
    function getTurkeyTime() {
        return new Date().toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Istanbul'
        });
    }

    // Gün değişimi kontrolü ve otomatik arşivleme
    async function checkDayChange() {
        // Uzantı geçersizse interval'ı durdur
        if (!isExtensionValid()) {
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
            return;
        }

        const today = getTurkeyDate();
        const data = await safeStorageGet(['tracking_current_date', 'tracking_today', 'tracking_history']);

        if (!data) return; // Storage erişilemiyorsa çık

        const savedDate = data.tracking_current_date;
        const todayDevices = data.tracking_today || [];
        const history = data.tracking_history || {};

        // Eğer kayıtlı tarih bugünden farklıysa, günü arşivle
        if (savedDate && savedDate !== today && todayDevices.length > 0) {
            console.log(`📅 Gün değişti: ${savedDate} → ${today}, arşivleniyor...`);

            // Eski günü geçmişe ekle
            history[savedDate] = {
                devices: todayDevices,
                total: todayDevices.length,
                archivedAt: new Date().toISOString()
            };

            // Kaydet: geçmişi güncelle, bugünü sıfırla
            await safeStorageSet({
                'tracking_history': history,
                'tracking_today': [],
                'tracking_current_date': today
            });

            state.trackedIMEIs = [];
            showToast(`📅 ${savedDate} arşivlendi (${todayDevices.length} cihaz)`);
        } else if (!savedDate) {
            // İlk kullanım - tarihi kaydet
            await safeStorageSet({ 'tracking_current_date': today });
        }
    }

    function startTracking() {
        if (trackingInterval) clearInterval(trackingInterval);

        console.log('IMEI Takibi Başlatıldı (Lokal - 1sn)...');

        // İlk kontrol
        checkDayChange();

        trackingInterval = setInterval(async () => {
            // Uzantı geçersizse interval'ı durdur
            if (!isExtensionValid()) {
                clearInterval(trackingInterval);
                trackingInterval = null;
                console.warn('Extension invalidated, tracking stopped.');
                return;
            }

            if (!state.username) return;

            // Her dakikada bir gün değişimini kontrol et
            const seconds = new Date().getSeconds();
            if (seconds === 0) {
                await checkDayChange();
            }

            const dotEl = document.getElementById('imei-status-dot');

            // 1. URL Kontrolü (Dinamik)
            const currentUrl = window.location.href;

            // Eğer hedef URL belirlenmişse
            if (state.targetUrl && state.targetUrl.trim() !== '') {
                if (!currentUrl.includes(state.targetUrl)) {
                    // URL UYUMSUZ - Gri
                    if (dotEl) dotEl.style.background = '#e9edef';
                    return;
                }
            }

            // 2. DİNAMİK SELECTOR İLE DOM Okuma
            // Selector tanımlanmamışsa
            if (!state.imeiSelector || !state.techSelector) {
                if (dotEl) dotEl.style.background = '#ff9800'; // Turuncu
                return;
            }

            // Selector ile elementi bul
            let imeiElement = null;
            let techElement = null;

            try {
                imeiElement = document.querySelector(state.imeiSelector);
                techElement = document.querySelector(state.techSelector);
            } catch (e) {
                console.warn('Selector hatası:', e);
                if (dotEl) dotEl.style.background = '#ea0038'; // Kırmızı
                return;
            }

            if (!imeiElement || !techElement) {
                // Elementler bulunamadı - Sarı
                if (dotEl) dotEl.style.background = '#ffd700';
                return;
            }

            // Elementler bulundu - Yeşil Işık
            // IMEI: input value veya textContent
            let imei = '';
            if (imeiElement.tagName === 'INPUT' || imeiElement.tagName === 'TEXTAREA') {
                imei = imeiElement.value ? imeiElement.value.trim() : '';
            } else {
                imei = imeiElement.textContent ? imeiElement.textContent.trim() : '';
            }

            // Teknisyen: textContent
            const pageUser = techElement.textContent ? techElement.textContent.trim() : '';

            // Aktif - Yeşil
            if (dotEl) dotEl.style.background = '#00ff00';

            if (!imei || !pageUser) return;

            // Sadece geçerli IMEI formatını kaydet (15 haneli numara)
            const cleanImei = imei.replace(/\D/g, ''); // Sadece rakamları al
            if (cleanImei.length < 10) return; // En az 10 haneli olmalı

            // 3. Eşleşme ve Kayıt (LOKAL)
            const exists = state.trackedIMEIs.some(item => item.imei === cleanImei);

            if (!exists) {
                console.log(`✅ Yeni Kayıt Bulundu: ${cleanImei}`);
                await addTrackedIMEI(cleanImei, pageUser);
            }
        }, 1000);
    }

    // LOKAL olarak cihaz ekle (Firebase yok)
    async function addTrackedIMEI(imei, techName) {
        const newItem = {
            id: Date.now().toString(),
            imei: imei,
            name: techName || state.username,
            time: getTurkeyTime()
        };

        // State'e ekle
        state.trackedIMEIs.unshift(newItem);

        // Chrome storage'a kaydet
        await chrome.storage.local.set({
            'tracking_today': state.trackedIMEIs,
            'tracking_current_date': getTurkeyDate()
        });

        renderTrackingList();
        showToast(`✅ Eklendi`);
    }

    // Lokal verileri yükle (Firebase listener yerine)
    async function loadTracking() {
        console.log('Lokal Cihaz Verileri Yükleniyor...');

        // Gün değişimi kontrolü
        await checkDayChange();

        const data = await chrome.storage.local.get(['tracking_today', 'tracking_current_date']);
        state.trackedIMEIs = data.tracking_today || [];

        renderTrackingList();
    }

    async function handleResetTracking() {
        try {
            state.trackedIMEIs = [];
            await chrome.storage.local.set({ 'tracking_today': [] });
            renderTrackingList();
            document.getElementById('imei-reset-modal').style.display = 'none';
            showToast('🗑️ Bugünkü Sayaç Sıfırlandı');
        } catch (e) {
            console.error(e);
        }
    }

    // Geçmiş günleri göster
    async function showHistoryModal() {
        const data = await chrome.storage.local.get(['tracking_history']);
        const history = data.tracking_history || {};
        const listEl = document.getElementById('imei-history-list');

        const dates = Object.keys(history).sort().reverse(); // En yeni önce

        if (dates.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; color:#8696a0; font-size:13px;">Henüz geçmiş kayıt yok.</div>';
        } else {
            listEl.innerHTML = dates.map(date => {
                const dayData = history[date];
                const total = dayData.total || dayData.devices?.length || 0;

                // Teknisyen bazlı özet
                const techStats = {};
                (dayData.devices || []).forEach(d => {
                    const name = d.name || 'Bilinmeyen';
                    techStats[name] = (techStats[name] || 0) + 1;
                });

                const techSummary = Object.entries(techStats)
                    .map(([name, count]) => `${name}: ${count}`)
                    .join(', ');

                // Tarihi formatla
                const [year, month, day] = date.split('-');
                const formattedDate = `${day}.${month}.${year}`;

                return `
                <div style="background:white; border-radius:12px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:600; color:#111b21;">📅 ${formattedDate}</span>
                        <span style="background:#00a884; color:white; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600;">${total} Cihaz</span>
                    </div>
                    <div style="font-size:11px; color:#667781; line-height:1.4;">${techSummary || 'Detay yok'}</div>
                </div>
                `;
            }).join('');
        }

        document.getElementById('imei-history-modal').style.display = 'flex';
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

        // Bugünün tarihini göster
        const dateEl = document.getElementById('imei-date-display');
        if (dateEl) {
            const today = getTurkeyDate();
            const [year, month, day] = today.split('-');
            dateEl.textContent = `📅 ${day}.${month}.${year}`;
        }

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
                    <button class="imei-delete-btn" data-imei="${item.imei}" title="Sil" style="
                        background: transparent;
                        border: none;
                        color: #ea0038;
                        cursor: pointer;
                        padding: 4px 6px;
                        border-radius: 4px;
                        font-size: 14px;
                        opacity: 0.6;
                        transition: opacity 0.2s;
                    ">🗑️</button>
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
        await safeStorageSet({ 'imei_username': val });
        state.username = val;

        // Inputu ve counterı temizle
        input.value = '';
        const counter = document.getElementById('imei-login-counter');
        if (counter) counter.textContent = '0/15';

        goToChat();
        startTracking(); // Takip hemen başlasın
    }

    async function handleLogout() {
        // Listener ve interval'ları kapat
        stopMessages();
        if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }

        // Listener flag'lerini sıfırla (tekrar giriş için)
        messagesInitialized = false;

        if (isExtensionValid()) {
            try { await chrome.storage.local.remove('imei_username'); } catch (e) { }
        }
        state.username = null;
        state.messages = [];
        state.trackedIMEIs = [];
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
        loadTracking();
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

    let messagesInitialized = false; // Listener koruma

    // Mesaj listener'ını durdur (panel kapatıldığında)
    function stopMessages() {
        if (unsubSnapshot) {
            unsubSnapshot();
            unsubSnapshot = null;
            messagesInitialized = false;
            console.log('📭 Mesaj dinleme durduruldu (Panel kapalı)');
        }
    }

    function loadMessages() {
        // Panel kapalıysa mesajları dinleme
        if (state.panelCollapsed) {
            console.log('Panel kapalı, mesajlar dinlenmiyor...');
            return;
        }

        if (!db) { setTimeout(loadMessages, 1000); return; }

        // Aynı listener'ın tekrar başlamasını engelle
        if (messagesInitialized && unsubSnapshot) {
            console.log('Messages listener zaten aktif, atlanıyor...');
            return;
        }

        if (unsubSnapshot) unsubSnapshot();

        console.log('Mesajlar Dinleniyor (Optimized - 50 limit)...');
        messagesInitialized = true;

        // İlk yükleme flag'i
        let isFirstLoad = true;

        unsubSnapshot = db.collection('messages')
            .orderBy('createdAt', 'asc')
            .limitToLast(50) // Mesaj limiti - 50'ye çıkarıldı
            .onSnapshot(snap => {
                // İlk yüklemede tüm dokümanları al
                if (isFirstLoad) {
                    state.messages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    isFirstLoad = false;
                } else {
                    // Sonraki güncellemelerde sadece değişiklikleri işle
                    snap.docChanges().forEach(change => {
                        const item = { id: change.doc.id, ...change.doc.data() };

                        if (change.type === 'added') {
                            const exists = state.messages.some(m => m.id === item.id);
                            if (!exists) {
                                state.messages.push(item);
                                // Limit'i koru (50)
                                if (state.messages.length > 50) {
                                    state.messages.shift();
                                }
                            }
                        } else if (change.type === 'modified') {
                            const idx = state.messages.findIndex(m => m.id === item.id);
                            if (idx !== -1) state.messages[idx] = item;
                        } else if (change.type === 'removed') {
                            state.messages = state.messages.filter(m => m.id !== item.id);
                        }
                    });
                }
                renderMessages();
                setTimeout(scrollToBottom, 100);
            }, err => {
                console.error('Listen Error:', err);
                messagesInitialized = false;
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
