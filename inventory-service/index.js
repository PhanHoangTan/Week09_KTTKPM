const express = require('express');
const app = express();
const PORT = 3002;

app.use(express.json());

app.put('/inventory', (req, res) => {
    const { productId } = req.body;
    res.send(`📦 Inventory updated for product ${productId}`);
});

app.listen(PORT, () => console.log(`🏬 Inventory Service running on port ${PORT}`));