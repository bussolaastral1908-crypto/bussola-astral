# 🧭 Bússola Astral

Horóscopo pessoal com cálculos astronômicos reais (VSOP87 via Astronomy Engine).

## Estrutura

```
/
├── public/
│   ├── horoscopo.html    ← App principal
│   ├── premium.html      ← Página de vendas
│   └── obrigado.html     ← Confirmação pós-pagamento
├── api/
│   ├── create-checkout.js  ← Cria checkout AbacatePay
│   ├── webhook.js          ← Recebe confirmações de pagamento
│   └── check-premium.js    ← Verifica status Premium
├── vercel.json
└── package.json
```

## Deploy (Vercel)

1. **Fork/Push** este repositório para o GitHub
2. No [Vercel](https://vercel.com): Import Project → selecione o repo
3. **Variáveis de ambiente** (Settings → Environment Variables):
   - `ABACATEPAY_API_KEY` — sua chave API do AbacatePay
   - `ABACATEPAY_PRODUCT_MENSAL` — ID do produto mensal no AbacatePay
   - `ABACATEPAY_PRODUCT_ANUAL` — ID do produto anual no AbacatePay
4. **Vercel KV**: Storage → Create → KV → vincule ao projeto (variáveis KV_ adicionadas automaticamente)
5. **Domínio**: Settings → Domains → adicione `bussolaastral.com`
   - DNS: CNAME `@` → `cname.vercel-dns.com`

## AbacatePay

1. Crie conta em [abacatepay.com](https://abacatepay.com)
2. Crie dois produtos:
   - **Bússola Astral Premium Mensal** — R$29/mês, ciclo mensal
   - **Bússola Astral Premium Anual** — R$199/ano, ciclo anual
3. Copie os IDs dos produtos para as variáveis de ambiente
4. Configure webhook URL: `https://bussolaastral.com/api/webhook`
