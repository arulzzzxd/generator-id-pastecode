// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Koneksi Database MongoDB
mongoose.connect('mongodb://127.0.01:27017/arulzxd_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('⚡ MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// 2. Skema & Model Voucher
const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true },
    usageLimit: { type: Number, default: 100 },
    usedCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Voucher = mongoose.model('Voucher', voucherSchema);

// 3. Endpoint Simpan Voucher Baru
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

// 4. Endpoint Cek Validitas Voucher
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

app.listen(3000, () => console.log('🚀 Server berjalan di http://localhost:3000'));
