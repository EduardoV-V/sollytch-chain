package main

import (
    "encoding/json"
    "fmt"
    "time"

    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type ImageAsset struct {
    IDImagem      string `json:"idImagem"`
    IDKit         string `json:"idKit"`
    Timestamp     string `json:"timestamp"`
    HashData      string `json:"hashData"`

    Version       int    `json:"version"`
    LastUpdatedAt string `json:"lastUpdatedAt"`
}

type SmartContract struct {
    contractapi.Contract
}

func (c *SmartContract) StoreImage(ctx contractapi.TransactionContextInterface, idImagem string, idKit string, hashData string) error {

	if idImagem == "" || idKit == "" {
		return fmt.Errorf("idImagem e idKit são obrigatórios")
	}

	imageKey := idImagem

	txTime, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return err
	}

	formattedTime := time.Unix(
		txTime.Seconds,
		int64(txTime.Nanos),
	).UTC().Format(time.RFC3339)

	exists, err := c.ImageExists(ctx, imageKey)
	if err != nil {
		return err
	}

	var asset ImageAsset

	if exists {
		assetBytes, err := ctx.GetStub().GetState(imageKey)
		if err != nil {
			return err
		}
		if assetBytes == nil {
			return fmt.Errorf("falha ao carregar imagem existente %s", idImagem)
		}

		if err := json.Unmarshal(assetBytes, &asset); err != nil {
			return err
		}

		asset.HashData = hashData
		asset.Version++
		asset.LastUpdatedAt = formattedTime

	} else {
		asset = ImageAsset{
			IDImagem:      idImagem,
			IDKit:         idKit,
			Timestamp:     formattedTime,
			HashData:      hashData,
			Version:       0,
			LastUpdatedAt: formattedTime,
		}

		indexKey, err := ctx.GetStub().CreateCompositeKey(
			"kit~image",
			[]string{idKit, idImagem},
		)
		if err != nil {
			return err
		}

		if err := ctx.GetStub().PutState(indexKey, []byte{0x00}); err != nil {
			return err
		}
	}

	assetBytes, err := json.Marshal(asset)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(imageKey, assetBytes)
}

func (c *SmartContract) GetImagesByKit(ctx contractapi.TransactionContextInterface, idKit string,) ([]*ImageAsset, error) {
    iterator, err := ctx.GetStub().GetStateByPartialCompositeKey(
        "kit~image",
        []string{idKit},
    )
    if err != nil {
        return nil, err
    }
    defer iterator.Close()

    var results []*ImageAsset

    for iterator.HasNext() {
        response, err := iterator.Next()
        if err != nil {
            return nil, err
        }

        _, parts, err := ctx.GetStub().SplitCompositeKey(response.Key)
        if err != nil {
            return nil, err
        }

        idImagem := parts[1]

        image, err := c.GetImageByID(ctx, idImagem)
        if err != nil {
            return nil, err
        }

        results = append(results, image)
    }

    return results, nil
}

func (c *SmartContract) GetImageByID(ctx contractapi.TransactionContextInterface, idImagem string,
) (*ImageAsset, error) {

    if idImagem == "" {
        return nil, fmt.Errorf("idImagem não pode ser vazio")
    }

    imageKey := idImagem

    data, err := ctx.GetStub().GetState(imageKey)
    if err != nil {
        return nil, fmt.Errorf("erro ao acessar o ledger: %v", err)
    }
    if data == nil {
        return nil, fmt.Errorf("imagem %s não encontrada", idImagem)
    }

    var asset ImageAsset
    if err := json.Unmarshal(data, &asset); err != nil {
        return nil, fmt.Errorf("erro ao deserializar imagem: %v", err)
    }

    return &asset, nil
}

func (c *SmartContract) ImageExists(ctx contractapi.TransactionContextInterface, key string,
) (bool, error) {

    data, err := ctx.GetStub().GetState(key)
    if err != nil {
        return false, fmt.Errorf("erro ao verificar estado: %v", err)
    }
    return data != nil, nil
}

func main() {
    chaincode, err := contractapi.NewChaincode(new(SmartContract))
    if err != nil {
        panic(fmt.Sprintf("erro criando chaincode: %v", err))
    }

    if err := chaincode.Start(); err != nil {
        panic(fmt.Sprintf("erro iniciando chaincode: %v", err))
    }
}
