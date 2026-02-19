// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AgentReputationRegistry} from "../src/AgentReputationRegistry.sol";

contract DeployAgentReputationRegistry is Script {
    AgentReputationRegistry public reputationRegistry;

    function run() external {
        vm.startBroadcast();
        
        reputationRegistry = new AgentReputationRegistry();
        
        console.log("AgentReputationRegistry deployed at:", address(reputationRegistry));
        
        vm.stopBroadcast();
    }
}