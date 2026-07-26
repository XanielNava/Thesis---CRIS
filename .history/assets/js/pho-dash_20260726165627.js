import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy 
} from '../../settings/js';

// ==========================================
// 1. GLOBAL STATE & DASHBOARD CHART CONTROL
// ==========================================
let mixedChart = null;

/**
 * Initializes and renders the dual-axis statistics chart.
 * Uses one-time getDocs fetches instead of active listeners.
 */
export async function renderDashboardChart() {
    const canvas = document.getElementById('statisticsLineChart');
    if (!canvas) return;

    // Destroy existing instance to prevent canvas reuse/overlap errors
    if (mixedChart) {
        mixedChart.destroy();
        mixedChart = null;
    }

    try {
        const statsQuery = query(collection(db, "yearly-stats"), orderBy("year", "asc"));
        const snapshot = await getDocs(statsQuery);

        const labels = [];
        const biteCases = [];
        const humanDeaths = [];
        const abtcFacilities = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            labels.push(data.year);
            biteCases.push(data.bites || 0);
            humanDeaths.push(data.deaths || 0);
            abtcFacilities.push(data.abtc || 0);
        });

        const ctx = canvas.getContext('2d');
        mixedChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Animal Bite Cases',
                        data: biteCases,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'yLeft'
                    },
                    {
                        label: 'Human Rabies Deaths',
                        data: humanDeaths,
                        type: 'line',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.3,
                        fill: false,
                        yAxisID: 'yRight'
                    },
                    {
                        label: 'ABTC Facilities',
                        data: abtcFacilities,
                        type: 'line',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.3,
                        fill: false,
                        yAxisID: 'yRight'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    yLeft: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'Bite Cases' },
                        beginAtZero: true
                    },
                    yRight: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Deaths / Facilities' },
                        beginAtZero: true,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading chart data: ", error);
    }
}

// ==========================================
// 2. DATA UTILITIES & METRICS
// ==========================================

/**
 * One-time fetch to retrieve human population statistics.
 */
export async function loadHumanPopulation() {
    try {
        const docRef = doc(db, "system-metrics", "population");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const rawVal = data.population || data.count || data.iloiloPopulation || 0;
            return typeof rawVal === 'string' ? parseInt(rawVal.replace(/,/g, ''), 10) : rawVal;
        }
    } catch (error) {
        console.error("Error fetching human population: ", error);
    }
    return 0;
}

// ==========================================
// 3. OPTIMIZED CALENDAR ENGINE
// ==========================================

let currentDate = new Date();
let selectedDateStr = null;

/**
 * Fetches all announcements for a given year and month in a single batch query.
 * @returns {Promise<Map<string, string>>} Map of date strings (YYYY-MM-DD) to event text.
 */
async function fetchMonthEventsMap(year, month) {
    const eventsMap = new Map();
    const monthFormatted = String(month + 1).padStart(2, '0');
    
    // Bounds for the query
    const startStr = `${year}-${monthFormatted}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endStr = `${year}-${monthFormatted}-${String(lastDay).padStart(2, '0')}`;

    try {
        const q = query(
            collection(db, "calendar-events"),
            where("date", ">=", startStr),
            where("date", "<=", endStr)
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.date && data.description?.trim()) {
                eventsMap.set(data.date, data.description.trim());
            }
        });
    } catch (error) {
        console.error("Error batch fetching month events: ", error);
    }

    return eventsMap;
}

/**
 * Renders the calendar grid using a single batch query for event indicators.
 */
export async function renderCalendar() {
    const monthYearText = document.getElementById('monthYear');
    const calendarDays = document.getElementById('calendarDays');
    if (!monthYearText || !calendarDays) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYearText.textContent = currentDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    calendarDays.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Fetch all events for the target month in 1 network call
    const monthEventsMap = await fetchMonthEventsMap(year, month);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Render Blank Cells
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.classList.add('day', 'empty');
        calendarDays.appendChild(emptyDiv);
    }

    // Render Days
    for (let day = 1; day <= totalDays; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.classList.add('day');
        dayDiv.textContent = day;

        const formattedDay = String(day).padStart(2, '0');
        const formattedMonth = String(month + 1).padStart(2, '0');
        const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

        const cellDate = new Date(year, month, day);
        cellDate.setHours(0, 0, 0, 0);

        if (cellDate.getTime() === today.getTime()) {
            dayDiv.classList.add('today');
        }

        // Highlight if an event exists in our pre-fetched map
        if (monthEventsMap.has(dateStr)) {
            dayDiv.classList.add('has-event');
        }

        // Cell Click Handler
        dayDiv.addEventListener('click', () => {
            document.querySelectorAll('.calendar .days .day').forEach(d => d.classList.remove('selected'));
            dayDiv.classList.add('selected');
            selectedDateStr = dateStr;
            openEventModal(dateStr, cellDate < today);
        });

        calendarDays.appendChild(dayDiv);
    }
}

/**
 * Opens and manages the modal state for viewing/editing an event.
 */
async function openEventModal(dateStr, isPastDate) {
    const modal = document.getElementById('eventModal');
    const displayDate = document.getElementById('modalDisplayDate');
    const inputArea = document.getElementById('eventDescriptionInput');
    const saveBtn = document.getElementById('saveEventBtn');
    const deleteBtn = document.getElementById('deleteEventBtn');

    if (!modal || !displayDate || !inputArea) return;

    displayDate.textContent = `Announcements for ${dateStr}`;
    inputArea.value = '';

    try {
        const q = query(collection(db, "calendar-events"), where("date", "==", dateStr));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const eventData = querySnapshot.docs[0].data();
            inputArea.value = eventData.description || '';
        }
    } catch (error) {
        console.error("Error loading event detail: ", error);
    }

    // Past dates are read-only
    if (isPastDate) {
        inputArea.setAttribute('disabled', 'true');
        if (saveBtn) saveBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    } else {
        inputArea.removeAttribute('disabled');
        if (saveBtn) saveBtn.style.display = 'inline-block';
        if (deleteBtn) deleteBtn.style.display = 'inline-block';
    }

    modal.style.display = 'flex';
}

// ==========================================
// 4. EVENT CONTROLLERS & EVENT LISTENERS
// ==========================================

export function setupCalendarControls() {
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    const closeModal = document.getElementById('closeEventModal');
    const saveBtn = document.getElementById('saveEventBtn');
    const deleteBtn = document.getElementById('deleteEventBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => {
            const modal = document.getElementById('eventModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Save/Update Announcement
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!selectedDateStr) return;
            const inputArea = document.getElementById('eventDescriptionInput');
            const text = inputArea ? inputArea.value.trim() : '';

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDateStr));
                const querySnapshot = await getDocs(q);

                if (text === '') {
                    // Remove entry if text is cleared
                    for (const docSnap of querySnapshot.docs) {
                        await deleteDoc(doc(db, "calendar-events", docSnap.id));
                    }
                } else if (!querySnapshot.empty) {
                    // Properly await doc updates using for...of loop
                    for (const docSnap of querySnapshot.docs) {
                        const docRef = doc(db, "calendar-events", docSnap.id);
                        await setDoc(docRef, {
                            description: text,
                            title: text.split('\n')[0] || "Mass Announcement",
                            updatedAt: new Date()
                        }, { merge: true });
                    }
                } else {
                    // Create new announcement document
                    const newDocRef = doc(collection(db, "calendar-events"));
                    await setDoc(newDocRef, {
                        date: selectedDateStr,
                        description: text,
                        title: text.split('\n')[0] || "Mass Announcement",
                        createdAt: new Date()
                    });
                }

                alert("Announcement saved successfully!");
                document.getElementById('eventModal').style.display = 'none';
                await renderCalendar();
            } catch (error) {
                console.error("Error saving event: ", error);
                alert("Failed to save announcement. Please try again.");
            }
        });
    }

    // Delete Announcement
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!selectedDateStr) return;

            try {
                const q = query(collection(db, "calendar-events"), where("date", "==", selectedDateStr));
                const querySnapshot = await getDocs(q);

                for (const docSnap of querySnapshot.docs) {
                    await deleteDoc(doc(db, "calendar-events", docSnap.id));
                }

                alert("Announcement deleted successfully!");
                document.getElementById('eventModal').style.display = 'none';
                await renderCalendar();
            } catch (error) {
                console.error("Error deleting event: ", error);
                alert("Failed to delete announcement.");
            }
        });
    }
}

// ==========================================
// 5. INITIALIZATION ENTRY POINT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupCalendarControls();
    renderCalendar();
    renderDashboardChart();
});