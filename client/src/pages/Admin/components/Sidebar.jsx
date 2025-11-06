import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Sidebar.css";

const menu = [
  { ten: "Bảng điều khiển" },
  { ten: "Đơn hàng" },
  { ten: "Khách hàng" },
  { ten: "Sản phẩm" },
  { ten: "Đánh giá sản phẩm" },
  { ten: "Thống kê" },
  { ten: "Quản lý tin tức" },
];

const Sidebar = ({ tab, setTab, showToast }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Xóa token và user info khỏi localStorage
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    // Hiển thị thông báo bằng Toast
    showToast("Đăng xuất thành công! Đang chuyển hướng...", "success");

    // Delay redirect để user thấy toast
    setTimeout(() => {
      navigate("/");
    }, 1500);
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <span>Quản trị cửa hàng</span>
      </div>
      <div className="menu">
        {menu.map((item, idx) => (
          <div
            className={tab === idx ? "menuItem active" : "menuItem"}
            key={idx}
            onClick={() => setTab(idx)}
          >
            <span>{item.ten}</span>
          </div>
        ))}
        <div className="menuItem" onClick={handleLogout}>
          <span>Đăng xuất</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
