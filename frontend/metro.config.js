const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Block watching generated native android build artifacts and gradle caches
config.resolver.blockList = [
  /.*[/\\]android[/\\]build[/\\].*/,
  /.*[/\\]\.gradle[/\\].*/,
  /.*[/\\]\.transforms[/\\].*/,
];

module.exports = config;
