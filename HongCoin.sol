/*

- Bytecode Verification performed was compared on second iteration -

This file is part of the HONG.

The HONG is free software: you can redistribute it and/or modify
it under the terms of the GNU lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

The HONG is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU lesser General Public License for more details.

You should have received a copy of the GNU lesser General Public License
along with the HONG.  If not, see <http://www.gnu.org/licenses/>.
*/

contract ErrorHandler {
    // uint public errorCount = 0;
    event evRecord(address msg_sender, uint msg_value, string eventType, string message);
    function doThrow(string message) {
        // errorCount++;
        evRecord(msg.sender, msg.value, "Error", message);
        // throw;
    }
}

contract TokenInterface is ErrorHandler {
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    uint256 public tokensCreated;

    function balanceOf(address _owner) constant returns (uint256 balance);
    function transfer(address _to, uint256 _amount) returns (bool success);

    event evTransfer(address msg_sender, uint msg_value, address indexed _from, address indexed _to, uint256 _amount);

    // Modifier that allows only shareholders to trigger
    modifier onlyTokenHolders {
        if (balanceOf(msg.sender) == 0) doThrow("onlyTokenHolders"); else {_}
    }
}

contract Token is TokenInterface {
    // Protects users by preventing the execution of method calls that
    // inadvertently also transferred ether
    modifier noEther() {if (msg.value > 0) doThrow("noEther"); else{_}}
    modifier hasEther() {if (msg.value <= 0) doThrow("hasEther"); else{_}}

    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }

    function transfer(address _to, uint256 _amount) noEther returns (bool success) {
        if (_amount <= 0) return false;
        if (balances[msg.sender] < _amount) return false;
        if (balances[_to] + _amount < balances[_to]) return false;

        balances[msg.sender] -= _amount;
        balances[_to] += _amount;

        evTransfer(msg.sender, msg.value, msg.sender, _to, _amount);

        return true;
    }
}


contract ManagedAccountInterface is ErrorHandler {

    // These are the only two addresses that this account can send to.  Seems safer to avoid an interface that
    // takes in an arbitrary address as a parameter.
    address public owner;
    address public downstreamAccount;

    modifier onlyOwner() {
        if (msg.sender != owner) doThrow("onlyOwner");
        else {_}
    }

    modifier noEther() {
        if (msg.value > 0) doThrow("noEther");
        else {_}
    }

    function payBalanceDownstream() onlyOwner noEther;
    function payBalanceToOwner() noEther;
    function payPercentageDownstream(uint percent) onlyOwner noEther;
    function payOwnerAmount(uint _amount) onlyOwner noEther;
    function actualBalance() returns (uint);

    event evPayOut(address msg_sender, uint msg_value, address indexed _recipient, uint _amount);
}


contract ManagedAccount is ManagedAccountInterface{

    function ManagedAccount(address _owner, address _downstreamAccount) {
        owner = _owner;
        downstreamAccount = _downstreamAccount;
    }

    function payBalanceDownstream() onlyOwner noEther {
        payOut(downstreamAccount, this.balance);
    }

    function payBalanceToOwner() noEther {
       payOut(owner, this.balance);
    }

    function payPercentageDownstream(uint percent) onlyOwner noEther {
        payOut(downstreamAccount, this.balance * (percent/100));
    }

    function payOwnerAmount(uint _amount) onlyOwner noEther {
        payOut(owner, _amount);
    }

    function payOut(address _recipient, uint _amount) internal {
        if (!_recipient.send(_amount))
            doThrow("payOut:sendFailed");
        else
            evPayOut(msg.sender, msg.value, _recipient, _amount);
    }

    // consistent with HONG contract
    function actualBalance() returns (uint) {
        return this.balance;
    }
}


/*
 * Token Creation contract, similar to other organization,for issuing tokens and initialize
 * its ether fund.
*/
contract TokenCreationInterface {

    address public managementBodyAddress;
    uint public closingTime;
    uint public minTokensToCreate;
    uint public maxTokensToCreate;
    uint public tokensPerTier;
    uint public weiPerInitialHONG;
    ManagedAccount public extraBalance;
    mapping (address => uint256) weiGiven;
    mapping (address => uint256) public taxPaid;

    function createTokenProxy(address _tokenHolder) returns (bool success);
    function refund();
    function divisor() constant returns (uint divisor);

    event evMinTokensReached(address msg_sender, uint msg_value, uint value);
    event evCreatedToken(address msg_sender, uint msg_value, address indexed to, uint amount);
    event evRefund(address msg_sender, uint msg_value, address indexed to, uint value, bool result);
}


contract GovernanceInterface is ErrorHandler {

    // The variable indicating whether the fund has achieved the inital goal or not.
    // This value is automatically set, and CANNOT be reversed.
    bool public isFundLocked;
    bool public isFundReleased;
    modifier notLocked() {if (isFundLocked) doThrow("notLocked"); else {_}}
    modifier onlyLocked() {if (!isFundLocked) doThrow("onlyLocked"); else {_}}
    modifier onlyHarvestEnabled() {if (!isHarvestEnabled) doThrow("onlyHarvestEnabled"); else {_}}
    modifier onlyDistributionNotInProgress() {if (isDistributionInProgress) doThrow("onlyDistributionNotInProgress"); else {_}}
    modifier onlyDistributionNotReady() {if (isDistributionReady) doThrow("onlyDistributionNotReady"); else {_}}
    modifier onlyDistributionReady() {if (!isDistributionReady) doThrow("onlyDistributionReady"); else {_}}
    modifier onlyCanIssueBountyToken(uint _amount) {
        // TEST maxBountyTokens 2 * MILLION
        uint MILLION = 10**6;
        uint maxBountyTokens = 2 * MILLION;
        if (bountyTokensCreated + _amount > maxBountyTokens){
            doThrow("hitMaxBounty");
        }
        else {_}
    }
    modifier onlyFinalFiscalYear() {
        // Only call harvest() in the final fiscal year
        if (currentFiscalYear < 4) doThrow("currentFiscalYear<4"); else {_}
    }
    modifier notFinalFiscalYear() {
        // Token holders cannot freeze fund at the 4th Fiscal Year after passing `kickoff(4)` voting
        if (currentFiscalYear >= 4) doThrow("currentFiscalYear>=4"); else {_}
    }
    modifier onlyNotFrozen() {
        if (isFreezeEnabled) doThrow("onlyNotFrozen"); else {_}
    }

    bool public isDayThirtyChecked;
    bool public isDaySixtyChecked;

    uint256 public bountyTokensCreated;
    uint public currentFiscalYear;
    uint public lastKickoffDate;
    mapping (uint => bool) public isKickoffEnabled;
    bool public isInitialKickoffEnabled;
    bool public isFreezeEnabled;
    bool public isHarvestEnabled;
    bool public isDistributionInProgress;
    bool public isDistributionReady;

    ManagedAccount public ReturnAccount;
    ManagedAccount public HONGRewardAccount;
    ManagedAccount public ManagementFeePoolWallet;

    // define the governance of this organization and critical functions
    function mgmtIssueBountyToken(address _recipientAddress, uint _amount) returns (bool);
    function mgmtDistribute();

    function mgmtInvestProject(
        address _projectWallet,
        uint _amount
    ) returns (bool);

    event evIssueManagementFee(address msg_sender, uint msg_value, uint _amount, bool _success);
    event evMgmtIssueBountyToken(address msg_sender, uint msg_value, address _recipientAddress, uint _amount, bool _success);
    event evMgmtDistributed(address msg_sender, uint msg_value, uint256 _amount, bool _success);
    event evMgmtInvestProject(address msg_sender, uint msg_value, address _projectWallet, uint _amount, bool result);

    // Triggered when the minTokensToCreate is reached
    event evLockFund(address msg_sender, uint msg_value);
}


contract TokenCreation is TokenCreationInterface, Token, GovernanceInterface {
    modifier onlyManagementBody {
        if(msg.sender == address(managementBodyAddress)) _
    }

    function TokenCreation(
        address _managementBodyAddress,
        uint _closingTime) {

        managementBodyAddress = _managementBodyAddress;
        closingTime = _closingTime;
        extraBalance = new ManagedAccount(address(this), address(this));

    }

    function createTokenProxy(address _tokenHolder) notLocked hasEther returns (bool success) {

        // Business logic (but no state changes)
        // setup transaction details
        uint tokensSupplied = 0;
        uint weiAccepted = 0;
        bool wasMinTokensReached = isMinTokensReached();

        var weiPerLatestHONG = weiPerInitialHONG * divisor() / 100;
        uint remainingWei = msg.value;
        uint tokensAvailable = tokensAvailableAtCurrentTier();

        // Sell tokens in batches based on the current price.
        while (tokensAvailable > 0 && remainingWei >= weiPerLatestHONG) {
            uint tokensRequested = remainingWei / weiPerLatestHONG;
            uint tokensToSellInBatch = min(tokensAvailable, tokensRequested);
            uint priceForBatch = tokensToSellInBatch * weiPerLatestHONG;

            // track to total wei accepted and total tokens supplied
            weiAccepted += priceForBatch;
            tokensSupplied += tokensToSellInBatch;

            // update state
            balances[_tokenHolder] += tokensToSellInBatch;
            tokensCreated += tokensToSellInBatch;
            weiGiven[_tokenHolder] += priceForBatch;

            // update dependent values (state has changed)
            weiPerLatestHONG = weiPerInitialHONG * divisor() / 100;
            remainingWei = msg.value - weiAccepted;
            tokensAvailable = tokensAvailableAtCurrentTier();
        }

        // when the caller is paying more than 10**16 wei (0.01 Ether) per token, the extra is basically a tax.
        uint256 totalTaxLevied = weiAccepted - tokensSupplied * weiPerInitialHONG;
        taxPaid[_tokenHolder] += totalTaxLevied;

        // State Changes (no external calls)
        tryToLockFund();

        // External calls
        if (totalTaxLevied > 0) {
            if (!extraBalance.send(totalTaxLevied))
                doThrow("extraBalance:sendFail");
                return;
        }

        // TODO: might be better to put this into overpayment[_tokenHolder] += remainingWei
        // and let them call back for it.
        if (remainingWei > 0) {
            if (!msg.sender.send(remainingWei))
                doThrow("refund:sendFail");
                return;
        }

        // Events.  Safe to publish these now that we know it all worked
        evCreatedToken(msg.sender, msg.value, _tokenHolder, tokensSupplied);
        if (!wasMinTokensReached && isMinTokensReached()) evMinTokensReached(msg.sender, msg.value, tokensCreated);
        if (isFundLocked) evLockFund(msg.sender, msg.value);
        return true;
    }

    function refund() noEther notLocked onlyTokenHolders {
        // 1: Preconditions
        if (weiGiven[msg.sender] == 0) {
            doThrow("noWeiGiven");
            return;
        }
        if (balances[msg.sender] > tokensCreated) {
            doThrow("invalidTokenCount");
            return;
         }

        // 2: Business logic
        bool wasMinTokensReached = isMinTokensReached();
        var tmpWeiGiven = weiGiven[msg.sender];
        var tmpTaxPaidBySender = taxPaid[msg.sender];
        var tmpSenderBalance = balances[msg.sender];

        var transactionCost = 0; // TODO possibly there is some transaction cost for the refund
        var amountToRefund = tmpWeiGiven - transactionCost;

        // 3: state changes.
        balances[msg.sender] = 0;
        weiGiven[msg.sender] = 0;
        taxPaid[msg.sender] = 0;
        tokensCreated -= tmpSenderBalance;

        // 4: external calls
        // Pull taxes paid back into this contract (they would have been paid into the extraBalance account)
        extraBalance.payOwnerAmount(tmpTaxPaidBySender);

        // If that works, then do a refund
        if (!msg.sender.send(amountToRefund)) {
            evRefund(msg.sender, msg.value, msg.sender, amountToRefund, false);
            doThrow("refund:SendFailed");
            return;
        }

        evRefund(msg.sender, msg.value, msg.sender, amountToRefund, true);
        if (!wasMinTokensReached && isMinTokensReached()) evMinTokensReached(msg.sender, msg.value, tokensCreated);
    }

    // Using a function rather than a state variable, as it reduces the risk of inconsistent state
    function isMinTokensReached() returns (bool) {
        return tokensCreated >= minTokensToCreate;
    }

    function isMaxTokensReached() returns (bool) {
        return tokensCreated >= maxTokensToCreate;
    }

    function mgmtIssueBountyToken(
        address _recipientAddress,
        uint _amount
    ) noEther onlyManagementBody onlyCanIssueBountyToken(_amount) returns (bool){
        // send token to the specified address
        balances[_recipientAddress] += _amount;
        bountyTokensCreated += _amount;

        // event
        evMgmtIssueBountyToken(msg.sender, msg.value, _recipientAddress, _amount, true);

    }

    function mgmtDistribute() noEther onlyManagementBody onlyHarvestEnabled onlyDistributionNotReady {
        distributeDownstream(20);
    }

    function distributeDownstream(uint mgmtPercentage) internal onlyDistributionNotInProgress {

        // transfer all balance from the following accounts
        // (1) HONG main account,
        // (2) ManagementFeePoolWallet,
        // (3) HONGRewardAccount
        // to ReturnAccount

        // And allocate 20% of the fund to ManagementBody

        // State changes first (even though it feels backwards)
        isDistributionInProgress = true;
        isDistributionReady = true;

        // (1) HONG main account
        payoutBalanceToReturnAccount();
        ManagementFeePoolWallet.payBalanceDownstream();
        HONGRewardAccount.payBalanceDownstream();

        // transfer 20% of returns to mgmt Wallet
        if (mgmtPercentage > 0) ReturnAccount.payPercentageDownstream(mgmtPercentage);


        // remaining fund: token holder can claim starting from this point
        // the total amount harvested/ to be distributed
        evMgmtDistributed(msg.sender, msg.value, ReturnAccount.actualBalance(), true);
        isDistributionInProgress = false;
    }

    function payoutBalanceToReturnAccount() internal {
        if (!ReturnAccount.send(this.balance))
            doThrow("payoutBalanceToReturnAccount:sendFailed");
            return;
    }

    function min(uint a, uint b) constant internal returns (uint) {
        if (a < b) return a;
        return b;
    }

    function tryToLockFund() internal {
        // ICO Diagram: https://github.com/hongcoin/DO/wiki/ICO-Period-and-Target

        if (isFundReleased) {
            // Do not change the state anymore
            return;
        }

        // Case A
        isFundLocked = isMaxTokensReached();

        // if we've reached the 30 day mark, try to lock the fund
        if (!isFundLocked && !isDayThirtyChecked && (now >= closingTime)) {
            if (isMinTokensReached()) {
                // Case B
                isFundLocked = true;
            }
            isDayThirtyChecked = true;
        }

        // if we've reached the 60 day mark, try to lock the fund
        // TEST closingTimeExtensionPeriod = 30 days
        if (!isFundLocked && !isDaySixtyChecked && (now >= (closingTime + 30 days))) {
            if (isMinTokensReached()) {
                // Case C
                isFundLocked = true;
            }
            isDaySixtyChecked = true;
        }

        if (isDaySixtyChecked && !isMinTokensReached()) {
            // Case D
            // Mark the release state. No fund should be accepted anymore
            isFundReleased = true;
        }
    }

    function tokensAvailableAtTierInternal(uint8 _currentTier, uint _tokensPerTier, uint _tokensCreated) constant returns (uint) {
        uint tierThreshold = (_currentTier+1) * _tokensPerTier;

        // never go above maxTokensToCreate, which could happen if the max is not a multiple of _tokensPerTier
        if (tierThreshold > maxTokensToCreate) {
            tierThreshold = maxTokensToCreate;
        }

        // this shouldn't happen since the fund should be locked when we hit the max
        if (_tokensCreated > tierThreshold) {doThrow("tooManyTokens"); return 0;}

        return tierThreshold - _tokensCreated;
    }

    function tokensAvailableAtCurrentTier() constant returns (uint) {
        return tokensAvailableAtTierInternal(getCurrentTier(), tokensPerTier, tokensCreated);
    }

    function getCurrentTier() constant returns (uint8) {
        uint8 tier = (uint8) (tokensCreated / tokensPerTier);
        if (tier > 4) doThrow("tierToBig");
        return tier;
    }

    function divisor() constant returns (uint divisor) {

        // Quantity divisor model: based on total quantity of coins issued
        // Temp: Price ranged from 1.0 to 1.04 Ether for 500 M HONG Tokens

        // The number of (base unit) tokens per wei is calculated
        // as `msg.value` * 100 / `divisor`

        // TODO: We could call getCurrentTier here to avoid duplicating this logic

        if(tokensCreated < tokensPerTier){
            return 100;
        } else if (tokensCreated < 2 * tokensPerTier){
            return 101;
        } else if (tokensCreated < 3 * tokensPerTier){
            return 102;
        } else if (tokensCreated < 4 * tokensPerTier){
            return 103;
        } else {
            return 104;
        }
    }
}


contract HONGInterface is ErrorHandler {

    // we do not have grace period. Once the goal is reached, the fund is secured

    address public managementBodyAddress;

    modifier onlyVoteHarvestOnce() {
        // prevent duplicate voting from the same token holder
        if(votedHarvest[msg.sender] > 0){doThrow("onlyVoteHarvestOnce");}
        else {_}
    }
    modifier onlyCollectOnce() {
        // prevent return being collected by the same token holder
        if(returnCollected[msg.sender]){doThrow("onlyCollectOnce");}
        else {_}
    }

    // 3 most important votings in blockchain
    mapping (uint => mapping (address => uint)) public votedKickoff;
    mapping (address => uint) public votedFreeze;
    mapping (address => uint) public votedHarvest;
    mapping (address => bool) public returnCollected;

    mapping (uint => uint256) public supportKickoffQuorum;
    uint256 public supportFreezeQuorum;
    uint256 public supportHarvestQuorum;

    uint public totalInitialBalance;
    uint public annualManagementFee;
    uint public totalRewardToken;

    function () returns (bool success);

    function kickoff();
    function freeze();
    function unFreeze();
    function harvest();

    function collectReturn();

    // Trigger the following events when the voting result is available
    event evKickoff(address msg_sender, uint msg_value, uint _fiscal);
    event evFreeze(address msg_sender, uint msg_value);
    event evHarvest(address msg_sender, uint msg_value);
}



// The HONG contract itself
contract HONG is HONGInterface, Token, TokenCreation {

    function HONG(
        address _managementBodyAddress,
        // A variable to be set 30 days after contract execution.
        // There is an extra 30-day period after this date for second round, if it failed to reach for the first deadline.
        uint _closingTime
    ) TokenCreation(_managementBodyAddress, _closingTime) {

        managementBodyAddress = _managementBodyAddress;
        ReturnAccount = new ManagedAccount(address(this), managementBodyAddress);
        HONGRewardAccount = new ManagedAccount(address(this), address(ReturnAccount));
        ManagementFeePoolWallet = new ManagedAccount(address(this), address(ReturnAccount));
        if (address(ReturnAccount) == 0)
            doThrow("RetrunAccount:0");
        if (address(HONGRewardAccount) == 0)
            doThrow("HONGRewardAccount:0");
        if (address(ManagementFeePoolWallet) == 0)
            doThrow("ManagementFeePoolWallet:0");

        uint MILLION = 10**6;
        // TEST minTokensToCreate 100 * MILLION
        // TEST maxTokensToCreate 250 * MILLION
        minTokensToCreate = 100 * MILLION;
        maxTokensToCreate = 250 * MILLION;

        // TEST tokensCreated steps 50 * MILLION
        tokensPerTier = 50 * MILLION;
        weiPerInitialHONG = 10**16;
    }

    function () returns (bool success) {

        // We do not accept donation here. Any extra amount sent to us will be refunded
        return createTokenProxy(msg.sender);
    }

    function extraBalanceAccountBalance() noEther constant returns (uint) {
        return extraBalance.actualBalance();
    }

    function buyTokens() returns (bool success) {
        return createTokenProxy(msg.sender);
    }

    /*
     * Voting for some critical steps, on blockchain
     */
    function kickoff() onlyTokenHolders noEther onlyLocked {
        // this is the only valid fiscal year parameter, so there's no point in letting the caller pass it in.
        // Best case is they get it wrong and we throw, worst case is the get it wrong and there's some exploit
        uint _fiscal = currentFiscalYear + 1;

        if(!isInitialKickoffEnabled){  // if there is no kickoff() enabled before
            // input of _fiscal have to be the first year
            // available range of _fiscal is [1]
            if(_fiscal == 1){
                // accept voting
            }else{
                doThrow("kickOff:noInitialKickoff");
                return;
            }

        }else if(currentFiscalYear <= 3){  // if there was any kickoff() enabled before already
            // available range of _fiscal is [2,3,4]
            // input of _fiscal have to be the next year
            if(_fiscal != currentFiscalYear + 1){
                doThrow("kickOff:notNextYear");
                return;
            }

            // TEST lastKickoffDateBuffer = 304 days
            if(lastKickoffDate + 304 days < now){ // 2 months from the end of the fiscal year
                // accept voting
            }else{
                // we do not accept early kickoff
                doThrow("kickOff:tooEarly");
                return;
            }
        }else{
            // do not accept kickoff anymore after the 4th year
            doThrow("kickOff:4thYear");
            return;
        }


        supportKickoffQuorum[_fiscal] -= votedKickoff[_fiscal][msg.sender];
        supportKickoffQuorum[_fiscal] += balances[msg.sender];
        votedKickoff[_fiscal][msg.sender] = balances[msg.sender];

        if(supportKickoffQuorum[_fiscal] * 4 > (tokensCreated + bountyTokensCreated)){ // 25%
            if(_fiscal == 1){
                isInitialKickoffEnabled = true;

                // transfer fund in extraBalance to main account
                extraBalance.payBalanceToOwner();

                // reserve 8% of whole fund to ManagementFeePoolWallet
                totalInitialBalance = address(this).balance;
                uint fundToReserve = totalInitialBalance * 8 / 100;
                annualManagementFee = fundToReserve / 4;
                if(!ManagementFeePoolWallet.call.value(fundToReserve)()){
                    doThrow("kickoff:ManagementFeePoolWalletFail");
                    return;
                }

            }
            isKickoffEnabled[_fiscal] = true;
            currentFiscalYear = _fiscal;
            lastKickoffDate = now;

            // transfer 2% annual management fee from reservedWallet to mgmtWallet (external)
            ManagementFeePoolWallet.payOwnerAmount(annualManagementFee);

            evKickoff(msg.sender, msg.value, _fiscal);
            evIssueManagementFee(msg.sender, msg.value, annualManagementFee, true);
        }
    }

    function freeze() onlyTokenHolders noEther onlyLocked notFinalFiscalYear onlyDistributionNotInProgress {

        supportFreezeQuorum -= votedFreeze[msg.sender];
        supportFreezeQuorum += balances[msg.sender];
        votedFreeze[msg.sender] = balances[msg.sender];

        if(supportFreezeQuorum * 2 > (tokensCreated + bountyTokensCreated)){ // 50%
            isFreezeEnabled = true;
            distributeDownstream(0);
            evFreeze(msg.sender, msg.value);
        }
    }

    function unFreeze() onlyTokenHolders onlyNotFrozen noEther {
        supportFreezeQuorum -= votedFreeze[msg.sender];
        votedFreeze[msg.sender] = 0;
    }

    function harvest() onlyTokenHolders noEther onlyLocked onlyFinalFiscalYear onlyVoteHarvestOnce {

        supportHarvestQuorum -= votedHarvest[msg.sender];
        supportHarvestQuorum += balances[msg.sender];
        votedHarvest[msg.sender] = balances[msg.sender];

        if(supportHarvestQuorum * 2 > (tokensCreated + bountyTokensCreated)){ // 50%
            isHarvestEnabled = true;
            evHarvest(msg.sender, msg.value);
        }
    }

    function collectReturn() onlyTokenHolders noEther onlyDistributionReady onlyCollectOnce {
        // transfer all tokens in ReturnAccount back to Token Holder's account

        // Formula:  valueToReturn =  unit price * 0.8 * (tokens owned / total tokens created)
        uint valueToReturn = ReturnAccount.actualBalance() * 8 / 10 * balances[msg.sender] / (tokensCreated + bountyTokensCreated);
        returnCollected[msg.sender] = true;

        if(!ReturnAccount.send(valueToReturn)){
            doThrow("failed:collectReturn");
        }
    }

    function mgmtInvestProject(
        address _projectWallet,
        uint _amount
    ) noEther onlyManagementBody returns (bool _success) {

        if(!isKickoffEnabled[currentFiscalYear] || isFreezeEnabled || isHarvestEnabled){
            evMgmtInvestProject(msg.sender, msg.value, _projectWallet, _amount, false);
            return;
        }

        if(_amount >= actualBalance()){
            doThrow("failed:mgmtInvestProject: amount >= actualBalance");
            return;
        }

        // send the balance (_amount) to _projectWallet
        if (!_projectWallet.call.value(_amount)()) {
            doThrow("failed:mgmtInvestProject: cannot send send to _projectWallet");
            return;
        }

        // Initiate event
        evMgmtInvestProject(msg.sender, msg.value, _projectWallet, _amount, true);
    }

    function transfer(address _to, uint256 _value) returns (bool success) {

        // Reset kickoff voting for the next fiscal year from this address to false
        if(currentFiscalYear < 4){
            if(votedKickoff[currentFiscalYear+1][msg.sender] > _value){
                votedKickoff[currentFiscalYear+1][msg.sender] -= _value;
            }
        }

        // Reset Freeze and Harvest voting from this address to false
        if(votedFreeze[msg.sender] > _value){
            votedFreeze[msg.sender] -= _value;
        }else{
            votedFreeze[msg.sender] = 0;
        }

        if(votedHarvest[msg.sender] > _value){
            votedHarvest[msg.sender] -= _value;
        }else{
            votedHarvest[msg.sender] = 0;
        }

        if (isFundLocked && super.transfer(_to, _value)) {
            return true;
        } else {
            if(!isFundLocked){
                doThrow("failed:transfer: isFundLocked is false");
            }else{
                doThrow("failed:transfer: cannot send send to _projectWallet");
            }
            return;
        }
    }

    function actualBalance() constant returns (uint _actualBalance) {
        return this.balance;
    }
}
