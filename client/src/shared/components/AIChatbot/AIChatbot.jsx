import { useState, useEffect, useRef } from "react";
import { chatAsk } from "../../../services/Api";
import "./AIChatbot.css";

/**
 * ⭐ AI CHATBOT COMPONENT - PHIÊN BẢN ĐƠN GIẢN HÓA
 *
 * Sử dụng endpoint duy nhất: POST /api/chat/ask
 * Backend tự động nhận diện intent và xử lý phù hợp
 *
 * Cách hoạt động:
 * 1. FE gửi message + sessionId lên BE
 * 2. BE tự động:
 *    - Nhận diện intent (tư vấn, so sánh, tồn kho, v.v.)
 *    - Truy vấn database
 *    - Quản lý context và lịch sử chat
 *    - Trả về kết quả phù hợp
 * 3. FE chỉ cần hiển thị kết quả
 */

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      text: "Xin chào! Tôi là trợ lý AI của PhoneStore. Tôi có thể giúp bạn:\n\n• Tư vấn sản phẩm\n• Gợi ý điện thoại phù hợp\n• So sánh sản phẩm\n• Kiểm tra tồn kho\n• Tra cứu đơn hàng\n\nBạn cần tôi giúp gì?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // ⭐ SessionId duy nhất cho phiên chat - giữ nguyên cho đến khi user đóng chat
  const sessionId = useRef(`session_${Date.now()}`);

  // Auto scroll to bottom when new message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ⭐ Handle send message - ĐƠN GIẢN HÓA
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text: inputMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);
    const userInput = inputMessage.trim();
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    try {
      // ⭐ GỌI ENDPOINT DUY NHẤT - Backend tự xử lý mọi thứ
      // Không cần phân loại intent ở FE nữa!
      console.log("📤 Sending message:", {
        message: userInput,
        sessionId: sessionId.current,
      });

      const response = await chatAsk(userInput, sessionId.current);

      console.log("📥 Received response:", {
        sessionId: response.data.sessionId || "Not returned",
        intent: response.data.intent,
        reply: response.data.reply?.substring(0, 50) + "...",
      });

      // Add bot response to chat
      const botMessage = {
        id: Date.now() + 1,
        sender: "bot",
        text:
          response.data.reply ||
          response.data.message ||
          response.data.answer ||
          "Xin lỗi, tôi không hiểu câu hỏi của bạn. Bạn có thể diễn đạt lại được không?",
        timestamp: new Date().toISOString(),
        // Optional: hiển thị intent để debug (có thể bỏ trong production)
        intent: response.data.intent,
      };

      setMessages((prev) => [...prev, botMessage]);

      // Log để debug (có thể bỏ trong production)
      console.log("🔍 Intent detected:", response.data.intent);
      console.log("📦 Response data:", response.data);
    } catch (err) {
      console.error("❌ Chatbot error:", err);

      // Xác định loại lỗi
      let errorText =
        "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.";
      let userErrorMessage = "Có lỗi xảy ra";

      if (err.response) {
        const status = err.response.status;
        if (status === 404) {
          errorText =
            "Tính năng này chưa được kích hoạt. Vui lòng liên hệ quản trị viên.";
          userErrorMessage = "❌ Endpoint không tồn tại (404)";
        } else if (status === 401) {
          errorText = "Vui lòng đăng nhập để sử dụng tính năng này.";
          userErrorMessage = "❌ Chưa đăng nhập (401)";
        } else if (status === 500) {
          errorText = "Hệ thống AI đang bận. Vui lòng thử lại sau.";
          userErrorMessage = "❌ Lỗi server (500)";
        } else {
          errorText = `Lỗi hệ thống (${status}). Vui lòng thử lại.`;
          userErrorMessage = `❌ Lỗi HTTP ${status}`;
        }
      } else if (err.request) {
        errorText =
          "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.";
        userErrorMessage = "❌ Không kết nối được server";
      }

      console.log("📊 Chi tiết lỗi:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        url: err.config?.url,
      });

      setError(userErrorMessage);

      // Add error message to chat
      const errorMessage = {
        id: Date.now() + 1,
        sender: "bot",
        text: errorText,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format message text with better styling
  const formatMessageText = (text) => {
    if (!text) return null;

    // Split by line breaks
    const lines = text.split("\n");

    return lines.map((line, index) => {
      // Check if line is a bullet point
      if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
        return (
          <div key={index} className="message-list-item">
            <span className="bullet">•</span>
            <span>{line.replace(/^[•\-]\s*/, "")}</span>
          </div>
        );
      }

      // Check if line is a numbered list
      if (/^\d+[\.)]\s/.test(line.trim())) {
        const match = line.match(/^(\d+[\.)]\s)(.*)/);
        return (
          <div key={index} className="message-list-item numbered">
            <span className="number">{match[1]}</span>
            <span>{match[2]}</span>
          </div>
        );
      }

      // Check if line contains price
      if (/\d+[.,]\d+.*(?:đ|vnd|₫)/i.test(line)) {
        return (
          <div key={index} className="message-price">
            {line}
          </div>
        );
      }

      // Check if line is a heading (starts with ##, ###, or all caps)
      if (
        line.trim().startsWith("#") ||
        (line === line.toUpperCase() && line.length > 3 && line.length < 50)
      ) {
        return (
          <div key={index} className="message-heading">
            {line.replace(/^#+\s*/, "")}
          </div>
        );
      }

      // Regular paragraph
      if (line.trim()) {
        return (
          <p key={index} className="message-paragraph">
            {line}
          </p>
        );
      }

      // Empty line
      return <br key={index} />;
    });
  };

  return (
    <div className="ai-chatbot-container">
      {/* Chatbot toggle button */}
      <button
        className={`chatbot-toggle-btn ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle chatbot"
      >
        {isOpen ? (
          <i className="fas fa-times"></i>
        ) : (
          <i className="fas fa-comments"></i>
        )}
      </button>

      {/* Chatbot window */}
      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar">
                <i className="fas fa-robot"></i>
              </div>
              <div>
                <h4>AI PhoneStore</h4>
                <span className="chatbot-status">
                  <span className="status-dot"></span> Đang hoạt động
                </span>
              </div>
            </div>
            <button
              className="chatbot-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <i className="fas fa-minus"></i>
            </button>
          </div>

          {/* Messages area */}
          <div className="chatbot-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${
                  message.sender === "user" ? "user-message" : "bot-message"
                }`}
              >
                {message.sender === "bot" && (
                  <div className="message-avatar">
                    <i className="fas fa-robot"></i>
                  </div>
                )}
                <div className="message-content">
                  <div className="message-bubble">
                    {message.sender === "bot" ? (
                      <div className="formatted-message">
                        {formatMessageText(message.text)}
                      </div>
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </div>
                  <span className="message-time">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                {message.sender === "user" && (
                  <div className="message-avatar user-avatar">
                    <i className="fas fa-user"></i>
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="message bot-message">
                <div className="message-avatar">
                  <i className="fas fa-robot"></i>
                </div>
                <div className="message-content">
                  <div className="message-bubble loading">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="chatbot-error">
                <i className="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="chatbot-input-area">
            <textarea
              className="chatbot-input"
              placeholder="Nhập câu hỏi của bạn..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="chatbot-send-btn"
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              aria-label="Send message"
            >
              {isLoading ? (
                <i className="fas fa-circle-notch fa-spin"></i>
              ) : (
                <i className="fas fa-paper-plane"></i>
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="chatbot-footer">
            <small>Powered by OpenAI</small>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIChatbot;
