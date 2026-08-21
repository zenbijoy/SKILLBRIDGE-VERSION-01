const { withAppBuildGradle } = require("expo/config-plugins");

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const RELEASE_SIGNING_BLOCK = `${DEBUG_SIGNING_BLOCK}
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }`;

const DEBUG_RELEASE_TEMPLATE = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const SECURE_RELEASE_TEMPLATE = `        release {
            signingConfig signingConfigs.release`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (androidConfig) => {
    if (androidConfig.modResults.language !== "groovy") {
      throw new Error("SkillBridge release signing requires a Groovy app/build.gradle file.");
    }

    let contents = androidConfig.modResults.contents;

    if (!contents.includes("MYAPP_UPLOAD_STORE_FILE")) {
      if (!contents.includes(DEBUG_SIGNING_BLOCK)) {
        throw new Error("Unable to locate the Android debug signing block during prebuild.");
      }
      contents = contents.replace(DEBUG_SIGNING_BLOCK, RELEASE_SIGNING_BLOCK);
    }

    if (contents.includes(DEBUG_RELEASE_TEMPLATE)) {
      contents = contents.replace(DEBUG_RELEASE_TEMPLATE, SECURE_RELEASE_TEMPLATE);
    } else if (!contents.includes(SECURE_RELEASE_TEMPLATE)) {
      throw new Error("Unable to enforce non-debug Android release signing during prebuild.");
    }

    androidConfig.modResults.contents = contents;
    return androidConfig;
  });
};
