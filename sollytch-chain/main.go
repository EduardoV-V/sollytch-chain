package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"embed"
	"os"
	"path/filepath"

	"github.com/sjwhitworth/golearn/base"
	"github.com/sjwhitworth/golearn/trees"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// NullFloat64 trata valores float64 que podem ser nulos no JSON
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

// TestRecord representa a estrutura completa de dados de um teste no blockchain
type TestRecord struct {
	TestID                  string     `json:"test_id"`
	Timestamp               string     `json:"timestamp"`
	Lat                     float64    `json:"lat"`
	Lon                     float64    `json:"lon"`
	GeoHash                 string     `json:"geo_hash"`
	OperatorID              string     `json:"operator_id"`
	OperatorDID             string     `json:"operator_did"`
	MatrixType              string     `json:"matrix_type"`
	CassetteLot             string     `json:"cassette_lot"`
	ReagentLot              string     `json:"reagent_lot"`
	ExpiryDaysLeft          int        `json:"expiry_days_left"`
	DistanceMM              float64    `json:"distance_mm"`
	TimeToMigrateS          float64    `json:"time_to_migrate_s"`
	ControlLineOK           bool       `json:"control_line_ok"`
	SampleVolumeUL          float64    `json:"sample_volume_uL"`
	SamplePH                float64    `json:"sample_pH"`
	SampleTurbidityNTU      float64    `json:"sample_turbidity_NTU"`
	SampleTempC             float64    `json:"sample_temp_C"`
	AmbientTC               float64    `json:"ambient_T_C"`
	AmbientRHPct            float64    `json:"ambient_RH_pct"`
	LightingLux             float64    `json:"lighting_lux"`
	TiltDeg                 float64    `json:"tilt_deg"`
	PreincubationTimeS      float64    `json:"preincubation_time_s"`
	TimeSinceSamplingMin    float64    `json:"time_since_sampling_min"`
	StorageCondition        string     `json:"storage_condition"`
	PrefilterUsed           bool       `json:"prefilter_used"`
	ImageTaken              bool       `json:"image_taken"`
	ImageBlurScore          NullFloat64 `json:"image_blur_score"`
	DeviceFWVersion         string     `json:"device_fw_version"`
	ProdutoID               string     `json:"produto_id"`
	KitCalibrationID        string     `json:"kit_calibration_id"`
	ControleInternoResult   string     `json:"controle_interno_result"`
	CadeiaFrioStatus        bool       `json:"cadeia_frio_status"`
	TempoTransporteHoras    float64    `json:"tempo_transporte_horas"`
	CondicaoTransporte      string     `json:"condicao_transporte"`
	EstimatedConcentrationPpb float64  `json:"estimated_concentration_ppb"`
	IncertezaEstimativaPpb  float64    `json:"incerteza_estimativa_ppb"`
	AcaoRecomendada         string     `json:"acao_recomendada"`
	ResultClass             string     `json:"result_class"`
	QCStatus                string     `json:"qc_status"`
}

//go:embed modelos/*
var modelosFS embed.FS

// SmartContract define a estrutura do chaincode com os métodos disponíveis
type SmartContract struct {
	contractapi.Contract
}

var (
    modeloAcao   *trees.ID3DecisionTree
    modeloResult *trees.ID3DecisionTree
    modeloQc     *trees.ID3DecisionTree
)

func writeTempModelFile(name string, data []byte) (string, error) {
    dir := os.TempDir()
    path := filepath.Join(dir, name)

    err := os.WriteFile(path, data, 0600)
    if err != nil {
        return "", err
    }

    return path, nil
}

func loadDataset(csvData string) (*base.DenseInstances, error) {
    reader := strings.NewReader(csvData)
    
    data, err := base.ParseCSVToInstancesFromReader(reader, true)
    if err != nil {
        return nil, fmt.Errorf("erro ao carregar dataset: %v", err)
    }
    
    return data, nil
}

func carregarModelos() error {
    // -------- ACAO RECOMENDADA --------
    acaoBytes, err := modelosFS.ReadFile("modelos/acao_recomendada")
    if err != nil {
        return err
    }

    acaoPath, err := writeTempModelFile("acao_recomendada.model", acaoBytes)
    if err != nil {
        return err
    }

    modeloAcao = trees.NewID3DecisionTree(0.1)
    if err := modeloAcao.Load(acaoPath); err != nil {
        return err
    }

    // -------- RESULT CLASS --------
    resultBytes, err := modelosFS.ReadFile("modelos/result_class")
    if err != nil {
        return err
    }

    resultPath, err := writeTempModelFile("result_class.model", resultBytes)
    if err != nil {
        return err
    }

    modeloResult = trees.NewID3DecisionTree(0.1)
    if err := modeloResult.Load(resultPath); err != nil {
        return err
    }

    // -------- QC STATUS --------
    qcBytes, err := modelosFS.ReadFile("modelos/qc_status")
    if err != nil {
        return err
    }

    qcPath, err := writeTempModelFile("qc_status.model", qcBytes)
    if err != nil {
        return err
    }

    modeloQc = trees.NewID3DecisionTree(0.1)
    if err := modeloQc.Load(qcPath); err != nil {
        return err
    }

    return nil
}

func buildHeader(target string) string {
    baseHeader := "lat,lon,expiry_days_left,distance_mm,time_to_migrate_s," +
        "sample_volume_uL,sample_pH,sample_turbidity_NTU,sample_temp_C,ambient_T_C," +
        "ambient_RH_pct,lighting_lux,tilt_deg,preincubation_time_s,time_since_sampling_min," +
        "image_blur_score,tempo_transporte_horas,estimated_concentration_ppb," +
        "incerteza_estimativa_ppb,control_line_ok,controle_interno_result"

    return baseHeader + "," + target
}

// StoreTest armazena um registro de teste no ledger do blockchain
func (s *SmartContract) StoreTest(ctx contractapi.TransactionContextInterface, testID string, jsonStr string, predictStr string) error {
	if modeloAcao == nil || modeloResult == nil || modeloQc == nil {
		if err := carregarModelos(); err != nil {
			return err
		}
	}

    var record TestRecord

    err := json.Unmarshal([]byte(jsonStr), &record)
    if err != nil {
        return fmt.Errorf("erro ao decodificar JSON: %v", err)
    }

    if record.TestID == "" {
        record.TestID = testID
    } else if record.TestID != testID {
        return fmt.Errorf("o test_id do JSON (%s) não corresponde ao argumento (%s)", record.TestID, testID)
    }
	
	if modeloAcao == nil || modeloResult == nil || modeloQc == nil {
		fmt.Println("Modelos não encontrados")
	}

	headerAcao := buildHeader("acao_recomendada")
    fullCSV := headerAcao + "\n" + predictStr + ",?"
    predictionDataAcao, err := loadDataset(fullCSV)
	
	acao, err := modeloAcao.Predict(predictionDataAcao)
    if err != nil {
        return fmt.Errorf("erro ao fazer previsões: %v", err)
    }

	acaoPred := acao.RowString(0)
	record.AcaoRecomendada = acaoPred

	headerResult := buildHeader("result_class")
	fullCSV = headerResult + "\n" + predictStr + ",?"

    predictionDataResult, err := loadDataset(fullCSV)
	
	result, err := modeloResult.Predict(predictionDataResult)
    if err != nil {
        return fmt.Errorf("erro ao fazer previsões: %v", err)
    }

	resultPred := result.RowString(0)
	record.ResultClass = resultPred

	header := buildHeader("qc_status")
	fullCSV = header + "\n" + predictStr + ",?"

    predictionDataStatus, err := loadDataset(fullCSV)

	qcStatus, err := modeloQc.Predict(predictionDataStatus)
    if err != nil {
        return fmt.Errorf("erro ao fazer previsões: %v", err)
    }

	qcStatusPred := qcStatus.RowString(0)
	record.QCStatus = qcStatusPred

    recordBytes, err := json.Marshal(record)
    if err != nil {
        return fmt.Errorf("erro ao serializar registro: %v", err)
    }

    return ctx.GetStub().PutState(testID, recordBytes)
}

// QueryTest recupera um registro de teste específico pelo ID
func (s *SmartContract) QueryTest(ctx contractapi.TransactionContextInterface, testID string) (*TestRecord, error) {
	recordBytes, err := ctx.GetStub().GetState(testID)
	if err != nil {
		return nil, fmt.Errorf("falha ao ler do ledger: %v", err)
	}
	if recordBytes == nil {
		return nil, fmt.Errorf("teste %s não encontrado", testID)
	}

	var record TestRecord
	err = json.Unmarshal(recordBytes, &record)
	if err != nil {
		return nil, fmt.Errorf("erro ao decodificar registro: %v", err)
	}

	return &record, nil
}

// GetAllTests retorna todos os registros de teste armazenados no ledger
func (s *SmartContract) GetAllTests(ctx contractapi.TransactionContextInterface) ([]TestRecord, error) {
	// Obtém um iterador para todos os registros no ledger
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var records []TestRecord
	// Itera sobre todos os registros encontrados
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		// Converte cada registro para a estrutura TestRecord
		var record TestRecord
		err = json.Unmarshal(queryResponse.Value, &record)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, nil
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