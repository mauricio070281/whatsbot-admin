const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const port = 3003; // Using port 3003

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'whatsbot-admin-secret',
    resave: false,
    saveUninitialized: true
}));

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'whatsbot'
};

// Rotas do painel
// Remove this route (around line 23-29)
// app.get('/', (req, res) => {
//     if (!req.session.loggedin) {
//         res.redirect('/login');
//         return;
//     }
//     res.render('dashboard');
// });
// Remove this route
// Add main dashboard route first
app.get('/', async (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/login');
        return;
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // Dados básicos com tratamento de erro
        const [salesResult] = await connection.execute('SELECT COALESCE(SUM(total), 0) as total FROM orders');
        const [todayOrders] = await connection.execute('SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURDATE()');
        const [products] = await connection.execute('SELECT COUNT(*) as count FROM products');
        const [pending] = await connection.execute('SELECT COUNT(*) as count FROM orders WHERE status = "pending"');
        const [recentOrders] = await connection.execute('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5');
        
        // Dados dos últimos 7 dias
        const [salesData] = await connection.execute(`
            SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as total 
            FROM orders 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        await connection.end();
        
        res.render('dashboard', {
            totalSales: Number(salesResult[0]?.total) || 0,
            ordersToday: Number(todayOrders[0]?.count) || 0,
            totalProducts: Number(products[0]?.count) || 0,
            pendingOrders: Number(pending[0]?.count) || 0,
            recentOrders: recentOrders || [],
            salesData: {
                labels: (salesData || []).map(item => new Date(item.date).toLocaleDateString()),
                values: (salesData || []).map(item => Number(item.total) || 0)
            },
            topProducts: {
                labels: [],
                values: []
            }
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).send('Erro ao carregar dashboard: ' + error.message);
    }
});
// Keep only the login routes and the final dashboard route
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        req.session.loggedin = true;
        req.session.username = username;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Credenciais inválidas' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});
// Add products route
app.get('/produtos', async (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/login');
        return;
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [products] = await connection.execute('SELECT * FROM products');
        // Convert price to number for each product
        const formattedProducts = products.map(product => ({
            ...product,
            price: Number(product.price)
        }));
        await connection.end();
        res.render('products', { products: formattedProducts });
    } catch (error) {
        res.status(500).send('Erro ao carregar produtos');
    }
});

// Add promotions routes
app.get('/promocoes', async (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/login');
        return;
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [promotions] = await connection.execute('SELECT * FROM promotions');
        await connection.end();
        res.render('promotions', { promotions });
    } catch (error) {
        res.status(500).send('Erro ao carregar promoções');
    }
});

app.post('/promocoes/adicionar', async (req, res) => {
    if (!req.session.loggedin) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }

    try {
        const { code, discount, valid_until } = req.body;
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO promotions (code, discount, valid_until) VALUES (?, ?, ?)',
            [code, discount, valid_until]
        );
        await connection.end();
        res.redirect('/promocoes');
    } catch (error) {
        res.status(500).send('Erro ao adicionar promoção');
    }
});

app.get('/promocoes/deletar/:id', async (req, res) => {
    if (!req.session.loggedin) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM promotions WHERE id = ?', [req.params.id]);
        await connection.end();
        res.redirect('/promocoes');
    } catch (error) {
        res.status(500).send('Erro ao deletar promoção');
    }
});
// Add orders route
app.get('/pedidos', async (req, res) => {
    if (!req.session.loggedin) {
        res.redirect('/login');
        return;
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [orders] = await connection.execute('SELECT * FROM orders ORDER BY created_at DESC');
        const [todayResult] = await connection.execute(`
            SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
            FROM orders WHERE DATE(created_at) = CURDATE()
        `);
        const [pendingResult] = await connection.execute('SELECT COUNT(*) as count FROM orders WHERE status = "pending"');
        const [ratingResult] = await connection.execute('SELECT COALESCE(AVG(rating), 0) as avg FROM ratings');
        
        await connection.end();
        
        res.render('orders', {
            orders,
            ordersToday: Number(todayResult[0].count) || 0,
            salesToday: Number(todayResult[0].total) || 0,
            pendingOrders: Number(pendingResult[0].count) || 0,
            averageRating: Number(ratingResult[0].avg) || 0
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.status(500).send('Erro ao carregar pedidos');
    }
});
// Add product management routes
app.post('/produtos/adicionar', async (req, res) => {
    if (!req.session.loggedin) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }
    try {
        const { name, price, description, stock, category } = req.body;
        
        // Validate inputs
        if (!name || !price || !stock || !category) {
            throw new Error('Todos os campos obrigatórios devem ser preenchidos');
        }

        const connection = await mysql.createConnection(dbConfig);
        
        try {
            await connection.execute(
                'INSERT INTO products (name, price, description, stock, category) VALUES (?, ?, ?, ?, ?)',
                [name, Number(price), description || '', Number(stock), category]
            );
            await connection.end();
            res.redirect('/produtos');
        } catch (dbError) {
            console.error('Database error:', dbError);
            throw new Error('Erro ao inserir no banco de dados: ' + dbError.message);
        }
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).send('Erro ao adicionar produto: ' + error.message);
    }
});
app.post('/produtos/editar/:id', async (req, res) => {
    if (!req.session.loggedin) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }

    try {
        const { name, price, description, stock, category } = req.body;
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE products SET name = ?, price = ?, description = ?, stock = ?, category = ? WHERE id = ?',
            [name, price, description, stock, category, req.params.id]
        );
        await connection.end();
        res.redirect('/produtos');
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send('Erro ao atualizar produto');
    }
});

app.get('/produtos/deletar/:id', async (req, res) => {
    if (!req.session.loggedin) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
        await connection.end();
        res.redirect('/produtos');
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).send('Erro ao deletar produto');
    }
});
// Simple app.listen (removing all WhatsApp and QR code related code)
app.listen(port, () => {
    console.log(`Painel admin rodando em http://localhost:${port}`);
});