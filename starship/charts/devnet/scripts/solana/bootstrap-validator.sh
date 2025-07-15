#!/usr/bin/env bash

here=$(dirname "$0")
# shellcheck source=multinode-demo/common.sh
source "$here"/common.sh

if [[ -z $1 ]]; then
  $agave_validator_cuda "$@"
else
  $agave_validator "$@"
fi 