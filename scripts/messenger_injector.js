/**
 * Script can thiệp vào trang Messenger (messenger.com hoặc facebook.com/messages) để điền và gửi tin nhắn
 */
(async function() {
    console.log("[Messenger Auto Scheduler] Đang tìm kiếm ô nhập tin nhắn Messenger...");

    // Danh sách các selector thường gặp trên Messenger / Facebook Messages
    const inputSelectors = [
        'div[role="textbox"][contenteditable="true"]',
        'div[aria-label="Tin nhắn"][contenteditable="true"]',
        'div[aria-label="Message"][contenteditable="true"]',
        'div[data-lexical-editor="true"][contenteditable="true"]',
        'div[contenteditable="true"]'
    ];

    function findInputBox() {
        for (const selector of inputSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // Kiểm tra xem phần tử có hiển thị và nằm trong vùng chat không
                if (el && el.offsetParent !== null && !el.closest('[role="navigation"]')) {
                    return el;
                }
            }
        }
        return null;
    }

    // Đợi tối đa 10 giây để tìm thấy ô chat
    let inputBox = null;
    for (let i = 0; i < 20; i++) {
        inputBox = findInputBox();
        if (inputBox) break;
        await new Promise(r => setTimeout(r, 500));
    }

    if (!inputBox) {
        console.error("[Messenger Auto Scheduler] Không tìm thấy ô nhập tin nhắn trên Messenger. Hãy chắc chắn bạn đang mở một cuộc trò chuyện.");
        return { success: false, error: "Không tìm thấy ô nhập tin nhắn Messenger (Bạn chưa mở cuộc trò chuyện?)" };
    }

    const message = window.__PENDING_AUTO_MESSAGE__ || "";
    if (!message.trim()) {
        return { success: false, error: "Nội dung tin nhắn trống" };
    }

    try {
        // 1. Focus vào ô nhập
        inputBox.focus();

        // 2. Chèn nội dung tin nhắn bằng execCommand (tương thích bộ Lexical / Draft của Messenger)
        const inserted = document.execCommand('insertText', false, message);
        if (!inserted) {
            inputBox.innerText = message;
            inputBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: message }));
        }

        // Chờ 300ms để Messenger cập nhật trạng thái ô chat
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

        // Nếu nội dung vẫn còn trong ô chat (chưa gửi được bằng Enter), thử click nút "Gửi"
        if (inputBox.innerText.trim().length > 0) {
            const sendButton = document.querySelector('div[aria-label="Nhấn Enter để gửi"]') ||
                               document.querySelector('div[aria-label="Press Enter to send"]') ||
                               document.querySelector('div[aria-label="Send"]') ||
                               document.querySelector('div[aria-label="Gửi"]');
            if (sendButton) {
                sendButton.click();
            }
        }

        console.log("[Messenger Auto Scheduler] Đã gửi tin nhắn Messenger thành công!");
        return { success: true };
    } catch (err) {
        console.error("[Messenger Auto Scheduler] Lỗi khi gửi:", err);
        return { success: false, error: err.message };
    }
})();
