# MamoBall 1V1

Bot Discord independente para a fila competitiva 1V1.

## Recursos

- Uma modalidade fixa por processo
- Painel persistente e atualizado em uma unica mensagem
- Check-in antes da criacao da partida
- Times equilibrados pela pontuacao salva
- Categoria, texto e voz privados por partida
- Resultado enviado por modal e validado pela staff
- Pontuacao e ranking compartilhados entre todas as modalidades
- Historico de vitorias e derrotas separado por modalidade
- Patentes globais com sincronizacao automatica de cargos
- Limpeza automatica de canais temporarios
- Interface sem emojis e com texto reduzido

## Configuracao

1. Instale Node.js 22 ou superior.
2. Execute `npm install`.
3. Crie um projeto no Firebase, habilite o Firestore e gere uma chave de conta de servico.
4. Copie `serviceAccountKey.example.json` para `serviceAccountKey.json` e preencha as credenciais.
5. Copie `.env.example` para `.env` e preencha os IDs.
6. Use o mesmo projeto Firebase e o mesmo `FIRESTORE_PLAYERS_COLLECTION` nos quatro bots.
7. Preencha `ROLE_BRONZE` ate `ROLE_CAMPEAO` com os cargos do servidor.
8. Execute `npm run deploy` uma vez para registrar os comandos.
9. Execute `npm run build` e `npm start`.

O bot precisa das permissoes `View Channels`, `Manage Channels`, `Send Messages`, `Read Message History` e `Connect`. Ative o intent `Server Members` no Discord Developer Portal.

## Comandos

- `/painel`: publica ou recupera o painel, restrito a quem gerencia o servidor.
- `/perfil`: exibe o registro competitivo.
- `/ranking`: exibe os dez primeiros colocados.

## Firestore compartilhado

Os perfis ficam na colecao `mamoball_players` por padrao. Cada documento usa o ID do Discord do jogador. Atualizacoes de partidas sao feitas em transacoes, evitando perda de pontos quando bots diferentes aprovam resultados ao mesmo tempo.

O campo `points` e global. Os campos `modes.1v1`, `modes.2v2`, `modes.3v3` e `modes.4v4` preservam o historico de cada modalidade.

## Patentes

| Patente | Pontos |
| --- | ---: |
| Bronze | 0–499 |
| Prata | 500–999 |
| Ouro | 1000–1499 |
| Platina | 1500–1999 |
| Diamante | 2000–2499 |
| Mestre | 2500–2999 |
| Elite | 3000–3499 |
| Campeao | 3500+ |

A patente e calculada pelos pontos globais. Depois de cada resultado aprovado, o bot remove a patente anterior e adiciona o cargo correto. IDs de cargo vazios desativam apenas a sincronizacao no Discord; o calculo da patente continua funcionando.
