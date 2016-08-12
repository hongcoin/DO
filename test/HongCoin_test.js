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
  var fellow1 = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
  var fellow2 = '0xdedb49385ad5b94a16f236a6890cf9e0b1e30392';
  var fellow3 = '0xf6adcaf7bbaa4f88a554c45287e2d1ecb38ac5ff';
  var fellow4 = '0xd0782de398e9eaa3eced0b853b8b2512ffa430e7';
  var fellow5 = '0x9c7fa8b011a04e918dfdf6f2c37626b4de04513c';
  var fellow6 = '0xa5ba148282334f30d0e7499791ccd5fcaaafe558';
  var fellow7 = '0xf58366fc9d73d88b27fbbc35f1efd21232a38ce6'; 
  var fellow8 = '0x1ee52b26b2362ea0afb42785e0c7f3400fffac0b';
  var SECOND = 1; // EVM time units are in seconds (not millis)
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  var endDate = Date.now() / 1000 + 1 * DAY;
  var extensionPeriod = 30 * SECOND; // 1 hour
  var eth;
  var hong;

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
          console.log("Contract tx hash: " + contract.transactionHash);
          var receipt = sandbox.web3.eth.getTransactionReceipt(contract.transactionHash);
          console.log("Gas used: " + receipt.gasUsed);
          hong = contract;
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
    assert.equal(hong.tokensAvailableAtTierInternal(0, 100, 75), 25);
    done();      
  });
  
  /*
   */
  it('refund-before-purchase-fails', function(done) {
    // TODO: validate the specifics of the event
    done = assertEventIsFiredWhenDone(hong.evRecord(), done);
    validateTransactions([
        function() { return hong.refund({from: fellow3}) }, 
        function() {} ],
        done);
  });
  
  it('refund-after-purchase-ok', function(done) {
    console.log("[ refund-after-purchase-ok]")
    var buyer = fellow3;
    done = assertEventIsFiredWhenDone(hong.evCreatedToken(), done);
    done = assertEventIsFiredWhenDone(hong.evRefund(), done);
    validateTransactions([
        function() {
          console.log("Buying tokens...");
          return hong.buyTokens({from: buyer, value: 1*eth});
        },
        function() {
          console.log("Validation Purchase...");
          assertEqualN(hong.actualBalance(), 1*eth, done, "hong balance");
          assertEqualN(hong.balanceOf(buyer), 100, done, "buyer tokens");
          assertEqualN(hong.tokensCreated(), 100, done, "tokens created");
        },
        function() {
          console.log("Getting a refund...");
          return hong.refund({from: buyer});
        },
        function() {
          console.log("Validating refund...");
          assertEqualN(hong.actualBalance(), 0*eth, done, "hong balance");
          assertEqualN(hong.balanceOf(buyer), 0, done, "buyer tokens");
          assertEqualN(hong.tokensCreated(), 0, done, "tokens created");
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
    console.log("allows token purchase");
    console.log("closingTime: " + hong.closingTime());

    // add some hooks to the shutdown process
    done = logEventsToConsole(done);
    done = assertEventIsFiredWhenDone(hong.evCreatedToken(), done);

    var buyer = ownerAddress;
    validateTransactions([
      function() {
        return hong.buyTokens({from: buyer, value: 1*eth});
      }, 
      function() {
        assertEqualN(hong.actualBalance(), 1*eth, done, "hong balance");
        assertEqualN(hong.balanceOf(buyer), 100, done, "buyer tokens");
        assertEqualN(hong.tokensCreated(), 100, done, "tokens created");
      }], 
      done
    );
  });
  
  /*
   * The seccond token request, for 1 Ether shoud get another 100 tokens.  
   * It's for the same user, so the total should be 200 tokens
   */
  it('handles multiple purchases from the same buyer', function(done) {
    console.log("create-2");
    var buyer = ownerAddress;
    validateTransactions([
      function() {
        return hong.buyTokens({from: buyer, value: 1*eth});
      }, 
      function() {
        assertEqualN(hong.actualBalance(), 2*eth, done, "hong balance");
        assertEqualN(hong.balanceOf(buyer), 200, done, "buyer tokens");
        assertEqualN(hong.tokensCreated(), 200, done, "tokens created");
      }], 
      done
    );
  });
  
    /*
   */
  it('tracks total tokens across users', function(done) {
    console.log("create-3");
    var buyer = fellow3;
    validateTransactions([
      function() {
        return hong.buyTokens({from: buyer, value: 1*eth});
      }, 
      function() {
        assertEqualN(hong.actualBalance(), 3*eth, done, "hong balance");
        assertEqualN(hong.balanceOf(buyer), 100, done, "buyer tokens");
        assertEqualN(hong.tokensCreated(), 300, done, "tokens created");
      }], 
      done
    );
  });
  
  it('batches when purchase crosses a tier', function(done) {
    console.log("[batches when purchase crosses a tier]")
    var buyer = fellow4;
    var expectedTotalTokensBefore = 300;
    var expectedTokensPurchased = 49999997;
    var expectedTotalTokensAfter = expectedTotalTokensBefore + expectedTokensPurchased;
    var weiToSend = 500000*eth;
    
    
    // make sure we know the state before we start
    assertEqualN(hong.tokensCreated(), expectedTotalTokensBefore, done, "initial tokens created");
    assertEqualN(hong.taxPaid(buyer), 0, done, "initial taxPaid");
    assertEqualN(hong.extraBalanceAccountBalance(), 0, done, "initial extraBalance");
    
    validateTransactions([
        function() {
            return hong.buyTokens({from: buyer, value: weiToSend});
        }, 
        function() {
          assertEqualN(hong.balanceOf(buyer), expectedTokensPurchased);
          assertEqualN(hong.getCurrentTier(), 1, done, "tier");
          assertEqualN(hong.tokensCreated(), expectedTotalTokensAfter, done, "tokens created");
          assertEqualN(hong.taxPaid(buyer), 29700000000000000, done, "taxPaid");
          assertEqualN(hong.extraBalanceAccountBalance(), 29700000000000000, done,"extraBalance");
        }], 
        done
    );
  });
  
  it('locks fund when maxTokens it hit', function(done) {
    var buyer = fellow5;
    var weiToSend = 5*500000*eth;
    
    done = logEventsToConsole(done);
    
    validateTransactions([
      function() {
        return hong.buyTokens({from: buyer, value: weiToSend});
        }, 
        function() {
          assertEqual(hong.isMaxTokensReached(), true, done, "max tokens");
          assertEqual(hong.isFundLocked(), true, done, "fund locked");
        }],
        done
    );
  });
  
    /*
   * The basic template for simple tests is as follows:  
   *
   * validateTransaction(
   *   [action1, validation1, action2, validation2, action3, validation3, ...], 
   *   done
   * );
   * The "done" function is passed into the test by the framework and should be called when the test completes.
   */
  function validateTransactions(txAndValidation, done) {
      if (txAndValidation.length == 0) {
        done();
        return;
      }
      
      assertEqualN(txAndValidation.length%2, 0, done, "Array should have action-validation pairs [action1, validation1, action2, validation2, ...]");
      
      // grab the next transaction and validation
      var nextTx = txAndValidation.shift();
      var nextValidation = txAndValidation.shift();
      
      var txHash = nextTx();
      console.log("Wating for tx " + txHash);
      helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
          console.log("tx done " + txHash);
          if (err) return done(err);
          nextValidation();
          validateTransactions(txAndValidation, done);
      });
  }
  
  function assertEqualN(expected, actual, done, msg) {
    assertEqual(asNumber(expected), asNumber(actual), done, msg);
  }
  
  function assertEqual(expected, actual, done, msg) {
    if (!(expected === actual)) {
      done(new Error("Failed the '" + msg + "' check, '" + expected + "' != '" + actual + "'"));
      sandbox.stop(done);
      assert(false, msg); // force an exception
    }
  }
  
  function asNumber(ethNumber) {
    return sandbox.web3.toBigNumber(ethNumber).toNumber();
  }

  function assertEventIsFiredWhenDone(eventType, done) {
    var eventCount = 0;
    eventType.watch(function(err, val) {
      if (err) done(err);
      else eventCount++;
    });
    return function(err) {
      console.log("Calling done...");
      eventType.stopWatching();
      if (eventCount == 0) {
        done(new Error("Expected event was not logged!"));
      }
      else {
        done(err);
      }
    };
  }
  
  function logEventsToConsole(done) {
    var filter = hong.evRecord();
    filter.watch(function(err, val) {
      console.log(JSON.stringify(val.args));
      if (err) {
          done(err);
          return;
      }
    });
    return function(err) {
      filter.stopWatching();
      done(err);
    };
  }
  
  after(function(done) {
    console.log("Shutting down sandbox");
    // eventLogger.stopWatching();
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