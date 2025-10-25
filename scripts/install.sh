#!/bin/bash

set -e

echo "Iniciando instalação de dependências"

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para verificar versão do Go
check_go_version() {
    if command_exists go; then
        GO_VERSION=$(go version | grep -o 'go[0-9]\+\.[0-9]\+' | sed 's/go//')
        REQUIRED_VERSION="1.21"
        
        if [ $(echo "$GO_VERSION >= $REQUIRED_VERSION" | bc -l) -eq 1 ]; then
            echo "Go versão $GO_VERSION (atende aos requisitos)"
            return 0
        else
            echo "Go versão $GO_VERSION é inferior à requerida (1.21+)"
            return 1
        fi
    else
        echo "Go não instalado"
        return 1
    fi
}

# Função para instalar Go
install_go() {
    echo "Instalando Go 1.21+..."
    
    # Download do Go
    wget https://golang.org/dl/go1.21.6.linux-amd64.tar.gz
    
    # Remove instalação anterior se existir
    sudo rm -rf /usr/local/go
    
    # Extrai para /usr/local
    sudo tar -C /usr/local -xzf go1.21.6.linux-amd64.tar.gz
    
    # Adiciona ao PATH
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
    echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
    
    # Recarrega o bashrc
    source ~/.bashrc
    
    # Limpa o arquivo baixado
    rm go1.21.6.linux-amd64.tar.gz
    
    echo "Go instalado com sucesso"
}

# Função para instalar Node.js e npm
install_nodejs() {
    echo "Instalando Node.js e npm..."
    
    # Instala curl se não existir
    if ! command_exists curl; then
        sudo apt-get update && sudo apt-get install -y curl
    fi
    
    # Instala Node.js 18 LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verifica a instalação
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    echo "Node.js $NODE_VERSION instalado"
    echo "npm $NPM_VERSION instalado"
}

# Função para verificar Docker
check_docker() {
    if command_exists docker && command_exists docker-compose; then
        DOCKER_VERSION=$(docker --version | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
        DOCKER_COMPOSE_VERSION=$(docker-compose --version | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
        
        echo "Docker versão $DOCKER_VERSION"
        echo "Docker Compose versão $DOCKER_COMPOSE_VERSION"
        return 0
    else
        echo "Docker ou Docker Compose não instalados"
        return 1
    fi
}

# Função para instalar Docker
install_docker() {
    echo "Instalando Docker e Docker Compose..."
    
    # Instala Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    
    # Adiciona usuário ao grupo docker
    sudo usermod -aG docker $USER
    
    # Instala Docker Compose
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Limpa arquivo de instalação
    rm get-docker.sh
    
    echo "Docker e Docker Compose instalados"
}

# Função para instalar dependências do projeto
install_project_dependencies() {
    echo "Instalando dependências do projeto..."
    
    # Instala dependências do chaincode
    if [ -d "chaincode" ]; then
        echo "Instalando dependências do chaincode..."
        cd chaincode
        go mod vendor
        cd ..
    else
        echo "Diretório 'chaincode' não encontrado"
    fi
    
    # Instala dependências da API
    if [ -d "ccapi" ]; then
        echo "Instalando dependências da ccapi..."
        cd ccapi
        go mod vendor
        cd ..
    else
        echo "Diretório 'ccapi' não encontrado"
    fi
    
    # Instala dependências Node.js se houver package.json
    if [ -f "package.json" ]; then
        echo "Instalando dependências Node.js..."
        npm install
    fi
    
    # Instala dependências do app se existir
    if [ -d "app" ] && [ -f "app/package.json" ]; then
        echo "Instalando dependências do app..."
        cd app
        npm install
        cd ..
    fi
    
    echo "dependências instaladas"
}

# Executa as instalações
echo ""
echo "1. Verificando Go..."
if ! check_go_version; then
    install_go
fi

echo ""
echo "2. Verificando Node.js e npm..."
if ! command_exists node || ! command_exists npm; then
    install_nodejs
else
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    echo "Node.js $NODE_VERSION"
    echo "npm $NPM_VERSION"
fi

echo ""
echo "3. Verificando Docker..."
if ! check_docker; then
    install_docker
fi

echo ""
echo "4. Instalando dependências do projeto..."
install_project_dependencies

# Verifica se o Docker foi instalado durante o script
DOCKER_INSTALADO=false
if command_exists docker && ! docker version > /dev/null 2>&1; then
    DOCKER_INSTALADO=true
fi

if [ "$DOCKER_INSTALADO" = true ] || ! docker version > /dev/null 2>&1; then
    echo "Instalação concluida!"
    echo "Para aplicar algumas alterações, o dispositivo precisa ser reiniciado"
    echo ""
    
    while true; do
        read -p "Deseja reiniciar agora? (s/N): " resposta
        case $resposta in
            [Ss]* ) 
                echo "Reiniciando a máquina..."
                sudo shutdown -r now
                exit 0
                ;;
            [Nn]* | "" ) 
                break
                ;;
            * ) 
                echo "Escolha inválida. Reinicie assim que possível."
                ;;
        esac
    done
else
    echo "Toda a instalação foi concluída"
fi