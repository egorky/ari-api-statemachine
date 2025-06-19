# Web UI Guide

This guide explains how to use the web interface to manage and edit Finite State Machine (FSM) definitions.

## Accessing the Web UI

If the web UI is not disabled (i.e., \`DISABLE_WEB_UI\` in your \`.env\` file is not set to \`true\`), it can be accessed by navigating to the root URL of the application (e.g., \`http://localhost:3000\` by default).

## Login

The web interface is password-protected. You will be prompted to log in using the password specified in the \`WEB_PASSWORD\` environment variable.

*   Navigate to \`/login\`.
*   Enter the password and click "Login".

Upon successful login, you will be redirected to the Dashboard.

## Dashboard (\`/dashboard\`)

The dashboard is the main page for managing FSM definitions. It provides the following functionalities:

### 1. Listing FSM Definitions

*   All available FSM definitions found in the \`fsm_definitions\` directory are listed.
*   The ID of each FSM (derived from its filename) is displayed.

### 2. Uploading a New FSM Definition

*   Use the "Upload New FSM Definition" form.
*   **File Requirements**:
    *   The file must be a valid JSON file (extension \`.json\`).
    *   The JSON content must include a top-level \`"id"\` property.
    *   The value of the \`"id"\` property inside the JSON file **must match** the filename (excluding the \`.json\` extension). For example, if the file is named \`my_fsm.json\`, the \`"id"\` property inside the file must be \`"my_fsm"\`.
*   Click "Choose File", select your FSM JSON file, and click "Upload".
*   Upon successful upload, the FSM will appear in the list.

### 3. Deleting an FSM Definition

*   Next to each FSM in the list, there is a "Delete" button.
*   Clicking "Delete" will prompt for confirmation.
*   If confirmed, the FSM definition file will be deleted from the server.

### 4. Editing an FSM Definition

*   Next to each FSM in the list, there is an "Edit" link.
*   Clicking "Edit" will take you to the FSM Editor page for that specific FSM.

## FSM Editor (\`/fsm/edit/:fsmId\`)

The FSM Editor provides a graphical visualization of the FSM and tools to modify its structure.

### 1. Visualization

*   A directed graph representing the FSMs states and transitions is displayed.
*   This graph is generated from the FSMs current definition. You can zoom and pan this graph.

### 2. Modifying the FSM

Changes made via the forms are saved to the FSMs JSON file on the server immediately, and the graph and displayed JSON definition will attempt to update.

*   **Add New State**:
    *   Enter a unique name for the new state in the "State Name" field.
    *   Click "Add State".
    *   The state will be added to the FSMs internal list of states (in the \`states\` array in the JSON). It will appear in dropdowns for selecting "From State" and "To State" for transitions. A state only becomes visible in the graph when it is part of a transition or set as the initial state.
*   **Add New Transition**:
    *   Enter a "Transition Name" (e.g., \`next\`, \`errorOccurred\`).
    *   Select a "From State" from the dropdown list of existing states.
    *   Select a "To State" from the dropdown list of existing states.
    *   Click "Add Transition". The new transition will be added to the FSMs definition.
*   **Edit Initial State**:
    *   Select the desired initial state for the FSM from the dropdown.
    *   Click "Set Initial State".
*   **Reload Graph/Data**:
    *   Click the "Reload Graph" button to manually refetch the FSM definition and DOT representation and re-render the graph. This is useful if an auto-update seems to have failed.

### 3. Raw JSON Definition

*   A read-only text area displays the current JSON definition of the FSM. This updates when changes are successfully saved.

## Logout

*   Click the "Logout" button in the navigation bar to end your web UI session.
