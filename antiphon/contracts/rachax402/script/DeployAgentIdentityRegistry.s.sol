// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract DeployAgentIdentityRegistry is Script {
    AgentIdentityRegistry public identityRegistry;

    function run() external {
        vm.startBroadcast();
        
        identityRegistry = new AgentIdentityRegistry();
        
        console.log("AgentIdentityRegistry deployed at:", address(identityRegistry));
        
        vm.stopBroadcast();
    }
}