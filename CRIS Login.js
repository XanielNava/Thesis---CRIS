// JavaScript for Burger 
function updateCalendar() {

    const header = document.getElementById("calendarHeader");
    const daysContainer = document.getElementById("calendarDays");

    const today = new Date();

    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    header.innerText = "Today, " + today.toLocaleDateString('en-GB', options);

    const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    daysContainer.innerHTML = "";

    for (let i = -2; i <= 2; i++) {

        const date = new Date();
        date.setDate(today.getDate() + i);

        const dayNumber = date.getDate();
        const weekday = weekdays[date.getDay()];

        const dayDiv = document.createElement("div");
        dayDiv.classList.add("day");

        if (i === 0) {
            dayDiv.classList.add("active");
        }

        dayDiv.innerHTML = `${String(dayNumber).padStart(2,'0')}<br><span>${weekday}</span>`;

        daysContainer.appendChild(dayDiv);
    }

}

updateCalendar();
