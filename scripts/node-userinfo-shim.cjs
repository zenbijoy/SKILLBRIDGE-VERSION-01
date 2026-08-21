// Some restricted Windows runners expose a user token but fail uv_os_get_passwd.
// tsx only needs the username to create an isolated temporary pipe directory.
const os = require("node:os");

// tsx launches a child Node process; make the same narrow fallback available
// there without requiring platform-specific environment syntax in package.json.
const portableShimPath = __filename.replace(/\\/g, "/");
if (!(process.env.NODE_OPTIONS || "").includes(portableShimPath)) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --require=${portableShimPath}`.trim();
}

const originalUserInfo = os.userInfo;

os.userInfo = function safeUserInfo(...args) {
  try {
    return originalUserInfo.apply(os, args);
  } catch (error) {
    if (!error || error.syscall !== "uv_os_get_passwd") throw error;
    return {
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || process.env.USER || "skillbridge-runner",
      homedir: process.env.USERPROFILE || process.cwd(),
      shell: null,
    };
  }
};
