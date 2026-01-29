// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "lib/forge-std/src/Vm.sol";
import {AgentIdentityRegistry} from "../src/AgentIdentityRegistry.sol";

contract AgentIdentityRegistryTest is Test {
    AgentIdentityRegistry public registry;

    // Test addresses
    address public agentA;
    address public agentB;
    address public agentC;

    // Test CIDs
    string public constant CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string public constant CID_B = "bafybeigvgzoolc3drupxhlevdp2ugqcrbcsqfmcek2zxiw5wctk3xjpjwy";
    string public constant CID_C = "bafybeihkoviema7g3gxyt6la7vd5ho32ictqbilu3ez5n5zvkdxjqpnqfa";
    string public constant UPDATED_CID = "bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq";

    // Test capability tags
    string[] public capabilitiesA;
    string[] public capabilitiesB;
    string[] public capabilitiesC;
    string[] public updatedCapabilities;
    string[] public emptyCapabilities;

    // Events to test
    event AgentRegistered(
        address indexed agent,
        string agentCardCID,
        string[] capabilityTags
    );
    event AgentCardUpdated(
        address indexed agent,
        string oldAgentCardCID,
        string newAgentCardCID,
        string[] newCapabilityTags
    );
    event CapabilityAdded(address indexed agent, string capability);
    event CapabilityRemoved(address indexed agent, string capability);

    function setUp() public {
        registry = new AgentIdentityRegistry();

        // Setup test addresses
        agentA = makeAddr("agentA");
        agentB = makeAddr("agentB");
        agentC = makeAddr("agentC");

        // Setup capability arrays
        capabilitiesA = new string[](2);
        capabilitiesA[0] = "csv-analysis";
        capabilitiesA[1] = "statistics";

        capabilitiesB = new string[](2);
        capabilitiesB[0] = "statistics";
        capabilitiesB[1] = "data-transformation";

        capabilitiesC = new string[](1);
        capabilitiesC[0] = "json-processing";

        updatedCapabilities = new string[](2);
        updatedCapabilities[0] = "machine-learning";
        updatedCapabilities[1] = "prediction";

        emptyCapabilities = new string[](0);
    }

    // registerAgent Tests

    function test_RegisterAgent_Success() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        assertTrue(registry.isAgentRegistered(agentA));
        assertEq(registry.getAgentCard(agentA), CID_A);
        assertEq(registry.getRegisteredAgentsCount(), 1);
    }

    function test_RegisterAgent_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit AgentRegistered(agentA, CID_A, capabilitiesA);

        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);
    }

    function test_RegisterAgent_EmitsCapabilityAddedEvents() public {
        vm.expectEmit(true, false, false, true);
        emit CapabilityAdded(agentA, "csv-analysis");

        vm.expectEmit(true, false, false, true);
        emit CapabilityAdded(agentA, "statistics");

        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);
    }

    function test_RegisterAgent_WithEmptyCapabilities() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, emptyCapabilities);

        assertTrue(registry.isAgentRegistered(agentA));
        assertEq(registry.getAgentCapabilities(agentA).length, 0);
    }

    function test_RegisterAgent_RevertIfAlreadyRegistered() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentIdentityRegistry.AgentAlreadyRegistered.selector,
                agentA
            )
        );

        vm.prank(agentA);
        registry.registerAgent(CID_B, capabilitiesB);
    }

    function test_RegisterAgent_RevertIfEmptyCID() public {
        vm.expectRevert(AgentIdentityRegistry.InvalidCID.selector);

        vm.prank(agentA);
        registry.registerAgent("", capabilitiesA);
    }

    function test_RegisterAgent_MultipleAgents() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.prank(agentB);
        registry.registerAgent(CID_B, capabilitiesB);

        vm.prank(agentC);
        registry.registerAgent(CID_C, capabilitiesC);

        assertEq(registry.getRegisteredAgentsCount(), 3);

        address[] memory allAgents = registry.getAllRegisteredAgents();
        assertEq(allAgents.length, 3);
        assertEq(allAgents[0], agentA);
        assertEq(allAgents[1], agentB);
        assertEq(allAgents[2], agentC);
    }

    // updateAgentCard Tests

    function test_UpdateAgentCard_Success() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.prank(agentA);
        registry.updateAgentCard(UPDATED_CID, updatedCapabilities);

        assertEq(registry.getAgentCard(agentA), UPDATED_CID);

        string[] memory newCaps = registry.getAgentCapabilities(agentA);
        assertEq(newCaps.length, 2);
        assertEq(newCaps[0], "machine-learning");
        assertEq(newCaps[1], "prediction");
    }

    function test_UpdateAgentCard_EmitsEvent() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.expectEmit(true, false, false, true);
        emit AgentCardUpdated(agentA, CID_A, UPDATED_CID, updatedCapabilities);

        vm.prank(agentA);
        registry.updateAgentCard(UPDATED_CID, updatedCapabilities);
    }

    function test_UpdateAgentCard_RemovesOldCapabilities() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        assertTrue(registry.agentHasCapability(agentA, "csv-analysis"));
        assertTrue(registry.agentHasCapability(agentA, "statistics"));

        vm.prank(agentA);
        registry.updateAgentCard(UPDATED_CID, updatedCapabilities);

        assertFalse(registry.agentHasCapability(agentA, "csv-analysis"));
        assertFalse(registry.agentHasCapability(agentA, "statistics"));
        assertTrue(registry.agentHasCapability(agentA, "machine-learning"));
        assertTrue(registry.agentHasCapability(agentA, "prediction"));
    }

    function test_UpdateAgentCard_RevertIfNotRegistered() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentIdentityRegistry.AgentNotRegistered.selector,
                agentA
            )
        );

        vm.prank(agentA);
        registry.updateAgentCard(UPDATED_CID, updatedCapabilities);
    }

    function test_UpdateAgentCard_RevertIfEmptyCID() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.expectRevert(AgentIdentityRegistry.InvalidCID.selector);

        vm.prank(agentA);
        registry.updateAgentCard("", updatedCapabilities);
    }

    // discoverAgents Tests

    function test_DiscoverAgents_SingleCapability() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.prank(agentB);
        registry.registerAgent(CID_B, capabilitiesB);

        string[] memory searchTags = new string[](1);
        searchTags[0] = "statistics";

        (address[] memory agents, string[] memory cids) = registry.discoverAgents(searchTags);

        assertEq(agents.length, 2);
        assertEq(cids.length, 2);
    }

    function test_DiscoverAgents_MultipleCapabilities() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.prank(agentB);
        registry.registerAgent(CID_B, capabilitiesB);

        vm.prank(agentC);
        registry.registerAgent(CID_C, capabilitiesC);

        string[] memory searchTags = new string[](2);
        searchTags[0] = "csv-analysis";
        searchTags[1] = "json-processing";

        (address[] memory agents, string[] memory cids) = registry.discoverAgents(searchTags);

        assertEq(agents.length, 2);
        // Should contain agentA (csv-analysis) and agentC (json-processing)
    }

    function test_DiscoverAgents_NoDuplicates() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        // Search for both capabilities that agentA has
        string[] memory searchTags = new string[](2);
        searchTags[0] = "csv-analysis";
        searchTags[1] = "statistics";

        (address[] memory agents, string[] memory cids) = registry.discoverAgents(searchTags);

        // Should only return agentA once (no duplicates)
        assertEq(agents.length, 1);
        assertEq(agents[0], agentA);
        assertEq(cids[0], CID_A);
    }

    function test_DiscoverAgents_NoMatches() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        string[] memory searchTags = new string[](1);
        searchTags[0] = "non-existent-capability";

        (address[] memory agents, string[] memory cids) = registry.discoverAgents(searchTags);

        assertEq(agents.length, 0);
        assertEq(cids.length, 0);
    }

    function test_DiscoverAgents_RevertIfEmptyTags() public {
        vm.expectRevert(AgentIdentityRegistry.EmptyCapabilityTags.selector);

        registry.discoverAgents(emptyCapabilities);
    }

    // getAgentCard Tests

    function test_GetAgentCard_Success() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        string memory cid = registry.getAgentCard(agentA);
        assertEq(cid, CID_A);
    }

    function test_GetAgentCard_RevertIfNotRegistered() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentIdentityRegistry.AgentNotRegistered.selector,
                agentA
            )
        );

        registry.getAgentCard(agentA);
    }

    // getAgentCapabilities Tests

    function test_GetAgentCapabilities_Success() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        string[] memory caps = registry.getAgentCapabilities(agentA);

        assertEq(caps.length, 2);
        assertEq(caps[0], "csv-analysis");
        assertEq(caps[1], "statistics");
    }

    function test_GetAgentCapabilities_RevertIfNotRegistered() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentIdentityRegistry.AgentNotRegistered.selector,
                agentA
            )
        );

        registry.getAgentCapabilities(agentA);
    }

    // getAgentsByCapability Tests

    function test_GetAgentsByCapability_Success() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        vm.prank(agentB);
        registry.registerAgent(CID_B, capabilitiesB);

        address[] memory statisticsAgents = registry.getAgentsByCapability("statistics");

        assertEq(statisticsAgents.length, 2);
        assertEq(statisticsAgents[0], agentA);
        assertEq(statisticsAgents[1], agentB);
    }

    function test_GetAgentsByCapability_EmptyResult() public {
        address[] memory agents = registry.getAgentsByCapability("non-existent");
        assertEq(agents.length, 0);
    }

    // agentHasCapability Tests

    function test_AgentHasCapability_True() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        assertTrue(registry.agentHasCapability(agentA, "csv-analysis"));
        assertTrue(registry.agentHasCapability(agentA, "statistics"));
    }

    function test_AgentHasCapability_False() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        assertFalse(registry.agentHasCapability(agentA, "non-existent"));
        assertFalse(registry.agentHasCapability(agentB, "csv-analysis"));
    }

    // isAgentRegistered Tests

    function test_IsAgentRegistered_True() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        assertTrue(registry.isAgentRegistered(agentA));
    }

    function test_IsAgentRegistered_False() public {
        assertFalse(registry.isAgentRegistered(agentA));
    }

    // Capability Indexing Tests

    function test_CapabilityIndexing_AfterUpdate() public {
        vm.prank(agentA);
        registry.registerAgent(CID_A, capabilitiesA);

        // Initially agentA has "statistics"
        address[] memory beforeUpdate = registry.getAgentsByCapability("statistics");
        assertEq(beforeUpdate.length, 1);

        // Update to remove "statistics"
        vm.prank(agentA);
        registry.updateAgentCard(UPDATED_CID, updatedCapabilities);

        // Now "statistics" should have no agents
        address[] memory afterUpdate = registry.getAgentsByCapability("statistics");
        assertEq(afterUpdate.length, 0);

        // New capabilities should be indexed
        address[] memory mlAgents = registry.getAgentsByCapability("machine-learning");
        assertEq(mlAgents.length, 1);
        assertEq(mlAgents[0], agentA);
    }

    function test_CapabilityIndexing_SkipsDuplicates() public {
        // Create capabilities with duplicates
        string[] memory capsWithDupes = new string[](3);
        capsWithDupes[0] = "csv-analysis";
        capsWithDupes[1] = "csv-analysis"; // duplicate
        capsWithDupes[2] = "statistics";

        vm.prank(agentA);
        registry.registerAgent(CID_A, capsWithDupes);

        // Should only have 2 unique capabilities
        string[] memory caps = registry.getAgentCapabilities(agentA);
        assertEq(caps.length, 2);

        // Capability index should only have agentA once
        address[] memory csvAgents = registry.getAgentsByCapability("csv-analysis");
        assertEq(csvAgents.length, 1);
    }

    function test_CapabilityIndexing_SkipsEmpty() public {
        string[] memory capsWithEmpty = new string[](3);
        capsWithEmpty[0] = "csv-analysis";
        capsWithEmpty[1] = ""; // empty
        capsWithEmpty[2] = "statistics";

        vm.prank(agentA);
        registry.registerAgent(CID_A, capsWithEmpty);

        // Should only have 2 capabilities (empty skipped)
        string[] memory caps = registry.getAgentCapabilities(agentA);
        assertEq(caps.length, 2);
    }
}