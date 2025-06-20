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
*   **Edit:** Provides a link to edit an FSM using the Graphical Editor (`/fsm/edit-graphical/:machineId`). A Text-Based Editor (`/fsm/edit/:machineId`) is also available if accessed directly by its URL.
*   **Delete:** Allows deletion of an FSM definition file from the server (confirmation is required).

## Graphical FSM Editor (`/fsm/edit-graphical/:machineId`)

This is the primary interface for visually creating and editing FSMs.

*   **Overview:**
    *   **Graph Visualization (Left Pane):** Displays a real-time `d3-graphviz` rendering of the FSM's structure (states and transitions) based on its current definition. This view is read-only but updates as you make changes or reload.
    *   **Graphical Editor (Right Pane - Drawflow):** An interactive workspace to create, arrange, and connect state nodes.
    *   **Action Buttons:** Above the Drawflow area, buttons for adding states, setting the initial state, and configuring actions for selected states. When a transition (connection between states) is selected, an 'Add/Edit Actions' button and an action indicator for that transition will appear.
    *   **Raw JSON Definition:** A read-only textarea at the bottom shows the complete JSON definition of the FSM. This view updates when changes made through the graphical interface are saved via the "Save Graphical Definition" button. **Note:** This textarea itself is read-only. To directly edit the FSM's JSON content, you should use the "Text-Based FSM Editor" (accessible via the URL `/fsm/edit/:machineId`, where `:machineId` is your FSM's ID) which provides a save mechanism, or by directly editing the corresponding `.json` file on the server if you have filesystem access.

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
        *   **Action Type:** A dropdown to select the type of action to configure. The fields shown below will change based on this selection:
            *   `External API`: For making HTTP/HTTPS calls to external services.
            *   `ARI Operation`: For interacting with Asterisk via the Asterisk REST Interface (ARI).
        *   **External API Fields:** (Displayed when "External API" is selected as Action Type)
            *   `Request URL`: URL of the external API. Supports placeholders.
            *   `Request Method`: GET, POST, PUT, DELETE, PATCH.
            *   `Headers (JSON format)`: e.g., `{ "Content-Type": "application/json" }`. Supports placeholders.
            *   `Body (JSON format)`: Request payload. Supports placeholders.
            *   `Store Response As`: FSM variable name to store the API response.
        *   **ARI Operation Fields:** (Displayed when "ARI Operation" is selected as Action Type)
            *   `ARI Operation`: A dropdown list of available ARI operations (e.g., `answer`, `hangup`, `playAudio`).
            *   `Parameters (JSON format)`: A textarea for providing parameters for the chosen ARI operation, in JSON format (e.g., `{ "media": "sound:your-prompt" }`). Supports placeholders.
            *   `Store Result As`: An FSM variable name where the result of the ARI operation will be stored (if applicable).
        *   **Common Action Fields (for both types):**
            *   `On Success Transition`: Optional FSM transition name if the action succeeds.
            *   `On Failure Transition`: Optional FSM transition name if the action fails.
        *   **Actions List:** The modal displays a list of actions already configured for the current context (e.g., all `onEntry` actions for the selected state, or all actions for the selected transition). Each listed action has "Edit" and "Delete" buttons.
        *   **Handling Custom Function Strings:**
            *   If a state's `onEntry` or `onExit` hook, or a transition's `actions` property, is defined in the raw FSM JSON as a string (representing a custom JavaScript function name that should be available to the FSM execution environment via `methods` in the FSM definition) instead of an array of action objects, the Action Configuration Modal will adapt its display.
            *   The modal title will change to "View Custom Function (Edit in Raw JSON)".
            *   The list of actions within the modal will display a message like "Custom function defined (Edit in Raw JSON). No new actions can be added via UI if a custom function string is present."
            *   In this scenario, the form fields for defining a new structured action (like URL, method, etc.) will be disabled, as will the "Save Action" button for that specific hook.
            *   To modify or replace the custom function string, or to change the hook to use object-based actions, you will need to edit the FSM's raw JSON definition directly (e.g., via the Text-Based FSM Editor or by modifying the `.json` file).
        *   **Saving/Canceling:**
            *   "Save Action": Adds the new action or updates the currently edited one in the selected item's data (node data for state actions, internal `connectionActions` map for transition actions). The form clears for potentially adding another action.
            *   "Cancel" / Close button (X): Closes the modal without saving the current form's changes.
*   **Saving the FSM:**
    *   Click the "Save Graphical Definition" button. This converts the Drawflow diagram and associated action data into the FSM JSON format and saves it to the server. The graph visualization and raw JSON text area will update.
*   **Reloading Data:**
    *   Click "Reload Graph". This re-fetches the FSM definition from the server, updates the raw JSON view, re-renders the d3-graphviz visualization, and reloads the definition into the Drawflow editor (preserving layout and actions).
*   **Global List of Actions:**
    *   Below the "Raw JSON Definition" area, there's a section titled "All Defined Actions (Read-Only)".
    *   This feature provides a consolidated, read-only view of every action configured within the entire FSM definition. This includes `onEntry` and `onExit` actions for all states, as well as actions defined for all transitions.
    *   Click the "Load/Refresh All Actions" button to populate or update this list. The list is also automatically populated when the FSM data is initially loaded or reloaded.
    *   Each action in the list is displayed with:
        *   A sequential number.
        *   The context (e.g., "[State: idle - onEntry]", "[Transition: process_payment (from checkout to completed)]").
        *   A summary of the action (e.g., "Custom Function: handlePayment", "ARI - Op: playAudio", "API - POST https://api.example.com/submit...").
    *   This view is helpful for quickly understanding all automated operations the FSM performs without needing to click through each state and transition individually in the editor.

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
