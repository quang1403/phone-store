const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { auth } = require("../middleware/auth");
const installmentController = require("../controllers/installmentController");

/**
 * Chatbot Routes
 *
 * RECOMMENDED (Endpoint duy nhất):
 * - POST /api/chat/ask - Endpoint duy nhất cho mọi loại câu hỏi
 *   Backend tự động nhận diện intent và xử lý phù hợp
 *   Body: { message, sessionId }
 *   Response: { success, reply, intent, ... }
 *
 * Legacy endpoints (giữ lại để tương thích ngược):
 * - POST /api/chat/product-inquiry - Tư vấn sản phẩm
 * - POST /api/chat/recommendations - Gợi ý sản phẩm
 * - POST /api/chat/compare - So sánh sản phẩm
 * - POST /api/chat/check-stock - Kiểm tra tồn kho
 * - GET /api/chat/product-details/:productId - Chi tiết sản phẩm
 *
 * Protected routes (cần auth):
 * - POST /api/chat/order-tracking - Tra cứu đơn hàng
 * - GET /api/chat/history/:sessionId - Lịch sử chat
 */

// ⭐ ENDPOINT DUY NHẤT - Khuyến nghị sử dụng
router.post("/ask", chatController.askChatbot);

// Legacy endpoints - Giữ lại để tương thích ngược
router.post("/product-inquiry", chatController.productInquiry);
router.post("/recommendations", chatController.recommendations);
router.post("/compare", chatController.compareProducts);
router.post("/check-stock", chatController.checkStock);
router.get("/product-details/:productId", chatController.getProductDetails);

// Protected routes - Yêu cầu authentication
router.post("/order-tracking", auth, chatController.orderTracking);
router.get("/history/:sessionId", chatController.getChatHistory);

module.exports = router;
