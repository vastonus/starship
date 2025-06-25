export function getAddressType(chainName: string): string {
  if (chainName === 'evmos') {
    return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/ethermint.crypto.v1.ethsecp256k1.PubKey' } }";
  } else if (chainName === 'injective') {
    return "address_type = { derivation = 'ethermint', proto_type = { pk_type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey' } }";
  } else {
    return "address_type = { derivation = 'cosmos' }";
  }
}

export function getGasPrice(chainName: string, denom?: string): string {
  if (chainName === 'evmos' || chainName === 'injective') {
    return `gas_price = { price = 2500000, denom = "${denom}" }`;
  } else {
    return `gas_price = { price = 1.25, denom = "${denom}" }`;
  }
}

export function needsService(relayerType: string): boolean {
  return relayerType === 'hermes' || relayerType === 'neutron-query-relayer';
}
