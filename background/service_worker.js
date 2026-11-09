/**
 * Service Worker quản lý hẹn giờ (chrome.alarms) và kích hoạt gửi tin Zalo
 */

// Lắng nghe sự kiện chuông báo hẹn giờ
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("[Service Worker] Chuông báo kích hoạt:", alarm.name);

    // Lấy danh sách nhiệm vụ từ storage
    const data = await chrome.storage.local.get({ scheduledTasks: [] });
    const tasks = data.scheduledTasks;
    const taskIndex = tasks.findIndex(t => t.id === alarm.name);

    if (taskIndex === -1) {
        console.warn("[Service Worker] Không tìm thấy nhiệm vụ tương ứng với alarm:", alarm.name);
        return;
    }

    const task = tasks[taskIndex];
    if (task.status !== 'pending') {
        console.log("[Service Worker] Nhiệm vụ đã hoàn thành hoặc bị hủy trước đó:", task.status);
        return;
    }

    try {
        await executeSendMessage(task);
        tasks[taskIndex].status = 'sent';
        tasks[taskIndex].sentAt = new Date().toISOString();
        const platformName = task.platform === 'messenger' ? 'Messenger' : 'Zalo';
        showNotification(`Gửi tin nhắn ${platformName} thành công`, `Đã tự động gửi: "${task.message.substring(0, 40)}..."`);
    } catch (error) {
        console.error("[Service Worker] Lỗi gửi tin nhắn:", error);
        tasks[taskIndex].status = 'failed';
        tasks[taskIndex].error = error.message;
        const platformName = task.platform === 'messenger' ? 'Messenger' : 'Zalo';
        showNotification(`Lỗi gửi tin nhắn ${platformName}`, error.message || "Không thể gửi tin nhắn");
    }

    // Cập nhật lại danh sách tasks
    await chrome.storage.local.set({ scheduledTasks: tasks });
});

/**
 * Thực hiện tìm tab Zalo/Messenger và tiêm script gửi tin nhắn
 */
async function executeSendMessage(task) {
    const isMessenger = task.platform === 'messenger';
    const targetUrlQuery = isMessenger 
        ? ["*://www.messenger.com/*", "*://messenger.com/*", "*://www.facebook.com/messages/*"] 
        : ["*://chat.zalo.me/*"];
    const defaultUrl = isMessenger ? "https://www.messenger.com/" : "https://chat.zalo.me/";
    const injectorScript = isMessenger ? 'scripts/messenger_injector.js' : 'scripts/zalo_injector.js';

    // 1. Tìm xem có tab nào đang mở không
    const tabs = await chrome.tabs.query({ url: targetUrlQuery });
    let targetTab = null;

    if (tabs.length > 0) {
        targetTab = tabs[0];
        // Focus vào tab
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true });
        }
    } else {
        // Nếu chưa mở tab nào, tự động mở một tab mới
        targetTab = await chrome.tabs.create({ url: defaultUrl, active: true });
        
        // Đợi tab tải xong (tối đa 15s)
        await waitForTabComplete(targetTab.id);
        // Đợi thêm 4 giây để ứng dụng render xong giao diện
        await new Promise(r => setTimeout(r, 4000));
    }

    // 2. Thiết lập nội dung tin nhắn trước khi tiêm injector
    await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: (msg) => {
            window.__PENDING_AUTO_MESSAGE__ = msg;
        },
        args: [task.message]
    });

    // 3. Tiêm script thực hiện gửi tin
    const results = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        files: [injectorScript]
    });

    if (results && results[0] && results[0].result) {
        const res = results[0].result;
        if (!res.success) {
            throw new Error(res.error || `Gặp lỗi không xác định trên ${isMessenger ? 'Messenger' : 'Zalo Web'}`);
        }
    }
}

/**
 * Hàm đợi tab hoàn tất quá trình tải
 */
function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // Timeout dự phòng sau 15 giây
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 15000);
    });
}

/**
 * Hiển thị thông báo trên màn hình
 */
function showNotification(title, message) {
    if (chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: message,
            priority: 2
        });
    }
}

