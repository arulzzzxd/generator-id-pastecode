const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors());

// 1. Sertakan file statis & route root menggunakan __dirname
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Koneksi MongoDB Atlas (Optimized untuk Vercel Serverless)
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

// Middleware koneksi database untuk seluruh endpoint API
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api')) {
        try {
            await connectToDatabase();
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Gagal terhubung ke MongoDB', error: error.message });
        }
    }
    next();
});

// 3. Skema & Model Voucher
const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true },
    usageLimit: { type: Number, default: 20 },
    usedCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);

// Skema & Model Product
const productSchema = new mongoose.Schema({
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, default: "General" },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { type: String, default: "https://arulz-xd.my.id/files/X1F0Cn.png" },
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

// 4. Endpoint API
app.post('/api/vouchers', async (req, res) => {
    try {
        const { code, discount, type, expiredAt, usageLimit } = req.body;

        const newVoucher = new Voucher({
            code: code.toUpperCase(),
            discount,
            type,
            expiredAt: new Date(expiredAt),
            usageLimit
        });

        await newVoucher.save();
        res.status(201).json({ success: true, message: 'Voucher berhasil disimpan ke Database!', voucher: newVoucher });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get('/api/vouchers/validate/:code', async (req, res) => {
    try {
        const voucher = await Voucher.findOne({ code: req.params.code.toUpperCase() });

        if (!voucher) {
            return res.status(404).json({ valid: false, message: 'Voucher tidak ditemukan.' });
        }

        if (new Date() > voucher.expiredAt) {
            return res.status(400).json({ valid: false, message: 'Voucher telah kedaluwarsa.' });
        }

        if (voucher.usedCount >= voucher.usageLimit) {
            return res.status(400).json({ valid: false, message: 'Batas pemakaian voucher telah habis.' });
        }

        res.json({ valid: true, voucher });
    } catch (error) {
        res.status(500).json({ valid: false, message: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link } = req.body;

        const newProduct = new Product({
            nama,
            harga,
            harga_diskon: harga_diskon ? Number(harga_diskon) : null,
            kategori: kategori || "General",
            badge: badge || "",
            terjual: terjual ? Number(terjual) : 0,
            stok: stok ? Number(stok) : 0,
            gambar: gambar || "https://arulz-xd.my.id/files/X1F0Cn.png",
            deskripsi: deskripsi || "",
            link
        });

        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk berhasil disimpan ke Database!', product: newProduct });
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

// 5. Jalankan server lokal jika tidak dijalankan di lingkungan Vercel Serverless
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
}

module.exports = app;
