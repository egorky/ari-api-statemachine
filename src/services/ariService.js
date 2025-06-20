// src/services/ariService.js
const path = require('path'); // Required for path.resolve
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Ari = require('ari-client');
const stateMachineManager = require('./stateMachineManager');

let ariClient = null;
let activeChannelFsms = {}; // To store FSM instances per channel
const DEFAULT_ARI_FSM_ID = 'ari_example_ivr'; // Or make this configurable

async function connectAri() {
    if (ariClient) {
        console.log('ARI client already connected or connecting.');
        return ariClient;
    }

    const { ASTERISK_URL, ASTERISK_USERNAME, ASTERISK_PASSWORD, ASTERISK_APP_NAME } = process.env;

    if (!ASTERISK_URL || !ASTERISK_USERNAME || !ASTERISK_PASSWORD || !ASTERISK_APP_NAME) {
        console.error('Asterisk ARI connection details missing in .env file. ARI service will not start.');
        return null;
    }

    console.log(`Attempting to connect to ARI at ${ASTERISK_URL} for app ${ASTERISK_APP_NAME}`);

    try {
        ariClient = await Ari.connect(ASTERISK_URL, ASTERISK_USERNAME, ASTERISK_PASSWORD);
        console.log('Successfully connected to Asterisk ARI.');

        ariClient.on('StasisStart', stasisStartHandler);
        ariClient.on('StasisEnd', stasisEndHandler);
        // Add more event handlers as needed, e.g., for DTMF
        // ariClient.on('ChannelDtmfReceived', dtmfReceivedHandler);

        ariClient.on('disconnect', () => {
            console.log('Disconnected from Asterisk ARI. Attempting to reconnect...');
            ariClient = null; // Reset client
            setTimeout(connectAri, 5000); // Reconnect after 5 seconds
        });

        ariClient.on('error', (err) => {
            console.error('ARI Client Error:', err);
            // Depending on error, might need to attempt reconnect or specific handling
            if (err.message.includes('ECONNREFUSED')) {
                 console.log('Connection refused. Will attempt to reconnect.');
                 ariClient = null;
                 setTimeout(connectAri, 10000); // Reconnect after 10 seconds
            }
        });


        await ariClient.start(ASTERISK_APP_NAME);
        console.log(`ARI application ${ASTERISK_APP_NAME} started and listening for events.`);
        return ariClient;

    } catch (err) {
        console.error('Failed to connect to Asterisk ARI:', err.message);
        ariClient = null; // Reset client on failure
        console.log('Will attempt to reconnect in 10 seconds...');
        setTimeout(connectAri, 10000); // Attempt to reconnect after 10 seconds
        return null;
    }
}

async function stasisStartHandler(event, channel) {
    // TODO: Implement dynamic FSM ID determination. Strategies include:
    // 1. Using `event.args` if specific arguments are passed from the dialplan to Stasis.
    //    Example Dialplan: Dial(PJSIP/endpoint,A,U(app-name^fsm_id_arg))
    //    `event.args` would be an array, e.g., `['fsm_id_arg']`.
    // 2. Reading a channel variable set in the dialplan before entering Stasis.
    //    Example Dialplan: Set(ARI_FSM_ID=my_specific_fsm)
    //    Then retrieve via `channel.getVariable({ variable: 'ARI_FSM_ID' })`. This is async.
    // 3. Mapping `event.channel.dialplan.exten` or `event.channel.dialplan.context` to an FSM ID
    //    through a configuration lookup table within this application.
    // 4. A default FSM ID if none of the above yield a specific ID.
    console.log(`StasisStart: Channel ${channel.id} entered ${process.env.ASTERISK_APP_NAME}. Caller: ${channel.caller.number}. Dialplan: context=${channel.dialplan.context}, exten=${channel.dialplan.exten}, priority=${channel.dialplan.priority}. Event time: ${event.timestamp}`);

    const fsmId = DEFAULT_ARI_FSM_ID; // Using default for now
    const initialData = {
        channelId: channel.id,
        callerId: channel.caller.number,
        // Add any other relevant data from the 'event' or 'channel' objects
        dialplan: {
            context: channel.dialplan.context,
            exten: channel.dialplan.exten,
            priority: channel.dialplan.priority
        }
    };

    // Pass the 'doAriAction' function to the state machine manager
    const ariOps = { doAriAction: doAriAction };

    try {
        const fsm = stateMachineManager.getStateMachine(fsmId, initialData, ariOps);
        activeChannelFsms[channel.id] = fsm;
        console.log(`FSM instance created for channel ${channel.id} using FSM ID ${fsmId}.`);

        // Answer the call (moved here to ensure FSM is ready)
        await channel.answer();
        console.log(`Channel ${channel.id} answered.`);

        // Trigger an initial transition or let an onEntry hook in the initial state handle it.
        // The example FSM 'ari_example_ivr' has an onEnterNewCall method.
        // To trigger it, the FSM's initial state method should be called by a transition.
        // If 'new_call' is the initial state, and it has an onEntry method, it should fire.
        // Or, explicitly call a transition like 'startCall' if defined.
        if (fsm.can('startCall')) { // As defined in ari_example_ivr.json
            await fsm.startCall({ eventData: event }); // Pass event data if needed by the FSM method
        } else if (typeof fsm.onEnterNewCall === 'function' && fsm.state === 'new_call') {
            // This case is for when the initial state itself has an onEntry,
            // but JSM calls onEntry methods associated with states, not transitions.
            // The 'onEnterNewCall' in the example is a general method, not tied to a state's onEntry directly.
            // For it to be useful, it should be called by a transition or be an onEntry of the initial state.
            // Let's assume 'startCall' transition is the primary way to kick things off.
            console.log("Initial transition 'startCall' not available, check FSM definition if this is an error.");
        }


        channel.on('ChannelDtmfReceived', (dtmfEvent, dtmfChannel) => {
            // Pass the FSM instance directly if possible, or fsmId/channelId to retrieve it
            dtmfReceivedHandler(dtmfEvent, dtmfChannel, activeChannelFsms[dtmfChannel.id]);
        });

    } catch (err) {
        console.error(`Error in StasisStart for channel ${channel.id}: ${err.message}`, err);
        // Attempt to hangup if there was a critical error setting up the FSM
        try {
            await channel.hangup();
        } catch (hangupErr) {
            console.error(`Failed to hangup channel ${channel.id} after StasisStart error: ${hangupErr.message}`);
        }
    }
}

function stasisEndHandler(event, channel) {
    console.log(`StasisEnd: Channel ${channel.id} left ${process.env.ASTERISK_APP_NAME}. Event time: ${event.timestamp}`);
    if (activeChannelFsms[channel.id]) {
        const fsm = activeChannelFsms[channel.id];
        // Optionally, trigger a final transition if the FSM is not already in a terminal state
        if (fsm && fsm.can('disconnect') && fsm.state !== 'call_ended') {
            console.log(`Channel ${channel.id} ended. Attempting to transition FSM to call_ended.`);
            fsm.disconnect({ eventData: event }).catch(err => { // Fire and forget with catch
                console.error(`Error during final disconnect transition for channel ${channel.id}: ${err.message}`);
            });
        }
        delete activeChannelFsms[channel.id];
        console.log(`FSM instance for channel ${channel.id} cleaned up.`);
    }
}

async function dtmfReceivedHandler(event, channel, fsm) { // fsm instance passed directly
    const digit = event.digit;
    console.log(`DTMF digit ${digit} received on channel ${channel.id}`);

    if (!fsm) {
        console.error(`No FSM instance found for channel ${channel.id} during DTMF handling.`);
        return;
    }

    console.log(`Current FSM state for channel ${channel.id}: ${fsm.state}`);

    try {
        const transitionName = `input_${digit}`; // e.g., input_1, input_#
        const genericDtmfTransition = 'handleDtmf';

        if (fsm.can(transitionName)) {
            console.log(`Executing DTMF transition: ${transitionName} for channel ${channel.id}`);
            await fsm[transitionName]({ digit: digit, eventData: event });
        } else if (fsm.can(genericDtmfTransition)) {
            console.log(`Executing generic DTMF transition: ${genericDtmfTransition} for channel ${channel.id} with digit ${digit}`);
            await fsm[genericDtmfTransition]({ digit: digit, eventData: event });
        } else {
            console.log(`No specific or generic DTMF transition found for digit ${digit} from state ${fsm.state} on channel ${channel.id}. Checking for 'invalid_input'.`);
            // Fallback to a general invalid input transition if available
            if (fsm.can('invalid_input')) {
                await fsm.invalid_input({ digit: digit, eventData: event });
            } else {
                console.warn(`No transition found for DTMF ${digit} from state ${fsm.state} on channel ${channel.id}, and no 'invalid_input' fallback.`);
            }
        }
    } catch (err) {
        console.error(`Error processing DTMF ${digit} for channel ${channel.id}: ${err.message}`, err);
    }
}

// Helper function for placeholder replacement
function replacePlaceholders(templateValue, fsmInstance, lifecycleEvent, actionEventPayload) {
    if (typeof templateValue !== 'string') {
        return templateValue;
    }
    // Replace {{fsm.property.subProperty}}
    templateValue = templateValue.replace(/\{\{fsm\.([a-zA-Z0-9_.]+)\}\}/g, (match, keyPath) => {
        const keys = keyPath.split('.');
        let value = fsmInstance;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                console.warn(`Placeholder resolver: key '${key}' not found in fsm path '${keyPath}'.`);
                return match; // Placeholder not found
            }
        }
        return value !== undefined ? value : match;
    });
    // Replace {{event.property.subProperty}} - from lifecycle event if available
    if (lifecycleEvent) {
        templateValue = templateValue.replace(/\{\{event\.([a-zA-Z0-9_.]+)\}\}/g, (match, keyPath) => {
            const keys = keyPath.split('.');
            let value = lifecycleEvent;
            for (const key of keys) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    console.warn(`Placeholder resolver: key '${key}' not found in event path '${keyPath}'.`);
                    return match;
                }
            }
            return value !== undefined ? value : match;
        });
    }
    // Replace {{payload.property.subProperty}} - from action's event payload
    if (actionEventPayload) {
        templateValue = templateValue.replace(/\{\{payload\.([a-zA-Z0-9_.]+)\}\}/g, (match, keyPath) => {
            const keys = keyPath.split('.');
            let value = actionEventPayload;
            for (const key of keys) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    console.warn(`Placeholder resolver: key '${key}' not found in payload path '${keyPath}'.`);
                    return match;
                }
            }
            return value !== undefined ? value : match;
        });
    }
    return templateValue;
}

// Refactored doAriAction, intended to be bound to an FSM instance (this = FSM)
// when called as fsm.doAriAction(operationName, parameters, lifecycleEvent, actionEventPayload)
async function doAriActionOnFsm(operationName, parameters, lifecycleEvent, actionEventPayload) {
    if (!ariClient) { // Simplified check: if ariClient exists, assume it's connected or trying to connect.
        console.warn("ARI client not available. Cannot perform ARI action:", operationName);
        throw new Error("ARI client not available.");
    }

    const fsmInstance = this; // `this` is the FSM instance
    let channelIdToUse;

    if (parameters && parameters.channelId) {
        channelIdToUse = replacePlaceholders(parameters.channelId, fsmInstance, lifecycleEvent, actionEventPayload);
    } else {
        channelIdToUse = fsmInstance.channelId;
    }

    if (!channelIdToUse && !['originateCall', 'getBridges', 'getEndpoints'].includes(operationName)) { // Some operations don't need a channelId initially
        console.warn(`No channelId available for ARI operation "${operationName}". FSM ID: ${fsmInstance.id}. Ensure fsm.channelId is set or channelId is in parameters.`);
        throw new Error(`No channelId for ${operationName}`);
    }

    // Resolve placeholders in all parameters
    const resolvedParams = {};
    if (parameters) {
        for (const key in parameters) {
            // Don't re-resolve channelId if it was explicitly provided and already resolved for channelIdToUse
            if (key === 'channelId' && parameters[key] === channelIdToUse) {
                 resolvedParams[key] = channelIdToUse; // Use the already resolved one
                 continue;
            }

            if (typeof parameters[key] === 'object' && parameters[key] !== null) {
                resolvedParams[key] = JSON.parse(replacePlaceholders(JSON.stringify(parameters[key]), fsmInstance, lifecycleEvent, actionEventPayload));
            } else {
                resolvedParams[key] = replacePlaceholders(parameters[key], fsmInstance, lifecycleEvent, actionEventPayload);
            }
        }
    }

    console.log(`ARI Service: FSM ${fsmInstance.id} executing "${operationName}" on channel ${channelIdToUse || 'N/A'} with resolved params:`, resolvedParams);

    try {
        switch (operationName) {
            case "answer":
                if (!channelIdToUse) throw new Error("channelId is required for answer operation.");
                await ariClient.channels.answer({ channelId: channelIdToUse });
                console.log(`Channel ${channelIdToUse} answered.`);
                return { success: true, message: "Channel answered" };
            case "hangup":
                if (!channelIdToUse) throw new Error("channelId is required for hangup operation.");
                await ariClient.channels.hangup({ channelId: channelIdToUse });
                console.log(`Channel ${channelIdToUse} hung up.`);
                return { success: true, message: "Channel hung up" };
            case "playAudio":
                if (!channelIdToUse) throw new Error("channelId is required for playAudio operation.");
                if (!resolvedParams.media) throw new Error("Missing 'media' parameter for playAudio");
                const playback = await ariClient.channels.play({ channelId: channelIdToUse, media: resolvedParams.media });
                console.log(`Playback ${playback.id} started on channel ${channelIdToUse}.`);
                return { success: true, playbackId: playback.id, message: "Playback started" };
            case "getVariable":
                if (!channelIdToUse) throw new Error("channelId is required for getVariable operation.");
                if (!resolvedParams.variable) throw new Error("Missing 'variable' parameter for getVariable");
                const varResult = await ariClient.channels.getVariable({ channelId: channelIdToUse, variable: resolvedParams.variable });
                console.log(`Variable ${resolvedParams.variable} on channel ${channelIdToUse} is: ${varResult.value}`);
                return { success: true, value: varResult.value };
            case "setVariable":
                if (!channelIdToUse) throw new Error("channelId is required for setVariable operation.");
                if (!resolvedParams.variable || resolvedParams.value === undefined) {
                    throw new Error("Missing 'variable' or 'value' for setVariable");
                }
                await ariClient.channels.setVariable({ channelId: channelIdToUse, variable: resolvedParams.variable, value: resolvedParams.value });
                console.log(`Variable ${resolvedParams.variable} on channel ${channelIdToUse} set to: ${resolvedParams.value}`);
                return { success: true };
            case "getData": // Plays a prompt; DTMF collection is handled by FSM via global dtmfReceivedHandler
                if (!channelIdToUse) throw new Error("channelId is required for getData operation.");
                if (!resolvedParams.media) throw new Error("Missing 'media' parameter for getData (prompt)");
                const getDataPlayback = await ariClient.channels.play({ channelId: channelIdToUse, media: resolvedParams.media });
                console.log(`Prompt playback ${getDataPlayback.id} started for getData on channel ${channelIdToUse}. FSM should handle DTMF separately.`);
                return { success: true, playbackId: getDataPlayback.id, message: "Prompt playback started" };
            case "originateCall": // Does not use channelIdToUse as it creates a new channel
                 if (!resolvedParams.endpoint) throw new Error("Missing 'endpoint' for originateCall");
                 const originateOpParams = {
                    endpoint: resolvedParams.endpoint,
                    context: resolvedParams.context,
                    extension: resolvedParams.extension,
                    priority: resolvedParams.priority,
                    callerId: resolvedParams.callerId,
                    app: process.env.ASTERISK_ARI_APP_NAME || 'my-ari-app',
                    appArgs: resolvedParams.appArgs,
                    timeout: resolvedParams.timeout === undefined ? 30000 : resolvedParams.timeout, // Default timeout if not specified
                    // channelId: fsmInstance.channelId, // This could be used to set a specific originating channel ID if needed and supported by client
                 };
                 Object.keys(originateOpParams).forEach(key => originateOpParams[key] === undefined && delete originateOpParams[key]);
                 console.log("Origination operation parameters:", originateOpParams);
                 const newChannel = await ariClient.channels.originate(originateOpParams);
                 console.log(`Originated new channel ${newChannel.id}. State: ${newChannel.state}`);
                 return { success: true, channelId: newChannel.id, name: newChannel.name, state: newChannel.state };
            default:
                console.warn(`Unsupported ARI operation: ${operationName}`);
                throw new Error(`Unsupported ARI operation: ${operationName}`);
        }
    } catch (error) {
        console.error(`ARI operation "${operationName}" on channel ${channelIdToUse || 'N/A'} failed: ${error.message}`, error);
        throw error;
    }
}

module.exports = {
    connectAri,
    // doAriActionOnFsm is not exported directly from module,
    // it's passed to FSM instances via ariOps in stasisStartHandler
};
