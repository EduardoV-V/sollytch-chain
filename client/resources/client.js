/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const grpc = require('@grpc/grpc-js');
const readline = require('readline');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('node:crypto');
const fsRead = require('fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const channelName = 'mainchannel';
const chaincodeName = 'sollytch-chain';
const mspId = 'org1MSP';

const cryptoPath = path.resolve(__dirname, '..','fabric','organizations','peerOrganizations','org1.example.com');

const keyDirectoryPath = path.resolve(
    cryptoPath,
    'users',
    'User1@org1.example.com',
    'msp',
    'keystore'
);

const certDirectoryPath = path.resolve(
    cryptoPath,
    'users',
    'User1@org1.example.com',
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

const peerEndpoint = 'localhost:7051';
const peerHostAlias = 'peer0.org1.example.com';

const utf8Decoder = new TextDecoder();

const controleInternoEncoder = {
    'ok': 2,
    'fail': 1,
    'invalid': 0
};
let sollytchImageContract, sollytchChainContract, network, client, gateway
        
function setNestedField(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            throw new Error(`campo inexistente: ${keys.slice(0, i + 1).join('.')}`);
        }
        current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
}


function preprocessForPrediction(testData) {
    console.log("Processando dados para predição...");
    
    // 1. IDENTIFICAR FEATURES (igual ao Python)
    const numericFeatures = [
        'expiry_days_left', 'distance_mm', 'time_to_migrate_s', 'sample_volume_uL',
        'sample_pH', 'sample_turbidity_NTU', 'sample_temp_C', 'ambient_T_C',
        'ambient_RH_pct', 'lighting_lux', 'tilt_deg', 'preincubation_time_s',
        'time_since_sampling_min', 'tempo_transporte_horas', 'estimated_concentration_ppb',
        'incerteza_estimativa_ppb'
    ];
    
    const categoricalFeatures = ['control_line_ok', 'controle_interno_result'];
    const allFeatures = [...numericFeatures, ...categoricalFeatures];
    
    const processedData = {...testData};
    
    if (typeof processedData.control_line_ok === 'boolean') {
        processedData.control_line_ok = processedData.control_line_ok ? 1 : 0;
        console.log(`Booleano convertido: control_line_ok → ${processedData.control_line_ok}`);
    }
    
    if (processedData.controle_interno_result in controleInternoEncoder) {
        processedData.controle_interno_result = controleInternoEncoder[processedData.controle_interno_result];
        console.log(`Codificada 'controle_interno_result': ${testData.controle_interno_result} → ${processedData.controle_interno_result}`);
    } else {
        processedData.controle_interno_result = 0; // valor padrão
        console.log(`Valor desconhecido 'controle_interno_result': ${testData.controle_interno_result} → 0`);
    }
    
    allFeatures.forEach(feature => {
        if (processedData[feature] === null || processedData[feature] === undefined) {
            processedData[feature] = 0;
            console.log(`Preenchido valor nulo: ${feature} → 0`);
        }
    });
    
    if (processedData.image_blur_score === null || processedData.image_blur_score === undefined) {
        processedData.image_blur_score = 0.0;
    }
    
    const csvData = [
        processedData.lat,
        processedData.lon,
        processedData.expiry_days_left,
        processedData.distance_mm,
        processedData.time_to_migrate_s,
        processedData.sample_volume_uL,
        processedData.sample_pH,
        processedData.sample_turbidity_NTU,
        processedData.sample_temp_C,
        processedData.ambient_T_C,
        processedData.ambient_RH_pct,
        processedData.lighting_lux,
        processedData.tilt_deg,
        processedData.preincubation_time_s,
        processedData.time_since_sampling_min,
        processedData.image_blur_score,
        processedData.tempo_transporte_horas,
        processedData.estimated_concentration_ppb,
        processedData.incerteza_estimativa_ppb,
        processedData.control_line_ok,
        processedData.controle_interno_result
    ].join(',');
    
    console.log("Dados pré-processados com sucesso");
    console.log(`CSV gerado: ${csvData}`);
    
    return csvData;
}

async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function getFirstDirFileName(dirPath) {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

async function storeTest(jsonStr) {
    let testData
    testData = JSON.parse(jsonFilePath);
    const testID = testData.test_id;
    console.log(testID)
    
    // Pré-processar os dados
    const predictStr = preprocessForPrediction(testData);

    try {
        await sollytchChainContract.submitTransaction("StoreTest", testID, jsonStr, predictStr);
        console.log("Teste armazenado com sucesso");
    } catch (error) {
        console.error("Erro:", error);
    }
}

function hashImage(path) {
  const fileBuffer = fsRead.readFileSync(path);
  const hash = crypto.createHash("sha512").update(fileBuffer).digest("hex");
  return hash;
}

async function getImage(imageID) {
    try {
        const rawResult = await sollytchImageContract.evaluateTransaction("GetImage", imageID);
        
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

async function storeImage(imagePath, imageID) {
    const imageHash = hashImage(imagePath);
    await sollytchImageContract.submitTransaction(
        "StoreImage",
        imageID,
        imageHash
    );

    console.log("Imagem armazenada com sucesso!");
}

async function updateTest(testID, jsonStr) {
    await sollytchChainContract.submitTransaction(
        'UpdateTest',
        testID,
        JSON.stringify(testData)
    );

    console.log('teste atualizado com sucesso');
}

async function queryTest(testID) {
    try {
        console.log(`consultando teste com ID: ${testID}`);
        const resultBytes = await sollytchChainContract.evaluateTransaction('QueryTest', testID);
        console.log(resultBytes)
        let resultString = resultBytes.toString('utf8');

        if (/^\d+(,\d+)*$/.test(resultString.trim())) {
            const byteArray = resultString.trim().split(',').map(n => parseInt(n));
            resultString = Buffer.from(byteArray).toString('utf8');
        }

        const result = JSON.parse(resultString);
        console.log(JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('erro ao consultar teste', error);
    }
}

async function storeModel(modelBase64, modelKey) {
    // const modelKey = (await askQuestion(
    //     'modelKey (acao_recomendada | result_class | qc_status): '
    // )).trim();

    // const filePath = (await askQuestion(
    //     'caminho do arquivo do modelo (.model): '
    // )).trim();

    // // Lê o arquivo como binário
    // const modelBuffer = await fs.readFile(filePath);

    // // Converte para base64
    // const modelBase64 = modelBuffer.toString('base64');

    await sollytchChainContract.submitTransaction(
        'StoreModel',
        modelKey,
        modelBase64
    );

    console.log(`modelo "${modelKey}" armazenado com sucesso no ledger`);
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
    sollytchChainContract = network.getContract('sollytch-chain');
    sollytchImageContract = network.getContract('sollytch-image');
    console.log('conexao finalizada')
}

async function main() {
    client = await newGrpcConnection();

    gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
    });
}

async function disconnect(){
    gateway.close();
    client.close();
}

main().catch((error) => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

module.exports={
    initialize,
    disconnect,
    storeTest,
    queryTest,
    storeImage,
    getImage,
    storeModel
}