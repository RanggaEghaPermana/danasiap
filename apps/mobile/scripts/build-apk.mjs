import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const credentials = resolve(appRoot, 'credentials');
mkdirSync(credentials, {recursive: true, mode: 0o700});
chmodSync(credentials, 0o700);
const keyFile = resolve(credentials, 'release.jks');
const propertiesFile = resolve(credentials, 'signing.properties');
if (!existsSync(keyFile) && !existsSync(propertiesFile)) {
  const password = randomBytes(32).toString('hex');
  execFileSync('keytool', ['-genkeypair', '-v', '-storetype', 'JKS', '-keystore', keyFile, '-alias', 'danasiap', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-storepass:env', 'DANASIAP_SIGNING_PASSWORD', '-keypass:env', 'DANASIAP_SIGNING_PASSWORD', '-dname', 'CN=DanaSiap, OU=Mobile, O=DanaSiap, L=Jakarta, C=ID'], {env: {...process.env, DANASIAP_SIGNING_PASSWORD: password}, stdio: 'inherit'});
  writeFileSync(propertiesFile, `storePassword=${password}\nkeyPassword=${password}\nkeyAlias=danasiap\n`, {mode: 0o600});
  chmodSync(keyFile, 0o600);
} else if (!existsSync(keyFile) || !existsSync(propertiesFile)) {
  throw new Error('Signing credentials incomplete; restore the existing key pair. Do not replace a release key.');
}
execFileSync('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'], {cwd: appRoot, stdio: 'inherit', env: {...process.env, CI: '1'}});
execFileSync('./gradlew', ['assembleRelease', '--no-daemon', '--max-workers=2', '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64'], {cwd: resolve(appRoot, 'android'), stdio: 'inherit', env: {...process.env, NODE_ENV: 'production'}});
const {version} = JSON.parse(readFileSync(resolve(appRoot, 'app.json'), 'utf8')).expo;
const apkName = `danasiap-${version}.apk`;
const artifactDir = resolve(appRoot, 'artifacts');
mkdirSync(artifactDir, {recursive: true});
const destination = resolve(artifactDir, apkName);
copyFileSync(resolve(appRoot, 'android/app/build/outputs/apk/release/app-release.apk'), destination);
const checksum = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.sha256`, `${checksum}  ${apkName}\n`);
const rootArtifactDir = resolve(appRoot, '../../artifacts');
if (existsSync(rootArtifactDir)) {
  copyFileSync(destination, resolve(rootArtifactDir, apkName));
  writeFileSync(resolve(rootArtifactDir, `${apkName}.sha256`), `${checksum}  ${apkName}\n`);
}
console.log(`Signed APK: ${destination}\nSHA256: ${checksum}\nKeep the private credentials directory safely backed up to sign future updates.`);
