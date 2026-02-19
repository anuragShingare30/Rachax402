// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {AgentReputationRegistry} from "../../src/AgentReputationRegistry.sol";

/**
 * @title AgentReputationRegistry Fuzz & Invariant Tests
 * @dev Tests for property-based and invariant testing
 */
contract AgentReputationRegistryFuzzTest is Test {
    AgentReputationRegistry public registry;

    address public targetAgent;
    address[] public raters;
    uint256 public constant NUM_RATERS = 10;

    function setUp() public {
        registry = new AgentReputationRegistry();
        targetAgent = makeAddr("targetAgent");

        for (uint256 i = 0; i < NUM_RATERS; i++) {
            raters.push(makeAddr(string(abi.encodePacked("rater", i))));
        }
    }

    // ============ Fuzz Tests ============

    /// @dev Fuzz: Valid ratings (1-5) should always succeed
    function testFuzz_PostReputation_ValidRating(uint8 rating) public {
        rating = uint8(bound(rating, 1, 5));

        address rater = makeAddr("fuzzRater");

        vm.prank(rater);
        registry.postReputation(targetAgent, rating, "test", "QmProof");

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(
            targetAgent
        );

        assertEq(totalRatings, 1);
        assertEq(score, uint256(rating) * 100);
    }

    /// @dev Fuzz: Invalid ratings should revert
    function testFuzz_PostReputation_InvalidRating(uint8 rating) public {
        vm.assume(rating < 1 || rating > 5);

        address rater = makeAddr("invalidRater");

        vm.prank(rater);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentReputationRegistry.InvalidRating.selector,
                rating
            )
        );
        registry.postReputation(targetAgent, rating, "test", "QmProof");
    }

    /// @dev Fuzz: Score calculation is always average * 100
    function testFuzz_ScoreCalculation_IsAverage(
        uint8 rating1,
        uint8 rating2,
        uint8 rating3
    ) public {
        rating1 = uint8(bound(rating1, 1, 5));
        rating2 = uint8(bound(rating2, 1, 5));
        rating3 = uint8(bound(rating3, 1, 5));

        vm.prank(raters[0]);
        registry.postReputation(targetAgent, rating1, "", "");

        vm.prank(raters[1]);
        registry.postReputation(targetAgent, rating2, "", "");

        vm.prank(raters[2]);
        registry.postReputation(targetAgent, rating3, "", "");

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(
            targetAgent
        );

        uint256 expectedTotal = (uint256(rating1) +
            uint256(rating2) +
            uint256(rating3)) * 100;
        uint256 expectedScore = expectedTotal / 3;

        assertEq(totalRatings, 3);
        assertEq(score, expectedScore);
    }

    /// @dev Fuzz: Score bounds are always 100-500
    function testFuzz_ScoreBounds(uint8[] calldata ratings) public {
        vm.assume(ratings.length > 0 && ratings.length <= 10);

        for (uint256 i = 0; i < ratings.length; i++) {
            uint8 rating = uint8(bound(ratings[i], 1, 5));
            address rater = makeAddr(
                string(abi.encodePacked("boundRater", i))
            );

            vm.prank(rater);
            registry.postReputation(targetAgent, rating, "", "");
        }

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(
            targetAgent
        );

        assertTrue(totalRatings > 0);
        assertTrue(score >= 100); // Min possible average: 1.00 * 100
        assertTrue(score <= 500); // Max possible average: 5.00 * 100
    }

    /// @dev Fuzz: getRecentRatings respects limit parameter
    function testFuzz_GetRecentRatings_RespectsLimit(uint256 limit) public {
        limit = bound(limit, 1, 100);

        // Post 5 ratings
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(raters[i]);
            registry.postReputation(targetAgent, 3, "", "");
        }

        AgentReputationRegistry.Rating[] memory ratings = registry
            .getRecentRatings(targetAgent, limit);

        if (limit >= 5) {
            assertEq(ratings.length, 5);
        } else {
            assertEq(ratings.length, limit);
        }
    }

    /// @dev Fuzz: Rate limit is enforced correctly
    function testFuzz_RateLimit_Enforcement(uint256 timeElapsed) public {
        timeElapsed = bound(timeElapsed, 0, 2 days);

        address rater = makeAddr("rateLimitRater");

        vm.prank(rater);
        registry.postReputation(targetAgent, 3, "", "");

        vm.warp(block.timestamp + timeElapsed);

        if (timeElapsed < 1 days) {
            vm.prank(rater);
            vm.expectRevert();
            registry.postReputation(targetAgent, 4, "", "");
        } else {
            vm.prank(rater);
            registry.postReputation(targetAgent, 4, "", "");

            (, uint256 totalRatings) = registry.getReputationScore(targetAgent);
            assertEq(totalRatings, 2);
        }
    }

    /// @dev Fuzz: canRate returns correct values
    function testFuzz_CanRate_Consistency(uint256 timeElapsed) public {
        timeElapsed = bound(timeElapsed, 0, 2 days);

        address rater = makeAddr("canRateRater");

        // Initially can rate
        (bool canRateBefore, ) = registry.canRate(rater, targetAgent);
        assertTrue(canRateBefore);

        vm.prank(rater);
        registry.postReputation(targetAgent, 3, "", "");

        vm.warp(block.timestamp + timeElapsed);

        (bool canRateAfter, uint256 nextAllowed) = registry.canRate(
            rater,
            targetAgent
        );

        if (timeElapsed >= 1 days) {
            assertTrue(canRateAfter);
            assertEq(nextAllowed, 0);
        } else {
            assertFalse(canRateAfter);
            assertTrue(nextAllowed > block.timestamp);
        }
    }

    /// @dev Fuzz: Different raters can rate same target simultaneously
    function testFuzz_MultipleRaters_NoConflict(uint8 numRaters) public {
        numRaters = uint8(bound(numRaters, 1, NUM_RATERS));

        for (uint256 i = 0; i < numRaters; i++) {
            vm.prank(raters[i]);
            registry.postReputation(targetAgent, 3, "", "");
        }

        (, uint256 totalRatings) = registry.getReputationScore(targetAgent);
        assertEq(totalRatings, numRaters);
    }

    // ============ Property Tests ============

    /// @dev Property: Total ratings count matches array length
    function test_RatingsCountMatchesArray() public {
        // Post some ratings
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(raters[i]);
            registry.postReputation(targetAgent, 3, "", "");
        }

        uint256 count = registry.getRatingsCount(targetAgent);
        AgentReputationRegistry.Rating[] memory ratings = registry
            .getAllRatings(targetAgent);
        assertEq(count, ratings.length);
    }

    /// @dev Property: Score is 0 when no ratings exist
    function test_ZeroScoreWhenNoRatings() public {
        address unratedAgent = makeAddr("unratedAgent");
        (uint256 score, uint256 totalRatings) = registry.getReputationScore(
            unratedAgent
        );
        assertEq(score, 0);
        assertEq(totalRatings, 0);
    }
}

/**
 * @title AgentReputationRegistry Invariant Handler
 * @dev Handler contract for stateful invariant testing
 */
contract AgentReputationRegistryHandler is Test {
    AgentReputationRegistry public registry;

    address[] public targets;
    address[] public raters;

    // Ghost variables for tracking
    mapping(address => uint256) public totalScoreGhost;
    mapping(address => uint256) public totalRatingsGhost;
    uint256 public totalPostCount;

    constructor(AgentReputationRegistry _registry) {
        registry = _registry;

        for (uint256 i = 0; i < 3; i++) {
            targets.push(makeAddr(string(abi.encodePacked("target", i))));
        }

        for (uint256 i = 0; i < 10; i++) {
            raters.push(makeAddr(string(abi.encodePacked("rater", i))));
        }
    }

    function postReputation(
        uint256 targetSeed,
        uint256 raterSeed,
        uint8 rating
    ) external {
        rating = uint8(bound(rating, 1, 5));
        address target = targets[targetSeed % targets.length];
        address rater = raters[raterSeed % raters.length];

        // Skip if rater == target (impossible in real scenario)
        if (rater == target) return;

        // Check rate limit
        (bool canRateNow, ) = registry.canRate(rater, target);
        if (!canRateNow) return;

        vm.prank(rater);
        registry.postReputation(target, rating, "", "");

        // Update ghost variables
        totalScoreGhost[target] += uint256(rating) * 100;
        totalRatingsGhost[target] += 1;
        totalPostCount++;
    }

    function advanceTime(uint256 seconds_) external {
        seconds_ = bound(seconds_, 0, 2 days);
        vm.warp(block.timestamp + seconds_);
    }
}

/**
 * @title AgentReputationRegistry Stateful Invariant Tests
 */
contract AgentReputationRegistryInvariantTest is Test {
    AgentReputationRegistry public registry;
    AgentReputationRegistryHandler public handler;

    function setUp() public {
        registry = new AgentReputationRegistry();
        handler = new AgentReputationRegistryHandler(registry);

        targetContract(address(handler));
    }

    /// @dev Invariant: Score calculation matches ghost tracking
    function invariant_ScoreMatchesGhostTracking() public {
        for (uint256 i = 0; i < 3; i++) {
            address target = handler.targets(i);
            (uint256 score, uint256 totalRatings) = registry.getReputationScore(
                target
            );

            uint256 ghostTotal = handler.totalScoreGhost(target);
            uint256 ghostRatings = handler.totalRatingsGhost(target);

            assertEq(totalRatings, ghostRatings);

            if (ghostRatings > 0) {
                uint256 expectedScore = ghostTotal / ghostRatings;
                assertEq(score, expectedScore);
            } else {
                assertEq(score, 0);
            }
        }
    }

    /// @dev Invariant: Score is always within valid bounds when ratings exist
    function invariant_ScoreWithinBounds() public {
        for (uint256 i = 0; i < 3; i++) {
            address target = handler.targets(i);
            (uint256 score, uint256 totalRatings) = registry.getReputationScore(
                target
            );

            if (totalRatings > 0) {
                assertTrue(score >= 100, "Score below minimum");
                assertTrue(score <= 500, "Score above maximum");
            }
        }
    }

    /// @dev Invariant: Ratings count never decreases
    function invariant_RatingsCountNeverDecreases() public view {
        for (uint256 i = 0; i < 3; i++) {
            address target = handler.targets(i);
            uint256 count = registry.getRatingsCount(target);
            uint256 ghostCount = handler.totalRatingsGhost(target);
            assertEq(count, ghostCount);
        }
    }

    /// @dev Invariant: hasBeenRated is true when ratings exist
    function invariant_HasBeenRatedConsistency() public {
        for (uint256 i = 0; i < 3; i++) {
            address target = handler.targets(i);
            uint256 count = registry.getRatingsCount(target);
            bool hasRatings = registry.hasBeenRated(target);

            if (count > 0) {
                assertTrue(hasRatings);
            }
        }
    }
}
