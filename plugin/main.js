// UXP treats scripts referenced by HTML as if they live at the plugin root.
// Load the application as a module so its own relative imports resolve from src/.
require("./src/index");
