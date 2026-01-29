// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/**
 * @title AgentReputationRegistry Contract
 * @author Rachax402
 * @dev Contract for storing ratings and calculating reputation scores for agents
 */
contract AgentReputationRegistry {
    // Errors
    error InvalidRating(uint8 rating);
    error InvalidTargetAgent();
    error CannotRateSelf();
    error RateLimitExceeded(address rater, address targetAgent, uint256 nextAllowedTime);
    error NoRatingsFound(address agent);
    error InvalidLimit();

    // Type Declarations
    struct Rating {
        uint8 rating;
        string comment;
        string proofCID;
        uint256 timestamp;
        address rater;
    }

    struct AgentReputation {
        uint256 totalScore;      // Sum of all ratings (scaled by 100)
        uint256 totalRatings;    // Number of ratings received
        uint256 ratingsCount;    // Total ratings in the array
    }

    // Constants
    uint8 public constant MIN_RATING = 1;
    uint8 public constant MAX_RATING = 5;
    uint256 public constant SCORE_MULTIPLIER = 100;
    uint256 public constant RATE_LIMIT_PERIOD = 1 days;

    // State Variables
    /// @dev Mapping from agent address to their reputation data
    mapping(address => AgentReputation) private s_agentReputations;

    /// @dev Mapping from agent address to their ratings array
    mapping(address => Rating[]) private s_agentRatings;

    /// @dev Mapping to track last rating timestamp: rater => targetAgent => timestamp
    mapping(address => mapping(address => uint256)) private s_lastRatingTime;

    /// @dev Array of all agents that have received ratings
    address[] private s_ratedAgents;

    /// @dev Mapping to check if agent has been rated before
    mapping(address => bool) private s_hasBeenRated;

    // Events
    event ReputationPosted(
        address indexed targetAgent,
        address indexed rater,
        uint8 rating,
        string comment,
        string proofCID,
        uint256 timestamp
    );

    event FirstRatingReceived(address indexed agent);

    // Modifiers
    modifier validRating(uint8 rating) {
        if (rating < MIN_RATING || rating > MAX_RATING) {
            revert InvalidRating(rating);
        }
        _;
    }

    modifier validTarget(address targetAgent) {
        if (targetAgent == address(0)) {
            revert InvalidTargetAgent();
        }
        if (targetAgent == msg.sender) {
            revert CannotRateSelf();
        }
        _;
    }

    modifier rateLimitCheck(address targetAgent) {
        uint256 lastRating = s_lastRatingTime[msg.sender][targetAgent];
        if (lastRating != 0 && block.timestamp < lastRating + RATE_LIMIT_PERIOD) {
            revert RateLimitExceeded(
                msg.sender,
                targetAgent,
                lastRating + RATE_LIMIT_PERIOD
            );
        }
        _;
    }

    // Constructor
    constructor() {}

    // External Functions

    /**
     * @dev postReputation Post a reputation rating for an agent
     * @param targetAgent The address of the agent being rated
     * @param rating The rating value (1-5)
     * @param comment comment about the rating
     * @param proofCID CID of proof/evidence stored on IPFS
     */
    function postReputation(
        address targetAgent,
        uint8 rating,
        string calldata comment,
        string calldata proofCID
    )
        external
        validTarget(targetAgent)
        validRating(rating)
        rateLimitCheck(targetAgent)
    {
        // Update rate limit timestamp
        s_lastRatingTime[msg.sender][targetAgent] = block.timestamp;

        // Create new rating
        Rating memory newRating = Rating({
            rating: rating,
            comment: comment,
            proofCID: proofCID,
            timestamp: block.timestamp,
            rater: msg.sender
        });

        // Store the rating
        s_agentRatings[targetAgent].push(newRating);

        // Update reputation scores (rating * 100 for precision)
        s_agentReputations[targetAgent].totalScore += uint256(rating) * SCORE_MULTIPLIER;
        s_agentReputations[targetAgent].totalRatings += 1;
        s_agentReputations[targetAgent].ratingsCount += 1;

        // Optional: Track first-time rated agents
        if (!s_hasBeenRated[targetAgent]) {
            s_hasBeenRated[targetAgent] = true;
            s_ratedAgents.push(targetAgent);
            emit FirstRatingReceived(targetAgent);
        }

        emit ReputationPosted(
            targetAgent,
            msg.sender,
            rating,
            comment,
            proofCID,
            block.timestamp
        );
    }

    // External View Functions

    /**
     * @dev getReputationScore Get the reputation score for an agent
     * @param agent The address of the agent
     * @return score ( average reputation score * 100)
     * @return totalRatings The total number of ratings received
     * @notice Score of 500 = 5.00 average, 350 = 3.50 average, etc.
     */
    function getReputationScore(
        address agent
    ) external view returns (uint256 score, uint256 totalRatings) {
        AgentReputation storage rep = s_agentReputations[agent];
        totalRatings = rep.totalRatings;

        if (totalRatings == 0) {
            return (0, 0);
        }

        // Calculate average: (totalScore / totalRatings)
        // Since totalScore is already multiplied by 100, result is average * 100
        score = rep.totalScore / totalRatings;

        return (score, totalRatings);
    }

    /**
     * @dev Get recent ratings for an agent
     * @param agent The address of the agent
     * @param limit Maximum number of ratings to return (most recent first)
     * @return An array of Rating structs
     */
    function getRecentRatings(
        address agent,
        uint256 limit
    ) external view returns (Rating[] memory) {
        if (limit == 0) {
            revert InvalidLimit();
        }

        Rating[] storage allRatings = s_agentRatings[agent];
        uint256 totalRatings = allRatings.length;

        if (totalRatings == 0) {
            return new Rating[](0);
        }

        // Determine how many ratings to return
        uint256 count = limit > totalRatings ? totalRatings : limit;
        Rating[] memory recentRatings = new Rating[](count);

        // Return most recent ratings first (reverse order)
        for (uint256 i = 0; i < count; i++) {
            recentRatings[i] = allRatings[totalRatings - 1 - i];
        }

        return recentRatings;
    }

    /**
     * @dev Get all ratings for an agent
     * @param agent The address of the agent
     * @return An array of all Rating structs
     */
    function getAllRatings(
        address agent
    ) external view returns (Rating[] memory) {
        return s_agentRatings[agent];
    }

    /**
     * @dev Get the total number of ratings for an agent
     * @param agent The address of the agent
     * @return The count of ratings
     */
    function getRatingsCount(address agent) external view returns (uint256) {
        return s_agentRatings[agent].length;
    }

    /**
     * @dev Check if a rater can rate a target agent (rate limit check)
     * @param rater The address of the potential rater
     * @param targetAgent The address of the target agent
     * @return canRate Whether the rater can rate now
     * @return nextAllowedTime The timestamp when rating will be allowed (0 if can rate now)
     */
    function canRate(
        address rater,
        address targetAgent
    ) external view returns (bool, uint256 nextAllowedTime) {
        uint256 lastRating = s_lastRatingTime[rater][targetAgent];

        if (lastRating == 0) {
            return (true, 0);
        }

        nextAllowedTime = lastRating + RATE_LIMIT_PERIOD;

        if (block.timestamp >= nextAllowedTime) {
            return (true, 0);
        }

        return (false, nextAllowedTime);
    }


    /**
     * @dev Check if an agent has received any ratings
     * @param agent The address of the agent
     * @return True if the agent has been rated
     */
    function hasBeenRated(address agent) external view returns (bool) {
        return s_hasBeenRated[agent];
    }

}