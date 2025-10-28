# Protótipo Hyperledger Fabric - Sollytch

Este repositório é um protótipo baseado na distribuição de demonstração do hyperledger fabric cc-tools. Essa distribuição do fabric é a mesma usada pela RNP, com alguns scripts de configuração a menos, mas a funcionalidade é essencialmente a mesma. Este repositório contém o chaincode protótipo para armazenamento e busca dos dados dos testes de cassetes. Também possui uma API de busca inicial, sem uma definição pronta no momento. 

## Instalação de Dependências

Para instalar todas as dependências, basta executar o arquivo `./install.sh`, dentro da pasta scripts. Isso deve automaticamente instalar todos os pacotes necessários. Caso algum deles dê erro, as dependências estão listadas abaixo:

- Go versão 1.21 ou superior
- Docker versão 20.10.5 ou superior
- Docker Compose versão 1.28.5 ou superior
- Node.js versão v22.19.0 ou superior
- npm versão 11.6.2 ou superior

## Gerenciamento da rede

Para levantar a rede, é *ESSENCIAL* usar o script `./startDev.sh` na pasta raiz da rede com o parâmetro `-ccaas`. O comando é:

```bash
./startDev.sh -ccaas
```

Para derrubar, deve-se usar o script `./network.sh` com o parâmetro `down -noclr`. Isso vai manter os artefatos da rede ainda criados, o que evita processamento extra e mantém os certificados de usuários funcionais para levantamentos futuros.

Por fim, para instalar o chaincode de armazenamento dos testes, basta rodar o comando abaixo:

```bash
./network.sh deployCCAAS -ccn sollytch-chain -ccp ../sollytch-chain/
```

Irei implementar um script para automatizar esse processo de instalação do chaincode, mas por enquanto esse comando funciona perfeitamente.

## Execução do chaincode

Na pasta raiz da rede, tem uma pasta "client". Essa pasta contém todos os itens para executar o chaincode usando um cliente `Node.js`. Para instalar as dependências, acesse a pasta client e execute `npm i`. Após a instalação, o chaincode pode ser executado usando o arquivo `clientbkp.js`, ou usando a interface de testes.

### Execução por Terminal

O arquivo pode ser executado usando o comando `node clientbkp.js`. Isso resultará na espera de um input do usuário, onde as opções são "invoke" e "query". A opção invoke vai armazenar o teste no ledger da blockchain, teste esse que está no arquivo `test.json`. Esse arquivo é uma das linhas da planilha com os dados dos testes. Ainda não foi implementada nenhuma forma de enviar o arquivo da planilha e processar ele automaticamente, mas em breve será adicionado.

A opção query vai solicitar que o usuário digite o ID do teste que foi inserido no ledger. O ID do teste pode ser checado na primeira coluna da planilha, basta inserir o ID no terminal e isso imprimirá o teste associado com este ID. Um exemplo de ID a ser inserido é `TEST-00001`.

### Executando pela Interface de Teste

O servidor agora está containerizado em Docker. Para executar, acesse a pasta client e execute o comando:
```bash
docker-compose up -d
```

Isso levantará automaticamente a interface na porta 3000, acessível em localhost:3000 ou no IP da máquina host. O container ficará rodando continuamente em background, sem necessidade de manter o terminal aberto e pode ser derrubado com o comando `docker-compose down -v`

A interface mantém as mesmas funcionalidades de armazenamento e busca de testes, permitindo buscar todos os testes ou por ID específico, além de importar dados de planilhas xlsx, csv ou json. O arquivo sollytch.xlsx na pasta client serve como exemplo para o formato esperado.


## Código do Chaincode

O código principal do chaincode está dentro da pasta `/sollytch-chain` na raiz do projeto. O código `main.go` é o código principal do chaincode. Qualquer edição feita nele NÃO IRÁ SURTIR EFEITO IMEDIATO NA REDE. Caso alguma alteração seja feita no chaincode, será necessário fazer o upgrade do chaincode na rede. Isso pode ser feito com o comando abaixo:

```bash
./network.sh deployCCAAS -ccn sollytch-chain -ccs 2 -ccv 2.0 -ccp ../sollytch-chain/
```

OBS: caso o chaincode precise de upgrade novamente, basta alterar os valores de `-ccs` e `-ccv`.

## Hyperledger Explorer

O Hyperledger Explorer é uma ferramenta de gerenciamento da rede fabric. O explorer permite ver os seguintes itens da rede:

- Lista de canais
- Organizações (org1, org2 e org3)
- Peers
- Orderers
- Blocos e Transações 
- Detalhes das transações
- Chaincodes instalados

Além disso, ele possui alguns extras como gráficos, exibidos na página inicial.

Para levantar o explorer, basta entrar na pasta `/explorer` e executar o comando `docker-compose up -d`. Isso levantará o hyperledger explorer na porta 8080, mas isso pode ser editado no arquivo docker-compose.yaml, apenas trocando o número da porta caso a porta 8080 não esteja dispoível.

Para derrubar o hyperledger explorer, basta rodar o comando `docker-compose down -v`. Isso derrubará o container e liberará a porta usada pelo explorer.

## Fauxton

O Fauxton é a interface web nativa do CouchDB, que atua como banco de estado no Hyperledger Fabric. Ele fornece uma forma visual de interagir com os dados armazenados na blockchain. Ele permite visualizar diretamente os documentos JSON armazenados pelos chaincodes, executar consultas complexas e realizar debug do estado mundial (world state) da rede.

Para acessar o fauxton, basta abrir um dos links abaixo para a org qu deseja verificar:

```bash
    Org1: http://localhost:5984/_utils/

    Org2: http://localhost:7984/_utils/

    Org3: http://localhost:9984/_utils/
```

## Fim de sessão

Daqui para baixo é o readme.md original do repositório. Também contém algumas informações essenciais sobre a rede, porém não relacionada aos específicos da rede sollytch

---

# Hyperledger Labs CC Tools Demo Chaincode 

## Directory Structure

- `/fabric`: Fabric network v2.5 used as a test environment
- `/chaincode`: chaincode-related files
- `/ccapi`: chaincode REST API in Golang project
- `/fabric-private-chaincode`: Explaining the integration project between CC-tools and FPC

## Development

The `cc-tools` library has been tested in Fabric v2.2, v2.4 and v2.5 networks.

Dependencies for chaincode and chaincode API:

- Go 1.21 or higher

Dependencies for test environment:

- Docker 20.10.5 or higher
- Docker Compose 1.28.5 or higher

Intallation of the Chaincode API Go:

```bash
$ cd chaincode; go mod vendor; cd ..
$ cd ccapi; go mod vendor; cd ..
```


## Deploying test environment

After installing, use the script `./startDev.sh` in the root folder to start the development environment. It will
start all components of the project with 3 organizations.

If you want to deploy with 1 organization, run the command `./startDev.sh -n 1`.

To apply chaincode changes, run `$ ./upgradeCC.sh <version> <sequence>` with a version higher than the current one (starts with 0.1). Append `-n 1` to the command if running with 1 organization.

To apply CC API changes, run `$ ./scripts/reloadCCAPI.sh`.

## Deploying Chaincode as a service

After installing, use the script `./startDev.sh -ccaas` in the root folder to start the development environment. It will
start all components of the project with 3 organizations.

If you want to deploy with 1 organization, run the command `./startDev.sh -ccaas -n 1`.

To apply chaincode changes, run `$ ./upgradeCC.sh -ccaas <version> <sequence>` with a version higher than the current one (starts with 0.1). Append `-n 1` to the command if running with 1 organization.

To apply CC API changes, run `$ ./scripts/reloadCCAPI.sh`.

## Automated tryout and test

To test transactions after starting all components, run `$ ./scripts/tryout.sh`. 

To test transactions using the godog tool, run `$ ./scripts/godog.sh`.


## Generate TAR archive for the chaincode

The `generatePackage.sh` script is available to generate a `tar.gz` archive of the chaincode. 

By running `$ ./generatePackage.sh` without any option, the script generates a `collections.json` file for the private data on the chaincode with all the organizations defined on the readers section of private asset types, and then archives the code without the CCAPI.

By using the `--org/-o` option along the script, it's possible to specify the organizations to be considered when generating the `collections.json` file. This option may be used multiple times to add all the organizations, ex: `$ ./generatePackage.sh -o org1MSP -o org2MSP`.

By standard the archive is created using the project name with *1.0* label, to change it the `--name/-n` and `--label/-l` flags may be used. Example: `$ ./generatePackage.sh -n my-project -l 2.0`

## Integration with Fabric Private Chaincode

If you want to execute your chaincode in a Trusted Execution Environment (TEE) using Fabric Private Chaincode (FPC), we've set up an integration guide to help you. Check out the instructions in the `./fabric-private-chaincode` directory to seamlessly integrate FPC with CC Tools for enhanced privacy and security.

## More

You can reach GoLedger developers and `cc-tools` maintainers at our Discord - [Join us!](https://discord.gg/GndkYHxNyQ)

More documentation and details on `cc-tools` can be found at [https://goledger-cc-tools.readthedocs.io/en/latest/](https://goledger-cc-tools.readthedocs.io/en/latest/)
