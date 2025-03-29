## Add new chain to Starship

This guide covers the process for adding a new chain to Starship.

### Step 1: Create docker image
Before we can get started with adding the chain, we need to create a docker image for the chain.
The docker image should contain the chain binary and some starship specific dependecies.

Dependencies required by starship (apart from chain binary):
- `curl`
- `make`
- `bash`
- `jq`
- `sed`

#### Starship docker system
We can either use the starship docker system to add the image.
Add a section to `starship/docker/chains/versions.yaml`.
In chains add a section:
```yaml
- name: new-chain
  base: <base docker image>  # Used as base image from which chain binary are installed from `/bin` and `/lib` dir
  tags:
    - <tag>
```

By default we use the dockerfile in `starship/docker/chains/Dockerfile` to build the image.

If one wants to use a custom dockerfile, they can add a section to `starship/docker/chains/version.yaml`:
```yaml
- name: new-chain
  base: <base docker image>  # Used as base image from which chain binary are installed from `/bin` and `/lib` dir
  file: <path to custom dockerfile>
  tags:
    - <tag>
```

Then you can have your custom dockerfile in the path specified in `file`, which will be used to build the image.

Note we run the script: [`starship/docker/chains/build-docker-chains.sh`](https://github.com/hyperweb-io/starship/blob/main/starship/docker/chains/build-docker-chains.sh) to build the docker image.

Once this is done, please create a PR to the starship repo.
Once the PR is merged, our workflows will create and push the docker image to starship [ghcr registry](https://github.com/orgs/hyperweb-io/packages?repo_name=starship) of starship.  

#### Maintain own docker image
Optionally if you dont want to use the starship docker system, you can build the docker image and push it to a docker registry.
We just need the ability to access and download the docker image.
Make sure that the docker images are 

### Step 2: Add chain to helm chart
For a cosmos based chain:

#### Add chain to default values
Add the chain to the `starship/charts/defaults.yaml` file, in `defaultChains`. 
New chain add would look something like for the bellow example, i will use the gaia chain as an example:
```yaml
defaultChains:
  ## add new chain to section
  ## ...
  cosmoshub:
  image: ghcr.io/cosmology-tech/starship/gaia:v18.0.0
  home: /root/.gaia
  binary: gaiad
  prefix: cosmos
  denom: uatom
  prettyName: Cosmos Hub
  coins: 100000000000000uatom
  hdPath: m/44'/118'/0'/0/0
  coinType: 118
  repo: https://github.com/cosmos/gaia
  assets:
    - base: uatom
      description: "The native staking and governance token of the Cosmos Hub."
      name: Cosmos Hub Atom
      display: atom
      symbol: ATOM
      logo_URIs:
        png: "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png"
        svg: "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.svg"
      denom_units:
        - denom: uatom
          exponent: 0
        - denom: atom
          exponent: 6
      coingecko_id: atom
```

If your chain require a different set of default scripts that we use: you can definetly set them here as well.
By default we have:
```yaml

defaultScripts:
  createGenesis:
    file: scripts/default/create-genesis.sh
  updateGenesis:
    file: scripts/default/update-genesis.sh
  updateConfig:
    file: scripts/default/update-config.sh
  createValidator:
    file: scripts/default/create-validator.sh
  transferTokens:
    file: scripts/default/transfer-tokens.sh
  buildChain:
    file: scripts/default/build-chain.sh
  ibcConnection:
    file: scripts/default/ibc-connection.sh
  createICS:
    file: scripts/default/create-ics.sh
```

If you need to set a custom script for any of the above scripts, you can add them to:
`starship/charts/scripts/<chain-name>/<script-name>.sh`. Note currently we only support the type of scripts
mentioned above.
You can then set them up in the chain config.
For example the noble file with custom scripts:
```yaml
  noble:
    image: ghcr.io/cosmology-tech/starship/noble:v7.0.0
    home: /root/.noble
    binary: nobled
    prefix: noble
    denom: uusdc
    prettyName: Noble
    coins: 100000000000000uusdc,100000000000000ustake
    hdPath: m/44'/118'/0'/0/0
    coinType: 118
    repo: https://github.com/noble-assets/noble
    scripts:
      createGenesis:
        file: scripts/noble/create-genesis.sh
      updateGenesis:
        file: scripts/noble/update-genesis.sh
```

Finally update chains value `starship/charts/devnet/values.schema.json`:
Add the chain name to `properties.chains.items.properties.name.enum` array.

### Step 4: Create a test case
Tests in Starship exists in `starship/tests/e2e` directory. 
Create a new config file with your new chain:
`starship/tests/e2e/configs/<chain-name>.yaml`. Have a look at other chains

Then you can run the test locally with:
```bash
cd starship/tests/e2e/

make install HELM_FILE=configs/chain-name.yaml

## wait for pods to start, with:
kubectl get pods
kubectl logs <pod-name> -f  ## to see logs

make port-forward HELM_FILE=configs/chain-name.yaml

## Run e2e tests with
make test HELM_FILE=configs/chain-name.yaml
```

If the spinning up of the pods work, that is already the first step to success.
Tests will check the other parts of the system.

Follow the readme in: starship/tests/e2e/README.md for more information on how to run tests.

### Step 5: Create a PR
Once you have completed the above steps, create a PR to the starship repo.
Your choice if you want to do it all in one, or want to open 2 PRs, one for the docker image and one for the helm chart.

## Example PRs that added some chains

* Noble Chain addition
  * Docker integration: https://github.com/hyperweb-io/starship/pull/574
  * Helm Chart updates: https://github.com/hyperweb-io/starship/pull/576
  * Test cases: https://github.com/hyperweb-io/starship/pull/581
* Kujira Chain addition
  * PR: https://github.com/hyperweb-io/starship/pull/508/files
* Agoric Chain: Updating helm chart and tests, add PR tests as well
  * https://github.com/hyperweb-io/starship/pull/423/files
* XPLA Chain: With custom script
  * https://github.com/hyperweb-io/starship/pull/643/files
