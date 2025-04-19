const express = require('express');
const app = express();
const PORT = 3003;

app.use(express.json());

app.post('/shipping', (req, res) => {
    const { orderId } = req.body;
    res.send(`🚚 Shipping started for order ${orderId}`);
});

app.listen(PORT, () => console.log(`🚛 Shipping Service running on port ${PORT}`));
