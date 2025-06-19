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

        await client.start(ASTERISK_ARI_APP_NAME);
        console.log(`ARI application "${ASTERISK_ARI_APP_NAME}" started and listening for events.`);

        return client;
    } catch (err) {
        console.error("Failed to connect to Asterisk ARI or start application:", err.message);
        ariClient = null;
        return null;
    }
}

async function stasisStartHandler(event, channel) {
    console.log(`StasisStart event for channel ${channel.id}. Args: ${event.args}`);
    const fsmId = event.args && event.args[0];

    if (!fsmId) {
        console.warn(`No FSM ID provided for channel ${channel.id} in StasisStart. Ignoring.`);
        return;
    }

    console.log(`Channel ${channel.id} entered Stasis. Attempting to associate with FSM: ${fsmId}`);

    try {
        await channel.answer();
        console.log(`Channel ${channel.id} answered.`);

        const initialData = {
            channelId: channel.id,
            callerId: channel.caller.number,
        };

        const fsm = stateMachineManager.getStateMachine(fsmId, initialData, { doAriAction });
        activeChannels.set(channel.id, { fsm, channel });
        console.log(`FSM "${fsmId}" associated with channel ${channel.id}.`);

        if (fsm.can("ariCallStart")) {
            await fsm.ariCallStart({ callerNumber: channel.caller.number, channelId: channel.id });
            console.log(`FSM "${fsmId}" on channel ${channel.id} transitioned via ariCallStart to state: ${fsm.state}`);
        } else {
            console.log(`FSM "${fsmId}" on channel ${channel.id} is in initial state: ${fsm.state}. No specific "ariCallStart" transition found or callable.`);
        }

    } catch (error) {
        console.error(`Error handling StasisStart for channel ${channel.id} with FSM ${fsmId}:`, error);
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
}

async function dtmfReceivedHandler(event, channel) {
    const digit = event.digit;
    console.log(`DTMF digit "${digit}" received on channel ${channel.id}.`);
    const channelData = activeChannels.get(channel.id);
    if (channelData && channelData.fsm) {
        const { fsm } = channelData;
        const transitionName = `dtmf_${digit}`;
        const genericTransitionName = "dtmfReceived";

        if (fsm.can(transitionName)) {
            await fsm[transitionName]({ digit });
            console.log(`FSM on ${channel.id} transitioned via ${transitionName} to state: ${fsm.state}`);
        } else if (fsm.can(genericTransitionName)) {
            await fsm[genericTransitionName]({ digit });
            console.log(`FSM on ${channel.id} transitioned via ${genericTransitionName} to state: ${fsm.state}`);
        } else {
            console.log(`FSM on ${channel.id} in state ${fsm.state} cannot handle DTMF "${digit}".`);
        }
    } else {
        console.warn(`Received DTMF on channel ${channel.id} but no associated FSM found.`);
    }
}

async function doAriAction(actionName, fsmInstance, params = {}) {
    if (!ariClient) throw new Error("ARI client not connected.");
    const channelData = activeChannels.get(fsmInstance.channelId);
    if (!channelData || !channelData.channel) throw new Error(`No active channel for ARI action ${actionName}.`);
    const { channel } = channelData;
    console.log(`ARI Action on ${channel.id}: ${actionName}, Params: `, params);

    try {
        switch (actionName) {
            case "answer": return await channel.answer();
            case "hangup": activeChannels.delete(channel.id); return await channel.hangup();
            case "playSound":
                if (!params.sound && !params.media) throw new Error("playSound requires sound or media.");
                const playback = ariClient.Playback();
                const soundToPlay = params.media || \`sound:\${params.sound}\`;
                return new Promise((resolve, reject) => {
                    const playbackId = playback.id;
                    const finishListener = (event, newPlayback) => { if (newPlayback.id === playbackId) {cleanup(); resolve({ id: playbackId, status: "finished" });}};
                    const failListener = (event, failedPlayback) => { if (failedPlayback.id === playbackId) {cleanup(); reject(new Error(\`Playback failed for \${soundToPlay}\`));}};
                    const cleanup = () => { ariClient.removeListener("PlaybackFinished", finishListener); ariClient.removeListener("PlaybackFailed", failListener);};
                    ariClient.on("PlaybackFinished", finishListener);
                    ariClient.on("PlaybackFailed", failListener);
                    channel.play({ media: soundToPlay }, playback).catch(err => {cleanup(); reject(err);});
                });
            case "waitForDtmf": return Promise.resolve({ message: "Conceptually waiting for DTMF." });
            default: throw new Error(\`Unknown ARI action: \${actionName}\`);
        }
    } catch (error) { console.error(\`Error in ARI action ${actionName} on \${channel.id}:\`, error); throw error; }
}
module.exports = { connectAri, doAriAction };
