// === Pendaftaran Service Worker (Untuk PWA Installability) ===
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js') // Daftarkan file sw.js
      .then(registration => {
        console.log('Service Worker terdaftar dengan scope:', registration.scope);
      })
      .catch(error => {
        console.error('Pendaftaran Service Worker gagal:', error);
      });
  });
}
// =========================================================


// Memastikan DOM sepenuhnya dimuat sebelum menjalankan script
document.addEventListener('DOMContentLoaded', function() {
    // --- Inisialisasi & Konfigurasi Firebase ---
    // Variabel global dari script type="module" di index.html
    const app = window.firebaseApp;
    const db = window.firebaseDb;
    const auth = window.firebaseAuth;
    const initialAuthToken = window.initialAuthToken;
    const collection = window.firebaseCollection;
    const addDoc = window.firebaseAddDoc;
    const onSnapshot = window.firebaseOnSnapshot;
    const query = window.firebaseQuery;
    const orderBy = window.firebaseOrderBy;
    const signInAnonymously = window.firebaseSignInAnonymously;
    const signInWithCustomToken = window.firebaseSignInWithCustomToken; 
    const onAuthStateChanged = window.firebaseOnAuthStateChanged;
    const currentAppId = window.currentAppId; // Ambil App ID dari global window

    let currentUserId = null; // ID pengguna yang sedang login
    // Gunakan currentAppId untuk path koleksi Firestore
    // Path: /artifacts/{appId}/public/data/aspirasi
    const aspirasiCollectionRef = collection(db, 'artifacts', currentAppId, 'public', 'data', 'aspirasi');

    // --- Elemen DOM (Document Object Model) ---
    // Mengambil referensi ke elemen HTML yang akan dimanipulasi oleh JavaScript
    const navToggle = document.querySelector('.nav-toggle'); // Tombol hamburger untuk navigasi mobile
    const mainNavUl = document.querySelector('.main-nav ul'); // Daftar item navigasi
    const aspirasiForm = document.getElementById('aspirasi-form'); // Formulir pengiriman aspirasi
    const aspirasiListContainer = document.getElementById('aspirasi-list'); // Kontainer daftar aspirasi
    const currentUserIdSpan = document.getElementById('current-user-id'); // Span untuk menampilkan ID pengguna
    const formMessageBox = document.getElementById('form-message'); // Kotak pesan untuk feedback form
    const loadingAspirasiMessage = document.getElementById('loading-aspirasi'); // Pesan 'Memuat aspirasi...'
    const noAspirasiMessage = document.getElementById('no-aspirasi'); // Pesan 'Belum ada aspirasi...'
    const filterTopikSelect = document.getElementById('filter-topik'); // Dropdown filter topik
    const sortBySelect = document.getElementById('sort-by'); // Dropdown sortir

    let allAspirasiData = []; // Array untuk menyimpan semua data aspirasi yang dimuat dari Firestore

    // --- Fungsionalitas Autentikasi Firebase ---
    // Memantau perubahan status autentikasi pengguna secara real-time
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Jika pengguna sudah login (baik anonim atau dengan token kustom)
            currentUserId = user.uid; // Simpan ID pengguna
            console.log("User ID:", currentUserId); // Log ID pengguna ke konsol untuk debugging
            if (currentUserIdSpan) {
                // Tampilkan seluruh ID pengguna di UI (sesuai instruksi untuk identifikasi)
                currentUserIdSpan.textContent = currentUserId; 
            }
            // Setelah user terautentikasi, mulai mendengarkan update aspirasi dari Firestore
            listenForAspirasiUpdates(); 
        } else {
            // Jika pengguna belum login, coba untuk login
            try {
                if (initialAuthToken) {
                    // Jika ada token autentikasi kustom dari lingkungan Canvas, gunakan itu
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    // Jika tidak ada token kustom, login secara anonim
                    // Ini akan membuat ID pengguna unik setiap kali aplikasi diakses
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Error signing in:", error); // Log error jika gagal login
                if (currentUserIdSpan) {
                    currentUserIdSpan.textContent = 'Gagal memuat ID'; // Tampilkan pesan error di UI
                }
                // Meskipun autentikasi gagal, tetap coba mendengarkan aspirasi publik
                // (mungkin ada aspirasi yang tidak memerlukan autentikasi khusus)
                listenForAspirasiUpdates(); 
            }
        }
    });

    // --- Fungsionalitas Navigasi Mobile (Hamburger Menu) ---
    if (navToggle && mainNavUl) {
        // Tambahkan event listener untuk tombol hamburger
        navToggle.addEventListener('click', function() {
            mainNavUl.classList.toggle('active'); // Toggle class 'active' untuk menampilkan/menyembunyikan menu
            // Ganti ikon hamburger (fa-bars) menjadi ikon silang (fa-times) dan sebaliknya
            navToggle.querySelector('i').classList.toggle('fa-bars');
            navToggle.querySelector('i').classList.toggle('fa-times'); 
        });

        // Menutup menu navigasi saat salah satu link di dalamnya diklik (khusus untuk tampilan mobile)
        mainNavUl.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mainNavUl.classList.remove('active'); // Sembunyikan menu
                // Kembalikan ikon ke hamburger
                navToggle.querySelector('i').classList.remove('fa-times');
                navToggle.querySelector('i').classList.add('fa-bars');
            });
        });
    }

    // --- Fungsi Utilitas UI: Menampilkan Kotak Pesan Feedback ---
    // Digunakan untuk menampilkan pesan sukses atau error di formulir
    function showMessageBox(message, type) {
        if (formMessageBox) {
            formMessageBox.textContent = message; // Atur teks pesan
            formMessageBox.className = 'message-box'; // Reset semua kelas CSS pada kotak pesan
            formMessageBox.classList.add(type); // Tambahkan kelas 'success' atau 'error'
            formMessageBox.classList.add('show'); // Tambahkan kelas 'show' untuk memicu animasi tampil
            // Sembunyikan pesan setelah 5 detik
            setTimeout(() => {
                formMessageBox.classList.remove('show'); // Hapus kelas 'show' untuk memicu animasi sembunyi
            }, 5000); 
        }
    }

    // --- Fungsionalitas Formulir Aspirasi ---
    if (aspirasiForm) {
        // Tambahkan event listener untuk submit formulir
        aspirasiForm.addEventListener('submit', async function(event) {
            event.preventDefault(); // Mencegah perilaku default formulir (reload halaman)

            // Pastikan pengguna sudah terautentikasi sebelum mengirim aspirasi
            if (!currentUserId) {
                showMessageBox('Autentikasi belum selesai. Mohon tunggu sebentar atau refresh halaman.', 'error');
                return;
            }

            // Ambil nilai dari input formulir
            const topik = aspirasiForm.querySelector('#topik-aspirasi').value;
            const judul = aspirasiForm.querySelector('#judul-aspirasi').value;
            const deskripsi = aspirasiForm.querySelector('#deskripsi-aspirasi').value;
            const anonim = aspirasiForm.querySelector('#anonim-aspirasi').checked; // Status checkbox anonim

            // Validasi sederhana: Pastikan kolom wajib tidak kosong
            if (!topik || !judul || !deskripsi) {
                showMessageBox('Mohon lengkapi semua kolom yang wajib diisi.', 'error');
                return;
            }

            // Buat objek data aspirasi baru
            const newAspirasi = {
                topik: topik,
                judul: judul,
                deskripsi: deskripsi,
                pengirimId: currentUserId, // Simpan ID pengguna yang mengirim
                anonim: anonim,
                timestamp: new Date() // Tanggal dan waktu pengiriman aspirasi
            };

            try {
                // Tambahkan dokumen baru ke koleksi 'aspirasi' di Firestore
                // addDoc akan otomatis membuat ID dokumen unik
                await addDoc(aspirasiCollectionRef, newAspirasi);
                showMessageBox('Aspirasi Anda berhasil dikirim! Terima kasih atas kontribusinya.', 'success');
                aspirasiForm.reset(); // Reset formulir setelah pengiriman berhasil
            } catch (error) {
                console.error("Error menambahkan aspirasi:", error); // Log error ke konsol
                showMessageBox('Gagal mengirim aspirasi: ' + error.message, 'error'); // Tampilkan pesan error di UI
            }
        });
    }

    // --- Fungsionalitas Menampilkan Aspirasi (Real-time dari Firestore) ---
    // Fungsi ini bertanggung jawab untuk merender (menampilkan) daftar aspirasi di UI
    function renderAspirasiList(dataToRender) {
        aspirasiListContainer.innerHTML = ''; // Kosongkan kontainer daftar aspirasi sebelum merender ulang

        // Jika tidak ada data aspirasi untuk ditampilkan
        if (dataToRender.length === 0) {
            noAspirasiMessage.style.display = 'block'; // Tampilkan pesan 'Belum ada aspirasi...'
            loadingAspirasiMessage.style.display = 'none'; // Sembunyikan pesan loading
            return; // Hentikan fungsi
        }

        noAspirasiMessage.style.display = 'none'; // Sembunyikan pesan 'Belum ada aspirasi...'
        loadingAspirasiMessage.style.display = 'none'; // Sembunyikan pesan loading

        // Iterasi setiap dokumen aspirasi dalam array dataToRender
        dataToRender.forEach(doc => {
            const aspirasiItem = document.createElement('article'); // Buat elemen <article> baru
            aspirasiItem.classList.add('aspirasi-item'); // Tambahkan kelas CSS untuk styling

            // Tentukan nama tampilan pengirim: 'Anonim' jika anonim, atau sebagian ID jika tidak
            const pengirimDisplayName = doc.anonim ? 'Anonim' : (doc.pengirimId ? doc.pengirimId.substring(0, 8) + '...' : 'Pengguna Tidak Dikenal');
            
            // Konversi timestamp dari Firestore menjadi format tanggal & waktu yang mudah dibaca
            const displayDate = doc.timestamp ? 
                                new Date(doc.timestamp.seconds * 1000).toLocaleDateString('id-ID', { 
                                    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                                }) : 
                                'Tanggal tidak tersedia';

            // Isi innerHTML dari elemen aspirasiItem dengan data dari dokumen
            aspirasiItem.innerHTML = `
                <div class="aspirasi-header">
                    <span class="aspirasi-topik"><i class="fas fa-tag"></i> ${doc.topik}</span>
                    <h3>${doc.judul}</h3>
                </div>
                <p class="aspirasi-content">${doc.deskripsi}</p>
                <div class="aspirasi-meta">
                    <span>Oleh: <strong>${pengirimDisplayName}</strong></span>
                    <span>Pada: ${displayDate}</span>
                </div>
                <div class="aspirasi-response">
                    <p><strong><i class="fas fa-comment-alt"></i> Tanggapan (Simulasi Pemerintah):</strong> Aspirasi ini telah dicatat dan akan dikaji lebih lanjut. Terima kasih atas partisipasinya!</p>
                </div>
            `;
            // Tambahkan elemen aspirasiItem ke dalam kontainer daftar aspirasi
            aspirasiListContainer.appendChild(aspirasiItem);
        });
    }

    // Fungsi untuk mendengarkan perubahan data secara real-time dari Firestore
    function listenForAspirasiUpdates() {
        // Buat query untuk mendapatkan koleksi 'aspirasi' dan mengurutkannya berdasarkan timestamp terbaru
        const q = query(aspirasiCollectionRef, orderBy('timestamp', 'desc')); 

        // onSnapshot akan secara otomatis mendengarkan perubahan data di Firestore
        // Setiap kali ada perubahan (tambah, edit, hapus), callback ini akan dieksekusi
        onSnapshot(q, (snapshot) => {
            allAspirasiData = []; // Reset array data aspirasi yang disimpan secara lokal
            // Iterasi setiap dokumen dalam snapshot (data terbaru dari Firestore)
            snapshot.forEach((doc) => {
                allAspirasiData.push({ id: doc.id, ...doc.data() }); // Tambahkan data dokumen ke array
            });
            // Setelah data baru diterima, terapkan filter dan urutan yang dipilih pengguna
            applyFiltersAndSort(); 
        }, (error) => {
            // Tangani error jika terjadi masalah saat mengambil data dari Firestore
            console.error("Error fetching aspirasi:", error);
            loadingAspirasiMessage.textContent = 'Gagal memuat aspirasi.';
            loadingAspirasiMessage.style.display = 'block';
            noAspirasiMessage.style.display = 'none';
        });
    }

    // --- Fungsionalitas Filter dan Sortir ---
    // Fungsi ini menerapkan filter dan urutan pada data aspirasi dan kemudian merendernya
    function applyFiltersAndSort() {
        let filteredData = [...allAspirasiData]; // Buat salinan data agar array asli tidak berubah

        // Filter berdasarkan topik yang dipilih pengguna
        const selectedTopik = filterTopikSelect.value;
        if (selectedTopik !== 'all') {
            filteredData = filteredData.filter(aspirasi => aspirasi.topik === selectedTopik);
        }

        // Urutkan data
        const selectedSort = sortBySelect.value;
        if (selectedSort === 'latest') {
            // Data sudah diurutkan dari Firestore, jadi tidak perlu sort lagi di JavaScript
        }
        // Jika nanti ada opsi sort lain (misal 'populer' berdasarkan jumlah like/vote), logikanya bisa ditambahkan di sini.
        // Contoh: if (selectedSort === 'popular') { filteredData.sort((a,b) => b.likes - a.likes); }

        renderAspirasiList(filteredData); // Render data yang sudah difilter/sortir ke UI
    }

    // Tambahkan event listener untuk dropdown filter dan sortir
    filterTopikSelect.addEventListener('change', applyFiltersAndSort);
    sortBySelect.addEventListener('change', applyFiltersAndSort);

    // Tampilkan pesan loading saat pertama kali halaman dimuat, sebelum data dari Firestore muncul
    loadingAspirasiMessage.style.display = 'block';
    noAspirasiMessage.style.display = 'none';
    
    // Catatan: listenForAspirasiUpdates() akan dipanggil setelah autentikasi di onAuthStateChanged.
    // Jadi tidak perlu memanggilnya secara langsung di sini lagi.
});

            
