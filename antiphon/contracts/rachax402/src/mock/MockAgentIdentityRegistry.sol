// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract MockAgentIdentityRegistry {
    error AgentAlreadyRegistered(address agent);
    error AgentNotRegistered(address agent);
    error InvalidCID();

    struct AgentInfo {
        string agentCardCID;
        string[] capabilityTags;
        bool isRegistered;
    }

    mapping(address => AgentInfo) private s_agents;
    mapping(string => address[]) private s_capabilityToAgents;
    mapping(string => mapping(address => uint256)) private s_agentIndexInCapability;
    mapping(address => mapping(string => bool)) private s_agentHasCapability;
    address[] private s_registeredAgents;
    mapping(address => uint256) private s_agentIndexInRegistry;

    event AgentRegistered(address indexed agent, string agentCardCID, string[] capabilityTags);
    event AgentCardUpdated(address indexed agent, string oldAgentCardCID, string newAgentCardCID, string[] newCapabilityTags);
    event CapabilityAdded(address indexed agent, string capability);
    event CapabilityRemoved(address indexed agent, string capability);

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

    constructor() {}

    function registerAgent(
        string calldata agentCardCID,
        string[] calldata capabilityTags
    ) external validCID(agentCardCID) {
        if (s_agents[msg.sender].isRegistered) {
            revert AgentAlreadyRegistered(msg.sender);
        }

        s_agents[msg.sender].agentCardCID = agentCardCID;
        s_agents[msg.sender].isRegistered = true;

        s_agentIndexInRegistry[msg.sender] = s_registeredAgents.length;
        s_registeredAgents.push(msg.sender);

        _addCapabilities(msg.sender, capabilityTags);

        emit AgentRegistered(msg.sender, agentCardCID, capabilityTags);
    }

    function updateAgentCard(
        string calldata newCID,
        string[] calldata newCapabilityTags
    ) external onlyAgentOwner() validCID(newCID) {
        string memory oldCID = s_agents[msg.sender].agentCardCID;

        _removeAllCapabilities(msg.sender);

        s_agents[msg.sender].agentCardCID = newCID;

        _addCapabilities(msg.sender, newCapabilityTags);

        emit AgentCardUpdated(msg.sender, oldCID, newCID, newCapabilityTags);
    }

    function getAgentCard(address agent) external view returns (string memory) {
        if (!s_agents[agent].isRegistered) {
            revert AgentNotRegistered(agent);
        }
        return s_agents[agent].agentCardCID;
    }

    function getAgentCapabilities(address agent) external view returns (string[] memory) {
        if (!s_agents[agent].isRegistered) {
            revert AgentNotRegistered(agent);
        }
        return s_agents[agent].capabilityTags;
    }

    function isAgentRegistered(address agent) external view returns (bool) {
        return s_agents[agent].isRegistered;
    }

    function getAgentsByCapability(string calldata capability) external view returns (address[] memory) {
        return s_capabilityToAgents[capability];
    }

    function getRegisteredAgentsCount() external view returns (uint256) {
        return s_registeredAgents.length;
    }

    function getAllRegisteredAgents() external view returns (address[] memory) {
        return s_registeredAgents;
    }

    function agentHasCapability(address agent, string calldata capability) external view returns (bool) {
        return s_agentHasCapability[agent][capability];
    }

    function _addCapabilities(address agent, string[] calldata capabilities) internal {
        for (uint256 i = 0; i < capabilities.length; i++) {
            string calldata capability = capabilities[i];

            if (bytes(capability).length == 0) {
                continue;
            }

            if (s_agentHasCapability[agent][capability]) {
                continue;
            }

            s_agents[agent].capabilityTags.push(capability);

            s_agentIndexInCapability[capability][agent] = s_capabilityToAgents[capability].length;
            s_capabilityToAgents[capability].push(agent);
            s_agentHasCapability[agent][capability] = true;

            emit CapabilityAdded(agent, capability);
        }
    }

    function _removeAllCapabilities(address agent) internal {
        string[] storage capabilities = s_agents[agent].capabilityTags;

        for (uint256 i = 0; i < capabilities.length; i++) {
            string storage capability = capabilities[i];

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

        delete s_agents[agent].capabilityTags;
    }
}
