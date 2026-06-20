
// LINE CHART 
const ctx = document.getElementById('statisticsLineChart');

new Chart(ctx, {
    type: 'line',

    data: {
        labels: [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec'
        ],

        datasets: [
            {
                label: 'Animal Bite Cases',

                data: [25, 40, 35, 50, 70, 65, 80, 75, 90, 85, 95, 110],

                borderColor: '#EA6113',
                backgroundColor: 'rgba(234,97,19,0.15)',

                borderWidth: 3,

                fill: true,

                tension: 0.4,

                pointRadius: 5,
                pointHoverRadius: 7,

                pointBackgroundColor: '#EA6113',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }
        ]
    },

    options: {

        responsive: true,

        maintainAspectRatio: false,

        plugins: {
            legend: {
                display: true,
                position: 'top'
            },

            title: {
                display: true,
                text: 'Monthly Animal Bite Cases'
            }
        },

        scales: {

            y: {
                beginAtZero: true,

                grid: {
                    color: '#eeeeee'
                },

                ticks: {
                    stepSize: 20
                }
            },

            x: {
                grid: {
                    display: false
                }
            }
        }
    }
});



//CALENDAR
document.addEventListener("DOMContentLoaded", function () {
    updateCalendar();
    setInterval(updateCalendar, 60000);
});

function updateCalendar() {
    const today = new Date();

    const header = document.getElementById("calendarHeader");
    const days = document.getElementById("calendarDays");

    if (!header || !days) return; // safety check

    const options = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    };

    header.textContent =
        "Today, " + today.toLocaleDateString("en-US", options);

    days.innerHTML = "";

    const weekNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // show 5-day mini calendar (today centered)
    for (let i = -2; i <= 2; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const div = document.createElement("div");
        div.classList.add("day");

        if (i === 0) {
            div.classList.add("active");
        }

        div.innerHTML = `
            <div class="day-number">${date.getDate()}</div>
            <div class="day-name">${weekNames[date.getDay()]}</div>
        `;

        days.appendChild(div);
    }
}