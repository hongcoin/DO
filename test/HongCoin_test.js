/*
 * Testing for ${home}/HongCoin.sol
 * README:
 * To run the tests, run 'mocha test test/HongCoin_test.js' in the bash terminal
 */
var assert = require('assert');

var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');

var async = require('async');

describe('HONG Contract Suite', function() {
  this.timeout(60000);
  
  var sandbox = new Sandbox('http://localhost:8555');

  var compiled = helper.compile('./', ['HongCoin.sol']);
  var ownerAddress = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
  var fellow1 = '0xf6adcaf7bbaa4f88a554c45287e2d1ecb38ac5ff';
  var fellow4 = '0xd0782de398e9eaa3eced0b853b8b2512ffa430e7';
  var endDate = 1470675600;
  var extensionPeriod = 60 * 60; // 1 hour
  var eth;
  var hong;
  var eventLogger;

  before(function(done) {
    sandbox.start(__dirname + '/ethereum.json', done);
  });

  /*
    TestCase: test-deploy
    Description: deploying the contract,
     validating that the deployment was good.
     The deployed contract will be used for
     contract call testing in the following
     test cases.
  */
  it('test-deploy', function(done) {
    console.log(' [test-deploy]');
    eth = sandbox.web3.toWei(1, 'ether');
    sandbox.web3.eth.contract(JSON.parse(compiled.contracts['HONG'].interface)).new(
      ownerAddress,
      ownerAddress,
      endDate,
      {
        /* contract creator */
        from: ownerAddress,

        /* contract bytecode */
        data: '0x' + compiled.contracts['HONG'].bytecode
      },
      function(err, contract) {
        console.log("Setup: err=" + err + ", contract=" + contract);
        if (err) done(err);
        else if (contract.address){
          console.log("Contract at : " + contract.address);
          hong = contract;
          eventLogger = logEventsToConsole(done);
          done();
        }
      }
    );
  });

  /*
  TestCase: check-tokensAvail
  Description:
  */
  it('check-tokensAvail', function(done) {
    console.log(' [check-tokensAvail]');
    console.log("currentTier: " + hong.getCurrentTier());
    console.log("tokensCreated: " + hong.tokensCreated());
    console.log("tokensPerTier: " + hong.tokensPerTier());
    assert.equal(hong.tokensAvailableAtTierInternal(0, 100, 75), 25);
    done();      
  });
  
    /*
   * The first token request, for 1 Ether shoud get 100 tokens
   */
  it('refund-before-purchase', function(done) {
    // TODO: validate that an exception was thrown (or logged)
    hong.refund();
    done();
  });
  
  
  /*
   * The first token request, for 1 Ether shoud get 100 tokens
   */
  it('create-1', function(done) {
    var buyer = ownerAddress;
    testTokenPurchase(buyer, 1*eth, function(err){
      if (err) return done(err);
      assertHongBalance(1*eth);
      assertTokens(buyer, 100);
      assert.equal(hong.tokensCreated(), 100);
      done();
    });
  });
  
  /*
   * The seccond token request, for 1 Ether shoud get another 100 tokens.  
   * It's for the same user, so the total should be 200 tokens
   */
  it('create-2', function(done) {
    var buyer = ownerAddress;
    testTokenPurchase(buyer, 1*eth, function(err){
      if (err) return done(err);
      assertHongBalance(2*eth);
      assertTokens(buyer, 200);
      assert.equal(hong.tokensCreated(), 200);
      done();
    });
  });
  
    /*
   */
  it('create-3', function(done) {
    var buyer = fellow1;
    testTokenPurchase(buyer, 1*eth, function(err){
      if (err) return done(err);
      assertHongBalance(3*eth);
      assertTokens(buyer, 100);
      assert.equal(hong.tokensCreated(), 300);
      done();
    });
  });
  
  it('create-nextTier', function(done) {
    var buyer = fellow4;
    testTokenPurchase(buyer, 500000*eth, function(err){
      if (err) return done(err);
      console.log(hong.balanceOf(buyer));
      console.log("tax paid: " + hong.taxPaid(buyer));
      console.log("extra balance: " + hong.extraBalanceAccountBalance());
      done();
    });
  });
  
  function logEventsToConsole() {
    var filter = hong.evRecord();
    filter.watch(function(err, val) {
      console.log(val.args.eventType + ": " + val.args.msg);
    });
    return filter;
  }
  
  function assertTokens(buyer, expectedTokenTotal) {
    assert.equal(hong.balanceOf(buyer), expectedTokenTotal);
  }
  
  function assertHongBalance(expectedHongBalance) {
    assert.equal(hong.actualBalance(), expectedHongBalance);
  }
  
  function testTokenPurchase(buyer, sentValue, done) {
    console.log("hong: " + hong.address);
    hong.buyTokens({
      from: buyer,
      value: sentValue
    }, 
    function(err, txHash) {
      if (err) return done(err);
      helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
        if (err) return done(err);
        done();
      });
    });   
  }

  after(function(done) {
    eventLogger.stopWatching();
    sandbox.stop(done);
  });
});

function toString(hex) {
  return String.fromCharCode.apply(
    null,
    toArray(removeTrailingZeroes(hex.substr(2)))
  );
}

function removeTrailingZeroes(str) {
  if (str.length % 2 !== 0)
    console.error('Wrong hex str: ' + str);
  
  var lastNonZeroByte = 0;
  for (var i = str.length - 2; i >= 2; i -= 2) {
    if (str.charAt(i) !== '0' || str.charAt(i + 1) !== '0') {
      lastNonZeroByte = i;
      break;
    }
  }
  
  return str.substr(0, lastNonZeroByte + 2);
}

function toArray(str) {
  if (str.length % 2 !== 0)
    console.error('Wrong hex str: ' + str);
  
  var arr = [];
  for (var i = 0; i < str.length; i += 2) {
    var code = parseInt(str.charAt(i) + str.charAt(i + 1), 16);
    // Ignore non-printable characters
    if (code > 9) arr.push(code);
  }
  
  return arr;
}