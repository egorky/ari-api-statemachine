# Asterisk ARI Integration Guide

This guide explains how to integrate the FSM system with an Asterisk PBX using the Asterisk REST Interface (ARI).

## Prerequisites

*   A running Asterisk instance (version 13.8+ recommended for full ARI v2 compatibility).
*   ARI enabled and configured in Asterisk (\`ari.conf\`).
*   An ARI user configured in Asterisk with appropriate permissions (\`ari.conf\`).
*   Network connectivity between the Node.js application server and the Asterisk ARI interface (typically HTTP on port 8088).

## Configuration

1.  **Environment Variables (\`.env\` file)**:
    Set the following variables in your project's \`.env\` file:
    ```env
    DISABLE_ARI=false # Set to true to disable ARI connection
    ASTERISK_URL=http://your_asterisk_ip:8088/ari  # URL to your Asterisk ARI interface
    ASTERISK_USERNAME=your_ari_user                   # ARI username
    ASTERISK_PASSWORD=your_ari_password             # ARI password
    ASTERISK_APP_NAME=fsm_ari_app                 # Name of the Stasis application to register with Asterisk
    ```
    The `ASTERISK_APP_NAME` is crucial as it's what you will use in your Asterisk dialplan.

## Asterisk Dialplan Setup

To direct calls to your FSM application, you need to use the \`Stasis\` dialplan application in Asterisk (e.g., in \`extensions.conf\`). The \`Stasis\` application will send the call into your Node.js application, which listens for events for the registered \`ASTERISK_ARI_APP_NAME\`.

**Example \`extensions.conf\` entry:**
\`\`\`dialplan
[your-context]
exten => _X., 1, NoOp(Incoming call for FSM: \${EXTEN})
  same => n, Stasis(\${ASTERISK_ARI_APP_NAME},your_fsm_id_here) ; Main part
  same => n, Hangup()
\`\`\`

*   **\`\${ASTERISK_ARI_APP_NAME}\`**: This should match the value you set in your \`.env\` file.
*   **\`your_fsm_id_here\`**: This is a crucial argument. It's the ID of the FSM definition (filename without \`.json\` from your \`fsm_definitions\` directory) that you want to handle this call. Your \`ariService.js\` will use this ID to load the correct FSM.

When a call matches this extension, Asterisk will:
1.  Connect the call to your Stasis application (\`fsm_ari_app\`).
2.  Trigger a \`StasisStart\` event in your Node.js application.
3.  Pass \`your_fsm_id_here\` as an argument within the event, which \`ariService.js\` uses to load the FSM.

## Defining FSMs for ARI Interaction

FSMs intended for ARI control need to be structured to use the \`doAriAction\` helper function injected into their lifecycle methods.

### Key \`initialData\` Properties

When an FSM is instantiated for an ARI call, the following properties are automatically added to its \`initialData\` (and thus accessible via \`fsm.propertyName\` or \`this.propertyName\` within methods):
*   \`channelId\`: The ID of the Asterisk channel associated with the FSM.
*   \`callerId\`: The caller ID number of the incoming call.

### Using \`doAriAction\`

Lifecycle methods in your FSM definition (e.g., \`onEnterStateName\`, \`onBeforeTransitionName\`) can be \`async\` and should use the \`doAriAction\` function to interact with the Asterisk channel.

**\`doAriAction\` Signature**: \`async doAriAction(actionName, fsmInstance, params = {})\`
*   \`actionName\` (string): The name of the ARI action to perform.
*   \`fsmInstance\` (object): The current FSM instance (usually just pass \`fsm\` or \`this\`).
*   \`params\` (object, optional): Parameters specific to the ARI action.

**Available \`doAriAction\` Commands (Implemented in \`ariService.js\`):**

*   **\`answer\`**: Answers the channel.
    *   \`params\`: None.
    *   Returns: Promise resolving on success.
*   **\`hangup\`**: Hangs up the channel.
    *   \`params\`: None.
    *   Returns: Promise resolving on success.
*   **\`playSound\`**: Plays a sound or media file on the channel.
    *   \`params\`:
        *   \`sound\` (string): The name of the sound file (without extension, e.g., "welcome-message"). Assumes sounds are in Asterisk's standard sound directory.
        *   OR \`media\` (string): The full media URI (e.g., "sound:hello-world", "recording:myrecording").
    *   Returns: Promise resolving when playback finishes or fails.
*   **\`waitForDtmf\`**: Conceptually indicates the FSM is waiting for DTMF.
    *   \`params\`: Optional \`timeout\` (not fully implemented for timeout transition yet).
    *   Actual DTMF input is handled by the \`dtmfReceivedHandler\` in \`ariService.js\`, which triggers FSM transitions like \`dtmf_<digit>\` or \`dtmfReceived\`. This action is more for logging or setting internal FSM flags if needed.

### Example ARI FSM Method (\`ari_example_fsm.json\`)

\`\`\`json
{
  "id": "ari_example_fsm",
  "initial": "init",
  "transitions": [
    { "name": "ariCallStart", "from": "init", "to": "waitForGreeting" },
    { "name": "greetingPlayed", "from": "waitForGreeting", "to": "menu" },
    // ... other transitions for DTMF, hangup ...
  ],
  "methods": {
    "onEnterWaitForGreeting": "async function(lifecycle, payload, fsm, makeExternalApiCall, axios, doAriAction) {
        console.log(\"ARI FSM: Entered waitForGreeting for channel \" + fsm.channelId + \". Playing welcome sound.\");
        try {
            // Assumes hello-world sound file exists on Asterisk server
            await doAriAction(\"playSound\", fsm, { media: \"sound:hello-world\" });
            fsm.greetingPlayed(); // Transition to the next state
        } catch (err) {
            console.error(\"ARI FSM: Error playing sound:\", err);
            await doAriAction(\"hangup\", fsm); // Hangup on error
        }
    }"
    // ... other methods ...
  }
}
\`\`\`

### Handling DTMF

The \`ariService.js\` listens for \`ChannelDtmfReceived\` events. When DTMF is received on a channel associated with an FSM, it will attempt to trigger a transition in that FSM:
1.  First, it tries a specific transition: \`dtmf_<digit>\` (e.g., \`dtmf_1\`, \`dtmf_#\`).
2.  If that doesn't exist or cannot be called, it tries a generic transition: \`dtmfReceived\`.

Your FSM should define these transitions and corresponding lifecycle methods to handle the DTMF input. The \`payload\` to these methods will include \`{ digit: "actual_digit_pressed" }\`.

## Example \`ari_example_fsm.json\`

The provided \`fsm_definitions/ari_example_fsm.json\` demonstrates a simple call flow:
1.  Call starts (\`ariCallStart\` transition).
2.  Enters \`waitForGreeting\` state, plays a welcome sound using \`doAriAction("playSound", ...)\`.
3.  Transitions to \`menu\` state upon successful playback.
4.  In \`menu\` state, it waits for DTMF. If "1" is pressed, \`dtmf_1\` transition occurs.
5.  Enters \`handleOption1\` state, plays another sound, then hangs up the call using \`doAriAction("hangup", ...)\`.
6.  Includes a generic \`hangupCall\` transition that can be triggered from any state to end the call.

This example serves as a template for building more complex voice applications with FSMs.
