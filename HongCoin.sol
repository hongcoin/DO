/*

- Bytecode Verification performed was compared on second iteration -

This file is part of the DO.

The DO is free software: you can redistribute it and/or modify
it under the terms of the GNU lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

The DO is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU lesser General Public License for more details.

You should have received a copy of the GNU lesser General Public License
along with the DO.  If not, see <http://www.gnu.org/licenses/>.
*/



contract TokenInterface {
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    uint256 public totalSupply;

    function balanceOf(address _owner) constant returns (uint256 balance);
    function transfer(address _to, uint256 _amount) returns (bool success);

}

/*
 * Token Creation contract, similar to other organization,for issuing tokens and initialize
 * its ether fund.
*/


contract TokenCreationInterface {

    uint public closingTime;
    uint public minTokensToCreate;
    bool public isFueled;
    address public privateCreation;
    ManagedAccount public extraBalance;
    mapping (address => uint256) weiGiven;

    function createTokenProxy(address _tokenHolder) returns (bool success);
    function refund();
    function divisor() constant returns (uint divisor);

    event FuelingToDate(uint value);
    event CreatedToken(address indexed to, uint amount);
    event Refund(address indexed to, uint value);
}

contract GovernanceInterface {
    // define the governance of this organization and critical functions
    function kickoff(uint _fiscal) returns (bool);
    function harvest() returns (bool);
    function freezeFund() returns (bool);
    function issueManagementFee() returns (bool);
    function investProject() returns (bool);
}


contract ManagedAccountInterface {
    address public owner;
    bool public payOwnerOnly;
    uint public accumulatedInput;

    function payOut(address _recipient, uint _amount) returns (bool);

    event PayOut(address indexed _recipient, uint _amount);
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
            PayOut(_recipient, _amount);
            return true;
        } else {
            return false;
        }
    }
}
