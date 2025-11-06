// Tra cứu bảo hành theo token user
exports.lookupWarranty = async (req, res) => {
  try {
    const userId = req.user.id;
    // Chỉ lấy các đơn đã giao (status = 3)
    const orders = await Order.find({ customerId: userId, status: 3 }).populate(
      "items.productId"
    );
    const result = [];
    for (const order of orders) {
      for (const item of order.items) {
        const purchaseDate = order.createdAt;
        const warrantyMonths = item.warrantyMonths || 12;
        const expiredDate = new Date(purchaseDate);
        expiredDate.setMonth(expiredDate.getMonth() + warrantyMonths);
        result.push({
          orderId: order._id,
          productName: item.productId?.name || "",
          productId: item.productId?._id || item.productId,
          purchaseDate,
          warrantyMonths,
          expiredDate,
          status: new Date() <= expiredDate ? "Còn hạn" : "Hết hạn",
        });
      }
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Lỗi tra cứu bảo hành",
      details: err.message,
    });
  }
};
// Lấy tất cả đơn hàng (admin)
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("customerId", "name email");
    res.json({ orders });
  } catch (err) {
    console.error("Lỗi lấy tất cả đơn hàng:", err);
    res.status(500).json({ error: "Lỗi lấy tất cả đơn hàng", details: err });
  }
};

// Xóa đơn hàng (admin)
exports.deleteOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findByIdAndDelete(orderId);
    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }
    res.json({ message: "Xóa đơn hàng thành công", order });
  } catch (err) {
    console.error("Lỗi xóa đơn hàng:", err);
    res.status(500).json({ error: "Lỗi xóa đơn hàng", details: err });
  }
};

// Cập nhật trạng thái đơn hàng (admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id || req.body.orderId;
    const status = req.body.status;
    if (!orderId || typeof status !== "number") {
      console.error("Thiếu orderId hoặc status", { orderId, status });
      return res.status(400).json({ error: "Thiếu orderId hoặc status" });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      console.error("Không tìm thấy đơn hàng với orderId:", orderId);
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }
    order.status = status;
    await order.save();
    res.json({ message: "Cập nhật trạng thái thành công", order });
  } catch (err) {
    console.error("Lỗi cập nhật trạng thái đơn hàng:", err);
    res
      .status(400)
      .json({ error: "Lỗi cập nhật trạng thái đơn hàng", details: err });
  }
};
// src/controllers/orderController.js
const Order = require("../models/Order");
const Product = require("../models/Product");
// Cập nhật trạng thái đơn hàng
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    if (!orderId || typeof status !== "number") {
      console.error("Thiếu orderId hoặc status", { orderId, status });
      return res.status(400).json({ error: "Thiếu orderId hoặc status" });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      console.error("Không tìm thấy đơn hàng với orderId:", orderId);
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }
    order.status = status;
    await order.save();
    res.json({ message: "Cập nhật trạng thái thành công", order });
  } catch (err) {
    console.error("Lỗi cập nhật trạng thái đơn hàng:", err);
    res
      .status(400)
      .json({ error: "Lỗi cập nhật trạng thái đơn hàng", details: err });
  }
};

// Thêm đơn hàng mới
exports.createOrder = async (req, res) => {
  try {
    console.log(
      "[ORDER] Thông tin nhận được từ FE:",
      JSON.stringify(req.body, null, 2)
    );
    const customerId = req.user.id;
    const {
      items,
      address,
      phone,
      note,
      status,
      paymentMethod,
      total: totalFromFE,
    } = req.body;
    // items chỉ gồm productId và quantity
    // Lấy giá từ Product cho từng item
    const populatedItems = [];
    let total = 0;
    // Đã require Product ở đầu file, không cần lặp lại
    for (const item of items) {
      let price = 0;
      let warrantyMonths = 12;
      let product = null;
      if (item.variant && typeof item.variant.price === "number") {
        price = item.variant.price;
      } else if (typeof item.price === "number") {
        price = item.price;
      } else {
        product = await Product.findById(item.productId);
        if (!product) {
          return res.status(400).json({
            error: `Không tìm thấy sản phẩm với id ${item.productId}`,
          });
        }
        price = product.price;
      }
      // Lấy thời hạn bảo hành từ Product (nếu có)
      if (!product) product = await Product.findById(item.productId);
      if (product && product.specs && product.specs.warrantyMonths) {
        warrantyMonths = product.specs.warrantyMonths;
      }
      populatedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price,
        ram: item.ram || "",
        storage: item.storage || "",
        variant: item.variant || {},
        warrantyMonths,
      });
      total += price * (item.quantity || 1);
    }

    const order = new Order({
      customerId,
      items: populatedItems,
      total,
      address,
      phone,
      note,
      status: 0,
      paymentMethod: paymentMethod || "cod",
    });
    await order.save();

    // Trừ stock sản phẩm khi tạo đơn
    for (const item of populatedItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -Math.abs(item.quantity || 1) } },
        { new: true }
      );
    }

    // Gửi mail xác nhận đơn hàng cho khách
    try {
      const sendMail = require("../utils/sendMail");
      let email = req.user.email;
      if (!email) {
        const user = await require("../models/User").findById(customerId);
        email = user?.email;
      }
      if (email) {
        await sendMail({
          to: email,
          subject: "Xác nhận đơn hàng",
          text: `Đơn hàng của bạn đã được tạo thành công. Mã đơn hàng: ${order._id}. Tổng tiền: ${total} VND.`,
          html: `<h1>Đơn hàng của bạn đã được tạo thành công</h1><p>Mã đơn hàng: <b>${
            order._id
          }</b></p><p>Tổng tiền: <b>${total.toLocaleString()} VND</b></p>`,
        });
      }
    } catch (mailErr) {
      console.error("Lỗi gửi mail xác nhận đơn hàng:", mailErr);
    }

    res.status(201).json(order);
  } catch (err) {
    console.error("Lỗi khi tạo đơn hàng:", err);
    res.status(400).json({ error: "Lỗi khi tạo đơn hàng" });
  }
};

// Lấy danh sách đơn hàng của user
exports.getOrdersByCustomer = async (req, res) => {
  try {
    const customerId = req.user.id;
    const orders = await Order.find({ customerId }).populate("items.productId");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Lỗi khi lấy danh sách đơn hàng" });
  }
};
// Xóa đơn hàng
exports.deleteOrder = async (req, res) => {
  try {
    // Tìm đơn hàng trước khi xóa để cộng lại stock
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng để xóa" });
    }
    // Cộng lại stock cho từng sản phẩm
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: Math.abs(item.quantity || 1) } },
        { new: true }
      );
    }
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Xóa đơn hàng thành công" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi khi xóa đơn hàng" });
  }
};
