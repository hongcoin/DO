var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');
var t = require("../utils.js");
var sc = require("../smart-compile.js");
var users = require("../users.js");

describe('Scenario 4: MinTokens never reached', function() {
  console.log("Scenario 4: MinTokens never reached");
  this.timeout(60000);

  var sandbox = new Sandbox('http://localhost:8554');

  var compiled = sc.compile(helper, 'HongCoin.sol');
  var SECOND = 1; // EVM time units are in seconds (not millis)
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  var timeTillClosing = 5 * SECOND;
  var extensionPeriod = 3 * SECOND;
  var endDate;
  var lastKickoffDateBuffer = 304*DAY;
  var eth;
  var ethToWei = function(eth) { return sandbox.web3.toWei(eth, "ether");};
  var fellow1OriginalBalance;
  var fellow4OriginalBalance;
  var fellow5OriginalBalance;

  before(function(done) {
    sandbox.start(__dirname + '/../ethereum.json', done);
  });

  it('test-deploy', function(done) {
    console.log(' [test-deploy]');
    eth = sandbox.web3.toWei(1, 'ether');
    endDate = Date.now() / 1000 + timeTillClosing;
    t.sandbox = sandbox;
    t.ownerAddress = users.fellow1;
    t.helper = helper;
    t.createContract(compiled, done, endDate, extensionPeriod, lastKickoffDateBuffer);
  });

  it('locks fund if minTokens is reached after closingTime but before extensions period', function(done) {
    console.log(' [locks fund if minTokens is reached after closingTime but before extensions period]');
    var secondClosingTime = t.asNumber(t.hong.closingTime()) + t.asNumber(t.hong.closingTimeExtensionPeriod());
    done = t.logEventsToConsole(done);
    done = t.assertEventIsFired(t.hong.evReleaseFund(), done);

    var purchase1 = sandbox.web3.toBigNumber(ethToWei(10));
    var purchase2 = sandbox.web3.toBigNumber(ethToWei(200000));
    var purchase3 = sandbox.web3.toBigNumber(ethToWei(2));

    fellow1OriginalBalance = t.asBigNumber(t.getWalletBalance(users.fellow1));
    fellow4OriginalBalance = t.asBigNumber(t.getWalletBalance(users.fellow4));
    fellow5OriginalBalance = t.asBigNumber(t.getWalletBalance(users.fellow5));

    t.validateTransactions([
      function() { return t.buyTokens(users.fellow1, purchase1)},
      function() {
        t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached");
      },

      function() {
        t.sleepUntil(t.hong.closingTime());
        return t.buyTokens(users.fellow4, purchase2)
      },
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (2)")},

      function() {
        // after the second closing time, buy some tokens to trigger the check, but not enough to reach minTokens
        t.sleepUntil(secondClosingTime);
        return t.buyTokens(users.fellow5, purchase3)
      },
      function() {
        t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (3)");
        t.assertEqual(true, t.hong.isFundReleased(), done, "is fund released");
      }
      ], done);
  });

  it('no more tokens will be sold once the fund is released', function(done) {
    console.log(' [no more tokens will be sold once the fund is released]');
    var buyer = users.fellow7;
    done = t.logEventsToConsole(done);
    done = t.assertEventIsFiredByName(t.hong.evRecord(), done, "notReleased");
    t.validateTransactions([
      function() { return t.buyTokens(buyer, 2*eth); },
      function() {
        t.assertEqualN(0, t.hong.balanceOf(buyer), done, "token count");
      }
      ], done);
  });

  it('allows users to get a refund', function(done) {
    done = t.logEventsToConsole(done);

    t.assertTrue(t.asNumber(t.hong.balanceOf(users.fellow1)) > 0, done, "fellow1 has tokens");
    t.assertTrue(t.asNumber(t.hong.balanceOf(users.fellow4)) > 0, done, "fellow4 has tokens");
    t.assertTrue(t.asNumber(t.hong.balanceOf(users.fellow5)) > 0, done, "fellow5 has tokens");

    t.validateTransactions([
      function() { return t.hong.refundMyIcoInvestment({from : users.fellow1}); },
      function() {
        var newBalance = t.asBigNumber(t.getWalletBalance(users.fellow1));
        t.assertEqualB(fellow1OriginalBalance, newBalance, done, "fellow1 balance");
        t.assertEqualN(0, t.hong.balanceOf(users.fellow1), done, "fellow1 token count");
      },

      function() { return t.hong.refundMyIcoInvestment({from : users.fellow4}); },
      function() {
        var newBalance = t.asBigNumber(t.getWalletBalance(users.fellow4));
        t.assertTrue(fellow4OriginalBalance, newBalance, done, "fellow4 balance");
        t.assertEqualN(0, t.hong.balanceOf(users.fellow4), done, "fellow4 token count");
      },

      function() { return t.hong.refundMyIcoInvestment({from : users.fellow5}); },
      function() {
        var newBalance = t.asBigNumber(t.getWalletBalance(users.fellow5));
        t.assertTrue(fellow5OriginalBalance, newBalance, done, "fellow5 balance");
        t.assertEqualN(0, t.hong.balanceOf(users.fellow5), done, "fellow5 token count");
      }
      ], done);
  });

  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});
