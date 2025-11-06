// Middleware kiểm tra quyền admin

const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Không có access token" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, "secret_key");
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Token không hợp lệ hoặc đã hết hạn" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: "Chỉ admin mới được truy cập" });
};

module.exports = { auth, isAdmin };
