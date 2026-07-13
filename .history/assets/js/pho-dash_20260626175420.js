// pho-dash.js - Dynamic Analytics Controller for PHO Dashboard
/*import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBfqjfJoGz591aI8TJjhIS3T4OEvQxX11Y",
    authDomain: "cris-database-da989.firebaseapp.com",
    databaseURL: "https://cris-database-da989-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cris-database-da989",
    storageBucket: "cris-database-da989.firebasestorage.app",
    messagingSenderId: "627885439681",
    appId: "1:627885439681:web:3c657d64c0aad9b4913240",
    measurementId: "G-0X99BH7GW4"
};

// Initialize Firebase App services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function calculateDashboardMetrics() {
    const totalBiteElement = document.getElementById('totalBiteCasesCount');
    const vaccinatedPatientsElement = document.getElementById('vaccinatedPatientsCount');
    const alertElement = document.getElementById('alert-status-text');
    
    try {
        // Pull data directly from bite_reports collection snapshot
        const querySnapshot = await getDocs(collection(db, "bite_reports"));
        
        let totalReports = querySnapshot.size; 
        let vaccinatedCount = 0;

        // Loop through metrics to evaluate patient configurations dynamically
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Check both potential form naming variations safely
            const status = (data.vaccinationStatus || data.animalVaccinationStatus || "").toLowerCase().trim();
            
            if (status === "vaccinated" || status === "yes") {
                vaccinatedCount++;
            }
        });

        // Safe DOM adjustments injection 
        if (totalBiteElement) totalBiteElement.textContent = totalReports.toLocaleString();
        if (vaccinatedPatientsElement) vaccinatedPatientsElement.textContent = vaccinatedCount.toLocaleString();

        // Dynamically alter layout notifications badge based on volume tracking
        if (alertElement) {
            if (totalReports > 0) {
                alertElement.textContent = `${totalReports} ongoing animal bite case incident logs registered within system records.`;
            } else {
                alertElement.textContent = "No active rabies or animal bite case alerts mapped out today.";
            }
        }

    } catch (error) {
        console.error("Error generating metrics dashboard calculations: ", error);
        if (totalBiteElement) totalBiteElement.textContent = "Error";
        if (vaccinatedPatientsElement) vaccinatedPatientsElement.textContent = "Error";
    }
}

// Fire the metric compilation logic once DOM elements assemble safely
document.addEventListener('DOMContentLoaded', calculateDashboardMetrics); */

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

                borderColor: 'blue',
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
                data: [70, 50, 40, 65, 80, 35, 90, 100, 90, 85, 95, 110],

                backgroundColor: 'blackx',

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