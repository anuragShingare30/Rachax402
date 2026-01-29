// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/**
 * @title AgentIdentityRegistry Contract
 * @author Rachax402
 * @dev Allows agents to register with their agent card CIDs and enables discovery by capability tags
 */
contract AgentIdentityRegistry {
    // Errors
    error AgentAlreadyRegistered(address agent);
    error AgentNotRegistered(address agent);
    error NotAgentOwner(address caller, address agent);
    error InvalidCID();
    error InvalidCapabilityTag();
    error EmptyCapabilityTags();

    // Type Declarations
    struct AgentInfo {
        string agentCardCID;
        string[] capabilityTags;
        bool isRegistered;
    }

    // State Variables
    /// @dev Mapping from agent address to their info
    mapping(address => AgentInfo) private s_agents;

    /// @dev Mapping from capability tag to list of agent addresses for efficient lookup
    mapping(string => address[]) private s_capabilityToAgents;

    /// @dev Mapping to track agent index in capability array for O(1) removal
    mapping(string => mapping(address => uint256)) private s_agentIndexInCapability;

    /// @dev Mapping to track if agent has a specific capability (for O(1) lookup)
    mapping(address => mapping(string => bool)) private s_agentHasCapability;

    /// @dev Array of all registered agent addresses
    address[] private s_registeredAgents;

    /// @dev Mapping to track agent index in registered agents array
    mapping(address => uint256) private s_agentIndexInRegistry;

    // Events
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

    // Modifiers
    modifier onlyAgentOwner() {
        if (!s_agents[msg.sender].isRegistered) {
            revert AgentNotRegistered(msg.sender);
        }
        _;
    }

    modifier validCID(string memory cid) {
        if (bytes(cid).length == 0) {
            revert InvalidCID();
        }
        _;
    }

    // Constructor
    constructor() {}

    // External Functions

    /**
     * @dev registerAgent Register an agent with their agent card CID and capability tags
     * @param agentCardCID The CID of the agent's identity card stored on IPFS
     * @param capabilityTags An array of capability tags for the agent
     */
    function registerAgent(
        string calldata agentCardCID,
        string[] calldata capabilityTags
    ) external validCID(agentCardCID) {
        if (s_agents[msg.sender].isRegistered) {
            revert AgentAlreadyRegistered(msg.sender);
        }

        // Store agent info
        s_agents[msg.sender].agentCardCID = agentCardCID;
        s_agents[msg.sender].isRegistered = true;

        // Add to registered agents array
        s_agentIndexInRegistry[msg.sender] = s_registeredAgents.length;
        s_registeredAgents.push(msg.sender);

        // index capability tags
        _addCapabilities(msg.sender, capabilityTags);

        emit AgentRegistered(msg.sender, agentCardCID, capabilityTags);
    }

    /**
     * @dev updateAgentCard update the agent identity card CID and capability tags
     * @notice Only the agent owner can update their agent card
     * @param newCID The new CID of the agent's identity card stored on IPFS
     * @param newCapabilityTags The new capability tags for the agent
     */
    function updateAgentCard(
        string calldata newCID,
        string[] calldata newCapabilityTags
    ) external onlyAgentOwner() validCID(newCID) {
        string memory oldCID = s_agents[msg.sender].agentCardCID;

        // Remove old capabilities
        _removeAllCapabilities(msg.sender);

        // Update CID
        s_agents[msg.sender].agentCardCID = newCID;

        // Add new capabilities
        _addCapabilities(msg.sender, newCapabilityTags);

        emit AgentCardUpdated(msg.sender, oldCID, newCID, newCapabilityTags);
    }

    /**
     * @dev discoverAgents discover agents by capability tags (returns agents matching ANY of the provided tags)
     * @param capabilityTags An array of capability tags to search for agents
     * @notice this take O(n^3) complexity in worst case due to uniqueness check..... Not efficient!!!!

     * @return agents An array of unique agent addresses matching the capability tags
     * @return cids An array of corresponding agent card CIDs
     */
    function discoverAgents(
        string[] calldata capabilityTags
    ) external view returns (address[] memory agents, string[] memory cids) {
        if (capabilityTags.length == 0) {
            revert EmptyCapabilityTags();
        }

        // First pass: count unique agents
        uint256 maxAgents = 0;
        for (uint256 i = 0; i < capabilityTags.length; i++) {
            maxAgents += s_capabilityToAgents[capabilityTags[i]].length;
        }

        if (maxAgents == 0) {
            return (new address[](0), new string[](0));
        }

        // Temporary arrays for collecting unique agents
        address[] memory tempAgents = new address[](maxAgents);
        uint256 uniqueCount = 0;

        // Track which agents we've already added (using a simple loop for uniqueness)
        for (uint256 i = 0; i < capabilityTags.length; i++) {
            address[] storage agentsWithCapability = s_capabilityToAgents[capabilityTags[i]];

            for (uint256 j = 0; j < agentsWithCapability.length; j++) {
                address agent = agentsWithCapability[j];

                // Check if agent is already in our result
                bool alreadyAdded = false;
                for (uint256 k = 0; k < uniqueCount; k++) {
                    if (tempAgents[k] == agent) {
                        alreadyAdded = true;
                        break;
                    }
                }

                if (!alreadyAdded) {
                    tempAgents[uniqueCount] = agent;
                    uniqueCount++;
                }
            }
        }

        // Create correctly sized result arrays
        agents = new address[](uniqueCount);
        cids = new string[](uniqueCount);

        for (uint256 i = 0; i < uniqueCount; i++) {
            agents[i] = tempAgents[i];
            cids[i] = s_agents[tempAgents[i]].agentCardCID;
        }

        return (agents, cids);
    }

    // External Getter Functions

    /**
     * @dev getAgentCard Get the agent card CID for a given agent address
     * @param agent The address of the agent
     * @return The CID of the agent's identity card stored on IPFS
     */
    function getAgentCard(
        address agent
    ) external view returns (string memory) {
        if (!s_agents[agent].isRegistered) {
            revert AgentNotRegistered(agent);
        }
        return s_agents[agent].agentCardCID;
    }

    /**
     * @dev Get the capability tags for a given agent address
     * @param agent The address of the agent
     * @return The capability tags of the agent
     */
    function getAgentCapabilities(
        address agent
    ) external view returns (string[] memory) {
        if (!s_agents[agent].isRegistered) {
            revert AgentNotRegistered(agent);
        }
        return s_agents[agent].capabilityTags;
    }

    /**
     * @dev Check if an agent is registered
     * @param agent The address of the agent
     * @return True if the agent is registered, false otherwise
     */
    function isAgentRegistered(address agent) external view returns (bool) {
        return s_agents[agent].isRegistered;
    }

    /**
     * @dev Get all agents with a specific capability
     * @param capability The capability tag to search for
     * @return An array of agent addresses with the specified capability
     */
    function getAgentsByCapability(
        string calldata capability
    ) external view returns (address[] memory) {
        return s_capabilityToAgents[capability];
    }

    /**
     * @dev Get the total number of registered agents
     * @return The count of registered agents
     */
    function getRegisteredAgentsCount() external view returns (uint256) {
        return s_registeredAgents.length;
    }

    /**
     * @dev Get all registered agent addresses
     * @return An array of all registered agent addresses
     */
    function getAllRegisteredAgents() external view returns (address[] memory) {
        return s_registeredAgents;
    }

    /**
     * @dev Check if an agent has a specific capability
     * @param agent The address of the agent
     * @param capability The capability tag to check
     * @return True if the agent has the capability, false otherwise
     */
    function agentHasCapability(
        address agent,
        string calldata capability
    ) external view returns (bool) {
        return s_agentHasCapability[agent][capability];
    }

    // Internal Functions

    /**
     * @dev Add capability tags to an agent and update the capability index
     * @param agent The address of the agent
     * @param capabilities The capability tags to add
     */
    function _addCapabilities(
        address agent,
        string[] calldata capabilities
    ) internal {
        for (uint256 i = 0; i < capabilities.length; i++) {
            string calldata capability = capabilities[i];

            // skip the empty capabilities
            if (bytes(capability).length == 0) {
                continue;
            }

            // skip if agent already have the capability
            if (s_agentHasCapability[agent][capability]) {
                continue;
            }

            // Add to agent's capabilities
            s_agents[agent].capabilityTags.push(capability);

            // index for efficient lookup
            s_agentIndexInCapability[capability][agent] = s_capabilityToAgents[capability].length;
            s_capabilityToAgents[capability].push(agent);
            s_agentHasCapability[agent][capability] = true;

            emit CapabilityAdded(agent, capability);
        }
    }

    /**
     * @dev Remove all capability tags from an agent
     * @param agent The address of the agent
     */
    function _removeAllCapabilities(address agent) internal {
        string[] storage capabilities = s_agents[agent].capabilityTags;

        for (uint256 i = 0; i < capabilities.length; i++) {
            string storage capability = capabilities[i];

            // Remove from capability index using swap-and-pop
            uint256 indexToRemove = s_agentIndexInCapability[capability][agent];
            uint256 lastIndex = s_capabilityToAgents[capability].length - 1;

            if (indexToRemove != lastIndex) {
                address lastAgent = s_capabilityToAgents[capability][lastIndex];
                s_capabilityToAgents[capability][indexToRemove] = lastAgent;
                s_agentIndexInCapability[capability][lastAgent] = indexToRemove;
            }

            s_capabilityToAgents[capability].pop();
            delete s_agentIndexInCapability[capability][agent];
            s_agentHasCapability[agent][capability] = false;

            emit CapabilityRemoved(agent, capability);
        }

        // Clear agent's capabilities array
        delete s_agents[agent].capabilityTags;
    }
}