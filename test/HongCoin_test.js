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
  var maxDeploymentGas = 4800000;
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
  describe("Contract Creation", function() {
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
            console.log("hong: " + hong);
            console.log("extraBalance: " + contract.extraBalance());
            if (receipt.gasUsed > maxDeploymentGas) {
                done(new Error("Gas used to deploy contract exceeds gasLimit!"));
            }
            else {
              done();
            }
          }
        }
      );
    });
  });

  describe("ICO Period", function() {
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
      console.log(" [refund-before-purchase-fails]")
      done = logEventsToConsole(done);
      done = assertEventIsFired(hong.evRecord(), done, function(event) {
        return event.message == "onlyTokenHolders";
      });

      assertEqualN(0, hong.balanceOf(fellow3), done, "buyer has no tokens");
      validateTransactions([
          function() { return hong.refund({from: fellow3}) },
          function() {} ],
          done);
    });

    it('refund-after-purchase-ok', function(done) {
      console.log("[ refund-after-purchase-ok]")
      var buyer = fellow3;
      done = logEventsToConsole(done);
      done = logAddressMessagesToConsole(done, hong.extraBalance());
      done = assertEventIsFired(hong.evCreatedToken(), done);
      done = assertEventIsFired(hong.evRefund(), done);
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
      console.log("[allows token purchase]");

      // add some hooks to the shutdown process
      done = logEventsToConsole(done);
      done = assertEventIsFired(hong.evCreatedToken(), done);

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
      console.log("[handles multiple purchases from the same buyer]");
      var buyer = ownerAddress;
      done = logEventsToConsole(done);
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
      console.log("[tracks total tokens across users]");
      var buyer = fellow3;
      done = logEventsToConsole(done);
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

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 0', function(done) {
      checkPriceFor100Tokens(done, fellow7, 1);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 1', function(done) {
      purchaseAllTokensInTier(done, fellow5, false);
    });

    /*
     * Purchase enough tokens to move the contract to the second tier
     */
     /*
    it('batches when purchase crosses a tier', function(done) {
      console.log("[batches when purchase crosses a tier]")
      var buyer = fellow4;

      // make sure we know the state before we start
      var expectedTotalTokensBefore = 300;
      assertEqualN(hong.tokensCreated(), expectedTotalTokensBefore, done, "initial tokens created");
      assertEqualN(hong.taxPaid(buyer), 0, done, "initial taxPaid");
      assertEqualN(hong.extraBalanceAccountBalance(), 0, done, "initial extraBalance");

      var expectedTokensPurchased = 49999997;
      var expectedTaxPaid = 29700000000000000;
      var expectedDivisor = 101;
      var expectedTier = 1;
      var expectedTotalTokensAfter = expectedTotalTokensBefore + expectedTokensPurchased;
      var weiToSend = 500000*eth;

      validateTransactions([
          function() {
              return hong.buyTokens({from: buyer, value: weiToSend});
          },
          function() {
            assertEqualN(hong.balanceOf(buyer), expectedTokensPurchased);
            assertEqualN(hong.getCurrentTier(), expectedTier, done, "tier");
            assertEqualN(hong.tokensCreated(), expectedTotalTokensAfter, done, "tokens created");
            assertEqualN(hong.taxPaid(buyer), expectedTaxPaid, done, "taxPaid");
            assertEqualN(hong.extraBalanceAccountBalance(), expectedTaxPaid, done,"extraBalance");
            assertEqualN(expectedDivisor, hong.divisor(), done, "divisor");
          }],
          done
      );
    });
    */

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 1', function(done) {
      done = logAddressMessagesToConsole(done, hong.extraBalance());
      checkPriceFor100Tokens(done, fellow7, 1.01);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 2', function(done) {
      purchaseAllTokensInTier(done, fellow5, false);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 2', function(done) {
      checkPriceFor100Tokens(done, fellow7, 1.02);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves tier 3', function(done) {
      purchaseAllTokensInTier(done, fellow2, false);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check price @ tier 3', function(done) {
      checkPriceFor100Tokens(done, fellow7, 1.03);
    });

    /*
     * Purchase enough tokens to move the contract to the third tier
     */
    it('moves to tier 4', function(done) {
      purchaseAllTokensInTier(done, fellow5, false);
    });

    /*
     * Testing purchase at tier-1.  Refunding the purchase to avoid changing the state.
     */
    it('check token price @ tier 4', function(done) {
      checkPriceFor100Tokens(done, fellow7, 1.04);
    });

    /*
     * Purchase enough tokens to move the contract to the fourth tier
     */
    it('locks fund when hitting maxTokens', function(done) {
      purchaseAllTokensInTier(done, fellow3, true);
    });
  });

  describe("after ICO", function() {
    it('does not allow refunds after fund is locked', function(done) {
      var buyer = fellow3;
      var tokensBefore = hong.balanceOf(buyer);
      var hongBalanceBefore = hong.actualBalance();

      done = assertEventIsFired(hong.evRecord(), done, function(event) {
        return event.message == "notLocked";
      });
      done = logEventsToConsole(done);

      assertTrue(asNumber(tokensBefore) > 0, done, "buyer has tokens");
      validateTransactions([
          function() { return hong.refund({from: buyer}) },
          function() {
            assertEqualN(tokensBefore, hong.balanceOf(buyer), done, "tokens unchanged");
            assertEqualN(hongBalanceBefore, hong.actualBalance(), done, "hong balance");
          }],
          done);
    });
  });

  describe("mgmt only", function() {
    it ('does not allow others to call mgmtDistribute', function(done) {
      done = assertEventIsFiredByName(hong.evRecord(), done, "onlyManagementBody");
      validateTransactions([
          function() {return hong.mgmtDistribute({from: fellow4})},
          function() {}
        ], done);
    });

    it ('does not allow others to call mgmtIssueBountyToken', function(done) {
      done = assertEventIsFiredByName(hong.evRecord(), done, "onlyManagementBody");
      validateTransactions([
          function() {return hong.mgmtIssueBountyToken(fellow5, 100, {from: fellow4})},
          function() {}
        ], done);
    });

    it ('does not allow others to call mgmtInvestProject', function(done) {
      done = assertEventIsFiredByName(hong.evRecord(), done, "onlyManagementBody");
      validateTransactions([
          function() {return hong.mgmtInvestProject(fellow5, 100, {from: fellow4})},
          function() {}
        ], done);
    });
  });

  function checkPriceFor100Tokens(done, buyer, ethPer100) {
    console.log("[checking token price, expecting " + ethPer100 + "]");
    console.log("Available: " + hong.tokensAvailableAtCurrentTier());
    done = logEventsToConsole(done);
    var previousBalanceOfBuyer = asNumber(hong.balanceOf(buyer));
    var previousExtraBalance = asNumber(hong.extraBalanceAccountBalance());
    validateTransactions([
      function() {
        return hong.buyTokens({from: buyer, value: ethPer100*eth});
      },
      function() {
        assertEqualN(hong.balanceOf(buyer), previousBalanceOfBuyer + 100, done, "buyer tokens");
      },
      function() {
        return hong.refund({from: buyer});
      },
      function() {
        assertEqualN(hong.balanceOf(buyer), 0, done, "refund all tokens"); // user cannot get a partial refund
        assertEqualN(previousExtraBalance, asNumber(hong.extraBalanceAccountBalance()), done, "extraBalance");
      },
      ],
      done
    );
  }

  function purchaseAllTokensInTier(done, buyer, expectedFundLocked) {
    console.log("Purchasing the rest of the tokens in current tier, currentTier: " + hong.getCurrentTier());
    done = logEventsToConsole(done);

    var tokensPerTier = asNumber(hong.tokensPerTier());
    var tokensAvailable = asNumber(hong.tokensAvailableAtCurrentTier());
    var pricePerTokenAtCurrentTier = hong.pricePerTokenAtCurrentTier();
    var previousBalanceOfBuyer = asNumber(hong.balanceOf(buyer));
    var onePercentWeiPerInitialHONG = sandbox.web3.toBigNumber(hong.weiPerInitialHONG()).dividedBy(100);

    // having trouble getting the right precision to represent this big purchase.
    // adding padding of weiPerToken/2 to ensure that the requested number of tokens are
    // purchased but not more.
    var currentTier = asNumber(hong.getCurrentTier());
    var expectedTier = Math.min(4, currentTier + 1);
    var expectedTokensPurchased = tokensAvailable; // one token at the next price will be purchased
    var weiToSend = pricePerTokenAtCurrentTier*expectedTokensPurchased + pricePerTokenAtCurrentTier/2;
    var expectedDivisor = 100 + expectedTier;
    var expectedTokensCreated = tokensPerTier * (currentTier+1);
    var percentExtra = (currentTier * (currentTier+1))/2;
    var expectTotalTax = onePercentWeiPerInitialHONG.times(percentExtra).times(tokensPerTier);

    console.log("onePercentWeiPerInitialHONG: " + onePercentWeiPerInitialHONG);
    console.log("percentExtra: " + percentExtra);
    console.log("tokensPerTier: " + tokensPerTier);
    console.log("percentExtra * tokensPerTier: " + (percentExtra * tokensPerTier));

    validateTransactions([
        function() {
            return hong.buyTokens({from: buyer, value: weiToSend});
        },
        function() {
          assertEqualN(hong.balanceOf(buyer), expectedTokensPurchased + previousBalanceOfBuyer, done, "buyer balance");
          assertEqualN(hong.getCurrentTier(), expectedTier, done, "tier");
          assertEqualN(hong.tokensCreated(), expectedTokensCreated, done, "tokens created");
          assertEqualN(expectedDivisor, hong.divisor(), done, "divisor");
          assertEqual(expectedFundLocked, hong.isFundLocked(), done, "fund locked");
          assertEqual(expectedFundLocked, hong.isMaxTokensReached(), done, "max tokens reached");
          console.log("expectTotalTax: " + expectTotalTax.toString(10));
          console.log("extraBalance: " + sandbox.web3.toBigNumber(hong.extraBalanceAccountBalance()).toString(10));
          assertTrue(expectTotalTax.equals(sandbox.web3.toBigNumber(hong.extraBalanceAccountBalance())), done, "extra balance");
        }],
        done
    );
  }

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
      // console.log("Wating for tx " + txHash);
      helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
          // console.log("tx done " + txHash);
          if (err) return done(err);
          nextValidation();
          validateTransactions(txAndValidation, done);
      });
  }

  function assertEqualN(expected, actual, done, msg) {
    assertEqual(asNumber(expected), asNumber(actual), done, msg);
  }

  function assertEqual(expected, actual, done, msg) {
    if (!(expected == actual)) {
      var errorMsg = "Failed the '" + msg + "' check, '" + expected + "' != '" + actual + "'";
      done(new Error(errorMsg));
      sandbox.stop(done);
      assert(false, errorMsg); // force an exception
    }
  }

  function assertTrue(exp, done, msg) {
    if (!exp) {
      done(new Error("Failed the '" + msg + "' check"));
      sandbox.stop(done);
      assert(false, msg); // force an exception
    }
  }

  function asNumber(ethNumber) {
    return sandbox.web3.toBigNumber(ethNumber).toNumber();
  }

  function assertEventIsFiredByName(eventType, done, eventName) {
    return assertEventIsFired(eventType, done, function(event) {
      return event.message == eventName;
    });
  }

  function assertEventIsFired(eventType, done, eventFilter) {
    var eventCount = 0;
    eventType.watch(function(err, val) {
      if (err) done(err);
      else if (!eventFilter || eventFilter(val.args)) {
          eventCount++;
      }
    });
    return function(err) {
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

  function logAddressMessagesToConsole(done, address) {
    var filter = sandbox.web3.eth.filter({
      address: hong.extraBalance()
    });
    filter.watch(function(err, val) {
      if (err) {
        console.log(err);
        return done(err);
      }
      console.log(toString(val.data));
    });
    var newDone = function(err) {
      filter.stopWatching();
      done(err);
    };
    return newDone;
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