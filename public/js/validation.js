// const nameid = document.getElementById("name");
// const emailid = document.getElementById("email");
// const phoneid = document.getElementById("phone");
// const passwordid = document.getElementById("password");
// const confirmPasswordid = document.getElementById("confirmpassword");

// const error1 = document.getElementById(error1);
// const error2 = document.getElementById(error2);
// const error3 = document.getElementById(error3);
// const error4 = document.getElementById(error4);
// const error5 = document.getElementById(error5);

// const signupform = document.getElementById("signup-form");

// function nameValidateChecking(e){
//     const nameval = nameid.value;
//     const namepattern = /^[A-Za-z]+(?: [A-Za-z]+)*$/ 

//     if(nameval.trim() === ""){
//         error1.style.display = "block";
//         error1.innerHTML='Please fill the field';
//     }
//     else if(!namepattern.test(nameval)){
//         error1.style.dispplay ="block";
//         error1.innerHTML = "Name can only contain alphabets and spaces"
//     }
//     else{
//         error1.style.display='none';
//         error1.innerHTML = "";
//     }

// }

// function emailVAlidateChecking (e){
//     const emailval = emailid.value;
//     const emailpattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

//     if(emailval.trim() === "" ){
//         error2.style.display = "block";
//         error2.innerHTML = 'Please fill the field';
//     }
//     else if(!emailval.test(emailpattern)){
//         error2.style.display = "block";
//         error2.innerHTML = "Please enter valid email"
//     }
//     else{
//         error2.style.display='none';
//         error2.innerHTML = "";
//     }

// }

// function phoneValidateChecking (e) {
//     const phoneval = phoneid.value;
//     const phonepattern = /^\+?[1-9]\d{1,14}$/

//     if(phoneval.trim() == ""){
//         error3.style.display = "block";
//         error3.innerHTML = "Please fill the field";
//     }
//     else if(!phoneval.test(phonepattern)){
//         error3.style.display = "block";
//         error3.innerHTML = "Please enter valid phone number";
//     }
//     else{
//         error3.style.display = "none";
//         error3.innerHTML = "";
//     }

// }

// function passVAlidateChecking (e) {
//     const passval = passwordid.value;
//     const cpassavl = confirmPasswordid.value;
//     const passwordpattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/

//     if(passval.trim() === ""){
//         error4.style.display = 'block';
//         error4.innerHTML = "Please fill the field";
//     }
//     else if(!passval.test(passwordpattern)){
//         error4.style.display = "block";
//         error4.innerHTML = "The password should conatin 8 characters at least one upper case,lowercase letter,one digit and one spaecial character";
//     }
//     else {
//         error4.style.display = "none";
//         error4.innerHTML = "";
//     }

//     if(passval !== cpassavl){
//         error5.style.display = "block";
//         error5.innerHTML = "Passwordd do not match";
//     }
//     else {
//         error5.style.display = 'none';
//         error5.innerHTML = ""
//     }

// }


// document.addEventListener("DOMContentLoaded",()=>{
//     signupform.addEventListener("submit",(e)=>{

//         nameValidateChecking();
//         emailVAlidateChecking();
//         phoneValidateChecking();
//         passVAlidateChecking();

//         if(
//             !nameid ||
//             !emailid ||
//             !phoneid ||
//             !passwordid ||
//             !error1 ||
//             !error2 ||
//             !error3 ||
//             !error4 ||
//             !error5 ||
//             !signupform
//         ){
//             console.error("One or more elements not found");
//         }

//         if(
//             error1.innerHTML || 
//             error2.innerHTML ||
//             error3.innerHTML ||
//             error4.innerHTML ||
//             error5.innerHTML 
//         ){
//             e.preventDefault();
//         }
        
//     })
// })