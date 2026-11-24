// Fail fast with a clear message on old Node versions (node:sqlite needs 22.13+).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Ajaia Docs needs Node.js 22.13 or newer (you have ${process.version}). Install the LTS from https://nodejs.org`);
  process.exit(1);
}
