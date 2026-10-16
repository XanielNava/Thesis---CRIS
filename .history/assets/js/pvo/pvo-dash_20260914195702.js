// ==========================================================================
// PVO DASHBOARD CORE LOGIC & ANALYTICS MODULE
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    initUserProfile();
    initStatistics();
    initSurveillanceChart();
    initCalendarSystem();
});

/* --------------------------------------------------------------------------
   1. USER PROFILE & HEADER INITIALIZATION
   -------------------------------------------------------------------------- */
function initUserProfile() {
    const topProfileName = document.getElementById("topProfileName");
    const welcomeGreeting = document.getElementById("welcomeGreeting");

    // Default Authorized PVO Personnel
    const currentUser = {
        name: "Dr. Maria Santos",
        role: "Provincial Veterinary Officer"
    };

    if (topProfileName) topProfileName.textContent = currentUser.name;
    if (welcomeGreeting) welcomeGreeting.textContent = `Hello, ${currentUser.name}`;
}

/* --------------------------------------------------------------------------
   2. STATISTICS & KPI DATA PIPELINE
   -------------------------------------------------------------------------- */
const pvoDataset = {
    "2026": {
        totalBites: 1420,
        confirmedRabies: 3,
        vaccinationCoverage: "74%",
        animalsObserved: 14,
        chartData: {
            bites: [110, 125, 140, 130, 155, 170, 160, 145, 130, 0, 0, 0],
            vaccinations: [85, 95, 110, 105, 130, 140, 135, 120, 115, 0, 0, 0],
            confirmed: [0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0]
        }
    },
    "2025": {
        totalBites: 1850,
        confirmedRabies: 5,
        vaccinationCoverage: "68%",
        animalsObserved: 0,
        chartData: {
            bites: [140, 150, 160, 175, 180, 165, 155, 145, 135, 150, 140, 155],
            vaccinations: [90, 100, 115, 120, 130, 110, 105, 95, 90, 105, 100, 110],
            confirmed: [1, 0, 1, 0, 2, 0, 0, 1, 0, 0, 0, 0]
        }
    },
    "2024": {
        totalBites: 1690,
        confirmedRabies: 8,
        vaccinationCoverage: "62%",
        animalsObserved: 0,
        chartData: {
            bites: [130, 140, 145, 150, 160, 155, 140, 135, 130, 145, 135, 135],
            vaccinations: [80, 85, 90, 95, 100, 95, 85, 80, 75, 85, 80, 90],
            confirmed: [1, 1, 2, 0, 1, 1, 0, 1, 0, 1, 0, 0]
        }
    }
};

function initStatistics() {
    const yearFilter = document.getElementById("yearFilter");
    const monthFilter = document.getElementById("monthFilter");

    function updateKPIs() {
        const selectedYear = yearFilter ? yearFilter.value : "2026";
        const selectedMonth = monthFilter ? monthFilter.value : "all";
        const data = pvoDataset[selectedYear] || pvoDataset["2026"];

        if (selectedMonth === "all") {
            document.getElementById("totalBiteCases").textContent = data.totalBites.toLocaleString();
            document.getElementById("confirmedRabiesCases").textContent = data.confirmedRabies;
            document.getElementById("vaccinationCoverage").textContent = data.vaccinationCoverage;
            document.getElementById("animalsObserved").textContent = data.animalsObserved;
        } else {
            const monthIdx = parseInt(selectedMonth);
            const biteVal = data.chartData.bites[monthIdx] || 0;
            const confirmedVal = data.chartData.confirmed[monthIdx] || 0;
            
            document.getElementById("totalBiteCases").textContent = biteVal;
            document.getElementById("confirmedRabiesCases").textContent = confirmedVal;
            document.getElementById("vaccinationCoverage").textContent = data.vaccinationCoverage;
            document.getElementById("animalsObserved").textContent = monthIdx === 8 ? data.animalsObserved : 0;
        }
    }

    if (yearFilter) yearFilter.addEventListener("change", () => { updateKPIs(); updateChartData(); });
    if (monthFilter) monthFilter.addEventListener("change", updateKPIs);

    updateKPIs();
}

/* --------------------------------------------------------------------------
   3. CHART.JS ANALYTICS ENGINE
   -------------------------------------------------------------------------- */
let surveillanceChart = null;

function initSurveillanceChart() {
    const ctx = document.getElementById("pvoSurveillanceChart")?.getContext("2d");
    if (!ctx) return;

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    surveillanceChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Animal Bite Cases",
                data: pvoDataset["2026"].chartData.bites,
                borderColor: "#e65100",
                backgroundColor: "rgba(230, 81, 0, 0.08)",
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: "#e65100"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0b132b",
                    titleFont: { family: "Lato", size: 13, weight: "bold" },
                    bodyFont: { family: "Lato", size: 12 },
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "Lato", size: 11 } }
                },
                y: {
                    border: { dash: [4, 4] },
                    grid: { color: "#f0f0f0" },
                    ticks: { font: { family: "Lato", size: 11 } },
                    beginAtZero: true
                }
            }
        }
    });

    const metricSelect = document.getElementById("chartMetricSelect");
    if (metricSelect) {
        metricSelect.addEventListener("change", updateChartData);
    }
}

function updateChartData() {
    if (!surveillanceChart) return;
    const year = document.getElementById("yearFilter")?.value || "2026";
    const metric = document.getElementById("chartMetricSelect")?.value || "bites";
    const dataObj = pvoDataset[year] || pvoDataset["2026"];

    let color = "#e65100";
    let bg = "rgba(230, 81, 0, 0.08)";
    let label = "Animal Bite Cases";

    if (metric === "vaccinations") {
        color = "#2e7d32";
        bg = "rgba(46, 125, 50, 0.08)";
        label = "Vaccinations Administered";
    } else if (metric === "confirmed") {
        color = "#d84315";
        bg = "rgba(216, 67, 21, 0.08)";
        label = "Confirmed Rabies Cases";
    }

    surveillanceChart.data.datasets[0].label = label;
    surveillanceChart.data.datasets[0].data = dataObj.chartData[metric];
    surveillanceChart.data.datasets[0].borderColor = color;
    surveillanceChart.data.datasets[0].backgroundColor = bg;
    surveillanceChart.data.datasets[0].pointBackgroundColor = color;
    surveillanceChart.update();
}

/* --------------------------------------------------------------------------
   4. INTERACTIVE CALENDAR & ANNOUNCEMENT SYSTEM
   -------------------------------------------------------------------------- */
let currentDate = new Date(2026, 8, 1); // Default September 2026
let selectedDateStr = "";
let selectedYearModal = 2026;
const pvoAnnouncementsStore = {};

function initCalendarSystem() {
    renderCalendar();

    // Month Nav Buttons
    document.getElementById("prevMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById("nextMonth")?.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Calendar Modal Controls
    const titleContainer = document.getElementById("calendarTitleContainer");
    const calendarModal = document.getElementById("calendarModal");
    const closeModalBtn = document.getElementById("closeModalBtn");

    if (titleContainer && calendarModal) {
        titleContainer.addEventListener("click", () => {
            selectedYearModal = currentDate.getFullYear();
            updateModalYearDisplay();
            renderModalMonths();
            calendarModal.classList.remove("hidden");
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            calendarModal.classList.add("hidden");
        });
    }

    document.getElementById("modalPrevYear")?.addEventListener("click", () => {
        selectedYearModal--;
        updateModalYearDisplay();
    });

    document.getElementById("modalNextYear")?.addEventListener("click", () => {
        selectedYearModal++;
        updateModalYearDisplay();
    });

    // Save Announcement Button
    document.getElementById("saveEventBtn")?.addEventListener("click", saveAnnouncement);
}

function renderCalendar() {
    const monthYear = document.getElementById("monthYear");
    const calendarGrid = document.getElementById("calendarGrid");
    if (!monthYear || !calendarGrid) return;

    calendarGrid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Render leading empty cells
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.classList.add("calendar-date", "empty");
        calendarGrid.appendChild(empty);
    }

    // Render calendar days
    for (let day = 1; day <= lastDate; day++) {
        const dateCell = document.createElement("div");
        dateCell.classList.add("calendar-date");
        dateCell.textContent = day;

        const thisDate = new Date(year, month, day);
        const formattedStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ) {
            dateCell.classList.add("today");
        }

        if (thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            dateCell.classList.add("past");
        }

        if (pvoAnnouncementsStore[formattedStr]) {
            dateCell.classList.add("has-event");
        }

        dateCell.addEventListener("click", () => handleDateClick(dateCell, year, month, day, formattedStr, thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())));

        calendarGrid.appendChild(dateCell);
    }
}

function handleDateClick(cell, year, month, day, dateStr, isPast) {
    document.querySelectorAll(".calendar-date").forEach(d => d.classList.remove("selected"));
    cell.classList.add("selected");

    selectedDateStr = dateStr;

    const displayDate = new Date(year, month, day);
    const selectedDateHeader = document.getElementById("selectedDate");
    const eventInput = document.getElementById("eventInput");
    const saveBtn = document.getElementById("saveEventBtn");

    if (selectedDateHeader) {
        selectedDateHeader.textContent = displayDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    }

    if (eventInput) {
        eventInput.value = pvoAnnouncementsStore[dateStr] || "";
        eventInput.disabled = isPast;
    }

    if (saveBtn) {
        saveBtn.disabled = isPast;
    }
}

function saveAnnouncement() {
    const eventInput = document.getElementById("eventInput");
    if (!selectedDateStr) {
        alert("Please select a date from the calendar first.");
        return;
    }

    if (eventInput) {
        const text = eventInput.value.trim();
        if (text === "") {
            delete pvoAnnouncementsStore[selectedDateStr];
            alert("Announcement cleared for selected date.");
        } else {
            pvoAnnouncementsStore[selectedDateStr] = text;
            alert("PVO Announcement saved successfully!");
        }
        renderCalendar();
    }
}

function updateModalYearDisplay() {
    const modalYearDisplay = document.getElementById("modalYearDisplay");
    if (modalYearDisplay) modalYearDisplay.textContent = selectedYearModal;
}

function renderModalMonths() {
    const monthsGrid = document.getElementById("modalMonthsGrid");
    if (!monthsGrid) return;

    monthsGrid.innerHTML = "";
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    monthNames.forEach((m, idx) => {
        const mCell = document.createElement("div");
        mCell.classList.add("month-cell");
        if (idx === currentDate.getMonth() && selectedYearModal === currentDate.getFullYear()) {
            mCell.classList.add("active");
        }
        mCell.textContent = m;
        mCell.addEventListener("click", () => {
            currentDate.setFullYear(selectedYearModal);
            currentDate.setMonth(idx);
            renderCalendar();
            document.getElementById("calendarModal")?.classList.add("hidden");
        });
        monthsGrid.appendChild(mCell);
    });
}