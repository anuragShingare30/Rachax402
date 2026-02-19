// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";
import {AgentReputationRegistry} from "../src/AgentReputationRegistry.sol";

contract DeployAll is Script {
    AgentIdentityRegistry public identityRegistry;
    AgentReputationRegistry public reputationRegistry;

    function run() external {
        vm.startBroadcast();
        
        // Deploy AgentIdentityRegistry
        identityRegistry = new AgentIdentityRegistry();
        console.log("AgentIdentityRegistry deployed at:", address(identityRegistry));
        
        // Deploy AgentReputationRegistry
        reputationRegistry = new AgentReputationRegistry();
        console.log("AgentReputationRegistry deployed at:", address(reputationRegistry));
        
        vm.stopBroadcast();
    }
}
