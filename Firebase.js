import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, addDoc }from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.getElementById("regButton").addEventListener("click", getAllInputs);

 function getAllInputs(regForm) {
                    const lastName = document.getElementById("lastName").value;
                    const firstName = document.getElementById("firstName").value;
                    const middleInitial = document.getElementById("middleInitial").value;
                    const suffix = document.getElementById("suffix").value;
                    const email = document.getElementById("email").value;
                    const password = document.getElementById("password").value;
                    const confirmPassword = document.getElementById("confirmPassword").value;
                    const address = document.getElementById("address").value;
                    const contactNumber = document.getElementById("contactNumber").value;
                    const dateOfBirth = document.getElementById("dateOfBirth").value;
                    const position = document.getElementById("position").value;
                    
                    // console.log("Last Name:", lastName);
                    // console.log("First Name:", firstName);
                    // console.log("middleInitial:", middleInitial);
                    // console.log("Suffix:", suffix);
                    // console.log("Email:", email);
                    // console.log("Password:", password);
                    // console.log("Confirm Password:", confirmPassword);
                    // console.log("Address:", address);
                    // console.log("Contact Number:", contactNumber);
                    // console.log("Date of Birth:", dateOfBirth);
                    // console.log("Position:", position);
                  
                    if (password !== confirmPassword) {
                        alert("Passwords do not match. Please try again.");
                        return;
                    }
                    if (password.length < 8) {
                        alert("Password must be at least 8 characters long. Please try again.");
                        return;
                    }
                    if (
                        lastName === "" || firstName === "" || middleInitial === "" || email === "" ||password === "" || confirmPassword === ""|| address === "" || contactNumber === "" || dateOfBirth === "" || position === ""
                    
                    ) {
                        alert("Please fill in all the required fields.");
                        return;   
                    }
                    else {
                        alert("Registration successful!");
                        // Here you can add code to submit the form data to your server or database
                    }

                    const userData = {
                        lastName, firstName, middleInitial, suffix, email, password, confirmPassword, address, contactNumber, dateOfBirth, position,
                        registrationDate: new Date().toISOString()
                    };

                    console.log("User Data:", userData);

                    const usersCollection = collection(db, "users");
                    addDoc(usersCollection, userData)
                        .then((docRef) => {
                            console.log("Document written with ID: ", docRef.id);
                            window.location.href = "CRIS PVO Login.html";
                        })
                        .catch((error) => {
                            console.error("Error adding document: ", error);
                        });

                        
                }   

