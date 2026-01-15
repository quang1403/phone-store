const Comment = require("../models/Comment");
const Order = require("../models/Order");
const mongoose = require("mongoose");

// Thêm comment mới
exports.createComment = async (req, res) => {
  try {
    const { content, rating } = req.body;
    const { productId } = req.params;
    const customerId = req.user.id;

    if (!content || !rating || !productId) {
      return res
        .status(400)
        .json({ status: "error", message: "Thiếu dữ liệu" });
    }
    // Kiểm tra user đã đánh giá sản phẩm này chưa
    const existed = await Comment.findOne({ productId, customerId });
    if (existed) {
      return res
        .status(400)
        .json({ status: "error", message: "Bạn đã đánh giá sản phẩm này rồi" });
    }
    const comment = new Comment({
      productId,
      customerId,
      content,
      rating,
    });
    await comment.save();
    res.json({
      status: "success",
      message: "Thêm đánh giá thành công",
      data: comment,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Lấy danh sách comment theo productId
exports.getComments = async (req, res) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        status: "error",
        message: "ID sản phẩm không hợp lệ",
      });
    }

    // Sử dụng Aggregation Pipeline để tối ưu performance
    const comments = await Comment.aggregate([
      // 1. Lọc comments của sản phẩm
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
        },
      },

      // 2. Join với User collection (customerId)
      {
        $lookup: {
          from: "users",
          localField: "customerId",
          foreignField: "_id",
          as: "customerData",
        },
      },
      {
        $unwind: {
          path: "$customerData",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 3. Join với Orders để check đã mua hàng chưa
      {
        $lookup: {
          from: "orders",
          let: {
            userId: "$customerId",
            prodId: new mongoose.Types.ObjectId(productId),
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$customerId", "$$userId"] },
                    // Status 3: Đã giao, 4: Hoàn thành
                    { $in: ["$status", [3, 4]] },
                    {
                      $in: ["$$prodId", "$items.productId"],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "purchases",
        },
      },

      // 4. Format lại dữ liệu
      {
        $addFields: {
          // Thêm field hasPurchased dựa vào purchases
          hasPurchased: { $gt: [{ $size: "$purchases" }, 0] },
          // Format lại customerId theo chuẩn populate
          customerId: {
            _id: "$customerData._id",
            name: "$customerData.name",
            email: "$customerData.email",
          },
        },
      },

      // 5. Loại bỏ field không cần thiết
      {
        $project: {
          purchases: 0,
          customerData: 0,
        },
      },

      // 6. Sắp xếp mới nhất trước
      { $sort: { createdAt: -1 } },
    ]);

    res.json({
      status: "success",
      data: { docs: comments },
    });
  } catch (error) {
    console.error("Error in getComments:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Lấy tất cả comment (admin)
exports.getAllComments = async (req, res) => {
  try {
    const comments = await Comment.find({})
      .populate("productId", "name")
      .populate("customerId", "name email")
      .sort({ createdAt: -1 });
    res.json({ status: "success", data: comments });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
// Xóa comment (admin)
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Validate commentId
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        status: "error",
        message: "ID comment không hợp lệ",
      });
    }

    const comment = await Comment.findByIdAndDelete(commentId);
    
    if (!comment) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy comment",
      });
    }

    res.json({
      status: "success",
      message: "Xóa comment thành công",
      data: comment,
    });
  } catch (error) {
    console.error("Error in deleteComment:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};