#!/usr/bin/env bash
#
# Creates a full-featured setup for a multinode Solana testnet
#

here=$(dirname "$0")
# shellcheck source=multinode-demo/common.sh
source "$here"/common.sh

# Create a keypair for the faucet
#
# The faucet is a Solana account that is funded with a large amount of SOL at
# genesis. It is then used to fund other accounts on the testnet.
#
# The faucet keypair is created in the config directory so that it can be easily
# accessed by the faucet service.
#
if [[ ! -f "$SOLANA_CONFIG_DIR"/faucet.json ]]; then
  "$solana_keygen" new --no-passphrase -o "$SOLANA_CONFIG_DIR"/faucet.json
fi

# Create the genesis ledger
#
# The genesis ledger is the first block in the blockchain. It contains a number
# of configuration settings, as well as the initial set of accounts and their
# balances.
#
# The genesis ledger is created using the solana-genesis command. The command
# takes a number of arguments, including the location of the faucet keypair,
# the initial amount of SOL to fund the faucet with, and the location of the
# ledger directory.
#
args=(
  --faucet-pubkey "$SOLANA_CONFIG_DIR"/faucet.json
  --faucet-lamports 500000000000000000
  --ledger "$SOLANA_CONFIG_DIR"/ledger
  --bootstrap-validator-lamports 500000000000000000
  --bootstrap-validator-stake-lamports 100000000000000000
)

"$solana_genesis" "${args[@]}" 