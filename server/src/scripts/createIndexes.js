/**
 * Script tạo indexes để tối ưu performance cho tính năng "Đã mua hàng"
 * Chạy: node src/scripts/createIndexes.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

async function createIndexes() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/phone-shop",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    console.log("✅ Đã kết nối MongoDB");

    const db = mongoose.connection.db;

    // 1. Index cho Comments collection
    console.log("\n📝 Tạo indexes cho Comments...");
    await db
      .collection("comments")
      .createIndex(
        { productId: 1, createdAt: -1 },
        { name: "productId_createdAt" }
      );
    console.log("✅ Index comments.productId_createdAt");

    // 2. Index cho Orders collection
    console.log("\n📦 Tạo indexes cho Orders...");

    // Index để tìm đơn hàng của customer theo status
    await db
      .collection("orders")
      .createIndex({ customerId: 1, status: 1 }, { name: "customerId_status" });
    console.log("✅ Index orders.customerId_status");

    // Index để tìm đơn hàng chứa productId cụ thể
    await db
      .collection("orders")
      .createIndex({ "items.productId": 1 }, { name: "items_productId" });
    console.log("✅ Index orders.items.productId");

    // Compound index cho query tối ưu
    await db
      .collection("orders")
      .createIndex(
        { customerId: 1, status: 1, "items.productId": 1 },
        { name: "hasPurchased_compound" }
      );
    console.log("✅ Index orders.hasPurchased_compound");

    // 3. Hiển thị tất cả indexes
    console.log("\n📊 Danh sách indexes hiện tại:");
    console.log("\n--- Comments ---");
    const commentIndexes = await db.collection("comments").indexes();
    commentIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log("\n--- Orders ---");
    const orderIndexes = await db.collection("orders").indexes();
    orderIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log("\n✅ Hoàn thành! Tất cả indexes đã được tạo.");
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("\n👋 Đã đóng kết nối MongoDB");
    process.exit(0);
  }
}

createIndexes();
