var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');
var t = require("../utils.js");
var sc = require("../smart-compile.js");
var users = require("../users.js");
var sandbox;
var SECONDS = 1;
var timeTillClosing = 10 * SECONDS;
var compiled;
var eth;

describe('Scenario 2: HONG Contract Suite', function() {
  console.log("Scenario 2");
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
  
  it('locks fund if minTokens is reached before closingTime', function(done) {
    
    t.validateTransactions([
      function() { return t.buyTokens(users.fellow1, 200000*eth)},
      function() { 
        console.log(t.hong.tokensCreated());
        t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached")
      },
      function() { return t.buyTokens(users.fellow2, 200000*eth)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (1)")},

      function() { return t.buyTokens(users.fellow3, 200000*eth)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (2)")},

      function() { return t.buyTokens(users.fellow4, 200000*eth)},
      function() { t.assertEqual(false, t.hong.isMinTokensReached(), done, "min tokens reached (3)")},

      function() {
        t.sleepUntil(t.hong.closingTime());
        return t.buyTokens(users.fellow5, 300000*eth)
      },
      function() {
        t.assertEqual(true, t.hong.isMinTokensReached(), done, "min tokens reached (4)");
        t.assertEqual(true, t.hong.isFundLocked(), done, "is fund locked");
      }], done);
  });
    
  after(function(done) {
    console.log("Shutting down sandbox");
    sandbox.stop(done);
  });
});