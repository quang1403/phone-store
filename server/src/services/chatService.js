const axios = require("axios");
const ChatSession = require("../models/ChatSession");
const productSearchService = require("./productSearchService");
const Order = require("../models/Order");
const Product = require("../models/Product");

/**
 * Service xử lý logic AI với ChatGPT
 */
class ChatService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.apiUrl = "https://api.openai.com/v1/chat/completions";
    this.model = "gpt-4o-mini";
    this.baseSystemPrompt = `Bạn là trợ lý tư vấn bán hàng chuyên nghiệp của cửa hàng điện thoại Phone Store.

Nhiệm vụ của bạn:
- Tư vấn điện thoại, phụ kiện phù hợp với nhu cầu khách hàng
- Giải đáp thắc mắc về sản phẩm, thông số kỹ thuật, giá cả
- Hướng dẫn so sánh sản phẩm
- Tra cứu đơn hàng và thông tin bảo hành
- Giới thiệu chương trình khuyến mãi
- Hỗ trợ đặt hàng

Phong cách giao tiếp:
- Thân thiện, nhiệt tình và chuyên nghiệp
- Trả lời ngắn gọn, súc tích, dễ hiểu
- Đưa ra gợi ý cụ thể khi khách hàng chưa rõ nhu cầu
- Luôn hỏi thêm thông tin nếu cần để tư vấn chính xác hơn

QUAN TRỌNG: Chỉ tư vấn các sản phẩm CÓ TRONG DANH SÁCH bên dưới. Không bịa đặt hoặc giới thiệu sản phẩm không có sẵn.`;
    this.productListCache = null;
    this.productListCacheTime = null;
  }

  /**
   * Lấy danh sách sản phẩm từ database và cache 5 phút
   */
  async getProductListContext() {
    const now = Date.now();
    // Cache 5 phút để giảm tải database
    if (
      this.productListCache &&
      this.productListCacheTime &&
      now - this.productListCacheTime < 300000
    ) {
      return this.productListCache;
    }

    try {
      // Lấy TOÀN BỘ sản phẩm còn hàng từ database
      const products = await Product.find({ stock: { $gt: 0 } })
        .populate("brand", "name")
        .select("name price brand ram storage battery stock discount")
        .sort({ brand: 1, price: 1 }); // Sắp xếp theo hãng và giá

      const productList = products
        .map(
          (p, i) =>
            `${i + 1}. ${p.name} - Giá: ${p.price.toLocaleString("vi-VN")}đ${
              p.discount > 0 ? ` (Giảm ${p.discount}%)` : ""
            } - Hãng: ${p.brand?.name || "N/A"} - RAM: ${p.ram}GB - ROM: ${
              p.storage
            }GB - Pin: ${p.battery}mAh - Tồn kho: ${p.stock}`
        )
        .join("\n");

      this.productListCache = `\n\n📱 DANH SÁCH SẢN PHẨM CÓ SẴN (${products.length} sản phẩm):\n${productList}`;
      this.productListCacheTime = now;
      return this.productListCache;
    } catch (error) {
      console.error("Error getting product list:", error);
      return "";
    }
  }

  /**
   * Gọi ChatGPT API với system prompt đầy đủ
   */
  async callGeminiAPI(prompt, context = "") {
    try {
      // Lấy danh sách sản phẩm từ database
      const productListContext = await this.getProductListContext();
      const fullSystemPrompt = this.baseSystemPrompt + productListContext;

      const messages = [{ role: "system", content: fullSystemPrompt }];

      if (context) {
        messages.push({
          role: "system",
          content: `Thông tin bổ sung:\n${context}`,
        });
      }

      messages.push({ role: "user", content: prompt });

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1024,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(
        "ChatGPT API Error:",
        error.response?.data || error.message
      );
      throw new Error("Không thể kết nối với AI service");
    }
  }

  /**
   * Xử lý câu hỏi chung
   */
  async handleGeneralQuestion(userId, sessionId, message) {
    try {
      // Lấy hoặc tạo session
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = new ChatSession({ userId, sessionId });
        await session.save();
      }

      // Thêm message của user
      await session.addMessage("user", message);

      // Nhận diện ý định: nếu hỏi về "phiên bản", "tồn kho" và có currentProduct trong context
      const lowerMsg = message.toLowerCase();
      const isAskingVariants =
        (lowerMsg.includes("phiên bản") ||
          lowerMsg.includes("tất cả") ||
          lowerMsg.includes("còn hàng") ||
          lowerMsg.includes("tồn kho")) &&
        session.context &&
        session.context.currentProduct;

      if (isAskingVariants) {
        // Truy xuất thông tin phiên bản từ productId trong context
        const productId = session.context.currentProduct;
        const stockInfo = await productSearchService.checkStock(productId);

        let variantContext = "";
        if (stockInfo.variants && stockInfo.variants.length > 0) {
          variantContext = `${stockInfo.message}\n\n`;
          stockInfo.variants.forEach((v, index) => {
            variantContext += `${index + 1}. RAM ${v.ram}GB / ROM ${v.storage}GB
   - Giá: ${v.price.toLocaleString("vi-VN")}đ
   - Tồn kho: ${v.available ? `Còn ${v.stock} sản phẩm` : "Hết hàng"}
   - Trạng thái: ${v.available ? "✅ Có sẵn" : "❌ Hết hàng"}

`;
          });

          const prompt = `${variantContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về các phiên bản và tồn kho một cách rõ ràng, ngắn gọn và chuyên nghiệp.`;

          const reply = await this.callGeminiAPI(prompt);
          await session.addMessage("assistant", reply, { stockInfo });

          return {
            success: true,
            message,
            reply,
            variants: stockInfo.variants,
            sessionId: session.sessionId,
          };
        } else if (stockInfo.stock !== undefined) {
          variantContext = `Tồn kho: ${
            stockInfo.available ? `Còn ${stockInfo.stock} sản phẩm` : "Hết hàng"
          }`;

          const prompt = `${variantContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về tồn kho một cách rõ ràng và ngắn gọn.`;

          const reply = await this.callGeminiAPI(prompt);
          await session.addMessage("assistant", reply, { stockInfo });

          return {
            success: true,
            message,
            reply,
            stock: stockInfo.stock,
            sessionId: session.sessionId,
          };
        }
      }

      // Lấy lịch sử hội thoại (5 tin nhắn gần nhất)
      const recentMessages = session.messages.slice(-5);
      const conversationContext = recentMessages
        .map(
          (msg) =>
            `${msg.role === "user" ? "Khách hàng" : "Bạn"}: ${msg.content}`
        )
        .join("\n");

      // Gọi AI
      const reply = await this.callGeminiAPI(message, conversationContext);

      // Lưu reply
      await session.addMessage("assistant", reply);

      return {
        success: true,
        message,
        reply,
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("Error in handleGeneralQuestion:", error);
      throw error;
    }
  }

  /**
   * Xử lý tư vấn sản phẩm (có RAG - truy xuất dữ liệu thực)
   */
  async handleProductInquiry(userId, sessionId, message) {
    try {
      // Lấy hoặc tạo session
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = new ChatSession({ userId, sessionId });
        await session.save();
      }

      // Thêm message của user
      await session.addMessage("user", message);

      // Khởi tạo context nếu chưa có
      if (!session.context) {
        session.context = {};
      }

      console.log(`\n🔍 [handleProductInquiry] SessionId: ${sessionId}`);
      console.log(`📝 Message: "${message}"`);
      console.log(`💾 Current Context:`, {
        currentProduct: session.context.currentProduct,
        currentProductName: session.context.currentProductName,
        lastIntent: session.context.lastIntent,
      });

      // Nhận diện ý định: nếu hỏi về "phiên bản", "tồn kho", "màu" và có currentProduct trong context
      const lowerMsg = message.toLowerCase();

      // Kiểm tra xem có đang hỏi về sản phẩm trong context không
      const hasCurrentProduct = session.context.currentProduct;

      // Nhận diện các từ khóa cho câu hỏi follow-up
      const isAskingVariants =
        hasCurrentProduct &&
        (lowerMsg.includes("phiên bản") ||
          lowerMsg.includes("tất cả") ||
          lowerMsg.includes("liệt kê") ||
          lowerMsg.includes("xem") ||
          lowerMsg.includes("còn") ||
          lowerMsg.includes("có") ||
          lowerMsg.includes("bao nhiêu") ||
          /\bcó\s+(những|các|mấy)/.test(lowerMsg));

      const isAskingColors =
        hasCurrentProduct &&
        (lowerMsg.includes("màu") ||
          lowerMsg.includes("mau") ||
          lowerMsg.includes("color") ||
          lowerMsg.includes("mầu"));

      const isAskingStock =
        hasCurrentProduct &&
        (lowerMsg.includes("tồn kho") ||
          lowerMsg.includes("còn hàng") ||
          lowerMsg.includes("sẵn hàng") ||
          lowerMsg.includes("còn không") ||
          lowerMsg.includes("có không"));

      // ⭐ ƯU TIÊN XỬ LÝ CÂU HỎI FOLLOW-UP VỀ SẢN PHẨM TRONG CONTEXT

      // 1. Xử lý câu hỏi về màu sắc
      if (isAskingColors) {
        console.log(
          `🎨 Phát hiện câu hỏi về màu sắc, sử dụng context: ${session.context.currentProduct}`
        );

        // Truy xuất thông tin màu sắc từ productId trong context
        const productId = session.context.currentProduct;
        const product = await Product.findById(productId).populate(
          "brand category"
        );

        if (!product) {
          const reply =
            "Xin lỗi, không tìm thấy thông tin sản phẩm bạn đang hỏi.";
          await session.addMessage("assistant", reply);
          return {
            success: false,
            message,
            reply,
            sessionId: session.sessionId,
          };
        }

        let colorContext = `Thông tin về sản phẩm: ${product.name}\n`;
        colorContext += `Giá: ${product.price.toLocaleString("vi-VN")}đ\n\n`;

        if (product.color && product.color.length > 0) {
          colorContext += `Các màu sắc có sẵn:\n`;
          product.color.forEach((c, index) => {
            colorContext += `${index + 1}. ${c}\n`;
          });
        } else {
          colorContext += `Sản phẩm này chưa có thông tin về màu sắc.`;
        }

        const recentMessages = session.messages.slice(-5);
        const conversationContext = recentMessages
          .map(
            (msg) =>
              `${msg.role === "user" ? "Khách hàng" : "Bạn"}: ${msg.content}`
          )
          .join("\n");

        const fullContext = `Lịch sử hội thoại:\n${conversationContext}\n\n${colorContext}`;

        const prompt = `${colorContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về các màu sắc có sẵn một cách rõ ràng, ngắn gọn.`;

        const reply = await this.callGeminiAPI(prompt, fullContext);
        await session.addMessage("assistant", reply, {
          productId,
          productName: product.name,
          colors: product.color,
        });

        return {
          success: true,
          message,
          reply,
          product: {
            id: product._id,
            name: product.name,
            colors: product.color,
          },
          sessionId: session.sessionId,
        };
      }

      // 2. Xử lý câu hỏi về phiên bản / tồn kho
      if (isAskingVariants || isAskingStock) {
        console.log(
          `📦 Phát hiện câu hỏi về phiên bản/tồn kho, sử dụng context: ${session.context.currentProduct}`
        );

        // Truy xuất thông tin phiên bản từ productId trong context
        const productId = session.context.currentProduct;
        const product = await Product.findById(productId).populate(
          "brand category"
        );

        if (!product) {
          const reply =
            "Xin lỗi, không tìm thấy thông tin sản phẩm bạn đang hỏi.";
          await session.addMessage("assistant", reply);
          return {
            success: false,
            message,
            reply,
            sessionId: session.sessionId,
          };
        }

        const stockInfo = await productSearchService.checkStock(productId);

        let variantContext = `Thông tin về sản phẩm: ${product.name}\n`;
        variantContext += `Giá cơ bản: ${product.price.toLocaleString(
          "vi-VN"
        )}đ\n\n`;

        if (stockInfo.variants && stockInfo.variants.length > 0) {
          variantContext += `Danh sách các phiên bản:\n\n`;
          stockInfo.variants.forEach((v, index) => {
            variantContext += `${index + 1}. Phiên bản RAM ${v.ram}GB / ROM ${
              v.storage
            }GB
   - Giá: ${v.price.toLocaleString("vi-VN")}đ
   - Tồn kho: ${v.available ? `Còn ${v.stock} sản phẩm` : "Hết hàng"}
   - Trạng thái: ${v.available ? "✅ Có sẵn" : "❌ Hết hàng"}

`;
          });

          const prompt = `${variantContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về các phiên bản và tồn kho một cách rõ ràng, ngắn gọn, chuyên nghiệp. Đưa ra gợi ý nếu cần.`;

          // Lấy lịch sử hội thoại để AI hiểu ngữ cảnh
          const recentMessages = session.messages.slice(-5);
          const conversationContext = recentMessages
            .map(
              (msg) =>
                `${msg.role === "user" ? "Khách hàng" : "Bạn"}: ${msg.content}`
            )
            .join("\n");

          const fullContext = `Lịch sử hội thoại:\n${conversationContext}\n\n${variantContext}`;

          const reply = await this.callGeminiAPI(prompt, fullContext);
          await session.addMessage("assistant", reply, {
            productId,
            productName: product.name,
            variants: stockInfo.variants,
          });

          return {
            success: true,
            message,
            reply,
            product: {
              id: product._id,
              name: product.name,
              price: product.price,
            },
            variants: stockInfo.variants,
            sessionId: session.sessionId,
          };
        } else {
          variantContext += `Tồn kho: ${
            stockInfo.available ? `Còn ${stockInfo.stock} sản phẩm` : "Hết hàng"
          }\n`;
          variantContext += `Sản phẩm này không có phân loại phiên bản riêng biệt.`;

          const prompt = `${variantContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về tồn kho một cách rõ ràng và ngắn gọn.`;

          // Lấy lịch sử hội thoại để AI hiểu ngữ cảnh
          const recentMessages = session.messages.slice(-5);
          const conversationContext = recentMessages
            .map(
              (msg) =>
                `${msg.role === "user" ? "Khách hàng" : "Bạn"}: ${msg.content}`
            )
            .join("\n");

          const fullContext = `Lịch sử hội thoại:\n${conversationContext}\n\n${variantContext}`;

          const reply = await this.callGeminiAPI(prompt, fullContext);
          await session.addMessage("assistant", reply, {
            productId,
            productName: product.name,
            stock: stockInfo.stock,
          });

          return {
            success: true,
            message,
            reply,
            product: {
              id: product._id,
              name: product.name,
              price: product.price,
            },
            stock: stockInfo.stock,
            sessionId: session.sessionId,
          };
        }
      }

      // Tìm sản phẩm phù hợp
      const products = await productSearchService.searchProducts(message);

      // Xây dựng context về sản phẩm
      let productContext = "";
      if (products.length > 0) {
        productContext = "Danh sách sản phẩm phù hợp:\n\n";
        products.forEach((product, index) => {
          productContext += `${index + 1}. ${product.name}
   - Giá: ${product.price.toLocaleString("vi-VN")}đ ${
            product.discount > 0 ? `(Giảm ${product.discount}%)` : ""
          }
   - RAM: ${product.ram}GB, Bộ nhớ: ${product.storage}GB
   - Pin: ${product.battery}mAh
   - Màn hình: ${product.displaySize}" ${product.displayType || ""}
   - Chip: ${product.chipset || "N/A"}
   - Camera: ${product.cameraRear || "N/A"}
   - Thương hiệu: ${product.brand?.name || "N/A"}
   - Đánh giá: ${product.rating}/5 ⭐ (${product.sold} đã bán)
   - Tồn kho: ${product.stock > 0 ? `Còn ${product.stock} máy` : "Hết hàng"}
   - ID: ${product._id}

`;
        });

        // ⭐ LUU PRODUCTID VÀO CONTEXT - Quan trọng cho câu hỏi follow-up
        session.context.currentProduct = products[0]._id;
        session.context.currentProductName = products[0].name;
        session.context.lastIntent = "product_search";
        session.context.lastUpdate = new Date();
        session.context.filters = await productSearchService.extractFilters(
          message
        );

        // Lưu session với context mới
        await session.save();

        console.log(
          `✅ Đã lưu productId vào context: ${products[0]._id} (${products[0].name})`
        );
      } else {
        productContext =
          "Không tìm thấy sản phẩm phù hợp với yêu cầu. Hãy gợi ý khách hàng mở rộng tiêu chí tìm kiếm.";
      }

      // Lấy lịch sử hội thoại để AI hiểu ngữ cảnh
      const recentMessages = session.messages.slice(-5);
      const conversationContext = recentMessages
        .map(
          (msg) =>
            `${msg.role === "user" ? "Khách hàng" : "Bạn"}: ${msg.content}`
        )
        .join("\n");

      const fullContext = `Lịch sử hội thoại:\n${conversationContext}\n\n${productContext}`;

      // Gọi AI với context sản phẩm
      const prompt = `Dựa vào danh sách sản phẩm bên dưới, hãy tư vấn cho khách hàng về những sản phẩm phù hợp nhất. 
Giải thích lý do tại sao các sản phẩm này phù hợp với yêu cầu của khách hàng.
Nếu có nhiều lựa chọn, hãy so sánh ưu nhược điểm của từng sản phẩm.
Nếu không tìm thấy sản phẩm, hãy hỏi thêm để hiểu rõ nhu cầu khách hàng.

${productContext}

Câu hỏi của khách hàng: ${message}`;

      const reply = await this.callGeminiAPI(prompt, fullContext);

      // Lưu reply với metadata
      await session.addMessage("assistant", reply, {
        products: products.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price,
        })),
      });

      return {
        success: true,
        message,
        reply,
        products: products.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price,
          discount: p.discount,
          images: p.images,
          rating: p.rating,
          stock: p.stock,
        })),
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("Error in handleProductInquiry:", error);
      throw error;
    }
  }

  /**
   * Xử lý tra cứu đơn hàng
   */
  async handleOrderTracking(userId, sessionId, message, orderId = null) {
    try {
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = new ChatSession({ userId, sessionId });
        await session.save();
      }

      await session.addMessage("user", message);

      let orderContext = "";

      if (orderId) {
        // Tra cứu đơn hàng cụ thể
        const order = await Order.findById(orderId)
          .populate("customerId", "fullName email phone")
          .populate("items.productId", "name price images");

        if (order) {
          const statusMap = {
            0: "Chờ xác nhận",
            1: "Đã xác nhận",
            2: "Đang giao hàng",
            3: "Đã giao hàng",
            4: "Đã hủy",
          };

          orderContext = `Thông tin đơn hàng #${order._id}:
- Trạng thái: ${statusMap[order.status]}
- Tổng tiền: ${order.total.toLocaleString("vi-VN")}đ
- Địa chỉ giao: ${order.address}
- Số điện thoại: ${order.phone}
- Phương thức thanh toán: ${
            order.paymentMethod === "cod"
              ? "COD (Thanh toán khi nhận hàng)"
              : "Chuyển khoản"
          }
- Ngày đặt: ${new Date(order.createdAt).toLocaleDateString("vi-VN")}
- Sản phẩm:
${order.items
  .map(
    (item, i) =>
      `  ${i + 1}. ${item.productId.name} x${
        item.quantity
      } - ${item.price.toLocaleString("vi-VN")}đ`
  )
  .join("\n")}`;
        } else {
          orderContext = `Không tìm thấy đơn hàng với ID: ${orderId}`;
        }
      } else if (userId) {
        // Tự động nhận diện trạng thái từ câu hỏi
        const statusKeywords = {
          0: ["chờ xác nhận", "chưa xác nhận", "đang chờ"],
          1: ["đã xác nhận", "xác nhận"],
          2: ["đang giao", "đang vận chuyển", "giao hàng"],
          3: ["đã giao", "giao thành công", "đã nhận"],
          4: ["đã hủy", "hủy", "đơn bị hủy"],
        };

        let detectedStatus = null;
        const lowerMsg = message.toLowerCase();
        for (const [status, keywords] of Object.entries(statusKeywords)) {
          if (keywords.some((kw) => lowerMsg.includes(kw))) {
            detectedStatus = Number(status);
            break;
          }
        }

        const statusMap = {
          0: "Chờ xác nhận",
          1: "Đã xác nhận",
          2: "Đang giao hàng",
          3: "Đã giao hàng",
          4: "Đã hủy",
        };

        let orders = [];
        if (detectedStatus !== null) {
          // Lọc đơn theo trạng thái nhận diện được
          orders = await Order.find({
            customerId: userId,
            status: detectedStatus,
          })
            .populate("items.productId", "name")
            .sort({ createdAt: -1 });
        } else {
          // Nếu không nhận diện được, trả về tất cả đơn hàng gần đây
          orders = await Order.find({ customerId: userId })
            .populate("items.productId", "name")
            .sort({ createdAt: -1 })
            .limit(5);
        }

        if (orders.length > 0) {
          orderContext =
            detectedStatus !== null
              ? `Các đơn hàng trạng thái "${statusMap[detectedStatus]}" của bạn:\n\n`
              : `Danh sách đơn hàng gần đây của bạn:\n\n`;
          orders.forEach((order, index) => {
            orderContext += `${index + 1}. Đơn hàng #${order._id}
   - Trạng thái: ${statusMap[order.status]}
   - Tổng tiền: ${order.total.toLocaleString("vi-VN")}đ
   - Ngày đặt: ${new Date(order.createdAt).toLocaleDateString("vi-VN")}
   - Sản phẩm: ${order.items.map((item) => item.productId.name).join(", ")}

`;
          });
        } else {
          orderContext =
            detectedStatus !== null
              ? `Hiện tại bạn không có đơn hàng nào ở trạng thái "${statusMap[detectedStatus]}".`
              : "Bạn chưa có đơn hàng nào.";
        }
      } else {
        orderContext =
          "Vui lòng đăng nhập để tra cứu đơn hàng hoặc cung cấp mã đơn hàng.";
      }

      const prompt = `${orderContext}

Câu hỏi của khách hàng: ${message}

Hãy trả lời khách hàng về thông tin đơn hàng một cách rõ ràng và hữu ích.`;

      const reply = await this.callGeminiAPI(prompt);
      await session.addMessage("assistant", reply);

      return {
        success: true,
        message,
        reply,
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("Error in handleOrderTracking:", error);
      throw error;
    }
  }

  /**
   * Gợi ý sản phẩm (recommendations)
   */
  async handleRecommendations(userId, sessionId, message, productId = null) {
    try {
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = new ChatSession({ userId, sessionId });
        await session.save();
      }

      await session.addMessage("user", message);

      let recommendContext = "";
      let recommendations = [];

      if (productId) {
        // Gợi ý sản phẩm tương tự
        recommendations = await productSearchService.getSimilarProducts(
          productId
        );
        const currentProduct = await Product.findById(productId).populate(
          "brand category"
        );

        if (currentProduct) {
          recommendContext = `Sản phẩm hiện tại: ${
            currentProduct.name
          } (${currentProduct.price.toLocaleString("vi-VN")}đ)

Các sản phẩm tương tự:\n\n`;
          recommendations.forEach((product, index) => {
            recommendContext += `${index + 1}. ${product.name}
   - Giá: ${product.price.toLocaleString("vi-VN")}đ
   - RAM: ${product.ram}GB, Bộ nhớ: ${product.storage}GB
   - Pin: ${product.battery}mAh
   - Đánh giá: ${product.rating}/5 ⭐

`;
          });
        }
      } else {
        // Gợi ý sản phẩm bán chạy / mới nhất
        const [bestSellers, latestProducts] = await Promise.all([
          Product.find({ stock: { $gt: 0 } })
            .populate("brand category")
            .sort({ sold: -1 })
            .limit(3),
          Product.find({ isLatest: true, stock: { $gt: 0 } })
            .populate("brand category")
            .sort({ createdAt: -1 })
            .limit(3),
        ]);

        recommendContext = "📱 SẢN PHẨM BÁN CHẠY:\n\n";
        bestSellers.forEach((product, index) => {
          recommendContext += `${index + 1}. ${
            product.name
          } - ${product.price.toLocaleString("vi-VN")}đ (${
            product.sold
          } đã bán)\n`;
        });

        recommendContext += "\n🆕 SẢN PHẨM MỚI NHẤT:\n\n";
        latestProducts.forEach((product, index) => {
          recommendContext += `${index + 1}. ${
            product.name
          } - ${product.price.toLocaleString("vi-VN")}đ\n`;
        });

        recommendations = [...bestSellers, ...latestProducts];
      }

      const prompt = `${recommendContext}

Câu hỏi của khách hàng: ${message}

Hãy giới thiệu và gợi ý các sản phẩm phù hợp cho khách hàng một cách hấp dẫn.`;

      const reply = await this.callGeminiAPI(prompt);
      await session.addMessage("assistant", reply);

      return {
        success: true,
        message,
        reply,
        recommendations: recommendations.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price,
          images: p.images,
          rating: p.rating,
        })),
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("Error in handleRecommendations:", error);
      throw error;
    }
  }

  /**
   * So sánh sản phẩm
   */
  async handleProductComparison(userId, sessionId, message, productIds = []) {
    try {
      let session = await ChatSession.findOne({ sessionId });
      if (!session) {
        session = new ChatSession({ userId, sessionId });
        await session.save();
      }

      await session.addMessage("user", message);

      if (productIds.length < 2) {
        const reply = "Vui lòng cung cấp ít nhất 2 sản phẩm để so sánh.";
        await session.addMessage("assistant", reply);
        return { success: false, message: reply, sessionId: session.sessionId };
      }

      const comparison = await productSearchService.compareProducts(
        productIds[0],
        productIds[1]
      );

      if (!comparison) {
        const reply =
          "Không thể so sánh các sản phẩm này. Vui lòng kiểm tra lại ID sản phẩm.";
        await session.addMessage("assistant", reply);
        return { success: false, message: reply, sessionId: session.sessionId };
      }

      const [p1, p2] = comparison.products;
      const comparisonContext = `So sánh: ${p1.name} vs ${p2.name}

SẢN PHẨM 1: ${p1.name}
- Giá: ${p1.price.toLocaleString("vi-VN")}đ
- RAM: ${p1.ram}GB | Bộ nhớ: ${p1.storage}GB
- Pin: ${p1.battery}mAh
- Màn hình: ${p1.displaySize}" ${p1.displayType || ""}
- Chip: ${p1.chipset || "N/A"}
- Camera: ${p1.cameraRear || "N/A"}
- Đánh giá: ${p1.rating}/5 ⭐

SẢN PHẨM 2: ${p2.name}
- Giá: ${p2.price.toLocaleString("vi-VN")}đ
- RAM: ${p2.ram}GB | Bộ nhớ: ${p2.storage}GB
- Pin: ${p2.battery}mAh
- Màn hình: ${p2.displaySize}" ${p2.displayType || ""}
- Chip: ${p2.chipset || "N/A"}
- Camera: ${p2.cameraRear || "N/A"}
- Đánh giá: ${p2.rating}/5 ⭐`;

      const prompt = `${comparisonContext}

Câu hỏi của khách hàng: ${message}

Hãy so sánh chi tiết 2 sản phẩm này, phân tích ưu nhược điểm và đưa ra gợi ý cho khách hàng nên chọn sản phẩm nào dựa trên nhu cầu.`;

      const reply = await this.callGeminiAPI(prompt);
      await session.addMessage("assistant", reply);

      return {
        success: true,
        message,
        reply,
        comparison,
        sessionId: session.sessionId,
      };
    } catch (error) {
      console.error("Error in handleProductComparison:", error);
      throw error;
    }
  }

  /**
   * Lấy lịch sử chat
   */
  async getChatHistory(sessionId) {
    try {
      const session = await ChatSession.findOne({ sessionId });
      if (!session) {
        return { success: false, message: "Session không tồn tại" };
      }

      return {
        success: true,
        sessionId: session.sessionId,
        messages: session.messages,
        context: session.context,
      };
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw error;
    }
  }
}

module.exports = new ChatService();
