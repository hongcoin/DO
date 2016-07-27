/*

- Bytecode Verification performed was compared on second iteration -

This file is part of the HongCoin.

The HongCoin is free software: you can redistribute it and/or modify
it under the terms of the GNU lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

The HongCoin is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU lesser General Public License for more details.

You should have received a copy of the GNU lesser General Public License
along with the HongCoin.  If not, see <http://www.gnu.org/licenses/>.
*/



contract TokenInterface {
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    uint256 public totalSupply;

    function balanceOf(address _owner) constant returns (uint256 balance);
    function transfer(address _to, uint256 _amount) returns (bool success);
    function transferFrom(address _from, address _to, uint256 _amount) returns (bool success);

    event evTransfer(address indexed _from, address indexed _to, uint256 _amount);
}


contract Token is TokenInterface {
    // Protects users by preventing the execution of method calls that
    // inadvertently also transferred ether
    modifier noEther() {if (msg.value > 0) throw; _}

    modifier onlyOwner {
        if(msg.sender == address(this)) _
    }

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

    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) noEther returns (bool success) {

        if (balances[_from] >= _amount
            && allowed[_from][msg.sender] >= _amount
            && _amount > 0) {

            balances[_to] += _amount;
            balances[_from] -= _amount;
            allowed[_from][msg.sender] -= _amount;
            evTransfer(_from, _to, _amount);
            return true;
        } else {
            return false;
        }
    }
}






contract ManagedAccountInterface {
    address public owner;
    bool public payOwnerOnly;
    uint public accumulatedInput;

    function payOut(address _recipient, uint _amount) returns (bool);

    event evPayOut(address indexed _recipient, uint _amount);
}


contract ManagedAccount is ManagedAccountInterface{

    function ManagedAccount(address _owner, bool _payOwnerOnly) {
        owner = _owner;
        payOwnerOnly = _payOwnerOnly;
    }

    function() {
        accumulatedInput += msg.value;
    }

    function payOut(address _recipient, uint _amount) returns (bool) {
        if (msg.sender != owner || msg.value > 0 || (payOwnerOnly && _recipient != owner))
            throw;
        if (_recipient.call.value(_amount)()) {
            evPayOut(_recipient, _amount);
            return true;
        } else {
            return false;
        }
    }
}





/*
 * Token Creation contract, similar to other organization,for issuing tokens and initialize
 * its ether fund.
*/


contract TokenCreationInterface {

    uint public closingTime;
    uint public minTokensToCreate;
    uint public maxTokensToCreate;
    bool public isMinTokenReached;
    bool public isMaxTokenReached;
    ManagedAccount public extraBalance;
    mapping (address => uint256) weiGiven;

    function createTokenProxy(address _tokenHolder) returns (bool success);
    function refund();
    function divisor() constant returns (uint divisor);

    event evFuelingToDate(uint value);
    event evCreatedToken(address indexed to, uint amount);
    event evRefund(address indexed to, uint value, bool result);

}


contract GovernanceInterface {

    // The variable indicating whether the fund has achieved the inital goal or not.
    // This value is automatically set, and CANNOT be reversed.
    bool public isFundLocked;

    bool public isDayThirtyChecked;
    bool public isDaySixtyChecked;

    bool public isKickoffEnabled;
    bool public isFreezeEnabled;
    bool public isHarvestEnabled;
    bool public isDistributionReady;


    // define the governance of this organization and critical functions
    function mgmtKickoff(uint _fiscal) returns (bool);

    // TODO move this away: the progress should be automatically triggered inside mgmtKickoff(x)
    function reserveToWallet(address _reservedWallet) returns (bool);

    function mgmtIssueManagementFee(address _managementWallet, uint _amount) returns (bool);
    function mgmtDistribute() returns (bool);

    function mgmtInvestProject(
        address _projectWallet,
        uint _amount
    ) returns (bool);

    event evMgmtKickoff(uint256 _fiscal, bool _success);
    event evMgmtIssueManagementFee(uint _amount, bool _success);
    event evMgmtDistributed(uint256 _amount, bool _success);
    event evMgmtInvestProject(address _projectWallet, uint _amount, bool result);

    // Triggered when the minTokensToCreate is reached
    event evLockFund();
}


contract TokenCreation is TokenCreationInterface, Token, GovernanceInterface {
    function TokenCreation(
        uint _minTokensToCreate,
        uint _maxTokensToCreate,
        uint _closingTime) {

        closingTime = _closingTime;
        minTokensToCreate = _minTokensToCreate;
        maxTokensToCreate = _maxTokensToCreate;
        extraBalance = new ManagedAccount(address(this), true);
    }

    function createTokenProxy(address _tokenHolder) returns (bool success) {

        if(isFundLocked){
            // we refund the input
            // TODO possibly there is some transaction cost for the refund
            msg.sender.call.value(msg.value)();

        } else if(msg.value > 0) {

            uint token = (msg.value * 100) / divisor();

            // if the value of maxTokensToCreate is reached (including current transaction)
            if(totalSupply + token > maxTokensToCreate){
                isMaxTokenReached = true;

                // accept part of the fund, refund the remaining part
                uint tokenToSupply = maxTokensToCreate - totalSupply;
                uint fundToAccept = (msg.value * divisor() / 100 - tokenToSupply);

                extraBalance.call.value(fundsToAccept - tokenToSupply)();
                balances[_tokenHolder] += tokenToSupply;
                totalSupply += tokenToSupply;
                weiGiven[_tokenHolder] += fundToAccept;
                evCreatedToken(_tokenHolder, tokenToSupply);

                // refund the remaining ether to the user
                // TODO possibly there is some transaction cost for the refund
                msg.sender.call.value(msg.value - fundToAccept)();

                evLockFund();
                isFundLocked = true;

            } else {

                extraBalance.call.value(msg.value - token)();
                balances[_tokenHolder] += token;
                totalSupply += token;
                weiGiven[_tokenHolder] += msg.value;
                evCreatedToken(_tokenHolder, token);
                if (totalSupply >= minTokensToCreate && !isMinTokenReached) {
                    isMinTokenReached = true;
                    evFuelingToDate(totalSupply);
                }
            }

            if(!isFundLocked){
                if(closingTime > now){
                    if(!isDayThirtyChecked){
                        if(totalSupply >= minTokensToCreate){
                            isFundLocked = true;
                            evLockFund();
                        }
                        isDayThirtyChecked = true;
                    }
                }else if(closingTime + 30 days > now){
                    if(!isDaySixtyChecked){
                        if(totalSupply >= minTokensToCreate){
                            isFundLocked = true;
                            evLockFund();
                        }
                        isDaySixtyChecked = true;
                    }
                }
            }

            return true;
        }
        throw;
    }


    function mgmtKickoff(
        uint256 _fiscal
    ) noEther onlyOwner returns (bool success) {
        evMgmtKickoff(_fiscal, true);
        return true;
    }

    function refund() noEther {
        // define the refund condition: only when the fund minTokensToCreate is not reached
        if (isFundLocked) {
            throw;
        }

        // TODO possibly there is some transaction cost for the refund

        // Get extraBalance - will only succeed when called for the first time
        // TODO: Do we need this here, or can we have a separate function?  What if this succeeds but the
        // refund to the sender fails and we throw later on?  Or, what if this fails, can the sender ever
        // get a refund?
        if (extraBalance.balance >= extraBalance.accumulatedInput())
            extraBalance.payOut(address(this), extraBalance.accumulatedInput());

        // Always change state before calling the sender, throw if the call fails
        var tmpWeiGiven = weiGiven[msg.sender];
        totalSupply -= balances[msg.sender];
        balances[msg.sender] = 0;
        weiGiven[msg.sender] = 0;

        if (msg.sender.call.value(tmpWeiGiven)()) {
            evRefund(msg.sender, tmpWeiGiven, true);
        }
        else {
            evRefund(msg.sender, tmpWeiGiven, false);
            throw;
        }
    }

    function mgmtDistribute() noEther onlyOwner returns (bool){

        if(!isHarvestEnabled){
            throw;
        }
        if(isDistributionReady){
            throw;
        }
        // transfer all balance from the following accounts
        // (1) HongCoin main account,
        // (2) ManagementFeePoolWallet,
        // (3) HongCoinRewardAccount
        // to ReturnAccount

        // reserve 20% of the fund to Management Body
        // TODO

        // remaining fund: token holder can claim starting from this point
        // TODO
        isDistributionReady = true;

        // TODO set this the total amount harvested
        evMgmtDistributed(100, true); // total fund,
        return true;
    }

    function reserveToWallet(address _reservedWallet) onlyOwner returns (bool success) {
        // Send 8% for 4 years of Management fee to _reservedWallet

        // TODO move this away: the progress should be automatically triggered inside mgmtKickoff(x)
        return true;
    }
    function mgmtIssueManagementFee(address _managementWallet, uint _amount) onlyOwner returns (bool success) {
        // Send 2% of Management fee from _reservedWallet
        // TODO
        evMgmtIssueManagementFee(1, true);
        return true;
    }

    function divisor() constant returns (uint divisor) {

        // Quantity divisor model: based on total quantity of coins issued
        // Temp: Price ranged from 1.0 to 1.04 Ether for 500 M HongCoin Tokens

        // The number of (base unit) tokens per wei is calculated
        // as `msg.value` * 100 / `divisor`

        if(totalSupply < 100000000000000000000000000){ // 1eth(1000000000000000000) * 100M (100000000)
            return 100;
        } else if (totalSupply < 200000000000000000000000000){
            return 101;
        } else if (totalSupply < 300000000000000000000000000){
            return 102;
        } else if (totalSupply < 400000000000000000000000000){
            return 103;
        } else {
            return 104;
        }
    }
}





contract HongCoinInterface {

    // we do not have grace period. Once the goal is reached, the fund is secured

    address public curator;

    // 3 most important votings in blockchain
    mapping (address => bool) public votedKickoff;
    mapping (address => bool) public votedFreeze;
    mapping (address => bool) public votedHarvest;

    uint256 public supportKickoffQuorum;
    uint256 public supportFreezeQuorum;
    uint256 public supportHarvestQuorum;

    mapping (address => uint) public rewardToken;
    uint public totalRewardToken;

    // TODO Check the following ManagedAccount and mapping
    ManagedAccount public rewardAccount;
    ManagedAccount public HongCoinRewardAccount;

    mapping (address => uint) public HongCoinPaidOut;
    mapping (address => uint) public paidOut;

    HongCoin_Creator public hongcoinCreator;


    // Used to restrict access to certain functions to only HongCoin Token Holders
    modifier onlyTokenholders {}

    function () returns (bool success);

    function kickoff() returns(bool _result);
    function freeze() returns(bool _result);
    function unFreeze() returns(bool _result);
    function harvest() returns(bool _result);

    function collectReturn() returns(bool _success);

    // TODO The following 5 functions may (not) be used for HongCoin's final implementation.
    function retrieveHongCoinReward(bool _toMembers) external returns (bool _success);
    function getMyReward() returns(bool _success);
    function withdrawRewardFor(address _account) internal returns (bool _success);
    function transferWithoutReward(address _to, uint256 _amount) returns (bool success);
    function transferFromWithoutReward(
        address _from,
        address _to,
        uint256 _amount
    ) returns (bool success);

    event evVotedKickoff(bool _vote);
    event evVotedFreeze(bool _vote);
    event evVotedHarvest(bool _vote);
}



// The HongCoin contract itself
contract HongCoin is HongCoinInterface, Token, TokenCreation {

    // Modifier that allows only shareholders to trigger
    modifier onlyTokenholders {
        if (balanceOf(msg.sender) == 0) throw;
            _
    }

    function HongCoin(
        address _curator,
        HongCoin_Creator _hongcoinCreator,
        uint _minTokensToCreate,
        uint _maxTokensToCreate,
        // A variable to be set 30 days after contract execution.
        // There is an extra 30-day period after this date for second round, if it failed to reach for the first deadline.
        uint _closingTime
    ) TokenCreation(_minTokensToCreate, _maxTokensToCreate, _closingTime) {

        curator = _curator;
        hongcoinCreator = _hongcoinCreator;
        rewardAccount = new ManagedAccount(address(this), false);
        HongCoinRewardAccount = new ManagedAccount(address(this), false);
        if (address(rewardAccount) == 0)
            throw;
        if (address(HongCoinRewardAccount) == 0)
            throw;

    }

    function () returns (bool success) {

        // We do not accept donation here. Any extra amount sent to us will be refunded
        return createTokenProxy(msg.sender);
    }


    /*
     * Voting for some critial steps, on blockchain
     */
    function kickoff() onlyTokenholders noEther returns (bool _vote) {
        // prevent duplicate voting from the same token holder
        if(votedKickoff[msg.sender]){
            throw;
        }

        votedKickoff[msg.sender] = true;
        evVotedKickoff(true);

        supportKickoffQuorum += balances[msg.sender];
        if(supportKickoffQuorum * 4 > totalSupply){
            isKickoffEnabled = true;
        }
        return true;
    }

    function freeze() onlyTokenholders noEther returns (bool _vote){
        // prevent duplicate voting from the same token holder
        if(votedFreeze[msg.sender]){
            throw;
        }

        votedFreeze[msg.sender] = true;
        evVotedFreeze(true);

        supportFreezeQuorum += balances[msg.sender];
        if(supportFreezeQuorum * 2 > totalSupply){
            isFreezeEnabled = true;

            // TODO freeze immediately
            // transfer all available fund to ReturnAccount

            isDistributionReady = true;
        }
        return true;
    }

    function unFreeze() onlyTokenholders noEther returns (bool _vote){
        // prevent duplicate voting from the same token holder
        if(!votedFreeze[msg.sender]){
            throw;
        }

        votedFreeze[msg.sender] = false;
        evVotedFreeze(false);

        supportFreezeQuorum -= balances[msg.sender];
        if(supportFreezeQuorum * 2 < totalSupply){
            isFreezeEnabled = false;
        }
        return false;
    }

    function harvest() onlyTokenholders noEther returns (bool _vote){
        // Only call harvest() 3 Years after ICO ends
        if(closingTime + 1095 days < now){
            throw;
        }

        // prevent duplicate voting from the same token holder
        if(votedHarvest[msg.sender]){
            throw;
        }

        votedHarvest[msg.sender] = true;
        evVotedHarvest(true);

        supportHarvestQuorum += balances[msg.sender];
        if(supportHarvestQuorum * 2 > totalSupply){
            isHarvestEnabled = true;
        }
        return true;
    }

    function collectReturn() onlyTokenholders noEther returns (bool _success){

        if(isDistributionReady){
            // transfer all tokens in ReturnAccount back to Token Holder's account
            // TODO

            return true;
        }else{
            throw;
        }

    }

    function mgmtInvestProject(
        address _projectWallet,
        uint _amount
    ) noEther onlyOwner returns (bool _success) {

        if(!isKickoffEnabled || isFreezeEnabled || isHarvestEnabled){
            evMgmtInvestProject(_projectWallet, _amount, false);
            throw;
        }

        _success = false;

        if (actualBalance() >= _amount){
            // only create reward tokens when ether is not sent to the HongCoin itself and
            // related addresses. Proxy addresses should be forbidden by the curator.
            if (_projectWallet != address(this) && _projectWallet != address(rewardAccount)
                && _projectWallet != address(HongCoinRewardAccount)
                && _projectWallet != address(extraBalance)
                && _projectWallet != address(curator)) {

                rewardToken[address(this)] += _amount;
                totalRewardToken += _amount;

                _success = true;
            }
        }

        // Initiate event
        evMgmtInvestProject(_projectWallet, _amount, _success);
    }





    function retrieveHongCoinReward(bool _toMembers) external noEther returns (bool _success) {
        HongCoin hongcoin = HongCoin(msg.sender);

        if ((rewardToken[msg.sender] * HongCoinRewardAccount.accumulatedInput()) /
            totalRewardToken < HongCoinPaidOut[msg.sender])
            throw;

        uint reward =
            (rewardToken[msg.sender] * HongCoinRewardAccount.accumulatedInput()) /
            totalRewardToken - HongCoinPaidOut[msg.sender];
        if(_toMembers) {
            if (!HongCoinRewardAccount.payOut(hongcoin.rewardAccount(), reward))
                throw;
            }
        else {
            if (!HongCoinRewardAccount.payOut(hongcoin, reward))
                throw;
        }
        HongCoinPaidOut[msg.sender] += reward;
        return true;
    }

    function getMyReward() noEther returns (bool _success) {
        return withdrawRewardFor(msg.sender);
    }


    function withdrawRewardFor(address _account) noEther internal returns (bool _success) {
        if ((balanceOf(_account) * rewardAccount.accumulatedInput()) / totalSupply < paidOut[_account])
            throw;

        uint reward =
            (balanceOf(_account) * rewardAccount.accumulatedInput()) / totalSupply - paidOut[_account];
        if (!rewardAccount.payOut(_account, reward))
            throw;
        paidOut[_account] += reward;
        return true;
    }


    function transfer(address _to, uint256 _value) returns (bool success) {
        if (isFundLocked
            && transferPaidOut(msg.sender, _to, _value)
            && super.transfer(_to, _value)) {

            return true;
        } else {
            throw;
        }
    }


    function transferWithoutReward(address _to, uint256 _value) returns (bool success) {
        if (!getMyReward())
            throw;
        return transfer(_to, _value);
    }


    function transferFrom(address _from, address _to, uint256 _value) returns (bool success) {
        if (isFundLocked
            && transferPaidOut(_from, _to, _value)
            && super.transferFrom(_from, _to, _value)) {

            return true;
        } else {
            throw;
        }
    }


    function transferFromWithoutReward(
        address _from,
        address _to,
        uint256 _value
    ) returns (bool success) {

        if (!withdrawRewardFor(_from))
            throw;
        return transferFrom(_from, _to, _value);
    }


    function transferPaidOut(
        address _from,
        address _to,
        uint256 _value
    ) internal returns (bool success) {

        uint transferPaidOut = paidOut[_from] * _value / balanceOf(_from);
        if (transferPaidOut > paidOut[_from])
            throw;
        paidOut[_from] -= transferPaidOut;
        paidOut[_to] += transferPaidOut;
        return true;
    }

    function actualBalance() constant returns (uint _actualBalance) {
        return this.balance;
    }
}

contract HongCoin_Creator {
    function createHongCoin(
        address _curator,
        uint _minTokensToCreate,
        uint _maxTokensToCreate,
        uint _closingTime
    ) returns (HongCoin _newHongCoin) {

        return new HongCoin(
            _curator,
            HongCoin_Creator(this),
            _minTokensToCreate,
            _maxTokensToCreate,
            _closingTime
        );
    }
}
