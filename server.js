const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors());

// 1. Static file & Routing
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Koneksi Database MongoDB Atlas
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

// 3. Skema & Model Voucher (DENGAN OTOMATIS EXPIRED TTL INDEX)
const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    // Menambahkan 'expires: 0' agar MongoDB menghapus dokumen secara otomatis saat mencapai tanggal expiredAt
    expiredAt: { type: Date, required: true, expires: 0 },
    usageLimit: { type: Number, default: 100 },
    usedCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);

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
        res.status(201).json({ 
            success: true, 
            message: 'Voucher berhasil disimpan dan akan terhapus otomatis setelah kedaluwarsa!', 
            voucher: newVoucher 
        });
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

        if (voucher.usedCount >= voucher.usageLimit) {
            return res.status(400).json({ valid: false, message: 'Batas pemakaian voucher telah habis.' });
        }

        res.json({ valid: true, voucher });
    } catch (error) {
        res.status(500).json({ valid: false, message: error.message });
    }
});

// 5. Export / Server runner
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));
}

module.exports = app;
