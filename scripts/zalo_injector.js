/**
 * Script can thiệp vào trang Zalo Web (chat.zalo.me) để điền và gửi tin nhắn
 */
(async function() {
    console.log("[Zalo Auto Scheduler] Đang tìm kiếm ô nhập tin nhắn Zalo...");

    // Danh sách các selector thường gặp trên Zalo Web
    const inputSelectors = [
        '#richInput',
        'div[data-id="div_InputMsg"]',
        'div[contenteditable="true"].chat-input',
        'div.chat-input div[contenteditable="true"]',
        'div[contenteditable="true"]'
    ];

    function findInputBox() {
        for (const selector of inputSelectors) {
            const el = document.querySelector(selector);
            // Kiểm tra thẻ có hiển thị trên màn hình không
            if (el && el.offsetParent !== null) {
                return el;
            }
        }
        return null;
    }

    // Đợi tối đa 10 giây để tìm thấy ô chat (đề phòng mạng chậm hoặc trang chưa tải xong)
    let inputBox = null;
    for (let i = 0; i < 20; i++) {
        inputBox = findInputBox();
        if (inputBox) break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (!inputBox) {
        console.error("[Zalo Auto Scheduler] Không tìm thấy ô nhập tin nhắn trên Zalo Web. Hãy chắc chắn bạn đang mở một cuộc trò chuyện.");
        return { success: false, error: "Không tìm thấy ô nhập tin nhắn Zalo (Bạn chưa chọn cuộc trò chuyện?)" };
    }

    // Lấy nội dung tin nhắn được truyền vào từ service worker
    const message = window.__PENDING_AUTO_MESSAGE__ || "";
    if (!message.trim()) {
        return { success: false, error: "Nội dung tin nhắn trống" };
    }

    try {
        // 1. Focus vào ô nhập
        inputBox.focus();

        // 2. Chèn nội dung tin nhắn bằng execCommand (giúp Zalo nhận diện thay đổi state)
        const inserted = document.execCommand('insertText', false, message);
        if (!inserted) {
            // Cách dự phòng nếu execCommand bị chặn
            inputBox.innerText = message;
            inputBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: message }));
        }

        // Chờ 300ms để Zalo cập nhật trạng thái ô chat
        await new Promise(r => setTimeout(r, 300));

        // 3. Giả lập bấm phím Enter để gửi
        const enterDown = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        inputBox.dispatchEvent(enterDown);

        // Chờ kiểm tra xem tin nhắn đã được gửi chưa
        await new Promise(r => setTimeout(r, 400));

        // Nếu nội dung vẫn còn (chưa gửi được bằng Enter), thử tìm nút "Gửi" để click
        if (inputBox.innerText.trim().length > 0) {
            const sendButton = document.querySelector('[data-translate-title="STR_SEND"]') ||
                               document.querySelector('.chat-input__send-btn') ||
                               document.querySelector('.icon-send');
            if (sendButton) {
                sendButton.click();
            }
        }

        console.log("[Zalo Auto Scheduler] Đã gửi tin nhắn thành công!");
        return { success: true };
    } catch (err) {
        console.error("[Zalo Auto Scheduler] Lỗi khi gửi:", err);
        return { success: false, error: err.message };
    }
})();

