// abtc-setup.js

import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Import shared central instances (Managed by firebase-config.js switch)
import { auth, db } from './firebase-config.js';

const setupForm = document.getElementById("abtcSetupForm");

if (setupForm) {
    setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const password = document.getElementById("abtcPassword").value;
        const confirmPassword = document.getElementById("confirmAbtcPassword").value;

        if (password !== confirmPassword) {
            alert("Validation Error: Passwords do not match. Please verify and try again.");
            return;
        }

        if (password.length < 6) {
            alert("Validation Error: Password must be at least 6 characters long.");
            return;
        }

        const email = document.getElementById("abtcEmail").value.trim();
        const facilityName = document.getElementById("abtcName").value.trim();
        const acronym = document.getElementById("abtcCode").value.toUpperCase().trim();
        const facilityType = document.getElementById("abtcType").value;
        
        const street = document.getElementById("abtcStreet").value.trim();
        const barangay = document.getElementById("abtcBarangay").value.trim();
        const city = document.getElementById("abtcCity").value.trim();
        const province = document.getElementById("abtcProvince").value.trim();
        
        const contactPerson = document.getElementById("abtcContactPerson").value.trim();
        const position = document.getElementById("abtcPosition").value.trim();
        const phone = document.getElementById("abtcPhone").value.trim();

        const submitBtn = e.target.querySelector(".btn-submit") || e.target.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Initializing Workspace...";
        }

        try {
            console.log("Registering account credentials...");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userUid = userCredential.user.uid;

            console.log("Saving facility layout data to Firestore...");
            await setDoc(doc(db, "facilities", userUid), {
                facilityId: userUid,
                facilityName: facilityName,
                acronym: acronym,
                facilityType: facilityType,
                status: "Online",
                address: {
                    street: street,
                    barangay: barangay,
                    city: city,
                    province: province
                },
                contactInfo: {
                    contactPerson: contactPerson,
                    position: position,
                    phone: phone,
                    email: email
                },
                createdAt: new Date()
            });

            console.log("Initializing local sequence counters...");
            await setDoc(doc(db, "facility_counters", userUid), {
                currentSequence: 0
            });

            alert("System Initialized Successfully! You are now redirected to the login terminal.");
            window.location.href = "abtc-login.html";

        } catch (error) {
            console.error("Critical initialization failure:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Setup Failed: This email address is already registered.");
            } else {
                alert("Setup Failed: " + error.message);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Initialize Workspace";
            }
        }
    });
}