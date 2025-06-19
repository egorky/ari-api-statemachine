require("dotenv").config();
const app = require("./app");
const ariService = require("./services/ariService");

const PORT = process.env.PORT || 3000;

ariService.connectAri().then(client => {
    if (client) {
        console.log("ARI service initialized and connected from server.js.");
        // Potentially pass ariService.doAriAction to stateMachineManager if needed globally,
        // but current design passes it per FSM instance in ariService.stasisStartHandler.
    } else {
        console.warn("ARI service failed to initialize. Check logs. ARI-dependent FSMs may not work.");
    }
}).catch(err => console.error("Error during initial ARI connection attempt from server.js:", err));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
