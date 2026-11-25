// Client-side behaviour of the login form.
// Mirrors the expectations from mock-tms/test-cases.json (TC-01..TC-11).

const form = document.querySelector('[data-testid="login-form"]');
const loginInput = document.querySelector('[data-testid="login-input"]');
const passwordInput = document.querySelector('[data-testid="password-input"]');
const loginError = document.querySelector('[data-testid="login-error"]');
const passwordError = document.querySelector('[data-testid="password-error"]');
const formError = document.querySelector('[data-testid="form-error"]');

const returnUrl = new URLSearchParams(window.location.search).get("returnUrl") || "";

function showFieldError(el, input, message) {
  el.textContent = message;
  el.hidden = false;
  input.setAttribute("aria-invalid", "true");
}

function clearErrors() {
  for (const [el, input] of [
    [loginError, loginInput],
    [passwordError, passwordInput],
  ]) {
    el.textContent = "";
    el.hidden = true;
    input.removeAttribute("aria-invalid");
  }
  formError.textContent = "";
  formError.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const login = loginInput.value.trim();
  const password = passwordInput.value;

  // TC-04 / TC-05: empty fields are validated on the client,
  // no request is sent, and focus moves to the first invalid field.
  let firstInvalid = null;
  if (!login) {
    showFieldError(loginError, loginInput, "Введите логин");
    firstInvalid = firstInvalid ?? loginInput;
  }
  if (!password) {
    showFieldError(passwordError, passwordInput, "Введите пароль");
    firstInvalid = firstInvalid ?? passwordInput;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  let response;
  try {
    response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password, returnUrl }),
    });
  } catch {
    formError.textContent = "Ошибка сети. Попробуйте ещё раз";
    formError.hidden = false;
    passwordInput.focus();
    return;
  }

  const data = await response.json();

  if (data.ok) {
    // TC-01: main page by default; TC-02: the originally requested protected page.
    window.location.assign(data.redirectUrl);
    return;
  }

  // TC-06 / TC-07 / TC-08 / TC-09: message above the submit button,
  // login is preserved, password is cleared, focus moves to the password field.
  formError.textContent = data.message;
  formError.hidden = false;
  passwordInput.value = "";
  passwordInput.focus();
});
