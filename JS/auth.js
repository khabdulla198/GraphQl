const SIGNIN_URL = "https://learn.reboot01.com/api/auth/signin";

//get html elements
const loginButton = document.getElementById("loginButton");
const identifierInput = document.getElementById("identifier");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const clickSound = document.getElementById("click-sound");

console.log("clickSound element:", clickSound);

//event listener for login
loginButton.addEventListener("click", (e) => {
  // play sound
  if (clickSound) {
    clickSound.currentTime = 0;
    clickSound.volume = 1;
    clickSound.muted = false;
    clickSound
      .play()
      .then(() => console.log("Sound played"))
      .catch((err) => console.error("Sound error:", err));
  } else {
    console.warn("clickSound is null");
  }

  setTimeout(() => {
  handleLogin(e);
}, 80); 
});


async function handleLogin() {
    loginError.textContent = "";

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value.trim();

    if (!identifier || !password) {
        loginError.textContent = "Please enter both identifier and password.";
        return;
    }

    //Basic Auth 
    const basicString = `${identifier}:${password}`;
    const basicBase64 = btoa(basicString);

    //send request
    try {
        const response = await fetch(SIGNIN_URL, {
            method: "POST",
            headers: {
                Authorization: `Basic ${basicBase64}`,
            },
        });

        if (!response.ok) {
            loginError.textContent = "Invalid credentials or network error";
            return;
        }

        const data = await response.json();

        let token;
        if (typeof data === "string") {
            token = data;
        } else if (data.token) {
            token = data.token;
        } else {
            loginError.textContent = "Could not find token in server response.";
            return;
        }

        //get token then open dashboard
        localStorage.setItem("jwt", token);
        window.location.href = "dashboard.html";


    } catch (err) {
        console.error(err);
        localStorage.setItem("errorMessage", "Login failed: " + err.message);
        window.location.href = "error.html";
    }
}