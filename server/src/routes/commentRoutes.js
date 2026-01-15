const express = require("express");
const router = express.Router();
const { auth, isAdmin } = require("../middleware/auth");
const commentController = require("../controllers/commentController");

// Lấy tất cả comment của 1 product (✅ ĐÃ CÓ LOGIC hasPurchased)
router.get("/:productId", commentController.getComments);

// Thêm comment mới cho 1 product
router.post("/:productId", auth, commentController.createComment);

// Lấy tất cả comment (admin)
router.get("/", commentController.getAllComments);

// Xóa comment (admin)
router.delete("/admin/:commentId", auth, isAdmin, commentController.deleteComment);

module.exports = router;
