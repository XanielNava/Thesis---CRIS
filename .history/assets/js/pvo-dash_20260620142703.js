
/
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