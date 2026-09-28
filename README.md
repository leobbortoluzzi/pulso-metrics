# Pulso Metrics

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/leobbortoluzzi/pulso-metrics)

Painel privado para acompanhar campanhas Meta Ads e cruzar investimento com
vendas da Hotmart e da Kiwify. A interface oferece dados demonstrativos antes
da configuração das integrações; dados reais ficam no D1 e são atualizados
sob demanda.

## Stack e estrutura

- `src/`: interface React 19, estilos e cálculos compartilhados.
- `worker/`: API Hono, OAuth da Meta, webhooks, filas de sincronização e PTAX.
- `migrations/`: esquema D1 para sessões, integrações, métricas, vendas e filas.
- `tests/`: testes de fórmulas e normalização dos eventos dos gateways.
- `wrangler.jsonc`: bindings Cloudflare para Worker, D1 e Queues.

## Rodar localmente

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Preencha `.dev.vars` com uma senha privada, uma chave de criptografia base64
de 32 bytes, credenciais da aplicação Meta e os tokens dos webhooks. Nunca
versione esse arquivo. No painel Meta, cadastre `/auth/meta/callback` como
URI de redirecionamento OAuth e habilite leitura de anúncios (`ads_read`).

## Deploy na Cloudflare

Clique no botão, conecte suas contas GitHub e Cloudflare e escolha o nome do
Worker e do repositório que será criado na sua conta GitHub. O assistente lê
`wrangler.jsonc` e provisiona o D1 (`DB`) e as filas (`SYNC_QUEUE`,
`pulso-sync` e `pulso-sync-dlq`). As migrações do D1 são aplicadas durante o
deploy. O repositório de origem precisa ser público para o botão funcionar.

No assistente, configure os secrets listados a partir de `.dev.vars.example`:

- `DASHBOARD_PASSWORD`: senha longa e exclusiva para entrar no painel.
- `TOKEN_ENCRYPTION_KEY`: chave aleatória base64 de 32 bytes; gere com
  `openssl rand -base64 32`.
- `META_APP_ID` e `META_APP_SECRET`: credenciais do app criado no Meta for
  Developers; são necessárias para conectar as contas de anúncios.
- `HOTMART_WEBHOOK_TOKEN`: valor HOTTOK definido no webhook da Hotmart.
- `KIWIFY_WEBHOOK_TOKEN`: token longo criado para o webhook da Kiwify.

`META_API_VERSION` fica como variável padrão no `wrangler.jsonc`. Se não
configurar as credenciais Meta inicialmente, você pode adicioná-las depois em
**Workers & Pages → Settings → Variables and Secrets**. Não reutilize senhas
ou tokens e nunca os salve no Git.

Para deploy manual após configurar Wrangler e os bindings, rode
`npm run build && npm run deploy`. O script de deploy aplica as migrações
remotas antes de publicar o Worker.

## Integrações e atribuição

Conecte a Meta pelo OAuth no painel. Informe as credenciais de API da Hotmart
e da Kiwify em Integrações; as credenciais são criptografadas no Worker. Copie
as URLs dos webhooks exibidas nessa tela para cada gateway. Para atribuição por
IDs, use os parâmetros da Meta `utm_campaign={{campaign.id}}`,
`utm_term={{adset.id}}` e `utm_content={{ad.id}}`; a origem e o meio podem ser
preenchidos como `utm_source` e `utm_medium`.

As consultas à Meta e aos gateways rodam somente ao acionar atualização ou
reconciliação. A conversão de moedas usa a cotação de venda PTAX; vendas e
métricas sem cotação ficam pendentes até a fila obter uma cotação válida.
Eventos guardam apenas dados da transação e atribuição, sem nome ou contato do
comprador.

## Verificações

```sh
npm run lint
npm run typecheck
npm test
npm run build
```
