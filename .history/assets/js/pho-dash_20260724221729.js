// Register ChartDataLabels plugin if available in global scope
if (typeof ChartDataLabels !== 'undefined' && typeof Chart !== 'undefined') {
    Chart.register(ChartDataLabels);
}

let mixedChart = null;

/**
 * Renders or updates the mixed bar/line chart dynamically without hardcoded datasets.
 * @param {Object} data - Contains array attributes: labels, animalBites, abtcCases, rabiesDeaths
 */
export function renderDashboardChart(data = {}) {
    const canvas = document.getElementById('statisticsLineChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    // Destroy existing chart instance to prevent canvas rendering overlaps
    if (mixedChart) {
        mixedChart.destroy();
    }

    mixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels || [],
            datasets: [
                // 1. Bar Chart: Animal Bite Cases (Left Y-Axis)
                {
                    type: 'bar',
                    label: 'No. of Animal Bites',
                    data: data.animalBites || [],
                    backgroundColor: '#5ea228',
                    borderColor: '#396317',
                    borderWidth: 1,
                    yAxisID: 'yLeft',
                    order: 3,
                    datalabels: {
                        align: 'end',
                        anchor: 'end',
                        color: '#002B7F',
                        font: { weight: 'bold', size: 12 },
                        formatter: (val) => val ? Number(val).toLocaleString() : 0
                    }
                },
                // 2. Line Chart: ABTCs (Right Y-Axis)
                {
                    type: 'line',
                    label: 'No. of ABTCs',
                    data: data.abtcCases || [],
                    borderColor: '#1e1c78',
                    backgroundColor: '#1e1c78',
                    borderWidth: 3,
                    tension: 0.1,
                    yAxisID: 'yRight',
                    order: 1,
                    datalabels: {
                        align: 'top',
                        anchor: 'center',
                        color: '#000000',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                // 3. Line Chart: Human Rabies Deaths (Right Y-Axis)
                {
                    type: 'line',
                    label: 'No. of Human Rabies Death',
                    data: data.rabiesDeaths || [],
                    borderColor: '#d91d1c',
                    backgroundColor: '#d91d1c',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'yRight',
                    order: 2,
                    datalabels: {
                        align: 'bottom',
                        anchor: 'center',
                        color: '#8b0000',
                        font: { weight: 'bold', italic: true, size: 11 }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Total Annual Animal Bite Cases',
                    color: '#b21817',
                    font: { size: 18, weight: 'bold' }
                },
                legend: { position: 'top' }
            },
            scales: {
                x: { grid: { display: false } },
                yLeft: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => value.toLocaleString()
                    },
                    grid: { color: '#e0e0e0' }
                },
                yRight: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    ticks: { stepSize: 10 },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

/**
 * Updates summary cards above the chart with computed totals
 */
function updateStatCards(data = {}) {
    const totalBites = (data.animalBites || []).reduce((acc, curr) => acc + Number(curr || 0), 0);
    const totalABTC = (data.abtcCases || []).reduce((acc, curr) => acc + Number(curr || 0), 0);
    const totalDeaths = (data.rabiesDeaths || []).reduce((acc, curr) => acc + Number(curr || 0), 0);

    const biteElem = document.getElementById('animalPopulation');
    const abtcElem = document.getElementById('animalBiteCases');
    const deathElem = document.getElementById('humanRabiesDeaths');

    if (biteElem) biteElem.textContent = totalBites.toLocaleString();
    if (abtcElem) abtcElem.textContent = totalABTC.toLocaleString();
    if (deathElem) deathElem.textContent = totalDeaths.toLocaleString();
}

/**
 * Loads dynamic dataset stored by settings.js from browser storage
 */
function initDashboardChart() {
    const savedData = localStorage.getItem('cris_dashboard_data');
    
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            renderDashboardChart(parsedData);
            updateStatCards(parsedData);
        } catch (e) {
            console.error("Failed to parse stored dataset:", e);
        }
    } else {
        // Fallback initialized state before data is uploaded from settings
        renderDashboardChart({ labels: [], animalBites: [], abtcCases: [], rabiesDeaths: [] });
    }
}

// Watch for cross-tab or settings dataset modifications live
window.addEventListener('storage', (event) => {
    if (event.key === 'cris_dashboard_data' && event.newValue) {
        try {
            const newData = JSON.parse(event.newValue);
            renderDashboardChart(newData);
            updateStatCards(newData);
        } catch (e) {
            console.error("Failed updating chart from storage event:", e);
        }
    }
});

// Run chart initialization on startup
document.addEventListener('DOMContentLoaded', initDashboardChart);