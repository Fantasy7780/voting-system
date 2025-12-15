import { createConfig, http } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const CHAIN_ID_ENV = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const RPC_URL_ENV = process.env.NEXT_PUBLIC_RPC_URL;

// pick a reasonable RPC URL for each chain. 
function rpcUrlFor(chain: typeof hardhat): string {
  if (RPC_URL_ENV && chain.id === CHAIN_ID_ENV) return RPC_URL_ENV;
  return chain.rpcUrls.default.http[0];
}

export const config = createConfig({
  chains: [hardhat],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [hardhat.id]: http(rpcUrlFor(hardhat)),
    
  },
});
