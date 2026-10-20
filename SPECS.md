# Especificação técnica — jogo casual de adivinhação de palavras

**Status:** proposta técnica para implementação  
**Produto de referência:** [PRD](./docs/plans/2026-10-20-jogo-casual-de-adivinhacao-de-palavras.md)  
**Direção visual:** Caderno de dedução  
**Plataforma:** web responsiva, pt-BR  
**Escopo:** MVP sem contas, anúncios, compras ou telemetria

**Implementação inicial:** servidor Node.js sem dependências, JavaScript nativo no cliente e API no mesmo processo. Esta escolha evita introduzir dependências antes de haver decisão de infraestrutura; não altera os contratos de domínio propostos abaixo. Para produção com mais de uma instância, substituir a `Map` de sessões, clientes anônimos e limites de taxa por KV/armazenamento compartilhado com TTL e proteção distribuída.

## 1. Objetivo e decisões técnicas

Este documento descreve a arquitetura, os contratos e os critérios de implementação do jogo. As regras de produto vêm do PRD; esta especificação transforma-as em componentes técnicos, sem tratar o protótipo visual como aplicação pronta para lançamento.

O repositório não tinha estrutura de aplicação, manifesto de dependências ou backend. A recomendação original era:

- **Frontend:** TypeScript, Vite e HTML semântico, sem framework de interface inicialmente.
- **API:** funções serverless/edge pequenas para servir desafios e avaliar palpites sem enviar as respostas diárias ao navegador.
- **Persistência do jogador:** `localStorage`, sem identificador de conta.
- **Deploy:** artefato estático de frontend e funções API no mesmo domínio; o provedor permanece a escolher.

Essa combinação mantém o cliente pequeno, separa regras de produto do DOM e permite proteger a lista de respostas futuras. A implementação deve evitar dependência de serviços de análise ou dados pessoais.

Para manter o MVP executável sem instalar pacotes, a primeira implementação usa módulos JavaScript e o servidor HTTP nativo do Node, em vez de TypeScript/Vite. As sessões são mantidas em memória por até 24 horas (máximo de 5.000); o processo deve ser único nesta versão local. Um cookie anônimo `HttpOnly` associa um navegador a uma sessão diária; palpites fornecidos pelo cliente não são aceitos como prova de uma sessão recuperável. Depois de reiniciar o servidor, uma rodada em andamento expira e a interface explica a perda de retomada. Os limites entre domínio, transporte, armazenamento e interface continuam separados; TypeScript pode ser adotado numa etapa posterior sem alterar as regras do jogo.

### Por que não colocar todas as respostas no frontend

Se a lista de respostas futuras for distribuída em JavaScript ou JSON público, qualquer pessoa pode inspecionar os arquivos e descobrir os desafios seguintes. Para atender ao requisito de desafio diário comum sem expor respostas futuras, a resposta e a agenda ficam no servidor. O cliente envia cada palpite e recebe somente o resultado das letras.

Uma implementação exclusivamente estática é possível para um protótipo, mas não atende ao sigilo das respostas. Se o projeto decidir deliberadamente não operar uma API, essa limitação precisa ser aceita e o requisito de proteção das palavras futuras revisto.

## 2. Escopo funcional

### Incluído

- Desafio diário compartilhado, uma palavra-alvo de cinco letras e até seis tentativas.
- Modo de prática com novas partidas sem limite.
- Validação de palpites de cinco letras.
- Feedback por letra: correta, presente em outra posição ou ausente.
- Tratamento de letras repetidas sem exceder a quantidade existente na resposta.
- Correspondência exata de diacríticos após normalização Unicode canônica.
- Retomada de partida no mesmo navegador.
- Estatísticas locais separadas para desafio e prática.
- Compartilhamento do desafio diário sem incluir a resposta.
- Layout responsivo, operação por teclado e teclado virtual.

### Fora do escopo

Contas, sincronização entre dispositivos, ranking, multiplayer, anúncios, compras, notificações, administração editorial visual, histórico de desafios e telemetria.

## 3. Arquitetura

```text
Navegador
  ├── Interface acessível (HTML/CSS)
  ├── Controlador de tela e estado da partida (TypeScript)
  ├── Repositório local versionado (localStorage)
  └── Cliente HTTP
        └── API serverless/edge
              ├── agenda privada de respostas diárias
              ├── lista privada de respostas
              ├── lista de palpites permitidos
              ├── sessões anônimas de prática com expiração
              └── avaliação de tentativas
```

### Limites de responsabilidade

**Frontend**

- Renderizar estado da aplicação; não calcular nem presumir o resultado das letras.
- Validar formato e número de letras antes da chamada de rede.
- Enviar tentativas e aplicar apenas os resultados retornados pela API.
- Salvar progresso e estatísticas localmente depois de receber uma resposta válida.
- Comunicar falhas de rede, cópia e validação sem avançar o estado.

**API**

- Resolver o desafio pelo identificador público e data de jogo definidos pelo fuso oficial.
- Manter respostas e agenda fora dos assets públicos.
- Validar se um palpite pertence à lista permitida e avaliar as letras.
- Retornar apenas estados de letra, estado da partida e dados não secretos necessários à interface.
- Não persistir dados de jogador no MVP.
- Manter a resposta associada ao `practiceId` em armazenamento temporário server-side; o identificador opaco não pode codificar a resposta.

**Persistência local**

- Recuperar a partida diária em andamento e partidas de prática após recarregar.
- Manter estatísticas independentes por modo.
- Tratar indisponibilidade, dados inválidos ou versões antigas de forma explícita; não converter erro de leitura em estatísticas fictícias.

## 4. Estrutura sugerida

```text
src/
  app/
    main.ts                 # Inicialização e composição dos módulos
    router.ts               # Navegação simples, se necessária
  game/
    game-controller.ts      # Comandos, transições e coordenação
    game-state.ts           # Tipos e estados de partida
    guess-validation.ts     # Validação local de formato e Unicode
    keyboard-state.ts       # Estado acumulado das letras no teclado
    statistics.ts           # Agregação local de estatísticas
    share-result.ts         # Construção da grade sem resposta
  api/
    game-api.ts             # Cliente HTTP tipado e tratamento de erros
  storage/
    game-storage.ts         # Leitura/escrita e migração de localStorage
  ui/
    render-game.ts          # Renderização da tela de partida
    render-stats.ts         # Renderização das estatísticas
    announcements.ts        # Mensagens acessíveis e região viva
  styles/
    tokens.css              # Tokens Caderno de dedução
    game.css                # Tabuleiro, teclado e estados
    responsive.css          # Breakpoints e adaptação móvel
api/
  daily.ts                  # Obter desafio e avaliar palpite diário
  practice.ts               # Abrir prática e avaliar palpite
server/
  word-schedule.ts          # Agenda privada de respostas
  word-lists.ts             # Listas de respostas e palpites
  evaluation.ts             # Algoritmo compartilhado de avaliação
tests/
  unit/
  integration/
  accessibility/
```

O nome e a divisão dos arquivos podem ser ajustados ao provedor escolhido, mantendo as fronteiras entre domínio, transporte, armazenamento e interface.

## 5. Modelo de domínio

### Tipos conceituais

```ts
type GameMode = "daily" | "practice";
type TileState = "correct" | "present" | "absent";
type GameStatus = "in-progress" | "won" | "lost";

interface GuessResult {
  guess: string;
  tiles: TileState[];
}

interface GameSession {
  mode: GameMode;
  puzzleId: string;
  dateKey?: string;
  status: GameStatus;
  guesses: GuessResult[];
  startedAt: string;
  completedAt?: string;
}

interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  winsByAttempt: [number, number, number, number, number, number];
  lastCompletedDate?: string;
}
```

Os tipos são contratos de domínio; não exigem manter esta representação exata se o armazenamento ou o framework escolhido exigir outro formato.

### Identificadores

- `dateKey`: data civil do desafio no fuso oficial, serializada como `YYYY-MM-DD`.
- `puzzleId`: identificador público estável do desafio, sem codificar a palavra.
- `practiceId`: identificador aleatório emitido pelo endpoint ao iniciar uma prática.

## 6. Máquina de estados da partida

Estados permitidos:

1. **loading:** recuperar sessão local e carregar desafio/metadata.
2. **ready:** sessão ativa, sem tentativa em envio.
3. **submitting:** palpite válido sendo avaliado pela API; desativar submissões duplicadas.
4. **invalid:** entrada local inválida ou palavra não reconhecida; tentativa não consumida.
5. **won:** resposta correta; sessão fechada.
6. **lost:** seis tentativas incorretas; sessão fechada e palavra revelada por resposta segura do servidor.
7. **unavailable:** API ou armazenamento indisponível; preservar o que já existe e oferecer nova tentativa de conexão.

Transições principais:

```text
loading -> ready | unavailable
ready -> invalid | submitting
submitting -> ready | won | lost | unavailable
invalid -> ready
unavailable -> loading
```

Não aceitar comando de envio em `submitting`, `won` ou `lost`. Falha de rede não acrescenta tentativa e não pode apagar o último estado persistido.

### Regras de encerramento

- Vitória quando a palavra submetida coincide exatamente com a resposta normalizada.
- Derrota após seis palpites válidos incorretos.
- Tentativas de tamanho inválido ou palavra não reconhecida não contam.
- Partida encerrada não aceita novos palpites.
- A palavra é retornada ao cliente apenas no estado `lost` ou após uma vitória já validada.

## 7. Unicode, letras e avaliação

### Normalização e contagem

- Converter entrada para maiúsculas com `toLocaleUpperCase("pt-BR")`.
- Normalizar para Unicode NFC tanto no cliente quanto no servidor. Assim, uma letra visualmente idêntica em forma composta/decomposta tem representação canônica igual.
- Contar grafemas/letras, não unidades UTF-16 (`string.length`). Preferir `Intl.Segmenter("pt-BR", { granularity: "grapheme" })`; se houver navegadores-alvo sem suporte, fornecer fallback testado para letras latinas do vocabulário pt-BR.
- Não remover acentos nem cedilha. `A`, `Á`, `Ã`, `Â`, `À` e `Ç` são letras diferentes na comparação.
- Rejeitar símbolos, espaços internos, pontuação e grafemas fora do conjunto permitido pela lista lexical.

### Algoritmo de feedback

Para cada palpite válido de cinco grafemas:

1. Inicializar todas as posições como `absent`.
2. Marcar primeiro as letras iguais na mesma posição como `correct`.
3. Contabilizar somente as letras restantes da resposta.
4. Percorrer as posições não corretas; marcar `present` enquanto houver ocorrência disponível da letra e consumir uma ocorrência.
5. Manter `absent` nas demais posições.

Esta ordem é obrigatória para tratar duplicatas. Por exemplo, resposta `MELÃO` e palpite com mais de um `M` não podem indicar mais ocorrências presentes/corretas do que as existentes.

### Estados acumulados do teclado

Precedência monotônica: `unknown < absent < present < correct`. Um feedback posterior não reduz a informação já exibida para a mesma letra. A posição correta, entretanto, é comunicada no tabuleiro da tentativa, não no teclado global.

## 8. API proposta

Usar HTTPS, JSON UTF-8, respostas com `Cache-Control: no-store` para operações de jogo e limites de tamanho de corpo. Os caminhos abaixo são contratos propostos; ajustar ao provedor sem expor respostas.

### Obter desafio diário

`GET /api/v1/daily`

Resposta `200`:

```json
{
  "puzzleId": "d_2026-10-20",
  "dateKey": "2026-10-20",
  "wordLength": 5,
  "maxAttempts": 6,
  "status": "available"
}
```

Não retornar palavra, hash reversível ou agenda de respostas futuras.

### Avaliar palpite diário

`POST /api/v1/daily/guess`

Requisição:

```json
{
  "puzzleId": "d_2026-10-20",
  "guess": "LIMPO",
  "attemptNumber": 1
}
```

Resposta válida em andamento:

```json
{
  "accepted": true,
  "tiles": ["correct", "correct", "absent", "absent", "absent"],
  "status": "in-progress"
}
```

Resposta de vitória/derrota inclui `status: "won" | "lost"` e `answer` somente após a partida terminal. Retornar erros de domínio com códigos estáveis, por exemplo `INVALID_WORD`, `INVALID_LENGTH`, `PUZZLE_NOT_FOUND` e `PUZZLE_CLOSED`; não usar uma resposta de sucesso semântica para erro.

### Iniciar prática

`POST /api/v1/practice`

Resposta `201`:

```json
{
  "practiceId": "p_opaque-random-id",
  "wordLength": 5,
  "maxAttempts": 6
}
```

O identificador não deve ser derivado da resposta. O serviço escolhe a palavra entre respostas curadas e a mantém privada.

Para resolver `practiceId` sem revelar o alvo, o serviço precisa de armazenamento temporário server-side (por exemplo, KV com TTL) ou capacidade equivalente do provedor. A sessão guarda somente ID, resposta, contador/estado e expiração; não inclui identidade pessoal. Definir TTL suficiente para retomar uma prática após fechar e reabrir o navegador, com recomendação inicial de 24 horas.

### Avaliar prática

`POST /api/v1/practice/{practiceId}/guess`

Mesmo contrato de avaliação diária, sem persistência de conta. O `practiceId` identifica apenas a palavra da sessão; não deve conter dados pessoais.

### Códigos HTTP e erros

- `400`: formato JSON ou campos incorretos.
- `404`: desafio ou sessão desconhecidos/expirados.
- `409`: partida encerrada ou sequência incompatível quando o serviço aplica verificação de tentativas.
- `422`: palavra não aceita pelo léxico ou quantidade inválida.
- `429`: limite de requisições excedido.
- `5xx`: erro inesperado; cliente preserva sessão e tentativa.

O frontend converte erros conhecidos em mensagens em pt-BR e apresenta uma mensagem genérica explícita para falhas inesperadas. Registrar erros operacionais no provedor sem registrar palpites, respostas secretas ou dados do usuário.

### Proteção contra abuso e limite da regra local

Sem contas, o servidor não pode provar que cada navegador jogou somente uma vez. O requisito “uma partida diária por pessoa e navegador” é aplicado localmente e pode ser contornado limpando dados. Isso é aceitável no MVP casual; não é um sistema antifraude. Limitar requisições por IP de forma prudente, sem transformar o produto em rastreamento individual.

O protótipo não exige uma API stateful, mas a arquitetura de produção usa estado efêmero para sessões de prática. Se o servidor também precisar garantir o máximo de seis tentativas e deduplicar retries da API, criar sessão anônima com token aleatório e guardar tentativas/idempotency key em KV com expiração. Essa chave é técnica, não conta de usuário; documentar TTL e não a reutilizar para analytics. Se não houver armazenamento efêmero disponível, o limite de tentativas e a unicidade diária permanecem controles de UX no cliente e podem ser contornados.

## 9. Vocabulário e agenda

Manter separados:

1. **Respostas:** lista privada, curada, agendada e nunca incluída em assets públicos.
2. **Palpites permitidos:** lista de palavras aceitas para validação; pode ser publicada se não contiver respostas futuras não lançadas.

Cada item editorial deve possuir forma normalizada, grafemas (cinco), língua/variante, revisão e elegibilidade para resposta. Excluir nomes próprios, estrangeirismos e conteúdo ofensivo das respostas, conforme o PRD.

### Formato interno ilustrativo

```json
{
  "dateKey": "2026-10-20",
  "puzzleId": "d_2026-10-20",
  "answer": "LIMÃO",
  "status": "scheduled"
}
```

Este formato pertence ao servidor privado; nunca servir o arquivo diretamente ao browser. O tratamento de dados editoriais, revisão humana e importação da lista ainda precisa ser definido.

## 10. Persistência no navegador

### Chaves recomendadas

- `word-game:v1:daily:{dateKey}` — sessão diária daquele dia.
- `word-game:v1:practice:{practiceId}` — sessão de prática em andamento/recente.
- `word-game:v1:stats:daily` — estatísticas do desafio diário.
- `word-game:v1:stats:practice` — estatísticas da prática.

Exemplo de sessão serializada:

```json
{
  "schemaVersion": 1,
  "mode": "daily",
  "puzzleId": "d_2026-10-20",
  "dateKey": "2026-10-20",
  "status": "in-progress",
  "guesses": [
    {
      "guess": "LIMPO",
      "tiles": ["correct", "correct", "absent", "absent", "absent"]
    }
  ],
  "startedAt": "2026-10-20T14:00:00.000Z"
}
```

### Regras de armazenamento

- Usar `schemaVersion` para migrações futuras.
- Validar JSON e invariantes antes de hidratar estado: modo, ID, até seis palpites, cinco grafemas por palpite, status e valores de tile conhecidos.
- Se um registro estiver corrompido, não sobrescrever silenciosamente. Mostrar aviso de que o progresso local não pôde ser carregado e permitir iniciar uma sessão nova.
- Atualizar storage somente após aceitação do palpite pelo servidor.
- Estatísticas diárias contam uma conclusão por `dateKey` no storage local; práticas usam estatísticas distintas.
- Não persistir a palavra diária enquanto a partida estiver em andamento.
- Dados podem ser removidos pelo navegador; informar essa limitação em ajuda/privacidade.

### Estatísticas

Campos mínimos: jogos concluídos, vitórias, percentual, sequência atual, melhor sequência e distribuição de vitória por tentativa. No cliente, derivar percentual de jogos e vitórias; armazenar contagens como fonte de verdade para evitar divergência.

Regra de sequência ainda pendente no PRD. Recomendação para a primeira entrega: contar apenas desafios diários consecutivos concluídos com vitória; falha ou dia perdido encerra a sequência. Partidas de prática não alteram sequências do diário. Confirmar antes de congelar o comportamento.

## 11. Direção visual: Caderno de dedução

O mockup existente em [prototipos.html](./prototipos.html) é uma peça de comparação com três temas, palavras e estatísticas de demonstração. Não deve ser carregado como aplicação final nem reutilizado como fonte de lógica de domínio. A implementação de produção deve adotar apenas os tokens e princípios da direção Caderno e substituir conteúdo fictício por dados reais.

### Tokens iniciais

| Token | Valor inicial | Uso |
|---|---:|---|
| `--page` | `#F7F4EC` | Fundo de papel |
| `--surface` | `#FFFDF8` | Cartões e campo |
| `--ink` | `#202A32` | Texto principal |
| `--muted` | `#4B5960` | Texto auxiliar |
| `--line` | `#C6CBC5` | Bordas |
| `--correct` | `#246B50` | Letra na posição correta |
| `--present` | `#805000` | Letra presente em outra posição |
| `--absent` | `#46515A` | Letra ausente |
| `--key` | `#E5E7E0` | Teclas neutras |
| `--focus` | `#1769AA` | Indicador de foco |

Usar fundo de papel quente, tiles quadrados contornados, títulos editoriais e interface utilitária sem serifa. Preferir fontes locais do sistema (serifada para títulos e sans-serif para controles), sem requisições de fontes externas. As cores são ponto de partida: medir contraste em cada par real, especialmente estados e textos pequenos, e ajustar se necessário. Forma/símbolo e rótulo devem acompanhar cor.

### Composição da interface

1. Cabeçalho com marca em texto, ação “Como jogar” e acesso às estatísticas.
2. Título do modo, data do desafio ou identificação de prática e indicador de tentativas.
3. Alternador explícito de desafio diário/prática.
4. Tabuleiro central com seis linhas por cinco células.
5. Legenda de estados por texto e símbolo.
6. Campo de palavra, envio, mensagem de validação e acesso a diacríticos.
7. Teclado virtual acessível, incluindo envio e apagar.
8. Painel de estatísticas e distribuição; cartão de ajuda e resultado conforme estado.
9. Compartilhamento somente após o desafio diário estar concluído.

### Responsividade

- Desktop: tabuleiro como foco principal, estatísticas em coluna lateral.
- Até aproximadamente `760px`: layout de uma coluna; estatísticas abaixo da área de jogo.
- Mínimo de viewport de projeto: `320px`; sem rolagem horizontal.
- Teclas e controles devem ter área confortável (alvo de 44 × 44 CSS px quando a disposição permitir); não depender de hover.
- Respeitar `prefers-reduced-motion` e `forced-colors`; animação nunca comunica informação essencial.

## 12. Interação e acessibilidade

- Documento em `lang="pt-BR"`, hierarquia de títulos e landmarks semânticos.
- Campo de entrada com rótulo acessível, instruções associadas e limite de cinco grafemas.
- Envio por Enter e botão; teclado virtual com botões reais e nomes pronunciáveis.
- Tabuleiro descrito como tentativas e letras; feedback anunciado após cada submissão em região viva sem forçar leitura repetitiva de toda a tela.
- Mensagens de erro junto ao campo e via `aria-live="polite"`; erro não consome tentativa.
- Estado “correta”, “presente” e “ausente” em texto/símbolo acessível, além da cor.
- Foco visível e ordem de tabulação previsível. Após envio, foco permanece no campo ou segue comportamento explicitamente testado.
- Inserção de `Á À Â Ã É Ê Í Ó Ô Õ Ú Ç`; backspace remove um grafema completo.
- Tamanho de texto redimensionável sem perda de conteúdo ou função.
- Validar contraste de texto normal conforme WCAG AA (4,5:1) e texto grande (3:1); testar cores dos tiles, teclas, bordas e foco.
- Testar teclado apenas, zoom de 200%, modo de alto contraste e ao menos um leitor de tela/navegador de referência antes de lançamento.

## 13. Compartilhamento seguro

Gerar o texto exclusivamente a partir dos `tiles` salvos, nunca da palavra. O resultado deve incluir identificação do desafio, tentativas e grade de símbolos; ocultar a palavra e metadados internos.

Fluxo:

1. Apresentar botão “Compartilhar resultado” somente após o desafio terminar.
2. Criar texto sem spoiler.
3. Tentar `navigator.clipboard.writeText` em contexto seguro.
4. Em caso de sucesso, anunciar confirmação.
5. Em caso de rejeição ou ausência da API, revelar textarea com o texto e selecioná-lo para cópia manual; explicar o que fazer.

Testar o conteúdo compartilhado para garantir que não contém a resposta, inclusive em caso de derrota.

## 14. Segurança, privacidade e operação

- Não armazenar segredos de API no cliente; respostas diárias são dados privados do servidor.
- Validar todo payload no servidor: tamanho máximo, campos, grafemas, ID e número de tentativa.
- Usar HTTPS, CORS restrito ao domínio de produção e limites de taxa.
- Não inserir HTML de usuário com `innerHTML`; renderizar texto por APIs seguras do DOM.
- Não registrar palavra-alvo, palpites individuais ou conteúdo de clipboard em logs.
- Não coletar cookies de rastreamento, e-mail ou identificador persistente no MVP.
- `localStorage` não é uma fronteira de segurança; usuário pode editar os dados e isso não dá direito a prêmios/benefícios (não existem no MVP).
- Manter respostas privadas em variável de ambiente/asset server-only gerenciado pelo provedor; nunca incluir arquivo privado no bundle de build.
- Usar cache control que não armazene respostas privadas de avaliação. Metadata pública do puzzle pode ter cache curto, sem incluir resposta.

## 15. Tratamento de falhas

| Falha | Comportamento esperado |
|---|---|
| Offline ou timeout ao carregar desafio | Exibir erro recuperável e ação tentar novamente; não iniciar puzzle fictício |
| Falha ao avaliar palpite | Preservar texto, tentativa e estado; permitir repetir a solicitação sem duplicar submissão |
| Palpite inválido | Explicar erro; não alterar contador ou tabuleiro |
| Storage indisponível/corrompido | Informar que retomada pode não funcionar; manter partida em memória enquanto a aba estiver aberta |
| Clipboard indisponível | Mostrar resultado sem spoiler em campo selecionável |
| API retorna resposta inesperada | Não assumir vitória nem derrota; registrar erro operacional redigido e mostrar mensagem de falha |
| Desafio expirado ou data inválida | Solicitar metadata atualizada e explicar a mudança sem apagar progresso do dia anterior |

## 16. Testes e critérios de aceite técnico

### Testes unitários

- Avaliação para acerto, letra ausente, letra presente e combinação dos três estados.
- Letras repetidas na resposta e no palpite.
- Palavras com `Á`, `Ã`, `Ç` e forma Unicode NFC/NFD equivalente.
- Contagem por grafema; rejeição de espaços e pontuação.
- Precedência monotônica do teclado.
- Percentual, sequência e distribuição de estatísticas, incluindo virada de dia.
- Texto de compartilhamento não contém resposta.
- Transições que impedem tentativas após vitória/derrota.

### Testes de integração

- API recebe palavra válida e retorna cinco estados.
- Palavra inválida não consome tentativa.
- Resposta diária é igual para a mesma data e não aparece em metadata/arquivos públicos.
- Vitória e derrota revelam a resposta somente em estado terminal.
- Erro de rede não altera sessão local.
- Atualizar a página restaura tentativa diária e prática.
- Alternar modo não mistura board, contadores ou estatísticas.

### Testes de interface/acessibilidade

- Viewports de 320px, 390px, tablet e desktop sem rolagem horizontal.
- Fluxo completo somente por teclado e teclado virtual.
- Acentos inseridos e apagados corretamente.
- Estados compreensíveis sem cor.
- Foco visível, região viva, erros associados e cópia com fallback.
- `prefers-reduced-motion` e `forced-colors`.

### Critérios de aceite do MVP

1. O mesmo `dateKey` retorna a mesma palavra lógica a todos os clientes, sem revelar a resposta antes do término.
2. Uma partida válida tem no máximo seis tentativas aceitas; erro de validação ou transporte não reduz esse limite.
3. Uma partida diária em andamento retoma no mesmo navegador depois de recarregar.
4. Prática não altera disponibilidade, estado nem estatísticas do desafio diário.
5. Regras de letras repetidas e acentos passam os testes especificados.
6. Resultado partilhado corresponde às tentativas e não contém a resposta.
7. Não existe dependência de conta ou coleta de dados pessoais para jogar.
8. Interface é operável em telas de 320px para cima, teclado e tecnologias assistivas selecionadas.

## 17. Build e ambientes

Scripts esperados após a inicialização do projeto:

- `npm run dev`: servidor de desenvolvimento.
- `npm run typecheck`: verificação TypeScript sem emissão.
- `npm run test`: testes unitários e de integração.
- `npm run build`: build de produção.
- `npm run preview`: inspeção local do bundle de produção.

Ambientes:

- **Local:** palavras e agenda de teste não secretas, API mock/local isolada.
- **Preview:** dataset de teste; nunca publicar respostas reais futuras.
- **Produção:** agenda editorial validada, segredos no servidor e configuração de domínio/CORS.

Não introduzir dados de produção em screenshots, testes ou logs. O deploy só deve ser considerado pronto depois de testar API e frontend sob o mesmo domínio e HTTPS.

## 18. Plano de implementação

1. **Fundação:** selecionar provedor de API/deploy, iniciar TypeScript/Vite, configurar scripts, lint/typecheck e design tokens Caderno.
2. **Domínio:** implementar Unicode, validação, estados da partida, avaliação no servidor e testes de duplicatas.
3. **Persistência:** serialização versionada, recuperação diária/prática e agregação de estatísticas.
4. **Interface:** tabuleiro, entrada, teclado pt-BR, alternância de modos, erros e estados terminais.
5. **Conteúdo/API:** importar listas curadas, agenda segura, endpoints tipados, rate limit e observabilidade redigida.
6. **Acessibilidade e responsividade:** executar critérios da seção 16 em dispositivos e tecnologias assistivas.
7. **Lançamento:** validar processo editorial e política de fuso; publicar sem telemetria por padrão.

## 19. Decisões ainda necessárias

As escolhas abaixo aparecem como pendências no PRD ou exigem decisão operacional; os valores indicados são recomendações, não requisitos confirmados:

| Decisão | Recomendação para MVP | Impacto |
|---|---|---|
| Fuso da virada diária | `America/Sao_Paulo` | Data, agenda, sequência e contagem para o próximo desafio |
| Desafios passados | Não reabrir inicialmente | Política de calendário e estatísticas |
| Contagem de sequência | Apenas desafios diários consecutivos vencidos | Fórmula das estatísticas |
| Compartilhamento de prática | Não oferecer | Evita ambiguidade de resultado e spoiler |
| Provedor/serverless | Escolher antes da implementação | Rotas, segredo, CORS, rate limit e deploy |
| Léxico de palpites/respostas | Confirmar fonte, licença e processo de revisão | Cobertura, qualidade e direitos de redistribuição |
| Política de retry após falha | Manter palpite no campo até aceitação | UX e idempotência de requisições |
| Suporte de navegadores | Definir versões mínimas e fallback de `Intl.Segmenter` | Tamanho e teste do polyfill |
