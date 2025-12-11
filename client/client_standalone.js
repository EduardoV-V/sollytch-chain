/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const grpc = require('@grpc/grpc-js');
const readline = require('readline');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('node:crypto');
const fs = require('fs') 
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { builtinModules } = require('node:module');

const channelName = ('mainchannel');
const chaincodeName = ('sollytch-image');
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
    const tlsRootCert = await fs.readFileSync(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFileSync(certPath);
    return { mspId, credentials };
}

async function getFirstDirFileName(dirPath) {
    const files = await fs.readdirSync(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFileSync(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

async function storeImageHash(imagePath, imageID) {
    await contract.submitTransaction(
        "StoreImage",
        imageID,
        imageHash
    );

    console.log("Imagem armazenada com sucesso!");
}

async function getImageHash(imageID) {
    try {
        const rawResult = await contract.evaluateTransaction("GetImage", imageID);
        
        let jsonString = "";
        for (const byte of rawResult) {
            jsonString += String.fromCharCode(byte);
        }
        
        console.log("JSON recebido:", jsonString.substring(0, 100) + "...");
        
        // Parse
        const result = JSON.parse(jsonString);
        return result.HashData;
        
    } catch (error) {
        console.error("Erro:", error);
        return null;
    }
}

async function initialize(){
    console.log('inicializando conexao')
    client = await newGrpcConnection();
    
    gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
        // Default timeouts for different gRPC calls
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });
    network = gateway.getNetwork(channelName);
    contract = network.getContract(chaincodeName);
    console.log('conexao finalizada')
}

async function endConnection(){
    gateway.close();
    client.close();
}

async function main() {
    client = await newGrpcConnection();
    
    gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
        // Default timeouts for different gRPC calls
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });
}

module.exports={
    getImageHash,
    storeImageHash,
    initialize,
    endConnection
}

async function run(){
    await initialize()
    await storeImageHash('hash', '2')
    const hash = await getImageHash('2')
    console.log(hash)
    await endConnection()
}

run()