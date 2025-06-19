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

3.  **Configure Environment Variables:**
    Create a `.env` file in the root of the project.
    It should contain:
```env
API_TOKEN=your_secret_api_token_here
PORT=3000

# Web Interface Configuration
DISABLE_WEB_UI=false                 # Set to true to disable the web interface
WEB_PASSWORD=your_web_interface_password # Choose a strong password for web UI access
SESSION_SECRET=a_very_long_and_random_string_for_session_encryption # For session security

# Asterisk ARI Configuration
DISABLE_ARI=false # Set to true to disable ARI connection
ASTERISK_URL=http://localhost:8088/ari
ASTERISK_USERNAME=asterisk_user
ASTERISK_PASSWORD=asterisk_password
ASTERISK_APP_NAME=my-ari-app # Name for your Stasis application
```
    **Important:** Replace placeholder values with strong, unique secrets, especially for `API_TOKEN`, `WEB_PASSWORD`, and `SESSION_SECRET`.

4.  **Define State Machines:**
    Place your state machine definition JSON files in the `fsm_definitions` directory.
    Each file should represent one state machine. The filename (e.g., `myMachine.json`) will be used as its ID for management via the web UI. The JSON content must also include an `"id"` property that matches this filename ID.

    Example `example_fsm.json`:
```json
{
  "id": "example_fsm",
  "initial": "idle",
  // ... transitions, methods, externalApis ...
}
```
    See `docs/API.md` for more details on defining methods and external API calls.

5.  **Start the Server:**
    To start the server, use the Node Package Manager's start script.
    In your terminal, you would typically type:
```bash
npm start
```
    The server should now be running on the port specified in your `.env` file (default 3000). If the web UI is enabled, it will be accessible at `http://localhost:3000`.
