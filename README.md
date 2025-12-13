# Quick Start

## Install

```bash
cd voting-system

# Back-end Hardhat 3, Ethers 6
npm i

# Front-end Next.js
cd web && npm i
```

## Deploy

Open two terminals.

**A. Local node**

Run:

```bash
cd voting-system
npm run node
```

**B. Compile & deploy**

Run:

```bash
cd voting-system
npm run compile
npm run deploy:local
# Note the deployed contract address
```

## Front-end

Create `web/.env.local`:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed-address>
NEXT_PUBLIC_CHAIN_ID=31337
```

Run:

```bash
cd voting-system/web
npm run dev
```

## 4) Tests

Run:

```bash
cd voting-system

npm run test
# 
# npx hardhat test --coverage
# npx hardhat test --gas-stats
```

## 5) Export Block

Run:

```bash
cd voting-system
npm i ethers@6
```

```bash
# latest block

node scripts/export-block-json.mjs latest
```

```bash
# specific block number

node scripts/export-block-json.mjs 15

```


Output: `scripts/out/`


**Notes**

* 
