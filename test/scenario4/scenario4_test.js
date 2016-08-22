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
  var timeTillClosing = 4 * SECOND;
  var extensionPeriod = 2 * SECOND;
  var endDate;
  var lastKickoffDateBuffer = 304*DAY;
  var eth;
  var ethToWei = function(eth) { return sandbox.web3.toWei(eth, "ether");};

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
    done = t.assertEventIsFired(t.hong.evReleaseFund(), done);
    var purchase1 = sandbox.web3.toBigNumber(ethToWei(200000));
    var purchase2 = sandbox.web3.toBigNumber(ethToWei(200000));
    var purchase3 = sandbox.web3.toBigNumber(ethToWei(2));
    console.log("purchase3: " + purchase3);
    var expectedTotal = purchase1.plus(purchase2).plus(purchase3);
    console.log("expectedTotal: " + expectedTotal.toString());
    t.validateTransactions([
      function() { return t.buyTokens(users.fellow1, purchase1)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached")},
      
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
        t.assertEqualN(0, t.hong.actualBalance(), done, "hong balance");
        t.assertEqualN(0, t.getWalletBalance(t.hong.extraBalanceWallet()), done, "extraBalance wallet");
        t.assertEqualN(0, t.getWalletBalance(t.hong.managementFeeWallet()), done, "mgmt fee wallet");
        t.assertEqualN(0, t.getWalletBalance(t.hong.rewardWallet()), done, "reward wallet");
        t.assertEqualN(expectedTotal, t.getWalletBalance(t.hong.returnWallet()), done, "retrun wallet")
      }
      ], done);
  });
  
  it('no more tokens will be sold once the fund is released', function(done) {
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
    
  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});