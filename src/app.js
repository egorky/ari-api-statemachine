require("dotenv").config(); // Ensure .env is loaded at the very top
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const csurf = require("csurf");

const apiRoutes = require("./routes/api");
const webRoutes = require("./routes/web"); // Import web routes

const app = express();

// --- Web Interface Configuration ---
if (process.env.DISABLE_WEB_UI !== "true") {
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));

    app.use(express.static(path.join(__dirname, "../public")));

    // Body parser for web forms (URL-encoded)
    app.use(express.urlencoded({ extended: false })); // For parsing application/x-www-form-urlencoded

    app.use(session({
        secret: process.env.SESSION_SECRET || "defaultfallbacksecret", // Fallback only for dev if not set
        resave: false,
        saveUninitialized: false, // Set to true if you want to store session for non-logged-in users (e.g. for flash messages before login)
                                  // For this setup, false is fine as flash is mainly post-login or on login page itself.
        cookie: {
            secure: process.env.NODE_ENV === "production", // Use secure cookies in production
            httpOnly: true
        }
    }));

    app.use(csurf()); // CSRF protection. Must be after session and body/cookie parsers.

    // Web routes
    app.use("/", webRoutes);

} else {
    console.log("Web UI is disabled via DISABLE_WEB_UI flag in .env");
}

// --- API Configuration (always enabled) ---
app.use(bodyParser.json()); // For parsing application/json (API)
app.use("/api", apiRoutes); // API routes

// --- Root route if web UI is disabled ---
if (process.env.DISABLE_WEB_UI === "true") {
    app.get("/", (req, res) => {
        res.send("State Machine API is running. Web UI is disabled.");
    });
}

// --- Global Error Handlers ---
// CSRF error handler
app.use((err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
        console.warn("CSRF token validation failed for request:", req.path);
        // Handle CSRF token errors here. This may happen if the userform is submitted
        // after session expiry or if the token is missing/tampered.
        // For web routes, you might want to redirect to login or show an error page.
        if (req.accepts("html")) { // Check if the request expects HTML
             if (req.session) req.session.flash = { error: ["Invalid form submission. Please try again."] };
             return res.redirect(req.path || "/"); // Redirect to the same page or a safe default
        }
        // For API requests, this should ideally not happen if APIs are stateless / token-based
        return res.status(403).json({ error: "Invalid or missing CSRF token." });
    }
    next(err);
});

// General error handler (must be last)
app.use((err, req, res, next) => {
    console.error("Global error handler caught:", err.stack);
    if (res.headersSent) {
        return next(err);
    }
    // For web routes
    if (req.accepts("html") && process.env.DISABLE_WEB_UI !== "true") {
        if (req.session) req.session.flash = { error: ["An unexpected server error occurred."] };
        return res.redirect(req.originalUrl || "/"); // Redirect to current page or home
    }
    // For API or if web UI is disabled
    res.status(500).json({ error: "Something broke on the server!"});
});


module.exports = app;
