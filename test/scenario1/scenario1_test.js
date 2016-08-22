/*
 * Testing for ${home}/HongCoin.sol
 * README:
 * To run the tests, run 'mocha test test/HongCoin_test.js' in the bash terminal
 */
var assert = require('assert');

var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');
var BigNumber = require('bignumber.js');
var async = require('async');
var t = require("../utils.js");
var sc = require("../smart-compile.js");
var users = require("../users.js");

describe('HONG Contract Suite', function() {
  console.log("Scenario 1");
  this.timeout(60000);

  var sandbox = new Sandbox('http://localhost:8551');

  var compiled = sc.compile(helper, 'HongCoin.sol');
  var ownerAddress = users.fellow1;
  var SECOND = 1; // EVM time units are in seconds (not millis)
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  var timeTillClosing = 1 * DAY;
  var endDate = Date.now() / 1000 + timeTillClosing;
  var eth;

  before(function(done) {
    sandbox.start(__dirname + '/../ethereum.json', done);
  });

  /*
    TestCase: test-deploy
    Description: deploying the contract,
     validating that the deployment was good.
     The deployed contract will be used for
     contract call testing in the following
     test cases.
  */
  describe("Contract Creation", function() {
    it('test-deploy', function(done) {
      console.log(' [test-deploy]');
      eth = sandbox.web3.toWei(1, 'ether');
      t.sandbox = sandbox;
      t.ownerAddress = users.fellow1;
      t.helper = helper;
      t.createContract(compiled, done, endDate);
    });
  });
  
  describe("ICO Period", function() {
    /*
    TestCase: check-tokensAvail
    Description:
    */
    it('check-tokensAvail', function(done) {
      console.log(' [check-tokensAvail]');
      assert.equal(t.hong.tokensAvailableAtTierInternal(0, 100, 75), 25);
      done();
    });

    /*
     */
    it('refund-before-purchase-fails', function(done) {
      console.log(" [refund-before-purchase-fails]");
      done = t.logEventsToConsole(done);
      done = t.assertEventIsFired(t.hong.evRecord(), done, function(event) {
        return event.message == "onlyTokenHolders";
      });

      t.assertEqualN(0, t.hong.balanceOf(users.fellow3), done, "buyer has no tokens");
      t.validateTransactions([
        function() { return t.hong.refundMyIcoInvestment({from: users.fellow3}) },
        function() {}],
        done);
    });

    it('refund-after-purchase-ok', function(done) {
      console.log("[ refund-after-purchase-ok]")
      var buyer = users.fellow3;
      done = t.logEventsToConsole(done);
      done = t.logAddressMessagesToConsole(done, t.hong.extraBalanceWallet());
      done = t.assertEventIsFired(t.hong.evCreatedToken(), done);
      done = t.assertEventIsFired(t.hong.evRefund(), done);
      t.validateTransactions([
          function() {
            console.log("Buying tokens...");
            return t.buyTokens(buyer, 1*eth);
          },
          function() {
            console.log("Validating Purchase...");
            t.assertEqualN(t.hong.actualBalance(), 1*eth, done, "hong balance");
            t.assertEqualN(t.hong.balanceOf(buyer), 100, done, "buyer tokens");
            t.assertEqualN(t.hong.tokensCreated(), 100, done, "tokens created");
          },
          function() {
            console.log("Getting a refund...");
            return t.hong.refundMyIcoInvestment({from: buyer});
          },
          function() {
            console.log("Validating refund...");
            t.assertEqualN(t.hong.actualBalance(), 0*eth, done, "hong balance");
            t.assertEqualN(t.hong.balanceOf(buyer), 0, done, "buyer tokens");
            t.assertEqualN(t.hong.tokensCreated(), 0, done, "tokens created");
          }
        ],
        function(err) {
          console.log("Calling done...");
          done(err);
        });
    });

    /*
     * The first token request, for 1 Ether shoud get 100 tokens
     */
    it('allows token purchase', function(done) {
      console.log("[allows token purchase]");
      // add some hooks to the shutdown process
      done = t.logEventsToConsole(done);
      done = t.assertEventIsFired(t.hong.evCreatedToken(), done);

      var buyer = ownerAddress;
      t.validateTransactions([
        function() {
          return t.buyTokens(buyer, 1*eth);
        },
        function() {
          t.assertEqualN(t.hong.actualBalance(), 1*eth, done, "hong balance");
          t.assertEqualN(t.hong.balanceOf(buyer), 100, done, "buyer tokens");
          t.assertEqualN(t.hong.tokensCreated(), 100, done, "tokens created");
        }],
        done
      );
    });

    /*
     * The seccond token request, for 1 Ether shoud get another 100 tokens.
     * It's for the same user, so the total should be 200 tokens
     */
    it('handles multiple purchases from the same buyer', function(done) {
      console.log("[handles multiple purchases from the same buyer]");
      var buyer = ownerAddress;
      done = t.logEventsToConsole(done);
      t.validateTransactions([
        function() {
          return t.buyTokens(buyer, 1*eth);
        },
        function() {
          t.assertEqualN(t.hong.actualBalance(), 2*eth, done, "hong balance");
          t.assertEqualN(t.hong.balanceOf(buyer), 200, done, "buyer tokens");
          t.assertEqualN(t.hong.tokensCreated(), 200, done, "tokens created");
        }],
        done
      );
    });

      /*
     */
    it('tracks total tokens across users', function(done) {
      console.log("[tracks total tokens across users]");
      var buyer = users.fellow3;
      done = t.logEventsToConsole(done);
      t.validateTransactions([
        function() {
          return t.buyTokens(buyer, 1*eth);
        },
        function() {
          t.assertEqualN(t.hong.actualBalance(), 3*eth, done, "hong balance");
          t.assertEqualN(t.hong.balanceOf(buyer), 100, done, "buyer tokens");
          t.assertEqualN(t.hong.tokensCreated(), 300, done, "tokens created");
        }],
        done
      );
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 0', function(done) {
      checkPriceForTokens(done, users.fellow7, 1, 100);
    });
    
    /*
     * Test "round down" feature (not issuing any tokens for extra ether)
     */
    it('check round-down feature @ tier 0', function(done) {
      checkPriceForTokens(done, users.fellow7, 1.1111, 111);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 1', function(done) {
      purchaseAllTokensInTier(done, users.fellow5, false, 0);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 1', function(done) {
      done = t.logAddressMessagesToConsole(done, t.hong.extraBalanceWallet());
      checkPriceForTokens(done, users.fellow7, 1.01, 100);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 2', function(done) {
      purchaseAllTokensInTier(done, users.fellow5, false, 0);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 2', function(done) {
      checkPriceForTokens(done, users.fellow7, 1.02, 100);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves tier 3', function(done) {
      purchaseAllTokensInTier(done, users.fellow2, false, 0);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check price @ tier 3', function(done) {
      checkPriceForTokens(done, users.fellow7, 1.03, 100);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 4', function(done) {
      purchaseAllTokensInTier(done, users.fellow5, false, 0);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 4', function(done) {
      checkPriceForTokens(done, users.fellow7, 1.04, 100);
    });

    /*
     * Purchase enough tokens to move the contract to the fourth tier
     */
    it('locks fund when hitting maxTokens', function(done) {
      purchaseAllTokensInTier(done, users.fellow3, true, 100);
    });
  });

  describe("after ICO", function() {
    it('does not allow refunds after fund is locked', function(done) {
      console.log("[does not allow refunds after fund is locked]");
      var buyer = users.fellow3;
      var tokensBefore = t.hong.balanceOf(buyer);
      var hongBalanceBefore = t.hong.actualBalance();

      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "notLocked");
      done = t.logEventsToConsole(done);

      t.assertTrue(t.asNumber(tokensBefore) > 0, done, "buyer has tokens");
      t.validateTransactions([
          function() { return t.hong.refundMyIcoInvestment({from: buyer}) },
          function() {
            t.assertEqualN(tokensBefore, t.hong.balanceOf(buyer), done, "tokens unchanged");
            t.assertEqualN(hongBalanceBefore, t.hong.actualBalance(), done, "hong balance");
          }],
          done);
    });
    
    it ('does not allow new token purchase when fund it locked', function(done) {
      console.log("[does not allow new token purchase when fund it locked]");
      var buyer = users.fellow1;
      var previousBalance = t.hong.balanceOf(buyer);
      var previousTokensCreated = t.hong.tokensCreated();
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "notLocked");
      t.validateTransactions([
        function() { 
            return t.buyTokens(buyer, 1*eth);
        },
        function() { 
          t.assertEqualN(previousBalance, t.hong.balanceOf(buyer), done, "buyer tokens");
          t.assertEqualN(previousTokensCreated, t.hong.tokensCreated(), done, "tokens created");
          // TODO: The contract should not accept the ether, but it will until doThrow actaully throws
        }], done);
    });
    
    it('allow bounty tokens to be issued by owner', function(done) {
      console.log("[allow bounty tokens to be issued by owner]");
      var recipeint = users.fellow2;
      var previousBalance = t.asNumber(t.hong.balanceOf(recipeint));
      var previousBountyTokens = t.asNumber(t.hong.bountyTokensCreated());
      var bountyTokensToIssue = 100;
      done = t.assertEventIsFired(t.hong.evMgmtIssueBountyToken(), done);
      t.validateTransactions([
          function() { return t.hong.mgmtIssueBountyToken(recipeint, bountyTokensToIssue, {from: ownerAddress}); },
          function() { 
            t.assertEqualN(previousBalance + bountyTokensToIssue, t.hong.balanceOf(recipeint), done, "bounty issued");
            t.assertEqualN(previousBountyTokens + bountyTokensToIssue, t.hong.bountyTokensCreated(), done, "bounty tokens created");
          }
        ], done);
    });
    
    it('DOES NOT allow bounty tokens to be issued by non-owner', function(done) {
      console.log("[DOES NOT allow bounty tokens to be issued by non-owner]");
      var recipeint = users.fellow2;
      var nonOwner = users.fellow5;
      var previousBalance = t.asNumber(t.hong.balanceOf(recipeint));
      var previousBountyTokens = t.asNumber(t.hong.bountyTokensCreated());
      var bountyTokensToIssue = 100;
      
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "onlyManagementBody");
      t.validateTransactions([
          function() { return t.hong.mgmtIssueBountyToken(recipeint, bountyTokensToIssue, {from: nonOwner}); },
          function() { 
            t.assertEqualN(previousBalance, t.hong.balanceOf(recipeint), done, "bounty not issued");
            t.assertEqualN(previousBountyTokens, t.hong.bountyTokensCreated(), done, "bounty tokens created");
          }
        ], done);
    });
    
    it('DOES NOT allow more than maxBountyTokens to be issued', function(done) {
      console.log("[DOES NOT allow more than maxBountyTokens to be issued]");
      var recipeint = users.fellow2;
      var previousBalance = t.asNumber(t.hong.balanceOf(recipeint));
      var previousBountyTokens = t.asNumber(t.hong.bountyTokensCreated());
      var bountyTokensToIssue = 2000000 - previousBountyTokens + 1; // one too many
      
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "hitMaxBounty");
      t.validateTransactions([
          function() { return t.hong.mgmtIssueBountyToken(recipeint, bountyTokensToIssue, {from: ownerAddress}); },
          function() { 
            t.assertEqualN(previousBalance, t.hong.balanceOf(recipeint), done, "bounty not issued");
            t.assertEqualN(previousBountyTokens, t.hong.bountyTokensCreated(), done, "bounty tokens created");
          }
        ], done);
    });
    
    it('allows maxBountyTokens to be issued', function(done) {
      console.log("[allows maxBountyTokens to be issued]");
      var recipeint = users.fellow2;
      var previousBalance = t.asNumber(t.hong.balanceOf(recipeint));
      var previousBountyTokens = t.asNumber(t.hong.bountyTokensCreated());
      var bountyTokensToIssue = 2000000 - previousBountyTokens; // just right
      
      done = t.assertEventIsFired(t.hong.evMgmtIssueBountyToken(), done);
      t.validateTransactions([
          function() { return t.hong.mgmtIssueBountyToken(recipeint, bountyTokensToIssue, {from: ownerAddress}); },
          function() { 
            t.assertEqualN(previousBalance + bountyTokensToIssue, t.hong.balanceOf(recipeint), done, "bounty issued");
            t.assertEqualN(previousBountyTokens + bountyTokensToIssue, t.hong.bountyTokensCreated(), done, "bounty tokens created");
          }
        ], done);
    });
  });
  
  describe("mgmt only", function() {
    it ('does not allow others to call mgmtDistribute', function(done) {
      console.log('[does not allow others to call mgmtDistribute]');
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "onlyManagementBody");
      t.validateTransactions([
          function() {return t.hong.mgmtDistribute({from: users.fellow4})},
          function() {}
        ], done);
    });

    it ('does not allow others to call mgmtIssueBountyToken', function(done) {
      console.log('[does not allow others to call mgmtIssueBountyToken]');
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "onlyManagementBody");
      t.validateTransactions([
          function() {return t.hong.mgmtIssueBountyToken(users.fellow5, 100, {from: users.fellow4})},
          function() {}
        ], done);
    });

    it ('does not allow others to call mgmtInvestProject', function(done) {
      console.log('[does not allow others to call mgmtInvestProject]');
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "onlyManagementBody");
      t.validateTransactions([
          function() {return t.hong.mgmtInvestProject(users.fellow5, 100, {from: users.fellow4})},
          function() {}
        ], done);
    });
  });
  
  describe("kick off voting", function() {
    it ('does not allow non-token holder to vote kickoff', function(done) {
      console.log('[does not allow non-token holder to voteKickoff]');
      var fiscalYear = t.hong.currentFiscalYear()+1;
      var nonTokenHolder = users.fellow6;
      
      done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "onlyTokenHolders");
      t.validateTransactions([
          function() { return t.hong.voteToKickoffFund({from: nonTokenHolder})},
          function() {
            t.assertEqualN(0, t.hong.supportKickoffQuorum(fiscalYear), done, "voted kickoff quorum count");
          }
        ], done);
    });
    
    it ('allows token holder to vote kickoff', function(done) {
      console.log('[allows token holder to vote kickoff]');
      var fiscalYear = t.hong.currentFiscalYear()+1;
      var tokenHolder = users.fellow2;
      
      var tokens = t.hong.balanceOf(tokenHolder);
      done = t.logEventsToConsole(done);
      t.validateTransactions([
          function() { return t.hong.voteToKickoffFund({from: tokenHolder})},
          function() {
            t.assertEqualN(tokens, t.hong.supportKickoffQuorum(fiscalYear), done, "voted kickoff quorum count");
            t.assertEqual(false, t.hong.isInitialKickoffEnabled(), done, "kickoff enabled");
          }
        ], done);
    });
    
    it ('does kickoff when quorum is reached', function(done){
      console.log('[does kickoff when quorum is reached]');
      var tokenHolder = users.fellow5;
      var previousHongBalance = sandbox.web3.toBigNumber(t.hong.actualBalance());
      var previousExtraBalance = sandbox.web3.toBigNumber(t.getWalletBalance(t.hong.extraBalanceWallet()));
      var previousMgmtBodyBalance = sandbox.web3.toBigNumber(t.getWalletBalance(ownerAddress));
      
      var contractBalance = previousExtraBalance.plus(previousHongBalance);
      var mgmtFeePercentage = t.asNumber(t.hong.mgmtFeePercentage());
      var totalMgmtFee =  contractBalance.times(mgmtFeePercentage).dividedBy(100).floor();
      var expectedMgmtFeeBalance = totalMgmtFee.times(6).dividedBy(8).floor();
      var expectedMgmtBodyPayment = totalMgmtFee.times(2).dividedBy(8).floor();
      var expectedMgmtBodyBalance = previousMgmtBodyBalance.plus(expectedMgmtBodyPayment);
      
      done = t.logEventsToConsole(done);
      done = t.logAddressMessagesToConsole(done, t.hong.managementFeeWallet());
      t.validateTransactions([
          function() { 
            return t.hong.voteToKickoffFund({from: tokenHolder});
          },
          function() {
            t.assertEqual(true, t.hong.isInitialKickoffEnabled(), done, "kickoff enabled");
            t.assertEqualN(0, t.getWalletBalance(t.hong.extraBalanceWallet()), done, "extra balance");
            t.assertEqualN(expectedMgmtFeeBalance, t.getWalletBalance(t.hong.managementFeeWallet()), done, "mgmt fee");
            t.assertTrue(expectedMgmtBodyBalance.equals(sandbox.web3.toBigNumber(t.getWalletBalance(ownerAddress))), done, "mgmtBody payment");
          }
        ], done);
    });
  });
  
  function checkPriceForTokens(done, buyer, ethToSend, expectedTokens) {
    console.log("[checking token price, expecting " + ethToSend + " for " + expectedTokens + " tokens]");
    done = t.logEventsToConsole(done);
    var previousBalanceOfBuyer = t.asNumber(t.hong.balanceOf(buyer));
    var previousExtraBalance = t.asNumber(t.getWalletBalance(t.hong.extraBalanceWallet()));
    t.validateTransactions([
      function() {
        return t.buyTokens(buyer, ethToSend*eth);
      },
      function() {
        t.assertEqualN(t.hong.balanceOf(buyer), previousBalanceOfBuyer + expectedTokens, done, "buyer tokens");
      },
      function() {
        return t.hong.refundMyIcoInvestment({from: buyer});
      },
      function() {
        t.assertEqualN(t.hong.balanceOf(buyer), 0, done, "refund all tokens"); // user cannot get a partial refund
        t.assertEqualN(previousExtraBalance, t.asNumber(t.getWalletBalance(t.hong.extraBalanceWallet())), done, "extraBalance");
      },
      ],
      done
    );
  }

  function purchaseAllTokensInTier(done, buyer, expectedFundLocked, extraTokens) {
    console.log("Purchasing the rest of the tokens in current tier, currentTier: " + t.hong.getCurrentTier());
    done = t.logEventsToConsole(done);

    var tokensPerTier = t.asNumber(t.hong.tokensPerTier());
    var tokensAvailable = t.asNumber(t.hong.tokensAvailableAtCurrentTier());
    var pricePerTokenAtCurrentTier = t.hong.pricePerTokenAtCurrentTier();
    var previousBalanceOfBuyer = t.asNumber(t.hong.balanceOf(buyer));
    var onePercentWeiPerInitialHONG = sandbox.web3.toBigNumber(t.hong.weiPerInitialHONG()).dividedBy(100);

    // having trouble getting the right precision to represent this big purchase.
    // adding padding of weiPerToken/2 to ensure that the requested number of tokens are
    // purchased but not more.
    var currentTier = t.asNumber(t.hong.getCurrentTier());
    var expectedTier = Math.min(4, currentTier + 1);
    var expectedTokensPurchased = tokensAvailable + extraTokens; // one token at the next price will be purchased
    var weiToSend = pricePerTokenAtCurrentTier*expectedTokensPurchased + pricePerTokenAtCurrentTier/2;
    var expectedDivisor = 100 + expectedTier;
    var expectedTokensCreated = tokensPerTier * (currentTier+1) + extraTokens;
    var percentExtra = (currentTier * (currentTier+1))/2;
    var expectTotalTax = onePercentWeiPerInitialHONG.times(percentExtra).times(tokensPerTier);
    expectTotalTax = expectTotalTax.plus(onePercentWeiPerInitialHONG.times(currentTier).times(extraTokens))

    t.validateTransactions([
        function() {
            return t.buyTokens(buyer, weiToSend);
        },
        function() {
          t.assertEqualN(t.hong.balanceOf(buyer), expectedTokensPurchased + previousBalanceOfBuyer, done, "buyer balance");
          t.assertEqualN(t.hong.getCurrentTier(), expectedTier, done, "tier");
          t.assertEqualN(t.hong.tokensCreated(), expectedTokensCreated, done, "tokens created");
          t.assertEqualN(expectedDivisor, t.hong.divisor(), done, "divisor");
          t.assertEqual(expectedFundLocked, t.hong.isFundLocked(), done, "fund locked");
          t.assertEqual(expectedFundLocked, t.hong.isMaxTokensReached(), done, "max tokens reached");
          t.assertTrue(expectTotalTax.equals(sandbox.web3.toBigNumber(t.getWalletBalance(t.hong.extraBalanceWallet()))), done, "extra balance");
        }],
        done
    );
  }

  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});