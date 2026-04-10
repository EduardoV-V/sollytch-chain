// Importa bibliotecas do Hyperledger Fabric, Node.js e terceiros
const { Wallets } = require('fabric-network');
const crypto = require('crypto');
const path   = require('path');
const jwt    = require('jsonwebtoken');

// Mapa em memoria para armazenar nonces temporarios (uso unico, expira em 5 min)
const activeChallenges = new Map();

/**
 * Gera um novo desafio de autenticacao para o usuario.
 * Retorna um nonce aleatorio (hex) e o timestamp de expiracao.
 */
function generateChallenge() {
    const nonce     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 300000; // 5 minutos
    return { nonce, expiresAt };
}

/**
 * Verifica uma assinatura ECDSA DER recebida do frontend.
 *
 * O frontend (login.html via jsrsasign) assina a string hex do nonce com
 * SHA256withECDSA e produz uma assinatura em DER. O backend faz o mesmo
 * hash (SHA-256 da string hex do nonce) e verifica com a chave publica
 * EC extraida do certificado X.509 da wallet.
 *
 * Usa crypto.verify() com dsaEncoding em der para suportar chaves EC PKCS8.
 *
 * @param {string}            username     - Nome do usuario
 * @param {Buffer|Uint8Array} signatureDER - Assinatura recebida em formato DER
 * @returns {{ token: string }}
 */
async function verifySignature(username, signatureDER) {
    try {
        if (!username || !signatureDER) {
            throw new Error('Parametros invalidos');
        }

        // Recupera e valida o desafio ativo
        const challenge = activeChallenges.get(username);
        if (!challenge || Date.now() > challenge.expiresAt) {
            throw new Error('Desafio expirado ou inexistente');
        }

        // Busca identidade na wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet     = await Wallets.newFileSystemWallet(walletPath);
        const identity   = await wallet.get(username);

        if (!identity) {
            throw new Error('Identidade nao encontrada');
        }

        // Extrai chave publica EC do certificado X.509 via jsrsasign
        const certObj = KEYUTIL.getKey(identity.credentials.certificate);

        const sig = new KJUR.crypto.Signature({ alg: 'SHA256withECDSA' });
        sig.init(certObj);
        sig.updateString(challenge.nonce);

        const isValid = sig.verify(Buffer.from(signatureDER).toString('hex'));

        // Descarta o desafio (uso unico)
        activeChallenges.delete(username);

        if (!isValid) {
            throw new Error('Assinatura invalida');
        }

        // Emite token valido por 1 hora
        const token = jwt.sign(
            { sub: username },
            process.env.JWT_SECRET || 'sollytch-dev-secret', // Secret temporário, NÃO USAR COMO ESTÁ
            { expiresIn: '1h', algorithm: 'HS256' }
        );

        return { token };

    } catch (error) {
        console.error('Falha na verificacao:', error);
        throw error;
    }
}

module.exports = {
    generateChallenge,
    verifySignature,
    activeChallenges
};