# Ferramentas de arte

## Por que existe

O gerador gratuito que está em uso hoje (`z_image`, via MCP) é **texto puro**:
não aceita imagem de referência. Os dois modelos que aceitam
(`seedream_v4_5`, `nano_banana`) recusam no plano grátis com
`Requires basic plan or higher`.

Sem referência não dá para pedir *"o mesmo bicho, outro passo"* nem
*"no estilo desta arte aqui"* — que é exatamente o que falta para:

- cada monstro ter **dois quadros de caminhada coerentes** entre si;
- os monstros novos casarem com a paleta e o ângulo de câmera dos cinco
  que já estão no jogo.

O endpoint `/v1/images/edits` da OpenAI aceita imagem de entrada. É isso que
a chave compra. `api.openai.com` é alcançável daqui (responde `401`, não é
bloqueio de rede).

## Como dar a chave — três caminhos

Do mais seguro para o menos.

### 1. Credencial de API do ambiente — a chave nunca entra nesta máquina

Em **claude.ai/code**, edite o **ambiente já existente** (a caixa de criar
ambiente novo não oferece isso). No diálogo **Update cloud environment**,
abaixo de *Environment variables*, está **API credentials**.

**Add credential**:

| campo | valor |
|---|---|
| Credential type | `Bearer` (padrão) |
| Name | `OpenAI` |
| Allowed websites | `api.openai.com` |
| Custom headers → Name | `Authorization` |
| Custom headers → Prefix | `Bearer` |
| Custom headers → Value | a chave |

**Connect**. O proxy injeta a chave *depois* que a requisição sai da VM: ela
não aparece nas variáveis de ambiente, nem em arquivo, nem para o agente.

Exige plano **Pro ou Max** e papel de admin da organização. Não tem edição —
para trocar, apaga e cria de novo.

Depois: `python3 gera_arte.py --sem-chave --testar`

### 2. Variável de ambiente — não passa pelo histórico da conversa

Mesmo diálogo, seção **Environment variables**, logo acima. Formulário muito
mais simples: um nome e um valor.

| nome | valor |
|---|---|
| `OPENAI_API_KEY` | a chave |

A chave fica visível dentro da sessão (o agente e os comandos conseguem lê-la),
mas **não entra no histórico do chat**. É o meio-termo.

Depois: `python3 gera_arte.py --testar`

### 3. Arquivo `.env` local

```bash
cp .env.exemplo .env
# editar .env e preencher OPENAI_API_KEY
```

O `.env` está coberto pelo `.gitignore` da raiz. Confira antes de qualquer
commit:

```bash
git check-ignore -v tower-defense/ferramentas/.env
```

> O container é efêmero. Um `.env` escrito aqui **some** quando a sessão
> termina, e precisa ser refeito na próxima. Os caminhos 1 e 2 persistem.

### O que NÃO fazer

Colar a chave no chat. O histórico da conversa guarda tudo, inclusive
mensagens apagadas da tela, e a chave passa a exigir revogação. Se acontecer
por acidente: revogue em platform.openai.com e gere outra.

## Uso

```bash
# confere a autenticação sem gastar nada
python3 gera_arte.py --testar

# uma imagem nova
python3 gera_arte.py --prompt "..." --saida bicho.png --fundo transparent

# o mesmo bicho, outro passo  <- o motivo de tudo isto
python3 gera_arte.py --prompt "mesmo personagem, a outra perna à frente" \
                     --ref bicho.png --saida bicho_passo2.png

# lote
python3 gera_arte.py --lote receitas.json --pasta ../../../saida/
```

`receitas.json`:

```json
[
  {"prompt": "...", "saida": "carnical_1.png"},
  {"prompt": "mesmo personagem, outro passo", "ref": ["carnical_1.png"],
   "saida": "carnical_2.png"}
]
```

Sem dependência externa: só a biblioteca padrão do Python, porque o script
precisa rodar num container recém-criado sem instalar nada.
