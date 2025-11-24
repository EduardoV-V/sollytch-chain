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

const controleInternoEncoder = {
    'ok': 2,
    'fail': 1,
    'invalid': 0
};

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
    
    console.log(`🔧 Features selecionadas: ${allFeatures.length}`);
    
    // 2. CODIFICAR VARIÁVEIS CATEGÓRICAS (igual ao LabelEncoder do Python)
    const processedData = {...testData};
    
    // Converter booleanos para inteiros
    if (typeof processedData.control_line_ok === 'boolean') {
        processedData.control_line_ok = processedData.control_line_ok ? 1 : 0;
        console.log(`Booleano convertido: control_line_ok → ${processedData.control_line_ok}`);
    }
    
    // Codificar controle_interno_result
    if (processedData.controle_interno_result in controleInternoEncoder) {
        processedData.controle_interno_result = controleInternoEncoder[processedData.controle_interno_result];
        console.log(`Codificada 'controle_interno_result': ${testData.controle_interno_result} → ${processedData.controle_interno_result}`);
    } else {
        processedData.controle_interno_result = 0; // valor padrão
        console.log(`Valor desconhecido 'controle_interno_result': ${testData.controle_interno_result} → 0`);
    }
    
    // 3. TRATAR VALORES NULOS (igual ao Python fillna(0))
    allFeatures.forEach(feature => {
        if (processedData[feature] === null || processedData[feature] === undefined) {
            processedData[feature] = 0;
            console.log(`Preenchido valor nulo: ${feature} → 0`);
        }
    });
    
    // 4. TRATAR image_blur_score (null para 0)
    if (processedData.image_blur_score === null || processedData.image_blur_score === undefined) {
        processedData.image_blur_score = 0.0;
    }
    
    // 5. CRIAR STRING CSV NO FORMATO ESPERADO
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

async function invoke(contract) {
    const jsonFilePath = require('path').join(__dirname, 'test.json');
    const testData = JSON.parse(fsRead.readFileSync(jsonFilePath, 'utf8'));
    const testID = testData.test_id;
    console.log(testID)
    
    // Pré-processar os dados
    const predictStr = preprocessForPrediction(testData);
    
    // String JSON original
    const jsonStr = JSON.stringify(testData);

    try {
        await contract.submitTransaction("StoreTest", testID, jsonStr, predictStr);
        console.log("Teste armazenado com sucesso");
    } catch (error) {
        console.error("Erro:", error);
    }
}

async function query(contract, testID) {
    try {
        console.log(`consultando teste com ID: ${testID}`);
        
        const resultBytes = await contract.evaluateTransaction("QueryTest", testID);
        let resultString = resultBytes.toString('utf8');

        // Caso o retorno venha como "123,34,..." (lista de bytes)
        if (/^\d+(,\d+)*$/.test(resultString.trim())) {
            // Converte string de números em array de bytes
            const byteArray = resultString.trim().split(',').map(n => parseInt(n));
            resultString = Buffer.from(byteArray).toString('utf8');
        }

        const result = JSON.parse(resultString);
        console.log(JSON.stringify(result, null, 2));

        return result;
    } catch (error) {
        console.error("erro ao consultar teste", error);
    }
}

// Adicione esta função para debug no seu código
async function debugIdentity() {
    const identity = await newIdentity();
    console.log('MSP ID:', identity.mspId);
    console.log('Certificado:', identity.credentials.toString());
    
    const certPath = await getFirstDirFileName(certDirectoryPath);
    console.log('Caminho do certificado:', certPath);
    
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    console.log('Caminho da chave privada:', keyPath);
    
    // Verifique se os arquivos existem
    try {
        const certStats = await fs.stat(certPath);
        const keyStats = await fs.stat(keyPath);
        console.log('Certificado existe:', certStats.isFile());
        console.log('Chave existe:', keyStats.isFile());
    } catch (error) {
        console.error('Erro ao verificar arquivos:', error);
    }
}

function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

function displayInputParameters() {
    console.log(`channelName:       ${channelName}`);
    console.log(`chaincodeName:     ${chaincodeName}`);
    console.log(`mspId:             ${mspId}`);
    console.log(`cryptoPath:        ${cryptoPath}`);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
    console.log(`certDirectoryPath: ${certDirectoryPath}`);
    console.log(`tlsCertPath:       ${tlsCertPath}`);
    console.log(`peerEndpoint:      ${peerEndpoint}`);
    console.log(`peerHostAlias:     ${peerHostAlias}`);
}

async function main() {
    displayInputParameters();
    debugIdentity();

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();
    
    const gateway = connect({
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

     try {
        const network = gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        const action = (await askQuestion('input: ')).trim().toLowerCase();

        if (action === 'invoke') {
            await invoke(contract);
        } else if (action === 'query') {
            const testID = (await askQuestion('testID: ')).trim();
            await query(contract, testID);
        } else {
            console.log('invalido');
        }

    } finally {
        gateway.close();
        client.close();
    }
}