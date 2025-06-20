const express = require("express");
const stateMachineManager = require("../services/stateMachineManager");

const router = express.Router();

const authenticateToken = (req, res, next) => {
    if (!process.env.API_TOKEN || process.env.API_TOKEN === "YOUR_STRONG_API_TOKEN_HERE" || process.env.API_TOKEN === "SERVER_TOKEN_MISSING") {
        console.error("CRITICAL: API_TOKEN is not configured or is using a placeholder value. API will not be secure.");
        return res.status(500).json({ error: "API authentication is not configured properly on the server." });
    }
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    console.log(`authenticateToken: Received token - '${token}', Expected token - '${process.env.API_TOKEN}'`);
    if (token == null) return res.status(401).json({ error: "Null token" });
    if (token !== process.env.API_TOKEN) return res.status(403).json({ error: "Invalid token" });
    next();
};

router.post("/fsm/:machineId/transition", authenticateToken, async (req, res) => { // Added async here
    const { machineId } = req.params;
    const { transitionName, currentState, eventPayload, initialData } = req.body;

    if (!transitionName || !currentState) {
        return res.status(400).json({ error: "transitionName and currentState are required." });
    }

    try {
        const fsm = stateMachineManager.getStateMachine(machineId, initialData || {});
        fsm.state = currentState;

        if (!fsm.can(transitionName)) {
            return res.status(400).json({
                error: `Transition "${transitionName}" is not possible from state "${fsm.state}".`,
                currentState: fsm.state,
                possibleTransitions: fsm.transitions()
            });
        }

        // Execute the transition and await if it returns a Promise
        // The actual arguments to the transition method (e.g., onStart) will be (lifecycle, eventPayload)
        // Lifecycle methods are bound with (lifecycle, eventPayload, fsm, makeExternalApiCall, axios)
        // The transition function itself (e.g., fsm.start()) can take arguments.
        // JSM passes these arguments to the on<TransitionName> method after the lifecycle object.

        // The \`javascript-state-machine\` handles promises returned by lifecycle events internally.
        // The transition method (e.g., fsm.melt()) itself becomes thenable if any of its
        // lifecycle events (onLeaveState, onTransition, onEnterState, on<TRANSITION>) return a promise.
        await fsm[transitionName](eventPayload); // Pass eventPayload, JSM handles promise chaining

        res.json({
            machineId: machineId,
            newState: fsm.state,
            possibleTransitions: fsm.transitions(),
            message: `Transition "${transitionName}" successful.`
        });

    } catch (error) {
        console.error(`Error in FSM transition for ${machineId}:`, error);
        // Check if error is from an external API call made via makeExternalApiCall
        if (error.message && error.message.startsWith("External API call")) {
             res.status(502).json({ error: `FSM transition failed due to external API error: ${error.message}` });
        } else if (error.message.includes("not found")) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes("is not a function") || error.message.includes("not a function")) {
             res.status(500).json({ error: `Lifecycle method error or transition method ${transitionName} not found/defined correctly. Details: ${error.message}` });
        } else if (error.message.includes("pending transition")) {
            res.status(500).json({ error: `Transition error: ${error.message}. A previous async transition might not have resolved.`});
        }
        else {
            res.status(500).json({ error: `Failed to process transition: ${error.message}` });
        }
    }
});

router.get("/fsm", authenticateToken, (req, res) => {
    const fs = require("fs");
    const path = require("path");
    const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
    try {
        const files = fs.readdirSync(fsmDefinitionsDir);
        const fsmIds = files
            .filter(file => path.extname(file) === ".json")
            .map(file => path.basename(file, ".json"));
        res.json({ availableFsms: fsmIds });
    } catch (error) {
        console.error("Error listing FSMs:", error);
        res.status(500).json({ error: "Could not retrieve FSM list." });
    }
});

// New route to get FSM .dot representation
const visualize = require("javascript-state-machine/lib/visualize"); // Import visualize
const fs = require("fs"); // Make sure fs is available
const path = require("path"); // Make sure path is available

router.get("/fsm/:machineId/dot", authenticateToken, (req, res) => {
    const { machineId } = req.params;
    try {
        // Get the raw definition, as visualize works on the config object
        // We need to ensure the stateMachineManager can provide this or re-load it
        // For now, assume we can get the definition object.
        // Let's refine stateMachineManager to expose raw definitions if needed,
        // or reconstruct a suitable object for visualize.

        // Temporarily, let's re-read the definition file for simplicity here.
        // A better approach would be to get it from stateMachineManager.loadedMachines
        const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
        const filePath = path.join(fsmDefinitionsDir, machineId + ".json");

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "FSM definition file not found." });
        }
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const definition = JSON.parse(fileContent);

        // javascript-state-machine's visualize function expects a StateMachine instance or a factory.
        // It can also work with a configuration object that looks like what StateMachine constructor takes.
        // Let's ensure our definition is suitable or adapt it.
        // The 'visualize' function might not need methods to be actual functions, just the structure.

        // Create a temporary FSM instance just for visualization, so we don't need to parse methods.
        // The visualize function primarily cares about init, transitions, states.
        const vizObject = {
            initial: definition.initial, // JSM uses 'init' in constructor, but visualize might be flexible
            init: definition.initial, // Add 'init' as well, as per JSM constructor
            transitions: definition.transitions || []
            // We don't need methods, data, etc. for basic visualization of states and transitions
        };

        // Add states if they are explicitly defined (though visualize can infer them from transitions)
        if (definition.states) {
            vizObject.states = definition.states;
        }


        // Generate the .dot string
        // The second argument to visualize can be options like { name: machineId, orientation: horizontal }
        const dotString = visualize(vizObject, { name: machineId });

        res.type("text/vnd.graphviz").send(dotString);

    } catch (error) {
        console.error(`Error generating .dot for ${machineId}:`, error);
        res.status(500).json({ error: `Failed to generate .dot representation: ${error.message}` });
    }
});

// --- FSM Definition Modification Endpoints (for Web Editor) ---

// GET FSM JSON definition
router.get("/fsm/:machineId/definition", authenticateToken, (req, res) => {
    const { machineId } = req.params;
    const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
    const filePath = path.join(fsmDefinitionsDir, machineId + ".json");

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "FSM definition file not found." });
    }
    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const definition = JSON.parse(fileContent);
        res.json(definition);
    } catch (error) {
        console.error(`Error reading FSM definition ${machineId}:`, error);
        res.status(500).json({ error: `Failed to read FSM definition: ${error.message}` });
    }
});

// POST to add a new state
router.post("/fsm/:machineId/state", authenticateToken, async (req, res) => {
    const { machineId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'State name is required and must be a non-empty string.' });
    }

    const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
    const filePath = path.join(fsmDefinitionsDir, machineId + ".json");

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'FSM definition file not found.' });
    }

    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        let definition = JSON.parse(fileContent);

        // Ensure 'states' array exists
        if (!definition.states) {
            definition.states = [];
        }
        // Check if state already exists by name
        const stateExists = definition.states.some(s => (typeof s === 'string' && s === name) || (typeof s === 'object' && s.name === name));
        if (stateExists) {
             return res.status(400).json({ error: `State '${name}' already exists.`});
        }
        definition.states.push({ name: name }); // Store as object for potential future properties

        fs.writeFileSync(filePath, JSON.stringify(definition, null, 2), "utf-8");
        // stateMachineManager should be available if this script is run in the same context as previous ones
        // If stateMachineManager is not defined here, it means it's not being passed into this bash session context.
        // Assuming stateMachineManager is loaded in the main app context and handles reloads.
        // For direct feedback, we might need to call a manager function if available globally or via another API.
        // The provided stateMachineManager.js does have reloadMachineDefinition.
        // However, direct calls to it from here are tricky. The app's instance of it should be used.
        // For now, we rely on the fact that subsequent calls to getStateMachine might reload.
        // A better way: stateMachineManager.reloadMachineDefinition(machineId); (if manager is accessible)
        // This was added to the stateMachineManager module in a previous step.
        // We need to ensure stateMachineManager is required in this file if not already.
        if (typeof stateMachineManager !== 'undefined' && stateMachineManager.reloadMachineDefinition) {
             stateMachineManager.reloadMachineDefinition(machineId); // Update cache
        } else {
             console.warn("stateMachineManager or reloadMachineDefinition not available in this context for immediate reload - check if this warning is still needed.");
        }

        res.json({ message: `State '${name}' added. Reload FSM or definition to see changes in some contexts.`, currentDefinition: definition });

    } catch (error) {
        console.error(`Error adding state to ${machineId}:`, error);
        res.status(500).json({ error: `Failed to add state: ${error.message}` });
    }
});

// POST to add a new transition definition
router.post("/fsm/:machineId/transition_def", authenticateToken, async (req, res) => {
    const { machineId } = req.params;
    const { name, from, to } = req.body;

    if (!name || !from || !to) {
        return res.status(400).json({ error: 'Transition name, fromState, and toState are required.' });
    }

    const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
    const filePath = path.join(fsmDefinitionsDir, machineId + ".json");

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'FSM definition file not found.' });
    }

    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        let definition = JSON.parse(fileContent);

        if (!definition.transitions) {
            definition.transitions = [];
        }
        definition.transitions.push({ name, from, to });

        fs.writeFileSync(filePath, JSON.stringify(definition, null, 2), "utf-8");
        if (typeof stateMachineManager !== 'undefined' && stateMachineManager.reloadMachineDefinition) {
            stateMachineManager.reloadMachineDefinition(machineId);
        }  else {
             console.warn("stateMachineManager or reloadMachineDefinition not available in this context for immediate reload - check if this warning is still needed.");
        }
        res.json({ message: `Transition '${name}' from '${from}' to '${to}' added.`, currentDefinition: definition });

    } catch (error) {
        console.error(`Error adding transition to ${machineId}:`, error);
        res.status(500).json({ error: `Failed to add transition: ${error.message}` });
    }
});

// POST to set/change the initial state
router.post("/fsm/:machineId/initial", authenticateToken, async (req, res) => {
    const { machineId } = req.params;
    const { initial } = req.body;

    if (!initial) {
        return res.status(400).json({ error: 'New initial state name is required.' });
    }

    const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
    const filePath = path.join(fsmDefinitionsDir, machineId + ".json");

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'FSM definition file not found.' });
    }

    try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        let definition = JSON.parse(fileContent);
        definition.initial = initial;

        fs.writeFileSync(filePath, JSON.stringify(definition, null, 2), "utf-8");
         if (typeof stateMachineManager !== 'undefined' && stateMachineManager.reloadMachineDefinition) {
            stateMachineManager.reloadMachineDefinition(machineId);
        }  else {
             console.warn("stateMachineManager or reloadMachineDefinition not available in this context for immediate reload - check if this warning is still needed.");
        }
        res.json({ message: `Initial state set to '${initial}'.`, currentDefinition: definition });

    } catch (error) {
        console.error(`Error setting initial state for ${machineId}:`, error);
        res.status(500).json({ error: `Failed to set initial state: ${error.message}` });
    }
});

router.post("/fsm/:machineId/save_graphical_definition", authenticateToken, async (req, res) => {
    const { machineId } = req.params;
    const fsmDefinition = req.body; // Expecting the full FSM JSON definition

    if (!fsmDefinition || typeof fsmDefinition !== 'object') {
        return res.status(400).json({ error: "Invalid FSM definition payload." });
    }
    if (fsmDefinition.id !== machineId) {
        return res.status(400).json({ error: `FSM ID in definition ('${fsmDefinition.id}') must match URL parameter ('${machineId}').` });
    }

    try {
        // Convert the pretty JSON string for saving
        const definitionString = JSON.stringify(fsmDefinition, null, 2);
        stateMachineManager.saveFsmDefinition(machineId, definitionString);
        stateMachineManager.reloadMachineDefinition(machineId); // Ensure it is loaded into cache

        res.json({ message: `FSM "${machineId}" saved successfully from graphical editor.` });
    } catch (error) {
        console.error(`Error saving FSM ${machineId} from graphical editor:`, error);
        res.status(500).json({ error: `Failed to save FSM: ${error.message}` });
    }
});

module.exports = router;
