const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const stateMachineManager = require("../services/stateMachineManager");

const router = express.Router();

// Multer setup for file uploads
// Store temporarily in memory, then write to fsm_definitions
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 }, // 1MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== ".json") {
            return cb(new Error("Only .json files are allowed"), false);
        }
        cb(null, true);
    }
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.session.flash = { error: ["Please login to access this page."] };
    res.redirect("/login");
}

// Middleware to add csrfToken to locals
function addCsrfTokenToLocals(req, res, next) {
    res.locals.csrfToken = req.csrfToken();
    next();
}

router.use(addCsrfTokenToLocals); // Apply to all web routes

// Flash messages middleware
router.use((req, res, next) => {
    res.locals.messages = req.session.flash || {};
    res.locals.user = req.session.user;
    delete req.session.flash;
    next();
});

// --- Routes ---
router.get("/", (req, res) => {
    res.render("index", { title: "Home" });
});

router.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/dashboard");
    res.render("login", { title: "Login" });
});

router.post("/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.WEB_PASSWORD) {
        req.session.user = { loggedIn: true }; // Simple session user
        req.session.flash = { success: ["Logged in successfully!"] };
        res.redirect("/dashboard");
    } else {
        req.session.flash = { error: ["Incorrect password."] };
        res.redirect("/login");
    }
});

router.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            // How to handle this? Maybe just log and redirect.
        }
        res.redirect("/");
    });
});

router.get("/dashboard", isAuthenticated, (req, res) => {
    const fsms = stateMachineManager.listFsmDefinitionFiles();
    res.render("dashboard", { title: "Dashboard", fsms });
});

router.post("/fsm/upload", isAuthenticated, upload.single("fsmFile"), async (req, res) => {
    if (!req.file) {
        req.session.flash = { error: ["No file uploaded or invalid file type."] };
        return res.redirect("/dashboard");
    }

    const fileId = path.basename(req.file.originalname, ".json");
    const definitionContent = req.file.buffer.toString("utf8");

    try {
        // Validate JSON and ID presence before saving
        const definition = JSON.parse(definitionContent);
        if (!definition.id) {
             req.session.flash = { error: ["Uploaded FSM definition must have an id property."] };
             return res.redirect("/dashboard");
        }
        if (definition.id !== fileId) {
            req.session.flash = { error: [`FSM ID "${definition.id}" inside the file must match the filename "${fileId}".`] };
            return res.redirect("/dashboard");
        }

        stateMachineManager.saveFsmDefinition(fileId, definitionContent);
        stateMachineManager.reloadMachineDefinition(fileId); // Ensure it is loaded into cache
        req.session.flash = { success: [`FSM "${fileId}.json" uploaded successfully.`] };
    } catch (error) {
        console.error("Upload error:", error);
        req.session.flash = { error: [`Error uploading FSM: ${error.message}`] };
    }
    res.redirect("/dashboard");
});

router.post("/fsm/delete/:machineId", isAuthenticated, async (req, res) => {
    const { machineId } = req.params;
    try {
        if (stateMachineManager.deleteFsmDefinitionFile(machineId)) {
            req.session.flash = { success: [`FSM "${machineId}.json" deleted successfully.`] };
        } else {
            req.session.flash = { error: [`FSM "${machineId}.json" not found.`] };
        }
    } catch (error) {
        console.error("Delete error:", error);
        req.session.flash = { error: [`Error deleting FSM: ${error.message}`] };
    }
    res.redirect("/dashboard");
});

router.get("/fsm/edit/:machineId", isAuthenticated, (req, res) => {
    const { machineId } = req.params;
    // Check if FSM definition exists (optional, as editor page will try to load it)
    const fsmExists = stateMachineManager.listFsmDefinitionFiles().includes(machineId);
    if (!fsmExists) {
            req.session.flash = { error: [`FSM "${machineId}" not found.`] };
        return res.redirect("/dashboard");
    }
    // Pass API_TOKEN to the view - THIS IS A SECURITY RISK FOR PRODUCTION
    // In a real app, the /api/fsm/:machineId/dot endpoint should ideally use session-based auth
    // if called from an authenticated web session, or have a separate secure mechanism.
    // For this exercise, we acknowledge the risk.
    // Using res.locals to pass process to the template.
    // res.locals.process = process; // No longer passing entire process object
    res.render("edit-fsm", {
        title: "Edit FSM",
        fsmId: machineId,
        apiTokenForClient: process.env.API_TOKEN || "SERVER_TOKEN_MISSING" // Pass the API token directly
        // csrfToken is already available via middleware res.locals.csrfToken
    });
});

router.get("/fsm/edit-graphical/:machineId", isAuthenticated, (req, res) => {
    const { machineId } = req.params;
    const fsmExists = stateMachineManager.listFsmDefinitionFiles().includes(machineId);
    if (!fsmExists) {
        req.session.flash = { error: [`FSM "${machineId}" not found.`] };
        return res.redirect("/dashboard");
    }
    console.log(`[routes/web.js] Rendering edit-fsm-graphical for ${machineId}. API_TOKEN from process.env: '${process.env.API_TOKEN}'`);
    const tokenForClient = process.env.API_TOKEN || "SERVER_TOKEN_MISSING";
    console.log(`[routes/web.js] Value being passed as apiTokenForClient: '${tokenForClient}'`);
    res.render("edit-fsm-graphical", { // Render the new view
        title: "Edit FSM Graphically",
        fsmId: machineId,
        apiTokenForClient: tokenForClient // Use the variable here
        // csrfToken is available via res.locals.csrfToken by middleware
    });
});

// Error handler for multer (e.g. file too large)
// This should be defined only once. Removed the duplicate.
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        req.session.flash = { error: [`File upload error: ${err.message}`] };
        return res.redirect("/dashboard");
    } else if (err && err.message) { // Make sure err.message exists
        req.session.flash = { error: [`An unexpected error occurred: ${err.message}`] };
        return res.redirect(req.path || "/dashboard");
    } else if (err) { // Fallback for other kinds of errors
        req.session.flash = { error: ["An unexpected error occurred."] };
        return res.redirect(req.path || "/dashboard");
    }
    next();
});

module.exports = router;
