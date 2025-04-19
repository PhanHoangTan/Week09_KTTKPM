const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3008;

// Giao tiếp dạng JSON
app.use(express.json());

// Proxy config
app.use('/orders', createProxyMiddleware({
    target: 'http://localhost:3000', // order-service
    changeOrigin: true
}));

app.use('/payments', createProxyMiddleware({
    target: 'http://localhost:3001', // payment-service
    changeOrigin: true
}));

app.use('/inventory', createProxyMiddleware({
    target: 'http://localhost:3002', // inventory-service
    changeOrigin: true
}));

app.use('/shipping', createProxyMiddleware({
    target: 'http://localhost:3003', // shipping-service
    changeOrigin: true
}));

// Lắng nghe cổng chính
app.listen(PORT, () => {
    console.log(`🌐 API Gateway đang chạy tại http://localhost:${PORT}`);
});
