const express = require("express");
const axios = require("axios");
const CircuitBreaker = require("opossum");
const app = express();
const PORT = 3000;

app.use(express.json());

// ========== RATE LIMITER (ĐẶT TRƯỚC TIÊN) ==========
// Biến đếm cho rate limiter
let requestCount = 0;
const REQUEST_LIMIT = 5;
let resetTime = Date.now() + 60000; // Reset sau 1 phút

// Middleware kiểm tra giới hạn request - ĐẶT TRƯỚC TẤT CẢ ROUTES
app.use((req, res, next) => {
  // Bỏ qua status và reset routes
  if (
    req.path === "/rate-limit-status" ||
    req.path === "/reset-rate-limit" ||
    req.path === "/circuit-status" ||
    req.path === "/trip-circuit/payment" ||
    req.path === "/trip-circuit/inventory" ||
    req.path === "/trip-circuit/shipping"
  ) {
    return next();
  }

  // Kiểm tra nếu cần reset bộ đếm
  const now = Date.now();
  if (now >= resetTime) {
    requestCount = 0;
    resetTime = now + 60000; // Reset thời gian
    console.log("🕒 Rate limit đã được reset theo thời gian");
  }

  // Kiểm tra và tăng bộ đếm
  if (requestCount < REQUEST_LIMIT) {
    requestCount++;
    console.log(`✅ Request #${requestCount}/${REQUEST_LIMIT} được chấp nhận`);
    next();
  } else {
    console.log(
      `🚫 Request bị từ chối - Đã đạt giới hạn ${REQUEST_LIMIT} requests`
    );

    // Tính thời gian còn lại để reset
    const waitTime = Math.ceil((resetTime - now) / 1000);

    res.status(429).json({
      status: "error",
      message: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${waitTime} giây.`,
      retryAfter: waitTime,
    });
  }
});

// ========== CIRCUIT BREAKER ==========
// Circuit Breaker configurations
const circuitOptions = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  name: "service-circuit-breaker",
};

// Create circuit breakers for each service
const paymentServiceBreaker = new CircuitBreaker(async ({ orderId }) => {
  return await axios.post("http://localhost:3001/payments", { orderId });
}, circuitOptions);

const inventoryServiceBreaker = new CircuitBreaker(async ({ productId }) => {
  return await axios.put("http://localhost:3002/inventory", { productId });
}, circuitOptions);

const shippingServiceBreaker = new CircuitBreaker(async ({ orderId }) => {
  return await axios.post("http://localhost:3003/shipping", { orderId });
}, circuitOptions);

// Add circuit state logging
paymentServiceBreaker.on("open", () =>
  console.log("⚡ CIRCUIT OPENED: Payment Service unavailable")
);
paymentServiceBreaker.on("close", () =>
  console.log("✅ CIRCUIT CLOSED: Payment Service recovered")
);
paymentServiceBreaker.on("halfOpen", () =>
  console.log("🔄 CIRCUIT HALF-OPEN: Testing Payment Service")
);

inventoryServiceBreaker.on("open", () =>
  console.log("⚡ CIRCUIT OPENED: Inventory Service unavailable")
);
inventoryServiceBreaker.on("close", () =>
  console.log("✅ CIRCUIT CLOSED: Inventory Service recovered")
);
inventoryServiceBreaker.on("halfOpen", () =>
  console.log("🔄 CIRCUIT HALF-OPEN: Testing Inventory Service")
);

shippingServiceBreaker.on("open", () =>
  console.log("⚡ CIRCUIT OPENED: Shipping Service unavailable")
);
shippingServiceBreaker.on("close", () =>
  console.log("✅ CIRCUIT CLOSED: Shipping Service recovered")
);
shippingServiceBreaker.on("halfOpen", () =>
  console.log("🔄 CIRCUIT HALF-OPEN: Testing Shipping Service")
);

// Fallback functions
paymentServiceBreaker.fallback(() => ({
  data: "💸 Payment service is unavailable. Using fallback payment processing.",
}));
inventoryServiceBreaker.fallback(() => ({
  data: "📦 Inventory service is unavailable. Order marked for manual inventory check.",
}));
shippingServiceBreaker.fallback(() => ({
  data: "🚚 Shipping service is unavailable. Order queued for shipping later.",
}));

// ========== ROUTES ==========
// Order processing endpoint (CHỈ MỘT ROUTE DUY NHẤT)
app.post("/orders", async (req, res) => {
  const { orderId, productId } = req.body;

  try {
    // Gọi các services thông qua circuit breakers
    const payment = await paymentServiceBreaker.fire({ orderId });
    const inventory = await inventoryServiceBreaker.fire({ productId });
    const shipping = await shippingServiceBreaker.fire({ orderId });

    res.status(200).json({
      message: `✅ Đơn hàng ${orderId} đã được xử lý thành công`,
      payment: payment.data,
      inventory: inventory.data,
      shipping: shipping.data,
      requestNumber: requestCount,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      status: "error",
      message: "❌ Lỗi khi đặt hàng: " + err.message,
    });
  }
});

// Circuit Breaker status
app.get("/circuit-status", (req, res) => {
  res.json({
    payment: {
      state: paymentServiceBreaker.status,
      isOpen: paymentServiceBreaker.opened,
      isHalfOpen: paymentServiceBreaker.halfOpen,
      isClosed: paymentServiceBreaker.closed,
    },
    inventory: {
      state: inventoryServiceBreaker.status,
      isOpen: inventoryServiceBreaker.opened,
      isHalfOpen: inventoryServiceBreaker.halfOpen,
      isClosed: inventoryServiceBreaker.closed,
    },
    shipping: {
      state: shippingServiceBreaker.status,
      isOpen: shippingServiceBreaker.opened,
      isHalfOpen: shippingServiceBreaker.halfOpen,
      isClosed: shippingServiceBreaker.closed,
    },
  });
});

// Trip circuit manually
app.post("/trip-circuit/:service", (req, res) => {
  const { service } = req.params;

  if (service === "payment") {
    paymentServiceBreaker.open();
    console.log("⚡ Circuit OPENED manually: Payment Service");
    res.send("Payment service circuit manually opened");
  } else if (service === "inventory") {
    inventoryServiceBreaker.open();
    console.log("⚡ Circuit OPENED manually: Inventory Service");
    res.send("Inventory service circuit manually opened");
  } else if (service === "shipping") {
    shippingServiceBreaker.open();
    console.log("⚡ Circuit OPENED manually: Shipping Service");
    res.send("Shipping service circuit manually opened");
  } else {
    res.status(400).send("Invalid service name");
  }
});

// Rate limiter status
app.get("/rate-limit-status", (req, res) => {
  const now = Date.now();
  const remainingTime = Math.max(0, resetTime - now);
  const remainingRequests = Math.max(0, REQUEST_LIMIT - requestCount);

  res.json({
    remainingRequests: remainingRequests,
    msBeforeNext: remainingTime,
    secondsBeforeReset: Math.ceil(remainingTime / 1000),
    isBlocked: remainingRequests === 0,
    consumedPoints: requestCount,
    totalLimit: REQUEST_LIMIT,
  });
});

// Reset rate limiter
app.post("/reset-rate-limit", (req, res) => {
  requestCount = 0;
  resetTime = Date.now() + 60000;
  console.log("🔄 Rate limit đã được reset thủ công");

  res.json({
    status: "success",
    message: "Rate limit đã được reset thành công",
    remainingRequests: REQUEST_LIMIT,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🚀 Order Service đang chạy trên cổng ${PORT} với Circuit Breaker và Rate Limiter`
  );
  console.log(`⏱️ Rate Limiter: ${REQUEST_LIMIT} requests / 60 giây`);
});
