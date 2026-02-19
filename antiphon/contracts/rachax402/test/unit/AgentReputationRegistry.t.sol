// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "lib/forge-std/src/Vm.sol";
import {AgentReputationRegistry} from "../../src/AgentReputationRegistry.sol";

contract AgentReputationRegistryTest is Test {
    AgentReputationRegistry public registry;

    // Test addresses
    address public raterA;
    address public raterB;
    address public raterC;
    address public targetAgent;
    address public anotherAgent;

    // Test constants
    string public constant COMMENT_GOOD = "Excellent service, fast processing";
    string public constant COMMENT_BAD = "Slow response time";
    string public constant PROOF_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string public constant EMPTY_STRING = "";

    // Events to test
    event ReputationPosted(
        address indexed targetAgent,
        address indexed rater,
        uint8 rating,
        string comment,
        string proofCID,
        uint256 timestamp
    );
    event FirstRatingReceived(address indexed agent);

    function setUp() public {
        registry = new AgentReputationRegistry();

        // Setup test addresses
        raterA = makeAddr("raterA");
        raterB = makeAddr("raterB");
        raterC = makeAddr("raterC");
        targetAgent = makeAddr("targetAgent");
        anotherAgent = makeAddr("anotherAgent");
    }

    // postReputation Tests

    function test_PostReputation_Success() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        assertTrue(registry.hasBeenRated(targetAgent));
        assertEq(registry.getRatingsCount(targetAgent), 1);
    }

    function test_PostReputation_EmitsReputationPostedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ReputationPosted(targetAgent, raterA, 5, COMMENT_GOOD, PROOF_CID, block.timestamp);

        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_EmitsFirstRatingReceivedEvent() public {
        vm.expectEmit(true, false, false, false);
        emit FirstRatingReceived(targetAgent);

        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_NoFirstRatingEventOnSecondRating() public {
        // First rating
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        // Second rating from different rater - should NOT emit FirstRatingReceived
        vm.recordLogs();
        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        // Should only have ReputationPosted event, not FirstRatingReceived
        bool hasFirstRatingEvent = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("FirstRatingReceived(address)")) {
                hasFirstRatingEvent = true;
            }
        }
        assertFalse(hasFirstRatingEvent);
    }

    function test_PostReputation_WithEmptyComment() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, EMPTY_STRING, PROOF_CID);

        assertEq(registry.getRatingsCount(targetAgent), 1);
    }

    function test_PostReputation_WithEmptyProofCID() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, EMPTY_STRING);

        assertEq(registry.getRatingsCount(targetAgent), 1);
    }

    function test_PostReputation_MultipleRaters() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterC);
        registry.postReputation(targetAgent, 3, COMMENT_BAD, PROOF_CID);

        assertEq(registry.getRatingsCount(targetAgent), 3);
    }

    function test_PostReputation_RevertIfZeroRating() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentReputationRegistry.InvalidRating.selector,
                0
            )
        );

        vm.prank(raterA);
        registry.postReputation(targetAgent, 0, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_RevertIfRatingTooHigh() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentReputationRegistry.InvalidRating.selector,
                6
            )
        );

        vm.prank(raterA);
        registry.postReputation(targetAgent, 6, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_RevertIfTargetIsZeroAddress() public {
        vm.expectRevert(AgentReputationRegistry.InvalidTargetAgent.selector);

        vm.prank(raterA);
        registry.postReputation(address(0), 5, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_RevertIfRatingSelf() public {
        vm.expectRevert(AgentReputationRegistry.CannotRateSelf.selector);

        vm.prank(raterA);
        registry.postReputation(raterA, 5, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_RevertIfRateLimitExceeded() public {
        // First rating
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        // Try to rate again immediately
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentReputationRegistry.RateLimitExceeded.selector,
                raterA,
                targetAgent,
                block.timestamp + 1 days
            )
        );

        vm.prank(raterA);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);
    }

    function test_PostReputation_SuccessAfterRateLimitPeriod() public {
        // First rating
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        // Warp time forward past rate limit
        vm.warp(block.timestamp + 1 days + 1);

        // Should succeed now
        vm.prank(raterA);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        assertEq(registry.getRatingsCount(targetAgent), 2);
    }

    function test_PostReputation_DifferentTargetsNoRateLimit() public {
        // Rate first target
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        // Rate different target immediately - should succeed
        vm.prank(raterA);
        registry.postReputation(anotherAgent, 4, COMMENT_GOOD, PROOF_CID);

        assertEq(registry.getRatingsCount(targetAgent), 1);
        assertEq(registry.getRatingsCount(anotherAgent), 1);
    }

    // getReputationScore Tests

    function test_GetReputationScore_SingleRating() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        assertEq(score, 500); // 5 * 100
        assertEq(totalRatings, 1);
    }

    function test_GetReputationScore_MultipleRatings() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterC);
        registry.postReputation(targetAgent, 3, COMMENT_BAD, PROOF_CID);

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        // Average: (5 + 4 + 3) / 3 = 4.0 => 400
        assertEq(score, 400);
        assertEq(totalRatings, 3);
    }

    function test_GetReputationScore_NoRatings() public {
        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        assertEq(score, 0);
        assertEq(totalRatings, 0);
    }

    function test_GetReputationScore_AllMinRatings() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 1, COMMENT_BAD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 1, COMMENT_BAD, PROOF_CID);

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        assertEq(score, 100); // 1 * 100
        assertEq(totalRatings, 2);
    }

    function test_GetReputationScore_AllMaxRatings() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        assertEq(score, 500); // 5 * 100
        assertEq(totalRatings, 2);
    }

    function test_GetReputationScore_PrecisionTest() public {
        // Test: (5 + 4) / 2 = 4.5 => 450
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        (uint256 score, ) = registry.getReputationScore(targetAgent);

        assertEq(score, 450); // 4.5 * 100
    }

    // getRecentRatings Tests

    function test_GetRecentRatings_Success() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, "First", PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, "Second", PROOF_CID);

        vm.prank(raterC);
        registry.postReputation(targetAgent, 3, "Third", PROOF_CID);

        AgentReputationRegistry.Rating[] memory ratings = registry.getRecentRatings(targetAgent, 2);

        assertEq(ratings.length, 2);
        // Most recent first
        assertEq(ratings[0].rating, 3);
        assertEq(ratings[0].rater, raterC);
        assertEq(ratings[1].rating, 4);
        assertEq(ratings[1].rater, raterB);
    }

    function test_GetRecentRatings_LimitGreaterThanTotal() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        AgentReputationRegistry.Rating[] memory ratings = registry.getRecentRatings(targetAgent, 10);

        assertEq(ratings.length, 1);
        assertEq(ratings[0].rating, 5);
    }

    function test_GetRecentRatings_NoRatings() public {
        AgentReputationRegistry.Rating[] memory ratings = registry.getRecentRatings(targetAgent, 5);

        assertEq(ratings.length, 0);
    }

    function test_GetRecentRatings_RevertIfLimitZero() public {
        vm.expectRevert(AgentReputationRegistry.InvalidLimit.selector);

        registry.getRecentRatings(targetAgent, 0);
    }

    // getAllRatings Tests

    function test_GetAllRatings_Success() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, "First", PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, "Second", PROOF_CID);

        AgentReputationRegistry.Rating[] memory ratings = registry.getAllRatings(targetAgent);

        assertEq(ratings.length, 2);
        // Chronological order
        assertEq(ratings[0].rating, 5);
        assertEq(ratings[1].rating, 4);
    }

    function test_GetAllRatings_NoRatings() public {
        AgentReputationRegistry.Rating[] memory ratings = registry.getAllRatings(targetAgent);

        assertEq(ratings.length, 0);
    }

    // getRatingsCount Tests

    function test_GetRatingsCount_Success() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.prank(raterB);
        registry.postReputation(targetAgent, 4, COMMENT_GOOD, PROOF_CID);

        assertEq(registry.getRatingsCount(targetAgent), 2);
    }

    function test_GetRatingsCount_Zero() public {
        assertEq(registry.getRatingsCount(targetAgent), 0);
    }

    // canRate Tests

    function test_CanRate_TrueIfNeverRated() public {
        (bool canRateNow, uint256 nextAllowedTime) = registry.canRate(raterA, targetAgent);

        assertTrue(canRateNow);
        assertEq(nextAllowedTime, 0);
    }

    function test_CanRate_FalseIfRateLimited() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        (bool canRateNow, uint256 nextAllowedTime) = registry.canRate(raterA, targetAgent);

        assertFalse(canRateNow);
        assertEq(nextAllowedTime, block.timestamp + 1 days);
    }

    function test_CanRate_TrueAfterPeriodExpires() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        vm.warp(block.timestamp + 1 days + 1);

        (bool canRateNow, uint256 nextAllowedTime) = registry.canRate(raterA, targetAgent);

        assertTrue(canRateNow);
        assertEq(nextAllowedTime, 0);
    }

    function test_CanRate_IndependentForDifferentTargets() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        // Can still rate another agent
        (bool canRateAnother, ) = registry.canRate(raterA, anotherAgent);
        assertTrue(canRateAnother);

        // Cannot rate same agent
        (bool canRateSame, ) = registry.canRate(raterA, targetAgent);
        assertFalse(canRateSame);
    }

    // hasBeenRated Tests

    function test_HasBeenRated_True() public {
        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        assertTrue(registry.hasBeenRated(targetAgent));
    }

    function test_HasBeenRated_False() public {
        assertFalse(registry.hasBeenRated(targetAgent));
    }

    // Rating Struct Data Tests

    function test_RatingData_StoredCorrectly() public {
        uint256 ratingTime = block.timestamp;

        vm.prank(raterA);
        registry.postReputation(targetAgent, 5, COMMENT_GOOD, PROOF_CID);

        AgentReputationRegistry.Rating[] memory ratings = registry.getAllRatings(targetAgent);

        assertEq(ratings[0].rating, 5);
        assertEq(ratings[0].comment, COMMENT_GOOD);
        assertEq(ratings[0].proofCID, PROOF_CID);
        assertEq(ratings[0].timestamp, ratingTime);
        assertEq(ratings[0].rater, raterA);
    }

    // Constants Tests

    function test_Constants() public view {
        assertEq(registry.MIN_RATING(), 1);
        assertEq(registry.MAX_RATING(), 5);
        assertEq(registry.SCORE_MULTIPLIER(), 100);
        assertEq(registry.RATE_LIMIT_PERIOD(), 1 days);
    }

    // Fuzz Tests

    function testFuzz_PostReputation_ValidRatings(uint8 rating) public {
        vm.assume(rating >= 1 && rating <= 5);

        vm.prank(raterA);
        registry.postReputation(targetAgent, rating, COMMENT_GOOD, PROOF_CID);

        (uint256 score, uint256 totalRatings) = registry.getReputationScore(targetAgent);

        assertEq(score, uint256(rating) * 100);
        assertEq(totalRatings, 1);
    }

    function testFuzz_PostReputation_InvalidRatings(uint8 rating) public {
        vm.assume(rating == 0 || rating > 5);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentReputationRegistry.InvalidRating.selector,
                rating
            )
        );

        vm.prank(raterA);
        registry.postReputation(targetAgent, rating, COMMENT_GOOD, PROOF_CID);
    }
}
