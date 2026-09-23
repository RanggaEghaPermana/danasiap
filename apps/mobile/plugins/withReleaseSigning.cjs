const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, config => {
    let source = config.modResults.contents;
    const marker = '// DanaSiap local release signing';
    if (source.includes(marker)) return config;
    source = source.replace('android {', `${marker}
def danaSigningFile = rootProject.file('../credentials/signing.properties')
def danaSigning = new Properties()
if (danaSigningFile.exists()) { danaSigningFile.withInputStream { danaSigning.load(it) } }

android {`);
    source = source.replace('signingConfigs {', `signingConfigs {
        release {
            if (danaSigningFile.exists()) {
                storeFile rootProject.file('../credentials/release.jks')
                storePassword danaSigning['storePassword']
                keyAlias danaSigning['keyAlias']
                keyPassword danaSigning['keyPassword']
            }
        }`);
    source = source.replace(/(buildTypes[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    config.modResults.contents = source;
    return config;
  });
};
