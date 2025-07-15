#!/usr/bin/env bash

here=$(dirname "$0")
# shellcheck source=multinode-demo/common.sh
source "$here"/common.sh

# shellcheck source=net/common.sh
source "$(cd "$here"/..; pwd)"/net/common.sh

if [[ -z $1 ]]; then
  #
  # Start a validator that connects to a bootstrap validator
  #
  $agave_validator_cuda \
    --contact-info 127.0.0.1:8001 \
    "$@"
else
  $agave_validator \
    --contact-info 127.0.0.1:8001 \
    "$@"
fi 