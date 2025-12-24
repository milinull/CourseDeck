# 📚 Course Deck

> **Sua plataforma pessoal para cursos locais e offline.**

O **Course Deck** é uma aplicação desktop desenvolvida com Electron que transforma pastas de vídeos baixados em uma experiência de aprendizado completa, similar a plataformas como Hotmart, Udemy ou Alura, mas rodando 100% localmente no seu computador.

Organize seus estudos, faça anotações, controle seu tempo com Pomodoro e acompanhe seu progresso, tudo sem precisar de internet.

---

## ✨ Funcionalidades

Com base na análise do código, o Course Deck oferece:

* **📺 Player de Vídeo Completo:**
    * Controle de velocidade de reprodução (1.0x, 1.25x, 1.5x, 2.0x).
    * Suporte a legendas/transcrições (.vtt).
    * Memorização de onde você parou (resume playback).
    * **Modo Teatro (Tecla 'T'):** Foco total no vídeo.
* **📝 Bloco de Notas Inteligente:**
    * Anotações salvas automaticamente por aula.
    * Suporte a Markdown (texto puro).
* **🍅 Timer Pomodoro Integrado:**
    * Timer configurável de Foco e Pausa diretamente na sidebar.
    * Alertas visuais e sonoros ao finalizar ciclos.
* **📂 Gestão de Conteúdo:**
    * Histórico de cursos acessados recentemente.
    * Barra de progresso visual (porcentagem do curso concluído).
    * Marcação automática e manual de aulas assistidas ("Watched").
    * Suporte a materiais extras (Links externos e arquivos HTML locais).
* **🎨 Interface Moderna:**
    * Tema escuro (Dark Mode).
    * Sidebar redimensionável.
    * Busca rápida de aulas.
---

## 📁 Estrutura de Pastas Obrigatória

Para que o **Course Deck** reconheça seus cursos, módulos e aulas corretamente, é **fundamental** seguir a estrutura de pastas abaixo. O sistema lê a hierarquia de diretórios para montar o menu lateral.

```text
Nome do Curso/
├── 01. Módulo Introdutório/
│   ├── 01. Aula de Boas Vindas.mp4
│   ├── 02. Configurando Ambiente.mp4
│   └── external-links/ (Opcional)
│       ├── Documentação Oficial.url
│       └── Apostila.html
├── 02. Módulo Avançado/
│   ├── 01. Aprofundando no Código.mp4
│   └── 02. Finalização.mp4
└── ...
```

### Regras de Nomeação:

1. **Numeração:** Recomenda-se numerar as pastas e arquivos (ex: `01.`, `02.`) para garantir a ordenação correta na interface.
2. **Arquivos Suportados:** Vídeos (`.mp4`, `.mkv`, etc.) e arquivos de texto (`.html` para leitura interna).
3. **Links Externos:** Crie uma pasta `external-links` dentro do módulo se quiser adicionar atalhos de internet ou PDFs/HTMLs complementares.
---

## ⌨️ Atalhos de Teclado

Melhore sua produtividade durante os estudos:

| Tecla | Ação |
| --- | --- |
| `Espaço` | Play / Pause |
| `Seta Direita` | Avançar 5 segundos |
| `Seta Esquerda` | Voltar 5 segundos |
| `T` | Alternar Modo Teatro (Esconder Sidebar) |
---

## 🚀 Como Rodar o Projeto

Este projeto utiliza **Electron**. Para rodar localmente e contribuir:

### Pré-requisitos

* [Node.js](https://nodejs.org/) instalado.

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/user/CourseDeck.git
```


2. Instale as dependências:
```bash
cd course-deck
npm install
```


3. Inicie a aplicação:
```bash
npm start
```



---

## 🛠️ Tecnologias Utilizadas

* **Electron:** Framework para criar apps desktop nativos.
* **Node.js:** Manipulação de sistema de arquivos (`fs`, `path`) para leitura das pastas.
* **HTML5 & CSS3:** Interface do usuário (sem frameworks pesados como React/Vue, garantindo leveza).
* **JavaScript (Vanilla):** Lógica do player, persistência de dados (`localStorage`) e manipulação do DOM.
---

## 💾 Onde os dados são salvos?

* **Histórico de Pastas:** Salvo em um arquivo JSON na raiz do seu usuário (`.course_manager_recents.json`).
* **Progresso e Anotações:** Salvos no `localStorage` do navegador interno do Electron, garantindo que você não perca suas anotações mesmo se mover a pasta do curso.
---