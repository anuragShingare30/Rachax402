# Getting Started


## File and Folder structure

`/src/AgentIdentityRegistry.sol` - contract that allows agents to register with their agent card CIDs, tags and enables discovery by capability tags

`/src/AgentReputationRegistry.sol` - contract for storing ratings and calculating reputation scores for agents with rate limiting

`/test/AgentIdentityRegistry.t.sol` - tests for AgentIdentityRegistry contract

`/test/AgentReputationRegistry.t.sol` - tests for AgentReputationRegistry contract



## Build and Testing

- To install necessary libraries and build the contracts, run:
```bash
cd antiphon/contracts/rachax402
forge install
forge build
```

- To test the contracts, run:
```bash
cd antiphon/contracts/rachax402
# for AgentIdentityRegistry contract
forge test --match-contract AgentIdentityRegistryTest -vvv

# for AgentReputationRegistry contract
forge test --match-contract AgentReputationRegistryTest -vvv
```

- To check the coverage report, run:
```bash
cd antiphon/contracts/rachax402
forge coverage
```