
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
            },
            {
                label: 'Human Rabies Deaths',
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
            },
            {
                label: 'Animal Rabies Deaths',
                data: [70, 50, 40, 65, 80, 65, 80, 75, 90, 85, 95, 110],

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
                text: 'MONTLY REPORT'
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