const register = require("./resources/register.js");
const signDigest = require("./resources/sign.js")
const normalizeS = require("./resources/normalization.js")

const {
    initialize,
    close,
    createProposal,
    createTransaction,
    createCommit,
    finalize
} = require('./resources/invoke.js');

const fs = require('fs');
const { KEYUTIL, KJUR } = require('jsrsasign');
const { storePlanilha } = require("./resources/standalone_client.js");

function generateCsr(username) {
    const privateKeyPem = fs.readFileSync('chave_privada.pem', 'utf8');

    const keyObj = KEYUTIL.getKey(privateKeyPem);

    const csr = new KJUR.asn1.csr.CertificationRequest({
        subject: {
            str: `/CN=${username}/O=org1MSP`
        },
        sbjpubkey: keyObj,
        sigalg: 'SHA256withECDSA',
        sbjprvkey: keyObj
    });

    const csrPem = csr.getPEM();

    console.log('CSR gerado com sucesso!');
    return csrPem;
}
const user = "teste";
const novo = false;

if (novo === true){
    const csr = generateCsr(user);
    register(user, csr);
}

// função completa pra fazer a execução (tendo a chave privada) buscar meio de otimizar esse processo
(async () => {
    const privateKeyPem = fs.readFileSync('chave_privada.pem', 'utf8');
    await initialize(user, "sollytch-chain")
    
    const proposal = await createProposal("StorePlanilha", "te", "to")
    const proposalSig = await signDigest(
        proposal,
        privateKeyPem
    )
    const proposalNorm = normalizeS(proposalSig)

    const transaction = await createTransaction(proposalNorm)
    const transactionSig = await signDigest(
        transaction,
        privateKeyPem
    )
    const transactionNorm = await normalizeS(transactionSig)

    const commit = await createCommit(transactionNorm)
    const commitSig = await signDigest(
        commit, 
        privateKeyPem
    )
    const commitNorm = await normalizeS(commitSig)

    await finalize(commitNorm)
    close()
})();
