document.addEventListener("DOMContentLoaded", function () {
    // Initialize Sidebar Engine
    setupSidebar();

    // Initialize Calendar Engine
    initCalendar();
});

// ================= SIDEBAR TOGGLE ENGINE =================
function setupSidebar() {
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");

    if (sidebarToggle && sidebar) {
        const wasCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
        if (wasCollapsed) {
            sidebar.classList.add("collapsed");
        }

        sidebarToggle.addEventListener("click", function () {
            sidebar.classList.toggle("collapsed");
            const isCollapsed = sidebar.classList.contains("collapsed");
            localStorage.setItem("sidebarCollapsed", isCollapsed);
        });
    }
}

// ================= CALENDAR ENGINE =================
let currentDate = new Date();
let selectedDateKey = ""; // Stores 'YYYY-MM-DD' key for event persistence

function initCalendar() {
    const monthYear = document.getElementById("monthYear");
    const calendarGrid = document.getElementById("calendarGrid");
    const prevMonthBtn = document.getElementById("prevMonth");
    const nextMonthBtn = document.getElementById("nextMonth");
    const saveEventBtn = document.getElementById("saveEventBtn");
    const eventInput = document.getElementById("eventInput");
    const selectedDateDisplay = document.getElementById("selectedDate");

    function renderCalendar() {
        if (!calendarGrid || !monthYear) return;

        calendarGrid.innerHTML = "";

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        monthYear.textContent = currentDate.toLocaleString("default", {
            month: "long",
            year: "numeric"
        });

        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        // Render empty cells for offset days
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div");
            empty.classList.add("calendar-date", "empty");
            calendarGrid.appendChild(empty);
        }

        const today = new Date();

        // Render calendar days
        for (let day = 1; day <= lastDate; day++) {
            const dateCell = document.createElement("div");
            dateCell.classList.add("calendar-date");
            dateCell.textContent = day;

            const dateStringKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

            // Highlight Today
            if (
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear()
            ) {
                dateCell.classList.add("today");
            }

            // Highlight currently selected date
            if (selectedDateKey === dateStringKey) {
                dateCell.classList.add("selected");
            }

            // Check if date has saved event/note and add indicator
            const savedEvent = localStorage.getItem(`pvo_event_${dateStringKey}`);
            if (savedEvent) {
                const badge = document.createElement("span");
                badge.style.cssText = "width: 5px; height: 5px; background-color: var(--sunset-orange); border-radius: 50%; position: absolute; bottom: 4px;";
                dateCell.style.position = "relative";
                dateCell.appendChild(badge);
            }

            // Date Click Handler
            dateCell.addEventListener("click", function () {
                document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
                dateCell.classList.add("selected");

                selectedDateKey = dateStringKey;

                const formattedDate = new Date(year, month, day).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                });

                if (selectedDateDisplay) {
                    selectedDateDisplay.textContent = formattedDate;
                }

                // Load saved event for this date if exists
                if (eventInput) {
                    eventInput.value = savedEvent || "";
                }
            });

            calendarGrid.appendChild(dateCell);
        }
    }

    // Navigation Controls
    if (prevMonthBtn) {
        prevMonthBtn.onclick = function () {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        };
    }

    if (nextMonthBtn) {
        nextMonthBtn.onclick = function () {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        };
    }

    // Save Event Handler
    if (saveEventBtn) {
        saveEventBtn.addEventListener("click", function () {
            if (!selectedDateKey) {
                alert("Please select a date from the calendar first.");
                return;
            }

            const text = eventInput ? eventInput.value.trim() : "";

            if (text === "") {
                localStorage.removeItem(`pvo_event_${selectedDateKey}`);
                alert("Announcement / note cleared.");
            } else {
                localStorage.setItem(`pvo_event_${selectedDateKey}`, text);
                alert("Announcement saved successfully!");
            }

            renderCalendar();
        });
    }

    // Initial render
    renderCalendar();
}