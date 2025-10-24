/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const grpc = require('@grpc/grpc-js');
const readline = require('readline');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('node:crypto');
const fsRead = require('fs') 
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
    'fabric',
    'organizations',
    'peerOrganizations',
    'org1.example.com'
);

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

main().catch((error) => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

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

async function invoke(contract, jsonString) {
    // const jsonFilePath = path.join(__dirname, 'test.json')
    // Escrever parte do código que vai receber a string e processar para o resto

    const testData = JSON.parse(fsRead.readFileSync(jsonFilePath, 'utf8'));
    const testID = testData.test_id;
    const jsonStr = JSON.stringify(testData);
    await contract.submitTransaction("StoreTest", testID, jsonStr)
    console.log("teste armazenado com sucesso")
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

async function invoke(fcn, ...args) {
    await contract.submitTransaction(fcn, ...args)
    console.log("teste armazenado com sucesso")
}

async function query(fcn, testID) {
    let queryResult
    if (fcn=='QueryAll'){
        await contract.evaluateTransaction('QueryAll')
    } else if (fcn=='QueryTest'){
        await contract.evaluateTransaction('QueryTest', testID)
    }
    
    return queryResult
}

async function disconnect(){
    gateway.close();
    client.close();
}

module.exports = { initialize, disconnect}