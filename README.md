# FSM Management System with API, Web Editor, and Asterisk ARI Integration

This project provides a robust system for creating, managing, and executing Finite State Machines (FSMs). It offers multiple interfaces for interaction: a REST API, a web-based graphical editor, and integration with Asterisk via ARI for telephony applications.

## Key Features

*   **Core State Machine Engine**: Utilizes `javascript-state-machine` for robust FSM execution.
*   **Declarative Actions**: FSMs can define actions (External API calls, Asterisk ARI operations) directly in their JSON structure for `onEntry`/`onExit` state events and on transitions.
*   **REST API**:
    *   Securely trigger FSM transitions with `eventPayload` and `initialData`.
    *   Manage FSM definitions (list, get definition, get DOT representation).
    *   Endpoints for step-by-step FSM definition primarily for web UI support (add state, add transition, set initial).
*   **Web Interface (Password Protected)**:
    *   Dashboard: List, upload, and delete FSM JSON definitions.
    *   Graphical FSM Editor:
        *   Visually create and modify states and transitions using Drawflow.
        *   Configure `onEntry` and `onExit` actions for states via a modal UI:
            *   Supports both "External API" and "ARI" action types.
            *   Dynamic forms for configuring action parameters.
            *   List, edit, and delete multiple actions per hook.
        *   Set initial state.
        *   View real-time graph visualization (d3-graphviz) and raw JSON.
        *   Save FSM definitions.
    *   Text-Based FSM Editor: For direct raw JSON editing.
    *   Option to disable the web UI via an environment variable.
*   **Asterisk ARI Integration**:
    *   Connects to Asterisk via ARI for call control.
    *   Handles incoming calls via a Stasis application, associating FSM instances with channels.
    *   FSMs execute ARI actions (e.g., answer, playAudio, getData, originateCall, get/setVariable, hangup) using declarative JSON actions.
    *   Supports DTMF handling by routing digits to FSM transitions (e.g., `input_1`, `handleDtmf`).
    *   Dynamic placeholder support (`{{fsm.var}}`, `{{payload.var}}`, `{{event.var}}`) in ARI action parameters.
*   **Dynamic FSM Configuration**:
    *   FSMs defined in JSON (see `docs/FSM_DEFINITIONS.md`).
    *   Placeholder support for dynamic data in API/ARI action parameters.
    *   Optional custom JavaScript methods in FSM definitions for logic beyond declarative actions.
*   **Documentation**: Comprehensive setup, FSM definition, API, Web UI, and ARI integration guides.

## Getting Started

1.  **Prerequisites**: Ensure Node.js (v14+ recommended) and npm are installed. An Asterisk server is required for ARI integration features.
2.  **Setup**: For detailed setup instructions, see [docs/SETUP.md](docs/SETUP.md). This includes cloning, installing dependencies, and configuring environment variables.
3.  **Running the Application**:
    \`\`\`bash
    npm start
    \`\`\`
    (The above command is intentionally split to avoid tool misinterpretation here; join it in your terminal)

## Documentation

*   **[Setup Guide](docs/SETUP.md)**: Installation and environment configuration.
*   **[FSM Definitions Guide](docs/FSM_DEFINITIONS.md)**: Comprehensive guide to the FSM JSON structure, actions, and placeholders.
*   **[Web UI Guide](docs/WEB_UI.md)**: How to use the web interface for FSM management and graphical editing.
*   **[API Reference](docs/API.md)**: Detailed information about available API endpoints.
*   **[ARI Integration Guide](docs/ARI_INTEGRATION.md)**: Details on connecting to Asterisk and building telephony FSMs.

## Known Issues and Limitations (Current Version)

*   **API Token in Client-Side (Web Editor)**: For the FSM editor to fetch graph data and FSM definitions via the API, the \`API_TOKEN\` is currently made available to the client-side JavaScript. This is a security risk in a production environment. Ideally, API endpoints called by an authenticated web UI session should use session-based authentication.
*   **\`new Function()\` for FSM Methods**: Lifecycle methods for FSMs are defined as strings in JSON and instantiated using \`new Function()\`. While powerful, this can pose a security risk if FSM JSON definitions are sourced from untrusted users or locations. Ensure definitions are from trusted sources.
*   **Basic Graphical Editor**: The current graphical editor allows adding states/transitions and setting the initial state. It does not yet support editing existing elements graphically (e.g., renaming, deleting specific transitions from graph), defining methods, or configuring external API/ARI calls directly via the graph. Modifications are primarily through simple forms that update the underlying JSON.
*   **Error Handling**: While error handling is implemented, further hardening and more granular user feedback, especially for complex asynchronous operations (like ARI calls), could be beneficial.

## Future Enhancements (Potential)

*   Session-based authentication for API calls from the web UI.
*   More advanced graphical editor features (drag-and-drop, inline editing of properties, visual configuration of API/ARI calls).
*   Sandboxed execution environment for \`new Function()\` or alternative method definition strategy.
*   Support for more ARI actions and events.
*   Database backend for FSM definitions instead of JSON files for larger deployments.
*   Unit and integration tests.
