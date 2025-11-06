const Product = require("../models/Product");

/**
 * POST /api/chat/installment
 * Tính toán trả góp cho sản phẩm
 * Body: { productId, upfront, months, interestRate }
 */
exports.calculateInstallment = async (req, res) => {
  try {
    const { productId, upfront = 0, months = 12, interestRate = 0 } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, error: "Thiếu productId" });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy sản phẩm" });
    }
    const price = product.price;
    const principal = price - upfront;
    // Tính lãi suất hàng tháng
    const monthlyRate = interestRate > 0 ? interestRate / 100 / 12 : 0;
    let monthlyPayment;
    if (monthlyRate > 0) {
      // Công thức trả góp có lãi suất
      monthlyPayment =
        (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
    } else {
      // Trả góp không lãi suất
      monthlyPayment = principal / months;
    }
    const totalPayment = monthlyPayment * months + upfront;
    res.json({
      success: true,
      product: { id: product._id, name: product.name, price },
      upfront,
      months,
      interestRate,
      monthlyPayment: Math.round(monthlyPayment),
      totalPayment: Math.round(totalPayment),
      detail: `Trả trước ${upfront.toLocaleString()}đ, trả góp ${months} tháng, mỗi tháng khoảng ${Math.round(
        monthlyPayment
      ).toLocaleString()}đ. Tổng phải trả: ${Math.round(
        totalPayment
      ).toLocaleString()}đ.`,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        error: "Lỗi tính trả góp",
        details: error.message,
      });
  }
};
