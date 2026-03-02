import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Rachax402',
  projectId: '1741e7ac98d8c25ce68641ec7ca909f9', 
  chains: [baseSepolia],
  ssr: false,
});

// USDC contract on Base Sepolia
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

export const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const API_ENDPOINTS = {
  task: 'http://localhost:3001/api/task',
  health: 'http://localhost:3001/api/health',
} as const;

export const IDENTITY_REGISTRY = '0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb' as const;
