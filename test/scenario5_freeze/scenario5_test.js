var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');
var t = require("../utils.js");
var sc = require("../smart-compile.js");
var users = require("../users.js");
var sandbox;
var SECONDS = 1;
var timeTillClosing = 6 * SECONDS;
var compiled;
var eth;
var nothingToAssert = function(){};
var scenario = "Scenario 5: Freezing the fund";

describe(scenario, function() {
  console.log(scenario);
  this.timeout(60000);
  sandbox = new Sandbox('http://localhost:8552');
  compiled = sc.compile(helper, "HongCoin.sol");

  before(function(done) {
    sandbox.start(__dirname + '/../ethereum.json', done);
  });

  it('test-deploy', function(done) {
    var endDate = Date.now() / 1000 + timeTillClosing;
    eth = sandbox.web3.toWei(1, 'ether');
    console.log(' [test-deploy]');

    t.sandbox = sandbox;
    t.ownerAddress = users.fellow1;
    t.helper = helper;
    t.createContract(compiled, done, endDate);
  });

  it('Sets up ok', function(done) {
    console.log("Setting up the contract...");
    t.validateTransactions([
      function() { return t.buyTokens(users.fellow1, 200000*eth)},
      nothingToAssert,

      function() { return t.buyTokens(users.fellow2, 200000*eth)},
      nothingToAssert,

      function() { return t.buyTokens(users.fellow3, 200000*eth)},
      nothingToAssert,

      function() { return t.buyTokens(users.fellow4, 200000*eth)},
      nothingToAssert,

      function() {
        t.sleepUntil(t.hong.closingTime());
        return t.buyTokens(users.fellow5, 300000*eth)
      },
      nothingToAssert,

      function() {
        return t.hong.voteToKickoffNewFiscalYear({from: users.fellow1});
      },
      nothingToAssert,

      function() { return t.hong.voteToKickoffNewFiscalYear({from: users.fellow5});},
      function() {
        var fiscalYear = t.hong.currentFiscalYear();
        t.assertEqual(true, t.hong.isKickoffEnabled(fiscalYear), done, "kickoff enable");
      }
    ],
    done);
  });

  it('freezes the fund when quorum is reached', function(done) {
    console.log(" [freezes the fund when quorum is reached]");
    var tokens1 = t.asNumber(t.hong.balanceOf(users.fellow1));
    var tokens2 = t.asNumber(t.hong.balanceOf(users.fellow2));
    var tokens3 = t.asNumber(t.hong.balanceOf(users.fellow3));

    var hongBalance = t.asBigNumber(t.getHongBalance());
    var extraBalance = t.asBigNumber(t.getWalletBalance(t.hong.extraBalanceWallet()));
    var mgmtFeeWalletBalance = t.asBigNumber(t.getWalletBalance(t.hong.managementFeeWallet()));
    var returnWalletBalance = t.asBigNumber(t.getWalletBalance(t.hong.returnWallet()));
    var rewardWalletBalance = t.asBigNumber(t.getWalletBalance(t.hong.rewardWallet()));

    var expectedReturnWalletBalance = returnWalletBalance
                                        .plus(hongBalance)
                                        .plus(extraBalance)
                                        .plus(mgmtFeeWalletBalance)
                                        .plus(rewardWalletBalance);
    console.log("expectedTotal: " + expectedReturnWalletBalance.toString());

    done = t.logEventsToConsole(done);
    done = t.assertEventIsFired(t.hong.evFreeze(), done);
    t.validateTransactions([
      function() { return t.hong.voteToFreezeFund({from: users.fellow1})},
      function() {
        console.log("Validating fellow 1 voted to freeze...")
        var expectedVotes = tokens1;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.voteToFreezeFund({from: users.fellow1})},
      function() {
        console.log("Validating fellow 1 voted to freeze (duplicate vote) ...")
        var expectedVotes = tokens1;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.transfer(users.fellow2, tokens1, {from: users.fellow1})},
      function() {
        console.log("Validating fellow 1 transers tokens to fellow2, freeze votes are reverted ...")
        t.assertEqualN(0, t.hong.balanceOf(users.fellow1), done, "fellow 1 tokens");
        t.assertEqualN(0, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.transfer(users.fellow1, tokens1, {from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 transers tokens back to fellow1 ...")
        t.assertEqualN(tokens1, t.hong.balanceOf(users.fellow1), done, "fellow 1 tokens");
        t.assertEqualN(0, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.voteToFreezeFund({from: users.fellow1})},
      function() {
        console.log("Validating fellow 1 votes to freeze again after getting tokens back ...")
        var expectedVotes = tokens1;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      /* Fellow 2 votes to freeze */
      function() { return t.hong.voteToFreezeFund({from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 voted to freeze...")
        var expectedVotes = tokens1 + tokens2;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.transfer(users.fellow2, tokens1, {from: users.fellow1})},
      function() {
        console.log("Validating fellow 1 transers tokens to fellow2, freeze votes are reverted ...")
        t.assertEqualN(0, t.hong.balanceOf(users.fellow1), done, "fellow 1 tokens");
        t.assertEqualN(tokens1 + tokens2, t.hong.balanceOf(users.fellow2), done, "fellow 2 tokens");
        t.assertEqualN(tokens2, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      /* Fellow 2 votes to freeze after getting more tokens  */
      function() { return t.hong.voteToFreezeFund({from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 votes to freeze again after getting more tokens...")
        var expectedVotes = tokens1 + tokens2;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      /* Fellow 2 changes his mind */
      function() { return t.hong.recallVoteToFreezeFund({from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 voted to unfreeze...")
        t.assertEqualN(0, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      /* Fellow 2 votes to freeze again */
      function() { return t.hong.voteToFreezeFund({from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 voted to freeze again...")
        var expectedVotes = tokens1 + tokens2;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(false, t.hong.isFreezeEnabled(), done, "not frozen");
      },

      function() { return t.hong.voteToFreezeFund({from: users.fellow3})},
      function() {
        console.log("Validating fellow 3 voted to freeze and fund is now frozen...")
        var expectedVotes = tokens1 + tokens2 + tokens3;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(true, t.hong.isFreezeEnabled(), done, "frozen");
        t.assertEqualN(0, t.getHongBalance(), done, "hong balance");
        t.assertEqualN(0, t.getWalletBalance(t.hong.extraBalanceWallet()), done, "extraBalance wallet");
        t.assertEqualN(0, t.getWalletBalance(t.hong.managementFeeWallet()), done, "mgmt fee wallet");
        t.assertEqualN(0, t.getWalletBalance(t.hong.rewardWallet()), done, "reward wallet");
        t.assertEqualB(expectedReturnWalletBalance, t.asBigNumber(t.getWalletBalance(t.hong.returnWallet())), done, "retrun wallet");
      },

      /* Fellow 2 changes his mind again, but now it's too late */
      function() { return t.hong.recallVoteToFreezeFund({from: users.fellow2})},
      function() {
        console.log("Validating fellow 2 cannot unfreeze after the fund is frozen...")
        var expectedVotes = tokens1 + tokens2 + tokens3;
        t.assertEqualN(expectedVotes, t.hong.supportFreezeQuorum(), done, "freeze vote count");
        t.assertEqual(true, t.hong.isFreezeEnabled(), done, "still frozen");
      },

      ], done);
  });

  it('no more tokens will be sold once the fund is frozen', function(done) {
    console.log(' [no more tokens will be sold once the fund is released]');
    var buyer = users.fellow7;
    done = t.logEventsToConsole(done);
    done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "notLocked");
    t.validateTransactions([
      function() { return t.buyTokens(buyer, 2*eth); },
      function() {
        t.assertEqualN(0, t.hong.balanceOf(buyer), done, "token count");
      }
      ], done);
  });

  it('allows users to collect their return after freezing the fund', function(done) {
    console.log("[allows users to collect their return after freezing the fund]");
    done = t.logEventsToConsole(done);

    var fellow1Shares = t.asBigNumber(t.hong.balanceOf(users.fellow1));
    var tokensCreated = t.asBigNumber(t.hong.tokensCreated());
    var bountyTokens = t.asBigNumber(t.hong.bountyTokensCreated());

    var returnAccountBalance = t.asBigNumber(t.getWalletBalance(t.hong.returnWallet()));
    var expectedWeiPerToken = returnAccountBalance.dividedBy(tokensCreated.plus(bountyTokens)).floor();
    var fellow1Balance = t.asBigNumber(t.getWalletBalance(users.fellow1));
    var expectedReturn = fellow1Shares.times(expectedWeiPerToken);
    var expectedBalance = fellow1Balance.plus(expectedReturn);

    t.validateTransactions([
        function() { return t.hong.collectMyReturn({from: users.fellow1 }); },
        function() {
          var newBalance = t.asBigNumber(t.getWalletBalance(users.fellow1));
          t.assertEqualB(expectedBalance, newBalance, done, "fellow1 balance");
        }
      ], done);
  });

  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});
