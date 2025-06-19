# FSM Definition JSON Structure

This document details the JSON format used for defining Finite State Machines (FSMs) in this system. These JSON files are stored in the `fsm_definitions/` directory.

## Top-Level Properties

| Property      | Type             | Required | Description                                                                                                                               |
|---------------|------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `id`          | String           | Yes      | A unique identifier for the FSM. This **must** match the filename (excluding the `.json` extension).                                      |
| `initial`     | String           | Yes      | The name of the initial state the FSM will be in upon creation. This state name must exist in the `states` definition or be inferable from `transitions`. |
| `states`      | Object or Array  | No       | Defines the states of the FSM and their lifecycle hooks (e.g., `onEntry`, `onExit`). See [Defining States](#defining-states).                 |
| `transitions` | Array            | Yes      | An array of transition objects that define how the FSM moves between states. See [Defining Transitions](#defining-transitions).             |
| `methods`     | Object           | No       | A collection of named JavaScript functions that can be used as lifecycle event handlers for states and transitions. See [Defining Methods](#defining-methods). |
| `externalApis`| Object           | No       | Configurations for named, reusable external API calls that can be invoked from `methods`. See [External API Calls](#external-api-calls). |
| `ariActions`  | Object           | No       | (Primarily for ARI FSMs) Can define specific ARI-related action configurations if needed, though `doAriAction` in methods is more common. |

**Example (Minimal):**
```json
{
  "id": "minimal_fsm",
  "initial": "idle",
  "transitions": [
    { "name": "start", "from": "idle", "to": "running" },
    { "name": "stop", "from": "running", "to": "idle" }
  ]
}
```

## Defining States

The `states` property can be an object where keys are state names, or an array of state objects. If omitted, states are inferred from transitions. It's recommended to define states explicitly if you need to attach `onEntry` or `onExit` lifecycle hooks.

**Syntax (Object of States):**
```json
"states": {
  "idle": {}, // A simple state with no specific hooks
  "running": {
    "onEntry": "function(lifecycle) { console.log('Entering running state for FSM: ' + this.id); }",
    "onExit": [ // onEntry/onExit can also be an array of actions (see External API Calls)
      {
        "type": "externalApi",
        "request": { "url": "http://localhost:3000/api/log", "method": "POST", "body": {"fsmId": "{{fsm.id}}", "event": "exit_running"} },
        "storeResponseAs": "logExitResult"
      }
    ]
  },
  "error": {
    "onEntry": "error_handler_method" // Reference a method defined in the top-level "methods" object
  }
}
```

*   **State Name (key):** The unique name of the state (e.g., "idle", "running").
*   **State Object (value):**
    *   `onEntry`: A string containing a JavaScript function, the name of a method from the `methods` block, or an array of [Action Objects](#action-objects). Executed when entering the state.
    *   `onExit`: Similar to `onEntry`. Executed when exiting the state.

## Defining Transitions

The `transitions` property is an array of objects, each defining a possible state change.

**Syntax (Transition Object):**
```json
{
  "name": "start_processing",
  "from": "idle",
  "to": "processing",
  "action": { /* Optional Action Object */ }
}
```
Or with multiple 'from' states:
```json
{
  "name": "reset",
  "from": ["processing", "error"], // Can be a string or an array of state names
  "to": "idle"
}
```
Or a wildcard 'from' state:
```json
{
  "name": "global_error_handler",
  "from": "*", // Transition can occur from any state
  "to": "error_state"
}
```

*   `name` (String, required): The name of the transition. This is used to trigger the transition (e.g., `fsm.start_processing()`).
*   `from` (String or Array, required): The name(s) of the state(s) from which this transition can occur. Use `"*"` for a wildcard (any state).
*   `to` (String, required): The name of the state to which this transition leads.
*   `action` (Object or Array, optional): An [Action Object](#action-objects) or an array of them to be executed during this transition.

## Defining Methods

The `methods` property is an object where keys are method names and values are strings containing JavaScript function bodies. These methods can be referenced by name in state `onEntry`/`onExit` hooks or as transition lifecycle callbacks (e.g., `onStartProcessing`, `onBeforeStartProcessing`, `onAfterStartProcessing`, `onLeaveIdle`, `onEnterProcessing`).

**Injected Scope for Methods:**
When these string functions are executed, they have access to the following in their scope:
1.  `lifecycle` (Object): The standard `javascript-state-machine` lifecycle object.
2.  `eventPayload` (Object): The payload passed when the transition was triggered or data relevant to the lifecycle event.
3.  `fsm` (or `this`): The FSM instance itself. You can read/write properties on it (e.g., `this.customData = 'value'`).
4.  `makeExternalApiCall` (Function): Helper to call named APIs from the `externalApis` block.
5.  `axios` (Object): The Axios instance for custom HTTP calls.
6.  `doAriAction` (Function): (For ARI FSMs) Helper to execute Asterisk ARI commands.

**Syntax:**
```json
"methods": {
  "logTransition": "function(lifecycle, payload) { console.log('Transition ' + lifecycle.transition + ' from ' + lifecycle.from + ' to ' + lifecycle.to + ' with payload:', payload); }",
  "initializeUser": "async function(lifecycle, payload, fsm, makeExternalApiCall) {
    fsm.user = await makeExternalApiCall('fetchUserData', fsm, payload);
  }"
}
```

## External API Calls

There are two ways to define and execute external API calls:
1.  **Named API Calls via `externalApis` block and `makeExternalApiCall`:**
    Define reusable API configurations in the top-level `externalApis` object.
    ```json
    "externalApis": {
      "fetchUserData": {
        "url": "https://api.example.com/users/{{payload.userId}}",
        "method": "GET",
        "timeout": 5000,
        "headers": { "X-API-Version": "2" }
      },
      "updateProfile": {
        "url": "https://api.example.com/users/{{fsm.currentUser.id}}",
        "method": "POST",
        "body": { "email": "{{payload.email}}" }
      }
    }
    ```
    Then, call these from your string functions in `methods` or state hooks:
    ```javascript
    // Inside a method string:
    // async function(lifecycle, payload, fsm, makeExternalApiCall) {
    //   const user = await makeExternalApiCall('fetchUserData', fsm, payload);
    //   fsm.currentUser = user;
    //   await makeExternalApiCall('updateProfile', fsm, { email: 'new@example.com' });
    // }
    ```

2.  **Inline Declarative Actions:**
    Define API calls directly within `transitions` (using the `action` property) or state `onEntry`/`onExit` hooks (as an array of action objects).

    **Action Object Structure (`type: "externalApi"`):**
    ```json
    {
      "type": "externalApi",
      "request": {
        "url": "https://api.example.com/data",
        "method": "POST", // GET, PUT, DELETE, etc.
        "body": { "key": "value", "dynamic": "{{payload.someData}}" }, // JSON body
        // "body": "raw string data with {{payload.value}}", // Can also be a string
        "headers": { "X-Custom-Header": "MyValue" },
        "timeout": 3000 // Optional, in milliseconds
      },
      "storeResponseAs": "fsmPropertyName", // Optional: Stores API response on fsm[fsmPropertyName]
      "onSuccess": "successTransitionName", // Optional: FSM transition to trigger on API success (2xx status)
      "onFailure": "failureTransitionName"  // Optional: FSM transition to trigger on API failure
    }
    ```
    *   `type`: Must be `"externalApi"`.
    *   `request`: Object defining the HTTP call (url, method, body, headers, timeout).
    *   `storeResponseAs`: If provided, the API response data will be stored on the FSM instance (e.g., `fsm.fsmPropertyName = responseData`).
    *   `onSuccess`: If the API call is successful (2xx status), and this transition name is provided and valid from the current state, the FSM will attempt to execute this transition. The API response data is passed as `{ "apiResponse": responseData }` in the event payload to this success transition.
    *   `onFailure`: If the API call fails, and this transition name is provided and valid, the FSM will attempt to execute this transition. The error message is passed as `{ "apiError": errorMessage }` in the event payload. If no `onFailure` transition is taken, the error will propagate and might cause the main FSM transition to fail.

    **Example in a transition:**
    ```json
    "transitions": [
      {
        "name": "fetchAndProcess",
        "from": "start",
        "to": "interim_processing", // State entered if original method (if any) completes & no onSuccess/onFailure redirect
        "action": {
          "type": "externalApi",
          "request": { "url": "http://example.com/api/resource/{{payload.id}}" },
          "storeResponseAs": "resourceData",
          "onSuccess": "processResourceData", // Transition to 'processResourceData' on API success
          "onFailure": "handleFetchError"     // Transition to 'handleFetchError' on API failure
        }
      }
    ]
    ```
    **Example in a state's `onEntry`:**
    ```json
    "states": {
      "waitForData": {
        "onEntry": [ // Array of actions
          {
            "type": "externalApi",
            "request": { "url": "http://my-service/data" },
            "storeResponseAs": "serviceData"
          },
          { // Another action can follow
            "type": "externalApi",
            "request": { "url": "http://another-service/log", "method": "POST", "body": {"info": "entered waitForData"} }
          }
        ]
      }
    }
    ```

## Placeholder Syntax

In `externalApis` configurations (for `url`, `body` values, `header` values) and in `action.request` objects, you can use placeholders:
*   `{{payload.key}}` or `{{eventPayload.key}}`: Replaced with the value of `key` from the `eventPayload` object passed to the current lifecycle method or transition.
*   `{{fsm.key}}`: Replaced with the value of `key` from the FSM instance itself (e.g., data set by `initialData` or previous actions/methods).

Placeholders support basic dot-notation for nested properties (e.g., `{{payload.user.id}}`).

This structure provides flexibility for defining simple to complex state machine logic, including interactions with external systems.
```
