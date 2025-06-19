const Ari = require("ari-client");
const stateMachineManager = require("./stateMachineManager");

let ariClient = null;
const activeChannels = new Map(); // Map channel.id to FSM instance and other data

async function connectAri() {
    if (ariClient) return ariClient;

    const { ASTERISK_ARI_URL, ASTERISK_ARI_USER, ASTERISK_ARI_PASSWORD, ASTERISK_ARI_APP_NAME } = process.env;

    if (!ASTERISK_ARI_URL || !ASTERISK_ARI_USER || !ASTERISK_ARI_PASSWORD || !ASTERISK_ARI_APP_NAME) {
        console.error("Asterisk ARI connection details missing in .env file. ARI integration will be disabled.");
        return null;
    }

    try {
        console.log(`Attempting to connect to ARI at ${ASTERISK_ARI_URL} with user ${ASTERISK_ARI_USER} for app ${ASTERISK_ARI_APP_NAME}...`);
        const client = await Ari.connect(ASTERISK_ARI_URL, ASTERISK_ARI_USER, ASTERISK_ARI_PASSWORD);
        ariClient = client;
        console.log("Successfully connected to Asterisk ARI.");

        client.on("StasisStart", stasisStartHandler);
        client.on("StasisEnd", stasisEndHandler);
        client.on("ChannelDtmfReceived", dtmfReceivedHandler);
        // Add other event handlers as needed: PlaybackFinished, ChannelHangupRequest etc.

        await client.start(ASTERISK_ARI_APP_NAME);
        console.log(`ARI application "${ASTERISK_ARI_APP_NAME}" started and listening for events.`);

        return client;
    } catch (err) {
        console.error("Failed to connect to Asterisk ARI or start application:", err.message);
        ariClient = null; // Ensure client is null on failure
        // Implement retry logic if necessary
        return null;
    }
}

// --- ARI Event Handlers ---
async function stasisStartHandler(event, channel) {
    console.log(`StasisStart event for channel ${channel.id}. Args: ${event.args}`);
    // event.args might contain data passed from dialplan, e.g., the FSM ID to use.
    // Example: Dialplan might do Stasis(fsm_ari_app,fsmId=some_fsm)
    const fsmId = event.args && event.args[0]; // This depends on how Stasis is called

    if (!fsmId) {
        console.warn(`No FSM ID provided for channel ${channel.id} in StasisStart. Ignoring.`);
        // Optionally hangup or play an error.
        // await channel.hangup();
        return;
    }

    console.log(`Channel ${channel.id} entered Stasis. Attempting to associate with FSM: ${fsmId}`);

    try {
        await channel.answer();
        console.log(`Channel ${channel.id} answered.`);

        // Initial data for the FSM, including the channel itself for ARI operations
        const initialData = {
            channelId: channel.id,
            callerId: channel.caller.number,
            // We will add a helper to FSMs to interact with this channel object later
        };

        const fsm = stateMachineManager.getStateMachine(fsmId, initialData, { doAriAction }); // Pass it here
        // Store FSM and channel together
        activeChannels.set(channel.id, { fsm, channel });
        console.log(`FSM "${fsmId}" associated with channel ${channel.id}.`);

        // Trigger an initial transition, e.g., "callStart" or use current state if FSM handles it
        // This assumes FSMs designed for ARI have an "ariCallStart" transition or similar
        // or their initial state handles the call beginning.
        if (fsm.can("ariCallStart")) {
            await fsm.ariCallStart({ callerNumber: channel.caller.number, channelId: channel.id });
            console.log(`FSM "${fsmId}" on channel ${channel.id} transitioned via ariCallStart to state: ${fsm.state}`);
        } else {
            console.log(`FSM "${fsmId}" on channel ${channel.id} is in initial state: ${fsm.state}. No specific "ariCallStart" transition found or callable.`);
            // The FSMs onEnter<InitialState> should handle the first action if no explicit start transition.
        }

    } catch (error) {
        console.error(`Error handling StasisStart for channel ${channel.id} with FSM ${fsmId}:`, error);
        // Ensure channel is hung up if something goes wrong during setup
        try {
            if (!channel.destroyed) await channel.hangup();
        } catch (hangupError) {
            console.error(`Error hanging up channel ${channel.id} after StasisStart failure:`, hangupError);
        }
        activeChannels.delete(channel.id);
    }
}

function stasisEndHandler(event, channel) {
    console.log(`StasisEnd event for channel ${channel.id}. Cleaning up.`);
    activeChannels.delete(channel.id);
    // Any other cleanup for this channel
}

async function dtmfReceivedHandler(event, channel) {
    const digit = event.digit;
    console.log(`DTMF digit "${digit}" received on channel ${channel.id}.`);
    const channelData = activeChannels.get(channel.id);
    if (channelData && channelData.fsm) {
        const { fsm } = channelData;
        // Example: transition name could be "dtmf_<digit>" or a generic "dtmfInput"
        const transitionName = \`dtmf_\${digit}\`;
        const genericTransitionName = "dtmfReceived";

        if (fsm.can(transitionName)) {
            await fsm[transitionName]({ digit });
            console.log(\`FSM on \${channel.id} transitioned via \${transitionName} to state: \${fsm.state}\`);
        } else if (fsm.can(genericTransitionName)) {
            await fsm[genericTransitionName]({ digit });
            console.log(\`FSM on \${channel.id} transitioned via \${genericTransitionName} to state: \${fsm.state}\`);
        } else {
            console.log(\`FSM on \${channel.id} in state \${fsm.state} cannot handle DTMF "\${digit}".\`);
        }
    } else {
        console.warn(\`Received DTMF on channel \${channel.id} but no associated FSM found.\`);
    }
}

// Function to perform ARI actions from FSM methods
// This will be passed to FSM methods similar to makeExternalApiCall
async function doAriAction(actionName, fsmInstance, params = {}) {
    if (!ariClient) throw new Error("ARI client not connected."); // Corrected: Removed backticks
    const channelData = activeChannels.get(fsmInstance.channelId);
    if (!channelData || !channelData.channel) throw new Error(\`No active channel for ARI action \${actionName}.\`); // Corrected: Standard backticks
    const { channel } = channelData;
    console.log(\`ARI Action on \${channel.id}: \${actionName}, Params: \`, params); // Corrected: Standard backticks

    try {
        switch (actionName) {
            case "answer": return await channel.answer();
            case "hangup": activeChannels.delete(channel.id); return await channel.hangup();
            case "playSound":
                if (!params.sound && !params.media) throw new Error("playSound action requires 'sound' or 'media' parameter."); // Corrected: Removed backticks
                const playback = ariClient.Playback();
                const soundToPlay = params.media || \`sound:\${params.sound}\`; // Corrected: Standard backticks
                // Listen for PlaybackFinished event to resolve the promise
                return new Promise((resolve, reject) => {
                    const playbackId = playback.id;
                    const finishListener = (event, newPlayback) => { if (newPlayback.id === playbackId) {cleanup(); resolve({ id: playbackId, status: "finished" });}};
                    const failListener = (event, failedPlayback) => { if (failedPlayback.id === playbackId) {cleanup(); reject(new Error(\`Playback failed for \${soundToPlay}\`));}}; // Corrected: Standard backticks
                    const cleanup = () => { ariClient.removeListener("PlaybackFinished", finishListener); ariClient.removeListener("PlaybackFailed", failListener);};
                    ariClient.on("PlaybackFinished", finishListener);
                    ariClient.on("PlaybackFailed", failListener); // Listen for failures too
                    channel.play({ media: soundToPlay }, playback)
                        .catch(err => {cleanup(); reject(err);}); // Catch immediate errors from channel.play()
                });
            case "waitForDtmf": // This is a conceptual action; actual DTMF is event-driven
                console.log(\`FSM on channel \${channel.id} is now conceptually waiting for DTMF.\`); // Corrected: Standard backticks
                return Promise.resolve({ message: "Conceptually waiting for DTMF." });
            default:
                console.error(\`Unknown ARI action: \${actionName}\`); // Corrected: Standard backticks
                throw new Error(\`Unknown ARI action: \${actionName}\`); // Corrected: Standard backticks
        }
    } catch (error) {
        console.error(\`Error performing ARI action \${actionName} on channel \${channel.id}:\`, error); // Corrected: Standard backticks
        throw error; // Re-throw to be caught by FSM lifecycle method
    }
}

module.exports = {
    connectAri,
    doAriAction,
    // Potentially expose activeChannels or specific channel interaction functions if needed by other parts
};
