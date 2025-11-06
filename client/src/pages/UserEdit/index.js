import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./UserEdit.css";
import { useSelector } from "react-redux";
import {
  updateUser,
  getUserInfo,
  addAddress,
  updateAddress,
  deleteAddress,
} from "../../services/Api";
import AddressModal from "../../shared/components/AddressModal/AddressModal";
import Http from "../../services/Http";

const Toast = ({ message, type, onClose }) => (
  <div className={`user-toast user-toast-${type}`}>
    {message}
    <span className="user-toast-close" onClick={onClose}>
      &times;
    </span>
  </div>
);

const UserEdit = () => {
  const login = useSelector(({ auth }) => auth.login);
  const navigate = useNavigate();
  const user = login.currentCustomer || {};
  const [form, setForm] = useState({
    fullName: user.fullName || "",
    phone: user.phone || "",
    email: user.email || "",
    address: user.address || "",
  });
  // Tab quản lý
  const [activeTab, setActiveTab] = useState("info");
  // Địa chỉ
  const [userAddresses, setUserAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  // Load địa chỉ khi vào tab Sổ địa chỉ
  useEffect(() => {
    if (activeTab === "address") {
      loadUserAddresses();
    }
  }, [activeTab]);

  const loadUserAddresses = async () => {
    try {
      setLoadingAddresses(true);
      const response = await getUserInfo();
      const addresses = response.data.addresses || [];
      setUserAddresses(addresses);
    } catch (error) {
      setUserAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const handleAddAddress = async (addressData) => {
    try {
      const response = await addAddress(addressData);
      if (response.data.addresses) {
        setUserAddresses(response.data.addresses);
      }
      setShowAddressModal(false);
      setEditingAddress(null);
    } catch (error) {
      alert("Không thể thêm địa chỉ. Vui lòng thử lại!");
    }
  };

  const handleUpdateAddress = async (addressData) => {
    try {
      const response = await updateAddress(editingAddress._id, addressData);
      if (response.data.addresses) {
        setUserAddresses(response.data.addresses);
      }
      setShowAddressModal(false);
      setEditingAddress(null);
    } catch (error) {
      alert("Không thể cập nhật địa chỉ. Vui lòng thử lại!");
    }
  };

  const handleDeleteAddress = async (addressId) => {
    if (window.confirm("Bạn có chắc muốn xóa địa chỉ này?")) {
      try {
        const response = await deleteAddress(addressId);
        if (response.data.addresses) {
          setUserAddresses(response.data.addresses);
        }
      } catch (error) {
        alert("Không thể xóa địa chỉ. Vui lòng thử lại!");
      }
    }
  };

  const handleSetDefault = async (address) => {
    try {
      await handleUpdateAddress({ ...address, isDefault: true });
    } catch {}
  };

  const openEditModal = (address) => {
    setEditingAddress(address);
    setShowAddressModal(true);
  };

  const openAddModal = () => {
    setEditingAddress(null);
    setShowAddressModal(true);
  };
  const [message, setMessage] = useState("");
  // State cho đổi mật khẩu
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Validate email format
  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  // Validate phone (Vietnam 10-11 số, bắt đầu bằng 0)
  const validatePhone = (phone) => {
    return /^0\d{9,10}$/.test(phone);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateEmail(form.email)) {
      showToast("Email không hợp lệ!", "error");
      return;
    }
    if (!validatePhone(form.phone)) {
      showToast(
        "Số điện thoại không hợp lệ! Vui lòng nhập 10-11 số, bắt đầu bằng 0.",
        "error"
      );
      return;
    }
    try {
      await updateUser(user._id, form);
      showToast("Cập nhật thành công!", "success");
      setMessage("");
    } catch (err) {
      showToast("Cập nhật thất bại!", "error");
      setMessage("");
    }
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (
      !passwordForm.oldPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      showToast("Vui lòng nhập đầy đủ thông tin!", "error");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("Mật khẩu mới không khớp!", "error");
      return;
    }
    try {
      const token = localStorage.getItem("accessToken");
      await Http.put(
        "/users/change-password",
        {
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      showToast("Đổi mật khẩu thành công!", "success");
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowChangePassword(false);
    } catch (err) {
      showToast("Đổi mật khẩu thất bại!", "error");
    }
  };

  return (
    <div className="user-edit-main">
      {/* Sidebar trái */}
      <aside className="user-edit-sidebar">
        <div className="user-avatar">
          <i className="fas fa-user"></i>
        </div>
        <div className="user-name">{user.fullName}</div>
        <ul className="sidebar-menu">
          <li
            className={activeTab === "info" ? "active" : ""}
            onClick={() => setActiveTab("info")}
          >
            Thông tin khách hàng
          </li>
          <li
            className={activeTab === "address" ? "active" : ""}
            onClick={() => setActiveTab("address")}
          >
            Sổ địa chỉ
          </li>
          <li style={{ color: "#aaa", cursor: "not-allowed" }}>
            Thông báo của tôi
          </li>
          <li style={{ color: "#aaa", cursor: "not-allowed" }}>Đơn đặt hàng</li>
          <li
            style={{ color: "#4a90e2", cursor: "pointer" }}
            onClick={() => navigate("/warranty")}
          >
            Tra cứu bảo hành
          </li>
          <li
            style={{ color: "#e74c3c", marginTop: 16, cursor: "pointer" }}
            onClick={() => navigate("/")}
          >
            Thoát
          </li>
        </ul>
      </aside>
      {/* Content phải */}
      <div className="user-edit-content">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        {activeTab === "info" && (
          <>
            <h2>Thông tin tài khoản</h2>
            <form className="user-edit-form" onSubmit={handleSubmit}>
              <label>Họ và tên</label>
              <input
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                required
              />
              <label>Email</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                type="email"
                required
              />
              <label>Số điện thoại</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                required
              />

              <button type="submit">Cập nhật</button>
              {message && <div className="user-edit-message">{message}</div>}
            </form>
            <hr style={{ margin: "32px 0" }} />
            <button
              className="btn btn-outline-primary"
              style={{ width: "100%", marginBottom: 12 }}
              onClick={() => setShowChangePassword((v) => !v)}
            >
              {showChangePassword ? "Đóng đổi mật khẩu" : "Đổi mật khẩu"}
            </button>
            {showChangePassword && (
              <form className="user-edit-form" onSubmit={handlePasswordSubmit}>
                <label>Mật khẩu hiện tại</label>
                <input
                  name="oldPassword"
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={handlePasswordChange}
                  required
                />
                <label>Mật khẩu mới</label>
                <input
                  name="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  required
                />
                <label>Xác nhận mật khẩu mới</label>
                <input
                  name="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  required
                />
                <button type="submit">Xác nhận đổi mật khẩu</button>
                {passwordMessage && (
                  <div className="user-edit-message">{passwordMessage}</div>
                )}
              </form>
            )}
          </>
        )}
        {activeTab === "address" && (
          <div className="user-address-book">
            <h2>Sổ địa chỉ</h2>
            <button
              className="btn btn-primary"
              style={{ float: "right", marginBottom: 12 }}
              onClick={openAddModal}
            >
              Thêm địa chỉ mới
            </button>
            {loadingAddresses ? (
              <div>Đang tải địa chỉ...</div>
            ) : userAddresses.length === 0 ? (
              <div>Chưa có địa chỉ nào.</div>
            ) : (
              <table className="address-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Địa chỉ</th>
                    <th>Điện thoại</th>
                    <th>Mặc định</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {userAddresses.map((addr) => (
                    <tr
                      key={addr._id}
                      className={addr.isDefault ? "default" : ""}
                    >
                      <td>{user.fullName}</td>
                      <td>{addr.address}</td>
                      <td>{addr.phone}</td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!addr.isDefault}
                          readOnly
                        />
                        {!addr.isDefault && (
                          <button
                            className="btn btn-link"
                            style={{ marginLeft: 8 }}
                            onClick={() => handleSetDefault(addr)}
                          >
                            Đặt làm mặc định
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-link"
                          onClick={() => openEditModal(addr)}
                        >
                          Sửa
                        </button>
                        <button
                          className="btn btn-link text-danger"
                          onClick={() => handleDeleteAddress(addr._id)}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AddressModal
              isOpen={showAddressModal}
              onClose={() => setShowAddressModal(false)}
              onSave={editingAddress ? handleUpdateAddress : handleAddAddress}
              editingAddress={editingAddress}
              title={editingAddress ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới"}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default UserEdit;
