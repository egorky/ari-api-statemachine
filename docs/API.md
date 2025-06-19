# API Documentation

All API endpoints require Bearer Token authentication. The token should be provided in the `Authorization` header.
Example: `Authorization: Bearer your_secret_api_token`

The API token is configured in the `.env` file (`API_TOKEN`).

## Endpoints

### 1. Transition State in a Finite State Machine

*   **POST** `/api/fsm/:machineId/transition`
*   **Description:** Attempts to execute a named transition on the specified state machine. If lifecycle methods for the transition perform asynchronous operations (like external API calls), this endpoint will await their completion.
*   **URL Parameters:**
    *   `machineId` (string, required): The ID of the state machine (must match a definition file in `fsm_definitions` e.g., "example_fsm").
*   **Request Body (JSON):**
    ```json
    {
      "transitionName": "your_transition_name",
      "currentState": "current_fsm_state",
      "eventPayload": { "key": "value" },
      "initialData": { "customField": "customValue", "userId": 1 }
    }
    ```
    *   `transitionName` (string, required): The name of the transition to execute.
    *   `currentState` (string, required): The state from which the transition should occur.
    *   `eventPayload` (object, optional): Data passed to lifecycle methods.
    *   `initialData` (object, optional): Data mixed into the FSM instance, available via `this.<key>`.

*   **Success Response (200 OK):**
    ```json
    {
      "machineId": "example_fsm",
      "newState": "next_state",
      "possibleTransitions": ["transition1", "transition2"],
      "message": "Transition \"your_transition_name\" successful."
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Missing fields, or transition not possible.
    *   `401 Unauthorized`: Null or missing token.
    *   `403 Forbidden`: Invalid token.
    *   `404 Not Found`: State machine definition not found.
    *   `500 Internal Server Error`: Server-side errors, issues in lifecycle methods not related to external APIs.
    *   `502 Bad Gateway`: If an external API call configured within a lifecycle method fails.

### 2. List Available State Machines

*   **GET** `/api/fsm`
*   **Description:** Retrieves a list of available state machine definition IDs.
*   **Success Response (200 OK):**
    ```json
    {
      "availableFsms": ["example_fsm", "another_fsm"]
    }
    ```

## Defining State Machines with External API Calls

State machine definitions (`.json` files in `fsm_definitions`) can now include an `externalApis` section to configure external API calls, and lifecycle methods can be `async` to use them.

**Example `example_fsm.json` snippet:**
```json
{
  "id": "example_fsm",
  "initial": "idle",
  "externalApis": {
    "fetchUserData": {
      "url": "https://jsonplaceholder.typicode.com/users/{{payload.userId}}",
      "method": "GET",
      "timeout": 3000
    },
    "postSomeData": {
        "url": "https://api.example.com/data",
        "method": "POST",
        "body": {
            "info": "From {{fsm.id}}",
            "payloadValue": "{{payload.someValue}}"
        },
        "headers": {"X-Custom-Header": "value"}
    }
  },
  "transitions": [
    { "name": "start", "from": "idle", "to": "processing" }
    // ... other transitions
  ],
  "methods": {
    "onStart": "async function(lifecycle, eventPayload, fsm, makeExternalApiCall, axios) {
        console.log(\"Starting FSM, event payload:\", eventPayload);
        console.log(\"Initial FSM data traceId:\", fsm.traceId); // Assuming traceId was in initialData
        try {
            // eventPayload or fsm instance data can be used to customize the call
            const data = await makeExternalApiCall(\"fetchUserData\", fsm, eventPayload);
            fsm.retrievedData = data; // Store result on FSM instance
            console.log(\"Fetched data:\", data);

            // Example of using a different API call
            // const postPayload = { someValue: \"hello\" };
            // const postResult = await makeExternalApiCall(\"postSomeData\", fsm, postPayload);
            // console.log(\"Posted data, result:\", postResult);

        } catch (error) {
            console.error(\"External API call failed during onStart:\", error.message);
            // Optionally transition to an error state or re-throw to halt transition
            // return lifecycle.fsm.error(); // if an error transition exists
            throw error; // This will cause the API to return a 502 or 500
        }
    }"
    // ... other methods
  }
}
```

**Key points for `externalApis` and `methods`:**
-   **`externalApis` object:** Contains named configurations for API calls.
    -   `url`: URL of the external API. Can contain placeholders like `{{payload.someKey}}` or `{{fsm.someProperty}}` which will be replaced with values from the current event payload or FSM instance data respectively.
    -   `method`: HTTP method (GET, POST, PUT, etc.).
    -   `body`: For POST/PUT, the request body. Can also contain placeholders.
    -   `headers`: Optional HTTP headers.
    -   `timeout`: Optional request timeout in milliseconds.
-   **Lifecycle Methods (e.g., `onStart`, `onEnterStateName`):**
    -   Can be declared `async function(...)`.
    -   Are provided with `makeExternalApiCall` as the fourth argument (after `lifecycle`, `eventPayload`, `fsm`).
    -   `makeExternalApiCall(apiCallName, fsmInstance, eventPayload)`:
        -   `apiCallName`: Matches a key in the `externalApis` object.
        -   `fsmInstance`: The current FSM instance (usually just pass `fsm`).
        -   `eventPayload`: The current event payload, used for templating.
    -   The FSM instance (`fsm`) can be used to store results from API calls (e.g., `fsm.userData = await ...`).
    -   The `axios` instance is also available as the fifth argument if more custom HTTP logic is needed.
-   **Templating:** Simple placeholder replacement `{{source.key}}` is supported for `url` and `body` fields in `externalApis`. `source` can be `fsm` or `payload`.

**Example `curl` for a transition that might trigger an async call:**
```bash
curl -X POST -H "Content-Type: application/json"      -H "Authorization: Bearer your_secret_api_token"      -d '{
           "transitionName": "start",
           "currentState": "idle",
           "eventPayload": { "userId": 3 },
           "initialData": { "traceId": "xyz789" }
         }'      http://localhost:3000/api/fsm/example_fsm/transition
```
If the `onStart` method for `example_fsm` makes an API call, the server will wait for it to complete before sending the response. Check server logs for output from lifecycle methods and API calls.
