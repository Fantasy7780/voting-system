const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'artifacts/contracts/Voting.sol/Voting.json');
const dstDir = path.join(__dirname, '..', 'web/src/abi');
const dst = path.join(dstDir, 'Voting.json');

fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(src, dst);
console.log('ABI exported to', dst);
