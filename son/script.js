/* =========================================
   1. AYARLAR VE BAŞLANGIÇ
   ========================================= */

const SERVICE_ID = "service_kyxnckz";
const TEMPLATE_ID = "template_5f663ql"; 
const PUBLIC_KEY = "0mxejVk8bQUSNmFkE";

// EmailJS Başlatma
(function(){ 
    try { emailjs.init(PUBLIC_KEY); } catch(e){ console.log("EmailJS başlatılamadı"); } 
})();

// Firebase Ayarları
const firebaseConfig = {
    apiKey: "AIzaSyCKN9fqCIICYkyLBtqGu535TUKnNhx3ZvU",
    authDomain: "smartschedule-902ef.firebaseapp.com",
    databaseURL: "https://smartschedule-902ef-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smartschedule-902ef",
    storageBucket: "smartschedule-902ef.firebasestorage.app",
    messagingSenderId: "619376898763",
    appId: "1:619376898763:web:d34fca9a25fd8253f4e14e",
    measurementId: "G-XMWVJRE03C"
};

let db;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
        db = firebase.database();
    }
} catch (err) { console.error("Firebase Hatası:", err); }

/* --- GLOBAL DEĞİŞKENLER --- */
let generatedCode = null;
let regData = {};
let tasks = [];
let currentWeekStart = new Date();
let isEditing = false;
let currentEditingId = null;

/* =========================================
   GÜVENLİ ADMIN GİRİŞİ (TEK ŞİFRE)
   ========================================= */
function adminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    const btn = document.querySelector('button[type="submit"]');

    if (!email || !pass) { alert("Lütfen alanları doldurun."); return; }
    if (!db) { alert("Veritabanı bağlantısı yok!"); return; }

    // SADECE BU MAİL ADRESİ ADMIN OLABİLİR (Ama şifreyi veritabanından soruyoruz)
    const ALLOWED_ADMIN_EMAIL = "abus.sahin34@gmail.com";

    if (email !== ALLOWED_ADMIN_EMAIL) {
        alert("⛔ Bu e-posta adresi ile yönetici girişi yapılamaz!");
        return;
    }

    btn.innerText = "Kontrol ediliyor..."; 
    btn.disabled = true;

    // Veritabanından Admini Sorgula
    db.ref('users').orderByChild('email').equalTo(email).once('value')
    .then((snapshot) => {
        let isAdmin = false;
        
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const user = child.val();
                // Şifre kontrolü sadece veritabanındaki veri ile yapılır
                if (user.pass === pass) {
                    isAdmin = true;
                }
            });
        }

        if (isAdmin) {
            sessionStorage.setItem('adminAuth', 'TRUE');
            window.location.href = "admin-panel.html";
        } else {
            alert("❌ Hatalı Şifre! (Şifrenizi unuttuysanız kullanıcı girişinden sıfırlayabilirsiniz)");
            btn.innerText = "Giriş Yap";
            btn.disabled = false;
        }
    })
    .catch((err) => {
        alert("Hata: " + err.message);
        btn.innerText = "Giriş Yap";
        btn.disabled = false;
    });
}

/* =========================================
   KULLANICI GİRİŞİ
   ========================================= */
function loginUser() {
    const e = document.getElementById('loginEmail').value.trim();
    const p = document.getElementById('loginPass').value.trim();
    const btn = document.querySelector('button[type="submit"]');
    const errorMsg = document.getElementById('loginError');

    if(errorMsg) errorMsg.style.display = 'none';
    if(!db) { alert("Veritabanı hatası."); return; }

    btn.innerText = "Kontrol ediliyor..."; btn.disabled = true;

    db.ref('users').orderByChild('email').equalTo(e).once('value')
    .then((snapshot) => {
        let foundUser = null;
        if(snapshot.exists()) {
            snapshot.forEach((child) => {
                const user = child.val();
                if (user.pass === p) foundUser = user;
            });
        }

        if (foundUser) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('currentUserFullName', foundUser.name + " " + foundUser.surname);
            localStorage.setItem('currentUserEmail', foundUser.email);
            window.location.href = "dashboard.html";
        } else {
            if(errorMsg) errorMsg.style.display = 'block';
            else alert("Hatalı E-posta veya Şifre!");
            btn.innerText = "Giriş Yap"; btn.disabled = false;
        }
    })
    .catch((err) => {
        alert("Giriş Hatası: " + err.message);
        btn.innerText = "Giriş Yap"; btn.disabled = false;
    });
}

/* =========================================
   TAKVİM VE GÖREVLER
   ========================================= */
function initCalendar() { 
    currentWeekStart = getMonday(new Date()); 
    const timeLabels = document.getElementById('timeLabels');
    if(timeLabels) {
        timeLabels.innerHTML = "";
        for(let i=0; i<24; i+=2) {
            const timeStr = (i < 10 ? "0" + i : i) + ".00";
            const div = document.createElement('div');
            div.className = "time-slot-label"; div.innerText = timeStr;
            timeLabels.appendChild(div);
        }
    }
    renderCalendar(); 
}

function changeWeek(offset) { currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7)); renderCalendar(); }
function jumpToWeek(dateStr) {
    if(!dateStr) return;
    const selectedDate = new Date(dateStr);
    currentWeekStart = getMonday(selectedDate);
    renderCalendar();
}

function renderCalendar() {
    if(!document.getElementById('currentWeekRange')) return;
    document.querySelectorAll('.day-tasks').forEach(div => div.innerHTML = "");
    
    let weekEnd = new Date(currentWeekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const options = { day: 'numeric', month: 'long' };
    document.getElementById('currentWeekRange').innerText = `${currentWeekStart.toLocaleDateString('tr-TR', options)} - ${weekEnd.toLocaleDateString('tr-TR', options)}`;

    const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

    for (let i = 0; i < 7; i++) {
        let currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentDay.getDate() + i);
        let dayIndex = currentDay.getDay(); 
        let dateStr = currentDay.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric' });
        
        let headerEl = document.getElementById(`header-${dayIndex}`);
        if(headerEl) {
            let iconHtml = "";
            if(dayIndex === 6) iconHtml = `<i class="fa-solid fa-mug-hot" style="font-size:0.9rem; margin-bottom:4px;"></i>`; 
            if(dayIndex === 0) iconHtml = `<i class="fa-solid fa-sun" style="font-size:0.9rem; margin-bottom:4px;"></i>`;
            headerEl.innerHTML = `${iconHtml}<span style="font-size:1rem;">${dayNames[dayIndex]}</span><span style="font-size:0.8rem; font-weight:normal; opacity:0.8; margin-top:2px;">(${dateStr})</span>`;
        }

        let dateIso = formatDate(currentDay);
        let dailyTasks = tasks.filter(t => t.date === dateIso);
        dailyTasks.sort((a, b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));

        const column = document.querySelector(`#day-${dayIndex} .day-tasks`);
        if(column) {
            dailyTasks.forEach(task => {
                const card = document.createElement('div'); card.className = 'task-card';
                card.onclick = () => openEditModal(task.id);
                card.innerHTML = `
                    <div class="edit-indicator"><i class="fa-solid fa-pen"></i></div>
                    <div class="time-badge"><i class="fa-regular fa-clock"></i> ${task.startTime || '?'} - ${task.endTime || '?'}</div>
                    <span class="task-title">${task.name}</span>
                    <div class="task-desc">${task.desc || '-'}</div>
                `;
                column.appendChild(card);
            });
        }
    }
}

function addTask() {
    const name = document.getElementById('taskName').value;
    const desc = document.getElementById('taskDesc').value;
    const date = document.getElementById('taskDate').value;
    const startTime = document.getElementById('taskStartTime').value;
    const endTime = document.getElementById('taskEndTime').value;
    
    if(!name || !date || !startTime || !endTime) { alert("Lütfen tüm alanları doldurun."); return; }
    if(endTime < startTime) { alert("Hata: Bitiş saati başlangıçtan önce olamaz."); return; }

    if (isEditing) {
        const taskIndex = tasks.findIndex(t => t.id === currentEditingId);
        if (taskIndex > -1) {
            tasks[taskIndex] = { id: currentEditingId, name, desc, date, startTime, endTime };
            alert("✅ Görev Güncellendi!");
            resetForm();
        }
    } else {
        const newTask = { id: Date.now(), name, desc, date, startTime, endTime };
        tasks.push(newTask);
        alert("✅ Görev Eklendi!");
        resetForm();
    }
    renderCalendar();
}

function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    currentEditingId = id;
    document.getElementById('modalTaskName').value = task.name;
    document.getElementById('modalTaskDate').value = task.date;
    document.getElementById('modalTaskStartTime').value = task.startTime;
    document.getElementById('modalTaskEndTime').value = task.endTime;
    document.getElementById('modalTaskDesc').value = task.desc;
    document.getElementById('editModal').style.display = 'flex';
}
function closeModal() { document.getElementById('editModal').style.display = 'none'; currentEditingId = null; }
function saveModalChanges() {
    if (!currentEditingId) return;
    const name = document.getElementById('modalTaskName').value;
    const date = document.getElementById('modalTaskDate').value;
    const startTime = document.getElementById('modalTaskStartTime').value;
    const endTime = document.getElementById('modalTaskEndTime').value;
    const desc = document.getElementById('modalTaskDesc').value;
    if(!name || !date || !startTime || !endTime) { alert("Boş alan bırakmayınız."); return; }
    const index = tasks.findIndex(t => t.id === currentEditingId);
    if (index > -1) {
        tasks[index] = { id: currentEditingId, name, desc, date, startTime, endTime };
        alert("✅ Görev Güncellendi!");
        closeModal();
        renderCalendar();
    }
}
function deleteTaskFromModal() {
    if (!currentEditingId) return;
    if(confirm("Silmek istediğinize emin misiniz?")) {
        tasks = tasks.filter(t => t.id !== currentEditingId);
        closeModal();
        renderCalendar();
    }
}
window.onclick = function(event) { const modal = document.getElementById('editModal'); if (event.target == modal) { closeModal(); } }
function resetForm() {
    document.getElementById('taskName').value = ""; document.getElementById('taskDesc').value = "";
    document.getElementById('taskDate').value = ""; document.getElementById('taskStartTime').value = "";
    document.getElementById('taskEndTime').value = "";
    isEditing = false; currentEditingId = null;
    const addBtn = document.getElementById('addBtn');
    if(addBtn) addBtn.innerHTML = '<i class="fa-solid fa-check"></i> Takvime Ekle';
    const cancelBtn = document.getElementById('cancelBtn');
    if(cancelBtn) cancelBtn.style.display = 'none';
}

/* --- YARDIMCI FONKSİYONLAR --- */
function getMonday(d) { d = new Date(d); var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); return new Date(d.setDate(diff)); }
function formatDate(date) { let d = new Date(date), month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear(); if (month.length < 2) month = '0' + month; if (day.length < 2) day = '0' + day; return [year, month, day].join('-'); }
function togglePassword(inputId, icon) { const input = document.getElementById(inputId); if(input.type==="password"){ input.type="text"; icon.classList.replace("fa-eye","fa-eye-slash"); } else{ input.type="password"; icon.classList.replace("fa-eye-slash","fa-eye"); } }
function isStrongPassword(p) { return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/.test(p); }

/* --- KAYIT & SİFRE SIFIRLAMA --- */
function sendVerificationCode() {
    const name = document.getElementById('regName').value; const surname = document.getElementById('regSurname').value; const dob = document.getElementById('regDob').value; const email = document.getElementById('regEmail').value; const pass = document.getElementById('regPass').value; const sendBtn = document.getElementById('sendBtn');
    if(!name || !surname || !dob || !email || !pass) { alert("Doldurunuz!"); return; }
    if(!isStrongPassword(pass)) { alert("Şifre zayıf!"); return; }
    sendBtn.disabled = true; sendBtn.innerText = "Kontrol...";
    db.ref('users').orderByChild('email').equalTo(email).once('value').then((s) => {
        if(s.exists()){ alert("Bu mail zaten kayıtlı!"); sendBtn.disabled = false; sendBtn.innerText="Gönder"; }
        else {
            generatedCode = Math.floor(100000 + Math.random() * 900000); regData = {name, surname, dob, email, pass};
            emailjs.send(SERVICE_ID, TEMPLATE_ID, {email, code:generatedCode}).then(() => { alert("Kod gönderildi!"); document.getElementById('step1').style.display='none'; document.getElementById('step2').style.display='block'; });
        }
    });
}
function verifyAndRegister() {
    const c = document.getElementById('enteredCode').value; const btn = document.querySelector('#step2 button');
    if(c==generatedCode){ btn.innerText="Kaydediliyor..."; btn.disabled=true; db.ref('users').push({...regData, date:new Date().toLocaleString()}, (e)=>{ if(!e){alert("Başarılı!"); window.location.href="index.html";} else{alert("Hata!"); btn.disabled=false;} }); } else { alert("Kod hatalı!"); }
}

/* ŞİFRE SIFIRLAMA (ADMIN & USER ORTAK) */
function sendResetCode() {
    const email = document.getElementById('resetEmail').value;
    const btn = document.getElementById('resetSendBtn');
    if (!email) { alert("Lütfen e-posta girin."); return; }
    
    btn.innerText = "Aranıyor..."; btn.disabled = true;

    db.ref('users').orderByChild('email').equalTo(email).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            generatedCode = Math.floor(100000 + Math.random() * 900000);
            emailjs.send(SERVICE_ID, TEMPLATE_ID, { email: email, code: generatedCode }).then(() => {
                alert("Kod gönderildi!");
                document.getElementById('resetStep1').style.display = 'none';
                document.getElementById('resetStep2').style.display = 'block';
                localStorage.setItem('resetEmailTemp', email);
            });
        } else {
            alert("Bu mail kayıtlı değil!");
            btn.disabled = false; btn.innerText = "Kod Gönder";
        }
    });
}

function verifyAndResetPassword() {
    const code = document.getElementById('resetCode').value;
    const newPass = document.getElementById('newPass').value;
    const email = localStorage.getItem('resetEmailTemp');
    
    if(!isStrongPassword(newPass)) { alert("Şifre zayıf!"); return; }
    
    if (code == generatedCode) {
        db.ref('users').orderByChild('email').equalTo(email).once('value').then((snapshot) => {
            snapshot.forEach((child) => {
                db.ref('users/' + child.key).update({ pass: newPass }).then(() => {
                    alert("Şifre başarıyla değiştirildi! Yeni şifrenizle giriş yapabilirsiniz.");
                    window.location.href = "index.html"; // Admin de olsa user da olsa girişe at
                });
            });
        });
    } else { alert("Hatalı kod!"); }
}

/* --- OTURUM YÖNETİMİ --- */
function loadUserProfile(){ const n=localStorage.getItem('currentUserFullName'); const m=localStorage.getItem('currentUserEmail'); if(n && document.getElementById('displayFullName')) {document.getElementById('displayFullName').innerText=n.toUpperCase(); document.getElementById('userAvatar').src=`https://ui-avatars.com/api/?name=${n}&background=f97316&color=fff`;} if(m && document.getElementById('displayEmail')) document.getElementById('displayEmail').innerText=m; }
function checkAuth(){ if(localStorage.getItem('isLoggedIn')!=='true') window.location.href="index.html"; }
function logout(){ localStorage.clear(); window.location.href="index.html"; }
function logoutAdmin(){ sessionStorage.removeItem('adminAuth'); window.location.href="index.html"; }
function checkAdminSession(){ if(sessionStorage.getItem('adminAuth')!=='TRUE') window.location.href="admin.html"; }
function loadAdminTable() {
    const tb = document.getElementById('userTableBody');
    if(!tb) return;
    db.ref('users').on('value', s=>{
        tb.innerHTML=""; let i=0; s.forEach(c=>{ i++; const u=c.val(); const row=document.createElement('tr'); row.innerHTML=`<td>${i}</td><td><strong>${u.name} ${u.surname}</strong><br><small>${u.email}</small></td><td>${u.dob}</td><td>${u.date}</td><td><button class="btn-delete" onclick="deleteUser('${c.key}')">Sil</button></td>`; tb.prepend(row); });
        if(document.getElementById('loadingMsg')) document.getElementById('loadingMsg').style.display='none';
    });
}
function deleteUser(k){ if(confirm("Silinsin mi?")) db.ref('users/'+k).remove(); }