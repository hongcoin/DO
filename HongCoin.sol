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
contract TokenInterface {
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    uint256 public tokensCreated;

    function balanceOf(address _owner) constant returns (uint256 balance);
    function transfer(address _to, uint256 _amount) returns (bool success);

    event evTransfer(address indexed _from, address indexed _to, uint256 _amount);

    // Modifier that allows only shareholders to trigger
    modifier onlyTokenHolders {
        if (balanceOf(msg.sender) == 0) throw;
            _
    }
}

contract Token is TokenInterface {
    // Protects users by preventing the execution of method calls that
    // inadvertently also transferred ether
    modifier noEther() {if (msg.value > 0) throw; _}
    modifier hasEther() {if (msg.value <= 0) throw; _}

    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }

    function transfer(address _to, uint256 _amount) noEther returns (bool success) {
        if (_amount <= 0) return false;
        if (balances[msg.sender] < _amount) return false;
        if (balances[_to] + _amount < balances[_to]) return false;

        balances[msg.sender] -= _amount;
        balances[_to] += _amount;

        evTransfer(msg.sender, _to, _amount);

        return true;
    }
}


contract ManagedAccountInterface {

    // These are the only two addresses that this account can send to.  Seems safer to avoid an interface that
    // takes in an arbitrary address as a parameter.
    address public owner;
    address public downstreamAccount;

    modifier onlyOwner() {
        if (msg.sender != owner) throw;
        _
    }

    modifier noEther() {
        if (msg.value > 0) throw;
        _
    }

    function payBalanceDownstream() onlyOwner noEther;
    function payBalanceToOwner() onlyOwner noEther;
    function payPercentageDownstream(uint percent) onlyOwner noEther;
    function payOwnerAmount(uint _amount) onlyOwner noEther;
    function actualBalance() returns (uint);

    event evPayOut(address indexed _recipient, uint _amount);
}


contract ManagedAccount is ManagedAccountInterface{

    function ManagedAccount(address _owner, address _downstreamAccount) {
        owner = _owner;
        downstreamAccount = _downstreamAccount;
    }

    function payBalanceDownstream() onlyOwner noEther {
        payOut(downstreamAccount, this.balance);
    }

    function payBalanceToOwner() onlyOwner noEther {
       payOut(owner, this.balance);
    }

    function payPercentageDownstream(uint percent) onlyOwner noEther {
        payOut(downstreamAccount, this.balance * (percent/100));
    }

    function payOwnerAmount(uint _amount) onlyOwner noEther {
        payOut(owner, _amount);
    }

    function payOut(address _recipient, uint _amount) internal onlyOwner noEther {
        if (!_recipient.send(_amount)) throw;
        evPayOut(_recipient, _amount);
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
    uint public tokensAvailableForCurrentTier;
    ManagedAccount public extraBalance;
    mapping (address => uint256) weiGiven;
    mapping (address => uint256) taxPaid;

    function createTokenProxy(address _tokenHolder) returns (bool success);
    function refund();
    function divisor() constant returns (uint divisor);

    event evMinTokensReached(uint value);
    event evCreatedToken(address indexed to, uint amount);
    event evRefund(address indexed to, uint value, bool result);
}


contract GovernanceInterface {

    // The variable indicating whether the fund has achieved the inital goal or not.
    // This value is automatically set, and CANNOT be reversed.
    bool public isFundLocked;
    modifier notLocked() {if (isFundLocked) throw; _}
    modifier onlyHarvestEnabled() {if (!isHarvestEnabled) throw; _}
    modifier onlyDistributionNotInProgress() {if (isDistributionInProgress) throw; _}
    modifier onlyDistributionNotReady() {if (isDistributionReady) throw; _}
    modifier onlyDistributionReady() {if (!isDistributionReady) throw; _}
    modifier onlyCanIssueBountyToken(uint _amount) {
        // TEST maxBountyTokens 2 * MILLION
        uint MILLION = 10**6;
        uint maxBountyTokens = 2 * MILLION;
        if (bountyTokensCreated + _amount > maxBountyTokens){throw;}
        _
    }
    modifier onlyFinalFiscalYear() {
        // Only call harvest() in the final fiscal year
        if (currentFiscalYear < 4) throw; _
    }
    modifier notFinalFiscalYear() {
        // Token holders cannot freeze fund at the 4th Fiscal Year after passing `kickoff(4)` voting
        if (currentFiscalYear >= 4) throw; _
    }
    modifier onlyNotFrozen() {
        if (isFreezeEnabled) throw; _
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

    event evIssueManagementFee(uint _amount, bool _success);
    event evMgmtIssueBountyToken(address _recipientAddress, uint _amount, bool _success);
    event evMgmtDistributed(uint256 _amount, bool _success);
    event evMgmtInvestProject(address _projectWallet, uint _amount, bool result);

    // Triggered when the minTokensToCreate is reached
    event evLockFund();
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
        uint weiPerInitialHONG = 10**16;
        var weiPerLatestHONG = weiPerInitialHONG * divisor() / 100;
        uint tokensRequestedWithLatestPrice = msg.value / weiPerLatestHONG;
        uint tokensToSupply;
        uint256 weiToAccept = msg.value;
        uint256 weiToRefund = 0;
        bool wasMinTokensReached = isMinTokensReached();

        // logic to check amount of tokens to create at the current token price

        if (tokensAvailableForCurrentTier >= tokensRequestedWithLatestPrice) {
            // issue the requested tokens
            // tokensAvailableForCurrentTier becomes the remaining token for the current tier
            tokensAvailableForCurrentTier -= tokensRequestedWithLatestPrice;
            tokensToSupply = tokensRequestedWithLatestPrice;

            balances[_tokenHolder] += tokensToSupply;
            tokensCreated += tokensToSupply;
            weiGiven[_tokenHolder] += weiToAccept;

        } else {
            // create the remaining tokens at the current price, and the remaining tokens at the next tier
            // how many tokens can be created at the current tier
            tokensToSupply = tokensAvailableForCurrentTier;
            tokensAvailableForCurrentTier = tokensPerTier; // reset the value for the next tier

            // check if this is the last tier.
            if ((tokensCreated + tokensToSupply) >= maxTokensToCreate) {
                //  Do refund for the remaining fund.

                tokensToSupply = maxTokensToCreate - tokensCreated;
                weiToAccept = tokensToSupply * weiPerLatestHONG;
                weiToRefund = msg.value - weiToAccept;

                balances[_tokenHolder] += tokensToSupply;
                tokensCreated += tokensToSupply;
                weiGiven[_tokenHolder] += weiToAccept;

            } else {

                // if it is not the last tier, go the the next tier

                // remaining wei for the next tier
                uint remainingFund = msg.value - weiPerLatestHONG * tokensToSupply;

                // update the value for the next year
                weiPerLatestHONG = weiPerInitialHONG * divisor() / 100;

                // based on the wei/price ratio, find number of tokens can get for the next tier
                tokensRequestedWithLatestPrice = remainingFund / weiPerLatestHONG;

                // if that is too many tokens (greater than a tier), throw
                if(tokensRequestedWithLatestPrice > tokensAvailableForCurrentTier) {
                    // do not accept large amount of tokens at a time
                    throw;
                } else {
                    // process the remaining fund
                    tokensAvailableForCurrentTier -= tokensRequestedWithLatestPrice;
                    tokensToSupply += tokensRequestedWithLatestPrice;

                    balances[_tokenHolder] += tokensToSupply;
                    tokensCreated += tokensToSupply;
                    weiGiven[_tokenHolder] += weiToAccept;
                }
            }

        }

        // State Changes (no external calls)
        isFundLocked = isMaxTokensReached();

        // if we've reached the 30 day mark, try to lock the fund
        if (!isFundLocked && !isDayThirtyChecked && (now >= closingTime)) {
            if (isMinTokensReached()) {
                isFundLocked = true;
            }
            isDayThirtyChecked = true;
        }

        // if we've reached the 60 day mark, try to lock the fund
        // TEST closingTimeExtensionPeriod = 30 days
        if (!isFundLocked && !isDaySixtyChecked && (now >= (closingTime + 30 days))) {
            if (isMinTokensReached()) {
                isFundLocked = true;
            }
            isDaySixtyChecked = true;
        }

        // when the caller is paying more than 10**16 wei (0.01 Ether) per token, the extra is basically a tax.
        uint256 totalTaxLevied = weiToAccept - tokensToSupply * weiPerInitialHONG;

        // External calls
        if (totalTaxLevied > 0) {
            if (!extraBalance.send(totalTaxLevied))
                throw;
        }

        // TODO: might be better to put this into overpayment[_tokenHolder] += weiToRefund
        // and let them call back for it.
        if (weiToRefund > 0) {
            if (!msg.sender.send(weiToRefund))
                throw;
        }

        // Events.  Safe to publish these now that we know if all worked
        evCreatedToken(_tokenHolder, tokensToSupply);
        if (!wasMinTokensReached && isMinTokensReached()) evMinTokensReached(tokensCreated);
        if (isFundLocked) evLockFund();
        return true;
    }

    function refund() noEther notLocked onlyTokenHolders {
        // 1: Preconditions
        if (weiGiven[msg.sender] < 0) throw;
        if (taxPaid[msg.sender] < 0) throw;
        if (balances[msg.sender] > tokensCreated) throw;

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
            evRefund(msg.sender, amountToRefund, false);
            throw;
        }

        evRefund(msg.sender, amountToRefund, true);
        if (!wasMinTokensReached && isMinTokensReached()) evMinTokensReached(tokensCreated);
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
        evMgmtIssueBountyToken(_recipientAddress, _amount, true);

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
        evMgmtDistributed(ReturnAccount.actualBalance(), true);
        isDistributionInProgress = false;
    }

    function payoutBalanceToReturnAccount() internal {
        if (!ReturnAccount.send(this.balance))
            throw;
    }

    function divisor() constant returns (uint divisor) {

        // Quantity divisor model: based on total quantity of coins issued
        // Temp: Price ranged from 1.0 to 1.04 Ether for 500 M HONG Tokens

        // The number of (base unit) tokens per wei is calculated
        // as `msg.value` * 100 / `divisor`

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


contract HONGInterface {

    // we do not have grace period. Once the goal is reached, the fund is secured

    address public managementBodyAddress;

    modifier onlyVoteHarvestOnce() {
        // prevent duplicate voting from the same token holder
        if(votedHarvest[msg.sender] > 0){throw;}
        _
    }
    modifier onlyCollectOnce() {
        // prevent return being collected by the same token holder
        if(returnCollected[msg.sender]){throw;}
        _
    }

    // 3 most important votings in blockchain
    mapping (uint => mapping (address => uint)) public votedKickoff;
    mapping (address => uint) public votedFreeze;
    mapping (address => uint) public votedHarvest;
    mapping (address => bool) public returnCollected;

    mapping (uint => uint256) public supportKickoffQuorum;
    uint256 public supportFreezeQuorum;
    uint256 public supportHarvestQuorum;

    mapping (address => uint) public rewardToken;
    uint public totalInitialBalance;
    uint public annualManagementFee;
    uint public totalRewardToken;

    HONG_Creator public hongcoinCreator;

    function () returns (bool success);

    function kickoff(uint _fiscal);
    function freeze();
    function unFreeze();
    function harvest();

    function collectReturn();

    // Trigger the following events when the voting result is available
    event evKickoff(uint _fiscal);
    event evFreeze();
    event evHarvest();
}



// The HONG contract itself
contract HONG is HONGInterface, Token, TokenCreation {

    function HONG(
        address _managementBodyAddress,
        HONG_Creator _hongcoinCreator,
        // A variable to be set 30 days after contract execution.
        // There is an extra 30-day period after this date for second round, if it failed to reach for the first deadline.
        uint _closingTime
    ) TokenCreation(_managementBodyAddress, _closingTime) {

        managementBodyAddress = _managementBodyAddress;
        hongcoinCreator = _hongcoinCreator;
        ReturnAccount = new ManagedAccount(address(this), managementBodyAddress);
        HONGRewardAccount = new ManagedAccount(address(this), address(ReturnAccount));
        ManagementFeePoolWallet = new ManagedAccount(address(this), address(ReturnAccount));
        if (address(ReturnAccount) == 0)
            throw;
        if (address(HONGRewardAccount) == 0)
            throw;
        if (address(ManagementFeePoolWallet) == 0)
            throw;

        uint MILLION = 10**6;
        // TEST minTokensToCreate 100 * MILLION
        // TEST maxTokensToCreate 250 * MILLION
        minTokensToCreate = 100 * MILLION;
        maxTokensToCreate = 250 * MILLION;

        tokensPerTier = 50 * MILLION;
        tokensAvailableForCurrentTier = tokensPerTier;
    }

    function () returns (bool success) {

        // We do not accept donation here. Any extra amount sent to us will be refunded
        return createTokenProxy(msg.sender);
    }


    /*
     * Voting for some critical steps, on blockchain
     */
    function kickoff(uint _fiscal) onlyTokenHolders noEther {

        if(!isInitialKickoffEnabled){  // if there is no kickoff() enabled before
            // input of _fiscal have to be the first year
            // available range of _fiscal is [1]
            if(_fiscal == 1){
                // accept voting
            }else{
                throw;
            }

        }else if(currentFiscalYear <= 3){  // if there was any kickoff() enabled before already
            // available range of _fiscal is [2,3,4]
            // input of _fiscal have to be the next year
            if(_fiscal != currentFiscalYear + 1){
                throw;
            }

            // TEST lastKickoffDateBuffer = 304 days
            if(lastKickoffDate + 304 days < now){ // 2 months from the end of the fiscal year
                // accept voting
            }else{
                // we do not accept early kickoff
                throw;
            }
        }else{
            // do not accept kickoff anymore after the 4th year
            throw;
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
                    throw;
                }

            }
            isKickoffEnabled[_fiscal] = true;
            currentFiscalYear = _fiscal;
            lastKickoffDate = now;

            // transfer 2% annual management fee from reservedWallet to mgmtWallet (external)
            ManagementFeePoolWallet.payOwnerAmount(annualManagementFee);

            evKickoff(_fiscal);
            evIssueManagementFee(annualManagementFee, true);
        }
    }

    function freeze() onlyTokenHolders noEther notFinalFiscalYear onlyDistributionNotInProgress {

        supportFreezeQuorum -= votedFreeze[msg.sender];
        supportFreezeQuorum += balances[msg.sender];
        votedFreeze[msg.sender] = balances[msg.sender];

        if(supportFreezeQuorum * 2 > (tokensCreated + bountyTokensCreated)){ // 50%
            isFreezeEnabled = true;
            distributeDownstream(0);
            evFreeze();
        }
    }

    function unFreeze() onlyTokenHolders onlyNotFrozen noEther {
        supportFreezeQuorum -= votedFreeze[msg.sender];
        votedFreeze[msg.sender] = 0;
    }

    function harvest() onlyTokenHolders noEther onlyFinalFiscalYear onlyVoteHarvestOnce {

        supportHarvestQuorum -= votedHarvest[msg.sender];
        supportHarvestQuorum += balances[msg.sender];
        votedHarvest[msg.sender] = balances[msg.sender];

        if(supportHarvestQuorum * 2 > (tokensCreated + bountyTokensCreated)){ // 50%
            isHarvestEnabled = true;
            evHarvest();
        }
    }

    function collectReturn() onlyTokenHolders noEther onlyDistributionReady onlyCollectOnce {
        // transfer all tokens in ReturnAccount back to Token Holder's account

        // Formula:  valueToReturn =  unit price * 0.8 * (tokens owned / total tokens created)
        uint valueToReturn = ReturnAccount.actualBalance() * 8 / 10 * balances[msg.sender] / (tokensCreated + bountyTokensCreated);
        returnCollected[msg.sender] = true;

        if(!ReturnAccount.send(valueToReturn)){
            throw;
        }
    }

    function mgmtInvestProject(
        address _projectWallet,
        uint _amount
    ) noEther onlyManagementBody returns (bool _success) {

        if(!isKickoffEnabled[currentFiscalYear] || isFreezeEnabled || isHarvestEnabled){
            evMgmtInvestProject(_projectWallet, _amount, false);
            throw;
        }

        if(_amount >= actualBalance()){
            throw;
        }

        // send the balance (_amount) to _projectWallet
        if (!_projectWallet.call.value(_amount)()) {
            throw;
        }

        // Initiate event
        evMgmtInvestProject(_projectWallet, _amount, true);
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
            throw;
        }
    }

    function actualBalance() constant returns (uint _actualBalance) {
        return this.balance;
    }
}

contract HONG_Creator {
    function createHONG(
        address _managementBodyAddress,
        uint _closingTime
    ) returns (HONG _newHONG) {

        return new HONG(
            _managementBodyAddress,
            HONG_Creator(this),
            _closingTime
        );
    }
}
