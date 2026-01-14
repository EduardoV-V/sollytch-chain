package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"strconv"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/sjwhitworth/golearn/base"
	"github.com/sjwhitworth/golearn/trees"
)

type NullFloat64 float64

func (nf *NullFloat64) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*nf = 0
		return nil
	}
	var f float64
	if err := json.Unmarshal(b, &f); err != nil {
		return err
	}
	*nf = NullFloat64(f)
	return nil
}

type ModelBytes struct {
	Version   int    `json:"version"`
	UpdatedAt string `json:"updated_at"`
	ModelKey  string `json:"modelKey"`
	ModelData string `json:"modelData"` // <-- armazena em b64!!!
}

type TestRecord struct {
	Version 					int          `json:"version"`
	LastUpdatedAt               string       `json:"last_updated_at"`
	CreatedAt                   string       `json:"created_at"`

	TestID                      string       `json:"test_id"`
	Timestamp                   string       `json:"timestamp"`
	Lat                         float64      `json:"lat"`
	Lon                         float64      `json:"lon"`
	GeoHash                     string       `json:"geo_hash"`
	OperatorID                  string       `json:"operator_id"`
	OperatorDID                 string       `json:"operator_did"`
	MatrixType                  string       `json:"matrix_type"`
	CassetteLot                 string       `json:"cassette_lot"`
	ReagentLot                  string       `json:"reagent_lot"`
	ExpiryDaysLeft              int          `json:"expiry_days_left"`
	DistanceMM                  float64      `json:"distance_mm"`
	TimeToMigrateS              float64      `json:"time_to_migrate_s"`
	ControlLineOK               bool         `json:"control_line_ok"`
	SampleVolumeUL              float64      `json:"sample_volume_uL"`
	SamplePH                    float64      `json:"sample_pH"`
	SampleTurbidityNTU          float64      `json:"sample_turbidity_NTU"`
	SampleTempC                 float64      `json:"sample_temp_C"`
	AmbientTC                   float64      `json:"ambient_T_C"`
	AmbientRHPct                float64      `json:"ambient_RH_pct"`
	LightingLux                 float64      `json:"lighting_lux"`
	TiltDeg                     float64      `json:"tilt_deg"`
	PreincubationTimeS          float64      `json:"preincubation_time_s"`
	TimeSinceSamplingMin        float64      `json:"time_since_sampling_min"`
	StorageCondition            string       `json:"storage_condition"`
	PrefilterUsed               bool         `json:"prefilter_used"`
	ImageTaken                  bool         `json:"image_taken"`
	ImageBlurScore              NullFloat64  `json:"image_blur_score"`
	DeviceFWVersion             string       `json:"device_fw_version"`
	ProdutoID                   string       `json:"produto_id"`
	KitCalibrationID            string       `json:"kit_calibration_id"`
	ControleInternoResult       string       `json:"controle_interno_result"`
	CadeiaFrioStatus            bool         `json:"cadeia_frio_status"`
	TempoTransporteHoras        float64      `json:"tempo_transporte_horas"`
	CondicaoTransporte          string       `json:"condicao_transporte"`
	EstimatedConcentrationPpb   float64      `json:"estimated_concentration_ppb"`
	IncertezaEstimativaPpb      float64      `json:"incerteza_estimativa_ppb"`
	AcaoRecomendada             string       `json:"acao_recomendada"`
	ResultClass                 string       `json:"result_class"`
	QCStatus                    string       `json:"qc_status"`
}

type SmartContract struct {
	contractapi.Contract
}

func incrementVersion(existing *TestRecord) int {
    if existing == nil {
        return 1
    }
    return existing.Version + 1
}

func (s *SmartContract) StoreModel(ctx contractapi.TransactionContextInterface, modelKey string, modelBase64 string) error {
	if modelKey == "" || modelBase64 == "" {
		return fmt.Errorf("modelKey e modelData nao podem ser vazios")
	}

	switch modelKey {
	case "acao_recomendada", "result_class", "qc_status":
		// ok
	default:
		return fmt.Errorf("modelKey invalido")
	}
	stub := ctx.GetStub()

	existingBytes, err := stub.GetState(modelKey)
	if err != nil {
		return fmt.Errorf("erro ao buscar modelo existente: %v", err)
	}
	version := 1

	if existingBytes != nil {
		var existingModel ModelBytes
		err = json.Unmarshal(existingBytes, &existingModel)
		if err != nil {
			return fmt.Errorf("erro ao decodificar modelo existente: %v", err)
		}
		version = existingModel.Version + 1
	}

	txTime, err := ctx.GetStub().GetTxTimestamp()
    if err != nil {
        return err
    }
    
	model := ModelBytes{
        ModelKey:  modelKey,
        ModelData: modelBase64,
        Version:   version,
        UpdatedAt: time.Unix(
            txTime.Seconds,
            int64(txTime.Nanos),
        ).UTC().Format(time.RFC3339),
    }

	bytes, err := json.Marshal(model)
	if err != nil {
		return err
	}

	return stub.PutState(modelKey, bytes)
}

func (s *SmartContract) getModelBytes(ctx contractapi.TransactionContextInterface, modelKey string) ([]byte, error) {
	data, err := ctx.GetStub().GetState(modelKey)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("modelo %s nao encontrado", modelKey)
	}

	var stored ModelBytes
	if err := json.Unmarshal(data, &stored); err != nil {
		return nil, err
	}

	return base64.StdEncoding.DecodeString(stored.ModelData)
}

func loadID3ModelFromLedger(ctx contractapi.TransactionContextInterface, s *SmartContract, modelKey string) (*trees.ID3DecisionTree, error) {
	bytes, err := s.getModelBytes(ctx, modelKey)
	if err != nil {
		return nil, err
	}

	path := filepath.Join(os.TempDir(), modelKey)
	if err := os.WriteFile(path, bytes, 0600); err != nil {
		return nil, err
	}

	model := trees.NewID3DecisionTree(0.1)
	if err := model.Load(path); err != nil {
		return nil, err
	}

	return model, nil
}

func loadDataset(csvData string) (*base.DenseInstances, error) {
	reader := strings.NewReader(csvData)

	data, err := base.ParseCSVToInstancesFromReader(reader, true)
	if err != nil {
		return nil, fmt.Errorf("erro ao carregar dataset: %v", err)
	}

	return data, nil
}

var baseHeader =
	"lat,lon,expiry_days_left,distance_mm,time_to_migrate_s," +
		"sample_volume_uL,sample_pH,sample_turbidity_NTU,sample_temp_C," +
		"ambient_T_C,ambient_RH_pct,lighting_lux,tilt_deg," +
		"preincubation_time_s,time_since_sampling_min,image_blur_score," +
		"tempo_transporte_horas,estimated_concentration_ppb," +
		"incerteza_estimativa_ppb,control_line_ok,controle_interno_result"


func predictFromCSV(model *trees.ID3DecisionTree, target string, csvRow string) (string, error) {
	header := baseHeader + "," + target
	csv := header + "\n" + csvRow + ",?"

	data, err := loadDataset(csv)
	if err != nil {
		return "", err
	}

	res, err := model.Predict(data)
	if err != nil {
		return "", err
	}

	return res.RowString(0), nil
}

func parseCSVToTestRecord(csvRow string) (*TestRecord, error) {
	fields := strings.Split(csvRow, ",")

	if len(fields) != 21 {
		return nil, fmt.Errorf("csv invalido: esperado 21 campos, recebeu %d", len(fields))
	}

	toBool := func(v string) bool {
		return v == "1" || strings.ToLower(v) == "true"
	}

	toFloat := func(v string) float64 {
		f, _ := strconv.ParseFloat(v, 64)
		return f
	}

	toInt := func(v string) int {
		i, _ := strconv.Atoi(v)
		return i
	}

	return &TestRecord{
		Lat:                       toFloat(fields[0]),
		Lon:                       toFloat(fields[1]),
		ExpiryDaysLeft:            toInt(fields[2]),
		DistanceMM:                toFloat(fields[3]),
		TimeToMigrateS:            toFloat(fields[4]),
		SampleVolumeUL:            toFloat(fields[5]),
		SamplePH:                  toFloat(fields[6]),
		SampleTurbidityNTU:        toFloat(fields[7]),
		SampleTempC:               toFloat(fields[8]),
		AmbientTC:                 toFloat(fields[9]),
		AmbientRHPct:              toFloat(fields[10]),
		LightingLux:               toFloat(fields[11]),
		TiltDeg:                   toFloat(fields[12]),
		PreincubationTimeS:        toFloat(fields[13]),
		TimeSinceSamplingMin:      toFloat(fields[14]),
		ImageBlurScore:            NullFloat64(toFloat(fields[15])),
		TempoTransporteHoras:      toFloat(fields[16]),
		EstimatedConcentrationPpb: toFloat(fields[17]),
		IncertezaEstimativaPpb:    toFloat(fields[18]),
		ControlLineOK:             toBool(fields[19]),
		ControleInternoResult:     fields[20],
	}, nil
}

func (s *SmartContract) StoreTest(ctx contractapi.TransactionContextInterface, testID string, jsonStr string, predictStr string) error {
    existing, err := ctx.GetStub().GetState(testID)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("teste %s ja existe", testID)
	}
	
	var record TestRecord
    if err := json.Unmarshal([]byte(jsonStr), &record); err != nil {
        return fmt.Errorf("erro ao decodificar JSON: %v", err)
    }

    record.TestID = testID
	
    modeloAcao, err := loadID3ModelFromLedger(ctx, s, "acao_recomendada")
    if err != nil {
        return err
    }

    modeloResult, err := loadID3ModelFromLedger(ctx, s, "result_class")
    if err != nil {
        return err
    }

    modeloQc, err := loadID3ModelFromLedger(ctx, s, "qc_status")
    if err != nil {
        return err
    }

    record.AcaoRecomendada, err =
        predictFromCSV(modeloAcao, "acao_recomendada", predictStr)
    if err != nil {
        return err
    }

    record.ResultClass, err =
        predictFromCSV(modeloResult, "result_class", predictStr)
    if err != nil {
        return err
    }

    record.QCStatus, err =
        predictFromCSV(modeloQc, "qc_status", predictStr)
    if err != nil {
        return err
    }

	txTime, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return err
	}

	timestamp := time.Unix(
		txTime.Seconds,
		int64(txTime.Nanos),
	).UTC().Format(time.RFC3339)

	record.Version = 0
	record.CreatedAt = timestamp
	record.LastUpdatedAt = timestamp

    bytes, err := json.Marshal(record)
    if err != nil {
        return err
    }
	
    return ctx.GetStub().PutState(testID, bytes)
}

func (s *SmartContract) UpdateTest(ctx contractapi.TransactionContextInterface, testID string, fullJSON string,) error {
    existingBytes, err := ctx.GetStub().GetState(testID)
    if err != nil {
        return err
    }
    if existingBytes == nil {
        return fmt.Errorf("teste %s nao encontrado", testID)
    }

    var existing TestRecord
    if err := json.Unmarshal(existingBytes, &existing); err != nil {
        return err
    }

    var updated TestRecord
    if err := json.Unmarshal([]byte(fullJSON), &updated); err != nil {
        return fmt.Errorf("json invalido: %v", err)
    }

	txTime, err := ctx.GetStub().GetTxTimestamp()
    if err != nil {
        return err
    }

    updated.TestID = testID
    updated.Version = existing.Version + 1
    updated.LastUpdatedAt = time.Unix(
        txTime.Seconds,
        int64(txTime.Nanos),
    ).UTC().Format(time.RFC3339)

    bytes, err := json.Marshal(updated)
    if err != nil {
        return err
    }

    return ctx.GetStub().PutState(testID, bytes)
}

func (s *SmartContract) QueryTest(ctx contractapi.TransactionContextInterface, testID string) (*TestRecord, error) {
	data, err := ctx.GetStub().GetState(testID)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("teste nao encontrado")
	}

	var record TestRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, err
	}

	return &record, nil
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