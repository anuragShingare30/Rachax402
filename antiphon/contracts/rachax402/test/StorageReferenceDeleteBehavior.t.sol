// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {MockAgentIdentityRegistry} from "../src/mock/MockAgentIdentityRegistry.sol";

/**
 * @title StorageReferenceDeleteBehavior
 * @dev Simple test demonstrating that using storage reference in a loop
 *      is safe when delete happens AFTER the loop completes.
 *      This test uses MockAgentIdentityRegistry which uses storage references.
 */
contract StorageReferenceDeleteBehaviorTest is Test {
    MockAgentIdentityRegistry public registry;
    address public agent = address(0x1234);

    function setUp() public {
        registry = new MockAgentIdentityRegistry();
    }

    /**
     * @dev Test that updateAgentCard correctly removes old capabilities
     *      and adds new ones, proving storage reference in loop is safe
     *      when delete occurs after loop completion
     */
    function test_updateAgentCard_StorageReferenceDeleteBehavior() public {
        // Register agent with initial capabilities
        string[] memory initialCaps = new string[](3);
        initialCaps[0] = "cap1";
        initialCaps[1] = "cap2";
        initialCaps[2] = "cap3";

        vm.prank(agent);
        registry.registerAgent("initialCID", initialCaps);

        // Verify initial state
        string[] memory capsBeforeUpdate = registry.getAgentCapabilities(agent);
        assertEq(capsBeforeUpdate.length, 3, "Should have 3 initial capabilities");
        assertTrue(registry.agentHasCapability(agent, "cap1"), "Should have cap1");
        assertTrue(registry.agentHasCapability(agent, "cap2"), "Should have cap2");
        assertTrue(registry.agentHasCapability(agent, "cap3"), "Should have cap3");

        // Update agent card with new capabilities
        // This calls _removeAllCapabilities internally which uses storage reference in loop
        string[] memory newCaps = new string[](2);
        newCaps[0] = "newCap1";
        newCaps[1] = "newCap2";

        vm.prank(agent);
        registry.updateAgentCard("newCID", newCaps);

        // Old capabilities should be removed
        assertFalse(registry.agentHasCapability(agent, "cap1"), "cap1 should be removed");
        assertFalse(registry.agentHasCapability(agent, "cap2"), "cap2 should be removed");
        assertFalse(registry.agentHasCapability(agent, "cap3"), "cap3 should be removed");

        //  New capabilities should be added
        string[] memory capsAfterUpdate = registry.getAgentCapabilities(agent);
        assertEq(capsAfterUpdate.length, 2, "Should have 2 new capabilities");
        assertTrue(registry.agentHasCapability(agent, "newCap1"), "Should have newCap1");
        assertTrue(registry.agentHasCapability(agent, "newCap2"), "Should have newCap2");

        // CID should be updated
        assertEq(registry.getAgentCard(agent), "newCID", "CID should be updated");

        console.log("Storage reference delete behavior test passed!");
        console.log("Loop completed successfully before delete executed.");
    }

    /**
     * @dev Test with empty new capabilities to ensure complete removal works
     */
    function test_updateAgentCard_RemoveAllCapabilities() public {
        // Arrange
        string[] memory initialCaps = new string[](2);
        initialCaps[0] = "capA";
        initialCaps[1] = "capB";

        vm.prank(agent);
        registry.registerAgent("cidA", initialCaps);

        // Update with empty capabilities
        string[] memory emptyCaps = new string[](0);

        vm.prank(agent);
        registry.updateAgentCard("cidB", emptyCaps);

        // Asserts
        string[] memory finalCaps = registry.getAgentCapabilities(agent);
        assertEq(finalCaps.length, 0, "Should have no capabilities");
        assertFalse(registry.agentHasCapability(agent, "capA"), "capA should be removed");
        assertFalse(registry.agentHasCapability(agent, "capB"), "capB should be removed");
    }
}
