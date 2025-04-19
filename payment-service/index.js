const express = require("express");
const app = express();
const PORT = 3001;

app.use(express.json());

app.post("/payments", (req, res) => {
  const { orderId } = req.body;
  res.send(`💰 Payment processed for order ${orderId}`);
});

app.listen(PORT, () =>
  console.log(`💳 Service B (Payment Service) đang chạy trên cổng ${PORT}`)
);
