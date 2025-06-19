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
    console.log(`StasisStart: Channel ${channel.id} entered ${process.env.ASTERISK_APP_NAME}. Caller: ${channel.caller.number}. Event time: ${event.timestamp}`);

    const fsmId = DEFAULT_ARI_FSM_ID; // Could be determined dynamically in the future
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

// Function to allow FSMs to perform ARI actions
// This will be passed to the FSM instance via stateMachineManager
async function doAriAction(actionName, channelId, params) {
    if (!ariClient) {
        console.error("ARI client not connected. Cannot perform action:", actionName);
        throw new Error("ARI client not connected.");
    }

    const channel = await ariClient.channels.get({ channelId: channelId });
    if (!channel) {
        console.error(`Channel ${channelId} not found for ARI action ${actionName}`);
        throw new Error(`Channel ${channelId} not found.`);
    }

    console.log(`Executing ARI action "${actionName}" on channel ${channelId} with params:`, params);
    try {
        switch (actionName) {
            case 'answer':
                return await channel.answer();
            case 'hangup':
                return await channel.hangup();
            case 'play':
                if (!params.media) throw new Error("Missing 'media' parameter for play action.");
                const playback = ariClient.Playback();
                // channel.play returns the playback object, not a promise directly for completion.
                // For simplicity, we fire and forget here. For more control, manage playback events.
                channel.play({ media: params.media }, playback);
                return { playbackId: playback.id, message: "Playback initiated." };
            case 'getVariable':
                if (!params.variable) throw new Error("Missing 'variable' parameter for getVariable action.");
                return await channel.getChannelVar({ variable: params.variable });
            case 'setVariable':
                if (!params.variable || params.value === undefined) throw new Error("Missing 'variable' or 'value' for setVariable action.");
                return await channel.setChannelVar({ variable: params.variable, value: params.value });
            // Add more actions as needed: bridge, record, etc.
            default:
                console.warn(`Unsupported ARI action: ${actionName}`);
                throw new Error(`Unsupported ARI action: ${actionName}`);
        }
    } catch (err) {
        console.error(`Error executing ARI action ${actionName} on channel ${channelId}:`, err);
        throw err; // Re-throw to be handled by the FSM or calling code
    }
}

module.exports = {
    connectAri,
    doAriAction // Export so it can be used by stateMachineManager
};
