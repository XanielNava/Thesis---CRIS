function updateCalendar(){
    const today = new Date();
    const options = {
        weekday:"long",
        year:"numeric",
        month:"long",
        day:"numeric"
    };

    document.getElementById("calendarHeader").textContent =
        "Today, " + today.toLocaleDateString("en-US", options);
    const calendarDays = document.getElementById("calendarDays");
    calendarDays.innerHTML = "";

    const weekNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for(let i=-2;i<=2;i++){
        const date = new Date(today);
        date.setDate(today.getDate()+i);
        const div = document.createElement("div");
        div.className = "day";
        if(i===0){
            div.classList.add("active");
        }
        div.innerHTML = `
            <div class="day-number">${date.getDate()}</div>
            <div class="day-name">${weekNames[date.getDay()]}</div>
        `;
        calendarDays.appendChild(div);
    }
}
updateCalendar();

/* Refresh automatically at midnight */
setInterval(updateCalendar,60000);
