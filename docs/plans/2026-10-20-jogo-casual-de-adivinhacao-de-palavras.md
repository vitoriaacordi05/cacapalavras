# PRD — Jogo casual de adivinhação de palavras

**Status:** Rascunho para validação  
**Data:** 20/10/2026  
**Plataforma inicial:** Web responsiva  
**Idioma:** Português do Brasil

## 1. Resumo do produto

Um jogo casual em que a pessoa tenta descobrir uma palavra secreta de cinco letras em até seis tentativas. Cada tentativa válida informa quais letras estão na posição correta, aparecem em outra posição ou não aparecem na palavra. O produto oferece um desafio diário compartilhado e partidas ilimitadas de prática, sem cadastro e sem monetização no MVP.

## 2. Base de pesquisa e princípios de produto

### Síntese de padrões do gênero

- Um ciclo curto e repetível — tentativa, feedback, nova hipótese — torna a regra fácil de aprender e mantém o foco na dedução.
- Um limite fixo de tentativas cria uma dificuldade previsível; o feedback após cada palpite permite aprender sem depender de tutoriais longos.
- Um desafio diário comum cria uma ocasião recorrente para jogar e conversar sobre resultados. O compartilhamento em grade sem a resposta preserva a surpresa para outras pessoas.
- Um modo de prática ilimitado permite continuar jogando sem alterar a disponibilidade do desafio diário.
- Jogos de palavras em português precisam tratar explicitamente acentos, cedilha, flexões, regionalismos e palavras pouco familiares; a curadoria é parte central da qualidade do jogo.
- O feedback não deve depender somente de cores. Teclado e controles devem funcionar em telas pequenas e com tecnologias assistivas.

### Limitação da pesquisa

As consultas a fontes externas foram recusadas nesta sessão. Portanto, esta síntese registra padrões gerais conhecidos do gênero, não uma pesquisa de mercado validada por fontes. Não há citações, métricas de mercado nem afirmações quantitativas neste rascunho. Antes de decisões de investimento ou posicionamento, validar os padrões e comparar jogos existentes com pesquisa externa.

## 3. Problema, público e proposta de valor

**Problema:** quem procura um passatempo rápido de palavras precisa entender as regras imediatamente, receber feedback claro e poder jogar sem cadastro ou compromisso longo.

**Público inicial:** pessoas que gostam de desafios de vocabulário em português e querem jogar em sessões curtas no celular ou computador. Faixa etária e necessidades específicas do público ainda não foram definidas.

**Proposta de valor:** descobrir uma palavra por dia em uma partida curta, compartilhar o resultado sem spoilers e continuar praticando quando quiser.

## 4. Objetivos e fora de escopo

### Objetivos do MVP

1. Permitir que uma pessoa entenda e complete uma partida sem instruções externas.
2. Oferecer a mesma palavra diária a todas as pessoas no mesmo dia de jogo.
3. Disponibilizar prática ilimitada sem consumir ou substituir o desafio diário.
4. Guardar estatísticas e progresso localmente, sem exigir conta.
5. Fazer o jogo funcionar em celular e desktop, com feedback perceptível sem depender apenas de cor.

### Fora de escopo do MVP

- Aplicativos nativos para Android ou iOS.
- Contas, sincronização entre dispositivos ou ranking online.
- Multiplayer, partidas com amigos ou torneios.
- Dicas durante a partida.
- Anúncios, compras ou assinatura.
- Temas ou listas temáticas selecionáveis.

## 5. Ciclo principal e regras

1. A pessoa abre o jogo e escolhe o desafio diário ou a prática.
2. Digita uma palavra de cinco letras e envia a tentativa.
3. O jogo valida a palavra e revela o feedback de cada letra.
4. A pessoa continua até acertar ou gastar seis tentativas.
5. Ao terminar, vê o resultado, as estatísticas pertinentes e, no desafio diário, pode copiar uma grade de compartilhamento sem a resposta.

**Regras definidas:**

- A palavra-alvo tem cinco letras e há até seis tentativas.
- Acentos e cedilha devem corresponder exatamente à palavra-alvo. Acentos não são removidos para comparar letras.
- O desafio diário tem uma palavra compartilhada por todas as pessoas para cada data de jogo.
- A prática permite iniciar partidas adicionais sem limite.
- Uma tentativa só é consumida quando contém cinco letras e é reconhecida como palavra válida pelo jogo.
- Após a vitória ou a sexta tentativa, a partida fica encerrada; o resultado não pode ser alterado.

**Regra de feedback:** letras na posição exata recebem o estado “correta”; letras existentes em outra posição recebem “presente”; as demais recebem “ausente”. Para letras repetidas, primeiro contabilizar correspondências exatas e depois marcar ocorrências presentes somente até a quantidade restante na palavra-alvo. Isso evita indicar mais ocorrências do que a palavra contém.

## 6. Requisitos funcionais

### RF-01 — Iniciar e retomar partidas

- Disponibilizar ações claras para iniciar o desafio diário e iniciar uma partida de prática.
- Restaurar a partida em andamento após atualização ou reabertura do navegador no mesmo dispositivo.
- Impedir novas tentativas em uma partida encerrada.
- **Aceite:** atualizar a página durante uma partida preserva tentativas e estado; concluir a partida bloqueia novas submissões nela.

### RF-02 — Entrada e validação de palavras

- Aceitar tentativas de exatamente cinco letras reconhecidas pela lista de palavras permitidas.
- Tratar cada letra com diacrítico como uma letra na contagem; comparar acentos e cedilha exatamente.
- Rejeitar entrada incompleta ou não reconhecida sem consumir tentativa e informar o motivo junto ao campo de entrada.
- Permitir envio pelo teclado físico e por teclado na interface.
- **Aceite:** uma palavra inválida ou com tamanho incorreto não altera o tabuleiro nem o número de tentativas; uma palavra válida gera feedback para todas as cinco letras.

### RF-03 — Feedback e estado do teclado

- Exibir o estado de cada letra no tabuleiro e atualizar o teclado virtual após cada tentativa.
- Comunicar “correta”, “presente” e “ausente” por cor e por texto, símbolo ou outro indicador visual não dependente apenas de cor.
- Não substituir um estado melhor de uma letra no teclado por um estado pior após tentativas posteriores.
- **Aceite:** uma pessoa que não distingue as cores consegue identificar o estado de cada letra no tabuleiro e no teclado.

### RF-04 — Encerramento da partida

- Encerrar imediatamente a partida quando a palavra for descoberta ou após a sexta tentativa sem acerto.
- Informar vitória ou derrota; em caso de derrota, revelar a palavra-alvo.
- Mostrar o resultado final sem permitir que novas entradas alterem a partida.
- **Aceite:** o estado final é inequívoco e permanece após recarregar a página.

### RF-05 — Desafio diário

- Servir a mesma palavra a todas as pessoas para uma mesma data de jogo.
- Permitir apenas uma partida diária concluída por pessoa e navegador; partidas em andamento podem ser retomadas.
- Indicar quando o desafio seguinte estará disponível, conforme a regra de virada do dia a definir.
- **Aceite:** trocar entre telas ou atualizar a página não cria uma nova palavra diária nem reinicia a partida.

### RF-06 — Prática

- Permitir iniciar partidas de prática sucessivas usando palavras da lista curada.
- Manter o resultado e as estatísticas da prática separados dos do desafio diário.
- **Aceite:** iniciar ou concluir prática não altera a disponibilidade nem o resultado do desafio diário.

### RF-07 — Estatísticas pessoais

- Exibir partidas concluídas, vitórias, percentual de vitórias, sequência atual e melhor sequência.
- Exibir a distribuição de vitórias por número de tentativas.
- Separar estatísticas do desafio diário e da prática, ou identificar claramente a qual modo cada conjunto pertence.
- **Aceite:** uma vitória e uma derrota atualizam as métricas corretamente; recarregar a página mantém os valores.

### RF-08 — Compartilhamento sem spoiler

- Oferecer compartilhamento do resultado do desafio diário em uma grade textual com tentativas e indicadores de feedback, sem incluir a palavra-alvo.
- Informar a pessoa se o resultado foi copiado; se a cópia falhar, apresentar uma alternativa visível para copiar manualmente.
- **Aceite:** a grade compartilhada não revela a resposta e representa fielmente o número e o resultado das tentativas.

### RF-09 — Vocabulário

- Usar uma lista curada de palavras comuns em pt-BR.
- Excluir nomes próprios, estrangeirismos e termos ofensivos da lista de respostas.
- Manter uma lista de palpites válidos para que uma tentativa permitida não precise ser necessariamente uma resposta possível.
- **Aceite:** cada palavra diária é revisada conforme os critérios editoriais antes de ser disponibilizada.

## 7. Requisitos não funcionais

- **Responsividade:** tabuleiro, teclado, instruções e controles devem caber e permanecer utilizáveis em telas pequenas e grandes, sem rolagem horizontal.
- **Acessibilidade:** controles operáveis por teclado; foco visível; rótulos acessíveis para controles e estados; contraste suficiente; feedback que não dependa somente de cor; respeito à preferência de movimento reduzido.
- **Persistência:** no MVP, armazenar partida e estatísticas no navegador do dispositivo. Limpar dados do navegador pode apagar o progresso; não há sincronização.
- **Privacidade:** não exigir cadastro. Não coletar dados pessoais ou telemetria no MVP sem uma decisão explícita e comunicação adequada.
- **Desempenho:** após a interface carregar, validar uma tentativa e apresentar o feedback sem atraso perceptível; estabelecer metas numéricas de carregamento após escolher a infraestrutura e os dispositivos de referência.
- **Erros:** informar falhas de validação e de compartilhamento; não apresentar uma ação como concluída quando ela falhar.

## 8. Conteúdo e gestão editorial

A curadoria do vocabulário precisa cobrir duas listas distintas: possíveis respostas e palpites aceitos. Cada resposta deve ser revisada quanto a frequência/familiaridade, grafia pt-BR, acentuação, potencial ofensivo e adequação ao público. O processo para adicionar, revisar, agendar e remover palavras ainda precisa ser definido. A sequência diária não deve expor respostas futuras na interface.

## 9. Critérios de sucesso do MVP

- Pessoas conseguem completar uma partida válida no celular e no desktop.
- As regras de feedback funcionam com letras repetidas e palavras acentuadas.
- A palavra do desafio é idêntica para diferentes pessoas na mesma data de jogo.
- Partidas e estatísticas permanecem após recarregar, sem conta.
- Resultado compartilhado não contém a resposta.
- Estados de feedback são distinguíveis sem percepção de cores.

Os critérios são verificáveis em testes funcionais e de acessibilidade. Metas de adoção, retenção e conversão não foram definidas; como o MVP não tem telemetria aprovada, não devem ser presumidas.

## 10. Decisões pendentes

1. **Virada do desafio diário:** meia-noite em qual fuso? Recomenda-se definir um fuso único (por exemplo, horário de Brasília) para manter a palavra compartilhada.
2. **Acesso ao desafio diário:** uma pessoa pode jogar o desafio de outro dia ou recuperar um desafio perdido?
3. **Seleção de palavras:** quem mantém e aprova a lista e a programação diária? De onde virá a lista de palpites válidos?
4. **Partidas de prática:** podem ser compartilhadas? Como são sorteadas e evitam repetições próximas?
5. **Estatísticas:** as sequências contam apenas desafios diários, apenas vitórias consecutivas ou também partidas de prática?
6. **Público e acessibilidade:** qual faixa etária e qual nível de conformidade de acessibilidade devem orientar testes e conteúdo?
7. **Identidade visual:** há preferência por nome, marca, paleta, tema ou estilo visual?

## 11. Hipóteses e riscos

- **Acentuação aumenta a dificuldade:** a comparação exata pode gerar dúvidas sobre teclados e grafia; validar com jogadores de pt-BR antes do lançamento.
- **Vocabulário controverso ou obscuro:** uma palavra tecnicamente válida pode ser desconhecida ou regional; manter curadoria e canal de correção.
- **Consistência do desafio diário:** depender apenas do relógio local pode dar palavras diferentes quando datas e fusos divergem; escolher a regra de data antes da implementação.
- **Persistência local é frágil:** limpeza do navegador ou troca de dispositivo elimina progresso; isso é uma limitação deliberada do MVP sem cadastro.
- **Compartilhamento e acessibilidade:** emojis e cores podem ser interpretados de formas distintas por plataformas e tecnologias assistivas; testar a grade em leitores de tela e nos destinos de compartilhamento prioritários.
