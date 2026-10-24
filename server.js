const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
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
// KONEKSI MONGODB ATLAS
// ====================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arulz-xd-owner:Haqqi0213@cluster0.fgxhxqm.mongodb.net/?appName=Cluster0';

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

// Middleware DB Mongo
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api') && !req.path.startsWith('/api/pastecode')) {
        try {
            await connectToDatabase();
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

// ====================================================
// ENDPOINT PASTECODE SUPABASE
// ====================================================

// GET: Ambil daftar pastecode dari Supabase
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

// POST: Simpan pastecode baru ke Supabase
app.post('/api/pastecode', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ success: false, message: 'Supabase client belum terkonfigurasi' });

        const { title, desc, language, content, author } = req.body;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Judul dan isi kode wajib diisi!' });
        }

        const formattedDate = new Date().toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        // Generate ID acak 10 karakter
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
    gambar: { type: [String], default: ["https://arulz-xd.my.id/files/X1F0Cn.png"] },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

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
const VoucherV2 = mongoose.models.VoucherV2 || mongoose.model('VoucherV2', voucherSchemaV2);

const productSchemaV2 = new mongoose.Schema({
    Id: { type: String, required: true, unique: true, trim: true },
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, required: true },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { type: [String], default: ["https://arulz-xd.my.id/files/X1F0Cn.png"] },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    purchasedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const ProductV2 = mongoose.models.ProductV2 || mongoose.model('ProductV2', productSchemaV2);

// ====================================================
// ENDPOINT VOUCHER & PRODUCT (V1 & V2)
// ====================================================
app.post('/api/vouchers', async (req, res) => {
    try {
        const { code, discount, type, expiredAt, usageLimit } = req.body;
        const newVoucher = new Voucher({ code: code.toUpperCase(), discount, type, expiredAt: new Date(expiredAt), usageLimit });
        await newVoucher.save();
        res.status(201).json({ success: true, message: 'Voucher (V1) berhasil disimpan!', voucher: newVoucher });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        let { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link } = req.body;
        let gambarArray = Array.isArray(gambar) ? gambar.filter(u => u.trim()) : (typeof gambar === 'string' ? gambar.split(/[\n,]+/).map(u => u.trim()).filter(Boolean) : []);
        const newProduct = new Product({ Id: Id || generateId(10), nama, harga, harga_diskon: harga_diskon ? Number(harga_diskon) : null, kategori, badge: badge || "", terjual: Number(terjual) || 0, stok: Number(stok) || 0, gambar: gambarArray.length ? gambarArray : ["https://arulz-xd.my.id/files/X1F0Cn.png"], deskripsi: deskripsi || "", link });
        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk (V1) berhasil disimpan!', product: newProduct });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

app.post('/api/v2/vouchers', async (req, res) => {
    try {
        const { code, discount, type, expiredAt, usageLimit, usedBy } = req.body;
        const newVoucher = new VoucherV2({ code: code.toUpperCase(), discount, type, expiredAt: new Date(expiredAt), usageLimit, usedBy: usedBy || [] });
        await newVoucher.save();
        res.status(201).json({ success: true, message: 'Voucher (V2) berhasil disimpan!', voucher: newVoucher });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

app.post('/api/v2/products', async (req, res) => {
    try {
        let { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link, purchasedBy } = req.body;
        let gambarArray = Array.isArray(gambar) ? gambar.filter(u => u.trim()) : (typeof gambar === 'string' ? gambar.split(/[\n,]+/).map(u => u.trim()).filter(Boolean) : []);
        const newProduct = new ProductV2({ Id: Id || generateId(10), nama, harga, harga_diskon: harga_diskon ? Number(harga_diskon) : null, kategori, badge: badge || "", terjual: Number(terjual) || 0, stok: Number(stok) || 0, gambar: gambarArray.length ? gambarArray : ["https://arulz-xd.my.id/files/X1F0Cn.png"], deskripsi: deskripsi || "", link, purchasedBy: purchasedBy || [] });
        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk (V2) berhasil disimpan!', product: newProduct });
    } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
}

module.exports = app;
