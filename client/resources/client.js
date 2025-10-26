const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const channelName = ('mainchannel');
const chaincodeName = ('sollytch-chain');
const mspId = ('org1MSP');

let network, contract, client, gateway

// Path to crypto materials.
const cryptoPath = path.resolve(
    __dirname,
    '..',
    '..',
    'fabric',
    'organizations',
    'peerOrganizations',
    'org1.example.com'
);
console.log(cryptoPath)

const keyDirectoryPath = path.resolve(
    cryptoPath,
    'users',
    'Admin@org1.example.com',
    'msp',
    'keystore'
);

const certDirectoryPath = path.resolve(
    cryptoPath,
    'users',
    'Admin@org1.example.com',
    'msp',
    'signcerts'
);

const tlsCertPath = path.resolve(
    cryptoPath,
    'peers',
    'peer0.org1.example.com',
    'tls',
    'ca.crt'
);

// Gateway peer endpoint.
const peerEndpoint = ('localhost:7051');

// Gateway peer SSL host name override.
const peerHostAlias = ('peer0.org1.example.com');

const utf8Decoder = new TextDecoder();

async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function getFirstDirFileName(dirPath) {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

async function invoke(jsonString, testID) {
  await contract.submitTransaction("StoreTest", testID, jsonString)
  console.log(`Teste ${testID} armazenado com sucesso no ledger.`);
}

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

async function query(fcn, testID) {
    let result
    if (fcn=='GetAllTests'){
        result = await contract.evaluateTransaction('GetAllTests')
    } else if (fcn=='QueryTest'){
        result = await contract.evaluateTransaction('QueryTest', testID)
    }
    let resultString = result.toString('utf8');

    if (/^\d+(,\d+)*$/.test(resultString.trim())) {
        const byteArray = resultString.trim().split(',').map(n => parseInt(n));
        resultString = Buffer.from(byteArray).toString('utf8');
    }

    const resultJSON = JSON.parse(resultString)
    return resultJSON
}

async function disconnect(){
    gateway.close();
    client.close();
}

module.exports = { initialize, disconnect, query, invoke}