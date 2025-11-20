import { createConfig, http } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
    chains: [hardhat],
    connectors: [injected()],
    transports: {
        [hardhat.id]: http(process.env.NEXT_PUBLIC_RPC_HTTP || 'http://127.0.0.1:8545'),
    },
    ssr: true,
});
