#!/usr/bin/env bash

here=$(dirname "$0")
# shellcheck source=multinode-demo/common.sh
source "$here"/common.sh

exec "$solana_faucet" --keypair "$SOLANA_CONFIG_DIR"/faucet.json 