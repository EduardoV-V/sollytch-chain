const grpc = require('@grpc/grpc-js'); // importa grpc para conexao com o peer
const { connect, hash, signers } = require('@hyperledger/fabric-gateway'); // importa metodos da fabric gateway
const crypto = require('node:crypto'); // usado para lidar com chaves privadas
const fs = require('node:fs/promises'); // leitura de arquivos usando promises
const path = require('node:path'); // manipula caminhos
const { TextDecoder } = require('node:util'); // decodifica texto em utf8

// configuracoes principais do canal e chaincode
const channelName = ('mainchannel');
const chaincodeName = ('sollytch-chain');
const mspId = ('org1MSP');

let network, contract, client, gateway // define as variáveis de conexão como globais para serem acessíveis por qualquer função

// caminhos para os certificados e chaves
const cryptoPath = path.resolve(__dirname,
    '..',
    '..',
    'fabric',
    'organizations',
    'peerOrganizations',
    'org1.example.com');

const keyDirectoryPath = path.resolve(cryptoPath,
    'users',
    'Admin@org1.example.com',
    'msp',
    'keystore');

const certDirectoryPath = path.resolve(cryptoPath,
    'users',
    'Admin@org1.example.com',
    'msp',
    'signcerts');

const tlsCertPath = path.resolve(cryptoPath,
    'peers',
    'peer0.org1.example.com',
    'tls',
    'ca.crt');

// endereco e alias (nome) do peer
const peerEndpoint = ('localhost:7051');
const peerHostAlias = ('peer0.org1.example.com');

const utf8Decoder = new TextDecoder();

// cria conexao grpc com o peer
async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

// cria identidade usando certificado do admin
async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

// pega o primeiro arquivo dentro de um diretorio
async function getFirstDirFileName(dirPath) {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) throw new Error(`No files in directory: ${dirPath}`);
    return path.join(dirPath, file);
}

// cria o signer usando a chave privada
// O signer é o que o fabric usa para assinar as transações feitas pelo usuário. Essa função usa a chave do usuário que está
// chamando o chaincode para criar esse signer e assinar a transação com ele
async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath); //busca a chave do user no diretório informado antes
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem); //cria um objeto de chave privada com o crypto
    return signers.newPrivateKeySigner(privateKey);
}

// executa uma transacao no ledger
// pra executar uma função do chaincode, é usada a função "submitTransaction" da API do hyperledger fabric. No caso desse cliente,
// a função a ser chamada está como hard coded, mas basta mudar o "StoreTest" para uma função ou outro nome
async function invoke(jsonString, testID) {
  await contract.submitTransaction("StoreTest", testID, jsonString) // Chama a função "StoreTest" com os parâmetros testID e jsonString
  // é importantissimo passar os parâmetros na mesma ordem do chaincode, caso contrário dará erro.
  console.log(`Teste ${testID} armazenado com sucesso no ledger.`); // log de confirmação
}

// inicializa a conexao e define o contrato
async function initialize() {
    client = await newGrpcConnection();
    
    gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
    });

    try {
        network = gateway.getNetwork(channelName);
        contract = network.getContract(chaincodeName);
    } catch (err) {
        console.error(err)
    }
}

// executa uma consulta no ledger
async function query(fcn, testID) {
    let result
    if (fcn=='GetAllTests'){
        result = await contract.evaluateTransaction('GetAllTests')
    } else if (fcn=='QueryTest'){
        result = await contract.evaluateTransaction('QueryTest', testID)
    }

    let resultString = result.toString('utf8');

    // converte valores numericos em texto, se necessario
    if (/^\d+(,\d+)*$/.test(resultString.trim())) {
        const byteArray = resultString.trim().split(',').map(n => parseInt(n));
        resultString = Buffer.from(byteArray).toString('utf8');
    }

    const resultJSON = JSON.parse(resultString)
    return resultJSON
}

// funcao para encerrar a conexao
async function disconnect(){
    gateway.close();
    client.close();
}

module.exports = { initialize, disconnect, query, invoke }
