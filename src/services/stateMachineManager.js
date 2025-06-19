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

    // Helper to process actions (e.g., externalApi calls)
    const processAction = async (action, fsm, lifecycle, eventPayload) => {
        if (!action || !action.type) {
            console.warn("Skipping action due to missing type:", action);
            return;
        }
        if (action.type === 'externalApi') {
            if (!action.request) {
                console.error("External API action is missing 'request' configuration.");
                return; // Or throw error
            }
            try {
                const responseData = await makeExternalApiCall(action.request, fsm, eventPayload);
                if (action.storeResponseAs) {
                    fsm[action.storeResponseAs] = responseData;
                    console.log(`Stored API response in fsm.${action.storeResponseAs}`);
                }
                if (action.onSuccess && fsm.can(action.onSuccess)) {
                    console.log(`External API success, transitioning to ${action.onSuccess}`);
                    // Use a microtask to avoid issues if the transition also has actions
                    // that might interfere with the current execution context.
                    Promise.resolve().then(() => fsm[action.onSuccess]({ apiResponse: responseData }));
                }
                return responseData;
            } catch (error) {
                console.error('External API action failed:', error.message);
                if (action.onFailure && fsm.can(action.onFailure)) {
                    console.log(`External API failure, transitioning to ${action.onFailure}`);
                    Promise.resolve().then(() => fsm[action.onFailure]({ apiError: error.message }));
                }
                // Decide if this error should halt further execution or be re-thrown
                // For now, let's re-throw to make it visible to the FSM's error handling if any
                throw error;
            }
        }
        // Add other action types here if any (e.g., type: "log", type: "emitEvent")
    };

    machineConfig.methods = machineConfig.methods || {};

    // Wrap transition lifecycle methods (on<TransitionName>)
    if (machineConfig.transitions && Array.isArray(machineConfig.transitions)) {
        machineConfig.transitions.forEach(transition => {
            const originalMethodName = "on" + transition.name.charAt(0).toUpperCase() + transition.name.slice(1);
            const originalMethod = machineConfig.methods[originalMethodName]; // Could be string or already a function

            if (transition.action || (transition.actions && Array.isArray(transition.actions))) {
                machineConfig.methods[originalMethodName] = async function(lifecycle, eventPayload) { // `this` is the fsm
                    const actions = transition.actions || [transition.action];
                    for (const action of actions) {
                        await processAction(action, this, lifecycle, eventPayload);
                    }
                    // Execute original string-defined method if it exists
                    if (typeof originalMethod === 'string') {
                        const func = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + originalMethod + ").apply(fsm, arguments);");
                        return await func.call(this, lifecycle, eventPayload, this, makeExternalApiCall, axios, this.doAriAction);
                    } else if (typeof originalMethod === 'function') {
                        // If originalMethod was already a function (e.g. from a previous wrapping or direct definition)
                        return await originalMethod.apply(this, arguments);
                    }
                };
            } else if (typeof originalMethod === 'string') {
                // Ensure even non-action methods get the proper scope if they are strings
                 machineConfig.methods[originalMethodName] = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + originalMethod + ").apply(fsm, arguments);");
            }
        });
    }

    // Wrap state lifecycle methods (onEntry, onExit) - JSM uses onEnter<State>/onLeave<State>
    if (machineConfig.states) {
        for (const stateName in machineConfig.states) {
            const stateConfig = machineConfig.states[stateName];
            ['onEntry', 'onExit'].forEach(hookType => {
                const jsmHookName = (hookType === 'onEntry' ? 'onEnter' : 'onLeave') + stateName.charAt(0).toUpperCase() + stateName.slice(1);
                const originalMethod = machineConfig.methods[jsmHookName]; // Could be string or already a function

                if (stateConfig[hookType] && (typeof stateConfig[hookType] === 'object' || (Array.isArray(stateConfig[hookType]) && stateConfig[hookType].length > 0))) {
                    const actions = Array.isArray(stateConfig[hookType]) ? stateConfig[hookType] : [stateConfig[hookType]];

                    machineConfig.methods[jsmHookName] = async function(lifecycle, eventPayload) { // `this` is the fsm
                        for (const action of actions) {
                            await processAction(action, this, lifecycle, eventPayload);
                        }
                        // After actions, call original method if it existed as a string
                        if (typeof originalMethod === 'string') {
                             const func = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + originalMethod + ").apply(fsm, arguments);");
                             return await func.call(this, lifecycle, eventPayload, this, makeExternalApiCall, axios, this.doAriAction);
                        } else if (typeof originalMethod === 'function') {
                            return await originalMethod.apply(this, arguments);
                        }
                    };
                    // Remove the action array from stateConfig as it's now part of methods
                    delete stateConfig[hookType];
                } else if (typeof originalMethod === 'string') {
                    // Ensure even non-action methods get the proper scope if they are strings
                    machineConfig.methods[jsmHookName] = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + originalMethod + ").apply(fsm, arguments);");
                }
            });
        }
    }

    // Ensure all other string-defined methods also get the proper scope
    // This loop is now partly redundant due to above specific wrappings but acts as a catch-all.
    if (machineConfig.methods) {
        for (const methodName in machineConfig.methods) {
            if (typeof machineConfig.methods[methodName] === 'string' && !methodName.match(/^(onEnter|onLeave|on)/)) { // Avoid re-wrapping already processed/typed methods
                 try {
                    machineConfig.methods[methodName] = new Function("lifecycle", "eventPayload", "fsm", "makeExternalApiCall", "axios", "doAriAction", "return (" + machineConfig.methods[methodName] + ").apply(fsm, arguments);");
                } catch (e) {
                    console.error(`Error parsing general method ${methodName} for FSM ${machineId}: ${e}`);
                }
            }
        }
    }

    const fsm = new StateMachine({
      ...machineConfig,
      data: initialStateData,
      observeUnchangedState: true
    });

    if (machineConfig.externalApis) { // Ensure externalApis is still passed if defined at top level
        fsm.externalApis = machineConfig.externalApis;
    }
    if (machineConfig.ariActions) {
        fsm.ariActions = machineConfig.ariActions;
    }
    fsm.id = definition.id;
    if (doAriAction) fsm.doAriAction = doAriAction;

    Object.assign(fsm, initialStateData);
    return fsm;
}

// Modified makeExternalApiCall
async function makeExternalApiCall(callConfig, fsmInstance, eventPayload) {
    let apiConfig;
    let callName = 'inline_action'; // Default for logging direct requests

    if (typeof callConfig === 'string') { // It's a named call
        callName = callConfig;
        apiConfig = fsmInstance.externalApis && fsmInstance.externalApis[callName];
        if (!apiConfig) {
            console.error(`API call configuration "${callName}" not found in FSM "${fsmInstance.id}".`);
            throw new Error(`API call configuration "${callName}" not found.`);
        }
    } else if (typeof callConfig === 'object' && callConfig.url) { // It's a direct request object
        apiConfig = callConfig;
    } else {
        throw new Error('Invalid configuration for makeExternalApiCall. Must be a name or a request object.');
    }

    let url = apiConfig.url;
    let data = apiConfig.body; // Can be object or string
    let headers = apiConfig.headers || {};

    const replacePlaceholders = (templateValue) => {
        if (typeof templateValue !== 'string') return templateValue;
        // Enhanced placeholder replacement
        return templateValue.replace(/\{\{(fsm|payload|eventPayload)\.([^}]+)\}\}/g, (match, source, key) => {
            let sourceObject;
            if (source === "fsm") sourceObject = fsmInstance;
            else if (source === "payload" || source === "eventPayload") sourceObject = eventPayload;

            if (sourceObject) {
                // Basic key access; for nested properties, a more robust resolver might be needed
                // e.g., key.split('.').reduce((o,i)=> o && typeof o === 'object' && o[i] !== undefined ? o[i] : match, sourceObject);
                // For now, assume direct keys on fsmInstance or eventPayload
                const keys = key.split('.');
                let value = sourceObject;
                for (const k of keys) {
                    if (value && typeof value === 'object' && k in value) {
                        value = value[k];
                    } else {
                        return match; // Key path not found, return original placeholder
                    }
                }
                return value !== undefined ? value : match;
            }
            return match;
        });
    };

    url = replacePlaceholders(url);
    if (typeof data === 'string') {
        data = replacePlaceholders(data);
    } else if (typeof data === 'object' && data !== null) {
        // Recursively replace placeholders in object values
        // A simple JSON.stringify/parse approach for deep replacement in objects:
        data = JSON.parse(replacePlaceholders(JSON.stringify(data)));
    }

    // Placeholder replacement for headers
    const processedHeaders = {};
    for (const hKey in headers) {
        processedHeaders[hKey] = replacePlaceholders(headers[hKey]);
    }
    headers = processedHeaders;

    console.log(`Making external API call "${callName}": ${apiConfig.method || 'GET'} ${url}`);
    try {
        const response = await axios({
            method: apiConfig.method || "GET", url: url, data: data, headers: headers,
            timeout: apiConfig.timeout || 5000
        });
        console.log(`External API call "${callName}" successful. Status: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`External API call "${callName}" failed: ${error.message}`);
        if (error.response) { console.error("Error response data:", error.response.data); }
        throw new Error(`External API call ${callName} failed: ${error.message}`);
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
