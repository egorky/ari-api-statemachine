# Web User Interface (Web UI) Guide

This guide explains how to use the web interface to manage and graphically edit Finite State Machine (FSM) definitions.

## Accessing the Web UI

If the web UI is not disabled (i.e., `DISABLE_WEB_UI` in your `.env` file is not set to `"true"`), it can be accessed by navigating to the root URL of the application (e.g., `http://localhost:3000` by default).

## Login

The web interface is password-protected.
*   Navigate to `/login`.
*   Enter the password specified in the `WEB_PASSWORD` environment variable.
*   Click "Login".

Upon successful login, you will be redirected to the Dashboard.

## Dashboard (`/dashboard`)

The dashboard is the main page for managing FSM definitions.

*   **List FSMs:** Displays all available FSM definitions from the `fsm_definitions/` directory. Each FSM's ID (derived from its filename) is shown.
*   **Upload New FSM:**
    *   Allows uploading a new FSM definition via a JSON file.
    *   **File Requirements:**
        *   Must be a valid JSON file (e.g., `my_fsm.json`).
        *   The JSON content must include a top-level `"id"` property.
        *   The value of this `"id"` property must match the filename (excluding the `.json` extension).
    *   Click "Choose File", select the file, and click "Upload".
*   **Edit:** Provides links to edit an FSM using either the Graphical Editor or the Text-Based Editor.
*   **Delete:** Allows deletion of an FSM definition file from the server (confirmation is required).

## Graphical FSM Editor (`/fsm/edit-graphical/:machineId`)

This is the primary interface for visually creating and editing FSMs.

*   **Overview:**
    *   **Graph Visualization (Left Pane):** Displays a real-time `d3-graphviz` rendering of the FSM's structure (states and transitions) based on its current definition. This view is read-only but updates as you make changes or reload.
    *   **Graphical Editor (Right Pane - Drawflow):** An interactive workspace to create, arrange, and connect state nodes.
    *   **Action Buttons:** Above the Drawflow area, buttons for adding states, setting the initial state, and configuring actions for selected states. When a transition (connection between states) is selected, an 'Add/Edit Actions' button and an action indicator for that transition will appear.
    *   **Raw JSON Definition:** A read-only textarea at the bottom shows the complete JSON definition of the FSM, which updates upon saving.

*   **Creating States:**
    *   Click the "Add State Node" button. A new state node appears in the Drawflow editor with a default name (e.g., "State1").
*   **Editing State Names:**
    *   Double-click on a state node's name within the Drawflow editor. An input field will appear, allowing you to change the name. Press Enter or click outside to save.
*   **Creating Transitions:**
    *   Click and drag from one of the connection points on a state node to a connection point on another state node (or the same node for self-transitions). A visual line representing the transition will be drawn.
    *   *(Note: Naming transitions directly on these visual connections is not currently supported in the UI. Transition names are either generated upon saving or preserved if the FSM was loaded from a JSON that already defined them.)*
*   **Setting Initial State:**
    *   Select a state node in the Drawflow editor by clicking on it.
    *   Click the "Set Selected as Initial" button. The selected node will be marked (e.g., with a border) as the initial state.
*   **Selecting Transitions and Configuring Actions:**
    *   Transitions (the lines connecting states) can be selected by clicking on them.
    *   Once a transition is selected, an 'Add/Edit Actions' button becomes available. Similar to state actions, an indicator next to this button will show the count of actions configured for this specific transition.
    *   Clicking the 'Add/Edit Actions' button for a selected transition opens the **Action Configuration Modal**, allowing you to define a sequence of actions that will execute when that specific transition occurs.
*   **Configuring Actions (for States and Transitions):**
    *   Actions can be configured to occur when a state is entered (`onEntry`), when a state is exited (`onExit`), or when a specific transition is taken.
    *   **Select a State or Transition:** Click on a state node or a transition line in the Drawflow editor.
    *   **Action Buttons:** Depending on the selection, relevant action buttons become available (e.g., "Add onEntry Action" for a state, or "Add/Edit Actions" for a transition).
    *   **Action Indicator:** Text next to these buttons (e.g., "Actions: onEntry (1)" or "Actions (2)") indicates how many actions are configured for the selected item and context.
    *   **Opening the Modal:** Clicking the appropriate action button opens the **Action Configuration Modal**.
    *   **Action Configuration Modal:**
        *   **Modal Title:** The title of the modal will indicate whether you are configuring actions for a state's `onEntry`/`onExit` hook or for a selected transition (e.g., 'Configure onEntry for Node StateA' or 'Configure Actions for Transition conn-1-output_1-2-input_1').
        *   **Action Type (Legacy - may be removed/simplified):** A dropdown to select either "External API Call" (`externalApi`) or "ARI Action" (`ari`). Currently, the graphical editor primarily supports `externalApi` type actions. For `ari` actions, manual JSON editing might be required. The fields below change based on this selection.
        *   **External API Fields:**
            *   `Request URL`: URL of the external API. Supports placeholders.
            *   `Request Method`: GET, POST, PUT, DELETE, PATCH.
            *   `Headers (JSON format)`: e.g., `{ "Content-Type": "application/json" }`. Supports placeholders.
            *   `Body (JSON format)`: Request payload. Supports placeholders.
            *   `Store Response As`: FSM variable name to store the API response.
        *   **ARI Fields (Primarily for manual JSON editing, limited UI support for creation):**
            *   `ARI Operation`: Dropdown of available operations (e.g., `answer`, `hangup`, `playAudio`, `getData`, `originateCall`).
            *   `Parameters (JSON format)`: Parameters for the chosen ARI operation. Supports placeholders.
            *   `Store Result As`: FSM variable name to store the result of the ARI operation.
        *   **Common Action Fields (for both types):**
            *   `On Success Transition`: Optional FSM transition name if the action succeeds.
            *   `On Failure Transition`: Optional FSM transition name if the action fails.
        *   **Actions List:** The modal displays a list of actions already configured for the current context (e.g., all `onEntry` actions for the selected state, or all actions for the selected transition). Each listed action has "Edit" and "Delete" buttons.
        *   **Saving/Canceling:**
            *   "Save Action": Adds the new action or updates the currently edited one in the selected item's data (node data for state actions, internal `connectionActions` map for transition actions). The form clears for potentially adding another action.
            *   "Cancel" / Close button (X): Closes the modal without saving the current form's changes.
*   **Saving the FSM:**
    *   Click the "Save Graphical Definition" button. This converts the Drawflow diagram and associated action data into the FSM JSON format and saves it to the server. The graph visualization and raw JSON text area will update.
*   **Reloading Data:**
    *   Click "Reload Graph". This re-fetches the FSM definition from the server, updates the raw JSON view, re-renders the d3-graphviz visualization, and reloads the definition into the Drawflow editor (preserving layout and actions).

## Text-Based FSM Editor (`/fsm/edit/:machineId`)

This provides a simpler interface for viewing and directly editing the FSM's JSON definition.

*   **Functionality:**
    *   Displays the FSM ID and its current JSON definition in a textarea.
    *   Allows direct modification of the JSON content.
    *   Provides forms to add states, add transitions, and set the initial state by manually entering the required string values. These are saved directly to the JSON.
    *   Includes a "Reload Graph" button to update the d3-graphviz visualization based on the current JSON content in the textarea.
*   **Use Cases:** Useful for quick text-based edits, reviewing the raw JSON, or for users who prefer direct JSON manipulation.

## Logout

Click the "Logout" button in the navigation bar to end your web UI session and return to the login page.
