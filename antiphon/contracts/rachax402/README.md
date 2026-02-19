# Getting Started


## File and Folder structure

`/src/AgentIdentityRegistry.sol` - contract that allows agents to register with their agent card CIDs, tags and enables discovery by capability tags

`/src/AgentReputationRegistry.sol` - contract for storing ratings and calculating reputation scores for agents with rate limiting

`/test/AgentIdentityRegistry.t.sol` - tests for AgentIdentityRegistry contract

`/test/AgentReputationRegistry.t.sol` - tests for AgentReputationRegistry contract



## Build and Testing

- Install **foundry** if not installed already. You can follow the below steps:
```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc 
foundryup
```

- To install necessary libraries and build the contracts, run:
```bash
cd antiphon/contracts/rachax402
forge install foundry-rs/forge-std
forge build
```

- To test the contracts, run:
```bash
cd antiphon/contracts/rachax402

# for AgentIdentityRegistry contract
forge test --match-contract AgentIdentityRegistryTest -vvv

# for AgentReputationRegistry contract
forge test --match-contract AgentReputationRegistryTest -vvv

# for StorageReference Behavior contract Test
forge test --match-contract StorageReferenceDeleteBehaviorTest -vvv

# for fuzz testing
forge test --match-contract AgentReputationRegistryFuzzTest -vvv
forge test --match-contract AgentIdentityRegistryFuzzTest -vvv

# for invariant testing
forge test --match-contract AgentReputationRegistryInvariantTest -vvv
forge test --match-contract AgentIdentityRegistryInvariantTest -vvv
```

- To check the coverage report, run:
```bash
cd antiphon/contracts/rachax402
forge coverage
```


## Deploy Contract on Anvil(testing locally)

- To deploy the contracts on Anvil(locally), run:
```bash
cd antiphon/contracts/rachax402

# first terminal
anvil

# second terminal, deploy both contracts together(recommended)
forge script script/Deploy.s.sol:Deploy --broadcast --rpc-url http://localhost:854

# Deploy contracts separately
# Deploy Identity Registry
forge script script/DeployAgentIdentityRegistry.s.sol --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

# Deploy Reputation Registry
forge script script/DeployAgentReputationRegistry.s.sol --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
```

> Note: private key used here is test key provided by anvil, do not use in production environment


## Deploy Contract on Base Sepolia Testnet

- To deploy the contracts on Base Sepolia Testnet, run:
```bash
# deploy identity registry contract
forge script ./script/DeployAgentIdentityRegistry.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv

# deploy reputation registry contract
forge script ./script/DeployAgentReputationRegistry.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv
```

> Or, directly interact with the deployed contracts using the following addresses and ABIs on Etherscan


## Deployed Contracts Address(Base Sepolia Testnet)

- Both Contracts are deployed on Base Sepolia Testnet and Verified successfully on Etherscan
```bash
ERC8004_IDENTITY_REGISTRY=0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb
ERC8004_REPUTATION_REGISTRY=0x3FdD300147940a35F32AdF6De36b3358DA682B5c
```

- Transaction Hashes for deployment:
```bash
IDENTITY_REGISTRY_DEPLOYMENT_TX_HASH=0x475ece37b46f9f5c7736b99d7730cd4aa95dfea234d0340e367db071a04368bf
REPUTATION_REGISTRY_DEPLOYMENT_TX_HASH=0x8d838194a700bb36723804d918df19359a8e540b583937ea4dba8f968ee499d5
```


## Get your alchemy API Keys

- Visit: `https://dashboard.alchemy.com/` and create a free account to get api keys and rpc urls for different testnets and mainnets.