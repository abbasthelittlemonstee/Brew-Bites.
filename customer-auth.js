(() => {
    const SESSION_KEY = "brewBitesCustomerSession";
    const dialog = document.getElementById("account-dialog");
    const accountButton = document.getElementById("account-button");
    const accountGreeting = document.getElementById("account-greeting");
    const signOutButton = document.getElementById("account-signout");
    const accountStatus = document.getElementById("account-status");
    const signInForm = document.getElementById("sign-in-form");
    const signUpForm = document.getElementById("sign-up-form");
    const recoveryForm = document.getElementById("customer-recovery-form");
    const newPasswordForm = document.getElementById("customer-new-password-form");
    const accountTabs = document.getElementById("account-tabs");
    const orderForm = document.getElementById("order-form");

    let config = null;
    let session = null;
    let user = null;
    let recoveryAccessToken = null;
    let authReady = false;

    function setStatus(message, isError = false) {
        accountStatus.textContent = message;
        accountStatus.classList.toggle("error", isError);
    }

    function showForm(form) {
        for (const candidate of [signInForm, signUpForm, recoveryForm, newPasswordForm]) {
            candidate.hidden = candidate !== form;
        }
        accountTabs.hidden = form === recoveryForm || form === newPasswordForm;
        if (form === signInForm) {
            document.getElementById("sign-in-tab").classList.add("is-active");
            document.getElementById("sign-in-tab").setAttribute("aria-selected", "true");
            document.getElementById("sign-up-tab").classList.remove("is-active");
            document.getElementById("sign-up-tab").setAttribute("aria-selected", "false");
        } else if (form === signUpForm) {
            document.getElementById("sign-up-tab").classList.add("is-active");
            document.getElementById("sign-up-tab").setAttribute("aria-selected", "true");
            document.getElementById("sign-in-tab").classList.remove("is-active");
            document.getElementById("sign-in-tab").setAttribute("aria-selected", "false");
        }
        setStatus("");
    }

    function openAccount(mode = "signin", message = "") {
        if (!dialog.open) dialog.showModal();
        showForm(mode === "signup" ? signUpForm : signInForm);
        if (message) setStatus(message);
    }

    function displayName(account) {
        const fullName = account?.user_metadata?.full_name?.trim();
        if (fullName) return fullName.split(/\s+/)[0];
        return account?.email?.split("@")[0] || "there";
    }

    function updateAccountUI() {
        const signedIn = Boolean(user && session?.access_token);
        accountButton.hidden = signedIn;
        accountGreeting.hidden = !signedIn;
        signOutButton.hidden = !signedIn;
        if (signedIn) {
            accountGreeting.textContent = `Hello, ${displayName(user)}`;
            const orderName = document.getElementById("customer-name");
            if (!orderName.value.trim() && user.user_metadata?.full_name) {
                orderName.value = user.user_metadata.full_name;
            }
        } else {
            accountGreeting.textContent = "";
        }
    }

    function readSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        } catch {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    }

    function storeSession(authData) {
        if (!authData?.access_token || !authData?.refresh_token) return false;
        const expiresAt = authData.expires_at || Math.floor(Date.now() / 1000) + (authData.expires_in || 3600);
        session = {
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_at: expiresAt
        };
        if (authData.user) user = authData.user;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        updateAccountUI();
        return true;
    }

    function clearSession() {
        session = null;
        user = null;
        recoveryAccessToken = null;
        localStorage.removeItem(SESSION_KEY);
        updateAccountUI();
    }

    async function authRequest(path, options = {}) {
        if (!config) throw new Error("Account services are not available yet. Please try again shortly.");
        const headers = {
            apikey: config.publishableKey,
            ...(options.headers || {})
        };
        if (options.body !== undefined) headers["content-type"] = "application/json";
        const response = await fetch(`${config.url}/auth/v1/${path}`, {
            ...options,
            headers,
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errorCode = data.error_code || data.code;
            if (errorCode === "email_address_not_authorized") {
                throw new Error("Email delivery is limited to project team addresses right now. Customer confirmation emails need a custom email provider configured.");
            }
            if (errorCode === "over_email_send_rate_limit") {
                throw new Error("The confirmation email limit has been reached. Please wait a little and try again.");
            }
            throw new Error(data.msg || data.message || data.error_description || "The account request could not be completed.");
        }
        return data;
    }

    async function refreshSession() {
        if (!session?.refresh_token) return false;
        try {
            const refreshed = await authRequest("token?grant_type=refresh_token", {
                method: "POST",
                body: JSON.stringify({ refresh_token: session.refresh_token })
            });
            return storeSession(refreshed);
        } catch {
            clearSession();
            return false;
        }
    }

    async function getAccessToken() {
        if (!authReady || !session?.access_token) return null;
        const expiringSoon = !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60;
        if (expiringSoon && !await refreshSession()) return null;
        return session?.access_token || null;
    }

    async function loadSignedInUser() {
        const token = await getAccessToken();
        if (!token) return false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                user = await authRequest("user", {
                    method: "GET",
                    headers: { authorization: `Bearer ${session.access_token}` }
                });
                updateAccountUI();
                return true;
            } catch {
                if (attempt === 1 || !await refreshSession()) return false;
            }
        }
        return false;
    }

    function clearUrlHash() {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    async function handleAuthRedirect() {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const errorDescription = params.get("error_description") || params.get("error");
        const tokenType = params.get("type");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (errorDescription) {
            clearUrlHash();
            openAccount("signin", errorDescription.replaceAll("+", " "));
            return;
        }
        if (tokenType === "recovery" && accessToken) {
            recoveryAccessToken = accessToken;
            clearUrlHash();
            if (!dialog.open) dialog.showModal();
            showForm(newPasswordForm);
            setStatus("Choose a new password for your account.");
            return;
        }
        if (accessToken && refreshToken) {
            clearUrlHash();
            storeSession({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: Number(params.get("expires_in")) || 3600
            });
            const loaded = await loadSignedInUser();
            if (tokenType === "signup") {
                if (loaded) {
                    setStatus(`Welcome, ${displayName(user)}! Your account is ready.`);
                    if (dialog.open) window.setTimeout(() => dialog.close(), 2200);
                } else {
                    clearSession();
                    openAccount("signin", "Your email is confirmed. Please sign in to continue.");
                }
            }
        }
    }

    document.getElementById("close-account-dialog").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    accountButton.addEventListener("click", () => openAccount("signin"));
    document.getElementById("sign-in-tab").addEventListener("click", () => showForm(signInForm));
    document.getElementById("sign-up-tab").addEventListener("click", () => showForm(signUpForm));

    document.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const passwordInput = document.getElementById(toggle.dataset.passwordToggle);
            const showPassword = passwordInput.type === "password";
            passwordInput.type = showPassword ? "text" : "password";
            toggle.textContent = showPassword ? "Hide" : "Show";
            toggle.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} password`);
            toggle.setAttribute("aria-pressed", String(showPassword));
        });
    });

    document.getElementById("forgot-customer-password").addEventListener("click", () => {
        document.getElementById("recovery-email").value = document.getElementById("sign-in-email").value.trim();
        showForm(recoveryForm);
    });
    document.getElementById("back-to-account").addEventListener("click", () => showForm(signInForm));

    signUpForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("sign-up-submit");
        button.disabled = true;
        setStatus("Creating your account…");
        try {
            const result = await authRequest("signup", {
                method: "POST",
                body: JSON.stringify({
                    email: document.getElementById("sign-up-email").value.trim(),
                    password: document.getElementById("sign-up-password").value,
                    data: { full_name: document.getElementById("sign-up-name").value.trim() }
                })
            });
            if (storeSession(result)) {
                if (!await loadSignedInUser()) {
                    clearSession();
                    throw new Error("Your account was created, but we couldn’t sign you in. Please sign in to continue.");
                }
                setStatus(`Welcome, ${displayName(user)}! Your account is ready.`);
                window.setTimeout(() => dialog.close(), 1800);
            } else {
                setStatus("Request received. Check your inbox and Spam folder. If you’ve signed up before, use Sign in or Forgot password. If a new account gets no email, customer confirmation delivery still needs to be enabled.");
            }
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    signInForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("sign-in-submit");
        button.disabled = true;
        setStatus("Signing in…");
        try {
            const result = await authRequest("token?grant_type=password", {
                method: "POST",
                body: JSON.stringify({
                    email: document.getElementById("sign-in-email").value.trim(),
                    password: document.getElementById("sign-in-password").value
                })
            });
            storeSession(result);
            if (!await loadSignedInUser()) {
                clearSession();
                throw new Error("We couldn’t finish signing you in. Please try again.");
            }
            setStatus(`Welcome back, ${displayName(user)}!`);
            window.setTimeout(() => dialog.close(), 1400);
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    recoveryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("recovery-submit");
        button.disabled = true;
        setStatus("Sending a password reset link…");
        try {
            await authRequest("recover", {
                method: "POST",
                body: JSON.stringify({ email: document.getElementById("recovery-email").value.trim() })
            });
            setStatus("If an account exists for that email, a reset link has been sent.");
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    newPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("customer-save-password");
        const password = document.getElementById("customer-new-password").value;
        const confirmation = document.getElementById("customer-confirm-password").value;
        if (password !== confirmation) {
            setStatus("The passwords do not match.", true);
            return;
        }
        if (!config || !recoveryAccessToken) {
            setStatus("This reset link is invalid or has expired. Request a new one.", true);
            return;
        }

        button.disabled = true;
        setStatus("Saving your new password…");
        try {
            await authRequest("user", {
                method: "PUT",
                headers: { authorization: `Bearer ${recoveryAccessToken}` },
                body: JSON.stringify({ password })
            });
            recoveryAccessToken = null;
            newPasswordForm.reset();
            showForm(signInForm);
            setStatus("Password updated. Sign in with your new password.");
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    signOutButton.addEventListener("click", async () => {
        const token = session?.access_token;
        if (token && config) {
            try {
                await authRequest("logout", { method: "POST", headers: { authorization: `Bearer ${token}` } });
            } catch {
                // Clear the local session even if the network sign-out request fails.
            }
        }
        clearSession();
    });

    orderForm.addEventListener("submit", (event) => {
        if (user && session?.access_token) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        document.getElementById("order-status").textContent = "Sign in or create a free account before placing your order.";
        openAccount("signup");
    }, true);

    window.brewBitesCustomerAuth = {
        getAccessToken,
        openAccount: (mode = "signin") => openAccount(mode)
    };

    (async function initializeCustomerAccount() {
        updateAccountUI();
        try {
            const response = await fetch("/.netlify/functions/admin-config", { cache: "no-store" });
            config = await response.json();
            if (!response.ok) throw new Error(config.error || "Account services are unavailable.");

            authReady = true;
            await handleAuthRedirect();
            if (!recoveryAccessToken) {
                session = readSession();
                await loadSignedInUser();
            }
        } catch (error) {
            if (window.location.hash.includes("error=")) {
                clearUrlHash();
                openAccount("signin", "The email link could not be completed. Request a fresh link and try again.");
            } else {
                setStatus(error.message, true);
            }
        } finally {
            authReady = true;
        }
    })();
})();
