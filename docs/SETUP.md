# Project Setup

## Prerequisites
- Node.js (v14 or later recommended)
- npm

## Installation

1.  **Clone the repository (or create project files):**
```bash
# git clone <repository_url>
# cd <project_directory>
```

2.  **Install dependencies:**
```bash
npm install
```

3.  **Environment Variables Configuration:**

    Create a `.env` file in the root of the project by copying the `.env.example` file:
    ```bash
    cp .env.example .env
    ```
    Then, modify the `.env` file with your specific settings. Below are the essential variables:

    *   **`PORT`**
        *   **Description:** Defines the port the application will listen on.
        *   **Example:** `PORT=3000`
        *   **Default:** If not set, the application might default to a port like 3000 or 8080, but it's best to set it explicitly. (Application default is 3000 if `process.env.PORT` is not set, but `app.listen` in `bin/www` or `server.js` might have its own default if not specified there from `.env`). *Self-correction: The application's `bin/www` likely sets a default if `process.env.PORT` is undefined, but standard practice is to rely on `.env`.*

    *   **`API_TOKEN`**
        *   **Description:** A strong, secret token used to authenticate API requests. This is crucial for securing your API endpoints.
        *   **Example:** `API_TOKEN="your_very_secure_and_random_api_token_string"`
        *   **Default:** The application will likely fail to secure API endpoints or use a known placeholder if not set, posing a security risk. The `authenticateToken` middleware now explicitly checks if the token is a placeholder or missing and returns an error.

    *   **`WEB_PASSWORD`**
        *   **Description:** Password to access the web user interface.
        *   **Example:** `WEB_PASSWORD="a_complex_password_123!"`
        *   **Default:** Access to the web UI might be unsecured or use a default known password if not set. It's critical to set this for any deployment with an enabled web UI.

    *   **`SESSION_SECRET`**
        *   **Description:** A secret key used by `express-session` to sign the session ID cookie. This helps protect session data from being tampered with.
        *   **Example:** `SESSION_SECRET="another_super_long_random_and_unguessable_string"`
        *   **Default:** If not set, the application uses a fallback `"defaultfallbacksecret"`, which is **not secure for production**. A warning is typically issued by `express-session` if a weak secret is used.

    *   **`DISABLE_WEB_UI`**
        *   **Description:** Controls whether the web user interface is enabled. Set this to `"true"` for API-only deployments.
        *   **Example:** `DISABLE_WEB_UI="true"`
        *   **Default:** If set to `"false"`, left unset, or set to any value other than `"true"`, the web UI will be enabled.
        *   **Effect if `"true"`:** All web-related middleware (EJS templating, static file serving for UI, session management, CSRF protection, web routes) will be disabled. The application will only serve API endpoints.

    *   **`DISABLE_ARI`**
        *   **Description:** Controls whether the application attempts to connect to the Asterisk REST Interface (ARI). Set this to `"true"` if Asterisk integration is not needed or not configured.
        *   **Example:** `DISABLE_ARI="true"`
        *   **Default:** If set to `"false"`, left unset, or set to any value other than `"true"`, the application will attempt to connect to ARI using the other `ASTERISK_ARI_*` variables.
        *   **Effect if `"true"`:** The `ariService.connectAri()` function will not be called, and no connection to Asterisk will be established.

    *   **`ASTERISK_ARI_URL`**
        *   **Description:** The base URL for the Asterisk ARI WebSocket interface. The `ari-client` library typically appends `/ari/events?app=<appName>` for the WebSocket and uses this base for HTTP calls.
        *   **Example:** `ASTERISK_ARI_URL="http://asterisk_server:8088"`
        *   **Default:** Required if `DISABLE_ARI` is not `"true"`. The application will fail to connect to ARI if this is not set correctly.

    *   **`ASTERISK_ARI_USERNAME`**
        *   **Description:** The username for ARI authentication.
        *   **Example:** `ASTERISK_ARI_USERNAME="my_ari_user"`
        *   **Default:** Required if `DISABLE_ARI` is not `"true"`.

    *   **`ASTERISK_ARI_PASSWORD`**
        *   **Description:** The password for ARI authentication.
        *   **Example:** `ASTERISK_ARI_PASSWORD="very_secret_ari_password"`
        *   **Default:** Required if `DISABLE_ARI` is not `"true"`.

    *   **`ASTERISK_ARI_APP_NAME`**
        *   **Description:** The application name to register with ARI. This is used by Asterisk to differentiate Stasis application connections and route events.
        *   **Example:** `ASTERISK_ARI_APP_NAME="my_fsm_controller_app"`
        *   **Default:** Required if `DISABLE_ARI` is not `"true"`. The `ari-client` library often defaults this to `"ari-client-js"`, but it's best to set it explicitly.

    **Important Security Note:** Always use strong, unique, and randomly generated values for `API_TOKEN`, `WEB_PASSWORD`, and `SESSION_SECRET` in any production or publicly accessible environment. Do not commit your actual `.env` file with real secrets to version control.

4.  **Define State Machines:**
    Place your state machine definition JSON files in the `fsm_definitions` directory.
    Each file should represent one state machine. The filename (e.g., `myMachine.json`) will be used as its ID for management via the web UI. The JSON content must also include an `"id"` property that matches this filename ID.

    Example `example_fsm.json`:
```json
{
  "id": "example_fsm",
  "initial": "idle",
  // ... transitions, states with actions, etc. ...
}
```
    See `docs/FSM_DEFINITIONS.md` for comprehensive details on defining state machine JSON.

5.  **Start the Server:**
    To start the server, use the Node Package Manager's start script.
    In your terminal, you would typically type:
```bash
npm start
```
    The server should now be running on the port specified in your `.env` file (default 3000). If the web UI is enabled, it will be accessible at `http://localhost:3000`.
