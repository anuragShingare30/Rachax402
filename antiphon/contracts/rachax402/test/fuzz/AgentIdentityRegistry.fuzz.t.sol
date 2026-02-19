// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {AgentIdentityRegistry} from "../../src/AgentIdentityRegistry.sol";

/**
 * @title AgentIdentityRegistry Fuzz & Invariant Tests
 * @dev Tests for property-based and invariant testing
 */
contract AgentIdentityRegistryFuzzTest is Test {
    AgentIdentityRegistry public registry;

    // Test actors
    address[] public actors;
    uint256 public constant NUM_ACTORS = 10;

    function setUp() public {
        registry = new AgentIdentityRegistry();

        // Create test actors
        for (uint256 i = 0; i < NUM_ACTORS; i++) {
            actors.push(makeAddr(string(abi.encodePacked("actor", i))));
        }
    }

    // Fuzz Tests

    /// @dev Fuzz: Any non-empty CID should successfully register
    function testFuzz_RegisterAgent_ValidCID(string calldata cid) public {
        vm.assume(bytes(cid).length > 0);
        vm.assume(bytes(cid).length < 100); // Reasonable CID length

        address agent = makeAddr("fuzzAgent");
        string[] memory caps = new string[](1);
        caps[0] = "test-cap";

        vm.prank(agent);
        registry.registerAgent(cid, caps);

        assertTrue(registry.isAgentRegistered(agent));
        assertEq(registry.getAgentCard(agent), cid);
    }

    /// @dev Fuzz: Multiple capability tags should all be indexed
    function testFuzz_RegisterAgent_MultipleCaps(uint8 capCount) public {
        vm.assume(capCount > 0 && capCount <= 20);

        address agent = makeAddr("multiCapAgent");
        string[] memory caps = new string[](capCount);

        for (uint256 i = 0; i < capCount; i++) {
            caps[i] = string(abi.encodePacked("cap-", vm.toString(i)));
        }

        vm.prank(agent);
        registry.registerAgent("QmTestCID123", caps);

        string[] memory storedCaps = registry.getAgentCapabilities(agent);
        assertEq(storedCaps.length, capCount);
    }

    /// @dev Fuzz: Updating agent card preserves registration
    function testFuzz_UpdateAgentCard_PreservesRegistration(
        string calldata newCid
    ) public {
        vm.assume(bytes(newCid).length > 0);
        vm.assume(bytes(newCid).length < 100);

        address agent = makeAddr("updateAgent");
        string[] memory caps = new string[](1);
        caps[0] = "initial-cap";

        vm.prank(agent);
        registry.registerAgent("QmInitialCID", caps);

        string[] memory newCaps = new string[](1);
        newCaps[0] = "updated-cap";

        vm.prank(agent);
        registry.updateAgentCard(newCid, newCaps);

        assertTrue(registry.isAgentRegistered(agent));
        assertEq(registry.getAgentCard(agent), newCid);
    }

    /// @dev Fuzz: Discover agents with random offset/limit should not revert
    function testFuzz_DiscoverAgents_Pagination(
        uint256 offset,
        uint256 limit
    ) public {
        // Register some agents first
        for (uint256 i = 0; i < 5; i++) {
            string[] memory caps = new string[](1);
            caps[0] = "common-cap";

            vm.prank(actors[i]);
            registry.registerAgent(
                string(abi.encodePacked("QmCID", vm.toString(i))),
                caps
            );
        }

        string[] memory searchTags = new string[](1);
        searchTags[0] = "common-cap";

        // Should never revert regardless of offset/limit values
        (address[] memory agents, uint256 total) = registry.discoverAgents(
            searchTags,
            offset,
            limit
        );

        assertEq(total, 5);

        if (offset >= 5) {
            assertEq(agents.length, 0);
        }
    }

    /// @dev Fuzz: Capability lookup should be consistent
    function testFuzz_CapabilityLookup_Consistency(
        string calldata capability
    ) public {
        vm.assume(bytes(capability).length > 0);
        vm.assume(bytes(capability).length < 50);

        address agent = makeAddr("capAgent");
        string[] memory caps = new string[](1);
        caps[0] = capability;

        vm.prank(agent);
        registry.registerAgent("QmTestCID", caps);

        assertTrue(registry.agentHasCapability(agent, capability));

        address[] memory agentsWithCap = registry.getAgentsByCapability(
            capability
        );
        assertEq(agentsWithCap.length, 1);
        assertEq(agentsWithCap[0], agent);
    }

    // Property Tests

    /// @dev Property: Registered agent count is consistent
    function test_RegisteredCountConsistency() public {
        // Register some agents
        for (uint256 i = 0; i < 5; i++) {
            string[] memory caps = new string[](1);
            caps[0] = "test-cap";

            vm.prank(actors[i]);
            registry.registerAgent(
                string(abi.encodePacked("QmCID", vm.toString(i))),
                caps
            );
        }

        uint256 registeredCount = 0;
        for (uint256 i = 0; i < actors.length; i++) {
            if (registry.isAgentRegistered(actors[i])) {
                registeredCount++;
            }
        }
        assertEq(registeredCount, 5);
    }

    /// @dev Property: getAgentCard never reverts for registered agents
    function test_GetAgentCardNeverRevertsForRegistered() public {
        string[] memory caps = new string[](1);
        caps[0] = "test-cap";

        vm.prank(actors[0]);
        registry.registerAgent("QmTestCID", caps);

        // Should not revert
        string memory cid = registry.getAgentCard(actors[0]);
        assertEq(cid, "QmTestCID");
    }
}

/**
 * @title AgentIdentityRegistry Invariant Handler
 * @dev Handler contract for stateful invariant testing
 */
contract AgentIdentityRegistryHandler is Test {
    AgentIdentityRegistry public registry;

    address[] public actors;
    address[] public registeredAgents;
    mapping(address => bool) public isRegistered;
    mapping(address => string[]) public agentCapabilities;

    uint256 public registerCount;
    uint256 public updateCount;

    constructor(AgentIdentityRegistry _registry) {
        registry = _registry;

        // Create actors
        for (uint256 i = 0; i < 5; i++) {
            actors.push(makeAddr(string(abi.encodePacked("handler", i))));
        }
    }

    function registerAgent(uint256 actorSeed, string calldata cid) external {
        if (bytes(cid).length == 0) return;

        address actor = actors[actorSeed % actors.length];
        if (isRegistered[actor]) return;

        string[] memory caps = new string[](2);
        caps[0] = "cap-a";
        caps[1] = "cap-b";

        vm.prank(actor);
        registry.registerAgent(cid, caps);

        isRegistered[actor] = true;
        registeredAgents.push(actor);
        agentCapabilities[actor] = caps;
        registerCount++;
    }

    function updateAgent(
        uint256 actorSeed,
        string calldata newCid
    ) external {
        if (bytes(newCid).length == 0) return;
        if (registeredAgents.length == 0) return;

        address actor = registeredAgents[actorSeed % registeredAgents.length];

        string[] memory newCaps = new string[](1);
        newCaps[0] = "updated-cap";

        vm.prank(actor);
        registry.updateAgentCard(newCid, newCaps);

        agentCapabilities[actor] = newCaps;
        updateCount++;
    }

    function discoverAgents(uint256 offset, uint256 limit) external view {
        string[] memory tags = new string[](1);
        tags[0] = "cap-a";

        registry.discoverAgents(tags, offset, limit);
    }
}

/**
 * @title AgentIdentityRegistry Stateful Invariant Tests
 */
contract AgentIdentityRegistryInvariantTest is Test {
    AgentIdentityRegistry public registry;
    AgentIdentityRegistryHandler public handler;

    function setUp() public {
        registry = new AgentIdentityRegistry();
        handler = new AgentIdentityRegistryHandler(registry);

        targetContract(address(handler));
    }

    /// @dev Invariant: All registered agents have non-empty CIDs
    function invariant_AllRegisteredHaveValidCID() public view {
        for (uint256 i = 0; i < handler.registerCount(); i++) {
            if (i < 5) {
                address actor = handler.actors(i);
                if (handler.isRegistered(actor)) {
                    string memory cid = registry.getAgentCard(actor);
                    assertTrue(bytes(cid).length > 0);
                }
            }
        }
    }

    /// @dev Invariant: Capability index is consistent with agent capabilities
    function invariant_CapabilityIndexConsistency() public view {
        for (uint256 i = 0; i < 5; i++) {
            address actor = handler.actors(i);
            if (handler.isRegistered(actor)) {
                string[] memory caps = registry.getAgentCapabilities(actor);
                for (uint256 j = 0; j < caps.length; j++) {
                    assertTrue(registry.agentHasCapability(actor, caps[j]));
                }
            }
        }
    }

    /// @dev Invariant: discover never returns more than total
    function invariant_DiscoverNeverExceedsTotal() public view {
        string[] memory tags = new string[](1);
        tags[0] = "cap-a";

        (address[] memory agents, uint256 total) = registry.discoverAgents(
            tags,
            0,
            100
        );
        assertTrue(agents.length <= total);
    }
}
