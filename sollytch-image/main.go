package main

import (
    "encoding/json"
    "fmt"

   	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Estrutura que representa os dados da imagem
type ImageAsset struct {
    Key        string   `json:"key"`
    HashData   string   `json:"hashData"`
}

// SmartContract define a estrutura do chaincode com os métodos disponíveis
type SmartContract struct {
	contractapi.Contract
}

// StoreImage armazena o hash da imagem no ledger
func (c *SmartContract) StoreImage(ctx contractapi.TransactionContextInterface, key string, hashData string) error {
    if key == "" {
        return fmt.Errorf("a chave não pode ser vazia")
    }
    if hashData == "" {
        return fmt.Errorf("o conteúdo do hash não pode ser vazio")
    }

    exists, err := c.ImageExists(ctx, key)
    if err != nil {
        return err
    }
    if exists {
        return fmt.Errorf("já existe uma imagem registrada com a chave %s", key)
    }

    asset := ImageAsset{
        Key:        key,
        HashData: hashData,
    }

    jsonBytes, err := json.Marshal(asset)
    if err != nil {
        return fmt.Errorf("erro ao serializar JSON: %v", err)
    }

    return ctx.GetStub().PutState(key, jsonBytes)
}

func (c *SmartContract) GetImage(ctx contractapi.TransactionContextInterface, key string) (string, error) {
    if key == "" {
        return "", fmt.Errorf("a chave não pode ser vazia")
    }

    data, err := ctx.GetStub().GetState(key)
    if err != nil {
        return "", fmt.Errorf("erro ao buscar estado: %v", err)
    }
    if data == nil {
        return "", fmt.Errorf("nenhuma imagem encontrada com a chave %s", key)
    }

    // Retorna direto como string - NÃO FAZ UNMARSHAL!
    return string(data), nil
}

func (c *SmartContract) GetImageAsset(ctx contractapi.TransactionContextInterface, key string) (*ImageAsset, error) {
    jsonStr, err := c.GetImage(ctx, key)
    if err != nil {
        return nil, err
    }
    
    var asset ImageAsset
    err = json.Unmarshal([]byte(jsonStr), &asset)
    if err != nil {
        return nil, fmt.Errorf("erro ao deserializar JSON: %v", err)
    }
    
    return &asset, nil
}

// ImageExists verifica se já existe uma imagem com a chave fornecida
func (c *SmartContract) ImageExists(ctx contractapi.TransactionContextInterface, key string) (bool, error) {
    data, err := ctx.GetStub().GetState(key)
    if err != nil {
        return false, fmt.Errorf("erro ao verificar estado: %v", err)
    }
    return data != nil, nil
}

// main inicia a execução do chaincode no blockchain
func main() {
	// Cria uma nova instância do chaincode
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		panic(fmt.Sprintf("erro criando chaincode: %v", err))
	}

	// Inicia o chaincode e aguarda por transações
	if err := chaincode.Start(); err != nil {
		panic(fmt.Sprintf("erro iniciando chaincode: %v", err))
	}
}