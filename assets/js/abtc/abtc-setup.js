// ==========================================================================
// CRIS ABTC MODULE - FACILITY SETUP & APPLICATION CONTROLLER (abtc-setup.js)
// ==========================================================================

import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Central config instance
import { auth, db } from '../firebase/firebase-config.js';

const setupForm = document.getElementById("abtcSetupForm");

if (setupForm) {
    setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // 1. Password Validation
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

        // 2. Field Value Extractions
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

        // Regulatory & Compliance Fields (Option A)
        const dohLto = document.getElementById("abtcDohLto").value.trim();
        const prcLicense = document.getElementById("abtcPrcLicense").value.trim();
        const ownershipType = document.getElementById("abtcOwnership").value;
        const docsFolderUrl = document.getElementById("abtcDocsFolderUrl").value.trim();
        const hasColdChain = document.getElementById("abtcColdChainCheck").checked;

        const submitBtn = e.target.querySelector(".btn-submit") || e.target.querySelector("button[type='submit']");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Submitting Application...";
        }

        try {
            console.log("Registering applicant authentication profile...");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userUid = userCredential.user.uid;

            // 3. Step 1: Record profile into central 'users' collection (Pending status)
            console.log("Saving user profile to 'users'...");
            await setDoc(doc(db, "users", userUid), {
                uid: userUid,
                email: email,
                fullName: contactPerson,
                position: position,
                designation: "Facility Head",
                globalRole: "staff",
                prcLicenseNumber: prcLicense,
                status: "Pending", // Awaiting PHO administrator approval
                createdAt: serverTimestamp()
            });

            // 4. Step 1: Submit pending application into 'facility_applications'
            console.log("Submitting record to 'facility_applications'...");
            await setDoc(doc(db, "facility_applications", `app_${userUid}`), {
                applicantUid: userUid,
                facilityName: facilityName,
                acronym: acronym,
                facilityType: facilityType,
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
                regulatoryData: {
                    dohLto: dohLto,
                    prcLicense: prcLicense,
                    ownershipType: ownershipType,
                    docsFolderUrl: docsFolderUrl,
                    coldChainCompliant: hasColdChain
                },
                reviewStatus: "Pending",
                submittedAt: serverTimestamp()
            });

            alert("Registration Submitted! Your facility application is now pending review and verification by the PHO Administrator.");
            window.location.href = "abtc-login.html";

        } catch (error) {
            console.error("Facility setup submission error:", error);
            if (error.code === "auth/email-already-in-use") {
                alert("Setup Failed: This email address is already registered in the system.");
            } else {
                alert("Setup Failed: " + error.message);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Submit Application for Review";
            }
        }
    });
}