'use strict';

const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { createUser } = require('./supabase.js');

const admin = 'admin';
const mspId = "org1MSP";
const caURL = "https://localhost:7054";
const caName = "ca-org1";

function generateECKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

function generateCSR(user, privateKeyPEM) {
  const tempDir = '/tmp';
  const keyPath = `${tempDir}/${user}_key.pem`;
  const csrPath = `${tempDir}/${user}.csr`;

  fs.writeFileSync(keyPath, privateKeyPEM);

  execSync(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "/CN=${user}/O=org1MSP/OU=client"`);

  const csr = fs.readFileSync(csrPath, 'utf8');

  fs.unlinkSync(keyPath);
  fs.unlinkSync(csrPath);

  return csr;
}

function validateCSR(csrPEM, user) {
  try {
    fs.writeFileSync('/tmp/csr.pem', csrPEM);

    execSync('openssl req -in /tmp/csr.pem -noout -verify');

    const subjectOutput = execSync('openssl req -in /tmp/csr.pem -noout -subject').toString();

    fs.unlinkSync('/tmp/csr.pem');

    let commonName = null;
    let organization = null;

    const cnMatch = subjectOutput.match(/CN\s*=\s*([^,\/\n]+)/);
    const oMatch = subjectOutput.match(/O\s*=\s*([^,\/\n]+)/);

    if (cnMatch) commonName = cnMatch[1].trim();
    if (oMatch) organization = oMatch[1].trim();

    if (commonName !== user) {
      console.error(`CN do CSR (${commonName}) nao corresponde ao username (${user})`);
      return false;
    }

    if (!organization) {
      console.error(`CSR invalido: campo O (Organization) e obrigatorio`);
      return false;
    }

    return true;

  } catch (error) {
    console.error(`Erro ao validar CSR: ${error.message}`);
    try { fs.unlinkSync('/tmp/csr.pem'); } catch {}
    return false;
  }
}

async function registerWithSupabase(user, password, privateKeyPEM = null) {
  let privateKey = privateKeyPEM;

  if (!privateKey) {
    const keys = generateECKeyPair();
    privateKey = keys.privateKey;
  }

  const csrPEM = generateCSR(user, privateKey);

  if (!validateCSR(csrPEM, user)) {
    throw new Error('CSR invalido');
  }

  const tlsCertPath = path.resolve(
    __dirname,
    "..",
    "..",
    "fabric",
    "organizations",
    "fabric-ca",
    "org1",
    "tls-cert.pem"
  );

  const caTLSCACerts = fs.readFileSync(tlsCertPath);

  const ca = new FabricCAServices(
    caURL,
    { trustedRoots: caTLSCACerts, verify: false },
    caName
  );

  const walletPath = path.join(process.cwd(), 'wallet');
  const { Wallets } = require('fabric-network');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  console.log(`Wallet path: ${walletPath}`);

  const adminIdentity = await wallet.get(admin);
  if (!adminIdentity) {
    throw new Error(`Admin identity nao encontrada. Execute enrollAdmin.js primeiro.`);
  }

  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, admin);

  let secret;

  try {
    secret = await ca.register({
      enrollmentID: user,
      role: 'client',
    }, adminUser);
  } catch (err) {
    if (err.message.includes('already registered')) {
      console.log(`Usuario ${user} ja registrado no CA`);
    } else {
      throw err;
    }
  }

  let enrollment;

  try {
    enrollment = await ca.enroll({
      enrollmentID: user,
      enrollmentSecret: secret,
      csr: csrPEM
    });
  } catch (err) {
    console.error(`Erro no enroll: ${err.message}`);

    if (secret) {
      try {
        await ca.revoke({
          enrollmentID: user,
          reason: 'remove'
        }, adminUser);
        console.log(`Registro revertido`);
      } catch {}
    }

    throw new Error('Falha ao enrollar usuario no CA');
  }

  if (!enrollment || !enrollment.certificate) {
    throw new Error('Enroll falhou: certificado nao gerado');
  }

  const certificate = enrollment.certificate;

  await createUser(user, password, certificate);

  console.log(`Successfully registered user "${user}" with Supabase`);

  return { certificate };
}

module.exports = { registerWithSupabase, generateECKeyPair, generateCSR };