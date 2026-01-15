/**
 * Script test tính năng "Đã mua hàng" (hasPurchased)
 * Chạy: node src/scripts/testHasPurchased.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Comment = require("../models/Comment");
const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");

async function testHasPurchased() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/phone-shop",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    console.log("✅ Đã kết nối MongoDB\n");

    // Lấy 1 sản phẩm bất kỳ có comment
    const comment = await Comment.findOne()
      .populate("productId")
      .populate("customerId");

    if (!comment) {
      console.log("⚠️  Chưa có comment nào trong hệ thống");
      process.exit(0);
    }

    const productId = comment.productId._id;
    const customerId = comment.customerId._id;

    console.log("📌 Test Case:");
    console.log(`  Product: ${comment.productId.name || productId}`);
    console.log(
      `  User: ${comment.customerId.name || comment.customerId.email}`
    );
    console.log(`  Comment: "${comment.content.substring(0, 50)}..."`);
    console.log("\n" + "=".repeat(70) + "\n");

    // Kiểm tra đơn hàng của user này
    const orders = await Order.find({ customerId }).lean();
    console.log(`📦 User này có ${orders.length} đơn hàng`);

    if (orders.length > 0) {
      console.log("\nChi tiết đơn hàng:");
      orders.forEach((order, idx) => {
        const statusText =
          ["Chờ xác nhận", "Đã xác nhận", "Đang giao", "Đã giao", "Hoàn thành"][
            order.status
          ] || "Không xác định";
        const hasThisProduct = order.items.some(
          (item) => item.productId.toString() === productId.toString()
        );
        console.log(
          `  ${idx + 1}. Đơn #${order._id.toString().slice(-6)} - Status: ${
            order.status
          } (${statusText})`
        );
        console.log(
          `     - Chứa sản phẩm này: ${hasThisProduct ? "✅ CÓ" : "❌ KHÔNG"}`
        );
        console.log(`     - Số lượng sản phẩm: ${order.items.length}`);
      });
    }

    // Kiểm tra có đơn hàng đã hoàn thành chứa sản phẩm này không
    const completedOrder = await Order.findOne({
      customerId,
      status: { $in: [3, 4] }, // Đã giao hoặc Hoàn thành
      "items.productId": productId,
    });

    console.log("\n" + "=".repeat(70));
    console.log("\n🔍 Kết quả kiểm tra:");
    console.log(`  hasPurchased = ${!!completedOrder}`);

    if (completedOrder) {
      const statusText = completedOrder.status === 3 ? "Đã giao" : "Hoàn thành";
      console.log(
        `  ✅ User ĐÃ MUA sản phẩm này (Đơn #${completedOrder._id
          .toString()
          .slice(-6)} - ${statusText})`
      );
      console.log(`  → Frontend sẽ hiển thị badge "Đã mua hàng tại PS"`);
    } else {
      console.log(`  ❌ User CHƯA MUA sản phẩm này (hoặc đơn chưa hoàn thành)`);
      console.log(`  → Frontend KHÔNG hiển thị badge`);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // Test API endpoint simulation
    console.log("🧪 Test API Response (simulation):");
    const comments = await Comment.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
        },
      },
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
      {
        $addFields: {
          hasPurchased: { $gt: [{ $size: "$purchases" }, 0] },
          customerId: {
            _id: "$customerData._id",
            name: "$customerData.name",
            email: "$customerData.email",
          },
        },
      },
      {
        $project: {
          purchases: 0,
          customerData: 0,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    console.log(`\nTìm thấy ${comments.length} comment(s):\n`);
    comments.forEach((cmt, idx) => {
      console.log(`${idx + 1}. ${cmt.customerId?.name || "Anonymous"}`);
      console.log(
        `   - hasPurchased: ${cmt.hasPurchased ? "✅ true" : "❌ false"}`
      );
      console.log(`   - Rating: ${cmt.rating} sao`);
      console.log(`   - Comment: "${cmt.content.substring(0, 50)}..."`);
      console.log("");
    });

    console.log("✅ Test hoàn tất!");
  } catch (error) {
    console.error("❌ Lỗi:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n👋 Đã đóng kết nối MongoDB");
    process.exit(0);
  }
}

testHasPurchased();
