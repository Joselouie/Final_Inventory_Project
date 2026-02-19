const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const db = new sqlite3.Database('./inventory.db');

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, stock INTEGER, supplier_id INTEGER, image TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, s_name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, qty INTEGER, total_price REAL, sale_date DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");

    db.run("INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'admin123')");
    db.run("INSERT OR IGNORE INTO suppliers (id, s_name) VALUES (1, 'Main Distributor')");
});

function addLog(action, details) {
    db.run("INSERT INTO logs (action, details) VALUES (?, ?)", [action, details]);
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { addLog('Login', `${username} accessed the system`); res.json({ success: true }); }
        else res.status(401).json({ success: false });
    });
});

app.get('/api/dashboard', (req, res) => {
    db.all("SELECT p.*, s.s_name FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.id", [], (err, items) => {
        db.get("SELECT SUM(total_price) as rev FROM sales", [], (err, row) => {
            db.all("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 15", [], (err, history) => {
                res.json({ items, revenue: row.rev || 0, history });
            });
        });
    });
});

app.post('/api/inventory', upload.single('image'), (req, res) => {
    const { name, price, stock, supplier_id } = req.body;
    const img = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/50';
    db.run("INSERT INTO products (name, price, stock, supplier_id, image) VALUES (?,?,?,?,?)", [name, price, stock, supplier_id, img], () => {
        addLog('Stock In', `Added ${name} (${stock} units)`);
        res.json({success:true});
    });
});

app.post('/api/sales', (req, res) => {
    const { product_id, qty, price, name } = req.body;
    db.run("INSERT INTO sales (product_id, qty, total_price) VALUES (?, ?, ?)", [product_id, qty, qty * price], () => {
        db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, product_id], () => {
            addLog('Sale', `Sold ${qty}x ${name}`);
            res.json({ success: true });
        });
    });
});

app.delete('/api/inventory/:id', (req, res) => {
    db.get("SELECT name FROM products WHERE id = ?", [req.params.id], (err, row) => {
        db.run("DELETE FROM products WHERE id = ?", [req.params.id], () => {
            if (row) addLog('Delete', `Removed ${row.name}`);
            res.json({ success: true });
        });
    });
});

app.get('/api/suppliers', (req, res) => {
    db.all("SELECT * FROM suppliers", [], (err, rows) => res.json(rows));
});

// Gagamit ng port na ibibigay ng Render, kung wala (local), gagamit ng 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 System is live on port ${PORT}`);
});