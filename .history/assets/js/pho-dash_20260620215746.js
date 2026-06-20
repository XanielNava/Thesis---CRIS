// pho-dash.js - Dynamic Analytics Controller for PHO Dashboard
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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
document.addEventListener('DOMContentLoaded', calculateDashboardMetrics);