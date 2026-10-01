const { execSync } = require("child_process");
const fs = require("fs");

try {
  const buf = execSync("adb exec-out screencap -p", { maxBuffer: 25 * 1024 * 1024 });
  fs.writeFileSync("app_live_shot.png", buf);
  console.log("Screenshot saved to app_live_shot.png");
} catch (err) {
  console.error("Error capturing screenshot:", err.message);
  process.exit(1);
}
