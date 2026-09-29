# selfmetric

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/leobbortoluzzi/pulso-metrics)

Painel privado para acompanhar campanhas Meta Ads e cruzar investimento com
vendas da Hotmart e da Kiwify. A interface oferece dados demonstrativos antes
da configuração das integrações; dados reais ficam no D1 e são atualizados
sob demanda.

## Stack e estrutura

- `src/`: interface React 19, estilos e cálculos compartilhados.
- `worker/`: API Hono, OAuth da Meta, webhooks, filas de sincronização e PTAX.
- `migrations/`: esquema D1 para sessões, integrações, métricas, vendas e filas.
- `tests/`: testes de fórmulas, ingestão de vendas, atribuição e retomada das filas.
- `wrangler.jsonc`: bindings Cloudflare para Worker, D1 e Queues.

## Rodar localmente

```sh
npm ci
npm run db:local
npm run dev
```

No primeiro acesso, crie a senha administrativa do workspace. Não há arquivo
`.dev.vars` obrigatório. No painel Meta, cadastre `/auth/meta/callback` como
URI de redirecionamento OAuth e habilite leitura de anúncios (`ads_read`).

## Deploy na Cloudflare

Clique no botão, conecte suas contas GitHub e Cloudflare e escolha o nome do
Worker e do repositório que será criado na sua conta GitHub. O assistente lê
`wrangler.jsonc` e provisiona o D1 (`DB`), o Durable Object privado usado pelo
cofre de chaves e as filas (`SYNC_QUEUE`, `pulso-sync` e `pulso-sync-dlq`). As
migrações do D1 são aplicadas durante o deploy. O repositório de origem precisa
ser público para o botão funcionar.

No primeiro acesso ao endereço publicado, crie a senha administrativa. Essa
conta é criada uma única vez por instalação. Depois, configure as integrações
em **Integrações** no próprio painel:

O esquema do D1 é descrito pelos arquivos SQL em `migrations/`. Normalmente o
deploy aplica esses arquivos antes de publicar o Worker. Se esse passo for
omitido, o próprio Worker aplica as migrations pendentes quando a API recebe o
primeiro acesso; não é necessário rodar comandos no terminal.

- Na aba **Meta Ads**, informe App ID, App Secret e versão da Graph API, salve o aplicativo e conecte suas contas de anúncio.
- Nas abas **Hotmart** e **Kiwify**, conecte as credenciais de API e configure o token e a URL do webhook de cada gateway.
- Para alterar a senha do dashboard, acesse **Segurança** na lateral ou **Alterar senha** no menu da conta.

Os segredos são criptografados antes de serem salvos no D1; a chave de dados é
gerada automaticamente e mantida no Durable Object privado de cada instalação.
Os campos de segredo ficam vazios após salvar e não retornam o valor original.
A URL do webhook Kiwify inclui o token exigido pelo gateway. Para substituir
um segredo, digite o novo valor no campo correspondente.

Para deploy manual após configurar Wrangler e os bindings, rode `npm run deploy`.
O script compila o app, aplica as migrations remotas e publica o Worker.

## Integrações e atribuição

Conecte a Meta pelo OAuth no painel. Informe as credenciais de API da Hotmart
e da Kiwify em Integrações; as credenciais são criptografadas no Worker. Copie
as URLs dos webhooks exibidas nessa tela para cada gateway. Para atribuição por
IDs, use os parâmetros da Meta `utm_campaign={{campaign.id}}`,
`utm_term={{adset.id}}` e `utm_content={{ad.id}}`; a origem e o meio podem ser
preenchidos como `utm_source` e `utm_medium`.

Na aba **Funil**, impressões e cliques vêm dos relatórios da Meta. Para medir
visualizações de página e início de checkout, configure os eventos `PageView` e
`InitiateCheckout` do Pixel da Meta na página e no checkout. A etapa de compras
usa transações dos gateways com os IDs de campanha atribuídos; vendas sem esses
IDs ou sem vínculo com uma conta Meta não entram no funil por campanha. Após
configurar o Pixel, atualize os anúncios para importar os eventos do período.

As consultas à Meta e aos gateways rodam somente ao acionar atualização ou
reconciliação. A conversão de moedas usa a cotação de venda PTAX; vendas e
métricas sem cotação ficam pendentes até a fila obter uma cotação válida.
Eventos guardam apenas dados da transação e atribuição, sem nome ou contato do
comprador.

As importações processam até cinco registros por execução e salvam o progresso
no D1 antes de enviar a próxima etapa à fila. Falhas retomam a página pendente.
Webhooks duplicados não alteram a venda; eventos antigos não substituem um estado
mais recente. Sem a data do evento, reembolsos e chargebacks têm precedência sobre
aprovações. A data da compra é independente da data de atualização do gateway.

O ID do anúncio permite recuperar a conta, a campanha e o conjunto a partir das
métricas da Meta. Ao atualizar os anúncios, a sincronização também completa os
vínculos das vendas que chegaram antes dessas métricas. A receita considera apenas
transações atualmente aprovadas; reembolsos e chargebacks são apresentados
separadamente e não são descontados uma segunda vez.

## Verificações

```sh
npm run lint
npm run typecheck
npm test
npm run build
```
