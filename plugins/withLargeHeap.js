const { withAndroidManifest } = require('expo/config-plugins');

function withLargeHeap(config) {
  return withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;
    const application = androidManifest.manifest.application?.[0];
    if (application) {
      application.$['android:largeHeap'] = 'true';
    }
    return modConfig;
  });
}

module.exports = withLargeHeap;
