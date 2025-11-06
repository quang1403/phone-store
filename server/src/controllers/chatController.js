const chatService = require("../services/chatService");
const productSearchService = require("../services/productSearchService");

/**
 * Controller xử lý các API endpoints cho chatbot
 */

/**
 * POST /api/chat/ask
 * Endpoint duy nhất cho mọi loại câu hỏi
 * Backend tự động nhận diện intent và xử lý phù hợp
 */
exports.askChatbot = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user?.id || null; // Optional - guest có thể chat

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Thiếu nội dung tin nhắn",
      });
    }

    // Tạo sessionId nếu chưa có
    const finalSessionId =
      sessionId ||
      `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Nhận diện intent tự động từ message
    const intent = detectIntent(message, userId);

    let result;

    switch (intent) {
      case "order_tracking":
        // Tra cứu đơn hàng (cần auth)
        if (!userId) {
          result = {
            reply:
              "Vui lòng đăng nhập để tra cứu đơn hàng. Bạn có thể đăng nhập tại trang chủ.",
            sessionId: finalSessionId,
          };
        } else {
          result = await chatService.handleOrderTracking(
            userId,
            finalSessionId,
            message
          );
        }
        break;

      case "product_inquiry":
      case "check_stock":
        // Tư vấn sản phẩm và kiểm tra tồn kho đều dùng handleProductInquiry
        // Service này sẽ tự động nhận diện câu hỏi về tồn kho
        result = await chatService.handleProductInquiry(
          userId,
          finalSessionId,
          message
        );
        break;

      case "recommendations":
        // Gợi ý sản phẩm
        result = await chatService.handleRecommendations(
          userId,
          finalSessionId,
          message
        );
        break;

      case "compare":
        // So sánh sản phẩm
        result = await chatService.handleProductComparison(
          userId,
          finalSessionId,
          message
        );
        break;

      default:
        // Hỏi đáp chung
        result = await chatService.handleGeneralQuestion(
          userId,
          finalSessionId,
          message
        );
    }

    // Đảm bảo intent luôn được trả về
    res.json({
      success: true,
      ...result,
      intent, // Ghi đè intent từ result nếu có
      sessionId: finalSessionId, // Đảm bảo sessionId luôn được trả về
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in askChatbot:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi xử lý câu hỏi",
      details: error.message,
    });
  }
};

/**
 * Hàm nhận diện intent từ message
 */
function detectIntent(message, userId) {
  const lowerMsg = message.toLowerCase();

  // Tra cứu đơn hàng
  if (
    lowerMsg.includes("đơn hàng") ||
    lowerMsg.includes("order") ||
    lowerMsg.includes("tra cứu") ||
    lowerMsg.includes("tracking") ||
    lowerMsg.includes("theo dõi") ||
    lowerMsg.includes("kiểm tra đơn")
  ) {
    return "order_tracking";
  }

  // So sánh sản phẩm
  if (
    lowerMsg.includes("so sánh") ||
    lowerMsg.includes("khác nhau") ||
    lowerMsg.includes("compare") ||
    lowerMsg.includes("giống") ||
    lowerMsg.includes("vs") ||
    lowerMsg.includes("và")
  ) {
    return "compare";
  }

  // Kiểm tra tồn kho
  if (
    lowerMsg.includes("tồn kho") ||
    lowerMsg.includes("còn hàng") ||
    lowerMsg.includes("stock") ||
    lowerMsg.includes("available") ||
    lowerMsg.includes("sẵn hàng")
  ) {
    return "check_stock";
  }

  // Gợi ý sản phẩm
  if (
    lowerMsg.includes("gợi ý") ||
    lowerMsg.includes("recommend") ||
    lowerMsg.includes("nên mua") ||
    lowerMsg.includes("phù hợp") ||
    lowerMsg.includes("tư vấn mua") ||
    lowerMsg.includes("chọn")
  ) {
    return "recommendations";
  }

  // Tư vấn sản phẩm (hỏi về sản phẩm cụ thể)
  if (
    lowerMsg.includes("sản phẩm") ||
    lowerMsg.includes("điện thoại") ||
    lowerMsg.includes("phone") ||
    lowerMsg.includes("iphone") ||
    lowerMsg.includes("samsung") ||
    lowerMsg.includes("xiaomi") ||
    lowerMsg.includes("oppo") ||
    lowerMsg.includes("vivo") ||
    lowerMsg.includes("realme") ||
    lowerMsg.includes("nokia") ||
    lowerMsg.includes("giá") ||
    lowerMsg.includes("price") ||
    lowerMsg.includes("thông số") ||
    lowerMsg.includes("specs") ||
    lowerMsg.includes("cấu hình") ||
    lowerMsg.includes("màu") ||
    lowerMsg.includes("color") ||
    lowerMsg.includes("phiên bản") ||
    lowerMsg.includes("variant")
  ) {
    return "product_inquiry";
  }

  // Mặc định: hỏi đáp chung
  return "general";
}

/**
 * POST /api/chat/product-inquiry
 * Tư vấn sản phẩm với RAG (truy xuất dữ liệu thực)
 */
exports.productInquiry = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user?.id || null;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Thiếu nội dung tin nhắn",
      });
    }

    const finalSessionId =
      sessionId ||
      `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await chatService.handleProductInquiry(
      userId,
      finalSessionId,
      message
    );

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in productInquiry:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi tư vấn sản phẩm",
      details: error.message,
    });
  }
};

/**
 * POST /api/chat/order-tracking
 * Tra cứu đơn hàng
 * Body: { message, sessionId, orderId (optional) }
 */
exports.orderTracking = async (req, res) => {
  try {
    const { message, sessionId, orderId } = req.body;
    const userId = req.user?.id;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Thiếu nội dung tin nhắn",
      });
    }

    if (!userId && !orderId) {
      return res.status(401).json({
        success: false,
        error: "Vui lòng đăng nhập hoặc cung cấp mã đơn hàng",
      });
    }

    const finalSessionId = sessionId || `user_${userId}_${Date.now()}`;

    const result = await chatService.handleOrderTracking(
      userId,
      finalSessionId,
      message,
      orderId
    );

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in orderTracking:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi tra cứu đơn hàng",
      details: error.message,
    });
  }
};

/**
 * POST /api/chat/recommendations
 * Gợi ý sản phẩm
 * Body: { message, sessionId, productId (optional - để gợi ý sản phẩm tương tự) }
 */
exports.recommendations = async (req, res) => {
  try {
    const { message, sessionId, productId } = req.body;
    const userId = req.user?.id || null;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Thiếu nội dung tin nhắn",
      });
    }

    const finalSessionId =
      sessionId ||
      `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await chatService.handleRecommendations(
      userId,
      finalSessionId,
      message,
      productId
    );

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in recommendations:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi gợi ý sản phẩm",
      details: error.message,
    });
  }
};

/**
 * POST /api/chat/compare
 * So sánh sản phẩm
 * Body: { message, sessionId, productIds: [id1, id2] }
 */
exports.compareProducts = async (req, res) => {
  try {
    const { message, sessionId, productIds } = req.body;
    const userId = req.user?.id || null;

    if (!message || !productIds || productIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin hoặc cần ít nhất 2 sản phẩm để so sánh",
      });
    }

    const finalSessionId =
      sessionId ||
      `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await chatService.handleProductComparison(
      userId,
      finalSessionId,
      message,
      productIds
    );

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in compareProducts:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi so sánh sản phẩm",
      details: error.message,
    });
  }
};

/**
 * GET /api/chat/history/:sessionId
 * Lấy lịch sử hội thoại
 */
exports.getChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "Thiếu sessionId",
      });
    }

    const result = await chatService.getChatHistory(sessionId);

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in getChatHistory:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi lấy lịch sử chat",
      details: error.message,
    });
  }
};

/**
 * POST /api/chat/check-stock
 * Kiểm tra tồn kho sản phẩm
 * Body: { productId, variant (optional) }
 */
exports.checkStock = async (req, res) => {
  try {
    let { productId, variant, sessionId } = req.body;

    // Nếu không có productId, thử lấy từ context hội thoại
    if (!productId && sessionId) {
      const ChatSession = require("../models/ChatSession");
      const session = await ChatSession.findOne({ sessionId });
      if (session && session.context && session.context.currentProduct) {
        productId = session.context.currentProduct;
      }
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu productId hoặc không xác định được sản phẩm từ ngữ cảnh hội thoại",
      });
    }

    const result = await productSearchService.checkStock(productId, variant);

    res.json({
      success: true,
      ...result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in checkStock:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi kiểm tra tồn kho",
      details: error.message,
    });
  }
};

/**
 * GET /api/chat/product-details/:productId
 * Lấy chi tiết sản phẩm
 */
exports.getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Thiếu productId",
      });
    }

    const product = await productSearchService.getProductDetails(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy sản phẩm",
      });
    }

    res.json({
      success: true,
      product,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error in getProductDetails:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi lấy chi tiết sản phẩm",
      details: error.message,
    });
  }
};
