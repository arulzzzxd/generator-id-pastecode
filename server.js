const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const moment = require('moment-timezone');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(express.json());
app.use(cors());

// Sertakan file statis & route root
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ====================================================
// KONFIGURASI SUPABASE CLIENT
// ====================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn('⚠️ SUPABASE_URL atau SUPABASE_KEY belum disetel pada Environment Variables!');
}

// ====================================================
// KONEKSI MONGODB ATLAS (V1 & V2 TERPISAH)
// ====================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arulz-xd-owner:Haqqi0213@cluster0.fgxhxqm.mongodb.net/?appName=Cluster0';
const MONGODB_URI_V2 = process.env.MONGODB_URI_V2 || 'mongodb+srv://arulzdb:arulxd123@arulzdb.wpp3ns8.mongodb.net/?appName=arulzdb';

let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    cachedDb = await mongoose.connect(MONGODB_URI, {
        bufferCommands: false,
    });
    return cachedDb;
}

const connV2 = mongoose.createConnection(MONGODB_URI_V2, {
    bufferCommands: false,
});

async function connectToDatabaseV2() {
    if (connV2.readyState === 1) {
        return connV2;
    }
    await connV2.asPromise();
    return connV2;
}

// Middleware DB Mongo
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api') && !req.path.startsWith('/api/pastecode')) {
        try {
            if (req.path.startsWith('/api/v2')) {
                await connectToDatabaseV2();
            } else {
                await connectToDatabase();
            }
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Gagal terhubung ke MongoDB', error: error.message });
        }
    }
    next();
});

// Helper Generate ID Alphanumeric 10 Karakter
function generateId(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper Normalisasi Angka Rupiah (Contoh: "20.000" / "Rp 20.000" -> 20000)
function parseCleanNumber(val, fallback = 0) {
    if (val === null || val === undefined || val === '') return fallback;
    if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
    const cleaned = String(val).replace(/[^\d-]/g, '');
    if (cleaned === '' || cleaned === '-') return fallback;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : fallback;
}

// Helper Parsing Waktu Kedaluwarsa dengan Moment-Timezone (Asia/Jakarta)
function parseExpiryAsiaJakarta(expiredAt) {
    if (!expiredAt) {
        return moment().tz('Asia/Jakarta').add(24, 'hours').toDate();
    }
    const parsed = moment.tz(expiredAt, [
        moment.ISO_8601,
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DDTHH:mm',
        'YYYY-MM-DDTHH:mm:ss',
        'DD-MM-YYYY HH:mm',
        'DD/MM/YYYY HH:mm'
    ], 'Asia/Jakarta');

    if (parsed.isValid()) {
        return parsed.toDate();
    }
    const fallbackDate = new Date(expiredAt);
    return isNaN(fallbackDate.getTime())
        ? moment().tz('Asia/Jakarta').add(24, 'hours').toDate()
        : fallbackDate;
}

// Helper Normalisasi Array URL Gambar
function parseImageUrls(gambar, fallbackUrl) {
    let arr = [];
    if (Array.isArray(gambar)) {
        arr = gambar.map(u => String(u).trim()).filter(Boolean);
    } else if (typeof gambar === 'string') {
        arr = gambar.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    }
    return arr.length > 0 ? arr : [fallbackUrl];
}

// ====================================================
// ENDPOINT PASTECODE SUPABASE
// ====================================================

app.get('/api/pastecode', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Supabase client belum terkonfigurasi' });

        const { id, lang, search } = req.query;

        if (id) {
            const { data, error } = await supabase
                .from('pastes')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) return res.status(404).json({ success: false, message: 'Paste tidak ditemukan' });
            return res.json({ success: true, data });
        }

        let query = supabase.from('pastes').select('*');

        if (lang && lang.toUpperCase() !== 'ALL') {
            query = query.ilike('language', lang);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,desc.ilike.%${search}%,language.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, data: data || [] });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/pastecode', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Supabase client belum terkonfigurasi' });

        const { title, desc, language, content, author } = req.body;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Judul dan isi kode wajib diisi!' });
        }

        const formattedDate = moment().tz('Asia/Jakarta').locale('id').format('DD MMM YYYY');
        const pasteId = generateId(10);
        const safeAuthor = author ? String(author).trim().substring(0, 1000) : 'Anonymous';

        const { data, error } = await supabase
            .from('pastes')
            .insert([
                {
                    id: pasteId,
                    title: title.trim(),
                    desc: desc ? desc.trim() : 'By Anonymous',
                    language: language ? language.toLowerCase().trim() : 'plaintext',
                    content: content,
                    author: safeAuthor,
                    date: formattedDate
                }
            ])
            .select();

        if (error) throw error;

        return res.status(201).json({ success: true, message: 'Pastecode berhasil tersimpan di Supabase!', paste: data[0] });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ====================================================
// SCHEMA & MODEL MONGO (V1 & V2)
// ====================================================

const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true, expires: 0 },
    usageLimit: { type: Number, default: 20 },
    usedCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);

const productSchema = new mongoose.Schema({
    Id: { type: String, required: true, unique: true, trim: true },
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, required: true },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { type: [String], default: ["https://cdn.larasxd.my.id/files/1wh5do.png"] },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

// VOUCHER SCHEMA V2 (Sesuai index.js -> koleksi: voucherv2s)
const voucherSchemaV2 = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true },
    usageLimit: { type: Number, default: 20 },
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const VoucherV2 = connV2.models.VoucherV2 || connV2.model('VoucherV2', voucherSchemaV2);

// PRODUCT SCHEMA V2 (Sesuai index.js -> koleksi: productv2s)
const productSchemaV2 = new mongoose.Schema({
    Id: { type: String, required: true, unique: true, trim: true },
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, required: true },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { 
        type: [String], 
        default: ["https://cdn.larasxd.my.id/files/Z9zjj0RF7G7ena.png"] 
    },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    purchasedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const ProductV2 = connV2.models.ProductV2 || connV2.model('ProductV2', productSchemaV2);

// ====================================================
// ENDPOINT VOUCHER & PRODUCT V1
// ====================================================

app.post('/api/vouchers', async (req, res) => {
    try {
        const { code, discount, type, expiredAt, usageLimit } = req.body;
        const cleanCode = (code && String(code).trim()) ? String(code).trim().toUpperCase() : `ARULZXD${generateId(6).toUpperCase()}`;
        const cleanDiscount = parseCleanNumber(discount, 0);
        const cleanLimit = parseCleanNumber(usageLimit, 100);
        const parsedExpired = parseExpiryAsiaJakarta(expiredAt);

        const newVoucher = new Voucher({
            code: cleanCode,
            discount: cleanDiscount,
            type: type || 'percentage',
            expiredAt: parsedExpired,
            usageLimit: cleanLimit
        });
        await newVoucher.save();
        res.status(201).json({ success: true, message: 'Voucher (V1) berhasil disimpan!', voucher: newVoucher });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const product = await Product.findOne({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });
        if (!product) {
            return res.status(404).json({ success: false, message: `Produk V1 "${targetId}" tidak ditemukan.` });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link } = req.body;
        const gambarArray = parseImageUrls(gambar, "https://cdn.larasxd.my.id/files/1wh5do.png");
        const cleanHarga = parseCleanNumber(harga, 0);
        const cleanHargaDiskon = (harga_diskon !== null && harga_diskon !== '' && harga_diskon !== undefined)
            ? parseCleanNumber(harga_diskon, null)
            : null;

        const newProduct = new Product({
            Id: (Id && String(Id).trim()) || generateId(10),
            nama: String(nama).trim(),
            harga: cleanHarga,
            harga_diskon: cleanHargaDiskon,
            kategori: String(kategori).trim(),
            badge: badge ? String(badge).trim() : "",
            terjual: parseCleanNumber(terjual, 0),
            stok: parseCleanNumber(stok, 0),
            gambar: gambarArray,
            deskripsi: deskripsi ? String(deskripsi) : "",
            link: String(link).trim()
        });
        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk (V1) berhasil disimpan!', product: newProduct });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const existing = await Product.findOne({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: `Produk V1 "${targetId}" tidak ditemukan.` });
        }

        const { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link } = req.body;

        if (Id !== undefined && String(Id).trim() !== '' && String(Id).trim() !== existing.Id) {
            const newCustomId = String(Id).trim();
            const duplicate = await Product.findOne({ Id: newCustomId, _id: { $ne: existing._id } });
            if (duplicate) {
                return res.status(400).json({ success: false, message: `ID Produk "${newCustomId}" sudah digunakan produk lain!` });
            }
            existing.Id = newCustomId;
        }

        if (nama !== undefined) existing.nama = String(nama).trim();
        if (harga !== undefined) existing.harga = parseCleanNumber(harga, existing.harga);
        if (harga_diskon !== undefined) {
            existing.harga_diskon = (harga_diskon !== null && harga_diskon !== '')
                ? parseCleanNumber(harga_diskon, null)
                : null;
        }
        if (kategori !== undefined) existing.kategori = String(kategori).trim();
        if (badge !== undefined) existing.badge = String(badge).trim();
        if (terjual !== undefined) existing.terjual = parseCleanNumber(terjual, 0);
        if (stok !== undefined) existing.stok = parseCleanNumber(stok, 0);
        if (gambar !== undefined) {
            existing.gambar = parseImageUrls(gambar, "https://cdn.larasxd.my.id/files/1wh5do.png");
        }
        if (deskripsi !== undefined) existing.deskripsi = String(deskripsi);
        if (link !== undefined) existing.link = String(link).trim();

        await existing.save();
        res.json({ success: true, message: `Produk V1 "${existing.nama}" (${existing.Id}) berhasil diperbarui!`, product: existing });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const deleted = await Product.findOneAndDelete({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });
        if (!deleted) {
            return res.status(404).json({ success: false, message: `Produk V1 dengan ID "${targetId}" tidak ditemukan.` });
        }
        res.json({ success: true, message: `Produk V1 "${deleted.nama}" (${deleted.Id}) berhasil dihapus!`, product: deleted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ====================================================
// ENDPOINT VOUCHER & PRODUCT V2 (DB UTAMA STORE)
// ====================================================

app.post('/api/v2/vouchers', async (req, res) => {
    try {
        const { code, discount, type, expiredAt, usageLimit, usedBy } = req.body;
        const cleanCode = (code && String(code).trim()) ? String(code).trim().toUpperCase() : `ARULZXD${generateId(6).toUpperCase()}`;
        const cleanDiscount = parseCleanNumber(discount, 0);
        const cleanLimit = parseCleanNumber(usageLimit, 100);
        const parsedExpired = parseExpiryAsiaJakarta(expiredAt);

        const newVoucher = new VoucherV2({ 
            code: cleanCode, 
            discount: cleanDiscount, 
            type: type || 'percentage', 
            expiredAt: parsedExpired, 
            usageLimit: cleanLimit, 
            usedBy: usedBy || [] 
        });
        await newVoucher.save();
        res.status(201).json({ success: true, message: 'Voucher (V2) berhasil disimpan!', voucher: newVoucher });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get('/api/v2/products', async (req, res) => {
    try {
        const products = await ProductV2.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/v2/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const product = await ProductV2.findOne({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });
        if (!product) {
            return res.status(404).json({ success: false, message: `Produk V2 "${targetId}" tidak ditemukan.` });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/v2/products', async (req, res) => {
    try {
        const { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link, purchasedBy } = req.body;
        const gambarArray = parseImageUrls(gambar, "https://cdn.larasxd.my.id/files/Z9zjj0RF7G7ena.png");
        const cleanHarga = parseCleanNumber(harga, 0);
        const cleanHargaDiskon = (harga_diskon !== null && harga_diskon !== '' && harga_diskon !== undefined)
            ? parseCleanNumber(harga_diskon, null)
            : null;

        const newProduct = new ProductV2({ 
            Id: (Id && String(Id).trim()) || generateId(10), 
            nama: String(nama).trim(), 
            harga: cleanHarga, 
            harga_diskon: cleanHargaDiskon, 
            kategori: String(kategori).trim(), 
            badge: badge ? String(badge).trim() : "", 
            terjual: parseCleanNumber(terjual, 0), 
            stok: parseCleanNumber(stok, 0), 
            gambar: gambarArray, 
            deskripsi: deskripsi ? String(deskripsi) : "", 
            link: String(link).trim(), 
            purchasedBy: Array.isArray(purchasedBy) ? purchasedBy : [] 
        });
        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk (V2) berhasil disimpan!', product: newProduct });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.put('/api/v2/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const existing = await ProductV2.findOne({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: `Produk V2 "${targetId}" tidak ditemukan.` });
        }

        const { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link, purchasedBy } = req.body;

        if (Id !== undefined && String(Id).trim() !== '' && String(Id).trim() !== existing.Id) {
            const newCustomId = String(Id).trim();
            const duplicate = await ProductV2.findOne({ Id: newCustomId, _id: { $ne: existing._id } });
            if (duplicate) {
                return res.status(400).json({ success: false, message: `ID Produk "${newCustomId}" sudah digunakan produk lain!` });
            }
            existing.Id = newCustomId;
        }

        if (nama !== undefined) existing.nama = String(nama).trim();
        if (harga !== undefined) existing.harga = parseCleanNumber(harga, existing.harga);
        if (harga_diskon !== undefined) {
            existing.harga_diskon = (harga_diskon !== null && harga_diskon !== '')
                ? parseCleanNumber(harga_diskon, null)
                : null;
        }
        if (kategori !== undefined) existing.kategori = String(kategori).trim();
        if (badge !== undefined) existing.badge = String(badge).trim();
        if (terjual !== undefined) existing.terjual = parseCleanNumber(terjual, 0);
        if (stok !== undefined) existing.stok = parseCleanNumber(stok, 0);
        if (gambar !== undefined) {
            existing.gambar = parseImageUrls(gambar, "https://cdn.larasxd.my.id/files/Z9zjj0RF7G7ena.png");
        }
        if (deskripsi !== undefined) existing.deskripsi = String(deskripsi);
        if (link !== undefined) existing.link = String(link).trim();
        if (Array.isArray(purchasedBy)) existing.purchasedBy = purchasedBy;

        await existing.save();
        res.json({ success: true, message: `Produk V2 "${existing.nama}" (${existing.Id}) berhasil diperbarui!`, product: existing });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.delete('/api/v2/products/:id', async (req, res) => {
    try {
        const targetId = req.params.id.trim();
        const deleted = await ProductV2.findOneAndDelete({
            $or: [
                { Id: targetId },
                { _id: mongoose.Types.ObjectId.isValid(targetId) ? targetId : null }
            ]
        });
        if (!deleted) {
            return res.status(404).json({ success: false, message: `Produk V2 dengan ID "${targetId}" tidak ditemukan.` });
        }
        res.json({ success: true, message: `Produk V2 "${deleted.nama}" (${deleted.Id}) berhasil dihapus!`, product: deleted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
}

module.exports = app;
