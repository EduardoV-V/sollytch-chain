// prever_acao_corrigido.go
package main

import (
    "fmt"
    "log"
    "os"
    "strings"
    
    "github.com/sjwhitworth/golearn/base"
    "github.com/sjwhitworth/golearn/trees"
)

func main() {
    if len(os.Args) != 3 {
        log.Fatal("Uso: go run prever_acao_corrigido.go <modelo.gob> <dados_sem_classe.csv>")
    }
    
    modelFile := os.Args[1]
    dataFile := os.Args[2]
    
    fmt.Println("🔧 Carregando modelo treinado...")
    model := trees.NewID3DecisionTree(0.1)
    if err := model.Load(modelFile); err != nil {
        log.Fatalf("❌ Erro ao carregar modelo: %v", err)
    }
    fmt.Println("✅ Modelo carregado com sucesso")
    
    // LER O CSV COMO STRING PRIMEIRO
    fmt.Println("\n📂 Lendo dados para previsão...")
    csvBytes, err := os.ReadFile(dataFile)
    if err != nil {
        log.Fatalf("❌ Erro ao ler arquivo CSV: %v", err)
    }
    
    csvContent := string(csvBytes)
    
    // Verificar se a última coluna está vazia
    lines := strings.Split(strings.TrimSpace(csvContent), "\n")
    if len(lines) == 0 {
        log.Fatal("❌ Arquivo CSV vazio")
    }
    
    // Verificar cabeçalho
    headers := strings.Split(lines[0], ",")
    fmt.Printf("📋 Cabeçalho detectado: %d colunas\n", len(headers))
    fmt.Printf("   Última coluna: '%s'\n", headers[len(headers)-1])
    
    // Verificar primeira linha de dados
    if len(lines) > 1 {
        firstData := strings.Split(lines[1], ",")
        fmt.Printf("\n📊 Primeira linha de dados: %d valores\n", len(firstData))
        fmt.Printf("   Último valor: '%s'\n", firstData[len(firstData)-1])
    }
    
    // Se a última coluna estiver vazia, precisamos adicionar um placeholder
    // O golearn espera que a coluna de classe exista, mesmo que vazia
    fmt.Println("\n🎯 Preparando dados para previsão...")
    
    // Usar ParseCSVToInstances normalmente - se a coluna estiver vazia, vai dar problema
    // Vamos adicionar um placeholder
    reader := strings.NewReader(csvContent)
    data, err := base.ParseCSVToInstancesFromReader(reader, true)
    if err != nil {
        // Se falhar, tentar adicionar um placeholder para a classe
        fmt.Println("⚠️  Tentando alternativa...")
        
        // Adicionar "?" para a coluna de classe se estiver faltando
        modifiedLines := []string{}
        for i, line := range lines {
            if i == 0 {
                modifiedLines = append(modifiedLines, line)
            } else {
                parts := strings.Split(line, ",")
                if len(parts) == len(headers)-1 {
                    // Está faltando a última coluna, adicionar "?"
                    modifiedLines = append(modifiedLines, line + ",?")
                } else {
                    modifiedLines = append(modifiedLines, line)
                }
            }
        }
        
        modifiedCSV := strings.Join(modifiedLines, "\n")
        reader = strings.NewReader(modifiedCSV)
        data, err = base.ParseCSVToInstancesFromReader(reader, true)
        if err != nil {
            log.Fatalf("❌ Erro ao processar CSV: %v", err)
        }
    }
    
    totalInstancias, totalColunas := data.Size()
    fmt.Printf("✅ %d instâncias carregadas com %d atributos\n", totalInstancias, totalColunas)
    
    // Verificar atributos
    allAttrs := data.AllAttributes()
    if len(allAttrs) > 0 {
        fmt.Printf("🎯 Coluna alvo (última): %s\n", allAttrs[len(allAttrs)-1].GetName())
    }
    
    // Fazer previsões
    fmt.Println("\n🔮 Fazendo previsões...")
    predictions, err := model.Predict(data)
    if err != nil {
        log.Fatalf("❌ Erro nas previsões: %v", err)
    }
    
    predRows, _ := predictions.Size()
    fmt.Printf("✨ %d previsões geradas\n\n", predRows)
    
    // Mostrar previsões
    fmt.Println("📋 RESULTADOS DAS PREVISÕES:")
    fmt.Println("=============================")
    
    countMap := make(map[string]int)
    
    for i := 0; i < predRows; i++ {
        previsao := predictions.RowString(i)
        countMap[previsao]++
        fmt.Printf("Instância %2d: %s\n", i+1, previsao)
    }
    
    // Estatísticas
    fmt.Println("\n📊 ESTATÍSTICAS:")
    fmt.Println("================")
    for classe, quantidade := range countMap {
        percentual := float64(quantidade) / float64(predRows) * 100
        fmt.Printf("• %s: %d (%.1f%%)\n", classe, quantidade, percentual)
    }
    
    fmt.Println("\n✅ Previsões concluídas com sucesso!")
}