document.addEventListener('DOMContentLoaded', async () => {
    const messageInput = document.getElementById('messageInput');
    const scheduleTimeInput = document.getElementById('scheduleTime');
    const btnSchedule = document.getElementById('btnSchedule');
    const btnClearAll = document.getElementById('btnClearAll');
    const taskList = document.getElementById('taskList');
    const quickButtons = document.querySelectorAll('.btn-quick');
    const platformRadios = document.querySelectorAll('input[name="platform"]');
    const platformLink = document.getElementById('platformLink');

    // Cập nhật mẹo gợi ý theo nền tảng được chọn
    function updateTipLink() {
        const selectedPlatform = document.querySelector('input[name="platform"]:checked')?.value || 'zalo';
        if (selectedPlatform === 'messenger') {
            platformLink.href = "https://www.messenger.com";
            platformLink.textContent = "messenger.com";
        } else {
            platformLink.href = "https://chat.zalo.me";
            platformLink.textContent = "chat.zalo.me";
        }
    }

    platformRadios.forEach(radio => {
        radio.addEventListener('change', updateTipLink);
    });
    updateTipLink();

    // 1. Mặc định đặt giờ gửi là sau thời điểm hiện tại 5 phút
    setDefaultTime(5);

    function setDefaultTime(minutesToAdd) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutesToAdd);
        // Format dạng YYYY-MM-DDTHH:mm cho input datetime-local
        const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        scheduleTimeInput.value = localIso;
    }

    // Xử lý các nút cộng nhanh thời gian (+5p, +15p, +1h)
    quickButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.getAttribute('data-minutes'), 10);
            setDefaultTime(mins);
        });
    });

    // 2. Tải và hiển thị danh sách các lịch hẹn hiện có
    await loadTasks();

    // 3. Sự kiện bấm nút "Lên Lịch Gửi"
    btnSchedule.addEventListener('click', async () => {
        const message = messageInput.value.trim();
        const scheduleVal = scheduleTimeInput.value;

        if (!message) {
            alert("Vui lòng nhập nội dung tin nhắn!");
            messageInput.focus();
            return;
        }

        if (!scheduleVal) {
            alert("Vui lòng chọn thời gian gửi!");
            scheduleTimeInput.focus();
            return;
        }

        const scheduledTimestamp = new Date(scheduleVal).getTime();
        const nowTimestamp = Date.now();

        if (scheduledTimestamp <= nowTimestamp) {
            alert("Thời gian gửi phải ở tương lai!");
            return;
        }

        const selectedPlatform = document.querySelector('input[name="platform"]:checked')?.value || 'zalo';
        const taskId = `${selectedPlatform}_task_${Date.now()}`;
        const newTask = {
            id: taskId,
            platform: selectedPlatform,
            message: message,
            scheduledTime: new Date(scheduledTimestamp).toISOString(),
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        // Lưu vào chrome.storage
        const data = await chrome.storage.local.get({ scheduledTasks: [] });
        const tasks = data.scheduledTasks;
        tasks.unshift(newTask);
        await chrome.storage.local.set({ scheduledTasks: tasks });

        // Tạo chuông báo bằng chrome.alarms
        chrome.alarms.create(taskId, {
            when: scheduledTimestamp
        });

        // Xóa trắng ô nhập và reset thời gian
        messageInput.value = "";
        setDefaultTime(5);

        // Cập nhật lại giao diện
        await loadTasks();
        alert("✅ Đã lên lịch thành công! Tin nhắn sẽ được gửi đúng giờ.");
    });

    // 4. Xóa toàn bộ lịch sử đã gửi/thất bại
    btnClearAll.addEventListener('click', async () => {
        if (!confirm("Bạn có chắc muốn dọn dẹp các tin nhắn đã gửi hoặc thất bại không?")) return;

        const data = await chrome.storage.local.get({ scheduledTasks: [] });
        // Chỉ giữ lại các task đang chờ gửi
        const pendingTasks = data.scheduledTasks.filter(t => t.status === 'pending');
        await chrome.storage.local.set({ scheduledTasks: pendingTasks });
        await loadTasks();
    });

    // Hàm render danh sách lịch hẹn
    async function loadTasks() {
        const data = await chrome.storage.local.get({ scheduledTasks: [] });
        const tasks = data.scheduledTasks || [];

        taskList.innerHTML = "";

        if (tasks.length === 0) {
            taskList.innerHTML = `<div class="empty-state">Chưa có lịch hẹn nào.</div>`;
            return;
        }

        tasks.forEach(task => {
            const item = document.createElement('div');
            item.className = `task-item status-${task.status}`;

            const dateStr = formatDateTime(task.scheduledTime);
            let badgeText = "Đang chờ";
            let badgeClass = "badge-pending";

            if (task.status === 'sent') {
                badgeText = "Đã gửi";
                badgeClass = "badge-sent";
            } else if (task.status === 'failed') {
                badgeText = "Thất bại";
                badgeClass = "badge-failed";
            }

            const platform = task.platform === 'messenger' ? 'Messenger' : 'Zalo';
            const platformTagClass = task.platform === 'messenger' ? 'platform-tag-messenger' : 'platform-tag-zalo';

            item.innerHTML = `
                <div class="task-header">
                    <div>
                        <span class="task-platform ${platformTagClass}">${platform}</span>
                        <span class="task-time">⏰ ${dateStr}</span>
                    </div>
                    <span class="task-status ${badgeClass}">${badgeText}</span>
                </div>
                <div class="task-body">${escapeHtml(task.message)}</div>
                <div class="task-actions">
                    <button class="btn-delete" data-id="${task.id}">
                        ${task.status === 'pending' ? 'Hủy lịch' : 'Xóa'}
                    </button>
                </div>
            `;

            // Bắt sự kiện xóa / hủy lịch
            item.querySelector('.btn-delete').addEventListener('click', async () => {
                await deleteTask(task.id);
            });

            taskList.appendChild(item);
        });
    }

    async function deleteTask(taskId) {
        // Hủy chuông báo nếu còn
        chrome.alarms.clear(taskId);

        // Xóa khỏi storage
        const data = await chrome.storage.local.get({ scheduledTasks: [] });
        const updated = data.scheduledTasks.filter(t => t.id !== taskId);
        await chrome.storage.local.set({ scheduledTasks: updated });

        await loadTasks();
    }

    function formatDateTime(isoString) {
        const d = new Date(isoString);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${hours}:${minutes} - ${day}/${month}/${year}`;
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
});

