const apiURL = "https://script.google.com/macros/s/AKfycbzUdw6sOc74FdtSFxKOUA1Uu236TXdc_E_eelUaVIct6LErZAkGiY_0wUSchWyCkjYM/exec";
const MASTER = {
  jenisKelamin: ["Laki-laki", "Perempuan"],
  agama: ["Islam", "Kristen", "Katholik", "Hindu", "Buddha"],
  statusKeluarga: ["Kepala Keluarga", "Istri", "Anak", "Famili Lain"],
  pekerjaan: ["Belum/Tidak Bekerja", "Ibu Rumah Tangga", "Pelajar/Mahasiswa", "Pensiunan", "Karyawan Swasta", "Pegawai Negeri Sipil", "Pegawai Honorer", "Wiraswasta", "Pedagang", "Petani/Pekebun", "Nelayan", "Buruh Harian Lepas", "Sopir", "Guru", "Dokter", "Bidan", "Perawat", "TNI", "Polri", "Lainnya"],
  statusHuni: ["huni", "sewa", "belum huni"]
};
// === 1. PALING ATAS: CONFIG & GLOBAL VARIABLE ===
let USER_ACCESS = 'viewer'; 

// HAPUS FUNCTION cekAkses() YG DUPLIKAT, PAKE INI AJA
function showTimeoutPopup() {
  // Bikin popup sederhana
  const popup = document.createElement('div');
  popup.id = 'timeout-popup';
  popup.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
    z-index: 9999; font-family: sans-serif;
  `;
  popup.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; text-align: center; max-width: 320px;">
      <h3 style="margin-top:0;">Sesi Berakhir</h3>
      <p>Waktu anda telah habis. Silakan login kembali.</p>
      <button onclick="document.body.removeChild(document.getElementById('timeout-popup'))" 
              style="padding:8px 16px; border:none; background:#2563eb; color:white; border-radius:6px; cursor:pointer;">
        OK
      </button>
    </div>
  `;
  document.body.appendChild(popup);
}

function cekAkses() {
  USER_ACCESS = localStorage.getItem('role') || 'viewer';
  return USER_ACCESS === 'admin';
}

function applyAkses() {
  const lastLogin = localStorage.getItem('lastLogin');
  const now = Date.now();
  const timeoutMs = 30 * 60 * 1000; // jam * menit * detik * 1000 milidetik
  // Auto logout 2 jam
  if (lastLogin && now - lastLogin > timeoutMs) { 
    localStorage.removeItem('role');
    localStorage.removeItem('lastLogin');
    // 1. Munculin popup
    showTimeoutPopup();
    // 2. Kembali ke page login
    // Kalau SPA: pake class
    document.body.classList.add('login-screen');
    document.body.classList.remove('admin-mode');
    // Kalau multi-page: pake redirect
    // window.location.href = '/login.html';
    return; // stop eksekusi biar gak lanjut cek admin
  }

  const isAdmin = cekAkses();
  
  // Kalo belum login = tampilin landing doang
  if (!isAdmin) {
    document.body.classList.add('login-screen');
  } else {
    document.body.classList.remove('login-screen');
    document.body.classList.add('admin-mode');
  }
  
  document.querySelectorAll('.admin-only').forEach(btn => {
    if (!isAdmin) {
      btn.classList.add('viewer-mode');
      btn.title = 'Klik untuk login sebagai admin';
    } else {
      btn.classList.remove('viewer-mode');
      btn.title = '';
    }
  });
}

let rawData = [], iuranData = [], iuranMap = {}, sortState = { key: '', asc: true };
const spinner = document.getElementById('spinner');
const $ = id => document.getElementById(id);

function showSpinner() { if (spinner) spinner.style.display = "flex"; }
function hideSpinner() { if (spinner) spinner.style.display = "none"; }
function escapeHtml(text){ return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function buatOption(arr, selectedValue = "") { return arr.map(val => `<option value="${val}" ${val === selectedValue? "selected" : ""}>${val}</option>`).join(""); }
function formatDateForInput(date) { if (!date) return ''; const d = new Date(date); if (isNaN(d)) return ''; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function formatRibu(num) { if (!num) return ''; num = Number(num); if (num >= 1000) return (num / 1000).toFixed(0) + 'K'; return num.toString(); }
function groupByKK(data){ let g = {}; data.forEach(r=>{ if(!g[r.no_kk]){g[r.no_kk] = [];} g[r.no_kk].push(r); }); return g; }
function getPeriode24Bulan() {
  let now = new Date();
  let tahun = now.getFullYear();
  let bulanIni = now.getMonth(); // 0=Jan, 11=Des
  let list = [];
  
  // 6 bulan tahun lalu: Jul-Des
  ["Jul","Agu","Sep","Okt","Nov","Des"].forEach((b,i) => {
    list.push({
      bulan: b, 
      tahun: tahun-1, 
      sudahLewat: true, // tahun lalu pasti udah lewat
      idx: i + 6 // Jul=6, Agu=7, dst
    });
  });
  
  // 12 bulan tahun ini: Jan-Des  
  ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"].forEach((b,i) => {
    list.push({
      bulan: b, 
      tahun: tahun, 
      sudahLewat: i <= bulanIni, // kalo index <= bulan sekarang = udah lewat
      idx: i // Jan=0, Feb=1, dst
    });
  });
  
  // 6 bulan tahun depan: Jan-Jun
  ["Jan","Feb","Mar","Apr","Mei","Jun"].forEach((b,i) => {
    list.push({
      bulan: b, 
      tahun: tahun+1, 
      sudahLewat: false, // tahun depan belum lewat
      idx: i
    });
  });
  
  return list;
}

async function postAPI(payload) {
  const res = await fetch(apiURL, { method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(payload) });
  return res.json();
}

function updateJam() {
  const now = new Date();
  const options = {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta'
  };
  document.getElementById('jam-wib').innerText = 
    now.toLocaleString('en-GB', options) + ' WIB';
}
updateJam();
setInterval(updateJam, 1000);


function loadData(){
  showSpinner();
  fetch(apiURL)
    .then(res => res.json())
    .then(data => {
      rawData = data.warga || [];
      iuranData = data.iuran || [];
      buildIuranMap();
      renderTableWarga();
      renderTableIuran();
      renderTableIuranHuni();

      try {
        renderDaftarBayarBulanIni();
      } catch (err) {
        console.error('Render daftar bayar gagal:', err);
      }
    })
    .catch(err => {
      console.error('Fetch data gagal:', err);
      alert("Gagal load data dari server");
    })
    .finally(() => hideSpinner());
}

function buildIuranMap(){
  iuranMap = {};
  iuranData.forEach(i => {
    const key = `${String(i.no_kk).trim()}|${String(i.bulan).trim().toLowerCase()}|${String(i.tahun).trim()}|${String(i.jenis).trim().toUpperCase()}`;
    iuranMap[key] = i;
  });
}

function renderTableWarga(){
  let grouped = groupByKK(rawData), html = "";
  Object.keys(grouped).forEach(kk => {
    let anggota = grouped[kk];
    let kepala = anggota.find(a => String(a.status_keluarga || "").toLowerCase().includes("kepala")) || anggota[0];
    let jmlAnggota = anggota.length;
    html += `<tr class="kk-row" data-kk="${kk}">
      <td><button class="toggle-btn" onclick="toggleDetail('${kk}')">▶</button>${kk}</td>
      <td>${kepala.nik || ''}</td><td>${kepala.nama || ''}</td><td>${kepala.jenis_kelamin || ''}</td>
      <td>${formatDateForInput(kepala.tanggal_lahir) || ''}</td><td>${kepala.agama || ''}</td>
      <td>Kepala Keluarga</td><td>${kepala.pekerjaan || ''}</td><td>${kepala.blok || ''}</td>
      <td>${kepala.no_rumah || ''}</td><td>${kepala.status_huni || ''}</td><td>${kepala.alamat || ''}</td>
      <td>${jmlAnggota} orang</td>
    </tr>`;
    anggota.forEach((r, i) => {
      html += `<tr class="detail-row detail-${kk}" data-kk="${kk}" data-nik="${r.nik || ''}" data-id="${r.id || ''}" style="display:none; background:#f9fafb">
        <td style="padding-left:30px;">▶</td>
        <td><input data-field="nik" value="${r.nik || ''}" disabled></td>
        <td><input data-field="nama" value="${r.nama || ''}" disabled></td>
        <td><select data-field="jenis_kelamin" disabled>${buatOption(MASTER.jenisKelamin, r.jenis_kelamin)}</select></td>
        <td><input type="date" data-field="tanggal_lahir" value="${formatDateForInput(r.tanggal_lahir)}" disabled></td>
        <td><select data-field="agama" disabled>${buatOption(MASTER.agama, r.agama)}</select></td>
        <td><select data-field="status_keluarga" disabled>${buatOption(MASTER.statusKeluarga, r.status_keluarga)}</select></td>
        <td><select data-field="pekerjaan" disabled>${buatOption(MASTER.pekerjaan, r.pekerjaan)}</select></td>
        <td><input data-field="blok" value="${r.blok || ''}" disabled></td>
        <td><input data-field="no_rumah" value="${r.no_rumah || ''}" disabled></td>
        <td><select data-field="status_huni" disabled>${buatOption(MASTER.statusHuni, r.status_huni)}</select></td>
        <td><input data-field="alamat" value="${r.alamat || ''}" disabled></td>
        <td>
          <button class="btn edit admin-only" onclick="toggleEditRow(this)">✏️</button>
          <button class="btn delete admin-only" onclick="hapusRow(this)">🗑️</button>
        </td>
      </tr>`;
    });
  });
  document.getElementById("bodyWarga").innerHTML = html;
}

function renderTableIuran(sortedArr = null){
  let grouped = groupByKK(rawData);
  let bulanList = getPeriode24Bulan();
  let arr = Object.keys(grouped).map(kk => {
    let anggota = grouped[kk], first = anggota[0];
    let kepala = anggota.find(a => String(a.status_keluarga || "").toLowerCase().includes("kepala")) || first;
    return { kk: kk, anggota, first, kepala, nama: kepala.nama || "", blok: first.blok || "", no_rumah: parseInt(first.no_rumah) || 0, status_huni: first.status_huni || "" };
  });
  if(sortedArr) arr = sortedArr;

  let header = `<tr><th onclick="sortTableIuran('blok')">Blok ⇅</th><th onclick="sortTableIuran('no_rumah')">No Rumah ⇅</th><th onclick="sortTableIuran('nama')">Kepala Keluarga ⇅</th><th onclick="sortTableIuran('status_huni')">Status Huni ⇅</th><th>POS</th><th>FASUM</th>`;
  bulanList.forEach(b=>{
  const bulanAngka = String(b.idx + 1).padStart(2, '0'); // idx 0=Jan=01
  header += `<th data-bulan="${b.tahun}-${bulanAngka}">${b.bulan}'${String(b.tahun).slice(2)}</th>`;
  });
  header += `</tr>`;
  document.getElementById("headerIuran").innerHTML = header;

  let body = "";
  arr.forEach(item => {
    let kk = item.kk, first = item.first, namaKK = item.nama;
    let tunggakan = 0;
    bulanList.forEach(b => {
      if (!b.sudahLewat) return;
      let bayar = iuranData.find(i=> String(i.no_kk).trim()===String(kk).trim() && String(i.bulan).trim().toLowerCase()===b.bulan.toLowerCase() && String(i.tahun).trim()===String(b.tahun));
      if(!bayar) tunggakan++;
    });
    let rowClass = tunggakan >= 3 ? 'class="row-tunggakan"' : '';
    body += `<tr ${rowClass}><td>${first.blok || "-"}</td><td>${first.no_rumah || "-"}</td><td>${namaKK}</td><td>${first.status_huni || "-"}</td>`;
    let bayarPos = iuranData.find(i => String(i.no_kk).trim() === kk && String(i.jenis).toUpperCase() === 'POS');
    body += bayarPos? `<td><span class="pos">☑ POS - 100K</span></td>` : `<td><span class="kosong">⬜ POS</span></td>`;
    let bayarFasum = iuranData.find(i => String(i.no_kk).trim() === kk && String(i.jenis).toUpperCase() === 'FASUM');
    body += bayarFasum? `<td><span class="fasum">☑ FASUM - 100K</span></td>` : `<td><span class="kosong">⬜ FASUM</span></td>`;
    bulanList.forEach(b => {
      let bayar = iuranMap[`${String(kk).trim()}|${String(b.bulan).trim().toLowerCase()}|${String(b.tahun).trim()}|KAS`] || iuranMap[`${String(kk).trim()}|${String(b.bulan).trim().toLowerCase()}|${String(b.tahun).trim()}|IPL`];
      let isi = `<span class="kosong">⬜</span>`;
      if(bayar){
        let nominal = formatRibu(bayar.nominal);
        if(String(bayar.jenis).toUpperCase() === "KAS") isi = `<span class="kas">KAS ${nominal}</span>`;
        else if(String(bayar.jenis).toUpperCase() === "IPL") {
          let nominalNum = Number(bayar.nominal), classIPL = "ipl";
          if(nominalNum === 60000) classIPL = "ipl-nonis"; else if(nominalNum === 50000) classIPL = "ipl-pengurus";
          isi = `<span class="${classIPL}">IPL ${nominal}</span>`;
        }
      }
      body += `<td>${isi}</td>`;
    });
    body += `</tr>`;
  });
  document.getElementById("bodyIuran").innerHTML = body;
  hitungTotalTunggakan();
}

function renderTableIuranHuni(sortedArr = null){
  let grouped = groupByKK(rawData);
  let bulanList = getPeriode24Bulan();
  let arr = Object.keys(grouped)
 .map(kk => {
    let anggota = grouped[kk];
    let first = anggota[0];
    let kepala = anggota.find(a => String(a.status_keluarga || "").toLowerCase().includes("kepala")) || first;
    return {
      kk, anggota, first, kepala,
      nama: kepala.nama || "",
      blok: first.blok || "",
      no_rumah: parseInt(first.no_rumah) || 0,
      status_huni: first.status_huni || ""
    };
  })
 .filter(item => {
    const s = String(item.status_huni).toLowerCase().trim(); // <-- UBAH SINI
    return s === "huni" || s === "sewa" || s.includes("huni"); // <-- UBAH SINI
  });

  if(sortedArr) arr = sortedArr;

  let header = `<tr><th onclick="sortTableIuran('blok')">Blok ⇅</th><th onclick="sortTableIuran('no_rumah')">No Rumah ⇅</th><th onclick="sortTableIuran('nama')">Kepala Keluarga ⇅</th><th onclick="sortTableIuran('status_huni')">Status Huni ⇅</th><th>POS</th><th>FASUM</th>`;
  bulanList.forEach(b=>{
  const bulanAngka = String(b.idx + 1).padStart(2, '0'); // idx 0=Jan=01
  header += `<th data-bulan="${b.tahun}-${bulanAngka}">${b.bulan}'${String(b.tahun).slice(2)}</th>`;
  });
  header += `</tr>`;
  document.getElementById("headerIuranHuni").innerHTML = header;

  let body = "";
  arr.forEach(item => {
    let kk = item.kk, first = item.first, namaKK = item.nama;
    let tunggakan = 0;
    bulanList.forEach(b => {
      if (!b.sudahLewat) return;
      let bayar = iuranData.find(i=> String(i.no_kk).trim()===String(kk).trim() && String(i.bulan).trim().toLowerCase()===b.bulan.toLowerCase() && String(i.tahun).trim()===String(b.tahun));
      if(!bayar) tunggakan++;
    });
    let rowClass = tunggakan >= 3 ? 'class="row-tunggakan"' : '';
    body += `<tr ${rowClass}><td>${first.blok || "-"}</td><td>${first.no_rumah || "-"}</td><td>${namaKK}</td><td>${first.status_huni || "-"}</td>`;
    let bayarPos = iuranData.find(i => String(i.no_kk).trim() === kk && String(i.jenis).toUpperCase() === 'POS');
    body += bayarPos? `<td><span class="pos">☑ POS - 100K</span></td>` : `<td><span class="kosong">⬜ POS</span></td>`;
    let bayarFasum = iuranData.find(i => String(i.no_kk).trim() === kk && String(i.jenis).toUpperCase() === 'FASUM');
    body += bayarFasum? `<td><span class="fasum">☑ FASUM - 100K</span></td>` : `<td><span class="kosong">⬜ FASUM</span></td>`;
    bulanList.forEach(b => {
      let bayar = iuranMap[`${String(kk).trim()}|${String(b.bulan).trim().toLowerCase()}|${String(b.tahun).trim()}|KAS`] || iuranMap[`${String(kk).trim()}|${String(b.bulan).trim().toLowerCase()}|${String(b.tahun).trim()}|IPL`];
      let isi = `<span class="kosong">⬜</span>`;
      if(bayar){
        let nominal = formatRibu(bayar.nominal);
        if(String(bayar.jenis).toUpperCase() === "KAS") isi = `<span class="kas">KAS ${nominal}</span>`;
        else if(String(bayar.jenis).toUpperCase() === "IPL") {
          let nominalNum = Number(bayar.nominal), classIPL = "ipl";
          if(nominalNum === 60000) classIPL = "ipl-nonis"; else if(nominalNum === 50000) classIPL = "ipl-pengurus";
          isi = `<span class="${classIPL}">IPL ${nominal}</span>`;
        }
      }
      body += `<td>${isi}</td>`;
    });
    body += `</tr>`;
  });
  document.getElementById("bodyIuranHuni").innerHTML = body;
  hitungTotalTunggakan();
}


function renderTableIuranSorted(arr){ renderTableIuran(arr); }

function hitungTotalTunggakan(){
  let grouped = groupByKK(rawData), bulanList = getPeriode24Bulan(), total = 0;
  Object.keys(grouped).forEach(kk=>{
    bulanList.forEach(b=>{
      // Skip kalo bulannya belum lewat
      if(!b.sudahLewat) return;
      
      let bayar = iuranData.find(i=> 
        String(i.no_kk).trim()===String(kk).trim() && 
        String(i.bulan).trim().toLowerCase()===b.bulan.toLowerCase() && 
        String(i.tahun).trim()===String(b.tahun)
      );
      if(!bayar) total += 50000;
    });
  });
  document.getElementById('totalTunggakan').innerText = 'Rp ' + total.toLocaleString('id-ID');
}

function hapusRow(btn){
  if (!cekAkses()) {
    openLoginModal();
    return;
  }

  let row = btn.closest('tr');
  let nik = row.dataset.nik;
  let id = row.dataset.id;

  if(!confirm(`Hapus data ${row.querySelector('[data-field="nama"]').value}?`)) return;

  if(!id) {
    alert('Data lama belum ada ID. Hapus manual di Google Sheets dulu.');
    return;
  }

  showSpinner();
  fetch(apiURL, {
    method: "POST",
    headers: {"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify({action:"deleteRow", id: id, nik: nik})
  })
 .then(res => res.json())
 .then(res => {
    if(res.status === "ok"){
      alert("Berhasil dihapus");
      row.remove();
      loadData(); // refresh
    } else {
      alert("Gagal: " + res.message);
    }
  })
 .catch(err => alert("Error: " + err.message))
 .finally(() => hideSpinner());
}

function toggleEditRow(btn){
  if (!cekAkses()) {
    openLoginModal();
    return;
  }
  let row = btn.closest('tr'), inputs = row.querySelectorAll('input, select'), isEditing = btn.classList.contains('edit');
  if(isEditing){
    inputs.forEach(el => el.disabled = false);
    btn.innerHTML = '💾'; btn.className = 'btn save'; btn.setAttribute('onclick', 'saveRow(this)');
  } else {

    inputs.forEach(el => el.disabled = true);
    btn.innerHTML = '✏️'; btn.className = 'btn edit'; btn.setAttribute('onclick', 'toggleEditRow(this)');
  }
}

function saveRow(btn){
  let row = btn.closest('tr'), obj = {
    no_kk: row.dataset.kk,
    id: row.dataset.id || '', // kalo kosong biarin kosong
    nik: row.dataset.nik
  };

  row.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
    obj[el.dataset.field] = el.value;
  });

  if(!obj.nik){ alert("NIK wajib diisi!"); return; }
  if(obj.no_kk &&!/^[0-9]{16}$/.test(obj.no_kk)){
    alert("No KK harus 16 digit angka!"); return;
  }

  showSpinner();
  fetch(apiURL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action:"updateRow", data: obj})
  })
 .then(res=>res.json()).then(res=>{
    if(res.status === "ok"){
      alert("Berhasil diupdate");
      row.querySelectorAll('input, select').forEach(el => el.disabled = true);
      btn.textContent = '✏️'; btn.className = 'btn edit';
      btn.setAttribute('onclick', 'toggleEditRow(this)');
      loadData();
    } else {
      alert("Gagal: " + res.message);
    }
  }).catch(err=> alert("Error: " + err.message)).finally(() => hideSpinner());
}

function sortTableIuran(key){
  if(sortState.key === key) sortState.asc =!sortState.asc; else { sortState.key = key; sortState.asc = true; }
  let grouped = groupByKK(rawData);
  let arr = Object.keys(grouped).map(kk => {
    let anggota = grouped[kk], first = anggota[0];
    let kepala = anggota.find(a=>String(a.status_keluarga || "").toLowerCase().includes("kepala"));
    return { kk: kk, blok: first.blok || '', no_rumah: parseInt(first.no_rumah) || 0, nama: kepala? kepala.nama : first.nama, status_huni: first.status_huni || '' };
  });
  arr.sort((a,b) => {
    let blokA = String(a.blok).toLowerCase(), blokB = String(b.blok).toLowerCase();
    if(blokA < blokB) return sortState.asc? -1 : 1;
    if(blokA > blokB) return sortState.asc? 1 : -1;
    if(a.no_rumah < b.no_rumah) return -1;
    if(a.no_rumah > b.no_rumah) return 1;
    if(key!== 'blok' && key!== 'no_rumah'){
      let valA = String(a[key]).toLowerCase(), valB = String(b[key]).toLowerCase();
      if(valA < valB) return sortState.asc? -1 : 1;
      if(valA > valB) return sortState.asc? 1 : -1;
    }
    return 0;
  });
  renderTableIuranSorted(arr);
}

function filterWarga(){
  let keyword = document.getElementById('searchWarga').value.toLowerCase().trim();
  const tbody = document.getElementById('bodyWarga');
  
  if (!keyword) {
    // Reset: tampilin semua KK, tutup semua detail
    tbody.querySelectorAll('tr').forEach(row => {
      if (row.classList.contains('kk-row')) {
        row.style.display = '';
        let btn = row.querySelector('.toggle-btn');
        if (btn) btn.textContent = '▶';
      } else if (row.classList.contains('detail-row')) {
        row.style.display = 'none';
      }
    });
    return;
  }

  let kkYangCocok = new Set();
  
  // 1. Loop semua row buat cek isinya
  tbody.querySelectorAll('tr').forEach(row => {
    let textGabungan = '';
    
    // Ambil text biasa
    textGabungan += row.innerText.toLowerCase();
    
    // Ambil value dari input & select
    row.querySelectorAll('input, select').forEach(el => {
      if (el.value) textGabungan += ' ' + el.value.toLowerCase();
    });
    
    if (textGabungan.includes(keyword)) {
      let kk = row.dataset.kk;
      if (kk) kkYangCocok.add(kk);
    }
  });
  
  // 2. Tampilin/sembunyiin
  tbody.querySelectorAll('tr').forEach(row => {
    let kk = row.dataset.kk;
    
    if (kkYangCocok.has(kk)) {
      row.style.display = 'table-row';
      // Kalo detail row, pastiin KK-nya expand
      if (row.classList.contains('detail-row')) {
        let btnKK = tbody.querySelector(`.kk-row[data-kk="${kk}"] .toggle-btn`);
        if (btnKK) btnKK.textContent = '▼';
      }
    } else {
      row.style.display = 'none';
    }
  });
}

function enableResize(tableId){
  const table = document.getElementById(tableId);
  const cols = table.querySelectorAll("th");
  cols.forEach(col => {
    const resizer = document.createElement("div");
    resizer.classList.add("resizer");
    col.appendChild(resizer);
    let startX, startWidth;
    resizer.addEventListener("mousedown", e => {
      startX = e.pageX; startWidth = col.offsetWidth;
      document.addEventListener("mousemove", resizeColumn);
      document.addEventListener("mouseup", stopResize);
    });
    function resizeColumn(e){ let newWidth = startWidth + (e.pageX - startX); col.style.width = newWidth + "px"; }
    function stopResize(){ document.removeEventListener("mousemove", resizeColumn); document.removeEventListener("mouseup", stopResize); }
  });
}

function toggleDetail(kk){
  let rows = document.querySelectorAll(`.detail-${kk}`);
  let btn = document.querySelector(`.kk-row[data-kk="${kk}"] .toggle-btn`);
  if(!rows.length) return;
  let isHidden = rows[0].style.display === "none";
  rows.forEach(r => r.style.display = isHidden? "table-row" : "none");
  if(btn) btn.textContent = isHidden? "▼" : "▶";
}

function openBayarModal(){
  document.getElementById('bayarModal').style.display = 'flex';
  let grouped = groupByKK(rawData);
  let selectKK = document.getElementById('selectKK');
  selectKK.innerHTML = '';
  Object.keys(grouped).forEach(kk=>{
    let kepala = grouped[kk].find(a=>String(a.status_keluarga||"").toLowerCase().includes("kepala")) || grouped[kk][0];
    let opt = document.createElement('option');
    opt.value = kk;
    opt.textContent = `${kk} - ${kepala.nama}`;
    selectKK.appendChild(opt);
  });
  let tahun = new Date().getFullYear();
  let selectTahun = document.getElementById('selectTahun');
  selectTahun.innerHTML = '';
  for(let t=tahun-1; t<=tahun+1; t++){
    let opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if(t===tahun) opt.selected = true;
    selectTahun.appendChild(opt);
  }
  loadBulanBayar();
}

function closeBayarModal(){
  document.getElementById('bayarModal').style.display = 'none';
  document.getElementById('bulanContainer').innerHTML = '';
}

function prosesLoginLanding() {
  const user = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value;
  
  const USER_ADMIN = 'admin'; // GANTI
  const PASS_ADMIN = 'admin123'; // GANTI
  
  if (user === USER_ADMIN && pass === PASS_ADMIN) {
    USER_ACCESS = 'admin';
    localStorage.setItem('role', 'admin');
    localStorage.setItem('lastLogin', Date.now()); // <-- TAMBAHIN INI
    document.body.classList.remove('login-screen');
    document.body.classList.add('admin-mode');
    applyAkses();
    loadData();
  } else {
    alert('Username atau Password salah!');
    document.getElementById('loginPassword').value = '';
  }
}

// Enter key buat submit
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginPassword').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') prosesLoginLanding();
  });
  document.getElementById('loginUsername').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') prosesLoginLanding();
  });
});
function prosesLogin() {
  const pass = document.getElementById('adminPassword').value;
  const PASS_ADMIN = 'admin123'; // GANTI INI
  
  if (pass === PASS_ADMIN) {
    USER_ACCESS = 'admin';
    localStorage.setItem('role', 'admin');
    applyAkses(); // Update tampilan
    closeLoginModal();
    alert('Login berhasil!');
    loadData();
  } else {
    alert('Password salah!');
  }
}

function backupJSON(){
  let data = { warga: rawData, iuran: iuranData };
  let blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup_rt_rw.json';
  a.click();
}

function openExcelModal(){
  document.getElementById('excelModal').style.display = 'flex';

  // Generate checkbox bulan
  let bulanList = getPeriode24Bulan();
  let html = '';
  bulanList.forEach(b => {
    html += `
      <div class="bulan-item">
        <input type="checkbox" id="excel_${b.bulan}_${b.tahun}" checked>
        <label for="excel_${b.bulan}_${b.tahun}">${b.bulan} '${String(b.tahun).slice(2)}</label>
      </div>
    `;
  });
  document.getElementById('excelBulanGrid').innerHTML = html;
}

function closeExcelModal(){
  document.getElementById('excelModal').style.display = 'none';
}

function prosesExportExcel(){
  showSpinner();
  setTimeout(() => {
    try {
      const jenisLaporan = document.getElementById('excelJenis').value;
      const periode = document.getElementById('excelPeriode').value;
      const pakeWarna = document.getElementById('excelWarna').checked;
      const hanyaTunggakan = document.getElementById('excelTunggakan').checked;
      const tampilNominal = jenisLaporan === 'ketua';

      if(typeof XLSX === 'undefined'){ alert('SheetJS belum load'); return; }
      
      // 1. Filter kolom bulan sesuai pilihan modal
      let bulanList = getPeriode24Bulan();
      let indexBulanDipilih = [0,1,2,3,4,5]; // Blok, No, Nama, Status, POS, FASUM

      if (periode === 'all') {
        bulanList.forEach((b, i) => indexBulanDipilih.push(i + 6));
      } else if (periode === 'tahun_ini') {
        let tahun = new Date().getFullYear();
        bulanList.forEach((b, i) => {
          if (b.tahun === tahun) indexBulanDipilih.push(i + 6);
        });
      } else if (periode === '6bulan') {
        let slice = bulanList.slice(-12, -6);
        slice.forEach((b) => {
          let idx = bulanList.indexOf(b);
          indexBulanDipilih.push(idx + 6);
        });
      } else if (periode === 'custom') {
        bulanList.forEach((b, i) => {
          const cb = document.getElementById(`excel_${b.bulan}_${b.tahun}`);
          if (cb && cb.checked) indexBulanDipilih.push(i + 6);
        });
      }

      if (indexBulanDipilih.length === 6 && periode !== 'all') {
        alert('Pilih minimal 1 bulan!');
        hideSpinner();
        return;
      }

      // 2. Ambil tabel
      const table = document.getElementById("tableIuran");
      const ws_data = [];

      // 3. Header - SAMA PERSIS, GA ADA TAMBAHAN
      const headerRow = [];
      table.querySelectorAll('thead th').forEach((th, idx) => {
        if (indexBulanDipilih.includes(idx)) {
          headerRow.push(th.innerText.replace(' ⇅',''));
        }
      });
      ws_data.push(pakeWarna ? headerRow.map(h => ({
        v: h,
        s: { font: { bold: true }, fill: { fgColor: { rgb: "F1F3F5" } } }
      })) : headerRow);

      // 4. Body
      table.querySelectorAll('tbody tr').forEach(tr => {
        if (hanyaTunggakan && !tr.classList.contains('row-tunggakan')) return;

        const row = [];
        tr.querySelectorAll('td').forEach((td, idx) => {
          if (!indexBulanDipilih.includes(idx)) return;

          const span = td.querySelector('span');
          let style = { alignment: {vertical: "center"} };
          let textValue = td.innerText.trim();

          if (span && pakeWarna) {
            // SENSOR NOMINAL KALO UNTUK WARGA - INI DOANG BEDANYA
            if (!tampilNominal) {
              if (span.classList.contains('kas')) textValue = 'KAS';
              else if (span.classList.contains('ipl') || span.classList.contains('ipl-nonis') || span.classList.contains('ipl-pengurus')) textValue = 'IPL';
              else if (span.classList.contains('pos')) textValue = 'Lunas';
              else if (span.classList.contains('fasum')) textValue = 'Lunas';
            }

            // WARNA TETEP SAMA
            if(span.classList.contains('kas')) style.fill = {fgColor: {rgb: "DBEAFE"}};
            else if(span.classList.contains('ipl')) style.fill = {fgColor: {rgb: "DFF3E6"}};
            else if(span.classList.contains('ipl-nonis')) style.fill = {fgColor: {rgb: "FDDDFF"}};
            else if(span.classList.contains('ipl-pengurus')) style.fill = {fgColor: {rgb: "F5D1D1"}};
            else if(span.classList.contains('pos') || span.classList.contains('fasum')) style.fill = {fgColor: {rgb: "F9FDB2"}};
            
            style.font = {color: {rgb: "1D4ED8"}};
          }

          row.push(pakeWarna ? {v: textValue, s: style} : textValue);
        });
        if (row.length > 0) ws_data.push(row);
      });

//  KETERANGAN IURAN IPL DI BAWAH
if (pakeWarna) {
  ws_data.push([]); 
  ws_data.push([]); 
  ws_data.push([{v: 'Keterangan Iuran IPL:', s: {font: {bold: true, sz: 12}}}]);
  ws_data.push([{v: 'Sampah : Rp 15,000.-', t: 's'}]);
  ws_data.push([{v: 'Keamanan : Rp 30,000.-', t: 's'}]);
  ws_data.push([{v: 'Kas : Rp 10,000.-', t: 's'}]);
  ws_data.push([{v: 'Dana Sosial : Rp 5,000.-', t: 's'}]);
  ws_data.push([{v: 'Pengajian : Rp 5,000.-', t: 's'}]);
  // YG INI BENERIN KURUNG KURAWALNYA
  ws_data.push([{v: 'Total IPL : Rp 65,000.-', t: 's', s: {font: {sz: 11}}, r: [{t: 'Total IPL : ', s: {font: {sz: 11}}}, {t: '65,000.-', s: {font: {sz: 11, bold: true}}}]}]);
  ws_data.push([{v: 'Total IPL Nonis : Rp 60,000.-', t: 's', s: {font: {sz: 11}}, r: [{t: 'Total IPL Nonis : ', s: {font: {sz: 11}}}, {t: '60,000.-', s: {font: {sz: 11, bold: true}}}]}]);
}
        // TAMBAH DAFTAR BAYAR DI EXCEL
  const dataBayar = renderDaftarBayarBulanIni();
  ws_data.push([]);
  ws_data.push([{v: `Yang Sudah Bayar ${dataBayar.bulan} ${dataBayar.tahun}:`, s: {font: {bold: true, sz: 12}}}]);
  if (dataBayar.list.length) {
    dataBayar.list.forEach(d => {
      ws_data.push([{v: `${d.nama} - Rp ${d.total.toLocaleString('id-ID')} (Untuk: ${d.detail.join(', ')})`, t: 's'}]);
    });
  } else {
    ws_data.push([{v: 'Belum ada yg bayar', t: 's'}]);
  }
  // BARU BIKIN SHEET SETELAH SEMUA DATA MASUK
const ws = XLSX.utils.aoa_to_sheet(ws_data);
ws['!cols'] = headerRow.map(() => ({wch: 18}));

const wb = XLSX.utils.book_new(); // CUMA 1X
XLSX.utils.book_append_sheet(wb, ws, "Iuran 24 Bulan");

let namaFile = tampilNominal
 ? `Rekap_Iuran_KETUA_${new Date().toISOString().slice(0,10)}.xlsx`
  : `Rekap_Iuran_WARGA_${new Date().toISOString().slice(0,10)}.xlsx`;

XLSX.writeFile(wb, namaFile);
closeExcelModal();

    } catch(err) {
      console.error(err);
      alert('Gagal export: ' + err.message);
    } finally {
      hideSpinner();
    }
  }, 100);
}

// Event buat show/hide pilihan custom bulan
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('excelPeriode').addEventListener('change', function(){
    document.getElementById('customBulan').style.display =
      this.value === 'custom'? 'block' : 'none';
  });

  document.getElementById('excelModal').addEventListener('click', function(e){
    if(e.target === this) closeExcelModal();
  });
});

function renderDaftarBayarBulanIni() {
  const now = new Date();
  const bulanArr = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const tahunIni = now.getFullYear();
  const bulanIni = String(now.getMonth() + 1).padStart(2, '0');
  const prefixID = `${tahunIni}${bulanIni}`;
  const namaBulan = bulanArr[now.getMonth()];

  let bayarPerKK = {};
  let totalSemua = 0;
  
  iuranData.forEach(i => {
    const idBayar = String(i.id || '').trim().replace(/\./g, '');
    if (idBayar.startsWith(prefixID)) {
      const noKK = String(i.no_kk).trim();
      const nominal = Number(i.nominal) || 0;

      totalSemua += nominal;
      
      if (!bayarPerKK[noKK]) {
        let kkData = rawData.find(w => String(w.no_kk).trim() === noKK);
        let kepala = kkData
          ? (rawData.find(a => String(a.no_kk).trim() === noKK && String(a.status_keluarga || "").toLowerCase().includes("kepala")) || kkData)
          : null;
        let namaKK = kepala ? `${kepala.blok} ${kepala.no_rumah} - ${kepala.nama}` : `KK ${noKK}`;
        bayarPerKK[noKK] = { total: 0, nama: namaKK, detail: [] };
      }

      bayarPerKK[noKK].total += nominal;
      bayarPerKK[noKK].detail.push(`${i.bulan} ${i.tahun}`);
    }
  });

  let listKK = Object.values(bayarPerKK).sort((a,b) => a.nama.localeCompare(b.nama));

  const judulEl = document.getElementById('judulBayarBulanIni');
  const listEl = document.getElementById('listBayarBulanIni');

  const html = listKK.length
    ? `<div class="total-bayar-summary">
         <strong>${listKK.length} KK | Total: Rp ${totalSemua.toLocaleString('id-ID')}</strong>
       </div>
       <ul>${listKK.map(d =>
         `<li>${d.nama} - <strong>Rp ${d.total.toLocaleString('id-ID')}</strong><br>
          <span class="detail-bayar">Untuk: ${d.detail.join(', ')}</span></li>`
       ).join('')}</ul>`
    : `<p>Belum ada yg bayar</p>`;

  if (judulEl) {
    judulEl.innerText = `Yang Sudah Bayar ${namaBulan} ${tahunIni}:`;
  }

  if (listEl) {
    listEl.innerHTML = html;
  }

  return { bulan: namaBulan, tahun: tahunIni, list: listKK };
}

function getNamaBulanIndo(indexBulan){
  const bulanArr = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  return bulanArr[indexBulan];
}


function getLabelPeriodeHeader() {
  const now = new Date();
  return `Periode ${getNamaBulanIndo(now.getMonth())} ${now.getFullYear()}`;
  // kalau mau format lain:
  // return `Update ${getNamaBulanIndo(now.getMonth())} ${now.getFullYear()}`;
}


function updatePeriodeLabel() {
  const el = document.getElementById('periodeLabel');
  if (el) {
    el.innerText = getLabelPeriodeHeader();
    console.log('Periode header updated:', el.innerText);
  } else {
    console.warn('Elemen #periodeLabel tidak ditemukan');
  }
}

async function exportToPDF(){
  if(listBuktiTf.length === 0){
    const mauUpload = confirm('Bukti transfer belum ada. Mau upload dulu sebelum export PDF?');
    if(mauUpload){
      document.getElementById('inputBuktiTf').click(); 
      return;
    }
  }
  
  showSpinner();
  try{
    const element = document.getElementById('printArea');
    const header = element.querySelector('.print-header');
    const buktiTfDiv = document.getElementById('buktiTf');
    const oldDisplay = header.style.display;
    const oldDisplayBukti = buktiTfDiv.style.display;

    header.style.display = 'flex';
    if(listBuktiTf.length === 0) buktiTfDiv.style.display = 'none';
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const canvas = await html2canvas(element, { 
      scale: 2,
      useCORS: true, 
      backgroundColor: '#ffffff',
      onclone: (clonedDoc, clonedElement) => {
        const style = clonedDoc.createElement('style');
        style.innerHTML = `
          .row-tunggakan, .row-tunggakan td {
            background: #fff !important;
            background-color: #fff !important;
            color: #000 !important;
          }
        `;
        clonedDoc.head.appendChild(style);
        
        const clonedHeader = clonedElement.querySelector('.print-header');
        if(clonedHeader) clonedHeader.style.display = 'flex';
        
        if(listBuktiTf.length === 0){
          const bukti = clonedElement.querySelector('#buktiTf');
          if(bukti) bukti.remove();
        }
      }
    });
      
    header.style.display = oldDisplay;
    buktiTfDiv.style.display = oldDisplayBukti;
  
    const imgData = canvas.toDataURL('image/jpeg', 0.75);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pdfWidth - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;
  
    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pdfHeight - margin * 2);

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin; 
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - margin * 2);
    }
    
    pdf.save('Rekap_Iuran_GG_Elang_1.pdf');
    
  } catch(err) {
    console.error(err);
    alert('Gagal export PDF: ' + err.message);
  } finally {
    hideSpinner();
  }
}

// === HELPER ===
function generateIuranID() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${yyyy}${MM}${dd}${HH}${ss}${ms}`;
}

function loadBulanBayar(){
  let kk = document.getElementById('selectKK').value;
  let tahun = document.getElementById('selectTahun').value;
  let container = document.getElementById('bulanContainer');
  let bulanList = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let html = '<label>Pilih Bulan yang Dibayar:</label><div class="bulan-grid">';

  let anggotaKK = rawData.filter(r => String(r.no_kk).trim() === String(kk).trim());
  let statusHuni = 'belum huni';
  if(anggotaKK.length > 0) statusHuni = (anggotaKK[0].status_huni || 'belum huni').toLowerCase();

  // huni & huni<sewa> = IPL
  let jenisYangDicek = 'KAS';
  let statusLower = statusHuni.toLowerCase();
  if(statusLower === 'huni' || statusLower.includes('sewa')) jenisYangDicek = 'IPL';

  bulanList.forEach(bulan=>{
    let bayar = iuranData.find(i=>
      String(i.no_kk).trim() === String(kk).trim() &&
      String(i.bulan).trim().toLowerCase() === bulan.toLowerCase() &&
      String(i.tahun).trim() === String(tahun).trim() &&
      String(i.jenis).toUpperCase() === jenisYangDicek
    );
    let sudahBayar =!!bayar;
    let checked = sudahBayar? 'checked' : '';
    let nominalVal = bayar? bayar.nominal : '';
    let labelText = sudahBayar? `Lunas - ${bulan} (${jenisYangDicek})` : `${bulan} (${jenisYangDicek})`;

    html += `<div class="bulan-item">
      <input type="checkbox" id="bulan_${bulan}" ${checked} ${sudahBayar? 'disabled' : ''} data-bulan="${bulan}" onchange="toggleNominal('${bulan}')">
      <label for="bulan_${bulan}">${labelText}</label>
      <input type="number" id="nominal_${bulan}" class="nominal-input" value="${nominalVal}" placeholder="Nominal" ${checked? '' : 'disabled'} ${sudahBayar? 'readonly' : ''}>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  let sudahBayarPos = iuranData.some(i => String(i.no_kk).trim()===kk && String(i.jenis).toUpperCase()==='POS' && String(i.bulan)==='POS');
  let sudahBayarFasum = iuranData.some(i => String(i.no_kk).trim()===kk && String(i.jenis).toUpperCase()==='FASUM' && String(i.bulan)==='FASUM');
  document.getElementById('cekPos').checked = sudahBayarPos;
  document.getElementById('cekPos').disabled = sudahBayarPos;
  document.getElementById('labelPos').innerHTML = sudahBayarPos? 'Lunas Iuran POS<br><small>Rp 100.000</small>' : 'Iuran POS<br><small>Rp 100.000</small>';
  document.getElementById('cekFasum').checked = sudahBayarFasum;
  document.getElementById('cekFasum').disabled = sudahBayarFasum;
  document.getElementById('labelFasum').innerHTML = sudahBayarFasum? 'Lunas Iuran Fasum<br><small>Rp 100.000</small>' : 'Iuran Fasum<br><small>Rp 100.000</small>';
}

function toggleNominal(bulan){
  let cb = document.getElementById('bulan_' + bulan);
  let input = document.getElementById('nominal_' + bulan);
  input.disabled =!cb.checked;
  if(!cb.checked) input.value = '';
}

function simpanBayar(){
  let kk = document.getElementById('selectKK').value;
  let tahun = document.getElementById('selectTahun').value;
  let anggotaKK = rawData.filter(r => String(r.no_kk).trim() === String(kk).trim());
  let statusHuni = anggotaKK[0]?.status_huni || 'belum huni';
  let jenis = 'KAS';
  let statusLower = statusHuni.toLowerCase();
  if(statusLower === 'huni' || statusLower.includes('sewa')) jenis = 'IPL';
  let dataUpdate = [], valid = true;
  document.querySelectorAll('#bulanContainer input[type=checkbox]').forEach(cb=>{
    if(cb.checked &&!cb.disabled){
      let bulan = cb.dataset.bulan;
      let nominal = document.getElementById('nominal_' + bulan).value;
      if(!nominal){ alert('Nominal bulan ' + bulan + ' belum diisi!'); valid = false; }
      else dataUpdate.push({id: generateIuranID(),no_kk: kk,bulan: bulan,tahun: tahun,jenis: jenis,nominal: nominal,});
    }
  });
  if(document.getElementById('cekPos').checked &&!document.getElementById('cekPos').disabled){
    dataUpdate.push({id: generateIuranID(),no_kk: kk,bulan: 'POS',tahun: '',jenis: 'POS',nominal: 100000});
  }
  if(document.getElementById('cekFasum').checked &&!document.getElementById('cekFasum').disabled){
    dataUpdate.push({id: generateIuranID(),no_kk: kk,bulan: 'FASUM',tahun: '',jenis: 'FASUM',nominal: 100000});
  }
  if(!valid || dataUpdate.length===0){ alert('Pilih minimal 1 iuran'); return; }
  showSpinner();
  fetch(apiURL,{ method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({action:"updateIuran",data:dataUpdate}) })
.then(res=>res.json()).then(res=>{
    alert('Berhasil disimpan');
    closeBayarModal();
    loadData();
  }).catch(err=>{ alert('Error: '+err.message); }).finally(()=>{ hideSpinner(); });
}

function runAsAdmin(fn) {
  document.getElementById('dpMenuAdmin').classList.remove('show');
  if (!cekAkses()) {
    if (confirm('Akses ditolak. Login sebagai admin?')) openLoginModal();
    return;
  }
  fn(); // Jalanin function yg dikirim: backupJSON, openTambahModal, dll
}

function toggleMenu() {
  document.getElementById('dpMenuAdmin').classList.toggle('show');
}

document.addEventListener('click', function(e) {
  const wrapper = document.querySelector('.fab-container');
  const menu = document.getElementById('dpMenuAdmin');
  if (wrapper && !wrapper.contains(e.target) && menu.classList.contains('show')) {
    menu.classList.remove('show');
  }
});

function openTambahModal(){
  document.getElementById('tambahModal').style.display = 'flex';
  document.getElementById('t_jk').innerHTML = buatOption(MASTER.jenisKelamin);
  document.getElementById('t_agama').innerHTML = buatOption(MASTER.agama);
  document.getElementById('t_status').innerHTML = buatOption(MASTER.statusKeluarga);
  document.getElementById('t_kerja').innerHTML = buatOption(MASTER.pekerjaan);
  document.getElementById('t_huni').innerHTML = buatOption(MASTER.statusHuni);
  document.querySelectorAll('#tambahModal input').forEach(el => el.value = '');
}

function closeTambahModal(){
  document.getElementById('tambahModal').style.display = 'none';
}

function simpanTambah(){
  let data = [{
    id: generateIuranID(), // PAKE INI
    no_kk: document.getElementById('t_no_kk').value,
    nik: document.getElementById('t_nik').value,
    nama: document.getElementById('t_nama').value,
    jenis_kelamin: document.getElementById('t_jk').value,
    tanggal_lahir: document.getElementById('t_tgl').value,
    agama: document.getElementById('t_agama').value,
    status_keluarga: document.getElementById('t_status').value,
    pekerjaan: document.getElementById('t_kerja').value,
    blok: document.getElementById('t_blok').value,
    no_rumah: document.getElementById('t_rumah').value,
    status_huni: document.getElementById('t_huni').value,
    alamat: document.getElementById('t_alamat').value
  }];
  if(!data[0].no_kk ||!data[0].nama){ alert('No KK dan Nama wajib diisi!'); return; }
  showSpinner();
  fetch(apiURL,{ method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({action:"saveMassal",data:data}) })
.then(res=>res.json()).then(res=>{
    alert("Berhasil ditambahkan");
    closeTambahModal();
    loadData();
  }).catch(err=> alert("Server error: " + err.message)).finally(() => hideSpinner());
}

document.getElementById('tambahModal').addEventListener('click', function(e){
  if(e.target === this) closeTambahModal();
});
document.getElementById('bayarModal').addEventListener('click', function(e){
  if(e.target === this) closeBayarModal();
});

function toggleDarkMode(){
  document.body.classList.toggle('dark-mode');
}
let listBuktiTf = []; // array buat nyimpen base64

function uploadBuktiTf(){
  if (!cekAkses()) {
    if (confirm('Akses ditolak. Login sebagai admin?')) openLoginModal();
    return;
  }
  document.getElementById('inputBuktiTf').multiple = true; // INI PENTING
  document.getElementById('inputBuktiTf').click();
}

function previewBuktiTf(event){
  const files = event.target.files;
  if(!files.length) return;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = function(e){
      listBuktiTf.push(e.target.result);
      renderBuktiTf();
    }
    reader.readAsDataURL(file);
  });
  
  // Reset input biar bisa upload file yang sama 2x
  event.target.value = '';
}

function renderBuktiTf(){
  const container = document.getElementById('listBuktiTf');
  const divBukti = document.getElementById('buktiTf');
  
  if(listBuktiTf.length === 0){
    divBukti.style.display = 'none';
    return;
  }

  divBukti.style.display = 'block';
  container.innerHTML = '';
  
  listBuktiTf.forEach((base64, index) => {
    container.innerHTML += `
      <div style="position: relative; width: 200px;">
        <img src="${base64}" style="width: 100%; border: 1px solid #ccc; border-radius: 4px;">
        <button onclick="hapusBuktiTf(${index})" style="position: absolute; top: 5px; right: 5px; background: red; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">×</button>
      </div>
    `;
  });
}

function logout() {
  localStorage.removeItem('role');
  USER_ACCESS = 'viewer';
  applyAkses();
  location.reload(); // Balik ke landing page
}

function hapusBuktiTf(index){
  listBuktiTf.splice(index, 1);
  renderBuktiTf();
}

window.onload = () => {
  applyAkses();
  enableResize("tableWarga");
  enableResize("tableIuran");
  updatePeriodeLabel();
};

loadData();

// Cek timeout tiap 10 detik
window.logoutChecker = setInterval(() => {
  applyAkses(); // langsung panggil fungsi yg udah ada logika logoutnya
}, 10000); // 10 detik sekali. Mau 5 detik juga boleh
