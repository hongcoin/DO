var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');
var t = require("../utils.js");
var sc = require("../smart-compile.js");
var users = require("../users.js");

describe('Scenario 3: HONG Contract Suite', function() {
  console.log("Scenario 3");
  this.timeout(60000);

  var sandbox = new Sandbox('http://localhost:8553');

  var compiled = sc.compile(helper, 'HongCoin.sol');
  var SECOND = 1; // EVM time units are in seconds (not millis)
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  var timeTillClosing = 10 * SECOND;
  var extensionPeriod = 5 * SECOND;
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
    var secondClosingTime = t.asNumber(t.hong.closingTime()) + t.asNumber(t.hong.closingTimeExtensionPeriod());
    t.validateTransactions([
      function() { return t.buyTokens(users.fellow1, ethToWei(200000))},
      function() { 
        console.log(t.hong.tokensCreated());
        t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached")
      },
      function() { return t.buyTokens(users.fellow2, 200000*eth)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (1)")},

      function() { return t.buyTokens(users.fellow3, 200000*eth)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (2)")},

      function() {
        // wait until the closingTime has been reached.  The check for closing time
        // done't happen until a purchase is made. So, techinically, the fund will close if
        // the FIRST purchase AFTER closing time causes it to cross the threshold.
        t.sleepUntil(t.hong.closingTime());
        return t.buyTokens(users.fellow4, 200000*eth)
      },
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (3)")},

      function() { return t.buyTokens(users.fellow5, 300000*eth) },
      function() {
        t.assertEqual(true, t.hong.isMinTokensReached(), done, "min tokens reached (4)");
        t.assertEqual(false, t.hong.isFundLocked(), done, "is fund locked");
      },
      function() {
        t.sleepUntil(secondClosingTime);
        return t.buyTokens(users.fellow5, 1*eth); 
      },
      function() {
        t.assertEqual(false, t.hong.isMaxTokensReached(), done, "max tokens reached");
        t.assertEqual(true, t.hong.isMinTokensReached(), done, "min tokens reached (4)");
        t.assertEqual(true, t.hong.isFundLocked(), done, "is fund locked");
      }
      ], done);
  });
    
  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});