package main

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
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

// TestRecord: representa a estrutura de dados do teste
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

type SmartContract struct {
	contractapi.Contract
}

// StoreTest armazena um registro de teste no ledger
func (s *SmartContract) StoreTest(ctx contractapi.TransactionContextInterface, testID string, jsonStr string) error {
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

	recordBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("erro ao serializar registro: %v", err)
	}

	return ctx.GetStub().PutState(testID, recordBytes)
}

// QueryTest recupera um registro de teste pelo ID
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

// GetAllTests retorna todos os registros armazenados
func (s *SmartContract) GetAllTests(ctx contractapi.TransactionContextInterface) ([]TestRecord, error) {
    resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
    if err != nil {
        return nil, err
    }
    defer resultsIterator.Close()

    var records []TestRecord
    for resultsIterator.HasNext() {
        queryResponse, err := resultsIterator.Next()
        if err != nil {
            return nil, err
        }

        var record TestRecord
        err = json.Unmarshal(queryResponse.Value, &record)
        if err != nil {
            return nil, err
        }
        records = append(records, record) // sem ponteiro
    }

    return records, nil
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
