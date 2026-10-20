# Palavra

Jogo casual de adivinhação de palavras em pt-BR, com desafio diário e modo de prática.

## Executar localmente

Requer Node.js 20 ou superior. O projeto não usa dependências externas.

```sh
npm start
```

Abra <http://localhost:4173>. Para reiniciar automaticamente após alterações no servidor:

```sh
npm run dev
```

## Testes

```sh
npm test
```

## Implementação atual

- Interface responsiva na direção visual Caderno de dedução.
- Desafio diário comum, com virada à meia-noite no fuso `America/Sao_Paulo`.
- Palpites e respostas curados em `server/words.mjs`; respostas não são servidas como arquivos públicos.
- API Node.js nativa valida palavras, calcula feedback e cria sessões de prática.
- Progresso e estatísticas ficam no `localStorage` do navegador; limpar os dados do site apaga esse progresso.
- Um cookie aleatório `HttpOnly` e `SameSite=Strict` identifica a sessão diária no próprio navegador, sem conta.
- Sem contas, anúncios, compras ou telemetria.

As sessões da API ficam em memória por até 24 horas, com limite de capacidade; reiniciar o processo encerra partidas em andamento e a interface avisa quando não pode retomá-las. A limitação de criação de novas sessões é por endereço IP, então pode afetar pessoas atrás da mesma rede e não substitui uma proteção distribuída contra abuso. A implantação de produção com múltiplas instâncias deve usar armazenamento compartilhado com expiração, idempotência e rate limiting no provedor. A lista de palavras inicial é uma curadoria pequena para o MVP e deve ser revisada/ampliada antes de um lançamento público.