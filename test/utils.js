var assert = require('assert');
var MILLION = 1000 * 1000;
module.exports = {
  doLog: function(s) {
      console.log(s);
  },
  
  sandbox: null,
  hong: null,
  ownerAddress: null,
  helper: null,
  maxGas: 4800000,
  minTokensToCreate: 100 * MILLION,
  maxTokensToCreate: 250 * MILLION,
  tokensPerTier: 50 * MILLION,
  
  createContract : function (compiled, done, _endDate, _closingTimeExtensionPeriod, _lastKickoffDateBuffer) {
      var that = this;
      this.sandbox.web3.eth.contract(JSON.parse(compiled.contracts['HONG'].interface)).new(
          this.ownerAddress,
          _endDate,
          _closingTimeExtensionPeriod,
          _lastKickoffDateBuffer,
          this.minTokensToCreate, this.maxTokensToCreate, this.tokensPerTier,
          {
            /* contract creator */
            from: this.ownerAddress,
  
            /* contract bytecode */
            data: '0x' + compiled.contracts['HONG'].bytecode
          },
          function(err, contract) {
            console.log("Setup: err=" + err + ", contract=" + contract);
            if (err) done(err);
            else if (contract.address){
              var receipt = that.sandbox.web3.eth.getTransactionReceipt(contract.transactionHash);
              that.hong = contract;
              console.log("Contract at : " + contract.address);
              console.log("Contract tx hash: " + contract.transactionHash);
              console.log("Gas used: " + receipt.gasUsed);
              console.log("hong: " + contract);
              console.log("extraBalance: " + contract.extraBalanceWallet());
              if (receipt.gasUsed > that.maxGas) {
                  done(new Error("Gas used to deploy contract exceeds gasLimit!"));
              }
              else {
                done();
              }
            }
          }
      );
  },

  sleepUntil : function( deadline ){
    console.log("Sleeping for " + (deadline - this.now()) + "s");
    while(this.now() < deadline){ /* do nothing */ } 
  },
  
  // Return the time, but in seconds since epoch (since that's what ethereum uses)
  now : function() {
    return new Date().getTime()/1000;
  },
  
  getWalletBalance : function(address) {
    return this.sandbox.web3.eth.getBalance(address);
  },
  
  buyTokens : function (buyer, wei) {  
    return this.sandbox.web3.eth.sendTransaction({from: buyer, to: this.hong.address, gas: 900000, value: wei});
  },
    
  logEventsToConsole : function (done) {
    var filter = this.hong.evRecord();
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
  },

  logAddressMessagesToConsole : function (done, _address) {
    var filter = this.sandbox.web3.eth.filter({
      address: _address
    });
    filter.watch(function(err, val) {
      if (err) {
        console.log(err);
        return done(err);
      }
      console.log("Msg from address(" + _address + "): " + toString(val.data));
    });
    var newDone = function(err) {
      filter.stopWatching();
      done(err);
    };
    return newDone;
  },
  
  assertEqualN: function (expected, actual, done, msg) {
    this.assertEqual(this.asNumber(expected), this.asNumber(actual), done, msg);
  },

  assertEqualB : function (expected, actual, done, msg) {
    if (!(expected.equals(actual))) {
      var errorMsg = "Failed the '" + msg + "' check, '" + expected + "' != '" + actual + "'";
      done(new Error(errorMsg));
      this.sandbox.stop(done);
      assert(false, errorMsg); // force an exception
    }
  },

  assertEqual : function (expected, actual, done, msg) {
    if (!(expected == actual)) {
      var errorMsg = "Failed the '" + msg + "' check, '" + expected + "' != '" + actual + "'";
      done(new Error(errorMsg));
      this.sandbox.stop(done);
      assert(false, errorMsg); // force an exception
    }
  },

  assertTrue : function (exp, done, msg) {
    if (!exp) {
      done(new Error("Failed the '" + msg + "' check"));
      this.sandbox.stop(done);
      this.assert(false, msg); // force an exception
    }
  },

  asNumber : function (ethNumber) {
    return this.sandbox.web3.toBigNumber(ethNumber).toNumber();
  },

  asBigNumber : function (ethNumber) {
    return this.sandbox.web3.toBigNumber(ethNumber);
  },


  assertEventIsFiredByName : function (eventType, done, eventName) {
    return this.assertEventIsFired(eventType, done, function(event) {
      return event.message == eventName;
    });
  },

  assertEventIsFired : function (eventType, done, eventFilter) {
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
  },
  
  purchaseAllTokensInTier : function (done, buyer, expectedFundLocked, extraTokens) {
    console.log("Purchasing the rest of the tokens in current tier, currentTier: " + this.hong.getCurrentTier());
    done = this.logEventsToConsole(done);

    var tokensPerTier = this.asNumber(this.hong.tokensPerTier());
    var tokensAvailable = this.asNumber(this.hong.tokensAvailableAtCurrentTier());
    var pricePerTokenAtCurrentTier = this.hong.pricePerTokenAtCurrentTier();
    var previousBalanceOfBuyer = this.asNumber(this.hong.balanceOf(buyer));
    var onePercentWeiPerInitialHONG = this.sandbox.web3.toBigNumber(this.hong.weiPerInitialHONG()).dividedBy(100);

    // having trouble getting the right precision to represent this big purchase.
    // adding padding of weiPerToken/2 to ensure that the requested number of tokens are
    // purchased but not more.
    var currentTier = this.asNumber(this.hong.getCurrentTier());
    var expectedTier = Math.min(4, currentTier + 1);
    var expectedTokensPurchased = tokensAvailable + extraTokens; // one token at the next price will be purchased
    var weiToSend = pricePerTokenAtCurrentTier*expectedTokensPurchased + pricePerTokenAtCurrentTier/2;
    var expectedDivisor = 100 + expectedTier;
    var expectedTokensCreated = tokensPerTier * (currentTier+1) + extraTokens;
    var percentExtra = (currentTier * (currentTier+1))/2;
    var expectTotalTax = onePercentWeiPerInitialHONG.times(percentExtra).times(tokensPerTier);
    expectTotalTax = expectTotalTax.plus(onePercentWeiPerInitialHONG.times(currentTier).times(extraTokens))

    var that = this;
    this.validateTransactions([
        function() {
            return that.buyTokens(that.hong, buyer, weiToSend);
        },
        function() {
          that.assertEqualN(that.hong.balanceOf(buyer), expectedTokensPurchased + previousBalanceOfBuyer, done, "buyer balance");
          that.assertEqualN(that.hong.getCurrentTier(), expectedTier, done, "tier");
          that.assertEqualN(that.hong.tokensCreated(), expectedTokensCreated, done, "tokens created");
          that.assertEqualN(expectedDivisor, that.hong.divisor(), done, "divisor");
          that.assertEqual(expectedFundLocked, that.hong.isFundLocked(), done, "fund locked");
          that.assertEqual(expectedFundLocked, that.hong.isMaxTokensReached(), done, "max tokens reached");
          that.assertTrue(expectTotalTax.equals(that.sandbox.web3.toBigNumber(that.getWalletBalance(that.hong.extraBalanceWallet()))), done, "extra balance");
        }],
        done
    );
  },

    /*
   * The basic template for simple tests is as follows:
   *
   * validateTransaction(
   *   [action1, validation1, action2, validation2, action3, validation3, ...],
   *   done
   * );
   * The "done" function is passed into the test by the framework and should be called when the test completes.
   */
  validateTransactions : function (txAndValidation, done) {
      if (txAndValidation.length == 0) {
        done();
        return;
      }

      this.assertEqualN(txAndValidation.length%2, 0, done, "Array should have action-validation pairs [action1, validation1, action2, validation2, ...]");

      // grab the next transaction and validation
      var nextTx = txAndValidation.shift();
      var nextValidation = txAndValidation.shift();

      var txHash = nextTx();
      // console.log("Wating for tx " + txHash);
      var that = this;
      this.helper.waitForReceipt(this.sandbox.web3, txHash, function(err, receipt) {
          // console.log("tx done " + txHash);
          if (err) return done(err);
          nextValidation();
          that.validateTransactions(txAndValidation, done);
      });
  },
  
  printBalances : function() {
    console.log("-------");
    console.log("Hong: " + this.hong.actualBalance());
    console.log("extraBalanceWallet: " + this.getWalletBalance(this.hong.extraBalanceWallet()));
    console.log("managementFeeWallet: " + this.getWalletBalance(this.hong.managementFeeWallet()));
    console.log("returnWallet: " + this.getWalletBalance(this.hong.returnWallet()));
    console.log("rewardWallet: " + this.getWalletBalance(this.hong.rewardWallet()));
    console.log("managementBody: " + this.getWalletBalance(this.hong.managementBodyAddress()));
    console.log("");
  }
};