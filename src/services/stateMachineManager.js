const fs = require("fs");
const path = require("path");
const StateMachine = require("javascript-state-machine");
const axios = require("axios");

const fsmDefinitionsDir = path.join(__dirname, "../../fsm_definitions");
let loadedMachines = {}; // Cache for loaded machine configurations

// Function to load all FSM definitions from the directory
function loadAllMachineDefinitions() {
    loadedMachines = {}; // Clear cache before reloading
    try {
        if (!fs.existsSync(fsmDefinitionsDir)) {
            fs.mkdirSync(fsmDefinitionsDir, { recursive: true });
            console.log(`Created fsm_definitions directory as it did not exist.`);
        }
        const files = fs.readdirSync(fsmDefinitionsDir);
        files.forEach(file => {
            if (path.extname(file) === ".json") {
                const filePath = path.join(fsmDefinitionsDir, file);
                try {
                    const fileContent = fs.readFileSync(filePath, "utf-8");
                    const definition = JSON.parse(fileContent);
                    if (definition.id) {
                        if (path.basename(file, ".json") !== definition.id) {
                             console.warn(`Warning: FSM ID "${definition.id}" in file ${file} does not match filename. Using filename as ID for management.`);
                        }
                        // Use filename (without .json) as the key for consistency in management
                        loadedMachines[path.basename(file, ".json")] = definition;
                        console.log(`Loaded FSM definition: ${definition.id} (from file ${file})`);
                    } else {
                        console.warn(`FSM definition in ${file} is missing an id.`);
                    }
                } catch (parseError) {
                    console.error(`Error parsing JSON from ${file}: ${parseError.message}`);
                }
            }
        });
    } catch (error) {
        console.error("Error loading FSM definitions:", error);
    }
}

loadAllMachineDefinitions(); // Load on startup

function getStateMachine(machineId, initialStateData = {}, ariOps = {}) {
    // Ensure definitions are fresh if files could have changed
    // For a more robust system, consider watching files or having a dedicated refresh mechanism
    // loadAllMachineDefinitions(); // Or rely on explicit reload via UI/API

    const definition = loadedMachines[machineId];
    if (!definition) {
        // Attempt a targeted reload if not in cache, might have been added recently
        if (reloadMachineDefinition(machineId)) {
            const reloadedDefinition = loadedMachines[machineId];
            if (!reloadedDefinition) throw new Error(`State machine with id "${machineId}" not found even after reload attempt.`);
            return createStateMachineInstance(reloadedDefinition, machineId, initialStateData, ariOps);
        }
        throw new Error(`State machine with id "${machineId}" not found.`);
    }
    return createStateMachineInstance(definition, machineId, initialStateData, ariOps);
}

function createStateMachineInstance(definition, machineId, initialStateData = {}, ariOps = {}) {
    const machineConfig = JSON.parse(JSON.stringify(definition));
    const { doAriAction } = ariOps; // Expect doAriAction to be passed in

    if (machineConfig.methods) {
        for (const methodName in machineConfig.methods) {
            if (typeof machineConfig.methods[methodName] === "string") {
                try {
                    // Inject makeExternalApiCall, axios, and doAriAction
                    // IMPORTANT: Dynamically creating functions from strings using new Function().
                    // This is powerful for defining FSM methods in JSON but carries security implications
                    // if the JSON source is not trusted. Ensure FSM definitions are from secure sources.
                    // Injected arguments: lifecycle, eventPayload, fsm instance, makeExternalApiCall helper, axios instance, doAriAction helper.
                    machineConfig.methods[methodName] = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + machineConfig.methods[methodName] + ").apply(fsm, arguments);");
                } catch (e) {
                    console.error(`Error parsing method ${methodName} for FSM ${machineId}: ${e}`);
                }
            }
        }
    }

    const fsm = new StateMachine({
      ...machineConfig,
      data: initialStateData, // JSM specific way to add custom data
      observeUnchangedState: true
    });

    if (machineConfig.externalApis) {
        fsm.externalApis = machineConfig.externalApis;
    }
    if (machineConfig.ariActions) { // For FSMs to define what ARI actions they might use
        fsm.ariActions = machineConfig.ariActions;
    }
    fsm.id = definition.id;
    // Make doAriAction available within the FSM instance if needed directly
    if (doAriAction) fsm.doAriAction = doAriAction;

    Object.assign(fsm, initialStateData); // Mix in initial data (like channelId)
    return fsm;
}
async function makeExternalApiCall(apiCallName, fsmInstance, eventPayload) {
    const apiConfig = fsmInstance.externalApis && fsmInstance.externalApis[apiCallName];
    if (!apiConfig) {
        console.error(`API call configuration "${apiCallName}" not found in FSM "${fsmInstance.id}".`);
        throw new Error(`API call configuration "${apiCallName}" not found.`);
    }
    let url = apiConfig.url;
    let data = apiConfig.body;
    let headers = apiConfig.headers || {};
    const replacePlaceholders = (templateString) => {
        if (typeof templateString !== "string") return templateString;
        return templateString.replace(/\{\{(fsm|payload)\.(.+?)\}\}/g, (match, source, key) => {
            if (source === "fsm") return fsmInstance[key] !== undefined ? fsmInstance[key] : match;
            if (source === "payload") return eventPayload && eventPayload[key] !== undefined ? eventPayload[key] : match;
            return match;
        });
    };
    if (typeof url === "string") url = replacePlaceholders(url);
    if (typeof data === "object" && data !== null) data = JSON.parse(replacePlaceholders(JSON.stringify(data)));
    else if (typeof data === "string") data = replacePlaceholders(data);

    console.log(`Making external API call "${apiCallName}": ${apiConfig.method} ${url}`);
    try {
        const response = await axios({
            method: apiConfig.method || "GET", url: url, data: data, headers: headers,
            timeout: apiConfig.timeout || 5000
        });
        console.log(`External API call "${apiCallName}" successful. Status: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`External API call "${apiCallName}" failed: ${error.message}`);
        if (error.response) {
            console.error("Error response data:", error.response.data);
        }
        throw new Error(`External API call ${apiCallName} failed: ${error.message}`);
    }
}

function reloadMachineDefinition(machineId) {
    const filePath = path.join(fsmDefinitionsDir, `${machineId}.json`);
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`File does not exist for reloading: ${filePath}`);
            delete loadedMachines[machineId]; // Remove from cache if file deleted
            return false;
        }
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const definition = JSON.parse(fileContent);
        // Use filename (machineId) as the key in loadedMachines
        loadedMachines[machineId] = definition;
        console.log(`Reloaded FSM definition: ${machineId} (from file ${machineId}.json)`);
        return true;
    } catch (error) {
        console.error(`Error reloading FSM definition ${machineId}:`, error);
        return false;
    }
}

// --- New functions for web UI ---
function listFsmDefinitionFiles() {
    try {
        if (!fs.existsSync(fsmDefinitionsDir)) {
            return [];
        }
        const files = fs.readdirSync(fsmDefinitionsDir);
        return files
            .filter(file => path.extname(file) === ".json")
            .map(file => path.basename(file, ".json"));
    } catch (error) {
        console.error("Error listing FSM definition files:", error);
        return [];
    }
}

function saveFsmDefinition(fileId, definitionContent) {
    const filePath = path.join(fsmDefinitionsDir, `${fileId}.json`);
    try {
        // Validate JSON content
        const definition = JSON.parse(definitionContent);
        if (!definition.id) {
            throw new Error("FSM definition must have an id property.");
        }
        // It is good practice if definition.id matches fileId, but not strictly enforced here for saving
        // The loader will warn if they dont match.

        fs.writeFileSync(filePath, definitionContent, "utf-8");
        console.log(`Saved FSM definition to ${filePath}`);
        // Update cache
        loadedMachines[fileId] = definition;
        return true;
    } catch (error) {
        console.error(`Error saving FSM definition ${fileId}:`, error);
        throw error; // Re-throw to be caught by route handler
    }
}

function deleteFsmDefinitionFile(fileId) {
    const filePath = path.join(fsmDefinitionsDir, `${fileId}.json`);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            delete loadedMachines[fileId]; // Remove from cache
            console.log(`Deleted FSM definition file: ${filePath}`);
            return true;
        }
        return false; // File not found
    } catch (error) {
        console.error(`Error deleting FSM definition file ${fileId}:`, error);
        throw error; // Re-throw
    }
}


module.exports = {
    getStateMachine,
    loadAllMachineDefinitions,
    reloadMachineDefinition,
    makeExternalApiCall,
    // For Web UI
    listFsmDefinitionFiles,
    saveFsmDefinition,
    deleteFsmDefinitionFile
};
