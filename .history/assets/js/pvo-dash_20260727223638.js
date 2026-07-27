/

//CALENDAR
const monthYear = document.getElementById("monthYear");
const calendarGrid = document.getElementById("calendarGrid");

const selectedTitle = document.getElementById("selectedDateTitle");
const selectedInfo = document.getElementById("selectedDateInfo");

let currentDate = new Date();

function renderCalendar(){

    calendarGrid.innerHTML="";

    const year=currentDate.getFullYear();
    const month=currentDate.getMonth();

    monthYear.textContent=currentDate.toLocaleString("default",{
        month:"long",
        year:"numeric"
    });

    const firstDay=new Date(year,month,1).getDay();
    const lastDate=new Date(year,month+1,0).getDate();

    for(let i=0;i<firstDay;i++){

        const empty=document.createElement("div");
        empty.classList.add("calendar-date","empty");

        calendarGrid.appendChild(empty);

    }

    const today=new Date();

    for(let day=1;day<=lastDate;day++){

        const date=document.createElement("div");

        date.classList.add("calendar-date");

        date.textContent=day;

        if(
            day===today.getDate() &&
            month===today.getMonth() &&
            year===today.getFullYear()
        ){
            date.classList.add("today");
        }

        date.addEventListener("click",function(){

            document.querySelectorAll(".calendar-date")
                .forEach(d=>d.classList.remove("selected"));

            date.classList.add("selected");

            selectedInfo.textContent=
                "No PVO alerts or scheduled activities.";

        });

        calendarGrid.appendChild(date);

    }

}

document.getElementById("prevMonth").onclick=function(){

    currentDate.setMonth(currentDate.getMonth()-1);

    renderCalendar();

};

document.getElementById("nextMonth").onclick=function(){

    currentDate.setMonth(currentDate.getMonth()+1);

    renderCalendar();

};

renderCalendar();

//CLICKED DATE
let selectedDate = "";

date.addEventListener("click", function(){

    document.querySelectorAll(".calendar-date")
        .forEach(d => d.classList.remove("selected"));

    this.classList.add("selected");

    selectedDate =
        `${year}-${month+1}-${day}`;

    document.getElementById("selectedDate").textContent =
        new Date(year, month, day).toLocaleDateString(
            "en-US",
            {
                weekday:"long",
                month:"long",
                day:"numeric",
                year:"numeric"
            }
        );

});

//SAVE BUTTON 
document.getElementById("saveEventBtn").addEventListener("click", function(){

    const text = document.getElementById("eventInput").value;

    if(selectedDate === ""){
        alert("Please select a date first.");
        return;
    }

    console.log({
        date: selectedDate,
        event: text
    });

    alert("Event saved!");
});