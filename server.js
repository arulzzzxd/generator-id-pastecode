const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(express.json());
app.use(cors());

// 1. Sertakan file statis & route root
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Koneksi MongoDB Atlas
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

// Helper Functions Generator
function generateId(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateFreeApiKey() {
    return 'arulzxdfree-' + crypto.randomBytes(3).toString('hex');
}

function generatePremiumApiKey(username = 'user') {
    return `${username.toLowerCase()}prem-` + crypto.randomBytes(3).toString('hex');
}

// 3. Schema & Models

// Schema & Model User (dengan Pre-Save Middleware untuk penyesuaian API Key otomatis)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, default: 'Free User' },
    apikey: { type: String, required: true },
    avatar: { type: String, default: 'https://arulz-xd.my.id/files/X1F0Cn.png' },
    createdAt: { type: Date, default: Date.now }
});

// Hook Mongoose untuk update API Key berdasarkan Role
userSchema.pre('save', function() {
    if (this.isModified('role')) {
        const roleLower = (this.role || '').toLowerCase();

        if (roleLower.includes('vip')) {
            if (!this.apikey || !this.apikey.includes('-custom-vip')) {
                this.apikey = `${this.username.toLowerCase()}-custom-vip`;
            }
        } else if (roleLower.includes('premium')) {
            if (!this.apikey || !this.apikey.includes('prem-')) {
                this.apikey = generatePremiumApiKey(this.username);
            }
        } else {
            if (!this.apikey || !this.apikey.startsWith('arulzxdfree-')) {
                this.apikey = generateFreeApiKey();
            }
        }
    }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Schema & Model Voucher
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

// Schema & Model Product
const productSchema = new mongoose.Schema({
    Id: { type: String, required: true, unique: true, trim: true },
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, required: true },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { type: String, default: "https://arulz-xd.my.id/files/X1F0Cn.png" },
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

// 4. Endpoints API

// ENDPOINT UPDATE ROLE USER
app.post('/api/admin/update-role', async (req, res) => {
    try {
        const { targetEmail, newRole } = req.body;

        if (!targetEmail || !newRole) {
            return res.status(400).json({ status: false, message: 'Target email dan role baru wajib diisi!' });
        }

        const validRoles = ['Free User', 'Premium User', 'VIP User'];
        const formattedRole = validRoles.find(r => r.toLowerCase() === newRole.toLowerCase().trim());

        if (!formattedRole) {
            return res.status(400).json({ status: false, message: 'Role tidak valid! Pilihan: "Free User", "Premium User", "VIP User"' });
        }

        const user = await User.findOne({ email: targetEmail.toLowerCase().trim() });

        if (!user) {
            return res.status(404).json({ status: false, message: `User dengan email '${targetEmail}' tidak ditemukan!` });
        }

        // Perbarui Role (Pre-save hook di schema akan otomatis update apikey)
        user.role = formattedRole;
        await user.save();

        return res.json({
            status: true,
            message: `Role user ${user.username} berhasil diubah!`,
            data: {
                username: user.username,
                email: user.email,
                role: user.role,
                apikey: user.apikey
            }
        });

    } catch (error) {
        console.error("Gagal update role user:", error);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan server saat memperbarui role.' });
    }
});

// ENDPOINT VOUCHER
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
            return res.status(404).json({ valid: false, message: 'Voucher tidak ditemukan atau sudah kedaluwarsa.' });
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

// ENDPOINT PRODUCT
app.post('/api/products', async (req, res) => {
    try {
        const { Id, nama, harga, harga_diskon, kategori, badge, terjual, stok, gambar, deskripsi, link } = req.body;

        const newProduct = new Product({
            Id: Id || generateId(10),
            nama,
            harga,
            harga_diskon: harga_diskon ? Number(harga_diskon) : null,
            kategori,
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

// 5. Listener Server Lokal
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
}

module.exports = app;
