// Publishes an over-the-air update (EAS Update) to installed builds.
//   npm run update:preview -- "What changed"
//
// `eas update` bundles the app on this computer, so it would read mobile/.env (the local server).
// The server address is set here instead, to the one the builds on that channel use (eas.json).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const channel = process.argv[2];
const message = process.argv.slice(3).join(' ').trim();
const profiles = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
const profile = Object.values(profiles).find((p) => p.channel === channel);
const server = profile?.env?.EXPO_PUBLIC_API_URL;

if (!channel || !message) {
  console.error('Usage: npm run update:<channel> -- "What changed"');
  process.exit(1);
}
if (!server) {
  console.error(`eas.json has no build profile on channel "${channel}" with env.EXPO_PUBLIC_API_URL.`);
  process.exit(1);
}

console.log(`Publishing to "${channel}" with server ${server}`);
const result = spawnSync('npx', ['eas-cli@latest', 'update', '--channel', channel, '--message', message], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  // Real environment variables win over .env files, so phones get the live server.
  env: { ...process.env, EXPO_PUBLIC_API_URL: server, EXPO_PUBLIC_PHONE_API_URL: server },
});
process.exit(result.status ?? 1);
