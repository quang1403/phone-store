// src/models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "Product",
        },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        memory: {
          type: String,
          required: false,
        },
        color: {
          type: String,
          required: false,
        },
        variant: {
          type: Object,
          required: false,
        },
        warrantyMonths: {
          type: Number,
          required: false,
          default: 12, // mặc định 12 tháng, có thể lấy từ Product
        },
      },
    ],
    total: {
      type: Number,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      required: true,
      default: "cod",
    },
    status: {
      type: Number,
      enum: [0, 1, 2, 3, 4], // 0: chờ xác nhận, 1: đã xác nhận, 2: đang giao, 3: đã giao, 4: đã hủy
      default: 0,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
