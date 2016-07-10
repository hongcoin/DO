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
    // define the coin itself
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    // we suppose to be fully transparent for HongCoin's issuing
    uint256 public totalSupply;

    /// @param _owner The address from which the balance will be retrieved
    /// @return The balance
    function balanceOf(address _owner) constant returns (uint256 balance);

    /// @notice Send `_amount` tokens to `_to` from `msg.sender`
    /// @param _to The address of the recipient
    /// @param _amount The amount of tokens to be transferred
    /// @return Whether the transfer was successful or not
    function transfer(address _to, uint256 _amount) returns (bool success);

}

contract DOInterface {
    // define the governance of this organization and critical functions
    function commmence() returns (bool);
    function harvest() returns (bool);
    function freezeFund() returns (bool);
    function annualManagementFee() returns (bool);
    function investProject() returns (bool);
}
